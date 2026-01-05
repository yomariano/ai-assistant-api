-- Migration: 006_notifications.sql
-- Description: Add notification preferences, escalation settings, and notification logs

-- ============================================
-- NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Email settings
    email_enabled BOOLEAN DEFAULT true,
    email_address TEXT, -- Override user's default email

    -- SMS settings
    sms_enabled BOOLEAN DEFAULT false,
    sms_number TEXT, -- Phone number for SMS notifications

    -- Notification triggers
    notify_on_call_complete BOOLEAN DEFAULT true,
    notify_on_message_taken BOOLEAN DEFAULT true,
    notify_on_escalation BOOLEAN DEFAULT true,
    notify_on_voicemail BOOLEAN DEFAULT true,

    -- Preferences
    business_hours_only BOOLEAN DEFAULT false,
    timezone TEXT DEFAULT 'Europe/Dublin',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    UNIQUE(user_id)
);

-- ============================================
-- ESCALATION SETTINGS
-- ============================================
CREATE TABLE IF NOT EXISTS escalation_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Transfer settings
    transfer_enabled BOOLEAN DEFAULT false,
    transfer_number TEXT, -- Phone number to transfer to
    transfer_method TEXT DEFAULT 'warm_transfer' CHECK (transfer_method IN ('blind_transfer', 'warm_transfer', 'callback', 'sms_alert')),

    -- Trigger conditions
    trigger_keywords TEXT[] DEFAULT ARRAY['speak to someone', 'real person', 'manager', 'human', 'complaint'],
    max_failed_attempts INTEGER DEFAULT 2, -- Transfer after N failed AI responses

    -- Time restrictions
    business_hours_only BOOLEAN DEFAULT true,
    business_hours_start TIME DEFAULT '09:00',
    business_hours_end TIME DEFAULT '18:00',
    business_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- Mon-Fri (1=Mon, 7=Sun)
    timezone TEXT DEFAULT 'Europe/Dublin',

    -- After hours behavior
    after_hours_action TEXT DEFAULT 'voicemail' CHECK (after_hours_action IN ('voicemail', 'sms_alert', 'callback_promise', 'ai_only')),
    after_hours_message TEXT DEFAULT 'We are currently closed. Please leave a message and we will get back to you.',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,

    UNIQUE(user_id)
);

-- ============================================
-- CALL NOTIFICATIONS LOG
-- ============================================
CREATE TABLE IF NOT EXISTS call_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    call_id UUID REFERENCES call_history(id) ON DELETE SET NULL,

    -- Notification details
    notification_type TEXT NOT NULL CHECK (notification_type IN ('email', 'sms')),
    event_type TEXT NOT NULL CHECK (event_type IN ('call_complete', 'message_taken', 'escalation', 'voicemail', 'missed_call')),

    -- Delivery info
    recipient TEXT NOT NULL, -- Email or phone number
    subject TEXT, -- For emails
    content TEXT, -- Message body

    -- Status tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    error_message TEXT,

    -- Timestamps
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_escalation_settings_user ON escalation_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_call_notifications_user ON call_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_call_notifications_call ON call_notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_call_notifications_status ON call_notifications(status);
CREATE INDEX IF NOT EXISTS idx_call_notifications_created ON call_notifications(created_at DESC);

-- ============================================
-- TRIGGERS FOR updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER update_notification_preferences_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_escalation_settings_updated_at ON escalation_settings;
CREATE TRIGGER update_escalation_settings_updated_at
    BEFORE UPDATE ON escalation_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notification preferences
CREATE POLICY "Users can view own notification_preferences"
    ON notification_preferences FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification_preferences"
    ON notification_preferences FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification_preferences"
    ON notification_preferences FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can only see their own escalation settings
CREATE POLICY "Users can view own escalation_settings"
    ON escalation_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own escalation_settings"
    ON escalation_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own escalation_settings"
    ON escalation_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can only see their own notifications
CREATE POLICY "Users can view own call_notifications"
    ON call_notifications FOR SELECT
    USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get or create notification preferences for a user
CREATE OR REPLACE FUNCTION get_or_create_notification_preferences(p_user_id UUID)
RETURNS notification_preferences AS $$
DECLARE
    v_prefs notification_preferences;
BEGIN
    SELECT * INTO v_prefs FROM notification_preferences WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO notification_preferences (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_prefs;
    END IF;

    RETURN v_prefs;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get or create escalation settings for a user
CREATE OR REPLACE FUNCTION get_or_create_escalation_settings(p_user_id UUID)
RETURNS escalation_settings AS $$
DECLARE
    v_settings escalation_settings;
BEGIN
    SELECT * INTO v_settings FROM escalation_settings WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO escalation_settings (user_id)
        VALUES (p_user_id)
        RETURNING * INTO v_settings;
    END IF;

    RETURN v_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
