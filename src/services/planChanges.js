const { supabaseAdmin } = require('./supabase');
const { getPlanLimits } = require('./stripe');
const {
  provisionUserPhoneNumbers,
  searchTelnyxNumbers,
  purchaseTelnyxNumbers,
  importToVapi,
  releasePhoneNumber,
  getUserPhoneNumbers
} = require('./provisioning');
const { getUserAssistant, assignAssistantToNumber } = require('./assistant');

/**
 * Handle plan changes (upgrades/downgrades)
 * - Upgrade: Provision additional phone numbers
 * - Downgrade: Release excess phone numbers
 */
async function handlePlanChange(userId, oldPlanId, newPlanId) {
  const oldLimits = getPlanLimits(oldPlanId);
  const newLimits = getPlanLimits(newPlanId);

  const oldNumbersAllowed = oldLimits.phoneNumbers;
  const newNumbersAllowed = newLimits.phoneNumbers;

  console.log(`Plan change for user ${userId}: ${oldPlanId} (${oldNumbersAllowed} numbers) → ${newPlanId} (${newNumbersAllowed} numbers)`);

  // Get current phone numbers
  const currentNumbers = await getUserPhoneNumbers(userId);
  const currentCount = currentNumbers.length;

  if (newNumbersAllowed > currentCount) {
    // UPGRADE: Need to provision more numbers
    const numbersToAdd = newNumbersAllowed - currentCount;
    console.log(`Upgrading: Adding ${numbersToAdd} phone number(s)`);
    return await provisionAdditionalNumbers(userId, newPlanId, numbersToAdd);
  } else if (newNumbersAllowed < currentCount) {
    // DOWNGRADE: Need to release some numbers
    const numbersToRemove = currentCount - newNumbersAllowed;
    console.log(`Downgrading: Releasing ${numbersToRemove} phone number(s)`);
    return await releaseExcessNumbers(userId, numbersToRemove);
  } else {
    // Same number of phones, just update features
    console.log('Plan change with same phone count - updating features only');
    return await updatePlanFeatures(userId, newPlanId);
  }
}

/**
 * Provision additional phone numbers (for upgrades)
 */
async function provisionAdditionalNumbers(userId, planId, count) {
  const results = [];

  try {
    // Get user's assistant
    const assistant = await getUserAssistant(userId);

    // Search and purchase new numbers
    const availableNumbers = await searchTelnyxNumbers(count);
    if (availableNumbers.length === 0) {
      throw new Error('No phone numbers available');
    }

    const purchasedNumbers = await purchaseTelnyxNumbers(availableNumbers.slice(0, count));

    // Get current number count for labeling
    const existingNumbers = await getUserPhoneNumbers(userId);
    let labelIndex = existingNumbers.length + 1;

    for (const telnyxNumber of purchasedNumbers) {
      try {
        // Import to Vapi
        const vapiNumber = await importToVapi(telnyxNumber.phone_number, userId);

        // Assign assistant if exists
        if (assistant?.vapi_assistant_id) {
          await assignAssistantToNumber(vapiNumber.id, assistant.vapi_assistant_id);
        }

        // Save to database
        const { data: savedNumber, error } = await supabaseAdmin
          .from('user_phone_numbers')
          .insert({
            user_id: userId,
            phone_number: telnyxNumber.phone_number,
            telnyx_id: telnyxNumber.id,
            vapi_id: vapiNumber.id,
            assistant_id: assistant?.id,
            status: 'active',
            label: `Phone ${labelIndex++}`
          })
          .select()
          .single();

        if (error) throw error;

        results.push({
          action: 'added',
          phoneNumber: telnyxNumber.phone_number,
          id: savedNumber.id
        });
      } catch (err) {
        console.error(`Failed to provision number ${telnyxNumber.phone_number}:`, err.message);
      }
    }

    return {
      success: true,
      action: 'upgrade',
      numbersAdded: results.length,
      numbers: results
    };
  } catch (error) {
    console.error('Failed to provision additional numbers:', error);
    throw error;
  }
}

/**
 * Release excess phone numbers (for downgrades)
 * Releases the most recently added numbers first
 */
async function releaseExcessNumbers(userId, count) {
  const results = [];

  try {
    // Get numbers ordered by created_at descending (newest first)
    const { data: numbers, error } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(count);

    if (error) throw error;

    for (const number of numbers) {
      try {
        await releasePhoneNumber(number);
        results.push({
          action: 'released',
          phoneNumber: number.phone_number,
          id: number.id
        });
      } catch (err) {
        console.error(`Failed to release number ${number.phone_number}:`, err.message);
      }
    }

    return {
      success: true,
      action: 'downgrade',
      numbersReleased: results.length,
      numbers: results
    };
  } catch (error) {
    console.error('Failed to release numbers:', error);
    throw error;
  }
}

/**
 * Update plan features without changing phone count
 */
async function updatePlanFeatures(userId, newPlanId) {
  const planLimits = getPlanLimits(newPlanId);

  // Update assistant features based on new plan
  const voiceCloning = ['growth', 'pro'].includes(newPlanId);
  const customKnowledge = ['pro'].includes(newPlanId);

  await supabaseAdmin
    .from('user_assistants')
    .update({
      voice_cloning_enabled: voiceCloning,
      custom_knowledge_base: customKnowledge,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId);

  return {
    success: true,
    action: 'features_updated',
    features: {
      voiceCloning,
      customKnowledge,
      maxMinutesPerCall: planLimits.maxMinutesPerCall,
      maxConcurrentCalls: planLimits.maxConcurrentCalls
    }
  };
}

/**
 * Handle subscription cancellation
 * Releases all phone numbers and marks assistant as deleted
 */
async function handleCancellation(userId) {
  console.log(`Handling cancellation for user ${userId}`);

  const results = {
    numbersReleased: 0,
    assistantDeleted: false
  };

  try {
    // Get all active phone numbers
    const { data: numbers } = await supabaseAdmin
      .from('user_phone_numbers')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active');

    // Release all numbers
    for (const number of numbers || []) {
      try {
        await releasePhoneNumber(number);
        results.numbersReleased++;
      } catch (err) {
        console.error(`Failed to release number ${number.phone_number}:`, err.message);
      }
    }

    // Mark assistant as deleted
    const { deleteAssistant } = require('./assistant');
    await deleteAssistant(userId);
    results.assistantDeleted = true;

    return {
      success: true,
      action: 'cancellation',
      ...results
    };
  } catch (error) {
    console.error('Failed to handle cancellation:', error);
    throw error;
  }
}

module.exports = {
  handlePlanChange,
  provisionAdditionalNumbers,
  releaseExcessNumbers,
  updatePlanFeatures,
  handleCancellation
};
