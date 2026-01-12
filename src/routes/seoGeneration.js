/**
 * SEO Content Generation Routes
 * Handles webhook triggers and admin operations for programmatic SEO
 */

const express = require('express');
const router = express.Router();
const {
    seedDataManager,
    queueManager,
    aiContentGenerator,
    contentPublisher
} = require('../services/seo');

// Secret for Cloudflare Worker authentication
const SEO_WORKER_SECRET = process.env.SEO_WORKER_SECRET;

/**
 * Middleware to verify worker secret
 */
function verifyWorkerSecret(req, res, next) {
    const secret = req.headers['x-worker-secret'];

    if (!SEO_WORKER_SECRET) {
        console.warn('SEO_WORKER_SECRET not configured');
        return res.status(500).json({ error: 'Server configuration error' });
    }

    if (secret !== SEO_WORKER_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
}

/**
 * POST /api/seo/webhook/generate
 * Webhook endpoint for Cloudflare Worker to trigger content generation
 */
router.post('/webhook/generate', verifyWorkerSecret, async (req, res) => {
    try {
        const { batch_size = 5 } = req.body;

        const results = {
            processed: 0,
            success: 0,
            failed: 0,
            skipped: 0,
            details: []
        };

        // Get next items from queue
        const queueItems = await queueManager.getNextItems(batch_size);

        if (queueItems.length === 0) {
            return res.json({
                message: 'No items to process',
                ...results
            });
        }

        // Process each item
        for (const item of queueItems) {
            results.processed++;

            try {
                // Mark as processing
                await queueManager.markAsProcessing(item.id);

                // Get seed data for context
                let locationData = null;
                let industryData = null;

                if (item.location_slug) {
                    locationData = await seedDataManager.getSeedItem('location', item.location_slug);
                }
                if (item.industry_slug) {
                    industryData = await seedDataManager.getSeedItem('industry', item.industry_slug);
                }

                // Check if content already exists
                let exists = false;
                if (item.content_type === 'location') {
                    exists = await contentPublisher.locationPageExists(item.location_slug);
                } else if (item.content_type === 'industry') {
                    exists = await contentPublisher.industryPageExists(item.industry_slug);
                } else if (item.content_type === 'combo') {
                    exists = await contentPublisher.comboPageExists(item.location_slug, item.industry_slug);
                }

                if (exists) {
                    await queueManager.markAsSkipped(item.id, 'Content already exists');
                    results.skipped++;
                    results.details.push({
                        type: item.content_type,
                        slug: item.location_slug || item.industry_slug,
                        status: 'skipped',
                        reason: 'Content already exists'
                    });
                    continue;
                }

                // Generate content
                let content;
                let publishedPage;

                if (item.content_type === 'location') {
                    content = await aiContentGenerator.generateLocationPage(
                        item.location_slug,
                        locationData.name,
                        locationData.metadata
                    );
                    publishedPage = await contentPublisher.publishLocationPage(
                        item.location_slug,
                        locationData.name,
                        content,
                        locationData.metadata
                    );
                } else if (item.content_type === 'industry') {
                    content = await aiContentGenerator.generateIndustryPage(
                        item.industry_slug,
                        industryData.name,
                        industryData.metadata
                    );
                    publishedPage = await contentPublisher.publishIndustryPage(
                        item.industry_slug,
                        industryData.name,
                        content
                    );
                } else if (item.content_type === 'combo') {
                    content = await aiContentGenerator.generateComboPage(
                        item.location_slug,
                        item.industry_slug,
                        locationData.name,
                        industryData.name,
                        locationData.metadata,
                        industryData.metadata
                    );
                    publishedPage = await contentPublisher.publishComboPage(
                        item.location_slug,
                        item.industry_slug,
                        locationData.name,
                        industryData.name,
                        content
                    );
                }

                // Mark as completed
                await queueManager.markAsCompleted(item.id, publishedPage.id);
                results.success++;
                results.details.push({
                    type: item.content_type,
                    slug: publishedPage.slug,
                    status: 'success',
                    pageId: publishedPage.id
                });

            } catch (error) {
                console.error(`Failed to process queue item ${item.id}:`, error);
                await queueManager.markAsFailed(item.id, error.message);
                results.failed++;
                results.details.push({
                    type: item.content_type,
                    slug: item.location_slug || item.industry_slug,
                    status: 'failed',
                    error: error.message
                });
            }
        }

        res.json({
            message: 'Batch processing complete',
            ...results
        });

    } catch (error) {
        console.error('Error in SEO generation webhook:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/seo/queue/stats
 * Get queue statistics
 */
router.get('/queue/stats', verifyWorkerSecret, async (req, res) => {
    try {
        const [queueStats, seedStats, publishedCounts, generationStats] = await Promise.all([
            queueManager.getStats(),
            seedDataManager.getStats(),
            contentPublisher.getPublishedCounts(),
            aiContentGenerator.getGenerationStats()
        ]);

        res.json({
            queue: queueStats,
            seedData: seedStats,
            published: publishedCounts,
            generation: generationStats
        });
    } catch (error) {
        console.error('Error getting queue stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/queue/populate
 * Populate queue from seed data
 */
router.post('/queue/populate', verifyWorkerSecret, async (req, res) => {
    try {
        const {
            contentTypes = ['location', 'industry', 'combo'],
            maxPriority = 5
        } = req.body;

        const results = await queueManager.populateFromSeedData({
            contentTypes,
            maxPriority
        });

        res.json({
            message: 'Queue populated successfully',
            ...results
        });
    } catch (error) {
        console.error('Error populating queue:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/queue/reset-failed
 * Reset failed items for retry
 */
router.post('/queue/reset-failed', verifyWorkerSecret, async (req, res) => {
    try {
        const count = await queueManager.resetFailed();
        res.json({
            message: `Reset ${count} failed items`,
            count
        });
    } catch (error) {
        console.error('Error resetting failed items:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/queue/clear-completed
 * Clear old completed items
 */
router.post('/queue/clear-completed', verifyWorkerSecret, async (req, res) => {
    try {
        const { olderThanDays = 7 } = req.body;
        const count = await queueManager.clearCompleted(olderThanDays);
        res.json({
            message: `Cleared ${count} completed items`,
            count
        });
    } catch (error) {
        console.error('Error clearing completed items:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/seo/logs
 * Get generation logs
 */
router.get('/logs', verifyWorkerSecret, async (req, res) => {
    try {
        const { limit = 100, status, contentType } = req.query;
        const logs = await aiContentGenerator.getLogs({
            limit: parseInt(limit),
            status,
            contentType
        });
        res.json(logs);
    } catch (error) {
        console.error('Error getting logs:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/seed/bulk
 * Bulk add seed data
 */
router.post('/seed/bulk', verifyWorkerSecret, async (req, res) => {
    try {
        const { items } = req.body;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Items array is required' });
        }

        const results = await seedDataManager.bulkAddSeedItems(items);
        res.json({
            message: 'Seed data added successfully',
            ...results
        });
    } catch (error) {
        console.error('Error adding seed data:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/seo/seed/locations
 * Get all locations
 */
router.get('/seed/locations', verifyWorkerSecret, async (req, res) => {
    try {
        const { priority, activeOnly = true } = req.query;
        const locations = await seedDataManager.getLocations({
            priority: priority ? parseInt(priority) : null,
            activeOnly: activeOnly !== 'false'
        });
        res.json(locations);
    } catch (error) {
        console.error('Error getting locations:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/seo/seed/industries
 * Get all industries
 */
router.get('/seed/industries', verifyWorkerSecret, async (req, res) => {
    try {
        const { priority, activeOnly = true } = req.query;
        const industries = await seedDataManager.getIndustries({
            priority: priority ? parseInt(priority) : null,
            activeOnly: activeOnly !== 'false'
        });
        res.json(industries);
    } catch (error) {
        console.error('Error getting industries:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/generate/single
 * Generate a single page (for testing)
 */
router.post('/generate/single', verifyWorkerSecret, async (req, res) => {
    try {
        const { contentType, locationSlug, industrySlug } = req.body;

        if (!contentType) {
            return res.status(400).json({ error: 'contentType is required' });
        }

        let locationData = null;
        let industryData = null;

        if (locationSlug) {
            locationData = await seedDataManager.getSeedItem('location', locationSlug);
            if (!locationData) {
                return res.status(404).json({ error: `Location ${locationSlug} not found` });
            }
        }

        if (industrySlug) {
            industryData = await seedDataManager.getSeedItem('industry', industrySlug);
            if (!industryData) {
                return res.status(404).json({ error: `Industry ${industrySlug} not found` });
            }
        }

        let content;
        let publishedPage;

        if (contentType === 'location') {
            if (!locationSlug) {
                return res.status(400).json({ error: 'locationSlug is required for location pages' });
            }
            content = await aiContentGenerator.generateLocationPage(
                locationSlug,
                locationData.name,
                locationData.metadata
            );
            publishedPage = await contentPublisher.publishLocationPage(
                locationSlug,
                locationData.name,
                content,
                locationData.metadata
            );
        } else if (contentType === 'industry') {
            if (!industrySlug) {
                return res.status(400).json({ error: 'industrySlug is required for industry pages' });
            }
            content = await aiContentGenerator.generateIndustryPage(
                industrySlug,
                industryData.name,
                industryData.metadata
            );
            publishedPage = await contentPublisher.publishIndustryPage(
                industrySlug,
                industryData.name,
                content
            );
        } else if (contentType === 'combo') {
            if (!locationSlug || !industrySlug) {
                return res.status(400).json({ error: 'Both locationSlug and industrySlug are required for combo pages' });
            }
            content = await aiContentGenerator.generateComboPage(
                locationSlug,
                industrySlug,
                locationData.name,
                industryData.name,
                locationData.metadata,
                industryData.metadata
            );
            publishedPage = await contentPublisher.publishComboPage(
                locationSlug,
                industrySlug,
                locationData.name,
                industryData.name,
                content
            );
        } else {
            return res.status(400).json({ error: `Invalid contentType: ${contentType}` });
        }

        res.json({
            message: 'Page generated successfully',
            content,
            page: publishedPage
        });

    } catch (error) {
        console.error('Error generating single page:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/seo/proxy-claude
 * Proxy Claude API requests from Cloudflare Worker (handles self-signed SSL)
 */
router.post('/proxy-claude', verifyWorkerSecret, async (req, res) => {
    try {
        const { prompt, model = 'haiku' } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'prompt is required' });
        }

        const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'https://116.203.117.211:2086';
        const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

        if (!CLAUDE_API_KEY) {
            return res.status(500).json({ error: 'CLAUDE_API_KEY not configured' });
        }

        // Use axios for better control over SSL certificate validation
        const axios = require('axios');
        const https = require('https');

        const httpsAgent = new https.Agent({
            rejectUnauthorized: false // Allow self-signed certificates
        });

        const response = await axios.post(
            `${CLAUDE_API_URL}/v1/claude`,
            { prompt, model },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': CLAUDE_API_KEY
                },
                httpsAgent: CLAUDE_API_URL.startsWith('https') ? httpsAgent : undefined,
                timeout: 60000
            }
        );

        res.json(response.data);

    } catch (error) {
        console.error('Claude proxy error:', error.response?.data || error.message);
        const status = error.response?.status || 500;
        const message = error.response?.data?.error || error.message;
        res.status(status).json({ error: message });
    }
});

module.exports = router;
