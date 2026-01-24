/**
 * Google Calendar Provider Adapter
 *
 * Implements the booking provider interface for Google Calendar.
 * Google Calendar uses OAuth2 authentication.
 *
 * API Documentation: https://developers.google.com/calendar/api/guides/overview
 */

const { google } = require('googleapis');
const { BaseProviderAdapter } = require('./interface');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

class GoogleCalendarAdapter extends BaseProviderAdapter {
  constructor(config) {
    super(config);
    this.providerId = 'google_calendar';
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenExpiresAt = config.tokenExpiresAt;
    this.calendarId = config.config?.calendarId || 'primary';
    this.timezone = config.config?.timezone || 'Europe/Dublin';
    this.slotDuration = config.config?.slotDuration || 30; // default 30 min slots

    // Create OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.API_URL}/api/providers/google_calendar/oauth/callback`
    );

    // Set credentials
    this.oauth2Client.setCredentials({
      access_token: this.accessToken,
      refresh_token: this.refreshToken,
      expiry_date: this.tokenExpiresAt ? new Date(this.tokenExpiresAt).getTime() : null,
    });

    // Create Calendar API client
    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
  }

  /**
   * Get OAuth URL for authorization
   */
  static getAuthUrl(redirectUri, state) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state: state,
      prompt: 'consent', // Force consent to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code, redirectUri) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : new Date(Date.now() + 3600 * 1000),
    };
  }

  /**
   * Refresh the access token
   */
  async refreshAccessToken() {
    const { credentials } = await this.oauth2Client.refreshAccessToken();

    // Update instance tokens
    this.accessToken = credentials.access_token;
    this.oauth2Client.setCredentials(credentials);

    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || this.refreshToken,
      expiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : new Date(Date.now() + 3600 * 1000),
    };
  }

  /**
   * Test the connection
   */
  async testConnection() {
    try {
      const response = await this.calendar.calendarList.list({ maxResults: 1 });
      const calendars = response.data.items || [];

      // Get primary calendar info
      const primaryCalendar = calendars.find(c => c.primary) || calendars[0];

      return {
        success: true,
        accountInfo: {
          id: primaryCalendar?.id || 'primary',
          name: primaryCalendar?.summary || 'Google Calendar',
          email: primaryCalendar?.id,
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
    const response = await this.calendar.calendarList.list();
    const calendars = response.data.items || [];
    const primaryCalendar = calendars.find(c => c.primary) || calendars[0];

    return {
      id: primaryCalendar?.id || 'primary',
      name: primaryCalendar?.summary || 'Google Calendar',
      email: primaryCalendar?.id,
      metadata: {
        calendars: calendars.map(c => ({
          id: c.id,
          summary: c.summary,
          primary: c.primary,
          accessRole: c.accessRole,
          backgroundColor: c.backgroundColor,
          timezone: c.timeZone,
        })),
        timezone: primaryCalendar?.timeZone,
      },
    };
  }

  /**
   * Get event types (calendars in Google Calendar context)
   */
  async getEventTypes() {
    const response = await this.calendar.calendarList.list();
    const calendars = response.data.items || [];

    // Filter to only owner/writer calendars
    const writableCalendars = calendars.filter(c =>
      c.accessRole === 'owner' || c.accessRole === 'writer'
    );

    return writableCalendars.map(cal => ({
      id: cal.id,
      name: cal.summary,
      duration: this.slotDuration,
      description: cal.description || '',
      metadata: {
        primary: cal.primary,
        accessRole: cal.accessRole,
        backgroundColor: cal.backgroundColor,
        foregroundColor: cal.foregroundColor,
        timezone: cal.timeZone,
      },
    }));
  }

  /**
   * Get availability for a specific date range
   * Returns available time slots based on free/busy info
   */
  async getAvailability(eventTypeId, startDate, endDate) {
    const calendarId = eventTypeId || this.calendarId;

    // Get free/busy information
    const timeMin = new Date(`${startDate}T00:00:00`);
    const timeMax = new Date(`${endDate}T23:59:59`);

    const freeBusyResponse = await this.calendar.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        timeZone: this.timezone,
        items: [{ id: calendarId }],
      },
    });

    const busySlots = freeBusyResponse.data.calendars?.[calendarId]?.busy || [];

    // Generate available slots
    const slots = this.generateAvailableSlots(startDate, endDate, busySlots);

    return slots;
  }

  /**
   * Generate available time slots based on busy times
   */
  generateAvailableSlots(startDate, endDate, busySlots) {
    const slots = [];
    const startHour = 9; // 9 AM
    const endHour = 17; // 5 PM
    const slotDuration = this.slotDuration;

    const currentDate = new Date(startDate);
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59);

    while (currentDate <= endDateTime) {
      // Skip weekends (optional - can be configured)
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        // Generate slots for this day
        for (let hour = startHour; hour < endHour; hour++) {
          for (let minute = 0; minute < 60; minute += slotDuration) {
            const slotStart = new Date(currentDate);
            slotStart.setHours(hour, minute, 0, 0);

            const slotEnd = new Date(slotStart);
            slotEnd.setMinutes(slotEnd.getMinutes() + slotDuration);

            // Check if slot overlaps with any busy time
            const isAvailable = !busySlots.some(busy => {
              const busyStart = new Date(busy.start);
              const busyEnd = new Date(busy.end);
              return slotStart < busyEnd && slotEnd > busyStart;
            });

            // Only include future slots
            if (slotStart > new Date()) {
              slots.push({
                startTime: slotStart.toISOString(),
                endTime: slotEnd.toISOString(),
                available: isAvailable,
                eventTypeId: this.calendarId,
              });
            }
          }
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(0, 0, 0, 0);
    }

    return slots;
  }

  /**
   * Get bookings (events) within a date range
   */
  async getBookings(startDate, endDate) {
    const timeMin = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined;
    const timeMax = endDate ? new Date(`${endDate}T23:59:59`).toISOString() : undefined;

    const response = await this.calendar.events.list({
      calendarId: this.calendarId,
      timeMin,
      timeMax,
      maxResults: 250,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    return events.map(event => this.normalizeBooking(event));
  }

  /**
   * Get a specific booking (event)
   */
  async getBooking(externalId) {
    try {
      const response = await this.calendar.events.get({
        calendarId: this.calendarId,
        eventId: externalId,
      });

      return this.normalizeBooking(response.data);
    } catch (error) {
      if (error.code === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Create a new booking (event)
   */
  async createBooking(params) {
    const {
      eventTypeId,
      startTime,
      endTime,
      customerName,
      customerEmail,
      customerPhone,
      metadata = {},
    } = params;

    const calendarId = eventTypeId || this.calendarId;

    // Calculate end time if not provided
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + this.slotDuration * 60000);

    const event = {
      summary: `Appointment: ${customerName}`,
      description: this.buildEventDescription(customerName, customerPhone, metadata),
      start: {
        dateTime: start.toISOString(),
        timeZone: this.timezone,
      },
      end: {
        dateTime: end.toISOString(),
        timeZone: this.timezone,
      },
      attendees: customerEmail ? [{ email: customerEmail }] : [],
      extendedProperties: {
        private: {
          customerName,
          customerPhone: customerPhone || '',
          customerEmail: customerEmail || '',
          source: 'voicefleet',
          ...metadata,
        },
      },
    };

    // Add reminders
    event.reminders = {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 24 hours before
        { method: 'popup', minutes: 30 }, // 30 minutes before
      ],
    };

    const response = await this.calendar.events.insert({
      calendarId,
      requestBody: event,
      sendUpdates: customerEmail ? 'all' : 'none', // Send invitation to attendee
    });

    return this.normalizeBooking(response.data);
  }

  /**
   * Update an existing booking (event)
   */
  async updateBooking(externalId, params) {
    const calendarId = params.eventTypeId || this.calendarId;

    // Get existing event
    const existing = await this.calendar.events.get({
      calendarId,
      eventId: externalId,
    });

    const event = existing.data;

    // Update fields
    if (params.startTime) {
      event.start = {
        dateTime: new Date(params.startTime).toISOString(),
        timeZone: this.timezone,
      };
    }

    if (params.endTime) {
      event.end = {
        dateTime: new Date(params.endTime).toISOString(),
        timeZone: this.timezone,
      };
    }

    if (params.customerName) {
      event.summary = `Appointment: ${params.customerName}`;
      event.extendedProperties = event.extendedProperties || { private: {} };
      event.extendedProperties.private.customerName = params.customerName;
    }

    if (params.customerEmail) {
      event.attendees = [{ email: params.customerEmail }];
      event.extendedProperties = event.extendedProperties || { private: {} };
      event.extendedProperties.private.customerEmail = params.customerEmail;
    }

    if (params.customerPhone) {
      event.extendedProperties = event.extendedProperties || { private: {} };
      event.extendedProperties.private.customerPhone = params.customerPhone;
    }

    const response = await this.calendar.events.update({
      calendarId,
      eventId: externalId,
      requestBody: event,
      sendUpdates: 'all',
    });

    return this.normalizeBooking(response.data);
  }

  /**
   * Cancel a booking (event)
   */
  async cancelBooking(externalId, reason) {
    const calendarId = this.calendarId;

    // Option 1: Delete the event
    // await this.calendar.events.delete({
    //   calendarId,
    //   eventId: externalId,
    //   sendUpdates: 'all',
    // });

    // Option 2: Update event status to cancelled (preferred for audit trail)
    const existing = await this.calendar.events.get({
      calendarId,
      eventId: externalId,
    });

    const event = existing.data;
    event.status = 'cancelled';
    event.summary = `[CANCELLED] ${event.summary}`;
    if (reason) {
      event.description = `CANCELLED: ${reason}\n\n${event.description || ''}`;
    }

    await this.calendar.events.update({
      calendarId,
      eventId: externalId,
      requestBody: event,
      sendUpdates: 'all',
    });

    return { success: true };
  }

  /**
   * Register a webhook (Google Calendar uses push notifications)
   */
  async registerWebhook(webhookUrl, events) {
    // Google Calendar uses push notifications via channels
    // This requires the webhook URL to be verified and publicly accessible
    const response = await this.calendar.events.watch({
      calendarId: this.calendarId,
      requestBody: {
        id: `voicefleet-${Date.now()}`,
        type: 'web_hook',
        address: webhookUrl,
        expiration: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days from now
      },
    });

    return {
      webhookId: response.data.id,
      secret: response.data.resourceId,
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature, secret) {
    // Google Calendar push notifications include X-Goog-Channel-Token header
    // which can be used for verification
    return true; // Implement proper verification if needed
  }

  /**
   * Parse webhook payload
   */
  async parseWebhookPayload(payload) {
    // Google Calendar push notifications are minimal
    // They just notify that something changed - you need to sync to get details
    const resourceId = payload.resourceId;
    const resourceState = payload.resourceState;

    let eventType = 'unknown';
    if (resourceState === 'exists') {
      eventType = 'booking.updated';
    } else if (resourceState === 'sync') {
      eventType = 'sync';
    }

    return {
      eventType,
      booking: null, // Need to fetch updated events separately
      rawData: payload,
    };
  }

  /**
   * Normalize a Google Calendar event to standard booking format
   */
  normalizeBooking(event) {
    const extendedProps = event.extendedProperties?.private || {};

    // Try to extract customer info from event
    let customerName = extendedProps.customerName || '';
    let customerEmail = extendedProps.customerEmail || '';
    let customerPhone = extendedProps.customerPhone || '';

    // Fallback to attendees
    if (!customerEmail && event.attendees?.length > 0) {
      const attendee = event.attendees[0];
      customerEmail = attendee.email || '';
      customerName = customerName || attendee.displayName || '';
    }

    // Extract name from summary if not in extended properties
    if (!customerName && event.summary) {
      const match = event.summary.match(/Appointment:\s*(.+)/i);
      if (match) {
        customerName = match[1].trim();
      } else {
        customerName = event.summary;
      }
    }

    return {
      externalId: event.id,
      status: this.normalizeStatus(event.status),
      startTime: event.start?.dateTime || event.start?.date,
      endTime: event.end?.dateTime || event.end?.date,
      customerName,
      customerEmail,
      customerPhone,
      metadata: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink,
        attendees: event.attendees,
        organizer: event.organizer,
        created: event.created,
        updated: event.updated,
        recurringEventId: event.recurringEventId,
        ...extendedProps,
      },
    };
  }

  /**
   * Normalize booking status
   */
  normalizeStatus(status) {
    const statusMap = {
      'confirmed': 'confirmed',
      'tentative': 'pending',
      'cancelled': 'cancelled',
    };
    return statusMap[status] || 'confirmed';
  }

  /**
   * Build event description with customer info
   */
  buildEventDescription(customerName, customerPhone, metadata) {
    let description = `Booking via VoiceFleet\n\n`;
    description += `Customer: ${customerName}\n`;
    if (customerPhone) {
      description += `Phone: ${customerPhone}\n`;
    }
    if (metadata.notes) {
      description += `\nNotes: ${metadata.notes}\n`;
    }
    if (metadata.party_size) {
      description += `Party size: ${metadata.party_size}\n`;
    }
    return description;
  }
}

module.exports = { GoogleCalendarAdapter };
