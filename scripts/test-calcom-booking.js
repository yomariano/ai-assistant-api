require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';
const eventTypeId = 4447590;

async function testCalcomBooking() {
  // Get Cal.com API key
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  const apiKey = connection?.api_key;
  console.log('API Key:', apiKey?.slice(0, 15) + '...');

  // First, let's see what slots are available on Thursday
  console.log('\n--- Checking Available Slots ---');
  const slotsUrl = `https://api.cal.com/v1/slots?eventTypeId=${eventTypeId}&startTime=2026-01-22T00:00:00.000Z&endTime=2026-01-22T23:59:59.999Z&apiKey=${apiKey}`;

  const slotsResponse = await axios.get(slotsUrl);
  console.log('Slots response:');
  console.log(JSON.stringify(slotsResponse.data, null, 2));

  // Get the first available slot time
  const slots = slotsResponse.data.slots?.['2026-01-22'] || [];
  if (slots.length === 0) {
    console.log('No slots available!');
    return;
  }

  const firstSlot = slots[0];
  console.log('\nFirst available slot:', firstSlot.time);

  // Now try to create a booking using that exact slot time
  console.log('\n--- Creating Booking ---');
  const bookingUrl = `https://api.cal.com/v1/bookings?apiKey=${apiKey}`;

  const bookingData = {
    eventTypeId: eventTypeId,
    start: firstSlot.time, // Use the exact time returned by /slots
    responses: {
      name: 'Test Booking User',
      email: 'test@example.com',
      phone: '+353851234567',
    },
    metadata: {}, // Cal.com requires this field
    timeZone: 'Europe/Dublin',
    language: 'en',
  };

  console.log('Booking request:', JSON.stringify(bookingData, null, 2));

  try {
    const bookingResponse = await axios.post(bookingUrl, bookingData);
    console.log('\nBooking created successfully!');
    console.log(JSON.stringify(bookingResponse.data, null, 2));
  } catch (e) {
    console.log('\nBooking failed:');
    console.log('Status:', e.response?.status);
    console.log('Error:', JSON.stringify(e.response?.data, null, 2));
  }
}

testCalcomBooking().catch(console.error);
