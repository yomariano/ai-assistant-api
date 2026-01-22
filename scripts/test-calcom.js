require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';

async function debug() {
  // Get connection with API key
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('api_key, config')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  console.log('API Key exists:', Boolean(connection?.api_key));
  console.log('API Key preview:', connection?.api_key?.slice(0, 15) + '...');

  const eventTypeId = 4447590;

  // Test Thursday 2026-01-22 (next Thursday - should have 5-9 PM availability)
  const startTime = '2026-01-22T00:00:00.000Z';
  const endTime = '2026-01-22T23:59:59.999Z';

  const url = `https://api.cal.com/v1/slots?eventTypeId=${eventTypeId}&startTime=${startTime}&endTime=${endTime}&apiKey=${connection.api_key}`;

  console.log('\nCalling Cal.com /slots API for Thursday 2025-01-23...');
  try {
    const response = await axios.get(url);
    console.log('\nFull Response:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }
}

debug();
