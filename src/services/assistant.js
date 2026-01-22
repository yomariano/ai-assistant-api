const { supabaseAdmin } = require('./supabase');
const { getPlanLimits } = require('./stripe');
const { getVoiceProvider } = require('../adapters/voice');
const { getEscalationSettings } = require('./notifications');
const vapiTools = require('./vapiTools');
const providerService = require('./providers');

/**
 * Check if an ID is a valid UUID (real Vapi ID)
 * Mock IDs look like: asst_1737578000000_1000, mock_xxx, etc.
 * Real Vapi IDs are UUIDs: a1b2c3d4-e5f6-7890-abcd-ef1234567890
 */
function isValidVapiId(id) {
  if (!id || typeof id !== 'string') return false;
  // UUID v4 regex pattern
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Vapi native voices - high quality, low latency
 */
const VAPI_VOICES = [
  { id: 'Savannah', provider: 'vapi', name: 'Savannah', gender: 'female', accent: 'american', description: 'friendly' },
  { id: 'Rohan', provider: 'vapi', name: 'Rohan', gender: 'male', accent: 'american', description: 'warm' },
  { id: 'Lily', provider: 'vapi', name: 'Lily', gender: 'female', accent: 'british', description: 'natural' },
  { id: 'Elliot', provider: 'vapi', name: 'Elliot', gender: 'male', accent: 'american', description: 'conversational' },
  { id: 'Cole', provider: 'vapi', name: 'Cole', gender: 'male', accent: 'american', description: 'professional' },
  { id: 'Paige', provider: 'vapi', name: 'Paige', gender: 'female', accent: 'american', description: 'clear' },
];

/**
 * Default assistant template - customize based on your use case
 * Using Vapi native voices for low latency and high quality
 */
const DEFAULT_ASSISTANT_TEMPLATE = {
  transcriber: {
    provider: 'deepgram',
    model: 'nova-2',
    language: 'en'
  },
  model: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.7,
    maxTokens: 500
  },
  voice: {
    provider: 'vapi',
    voiceId: 'Savannah' // Savannah - friendly female voice
  },
  firstMessageMode: 'assistant-speaks-first',
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600, // 10 min max call
  backgroundSound: 'office',
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: true
};

/**
 * Get available Vapi voices
 */
function getVapiVoices() {
  return VAPI_VOICES;
}

/**
 * Voice limits by plan tier
 * All plans get Vapi native voices (6 total available)
 */
const VOICE_LIMITS = {
  starter: 3,    // 3 voices
  pro: 4,        // 4 voices
  business: 6,   // All 6 voices
  agency: 6      // All voices
};

/**
 * Create a new Vapi assistant for a user
 */
