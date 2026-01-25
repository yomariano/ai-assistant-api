-- Migration: Add primary provider support
-- Description: Allows users to designate one booking provider as their primary
--              for AI assistant booking operations

-- Add is_primary column to provider_connections
ALTER TABLE provider_connections
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false;

-- Create index for faster primary provider lookups
CREATE INDEX IF NOT EXISTS idx_provider_connections_primary
ON provider_connections(user_id, is_primary)
WHERE is_primary = true;

-- Function to ensure only one primary provider per user
CREATE OR REPLACE FUNCTION ensure_single_primary_provider()
RETURNS TRIGGER AS $$
BEGIN
  -- If setting this connection as primary, unset all others for this user
  IF NEW.is_primary = true THEN
    UPDATE provider_connections
    SET is_primary = false
    WHERE user_id = NEW.user_id
      AND id != NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce single primary provider
DROP TRIGGER IF EXISTS trigger_single_primary_provider ON provider_connections;
CREATE TRIGGER trigger_single_primary_provider
  BEFORE INSERT OR UPDATE OF is_primary ON provider_connections
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION ensure_single_primary_provider();

-- Auto-set first connected provider as primary if none exists
-- This is a one-time migration for existing data
UPDATE provider_connections pc
SET is_primary = true
WHERE pc.status = 'connected'
  AND pc.id = (
    SELECT id FROM provider_connections
    WHERE user_id = pc.user_id
      AND status = 'connected'
    ORDER BY connected_at ASC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM provider_connections
    WHERE user_id = pc.user_id
      AND is_primary = true
  );

-- Comment for documentation
COMMENT ON COLUMN provider_connections.is_primary IS
  'Indicates the primary booking provider used by the AI assistant for availability checks and bookings';
