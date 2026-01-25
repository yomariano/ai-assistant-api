-- Migration: Remove legacy subscription plans
-- Cleans up old/inactive plans that are no longer used
-- Current active plans: starter, growth, pro

-- =====================================================
-- STEP 1: Check for any users still on legacy plans
-- =====================================================

DO $$
DECLARE
  legacy_user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_user_count
  FROM user_subscriptions
  WHERE plan_id IN ('business', 'agency', 'pro_legacy', 'scale')
    AND status IN ('active', 'trialing');

  IF legacy_user_count > 0 THEN
    RAISE WARNING 'Found % users on legacy plans. They should be migrated before deleting plans.', legacy_user_count;
  ELSE
    RAISE NOTICE 'No active users on legacy plans. Safe to delete.';
  END IF;
END $$;

-- =====================================================
-- STEP 2: Update any remaining references to use 'starter'
-- (Safety measure - moves any stragglers to starter plan)
-- =====================================================

UPDATE user_subscriptions
SET plan_id = 'starter', updated_at = NOW()
WHERE plan_id IN ('business', 'agency', 'pro_legacy', 'scale')
  AND status NOT IN ('active', 'trialing');

-- =====================================================
-- STEP 3: Delete legacy plans
-- =====================================================

DELETE FROM subscription_plans
WHERE id IN ('business', 'agency', 'pro_legacy', 'scale');

-- =====================================================
-- STEP 4: Verify only active plans remain
-- =====================================================

DO $$
DECLARE
  active_plans TEXT[];
  plan_count INTEGER;
BEGIN
  SELECT array_agg(id ORDER BY sort_order) INTO active_plans
  FROM subscription_plans
  WHERE is_active = true;

  plan_count := array_length(active_plans, 1);

  RAISE NOTICE 'Remaining active plans (%): %', plan_count, active_plans;

  IF active_plans = ARRAY['starter', 'growth', 'pro'] THEN
    RAISE NOTICE 'Migration successful: Only starter, growth, pro plans remain';
  ELSE
    RAISE WARNING 'Unexpected plans remaining. Expected [starter, growth, pro], got %', active_plans;
  END IF;
END $$;
