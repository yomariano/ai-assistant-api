/**
 * Cal.com Provider Adapter
 *
 * Implements the booking provider interface for Cal.com.
 * Cal.com uses API key authentication and REST API.
 *
 * API Documentation: https://cal.com/docs/api-reference
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://api.cal.com/v1';

class CalcomAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'calcom';
    this.apiKey = config.apiKey;
    this.baseUrl = config.config?.baseUrl || API_BASE_URL;

    // Create axios instance
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(method, endpoint, data = null) {
    const url = `${endpoint}${endpoint.includes('?') ? '&' : '?'}apiKey=${this.apiKey}`;

    try {
      const response = await this.client.request({
        method,
        url,
        data,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        const message = error.response.data?.message || error.response.statusText;
        throw new Error(`Cal.com API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const user = await this.apiRequest('GET', '/me');
      return {
        success: true,
        accountInfo: {
          id: user.id?.toString(),
          name: user.name || user.username,
          email: user.email,
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
    const user = await this.apiRequest('GET', '/me');
    return {
      id: user.id?.toString(),
      name: user.name || user.username,
      email: user.email,
      metadata: {
        username: user.username,
        timeZone: user.timeZone,
        avatar: user.avatar,
      },
    };
  }

  /**
   * Cal.com uses API keys, not OAuth - this is a no-op
   */
  async refreshAccessToken() {
    return {
      accessToken: this.apiKey,
      expiresAt: null,
    };
  }

  /**
   * Get event types (booking types)
   */
  async getEventTypes() {
    const response = await this.apiRequest('GET', '/event-types');
    const eventTypes = response.event_types || response || [];

    return eventTypes.map(et => ({
      id: et.id?.toString(),
      name: et.title || et.name,
      duration: et.length,
      description: et.description,
      metadata: {
        slug: et.slug,
        hidden: et.hidden,
        requiresConfirmation: et.requiresConfirmation,
        minimumBookingNotice: et.minimumBookingNotice,
        price: et.price,
        currency: et.currency,
      },
    }));
  }

  /**
   * Get availability for an event type
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    const response = await this.apiRequest(
      'GET',
      `/availability?eventTypeId=${eventTypeId}&startTime=${startDate}T00:00:00Z&endTime=${endDate}T23:59:59Z`
    );

    const slots = [];
    const busyTimes = response.busy || [];
    const workingHours = response.workingHours || [];

    // Cal.com returns busy times, we need to invert to get available slots
    // This is a simplified implementation - production would need more sophisticated slot calculation
    if (response.slots) {
      for (const slot of response.slots) {
        slots.push({
          startTime: slot.time,
          endTime: null, // Cal.com slots don't always include end time
          available: true,
          eventTypeId: eventTypeId,
        });
      }
    }

    return slots;
  }

  /**
   * Get bookings within a date range
   */
  async getBookings(startDate, endDate) {
    let url = '/bookings';
    const params = [];

    if (startDate) params.push(`dateFrom=${startDate}`);
    if (endDate) params.push(`dateTo=${endDate}`);

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const response = await this.apiRequest('GET', url);
    const bookings = response.bookings || response || [];

    return bookings.map(b => this.normalizeBooking(b));
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    try {
      const response = await this.apiRequest('GET', `/bookings/${externalId}`);
      return this.normalizeBooking(response.booking || response);
    } catch (error) {
      if (error.message.includes('404')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new booking
   */
  async createBooking(params) {
    const bookingData = {
      eventTypeId: parseInt(params.eventTypeId),
      start: params.startTime,
      end: params.endTime,
      responses: {
        name: params.customerName,
        email: params.customerEmail,
        phone: params.customerPhone,
        ...(params.metadata?.responses || {}),
      },
      metadata: params.metadata || {},
      timeZone: params.metadata?.timeZone || 'Europe/Dublin',
      language: params.metadata?.language || 'en',
    };

    const response = await this.apiRequest('POST', '/bookings', bookingData);
    return this.normalizeBooking(response);
  }

  /**
   * Update an existing booking (reschedule)
   */
  async updateBooking(externalId, params) {
    const updateData = {};

    if (params.startTime) updateData.start = params.startTime;
    if (params.endTime) updateData.end = params.endTime;
    if (params.metadata?.reason) updateData.reason = params.metadata.reason;

    const response = await this.apiRequest('PATCH', `/bookings/${externalId}`, updateData);
    return this.normalizeBooking(response.booking || response);
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    await this.apiRequest('DELETE', `/bookings/${externalId}`, {
      reason: reason || 'Cancelled via integration',
    });

    return { success: true };
  }

  /**
   * Register a webhook
   */
  async registerWebhook(webhookUrl, events) {
    // Cal.com webhook event types
    const calcomEvents = events.map(e => {
      const eventMap = {
        'booking.created': 'BOOKING_CREATED',
        'booking.cancelled': 'BOOKING_CANCELLED',
        'booking.rescheduled': 'BOOKING_RESCHEDULED',
        'booking.confirmed': 'BOOKING_CONFIRMED',
      };
      return eventMap[e] || e;
    });

    const response = await this.apiRequest('POST', '/webhooks', {
      subscriberUrl: webhookUrl,
      eventTriggers: calcomEvents,
      active: true,
    });

    return {
      webhookId: response.webhook?.id?.toString() || response.id?.toString(),
      secret: response.webhook?.secret || response.secret,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    const eventTypeMap = {
      'BOOKING_CREATED': 'booking.created',
      'BOOKING_CANCELLED': 'booking.cancelled',
      'BOOKING_RESCHEDULED': 'booking.rescheduled',
      'BOOKING_CONFIRMED': 'booking.confirmed',
    };

    const eventType = eventTypeMap[payload.triggerEvent] || payload.triggerEvent;
    const booking = payload.payload ? this.normalizeBooking(payload.payload) : null;

    return {
      eventType,
      booking,
      rawData: payload,
    };
  }

  /**
   * Normalize a Cal.com booking to standard format
   */
  normalizeBooking(booking) {
    return {
      externalId: booking.id?.toString() || booking.uid,
      status: this.normalizeStatus(booking.status),
      startTime: booking.startTime || booking.start,
      endTime: booking.endTime || booking.end,
      customerName: booking.attendees?.[0]?.name || booking.responses?.name,
      customerEmail: booking.attendees?.[0]?.email || booking.responses?.email,
      customerPhone: booking.attendees?.[0]?.phone || booking.responses?.phone,
      metadata: {
        uid: booking.uid,
        title: booking.title,
        description: booking.description,
        location: booking.location,
        eventTypeId: booking.eventTypeId,
        attendees: booking.attendees,
        responses: booking.responses,
        paid: booking.paid,
        payment: booking.payment,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'ACCEPTED': 'confirmed',
      'PENDING': 'pending',
      'CANCELLED': 'cancelled',
      'REJECTED': 'cancelled',
      'accepted': 'confirmed',
      'pending': 'pending',
      'cancelled': 'cancelled',
    };
    return statusMap[status] || status?.toLowerCase() || 'pending';
  }

  /**
   * Exchange code for tokens (not used for Cal.com - API key only)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('Cal.com does not support OAuth. Use API key authentication.');
  }
}

module.exports = { CalcomAdapter };
