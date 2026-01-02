const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/scheduled-calls
 * Get all scheduled calls for user
 */
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;

    let query = supabaseAdmin
      .from('scheduled_calls')
      .select('*')
      .eq('user_id', req.userId)
      .order('scheduled_time', { ascending: true });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: scheduledCalls, error } = await query;

    if (error) {
      throw new Error('Failed to fetch scheduled calls');
    }

    res.json(scheduledCalls.map(call => ({
      id: call.id,
      phoneNumber: call.phone_number,
      contactName: call.contact_name,
      message: call.message,
      language: call.language,
      scheduledTime: call.scheduled_time,
      status: call.status,
      createdAt: call.created_at
    })));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/scheduled-calls/:id
 * Get a specific scheduled call
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: scheduledCall, error } = await supabaseAdmin
      .from('scheduled_calls')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();

    if (error || !scheduledCall) {
      return res.status(404).json({ error: { message: 'Scheduled call not found' } });
    }

    res.json({
      id: scheduledCall.id,
      phoneNumber: scheduledCall.phone_number,
      contactName: scheduledCall.contact_name,
      message: scheduledCall.message,
      language: scheduledCall.language,
      scheduledTime: scheduledCall.scheduled_time,
      status: scheduledCall.status,
      createdAt: scheduledCall.created_at
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/scheduled-calls
 * Create a new scheduled call
 */
router.post('/', [
  body('phoneNumber').notEmpty().matches(/^\+?[\d\s\-()]+$/),
  body('message').notEmpty().trim(),
  body('scheduledTime').isISO8601(),
  body('language').optional().isLength({ min: 2, max: 5 }),
  body('contactName').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { phoneNumber, contactName, message, language = 'en', scheduledTime } = req.body;

    // Validate scheduled time is in the future
    const scheduleDate = new Date(scheduledTime);
    if (scheduleDate <= new Date()) {
      return res.status(400).json({ error: { message: 'Scheduled time must be in the future' } });
    }

    const { data: scheduledCall, error } = await supabaseAdmin
      .from('scheduled_calls')
      .insert({
        user_id: req.userId,
        phone_number: phoneNumber,
        contact_name: contactName,
        message,
        language,
        scheduled_time: scheduledTime,
        status: 'pending',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error('Failed to create scheduled call');
    }

    res.status(201).json({
      id: scheduledCall.id,
      phoneNumber: scheduledCall.phone_number,
      contactName: scheduledCall.contact_name,
      message: scheduledCall.message,
      language: scheduledCall.language,
      scheduledTime: scheduledCall.scheduled_time,
      status: scheduledCall.status,
      createdAt: scheduledCall.created_at
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/scheduled-calls/:id
 * Update a scheduled call (only if pending)
 */
router.put('/:id', [
  body('phoneNumber').optional().matches(/^\+?[\d\s\-()]+$/),
  body('message').optional().trim().notEmpty(),
  body('scheduledTime').optional().isISO8601(),
  body('language').optional().isLength({ min: 2, max: 5 }),
  body('contactName').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    // Check if call exists and is pending
    const { data: existing } = await supabaseAdmin
      .from('scheduled_calls')
      .select('status')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: { message: 'Scheduled call not found' } });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: { message: 'Can only update pending scheduled calls' } });
    }

    const { phoneNumber, contactName, message, language, scheduledTime } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (contactName !== undefined) updates.contact_name = contactName;
    if (message !== undefined) updates.message = message;
    if (language !== undefined) updates.language = language;
    if (scheduledTime !== undefined) {
      const scheduleDate = new Date(scheduledTime);
      if (scheduleDate <= new Date()) {
        return res.status(400).json({ error: { message: 'Scheduled time must be in the future' } });
      }
      updates.scheduled_time = scheduledTime;
    }

    const { data: scheduledCall, error } = await supabaseAdmin
      .from('scheduled_calls')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error) {
      throw new Error('Failed to update scheduled call');
    }

    res.json({
      id: scheduledCall.id,
      phoneNumber: scheduledCall.phone_number,
      contactName: scheduledCall.contact_name,
      message: scheduledCall.message,
      language: scheduledCall.language,
      scheduledTime: scheduledCall.scheduled_time,
      status: scheduledCall.status
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/scheduled-calls/:id
 * Cancel a scheduled call
 */
router.delete('/:id', async (req, res, next) => {
  try {
    // Check if call exists and is pending
    const { data: existing } = await supabaseAdmin
      .from('scheduled_calls')
      .select('status')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();

    if (!existing) {
      return res.status(404).json({ error: { message: 'Scheduled call not found' } });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ error: { message: 'Can only cancel pending scheduled calls' } });
    }

    // Update status to cancelled instead of deleting
    const { error } = await supabaseAdmin
      .from('scheduled_calls')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.userId);

    if (error) {
      throw new Error('Failed to cancel scheduled call');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
