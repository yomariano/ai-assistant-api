/**
 * VoIPcloud Click-to-Call Integration
 *
 * This uses VoIPcloud's API to initiate outbound calls.
 * Flow: VoIPcloud calls VAPI (via SIP trunk) → VAPI answers → bridges to destination
 */

require('dotenv').config();
const axios = require('axios');

const VOIPCLOUD_API_URL = 'https://ie.voipcloud.online';
const VOIPCLOUD_TOKEN = process.env.VOIPCLOUD_API_TOKEN;

const voipcloudClient = axios.create({
  baseURL: VOIPCLOUD_API_URL,
  headers: {
    'token': VOIPCLOUD_TOKEN,
    'Content-Type': 'application/json'
  }
});

/**
 * Make an outbound call using VoIPcloud API
 * @param {string} userNumber - The internal user/extension to call first (routes to VAPI)
 * @param {string} destinationNumber - The destination to call (E.164 format)
 * @param {string} callerId - Optional caller ID
 */
async function makeCall(userNumber, destinationNumber, callerId) {
  console.log('\n=== VoIPcloud Click-to-Call ===');
  console.log('User (VAPI):', userNumber);
  console.log('Destination:', destinationNumber);
  console.log('Caller ID:', callerId || 'default');

  try {
    const response = await voipcloudClient.post('/api/integration/v2/call-to-number', {
      user_number: userNumber,
      number_to_call: destinationNumber,
      caller_id: callerId || userNumber
    });

    console.log('\n✓ Call initiated!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (error) {
    console.error('\n✗ Call failed!');
    console.error('Error:', error.response?.data || error.message);

    if (error.response?.status === 401) {
      console.log('\n💡 API token not authorized. Make sure:');
      console.log('   1. VOIPCLOUD_API_TOKEN is set in .env');
      console.log('   2. Your server IP is whitelisted in VoIPcloud API settings');
    }
    throw error;
  }
}

/**
 * Test the API connection
 */
async function testConnection() {
  console.log('\n=== Testing VoIPcloud API Connection ===');
  console.log('Token:', VOIPCLOUD_TOKEN ? VOIPCLOUD_TOKEN.substring(0, 20) + '...' : 'NOT SET');

  try {
    const response = await voipcloudClient.get('/api/integration/v2/get-user-calls', {
      params: { sort_by: 'newest_first', limit: 1 }
    });
    console.log('✓ API connection successful!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error) {
    console.error('✗ API connection failed!');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data || error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!VOIPCLOUD_TOKEN) {
    console.error('Error: VOIPCLOUD_API_TOKEN not set in .env');
    console.log('\nAdd this to your .env file:');
    console.log('VOIPCLOUD_API_TOKEN=zEickJ5S0VtuokzJjE8F0RblftNpXyeWYl8jeNB9VYvmIYY002M3uMNnrc1rrvG9');
    process.exit(1);
  }

  if (command === 'test') {
    await testConnection();
  } else if (command === 'call' && args[1]) {
    // Use extension 1001 (routes to VAPI via SIP trunk)
    // Caller ID must be the Dublin landline (mobile number not authorized)
    const userExtension = '1001';
    const destinationNumber = args[1];
    const callerId = '+35312655181';  // Dublin number - valid CLI
    await makeCall(userExtension, destinationNumber, callerId);
  } else {
    console.log('VoIPcloud Click-to-Call\n');
    console.log('Usage:');
    console.log('  node scripts/voipcloudCall.js test              - Test API connection');
    console.log('  node scripts/voipcloudCall.js call +353xxxxxxx  - Make a call');
    console.log('\nExample:');
    console.log('  node scripts/voipcloudCall.js call +353838454183');
  }
}

main().catch(console.error);
