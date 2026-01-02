/**
 * Telephony Provider Factory
 *
 * Returns the appropriate telephony provider based on environment configuration.
 *
 * Environment Variables:
 * - TELEPHONY_PROVIDER: 'telnyx' | 'mock' (default: based on NODE_ENV)
 * - TELNYX_API_KEY: Required for real Telnyx provider
 * - TELNYX_VOICE_APP_ID: Optional voice app ID for Telnyx
 *
 * Usage:
 *   const { getTelephonyProvider } = require('./adapters/telephony');
 *   const provider = getTelephonyProvider();
 *   const numbers = await provider.searchAvailableNumbers(3);
 */

const { TelnyxProvider } = require('./telnyx');
const { TelnyxMockProvider } = require('./telnyx-mock');

// Singleton instance
let providerInstance = null;

/**
 * Determine which provider to use based on environment
 */
function getProviderType() {
  // Explicit override via environment variable
  if (process.env.TELEPHONY_PROVIDER) {
    return process.env.TELEPHONY_PROVIDER;
  }

  // E2E mode always uses mock
  if (process.env.E2E_MODE === 'true') {
    return 'mock';
  }

  // Development mode uses mock by default (unless TELNYX_API_KEY is set)
  if (process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true') {
    // If API key is provided, use real provider even in dev
    if (process.env.TELNYX_API_KEY) {
      console.log('[Telephony] Using real Telnyx in development (API key provided)');
      return 'telnyx';
    }
    return 'mock';
  }

  // Test environment uses mock
  if (process.env.NODE_ENV === 'test') {
    return 'mock';
  }

  // Production uses real provider
  return 'telnyx';
}

/**
 * Get the telephony provider instance
 *
 * @param {Object} options - Provider options
 * @param {boolean} options.forceNew - Create new instance instead of using singleton
 * @param {string} options.type - Override provider type ('telnyx' | 'mock')
 * @returns {TelnyxProvider|TelnyxMockProvider}
 */
function getTelephonyProvider(options = {}) {
  const { forceNew = false, type = null } = options;

  // Return existing instance if available and not forcing new
  if (providerInstance && !forceNew && !type) {
    return providerInstance;
  }

  const providerType = type || getProviderType();

  console.log(`[Telephony] Initializing ${providerType} provider`);

  switch (providerType) {
    case 'telnyx':
      providerInstance = new TelnyxProvider();
      break;

    case 'mock':
      providerInstance = new TelnyxMockProvider({
        simulateDelay: process.env.MOCK_DELAY ? parseInt(process.env.MOCK_DELAY) : 100,
        failureRate: process.env.MOCK_FAILURE_RATE ? parseFloat(process.env.MOCK_FAILURE_RATE) : 0,
      });
      break;

    default:
      throw new Error(`Unknown telephony provider: ${providerType}`);
  }

  return providerInstance;
}

/**
 * Reset the provider instance (useful for testing)
 */
function resetTelephonyProvider() {
  if (providerInstance && providerInstance.clearMockData) {
    providerInstance.clearMockData();
  }
  providerInstance = null;
}

module.exports = {
  getTelephonyProvider,
  resetTelephonyProvider,
  TelnyxProvider,
  TelnyxMockProvider,
};
