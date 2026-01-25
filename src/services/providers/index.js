/**
 * Provider Service
 *
 * Manages booking provider connections and coordinates with adapters.
 */

const { supabaseAdmin } = require('../supabase');

// Import provider adapters
const { CalcomAdapter } = require('./calcom');
const { CalendlyAdapter } = require('./calendly');
const { SquareAdapter } = require('./square');
const { SimplybookAdapter } = require('./simplybook');
const { TheForkAdapter } = require('./thefork');
const { MindbodyAdapter } = require('./mindbody');
const { OpenTableAdapter } = require('./opentable');
const { ResyAdapter } = require('./resy');
const { GoogleCalendarAdapter } = require('./google-calendar');

// Provider adapter registry
const PROVIDER_ADAPTERS = {
  calcom: CalcomAdapter,
  calendly: CalendlyAdapter,
  square: SquareAdapter,
  simplybook: SimplybookAdapter,
  thefork: TheForkAdapter,
  mindbody: MindbodyAdapter,
  opentable: OpenTableAdapter,
  resy: ResyAdapter,
  google_calendar: GoogleCalendarAdapter,
};

/**
 * Get all available booking providers
 */
async function getProviders() {
  const { data, error } = await supabaseAdmin
    .from('booking_providers')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;
  return data;
}

/**
 * Get a specific provider by ID
 */
