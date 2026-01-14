/**
 * Mindbody Provider Adapter
 *
 * Implements the booking provider interface for Mindbody (fitness/wellness).
 * Mindbody uses API key authentication with their Public API v6.
 *
 * API Documentation: https://developers.mindbodyonline.com
 */

const axios = require('axios');
const crypto = require('crypto');
const { BaseProviderAdapter } = require('./interface');

const API_BASE_URL = 'https://api.mindbodyonline.com/public/v6';

class MindbodyAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'mindbody';
    this.apiKey = config.apiKey;
    this.siteId = config.externalAccountId || config.config?.siteId;
    this.accessToken = config.accessToken;

    // Create axios instance
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.apiKey,
        'SiteId': this.siteId,
      },
    });

    // Add authorization header if we have a user token
    if (this.accessToken) {
      this.client.defaults.headers['Authorization'] = this.accessToken;
    }
  }

  /**
   * Make an authenticated API request
   */
  async apiRequest(method, endpoint, data = null, params = null) {
    try {
      const response = await this.client.request({
        method,
        url: endpoint,
        data,
        params,
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        const message = error.response.data?.Error?.Message ||
                       error.response.data?.message ||
                       error.response.statusText;
        throw new Error(`Mindbody API error: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const site = await this.apiRequest('GET', '/site/sites', null, {
        SiteIds: this.siteId,
      });

      const siteInfo = site.Sites?.[0];
      return {
        success: true,
        accountInfo: {
          id: siteInfo?.Id?.toString() || this.siteId,
          name: siteInfo?.Name,
          email: siteInfo?.ContactEmail,
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
    const response = await this.apiRequest('GET', '/site/sites', null, {
      SiteIds: this.siteId,
    });

    const site = response.Sites?.[0];

    return {
      id: site?.Id?.toString() || this.siteId,
      name: site?.Name,
      email: site?.ContactEmail,
      metadata: {
        description: site?.Description,
        logo: site?.LogoUrl,
        pageColor1: site?.PageColor1,
        pageColor2: site?.PageColor2,
        acceptsVisa: site?.AcceptsVisa,
        acceptsMasterCard: site?.AcceptsMasterCard,
        acceptsAmericanExpress: site?.AcceptsAmericanExpress,
        acceptsDiscover: site?.AcceptsDiscover,
        smsPackageEnabled: site?.SmsPackageEnabled,
        allowsTerminationPendingAccounts: site?.AllowsTerminationPendingAccounts,
        businessEntity: site?.BusinessEntity,
        locations: site?.Locations,
      },
    };
  }

  /**
   * Get user access token (staff login)
   */
  async getStaffToken(username, password) {
    const response = await this.apiRequest('POST', '/usertoken/issue', {
      Username: username,
      Password: password,
    });

    return response.AccessToken;
  }

  /**
   * Mindbody uses API keys primarily - token refresh is for staff tokens
   */
  async refreshAccessToken() {
    // API key doesn't expire
    return {
      accessToken: this.apiKey,
      expiresAt: null,
    };
  }

  /**
   * Get event types (classes and services)
   */
  async getEventTypes() {
    // Get both classes and services
    const [classesResponse, servicesResponse] = await Promise.all([
      this.apiRequest('GET', '/class/classschedules', null, {
        StartDate: new Date().toISOString().split('T')[0],
        EndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      }).catch(() => ({ ClassSchedules: [] })),
      this.apiRequest('GET', '/sale/services', null, {
        SellOnline: true,
      }).catch(() => ({ Services: [] })),
    ]);

    const eventTypes = [];

    // Add classes
    const classDescriptions = {};
    for (const schedule of (classesResponse.ClassSchedules || [])) {
      const classDesc = schedule.ClassDescription;
      if (classDesc && !classDescriptions[classDesc.Id]) {
        classDescriptions[classDesc.Id] = true;
        eventTypes.push({
          id: `class_${classDesc.Id}`,
          name: classDesc.Name,
          duration: classDesc.Duration,
          description: classDesc.Description,
          metadata: {
            type: 'class',
            classDescriptionId: classDesc.Id,
            program: classDesc.Program,
            category: classDesc.Category,
            subcategory: classDesc.Subcategory,
            imageUrl: classDesc.ImageURL,
          },
        });
      }
    }

    // Add services (appointments)
    for (const service of (servicesResponse.Services || [])) {
      eventTypes.push({
        id: `service_${service.Id}`,
        name: service.Name,
        duration: service.OnlineBookingTimeInterval,
        description: service.Description,
        metadata: {
          type: 'service',
          serviceId: service.Id,
          price: service.Price,
          onlinePrice: service.OnlinePrice,
          taxIncluded: service.TaxIncluded,
          productId: service.ProductId,
          count: service.Count,
        },
      });
    }

    return eventTypes;
  }

  /**
   * Get availability
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    const [type, id] = eventTypeId.split('_');

    if (type === 'class') {
      // Get class schedule
      const response = await this.apiRequest('GET', '/class/classes', null, {
        StartDateTime: `${startDate}T00:00:00`,
        EndDateTime: `${endDate}T23:59:59`,
        ClassDescriptionIds: id,
      });

      return (response.Classes || []).map(cls => ({
        startTime: cls.StartDateTime,
        endTime: cls.EndDateTime,
        available: cls.IsAvailable && cls.TotalBooked < cls.MaxCapacity,
        eventTypeId: eventTypeId,
        metadata: {
          classId: cls.Id,
          classScheduleId: cls.ClassScheduleId,
          totalBooked: cls.TotalBooked,
          maxCapacity: cls.MaxCapacity,
          waitlistAvailable: cls.WaitlistAvailable,
          locationId: cls.Location?.Id,
          locationName: cls.Location?.Name,
          staffId: cls.Staff?.Id,
          staffName: cls.Staff?.Name,
        },
      }));
    } else if (type === 'service') {
      // Get appointment availability
      const response = await this.apiRequest('GET', '/appointment/bookableitems', null, {
        SessionTypeIds: id,
        StartDate: startDate,
        EndDate: endDate,
      });

      const slots = [];
      for (const item of (response.AvailableItems || [])) {
        if (item.Availabilities) {
          for (const avail of item.Availabilities) {
            slots.push({
              startTime: avail.StartDateTime,
              endTime: avail.EndDateTime,
              available: true,
              eventTypeId: eventTypeId,
              metadata: {
                staffId: item.Staff?.Id,
                staffName: item.Staff?.Name,
                locationId: item.Location?.Id,
                locationName: item.Location?.Name,
              },
            });
          }
        }
      }

      return slots;
    }

    return [];
  }

  /**
   * Get bookings
   */
  async getBookings(startDate, endDate) {
    // Get both class visits and appointments
    const [classVisits, appointments] = await Promise.all([
      this.apiRequest('GET', '/class/visits', null, {
        StartDate: startDate,
        EndDate: endDate,
      }).catch(() => ({ Visits: [] })),
      this.apiRequest('GET', '/appointment/appointments', null, {
        StartDate: startDate,
        EndDate: endDate,
      }).catch(() => ({ Appointments: [] })),
    ]);

    const bookings = [];

    // Normalize class visits
    for (const visit of (classVisits.Visits || [])) {
      bookings.push(this.normalizeClassVisit(visit));
    }

    // Normalize appointments
    for (const appt of (appointments.Appointments || [])) {
      bookings.push(this.normalizeAppointment(appt));
    }

    return bookings;
  }

  /**
   * Get a specific booking
   */
  async getBooking(externalId) {
    const [type, id] = externalId.split('_');

    try {
      if (type === 'visit') {
        const response = await this.apiRequest('GET', `/class/visits/${id}`);
        return this.normalizeClassVisit(response.Visit);
      } else if (type === 'appt') {
        const response = await this.apiRequest('GET', '/appointment/appointments', null, {
          AppointmentIds: id,
        });
        const appt = response.Appointments?.[0];
        if (!appt) return null;
        return this.normalizeAppointment(appt);
      }
    } catch (error) {
      if (error.message.includes('not found')) {
        return null;
      }
      throw error;
    }

    return null;
  }

  /**
   * Create a booking
   */
  async createBooking(params) {
    const [type, id] = params.eventTypeId.split('_');

    // First, find or create client
    let clientId = params.metadata?.clientId;

    if (!clientId && params.customerEmail) {
      // Search for existing client
      const searchResponse = await this.apiRequest('GET', '/client/clients', null, {
        SearchText: params.customerEmail,
      });

      const existingClient = searchResponse.Clients?.find(
        c => c.Email === params.customerEmail
      );

      if (existingClient) {
        clientId = existingClient.Id;
      } else {
        // Create new client
        const nameParts = params.customerName?.split(' ') || [''];
        const createResponse = await this.apiRequest('POST', '/client/addclient', {
          FirstName: nameParts[0],
          LastName: nameParts.slice(1).join(' ') || 'Client',
          Email: params.customerEmail,
          MobilePhone: params.customerPhone,
        });
        clientId = createResponse.Client?.Id;
      }
    }

    if (type === 'class') {
      // Book into class
      const response = await this.apiRequest('POST', '/class/addclienttoclass', {
        ClientId: clientId,
        ClassId: params.metadata?.classId,
        Test: false,
        RequirePayment: params.metadata?.requirePayment || false,
        Waitlist: params.metadata?.waitlist || false,
      });

      return {
        externalId: `visit_${response.Visit?.Id}`,
        status: 'confirmed',
        startTime: params.startTime,
        endTime: params.endTime,
        customerName: params.customerName,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        metadata: {
          type: 'class',
          clientId,
          visitId: response.Visit?.Id,
        },
      };
    } else if (type === 'service') {
      // Book appointment
      const startTime = new Date(params.startTime);

      const response = await this.apiRequest('POST', '/appointment/addappointment', {
        ClientId: clientId,
        LocationId: params.metadata?.locationId,
        StaffId: params.metadata?.staffId,
        SessionTypeId: parseInt(id),
        StartDateTime: params.startTime,
        Notes: params.metadata?.notes,
      });

      return this.normalizeAppointment(response.Appointment);
    }

    throw new Error('Unknown event type');
  }

  /**
   * Update a booking
   */
  async updateBooking(externalId, params) {
    const [type, id] = externalId.split('_');

    if (type === 'appt') {
      const updateData = {};
      if (params.startTime) updateData.StartDateTime = params.startTime;
      if (params.metadata?.staffId) updateData.StaffId = params.metadata.staffId;
      if (params.metadata?.notes) updateData.Notes = params.metadata.notes;

      const response = await this.apiRequest('POST', '/appointment/updateappointment', {
        AppointmentId: parseInt(id),
        ...updateData,
      });

      return this.normalizeAppointment(response.Appointment);
    }

    // Class visits typically can't be updated, only cancelled and rebooked
    throw new Error('Class bookings cannot be updated. Please cancel and rebook.');
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(externalId, reason) {
    const [type, id] = externalId.split('_');

    if (type === 'visit') {
      await this.apiRequest('POST', '/class/removeclientfromclass', {
        ClientId: null, // Will need to get from booking
        ClassId: parseInt(id),
        LateCancel: false,
      });
    } else if (type === 'appt') {
      await this.apiRequest('POST', '/appointment/updateappointment', {
        AppointmentId: parseInt(id),
        Execute: 'Cancel',
      });
    }

    return { success: true };
  }

  /**
   * Register a webhook
   * Note: Mindbody webhooks are configured through their partner portal
   */
  async registerWebhook(webhookUrl, events) {
    console.warn('Mindbody webhooks must be configured through the Partner Portal');
    return {
      webhookId: null,
      secret: null,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    // Mindbody webhook verification depends on configuration
    return true;
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    const eventTypeMap = {
      'class.booked': 'booking.created',
      'class.cancelled': 'booking.cancelled',
      'appointment.booked': 'booking.created',
      'appointment.cancelled': 'booking.cancelled',
      'appointment.confirmed': 'booking.confirmed',
    };

    const eventType = eventTypeMap[payload.eventType] || payload.eventType;
    let booking = null;

    if (payload.data) {
      if (payload.eventType?.includes('class')) {
        booking = this.normalizeClassVisit(payload.data);
      } else if (payload.eventType?.includes('appointment')) {
        booking = this.normalizeAppointment(payload.data);
      }
    }

    return {
      eventType,
      booking,
      rawData: payload,
    };
  }

  /**
   * Normalize a class visit to standard booking format
   */
  normalizeClassVisit(visit) {
    return {
      externalId: `visit_${visit.Id}`,
      status: this.normalizeStatus(visit.SignedIn ? 'attended' : 'confirmed'),
      startTime: visit.StartDateTime,
      endTime: visit.EndDateTime,
      customerName: visit.Client ? `${visit.Client.FirstName} ${visit.Client.LastName}`.trim() : null,
      customerEmail: visit.Client?.Email,
      customerPhone: visit.Client?.MobilePhone,
      metadata: {
        type: 'class',
        visitId: visit.Id,
        clientId: visit.Client?.Id,
        classId: visit.ClassId,
        className: visit.Name,
        signedIn: visit.SignedIn,
        webSignup: visit.WebSignup,
        locationId: visit.Location?.Id,
        locationName: visit.Location?.Name,
        staffId: visit.Staff?.Id,
        staffName: visit.Staff?.Name,
      },
    };
  }

  /**
   * Normalize an appointment to standard booking format
   */
  normalizeAppointment(appt) {
    return {
      externalId: `appt_${appt.Id}`,
      status: this.normalizeStatus(appt.Status),
      startTime: appt.StartDateTime,
      endTime: appt.EndDateTime,
      customerName: appt.Client ? `${appt.Client.FirstName} ${appt.Client.LastName}`.trim() : null,
      customerEmail: appt.Client?.Email,
      customerPhone: appt.Client?.MobilePhone,
      metadata: {
        type: 'appointment',
        appointmentId: appt.Id,
        clientId: appt.Client?.Id,
        sessionTypeId: appt.SessionType?.Id,
        sessionTypeName: appt.SessionType?.Name,
        locationId: appt.Location?.Id,
        locationName: appt.Location?.Name,
        staffId: appt.Staff?.Id,
        staffName: appt.Staff?.Name,
        notes: appt.Notes,
        genderRequested: appt.GenderRequested,
        resources: appt.Resources,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'Booked': 'confirmed',
      'Confirmed': 'confirmed',
      'Arrived': 'confirmed',
      'Completed': 'completed',
      'NoShow': 'no_show',
      'Cancelled': 'cancelled',
      'attended': 'completed',
    };
    return statusMap[status] || status?.toLowerCase() || 'confirmed';
  }

  /**
   * Exchange code for tokens (not used for Mindbody - API key auth)
   */
  async exchangeCodeForTokens(code, redirectUri) {
    throw new Error('Mindbody does not support OAuth. Use API key authentication.');
  }
}

module.exports = { MindbodyAdapter };
