/**
 * Plan Configuration Service
 *
 * Single source of truth for plan limits and pricing.
 * Reads from database with caching for performance.
 *
 * Usage:
 *   const { getPlanConfig, getPerCallRate, getFairUseCap } = require('./planConfig');
 *   const config = await getPlanConfig('growth');
 *   const rate = await getPerCallRate('starter');
 */

const { supabaseAdmin } = require('./supabase');

// Cache for plan configurations (refreshed every 5 minutes)
let planCache = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Load all plans from database
 * @returns {Promise<Object>} Map of planId -> planConfig
 */
async function loadPlans() {
  const now = Date.now();

  // Return cached data if valid
  if (planCache && now < cacheExpiry) {
    return planCache;
  }

  try {
    const { data: plans, error } = await supabaseAdmin
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) {
      console.error('[PlanConfig] Failed to load plans:', error.message);
      // Return cached data or fallback if DB fails
      return planCache || getFallbackPlans();
    }

    // Build cache as { planId: planConfig }
    planCache = {};
    for (const plan of plans) {
      planCache[plan.id] = {
        id: plan.id,
        name: plan.name,
        displayName: plan.display_name || plan.name,
        description: plan.description,
        priceCents: plan.price_cents,
        perCallCents: plan.per_call_cents || 0,
        // Use inbound_calls_limit as the fair use cap (calls_cap is legacy naming)
        callsCap: plan.inbound_calls_limit || plan.calls_cap || null,
        inboundCallsLimit: plan.inbound_calls_limit || 100,
        outboundCallsLimit: plan.outbound_calls_limit || 0,
        phoneNumbers: plan.phone_numbers || 1,
        maxMinutesPerCall: plan.max_minutes_per_call || 15,
        features: plan.features || [],
      };
    }

    cacheExpiry = now + CACHE_TTL_MS;
    console.log(`[PlanConfig] Loaded ${Object.keys(planCache).length} plans from database`);
    return planCache;
  } catch (err) {
    console.error('[PlanConfig] Error loading plans:', err);
    return planCache || getFallbackPlans();
  }
}

/**
 * Fallback plans if database is unavailable
 * These match the VoiceFleet Jan 2026 pricing model
 */
function getFallbackPlans() {
  console.warn('[PlanConfig] Using fallback plans (database unavailable)');
  return {
    starter: {
      id: 'starter',
      name: 'Starter',
      displayName: 'Starter',
      priceCents: 4900,
      perCallCents: 0,
      callsCap: 100,
      inboundCallsLimit: 100,
      outboundCallsLimit: 0,
      phoneNumbers: 1,
      maxMinutesPerCall: 15,
    },
    growth: {
      id: 'growth',
      name: 'Growth',
      displayName: 'Growth',
      priceCents: 19900,
      perCallCents: 0,
      callsCap: 500,
      inboundCallsLimit: 500,
      outboundCallsLimit: 0,
      phoneNumbers: 1,
      maxMinutesPerCall: 15,
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      displayName: 'Pro',
      priceCents: 59900,
      perCallCents: 0,
      callsCap: 1500,
      inboundCallsLimit: 1500,
      outboundCallsLimit: 200,
      phoneNumbers: 1,
      maxMinutesPerCall: 30,
    },
  };
}

/**
 * Get configuration for a specific plan
 * @param {string} planId - Plan identifier (starter, growth, pro)
 * @returns {Promise<Object>} Plan configuration
 */
async function getPlanConfig(planId) {
  const plans = await loadPlans();
  return plans[planId] || plans.starter;
}

/**
 * Get all active plans
 * @returns {Promise<Object>} Map of all plans
 */
async function getAllPlans() {
  return await loadPlans();
}

/**
 * Get per-call rate for a plan (in cents)
 * @param {string} planId - Plan identifier
 * @returns {Promise<number>} Per-call rate in cents
 */
async function getPerCallRate(planId) {
  const config = await getPlanConfig(planId);
  return config.perCallCents;
}

/**
 * Get fair use cap for a plan (inbound calls limit)
 * @param {string} planId - Plan identifier
 * @returns {Promise<number|null>} Cap or null if unlimited
 */
async function getFairUseCap(planId) {
  const config = await getPlanConfig(planId);
  // callsCap is populated from inbound_calls_limit in the database
  return config.callsCap || config.inboundCallsLimit || null;
}

/**
 * Get inbound calls limit for a plan
 * @param {string} planId - Plan identifier
 * @returns {Promise<number>} Inbound calls limit
 */
async function getInboundCallsLimit(planId) {
  const config = await getPlanConfig(planId);
  return config.inboundCallsLimit || 100;
}

/**
 * Get outbound calls limit for a plan
 * @param {string} planId - Plan identifier
 * @returns {Promise<number>} Outbound calls limit (0 for starter/growth, 200 for pro)
 */
async function getOutboundCallsLimit(planId) {
  const config = await getPlanConfig(planId);
  return config.outboundCallsLimit || 0;
}

/**
 * Get phone number limit for a plan
 * @param {string} planId - Plan identifier
 * @returns {Promise<number>} Number of phone numbers allowed
 */
async function getPhoneNumberLimit(planId) {
  const config = await getPlanConfig(planId);
  return config.phoneNumbers;
}

/**
 * Get max minutes per call for a plan
 * @param {string} planId - Plan identifier
 * @returns {Promise<number>} Max minutes per call
 */
async function getMaxMinutesPerCall(planId) {
  const config = await getPlanConfig(planId);
  return config.maxMinutesPerCall;
}

/**
 * Check if a user can make a call (fair use enforcement)
 * @param {string} userId - User ID
 * @param {string} planId - Plan ID
 * @param {number} currentCallCount - Current calls this period
 * @returns {Promise<{allowed: boolean, reason: string, callsRemaining: number|null}>}
 */
async function canMakeCall(planId, currentCallCount) {
  const cap = await getFairUseCap(planId);

  // No cap = unlimited (pay per call)
  if (!cap) {
    return {
      allowed: true,
      reason: 'pay_per_call',
      callsRemaining: null,
    };
  }

  // Check against cap
  if (currentCallCount >= cap) {
    return {
      allowed: false,
      reason: 'fair_use_cap_exceeded',
      callsRemaining: 0,
    };
  }

  return {
    allowed: true,
    reason: 'within_cap',
    callsRemaining: cap - currentCallCount,
  };
}

/**
 * Clear the cache (useful for testing or after plan updates)
 */
function clearCache() {
  planCache = null;
  cacheExpiry = 0;
}

module.exports = {
  getPlanConfig,
  getAllPlans,
  getPerCallRate,
  getFairUseCap,
  getInboundCallsLimit,
  getOutboundCallsLimit,
  getPhoneNumberLimit,
  getMaxMinutesPerCall,
  canMakeCall,
  clearCache,
};
