-- Migration: Remove SMS functionality
-- Description: Remove all SMS-related columns and constraints since VoIPCloud only supports
-- receiving SMS (inbound), not sending SMS (outbound) which is needed for booking notifications.

-- =====================================================
-- STEP 1: Remove SMS columns from notification_preferences
-- =====================================================

ALTER TABLE notification_preferences DROP COLUMN IF EXISTS sms_enabled;
ALTER TABLE notification_preferences DROP COLUMN IF EXISTS sms_number;

-- =====================================================
-- STEP 2: Update escalation_settings CHECK constraints
-- Remove 'sms_alert' from transfer_method and after_hours_action
-- =====================================================

-- Remove existing constraints
ALTER TABLE escalation_settings DROP CONSTRAINT IF EXISTS escalation_settings_transfer_method_check;
ALTER TABLE escalation_settings DROP CONSTRAINT IF EXISTS escalation_settings_after_hours_action_check;

-- Add updated constraints without 'sms_alert'
ALTER TABLE escalation_settings
  ADD CONSTRAINT escalation_settings_transfer_method_check
  CHECK (transfer_method IN ('blind_transfer', 'warm_transfer', 'callback'));

ALTER TABLE escalation_settings
  ADD CONSTRAINT escalation_settings_after_hours_action_check
  CHECK (after_hours_action IN ('voicemail', 'callback_promise', 'ai_only'));

-- Update any existing rows that have 'sms_alert' to a reasonable default
UPDATE escalation_settings
SET transfer_method = 'callback'
WHERE transfer_method = 'sms_alert';

UPDATE escalation_settings
SET after_hours_action = 'voicemail'
WHERE after_hours_action = 'sms_alert';

-- =====================================================
-- STEP 3: Update call_notifications CHECK constraint
-- Remove 'sms' from notification_type
-- =====================================================

-- Remove existing constraint
ALTER TABLE call_notifications DROP CONSTRAINT IF EXISTS call_notifications_notification_type_check;

-- Add updated constraint without 'sms'
ALTER TABLE call_notifications
  ADD CONSTRAINT call_notifications_notification_type_check
  CHECK (notification_type IN ('email'));

-- Delete any existing SMS notification records (optional cleanup)
DELETE FROM call_notifications WHERE notification_type = 'sms';

-- =====================================================
-- STEP 4: Remove SMS column from booking_configs
-- =====================================================

ALTER TABLE booking_configs DROP COLUMN IF EXISTS sms_confirmation;

-- =====================================================
-- STEP 5: Remove SMS columns from subscription_plans
-- =====================================================

ALTER TABLE subscription_plans DROP COLUMN IF EXISTS customer_sms_confirmation_enabled;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS customer_sms_reminders_enabled;
ALTER TABLE subscription_plans DROP COLUMN IF EXISTS business_sms_enabled;

-- =====================================================
-- STEP 6: Remove SMS columns from user_feature_overrides
-- =====================================================

ALTER TABLE user_feature_overrides DROP COLUMN IF EXISTS customer_sms_confirmation_override;
ALTER TABLE user_feature_overrides DROP COLUMN IF EXISTS customer_sms_reminders_override;
ALTER TABLE user_feature_overrides DROP COLUMN IF EXISTS business_sms_override;

-- =====================================================
-- STEP 7: Update subscription_plans features JSON to remove SMS references
-- =====================================================

-- Starter plan - no SMS to remove
UPDATE subscription_plans
SET features = '["100 inbound calls/month", "Google Calendar integration", "Email notifications", "5-day free trial"]'::jsonb,
    updated_at = NOW()
WHERE id = 'starter';

-- Growth plan - remove SMS features
UPDATE subscription_plans
SET features = '["500 inbound calls/month", "Google + Outlook Calendar", "Email notifications", "Business hours support (9-5)", "5-day free trial"]'::jsonb,
    updated_at = NOW()
WHERE id = 'growth';

-- Pro plan - remove SMS features
UPDATE subscription_plans
SET features = '["1,500 inbound calls/month", "200 outbound reminder calls/month", "Multi-staff calendar", "AI voice reminders", "Webhook notifications", "24/7 priority support", "5-day free trial"]'::jsonb,
    updated_at = NOW()
WHERE id = 'pro';

-- =====================================================
-- Verification
-- =====================================================

DO $$
DECLARE
  sms_cols_exist BOOLEAN;
BEGIN
  -- Check SMS columns were removed from subscription_plans
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans'
    AND column_name IN ('customer_sms_confirmation_enabled', 'customer_sms_reminders_enabled', 'business_sms_enabled')
  ) INTO sms_cols_exist;

  IF NOT sms_cols_exist THEN
    RAISE NOTICE 'Migration successful: SMS columns removed from subscription_plans';
  ELSE
    RAISE WARNING 'Migration may have failed: SMS columns still exist in subscription_plans';
  END IF;

  -- Check SMS columns were removed from notification_preferences
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_preferences'
    AND column_name IN ('sms_enabled', 'sms_number')
  ) INTO sms_cols_exist;

  IF NOT sms_cols_exist THEN
    RAISE NOTICE 'Migration successful: SMS columns removed from notification_preferences';
  ELSE
    RAISE WARNING 'Migration may have failed: SMS columns still exist in notification_preferences';
  END IF;
END $$;
