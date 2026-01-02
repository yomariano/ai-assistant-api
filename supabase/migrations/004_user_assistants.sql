-- Migration: Add user assistants table
-- Run this in Supabase SQL Editor

-- User Assistants table - stores Vapi assistant config per user
CREATE TABLE IF NOT EXISTS user_assistants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vapi_assistant_id TEXT NOT NULL,

    -- Customizable settings (synced with Vapi)
    name TEXT DEFAULT 'AI Assistant',
    first_message TEXT DEFAULT 'Hello! How can I help you today?',
    system_prompt TEXT,
    voice_id TEXT DEFAULT 'jennifer-playht', -- Default voice
    voice_provider TEXT DEFAULT 'playht',

    -- Business context
    business_name TEXT,
    business_description TEXT,
    greeting_name TEXT, -- "Hi, this is [greeting_name] from [business_name]"

    -- Feature flags based on plan
    voice_cloning_enabled BOOLEAN DEFAULT false,
    custom_knowledge_base BOOLEAN DEFAULT false,

    -- Metadata
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    UNIQUE(user_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_assistants_user_id ON user_assistants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assistants_vapi_id ON user_assistants(vapi_assistant_id);

-- RLS Policies
ALTER TABLE user_assistants ENABLE ROW LEVEL SECURITY;

-- Users can only see their own assistant
CREATE POLICY "Users can view own assistant" ON user_assistants
    FOR SELECT USING (user_id = auth.uid());

-- Add vapi_assistant_id to user_phone_numbers for direct linking
ALTER TABLE user_phone_numbers
ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES user_assistants(id);

-- Function to get user's assistant
CREATE OR REPLACE FUNCTION get_user_assistant(p_user_id UUID)
RETURNS user_assistants AS $$
DECLARE
    v_assistant user_assistants;
BEGIN
    SELECT * INTO v_assistant
    FROM user_assistants
    WHERE user_id = p_user_id AND status = 'active'
    LIMIT 1;

    RETURN v_assistant;
END;
$$ LANGUAGE plpgsql;
