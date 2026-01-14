-- Migration: Booking Providers Integration
-- Description: Creates tables for third-party booking provider connections (Cal.com, Calendly, Square, etc.)

-- Provider definitions (static reference data)
CREATE TABLE IF NOT EXISTS booking_providers (
  id TEXT PRIMARY KEY,  -- 'calendly', 'calcom', 'square', 'simplybook', 'thefork', 'mindbody'
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,  -- lucide icon name or URL
  category TEXT NOT NULL,  -- 'general', 'restaurant', 'salon', 'fitness', 'healthcare'
  website_url TEXT,
  docs_url TEXT,

  -- API Configuration
  auth_type TEXT NOT NULL DEFAULT 'oauth2',  -- 'oauth2', 'api_key', 'basic'
  oauth_authorize_url TEXT,
  oauth_token_url TEXT,
  oauth_scopes TEXT[],
  api_base_url TEXT,

  -- Features
  supports_availability_sync BOOLEAN DEFAULT FALSE,
  supports_booking_create BOOLEAN DEFAULT FALSE,
  supports_booking_update BOOLEAN DEFAULT FALSE,
  supports_booking_cancel BOOLEAN DEFAULT FALSE,
  supports_webhooks BOOLEAN DEFAULT FALSE,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_beta BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User provider connections
CREATE TABLE IF NOT EXISTS provider_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES booking_providers(id),

  -- Connection status
  status TEXT DEFAULT 'pending',  -- 'pending', 'connected', 'error', 'expired', 'disconnected'
  error_message TEXT,

  -- OAuth credentials (encrypted in practice via app-level encryption)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,

  -- API key auth (for providers that use API keys)
  api_key TEXT,
  api_secret TEXT,

  -- Provider-specific configuration
  external_account_id TEXT,  -- ID in the external system
  external_account_name TEXT,  -- Name/label from external system
  config JSONB DEFAULT '{}',  -- Provider-specific settings

  -- Sync settings
  sync_enabled BOOLEAN DEFAULT TRUE,
  sync_direction TEXT DEFAULT 'bidirectional',  -- 'inbound', 'outbound', 'bidirectional'
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,

  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret TEXT,

  -- Timestamps
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,

  UNIQUE(user_id, provider_id)
);

