# Plan 04: Calendar Integrations

## Overview
Implement Google Calendar (all plans) and Outlook Calendar (Growth/Pro) integrations.

---

## Feature Matrix

| Calendar | Starter | Growth | Pro |
|----------|---------|--------|-----|
| Google Calendar | ✅ | ✅ | ✅ |
| Outlook Calendar | ❌ | ✅ | ✅ |
| Multi-staff | ❌ | ❌ | ✅ |

---

## Google Calendar Integration

### 1. Google Cloud Setup

1. Create project in Google Cloud Console
2. Enable Google Calendar API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:3000/api/integrations/google/callback` (dev)
   - `https://api.voicefleet.ai/api/integrations/google/callback` (prod)

### 2. Environment Variables

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://api.voicefleet.ai/api/integrations/google/callback
```

### 3. Database

Uses existing `provider_connections` table:

```sql
-- provider_id = 'google_calendar'
-- credentials stored as encrypted JSON:
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expiry_date": 1234567890,
  "calendar_id": "primary"
}
```

### 4. API Endpoints

```
GET  /api/integrations/google/auth     - Get OAuth URL
GET  /api/integrations/google/callback - OAuth callback
GET  /api/integrations/google/status   - Check connection status
POST /api/integrations/google/disconnect - Disconnect
GET  /api/integrations/google/calendars - List user's calendars
PUT  /api/integrations/google/calendar  - Set active calendar
```

### 5. Service: `services/googleCalendar.js`

```javascript
const { google } = require('googleapis');

class GoogleCalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate OAuth URL for user authorization
   */
  getAuthUrl(userId) {
    const state = encodeState({ userId });
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/calendar.events',
      ],
      state,
      prompt: 'consent', // Force refresh token
    });
  }

  /**
   * Handle OAuth callback and store tokens
   */
  async handleCallback(code, userId) {
    const { tokens } = await this.oauth2Client.getToken(code);

    await saveProviderConnection(userId, 'google_calendar', {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      calendar_id: 'primary',
    });

    return { success: true };
  }

  /**
   * Check availability for a date range
   */
  async checkAvailability(userId, date, durationMinutes = 60) {
    const client = await this.getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const startOfDay = new Date(date);
    startOfDay.setHours(9, 0, 0, 0); // Business hours start

    const endOfDay = new Date(date);
    endOfDay.setHours(18, 0, 0, 0); // Business hours end

    // Get busy times
    const freeBusy = await calendar.freebusy.query({
      requestBody: {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busyTimes = freeBusy.data.calendars.primary.busy;

    // Calculate available slots
    const slots = this.calculateAvailableSlots(
      startOfDay,
      endOfDay,
      busyTimes,
      durationMinutes
    );

    return slots;
  }

  /**
   * Create a calendar event for booking
   */
  async createEvent(userId, booking) {
    const client = await this.getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    const event = {
      summary: `${booking.service} - ${booking.customerName}`,
      description: `
        Customer: ${booking.customerName}
        Phone: ${booking.customerPhone}
        Service: ${booking.service}
        Notes: ${booking.notes || 'None'}

        Booked via VoiceFleet AI
      `,
      start: {
        dateTime: booking.startTime,
        timeZone: booking.timezone || 'Europe/Dublin',
      },
      end: {
        dateTime: booking.endTime,
        timeZone: booking.timezone || 'Europe/Dublin',
      },
      attendees: booking.customerEmail ? [{ email: booking.customerEmail }] : [],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Send invite to attendees
    });

    return {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
    };
  }

  /**
   * Cancel/delete a calendar event
   */
  async cancelEvent(userId, eventId) {
    const client = await this.getAuthenticatedClient(userId);
    const calendar = google.calendar({ version: 'v3', auth: client });

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendUpdates: 'all',
    });
  }

  /**
   * Get authenticated client with token refresh
   */
  async getAuthenticatedClient(userId) {
    const connection = await getProviderConnection(userId, 'google_calendar');

    if (!connection) {
      throw new Error('Google Calendar not connected');
    }

    this.oauth2Client.setCredentials({
      access_token: connection.credentials.access_token,
      refresh_token: connection.credentials.refresh_token,
    });

    // Check if token needs refresh
    if (Date.now() >= connection.credentials.expiry_date - 60000) {
      const { credentials } = await this.oauth2Client.refreshAccessToken();
      await updateProviderCredentials(userId, 'google_calendar', credentials);
    }

    return this.oauth2Client;
  }
}

module.exports = new GoogleCalendarService();
```

---

## Outlook Calendar Integration

### 1. Azure AD Setup

1. Register app in Azure Portal → App registrations
2. Add Microsoft Graph API permissions:
   - `Calendars.ReadWrite`
   - `User.Read`
3. Create client secret
4. Add redirect URIs

### 2. Environment Variables

```bash
# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-azure-app-id
MICROSOFT_CLIENT_SECRET=your-azure-secret
MICROSOFT_REDIRECT_URI=https://api.voicefleet.ai/api/integrations/outlook/callback
```

### 3. Service: `services/outlookCalendar.js`

Similar structure to Google, using Microsoft Graph API:

```javascript
const { Client } = require('@microsoft/microsoft-graph-client');

