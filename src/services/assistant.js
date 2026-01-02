const { supabaseAdmin } = require('./supabase');
const { getPlanLimits } = require('./stripe');
const { getVoiceProvider } = require('../adapters/voice');

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
    provider: 'playht',
    voiceId: 'jennifer' // Natural female voice
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
 */
const VOICE_OPTIONS = {
  starter: [
    { id: 'jennifer', provider: 'playht', name: 'Jennifer (Female)' },
    { id: 'michael', provider: 'playht', name: 'Michael (Male)' }
  ],
  growth: [
    { id: 'jennifer', provider: 'playht', name: 'Jennifer (Female)' },
    { id: 'michael', provider: 'playht', name: 'Michael (Male)' },
    { id: 'emma', provider: 'playht', name: 'Emma (Female, British)' },
    { id: 'james', provider: 'playht', name: 'James (Male, British)' },
    { id: 'custom', provider: 'playht', name: 'Custom Voice Clone' }
  ],
  scale: [
    { id: 'jennifer', provider: 'playht', name: 'Jennifer (Female)' },
    { id: 'michael', provider: 'playht', name: 'Michael (Male)' },
    { id: 'emma', provider: 'playht', name: 'Emma (Female, British)' },
    { id: 'james', provider: 'playht', name: 'James (Male, British)' },
    { id: 'custom', provider: 'playht', name: 'Custom Voice Clone' },
    { id: 'elevenlabs-custom', provider: 'elevenlabs', name: 'ElevenLabs Custom' }
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

  // Create assistant in Voice AI provider
  const assistantConfig = {
    ...DEFAULT_ASSISTANT_TEMPLATE,
    name: `Assistant-${userId.slice(0, 8)}`,
    firstMessage,
    systemPrompt
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

module.exports = {
  createAssistantForUser,
  updateAssistant,
  getUserAssistant,
  assignAssistantToNumber,
  deleteAssistant,
  getAvailableVoices,
  buildSystemPrompt,
  VOICE_OPTIONS
};
