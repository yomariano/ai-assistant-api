/**
 * Calendly Provider Adapter
 *
 * Implements the booking provider interface for Calendly.
 * Calendly uses OAuth2 authentication.
 *
 * API Documentation: https://developer.calendly.com
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://api.calendly.com';
const AUTH_BASE_URL = 'https://auth.calendly.com';

class CalendlyAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'calendly';
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenExpiresAt = config.tokenExpiresAt;

    // Create axios instance
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
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
        const message = error.response.data?.message || error.response.data?.error || error.response.statusText;
        throw new Error(`Calendly API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const user = await this.apiRequest('GET', '/users/me');
      return {
        success: true,
        accountInfo: {
          id: user.resource?.uri?.split('/').pop(),
          name: user.resource?.name,
          email: user.resource?.email,
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
    const response = await this.apiRequest('GET', '/users/me');
    const user = response.resource;

    return {
      id: user.uri?.split('/').pop(),
      name: user.name,
      email: user.email,
      metadata: {
        uri: user.uri,
        slug: user.slug,
        schedulingUrl: user.scheduling_url,
        timezone: user.timezone,
        avatarUrl: user.avatar_url,
        currentOrganization: user.current_organization,
      },
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, redirectUri) {
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

    const response = await axios.post(`${AUTH_BASE_URL}/oauth/token`, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
    });

    const { access_token, refresh_token, expires_in } = response.data;

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    };
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken() {
    const clientId = process.env.CALENDLY_CLIENT_ID;
    const clientSecret = process.env.CALENDLY_CLIENT_SECRET;

    const response = await axios.post(`${AUTH_BASE_URL}/oauth/token`, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: this.refreshToken,
    });

    const { access_token, refresh_token, expires_in } = response.data;

    // Update instance tokens
    this.accessToken = access_token;
    this.refreshToken = refresh_token || this.refreshToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${access_token}`;

    return {
      accessToken: access_token,
      refreshToken: refresh_token || this.refreshToken,
      expiresAt: new Date(Date.now() + expires_in * 1000),
    };
  }

  /**
   * Get event types
   */
  async getEventTypes() {
    // First get the current user to get their URI
    const userResponse = await this.apiRequest('GET', '/users/me');
    const userUri = userResponse.resource?.uri;

    const response = await this.apiRequest('GET', `/event_types?user=${encodeURIComponent(userUri)}`);
    const eventTypes = response.collection || [];

    return eventTypes.map(et => ({
      id: et.uri?.split('/').pop(),
      name: et.name,
      duration: et.duration,
      description: et.description_plain || et.description_html,
      metadata: {
        uri: et.uri,
        slug: et.slug,
        schedulingUrl: et.scheduling_url,
        color: et.color,
        active: et.active,
        type: et.type,
        poolingType: et.pooling_type,
      },
    }));
  }

  /**
   * Get availability for an event type
   * Note: Calendly's API doesn't provide a direct availability endpoint.
   * Instead, you embed the scheduler or use the scheduling link.
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    // Calendly doesn't expose availability directly through the API
    // The availability is shown through the embedded scheduler
    // Return empty array - availability is handled through Calendly's embed
    console.warn('Calendly does not provide a direct availability API. Use embedded scheduler.');
    return [];
  }

  /**
   * Get scheduled events (bookings)
   */
  async getBookings(startDate, endDate) {
    // Get current user URI
    const userResponse = await this.apiRequest('GET', '/users/me');
    const userUri = userResponse.resource?.uri;

    let url = `/scheduled_events?user=${encodeURIComponent(userUri)}`;
    if (startDate) url += `&min_start_time=${startDate}T00:00:00Z`;
    if (endDate) url += `&max_start_time=${endDate}T23:59:59Z`;

    const response = await this.apiRequest('GET', url);
    const events = response.collection || [];

    // Get invitees for each event
    const bookings = await Promise.all(
      events.map(async (event) => {
        const inviteesResponse = await this.apiRequest(
          'GET',
          `/scheduled_events/${event.uri?.split('/').pop()}/invitees`
        );
        const invitee = inviteesResponse.collection?.[0];
        return this.normalizeBooking(event, invitee);
      })
    );

    return bookings;
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    try {
      const eventResponse = await this.apiRequest('GET', `/scheduled_events/${externalId}`);
      const inviteesResponse = await this.apiRequest('GET', `/scheduled_events/${externalId}/invitees`);
      const invitee = inviteesResponse.collection?.[0];
      return this.normalizeBooking(eventResponse.resource, invitee);
    } catch (error) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a booking
   * Note: Calendly doesn't support programmatic booking creation through the standard API.
   * Bookings are created through the embedded scheduler or scheduling links.
   * The Scheduling API requires a paid plan.
   */
  async createBooking(params) {
    // Check if we have access to the Scheduling API
    // This requires Calendly's paid plan
    throw new Error(
      'Calendly standard API does not support direct booking creation. ' +
      'Use the embedded scheduler or Scheduling API (requires paid Calendly plan).'
    );
  }

  /**
   * Update a booking (reschedule)
   * Note: Calendly doesn't support programmatic rescheduling through the standard API.
   */
  async updateBooking(externalId, params) {
    throw new Error(
      'Calendly standard API does not support direct booking updates. ' +
      'Invitees must reschedule through the reschedule link.'
    );
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    // Get the event to find the invitee
    const inviteesResponse = await this.apiRequest('GET', `/scheduled_events/${externalId}/invitees`);
    const invitee = inviteesResponse.collection?.[0];

    if (!invitee) {
      throw new Error('No invitee found for this event');
    }

    const inviteeId = invitee.uri?.split('/').pop();

    await this.apiRequest('POST', `/scheduled_events/${externalId}/cancellation`, {
      reason: reason || 'Cancelled via integration',
    });

    return { success: true };
  }

  /**
   * Register a webhook subscription
   */
  async registerWebhook(webhookUrl, events) {
    // Get current user/organization
    const userResponse = await this.apiRequest('GET', '/users/me');
    const orgUri = userResponse.resource?.current_organization;

    // Map events to Calendly event types
    const calendlyEvents = events.map(e => {
      const eventMap = {
        'booking.created': 'invitee.created',
        'booking.cancelled': 'invitee.canceled',
        'booking.rescheduled': 'invitee.rescheduled',
      };
      return eventMap[e] || e;
    });

    const response = await this.apiRequest('POST', '/webhook_subscriptions', {
      url: webhookUrl,
      events: calendlyEvents,
      organization: orgUri,
      scope: 'organization',
    });

    return {
      webhookId: response.resource?.uri?.split('/').pop(),
      secret: null, // Calendly uses signature verification with a different mechanism
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    // Calendly webhook signature verification
    // The signature header is 'Calendly-Webhook-Signature'
    const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY || secret;
    if (!signingKey) return true; // Skip verification if no key configured

    const t = signature.split(',').find(s => s.startsWith('t='))?.split('=')[1];
    const v1 = signature.split(',').find(s => s.startsWith('v1='))?.split('=')[1];

    if (!t || !v1) return false;

    const signedPayload = `${t}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', signingKey)
      .update(signedPayload)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(v1),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    const eventTypeMap = {
      'invitee.created': 'booking.created',
      'invitee.canceled': 'booking.cancelled',
      'invitee.rescheduled': 'booking.rescheduled',
    };

    const eventType = eventTypeMap[payload.event] || payload.event;

    // Fetch full event details if needed
    let booking = null;
    if (payload.payload?.scheduled_event) {
      const eventUri = payload.payload.scheduled_event.uri;
      const eventId = eventUri?.split('/').pop();
      if (eventId) {
        try {
          booking = await this.getBooking(eventId);
        } catch {
          // If we can't fetch, use payload data
          booking = this.normalizeBooking(
            payload.payload.scheduled_event,
            payload.payload
          );
        }
      }
    }

    return {
      eventType,
      booking,
      rawData: payload,
    };
  }

  /**
   * Normalize a Calendly event to standard booking format
   */
  normalizeBooking(event, invitee = null) {
    return {
      externalId: event.uri?.split('/').pop(),
      status: this.normalizeStatus(event.status),
      startTime: event.start_time,
      endTime: event.end_time,
      customerName: invitee?.name || event.name,
      customerEmail: invitee?.email || event.email,
      customerPhone: invitee?.questions_and_answers?.find(
        q => q.question?.toLowerCase().includes('phone')
      )?.answer,
      metadata: {
        uri: event.uri,
        name: event.name,
        eventType: event.event_type,
        location: event.location,
        inviteeUri: invitee?.uri,
        cancelUrl: invitee?.cancel_url,
        rescheduleUrl: invitee?.reschedule_url,
        questionsAndAnswers: invitee?.questions_and_answers,
        timezone: invitee?.timezone,
        tracking: invitee?.tracking,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'active': 'confirmed',
      'canceled': 'cancelled',
      'cancelled': 'cancelled',
    };
    return statusMap[status] || status?.toLowerCase() || 'confirmed';
  }
}

module.exports = { CalendlyAdapter };
