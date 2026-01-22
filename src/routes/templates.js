/**
 * Templates API Routes
 *
 * Provides endpoints for the template system that makes onboarding easier.
 */

const express = require('express');
const router = express.Router();
const templateService = require('../services/assistantTemplates');

/**
 * GET /api/templates
 * Get all available templates for the template selection UI
 */
router.get('/', (req, res) => {
  try {
    const templates = templateService.getAllTemplates();
    res.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('[Templates] Error fetching templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch templates',
    });
  }
});

/**
 * GET /api/templates/:templateId
 * Get a specific template with full details
 */
router.get('/:templateId', (req, res) => {
  try {
    const { templateId } = req.params;
    const template = templateService.getTemplate(templateId);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: 'Template not found',
      });
    }

    // Return template info without the full prompt generator
    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        icon: template.icon,
        defaultSettings: template.defaultSettings,
        sampleFirstMessage: template.sampleFirstMessage,
        suggestedEscalation: template.suggestedEscalation,
      },
    });
  } catch (error) {
    console.error('[Templates] Error fetching template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch template',
    });
  }
});

/**
 * POST /api/templates/:templateId/preview
 * Preview what a generated assistant would look like
 */
router.post('/:templateId/preview', (req, res) => {
  try {
    const { templateId } = req.params;
    const { businessName, businessDescription, greetingName, voiceId, voiceProvider } = req.body;

    const config = templateService.generateFromTemplate(templateId, {
      businessName,
      businessDescription,
      greetingName,
      voiceId,
      voiceProvider,
    });

    // Add date context to the preview
    config.systemPrompt = templateService.addDateContext(config.systemPrompt);

    res.json({
      success: true,
      preview: {
        firstMessage: config.firstMessage,
        systemPromptPreview: config.systemPrompt.slice(0, 500) + '...',
        systemPromptFull: config.systemPrompt,
        voice: config.voice,
        suggestedEscalation: config.suggestedEscalation,
      },
    });
  } catch (error) {
    console.error('[Templates] Error generating preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate preview',
    });
  }
});

module.exports = router;
