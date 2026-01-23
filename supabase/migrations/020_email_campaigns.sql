-- Migration: Email Campaigns & Marketing Automation System
-- Creates tables for automated email triggers, manual campaigns, and user event tracking

-- ============================================
-- EMAIL TEMPLATES
-- ============================================
-- Reusable email templates for triggers and campaigns

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  text_content TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- List of variable placeholders like {{firstName}}, {{discountCode}}
  category TEXT DEFAULT 'marketing', -- 'transactional', 'marketing', 'welcome', 'usage', 'reactivation'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Default email templates
INSERT INTO email_templates (id, name, subject, html_content, text_content, variables, category) VALUES
-- Usage triggers (50%, 80%, 90%, 100%)
('usage_50', 'Usage 50% Alert', 'You''re making great progress! 50% of your calls used',
 '<h2>Great progress, {{firstName}}!</h2><p>You''ve used 50% of your monthly call allowance. Your AI assistant is working hard for you!</p><p>Keep the momentum going - your customers are getting great service 24/7.</p><p><a href="{{dashboardUrl}}">View Your Dashboard</a></p>',
 'Great progress, {{firstName}}! You''ve used 50% of your monthly call allowance. Keep the momentum going!',
 '["firstName", "dashboardUrl", "currentUsage", "limit"]', 'usage'),

('usage_80', 'Usage 80% Alert', 'Heads up: 80% of your calls used this month',
 '<h2>Almost there, {{firstName}}!</h2><p>You''ve used 80% of your {{limit}} monthly calls. You have {{remaining}} calls left this billing period.</p><p>Need more capacity? Upgrade now and get a higher call limit plus lower per-call rates.</p><p>Use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off your first month on a higher plan!</p><p><a href="{{upgradeUrl}}">Upgrade Now</a></p>',
 'Heads up, {{firstName}}! You''ve used 80% of your monthly calls. Use code {{discountCode}} for {{discountPercent}}% off an upgrade.',
 '["firstName", "limit", "remaining", "discountCode", "discountPercent", "upgradeUrl"]', 'usage'),

('usage_90', 'Usage 90% Alert', 'Action needed: 90% of your calls used',
 '<h2>Running low, {{firstName}}</h2><p>You''ve used 90% of your monthly calls. Only {{remaining}} calls left!</p><p>Don''t let your customers go to voicemail. Upgrade now for uninterrupted service.</p><p>Special offer: Use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off!</p><p><a href="{{upgradeUrl}}">Upgrade Immediately</a></p>',
 'Running low, {{firstName}}! 90% of calls used. Use code {{discountCode}} for {{discountPercent}}% off an upgrade.',
 '["firstName", "remaining", "discountCode", "discountPercent", "upgradeUrl"]', 'usage'),

('usage_100', 'Usage 100% Alert', 'Your monthly call limit has been reached',
 '<h2>Limit reached, {{firstName}}</h2><p>You''ve used all {{limit}} calls in your plan this month. Any additional calls will be charged at the overage rate.</p><p>Upgrade now to avoid overage charges and get unlimited calls with the Pro plan!</p><p>Use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off!</p><p><a href="{{upgradeUrl}}">Upgrade to Pro</a></p>',
 'Limit reached, {{firstName}}! Upgrade now to avoid overage charges. Use code {{discountCode}} for {{discountPercent}}% off.',
 '["firstName", "limit", "discountCode", "discountPercent", "upgradeUrl"]', 'usage'),

-- Inactivity triggers (3, 7, 14 days)
('inactive_3d', 'Inactive 3 Days', 'Miss you! Your AI assistant is ready when you are',
 '<h2>We noticed you haven''t had any calls lately, {{firstName}}</h2><p>Is everything set up correctly? Your AI assistant is ready to take calls 24/7.</p><p>Quick check:</p><ul><li>Is your phone number forwarding configured?</li><li>Have you tested with a quick call?</li></ul><p>Need help? Just reply to this email!</p><p><a href="{{dashboardUrl}}">Check Your Settings</a></p>',
 'Hi {{firstName}}, we noticed you haven''t had any calls lately. Is your call forwarding set up correctly? Let us know if you need help!',
 '["firstName", "dashboardUrl"]', 'reactivation'),