-- Provider sync logs (for debugging and monitoring)
CREATE TABLE IF NOT EXISTS provider_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Sync details
  sync_type TEXT NOT NULL,  -- 'availability', 'booking_created', 'booking_updated', 'booking_cancelled', 'webhook'
  direction TEXT NOT NULL,  -- 'inbound', 'outbound'
  status TEXT NOT NULL,  -- 'success', 'error', 'partial'

  -- Data
  external_id TEXT,  -- External booking/event ID
  internal_id UUID,  -- Internal booking ID
  request_payload JSONB,
  response_payload JSONB,
  error_details JSONB,

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_provider_connections_user_id ON provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_provider_id ON provider_connections(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_connections_status ON provider_connections(status);
CREATE INDEX IF NOT EXISTS idx_provider_sync_logs_connection_id ON provider_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_provider_sync_logs_user_id ON provider_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_sync_logs_created ON provider_sync_logs(started_at DESC);

-- RLS Policies
ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_sync_logs ENABLE ROW LEVEL SECURITY;

-- Policies for provider_connections
DROP POLICY IF EXISTS "Users can view own provider connections" ON provider_connections;
CREATE POLICY "Users can view own provider connections"
  ON provider_connections FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can manage own provider connections" ON provider_connections;
CREATE POLICY "Users can manage own provider connections"
  ON provider_connections FOR ALL USING (user_id = auth.uid());

-- Policies for provider_sync_logs
DROP POLICY IF EXISTS "Users can view own sync logs" ON provider_sync_logs;
CREATE POLICY "Users can view own sync logs"
  ON provider_sync_logs FOR SELECT USING (user_id = auth.uid());

-- Service role policies
DROP POLICY IF EXISTS "Service role can manage provider_connections" ON provider_connections;
CREATE POLICY "Service role can manage provider_connections"
  ON provider_connections FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role can manage provider_sync_logs" ON provider_sync_logs;
CREATE POLICY "Service role can manage provider_sync_logs"
  ON provider_sync_logs FOR ALL USING (auth.role() = 'service_role');

-- Seed booking providers
INSERT INTO booking_providers (id, name, description, icon, category, website_url, docs_url, auth_type, oauth_authorize_url, oauth_token_url, oauth_scopes, api_base_url, supports_availability_sync, supports_booking_create, supports_booking_update, supports_booking_cancel, supports_webhooks, is_active, is_beta, sort_order) VALUES

-- Phase 1: Free/Open APIs
('calcom', 'Cal.com', 'Open source scheduling infrastructure. Self-hostable with full API access.', 'Calendar', 'general', 'https://cal.com', 'https://cal.com/docs/api-reference', 'api_key', NULL, NULL, NULL, 'https://api.cal.com/v1', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, 1),

('calendly', 'Calendly', 'Popular scheduling automation platform with extensive API and embed options.', 'CalendarCheck', 'general', 'https://calendly.com', 'https://developer.calendly.com', 'oauth2', 'https://auth.calendly.com/oauth/authorize', 'https://auth.calendly.com/oauth/token', ARRAY['default'], 'https://api.calendly.com', TRUE, FALSE, FALSE, TRUE, TRUE, TRUE, FALSE, 2),

('square', 'Square Appointments', 'All-in-one booking solution with integrated payments and POS.', 'Square', 'general', 'https://squareup.com/appointments', 'https://developer.squareup.com/docs/bookings-api', 'oauth2', 'https://connect.squareup.com/oauth2/authorize', 'https://connect.squareup.com/oauth2/token', ARRAY['APPOINTMENTS_READ', 'APPOINTMENTS_WRITE', 'CUSTOMERS_READ'], 'https://connect.squareup.com/v2', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, 3),

('simplybook', 'SimplyBook.me', 'Comprehensive booking system with free tier and JSON-RPC API.', 'BookOpen', 'general', 'https://simplybook.me', 'https://simplybook.me/en/api/developer-api', 'api_key', NULL, NULL, NULL, 'https://user-api.simplybook.me', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, 4),

-- Phase 2: Partnership/Industry-specific
('thefork', 'TheFork', 'Restaurant reservation platform with B2B API for the hospitality industry.', 'UtensilsCrossed', 'restaurant', 'https://www.theforkmanager.com', 'https://docs.thefork.io', 'api_key', NULL, NULL, NULL, 'https://api.thefork.com', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 10),

('mindbody', 'Mindbody', 'Leading platform for fitness, wellness, and beauty businesses.', 'Dumbbell', 'fitness', 'https://www.mindbodyonline.com', 'https://developers.mindbodyonline.com', 'api_key', NULL, NULL, NULL, 'https://api.mindbodyonline.com/public/v6', TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 11)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  website_url = EXCLUDED.website_url,
  docs_url = EXCLUDED.docs_url,
  auth_type = EXCLUDED.auth_type,
  oauth_authorize_url = EXCLUDED.oauth_authorize_url,
  oauth_token_url = EXCLUDED.oauth_token_url,
  oauth_scopes = EXCLUDED.oauth_scopes,
  api_base_url = EXCLUDED.api_base_url,
  supports_availability_sync = EXCLUDED.supports_availability_sync,
  supports_booking_create = EXCLUDED.supports_booking_create,
  supports_booking_update = EXCLUDED.supports_booking_update,
  supports_booking_cancel = EXCLUDED.supports_booking_cancel,
  supports_webhooks = EXCLUDED.supports_webhooks,
  is_active = EXCLUDED.is_active,
  is_beta = EXCLUDED.is_beta,
  sort_order = EXCLUDED.sort_order;

-- Add external_booking_id to bookings table for synced bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_provider_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_booking_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_external ON bookings(external_provider_id, external_booking_id);
