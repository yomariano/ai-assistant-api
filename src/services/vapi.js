const axios = require('axios');
const { getVoiceProvider } = require('../adapters/voice');

const VAPI_API_URL = 'https://api.vapi.ai';

// Only create real client if not in E2E mode
let vapiClient = null;
if (process.env.E2E_MODE !== 'true') {
  vapiClient = axios.create({
    baseURL: VAPI_API_URL,
    headers: {
      'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
}

/**
 * Create a phone call using VAPI with transient assistant
 */
async function createCall({ phoneNumber, message, language, userProfile }) {
  const userName = userProfile?.fullName || 'the user';
  
  // Voice configuration
  const voiceProvider = process.env.VOICE_PROVIDER || '11labs';
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'josh';
  
  // Model configuration
  const modelProvider = process.env.MODEL_PROVIDER || 'openai';
  const modelName = process.env.MODEL_NAME || 'gpt-4';
  
  // Transcriber configuration
  const transcriberProvider = process.env.TRANSCRIBER_PROVIDER || 'deepgram';
  const transcriberLanguage = language || process.env.TRANSCRIBER_LANGUAGE || 'en';
  
  // Call settings
  const maxDurationSeconds = parseInt(process.env.MAX_DURATION_SECONDS) || 600;
  const firstMessageMode = process.env.FIRST_MESSAGE_MODE || 'assistant-speaks-first';

  // Build the system prompt
  let systemPrompt;
  let firstMessage;

  if (userProfile && userProfile.fullName) {
    const dobInfo = userProfile.dateOfBirth ? `- Date of Birth: ${userProfile.dateOfBirth}
` : '';
    const addressInfo = userProfile.address ? `- Address: ${userProfile.address}
` : '';
    
    systemPrompt = `You ARE ${userName}. You are making this phone call yourself.
Never say you are an AI, assistant, or calling on behalf of anyone.
Speak naturally as if you are ${userName} making a personal call.

Your personal information (use naturally if relevant):
- Name: ${userProfile.fullName}
${dobInfo}${addressInfo}
Your task for this call: ${message}

Guidelines:
- Be natural and conversational
- If asked who you are, say "This is ${userName}"
- Complete the task efficiently but politely
- If the call cannot be completed, politely end and explain why`;

    firstMessage = `Hi, this is ${userName}. ${getFirstMessageForIntent(message)}`;
  } else {
    systemPrompt = `You are a helpful voice assistant making a phone call.
Your task: ${message}
Be polite, professional, and efficient.`;
    firstMessage = `Hello, ${getFirstMessageForIntent(message)}`;
  }

  // Build voice configuration based on provider
  let voiceConfig;
  switch (voiceProvider) {
    case '11labs':
      voiceConfig = { provider: '11labs', voiceId: voiceId };
      break;
    case 'cartesia':
      voiceConfig = { provider: 'cartesia', voiceId: voiceId };
      break;
    case 'playht':
      voiceConfig = { provider: 'playht', voiceId: voiceId };
      break;
    case 'azure':
      voiceConfig = { provider: 'azure', voiceId: voiceId };
      break;
    case 'deepgram':
      voiceConfig = { provider: 'deepgram', voiceId: voiceId };
      break;
    case 'openai':
      voiceConfig = { provider: 'openai', voiceId: voiceId || 'alloy' };
      break;
    default:
      voiceConfig = { provider: '11labs', voiceId: voiceId };
  }

  // Use transient assistant (no assistantId needed)
  const payload = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: phoneNumber
    },
    assistant: {
      firstMessageMode: firstMessageMode,
      model: {
        provider: modelProvider,
        model: modelName,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          }
        ]
      },
      voice: voiceConfig,
      firstMessage: firstMessage,
      transcriber: {
        provider: transcriberProvider,
        language: transcriberLanguage
      },
      maxDurationSeconds: maxDurationSeconds
    }
  };

  try {
    // Use mock provider in E2E mode
    if (process.env.E2E_MODE === 'true') {
      const provider = getVoiceProvider();
      return await provider.createCall({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        customerNumber: phoneNumber,
        assistantId: null
      });
    }

    const response = await vapiClient.post('/call/phone', payload);
    return response.data;
  } catch (error) {
    console.error('VAPI Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Failed to create call');
  }
}

/**
 * Get call status from VAPI
 */
async function getCallStatus(callId) {
  try {
    // Use mock provider in E2E mode
    if (process.env.E2E_MODE === 'true') {
      const provider = getVoiceProvider();
      return await provider.getCall(callId);
    }

    const response = await vapiClient.get(`/call/${callId}`);
    return response.data;
  } catch (error) {
    console.error('VAPI Error:', error.response?.data || error.message);
    throw new Error('Failed to get call status');
  }
}

/**
 * Helper to generate first message based on intent
 */
function getFirstMessageForIntent(message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('appointment') || lowerMessage.includes('schedule')) {
    return "I'm calling to schedule an appointment.";
  } else if (lowerMessage.includes('cancel')) {
    return "I'm calling to cancel my appointment.";
  } else if (lowerMessage.includes('reschedule')) {
    return "I'm calling to reschedule my appointment.";
  } else if (lowerMessage.includes('question') || lowerMessage.includes('ask')) {
    return "I'm calling because I have a question.";
  } else if (lowerMessage.includes('order') || lowerMessage.includes('delivery')) {
    return "I'm calling about an order.";
  } else if (lowerMessage.includes('reservation')) {
    return "I'm calling to make a reservation.";
  }

  return "I'm calling regarding a quick matter.";
}

module.exports = {
  createCall,
  getCallStatus
};