('inactive_7d', 'Inactive 7 Days', 'Your AI assistant misses you!',
 '<h2>It''s been a week, {{firstName}}</h2><p>Your AI phone assistant is fully configured but hasn''t received any calls in 7 days.</p><p>Common reasons calls might not be coming through:</p><ul><li>Call forwarding not active with your phone provider</li><li>Wrong forwarding number entered</li><li>Business hours restricting call handling</li></ul><p>We''re here to help! Reply to this email or schedule a quick setup call.</p><p><a href="{{dashboardUrl}}">Troubleshoot Now</a></p>',
 'Hi {{firstName}}, it''s been 7 days without calls. Let us help you troubleshoot - your AI assistant is ready!',
 '["firstName", "dashboardUrl"]', 'reactivation'),

('inactive_14d', 'Inactive 14 Days', 'Special offer: Get your AI assistant working today',
 '<h2>Let''s get you back on track, {{firstName}}</h2><p>It''s been 2 weeks since your last call. We''d hate for you to miss out on the benefits of your AI assistant.</p><p>To help you get started, we''re offering a <strong>free 15-minute setup call</strong> with our team. We''ll ensure everything is configured correctly.</p><p>Or, if OrderBot isn''t the right fit, use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off if you decide to come back.</p><p><a href="{{bookingUrl}}">Book Free Setup Call</a></p>',
 'Hi {{firstName}}, let us help! Book a free 15-minute setup call, or use code {{discountCode}} for {{discountPercent}}% off.',
 '["firstName", "discountCode", "discountPercent", "bookingUrl", "dashboardUrl"]', 'reactivation'),

-- Abandoned upgrade (viewed pricing 1h, 24h ago)
('abandoned_upgrade_1h', 'Abandoned Upgrade 1 Hour', 'Still thinking about upgrading?',
 '<h2>Still considering an upgrade, {{firstName}}?</h2><p>We noticed you were checking out our plans earlier. Have questions? Here''s what you get with an upgrade:</p><ul><li>More phone numbers for multiple locations</li><li>Lower per-call rates</li><li>Priority support</li></ul><p>Ready to level up? Use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off your first month!</p><p><a href="{{upgradeUrl}}">Complete Your Upgrade</a></p>',
 'Still thinking about upgrading, {{firstName}}? Use code {{discountCode}} for {{discountPercent}}% off!',
 '["firstName", "discountCode", "discountPercent", "upgradeUrl"]', 'marketing'),

('abandoned_upgrade_24h', 'Abandoned Upgrade 24 Hours', 'Your exclusive upgrade discount expires soon',
 '<h2>Don''t miss out, {{firstName}}!</h2><p>Your exclusive upgrade offer expires in 24 hours.</p><p>Use code <strong>{{discountCode}}</strong> for {{discountPercent}}% off any plan upgrade. This is our best offer!</p><p><a href="{{upgradeUrl}}">Upgrade Now - {{discountPercent}}% Off</a></p>',
 'Last chance, {{firstName}}! Use code {{discountCode}} for {{discountPercent}}% off - expires in 24 hours!',
 '["firstName", "discountCode", "discountPercent", "upgradeUrl"]', 'marketing'),

-- Welcome sequence (day 2, day 5)
('welcome_day2', 'Welcome Day 2', 'Quick tips to get the most from your AI assistant',
 '<h2>Hey {{firstName}}, how''s it going?</h2><p>You signed up 2 days ago - here are some tips to make sure you''re getting the most from OrderBot:</p><ol><li><strong>Customize your greeting</strong> - Make it match your brand voice</li><li><strong>Set business hours</strong> - Control when AI handles calls vs sends to voicemail</li><li><strong>Enable notifications</strong> - Get instant alerts for every order</li></ol><p><a href="{{dashboardUrl}}">Configure Your Assistant</a></p><p>Questions? Just hit reply!</p>',
 'Hey {{firstName}}! Quick tips: 1) Customize your greeting, 2) Set business hours, 3) Enable notifications. Reply if you need help!',
 '["firstName", "dashboardUrl"]', 'welcome'),

