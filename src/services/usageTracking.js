/**
 * Usage Tracking Service
 *
 * Handles call tracking for VoiceFleet pricing model (Jan 2026):
 * - Starter: €49/mo - 100 inbound calls/month
 * - Growth: €199/mo - 500 inbound calls/month
 * - Pro: €599/mo - 1500 inbound + 200 outbound calls/month
 *
 * Plan configuration is now loaded from the database via planConfig service.
 */

const { supabaseAdmin } = require('./supabase');
const { getPricingForRegion, getRegionConfig } = require('./geoLocation');
const { sendUsageAlertEmail, isEmailConfigured } = require('./emailService');
const planConfig = require('./planConfig');

// Alert thresholds for usage notifications
const ALERT_THRESHOLDS = [80, 100]; // Notify at 80% and 100%

// Legacy constants for backwards compatibility (deprecated - use planConfig instead)
// These will be removed in a future version
const PER_CALL_RATES = {
  starter: 0,    // €0 - included in plan
  growth: 0,     // €0 - included in plan
  pro: 0         // €0 - included in plan
};

const FAIR_USE_CAPS = {
  starter: 100,   // 100 calls/month
  growth: 500,    // 500 calls/month
  pro: 1500       // 1500 calls/month
};

const PHONE_LIMITS = {
  starter: 1,
  growth: 1,
  pro: 1
};

/**
 * Get per-call rate for a plan (in cents)
 * Now reads from database via planConfig service
 * @param {string} planId - Plan identifier
 * @param {string} region - Region code (US or IE) - kept for API compatibility
 * @returns {Promise<number>} Per-call rate in cents
 */
async function getPerCallRate(planId, region = 'IE') {
  // Try to get from database first
  try {
    const rate = await planConfig.getPerCallRate(planId);
    return rate;
  } catch (err) {
    console.warn('[UsageTracking] Falling back to hardcoded rate:', err.message);
  }

  // Fallback to region config or hardcoded values
  const config = getRegionConfig(region);
  const plan = config.plans[planId];

  if (plan && typeof plan.perCallPrice === 'number') {
    return Math.round(plan.perCallPrice * 100); // Convert to cents
  }

  return PER_CALL_RATES[planId] || PER_CALL_RATES.starter;
}

/**
 * Get fair use cap for a plan
 * Now reads from database via planConfig service
 * @param {string} planId - Plan identifier
 * @returns {Promise<number|null>} Cap or null if no cap
 */
async function getFairUseCap(planId) {
  // Try to get from database first
  try {
    const cap = await planConfig.getFairUseCap(planId);
    return cap;
  } catch (err) {
    console.warn('[UsageTracking] Falling back to hardcoded cap:', err.message);
  }

  // Fallback to region config or hardcoded values
  const config = getRegionConfig('IE');
  const plan = config.plans[planId];

  if (plan && plan.callsCap) {
    return plan.callsCap;
  }

  return FAIR_USE_CAPS[planId];
}

/**
 * Check if a user can make a call (fair use enforcement)
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @returns {Promise<{allowed: boolean, callsUsed: number, callsRemaining: number|null, reason: string}>}
 */
async function canMakeCall(userId, planId) {
  const cap = await getFairUseCap(planId);

  // Get current month's usage
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('calls_made')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .single();

  const callsUsed = usage?.calls_made || 0;

  // No cap means unlimited (pay per call)
  if (!cap) {
    return {
      allowed: true,
      callsUsed,
      callsRemaining: null, // null = unlimited
      reason: 'pay_per_call'
    };
  }

  // Check against fair use cap
  if (callsUsed >= cap) {
    return {
      allowed: false,
      callsUsed,
      callsRemaining: 0,
      reason: 'fair_use_cap_exceeded'
    };
  }

  return {
    allowed: true,
    callsUsed,
    callsRemaining: cap - callsUsed,
    reason: 'within_cap'
  };
}

