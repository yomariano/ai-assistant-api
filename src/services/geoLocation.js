/**
 * Geo-Location Service
 *
 * Handles region detection and geo-targeted pricing for US and Ireland markets.
 */

const axios = require('axios');

// Region configuration with pricing and provider info
// OrderBot.ie Pricing Strategy (January 2026)
// LITE: €19/mo + €0.95/call | GROWTH: €99/mo + €0.45/call | PRO: €249/mo unlimited
const REGION_CONFIG = {
  US: {
    code: 'US',
    name: 'United States',
    currency: 'USD',
    currencySymbol: '$',
    telephonyProvider: 'telnyx',
    defaultCountryCode: '+1',
    plans: {
      starter: {
        name: 'Lite',
        price: 19,
        perCallPrice: 0.95,
        monthlyMinutes: 0, // Pay per call model
        priceId: process.env.STRIPE_STARTER_PRICE_USD || process.env.STRIPE_STARTER_PRICE,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_STARTER_USD || process.env.STRIPE_PAYMENT_LINK_STARTER,
      },
      growth: {
        name: 'Growth',
        price: 99,
        perCallPrice: 0.45,
        monthlyMinutes: 0, // Pay per call model
        priceId: process.env.STRIPE_GROWTH_PRICE_USD || process.env.STRIPE_GROWTH_PRICE,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_GROWTH_USD || process.env.STRIPE_PAYMENT_LINK_GROWTH,
      },
      scale: {
        name: 'Pro',
        price: 249,
        perCallPrice: 0, // Unlimited
        monthlyMinutes: 0, // Unlimited (1500 fair use cap)
        callsCap: 1500,
        priceId: process.env.STRIPE_SCALE_PRICE_USD || process.env.STRIPE_SCALE_PRICE,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_SCALE_USD || process.env.STRIPE_PAYMENT_LINK_SCALE,
      },
    },
  },
  IE: {
    code: 'IE',
    name: 'Ireland',
    currency: 'EUR',
    currencySymbol: '€',
    telephonyProvider: 'voipcloud',
    defaultCountryCode: '+353',
    plans: {
      starter: {
        name: 'Lite',
        price: 19,
        perCallPrice: 0.95,
        monthlyMinutes: 0, // Pay per call model
        priceId: process.env.STRIPE_STARTER_PRICE_EUR,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_STARTER_EUR,
      },
      growth: {
        name: 'Growth',
        price: 99,
        perCallPrice: 0.45,
        monthlyMinutes: 0, // Pay per call model
        priceId: process.env.STRIPE_GROWTH_PRICE_EUR,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_GROWTH_EUR,
      },
      scale: {
        name: 'Pro',
        price: 249,
        perCallPrice: 0, // Unlimited
        monthlyMinutes: 0, // Unlimited (1500 fair use cap)
        callsCap: 1500,
        priceId: process.env.STRIPE_SCALE_PRICE_EUR,
        paymentLink: process.env.STRIPE_PAYMENT_LINK_SCALE_EUR,
      },
    },
  },
};

// European countries that use EUR pricing (expand as needed)
const EUR_COUNTRIES = [
  'IE', // Ireland
  'GB', // UK - might use EUR for now
  'DE', // Germany
  'FR', // France
  'ES', // Spain
  'IT', // Italy
  'NL', // Netherlands
  'BE', // Belgium
  'AT', // Austria
  'PT', // Portugal
];

// Default region if detection fails
const DEFAULT_REGION = 'US';

// Cache for IP lookups (simple in-memory cache)
const ipCache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Detect region from IP address
 * @param {string} ip - Client IP address
 * @returns {Promise<string>} Region code ('US' or 'IE')
 */
