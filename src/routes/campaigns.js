/**
 * Campaign Admin Routes
 *
 * Protected admin endpoints for managing email templates, triggers, and campaigns.
 * All routes require x-admin-secret header authentication.
 */

const express = require('express');
const { supabaseAdmin } = require('../services/supabase');
const { authenticate } = require('../middleware/auth');
const {
  getTemplates,
  getTemplate,
  upsertTemplate,
  createCampaign,
  getCampaign,
  listCampaigns,
  updateCampaignStatus,
  previewCampaignRecipients,
  sendCampaign,
  getCampaignAnalytics,
  getSegmentUsers,
} = require('../services/campaignService');
const {
  getActiveTriggers,
  getTrigger,
  setTriggerActive,
  updateTrigger,
  processTriggers,
  processSingleTrigger,
  testTriggerWithMockUser,
} = require('../services/triggerEngine');

const router = express.Router();

// ============================================
// ADMIN AUTH MIDDLEWARE
// ============================================

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/**
 * Admin authentication middleware
 * Supports two methods:
 * 1. x-admin-secret header (for CLI/scripts)
 * 2. Authenticated user with is_admin = true (for frontend panel)
 */
async function adminAuth(req, res, next) {
  // Method 1: Check x-admin-secret header
  const providedSecret = req.headers['x-admin-secret'];
  if (ADMIN_SECRET && providedSecret === ADMIN_SECRET) {
    return next();
  }

  // Method 2: Check authenticated user's is_admin flag
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (!authError && authUser) {
        // Check if user is admin
        const { data: user } = await supabaseAdmin
          .from('users')
          .select('id, is_admin')
          .eq('id', authUser.id)
          .single();

        if (user?.is_admin === true) {
          req.userId = user.id;
          return next();
        }
      }
    } catch (error) {
      console.error('[Campaigns] Auth error:', error);
    }
  }

  // Dev mode bypass for testing
  if (process.env.DEV_MODE === 'true') {
    console.log('[Campaigns] Dev mode - allowing admin access');
    return next();
  }

  return res.status(401).json({ error: 'Admin access required. Provide x-admin-secret header or login as admin user.' });
}

// Apply admin auth to all routes
router.use(adminAuth);

// ============================================
// ADMIN STATUS
// ============================================

/**
 * GET /api/admin/status
 * Check if current user has admin access
 */
router.get('/status', (req, res) => {
  res.json({ isAdmin: true });
});

// ============================================
// TEMPLATE ROUTES
// ============================================

/**
 * GET /api/admin/templates
 * List all email templates
 */
