/**
 * Voice AI Provider Interface
 *
 * All voice AI adapters (Vapi, mock, etc.) must implement this interface.
 * This allows switching between real and mock implementations for testing.
 */

/**
 * @typedef {Object} VoiceAssistant
 * @property {string} id - Provider's ID for the assistant
 * @property {string} name - Assistant name
 * @property {Object} model - LLM configuration
 * @property {Object} voice - Voice configuration
 * @property {string} firstMessage - Initial greeting message
 * @property {string} [systemPrompt] - System instructions
 */

/**
 * @typedef {Object} VoicePhoneNumber
 * @property {string} id - Provider's ID for the phone number
 * @property {string} number - Phone number (E.164 format)
 * @property {string} provider - Telephony provider (telnyx, twilio, etc.)
 * @property {string} [assistantId] - Assigned assistant ID
 */

/**
 * @typedef {Object} VoiceCall
 * @property {string} id - Call ID
 * @property {string} status - Call status
 * @property {number} [duration] - Call duration in seconds
 * @property {string} [transcript] - Call transcript
 */

/**
 * Voice AI Provider Interface
 *
 * @interface VoiceAIProvider
 */
const VoiceAIProviderInterface = {
  /**
   * Get the provider name
   * @returns {string}
   */
  getName: () => {},

  /**
   * Create a voice assistant
   * @param {Object} config - Assistant configuration
   * @returns {Promise<VoiceAssistant>}
   */
  createAssistant: async (config) => {},

  /**
   * Update a voice assistant
   * @param {string} assistantId - Assistant ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<VoiceAssistant>}
   */
  updateAssistant: async (assistantId, updates) => {},

  /**
   * Delete a voice assistant
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<boolean>}
   */
  deleteAssistant: async (assistantId) => {},

  /**
   * Get assistant details
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<VoiceAssistant>}
   */
  getAssistant: async (assistantId) => {},

  /**
   * Import a phone number from telephony provider
   * @param {string} phoneNumber - Phone number to import
   * @param {string} provider - Telephony provider name
   * @param {Object} [options] - Additional options
   * @returns {Promise<VoicePhoneNumber>}
   */
  importPhoneNumber: async (phoneNumber, provider, options) => {},

  /**
   * Delete/release a phone number
   * @param {string} phoneNumberId - Provider's phone number ID
   * @returns {Promise<boolean>}
   */
  deletePhoneNumber: async (phoneNumberId) => {},

  /**
   * Assign assistant to phone number
   * @param {string} phoneNumberId - Phone number ID
   * @param {string} assistantId - Assistant ID
   * @returns {Promise<boolean>}
   */
  assignAssistantToNumber: async (phoneNumberId, assistantId) => {},

  /**
   * Create an outbound call
   * @param {Object} callConfig - Call configuration
   * @returns {Promise<VoiceCall>}
   */
  createCall: async (callConfig) => {},

  /**
   * Get call status/details
   * @param {string} callId - Call ID
   * @returns {Promise<VoiceCall>}
   */
  getCall: async (callId) => {},
};

module.exports = { VoiceAIProviderInterface };
