# VAPI Booking Tools Architecture

This document explains how the AI phone assistant integrates with third-party booking providers (Cal.com, Calendly, Square, OpenTable, etc.) to enable voice-based appointment booking.

## Overview

The booking tools system allows the AI assistant to:
- Check availability from connected calendar/booking providers
- Create new bookings/appointments
- Look up existing bookings
- Cancel bookings

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PHONE CALL FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    ┌──────────┐         ┌──────────────┐         ┌─────────────────┐
    │  Caller  │ ──────▶ │   Telnyx/    │ ──────▶ │  VAPI Platform  │
    │ (Phone)  │         │   VoIPCloud  │         │  (Voice AI)     │
    └──────────┘         └──────────────┘         └────────┬────────┘
                                                           │
                                                           │ Webhook
                                                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VOICEFLEET API SERVER                              │
│                         (https://dev.voicefleet.ai)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                    VAPI WEBHOOKS ROUTER                             │    │
│   │                   /api/vapi/webhook                                 │    │
│   │                   /api/vapi/tools    ◀──── Tool Callbacks           │    │
│   └──────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                     VAPI TOOLS SERVICE                              │    │
│   │                    (vapiTools.js)                                   │    │
│   │                                                                     │    │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐   │    │
│   │   │ check_          │  │ create_         │  │ cancel_         │   │    │
│   │   │ availability    │  │ booking         │  │ booking         │   │    │
│   │   └────────┬────────┘  └────────┬────────┘  └────────┬────────┘   │    │
│   │            │                    │                    │            │    │
│   │   ┌────────┴────────┐  ┌────────┴────────┐          │            │    │
│   │   │ lookup_         │  │                 │          │            │    │
│   │   │ booking         │  │                 │          │            │    │
│   │   └────────┬────────┘  │                 │          │            │    │
│   └────────────┼───────────┼─────────────────┼──────────┼────────────┘    │
│                │           │                 │          │                 │
│                ▼           ▼                 ▼          ▼                 │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                  GENERIC PROVIDER ROUTER                            │    │
│   │                 (providers/index.js)                                │    │
│   │                                                                     │    │
│   │   Routes requests to the appropriate provider adapter based on      │    │
│   │   the user's connected integrations                                 │    │
│   └──────────────────────────┬─────────────────────────────────────────┘    │
│                              │                                               │
│                              ▼                                               │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                     PROVIDER ADAPTERS                               │    │
│   │                                                                     │    │
│   │   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │    │
│   │   │ Cal.com  │  │Calendly  │  │  Square  │  │    OpenTable     │  │    │
│   │   │ Adapter  │  │ Adapter  │  │ Adapter  │  │     Adapter      │  │    │
│   │   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘  │    │
│   │        │             │             │                 │            │    │
│   └────────┼─────────────┼─────────────┼─────────────────┼────────────┘    │
│            │             │             │                 │                 │
└────────────┼─────────────┼─────────────┼─────────────────┼─────────────────┘
             │             │             │                 │
             ▼             ▼             ▼                 ▼
    ┌──────────────────────────────────────────────────────────────────┐
    │                    EXTERNAL PROVIDER APIs                         │
    │                                                                   │
    │   Cal.com API    Calendly API    Square API    OpenTable API     │
    │   (calendar)     (scheduling)    (bookings)    (reservations)    │
    └──────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. VAPI Tools Service (`src/services/vapiTools.js`)

This service defines the tools available to the VAPI assistant and handles their execution.

#### Tool Definitions

```javascript
// Tools are defined with serverUrl for VAPI to call back
function getBookingToolDefinitions(serverUrl) {
  return [
    {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check available time slots for booking...',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD format' },
            service_type: { type: 'string', description: 'Type of service' }
          },
          required: ['date']
        }
      },
      server: {
        url: `${serverUrl}/api/vapi/tools`  // Our callback endpoint
      }
    },
    // ... create_booking, cancel_booking, lookup_booking
  ];
}
```

#### Tool Handlers

Each tool has a dedicated handler:

| Tool | Handler | Description |
|------|---------|-------------|
| `check_availability` | `handleCheckAvailability()` | Queries provider for available slots |
| `create_booking` | `handleCreateBooking()` | Creates booking in provider + internal DB |
| `cancel_booking` | `handleCancelBooking()` | Cancels booking in provider + internal DB |
| `lookup_booking` | `handleLookupBooking()` | Finds booking by phone or reference |

### 2. VAPI Webhooks Router (`src/routes/vapiWebhooks.js`)

#### Tool Callback Endpoint

```
POST /api/vapi/tools
```

When VAPI's assistant invokes a tool, it calls this endpoint:

```javascript
// Request from VAPI
{
  "message": {
    "type": "tool-calls",
    "toolCalls": [{
      "id": "call_abc123",
      "function": {
        "name": "check_availability",
        "arguments": "{\"date\":\"2024-01-20\"}"
      }
    }],
    "call": {
      "id": "call_xyz",
      "customer": { "number": "+1234567890" },
      "assistantId": "asst_123",
      "phoneNumberId": "pn_456"
    }
  }
}

// Response to VAPI
{
  "results": [{
    "toolCallId": "call_abc123",
    "result": "{\"success\":true,\"message\":\"I have availability at 9 AM, 10 AM, and 2 PM...\"}"
  }]
}
```

### 3. Generic Provider Router (`src/services/providers/index.js`)

The router abstracts provider-specific logic:

```javascript
// Get availability from any connected provider
async getAvailability(userId, connectionId, eventTypeId, startDate, endDate) {
  const connection = await this.getConnection(userId, connectionId);
  const adapter = this.getAdapter(connection.provider_id, connection.credentials);
  return adapter.getAvailability(eventTypeId, startDate, endDate);
}

// Create booking in any provider
async createExternalBooking(userId, connectionId, bookingData) {
  const connection = await this.getConnection(userId, connectionId);
  const adapter = this.getAdapter(connection.provider_id, connection.credentials);
  return adapter.createBooking(bookingData);
}
```

### 4. Provider Adapters

Each provider has an adapter implementing a common interface:

```javascript
// Interface all adapters implement
class ProviderAdapter {
  async getEventTypes()                    // Get bookable services/event types
  async getAvailability(eventTypeId, start, end)  // Get available slots
  async createBooking(bookingData)         // Create a booking
  async cancelBooking(bookingId, reason)   // Cancel a booking
  async getBookings(startDate, endDate)    // List bookings
}
```

#### Supported Providers

| Provider | File | Auth Type | Features |
|----------|------|-----------|----------|
| Cal.com | `calcom.js` | API Key | Full booking lifecycle |
| Calendly | `calendly.js` | OAuth 2.0 | Availability, bookings |
| Square | `square.js` | OAuth 2.0 | Appointments, services |
| OpenTable | `opentable.js` | API Key | Restaurant reservations |
| Acuity | `acuity.js` | API Key | Scheduling |

## Data Flow Examples

### Example 1: Check Availability

```
1. Caller: "Do you have anything available tomorrow?"

2. VAPI Assistant processes and calls tool:
   → POST /api/vapi/tools
   {
     "message": {
       "toolCalls": [{
         "function": {
           "name": "check_availability",
           "arguments": "{\"date\":\"2024-01-20\"}"
         }
       }],
       "call": { "phoneNumberId": "pn_123" }
     }
   }

3. VoiceFleet API:
   a. Find user from phoneNumberId
   b. Get user's connected provider (e.g., Cal.com)
   c. Call Cal.com API for availability
   d. Format response for voice

4. Response to VAPI:
   {
     "results": [{
       "result": "{\"success\":true,\"message\":\"On Saturday January 20th, I have availability at 9 AM, 10 AM, 11 AM, and 2 PM. Which time works best for you?\"}"
     }]
   }

5. VAPI speaks the response to caller
```

### Example 2: Create Booking

```
1. Caller: "Let's do 10 AM. My name is John Smith."

2. VAPI calls tool:
   → POST /api/vapi/tools
   {
     "toolCalls": [{
       "function": {
         "name": "create_booking",
         "arguments": "{\"date\":\"2024-01-20\",\"time\":\"10:00\",\"customer_name\":\"John Smith\"}"
       }
     }],
     "call": {
       "customer": { "number": "+1234567890" }
     }
   }

3. VoiceFleet API:
   a. Find/create customer record
   b. Create booking in Cal.com
   c. Store booking in internal DB
   d. Generate confirmation number

4. Response:
   {
     "results": [{
       "result": "{\"success\":true,\"message\":\"I've booked your appointment for Saturday January 20th at 10 AM. Your confirmation number is ABC123. Is there anything else I can help you with?\"}"
     }]
   }
```

## Dynamic Tool Configuration

### When Tools Are Added

Tools are automatically added to the VAPI assistant when:

1. **User connects a provider** - API key or OAuth flow
2. **Assistant is created** - If provider already connected
3. **Assistant is recreated** - During sync operations

```javascript
// In assistant.js - createAssistantForUser()
const connections = await providerService.getConnections(userId);
const hasBookingProvider = connections.some(c => c.status === 'connected');

if (hasBookingProvider) {
  const serverUrl = process.env.VAPI_SERVER_URL || 'https://dev.voicefleet.ai';
  bookingTools = vapiTools.getBookingToolDefinitions(serverUrl);
}

const assistantConfig = {
  ...DEFAULT_ASSISTANT_TEMPLATE,
  tools: bookingTools,  // Added dynamically
  // ...
};
```

### When Tools Are Removed

Tools are removed when:
- User disconnects their last booking provider
- Provider connection fails/expires

### System Prompt Updates

The AI's system prompt is updated to reflect booking capabilities:

```javascript
// Without booking provider
"Your role is to:
- Answer questions helpfully and professionally
- Take messages when appropriate"

// With booking provider connected
"Your role is to:
- Answer questions helpfully and professionally
- Assist with scheduling and appointments when asked
- Take messages when appropriate

Booking Capabilities:
- You can check availability and book appointments for customers
- When a customer wants to book, use the check_availability tool
- Always confirm the date, time, and customer name before creating a booking
- After booking, provide the confirmation number to the customer"
```

## Database Schema

### Provider Connections

```sql
CREATE TABLE provider_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider_id TEXT REFERENCES booking_providers(id),
  status TEXT,  -- 'connected', 'disconnected', 'error'
  credentials_encrypted TEXT,  -- Encrypted API keys/tokens
  external_account_id TEXT,
  external_account_name TEXT,
  sync_enabled BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP,
  connected_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Bookings

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),
  status TEXT,  -- 'pending', 'confirmed', 'cancelled'
  booking_date DATE,
  booking_time TIME,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  calendar_event_id TEXT,  -- External provider booking ID
  source TEXT,  -- 'phone', 'web', 'manual'
  call_id UUID,  -- Reference to call that created booking
  booking_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Environment Variables

```bash
# Server URL for VAPI tool callbacks
VAPI_SERVER_URL=https://dev.voicefleet.ai
# or
API_BASE_URL=https://dev.voicefleet.ai

# Provider API Keys (for testing)
CALCOM_API_KEY=cal_xxx
CALENDLY_CLIENT_ID=xxx
CALENDLY_CLIENT_SECRET=xxx
SQUARE_APPLICATION_ID=xxx
SQUARE_ACCESS_TOKEN=xxx
```

## Testing

### Test Endpoint (Development Only)

```
POST /api/vapi/tools/test
Content-Type: application/json

{
  "userId": "test-user-id",
  "toolName": "check_availability",
  "toolArgs": {
    "date": "2024-01-20"
  }
}
```

### Manual Testing Flow

1. Connect a booking provider in the dashboard
2. Make a test call to your phone number
3. Say: "I'd like to book an appointment for tomorrow"
4. The AI should check availability and offer times
5. Confirm a time and provide your name
6. Receive confirmation number

## Error Handling

### Provider Unavailable

If the external provider is unavailable, the system falls back to:
- Default availability slots (9 AM - 5 PM, 30-min intervals)
- Internal booking storage only

### User Not Found

If the user can't be identified from the call:
- Returns error message to AI
- AI informs caller and offers to take a message

### Tool Execution Errors

All errors are caught and returned as structured responses:

```javascript
{
  "success": false,
  "error": "Could not connect to booking provider",
  "message": "I'm having trouble accessing the calendar right now. Can I take a message instead?"
}
```

## Security Considerations

1. **Credentials Encryption** - Provider API keys/tokens are encrypted at rest
2. **User Isolation** - Each user can only access their own connections
3. **Webhook Verification** - VAPI webhook signatures can be verified
4. **Rate Limiting** - Tool calls are rate-limited per user
5. **Audit Logging** - All booking operations are logged

## Future Enhancements

- [ ] Multi-provider booking (check availability across multiple calendars)
- [ ] Rescheduling support
- [ ] Waitlist management
- [ ] SMS/Email confirmations from AI
- [ ] Calendar sync (bidirectional)
- [ ] Custom booking fields per provider
