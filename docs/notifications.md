# Notifications Feature

Get notified when calls happen and optionally transfer calls to a human.

## Overview

The notifications feature allows users to:
- Receive **email notifications** when calls complete, escalate, or go to voicemail
- Receive **SMS notifications** for urgent alerts
- Enable **call transfer** so the AI can transfer callers to a human when needed

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend UI   │────▶│   Backend API   │────▶│    Supabase     │
│  (Next.js)      │     │   (Express)     │     │   (Postgres)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Vapi Webhooks  │
                        │  (Call Events)  │
                        └─────────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                      ▼
             ┌───────────┐          ┌───────────┐
             │  Resend   │          │  Twilio   │
             │  (Email)  │          │   (SMS)   │
             └───────────┘          └───────────┘
```

## Database Schema

### `notification_preferences`
| Column | Type | Description |
|--------|------|-------------|
| `email_enabled` | boolean | Send email notifications |
| `email_address` | text | Override email (optional) |
| `sms_enabled` | boolean | Send SMS notifications |
| `sms_number` | text | Phone number for SMS |
| `notify_on_call_complete` | boolean | Notify when call ends |
| `notify_on_escalation` | boolean | Notify on transfer |
| `notify_on_voicemail` | boolean | Notify on voicemail |

### `escalation_settings`
| Column | Type | Description |
|--------|------|-------------|
| `transfer_enabled` | boolean | Allow call transfers |
| `transfer_number` | text | Phone to transfer to |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications/preferences` | Get notification settings |
| PUT | `/api/notifications/preferences` | Update notification settings |
| GET | `/api/notifications/escalation` | Get transfer settings |
| PUT | `/api/notifications/escalation` | Update transfer settings |
| POST | `/api/notifications/test` | Send test email/SMS |

### Example: Update Preferences
```bash
curl -X PUT http://localhost:3000/api/notifications/preferences \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "email_enabled": true,
    "email_address": "me@example.com",
    "sms_enabled": true,
    "sms_number": "+353851234567"
  }'
```

### Example: Enable Call Transfer
```bash
curl -X PUT http://localhost:3000/api/notifications/escalation \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "transfer_enabled": true,
    "transfer_number": "+353851234567"
  }'
```

## How Notifications Work

1. **Call happens** via Vapi
2. **Webhook fires** to `/api/vapi/webhook` with `end-of-call-report`
3. **Event type determined**: `call_complete`, `escalation`, `voicemail`, `missed_call`
4. **User preferences checked** from database
5. **Notifications sent** via Resend (email) and/or Twilio (SMS)
6. **Logged** to `call_notifications` table

## How Call Transfer Works

1. User enables transfer and sets phone number in UI
2. Settings sync to Vapi assistant via `syncEscalationToAssistant()`
3. Vapi assistant gets a `transferCall` tool added
4. During calls, if caller asks for human, AI uses the tool
5. Call transfers to the configured number

## Configuration

### Environment Variables

```env
# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=notifications@yourdomain.com

# SMS (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

### Phone Number Format

Phone numbers must be in **E.164 format**:
- Starts with `+`
- Country code (no leading zero)
- Full number

Examples:
- Ireland: `+353851234567`
- US: `+14155551234`
- UK: `+442071234567`

## Testing

### 1. Unit Tests (API)

```bash
cd ai-assistant-api
npm test -- --testPathPattern=notifications
```

Tests:
- Preference CRUD operations
- Phone/email validation
- Test notification endpoint
- Error handling

### 2. E2E Tests (Full Stack)

```bash
cd ai-assistant-web
npx playwright test e2e/notifications.spec.ts
```

Tests:
- API endpoints work correctly
- UI renders all sections
- User can toggle, input, and save
- Success/error messages appear

### 3. Manual Testing

1. **Start servers**:
   ```bash
   # Terminal 1 - API
   cd ai-assistant-api && npm run dev

   # Terminal 2 - Web
   cd ai-assistant-web && npm run dev
   ```

2. **Go to** `http://localhost:3001/notifications`

3. **Test email**:
   - Toggle email ON
   - Enter email address
   - Click "Save"
   - Click "Send Test"

4. **Test SMS** (requires Twilio config):
   - Toggle SMS ON
   - Enter phone number (+353...)
   - Click "Save"
   - Click "Send Test"

5. **Test call transfer**:
   - Toggle transfer ON
   - Enter phone number
   - Click "Save"
   - Make a test call and ask for a human

### 4. Test Without Providers

If Resend/Twilio aren't configured:
- Test notifications will return `{ success: false, error: 'Email not configured' }`
- This is expected behavior
- The UI will show the error message

## Files

### Frontend
- `ai-assistant-web/src/app/(dashboard)/notifications/page.tsx` - UI
- `ai-assistant-web/src/lib/api.ts` - API client
- `ai-assistant-web/src/types/index.ts` - TypeScript types

### Backend
- `ai-assistant-api/src/routes/notifications.js` - API routes
- `ai-assistant-api/src/services/notifications.js` - Business logic
- `ai-assistant-api/src/services/assistant.js` - Vapi sync
- `ai-assistant-api/src/routes/vapiWebhooks.js` - Webhook handler

### Database
- `ai-assistant-api/supabase/migrations/006_notifications.sql` - Schema

### Tests
- `ai-assistant-api/src/routes/__tests__/notifications.test.js` - Unit tests
- `ai-assistant-web/e2e/notifications.spec.ts` - E2E tests

## MVP Scope

What's included:
- Email notifications with event triggers
- SMS notifications
- Call transfer (simple on/off + phone number)
- Test notification buttons

What's deferred (advanced features):
- Business hours restrictions
- Multiple transfer methods (warm/blind/callback)
- Trigger keywords
- After-hours behavior
- Notification history UI

These advanced fields exist in the database but aren't exposed in the MVP UI.
