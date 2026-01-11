/**
 * Number Pool Service
 *
 * Manages phone number assignment from a pre-purchased pool.
 * Used for Ireland (VoIPcloud) where auto-provisioning isn't available.
 */

const { supabaseAdmin } = require('./supabase');
const { getVoiceProvider } = require('../adapters/voice');

/**
 * Get an available number from the pool
 * @param {string} region - Region code (default: 'IE')
 * @returns {Object|null} Available pool number or null
 */
async function getAvailableNumber(region = 'IE') {
  const { data, error } = await supabaseAdmin
    .from('phone_number_pool')
    .select('*')
    .eq('region', region)
    .eq('status', 'available')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[NumberPool] Error getting available number:', error);
    throw error;
  }

  return data;
}

/**
 * Reserve a number for a user (during checkout)
 * @param {string} userId - User ID
 * @param {string} region - Region code
 * @param {number} reserveMinutes - Reservation duration in minutes
 * @returns {Object} Reserved number or throws error
 */
async function reserveNumber(userId, region = 'IE', reserveMinutes = 15) {
  // Get available number
  const availableNumber = await getAvailableNumber(region);

  if (!availableNumber) {
    throw new Error(`No available phone numbers in ${region} region`);
  }

  // Reserve it
  const reserveUntil = new Date();
  reserveUntil.setMinutes(reserveUntil.getMinutes() + reserveMinutes);

  const { data, error } = await supabaseAdmin
    .from('phone_number_pool')
    .update({
      status: 'reserved',
      assigned_to: userId,
      reserved_at: new Date().toISOString(),
      reserved_until: reserveUntil.toISOString(),
    })
    .eq('id', availableNumber.id)
    .eq('status', 'available')
    .select()
    .single();

  if (error || !data) {
    // Race condition - try again
    console.log('[NumberPool] Reservation race condition, retrying...');
    return reserveNumber(userId, region, reserveMinutes);
  }

  // Log the reservation
  await supabaseAdmin.from('number_assignment_history').insert({
    pool_number_id: data.id,
    user_id: userId,
    action: 'reserved',
    reason: 'Subscription checkout started',
  });

  console.log(`[NumberPool] Reserved ${data.phone_number} for user ${userId}`);

  return data;
}

/**
 * Assign a reserved number to a user (after payment)
 * @param {string} userId - User ID
 * @param {string} poolNumberId - Pool number ID (optional, will find user's reserved number)
 * @returns {Object} Assigned number
 */
async function assignNumber(userId, poolNumberId = null) {
  let query = supabaseAdmin.from('phone_number_pool').select('*');

  if (poolNumberId) {
    query = query.eq('id', poolNumberId);
  } else {
    // Find user's reserved number
    query = query.eq('assigned_to', userId).eq('status', 'reserved');
  }

  const { data: poolNumber, error: findError } = await query.single();

  if (findError || !poolNumber) {
    throw new Error('No reserved number found for user');
  }

  // Safety checks to avoid stealing numbers
  if (poolNumber.status === 'assigned') {
    throw new Error('Pool number is already assigned');
  }
  if (poolNumber.status === 'reserved' && poolNumber.assigned_to && poolNumber.assigned_to !== userId) {
    throw new Error('Pool number is reserved for a different user');
  }

  // Import to VAPI if not already
  let vapiPhoneId = poolNumber.vapi_phone_id;

  if (!vapiPhoneId) {
    try {
      const voiceProvider = getVoiceProvider();
      const vapiResult = await voiceProvider.importPhoneNumber(poolNumber.phone_number, 'voipcloud', {
        name: `Ireland-${poolNumber.phone_number.slice(-4)}`,
      });
      vapiPhoneId = vapiResult.id;
    } catch (err) {
      console.error('[NumberPool] Failed to import to VAPI:', err);
      // Continue anyway - might already be imported
    }
  }

  // Update pool record
  const { error: updateError } = await supabaseAdmin
    .from('phone_number_pool')
    .update({
      status: 'assigned',
      assigned_to: userId,
      assigned_at: new Date().toISOString(),
      reserved_at: null,
      reserved_until: null,
      vapi_phone_id: vapiPhoneId,
    })
    .eq('id', poolNumber.id);

  if (updateError) {
    throw updateError;
  }

  // Create user_phone_numbers record
  const { data: userPhone, error: phoneError } = await supabaseAdmin
    .from('user_phone_numbers')
    .insert({
      user_id: userId,
      phone_number: poolNumber.phone_number,
      vapi_id: vapiPhoneId,
      pool_number_id: poolNumber.id,
      region: poolNumber.region,
      status: 'active',
    })
    .select()
    .single();

  if (phoneError) {
    throw phoneError;
  }

  // Log the assignment
  await supabaseAdmin.from('number_assignment_history').insert({
    pool_number_id: poolNumber.id,
    user_id: userId,
    action: 'assigned',
    reason: 'Subscription confirmed',
  });

  console.log(`[NumberPool] Assigned ${poolNumber.phone_number} to user ${userId}`);

  return {
    poolNumber,
    userPhone,
    vapiPhoneId,
  };
}

/**
 * Release a number back to the pool (on subscription cancellation)
 * @param {string} userId - User ID
 * @param {string} reason - Reason for release
 * @returns {boolean} Success
 */