/**
 * Record a call and calculate charges
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {number} vapiCostCents - Actual Vapi cost (for margin tracking)
 * @param {string} callId - Call history ID
 * @param {boolean} isTrial - Whether user is in trial
 * @returns {Promise<{costCents: number, callsUsed: number}>}
 */
async function recordCall(userId, planId, vapiCostCents = 0, callId = null, isTrial = false) {
  const perCallRate = await getPerCallRate(planId);
  const costCents = isTrial ? 0 : perCallRate;

  // Get current billing period
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  periodEnd.setDate(0); // Last day of current month

  if (isTrial) {
    // Update trial usage - check if record exists first
    const { data: existingTrial } = await supabaseAdmin
      .from('trial_usage')
      .select('id, calls_made')
      .eq('user_id', userId)
      // Keep chaining consistent with other queries (and with existing Jest mocks)
      .eq('user_id', userId)
      .single();

    if (existingTrial) {
      // Increment existing trial usage
      await supabaseAdmin
        .from('trial_usage')
        .update({
          calls_made: existingTrial.calls_made + 1,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    } else {
      // Create new trial usage record
      await supabaseAdmin
        .from('trial_usage')
        .insert({
          user_id: userId,
          calls_made: 1,
          minutes_used: 0,
          total_cost_cents: 0,
          updated_at: new Date().toISOString()
        });
    }
  } else {
    // Update usage_tracking for billing period
    const { data: existing } = await supabaseAdmin
      .from('usage_tracking')
      .select('id, calls_made, total_call_charges_cents')
      .eq('user_id', userId)
      .eq('period_start', periodStart.toISOString().slice(0, 10))
      .single();

    if (existing) {
      // Update existing record
      await supabaseAdmin
        .from('usage_tracking')
        .update({
          calls_made: existing.calls_made + 1,
          total_call_charges_cents: (existing.total_call_charges_cents || 0) + costCents,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Create new record
      await supabaseAdmin
        .from('usage_tracking')
        .insert({
          user_id: userId,
          period_start: periodStart.toISOString().slice(0, 10),
          period_end: periodEnd.toISOString().slice(0, 10),
          calls_made: 1,
          minutes_used: 0,
          total_call_charges_cents: costCents
        });
    }
  }

  // Update call_history with cost if callId provided
  if (callId) {
    await supabaseAdmin
      .from('call_history')
      .update({
        cost_cents: costCents,
        vapi_cost_cents: vapiCostCents,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId);
  }

  // Get updated call count
  const { data: updatedUsage } = await supabaseAdmin
    .from('usage_tracking')
    .select('calls_made')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .single();

  const callsUsed = updatedUsage?.calls_made || 1;

  // Check and send usage alerts (async, don't block)
  if (!isTrial) {
    checkAndSendUsageAlert(userId, planId, callsUsed)
      .catch(err => console.error('[UsageTracking] Error checking usage alert:', err.message));
  }

  return {
    costCents,
    callsUsed
  };
}

/**
 * Check if usage alert should be sent and send it
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {number} callsUsed - Current number of calls used
 */
async function checkAndSendUsageAlert(userId, planId, callsUsed) {
  if (!isEmailConfigured()) return;

  const cap = await getFairUseCap(planId);

  // Only send alerts for plans with caps
  if (!cap) return;

  const percentUsed = Math.round((callsUsed / cap) * 100);

  // Check if we've crossed an alert threshold
  for (const threshold of ALERT_THRESHOLDS) {
    const previousCallCount = callsUsed - 1;
    const previousPercent = Math.round((previousCallCount / cap) * 100);

    // If we just crossed this threshold with this call
    if (previousPercent < threshold && percentUsed >= threshold) {
      // Check if we've already sent this alert
      const alertType = `usage_alert_${threshold}`;
      const periodStart = new Date();
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);

      const { data: existingAlert } = await supabaseAdmin
        .from('email_logs')
        .select('id')
        .eq('user_id', userId)
        .eq('email_type', alertType)
        .gte('created_at', periodStart.toISOString())
        .single();

      if (existingAlert) {
        // Already sent this alert this period
        continue;
      }

      // Send the alert
      sendUsageAlertEmail(userId, {
        resourceType: 'calls',
        currentUsage: callsUsed,
        limit: cap,
        percentUsed: threshold,
      })
        .then(() => console.log(`[UsageTracking] Sent ${threshold}% usage alert to user ${userId}`))
        .catch((err) => console.error('[UsageTracking] Failed to send usage alert:', err.message));

      // Only send one alert per call
      break;
    }
  }
}

/**
 * Get usage summary for a user
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @returns {Promise<Object>} Usage summary
 */
async function getUsageSummary(userId, planId) {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('calls_made, total_call_charges_cents, period_start, period_end')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .single();

  const callsMade = usage?.calls_made || 0;
  const totalChargesCents = usage?.total_call_charges_cents || 0;
  const cap = await getFairUseCap(planId);
  const perCallRate = await getPerCallRate(planId);

  return {
    callsMade,
    totalChargesCents,
    totalChargesFormatted: `€${(totalChargesCents / 100).toFixed(2)}`,
    perCallRateCents: perCallRate,
    perCallRateFormatted: perCallRate > 0 ? `€${(perCallRate / 100).toFixed(2)}` : 'Included',
    fairUseCap: cap,
    callsRemaining: cap ? Math.max(0, cap - callsMade) : null,
    isUnlimited: !cap || perCallRate === 0,
    periodStart: usage?.period_start || periodStart.toISOString().slice(0, 10),
    periodEnd: usage?.period_end || null
  };
}

/**
 * Get unbilled calls for invoicing
 * @param {string} userId - User ID
 * @returns {Promise<Array>} List of unbilled calls
 */
async function getUnbilledCalls(userId) {
  const { data } = await supabaseAdmin
    .from('call_history')
    .select('id, cost_cents, vapi_cost_cents, created_at, duration_seconds')
    .eq('user_id', userId)
    .eq('billed', false)
    .gt('cost_cents', 0)
    .order('created_at', { ascending: true });

  return data || [];
}

/**
 * Mark calls as billed
 * @param {Array<string>} callIds - Call IDs to mark as billed
 */
async function markCallsAsBilled(callIds) {
  if (!callIds || callIds.length === 0) return;

  await supabaseAdmin
    .from('call_history')
    .update({ billed: true, updated_at: new Date().toISOString() })
    .in('id', callIds);
}

/**
 * Calculate total charges for a billing period
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @returns {Promise<{totalCents: number, callCount: number}>}
 */
async function calculatePeriodCharges(userId, planId) {
  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('calls_made, total_call_charges_cents')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().slice(0, 10))
    .single();

  return {
    totalCents: usage?.total_call_charges_cents || 0,
    callCount: usage?.calls_made || 0
  };
}

/**
 * Get trial usage
 * @param {string} userId - User ID
 * @returns {Promise<{callsMade: number, callsAllowed: number}>}
 */
async function getTrialUsage(userId) {
  const trialCallsAllowed = parseInt(process.env.TRIAL_CALLS || '3', 10);

  const { data } = await supabaseAdmin
    .from('trial_usage')
    .select('calls_made')
    .eq('user_id', userId)
    .single();

  return {
    callsMade: data?.calls_made || 0,
    callsAllowed: trialCallsAllowed,
    callsRemaining: Math.max(0, trialCallsAllowed - (data?.calls_made || 0))
  };
}

module.exports = {
  // Core functions
  canMakeCall,
  recordCall,
  getUsageSummary,
  getTrialUsage,

  // Billing functions
  getUnbilledCalls,
  markCallsAsBilled,
  calculatePeriodCharges,

  // Config helpers
  getPerCallRate,
  getFairUseCap,

  // Constants
  PER_CALL_RATES,
  FAIR_USE_CAPS,
  PHONE_LIMITS
};
