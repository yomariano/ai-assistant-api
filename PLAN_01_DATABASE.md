# Plan 01: Database Schema Changes

## Overview
Update database to support new pricing tiers, feature toggles, and admin controls.

---

## New Tables

### 1. `plan_features` - Feature definitions per plan

```sql
CREATE TABLE plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id TEXT NOT NULL, -- 'starter', 'growth', 'pro'

  -- Call Limits
  inbound_calls_limit INTEGER NOT NULL DEFAULT 100,
  outbound_calls_limit INTEGER NOT NULL DEFAULT 0,

  -- Calendar Features
  google_calendar_enabled BOOLEAN DEFAULT false,
  outlook_calendar_enabled BOOLEAN DEFAULT false,
  multi_staff_calendar_enabled BOOLEAN DEFAULT false,

  -- Customer Notifications
  customer_sms_confirmation_enabled BOOLEAN DEFAULT false,
  customer_sms_reminders_enabled BOOLEAN DEFAULT false,
  customer_voice_reminders_enabled BOOLEAN DEFAULT false,

  -- Business Notifications
  business_email_enabled BOOLEAN DEFAULT true,
  business_sms_enabled BOOLEAN DEFAULT false,
  business_webhook_enabled BOOLEAN DEFAULT false,

  -- Trial & Billing
  trial_days INTEGER DEFAULT 5,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',

  -- Metadata
  display_name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(plan_id)
);
```

### 2. `user_feature_overrides` - Per-user feature overrides (admin controlled)

```sql
CREATE TABLE user_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Override any feature (NULL means use plan default)
  inbound_calls_limit_override INTEGER,
  outbound_calls_limit_override INTEGER,

  google_calendar_override BOOLEAN,
  outlook_calendar_override BOOLEAN,
  multi_staff_calendar_override BOOLEAN,

  customer_sms_confirmation_override BOOLEAN,
  customer_sms_reminders_override BOOLEAN,
  customer_voice_reminders_override BOOLEAN,

  business_email_override BOOLEAN,
  business_sms_override BOOLEAN,
  business_webhook_override BOOLEAN,

  trial_days_override INTEGER,

  -- Admin notes
  notes TEXT,
  modified_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);
```

### 3. `outbound_call_queue` - Scheduled outbound reminder calls

```sql
CREATE TABLE outbound_call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,

  -- Call details
  phone_number TEXT NOT NULL,
  customer_name TEXT,
  reminder_message TEXT NOT NULL,

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,

  -- Status tracking
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed, cancelled
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_attempt_at TIMESTAMPTZ,

  -- Call result
  vapi_call_id TEXT,
  call_duration_seconds INTEGER,
  call_outcome TEXT, -- confirmed, rescheduled, cancelled, no_answer, voicemail

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_outbound_queue_scheduled ON outbound_call_queue(scheduled_at, status);
CREATE INDEX idx_outbound_queue_user ON outbound_call_queue(user_id);
```

---

## Modify Existing Tables

### Update `subscription_plans`

```sql
-- Drop old subscription_plans and use plan_features instead
-- OR update subscription_plans to reference plan_features

ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS features_id UUID REFERENCES plan_features(id);
```

### Update `user_subscriptions`

```sql
-- Add trial tracking
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
```

### Update `call_history`

```sql
-- Add outbound call tracking
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS call_direction TEXT DEFAULT 'inbound'; -- inbound, outbound
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS outbound_queue_id UUID REFERENCES outbound_call_queue(id);
```

---

## Seed Data

```sql
-- Insert default plan features
INSERT INTO plan_features (
  plan_id, display_name, price_cents,
  inbound_calls_limit, outbound_calls_limit,
  google_calendar_enabled, outlook_calendar_enabled, multi_staff_calendar_enabled,
  customer_sms_confirmation_enabled, customer_sms_reminders_enabled, customer_voice_reminders_enabled,
  business_email_enabled, business_sms_enabled, business_webhook_enabled,
  trial_days, sort_order
) VALUES
(
  'starter', 'Starter', 4900,
  100, 0,
  true, false, false,
  false, false, false,
  true, false, false,
  5, 1
),
(
  'growth', 'Growth', 19900,
  500, 0,
  true, true, false,
  true, true, false,
  true, true, false,
  5, 2
),
(
  'pro', 'Pro', 59900,
  1500, 200,
  true, true, true,
  true, true, true,
  true, true, true,
  5, 3
);
```

---

## Migration File

Create: `supabase/migrations/020_plan_features_and_admin.sql`

---

## Files to Modify

| File | Changes |
|------|---------|
| `services/planConfig.js` | Read from plan_features table |
| `services/usageTracking.js` | Check outbound limits |
| `middleware/subscription.js` | Check feature access |

---

## Estimated Effort

| Task | Time |
|------|------|
| Write migration | 1 hour |
| Update planConfig.js | 2 hours |
| Test migration | 1 hour |
| **Total** | **4 hours** |
