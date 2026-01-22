require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';

async function testCalcom() {
  // Get connection with API key
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('api_key, config')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  if (!connection?.api_key) {
    console.log('ERROR: No Cal.com API key found');
    return;
  }

  console.log('API Key found:', connection.api_key.slice(0, 15) + '...');

  const eventTypeId = 4447590;

  // Test Thursday 2026-01-22 (this Thursday - should have 5-9 PM availability)
  const startTime = '2026-01-22T00:00:00.000Z';
  const endTime = '2026-01-22T23:59:59.999Z';

  const url = `https://api.cal.com/v1/slots?eventTypeId=${eventTypeId}&startTime=${startTime}&endTime=${endTime}&apiKey=${connection.api_key}`;

  console.log('\nCalling Cal.com /slots API for Thursday 2026-01-22...');
  console.log('(Expecting 5-9 PM slots based on Cal.com availability config)\n');

  try {
    const response = await axios.get(url);
    console.log('Response:');

    if (response.data.slots && typeof response.data.slots === 'object') {
      for (const dateKey of Object.keys(response.data.slots)) {
        const daySlots = response.data.slots[dateKey];
        console.log(`\nDate: ${dateKey}`);
        console.log(`Slots (${daySlots.length}):`);
        daySlots.forEach(slot => {
          const time = new Date(slot.time);
          console.log(`  - ${time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`);
        });
      }
    } else {
      console.log('No slots available');
    }
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }

  // Also test today (Tuesday) - should have NO availability
  console.log('\n---\n');
  const todayStart = '2026-01-20T00:00:00.000Z';
  const todayEnd = '2026-01-20T23:59:59.999Z';
  const todayUrl = `https://api.cal.com/v1/slots?eventTypeId=${eventTypeId}&startTime=${todayStart}&endTime=${todayEnd}&apiKey=${connection.api_key}`;

  console.log('Calling Cal.com /slots API for Tuesday 2026-01-20...');
  console.log('(Expecting NO slots - Tuesday is not available)\n');

  try {
    const response = await axios.get(todayUrl);
    if (response.data.slots && typeof response.data.slots === 'object') {
      const keys = Object.keys(response.data.slots);
      if (keys.length === 0) {
        console.log('✓ Correct: No slots available for Tuesday');
      } else {
        console.log('Unexpected: Found slots on Tuesday:');
        console.log(JSON.stringify(response.data.slots, null, 2));
      }
    } else {
      console.log('✓ Correct: No slots available for Tuesday');
    }
  } catch (e) {
    console.log('Error:', e.response?.data || e.message);
  }
}

testCalcom().catch(console.error);