('welcome_day5', 'Welcome Day 5', 'How are things going with your AI assistant?',
 '<h2>Checking in, {{firstName}}</h2><p>It''s been 5 days since you joined. How''s your AI assistant performing?</p><p>We''d love to hear your feedback:</p><ul><li>What''s working well?</li><li>Anything that could be better?</li><li>Features you''d like to see?</li></ul><p>Just reply to this email - we read every response!</p><p><a href="{{dashboardUrl}}">View Your Call Stats</a></p>',
 'Hey {{firstName}}, checking in after 5 days. How''s your AI assistant performing? Reply and let us know!',
 '["firstName", "dashboardUrl"]', 'welcome'),

-- Social proof (weekly for active users)
('social_proof_weekly', 'Weekly Social Proof', 'Your AI assistant handled {{callsThisWeek}} calls this week!',
 '<h2>Great week, {{firstName}}!</h2><p>Your AI assistant handled <strong>{{callsThisWeek}} calls</strong> this week. That''s {{hoursHandled}} hours of phone time you didn''t have to manage!</p><p>Across all OrderBot users this week:</p><ul><li>{{totalCallsNetwork}} calls handled</li><li>{{totalOrdersNetwork}} orders taken</li><li>Average response time: under 1 second</li></ul><p>Keep up the great work!</p><p><a href="{{dashboardUrl}}">View Your Full Report</a></p>',
 '{{firstName}}, your AI handled {{callsThisWeek}} calls this week - that''s {{hoursHandled}} hours saved! Network-wide: {{totalCallsNetwork}} calls handled.',
 '["firstName", "callsThisWeek", "hoursHandled", "totalCallsNetwork", "totalOrdersNetwork", "dashboardUrl"]', 'marketing')

ON CONFLICT (id) DO NOTHING;

-- ============================================
-- AUTOMATED TRIGGERS
-- ============================================
-- Configuration for automated behavioral email triggers

CREATE TABLE IF NOT EXISTS automated_triggers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT REFERENCES email_templates(id),

  -- Trigger conditions
  trigger_type TEXT NOT NULL, -- 'usage', 'inactivity', 'abandoned_upgrade', 'welcome_sequence', 'social_proof'
  condition_json JSONB NOT NULL, -- e.g., {"usage_percent": 80} or {"days_inactive": 7}

  -- Discount/promotion settings
  discount_code TEXT, -- Stripe promo code
  discount_percent INTEGER, -- Display value (e.g., 20 for 20%)

  -- Deduplication settings
  cooldown_days INTEGER DEFAULT 7, -- Don't send same trigger within X days
  max_sends_per_user INTEGER DEFAULT 1, -- Max times to send this trigger per user (null = unlimited)

  -- Scheduling
  priority INTEGER DEFAULT 5, -- Lower = higher priority
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default triggers
INSERT INTO automated_triggers (id, name, description, template_id, trigger_type, condition_json, discount_code, discount_percent, cooldown_days, max_sends_per_user, priority) VALUES
-- Usage triggers
('usage_50', 'Usage 50%', 'Send when user reaches 50% of fair use cap', 'usage_50', 'usage', '{"usage_percent": 50}', NULL, NULL, 7, 1, 5),
('usage_80', 'Usage 80%', 'Send when user reaches 80% of fair use cap', 'usage_80', 'usage', '{"usage_percent": 80}', 'MOMENTUM15', 15, 7, 1, 4),
('usage_90', 'Usage 90%', 'Send when user reaches 90% of fair use cap', 'usage_90', 'usage', '{"usage_percent": 90}', 'KEEPGOING20', 20, 7, 1, 3),
('usage_100', 'Usage 100%', 'Send when user reaches 100% of fair use cap', 'usage_100', 'usage', '{"usage_percent": 100}', 'NOLIMITS25', 25, 7, 1, 2),

