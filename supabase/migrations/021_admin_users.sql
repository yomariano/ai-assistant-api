-- Migration: Add admin user support
-- Allows specific users to access admin panel for email campaigns

-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Create index for faster admin lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = true;

-- Comment for documentation
COMMENT ON COLUMN users.is_admin IS 'Whether user has access to admin panel (email campaigns, etc.)';

-- To make a user an admin, run:
-- UPDATE users SET is_admin = true WHERE email = 'your@email.com';

-- Verification
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    RAISE NOTICE 'Migration successful: is_admin column added to users';
  ELSE
    RAISE WARNING 'Migration may have failed: is_admin column not found';
  END IF;
END $$;
