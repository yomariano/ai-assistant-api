-- ============================================
-- RESET USER SCRIPT
-- ============================================
-- This script resets a user to "fresh signup" state
-- keeping only the auth record so they can log in again.
--
-- Usage: Replace 'your-email@example.com' with your email
-- Run in Supabase SQL Editor
-- ============================================

DO $$
DECLARE
  target_email TEXT := 'your-email@example.com';  -- << CHANGE THIS
  target_user_id UUID;
BEGIN
  -- Get user ID
  SELECT id INTO target_user_id FROM users WHERE email = target_email;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: %', target_email;
  END IF;

  RAISE NOTICE 'Resetting user: % (ID: %)', target_email, target_user_id;

  -- Delete in order (respecting foreign keys)

  -- Bookings system
  DELETE FROM bookings WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted bookings';

  DELETE FROM customers WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted customers';

  DELETE FROM booking_configs WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted booking_configs';

  -- Call history
  DELETE FROM call_history WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted call_history';

  -- Saved/scheduled calls
  DELETE FROM saved_calls WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted saved_calls';

  DELETE FROM scheduled_calls WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted scheduled_calls';

  -- Usage tracking
  DELETE FROM usage_tracking WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted usage_tracking';

  -- Notifications
  DELETE FROM notification_preferences WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted notification_preferences';

  DELETE FROM escalation_settings WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted escalation_settings';

  -- Phone numbers (releases them back to pool or marks for cleanup)
  UPDATE phone_numbers
  SET status = 'released', user_id = NULL, updated_at = NOW()
  WHERE user_id = target_user_id;
  RAISE NOTICE 'Released phone_numbers';

  -- Assistant
  DELETE FROM user_assistants WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted user_assistants';

  -- Subscription
  DELETE FROM subscriptions WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted subscriptions';

  -- Onboarding progress (if exists)
  DELETE FROM user_onboarding WHERE user_id = target_user_id;
  RAISE NOTICE 'Deleted user_onboarding';

  -- Reset user metadata (optional - keeps user record)
  UPDATE users
  SET
    updated_at = NOW()
  WHERE id = target_user_id;

  RAISE NOTICE 'OK - user reset complete: %', target_email;
  RAISE NOTICE 'User can now log in and will see "subscribe to get started" state';

END $$;

-- ============================================
-- VERIFICATION QUERY (run after reset)
-- ============================================
-- SELECT
--   u.email,
--   (SELECT COUNT(*) FROM subscriptions WHERE user_id = u.id) as subscriptions,
--   (SELECT COUNT(*) FROM phone_numbers WHERE user_id = u.id) as phone_numbers,
--   (SELECT COUNT(*) FROM user_assistants WHERE user_id = u.id) as assistants,
--   (SELECT COUNT(*) FROM call_history WHERE user_id = u.id) as calls
-- FROM users u
-- WHERE u.email = 'your-email@example.com';
