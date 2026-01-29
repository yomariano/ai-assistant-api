/**
 * Notification Routes
 *
 * API endpoints for managing notification preferences and escalation settings.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const notificationService = require('../services/notifications');
const { syncEscalationToAssistant } = require('../services/assistant');

// All routes require authentication
router.use(authenticate);

// ============================================
// NOTIFICATION PREFERENCES
// ============================================

/**
 * GET /api/notifications/preferences
 * Get current user's notification preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const preferences = await notificationService.getNotificationPreferences(req.user.id);
    res.json({ preferences });
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    res.status(500).json({
      error: {
        code: 'NOTIFICATION_PREFS_ERROR',
        message: 'Failed to get notification preferences',
      },
    });
  }
});

/**
 * PUT /api/notifications/preferences
 * Update current user's notification preferences
 */
router.put('/preferences', async (req, res) => {
  try {
    const allowedFields = [
      'email_enabled',
      'email_address',
      'notify_on_call_complete',
      'notify_on_message_taken',
      'notify_on_escalation',
      'notify_on_voicemail',
      'business_hours_only',
      'timezone',
    ];

    // Filter to only allowed fields
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate email format if provided
    if (updates.email_address && !isValidEmail(updates.email_address)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Invalid email address format',
        },
      });
    }

    const preferences = await notificationService.updateNotificationPreferences(
      req.user.id,
      updates
    );

    res.json({ preferences, message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    res.status(500).json({
      error: {
        code: 'NOTIFICATION_PREFS_UPDATE_ERROR',
        message: 'Failed to update notification preferences',
      },
    });
  }
});

// ============================================
// ESCALATION SETTINGS
// ============================================

/**
 * GET /api/notifications/escalation
 * Get current user's escalation settings
 */
router.get('/escalation', async (req, res) => {
  try {
    const settings = await notificationService.getEscalationSettings(req.user.id);
    res.json({ settings });
  } catch (error) {
    console.error('Error getting escalation settings:', error);
    res.status(500).json({
      error: {
        code: 'ESCALATION_SETTINGS_ERROR',
        message: 'Failed to get escalation settings',
      },
    });
  }
});

/**
 * PUT /api/notifications/escalation
 * Update current user's escalation settings
 */
router.put('/escalation', async (req, res) => {
  try {
    const allowedFields = [
      'transfer_enabled',
      'transfer_number',
      'transfer_method',
      'trigger_keywords',
      'max_failed_attempts',
      'business_hours_only',
      'business_hours_start',
      'business_hours_end',
      'business_days',
      'timezone',
      'after_hours_action',
      'after_hours_message',
    ];

    // Filter to only allowed fields
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    // Validate transfer number if provided
    if (updates.transfer_number && !isValidPhoneNumber(updates.transfer_number)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_PHONE_NUMBER',
          message: 'Invalid transfer phone number format. Use E.164 format (e.g., +353851234567)',
        },
      });
    }

    // Validate transfer method
    const validMethods = ['blind_transfer', 'warm_transfer', 'callback'];
    if (updates.transfer_method && !validMethods.includes(updates.transfer_method)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TRANSFER_METHOD',
          message: `Invalid transfer method. Must be one of: ${validMethods.join(', ')}`,
        },
      });
    }

    // Validate after hours action
    const validActions = ['voicemail', 'callback_promise', 'ai_only'];
    if (updates.after_hours_action && !validActions.includes(updates.after_hours_action)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AFTER_HOURS_ACTION',
          message: `Invalid after hours action. Must be one of: ${validActions.join(', ')}`,
        },
      });
    }

    // Validate trigger keywords is an array
    if (updates.trigger_keywords && !Array.isArray(updates.trigger_keywords)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TRIGGER_KEYWORDS',
          message: 'Trigger keywords must be an array of strings',
        },
      });
    }

    const settings = await notificationService.updateEscalationSettings(
      req.user.id,
      updates
    );

    // Sync escalation settings to the Vapi assistant
    try {
      await syncEscalationToAssistant(req.user.id);
    } catch (syncError) {
      console.error('Error syncing escalation to assistant:', syncError);
      // Don't fail the request, just log the error
    }

    res.json({ settings, message: 'Escalation settings updated successfully' });
  } catch (error) {
    console.error('Error updating escalation settings:', error);
    res.status(500).json({
      error: {
        code: 'ESCALATION_SETTINGS_UPDATE_ERROR',
        message: 'Failed to update escalation settings',
      },
    });
  }
});

// ============================================
// TEST NOTIFICATIONS
// ============================================

/**
 * POST /api/notifications/test
 * Send a test email notification to verify configuration
 */
router.post('/test', async (req, res) => {
  try {
    const result = await notificationService.sendTestNotification(req.user.id);

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        messageId: result.messageId,
      });
    } else {
      res.status(400).json({
        success: false,
        error: {
          code: 'TEST_NOTIFICATION_FAILED',
          message: result.error,
        },
      });
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    res.status(500).json({
      error: {
        code: 'TEST_NOTIFICATION_ERROR',
        message: 'Failed to send test notification',
      },
    });
  }
});

/**
 * GET /api/notifications/history
 * Get notification history for current user
 */
router.get('/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error, count } = await supabase
      .from('call_notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      notifications: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error getting notification history:', error);
    res.status(500).json({
      error: {
        code: 'NOTIFICATION_HISTORY_ERROR',
        message: 'Failed to get notification history',
      },
    });
  }
});

// ============================================
// EMAIL PREFERENCES (Marketing Opt-in)
// ============================================

/**
 * GET /api/notifications/email-preferences
 * Get current user's email marketing preferences
 */
router.get('/email-preferences', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase
      .from('email_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Return defaults if no preferences exist
    const preferences = data || {
      marketing_emails: false,
      product_updates: true,
      weekly_digest: false,
    };

    res.json({ preferences });
  } catch (error) {
    console.error('Error getting email preferences:', error);
    res.status(500).json({
      error: {
        code: 'EMAIL_PREFS_ERROR',
        message: 'Failed to get email preferences',
      },
    });
  }
});

/**
 * PUT /api/notifications/email-preferences
 * Update current user's email marketing preferences
 */
router.put('/email-preferences', async (req, res) => {
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const allowedFields = ['marketing_emails', 'product_updates', 'weekly_digest'];

    // Filter to only allowed fields
    const updates = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (typeof req.body[field] === 'boolean') {
        updates[field] = req.body[field];
      }
    }

    // Handle unsubscribe
    if (req.body.unsubscribe_all === true) {
      updates.marketing_emails = false;
      updates.product_updates = false;
      updates.weekly_digest = false;
      updates.unsubscribed_at = new Date().toISOString();
    }

    // Upsert preferences
    const { data, error } = await supabase
      .from('email_preferences')
      .upsert(
        { user_id: req.user.id, ...updates },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    res.json({
      preferences: data,
      message: 'Email preferences updated successfully',
    });
  } catch (error) {
    console.error('Error updating email preferences:', error);
    res.status(500).json({
      error: {
        code: 'EMAIL_PREFS_UPDATE_ERROR',
        message: 'Failed to update email preferences',
      },
    });
  }
});

/**
 * GET /api/notifications/email-history
 * Get email log history for current user
 */
router.get('/email-history', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error, count } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (error) throw error;

    res.json({
      emails: data || [],
      total: count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    console.error('Error getting email history:', error);
    res.status(500).json({
      error: {
        code: 'EMAIL_HISTORY_ERROR',
        message: 'Failed to get email history',
      },
    });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function isValidPhoneNumber(phone) {
  // E.164 format: + followed by 1-15 digits
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = router;
