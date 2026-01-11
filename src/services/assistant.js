const { supabaseAdmin } = require('./supabase');
const { getPlanLimits } = require('./stripe');
const { getVoiceProvider } = require('../adapters/voice');
const { getEscalationSettings } = require('./notifications');

/**
 * Default assistant template - customize based on your use case
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
    voiceId: 'Elliot' // Vapi native voice - natural conversational male
  },
  firstMessageMode: 'assistant-speaks-first',
  silenceTimeoutSeconds: 30,
  maxDurationSeconds: 600, // 10 min max call
  backgroundSound: 'office',
  backchannelingEnabled: true,
  backgroundDenoisingEnabled: true
};

/**
 * Voice options by plan tier
 * Using Vapi native voices - valid IDs: Elliot, Kylie, Rohan, Lily, Savannah,
 * Hana, Neha, Cole, Harry, Paige, Spencer, Leah, Tara, Jess, Leo, Dan, Mia, Zac, Zoe
 */
const VOICE_OPTIONS = {
  starter: [
    { id: 'Elliot', provider: 'vapi', name: 'Elliot (Male, Conversational)' },
    { id: 'Jess', provider: 'vapi', name: 'Jess (Female, Conversational)' }
  ],
  growth: [
    { id: 'Elliot', provider: 'vapi', name: 'Elliot (Male, Conversational)' },
    { id: 'Jess', provider: 'vapi', name: 'Jess (Female, Conversational)' },
    { id: 'Cole', provider: 'vapi', name: 'Cole (Male, Professional)' },
    { id: 'Savannah', provider: 'vapi', name: 'Savannah (Female, Friendly)' },
    { id: 'Rohan', provider: 'vapi', name: 'Rohan (Male, Warm)' }
  ],
  scale: [
    { id: 'Elliot', provider: 'vapi', name: 'Elliot (Male, Conversational)' },
    { id: 'Jess', provider: 'vapi', name: 'Jess (Female, Conversational)' },
    { id: 'Cole', provider: 'vapi', name: 'Cole (Male, Professional)' },
    { id: 'Savannah', provider: 'vapi', name: 'Savannah (Female, Friendly)' },
    { id: 'Rohan', provider: 'vapi', name: 'Rohan (Male, Warm)' },
    { id: 'Lily', provider: 'vapi', name: 'Lily (Female, Natural)' }
  ]
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
  console.log(`[Assistant] Using ${voiceProvider.getName()} voice provider`);

  // Build system prompt
  const systemPrompt = buildSystemPrompt({
    businessName,
    businessDescription,
    greetingName
  });

  // Build first message
  const firstMessage = `Hi! This is ${greetingName}${businessName ? ` from ${businessName}` : ''}. How can I help you today?`;

  // Get escalation settings if configured
  let escalationSettings = null;
  try {
    escalationSettings = await getEscalationSettings(userId);
  } catch (err) {
    // No escalation settings yet, that's fine
  }

  // Create assistant in Voice AI provider
  const assistantConfig = {
    ...DEFAULT_ASSISTANT_TEMPLATE,
    name: `Assistant-${userId.slice(0, 8)}`,
    firstMessage,
    systemPrompt,
    // Include escalation settings for transfer call tool
    ...(escalationSettings?.transfer_enabled && { escalationSettings }),
  };

  try {
    const vapiAssistant = await voiceProvider.createAssistant(assistantConfig);

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
function buildSystemPrompt({ businessName, businessDescription, greetingName }) {
  return `You are ${greetingName}, a helpful and friendly AI assistant${businessName ? ` for ${businessName}` : ''}.

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

Remember: You're having a phone conversation, so speak naturally and avoid long monologues.`;
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
 */
function getAvailableVoices(planId) {
  return VOICE_OPTIONS[planId] || VOICE_OPTIONS.starter;
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

module.exports = {
  createAssistantForUser,
  updateAssistant,
  getUserAssistant,
  assignAssistantToNumber,
  syncAssistantToPhoneNumbers,
  deleteAssistant,
  getAvailableVoices,
  buildSystemPrompt,
  syncEscalationToAssistant,
  recreateVapiAssistant,
  VOICE_OPTIONS
};
