-- Migration: Sync subscription_plans with actual OrderBot/Stripe plans
-- This aligns the database with the per-call pricing model:
-- - Lite (starter): €19/mo + €0.95/call
-- - Growth: €99/mo + €0.45/call
-- - Pro (scale): €249/mo + €0/call (1500 fair use cap)

-- Add missing columns for per-call billing model
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS per_call_cents INTEGER DEFAULT 0;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS calls_cap INTEGER DEFAULT NULL;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS phone_numbers INTEGER DEFAULT 1;
ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Add comments for clarity
COMMENT ON COLUMN subscription_plans.per_call_cents IS 'Cost per inbound call in cents (EUR). 0 means unlimited/included.';
COMMENT ON COLUMN subscription_plans.calls_cap IS 'Fair use cap - max calls per month. NULL means unlimited.';
COMMENT ON COLUMN subscription_plans.phone_numbers IS 'Number of phone numbers included in plan.';
COMMENT ON COLUMN subscription_plans.display_name IS 'Marketing display name (Lite, Growth, Pro)';

-- Update existing 'starter' plan to match OrderBot Lite
UPDATE subscription_plans SET
  name = 'Lite',
  display_name = 'Lite',
  description = 'Perfect for small businesses just getting started with AI phone handling',
  price_cents = 1900,  -- €19/mo
  minutes_included = 0,  -- Not used in per-call model
  max_minutes_per_call = 15,
  per_call_cents = 95,  -- €0.95/call
  calls_cap = NULL,  -- No cap (pay per call)
  phone_numbers = 1,
  features = '[
    "1 phone number",
    "AI answers 24/7",
    "Call transcripts & summaries",
    "Email notifications",
    "€0.95 per answered call"
  ]'::jsonb,
  updated_at = NOW()
WHERE id = 'starter';

-- Insert or update 'growth' plan
INSERT INTO subscription_plans (
  id, name, display_name, description, price_cents,
  minutes_included, max_minutes_per_call, per_call_cents,
  calls_cap, phone_numbers, features, is_active, sort_order
) VALUES (
  'growth',
  'Growth',
  'Growth',
  'For growing businesses with higher call volumes',
  9900,  -- €99/mo
  0,  -- Not used in per-call model
  15,
  45,  -- €0.45/call
  NULL,  -- No cap (pay per call)
  2,
  '[
    "2 phone numbers",
    "AI answers 24/7",
    "Call transcripts & summaries",
    "Email & SMS notifications",
    "Priority support",
    "€0.45 per answered call"
  ]'::jsonb,
  true,
  2
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  minutes_included = EXCLUDED.minutes_included,
  max_minutes_per_call = EXCLUDED.max_minutes_per_call,
  per_call_cents = EXCLUDED.per_call_cents,
  calls_cap = EXCLUDED.calls_cap,
  phone_numbers = EXCLUDED.phone_numbers,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Insert or update 'scale' plan (Pro)
INSERT INTO subscription_plans (
  id, name, display_name, description, price_cents,
  minutes_included, max_minutes_per_call, per_call_cents,
  calls_cap, phone_numbers, features, is_active, sort_order
) VALUES (
  'scale',
  'Pro',
  'Pro',
  'For high-volume businesses - unlimited calls with fair use cap',
  24900,  -- €249/mo
  0,  -- Not used in per-call model
  30,
  0,  -- €0/call (unlimited)
  1500,  -- Fair use cap
  5,
  '[
    "5 phone numbers",
    "AI answers 24/7",
    "Call transcripts & summaries",
    "Email & SMS notifications",
    "Priority support",
    "Unlimited calls (1,500/mo fair use)",
    "Advanced analytics"
  ]'::jsonb,
  true,
  3
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  minutes_included = EXCLUDED.minutes_included,
  max_minutes_per_call = EXCLUDED.max_minutes_per_call,
  per_call_cents = EXCLUDED.per_call_cents,
  calls_cap = EXCLUDED.calls_cap,
  phone_numbers = EXCLUDED.phone_numbers,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Mark old plans as inactive (if they exist and differ from new plan IDs)
UPDATE subscription_plans
SET is_active = false, updated_at = NOW()
WHERE id IN ('pro', 'agency')
  AND id NOT IN ('starter', 'growth', 'scale');

-- Create index for active plans lookup
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;

-- Verify migration
DO $$
DECLARE
  plan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO plan_count
  FROM subscription_plans
  WHERE id IN ('starter', 'growth', 'scale') AND is_active = true;

  IF plan_count = 3 THEN
    RAISE NOTICE 'Migration successful: 3 active plans (starter, growth, scale)';
  ELSE
    RAISE WARNING 'Migration may have issues: Expected 3 active plans, found %', plan_count;
  END IF;
END $$;
