/**
 * TheFork Provider Adapter
 *
 * Implements the booking provider interface for TheFork (restaurant reservations).
 * TheFork uses API key authentication with their B2B API.
 *
 * API Documentation: https://docs.thefork.io
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://api.thefork.com';
const SANDBOX_API_URL = 'https://api.sandbox.thefork.com';

class TheForkAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'thefork';
    this.apiKey = config.apiKey;
    this.restaurantId = config.externalAccountId;
    this.useSandbox = config.config?.sandbox === true;

    const baseUrl = this.useSandbox ? SANDBOX_API_URL : API_BASE_URL;

    // Create axios instance
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this.apiKey,
        'Accept': 'application/json',
      },
    });
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(method, endpoint, data = null) {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        const message = error.response.data?.message ||
                       error.response.data?.error ||
                       error.response.statusText;
        throw new Error(`TheFork API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      // Get restaurant info to verify connection
      const restaurant = await this.apiRequest('GET', `/restaurants/${this.restaurantId}`);
      return {
        success: true,
        accountInfo: {
          id: restaurant.id || this.restaurantId,
          name: restaurant.name,
          email: restaurant.email,
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
    const restaurant = await this.apiRequest('GET', `/restaurants/${this.restaurantId}`);

    return {
      id: restaurant.id || this.restaurantId,
      name: restaurant.name,
      email: restaurant.email,
      metadata: {
        phone: restaurant.phone,
        address: restaurant.address,
        city: restaurant.city,
        postalCode: restaurant.postal_code,
        country: restaurant.country,
        cuisineType: restaurant.cuisine_type,
        priceRange: restaurant.price_range,
        capacity: restaurant.capacity,
        openingHours: restaurant.opening_hours,
      },
    };
  }

  /**
   * TheFork uses API keys, not OAuth - this is a no-op
   */
  async refreshAccessToken() {
    return {
      accessToken: this.apiKey,
      expiresAt: null,
    };
  }

  /**
   * Get event types (menu/service options for restaurants)
   */
  async getEventTypes() {
    // TheFork doesn't have traditional "event types" like scheduling apps
    // Instead, restaurants have availability and menu options
    try {
      const menus = await this.apiRequest('GET', `/restaurants/${this.restaurantId}/menus`);

      return (menus || []).map(menu => ({
        id: menu.id,
        name: menu.name,
        duration: null, // Restaurant bookings don't have fixed duration
        description: menu.description,
        metadata: {
          price: menu.price,
          currency: menu.currency,
          courses: menu.courses,
          isActive: menu.is_active,
        },
      }));
    } catch {
      // Return empty if menus endpoint not available
      return [];
    }
  }

  /**
   * Get availability
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    const response = await this.apiRequest('GET',
      `/restaurants/${this.restaurantId}/availability?start_date=${startDate}&end_date=${endDate}`
    );

    const slots = [];

    // TheFork returns availability by date and time slot
    for (const dayAvailability of (response.availability || response || [])) {
      const date = dayAvailability.date;
      for (const slot of (dayAvailability.time_slots || dayAvailability.slots || [])) {
        slots.push({
          startTime: `${date}T${slot.time}:00`,
          endTime: null,
          available: slot.available !== false && slot.covers_available > 0,
          eventTypeId: eventTypeId,
          metadata: {
            coversAvailable: slot.covers_available,
            maxCovers: slot.max_covers,
          },
        });
      }
    }

    return slots;
  }

  /**
   * Get bookings (reservations)
   */
  async getBookings(startDate, endDate) {
    let url = `/restaurants/${this.restaurantId}/reservations`;
    const params = [];

    if (startDate) params.push(`start_date=${startDate}`);
    if (endDate) params.push(`end_date=${endDate}`);

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    const response = await this.apiRequest('GET', url);
    const reservations = response.reservations || response || [];

    return reservations.map(r => this.normalizeBooking(r));
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    try {
      const response = await this.apiRequest('GET',
        `/restaurants/${this.restaurantId}/reservations/${externalId}`
      );
      return this.normalizeBooking(response.reservation || response);
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a booking (reservation)
   */
  async createBooking(params) {
    // Parse date and time
    const dateTime = new Date(params.startTime);
    const date = dateTime.toISOString().split('T')[0];
    const time = dateTime.toTimeString().slice(0, 5);

    const reservationData = {
      date: date,
      time: time,
      covers: params.metadata?.partySize || params.metadata?.covers || 2,
      customer: {
        first_name: params.customerName?.split(' ')[0],
        last_name: params.customerName?.split(' ').slice(1).join(' ') || '',
        email: params.customerEmail,
        phone: params.customerPhone,
      },
      special_requests: params.metadata?.specialRequests || params.metadata?.notes,
      menu_id: params.eventTypeId !== 'default' ? params.eventTypeId : undefined,
    };

    const response = await this.apiRequest('POST',
      `/restaurants/${this.restaurantId}/reservations`,
      reservationData
    );

    return this.normalizeBooking(response.reservation || response);
  }

  /**
   * Update a booking
   */
  async updateBooking(externalId, params) {
    const updateData = {};

    if (params.startTime) {
      const dateTime = new Date(params.startTime);
      updateData.date = dateTime.toISOString().split('T')[0];
      updateData.time = dateTime.toTimeString().slice(0, 5);
    }

    if (params.metadata?.partySize) {
      updateData.covers = params.metadata.partySize;
    }

    if (params.metadata?.specialRequests) {
      updateData.special_requests = params.metadata.specialRequests;
    }

    const response = await this.apiRequest('PATCH',
      `/restaurants/${this.restaurantId}/reservations/${externalId}`,
      updateData
    );

    return this.normalizeBooking(response.reservation || response);
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    await this.apiRequest('POST',
      `/restaurants/${this.restaurantId}/reservations/${externalId}/cancel`,
      { reason: reason || 'Cancelled via integration' }
    );

    return { success: true };
  }

  /**
   * Register a webhook
   */
  async registerWebhook(webhookUrl, events) {
    // TheFork webhook event types
    const theforkEvents = events.map(e => {
      const eventMap = {
        'booking.created': 'reservation.created',
        'booking.cancelled': 'reservation.cancelled',
        'booking.updated': 'reservation.updated',
        'booking.confirmed': 'reservation.confirmed',
      };
      return eventMap[e] || e;
    });

    const response = await this.apiRequest('POST',
      `/restaurants/${this.restaurantId}/webhooks`,
      {
        url: webhookUrl,
        events: theforkEvents,
      }
    );

    return {
      webhookId: response.webhook?.id || response.id,
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
      'reservation.created': 'booking.created',
      'reservation.cancelled': 'booking.cancelled',
      'reservation.updated': 'booking.updated',
      'reservation.confirmed': 'booking.confirmed',
    };

    const eventType = eventTypeMap[payload.event] || payload.event;
    let booking = null;

    if (payload.reservation) {
      booking = this.normalizeBooking(payload.reservation);
    } else if (payload.reservation_id) {
      try {
        booking = await this.getBooking(payload.reservation_id);
      } catch {
        // Ignore fetch errors
      }
    }

    return {
      eventType,
      booking,
      rawData: payload,
    };
  }

  /**
   * Normalize a TheFork reservation to standard booking format
   */
  normalizeBooking(reservation) {
    return {
      externalId: reservation.id?.toString() || reservation.reservation_id?.toString(),
      status: this.normalizeStatus(reservation.status),
      startTime: reservation.date && reservation.time ?
        `${reservation.date}T${reservation.time}:00` : reservation.datetime,
      endTime: null, // Restaurant bookings don't have fixed end times
      customerName: reservation.customer ?
        `${reservation.customer.first_name} ${reservation.customer.last_name}`.trim() :
        reservation.customer_name,
      customerEmail: reservation.customer?.email || reservation.customer_email,
      customerPhone: reservation.customer?.phone || reservation.customer_phone,
      metadata: {
        covers: reservation.covers || reservation.party_size,
        specialRequests: reservation.special_requests,
        source: reservation.source,
        tableNumber: reservation.table_number,
        menuId: reservation.menu_id,
        menuName: reservation.menu_name,
        confirmationCode: reservation.confirmation_code,
        notes: reservation.notes,
        tags: reservation.tags,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'confirmed': 'confirmed',
      'pending': 'pending',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'no_show': 'no_show',
      'completed': 'completed',
      'seated': 'confirmed',
      'arrived': 'confirmed',
    };
    return statusMap[status?.toLowerCase()] || status?.toLowerCase() || 'pending';
  }

  /**
   * Exchange code for tokens (not used for TheFork - API key only)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('TheFork does not support OAuth. Use API key authentication.');
  }
}

module.exports = { TheForkAdapter };
