require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';

async function verifyAndUpdate() {
  console.log('=== Verifying Phone and Assistant Setup ===\n');

  // 1. Get the phone number assigned to this user
  const { data: phoneData, error: phoneError } = await supabase
    .from('phone_number_pool')
    .select('*')
    .eq('assigned_to', userId)
    .single();

  if (phoneError || !phoneData) {
    console.log('ERROR: No phone number found for user');
    return;
  }

  console.log('Phone Number:', phoneData.number);
  console.log('VAPI Phone ID:', phoneData.vapi_phone_id);
  console.log('DB VAPI Assistant ID:', phoneData.vapi_assistant_id || 'NOT SET');

  let vapiAssistantId = phoneData.vapi_assistant_id;

  // 2. Check VAPI phone configuration
  if (phoneData.vapi_phone_id) {
    console.log('\n--- VAPI Phone Config ---');
    try {
      const phoneResponse = await axios.get(
        `https://api.vapi.ai/phone-number/${phoneData.vapi_phone_id}`,
        { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }
      );
      console.log('Provider:', phoneResponse.data.provider);
      console.log('Number:', phoneResponse.data.number);
      console.log('VAPI Assistant ID:', phoneResponse.data.assistantId);
      console.log('Server URL:', phoneResponse.data.serverUrl || 'Not set');

      // Use the assistant ID from VAPI if not in DB
      if (!vapiAssistantId && phoneResponse.data.assistantId) {
        vapiAssistantId = phoneResponse.data.assistantId;
        console.log('\n>> Using assistant ID from VAPI phone config');

        // Update the database record
        const { error: updateError } = await supabase
          .from('phone_number_pool')
          .update({ vapi_assistant_id: vapiAssistantId })
          .eq('id', phoneData.id);

        if (updateError) {
          console.log('Warning: Could not update DB:', updateError.message);
        } else {
          console.log('>> Updated DB with assistant ID');
        }
      }
    } catch (e) {
      console.log('ERROR getting VAPI phone:', e.response?.data || e.message);
    }
  }

  // 3. Check and update VAPI assistant
  if (vapiAssistantId) {
    console.log('\n--- VAPI Assistant Config ---');
    try {
      const assistantResponse = await axios.get(
        `https://api.vapi.ai/assistant/${vapiAssistantId}`,
        { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }
      );
      const assistant = assistantResponse.data;
      console.log('Name:', assistant.name);
      console.log('Model Provider:', assistant.model?.provider);
      console.log('Model:', assistant.model?.model);
      console.log('Tools count:', assistant.model?.tools?.length || 0);

      if (assistant.model?.tools?.length > 0) {
        console.log('Tools:', assistant.model.tools.map(t => t.function?.name || t.type).join(', '));
      }

      // Check system prompt for date
      const systemPrompt = assistant.model?.messages?.[0]?.content || '';
      const hasDatePrefix = systemPrompt.includes('IMPORTANT: Today is');
      console.log('\nSystem Prompt has date:', hasDatePrefix);
      console.log('System Prompt preview:', systemPrompt.slice(0, 300) + '...');

      // 4. If no date prefix, trigger an update to inject it
      if (!hasDatePrefix) {
        console.log('\n--- Injecting Current Date ---');

        const now = new Date();
        const currentDate = now.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        const datePrefix = `IMPORTANT: Today is ${currentDate}. Use this as the reference for "today", "tomorrow", "next week", etc.\n\n`;

        const newPrompt = datePrefix + systemPrompt;

        // Build complete model object
        const updatedModel = {
          provider: assistant.model?.provider || 'openai',
          model: assistant.model?.model || 'gpt-4o-mini',
          temperature: assistant.model?.temperature ?? 0.7,
          messages: [{ role: 'system', content: newPrompt }],
          tools: assistant.model?.tools || []
        };

        const updateResponse = await axios.patch(
          `https://api.vapi.ai/assistant/${vapiAssistantId}`,
          { model: updatedModel },
          { headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' } }
        );

        console.log('Update successful!');
        console.log('New prompt preview:', updateResponse.data.model?.messages?.[0]?.content?.slice(0, 300) + '...');
      } else {
        console.log('\n>> Date already present in prompt, no update needed');
      }

    } catch (e) {
      console.log('ERROR:', e.response?.data || e.message);
    }
  } else {
    console.log('\nNo assistant ID found - cannot verify assistant');
  }

  // 5. Check booking provider connection
  console.log('\n--- Booking Provider ---');
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('provider_id, status, created_at')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  if (connection) {
    console.log('Provider: Cal.com');
    console.log('Status:', connection.status);
    console.log('Connected:', connection.created_at);
  } else {
    console.log('No Cal.com connection found');
  }

  console.log('\n=== Verification Complete ===');
}

verifyAndUpdate().catch(console.error);