async function releaseNumber(userId, reason = 'Subscription cancelled') {
  // Find user's assigned number from pool
  const { data: poolNumber } = await supabaseAdmin
    .from('phone_number_pool')
    .select('*')
    .eq('assigned_to', userId)
    .eq('status', 'assigned')
    .single();

  if (!poolNumber) {
    console.log(`[NumberPool] No assigned pool number for user ${userId}`);
    return false;
  }

  // Update pool record to released
  await supabaseAdmin
    .from('phone_number_pool')
    .update({
      status: 'released',
      assigned_to: null,
      assigned_at: null,
    })
    .eq('id', poolNumber.id);

  // Update user_phone_numbers
  await supabaseAdmin
    .from('user_phone_numbers')
    .update({
      status: 'released',
    })
    .eq('pool_number_id', poolNumber.id)
    .eq('user_id', userId);

  // Log the release
  await supabaseAdmin.from('number_assignment_history').insert({
    pool_number_id: poolNumber.id,
    user_id: userId,
    action: 'released',
    reason,
  });

  console.log(`[NumberPool] Released ${poolNumber.phone_number} from user ${userId}`);

  return true;
}

/**
 * Cancel a reservation (checkout abandoned)
 * @param {string} userId - User ID
 * @returns {boolean} Success
 */
async function cancelReservation(userId) {
  const { data: poolNumber } = await supabaseAdmin
    .from('phone_number_pool')
    .select('*')
    .eq('assigned_to', userId)
    .eq('status', 'reserved')
    .single();

  if (!poolNumber) {
    return false;
  }

  await supabaseAdmin
    .from('phone_number_pool')
    .update({
      status: 'available',
      assigned_to: null,
      reserved_at: null,
      reserved_until: null,
    })
    .eq('id', poolNumber.id);

  await supabaseAdmin.from('number_assignment_history').insert({
    pool_number_id: poolNumber.id,
    user_id: userId,
    action: 'cancelled',
    reason: 'Checkout abandoned',
  });

  console.log(`[NumberPool] Cancelled reservation for user ${userId}`);

  return true;
}

/**
 * Cleanup expired reservations
 * @returns {number} Number of cleaned up reservations
 */
async function cleanupExpiredReservations() {
  const now = new Date().toISOString();

  const { data: expired } = await supabaseAdmin
    .from('phone_number_pool')
    .select('id, assigned_to')
    .eq('status', 'reserved')
    .lt('reserved_until', now);

  if (!expired || expired.length === 0) {
    return 0;
  }

  for (const record of expired) {
    await supabaseAdmin
      .from('phone_number_pool')
      .update({
        status: 'available',
        assigned_to: null,
        reserved_at: null,
        reserved_until: null,
      })
      .eq('id', record.id);

    if (record.assigned_to) {
      await supabaseAdmin.from('number_assignment_history').insert({
        pool_number_id: record.id,
        user_id: record.assigned_to,
        action: 'cancelled',
        reason: 'Reservation expired',
      });
    }
  }

  console.log(`[NumberPool] Cleaned up ${expired.length} expired reservations`);

  return expired.length;
}

/**
 * Recycle released numbers back to available (after cooldown)
 * @param {number} cooldownHours - Hours before recycling
 * @returns {number} Number of recycled numbers
 */
async function recycleReleasedNumbers(cooldownHours = 24) {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - cooldownHours);

  const { data, error } = await supabaseAdmin
    .from('phone_number_pool')
    .update({ status: 'available' })
    .eq('status', 'released')
    .lt('updated_at', cutoff.toISOString())
    .select();

  if (error) {
    console.error('[NumberPool] Error recycling numbers:', error);
    return 0;
  }

  if (data && data.length > 0) {
    console.log(`[NumberPool] Recycled ${data.length} numbers back to pool`);
  }

  return data?.length || 0;
}

/**
 * Get pool statistics
 * @param {string} region - Region filter (optional)
 * @returns {Object} Pool statistics
 */
async function getPoolStats(region = null) {
  let query = supabaseAdmin.from('phone_number_pool').select('status, region');

  if (region) {
    query = query.eq('region', region);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  const stats = {
    total: data.length,
    available: data.filter((n) => n.status === 'available').length,
    reserved: data.filter((n) => n.status === 'reserved').length,
    assigned: data.filter((n) => n.status === 'assigned').length,
    released: data.filter((n) => n.status === 'released').length,
    byRegion: {},
  };

  // Group by region
  for (const number of data) {
    if (!stats.byRegion[number.region]) {
      stats.byRegion[number.region] = { total: 0, available: 0 };
    }
    stats.byRegion[number.region].total++;
    if (number.status === 'available') {
      stats.byRegion[number.region].available++;
    }
  }

  return stats;
}

/**
 * Add a number to the pool (admin function)
 * @param {Object} numberData - Number data
 * @returns {Object} Created pool record
 */
async function addNumberToPool(numberData) {
  const {
    phoneNumber,
    region = 'IE',
    provider = 'voipcloud',
    voipcloudDidId,
    vapiPhoneId,
    capabilities = { voice: true, sms: false },
    monthlyCostCents = 0,
    notes,
  } = numberData;

  const { data, error } = await supabaseAdmin
    .from('phone_number_pool')
    .insert({
      phone_number: phoneNumber,
      region,
      provider,
      voipcloud_did_id: voipcloudDidId,
      vapi_phone_id: vapiPhoneId,
      capabilities,
      monthly_cost_cents: monthlyCostCents,
      notes,
      status: 'available',
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  console.log(`[NumberPool] Added ${phoneNumber} to pool`);

  return data;
}

module.exports = {
  getAvailableNumber,
  reserveNumber,
  assignNumber,
  releaseNumber,
  cancelReservation,
  cleanupExpiredReservations,
  recycleReleasedNumbers,
  getPoolStats,
  addNumberToPool,
};
