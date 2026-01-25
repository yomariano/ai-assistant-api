/**
 * SimplyBook.me Provider Adapter
 *
 * Implements the booking provider interface for SimplyBook.me.
 * SimplyBook uses JSON-RPC 2.0 API with API key authentication.
 *
 * API Documentation: https://simplybook.me/en/api/developer-api
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

class SimplybookAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'simplybook';
    this.apiKey = config.apiKey;
    this.companyLogin = config.config?.companyLogin;
    this.accessToken = null;
    this.tokenExpiresAt = null;

    // SimplyBook has different regional servers:
    // - simplybook.me (US/default)
    // - simplybook.it (Italy/EU)
    // - simplybook.asia (Asia)
    // Users can find their server from Settings > Custom Features > API
    const serverDomain = config.config?.serverDomain || 'simplybook.me';

    // SimplyBook uses different endpoints for different operations
    // Company login goes in headers (X-Company-Login), not in URL
    this.loginUrl = `https://user-api.${serverDomain}/login`;
    this.apiUrl = `https://user-api.${serverDomain}/admin`;
  }

  /**
   * Get authentication token using API key
   */
  async authenticate() {
    // Check if token is still valid
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const response = await axios.post(this.loginUrl, {
      jsonrpc: '2.0',
      method: 'getToken',
      params: [this.companyLogin, this.apiKey],
      id: 1,
    });

    if (response.data.error) {
      throw new Error(`SimplyBook auth error: ${response.data.error.message}`);
    }

    this.accessToken = response.data.result;
    // Token expires in 1 hour
    this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    return this.accessToken;
  }

  /**
   * Make a JSON-RPC API request
   */
  async apiRequest(method, params = []) {
    const token = await this.authenticate();

    const response = await axios.post(this.apiUrl, {
      jsonrpc: '2.0',
      method: method,
      params: params,
      id: Math.floor(Math.random() * 10000),
    }, {
      headers: {
        'X-Company-Login': this.companyLogin,
        'X-Token': token,
      },
    });

    if (response.data.error) {
      const errMsg = response.data.error.message || response.data.error.data || JSON.stringify(response.data.error);
      throw new Error(`SimplyBook API error: ${errMsg}`);
    }

    return response.data.result;
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const companyInfo = await this.apiRequest('getCompanyInfo');
      return {
        success: true,
        accountInfo: {
          id: this.companyLogin,
          name: companyInfo.name,
          email: companyInfo.email,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    const companyInfo = await this.apiRequest('getCompanyInfo');

    return {
      id: this.companyLogin,
      name: companyInfo.name,
      email: companyInfo.email,
      metadata: {
        phone: companyInfo.phone,
        address: companyInfo.address,
        city: companyInfo.city,
        countryId: companyInfo.country_id,
        postalCode: companyInfo.postal_code,
        website: companyInfo.website,
        timeZone: companyInfo.timezone,
        currency: companyInfo.currency,
      },
    };
  }

  /**
   * SimplyBook uses API keys, not OAuth - this is a no-op
   */
  async refreshAccessToken() {
    // Re-authenticate to get a new token
    this.accessToken = null;
    await this.authenticate();
    return {
      accessToken: this.accessToken,
      expiresAt: this.tokenExpiresAt,
    };
  }

  /**
   * Get event types (services)
   */
  async getEventTypes() {
    const services = await this.apiRequest('getEventList');

    return Object.entries(services).map(([id, service]) => ({
      id: id,
      name: service.name,
      duration: parseInt(service.duration),
      description: service.description,
      metadata: {
        price: service.price,
        currency: service.currency,
        position: service.position,
        isPublic: service.is_public,
        isRecurring: service.is_recurring,
        picture: service.picture,
        picturePreview: service.picture_preview,
      },
    }));
  }

  /**
   * Get availability for a service
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    // Get available days first
    const startTimes = await this.apiRequest('getStartTimeMatrix', [
      startDate,
      endDate,
      eventTypeId,
      null, // unit_id (provider)
      1, // count
    ]);

    const slots = [];

    // startTimes is organized by date
    for (const [date, times] of Object.entries(startTimes || {})) {
      if (Array.isArray(times)) {
        for (const time of times) {
          slots.push({
            startTime: `${date}T${time}:00`,
            endTime: null,
            available: true,
            eventTypeId: eventTypeId,
          });
        }
      }
    }

    return slots;
  }

  /**
   * Get bookings
   */
  async getBookings(startDate, endDate) {
    const bookings = await this.apiRequest('getBookings', [{
      date_from: startDate,
      date_to: endDate,
    }]);

    return (bookings || []).map(b => this.normalizeBooking(b));
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    try {
      const booking = await this.apiRequest('getBookingDetails', [externalId]);
      if (!booking) return null;
      return this.normalizeBooking(booking);
    } catch (error) {
      if (error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new booking
   */
  async createBooking(params) {
    // First, create or find client
    let clientId = params.metadata?.clientId;

    if (!clientId) {
      // Try to find existing client by email
      const clients = await this.apiRequest('getClientList', [{
        search: params.customerEmail,
      }]);

      const existingClient = Object.values(clients || {}).find(
        c => c.email === params.customerEmail
      );

      if (existingClient) {
        clientId = existingClient.id;
      } else {
        // Create new client
        const newClient = await this.apiRequest('addClient', [{
          name: params.customerName,
          email: params.customerEmail,
          phone: params.customerPhone,
        }]);
        clientId = newClient.id || newClient;
      }
    }

    // Parse date and time from startTime
    const startDateTime = new Date(params.startTime);
    const date = startDateTime.toISOString().split('T')[0];
    const time = startDateTime.toTimeString().slice(0, 5);

    // Create booking
    const bookingData = {
      event_id: params.eventTypeId,
      unit_id: params.metadata?.unitId || null,
      date: date,
      time: time,
      client_id: clientId,
      additional_fields: params.metadata?.additionalFields || {},
    };

    const result = await this.apiRequest('book', [
      bookingData.event_id,
      bookingData.unit_id,
      bookingData.date,
      bookingData.time,
      bookingData.client_id,
      bookingData.additional_fields,
    ]);

    // Fetch the created booking details
    const bookingId = result.id || result.booking_id || result;
    const booking = await this.getBooking(bookingId);

    return booking || {
      externalId: bookingId.toString(),
      status: 'confirmed',
      startTime: params.startTime,
      endTime: params.endTime,
      customerName: params.customerName,
      customerEmail: params.customerEmail,
      customerPhone: params.customerPhone,
      metadata: { clientId },
    };
  }

  /**
   * Update a booking (reschedule)
   */
  async updateBooking(externalId, params) {
    // SimplyBook requires canceling and rebooking for reschedule
    // Get current booking first
    const currentBooking = await this.getBooking(externalId);
    if (!currentBooking) {
      throw new Error('Booking not found');
    }

    // If only updating time, we need to cancel and rebook
    if (params.startTime) {
      await this.cancelBooking(externalId, 'Rescheduled');

      // Create new booking with updated time
      return this.createBooking({
        eventTypeId: currentBooking.metadata?.eventId,
        startTime: params.startTime,
        customerName: currentBooking.customerName,
        customerEmail: currentBooking.customerEmail,
        customerPhone: currentBooking.customerPhone,
        metadata: currentBooking.metadata,
      });
    }

    // For other updates, use editBooking if available
    const updateResult = await this.apiRequest('editBooking', [externalId, params]);
    return this.getBooking(externalId);
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    await this.apiRequest('cancelBooking', [externalId]);
    return { success: true };
  }

  /**
   * Register a webhook
   * Note: SimplyBook.me webhooks are configured through their dashboard, not API
   */
  async registerWebhook(webhookUrl, events) {
    // SimplyBook webhooks are typically configured through the dashboard
    // or through the "Callback" custom feature
    console.warn('SimplyBook.me webhooks should be configured through the dashboard or Callback custom feature');

    return {
      webhookId: null,
      secret: null,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    // SimplyBook.me doesn't have standard webhook signatures
    // Verification would depend on their Callback feature configuration
    return true;
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    // SimplyBook callback format
    const eventType = payload.notification_type || payload.type;

    const eventTypeMap = {
      'create': 'booking.created',
      'cancel': 'booking.cancelled',
      'change': 'booking.updated',
    };

    let booking = null;
    if (payload.booking_id) {
      try {
        booking = await this.getBooking(payload.booking_id);
      } catch {
        // If we can't fetch, construct from payload
        booking = {
          externalId: payload.booking_id?.toString(),
          status: eventType === 'cancel' ? 'cancelled' : 'confirmed',
          startTime: payload.start_date_time,
          customerName: payload.client_name,
          customerEmail: payload.client_email,
          customerPhone: payload.client_phone,
        };
      }
    }

    return {
      eventType: eventTypeMap[eventType] || eventType,
      booking,
      rawData: payload,
    };
  }

  /**
   * Normalize a SimplyBook booking to standard format
   */
  normalizeBooking(booking) {
    return {
      externalId: booking.id?.toString() || booking.booking_id?.toString(),
      status: this.normalizeStatus(booking.status || booking.is_confirmed),
      startTime: booking.start_date_time || `${booking.start_date}T${booking.start_time}`,
      endTime: booking.end_date_time || `${booking.end_date}T${booking.end_time}`,
      customerName: booking.client_name || booking.client?.name,
      customerEmail: booking.client_email || booking.client?.email,
      customerPhone: booking.client_phone || booking.client?.phone,
      metadata: {
        eventId: booking.event_id,
        eventName: booking.event_name || booking.event,
        unitId: booking.unit_id,
        unitName: booking.unit_name || booking.unit,
        clientId: booking.client_id || booking.client?.id,
        code: booking.code,
        recordDate: booking.record_date,
        additionalFields: booking.additional_fields,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    if (typeof status === 'boolean') {
      return status ? 'confirmed' : 'pending';
    }

    const statusMap = {
      'confirmed': 'confirmed',
      'pending': 'pending',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      '1': 'confirmed',
      '0': 'cancelled',
    };

    return statusMap[status?.toString()] || status?.toLowerCase() || 'confirmed';
  }

  /**
   * Exchange code for tokens (not used for SimplyBook - API key only)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('SimplyBook.me does not support OAuth. Use API key authentication.');
  }
}

module.exports = { SimplybookAdapter };
