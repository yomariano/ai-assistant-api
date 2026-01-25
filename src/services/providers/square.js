/**
 * Square Appointments Provider Adapter
 *
 * Implements the booking provider interface for Square Bookings API.
 * Square uses OAuth2 authentication.
 *
 * API Documentation: https://developer.squareup.com/docs/bookings-api
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://connect.squareup.com/v2';
const SANDBOX_API_BASE_URL = 'https://connect.squareupsandbox.com/v2';
const OAUTH_BASE_URL = 'https://connect.squareup.com'; // OAuth endpoints don't use /v2

class SquareAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'square';
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenExpiresAt = config.tokenExpiresAt;
    this.merchantId = config.externalAccountId;
    this.locationId = config.config?.locationId;
    this.useSandbox = config.config?.sandbox === true;

    const baseUrl = this.useSandbox ? SANDBOX_API_BASE_URL : API_BASE_URL;

    console.log('[Square] Adapter initialized:', {
      hasAccessToken: !!this.accessToken,
      accessTokenLength: this.accessToken?.length || 0,
      baseUrl,
    });

    // Create axios instance
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Square-Version': '2024-01-18',
      },
    });
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(method, endpoint, data = null) {
    console.log('[Square] API Request:', { method, endpoint, hasToken: !!this.accessToken });
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
      });
      return response.data;
    } catch (error) {
      console.log('[Square] API Error:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: typeof error.response?.data === 'string'
          ? error.response.data.substring(0, 200)
          : error.response?.data,
      });
      if (error.response) {
        const errors = error.response.data?.errors || [];
        const message = errors[0]?.detail || error.response.statusText;
        throw new Error(`Square API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const merchant = await this.apiRequest('GET', '/merchants/me');
      return {
        success: true,
        accountInfo: {
          id: merchant.merchant?.[0]?.id,
          name: merchant.merchant?.[0]?.business_name,
          email: null, // Square doesn't return email in merchant endpoint
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
    const merchantResponse = await this.apiRequest('GET', '/merchants/me');
    const merchant = merchantResponse.merchant?.[0];

    // Get locations
    const locationsResponse = await this.apiRequest('GET', '/locations');
    const locations = locationsResponse.locations || [];

    return {
      id: merchant?.id,
      name: merchant?.business_name,
      email: null,
      metadata: {
        country: merchant?.country,
        languageCode: merchant?.language_code,
        currency: merchant?.currency,
        status: merchant?.status,
        mainLocationId: merchant?.main_location_id,
        locations: locations.map(l => ({
          id: l.id,
          name: l.name,
          address: l.address,
          timezone: l.timezone,
          capabilities: l.capabilities,
        })),
      },
    };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, redirectUri) {
    const clientId = process.env.SQUARE_CLIENT_ID;
    const clientSecret = process.env.SQUARE_CLIENT_SECRET;

    console.log('[Square] Exchanging code for tokens:', {
      clientIdLength: clientId?.length || 0,
      hasClientSecret: !!clientSecret,
      redirectUri,
    });

    const response = await axios.post(`${OAUTH_BASE_URL}/oauth2/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });

    const { access_token, refresh_token, expires_at, merchant_id } = response.data;

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: new Date(expires_at),
      merchantId: merchant_id,
    };
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken() {
    const clientId = process.env.SQUARE_CLIENT_ID;
    const clientSecret = process.env.SQUARE_CLIENT_SECRET;

    const response = await axios.post(`${OAUTH_BASE_URL}/oauth2/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const { access_token, refresh_token, expires_at } = response.data;

    // Update instance tokens
    this.accessToken = access_token;
    this.refreshToken = refresh_token || this.refreshToken;
    this.client.defaults.headers['Authorization'] = `Bearer ${access_token}`;

    return {
      accessToken: access_token,
      refreshToken: refresh_token || this.refreshToken,
      expiresAt: new Date(expires_at),
    };
  }

  /**
   * Get service/event types (catalog items of type APPOINTMENTS_SERVICE)
   */
  async getEventTypes() {
    // First get team members (staff)
    const teamResponse = await this.apiRequest('POST', '/team-members/search', {
      query: {
        filter: {
          status: 'ACTIVE',
          location_ids: this.locationId ? [this.locationId] : undefined,
        },
      },
    });

    // Get catalog items for services
    const catalogResponse = await this.apiRequest('POST', '/catalog/search', {
      object_types: ['ITEM'],
      query: {
        exact_query: {
          attribute_name: 'item_data.product_type',
          attribute_value: 'APPOINTMENTS_SERVICE',
        },
      },
    });

    const services = catalogResponse.objects || [];
    const teamMembers = teamResponse.team_members || [];

    return services.map(service => ({
      id: service.id,
      name: service.item_data?.name,
      duration: service.item_data?.variations?.[0]?.item_variation_data
        ?.service_duration ? parseInt(service.item_data.variations[0].item_variation_data.service_duration) / 60000 : null,
      description: service.item_data?.description,
      metadata: {
        variationId: service.item_data?.variations?.[0]?.id,
        categoryId: service.item_data?.category_id,
        teamMembers: teamMembers.map(tm => ({
          id: tm.id,
          givenName: tm.given_name,
          familyName: tm.family_name,
          emailAddress: tm.email_address,
        })),
      },
    }));
  }

  /**
   * Get availability
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    // Square uses search_availability endpoint
    const response = await this.apiRequest('POST', '/bookings/availability/search', {
      query: {
        filter: {
          start_at_range: {
            start_at: `${startDate}T00:00:00Z`,
            end_at: `${endDate}T23:59:59Z`,
          },
          location_id: this.locationId,
          segment_filters: [{
            service_variation_id: eventTypeId,
          }],
        },
      },
    });

    const availabilities = response.availabilities || [];

    return availabilities.map(a => ({
      startTime: a.start_at,
      endTime: null, // Square doesn't always provide end time in availability
      available: true,
      eventTypeId: eventTypeId,
      metadata: {
        appointmentSegments: a.appointment_segments,
        locationId: a.location_id,
      },
    }));
  }

  /**
   * Get bookings
   */
  async getBookings(startDate, endDate) {
    const query = {
      limit: 100,
      location_id: this.locationId,
    };

    if (startDate) {
      query.start_at_min = `${startDate}T00:00:00Z`;
    }
    if (endDate) {
      query.start_at_max = `${endDate}T23:59:59Z`;
    }

    const response = await this.apiRequest('POST', '/bookings/search', {
      query,
    });

    const bookings = response.bookings || [];
    return bookings.map(b => this.normalizeBooking(b));
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    try {
      const response = await this.apiRequest('GET', `/bookings/${externalId}`);
      return this.normalizeBooking(response.booking);
    } catch (error) {
      if (error.message.includes('NOT_FOUND')) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a booking
   */
  async createBooking(params) {
    // First, create or retrieve customer
    let customerId = params.metadata?.customerId;

    if (!customerId && params.customerEmail) {
      // Search for existing customer
      const searchResponse = await this.apiRequest('POST', '/customers/search', {
        query: {
          filter: {
            email_address: {
              exact: params.customerEmail,
            },
          },
        },
      });

      if (searchResponse.customers?.[0]) {
        customerId = searchResponse.customers[0].id;
      } else {
        // Create new customer
        const customerResponse = await this.apiRequest('POST', '/customers', {
          given_name: params.customerName?.split(' ')[0],
          family_name: params.customerName?.split(' ').slice(1).join(' '),
          email_address: params.customerEmail,
          phone_number: params.customerPhone,
        });
        customerId = customerResponse.customer?.id;
      }
    }

    const bookingData = {
      idempotency_key: crypto.randomUUID(),
      booking: {
        location_id: this.locationId,
        customer_id: customerId,
        start_at: params.startTime,
        appointment_segments: [{
          service_variation_id: params.eventTypeId,
          team_member_id: params.metadata?.teamMemberId || 'ANY_TEAM_MEMBER',
          duration_minutes: params.metadata?.durationMinutes,
        }],
        customer_note: params.metadata?.notes,
      },
    };

    const response = await this.apiRequest('POST', '/bookings', bookingData);
    return this.normalizeBooking(response.booking);
  }

  /**
   * Update a booking
   */
  async updateBooking(externalId, params) {
    // First get the current booking to get the version
    const currentBooking = await this.apiRequest('GET', `/bookings/${externalId}`);
    const version = currentBooking.booking?.version;

    const updateData = {
      idempotency_key: crypto.randomUUID(),
      booking: {
        version,
      },
    };

    if (params.startTime) {
      updateData.booking.start_at = params.startTime;
    }
    if (params.metadata?.notes) {
      updateData.booking.customer_note = params.metadata.notes;
    }

    const response = await this.apiRequest('PUT', `/bookings/${externalId}`, updateData);
    return this.normalizeBooking(response.booking);
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    // First get the current booking version
    const currentBooking = await this.apiRequest('GET', `/bookings/${externalId}`);
    const version = currentBooking.booking?.version;

    await this.apiRequest('POST', `/bookings/${externalId}/cancel`, {
      idempotency_key: crypto.randomUUID(),
      booking_version: version,
    });

    return { success: true };
  }

  /**
   * Register a webhook
   */
  async registerWebhook(webhookUrl, events) {
    // Square webhook event types
    const squareEvents = events.map(e => {
      const eventMap = {
        'booking.created': 'booking.created',
        'booking.cancelled': 'booking.cancelled',
        'booking.updated': 'booking.updated',
      };
      return eventMap[e] || e;
    });

    const response = await this.apiRequest('POST', '/webhooks/subscriptions', {
      idempotency_key: crypto.randomUUID(),
      subscription: {
        name: 'AI Assistant Booking Integration',
        event_types: squareEvents,
        notification_url: webhookUrl,
        api_version: '2024-01-18',
      },
    });

    return {
      webhookId: response.subscription?.id,
      secret: response.subscription?.signature_key,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    const signatureKey = secret || process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    if (!signatureKey) return true;

    const expectedSignature = crypto
      .createHmac('sha256', signatureKey)
      .update(payload)
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    const eventTypeMap = {
      'booking.created': 'booking.created',
      'booking.updated': 'booking.updated',
      'booking.cancelled': 'booking.cancelled',
    };

    const eventType = eventTypeMap[payload.type] || payload.type;
    let booking = null;

    if (payload.data?.object?.booking) {
      booking = this.normalizeBooking(payload.data.object.booking);
    } else if (payload.data?.id) {
      try {
        booking = await this.getBooking(payload.data.id);
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
   * Normalize a Square booking to standard format
   */
  normalizeBooking(booking) {
    return {
      externalId: booking.id,
      status: this.normalizeStatus(booking.status),
      startTime: booking.start_at,
      endTime: null, // Calculate from duration if needed
      customerName: null, // Need to fetch customer details separately
      customerEmail: null,
      customerPhone: null,
      metadata: {
        customerId: booking.customer_id,
        locationId: booking.location_id,
        creatorDetails: booking.creator_details,
        appointmentSegments: booking.appointment_segments,
        version: booking.version,
        source: booking.source,
        customerNote: booking.customer_note,
        sellerNote: booking.seller_note,
        allDay: booking.all_day,
        locationType: booking.location_type,
        transitionTimeMinutes: booking.transition_time_minutes,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'PENDING': 'pending',
      'ACCEPTED': 'confirmed',
      'CANCELLED_BY_CUSTOMER': 'cancelled',
      'CANCELLED_BY_SELLER': 'cancelled',
      'DECLINED': 'cancelled',
      'NO_SHOW': 'no_show',
    };
    return statusMap[status] || status?.toLowerCase() || 'pending';
  }
}

module.exports = { SquareAdapter };
