-- Migration: Add missing columns to call_history for Vapi call details
-- These columns store transcript, recording, and other call metadata from Vapi

-- Add transcript column for full call transcript
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS transcript TEXT;

-- Add summary column for AI-generated call summary
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS summary TEXT;

-- Add recording_url for call recording playback
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS recording_url TEXT;

-- Add ended_reason to track how the call ended (e.g., 'hangup', 'voicemail', 'timeout')
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS ended_reason TEXT;

-- Add cost_cents for per-call billing (distinct from vapi_cost_cents which is provider cost)
ALTER TABLE call_history ADD COLUMN IF NOT EXISTS cost_cents INTEGER DEFAULT 0;

-- Add comments for documentation
COMMENT ON COLUMN call_history.transcript IS 'Full transcript of the call conversation';
COMMENT ON COLUMN call_history.summary IS 'AI-generated summary of the call';
COMMENT ON COLUMN call_history.recording_url IS 'URL to the call recording audio file';
COMMENT ON COLUMN call_history.ended_reason IS 'How the call ended (hangup, voicemail, timeout, error, etc.)';
COMMENT ON COLUMN call_history.cost_cents IS 'Amount charged to customer for this call based on plan rate';

-- Verify migration
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'call_history' AND column_name = 'transcript'
  ) THEN
    RAISE NOTICE 'Migration successful: call_history columns added';
  ELSE
    RAISE WARNING 'Migration may have failed: transcript column not found';
  END IF;
END $$;
