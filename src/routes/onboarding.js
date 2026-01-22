/**
 * Onboarding API Routes
 *
 * Simplified onboarding flow that makes it easy for users to get started.
 * Uses the template system to generate professional assistant configurations.
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const templateService = require('../services/assistantTemplates');
const assistantService = require('../services/assistant');
const { supabaseAdmin } = require('../services/supabase');

/**
 * POST /api/onboarding/quick-setup
 * One-step assistant creation using templates
 *
 * This is the main endpoint for the simplified onboarding flow.
 * Takes minimal input and creates a fully configured assistant.
 */
router.post('/quick-setup', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      templateId = 'generic',
      businessName,
      businessDescription,
      greetingName,
      voiceId,
      voiceProvider,
      // Optional advanced settings
      customizePrompt = false,
      customPrompt,
    } = req.body;

    // Validate required fields
    if (!businessName) {
      return res.status(400).json({
        success: false,
        error: 'Business name is required',
      });
    }

    console.log(`[Onboarding] Quick setup for user ${userId} with template ${templateId}`);

    // Generate assistant config from template
    const templateConfig = templateService.generateFromTemplate(templateId, {
      businessName,
      businessDescription: businessDescription || '',
      greetingName: greetingName || templateService.getTemplate(templateId).defaultSettings.greetingName,
      voiceId,
      voiceProvider,
    });

    // Use custom prompt if provided, otherwise use generated one
    const finalSystemPrompt = customizePrompt && customPrompt
      ? templateService.addDateContext(customPrompt)
      : templateService.addDateContext(templateConfig.systemPrompt);

    // Check if user already has an assistant
    const existingAssistant = await assistantService.getUserAssistant(userId);

    let result;
    if (existingAssistant) {
      // Update existing assistant
      console.log(`[Onboarding] Updating existing assistant for user ${userId}`);
      result = await assistantService.updateAssistant(userId, {
        businessName,
        businessDescription,
        greetingName: greetingName || templateConfig.voice.voiceId,
        systemPrompt: finalSystemPrompt,
        firstMessage: templateConfig.firstMessage,
        voiceId: templateConfig.voice.voiceId,
        voiceProvider: templateConfig.voice.provider,
      });
    } else {
      // Create new assistant
      console.log(`[Onboarding] Creating new assistant for user ${userId}`);
      const createResult = await assistantService.createAssistantForUser(userId, {
        businessName,
        businessDescription,
        greetingName: greetingName || templateConfig.voice.voiceId,
        planId: 'starter', // Default plan, will be updated when they subscribe
      });
      result = createResult.dbAssistant;

      // Update with the template-generated prompt
      await assistantService.updateAssistant(userId, {
        systemPrompt: finalSystemPrompt,
        firstMessage: templateConfig.firstMessage,
        voiceId: templateConfig.voice.voiceId,
        voiceProvider: templateConfig.voice.provider,
      });
    }

    // Save the template choice for future reference
    await supabaseAdmin
      .from('user_assistants')
      .update({
        template_id: templateId,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    // Mark onboarding as complete
    await supabaseAdmin
      .from('users')
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', userId);

    res.json({
      success: true,
      message: 'Assistant created successfully!',
      assistant: {
        id: result.id,
        businessName,
        templateId,
        firstMessage: templateConfig.firstMessage,
        voiceId: templateConfig.voice.voiceId,
      },
      nextSteps: [
        'Test your assistant by calling your assigned phone number',
        'Connect a booking provider (Cal.com, Calendly) to enable appointments',
        'Customize your escalation settings for when to transfer to a human',
      ],
    });
  } catch (error) {
    console.error('[Onboarding] Quick setup error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create assistant',
    });
  }
});

/**
 * GET /api/onboarding/status
 * Check user's onboarding status and what steps are complete
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user info
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('onboarding_completed, onboarding_completed_at, created_at')
      .eq('id', userId)
      .single();

    // Get assistant info
    const assistant = await assistantService.getUserAssistant(userId);

    // Get phone number
    const { data: phoneNumbers } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('phone_number, status')
      .eq('user_id', userId)
      .eq('status', 'active');

    // Check for booking provider
    const { data: bookingConnections } = await supabaseAdmin
      .from('provider_connections')
      .select('provider_id, status')
      .eq('user_id', userId)
      .eq('status', 'connected');

    // Determine steps
    const steps = {
      accountCreated: true,
      assistantConfigured: !!assistant,
      phoneNumberAssigned: phoneNumbers && phoneNumbers.length > 0,
      bookingProviderConnected: bookingConnections && bookingConnections.length > 0,
      firstCallMade: false, // TODO: Check call history
    };

    const completedSteps = Object.values(steps).filter(Boolean).length;
    const totalSteps = Object.keys(steps).length;
    const progress = Math.round((completedSteps / totalSteps) * 100);

    res.json({
      success: true,
      onboardingCompleted: user?.onboarding_completed || false,
      progress,
      steps,
      assistant: assistant ? {
        id: assistant.id,
        businessName: assistant.business_name,
        templateId: assistant.template_id,
      } : null,
      phoneNumber: phoneNumbers?.[0]?.phone_number || null,
    });
  } catch (error) {
    console.error('[Onboarding] Status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get onboarding status',
    });
  }
});

/**
 * POST /api/onboarding/skip
 * Allow users to skip certain onboarding steps
 */
router.post('/skip', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    await supabaseAdmin
      .from('users')
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', userId);

    res.json({
      success: true,
      message: 'Onboarding marked as complete',
    });
  } catch (error) {
    console.error('[Onboarding] Skip error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to skip onboarding',
    });
  }
});

module.exports = router;
