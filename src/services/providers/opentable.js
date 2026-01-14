/**
 * OpenTable Provider Adapter
 *
 * Implements the booking provider interface for OpenTable (restaurant reservations).
 * OpenTable requires partnership approval for API access.
 *
 * API Documentation: https://docs.opentable.com
 * Partner Portal: https://dev.opentable.com
 *
 * To obtain API access:
 * 1. Apply at: https://www.opentable.com/restaurant-solutions/api-partners/become-a-partner/
 * 2. Contact: busdev@opentable.com or partnersupport@opentable.com
 * 3. Approval takes 3-4 weeks
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://platform.opentable.com/v1';
const SANDBOX_API_URL = 'https://sandbox.opentable.com/v1';

class OpenTableAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'opentable';
    this.apiKey = config.apiKey;
    this.restaurantId = config.externalAccountId || config.config?.restaurantId;
    this.useSandbox = config.config?.sandbox === true;

    const baseUrl = this.useSandbox ? SANDBOX_API_URL : API_BASE_URL;

    // Create axios instance
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
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
                       error.response.data?.error?.message ||
                       error.response.data?.errors?.[0]?.message ||
                       error.response.statusText;
        throw new Error(`OpenTable API error: ${message}`);
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
          id: restaurant.rid || restaurant.id || this.restaurantId,
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
      id: restaurant.rid || restaurant.id || this.restaurantId,
      name: restaurant.name,
      email: restaurant.email,
      metadata: {
        phone: restaurant.phone,
        address: restaurant.address,
        city: restaurant.city,
        state: restaurant.state,
        postalCode: restaurant.postal_code,
        country: restaurant.country,
        cuisineType: restaurant.cuisine_type || restaurant.primary_cuisine,
        priceRange: restaurant.price_range,
        neighborhood: restaurant.neighborhood,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
        profileUrl: restaurant.profile_url,
        reserveUrl: restaurant.reserve_url,
      },
    };
  }

  /**
   * OpenTable uses API keys, not OAuth - this is a no-op
   */
  async refreshAccessToken() {
    return {
      accessToken: this.apiKey,
      expiresAt: null,
    };
  }

  /**
   * Get event types (dining experiences/occasions)
   */
  async getEventTypes() {
    // OpenTable may have different dining experiences (e.g., standard, prix fixe, special events)
    try {
      const experiences = await this.apiRequest('GET', `/restaurants/${this.restaurantId}/experiences`);

      return (experiences.items || experiences || []).map(exp => ({
        id: exp.id?.toString(),
        name: exp.name,
        duration: exp.duration_minutes || null,
        description: exp.description,
        metadata: {
          price: exp.price,
          currency: exp.currency,
          minPartySize: exp.min_party_size,
          maxPartySize: exp.max_party_size,
          isActive: exp.is_active !== false,
        },
      }));
    } catch {
      // Return default experience if endpoint not available
      return [{
        id: 'standard',
        name: 'Standard Dining',
        duration: null,
        description: 'Regular table reservation',
        metadata: {},
      }];
    }
  }

  /**
   * Get availability
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate || startDate,
    });

    if (eventTypeId && eventTypeId !== 'standard') {
      params.append('experience_id', eventTypeId);
    }

    const response = await this.apiRequest('GET',
      `/restaurants/${this.restaurantId}/availability?${params.toString()}`
    );

    const slots = [];

    // OpenTable returns availability by date and time slot
    const availabilityData = response.availability || response.days || response || [];

    for (const dayData of availabilityData) {
      const date = dayData.date;
      const timeSlots = dayData.time_slots || dayData.slots || dayData.times || [];

      for (const slot of timeSlots) {
        const time = slot.time || slot.datetime?.split('T')[1]?.slice(0, 5);
        slots.push({
          startTime: slot.datetime || `${date}T${time}:00`,
          endTime: null,
          available: slot.available !== false && (slot.inventory > 0 || slot.covers_available > 0),
          eventTypeId: eventTypeId || 'standard',
          metadata: {
            inventory: slot.inventory || slot.covers_available,
            token: slot.slot_token, // May be needed for booking
            areaId: slot.area_id,
            tableType: slot.table_type,
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
    const params = new URLSearchParams();

    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await this.apiRequest('GET',
      `/restaurants/${this.restaurantId}/reservations?${params.toString()}`
    );

    const reservations = response.reservations || response.items || response || [];

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
      party_size: params.metadata?.partySize || params.metadata?.covers || 2,
      first_name: params.customerName?.split(' ')[0] || '',
      last_name: params.customerName?.split(' ').slice(1).join(' ') || '',
      email: params.customerEmail,
      phone: params.customerPhone,
      special_request: params.metadata?.specialRequests || params.metadata?.notes,
      occasion: params.metadata?.occasion,
    };

    // Add experience/slot token if provided
    if (params.eventTypeId && params.eventTypeId !== 'standard') {
      reservationData.experience_id = params.eventTypeId;
    }
    if (params.metadata?.slotToken) {
      reservationData.slot_token = params.metadata.slotToken;
    }

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
      updateData.party_size = params.metadata.partySize;
    }

    if (params.metadata?.specialRequests) {
      updateData.special_request = params.metadata.specialRequests;
    }

    if (params.metadata?.occasion) {
      updateData.occasion = params.metadata.occasion;
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
      {
        cancellation_reason: reason || 'Cancelled via integration',
      }
    );

    return { success: true };
  }

  /**
   * Register a webhook
   */
  async registerWebhook(webhookUrl, events) {
    // Map to OpenTable webhook event types
    const opentableEvents = events.map(e => {
      const eventMap = {
        'booking.created': 'reservation.created',
        'booking.cancelled': 'reservation.cancelled',
        'booking.updated': 'reservation.modified',
        'booking.confirmed': 'reservation.confirmed',
        'booking.seated': 'reservation.seated',
        'booking.completed': 'reservation.completed',
        'booking.no_show': 'reservation.no_show',
      };
      return eventMap[e] || e;
    });

    const response = await this.apiRequest('POST',
      `/restaurants/${this.restaurantId}/webhooks`,
      {
        url: webhookUrl,
        events: opentableEvents,
        active: true,
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
    // OpenTable uses HMAC-SHA256 for webhook signatures
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    const eventTypeMap = {
      'reservation.created': 'booking.created',
      'reservation.cancelled': 'booking.cancelled',
      'reservation.modified': 'booking.updated',
      'reservation.confirmed': 'booking.confirmed',
      'reservation.seated': 'booking.seated',
      'reservation.completed': 'booking.completed',
      'reservation.no_show': 'booking.no_show',
    };

    const eventType = eventTypeMap[payload.event_type || payload.event] ||
                     payload.event_type || payload.event;
    let booking = null;

    if (payload.reservation) {
      booking = this.normalizeBooking(payload.reservation);
    } else if (payload.confirmation_number || payload.reservation_id) {
      try {
        booking = await this.getBooking(payload.confirmation_number || payload.reservation_id);
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
   * Normalize an OpenTable reservation to standard booking format
   */
  normalizeBooking(reservation) {
    // Handle different datetime formats
    let startTime = reservation.datetime;
    if (!startTime && reservation.date && reservation.time) {
      startTime = `${reservation.date}T${reservation.time}:00`;
    }

    return {
      externalId: reservation.confirmation_number?.toString() ||
                 reservation.rid?.toString() ||
                 reservation.id?.toString(),
      status: this.normalizeStatus(reservation.state || reservation.status),
      startTime: startTime,
      endTime: null, // Restaurant bookings don't have fixed end times
      customerName: reservation.first_name && reservation.last_name ?
        `${reservation.first_name} ${reservation.last_name}`.trim() :
        reservation.guest_name || reservation.customer_name,
      customerEmail: reservation.email || reservation.guest_email,
      customerPhone: reservation.phone || reservation.guest_phone,
      metadata: {
        partySize: reservation.party_size || reservation.covers,
        specialRequests: reservation.special_request || reservation.notes,
        occasion: reservation.occasion,
        source: reservation.source || 'opentable',
        tableNumber: reservation.table_number,
        areaId: reservation.area_id,
        areaName: reservation.area_name,
        confirmationNumber: reservation.confirmation_number,
        seatedTime: reservation.seated_time,
        completedTime: reservation.completed_time,
        experienceId: reservation.experience_id,
        experienceName: reservation.experience_name,
        points: reservation.points_earned,
        vip: reservation.vip,
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
      'noshow': 'no_show',
      'completed': 'completed',
      'seated': 'confirmed',
      'arrived': 'confirmed',
      'booked': 'confirmed',
      'active': 'confirmed',
    };
    return statusMap[status?.toLowerCase()] || status?.toLowerCase() || 'pending';
  }

  /**
   * Exchange code for tokens (not used for OpenTable - API key only)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('OpenTable does not support OAuth. Use API key authentication via partner portal.');
  }
}

module.exports = { OpenTableAdapter };
