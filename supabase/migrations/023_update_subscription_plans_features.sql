-- Migration: Update subscription_plans with feature flags and new pricing
-- This adds feature toggle columns and updates plans for the new pricing structure:
-- Starter €49/mo, Growth €199/mo, Pro €599/mo

-- =====================================================
-- STEP 1: Add feature flag columns
-- =====================================================

-- Call limits
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS inbound_calls_limit INTEGER DEFAULT 100;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS outbound_calls_limit INTEGER DEFAULT 0;

-- Calendar features
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS outlook_calendar_enabled BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS multi_staff_calendar_enabled BOOLEAN DEFAULT false;

-- Customer notifications
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_sms_confirmation_enabled BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_sms_reminders_enabled BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS customer_voice_reminders_enabled BOOLEAN DEFAULT false;

-- Business notifications
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_email_enabled BOOLEAN DEFAULT true;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_sms_enabled BOOLEAN DEFAULT false;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS business_webhook_enabled BOOLEAN DEFAULT false;

-- Trial and support
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS trial_days INTEGER DEFAULT 5;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS support_level TEXT DEFAULT 'docs'; -- docs, business_hours, priority_24_7

-- =====================================================
-- STEP 2: Handle existing 'pro' plan FIRST (before any renames)
-- =====================================================

-- Rename existing 'pro' to 'pro_legacy' if it exists (to free up the 'pro' id)
UPDATE subscription_plans SET
  id = 'pro_legacy',
  is_active = false,
  updated_at = NOW()
WHERE id = 'pro';

-- =====================================================
-- STEP 3: Update existing plans with new pricing & features
-- =====================================================

-- STARTER PLAN - €49/mo
UPDATE subscription_plans SET
  name = 'Starter',
  description = 'Perfect for solo businesses getting started with AI call handling',
  price_cents = 4900,
  interval = 'month',
  inbound_calls_limit = 100,
  outbound_calls_limit = 0,
  google_calendar_enabled = true,
  outlook_calendar_enabled = false,
  multi_staff_calendar_enabled = false,
  customer_sms_confirmation_enabled = false,
  customer_sms_reminders_enabled = false,
  customer_voice_reminders_enabled = false,
  business_email_enabled = true,
  business_sms_enabled = false,
  business_webhook_enabled = false,
  trial_days = 5,
  support_level = 'docs',
  features = '["100 inbound calls/month", "Google Calendar integration", "Email notifications", "5-day free trial"]'::jsonb,
  is_active = true,
  sort_order = 1,
  updated_at = NOW()
WHERE id = 'starter';

-- GROWTH PLAN - €199/mo
UPDATE subscription_plans SET
  name = 'Growth',
  description = 'For growing businesses that need SMS confirmations and reminders',
  price_cents = 19900,
  interval = 'month',
  inbound_calls_limit = 500,
  outbound_calls_limit = 0,
  google_calendar_enabled = true,
  outlook_calendar_enabled = true,
  multi_staff_calendar_enabled = false,
  customer_sms_confirmation_enabled = true,
  customer_sms_reminders_enabled = true,
  customer_voice_reminders_enabled = false,
  business_email_enabled = true,
  business_sms_enabled = true,
  business_webhook_enabled = false,
  trial_days = 5,
  support_level = 'business_hours',
  features = '["500 inbound calls/month", "Google + Outlook Calendar", "Customer SMS confirmations", "SMS reminders (24h before)", "Business hours support (9-5)", "5-day free trial"]'::jsonb,
  is_active = true,
  sort_order = 2,
  updated_at = NOW()
WHERE id = 'growth';

