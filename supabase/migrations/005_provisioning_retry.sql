-- Migration: Add retry functionality to provisioning queue
-- Run this in Supabase SQL Editor

-- Add missing columns for retry logic
ALTER TABLE provisioning_queue
ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS result JSONB;

-- Update status check constraint to include new statuses
ALTER TABLE provisioning_queue DROP CONSTRAINT IF EXISTS provisioning_queue_status_check;
ALTER TABLE provisioning_queue ADD CONSTRAINT provisioning_queue_status_check
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial', 'max_attempts_reached'));

-- Add index for retry scheduling
CREATE INDEX IF NOT EXISTS idx_provisioning_queue_next_retry ON provisioning_queue(next_retry_at)
    WHERE status IN ('pending', 'failed');

-- Add assistant_id to phone numbers (link number to specific assistant)
ALTER TABLE user_phone_numbers
ADD COLUMN IF NOT EXISTS assistant_id UUID REFERENCES user_assistants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_phone_numbers_assistant ON user_phone_numbers(assistant_id);
