-- Migration: OrderBot.ie Pricing Strategy
-- Based on OrderBot-Pricing-Strategy.docx (January 2026)
-- Pricing uses psychological pricing principles for Irish SMB market
--
-- LITE (starter):  €19/mo + €0.95/call  (< 100 calls/mo)
-- GROWTH (growth): €99/mo + €0.45/call  (100-400 calls/mo)
-- PRO (scale):     €249/mo + €0/call    (400+ calls/mo, 1500 fair use cap)

-- Add per_call_cents column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscription_plans' AND column_name = 'per_call_cents'
    ) THEN
        ALTER TABLE subscription_plans ADD COLUMN per_call_cents INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add calls_cap column for fair use limits (Pro plan)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'subscription_plans' AND column_name = 'calls_cap'
    ) THEN
        ALTER TABLE subscription_plans ADD COLUMN calls_cap INTEGER DEFAULT NULL;
    END IF;
END $$;

-- Update LITE (starter) plan: €19/mo + €0.95/call
UPDATE subscription_plans SET
    name = 'Lite',
    description = 'Perfect for testing or low-volume businesses. Pay per call.',
    price_cents = 1900,  -- €19/mo
    per_call_cents = 95, -- €0.95/call
    minutes_included = 0, -- No included minutes, pay per call
    calls_included = 0,   -- No included calls
    phone_numbers_included = 1,
    features = '[
        "1 phone number",
        "Pay per call (€0.95/call)",
        "Order taking",
        "SMS notifications",
        "Business hours support",
        "Custom greeting"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'starter';

-- Update GROWTH plan: €99/mo + €0.45/call (Most Popular)
UPDATE subscription_plans SET
    name = 'Growth',
    description = 'For most businesses. Lower per-call rate with predictable base.',
    price_cents = 9900,  -- €99/mo
    per_call_cents = 45, -- €0.45/call
    minutes_included = 0, -- No included minutes, pay per call
    calls_included = 0,   -- No included calls
    phone_numbers_included = 2,
    features = '[
        "2 phone numbers",
        "Pay per call (€0.45/call)",
        "Orders + Reservations",
        "SMS + Email notifications",
        "Extended support hours",
        "Analytics dashboard",
        "Calendar integration"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'growth';

-- Update PRO (scale) plan: €249/mo + unlimited calls (1500 fair use cap)
UPDATE subscription_plans SET
    name = 'Pro',
    description = 'For busy venues. Unlimited calls with fair use policy.',
    price_cents = 24900, -- €249/mo
    per_call_cents = 0,  -- €0/call (unlimited)
    minutes_included = 0,
    calls_included = -1,  -- -1 = unlimited
    calls_cap = 1500,     -- Fair use: 1500 calls/month
    phone_numbers_included = 5,
    features = '[
        "5 phone numbers",
        "Unlimited calls*",
        "Full feature set",
        "Multi-location support",
        "Priority 24/7 support",
        "Advanced analytics",
        "Custom integrations",
        "Dedicated account manager"
    ]'::jsonb,
    updated_at = NOW()
WHERE id = 'scale';

-- Update overage rates (not used with per-call model, but keep for compatibility)
UPDATE subscription_plans SET overage_rate_cents = 95 WHERE id = 'starter';
UPDATE subscription_plans SET overage_rate_cents = 45 WHERE id = 'growth';
UPDATE subscription_plans SET overage_rate_cents = 0 WHERE id = 'scale';

-- Verify the migration
DO $$
DECLARE
    starter_price INTEGER;
    growth_price INTEGER;
    scale_price INTEGER;
BEGIN
    SELECT price_cents INTO starter_price FROM subscription_plans WHERE id = 'starter';
    SELECT price_cents INTO growth_price FROM subscription_plans WHERE id = 'growth';
    SELECT price_cents INTO scale_price FROM subscription_plans WHERE id = 'scale';

    IF starter_price = 1900 AND growth_price = 9900 AND scale_price = 24900 THEN
        RAISE NOTICE 'Migration successful: OrderBot pricing applied (€19/€99/€249)';
    ELSE
        RAISE WARNING 'Migration may have issues. Expected €19/€99/€249, got %/100, %/100, %/100',
            starter_price, growth_price, scale_price;
    END IF;
END $$;

-- Add comment for documentation
COMMENT ON TABLE subscription_plans IS 'OrderBot.ie subscription plans. Pricing per OrderBot-Pricing-Strategy.docx (Jan 2026). Lite=€19+€0.95/call, Growth=€99+€0.45/call, Pro=€249 unlimited (1500 cap).';
