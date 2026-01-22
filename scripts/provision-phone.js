const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Force real VAPI provider
process.env.VOICE_PROVIDER = 'vapi';

const { getVoiceProvider } = require('../src/adapters/voice');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const userId = '0da73a0e-2690-48fc-b7b7-3cb3e3dec8c5';
const phoneNumber = '+35312655193';

async function run() {
  const voiceProvider = getVoiceProvider();
  console.log('Using provider:', voiceProvider.constructor.name);

  // Get the assistant
  const { data: assistant } = await supabase
    .from('user_assistants')
    .select('vapi_assistant_id')
    .eq('user_id', userId)
    .single();

  console.log('Assistant ID:', assistant?.vapi_assistant_id);

  if (!assistant?.vapi_assistant_id) {
    console.log('No assistant found!');
    return;
  }

  // Import phone to VAPI
  console.log('\nImporting phone to VAPI...');
  try {
    const vapiNumber = await voiceProvider.importPhoneNumber(
      phoneNumber,
      'voipcloud',
      {
        name: 'Ireland-' + userId.slice(0, 8),
        assistantId: assistant.vapi_assistant_id,
        credentialId: process.env.VAPI_VOIPCLOUD_CREDENTIAL_ID
      }
    );

    console.log('VAPI Phone created:', vapiNumber.id);

    // Update pool record
    const { data: updated } = await supabase
      .from('phone_number_pool')
      .update({ vapi_phone_id: vapiNumber.id })
      .eq('phone_number', phoneNumber)
      .select();

    console.log('Pool record updated:', updated?.[0]?.vapi_phone_id);

    // Create user_phone_numbers record
    const { data: userPhone, error: userPhoneError } = await supabase
      .from('user_phone_numbers')
      .insert({
        user_id: userId,
        phone_number: phoneNumber,
        vapi_id: vapiNumber.id,
        label: 'Primary',
        status: 'active',
        region: 'IE'
      })
      .select();

    if (userPhoneError) {
      console.log('User phone error:', userPhoneError.message);
    } else {
      console.log('User phone record created:', userPhone?.[0]?.id);
    }

    console.log('\n✅ Phone fully provisioned and linked to assistant!');
  } catch (error) {
    console.log('Error:', error.response?.data || error.message);
  }
}

run();
