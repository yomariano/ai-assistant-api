require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';
const eventTypeId = 4447590;

async function testExactScenario() {
  const { data: connection } = await supabase
    .from('provider_connections')
    .select('api_key')
    .eq('user_id', userId)
    .eq('provider_id', 'calcom')
    .single();

  const apiKey = connection?.api_key;

  console.log('=== Testing Exact Scenario: User asks for Thursday 5 PM ===\n');

  // Step 1: Get slots like the agent does
  console.log('--- Step 1: Get Available Slots ---');
  const slotsUrl = `https://api.cal.com/v1/slots?eventTypeId=${eventTypeId}&startTime=2026-01-22T00:00:00.000Z&endTime=2026-01-22T23:59:59.999Z&apiKey=${apiKey}`;
  const slotsResponse = await axios.get(slotsUrl);
  const slots = slotsResponse.data.slots?.['2026-01-22'] || [];

  console.log('Raw UTC slots from Cal.com:');
  slots.forEach(s => {
    console.log(`  ${s.time}`);
  });

  console.log('\nSlots formatted as local time (what agent tells user):');
  slots.forEach(s => {
    const localTime = new Date(s.time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    console.log(`  ${localTime} (from UTC: ${s.time})`);
  });

  // Step 2: User says "5 PM" - what does the agent send?
  console.log('\n--- Step 2: User says "5 PM Thursday" ---');
  const userRequestedTime = '17:00'; // 5 PM
  const userRequestedDate = '2026-01-22';

  // This is what vapiTools builds:
  const bookingDateTime = `${userRequestedDate}T${userRequestedTime}:00`;
  console.log(`Agent builds: ${bookingDateTime}`);

  // Check if this matches any available slot
  const matchingSlot = slots.find(s => {
    const slotHour = new Date(s.time).getUTCHours();
    const requestedHour = parseInt(userRequestedTime.split(':')[0]);
    return slotHour === requestedHour;
  });

  if (matchingSlot) {
    console.log(`Matching slot found: ${matchingSlot.time}`);
  } else {
    console.log('NO matching slot found!');
    console.log('Available UTC hours:', slots.map(s => new Date(s.time).getUTCHours()));
    console.log('Requested hour:', parseInt(userRequestedTime.split(':')[0]));
  }

  // Step 3: Try to book with what vapiTools sends
  console.log('\n--- Step 3: Attempt Booking ---');
  const bookingUrl = `https://api.cal.com/v1/bookings?apiKey=${apiKey}`;

  // What vapiTools sends (naive datetime):
  const naiveBookingData = {
    eventTypeId: eventTypeId,
    start: bookingDateTime, // "2026-01-22T17:00:00"
    responses: {
      name: 'Test User',
      email: 'test2@example.com',
    },
    metadata: {},
    timeZone: 'Europe/Dublin',
    language: 'en',
  };

  console.log('Naive booking request:', JSON.stringify(naiveBookingData, null, 2));

  try {
    const response = await axios.post(bookingUrl, naiveBookingData);
    console.log('\nBooking succeeded with naive datetime!');
  } catch (e) {
    console.log('\nBooking FAILED with naive datetime:');
    console.log('Error:', e.response?.data?.message || e.message);

    // Now try with the proper UTC format from slots
    if (slots.length > 0) {
      console.log('\n--- Step 4: Try with exact UTC slot time ---');
      const properBookingData = {
        eventTypeId: eventTypeId,
        start: slots[0].time, // Use exact UTC from slots
        responses: {
          name: 'Test User 2',
          email: 'test3@example.com',
        },
        metadata: {},
        timeZone: 'Europe/Dublin',
        language: 'en',
      };

      console.log('Proper booking request:', JSON.stringify(properBookingData, null, 2));

      try {
        const response2 = await axios.post(bookingUrl, properBookingData);
        console.log('\nBooking succeeded with proper UTC time!');
        console.log('Booked time:', response2.data.startTime);
      } catch (e2) {
        console.log('Also failed:', e2.response?.data?.message || e2.message);
      }
    }
  }
}

testExactScenario().catch(console.error);
