/**
 * Test script for VoIPcloud Ireland SIP trunk integration
 *
 * Tests:
 * 1. Inbound: Call +353 1 265 5181 from your mobile
 * 2. Outbound: VAPI calls out using VoIPcloud as carrier
 */

require('dotenv').config();
const axios = require('axios');

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_API_URL = 'https://api.vapi.ai';

const VOIPCLOUD_PHONE_NUMBER_ID = process.env.VAPI_IRELAND_PHONE_NUMBER_ID || 'f5d8f479-a6db-45a0-ad1e-041e39635425';

const vapiClient = axios.create({
  baseURL: VAPI_API_URL,
  headers: {
    'Authorization': `Bearer ${VAPI_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

async function testOutboundCall(destinationNumber) {
  console.log('\n=== Testing OUTBOUND call via VoIPcloud ===');
  console.log(`From: Ireland VoIPcloud number`);
  console.log(`To: ${destinationNumber}`);
  console.log(`Phone Number ID: ${VOIPCLOUD_PHONE_NUMBER_ID}`);

  try {
    const response = await vapiClient.post('/call/phone', {
      phoneNumberId: VOIPCLOUD_PHONE_NUMBER_ID,
      customer: {
        number: destinationNumber
      },
      assistant: {
        firstMessage: "Hello! This is a test call from the VoIPcloud Ireland integration. The call is working correctly. Goodbye!",
        model: {
          provider: "openai",
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a test assistant. Say hello, confirm the test call is working, then end the call politely."
            }
          ]
        },
        voice: {
          provider: "11labs",
          voiceId: "josh"
        },
        endCallFunctionEnabled: true,
        maxDurationSeconds: 60
      }
    });

    console.log('\n✓ Call initiated successfully!');
    console.log('Call ID:', response.data.id);
    console.log('Status:', response.data.status);
    console.log('\nFull response:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error('\n✗ Call failed!');
    console.error('Error:', error.response?.data || error.message);

    if (error.response?.data?.message?.includes('sip')) {
      console.log('\n💡 This might be a SIP configuration issue.');
      console.log('Check that VoIPcloud has whitelisted VAPI IPs:');
      console.log('  - 44.229.228.186');
      console.log('  - 44.238.177.138');
    }

    throw error;
  }
}

async function checkPhoneNumber() {
  console.log('\n=== Checking VoIPcloud Phone Number in VAPI ===');

  try {
    const response = await vapiClient.get(`/phone-number/${VOIPCLOUD_PHONE_NUMBER_ID}`);
    const phone = response.data;

    console.log('\n✓ Phone number found!');
    console.log('Number:', phone.number);
    console.log('Name:', phone.name);
    console.log('Provider:', phone.provider);
    console.log('Credential ID:', phone.credentialId);
    console.log('Status:', phone.status);

    return phone;
  } catch (error) {
    console.error('\n✗ Failed to get phone number');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

async function checkCredential() {
  console.log('\n=== Checking VoIPcloud SIP Trunk Credential ===');

  const credentialId = process.env.VAPI_VOIPCLOUD_CREDENTIAL_ID || '88145b3c-31bf-40b1-8c05-7b55eda33b50';

  try {
    const response = await vapiClient.get(`/credential/${credentialId}`);
    const cred = response.data;

    console.log('\n✓ Credential found!');
    console.log('Name:', cred.name);
    console.log('Provider:', cred.provider);
    console.log('Gateways:', JSON.stringify(cred.gateways, null, 2));
    console.log('Outbound Auth Username:', cred.outboundAuthenticationPlan?.authUsername);

    return cred;
  } catch (error) {
    console.error('\n✗ Failed to get credential');
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const phoneNumber = args[1];

  console.log('========================================');
  console.log('  VoIPcloud Ireland Integration Test');
  console.log('========================================');

  if (command === 'check') {
    await checkCredential();
    await checkPhoneNumber();
    console.log('\n========================================');
    console.log('  Configuration looks good!');
    console.log('========================================');
    console.log('\nTo test INBOUND calls:');
    console.log('  Call +353 1 265 5181 from your mobile phone');
    console.log('\nTo test OUTBOUND calls:');
    console.log('  node scripts/testVoipcloud.js call +353xxxxxxxxx');

  } else if (command === 'call' && phoneNumber) {
    await checkCredential();
    await checkPhoneNumber();
    await testOutboundCall(phoneNumber);

  } else {
    console.log('\nUsage:');
    console.log('  node scripts/testVoipcloud.js check              - Check configuration');
    console.log('  node scripts/testVoipcloud.js call +353xxxxxxxx  - Make test outbound call');
    console.log('\nExamples:');
    console.log('  node scripts/testVoipcloud.js check');
    console.log('  node scripts/testVoipcloud.js call +353871234567');
  }
}

main().catch(console.error);
