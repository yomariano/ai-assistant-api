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