-- PRO PLAN - €599/mo (rename 'scale' to 'pro')
UPDATE subscription_plans SET
  id = 'pro',
  name = 'Pro',
  description = 'For high-volume businesses with outbound reminder calls',
  price_cents = 59900,
  interval = 'month',
  inbound_calls_limit = 1500,
  outbound_calls_limit = 200,
  google_calendar_enabled = true,
  outlook_calendar_enabled = true,
  multi_staff_calendar_enabled = true,
  customer_sms_confirmation_enabled = true,
  customer_sms_reminders_enabled = true,
  customer_voice_reminders_enabled = true,
  business_email_enabled = true,
  business_sms_enabled = true,
  business_webhook_enabled = true,
  trial_days = 5,
  support_level = 'priority_24_7',
  features = '["1,500 inbound calls/month", "200 outbound reminder calls/month", "Multi-staff calendar", "AI voice reminders", "Webhook notifications", "24/7 priority support", "5-day free trial"]'::jsonb,
  is_active = true,
  sort_order = 3,
  updated_at = NOW()
WHERE id = 'scale';

-- =====================================================
-- STEP 4: Deactivate old plans
-- =====================================================

UPDATE subscription_plans SET
  is_active = false,
  updated_at = NOW()
WHERE id IN ('business', 'agency', 'pro_legacy');

-- =====================================================
-- STEP 5: Add comments for documentation
-- =====================================================

COMMENT ON COLUMN subscription_plans.inbound_calls_limit IS 'Maximum inbound calls per month';
COMMENT ON COLUMN subscription_plans.outbound_calls_limit IS 'Maximum outbound reminder calls per month (Pro only)';
COMMENT ON COLUMN subscription_plans.google_calendar_enabled IS 'Can connect Google Calendar for booking';
COMMENT ON COLUMN subscription_plans.outlook_calendar_enabled IS 'Can connect Outlook Calendar (Growth+)';
COMMENT ON COLUMN subscription_plans.multi_staff_calendar_enabled IS 'Can manage multiple staff calendars (Pro only)';
COMMENT ON COLUMN subscription_plans.customer_sms_confirmation_enabled IS 'Send SMS confirmation to customers (Growth+)';
COMMENT ON COLUMN subscription_plans.customer_sms_reminders_enabled IS 'Send SMS reminders 24h before (Growth+)';
COMMENT ON COLUMN subscription_plans.customer_voice_reminders_enabled IS 'Send AI voice call reminders (Pro only)';
COMMENT ON COLUMN subscription_plans.business_email_enabled IS 'Send email notifications to business';
COMMENT ON COLUMN subscription_plans.business_sms_enabled IS 'Send SMS notifications to business (Growth+)';
COMMENT ON COLUMN subscription_plans.business_webhook_enabled IS 'Send webhook notifications (Pro only)';
COMMENT ON COLUMN subscription_plans.trial_days IS 'Number of free trial days';
COMMENT ON COLUMN subscription_plans.support_level IS 'Support tier: docs, business_hours, priority_24_7';

-- =====================================================
-- STEP 6: Create user_feature_overrides table for admin control
-- =====================================================

CREATE TABLE IF NOT EXISTS user_feature_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Call limit overrides (NULL means use plan default)
  inbound_calls_limit_override INTEGER,
  outbound_calls_limit_override INTEGER,

  -- Feature overrides
  google_calendar_override BOOLEAN,
  outlook_calendar_override BOOLEAN,
  multi_staff_calendar_override BOOLEAN,
  customer_sms_confirmation_override BOOLEAN,
  customer_sms_reminders_override BOOLEAN,
  customer_voice_reminders_override BOOLEAN,
  business_email_override BOOLEAN,
  business_sms_override BOOLEAN,
  business_webhook_override BOOLEAN,

  -- Trial override
  trial_days_override INTEGER,

  -- Admin notes
  notes TEXT,
  modified_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_user_feature_overrides_user_id ON user_feature_overrides(user_id);

COMMENT ON TABLE user_feature_overrides IS 'Admin-controlled feature overrides per user. NULL values inherit from plan.';

-- =====================================================
-- Verification
-- =====================================================

DO $$
BEGIN
  -- Check columns were added
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans'
    AND column_name = 'inbound_calls_limit'
  ) THEN
    RAISE NOTICE 'Migration successful: Feature columns added to subscription_plans';
  ELSE
    RAISE WARNING 'Migration may have failed: inbound_calls_limit column not found';
  END IF;
END $$;