-- Inactivity triggers
('inactive_3d', 'Inactive 3 Days', 'Send after 3 days of no calls', 'inactive_3d', 'inactivity', '{"days_inactive": 3}', NULL, NULL, 30, 1, 6),
('inactive_7d', 'Inactive 7 Days', 'Send after 7 days of no calls', 'inactive_7d', 'inactivity', '{"days_inactive": 7}', NULL, NULL, 30, 1, 5),
('inactive_14d', 'Inactive 14 Days', 'Send after 14 days of no calls', 'inactive_14d', 'inactivity', '{"days_inactive": 14}', 'COMEBACK20', 20, 30, 1, 4),

-- Abandoned upgrade triggers
('abandoned_1h', 'Abandoned Upgrade 1h', 'Send 1 hour after viewing pricing', 'abandoned_upgrade_1h', 'abandoned_upgrade', '{"hours_since_view": 1}', 'READY15', 15, 7, 1, 3),
('abandoned_24h', 'Abandoned Upgrade 24h', 'Send 24 hours after viewing pricing', 'abandoned_upgrade_24h', 'abandoned_upgrade', '{"hours_since_view": 24}', 'LASTCHANCE30', 30, 7, 1, 2),

-- Welcome sequence
('welcome_d2', 'Welcome Day 2', 'Tips email 2 days after signup', 'welcome_day2', 'welcome_sequence', '{"days_since_signup": 2}', NULL, NULL, NULL, 1, 5),
('welcome_d5', 'Welcome Day 5', 'Feedback request 5 days after signup', 'welcome_day5', 'welcome_sequence', '{"days_since_signup": 5}', NULL, NULL, NULL, 1, 5),

-- Social proof
('social_proof', 'Weekly Social Proof', 'Weekly stats email for active users', 'social_proof_weekly', 'social_proof', '{"min_calls_last_week": 1}', NULL, NULL, 7, NULL, 10)

ON CONFLICT (id) DO NOTHING;

-- ============================================
-- TRIGGER LOGS
-- ============================================
-- Log of automated emails sent (for deduplication)

CREATE TABLE IF NOT EXISTS trigger_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trigger_id TEXT NOT NULL REFERENCES automated_triggers(id),
  template_id TEXT REFERENCES email_templates(id),

  email_address TEXT NOT NULL,
  subject TEXT,

  -- Tracking
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  discount_code TEXT,
  variables_used JSONB, -- The actual values used to fill template

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trigger_logs_user_id ON trigger_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_trigger_id ON trigger_logs(trigger_id);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_sent_at ON trigger_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_trigger_logs_user_trigger ON trigger_logs(user_id, trigger_id);

-- ============================================
-- EMAIL CAMPAIGNS (Manual)
-- ============================================
-- One-time email blasts with segmentation

CREATE TABLE IF NOT EXISTS email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Content
  template_id TEXT REFERENCES email_templates(id),
  subject_override TEXT, -- Override template subject if provided

  -- Segmentation
  segment_json JSONB NOT NULL DEFAULT '{}', -- e.g., {"plan": ["growth", "scale"], "active": true}

  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE, -- NULL = immediate when sent

  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'sending', 'sent', 'cancelled'
  sent_at TIMESTAMP WITH TIME ZONE,

  -- Stats
  total_recipients INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON email_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled_at ON email_campaigns(scheduled_at);

-- ============================================
-- CAMPAIGN RECIPIENTS
-- ============================================
-- Individual recipient tracking for campaigns

