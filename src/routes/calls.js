const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../services/supabase');
const { createCall, getCallStatus } = require('../services/vapi');
const { authenticate } = require('../middleware/auth');
const { checkCallAllowed, recordCallUsage } = require('../middleware/subscription');

const router = express.Router();

// Emergency numbers to block (international)
const EMERGENCY_NUMBERS = [
  '911', '112', '999', '000', '110', '119', '118', '100', '101', '102', '103',
  '1911', '11911', '9911', // Common misformats
  '+1911', '+911',
];

/**
 * Check if phone number is an emergency number
 */
const isEmergencyNumber = (phoneNumber) => {
  // Strip all non-digits
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // Check exact matches and suffixes
  return EMERGENCY_NUMBERS.some(emergency => {
    const emergencyDigits = emergency.replace(/\D/g, '');
    return digitsOnly === emergencyDigits ||
           digitsOnly.endsWith(emergencyDigits) ||
           digitsOnly.startsWith(emergencyDigits);
  });
};

/**
 * Check concurrent call limit based on plan
 */
const checkConcurrentLimit = async (req, res, next) => {
  try {
    // Skip in dev mode (but NOT in E2E mode)
    if (process.env.DEV_MODE === 'true' && process.env.E2E_MODE !== 'true') {
      return next();
    }

    const maxConcurrent = req.callLimits?.maxConcurrentCalls || 3;

    // Count active (in-progress) calls for this user
    const { count, error } = await supabaseAdmin
      .from('call_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('status', 'in-progress');

    if (error) {
      console.error('Error checking concurrent calls:', error);
      return next(); // Don't block on error
    }

    if (count >= maxConcurrent) {
      return res.status(429).json({
        error: {
          code: 'CONCURRENT_LIMIT_REACHED',
          message: `You have ${count} active calls. Your plan allows ${maxConcurrent} concurrent calls. Please wait for a call to complete.`
        }
      });
    }

    req.concurrentCalls = count;
    req.concurrentRemaining = maxConcurrent - count;
    next();
  } catch (error) {
    console.error('Concurrent limit check error:', error);
    next(); // Don't block on error
  }
};

/**
 * Check daily call limit (max 20 calls per day)
 */
const checkDailyLimit = async (req, res, next) => {
  try {
    // Skip in dev mode (but NOT in E2E mode)
    if (process.env.DEV_MODE === 'true' && process.env.E2E_MODE !== 'true') {
      return next();
    }

    const MAX_DAILY_CALLS = parseInt(process.env.MAX_DAILY_CALLS) || 20;

    // Get today's start
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Count today's calls
    const { count, error } = await supabaseAdmin
      .from('call_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      console.error('Error checking daily limit:', error);
      return next(); // Don't block on error
    }

    if (count >= MAX_DAILY_CALLS) {
      return res.status(429).json({
        error: {
          code: 'DAILY_LIMIT_REACHED',
          message: `You have reached the maximum of ${MAX_DAILY_CALLS} calls per day. Please try again tomorrow.`
        }
      });
    }

    req.dailyCallsRemaining = MAX_DAILY_CALLS - count;
    next();
  } catch (error) {
    console.error('Daily limit check error:', error);
    next(); // Don't block on error
  }
};

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/calls/check
 * Check if user can make a call (pre-flight check)
 */
router.get('/check', checkCallAllowed, (req, res) => {
  res.json({
    allowed: true,
    limits: req.callLimits
  });
});

/**
 * POST /api/calls
 * Create a new call via VAPI
 */
router.post('/', [
  checkCallAllowed,
  checkConcurrentLimit,
  checkDailyLimit,
  body('phoneNumber').notEmpty().matches(/^\+?[\d\s\-()]+$/),
  body('message').notEmpty().trim(),
  body('language').optional().isLength({ min: 2, max: 5 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { phoneNumber, message, language = 'en', contactName } = req.body;
    const { callLimits } = req;

    // Block emergency numbers
    if (isEmergencyNumber(phoneNumber)) {
      return res.status(400).json({
        error: {
          code: 'EMERGENCY_NUMBER_BLOCKED',
          message: 'Calls to emergency numbers are not allowed. Please dial emergency services directly.'
        }
      });
    }

    // Get user profile for the call
    const userProfile = {
      fullName: req.user.full_name,
      dateOfBirth: req.user.date_of_birth,
      address: req.user.address
    };

    // Create call via VAPI with max duration from subscription
    const vapiResponse = await createCall({
      phoneNumber: phoneNumber.replace(/[\s\-()]/g, ''),
      message,
      language,
      userProfile,
      maxDurationSeconds: (callLimits.maxMinutes || 5) * 60
    });

    // Store call in history
    const { data: callRecord, error } = await supabaseAdmin
      .from('call_history')
      .insert({
        user_id: req.userId,
        phone_number: phoneNumber,
        contact_name: contactName,
        message,
        language,
        vapi_call_id: vapiResponse.id,
        status: 'initiated',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to store call record:', error);
    }

    // Record initial usage (1 minute minimum, will be updated when call ends)
    if (!callLimits.isDevMode) {
      await recordCallUsage(req.userId, 1, callLimits.isTrial);
    }

    res.status(201).json({
      id: callRecord?.id,
      vapiCallId: vapiResponse.id,
      status: 'initiated',
      phoneNumber,
      message,
      maxDurationMinutes: callLimits.maxMinutes,
      limits: {
        isTrial: callLimits.isTrial,
        trialCallsRemaining: callLimits.trialCallsRemaining,
        minutesRemaining: callLimits.minutesRemaining
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/calls/:id/status
 * Get call status
 */
router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Get call record
    const { data: callRecord, error } = await supabaseAdmin
      .from('call_history')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.userId)
      .single();

    if (error || !callRecord) {
      return res.status(404).json({ error: { message: 'Call not found' } });
    }

    // If we have a VAPI call ID, get the latest status
    let vapiStatus = null;
    if (callRecord.vapi_call_id) {
      try {
        vapiStatus = await getCallStatus(callRecord.vapi_call_id);

        // Update our record if status changed
        if (vapiStatus.status !== callRecord.status) {
          const updateData = {
            status: vapiStatus.status,
            updated_at: new Date().toISOString()
          };

          // If call ended, record duration
          if (vapiStatus.duration) {
            updateData.duration_seconds = vapiStatus.duration;
            updateData.ended_at = vapiStatus.endedAt || new Date().toISOString();

            // Update usage with actual duration (subtract the 1 minute we already recorded)
            const actualMinutes = Math.ceil(vapiStatus.duration / 60);
            if (actualMinutes > 1 && process.env.DEV_MODE !== 'true') {
              // Get subscription to check if trial
              const { data: sub } = await supabaseAdmin
                .from('user_subscriptions')
                .select('status')
                .eq('user_id', req.userId)
                .single();

              await recordCallUsage(req.userId, actualMinutes - 1, sub?.status === 'trialing');
            }
          }

          await supabaseAdmin
            .from('call_history')
            .update(updateData)
            .eq('id', id);
        }
      } catch (err) {
        console.error('Failed to get VAPI status:', err);
      }
    }

    res.json({
      id: callRecord.id,
      status: vapiStatus?.status || callRecord.status,
      duration: vapiStatus?.duration || callRecord.duration_seconds,
      phoneNumber: callRecord.phone_number,
      message: callRecord.message,
      createdAt: callRecord.created_at
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