async function detectRegion(ip) {
  // Skip detection for local/private IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    console.log('[GeoLocation] Local IP detected, using default region');
    return DEFAULT_REGION;
  }

  // Check cache
  const cached = ipCache.get(ip);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.region;
  }

  try {
    // Use ip-api.com (free tier: 45 requests/minute)
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=countryCode,status`, {
      timeout: 3000,
    });

    if (response.data.status === 'success') {
      const countryCode = response.data.countryCode;
      const region = mapCountryToRegion(countryCode);

      // Cache the result
      ipCache.set(ip, {
        region,
        countryCode,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      console.log(`[GeoLocation] Detected region ${region} for country ${countryCode}`);
      return region;
    }
  } catch (error) {
    console.error('[GeoLocation] IP detection failed:', error.message);
  }

  return DEFAULT_REGION;
}

/**
 * Map country code to pricing region
 * @param {string} countryCode - ISO 3166-1 alpha-2 country code
 * @returns {string} Region code
 */
function mapCountryToRegion(countryCode) {
  if (EUR_COUNTRIES.includes(countryCode)) {
    return 'IE'; // Use Ireland/EUR region for European countries
  }
  return 'US'; // Default to US/USD for everyone else
}

/**
 * Get region configuration
 * @param {string} region - Region code
 * @returns {Object} Region configuration
 */
function getRegionConfig(region) {
  return REGION_CONFIG[region] || REGION_CONFIG[DEFAULT_REGION];
}

/**
 * Get pricing for a specific region and plan
 * @param {string} region - Region code
 * @param {string} planId - Plan identifier (starter, growth, scale)
 * @returns {Object} Pricing details
 */
function getPricingForRegion(region, planId) {
  const config = getRegionConfig(region);
  const plan = config.plans[planId];

  if (!plan) {
    throw new Error(`Unknown plan: ${planId}`);
  }

  return {
    region: config.code,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    planId,
    price: plan.price,
    monthlyMinutes: plan.monthlyMinutes,
    priceId: plan.priceId,
    paymentLink: plan.paymentLink,
    formattedPrice: `${config.currencySymbol}${plan.price}`,
  };
}

/**
 * Get all pricing for a region
 * @param {string} region - Region code
 * @returns {Object} All plans with pricing
 */
function getAllPricingForRegion(region) {
  const config = getRegionConfig(region);

  return {
    region: config.code,
    regionName: config.name,
    currency: config.currency,
    currencySymbol: config.currencySymbol,
    telephonyProvider: config.telephonyProvider,
    plans: Object.entries(config.plans).map(([id, plan]) => ({
      id,
      name: plan.name,
      price: plan.price,
      formattedPrice: `${config.currencySymbol}${plan.price}`,
      monthlyMinutes: plan.monthlyMinutes,
      perCallPrice: plan.perCallPrice,
      callsCap: plan.callsCap || null,
      paymentLink: plan.paymentLink,
      priceId: plan.priceId,
    })),
  };
}

/**
 * Get payment link for region and plan
 * @param {string} region - Region code
 * @param {string} planId - Plan identifier
 * @returns {string|null} Stripe payment link
 */
function getPaymentLinkForRegion(region, planId) {
  const config = getRegionConfig(region);
  return config.plans[planId]?.paymentLink || null;
}

/**
 * Get Stripe price ID for region and plan
 * @param {string} region - Region code
 * @param {string} planId - Plan identifier
 * @returns {string|null} Stripe price ID
 */
function getPriceIdForRegion(region, planId) {
  const config = getRegionConfig(region);
  return config.plans[planId]?.priceId || null;
}

/**
 * Extract client IP from request
 * @param {Object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIp(req) {
  // Check various headers (in order of preference)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  return (
    req.headers['x-real-ip'] ||
    req.headers['cf-connecting-ip'] || // Cloudflare
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    '127.0.0.1'
  );
}

/**
 * Clear the IP cache (for testing)
 */
function clearCache() {
  ipCache.clear();
}

module.exports = {
  detectRegion,
  getRegionConfig,
  getPricingForRegion,
  getAllPricingForRegion,
  getPaymentLinkForRegion,
  getPriceIdForRegion,
  getClientIp,
  mapCountryToRegion,
  clearCache,
  REGION_CONFIG,
  EUR_COUNTRIES,
  DEFAULT_REGION,
};
