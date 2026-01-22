-- Migration: Add template_id to user_assistants
-- This tracks which industry template was used to configure the assistant

-- Add template_id column
ALTER TABLE user_assistants
ADD COLUMN IF NOT EXISTS template_id VARCHAR(50);

-- Add index for template queries
CREATE INDEX IF NOT EXISTS idx_user_assistants_template
ON user_assistants(template_id);

-- Comment for documentation
COMMENT ON COLUMN user_assistants.template_id IS 'Industry template used to configure this assistant (e.g., restaurant, healthcare, salon)';
