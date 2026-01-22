require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';
const vapiAssistantId = '43c61368-19fa-47a2-b663-550477f20b40';

async function debug() {
  console.log('=== Debugging Booking Issue ===\n');

  // 1. Check VAPI assistant tools configuration
  console.log('--- VAPI Assistant Tools ---');
  try {
    const response = await axios.get(
      `https://api.vapi.ai/assistant/${vapiAssistantId}`,
      { headers: { Authorization: `Bearer ${VAPI_API_KEY}` } }
    );

    const tools = response.data.model?.tools || [];
    console.log(`Tools count: ${tools.length}`);

    tools.forEach(tool => {
      console.log(`\nTool: ${tool.function?.name || tool.type}`);
      if (tool.server?.url) {
        console.log(`  Server URL: ${tool.server.url}`);
      } else {
        console.log('  Server URL: NOT SET');
      }
    });
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }

  // 2. Check if we can find the user from the assistant
  console.log('\n--- User Lookup ---');
  const { data: assistant } = await supabase
    .from('user_assistants')
    .select('*')
    .eq('vapi_assistant_id', vapiAssistantId)
    .single();

  if (assistant) {
    console.log('Found user_assistant:', assistant.user_id);
  } else {
    console.log('WARNING: No user_assistant record for this VAPI assistant!');
    console.log('This means tool calls cannot find the user ID');
  }

  // 3. Check user_phone_numbers table
  const { data: phoneNumber } = await supabase
    .from('user_phone_numbers')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (phoneNumber) {
    console.log('Found user_phone_number:', phoneNumber.vapi_phone_id);
  } else {
    console.log('No user_phone_numbers record found');
  }

  // 4. Check provider connection
  console.log('\n--- Provider Connection ---');
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  if (connection) {
    console.log('Cal.com connection ID:', connection.id);
    console.log('Status:', connection.status);
  } else {
    console.log('No Cal.com connection found');
  }

  // 5. Test creating a booking directly through our API (bypass VAPI)
  console.log('\n--- Testing create_booking Tool Directly ---');
  const vapiTools = require('../src/services/vapiTools');

  try {
    const result = await vapiTools.handleToolCall(
      userId,
      'create_booking',
      {
        date: '2026-01-22',
        time: '20:00', // 8 PM - last available slot
        customer_name: 'Test User',
        customer_phone: '+353851234567',
      },
      {
        callId: null, // Real calls have UUIDs, use null for testing
        customerPhone: '+353851234567',
        assistantId: vapiAssistantId,
      }
    );

    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Stack:', e.stack);
  }
}

debug().catch(console.error);
