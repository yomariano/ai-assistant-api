-- Migration: Add phone numbers provisioning tables
-- Run this in Supabase SQL Editor

-- User Phone Numbers table
CREATE TABLE IF NOT EXISTS user_phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    telnyx_id TEXT,
    vapi_id TEXT,
    label TEXT DEFAULT 'Primary',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'released')),
    released_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_user_id ON user_phone_numbers(user_id);
CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_status ON user_phone_numbers(status);
CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_phone ON user_phone_numbers(phone_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_numbers_telnyx ON user_phone_numbers(telnyx_id) WHERE telnyx_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phone_numbers_vapi ON user_phone_numbers(vapi_id) WHERE vapi_id IS NOT NULL;

-- RLS Policies
ALTER TABLE user_phone_numbers ENABLE ROW LEVEL SECURITY;

-- Users can only see their own phone numbers
CREATE POLICY "Users can view own phone numbers" ON user_phone_numbers
    FOR SELECT USING (user_id = auth.uid());

-- Provisioning Queue table (for async/retry handling)
CREATE TABLE IF NOT EXISTS provisioning_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    numbers_requested INTEGER NOT NULL,
    numbers_provisioned INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provisioning_queue_status ON provisioning_queue(status);
CREATE INDEX IF NOT EXISTS idx_provisioning_queue_user ON provisioning_queue(user_id);

-- RLS for provisioning queue
ALTER TABLE provisioning_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own provisioning status" ON provisioning_queue
    FOR SELECT USING (user_id = auth.uid());

-- Function to count user's active phone numbers
CREATE OR REPLACE FUNCTION get_user_phone_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM user_phone_numbers
        WHERE user_id = p_user_id AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql;

-- Function to check if user can add more phone numbers
CREATE OR REPLACE FUNCTION can_add_phone_number(p_user_id UUID, p_plan_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_count INTEGER;
    v_max_allowed INTEGER;
BEGIN
    -- Get current count
    v_current_count := get_user_phone_count(p_user_id);

    -- Get max allowed based on plan
    SELECT CASE p_plan_id
        WHEN 'starter' THEN 1
        WHEN 'pro' THEN 3
        WHEN 'agency' THEN 10
        ELSE 1
    END INTO v_max_allowed;

    RETURN v_current_count < v_max_allowed;
END;
$$ LANGUAGE plpgsql;
