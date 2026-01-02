const express = require('express');
const { body, validationResult } = require('express-validator');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/saved-calls
 * Get all saved calls for user
 */
router.get('/', async (req, res, next) => {
  try {
    const { data: savedCalls, error } = await supabaseAdmin
      .from('saved_calls')
      .select('*')
      .eq('user_id', req.userId)
      .order('last_used_at', { ascending: false, nullsFirst: false })
      .order('usage_count', { ascending: false });

    if (error) {
      throw new Error('Failed to fetch saved calls');
    }

    res.json(savedCalls.map(call => ({
      id: call.id,
      name: call.name,
      phoneNumber: call.phone_number,
      contactName: call.contact_name,
      message: call.message,
      language: call.language,
      createdAt: call.created_at,
      lastUsedAt: call.last_used_at,
      usageCount: call.usage_count
    })));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/saved-calls/:id
 * Get a specific saved call
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: savedCall, error } = await supabaseAdmin
      .from('saved_calls')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();

    if (error || !savedCall) {
      return res.status(404).json({ error: { message: 'Saved call not found' } });
    }

    res.json({
      id: savedCall.id,
      name: savedCall.name,
      phoneNumber: savedCall.phone_number,
      contactName: savedCall.contact_name,
      message: savedCall.message,
      language: savedCall.language,
      createdAt: savedCall.created_at,
      lastUsedAt: savedCall.last_used_at,
      usageCount: savedCall.usage_count
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/saved-calls
 * Create a new saved call
 */
router.post('/', [
  body('name').notEmpty().trim(),
  body('phoneNumber').notEmpty().matches(/^\+?[\d\s\-()]+$/),
  body('message').notEmpty().trim(),
  body('language').optional().isLength({ min: 2, max: 5 }),
  body('contactName').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { name, phoneNumber, contactName, message, language = 'en' } = req.body;

    const { data: savedCall, error } = await supabaseAdmin
      .from('saved_calls')
      .insert({
        user_id: req.userId,
        name,
        phone_number: phoneNumber,
        contact_name: contactName,
        message,
        language,
        created_at: new Date().toISOString(),
        usage_count: 0
      })
      .select()
      .single();

    if (error) {
      throw new Error('Failed to create saved call');
    }

    res.status(201).json({
      id: savedCall.id,
      name: savedCall.name,
      phoneNumber: savedCall.phone_number,
      contactName: savedCall.contact_name,
      message: savedCall.message,
      language: savedCall.language,
      createdAt: savedCall.created_at
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/saved-calls/:id
 * Update a saved call
 */
router.put('/:id', [
  body('name').optional().trim().notEmpty(),
  body('phoneNumber').optional().matches(/^\+?[\d\s\-()]+$/),
  body('message').optional().trim().notEmpty(),
  body('language').optional().isLength({ min: 2, max: 5 }),
  body('contactName').optional().trim()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', details: errors.array() } });
    }

    const { name, phoneNumber, contactName, message, language } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (phoneNumber !== undefined) updates.phone_number = phoneNumber;
    if (contactName !== undefined) updates.contact_name = contactName;
    if (message !== undefined) updates.message = message;
    if (language !== undefined) updates.language = language;

    const { data: savedCall, error } = await supabaseAdmin
      .from('saved_calls')
      .update(updates)
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single();

    if (error || !savedCall) {
      return res.status(404).json({ error: { message: 'Saved call not found' } });
    }

    res.json({
      id: savedCall.id,
      name: savedCall.name,
      phoneNumber: savedCall.phone_number,
      contactName: savedCall.contact_name,
      message: savedCall.message,
      language: savedCall.language
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/saved-calls/:id
 * Delete a saved call
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .from('saved_calls')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.userId);

    if (error) {
      throw new Error('Failed to delete saved call');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/saved-calls/:id/use
 * Mark a saved call as used (increment usage count)
 */
router.post('/:id/use', async (req, res, next) => {
  try {
    const { data: savedCall, error } = await supabaseAdmin
      .from('saved_calls')
      .update({
        last_used_at: new Date().toISOString(),
        usage_count: supabaseAdmin.rpc('increment', { x: 1 })
      })
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .select()
      .single();

    // Fallback if RPC doesn't work
    if (error) {
      const { data: current } = await supabaseAdmin
        .from('saved_calls')
        .select('usage_count')
        .eq('id', req.params.id)
        .eq('user_id', req.userId)
        .single();

      if (current) {
        await supabaseAdmin
          .from('saved_calls')
          .update({
            last_used_at: new Date().toISOString(),
            usage_count: (current.usage_count || 0) + 1
          })
          .eq('id', req.params.id)
          .eq('user_id', req.userId);
      }
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
