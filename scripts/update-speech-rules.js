require('dotenv').config();
const axios = require('axios');

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const vapiAssistantId = '43c61368-19fa-47a2-b663-550477f20b40';

async function update() {
  // Get current assistant config
  const response = await axios.get(
    `https://api.vapi.ai/assistant/${vapiAssistantId}`,
    { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }
  );

  const assistant = response.data;
  let currentPrompt = assistant.model?.messages?.[0]?.content || '';

  // Remove old date prefixes (there might be multiple)
  currentPrompt = currentPrompt.replace(/^IMPORTANT: Today is [^\n]+\.[^\n]*\n+(?:SPEECH RULES:[^\n]+\n+)?/gi, '');
  // Also remove any embedded date lines in the middle of the prompt
  currentPrompt = currentPrompt.replace(/\n+IMPORTANT: Today is [^\n]+\.[^\n]*\n+/gi, '\n\n');

  // Add new date prefix with speech rules
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

  const newPrompt = datePrefix + currentPrompt;

  // Update assistant
  const updatedModel = {
    provider: assistant.model?.provider || 'openai',
    model: assistant.model?.model || 'gpt-4o-mini',
    temperature: assistant.model?.temperature ?? 0.7,
    messages: [{ role: 'system', content: newPrompt }],
    tools: assistant.model?.tools || []
  };

  await axios.patch(
    `https://api.vapi.ai/assistant/${vapiAssistantId}`,
    { model: updatedModel },
    { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } }
  );

  console.log('VAPI assistant updated with speech rules!');
  console.log('\nNew prompt preview:');
  console.log(newPrompt.slice(0, 600) + '...');
}

update().catch(console.error);