CREATE TABLE IF NOT EXISTS campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  email_address TEXT NOT NULL,

  -- Status
  status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced', 'unsubscribed'
  sent_at TIMESTAMP WITH TIME ZONE,
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,

  -- Error tracking
  error_message TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign ON campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_user ON campaign_recipients(user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON campaign_recipients(status);

-- ============================================
-- USER EVENTS
-- ============================================
-- Track user behavior for triggers (pricing views, etc.)

CREATE TABLE IF NOT EXISTS user_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL, -- 'pricing_view', 'upgrade_started', 'feature_used', etc.
  event_data JSONB DEFAULT '{}', -- Additional event metadata

  page_url TEXT,
  referrer TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_type ON user_events(event_type);
CREATE INDEX IF NOT EXISTS idx_user_events_created_at ON user_events(created_at);
CREATE INDEX IF NOT EXISTS idx_user_events_user_type ON user_events(user_id, event_type);

-- ============================================
-- ADD last_active_at TO USERS
-- ============================================
-- Track last activity for inactivity triggers

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE;

-- Initialize last_active_at from most recent call if not set
UPDATE users u
SET last_active_at = (
  SELECT MAX(ch.created_at)
  FROM call_history ch
  WHERE ch.user_id = u.id
)
WHERE u.last_active_at IS NULL;

-- If still null, use created_at
UPDATE users
SET last_active_at = created_at
WHERE last_active_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);

-- ============================================
-- ADD marketing_emails TO EMAIL PREFERENCES
-- ============================================
-- Respect user opt-out for marketing emails

ALTER TABLE notification_preferences
ADD COLUMN IF NOT EXISTS marketing_emails BOOLEAN DEFAULT true;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to check if a trigger was sent recently (for deduplication)
CREATE OR REPLACE FUNCTION check_trigger_cooldown(
  p_user_id UUID,
  p_trigger_id TEXT,
  p_cooldown_days INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  last_sent TIMESTAMP WITH TIME ZONE;
BEGIN
  -- If no cooldown, always allow
  IF p_cooldown_days IS NULL THEN
    RETURN true;
  END IF;

  SELECT MAX(sent_at) INTO last_sent
  FROM trigger_logs
  WHERE user_id = p_user_id AND trigger_id = p_trigger_id;

  -- No previous send, allow
  IF last_sent IS NULL THEN
    RETURN true;
  END IF;

  -- Check if cooldown has passed
  RETURN (NOW() - last_sent) > (p_cooldown_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to count trigger sends for a user
CREATE OR REPLACE FUNCTION count_trigger_sends(
  p_user_id UUID,
  p_trigger_id TEXT
) RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM trigger_logs
    WHERE user_id = p_user_id AND trigger_id = p_trigger_id
  );
END;
$$ LANGUAGE plpgsql;

-- Function to update user's last_active_at on call
CREATE OR REPLACE FUNCTION update_user_last_active()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users
  SET last_active_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_active_at on new calls
DROP TRIGGER IF EXISTS trigger_update_last_active ON call_history;
CREATE TRIGGER trigger_update_last_active
  AFTER INSERT ON call_history
  FOR EACH ROW
  EXECUTE FUNCTION update_user_last_active();

-- ============================================
-- RLS POLICIES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trigger_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_events ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for templates and triggers (service role access)
CREATE POLICY "Service role full access to email_templates" ON email_templates
  FOR ALL USING (true);

CREATE POLICY "Service role full access to automated_triggers" ON automated_triggers
  FOR ALL USING (true);

CREATE POLICY "Service role full access to email_campaigns" ON email_campaigns
  FOR ALL USING (true);

CREATE POLICY "Service role full access to campaign_recipients" ON campaign_recipients
  FOR ALL USING (true);

-- Users can see their own trigger logs
CREATE POLICY "Users can view own trigger logs" ON trigger_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to trigger_logs" ON trigger_logs
  FOR ALL USING (true);

-- Users can insert and view their own events
CREATE POLICY "Users can insert own events" ON user_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own events" ON user_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to user_events" ON user_events
  FOR ALL USING (true);

-- ============================================
-- VERIFICATION
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_templates') AND
     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'automated_triggers') AND
     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trigger_logs') AND
     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_campaigns') AND
     EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_events') THEN
    RAISE NOTICE 'Migration successful: Email campaigns tables created';
  ELSE
    RAISE WARNING 'Migration may have failed: Some tables not found';
  END IF;
END $$;
