const { supabaseAdmin } = require('./supabase');
const { getPlanLimits } = require('./stripe');
const {
  createAssistantForUser,
  getUserAssistant,
  assignAssistantToNumber
} = require('./assistant');

// Use adapter factories for provider abstraction
const { getTelephonyProvider } = require('../adapters/telephony');
const { getVoiceProvider } = require('../adapters/voice');

/**
 * Full provisioning flow after successful payment
 * 1. Create AI assistant for user (if not exists)
 * 2. Search available numbers from Telnyx
 * 3. Purchase numbers from Telnyx
 * 4. Import numbers to Vapi
 * 5. Assign assistant to numbers
 * 6. Save to database
 */
async function provisionUserPhoneNumbers(userId, planId, userInfo = {}) {
  const planLimits = getPlanLimits(planId);
  const numbersToProvision = planLimits.phoneNumbers;
  const results = [];
  let assistant = null;

  // Get provider instances (automatically selects mock/real based on environment)
  const telephonyProvider = getTelephonyProvider();
  const voiceProvider = getVoiceProvider();

  console.log(`[Provisioning] Using ${telephonyProvider.getName()} telephony and ${voiceProvider.getName()} voice providers`);
  console.log(`[Provisioning] Provisioning ${numbersToProvision} phone number(s) for user ${userId}`);

  // PRE-FLIGHT CHECK: Validate required credentials BEFORE purchasing numbers
  // This prevents wasted charges if Vapi import would fail
  if (telephonyProvider.getName() === 'telnyx' && voiceProvider.getName() === 'vapi') {
    if (!process.env.VAPI_TELNYX_CREDENTIAL_ID) {
      throw new Error(
        'VAPI_TELNYX_CREDENTIAL_ID is required for real Telnyx+Vapi provisioning. ' +
        'Create a Telnyx credential in Vapi and set this env var before purchasing numbers.'
      );
    }
    console.log('[Provisioning] Pre-flight check passed: VAPI_TELNYX_CREDENTIAL_ID is set');
  }

  try {
    // 1. Create or get AI assistant for user
    assistant = await getUserAssistant(userId);

    if (!assistant) {
      console.log(`[Provisioning] Creating new assistant for user ${userId}`);
      const { dbAssistant } = await createAssistantForUser(userId, {
        businessName: userInfo.businessName || '',
        businessDescription: userInfo.businessDescription || '',
        greetingName: userInfo.greetingName || 'your AI assistant',
        planId
      });
      assistant = dbAssistant;
    }

    // 2. Search available numbers
    const availableNumbers = await telephonyProvider.searchAvailableNumbers(numbersToProvision);

    if (availableNumbers.length === 0) {
      throw new Error('No phone numbers available');
    }

    // 3. Purchase numbers
    const purchasedNumbers = await telephonyProvider.purchaseNumbers(availableNumbers);

    // 4. Configure and import each number
    for (const telnyxNumber of purchasedNumbers) {
      try {
        // Assign to Voice App (for webhook routing)
        const voiceAppId = process.env.TELNYX_VOICE_APP_ID;
        if (voiceAppId) {
          await telephonyProvider.assignToVoiceApp(telnyxNumber.id, voiceAppId);
        }

        // Import to Voice AI provider
        // Note: credentialId comes from VAPI_TELNYX_CREDENTIAL_ID env var
        const vapiNumber = await voiceProvider.importPhoneNumber(
          telnyxNumber.phone_number,
          'telnyx',
          {
            name: `Phone-${userId.slice(0, 8)}`,
            assistantId: assistant?.vapi_assistant_id
          }
        );

        // 5. Assign assistant to this phone number
        if (assistant?.vapi_assistant_id) {
          await assignAssistantToNumber(vapiNumber.id, assistant.vapi_assistant_id);
        }

        // 6. Save to database
        const { data: savedNumber, error } = await supabaseAdmin
          .from('user_phone_numbers')
          .insert({
            user_id: userId,
            phone_number: telnyxNumber.phone_number,
            telnyx_id: telnyxNumber.id,
            vapi_id: vapiNumber.id,
            assistant_id: assistant?.id,
            status: 'active',
            label: `Phone ${results.length + 1}`
          })
          .select()
          .single();

        if (error) throw error;

        results.push({
          phoneNumber: telnyxNumber.phone_number,
          telnyxId: telnyxNumber.id,
          vapiId: vapiNumber.id,
          assistantId: assistant?.vapi_assistant_id,
          dbId: savedNumber.id
        });

        console.log(`[Provisioning] Provisioned number ${telnyxNumber.phone_number} for user ${userId}`);
      } catch (numberError) {
        console.error(`[Provisioning] Failed to provision number ${telnyxNumber.phone_number}:`, numberError.message);
        // Continue with other numbers
      }
    }

    return {
      success: true,
      provisioned: results.length,
      requested: numbersToProvision,
      numbers: results,
      assistant: {
        id: assistant?.id,
        vapiId: assistant?.vapi_assistant_id
      }
    };
  } catch (error) {
    console.error('[Provisioning] Provisioning failed:', error);
    throw error;
  }
}

/**
 * Search for available phone numbers
 * @deprecated Use getTelephonyProvider().searchAvailableNumbers() directly
 */
async function searchTelnyxNumbers(limit, options = {}) {
  const provider = getTelephonyProvider();
  return provider.searchAvailableNumbers(limit, options);
}

/**
 * Purchase phone numbers
 * @deprecated Use getTelephonyProvider().purchaseNumbers() directly
 */
async function purchaseTelnyxNumbers(numbers) {
  const provider = getTelephonyProvider();
  return provider.purchaseNumbers(numbers);
}

/**
 * Import phone number to Voice AI provider
 * @deprecated Use getVoiceProvider().importPhoneNumber() directly
 */
async function importToVapi(phoneNumber, userId) {
  const provider = getVoiceProvider();
  return provider.importPhoneNumber(phoneNumber, 'telnyx', {
    name: `User-${userId}`,
    telnyxApiKey: process.env.TELNYX_API_KEY
  });
}

/**
 * Release/delete a phone number (for cancellations/downgrades)
 */
async function releasePhoneNumber(phoneNumberRecord) {
  const telephonyProvider = getTelephonyProvider();
  const voiceProvider = getVoiceProvider();

  try {
    // 1. Delete from Voice AI provider
    if (phoneNumberRecord.vapi_id) {
      await voiceProvider.deletePhoneNumber(phoneNumberRecord.vapi_id);
    }

    // 2. Release from Telephony provider
    if (phoneNumberRecord.telnyx_id) {
      await telephonyProvider.releaseNumber(phoneNumberRecord.telnyx_id);
    }

    // 3. Update database
    await supabaseAdmin
      .from('user_phone_numbers')
      .update({
        status: 'released',
        released_at: new Date().toISOString()
      })
      .eq('id', phoneNumberRecord.id);

    return true;
  } catch (error) {
    console.error('[Provisioning] Failed to release number:', error);
    throw error;
  }
}

/**
 * Get user's phone numbers
 */
async function getUserPhoneNumbers(userId) {
  const { data, error } = await supabaseAdmin
    .from('user_phone_numbers')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

module.exports = {
  provisionUserPhoneNumbers,
  searchTelnyxNumbers,
  purchaseTelnyxNumbers,
  importToVapi,
  releasePhoneNumber,
  getUserPhoneNumbers
};
