-- ============================================
-- Ireland Number Pool System
-- ============================================
-- Since VoIPcloud doesn't have auto-provisioning APIs,
-- we pre-purchase numbers and assign them from a pool.

-- NOTE: User region is stored in user_phone_numbers.region
-- Cannot modify auth.users directly in Supabase

-- Number Pool Table
-- Pre-purchased phone numbers ready for assignment
CREATE TABLE IF NOT EXISTS phone_number_pool (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number VARCHAR(20) NOT NULL UNIQUE,
  region VARCHAR(2) NOT NULL DEFAULT 'IE',
  provider VARCHAR(50) NOT NULL DEFAULT 'voipcloud',

  -- VoIPcloud specific
  voipcloud_did_id VARCHAR(100),

  -- VAPI Integration
  vapi_phone_id VARCHAR(100),

  -- Assignment
  status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'assigned', 'released')),
  assigned_to UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ,
  reserved_at TIMESTAMPTZ,
  reserved_until TIMESTAMPTZ,

  -- Metadata
  capabilities JSONB DEFAULT '{"voice": true, "sms": false}'::jsonb,
  monthly_cost_cents INTEGER DEFAULT 0,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_pool_status ON phone_number_pool(status);
CREATE INDEX IF NOT EXISTS idx_pool_region ON phone_number_pool(region);
CREATE INDEX IF NOT EXISTS idx_pool_assigned_to ON phone_number_pool(assigned_to);

-- Update user_phone_numbers to track pool source
ALTER TABLE user_phone_numbers ADD COLUMN IF NOT EXISTS pool_number_id UUID REFERENCES phone_number_pool(id);
ALTER TABLE user_phone_numbers ADD COLUMN IF NOT EXISTS region VARCHAR(2) DEFAULT 'US';

-- Number Assignment History
-- Track all assignments and releases
CREATE TABLE IF NOT EXISTS number_assignment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pool_number_id UUID NOT NULL REFERENCES phone_number_pool(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  action VARCHAR(20) NOT NULL CHECK (action IN ('assigned', 'released', 'reserved', 'cancelled')),
  reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_pool ON number_assignment_history(pool_number_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_user ON number_assignment_history(user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get available number from pool
CREATE OR REPLACE FUNCTION get_available_pool_number(p_region VARCHAR DEFAULT 'IE')
RETURNS phone_number_pool AS $$
DECLARE
  v_number phone_number_pool;
BEGIN
  -- Get first available number for region
  SELECT * INTO v_number
  FROM phone_number_pool
  WHERE region = p_region
    AND status = 'available'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  RETURN v_number;
END;
$$ LANGUAGE plpgsql;

-- Function to reserve a number (with timeout)
CREATE OR REPLACE FUNCTION reserve_pool_number(
  p_number_id UUID,
  p_user_id UUID,
  p_reserve_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE phone_number_pool
  SET
    status = 'reserved',
    assigned_to = p_user_id,
    reserved_at = NOW(),
    reserved_until = NOW() + (p_reserve_minutes || ' minutes')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_number_id
    AND status = 'available';

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Log the reservation
  INSERT INTO number_assignment_history (pool_number_id, user_id, action, reason)
  VALUES (p_number_id, p_user_id, 'reserved', 'Subscription checkout started');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to assign a reserved number
CREATE OR REPLACE FUNCTION assign_pool_number(
  p_number_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE phone_number_pool
  SET
    status = 'assigned',
    assigned_to = p_user_id,
    assigned_at = NOW(),
    reserved_at = NULL,
    reserved_until = NULL,
    updated_at = NOW()
  WHERE id = p_number_id
    AND (status = 'reserved' OR status = 'available')
    AND (assigned_to = p_user_id OR assigned_to IS NULL);

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Log the assignment
  INSERT INTO number_assignment_history (pool_number_id, user_id, action, reason)
  VALUES (p_number_id, p_user_id, 'assigned', 'Subscription confirmed');

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to release a number back to pool
CREATE OR REPLACE FUNCTION release_pool_number(
  p_number_id UUID,
  p_reason TEXT DEFAULT 'Subscription cancelled'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get current user before releasing
  SELECT assigned_to INTO v_user_id
  FROM phone_number_pool
  WHERE id = p_number_id;

  UPDATE phone_number_pool
  SET
    status = 'released',
    assigned_to = NULL,
    assigned_at = NULL,
    reserved_at = NULL,
    reserved_until = NULL,
    updated_at = NOW()
  WHERE id = p_number_id
    AND status IN ('assigned', 'reserved');

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Log the release
  IF v_user_id IS NOT NULL THEN
    INSERT INTO number_assignment_history (pool_number_id, user_id, action, reason)
    VALUES (p_number_id, v_user_id, 'released', p_reason);
  END IF;

  -- After a cooldown period, mark as available again
  -- This is handled by a scheduled job

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired reservations
CREATE OR REPLACE FUNCTION cleanup_expired_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH expired AS (
    UPDATE phone_number_pool
    SET
      status = 'available',
      assigned_to = NULL,
      reserved_at = NULL,
      reserved_until = NULL,
      updated_at = NOW()
    WHERE status = 'reserved'
      AND reserved_until < NOW()
    RETURNING id, assigned_to
  )
  INSERT INTO number_assignment_history (pool_number_id, user_id, action, reason)
  SELECT id, assigned_to, 'cancelled', 'Reservation expired'
  FROM expired
  WHERE assigned_to IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function to make released numbers available again (after cooldown)
CREATE OR REPLACE FUNCTION recycle_released_numbers(p_cooldown_hours INTEGER DEFAULT 24)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE phone_number_pool
  SET
    status = 'available',
    updated_at = NOW()
  WHERE status = 'released'
    AND updated_at < NOW() - (p_cooldown_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE phone_number_pool ENABLE ROW LEVEL SECURITY;
ALTER TABLE number_assignment_history ENABLE ROW LEVEL SECURITY;

-- Pool table - users can only see their assigned numbers
CREATE POLICY "Users can view their assigned numbers"
  ON phone_number_pool FOR SELECT
  USING (assigned_to = auth.uid());

-- Admin can manage all numbers (via service role key)
-- No policy needed - use service role key for admin operations

-- Assignment history - users can see their own history
CREATE POLICY "Users can view their assignment history"
  ON number_assignment_history FOR SELECT
  USING (user_id = auth.uid());

-- ============================================
-- SEED DATA: Pre-add the Dublin number
-- ============================================

-- Insert the existing Dublin number if not exists
INSERT INTO phone_number_pool (
  phone_number,
  region,
  provider,
  voipcloud_did_id,
  status,
  capabilities,
  notes
)
VALUES (
  '+35312655181',
  'IE',
  'voipcloud',
  '195782',
  'available',
  '{"voice": true, "sms": false}'::jsonb,
  'Dublin geographic number - primary Ireland number'
)
ON CONFLICT (phone_number) DO NOTHING;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_pool_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_pool_updated_at
  BEFORE UPDATE ON phone_number_pool
  FOR EACH ROW
  EXECUTE FUNCTION update_pool_updated_at();

-- ============================================
-- VIEWS
-- ============================================

-- Pool summary view for admin dashboard
CREATE OR REPLACE VIEW phone_number_pool_summary AS
SELECT
  region,
  status,
  COUNT(*) as count,
  provider
FROM phone_number_pool
GROUP BY region, status, provider
ORDER BY region, status;
