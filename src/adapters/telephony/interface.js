/**
 * Telephony Provider Interface
 *
 * All telephony adapters (Telnyx, mock, etc.) must implement this interface.
 * This allows switching between real and mock implementations for testing.
 */

/**
 * @typedef {Object} PhoneNumber
 * @property {string} id - Provider's ID for the phone number
 * @property {string} phone_number - The actual phone number (E.164 format)
 * @property {string} [status] - Status of the number
 */

/**
 * @typedef {Object} SearchOptions
 * @property {string} [countryCode] - Country code (default: 'US')
 * @property {string[]} [features] - Required features (default: ['sms', 'voice'])
 * @property {string} [numberType] - Type of number (default: 'local')
 * @property {string} [areaCode] - Specific area code to search
 */

/**
 * @typedef {Object} NumberOrder
 * @property {string} id - Order ID
 * @property {string} status - Order status ('pending', 'success', 'failed')
 * @property {PhoneNumber[]} phone_numbers - Ordered phone numbers
 */

/**
 * Telephony Provider Interface
 *
 * @interface TelephonyProvider
 */
const TelephonyProviderInterface = {
  /**
   * Get the provider name
   * @returns {string}
   */
  getName: () => {},

  /**
   * Search for available phone numbers
   * @param {number} limit - Number of results to return
   * @param {SearchOptions} options - Search options
   * @returns {Promise<PhoneNumber[]>}
   */
  searchAvailableNumbers: async (limit, options) => {},

  /**
   * Purchase phone numbers
   * @param {PhoneNumber[]} numbers - Numbers to purchase
   * @returns {Promise<PhoneNumber[]>} - Purchased numbers with IDs
   */
  purchaseNumbers: async (numbers) => {},

  /**
   * Release/delete a phone number
   * @param {string} phoneNumberId - Provider's ID for the number
   * @returns {Promise<boolean>}
   */
  releaseNumber: async (phoneNumberId) => {},

  /**
   * Assign phone number to a voice application
   * @param {string} phoneNumberId - Provider's ID for the number
   * @param {string} applicationId - Voice application ID
   * @returns {Promise<boolean>}
   */
  assignToVoiceApp: async (phoneNumberId, applicationId) => {},

  /**
   * Get phone number details
   * @param {string} phoneNumberId - Provider's ID for the number
   * @returns {Promise<PhoneNumber>}
   */
  getNumber: async (phoneNumberId) => {},
};

module.exports = { TelephonyProviderInterface };
