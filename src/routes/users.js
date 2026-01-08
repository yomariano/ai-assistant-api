const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/users/profile
 * Get user profile
 */
router.get('/profile', async (req, res) => {
  res.json({
    id: req.user.id,
    email: req.user.email,
    fullName: req.user.full_name,
    dateOfBirth: req.user.date_of_birth,
    address: req.user.address,
    createdAt: req.user.created_at
  });
});

/**
 * PUT /api/users/profile
 * Update user profile
 */
router.put('/profile', [
  body('fullName').optional().trim().notEmpty(),
  body('dateOfBirth').optional().isISO8601(),
  body('address').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { fullName, dateOfBirth, address } = req.body;

    const updates = {};
    if (fullName !== undefined) updates.full_name = fullName;
    if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth;
    if (address !== undefined) updates.address = address;
    updates.updated_at = new Date().toISOString();

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.userId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update profile');
    }

    res.json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      dateOfBirth: user.date_of_birth,
      address: user.address
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/onboarding
 * Get user's onboarding status and progress
 */
router.get('/onboarding', async (req, res, next) => {
  try {
    // Get user's onboarding status from users table
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('onboarding_completed, onboarding_completed_at')
      .eq('id', req.userId)
      .single();

    if (userError) {
      throw new Error('Failed to fetch user onboarding status');
    }

    // Get detailed onboarding progress
    const { data: progress, error: progressError } = await supabaseAdmin
      .from('user_onboarding')
      .select('*')
      .eq('user_id', req.userId)
      .single();

    // If no progress record exists, create one
    if (progressError && progressError.code === 'PGRST116') {
      const { data: newProgress, error: createError } = await supabaseAdmin
        .from('user_onboarding')
        .insert({
          user_id: req.userId,
          current_step: 1,
          steps_completed: [],
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) {
        throw new Error('Failed to create onboarding progress');
      }

      return res.json({
        completed: user.onboarding_completed || false,
        completedAt: user.onboarding_completed_at,
        progress: {
          currentStep: newProgress.current_step,
          stepsCompleted: newProgress.steps_completed || [],
          callForwardingProvider: newProgress.call_forwarding_provider,
          testCallMade: newProgress.test_call_made || false,
          startedAt: newProgress.started_at
        }
      });
    }

    if (progressError) {
      throw new Error('Failed to fetch onboarding progress');
    }

    res.json({
      completed: user.onboarding_completed || false,
      completedAt: user.onboarding_completed_at,
      progress: {
        currentStep: progress.current_step,
        stepsCompleted: progress.steps_completed || [],
        callForwardingProvider: progress.call_forwarding_provider,
        testCallMade: progress.test_call_made || false,
        startedAt: progress.started_at,
        completedAt: progress.completed_at
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/users/onboarding
 * Update onboarding progress
 */
router.patch('/onboarding', [
  body('currentStep').optional().isInt({ min: 1, max: 10 }),
  body('stepsCompleted').optional().isArray(),
  body('callForwardingProvider').optional().trim(),
  body('testCallMade').optional().isBoolean()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { currentStep, stepsCompleted, callForwardingProvider, testCallMade } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (currentStep !== undefined) updates.current_step = currentStep;
    if (stepsCompleted !== undefined) updates.steps_completed = stepsCompleted;
    if (callForwardingProvider !== undefined) updates.call_forwarding_provider = callForwardingProvider;
    if (testCallMade !== undefined) updates.test_call_made = testCallMade;

    const { data: progress, error } = await supabaseAdmin
      .from('user_onboarding')
      .update(updates)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      // If record doesn't exist, create it
      if (error.code === 'PGRST116') {
        const { data: newProgress, error: createError } = await supabaseAdmin
          .from('user_onboarding')
          .insert({
            user_id: req.userId,
            current_step: currentStep || 1,
            steps_completed: stepsCompleted || [],
            call_forwarding_provider: callForwardingProvider,
            test_call_made: testCallMade || false,
            started_at: new Date().toISOString()
          })
          .select()
          .single();

        if (createError) {
          throw new Error('Failed to create onboarding progress');
        }

        return res.json({
          currentStep: newProgress.current_step,
          stepsCompleted: newProgress.steps_completed || [],
          callForwardingProvider: newProgress.call_forwarding_provider,
          testCallMade: newProgress.test_call_made || false
        });
      }
      throw new Error('Failed to update onboarding progress');
    }

    res.json({
      currentStep: progress.current_step,
      stepsCompleted: progress.steps_completed || [],
      callForwardingProvider: progress.call_forwarding_provider,
      testCallMade: progress.test_call_made || false
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/onboarding/complete
 * Mark onboarding as complete
 */
router.post('/onboarding/complete', async (req, res, next) => {
  try {
    const now = new Date().toISOString();

    // Update users table
    const { error: userError } = await supabaseAdmin
      .from('users')
      .update({
        onboarding_completed: true,
        onboarding_completed_at: now,
        updated_at: now
      })
      .eq('id', req.userId);

    if (userError) {
      throw new Error('Failed to update user onboarding status');
    }

    // Update onboarding progress table
    const { error: progressError } = await supabaseAdmin
      .from('user_onboarding')
      .update({
        completed_at: now,
        updated_at: now
      })
      .eq('user_id', req.userId);

    if (progressError) {
      console.error('Failed to update onboarding progress:', progressError);
      // Don't throw - main update succeeded
    }

    res.json({
      completed: true,
      completedAt: now,
      message: 'Onboarding completed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/stats
 * Get user statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    // Get total calls
    const { count: totalCalls } = await supabaseAdmin
      .from('call_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    // Get saved calls count
    const { count: savedCalls } = await supabaseAdmin
      .from('saved_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId);

    // Get pending scheduled calls
    const { count: pendingScheduled } = await supabaseAdmin
      .from('scheduled_calls')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.userId)
      .eq('status', 'pending');

    // Get total call duration
    const { data: durationData } = await supabaseAdmin
      .from('call_history')
      .select('duration_seconds')
      .eq('user_id', req.userId);

    const totalDuration = durationData?.reduce((sum, call) => sum + (call.duration_seconds || 0), 0) || 0;

    res.json({
      totalCalls: totalCalls || 0,
      savedCalls: savedCalls || 0,
      pendingScheduled: pendingScheduled || 0,
      totalDurationMinutes: Math.round(totalDuration / 60)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