router.get('/templates', async (req, res) => {
  try {
    const { category } = req.query;
    const templates = await getTemplates(category);
    res.json({ templates });
  } catch (error) {
    console.error('[Campaigns] Error listing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/templates/:id
 * Get a specific template
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const template = await getTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ template });
  } catch (error) {
    console.error('[Campaigns] Error getting template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/admin/templates/:id
 * Create or update a template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const template = await upsertTemplate({
      id: req.params.id,
      ...req.body,
    });
    res.json({ template });
  } catch (error) {
    console.error('[Campaigns] Error upserting template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TRIGGER ROUTES
// ============================================

/**
 * GET /api/admin/triggers
 * List all automated triggers
 */
router.get('/triggers', async (req, res) => {
  try {
    const triggers = await getActiveTriggers();
    res.json({ triggers });
  } catch (error) {
    console.error('[Campaigns] Error listing triggers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/triggers/:id
 * Get a specific trigger
 */
router.get('/triggers/:id', async (req, res) => {
  try {
    const trigger = await getTrigger(req.params.id);
    if (!trigger) {
      return res.status(404).json({ error: 'Trigger not found' });
    }
    res.json({ trigger });
  } catch (error) {
    console.error('[Campaigns] Error getting trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/admin/triggers/:id
 * Update trigger settings
 */
router.patch('/triggers/:id', async (req, res) => {
  try {
    const trigger = await updateTrigger(req.params.id, req.body);
    res.json({ trigger });
  } catch (error) {
    console.error('[Campaigns] Error updating trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/triggers/:id/toggle
 * Enable or disable a trigger
 */
router.post('/triggers/:id/toggle', async (req, res) => {
  try {
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      return res.status(400).json({ error: 'active must be a boolean' });
    }
    const trigger = await setTriggerActive(req.params.id, active);
    res.json({ trigger });
  } catch (error) {
    console.error('[Campaigns] Error toggling trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/triggers/run
 * Manually run all triggers (for testing)
 */
router.post('/triggers/run', async (req, res) => {
  try {
    console.log('[Campaigns] Manual trigger run requested');
    const results = await processTriggers();
    res.json({
      message: 'Triggers processed',
      results,
    });
  } catch (error) {
    console.error('[Campaigns] Error running triggers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/triggers/:id/run
 * Manually run a single trigger (for testing)
 */
router.post('/triggers/:id/run', async (req, res) => {
  try {
    console.log(`[Campaigns] Manual trigger run for ${req.params.id}`);
    const results = await processSingleTrigger(req.params.id);
    res.json({
      message: 'Trigger processed',
      results,
    });
  } catch (error) {
    console.error('[Campaigns] Error running trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/triggers/:id/test
 * E2E test a trigger with a mock user
 * Creates a test user matching the trigger conditions, runs the trigger,
 * verifies the email was "sent" (logged), and cleans up.
 */
router.post('/triggers/:id/test', async (req, res) => {
  try {
    const triggerId = req.params.id;
    console.log(`[Campaigns] E2E test for trigger ${triggerId}`);

    const result = await testTriggerWithMockUser(triggerId);

    res.json({
      success: result.success,
      triggerId,
      testUserId: result.testUserId,
      emailSent: result.emailSent,
      triggerLog: result.triggerLog,
      error: result.error,
    });
  } catch (error) {
    console.error('[Campaigns] Error testing trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CAMPAIGN ROUTES
// ============================================

/**
 * GET /api/admin/campaigns
 * List campaigns
 */
router.get('/campaigns', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const campaigns = await listCampaigns(status, limit ? parseInt(limit) : undefined);
    res.json({ campaigns });
  } catch (error) {
    console.error('[Campaigns] Error listing campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/campaigns/:id
 * Get a specific campaign
 */
router.get('/campaigns/:id', async (req, res) => {
  try {
    const campaign = await getCampaign(req.params.id);
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    res.json({ campaign });
  } catch (error) {
    console.error('[Campaigns] Error getting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/campaigns
 * Create a new campaign
 */
router.post('/campaigns', async (req, res) => {
  try {
    const { name, description, templateId, subjectOverride, segmentJson, scheduledAt } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    const campaign = await createCampaign({
      name,
      description,
      templateId,
      subjectOverride,
      segmentJson,
      scheduledAt,
    });

    res.status(201).json({ campaign });
  } catch (error) {
    console.error('[Campaigns] Error creating campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/admin/campaigns/:id
 * Update campaign status
 */
router.patch('/campaigns/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const campaign = await updateCampaignStatus(req.params.id, status);
    res.json({ campaign });
  } catch (error) {
    console.error('[Campaigns] Error updating campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/campaigns/:id/preview
 * Preview campaign recipients
 */
router.get('/campaigns/:id/preview', async (req, res) => {
  try {
    const preview = await previewCampaignRecipients(req.params.id);
    res.json(preview);
  } catch (error) {
    console.error('[Campaigns] Error previewing campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/admin/campaigns/:id/send
 * Send a campaign
 */
router.post('/campaigns/:id/send', async (req, res) => {
  try {
    const { batchSize, delayMs } = req.body;

    console.log(`[Campaigns] Sending campaign ${req.params.id}`);

    const results = await sendCampaign(req.params.id, { batchSize, delayMs });

    res.json({
      message: 'Campaign sent',
      results,
    });
  } catch (error) {
    console.error('[Campaigns] Error sending campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/admin/campaigns/:id/analytics
 * Get campaign analytics
 */
router.get('/campaigns/:id/analytics', async (req, res) => {
  try {
    const analytics = await getCampaignAnalytics(req.params.id);
    res.json(analytics);
  } catch (error) {
    console.error('[Campaigns] Error getting analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SEGMENT ROUTES
// ============================================

/**
 * POST /api/admin/segments/preview
 * Preview users matching a segment
 */
router.post('/segments/preview', async (req, res) => {
  try {
    const segmentJson = req.body;
    const users = await getSegmentUsers(segmentJson);

    res.json({
      count: users.length,
      preview: users.slice(0, 20),
    });
  } catch (error) {
    console.error('[Campaigns] Error previewing segment:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
