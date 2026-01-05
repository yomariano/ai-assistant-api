# OrderBot API

Backend API for OrderBot.ie - AI Voice Assistant for Restaurants.

> See the main [README.md](../README.md) for full project documentation.

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

Server runs at http://localhost:3000

## Key Services

| Service | File | Description |
|---------|------|-------------|
| **geoLocation** | `src/services/geoLocation.js` | Regional pricing (EUR/USD), geo-detection |
| **stripe** | `src/services/stripe.js` | Payment processing, subscription management |
| **notifications** | `src/services/notifications.js` | Email/SMS sending, call event notifications |
| **usageTracking** | `src/services/usageTracking.js` | Per-call billing, fair use enforcement |
| **assistant** | `src/services/assistant.js` | Vapi assistant management |

## API Routes

| Route | File | Description |
|-------|------|-------------|
| `/api/auth/*` | `routes/auth.js` | Authentication (Supabase) |
| `/api/billing/*` | `routes/billing.js` | Subscriptions, usage, payment links |
| `/api/notifications/*` | `routes/notifications.js` | Email/SMS/escalation settings |
| `/api/assistant/*` | `routes/assistant.js` | AI assistant configuration |
| `/api/vapi/*` | `routes/vapiWebhooks.js` | Vapi call event webhooks |

## Database Migrations

Located in `supabase/migrations/`:

| Migration | Description |
|-----------|-------------|
| `001_initial_schema.sql` | Users, auth |
| `006_notifications.sql` | Notification preferences, escalation settings |
| `009_orderbot_pricing.sql` | OrderBot pricing sync |
| `010_call_cost_tracking.sql` | Per-call usage tracking |

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- --testPathPattern=notifications
npm test -- --testPathPattern=geoLocation
npm test -- --testPathPattern=vapiWebhooks
```

## Environment Variables

See `.env.example` for all required variables. Key ones:

```env
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Vapi
VAPI_API_KEY=

# Stripe (EUR)
STRIPE_SECRET_KEY=
STRIPE_STARTER_PRICE_EUR=
STRIPE_GROWTH_PRICE_EUR=
STRIPE_SCALE_PRICE_EUR=

# Notifications
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
```
