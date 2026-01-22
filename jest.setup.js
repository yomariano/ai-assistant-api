// Jest global test setup (runs before any tests are loaded).
// Provide safe defaults so modules that initialize SDK clients at import-time
// (e.g. Supabase) don't crash when env vars are missing.

process.env.SUPABASE_URL ??= 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';



