/**
 * Email Routes
 * API endpoints for email service status and manual email triggers
 */

const express = require('express');
const { supabaseAdmin } = require('../services/supabase');
const {
  sendWelcomeEmail,
  sendUsageAlertEmail,
  isEmailConfigured,
  getEmailConfig,
} = require('../services/emailService');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ============================================
// EVENT TRACKING
// ============================================

/**
 * POST /api/email/track-event
 * Track user events for email trigger matching
 * Body: { eventType, eventData?, pageUrl?, referrer? }
 */
router.post('/track-event', authenticate, async (req, res) => {
  try {
    const userId = req.userId;
    const { eventType, eventData, pageUrl, referrer } = req.body;

    if (!eventType) {
      return res.status(400).json({ error: { message: 'eventType is required' } });
    }

    // Valid event types
    const validEvents = ['pricing_view', 'upgrade_started', 'feature_used', 'dashboard_view', 'settings_view'];
    if (!validEvents.includes(eventType)) {
      return res.status(400).json({
        error: { message: `Invalid eventType. Valid types: ${validEvents.join(', ')}` },
      });
    }

    // Insert the event
    const { data, error } = await supabaseAdmin
      .from('user_events')
      .insert({
        user_id: userId,
        event_type: eventType,
        event_data: eventData || {},
        page_url: pageUrl,
        referrer,
      })
      .select()
      .single();

    if (error) {
      console.error('[Email Routes] Error tracking event:', error);
      return res.status(500).json({ error: { message: error.message } });
    }

    res.json({ success: true, eventId: data.id });
  } catch (error) {
    console.error('[Email Routes] Track event error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

// ============================================
// EMAIL STATUS & SENDING
// ============================================

/**
 * GET /api/email/status
 * Check if email service is configured
 */
router.get('/status', (req, res) => {
  res.json(getEmailConfig());
});

/**
 * POST /api/email/welcome
 * Send welcome email (with deduplication)
 * Body: { userId?, email, name }
 */
router.post('/welcome', authenticate, async (req, res) => {
  try {
    const { email, name } = req.body;
    const userId = req.body.userId || req.userId;

    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

    // Check for duplicate welcome email
    const { data: existing } = await supabaseAdmin
      .from('email_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('email_type', 'welcome')
      .single();

    if (existing) {
      return res.json({
        success: true,
        message: 'Welcome email already sent',
        skipped: true,
      });
    }

    // Send welcome email (without planId for signup - it's a generic welcome)
    const result = await sendWelcomeEmail(userId, { planId: 'starter' });

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('[Email Routes] Welcome email error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * POST /api/email/usage-alert
 * Send usage alert email
 * Body: { resourceType, currentUsage, limit, percentUsed }
 */
router.post('/usage-alert', authenticate, async (req, res) => {
  try {
    const { resourceType, currentUsage, limit, percentUsed } = req.body;
    const userId = req.userId;

    if (!resourceType || currentUsage === undefined || !limit || !percentUsed) {
      return res.status(400).json({
        error: { message: 'resourceType, currentUsage, limit, and percentUsed are required' },
      });
    }

    const result = await sendUsageAlertEmail(userId, {
      resourceType,
      currentUsage,
      limit,
      percentUsed,
    });

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('[Email Routes] Usage alert email error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

/**
 * POST /api/email/test
 * Send a test email (admin/dev only)
 * Body: { email, template: 'welcome' | 'usage-alert' }
 */
router.post('/test', authenticate, async (req, res) => {
  try {
    // Only allow in dev mode
    if (process.env.DEV_MODE !== 'true' && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: { message: 'Test emails only available in dev mode' } });
    }

    const { email, template = 'welcome' } = req.body;
    const userId = req.userId;

    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

    let result;
    if (template === 'usage-alert') {
      result = await sendUsageAlertEmail(userId, {
        resourceType: 'call minutes',
        currentUsage: 80,
        limit: 100,
        percentUsed: 80,
      });
    } else {
      result = await sendWelcomeEmail(userId, { planId: 'starter' });
    }

    res.json({
      success: result.success,
      messageId: result.messageId,
      template,
      error: result.error,
    });
  } catch (error) {
    console.error('[Email Routes] Test email error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
});

module.exports = router;
