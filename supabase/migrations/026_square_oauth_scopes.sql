-- Update Square OAuth scopes to include MERCHANT_PROFILE_READ
-- Required for reading merchant info during connection test

UPDATE booking_providers
SET oauth_scopes = ARRAY[
  'MERCHANT_PROFILE_READ',
  'APPOINTMENTS_READ',
  'APPOINTMENTS_WRITE',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
  'ITEMS_READ'
]
WHERE id = 'square';
