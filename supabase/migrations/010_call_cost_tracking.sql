-- Migration: Add per-call cost tracking for OrderBot.ie pay-per-call model
-- Lite: €0.95/call | Growth: €0.45/call | Pro: €0/call (1500 fair use cap)

-- Add cost tracking to call_history
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS cost_cents INTEGER DEFAULT 0;
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS vapi_cost_cents INTEGER DEFAULT 0;
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS billed BOOLEAN DEFAULT false;

COMMENT ON COLUMN call_history.cost_cents IS 'Amount charged to customer for this call (based on plan rate)';
COMMENT ON COLUMN call_history.vapi_cost_cents IS 'Actual cost from Vapi provider (for margin tracking)';
COMMENT ON COLUMN call_history.billed IS 'Whether this call has been included in an invoice';

-- Add cost tracking to usage_tracking (monthly totals)
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS total_call_charges_cents INTEGER DEFAULT 0;
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS calls_within_cap INTEGER DEFAULT 0;
ALTER TABLE usage_tracking ADD COLUMN IF NOT EXISTS calls_over_cap INTEGER DEFAULT 0;

COMMENT ON COLUMN usage_tracking.total_call_charges_cents IS 'Total per-call charges for the billing period';
COMMENT ON COLUMN usage_tracking.calls_within_cap IS 'Calls that count toward fair use cap (Pro plan)';
COMMENT ON COLUMN usage_tracking.calls_over_cap IS 'Calls exceeding fair use cap (should be 0 if enforced)';

-- Add cost tracking to trial_usage
ALTER TABLE trial_usage ADD COLUMN IF NOT EXISTS total_cost_cents INTEGER DEFAULT 0;

-- Create function to record a call with cost
CREATE OR REPLACE FUNCTION record_call_with_cost(
  p_user_id UUID,
  p_call_cost_cents INTEGER,
  p_is_trial BOOLEAN DEFAULT false
)
RETURNS void AS $$
DECLARE
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  IF p_is_trial THEN
    -- Update trial usage
    INSERT INTO trial_usage (user_id, calls_made, minutes_used, total_cost_cents)
    VALUES (p_user_id, 1, 0, p_call_cost_cents)
    ON CONFLICT (user_id) DO UPDATE SET
      calls_made = trial_usage.calls_made + 1,
      total_cost_cents = trial_usage.total_cost_cents + p_call_cost_cents,
      updated_at = NOW();
  ELSE
    -- Get current billing period
    v_period_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;
    v_period_end := (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;

    -- Insert or update usage_tracking
    INSERT INTO usage_tracking (user_id, period_start, period_end, calls_made, total_call_charges_cents)
    VALUES (p_user_id, v_period_start, v_period_end, 1, p_call_cost_cents)
    ON CONFLICT (user_id, period_start) DO UPDATE SET
      calls_made = usage_tracking.calls_made + 1,
      total_call_charges_cents = usage_tracking.total_call_charges_cents + p_call_cost_cents,
      updated_at = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create function to get usage summary with costs
CREATE OR REPLACE FUNCTION get_usage_summary(p_user_id UUID)
RETURNS TABLE (
  calls_made INTEGER,
  total_charges_cents INTEGER,
  period_start DATE,
  period_end DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ut.calls_made,
    ut.total_call_charges_cents,
    ut.period_start,
    ut.period_end
  FROM usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE;
END;
$$ LANGUAGE plpgsql;

-- Create function to check if user can make a call (fair use cap)
CREATE OR REPLACE FUNCTION can_make_call(
  p_user_id UUID,
  p_calls_cap INTEGER  -- NULL or 0 means unlimited, positive number is the cap
)
RETURNS TABLE (
  allowed BOOLEAN,
  current_calls INTEGER,
  calls_remaining INTEGER,
  reason TEXT
) AS $$
DECLARE
  v_current_calls INTEGER;
BEGIN
  -- Get current month's call count
  SELECT COALESCE(ut.calls_made, 0) INTO v_current_calls
  FROM usage_tracking ut
  WHERE ut.user_id = p_user_id
    AND ut.period_start = DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- If no record, user has 0 calls
  IF v_current_calls IS NULL THEN
    v_current_calls := 0;
  END IF;

  -- Check against cap
  IF p_calls_cap IS NULL OR p_calls_cap <= 0 THEN
    -- Unlimited (no cap or cap is 0/negative)
    RETURN QUERY SELECT
      true AS allowed,
      v_current_calls AS current_calls,
      -1 AS calls_remaining,  -- -1 indicates unlimited
      'unlimited'::TEXT AS reason;
  ELSIF v_current_calls >= p_calls_cap THEN
    -- Over cap
    RETURN QUERY SELECT
      false AS allowed,
      v_current_calls AS current_calls,
      0 AS calls_remaining,
      'fair_use_cap_exceeded'::TEXT AS reason;
  ELSE
    -- Under cap
    RETURN QUERY SELECT
      true AS allowed,
      v_current_calls AS current_calls,
      (p_calls_cap - v_current_calls) AS calls_remaining,
      'within_cap'::TEXT AS reason;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create index for faster usage lookups
CREATE INDEX IF NOT EXISTS idx_call_history_user_billed
  ON call_history(user_id, billed)
  WHERE billed = false;

CREATE INDEX IF NOT EXISTS idx_usage_tracking_period_user
  ON usage_tracking(period_start, user_id);

-- Verify migration
DO $$
BEGIN
  -- Check columns exist
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'cost_cents'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'usage_tracking' AND column_name = 'total_call_charges_cents'
  ) THEN
    RAISE NOTICE 'Migration successful: Call cost tracking columns added';
  ELSE
    RAISE WARNING 'Migration may have failed: Missing expected columns';
  END IF;
END $$;