async function createAssistantForUser(userId, options = {}) {
  const {
    businessName = 'our company',
    businessDescription = '',
    greetingName = 'your AI assistant',
    planId = 'starter'
  } = options;

  // Get voice provider (automatically selects mock/real based on environment)
  const voiceProvider = getVoiceProvider();
  const providerName = voiceProvider.getName();
  console.log(`[Assistant] Using ${providerName} voice provider`);

  // CRITICAL: Prevent mock provider from being used in production
  // This ensures we never store mock IDs in the production database
  const isProduction = process.env.NODE_ENV === 'production';
  const isMockProvider = providerName === 'vapi-mock' || providerName === 'mock';

  if (isProduction && isMockProvider) {
    console.error('[Assistant] CRITICAL: Mock provider detected in production! This should not happen.');
    console.error('[Assistant] Check environment: VOICE_PROVIDER, DEV_MODE, NODE_ENV, VAPI_API_KEY');
    throw new Error('Cannot create assistant: Mock provider is not allowed in production. Check server configuration.');
  }

  // Get escalation settings if configured
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // No escalation settings yet, that's fine
  }

  // Check for connected booking providers and get booking tools
  let bookingTools = [];
  let hasBookingProvider = false;
  try {
    const connections = await providerService.getConnections(userId);
    hasBookingProvider = connections.some(c => c.status === 'connected');
    if (hasBookingProvider) {
      // Get server URL from environment for tool callbacks
      const serverUrl = process.env.VAPI_SERVER_URL || process.env.API_BASE_URL || 'https://dev.voicefleet.ai';
      bookingTools = vapiTools.getBookingToolDefinitions(serverUrl);
      console.log(`[Assistant] User has connected booking provider, adding ${bookingTools.length} booking tools`);
    }
  } catch (err) {
    console.log('[Assistant] No booking providers connected, skipping booking tools');
  }

  // Build system prompt with booking capabilities if provider is connected
  const systemPrompt = buildSystemPrompt({
    businessName,
    businessDescription,
    greetingName,
    escalationSettings,
    hasBookingProvider
  });

  // Build first message
  const firstMessage = `Hi! This is ${greetingName}${businessName ? ` from ${businessName}` : ''}. How can I help you today?`;

  // Create assistant in Voice AI provider
  const assistantConfig = {
    ...DEFAULT_ASSISTANT_TEMPLATE,
    name: `Assistant-${userId.slice(0, 8)}`,
    firstMessage,
    systemPrompt,
    // Include booking tools if provider is connected
    ...(bookingTools.length > 0 && { tools: bookingTools }),
    // Include escalation settings for transfer call tool
    ...(escalationSettings?.transfer_enabled && { escalationSettings }),
  };

  try {
    const vapiAssistant = await voiceProvider.createAssistant(assistantConfig);

    // Validate the returned assistant ID is a valid UUID (not a mock ID)
    // This is a safety check to prevent mock IDs from being stored
    if (!isValidVapiId(vapiAssistant.id)) {
      console.error(`[Assistant] Invalid assistant ID returned: ${vapiAssistant.id}`);
      console.error('[Assistant] This appears to be a mock ID. Check VOICE_PROVIDER and VAPI_API_KEY settings.');
      throw new Error(`Invalid assistant ID returned from provider: ${vapiAssistant.id}. Check server configuration.`);
    }

    // Determine features based on plan
    const planLimits = getPlanLimits(planId);
    const voiceCloning = ['growth', 'scale'].includes(planId);
    const customKnowledge = ['scale'].includes(planId);

    // Save to database
    const { data: assistant, error } = await supabaseAdmin
      .from('user_assistants')
      .insert({
        user_id: userId,
        vapi_assistant_id: vapiAssistant.id,
        name: greetingName,
        first_message: firstMessage,
        system_prompt: systemPrompt,
        voice_id: DEFAULT_ASSISTANT_TEMPLATE.voice.voiceId,
        voice_provider: DEFAULT_ASSISTANT_TEMPLATE.voice.provider,
        business_name: businessName,
        business_description: businessDescription,
        greeting_name: greetingName,
        voice_cloning_enabled: voiceCloning,
        custom_knowledge_base: customKnowledge,
        last_synced_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    console.log(`[Assistant] Created assistant ${vapiAssistant.id} for user ${userId}`);

    return {
      dbAssistant: assistant,
      vapiAssistant
    };
  } catch (error) {
    console.error('[Assistant] Failed to create assistant:', error.message);
    throw error;
  }
}

/**
 * Build system prompt for the assistant
 */
function buildSystemPrompt({ businessName, businessDescription, greetingName, escalationSettings, hasBookingProvider }) {
  // Always include current date so the AI knows what day it is
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const bookingBlock = hasBookingProvider ? `

Booking Capabilities:
- You can check availability and book appointments for customers
- When a customer wants to book, use the check_availability tool to see available times
- Always confirm the date, time, and customer name before creating a booking
- After booking, provide the confirmation number to the customer
- You can also help customers look up, modify, or cancel existing bookings` : '';

  const escalationBlock = (() => {
    if (!escalationSettings) return '';

    const isTransferEnabled = Boolean(escalationSettings.transfer_enabled);
    const hasTransferNumber = Boolean(escalationSettings.transfer_number);

    if (!isTransferEnabled || !hasTransferNumber) {
      return `

Escalation policy:
- Call transfers are currently disabled. If someone asks to speak with a person, politely offer to take a message.`;
    }

    const tz = escalationSettings.timezone || 'the business timezone';
    const start = escalationSettings.business_hours_start || '09:00';
    const end = escalationSettings.business_hours_end || '18:00';
    const days = Array.isArray(escalationSettings.business_days) ? escalationSettings.business_days.join(',') : '1-5';
    const afterHoursAction = escalationSettings.after_hours_action || 'voicemail';
    const afterHoursMessage = escalationSettings.after_hours_message;
    const maxFailedAttempts = typeof escalationSettings.max_failed_attempts === 'number'
      ? escalationSettings.max_failed_attempts
      : null;

    return `

Escalation policy:
- If the caller asks for a human, you may use the "transferCall" tool to transfer the call.
- If you are repeatedly failing to help (confusion, missing info, repeated corrections), escalate to a human.
${maxFailedAttempts ? `- If you cannot help after ${maxFailedAttempts} attempts, escalate (when allowed).` : ''}
- Transfer is only allowed during business hours (${start}-${end}, days=${days}, timezone=${tz}).
- After hours, do NOT transfer. Instead follow this after-hours behavior: ${afterHoursAction}.
${afterHoursAction === 'voicemail' && afterHoursMessage ? `- Use this exact after-hours message when appropriate: "${afterHoursMessage}"` : ''}
${afterHoursAction === 'sms_alert' ? `- Tell the caller you will notify the owner/team and continue to assist while they wait.` : ''}
${afterHoursAction === 'callback_promise' ? `- Collect name, phone number, and reason for calling, then promise a callback.` : ''}`;
  })();

  return `You are ${greetingName}, a helpful and friendly AI assistant${businessName ? ` for ${businessName}` : ''}.

IMPORTANT: Today is ${currentDate}. Always use this as the reference for "today", "tomorrow", "next week", etc.

${businessDescription ? `About the business: ${businessDescription}` : ''}

Your role is to:
- Answer questions helpfully and professionally
- Assist with scheduling and appointments when asked
- Take messages when appropriate
- Be conversational but efficient

Guidelines:
- Keep responses concise (1-2 sentences when possible)
- Be warm and professional
- If you don't know something, say so honestly
- Always confirm important details back to the caller

SPEECH RULES (Critical for natural phone conversation):
- DATES: Always say dates naturally like "Thursday, January twenty-second" or "the twenty-second of January", NEVER as numbers like "22-01-2026" or "01/22/2026"
- TIMES: Say "five PM" or "five o'clock in the afternoon", NEVER "17:00" or "1700 hours"
- PHONE NUMBERS: Say each digit clearly with pauses, like "three five three, eight five one, two three four five"
- PRICES: Say "twenty-five euros" or "twenty-five dollars and fifty cents", not "€25" or "$25.50"
- CONFIRMATIONS: Say "B as in Bravo, C as in Charlie" when spelling reference numbers
- ADDRESSES: Read street numbers digit by digit if long (e.g., "one two three four Main Street")

Remember: You're having a phone conversation, so speak naturally and avoid long monologues.${bookingBlock}${escalationBlock}`;
}

/**
 * Update an existing assistant
 */
async function updateAssistant(userId, updates) {
  // Get current assistant
  const { data: assistant, error: fetchError } = await supabaseAdmin
    .from('user_assistants')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError || !assistant) {
    throw new Error('Assistant not found');
  }

  // Check if the stored vapi_assistant_id is valid (not a mock ID)
  // If invalid, recreate the assistant with a real Vapi ID first
  if (!isValidVapiId(assistant.vapi_assistant_id)) {
    console.log(`[Assistant] Invalid/mock vapi_assistant_id detected: ${assistant.vapi_assistant_id}`);
    console.log('[Assistant] Auto-recreating assistant with real Vapi provider...');

    try {
      // Recreate will create a new real Vapi assistant and update the database
      const recreated = await recreateVapiAssistant(userId);
      // Update our local reference to use the new ID
      assistant.vapi_assistant_id = recreated.vapiAssistant.id;
      console.log(`[Assistant] Successfully recreated with real Vapi ID: ${assistant.vapi_assistant_id}`);
    } catch (recreateError) {
      console.error('[Assistant] Failed to auto-recreate assistant:', recreateError.message);
      throw new Error(`Assistant has invalid ID and could not be recreated: ${recreateError.message}`);
    }
  }

  // Get voice provider
  const voiceProvider = getVoiceProvider();

  // Build update payload
  const vapiUpdates = {};

  if (updates.firstMessage) {
    vapiUpdates.firstMessage = updates.firstMessage;
  }

  if (updates.systemPrompt) {
    vapiUpdates.systemPrompt = updates.systemPrompt;
  }

  if (updates.voiceId && updates.voiceProvider) {
    vapiUpdates.voice = {
      provider: updates.voiceProvider,
      voiceId: updates.voiceId
    };
  }

  // Include escalation settings if syncing is requested
  if (updates.syncEscalation) {
    try {
      const escalationSettings = await getEscalationSettings(userId);
      if (escalationSettings?.transfer_enabled) {
        vapiUpdates.escalationSettings = escalationSettings;
      }
    } catch (err) {
      // No escalation settings, skip
    }
  }

  // Update in Voice AI provider if there are changes
  if (Object.keys(vapiUpdates).length > 0) {
    try {
      await voiceProvider.updateAssistant(assistant.vapi_assistant_id, vapiUpdates);
    } catch (error) {
      console.error('[Assistant] Failed to update assistant:', error.message);
      throw error;
    }
  }

  // Update in database
  const dbUpdates = {
    updated_at: new Date().toISOString(),
    last_synced_at: new Date().toISOString()
  };

  if (updates.name) dbUpdates.name = updates.name;
  if (updates.firstMessage) dbUpdates.first_message = updates.firstMessage;
  if (updates.systemPrompt) dbUpdates.system_prompt = updates.systemPrompt;
  if (updates.voiceId) dbUpdates.voice_id = updates.voiceId;
  if (updates.voiceProvider) dbUpdates.voice_provider = updates.voiceProvider;
  if (updates.businessName) dbUpdates.business_name = updates.businessName;
  if (updates.businessDescription) dbUpdates.business_description = updates.businessDescription;
  if (updates.greetingName) dbUpdates.greeting_name = updates.greetingName;

  const { data: updatedAssistant, error } = await supabaseAdmin
    .from('user_assistants')
    .update(dbUpdates)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) throw error;

  // Sync assistant to all phone numbers in VAPI
  // This ensures phone numbers always point to the user's configured assistant
  try {
    const syncResult = await syncAssistantToPhoneNumbers(userId);
    console.log(`[Assistant] Post-update phone sync: ${syncResult.synced} numbers synced`);
  } catch (syncError) {
    // Log but don't fail the update if sync fails
    console.error('[Assistant] Post-update phone sync failed:', syncError.message);
  }

  return updatedAssistant;
}

