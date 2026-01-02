-- Migration: Add billing and subscription tables
-- Run this in Supabase SQL Editor

-- Subscription Plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    interval TEXT NOT NULL DEFAULT 'month' CHECK (interval IN ('month', 'year')),
    minutes_included INTEGER NOT NULL,
    max_minutes_per_call INTEGER NOT NULL DEFAULT 5,
    features JSONB DEFAULT '[]',
    stripe_price_id TEXT,
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Insert default plans (updated pricing based on competitor analysis)
INSERT INTO subscription_plans (id, name, description, price_cents, minutes_included, max_minutes_per_call, features, stripe_price_id, sort_order) VALUES
('starter', 'Starter', 'Perfect for solopreneurs getting started with AI calls', 4900, 60, 10,
 '["60 minutes included", "1 phone number", "3 concurrent calls", "Standard AI voices", "Call transcripts & summaries", "Email notifications", "Calendar booking", "$0.20/min overage"]',
 NULL, 1),
('pro', 'Pro', 'For small businesses with growing call volume', 11900, 200, 15,
 '["200 minutes included", "3 phone numbers", "10 concurrent calls", "Voice cloning", "CRM integrations (Zapier)", "SMS workflows", "Analytics dashboard", "Priority support", "$0.16/min overage"]',
 NULL, 2),
('agency', 'Agency', 'For agencies and power users with high-volume needs', 29900, 600, 30,
 '["600 minutes included", "10 phone numbers", "25 concurrent calls", "White-label branding", "Full API access", "Advanced analytics", "Custom knowledge base", "Dedicated account manager", "$0.12/min overage"]',
 NULL, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents,
  minutes_included = EXCLUDED.minutes_included,
  max_minutes_per_call = EXCLUDED.max_minutes_per_call,
  features = EXCLUDED.features,
  updated_at = NOW();

-- User Subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')),
    trial_starts_at TIMESTAMPTZ DEFAULT NOW(),
    trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '3 days'),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE(user_id)
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer_id ON user_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription_id ON user_subscriptions(stripe_subscription_id);

-- Usage Tracking table (monthly usage)
CREATE TABLE IF NOT EXISTS usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    minutes_used INTEGER DEFAULT 0,
    calls_made INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE(user_id, period_start)
);

-- Create index for usage lookups
CREATE INDEX IF NOT EXISTS idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_tracking_period ON usage_tracking(period_start, period_end);

-- Trial Usage table (for 3-day trial tracking)
CREATE TABLE IF NOT EXISTS trial_usage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calls_made INTEGER DEFAULT 0,
    minutes_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE(user_id)
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_trial_usage_user_id ON trial_usage(user_id);

-- Add stripe_customer_id to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- RLS Policies for new tables
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE trial_usage ENABLE ROW LEVEL SECURITY;

-- Plans are public readable
CREATE POLICY "Plans are viewable by everyone" ON subscription_plans
    FOR SELECT USING (true);

-- Users can only see their own subscription
CREATE POLICY "Users can view own subscription" ON user_subscriptions
    FOR SELECT USING (user_id = auth.uid());

-- Users can only see their own usage
CREATE POLICY "Users can view own usage" ON usage_tracking
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can view own trial usage" ON trial_usage
    FOR SELECT USING (user_id = auth.uid());

-- Function to get or create current period usage
CREATE OR REPLACE FUNCTION get_or_create_current_usage(p_user_id UUID)
RETURNS usage_tracking AS $$
DECLARE
    v_usage usage_tracking;
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    SELECT * INTO v_usage FROM usage_tracking
    WHERE user_id = p_user_id AND period_start = v_period_start;

    IF v_usage IS NULL THEN
        INSERT INTO usage_tracking (user_id, period_start, period_end, minutes_used, calls_made)
        VALUES (p_user_id, v_period_start, v_period_end, 0, 0)
        RETURNING * INTO v_usage;
    END IF;

    RETURN v_usage;
END;
$$ LANGUAGE plpgsql;

-- Function to increment usage
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_minutes INTEGER)
RETURNS void AS $$
BEGIN
    PERFORM get_or_create_current_usage(p_user_id);

    UPDATE usage_tracking
    SET minutes_used = minutes_used + p_minutes,
        calls_made = calls_made + 1,
        updated_at = NOW()
    WHERE user_id = p_user_id
    AND period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE;
END;
$$ LANGUAGE plpgsql;

-- Function to increment trial usage
CREATE OR REPLACE FUNCTION increment_trial_usage(p_user_id UUID, p_minutes INTEGER)
RETURNS void AS $$
BEGIN
    -- Create trial usage record if not exists
    INSERT INTO trial_usage (user_id, calls_made, minutes_used)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update trial usage
    UPDATE trial_usage
    SET calls_made = calls_made + 1,
        minutes_used = minutes_used + p_minutes,
        updated_at = NOW()
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
