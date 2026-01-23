const express = require('express');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/history
 * Get call history for user
 */
router.get('/', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;

    let query = supabaseAdmin
      .from('call_history')
      .select('*')
      .eq('user_id', req.userId)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: history, error } = await query;

    if (error) {
      throw new Error('Failed to fetch call history');
    }

    res.json(history.map(call => ({
      id: call.id,
      phoneNumber: call.phone_number,
      contactName: call.contact_name,
      message: call.message,
      language: call.language,
      status: call.status,
      durationSeconds: call.duration_seconds,
      createdAt: call.created_at,
      endedAt: call.ended_at,
      // Vapi call details
      transcript: call.transcript,
      summary: call.summary,
      recordingUrl: call.recording_url,
      endedReason: call.ended_reason,
      costCents: call.cost_cents
    })));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/history/:id
 * Get a specific call from history
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { data: call, error } = await supabaseAdmin
      .from('call_history')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.userId)
      .single();

    if (error || !call) {
      return res.status(404).json({ error: { message: 'Call not found' } });
    }

    res.json({
      id: call.id,
      phoneNumber: call.phone_number,
      contactName: call.contact_name,
      message: call.message,
      language: call.language,
      status: call.status,
      durationSeconds: call.duration_seconds,
      vapiCallId: call.vapi_call_id,
      createdAt: call.created_at,
      endedAt: call.ended_at,
      // Vapi call details
      transcript: call.transcript,
      summary: call.summary,
      recordingUrl: call.recording_url,
      endedReason: call.ended_reason,
      costCents: call.cost_cents
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
