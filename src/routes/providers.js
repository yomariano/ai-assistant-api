const express = require('express');
const { authenticate } = require('../middleware/auth');
const providerService = require('../services/providers');
const { syncBookingToolsToAssistant } = require('../services/assistant');

const router = express.Router();

// =====================================================
// Provider Catalog
// =====================================================

/**
 * GET /api/providers
 * List all available booking providers
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const providers = await providerService.getProviders();

    res.json({
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        icon: p.icon,
        category: p.category,
        websiteUrl: p.website_url,
        docsUrl: p.docs_url,
        authType: p.auth_type,
        features: {
          availabilitySync: p.supports_availability_sync,
          bookingCreate: p.supports_booking_create,
          bookingUpdate: p.supports_booking_update,
          bookingCancel: p.supports_booking_cancel,
          webhooks: p.supports_webhooks,
        },
        isActive: p.is_active,
        isBeta: p.is_beta,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/:id
 * Get a specific provider
 */
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const provider = await providerService.getProvider(req.params.id);

    if (!provider) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }

    res.json({
      provider: {
        id: provider.id,
        name: provider.name,
        description: provider.description,
        icon: provider.icon,
        category: provider.category,
        websiteUrl: provider.website_url,
        docsUrl: provider.docs_url,
        authType: provider.auth_type,
        oauthScopes: provider.oauth_scopes,
        features: {
          availabilitySync: provider.supports_availability_sync,
          bookingCreate: provider.supports_booking_create,
          bookingUpdate: provider.supports_booking_update,
          bookingCancel: provider.supports_booking_cancel,
          webhooks: provider.supports_webhooks,
        },
        isActive: provider.is_active,
        isBeta: provider.is_beta,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Provider Connections
// =====================================================

/**
 * GET /api/providers/connections
 * List user's provider connections
 */
router.get('/connections/list', authenticate, async (req, res, next) => {
  try {
    const connections = await providerService.getConnections(req.userId);

    res.json({
      connections: connections.map(c => ({
        id: c.id,
        providerId: c.provider_id,
        provider: c.booking_providers ? {
          name: c.booking_providers.name,
          icon: c.booking_providers.icon,
          category: c.booking_providers.category,
        } : null,
        status: c.status,
        isPrimary: c.is_primary || false,
        errorMessage: c.error_message,
        externalAccountId: c.external_account_id,
        externalAccountName: c.external_account_name,
        syncEnabled: c.sync_enabled,
        syncDirection: c.sync_direction,
        lastSyncAt: c.last_sync_at,
        lastSyncError: c.last_sync_error,
        connectedAt: c.connected_at,
        createdAt: c.created_at,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/connections/:id
 * Get a specific connection
 */
router.get('/connections/:id', authenticate, async (req, res, next) => {
  try {
    const connection = await providerService.getConnection(req.userId, req.params.id);

    if (!connection) {
      return res.status(404).json({ error: { message: 'Connection not found' } });
    }

    res.json({
      connection: {
        id: connection.id,
        providerId: connection.provider_id,
        provider: connection.booking_providers ? {
          name: connection.booking_providers.name,
          icon: connection.booking_providers.icon,
          category: connection.booking_providers.category,
          authType: connection.booking_providers.auth_type,
        } : null,
        status: connection.status,
        isPrimary: connection.is_primary || false,
        errorMessage: connection.error_message,
        externalAccountId: connection.external_account_id,
        externalAccountName: connection.external_account_name,
        config: connection.config,
        syncEnabled: connection.sync_enabled,
        syncDirection: connection.sync_direction,
        lastSyncAt: connection.last_sync_at,
        lastSyncError: connection.last_sync_error,
        connectedAt: connection.connected_at,
        createdAt: connection.created_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/providers/connections
 * Create a new connection (API key auth)
 */
router.post('/connections', authenticate, async (req, res, next) => {
  try {
    const { providerId, apiKey, apiSecret, config } = req.body;

    if (!providerId) {
      return res.status(400).json({ error: { message: 'Provider ID is required' } });
    }

    // Check if provider exists
    const provider = await providerService.getProvider(providerId);
    if (!provider) {
      return res.status(404).json({ error: { message: 'Provider not found' } });
    }

    // For API key auth, require the key
    if (provider.auth_type === 'api_key' && !apiKey) {
      return res.status(400).json({ error: { message: 'API key is required for this provider' } });
    }

    // Pass config directly to connectWithApiKey so it's available during initial test
    const connection = await providerService.connectWithApiKey(
      req.userId,
      providerId,
      apiKey,
      apiSecret,
      config || {}
    );

    // Get fresh connection with provider details
    const fullConnection = await providerService.getConnection(req.userId, connection.id);

    // Sync booking tools to assistant now that provider is connected
    try {
      await syncBookingToolsToAssistant(req.userId);
      console.log(`[Providers] Synced booking tools for user ${req.userId} after connection`);
    } catch (syncError) {
      console.error('[Providers] Failed to sync booking tools:', syncError.message);
      // Don't fail the request, just log the error
    }

    res.status(201).json({
      success: true,
      connection: {
        id: fullConnection.id,
        providerId: fullConnection.provider_id,
        status: fullConnection.status,
        errorMessage: fullConnection.error_message,
        externalAccountId: fullConnection.external_account_id,
        externalAccountName: fullConnection.external_account_name,
        connectedAt: fullConnection.connected_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/providers/connections/:id
 * Update a connection
 */
router.patch('/connections/:id', authenticate, async (req, res, next) => {
  try {
    const { syncEnabled, syncDirection, config } = req.body;

    const updates = {};
    if (syncEnabled !== undefined) updates.syncEnabled = syncEnabled;
    if (syncDirection !== undefined) updates.syncDirection = syncDirection;
    if (config !== undefined) updates.config = config;

    const connection = await providerService.updateConnection(
      req.userId,
      req.params.id,
      updates
    );

    res.json({
      success: true,
      connection: {
        id: connection.id,
        syncEnabled: connection.sync_enabled,
        syncDirection: connection.sync_direction,
        config: connection.config,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/providers/connections/:id
 * Delete a connection
 */
router.delete('/connections/:id', authenticate, async (req, res, next) => {
  try {
    await providerService.deleteConnection(req.userId, req.params.id);

    // Sync booking tools to assistant (remove tools if no more connected providers)
    try {
      await syncBookingToolsToAssistant(req.userId);
      console.log(`[Providers] Synced booking tools for user ${req.userId} after disconnection`);
    } catch (syncError) {
      console.error('[Providers] Failed to sync booking tools:', syncError.message);
      // Don't fail the request, just log the error
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/providers/connections/:id/test
 * Test a connection
 */
router.post('/connections/:id/test', authenticate, async (req, res, next) => {
  try {
    const result = await providerService.testConnection(req.userId, req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/providers/connections/:id/set-primary
 * Set a connection as the primary booking provider
 */
router.post('/connections/:id/set-primary', authenticate, async (req, res, next) => {
  try {
    const connection = await providerService.setPrimaryProvider(req.userId, req.params.id);

    res.json({
      success: true,
      connection: {
        id: connection.id,
        providerId: connection.provider_id,
        isPrimary: connection.is_primary,
        provider: connection.booking_providers ? {
          name: connection.booking_providers.name,
          icon: connection.booking_providers.icon,
        } : null,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/connections/primary
 * Get the user's primary booking provider connection
 */
router.get('/connections/primary', authenticate, async (req, res, next) => {
  try {
    const connection = await providerService.getPrimaryConnection(req.userId);

    if (!connection) {
      return res.json({ connection: null });
    }

    res.json({
      connection: {
        id: connection.id,
        providerId: connection.provider_id,
        provider: connection.booking_providers ? {
          name: connection.booking_providers.name,
          icon: connection.booking_providers.icon,
          category: connection.booking_providers.category,
        } : null,
        status: connection.status,
        isPrimary: connection.is_primary,
        externalAccountId: connection.external_account_id,
        externalAccountName: connection.external_account_name,
        connectedAt: connection.connected_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// OAuth Flow
// =====================================================

/**
 * GET /api/providers/:providerId/oauth/url
 * Get OAuth authorization URL
 */
router.get('/:providerId/oauth/url', authenticate, async (req, res, next) => {
  try {
    const { redirectUri } = req.query;

    if (!redirectUri) {
      return res.status(400).json({ error: { message: 'Redirect URI is required' } });
    }

    // Generate state token for CSRF protection
    const state = Buffer.from(JSON.stringify({
      userId: req.userId,
      providerId: req.params.providerId,
      timestamp: Date.now(),
    })).toString('base64url');

    const url = await providerService.getOAuthUrl(
      req.params.providerId,
      redirectUri,
      state
    );

    res.json({ url, state });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/:providerId/oauth/callback
 * Handle OAuth callback redirect from provider (e.g., Google)
 * This is used when the provider redirects directly to the backend
 */
router.get('/:providerId/oauth/callback', async (req, res) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';

    if (oauthError) {
      console.error(`[OAuth] Error from provider: ${oauthError} - ${error_description}`);
      return res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent(error_description || oauthError)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent('Missing authorization code or state')}`);
    }

    // Decode state to get user ID and provider ID
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch {
      return res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent('Invalid state token')}`);
    }

    const { userId, providerId } = stateData;

    if (providerId !== req.params.providerId) {
      return res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent('Provider mismatch')}`);
    }

    // Build the redirect URI that was used for the OAuth flow
    const redirectUri = `${process.env.API_URL || 'http://localhost:3000'}/api/providers/${providerId}/oauth/callback`;

    // Exchange the code for tokens and create the connection
    const connection = await providerService.handleOAuthCallback(
      userId,
      providerId,
      code,
      redirectUri
    );

    // Sync booking tools to assistant now that provider is connected via OAuth
    try {
      await syncBookingToolsToAssistant(userId);
      console.log(`[Providers] Synced booking tools for user ${userId} after OAuth connection`);
    } catch (syncError) {
      console.error('[Providers] Failed to sync booking tools:', syncError.message);
    }

    // Redirect to frontend with success
    res.redirect(`${frontendUrl}/integrations?provider=${providerId}&success=true`);
  } catch (error) {
    console.error('[OAuth] Callback error:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    res.redirect(`${frontendUrl}/integrations?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * POST /api/providers/:providerId/oauth/callback
 * Handle OAuth callback (alternative method for frontend-initiated flows)
 */
router.post('/:providerId/oauth/callback', authenticate, async (req, res, next) => {
  console.log('[OAuth Callback] POST received:', {
    providerId: req.params.providerId,
    hasCode: !!req.body.code,
    hasState: !!req.body.state,
    redirectUri: req.body.redirectUri,
  });

  try {
    const { code, state, redirectUri } = req.body;

    if (!code) {
      return res.status(400).json({ error: { message: 'Authorization code is required' } });
    }

    // Verify state token
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString());
        if (stateData.userId !== req.userId) {
          return res.status(400).json({ error: { message: 'Invalid state token' } });
        }
      } catch {
        return res.status(400).json({ error: { message: 'Invalid state token' } });
      }
    }

    const connection = await providerService.handleOAuthCallback(
      req.userId,
      req.params.providerId,
      code,
      redirectUri
    );

    // Sync booking tools to assistant now that provider is connected via OAuth
    try {
      await syncBookingToolsToAssistant(req.userId);
      console.log(`[Providers] Synced booking tools for user ${req.userId} after OAuth connection`);
    } catch (syncError) {
      console.error('[Providers] Failed to sync booking tools:', syncError.message);
      // Don't fail the request, just log the error
    }

    res.json({
      success: true,
      connection: {
        id: connection.id,
        providerId: connection.provider_id,
        status: connection.status,
        externalAccountId: connection.external_account_id,
        externalAccountName: connection.external_account_name,
        connectedAt: connection.connected_at,
      },
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Provider Operations
// =====================================================

/**
 * GET /api/providers/connections/:id/event-types
 * Get event types from a connected provider
 */
router.get('/connections/:id/event-types', authenticate, async (req, res, next) => {
  try {
    const eventTypes = await providerService.getEventTypes(req.userId, req.params.id);
    res.json({ eventTypes });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/connections/:id/availability
 * Get availability from a connected provider
 */
router.get('/connections/:id/availability', authenticate, async (req, res, next) => {
  try {
    const { eventTypeId, startDate, endDate } = req.query;

    if (!eventTypeId || !startDate || !endDate) {
      return res.status(400).json({
        error: { message: 'eventTypeId, startDate, and endDate are required' },
      });
    }

    const slots = await providerService.getAvailability(
      req.userId,
      req.params.id,
      eventTypeId,
      startDate,
      endDate
    );

    res.json({ slots });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/providers/connections/:id/sync
 * Sync bookings from a provider
 */
router.post('/connections/:id/sync', authenticate, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.body;

    const bookings = await providerService.syncBookings(
      req.userId,
      req.params.id,
      startDate,
      endDate
    );

    res.json({
      success: true,
      bookings,
      count: bookings.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/providers/connections/:id/bookings
 * Create a booking in a provider
 */
router.post('/connections/:id/bookings', authenticate, async (req, res, next) => {
  try {
    const booking = await providerService.createExternalBooking(
      req.userId,
      req.params.id,
      req.body
    );

    res.status(201).json({
      success: true,
      booking,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/providers/connections/:id/bookings/:bookingId
 * Cancel a booking in a provider
 */
router.delete('/connections/:id/bookings/:bookingId', authenticate, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const result = await providerService.cancelExternalBooking(
      req.userId,
      req.params.id,
      req.params.bookingId,
      reason
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/providers/connections/:id/logs
 * Get sync logs for a connection
 */
router.get('/connections/:id/logs', authenticate, async (req, res, next) => {
  try {
    const { limit } = req.query;

    const logs = await providerService.getSyncLogs(
      req.userId,
      req.params.id,
      parseInt(limit) || 50
    );

    res.json({
      logs: logs.map(l => ({
        id: l.id,
        syncType: l.sync_type,
        direction: l.direction,
        status: l.status,
        externalId: l.external_id,
        internalId: l.internal_id,
        errorDetails: l.error_details,
        startedAt: l.started_at,
        completedAt: l.completed_at,
        durationMs: l.duration_ms,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// Webhooks
// =====================================================

/**
 * POST /api/providers/webhooks/:providerId
 * Handle incoming webhooks from providers
 */
router.post('/webhooks/:providerId', async (req, res, next) => {
  try {
    const providerId = req.params.providerId;
    const signature = req.headers['x-webhook-signature'] ||
                     req.headers['x-signature'] ||
                     req.headers['calendly-webhook-signature'] ||
                     req.headers['x-square-signature'];

    // Get the raw body for signature verification
    const rawBody = JSON.stringify(req.body);

    // Find connections for this provider that have webhook enabled
    // In production, you'd want to route based on webhook URL or lookup
    console.log(`Received webhook for provider: ${providerId}`);

    // Parse the webhook payload
    const adapter = providerService.getAdapter(providerId, {});
    const parsed = await adapter.parseWebhookPayload(req.body);

    console.log(`Webhook event: ${parsed.eventType}`, parsed.booking?.externalId);

    // Acknowledge receipt
    res.json({ received: true });

    // Process the webhook asynchronously
    // In production, you'd queue this for processing
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to prevent retries for malformed webhooks
    res.json({ received: true, error: error.message });
  }
});

module.exports = router;
