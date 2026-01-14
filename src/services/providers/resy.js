/**
 * Resy Provider Adapter
 *
 * Implements the booking provider interface for Resy (restaurant reservations).
 * Resy is owned by American Express and requires partnership approval for API access.
 *
 * To obtain API access:
 * 1. American Express Developer Portal: https://developer.americanexpress.com
 * 2. Amex Partner Portal: https://partnerportal.americanexpress.com
 * 3. Resy Integrations: https://resy.com/resyos/integrations/
 *
 * Note: Resy primarily works with large restaurant groups and enterprise partners.
 * API access is limited and requires significant restaurant client volume.
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://api.resy.com/4';
const SANDBOX_API_URL = 'https://api.sandbox.resy.com/4';

class ResyAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'resy';
    this.apiKey = config.apiKey;
    this.venueId = config.externalAccountId || config.config?.venueId;
    this.useSandbox = config.config?.sandbox === true;

    const baseUrl = this.useSandbox ? SANDBOX_API_URL : API_BASE_URL;

    // Create axios instance
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ResyAPI api_key="${this.apiKey}"`,
        'X-Resy-Auth-Token': this.apiKey,
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
        throw new Error(`Resy API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      // Get venue info to verify connection
      const venue = await this.apiRequest('GET', `/venue/${this.venueId}`);
      return {
        success: true,
        accountInfo: {
          id: venue.id?.venue_id || venue.venue_id || this.venueId,
          name: venue.name || venue.venue?.name,
          email: venue.contact?.email,
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
    const venue = await this.apiRequest('GET', `/venue/${this.venueId}`);

    const venueData = venue.venue || venue;

    return {
      id: venueData.id?.venue_id || venueData.venue_id || this.venueId,
      name: venueData.name,
      email: venueData.contact?.email,
      metadata: {
        phone: venueData.contact?.phone_number,
        address: venueData.location?.address_1,
        address2: venueData.location?.address_2,
        city: venueData.location?.city,
        state: venueData.location?.state,
        postalCode: venueData.location?.postal_code,
        country: venueData.location?.country,
        neighborhood: venueData.location?.neighborhood,
        latitude: venueData.location?.latitude,
        longitude: venueData.location?.longitude,
        cuisineType: venueData.type,
        priceRange: venueData.price_range,
        rating: venueData.rating,
        url: venueData.url_slug,
        images: venueData.images,
        tagline: venueData.tagline,
        description: venueData.description,
      },
    };
  }

  /**
   * Resy uses API keys, not OAuth - this is a no-op
   */
  async refreshAccessToken() {
    return {
      accessToken: this.apiKey,
      expiresAt: null,
    };
  }

  /**
   * Get event types (seating types/experiences)
   */
  async getEventTypes() {
    try {
      // Resy venues may have different seating types or experiences
      const config = await this.apiRequest('GET', `/venue/${this.venueId}/config`);

      const seatingTypes = config.slot_config?.seating_types ||
                          config.seating_types ||
                          [];

      if (seatingTypes.length === 0) {
        return [{
          id: 'standard',
          name: 'Standard Seating',
          duration: null,
          description: 'Regular table reservation',
          metadata: {},
        }];
      }

      return seatingTypes.map(st => ({
        id: st.id?.toString() || st.type,
        name: st.name || st.type,
        duration: st.duration_minutes || null,
        description: st.description,
        metadata: {
          minPartySize: st.min_party_size,
          maxPartySize: st.max_party_size,
          type: st.type,
        },
      }));
    } catch {
      return [{
        id: 'standard',
        name: 'Standard Seating',
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
      venue_id: this.venueId,
      day: startDate,
      num_seats: '2', // Default party size
    });

    const response = await this.apiRequest('GET',
      `/find?${params.toString()}`
    );

    const slots = [];

    // Resy returns slots organized by date
    const results = response.results || response.venues || [];

    for (const result of results) {
      const venueSlots = result.slots || [];

      for (const slot of venueSlots) {
        const dateInfo = slot.date || {};

        slots.push({
          startTime: dateInfo.start || slot.starts_at,
          endTime: dateInfo.end || slot.ends_at,
          available: slot.availability?.id != null || slot.config?.id != null,
          eventTypeId: eventTypeId || slot.config?.type || 'standard',
          metadata: {
            configId: slot.config?.id,
            token: slot.config?.token,
            type: slot.config?.type,
            tableConfigId: slot.table?.id,
            areaId: slot.shift?.id,
            partyMin: slot.size?.min,
            partyMax: slot.size?.max,
            badge: slot.badge?.text,
            credit: slot.payment?.credit,
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
    const params = new URLSearchParams({
      venue_id: this.venueId,
    });

    if (startDate) params.append('start_date', startDate);
    if (endDate) params.append('end_date', endDate);

    const response = await this.apiRequest('GET',
      `/venue/${this.venueId}/reservations?${params.toString()}`
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
        `/reservation/${externalId}`
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
   * Resy uses a two-step booking process: 1. Get book token, 2. Complete booking
   */
  async createBooking(params) {
    // Parse date and time
    const dateTime = new Date(params.startTime);
    const date = dateTime.toISOString().split('T')[0];

    // Step 1: Get booking details/token if not provided
    let bookToken = params.metadata?.bookToken || params.metadata?.configId;

    if (!bookToken) {
      // Need to find an available slot first
      const availability = await this.getAvailability(params.eventTypeId, date, date);
      const targetTime = params.startTime;

      const matchingSlot = availability.find(slot =>
        slot.startTime === targetTime && slot.available
      );

      if (!matchingSlot) {
        throw new Error('No available slot found for the requested time');
      }

      bookToken = matchingSlot.metadata?.configId || matchingSlot.metadata?.token;
    }

    // Step 2: Create the reservation
    const reservationData = {
      venue_id: this.venueId,
      config_id: bookToken,
      party_size: params.metadata?.partySize || params.metadata?.covers || 2,
      day: date,
      first_name: params.customerName?.split(' ')[0] || '',
      last_name: params.customerName?.split(' ').slice(1).join(' ') || '',
      email: params.customerEmail,
      phone_number: params.customerPhone,
      special_request: params.metadata?.specialRequests || params.metadata?.notes,
      occasion: params.metadata?.occasion,
    };

    const response = await this.apiRequest('POST',
      '/reservation',
      reservationData
    );

    return this.normalizeBooking(response.reservation || response);
  }

  /**
   * Update a booking
   */
  async updateBooking(externalId, params) {
    const updateData = {
      resy_token: externalId,
    };

    if (params.metadata?.specialRequests) {
      updateData.special_request = params.metadata.specialRequests;
    }

    if (params.metadata?.occasion) {
      updateData.occasion = params.metadata.occasion;
    }

    // Note: Resy may not support changing date/time/party size on existing reservations
    // Those changes typically require canceling and rebooking

    const response = await this.apiRequest('PATCH',
      `/reservation/${externalId}`,
      updateData
    );

    return this.normalizeBooking(response.reservation || response);
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    await this.apiRequest('DELETE',
      `/reservation/${externalId}`,
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
    // Map to Resy webhook event types
    const resyEvents = events.map(e => {
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
      `/venue/${this.venueId}/webhooks`,
      {
        url: webhookUrl,
        events: resyEvents,
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
    // Resy uses HMAC-SHA256 for webhook signatures
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
    } else if (payload.resy_token || payload.reservation_id) {
      try {
        booking = await this.getBooking(payload.resy_token || payload.reservation_id);
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
   * Normalize a Resy reservation to standard booking format
   */
  normalizeBooking(reservation) {
    const resyDetails = reservation.reservation || reservation;

    // Handle different datetime formats
    let startTime = resyDetails.datetime || resyDetails.starts_at;
    if (!startTime && resyDetails.day && resyDetails.time_slot) {
      startTime = `${resyDetails.day}T${resyDetails.time_slot}:00`;
    }

    const guest = resyDetails.guest || resyDetails.user || {};

    return {
      externalId: resyDetails.resy_token?.toString() ||
                 resyDetails.confirmation_id?.toString() ||
                 resyDetails.id?.toString(),
      status: this.normalizeStatus(resyDetails.status || resyDetails.state),
      startTime: startTime,
      endTime: resyDetails.ends_at || null,
      customerName: guest.first_name && guest.last_name ?
        `${guest.first_name} ${guest.last_name}`.trim() :
        resyDetails.guest_name,
      customerEmail: guest.email || resyDetails.email,
      customerPhone: guest.phone_number || resyDetails.phone_number,
      metadata: {
        partySize: resyDetails.num_seats || resyDetails.party_size,
        specialRequests: resyDetails.special_request,
        occasion: resyDetails.occasion,
        source: resyDetails.source || 'resy',
        tableId: resyDetails.table?.id,
        tableName: resyDetails.table?.name,
        areaId: resyDetails.area?.id,
        areaName: resyDetails.area?.name,
        shiftId: resyDetails.shift?.id,
        confirmationId: resyDetails.confirmation_id,
        resyToken: resyDetails.resy_token,
        seatingType: resyDetails.config?.type,
        venueName: resyDetails.venue?.name,
        cancellationPolicy: resyDetails.cancellation?.policy,
        paymentRequired: resyDetails.payment?.required,
        creditAmount: resyDetails.payment?.credit,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'confirmed': 'confirmed',
      'booked': 'confirmed',
      'pending': 'pending',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'no_show': 'no_show',
      'noshow': 'no_show',
      'completed': 'completed',
      'finished': 'completed',
      'seated': 'confirmed',
      'arrived': 'confirmed',
      'active': 'confirmed',
    };
    return statusMap[status?.toLowerCase()] || status?.toLowerCase() || 'pending';
  }

  /**
   * Exchange code for tokens (not used for Resy - API key only)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('Resy does not support OAuth. Use API key authentication via partnership agreement.');
  }
}

module.exports = { ResyAdapter };
