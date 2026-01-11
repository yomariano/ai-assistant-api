const express = require('express');
const { authenticate } = require('../middleware/auth');
const { supabaseAdmin } = require('../services/supabase');
const {
  getUserAssistant,
  updateAssistant,
  getAvailableVoices,
  createAssistantForUser,
  recreateVapiAssistant
} = require('../services/assistant');
const { getSubscription, getPlanLimits } = require('../services/stripe');

const router = express.Router();

/**
 * GET /api/assistant
 * Get user's AI assistant configuration
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const assistant = await getUserAssistant(req.userId);

    if (!assistant) {
      return res.json({
        exists: false,
        message: 'No assistant configured. Subscribe to a plan to get started.'
      });
    }

    // Get available voices based on plan
    const subscription = await getSubscription(req.userId);
    const planId = subscription?.plan_id || 'starter';
    const availableVoices = getAvailableVoices(planId);

    res.json({
      exists: true,
      assistant: {
        id: assistant.id,
        name: assistant.name,
        firstMessage: assistant.first_message,
        systemPrompt: assistant.system_prompt,
        voice: {
          id: assistant.voice_id,
          provider: assistant.voice_provider
        },
        business: {
          name: assistant.business_name,
          description: assistant.business_description,
          greetingName: assistant.greeting_name
        },
        features: {
          voiceCloningEnabled: assistant.voice_cloning_enabled,
          customKnowledgeBase: assistant.custom_knowledge_base
        },
        lastSyncedAt: assistant.last_synced_at,
        createdAt: assistant.created_at
      },
      availableVoices,
      planId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/assistant
 * Update user's AI assistant configuration
 */
router.patch('/', authenticate, async (req, res, next) => {
  try {
    const {
      name,
      firstMessage,
      systemPrompt,
      voiceId,
      voiceProvider,
      businessName,
      businessDescription,
      greetingName
    } = req.body;

    // Validate voice selection based on plan
    if (voiceId) {
      const subscription = await getSubscription(req.userId);
      const planId = subscription?.plan_id || 'starter';
      const availableVoices = getAvailableVoices(planId);

      const isValidVoice = availableVoices.some(v => v.id === voiceId);
      if (!isValidVoice) {
        return res.status(400).json({
          error: {
            message: 'Voice not available on your plan. Upgrade to access more voices.'
          }
        });
      }
    }

    const updatedAssistant = await updateAssistant(req.userId, {
      name,
      firstMessage,
      systemPrompt,
      voiceId,
      voiceProvider,
      businessName,
      businessDescription,
      greetingName
    });

    res.json({
      success: true,
      assistant: updatedAssistant
    });
  } catch (error) {
    if (error.message === 'Assistant not found') {
      return res.status(404).json({
        error: { message: 'No assistant found. Subscribe to a plan first.' }
      });
    }
    next(error);
  }
});

/**
 * POST /api/assistant/test-greeting
 * Preview what the assistant will say
 */
router.post('/test-greeting', authenticate, async (req, res, next) => {
  try {
    const { businessName, greetingName } = req.body;

    const greeting = `Hi! This is ${greetingName || 'your AI assistant'}${businessName ? ` from ${businessName}` : ''}. How can I help you today?`;

    res.json({ greeting });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assistant/voices
 * Get available voices for user's plan
 */
router.get('/voices', authenticate, async (req, res, next) => {
  try {
    const subscription = await getSubscription(req.userId);
    const planId = subscription?.plan_id || 'starter';
    const voices = getAvailableVoices(planId);

    // Get current voice
    const assistant = await getUserAssistant(req.userId);

    res.json({
      voices,
      currentVoice: assistant ? {
        id: assistant.voice_id,
        provider: assistant.voice_provider
      } : null,
      planId
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/assistant/regenerate-prompt
 * Regenerate system prompt based on business info
 */
router.post('/regenerate-prompt', authenticate, async (req, res, next) => {
  try {
    const { businessName, businessDescription, greetingName } = req.body;

    const { buildSystemPrompt } = require('../services/assistant');

    const systemPrompt = buildSystemPrompt({
      businessName: businessName || '',
      businessDescription: businessDescription || '',
      greetingName: greetingName || 'your AI assistant'
    });

    res.json({ systemPrompt });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/assistant/test-config
 * Get configuration needed for testing assistant via web call
 */
router.get('/test-config', authenticate, async (req, res, next) => {
  try {
    const assistant = await getUserAssistant(req.userId);

    if (!assistant) {
      return res.status(404).json({
        error: { message: 'No assistant configured. Subscribe to a plan first.' }
      });
    }

    if (!assistant.vapi_assistant_id) {
      return res.status(400).json({
        error: { message: 'Assistant not properly configured. Please contact support.' }
      });
    }

    res.json({
      vapiAssistantId: assistant.vapi_assistant_id,
      assistantName: assistant.greeting_name || assistant.name || 'AI Assistant'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/assistant/recreate
 * Recreate the VAPI assistant (useful when switching from mock to real provider)
 */
router.post('/recreate', authenticate, async (req, res, next) => {
  try {
    const result = await recreateVapiAssistant(req.userId);

    res.json({
      success: true,
      message: 'Assistant recreated successfully',
      vapiAssistantId: result.vapiAssistant.id
    });
  } catch (error) {
    if (error.message === 'Assistant not found') {
      return res.status(404).json({
        error: { message: 'No assistant found. Subscribe to a plan first.' }
      });
    }
    next(error);
  }
});

/**
 * GET /api/assistant/stats
 * Get assistant usage statistics
 */
router.get('/stats', authenticate, async (req, res, next) => {
  try {
    // Get call count for this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: usage } = await supabaseAdmin
      .from('usage_tracking')
      .select('calls_made, minutes_used')
      .eq('user_id', req.userId)
      .gte('period_start', startOfMonth.toISOString().slice(0, 10))
      .single();

    const subscription = await getSubscription(req.userId);
    const planLimits = getPlanLimits(subscription?.plan_id || 'starter');

    res.json({
      thisMonth: {
        calls: usage?.calls_made || 0,
        minutes: usage?.minutes_used || 0
      },
      limits: {
        minutesIncluded: planLimits.minutesIncluded,
        maxMinutesPerCall: planLimits.maxMinutesPerCall
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
