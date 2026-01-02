/**
 * Voice AI Provider Factory
 *
 * Returns the appropriate voice AI provider based on environment configuration.
 *
 * Environment Variables:
 * - VOICE_PROVIDER: 'vapi' | 'mock' (default: based on NODE_ENV)
 * - VAPI_API_KEY: Required for real Vapi provider
 *
 * Usage:
 *   const { getVoiceProvider } = require('./adapters/voice');
 *   const provider = getVoiceProvider();
 *   const assistant = await provider.createAssistant(config);
 */

const { VapiProvider } = require('./vapi');
const { VapiMockProvider } = require('./vapi-mock');

// Singleton instance
let providerInstance = null;

/**
 * Determine which provider to use based on environment
 */
function getProviderType() {
  // Explicit override via environment variable
  if (process.env.VOICE_PROVIDER) {
    return process.env.VOICE_PROVIDER;
  }

  // E2E mode always uses mock
  if (process.env.E2E_MODE === 'true') {
    return 'mock';
  }

  // Development mode uses mock by default (unless VAPI_API_KEY is set)
  if (process.env.NODE_ENV === 'development' || process.env.DEV_MODE === 'true') {
    // If API key is provided, use real provider even in dev
    if (process.env.VAPI_API_KEY) {
      console.log('[Voice] Using real Vapi in development (API key provided)');
      return 'vapi';
    }
    return 'mock';
  }

  // Test environment uses mock
  if (process.env.NODE_ENV === 'test') {
    return 'mock';
  }

  // Production uses real provider
  return 'vapi';
}

/**
 * Get the voice AI provider instance
 *
 * @param {Object} options - Provider options
 * @param {boolean} options.forceNew - Create new instance instead of using singleton
 * @param {string} options.type - Override provider type ('vapi' | 'mock')
 * @returns {VapiProvider|VapiMockProvider}
 */
function getVoiceProvider(options = {}) {
  const { forceNew = false, type = null } = options;

  // Return existing instance if available and not forcing new
  if (providerInstance && !forceNew && !type) {
    return providerInstance;
  }

  const providerType = type || getProviderType();

  console.log(`[Voice] Initializing ${providerType} provider`);

  switch (providerType) {
    case 'vapi':
      providerInstance = new VapiProvider();
      break;

    case 'mock':
      providerInstance = new VapiMockProvider({
        simulateDelay: process.env.MOCK_DELAY ? parseInt(process.env.MOCK_DELAY) : 50,
        failureRate: process.env.MOCK_FAILURE_RATE ? parseFloat(process.env.MOCK_FAILURE_RATE) : 0,
      });
      break;

    default:
      throw new Error(`Unknown voice provider: ${providerType}`);
  }

  return providerInstance;
}

/**
 * Reset the provider instance (useful for testing)
 */
function resetVoiceProvider() {
  if (providerInstance && providerInstance.clearMockData) {
    providerInstance.clearMockData();
  }
  providerInstance = null;
}

module.exports = {
  getVoiceProvider,
  resetVoiceProvider,
  VapiProvider,
  VapiMockProvider,
};
