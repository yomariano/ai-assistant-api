/**
 * Base Provider Interface
 *
 * All booking provider adapters must implement this interface.
 * This ensures consistent behavior across different providers.
 */

/**
 * @typedef {Object} ProviderConfig
 * @property {string} accessToken - OAuth access token
 * @property {string} [refreshToken] - OAuth refresh token
 * @property {Date} [tokenExpiresAt] - Token expiration time
 * @property {string} [apiKey] - API key (for non-OAuth providers)
 * @property {string} [apiSecret] - API secret
 * @property {string} [externalAccountId] - Account ID in external system
 * @property {Object} [config] - Provider-specific configuration
 */

/**
 * @typedef {Object} TimeSlot
 * @property {string} startTime - ISO 8601 datetime
 * @property {string} endTime - ISO 8601 datetime
 * @property {boolean} available - Whether the slot is available
 * @property {string} [eventTypeId] - External event type/service ID
 */

/**
 * @typedef {Object} ExternalBooking
 * @property {string} externalId - ID in the external system
 * @property {string} status - Booking status
 * @property {string} startTime - ISO 8601 datetime
 * @property {string} endTime - ISO 8601 datetime
 * @property {string} [customerName] - Customer name
 * @property {string} [customerEmail] - Customer email
 * @property {string} [customerPhone] - Customer phone
 * @property {Object} [metadata] - Additional booking data
 */

/**
 * @typedef {Object} CreateBookingParams
 * @property {string} eventTypeId - External event type/service ID
 * @property {string} startTime - ISO 8601 datetime
 * @property {string} [endTime] - ISO 8601 datetime
 * @property {string} customerName - Customer name
 * @property {string} customerEmail - Customer email
 * @property {string} [customerPhone] - Customer phone
 * @property {Object} [metadata] - Additional booking data
 */

/**
 * @typedef {Object} EventType
 * @property {string} id - External ID
 * @property {string} name - Event type name
 * @property {number} [duration] - Duration in minutes
 * @property {string} [description] - Description
 * @property {Object} [metadata] - Additional data
 */

/**
 * Abstract base class for booking provider adapters
 */
class BaseProviderAdapter {
  constructor(config) {
    if (this.constructor === BaseProviderAdapter) {
      throw new Error('BaseProviderAdapter is abstract and cannot be instantiated directly');
    }
    this.config = config;
    this.providerId = null; // Must be set by subclass
  }

  /**
   * Get the provider ID
   * @returns {string}
   */
  getProviderId() {
    return this.providerId;
  }

  /**
   * Test the connection to the provider
   * @returns {Promise<{success: boolean, error?: string, accountInfo?: Object}>}
   */
  async testConnection() {
    throw new Error('testConnection() must be implemented by subclass');
  }

  /**
   * Get account information from the provider
   * @returns {Promise<{id: string, name: string, email?: string, metadata?: Object}>}
   */
  async getAccountInfo() {
    throw new Error('getAccountInfo() must be implemented by subclass');
  }

  /**
   * Refresh the OAuth access token
   * @returns {Promise<{accessToken: string, refreshToken?: string, expiresAt: Date}>}
   */
  async refreshAccessToken() {
    throw new Error('refreshAccessToken() must be implemented by subclass');
  }

  /**
   * Get available event types/services
   * @returns {Promise<EventType[]>}
   */
  async getEventTypes() {
    throw new Error('getEventTypes() must be implemented by subclass');
  }

  /**
   * Get available time slots
   * @param {string} eventTypeId - Event type ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<TimeSlot[]>}
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    throw new Error('getAvailability() must be implemented by subclass');
  }

  /**
   * Get bookings within a date range
   * @param {string} [startDate] - Start date (YYYY-MM-DD)
   * @param {string} [endDate] - End date (YYYY-MM-DD)
   * @returns {Promise<ExternalBooking[]>}
   */
  async getBookings(startDate, endDate) {
    throw new Error('getBookings() must be implemented by subclass');
  }

  /**
   * Get a specific booking
   * @param {string} externalId - External booking ID
   * @returns {Promise<ExternalBooking|null>}
   */
  async getBooking(externalId) {
    throw new Error('getBooking() must be implemented by subclass');
  }

  /**
   * Create a new booking
   * @param {CreateBookingParams} params - Booking parameters
   * @returns {Promise<ExternalBooking>}
   */
  async createBooking(params) {
    throw new Error('createBooking() must be implemented by subclass');
  }

  /**
   * Update an existing booking
   * @param {string} externalId - External booking ID
   * @param {Partial<CreateBookingParams>} params - Updated parameters
   * @returns {Promise<ExternalBooking>}
   */
  async updateBooking(externalId, params) {
    throw new Error('updateBooking() must be implemented by subclass');
  }

  /**
   * Cancel a booking
   * @param {string} externalId - External booking ID
   * @param {string} [reason] - Cancellation reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelBooking(externalId, reason) {
    throw new Error('cancelBooking() must be implemented by subclass');
  }

  /**
   * Register a webhook for real-time updates
   * @param {string} webhookUrl - URL to receive webhook events
   * @param {string[]} events - Event types to subscribe to
   * @returns {Promise<{webhookId: string, secret?: string}>}
   */
  async registerWebhook(webhookUrl, events) {
    throw new Error('registerWebhook() must be implemented by subclass');
  }

  /**
   * Verify a webhook signature
   * @param {string} payload - Raw webhook payload
   * @param {string} signature - Webhook signature header
   * @param {string} secret - Webhook secret
   * @returns {boolean}
   */
  verifyWebhookSignature(payload, signature, secret) {
    throw new Error('verifyWebhookSignature() must be implemented by subclass');
  }

  /**
   * Parse a webhook payload into a standardized format
   * @param {Object} payload - Webhook payload
   * @returns {Promise<{eventType: string, booking?: ExternalBooking, rawData: Object}>}
   */
  async parseWebhookPayload(payload) {
    throw new Error('parseWebhookPayload() must be implemented by subclass');
  }

  /**
   * Helper method to make authenticated API requests
   * @protected
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {Object} [data] - Request body
   * @param {Object} [headers] - Additional headers
   * @returns {Promise<Object>}
   */
  async apiRequest(method, endpoint, data, headers = {}) {
    throw new Error('apiRequest() must be implemented by subclass');
  }
}

module.exports = { BaseProviderAdapter };