async function getProvider(providerId) {
  const { data, error } = await supabaseAdmin
    .from('booking_providers')
    .select('*')
    .eq('id', providerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all provider connections for a user
 */
async function getConnections(userId) {
  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .select('*, booking_providers(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * Get a specific connection
 */
async function getConnection(userId, connectionId) {
  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .select('*, booking_providers(*)')
    .eq('user_id', userId)
    .eq('id', connectionId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get connection by provider ID
 */
async function getConnectionByProvider(userId, providerId) {
  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .select('*, booking_providers(*)')
    .eq('user_id', userId)
    .eq('provider_id', providerId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Create a new provider connection
 */
async function createConnection(userId, providerId, credentials = {}) {
  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .insert({
      user_id: userId,
      provider_id: providerId,
      status: 'pending',
      access_token: credentials.accessToken || null,
      refresh_token: credentials.refreshToken || null,
      token_expires_at: credentials.tokenExpiresAt || null,
      api_key: credentials.apiKey || null,
      api_secret: credentials.apiSecret || null,
      external_account_id: credentials.externalAccountId || null,
      external_account_name: credentials.externalAccountName || null,
      config: credentials.config || {},
    })
    .select('*, booking_providers(*)')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a provider connection
 */
async function updateConnection(userId, connectionId, updates) {
  const updateData = { updated_at: new Date().toISOString() };

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.errorMessage !== undefined) updateData.error_message = updates.errorMessage;
  if (updates.accessToken !== undefined) updateData.access_token = updates.accessToken;
  if (updates.refreshToken !== undefined) updateData.refresh_token = updates.refreshToken;
  if (updates.tokenExpiresAt !== undefined) updateData.token_expires_at = updates.tokenExpiresAt;
  if (updates.apiKey !== undefined) updateData.api_key = updates.apiKey;
  if (updates.apiSecret !== undefined) updateData.api_secret = updates.apiSecret;
  if (updates.externalAccountId !== undefined) updateData.external_account_id = updates.externalAccountId;
  if (updates.externalAccountName !== undefined) updateData.external_account_name = updates.externalAccountName;
  if (updates.config !== undefined) updateData.config = updates.config;
  if (updates.syncEnabled !== undefined) updateData.sync_enabled = updates.syncEnabled;
  if (updates.syncDirection !== undefined) updateData.sync_direction = updates.syncDirection;
  if (updates.lastSyncAt !== undefined) updateData.last_sync_at = updates.lastSyncAt;
  if (updates.lastSyncError !== undefined) updateData.last_sync_error = updates.lastSyncError;
  if (updates.webhookUrl !== undefined) updateData.webhook_url = updates.webhookUrl;
  if (updates.webhookSecret !== undefined) updateData.webhook_secret = updates.webhookSecret;

  if (updates.status === 'connected' && !updateData.connected_at) {
    updateData.connected_at = new Date().toISOString();
  }

  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .update(updateData)
    .eq('user_id', userId)
    .eq('id', connectionId)
    .select('*, booking_providers(*)')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Delete a provider connection
 */
async function deleteConnection(userId, connectionId) {
  const { error } = await supabaseAdmin
    .from('provider_connections')
    .delete()
    .eq('user_id', userId)
    .eq('id', connectionId);

  if (error) throw error;
  return true;
}

/**
 * Get an adapter instance for a provider
 */
function getAdapter(providerId, config) {
  const AdapterClass = PROVIDER_ADAPTERS[providerId];
  if (!AdapterClass) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return new AdapterClass(config);
}

/**
 * Get an adapter instance from a connection
 */
async function getAdapterFromConnection(connection) {
  const config = {
    accessToken: connection.access_token,
    refreshToken: connection.refresh_token,
    tokenExpiresAt: connection.token_expires_at ? new Date(connection.token_expires_at) : null,
    apiKey: connection.api_key,
    apiSecret: connection.api_secret,
    externalAccountId: connection.external_account_id,
    config: connection.config || {},
  };

  return getAdapter(connection.provider_id, config);
}

/**
 * Test a provider connection
 */
async function testConnection(userId, connectionId) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  const adapter = await getAdapterFromConnection(connection);
  const result = await adapter.testConnection();

  // Update connection status based on test result
  await updateConnection(userId, connectionId, {
    status: result.success ? 'connected' : 'error',
    errorMessage: result.error || null,
    externalAccountId: result.accountInfo?.id || connection.external_account_id,
    externalAccountName: result.accountInfo?.name || connection.external_account_name,
  });

  return result;
}

/**
 * Connect a provider using API key
 */
async function connectWithApiKey(userId, providerId, apiKey, apiSecret = null, config = {}) {
  // Check if connection already exists
  const existing = await getConnectionByProvider(userId, providerId);
  if (existing) {
    // Update existing connection with config included
    await updateConnection(userId, existing.id, {
      apiKey,
      apiSecret,
      config,
      status: 'pending',
    });
    // Test the connection after updating
    await testConnection(userId, existing.id);
    return getConnection(userId, existing.id);
  }

  // Create new connection with config included
  const connection = await createConnection(userId, providerId, {
    apiKey,
    apiSecret,
    config,
  });

  // Test the connection
  await testConnection(userId, connection.id);

  // Return updated connection
  return getConnection(userId, connection.id);
}

/**
 * Handle OAuth callback
 */
async function handleOAuthCallback(userId, providerId, code, redirectUri) {
  const provider = await getProvider(providerId);
  if (!provider) {
    throw new Error('Provider not found');
  }

  // Get the adapter to exchange the code for tokens
  const tempAdapter = getAdapter(providerId, {});

  // Exchange authorization code for tokens
  const tokens = await tempAdapter.exchangeCodeForTokens(code, redirectUri);

  // Check if connection already exists
  const existing = await getConnectionByProvider(userId, providerId);
  let connection;

  if (existing) {
    // Update existing connection
    connection = await updateConnection(userId, existing.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
      status: 'connected',
    });
  } else {
    // Create new connection
    connection = await createConnection(userId, providerId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    });
  }

  // Get account info and update connection
  const adapter = await getAdapterFromConnection(connection);
  const accountInfo = await adapter.getAccountInfo();

  connection = await updateConnection(userId, connection.id, {
    status: 'connected',
    externalAccountId: accountInfo.id,
    externalAccountName: accountInfo.name,
  });

  return connection;
}

/**
 * Get OAuth authorization URL
 */
async function getOAuthUrl(providerId, redirectUri, state) {
  // Handle Google Calendar specifically
  if (providerId === 'google_calendar') {
    return GoogleCalendarAdapter.getAuthUrl(redirectUri, state);
  }

  const provider = await getProvider(providerId);
  if (!provider || !provider.oauth_authorize_url) {
    throw new Error('Provider does not support OAuth');
  }

  const params = new URLSearchParams({
    client_id: process.env[`${providerId.toUpperCase()}_CLIENT_ID`] || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    state: state,
  });

  if (provider.oauth_scopes && provider.oauth_scopes.length > 0) {
    params.set('scope', provider.oauth_scopes.join(' '));
  }

  return `${provider.oauth_authorize_url}?${params.toString()}`;
}

/**
 * Sync bookings from a provider
 */
async function syncBookings(userId, connectionId, startDate, endDate) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (connection.status !== 'connected') {
    throw new Error('Provider is not connected');
  }

  const adapter = await getAdapterFromConnection(connection);
  const externalBookings = await adapter.getBookings(startDate, endDate);

  // Log the sync
  await logSync(connection.id, userId, {
    syncType: 'booking_sync',
    direction: 'inbound',
    status: 'success',
    responsePayload: { count: externalBookings.length },
  });

  // Update last sync time
  await updateConnection(userId, connectionId, {
    lastSyncAt: new Date().toISOString(),
    lastSyncError: null,
  });

  return externalBookings;
}

/**
 * Create a booking in an external provider
 */
async function createExternalBooking(userId, connectionId, bookingParams) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (connection.status !== 'connected') {
    throw new Error('Provider is not connected');
  }

  const adapter = await getAdapterFromConnection(connection);
  const externalBooking = await adapter.createBooking(bookingParams);

  // Log the sync
  await logSync(connection.id, userId, {
    syncType: 'booking_created',
    direction: 'outbound',
    status: 'success',
    externalId: externalBooking.externalId,
    requestPayload: bookingParams,
    responsePayload: externalBooking,
  });

  return externalBooking;
}

/**
 * Cancel a booking in an external provider
 */
async function cancelExternalBooking(userId, connectionId, externalBookingId, reason) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (connection.status !== 'connected') {
    throw new Error('Provider is not connected');
  }

  const adapter = await getAdapterFromConnection(connection);
  const result = await adapter.cancelBooking(externalBookingId, reason);

  // Log the sync
  await logSync(connection.id, userId, {
    syncType: 'booking_cancelled',
    direction: 'outbound',
    status: result.success ? 'success' : 'error',
    externalId: externalBookingId,
  });

  return result;
}

/**
 * Get availability from a provider
 */
async function getAvailability(userId, connectionId, eventTypeId, startDate, endDate) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (connection.status !== 'connected') {
    throw new Error('Provider is not connected');
  }

  const adapter = await getAdapterFromConnection(connection);
  return adapter.getAvailability(eventTypeId, startDate, endDate);
}

/**
 * Get event types from a provider
 */
async function getEventTypes(userId, connectionId) {
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }

  if (connection.status !== 'connected') {
    throw new Error('Provider is not connected');
  }

  const adapter = await getAdapterFromConnection(connection);
  return adapter.getEventTypes();
}

/**
 * Log a sync event
 */
async function logSync(connectionId, userId, logData) {
  const { data, error } = await supabaseAdmin
    .from('provider_sync_logs')
    .insert({
      connection_id: connectionId,
      user_id: userId,
      sync_type: logData.syncType,
      direction: logData.direction,
      status: logData.status,
      external_id: logData.externalId || null,
      internal_id: logData.internalId || null,
      request_payload: logData.requestPayload || null,
      response_payload: logData.responsePayload || null,
      error_details: logData.errorDetails || null,
      completed_at: new Date().toISOString(),
      duration_ms: logData.durationMs || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to log sync:', error);
  }
  return data;
}

/**
 * Get sync logs for a connection
 */
async function getSyncLogs(userId, connectionId, limit = 50) {
  const { data, error } = await supabaseAdmin
    .from('provider_sync_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('connection_id', connectionId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
}

/**
 * Set a provider connection as primary for booking operations
 * Only one connection can be primary per user
 */
async function setPrimaryProvider(userId, connectionId) {
  // First verify the connection belongs to this user and is connected
  const connection = await getConnection(userId, connectionId);
  if (!connection) {
    throw new Error('Connection not found');
  }
  if (connection.status !== 'connected') {
    throw new Error('Cannot set disconnected provider as primary');
  }

  // The database trigger will automatically unset other primary connections
  const { data, error } = await supabaseAdmin
    .from('provider_connections')
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', connectionId)
    .select('*, booking_providers(*)')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get the primary provider connection for a user
 * Returns the first connected provider if no primary is set
 */
async function getPrimaryConnection(userId) {
  // First try to get the primary connection
  const { data: primary, error: primaryError } = await supabaseAdmin
    .from('provider_connections')
    .select('*, booking_providers(*)')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .eq('is_primary', true)
    .single();

  if (!primaryError && primary) {
    return primary;
  }

  // Fallback to first connected provider
  const { data: fallback, error: fallbackError } = await supabaseAdmin
    .from('provider_connections')
    .select('*, booking_providers(*)')
    .eq('user_id', userId)
    .eq('status', 'connected')
    .order('connected_at', { ascending: true })
    .limit(1)
    .single();

  if (fallbackError && fallbackError.code !== 'PGRST116') {
    throw fallbackError;
  }

  return fallback || null;
}

module.exports = {
  // Provider management
  getProviders,
  getProvider,

  // Connection management
  getConnections,
  getConnection,
  getConnectionByProvider,
  createConnection,
  updateConnection,
  deleteConnection,

  // Adapter management
  getAdapter,
  getAdapterFromConnection,

  // Connection operations
  testConnection,
  connectWithApiKey,
  handleOAuthCallback,
  getOAuthUrl,

  // Primary provider
  setPrimaryProvider,
  getPrimaryConnection,

  // Booking operations
  syncBookings,
  createExternalBooking,
  cancelExternalBooking,
  getAvailability,
  getEventTypes,

  // Logging
  logSync,
  getSyncLogs,
};
