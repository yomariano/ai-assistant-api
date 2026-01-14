-- Migration: Add OpenTable and Resy Providers
-- Description: Adds OpenTable and Resy booking providers (pending partnership approval)

-- Insert OpenTable provider
INSERT INTO booking_providers (
  id, name, description, icon, category,
  website_url, docs_url,
  auth_type, oauth_authorize_url, oauth_token_url, oauth_scopes, api_base_url,
  supports_availability_sync, supports_booking_create, supports_booking_update, supports_booking_cancel, supports_webhooks,
  is_active, is_beta, sort_order
) VALUES (
  'opentable',
  'OpenTable',
  'Leading restaurant reservation platform. Requires partnership approval for API access.',
  'UtensilsCrossed',
  'restaurant',
  'https://www.opentable.com',
  'https://docs.opentable.com',
  'api_key',
  NULL,
  NULL,
  NULL,
  'https://platform.opentable.com/v1',
  TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, 20
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  website_url = EXCLUDED.website_url,
  docs_url = EXCLUDED.docs_url,
  auth_type = EXCLUDED.auth_type,
  api_base_url = EXCLUDED.api_base_url,
  supports_availability_sync = EXCLUDED.supports_availability_sync,
  supports_booking_create = EXCLUDED.supports_booking_create,
  supports_booking_update = EXCLUDED.supports_booking_update,
  supports_booking_cancel = EXCLUDED.supports_booking_cancel,
  supports_webhooks = EXCLUDED.supports_webhooks,
  is_active = EXCLUDED.is_active,
  is_beta = EXCLUDED.is_beta,
  sort_order = EXCLUDED.sort_order;

-- Insert Resy provider
INSERT INTO booking_providers (
  id, name, description, icon, category,
  website_url, docs_url,
  auth_type, oauth_authorize_url, oauth_token_url, oauth_scopes, api_base_url,
  supports_availability_sync, supports_booking_create, supports_booking_update, supports_booking_cancel, supports_webhooks,
  is_active, is_beta, sort_order
) VALUES (
  'resy',
  'Resy',
  'Premium restaurant reservation platform owned by American Express. Requires partnership agreement.',
  'UtensilsCrossed',
  'restaurant',
  'https://resy.com',
  'https://resy.com/resyos/integrations/',
  'api_key',
  NULL,
  NULL,
  NULL,
  'https://api.resy.com/4',
  TRUE, TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, 21
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  website_url = EXCLUDED.website_url,
  docs_url = EXCLUDED.docs_url,
  auth_type = EXCLUDED.auth_type,
  api_base_url = EXCLUDED.api_base_url,
  supports_availability_sync = EXCLUDED.supports_availability_sync,
  supports_booking_create = EXCLUDED.supports_booking_create,
  supports_booking_update = EXCLUDED.supports_booking_update,
  supports_booking_cancel = EXCLUDED.supports_booking_cancel,
  supports_webhooks = EXCLUDED.supports_webhooks,
  is_active = EXCLUDED.is_active,
  is_beta = EXCLUDED.is_beta,
  sort_order = EXCLUDED.sort_order;

-- Add comment to explain these are pending partnership
COMMENT ON COLUMN booking_providers.is_beta IS 'Beta providers are either in testing phase or require partnership approval (like OpenTable, Resy)';
