/**
 * Vapi Voice AI Provider
 *
 * Real implementation that calls the Vapi API.
 * Use this in staging and production environments.
 */

const axios = require('axios');

const VAPI_API = 'https://api.vapi.ai';

class VapiProvider {
  constructor(apiKey = null) {
    this.apiKey = apiKey || process.env.VAPI_API_KEY;

    if (!this.apiKey) {
      throw new Error('VAPI_API_KEY is required');
    }

    this.client = axios.create({
      baseURL: VAPI_API,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  getName() {
    return 'vapi';
  }

  /**
   * Create a voice assistant
   */
  async createAssistant(config) {
    const {
      name,
      firstMessage,
      systemPrompt,
      model = {},
      voice = {},
      transcriber = {},
      maxDurationSeconds = 600,
      tools = [],
      escalationSettings = null,
    } = config;

    const payload = {
      name,
      firstMessage,
      model: {
        provider: model.provider || 'openai',
        model: model.model || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: systemPrompt || 'You are a helpful AI assistant.',
          },
        ],
        ...(model.temperature && { temperature: model.temperature }),
        // Add built-in tools if specified
        ...(tools.length > 0 && { tools }),
      },
      voice: {
        provider: voice.provider || 'playht',
        voiceId: voice.voiceId || 'jennifer',
      },
      transcriber: {
        provider: transcriber.provider || 'deepgram',
        language: transcriber.language || 'en',
      },
      maxDurationSeconds,
      firstMessageMode: config.firstMessageMode || 'assistant-speaks-first',
    };

    // Add transfer call tool if escalation is enabled
    if (escalationSettings?.transfer_enabled && escalationSettings?.transfer_number) {
      payload.model.tools = payload.model.tools || [];
      payload.model.tools.push(
        this._buildTransferCallTool(escalationSettings)
      );
    }

    try {
      console.log('[Vapi] Creating assistant with payload:', JSON.stringify(payload, null, 2));
      const response = await this.client.post('/assistant', payload);
      return this._mapAssistant(response.data);
    } catch (error) {
      console.error('[Vapi] Create assistant error:');
      console.error('  Status:', error.response?.status);
      console.error('  Response:', JSON.stringify(error.response?.data, null, 2));
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Failed to create assistant: ${errorMessage}`);
    }
  }

  /**
   * Update a voice assistant
   * IMPORTANT: VAPI requires the full model object when updating model properties.
   * We must fetch current config, merge updates, then send complete model.
   */
  async updateAssistant(assistantId, updates) {
    const payload = {};

    if (updates.name) payload.name = updates.name;
    if (updates.firstMessage) payload.firstMessage = updates.firstMessage;
    if (updates.voice) {
      payload.voice = {
        provider: updates.voice.provider,
        voiceId: updates.voice.voiceId,
      };
    }

    // If updating systemPrompt, escalationSettings, or tools - we need to preserve existing model config
    const needsModelUpdate = updates.systemPrompt || updates.escalationSettings !== undefined || updates.tools;

    if (needsModelUpdate) {
      // Fetch current assistant to get existing model config
      let currentModel = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [],
        tools: []
      };

      try {
        const current = await this.getAssistant(assistantId);
        if (current?.model) {
          currentModel = {
            provider: current.model.provider || 'openai',
            model: current.model.model || 'gpt-4o-mini',
            temperature: current.model.temperature ?? 0.7,
            messages: current.model.messages || [],
            tools: current.model.tools || []
          };
        }
      } catch (err) {
        console.log('[Vapi] Could not fetch current assistant, using defaults');
      }

      // Always prepend current date to system prompt so AI knows what day it is
      const now = new Date();
      const currentDate = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const datePrefix = `IMPORTANT: Today is ${currentDate}. Use this as the reference for "today", "tomorrow", "next week", etc.

SPEECH RULES: Always speak dates naturally (e.g., "Thursday, January twenty-second", NOT "22-01-2026"). Say times as "five PM" not "17:00". Spell confirmation codes phonetically (e.g., "A as in Alpha, B as in Bravo").

`;

      // Get the prompt content (new or existing)
      let promptContent = updates.systemPrompt || currentModel.messages?.[0]?.content || '';

      // Remove any existing date prefix (to avoid duplicates)
      promptContent = promptContent.replace(/^IMPORTANT: Today is [^.]+\. Use this as the reference[^\n]*\n\n/i, '');

      // Prepend fresh date
      const finalPrompt = datePrefix + promptContent;

      // Build updated model
      payload.model = {
        provider: currentModel.provider,
        model: currentModel.model,
        temperature: currentModel.temperature,
        messages: [{ role: 'system', content: finalPrompt }],
        tools: currentModel.tools // Preserve existing tools
      };

      // Handle escalation settings - add or update transfer tool
      if (updates.escalationSettings !== undefined) {
        if (updates.escalationSettings?.transfer_enabled && updates.escalationSettings?.transfer_number) {
          // Add transfer tool, keeping other tools
          const nonTransferTools = payload.model.tools.filter(t => t.function?.name !== 'transferCall');
          payload.model.tools = [...nonTransferTools, this._buildTransferCallTool(updates.escalationSettings)];
        } else {
          // Remove only transfer tools, keep booking tools etc.
          payload.model.tools = payload.model.tools.filter(t => t.function?.name !== 'transferCall');
        }
      }

      // If explicit tools array provided, use it
      if (updates.tools) {
        payload.model.tools = updates.tools;
      }
    }

    try {
      const response = await this.client.patch(`/assistant/${assistantId}`, payload);
      return this._mapAssistant(response.data);
    } catch (error) {
      console.error('Vapi update assistant error:', error.response?.data || error.message);
      throw new Error(`Failed to update assistant: ${error.message}`);
    }
  }

  /**
   * Delete a voice assistant
   */
  async deleteAssistant(assistantId) {
    try {
      await this.client.delete(`/assistant/${assistantId}`);
      return true;
    } catch (error) {
      console.error('Vapi delete assistant error:', error.response?.data || error.message);
      throw new Error(`Failed to delete assistant: ${error.message}`);
    }
  }

  /**
   * Get assistant details
   */
  async getAssistant(assistantId) {
    try {
      const response = await this.client.get(`/assistant/${assistantId}`);
      return this._mapAssistant(response.data);
    } catch (error) {
      console.error('Vapi get assistant error:', error.response?.data || error.message);
      throw new Error(`Failed to get assistant: ${error.message}`);
    }
  }

  /**
   * Import a phone number from telephony provider
   *
   * Vapi API requires a credentialId (UUID) for the telephony provider.
   * Create credentials in Vapi dashboard or via API first.
   * Set VAPI_TELNYX_CREDENTIAL_ID in environment.
   */
  async importPhoneNumber(phoneNumber, provider = 'telnyx', options = {}) {
    // Name must be <= 40 characters
    const rawName = options.name || `Number-${phoneNumber.slice(-4)}`;
    const name = rawName.length > 40 ? rawName.slice(0, 40) : rawName;

    const payload = {
      provider,
      number: phoneNumber,
      name,
    };

    // Vapi now requires credentialId (UUID) instead of raw API keys
    if (provider === 'telnyx') {
      const credentialId = options.credentialId || process.env.VAPI_TELNYX_CREDENTIAL_ID;
      if (credentialId) {
        payload.credentialId = credentialId;
      } else {
        console.warn('[Vapi] No VAPI_TELNYX_CREDENTIAL_ID set - import may fail');
      }
    } else if (provider === 'voipcloud' || provider === 'byo-sip-trunk') {
      // VoIPCloud uses custom SIP trunk (byo-sip-trunk in Vapi)
      const credentialId = options.credentialId || process.env.VAPI_VOIPCLOUD_CREDENTIAL_ID;
      if (credentialId) {
        payload.provider = 'byo-sip-trunk';
        payload.credentialId = credentialId;
      } else {
        console.warn('[Vapi] No VAPI_VOIPCLOUD_CREDENTIAL_ID set - import may fail');
      }
    }

    if (options.assistantId) {
      payload.assistantId = options.assistantId;
    }

    try {
      const response = await this.client.post('/phone-number', payload);
      return this._mapPhoneNumber(response.data);
    } catch (error) {
      console.error('Vapi import number error:', error.response?.data || error.message);
      throw new Error(`Failed to import phone number: ${error.message}`);
    }
  }

  /**
   * Delete/release a phone number
   */
  async deletePhoneNumber(phoneNumberId) {
    try {
      await this.client.delete(`/phone-number/${phoneNumberId}`);
      return true;
    } catch (error) {
      console.error('Vapi delete number error:', error.response?.data || error.message);
      throw new Error(`Failed to delete phone number: ${error.message}`);
    }
  }

  /**
   * Assign assistant to phone number
   */
  async assignAssistantToNumber(phoneNumberId, assistantId) {
    try {
      await this.client.patch(`/phone-number/${phoneNumberId}`, {
        assistantId,
      });
      return true;
    } catch (error) {
      console.error('Vapi assign assistant error:', error.response?.data || error.message);
      throw new Error(`Failed to assign assistant: ${error.message}`);
    }
  }

  /**
   * Create an outbound call
   */
  async createCall(callConfig) {
    const {
      phoneNumberId,
      customerNumber,
      assistantId,
      assistant, // Transient assistant config
      metadata = {},
    } = callConfig;

    const payload = {
      phoneNumberId,
      customer: {
        number: customerNumber,
      },
    };

    // Use existing assistant or transient config
    if (assistantId) {
      payload.assistantId = assistantId;
    } else if (assistant) {
      payload.assistant = assistant;
    }

    if (Object.keys(metadata).length > 0) {
      payload.metadata = metadata;
    }

    try {
      const response = await this.client.post('/call/phone', payload);
      return this._mapCall(response.data);
    } catch (error) {
      console.error('Vapi create call error:', error.response?.data || error.message);
      throw new Error(`Failed to create call: ${error.message}`);
    }
  }

  /**
   * Get call status/details
   */
  async getCall(callId) {
    try {
      const response = await this.client.get(`/call/${callId}`);
      return this._mapCall(response.data);
    } catch (error) {
      console.error('Vapi get call error:', error.response?.data || error.message);
      throw new Error(`Failed to get call: ${error.message}`);
    }
  }

  // Helper methods to map API responses to our interface

  _mapAssistant(data) {
    return {
      id: data.id,
      name: data.name,
      model: data.model,
      voice: data.voice,
      firstMessage: data.firstMessage,
      systemPrompt: data.model?.messages?.[0]?.content,
      transcriber: data.transcriber,
      maxDurationSeconds: data.maxDurationSeconds,
    };
  }

  _mapPhoneNumber(data) {
    return {
      id: data.id,
      number: data.number,
      provider: data.provider,
      assistantId: data.assistantId,
      name: data.name,
    };
  }

  _mapCall(data) {
    return {
      id: data.id,
      status: data.status,
      type: data.type,
      duration: data.endedAt && data.startedAt
        ? Math.round((new Date(data.endedAt) - new Date(data.startedAt)) / 1000)
        : null,
      transcript: data.transcript,
      recordingUrl: data.recordingUrl,
      startedAt: data.startedAt,
      endedAt: data.endedAt,
    };
  }

  /**
   * Build transfer call tool configuration for Vapi
   * @param {Object} escalationSettings - User's escalation settings
   * @returns {Object} Transfer call tool configuration
   */
  _buildTransferCallTool(escalationSettings) {
    const {
      transfer_number,
      transfer_method = 'blind_transfer',
      trigger_keywords = [],
      business_hours_only,
      business_hours_start,
      business_hours_end,
      business_days,
      timezone,
      after_hours_action,
      after_hours_message,
      max_failed_attempts,
    } = escalationSettings;

    // Build the tool description based on triggers
    let description = 'Transfer the call to a human agent when the customer requests to speak with a person';

    if (trigger_keywords.length > 0) {
      description += `, or when they mention: ${trigger_keywords.join(', ')}`;
    }

    if (typeof max_failed_attempts === 'number' && max_failed_attempts > 0) {
      description += `. If you cannot successfully help after ${max_failed_attempts} attempts, transfer to a human (when allowed).`;
    }

    if (business_hours_only) {
      const days = Array.isArray(business_days) && business_days.length > 0 ? business_days.join(',') : '1-5';
      const start = business_hours_start || '09:00';
      const end = business_hours_end || '18:00';
      const tz = timezone || 'local time';
      description += ` Transfer is ONLY allowed during business hours (${start}-${end}, days=${days}, timezone=${tz}).`;

      if (after_hours_action) {
        description += ` After hours: ${after_hours_action}.`;
      }
      if (after_hours_action === 'voicemail' && after_hours_message) {
        description += ` Use this after-hours message: "${after_hours_message}".`;
      }
    }

    const tool = {
      type: 'transferCall',
      function: {
        name: 'transferCall',
        description,
        parameters: {
          type: 'object',
          properties: {
            reason: {
              type: 'string',
              description: 'The reason for the transfer',
            },
          },
        },
      },
      destinations: [
        {
          type: 'number',
          number: transfer_number,
          message: this._getTransferMessage(transfer_method),
          transferPlan: {
            mode: transfer_method === 'warm_transfer' ? 'warm-transfer-say-message' : 'blind-transfer',
          },
        },
      ],
    };

    return tool;
  }

  /**
   * Get appropriate transfer message based on method
   */
  _getTransferMessage(method) {
    switch (method) {
      case 'warm_transfer':
        return 'Please hold while I connect you with a team member who can better assist you.';
      case 'blind_transfer':
        return 'I\'m transferring you now. Please hold.';
      case 'callback':
        return 'A team member will call you back shortly.';
      default:
        return 'Transferring you now.';
    }
  }
}

module.exports = { VapiProvider };
