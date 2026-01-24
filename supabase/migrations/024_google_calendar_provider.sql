-- Migration: Add Google Calendar as a booking provider
-- This enables Google Calendar integration for the Starter plan and above

-- Insert Google Calendar provider
INSERT INTO booking_providers (
  id,
  name,
  description,
  icon,
  category,
  website_url,
  docs_url,
  auth_type,
  oauth_authorize_url,
  oauth_token_url,
  oauth_scopes,
  supports_availability_sync,
  supports_booking_create,
  supports_booking_update,
  supports_booking_cancel,
  supports_webhooks,
  is_active,
  is_beta,
  sort_order
) VALUES (
  'google_calendar',
  'Google Calendar',
  'Sync your Google Calendar for availability checking and automatic event creation when bookings are made.',
  'https://www.gstatic.com/images/branding/product/1x/calendar_48dp.png',
  'calendar',
  'https://calendar.google.com',
  'https://developers.google.com/calendar',
  'oauth2',
  'https://accounts.google.com/o/oauth2/v2/auth',
  'https://oauth2.googleapis.com/token',
  ARRAY['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar.events'],
  true,
  true,
  true,
  true,
  true,
  true,
  false,
  1
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;

-- Add a comment for documentation
COMMENT ON TABLE booking_providers IS 'Available booking/calendar providers. google_calendar is the primary integration for VoiceFleet.';

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM booking_providers WHERE id = 'google_calendar' AND is_active = true
  ) THEN
    RAISE NOTICE 'Migration successful: Google Calendar provider added';
  ELSE
    RAISE WARNING 'Migration may have failed: Google Calendar provider not found';
  END IF;
END $$;
