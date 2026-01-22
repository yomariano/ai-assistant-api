/**
 * Sync VAPI phone IDs in the database with actual VAPI phone IDs
 * This fixes any mismatches between our database and VAPI
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VAPI_API_KEY = process.env.VAPI_API_KEY;

async function syncVapiPhoneIds() {
  console.log('Fetching VAPI phone numbers...\n');

  // Get all VAPI phone numbers
  const response = await axios.get(
    'https://api.vapi.ai/phone-number',
    { headers: { Authorization: 'Bearer ' + VAPI_API_KEY } }
  );

  const vapiPhones = response.data;
  console.log(`Found ${vapiPhones.length} VAPI phone numbers\n`);

  // Create a map of phone number -> VAPI ID
  const vapiMap = {};
  vapiPhones.forEach(p => {
    const num = p.number || p.phoneNumber;
    if (num) vapiMap[num] = p.id;
  });

  // Get all pool numbers
  const { data: poolNumbers } = await supabase
    .from('phone_number_pool')
    .select('id, phone_number, vapi_phone_id');

  console.log(`Checking ${poolNumbers.length} pool numbers...\n`);

  let updated = 0;
  for (const pool of poolNumbers) {
    const correctVapiId = vapiMap[pool.phone_number];

    if (correctVapiId && correctVapiId !== pool.vapi_phone_id) {
      console.log(`${pool.phone_number}:`);
      console.log(`  Old: ${pool.vapi_phone_id}`);
      console.log(`  New: ${correctVapiId}`);

      // Update pool
      await supabase
        .from('phone_number_pool')
        .update({ vapi_phone_id: correctVapiId })
        .eq('id', pool.id);

      // Update user_phone_numbers
      await supabase
        .from('user_phone_numbers')
        .update({ vapi_id: correctVapiId })
        .eq('phone_number', pool.phone_number);

      console.log('  ✓ Updated\n');
      updated++;
    } else if (!correctVapiId) {
      console.log(`${pool.phone_number}: Not found in VAPI`);
    }
  }

  console.log(`\nDone! Updated ${updated} numbers.`);
}

syncVapiPhoneIds().catch(console.error);