/**
 * Get user's assistant
 */
async function getUserAssistant(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_assistants')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Assign assistant to a phone number in Voice AI provider
 */
async function assignAssistantToNumber(vapiPhoneNumberId, vapiAssistantId) {
  const voiceProvider = getVoiceProvider();

  try {
    await voiceProvider.assignAssistantToNumber(vapiPhoneNumberId, vapiAssistantId);
    console.log(`[Assistant] Assigned assistant ${vapiAssistantId} to number ${vapiPhoneNumberId}`);
    return true;
  } catch (error) {
    console.error('[Assistant] Failed to assign assistant to number:', error.message);
    throw error;
  }
}

/**
 * Sync assistant to all user's phone numbers in VAPI
 * This ensures all phone numbers point to the user's configured assistant
 */
async function syncAssistantToPhoneNumbers(userId) {
  const voiceProvider = getVoiceProvider();

  // Get user's assistant
  const { data: assistant, error: assistantError } = await supabaseAdmin
    .from('user_assistants')
    .select('vapi_assistant_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();

  if (assistantError || !assistant?.vapi_assistant_id) {
    console.log(`[Assistant] No active assistant found for user ${userId}, skipping phone sync`);
    return { synced: 0, errors: [] };
  }

  // Get user's phone numbers (both regular and pool numbers)
  const { data: phoneNumbers, error: phoneError } = await supabaseAdmin
    .from('user_phone_numbers')
    .select('id, phone_number, vapi_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (phoneError) {
    console.error('[Assistant] Failed to fetch phone numbers:', phoneError.message);
    throw phoneError;
  }

  if (!phoneNumbers || phoneNumbers.length === 0) {
    console.log(`[Assistant] No phone numbers found for user ${userId}`);
    return { synced: 0, errors: [] };
  }

  const results = { synced: 0, errors: [] };

  for (const phone of phoneNumbers) {
    if (!phone.vapi_id) {
      console.log(`[Assistant] Phone ${phone.phone_number} has no VAPI ID, skipping`);
      results.errors.push({ phone: phone.phone_number, error: 'No VAPI ID' });
      continue;
    }

    try {
      await voiceProvider.assignAssistantToNumber(phone.vapi_id, assistant.vapi_assistant_id);
      console.log(`[Assistant] Synced assistant to phone ${phone.phone_number} (${phone.vapi_id})`);
      results.synced++;

      // Update the assistant_id foreign key in user_phone_numbers if needed
      const { data: assistantRecord } = await supabaseAdmin
        .from('user_assistants')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      if (assistantRecord) {
        await supabaseAdmin
          .from('user_phone_numbers')
          .update({ assistant_id: assistantRecord.id })
          .eq('id', phone.id);
      }
    } catch (error) {
      console.error(`[Assistant] Failed to sync assistant to phone ${phone.phone_number}:`, error.message);
      results.errors.push({ phone: phone.phone_number, error: error.message });
    }
  }

  console.log(`[Assistant] Phone sync completed for user ${userId}: ${results.synced} synced, ${results.errors.length} errors`);
  return results;
}

/**
 * Delete assistant (when user cancels)
 */
async function deleteAssistant(userId) {
  const voiceProvider = getVoiceProvider();

  const { data: assistant } = await supabaseAdmin
    .from('user_assistants')
    .select('vapi_assistant_id')
    .eq('user_id', userId)
    .single();

  if (assistant?.vapi_assistant_id) {
    try {
      await voiceProvider.deleteAssistant(assistant.vapi_assistant_id);
    } catch (error) {
      console.error('[Assistant] Failed to delete assistant:', error.message);
    }
  }

  // Update database
  await supabaseAdmin
    .from('user_assistants')
    .update({
      status: 'deleted',
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);
}

/**
 * Get available voices for a plan
 * Returns Vapi native voices limited by plan tier
 */
function getAvailableVoices(planId) {
  const allVoices = getVapiVoices();
  const limit = VOICE_LIMITS[planId] || VOICE_LIMITS.starter;
  return allVoices.slice(0, limit);
}

/**
 * Recreate the VAPI assistant with current settings
 * Useful when switching from mock to real provider
 */
async function recreateVapiAssistant(userId) {
  // Get current assistant from database
  const { data: assistant, error: fetchError } = await supabaseAdmin
    .from('user_assistants')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (fetchError || !assistant) {
    throw new Error('Assistant not found');
  }

  // Get voice provider (will use real VAPI if configured correctly)
  const voiceProvider = getVoiceProvider();
  console.log(`[Assistant] Recreating assistant using ${voiceProvider.getName()} provider`);

  // Get escalation settings if configured
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // No escalation settings, that's fine
  }

  // Check for connected booking providers and get booking tools
  let bookingTools = [];
  try {
    const connections = await providerService.getConnections(userId);
    const hasBookingProvider = connections.some(c => c.status === 'connected');
    if (hasBookingProvider) {
      const serverUrl = process.env.VAPI_SERVER_URL || process.env.API_BASE_URL || 'https://dev.voicefleet.ai';
      bookingTools = vapiTools.getBookingToolDefinitions(serverUrl);
      console.log(`[Assistant] Recreating with ${bookingTools.length} booking tools`);
    }
  } catch (err) {
    console.log('[Assistant] No booking providers for recreation, skipping booking tools');
  }

  // Check if the stored voice is valid (not old playht)
  const storedVoiceProvider = assistant.voice_provider;
  const storedVoiceId = assistant.voice_id;
  const isValidVoice = storedVoiceProvider === 'vapi' && storedVoiceId;

  // Build assistant config from current database values
  const assistantConfig = {
    ...DEFAULT_ASSISTANT_TEMPLATE,
    name: `Assistant-${userId.slice(0, 8)}`,
    firstMessage: assistant.first_message,
    systemPrompt: assistant.system_prompt,
    // Use stored voice if valid, otherwise use default
    voice: isValidVoice ? {
      provider: storedVoiceProvider,
      voiceId: storedVoiceId
    } : DEFAULT_ASSISTANT_TEMPLATE.voice,
    // Include booking tools if provider is connected
    ...(bookingTools.length > 0 && { tools: bookingTools }),
    ...(escalationSettings?.transfer_enabled && { escalationSettings }),
  };

  try {
    // Create new assistant in VAPI
    const vapiAssistant = await voiceProvider.createAssistant(assistantConfig);
    console.log(`[Assistant] Created new VAPI assistant: ${vapiAssistant.id}`);

    // Update database with new VAPI ID and voice settings
    const { data: updatedAssistant, error } = await supabaseAdmin
      .from('user_assistants')
      .update({
        vapi_assistant_id: vapiAssistant.id,
        voice_provider: assistantConfig.voice.provider,
        voice_id: assistantConfig.voice.voiceId,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Sync the new assistant to all phone numbers
    // This is critical because the assistant has a new VAPI ID
    try {
      const syncResult = await syncAssistantToPhoneNumbers(userId);
      console.log(`[Assistant] Post-recreate phone sync: ${syncResult.synced} numbers synced`);
    } catch (syncError) {
      console.error('[Assistant] Post-recreate phone sync failed:', syncError.message);
      // Don't fail the recreation, but log the error
    }

    return {
      dbAssistant: updatedAssistant,
      vapiAssistant
    };
  } catch (error) {
    console.error('[Assistant] Failed to recreate VAPI assistant:', error.message);
    throw error;
  }
}

/**
 * Sync escalation settings to the Vapi assistant
 * Call this when escalation settings are updated
 */
async function syncEscalationToAssistant(userId) {
  // Get assistant
  const { data: assistant } = await supabaseAdmin
    .from('user_assistants')
    .select('vapi_assistant_id')
    .eq('user_id', userId)
    .single();

  if (!assistant?.vapi_assistant_id) {
    console.log(`[Assistant] No assistant found for user ${userId}, skipping escalation sync`);
    return;
  }

  // Get escalation settings
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // No settings, nothing to sync
    return;
  }

  const voiceProvider = getVoiceProvider();

  // Update the assistant with escalation settings
  try {
    await voiceProvider.updateAssistant(assistant.vapi_assistant_id, {
      escalationSettings: escalationSettings?.transfer_enabled ? escalationSettings : null,
    });
    console.log(`[Assistant] Synced escalation settings for user ${userId}`);
  } catch (error) {
    console.error('[Assistant] Failed to sync escalation settings:', error.message);
    throw error;
  }
}

/**
 * Sync booking tools to the assistant when provider connections change
 * Call this when a booking provider is connected or disconnected
 */
async function syncBookingToolsToAssistant(userId) {
  // Get assistant
  const { data: assistant } = await supabaseAdmin
    .from('user_assistants')
    .select('vapi_assistant_id, system_prompt, business_name, business_description, greeting_name')
    .eq('user_id', userId)
    .single();

  if (!assistant?.vapi_assistant_id) {
    console.log(`[Assistant] No assistant found for user ${userId}, skipping booking tools sync`);
    return;
  }

  // Check for connected booking providers
  let bookingTools = [];
  let hasBookingProvider = false;
  try {
    const connections = await providerService.getConnections(userId);
    hasBookingProvider = connections.some(c => c.status === 'connected');
    if (hasBookingProvider) {
      const serverUrl = process.env.VAPI_SERVER_URL || process.env.API_BASE_URL || 'https://dev.voicefleet.ai';
      bookingTools = vapiTools.getBookingToolDefinitions(serverUrl);
    }
  } catch (err) {
    // No connections, use empty tools
  }

  // Get escalation settings
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // No settings
  }

  // Rebuild system prompt with updated booking capabilities
  const newSystemPrompt = buildSystemPrompt({
    businessName: assistant.business_name || 'our company',
    businessDescription: assistant.business_description || '',
    greetingName: assistant.greeting_name || 'your AI assistant',
    escalationSettings,
    hasBookingProvider
  });

  const voiceProvider = getVoiceProvider();

  try {
    // Update assistant with new tools and system prompt
    await voiceProvider.updateAssistant(assistant.vapi_assistant_id, {
      systemPrompt: newSystemPrompt,
      tools: bookingTools, // Will be empty if no provider connected
    });

    // Update system prompt in database
    await supabaseAdmin
      .from('user_assistants')
      .update({
        system_prompt: newSystemPrompt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    console.log(`[Assistant] Synced booking tools for user ${userId}: ${bookingTools.length} tools`);
  } catch (error) {
    console.error('[Assistant] Failed to sync booking tools:', error.message);
    throw error;
  }
}

module.exports = {
  createAssistantForUser,
  updateAssistant,
  getUserAssistant,
  assignAssistantToNumber,
  syncAssistantToPhoneNumbers,
  deleteAssistant,
  getAvailableVoices,
  getVapiVoices,
  buildSystemPrompt,
  syncEscalationToAssistant,
  syncBookingToolsToAssistant,
  recreateVapiAssistant,
  isValidVapiId,
  VOICE_LIMITS,
  VAPI_VOICES
};