class OutlookCalendarService {
  async checkAvailability(userId, date) {
    const client = await this.getAuthenticatedClient(userId);

    const scheduleInfo = await client
      .api('/me/calendar/getSchedule')
      .post({
        schedules: ['me'],
        startTime: { dateTime: startOfDay, timeZone: 'Europe/Dublin' },
        endTime: { dateTime: endOfDay, timeZone: 'Europe/Dublin' },
        availabilityViewInterval: 30,
      });

    return this.parseAvailability(scheduleInfo);
  }

  async createEvent(userId, booking) {
    const client = await this.getAuthenticatedClient(userId);

    const event = {
      subject: `${booking.service} - ${booking.customerName}`,
      body: {
        contentType: 'text',
        content: `Booked via VoiceFleet AI\n\nCustomer: ${booking.customerName}\nPhone: ${booking.customerPhone}`,
      },
      start: {
        dateTime: booking.startTime,
        timeZone: 'Europe/Dublin',
      },
      end: {
        dateTime: booking.endTime,
        timeZone: 'Europe/Dublin',
      },
    };

    return await client.api('/me/events').post(event);
  }
}
```

---

## AI Tools Integration

### Update `services/vapiTools.js`

```javascript
// Add calendar-aware booking tools

const bookingTools = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Check available appointment slots for a specific date',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Date to check (YYYY-MM-DD format)',
          },
          duration_minutes: {
            type: 'number',
            description: 'Appointment duration in minutes',
            default: 60,
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_booking',
      description: 'Create a booking/appointment',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string' },
          customer_phone: { type: 'string' },
          service: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['customer_name', 'customer_phone', 'date', 'time'],
      },
    },
  },
];

// Tool handler
async function handleCheckAvailability(userId, args) {
  const features = await getUserFeatures(userId);
  const connection = await getActiveCalendarConnection(userId);

  if (!connection) {
    return { error: 'No calendar connected' };
  }

  let service;
  if (connection.provider_id === 'google_calendar') {
    service = require('./googleCalendar');
  } else if (connection.provider_id === 'outlook_calendar') {
    if (!features.outlook_calendar_enabled) {
      return { error: 'Outlook Calendar requires Growth or Pro plan' };
    }
    service = require('./outlookCalendar');
  }

  const slots = await service.checkAvailability(userId, args.date, args.duration_minutes);

  return {
    date: args.date,
    available_slots: slots.map(s => s.time),
    message: slots.length > 0
      ? `Available times on ${args.date}: ${slots.map(s => s.time).join(', ')}`
      : `No availability on ${args.date}. Would you like to check another day?`,
  };
}
```

---

## Frontend UI

### Integrations Page Update

```tsx
// app/(dashboard)/integrations/page.tsx

<Card>
  <CardHeader>
    <CardTitle>Calendar Integrations</CardTitle>
    <CardDescription>
      Connect your calendar to enable real-time booking
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* Google Calendar - All Plans */}
    <IntegrationCard
      name="Google Calendar"
      icon={<GoogleIcon />}
      connected={googleConnected}
      onConnect={() => connectGoogle()}
      onDisconnect={() => disconnectGoogle()}
    />

    {/* Outlook Calendar - Growth/Pro Only */}
    <IntegrationCard
      name="Outlook Calendar"
      icon={<OutlookIcon />}
      connected={outlookConnected}
      onConnect={() => connectOutlook()}
      onDisconnect={() => disconnectOutlook()}
      locked={!hasFeature('outlook_calendar')}
      upgradeMessage="Upgrade to Growth for Outlook Calendar"
    />
  </CardContent>
</Card>
```

---

## Multi-Staff Calendar (Pro Only)

For Pro users with multiple staff members:

```sql
-- Additional table for staff calendars
CREATE TABLE staff_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  staff_name TEXT NOT NULL,
  provider_id TEXT NOT NULL, -- google_calendar, outlook_calendar
  calendar_id TEXT NOT NULL,
  credentials JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

AI can then ask "Which staff member would you like?" and check that person's calendar.

---

## Estimated Effort

| Task | Time |
|------|------|
| Google Cloud setup | 1 hour |
| Google Calendar service | 4 hours |
| Google OAuth flow | 2 hours |
| Azure AD setup | 1 hour |
| Outlook Calendar service | 4 hours |
| Outlook OAuth flow | 2 hours |
| AI tools integration | 3 hours |
| Frontend UI | 3 hours |
| Multi-staff (Pro) | 4 hours |
| Testing | 4 hours |
| **Total** | **28 hours** |
