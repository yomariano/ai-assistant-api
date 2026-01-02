-- AI Assistant Database Schema for Supabase
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
-- Note: id can be UUID from Supabase Auth (for authenticated users) or auto-generated (for dev users)
-- password_hash is NOT needed - authentication is handled by Supabase Auth
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Saved Calls table
CREATE TABLE IF NOT EXISTS saved_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    contact_name TEXT,
    message TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    usage_count INT DEFAULT 0
);

-- Create index for user lookups
CREATE INDEX IF NOT EXISTS idx_saved_calls_user_id ON saved_calls(user_id);

-- Scheduled Calls table
CREATE TABLE IF NOT EXISTS scheduled_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    contact_name TEXT,
    message TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    scheduled_time TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create indexes for scheduled calls
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_user_id ON scheduled_calls(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_status ON scheduled_calls(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_calls_scheduled_time ON scheduled_calls(scheduled_time);

-- Call History table
CREATE TABLE IF NOT EXISTS call_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    contact_name TEXT,
    message TEXT NOT NULL,
    language TEXT DEFAULT 'en',
    status TEXT DEFAULT 'initiated',
    duration_seconds INT,
    vapi_call_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Create indexes for call history
CREATE INDEX IF NOT EXISTS idx_call_history_user_id ON call_history(user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_created_at ON call_history(created_at DESC);

-- Row Level Security (RLS) Policies
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- Note: Since we're using service role key in the backend,
-- RLS is bypassed. These policies are for direct Supabase access.

-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (id = auth.uid());

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id = auth.uid());

-- Saved calls policies
CREATE POLICY "Users can view own saved calls" ON saved_calls
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own saved calls" ON saved_calls
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own saved calls" ON saved_calls
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own saved calls" ON saved_calls
    FOR DELETE USING (user_id = auth.uid());

-- Scheduled calls policies
CREATE POLICY "Users can view own scheduled calls" ON scheduled_calls
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own scheduled calls" ON scheduled_calls
    FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own scheduled calls" ON scheduled_calls
    FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own scheduled calls" ON scheduled_calls
    FOR DELETE USING (user_id = auth.uid());

-- Call history policies
CREATE POLICY "Users can view own call history" ON call_history
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own call history" ON call_history
    FOR INSERT WITH CHECK (user_id = auth.uid());

-- Function to increment usage count (for saved calls)
CREATE OR REPLACE FUNCTION increment(x INT)
RETURNS INT AS $$
BEGIN
    RETURN x + 1;
END;
$$ LANGUAGE plpgsql;
