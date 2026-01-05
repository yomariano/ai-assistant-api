/**
 * Queue Manager Service
 * Handles content generation queue operations
 */

const { supabaseAdmin } = require('../supabase');
const seedDataManager = require('./seedDataManager');

// Retry delays in seconds (exponential backoff)
const RETRY_DELAYS = [60, 300, 900, 3600, 7200]; // 1min, 5min, 15min, 1hr, 2hr

/**
 * Get next items to process from the queue
 * @param {number} limit - Maximum items to return
 * @returns {Promise<Array>} Queue items ready for processing
 */
async function getNextItems(limit = 5) {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .select('*')
        .in('status', ['pending', 'failed'])
        .lte('next_retry_at', new Date().toISOString())
        .lt('attempts', 3) // max_attempts
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(limit);

    if (error) {
        throw new Error(`Failed to get queue items: ${error.message}`);
    }

    return data;
}

/**
 * Mark a queue item as processing
 * @param {string} queueId - Queue item ID
 * @returns {Promise<Object>} Updated queue item
 */
async function markAsProcessing(queueId) {
    // First get current attempts
    const { data: current } = await supabaseAdmin
        .from('content_generation_queue')
        .select('attempts')
        .eq('id', queueId)
        .single();

    const newAttempts = (current?.attempts || 0) + 1;

    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .update({
            status: 'processing',
            attempts: newAttempts,
            updated_at: new Date().toISOString()
        })
        .eq('id', queueId)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to mark as processing: ${error.message}`);
    }

    return data;
}

/**
 * Mark a queue item as completed
 * @param {string} queueId - Queue item ID
 * @param {string} resultPageId - ID of the generated page
 * @returns {Promise<Object>} Updated queue item
 */
async function markAsCompleted(queueId, resultPageId = null) {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .update({
            status: 'completed',
            result_page_id: resultPageId,
            completed_at: new Date().toISOString(),
            error_message: null,
            updated_at: new Date().toISOString()
        })
        .eq('id', queueId)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to mark as completed: ${error.message}`);
    }

    return data;
}

/**
 * Mark a queue item as failed with retry scheduling
 * @param {string} queueId - Queue item ID
 * @param {string} errorMessage - Error description
 * @returns {Promise<Object>} Updated queue item
 */
async function markAsFailed(queueId, errorMessage) {
    // First get current attempts
    const { data: current } = await supabaseAdmin
        .from('content_generation_queue')
        .select('attempts')
        .eq('id', queueId)
        .single();

    const attempts = current?.attempts || 0;
    const retryDelay = RETRY_DELAYS[Math.min(attempts, RETRY_DELAYS.length - 1)];
    const nextRetryAt = new Date(Date.now() + retryDelay * 1000).toISOString();

    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .update({
            status: 'failed',
            error_message: errorMessage,
            next_retry_at: nextRetryAt,
            updated_at: new Date().toISOString()
        })
        .eq('id', queueId)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to mark as failed: ${error.message}`);
    }

    return data;
}

/**
 * Mark a queue item as skipped (content already exists)
 * @param {string} queueId - Queue item ID
 * @param {string} reason - Reason for skipping
 * @returns {Promise<Object>} Updated queue item
 */
async function markAsSkipped(queueId, reason = 'Content already exists') {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .update({
            status: 'skipped',
            error_message: reason,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', queueId)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to mark as skipped: ${error.message}`);
    }

    return data;
}

/**
 * Add a single item to the queue
 * @param {Object} item - Queue item to add
 * @returns {Promise<Object>} Created queue item
 */
async function addToQueue({ contentType, locationSlug = null, industrySlug = null, priority = 5 }) {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .insert({
            content_type: contentType,
            location_slug: locationSlug,
            industry_slug: industrySlug,
            priority,
            status: 'pending',
            next_retry_at: new Date().toISOString()
        })
        .select()
        .single();

    if (error) {
        // Check if it's a duplicate
        if (error.code === '23505') {
            return { duplicate: true };
        }
        throw new Error(`Failed to add to queue: ${error.message}`);
    }

    return data;
}

/**
 * Populate queue from seed data
 * @param {Object} options - Options for population
 * @param {Array} options.contentTypes - Types to generate ('location', 'industry', 'combo')
 * @param {number} options.maxPriority - Only include items with priority <= this value
 * @returns {Promise<Object>} Results summary
 */
async function populateFromSeedData({ contentTypes = ['location', 'industry', 'combo'], maxPriority = 5 } = {}) {
    const results = {
        locations: 0,
        industries: 0,
        combos: 0,
        skipped: 0
    };

    const locations = await seedDataManager.getLocations({ activeOnly: true });
    const industries = await seedDataManager.getIndustries({ activeOnly: true });

    // Filter by priority
    const filteredLocations = locations.filter(l => l.priority <= maxPriority);
    const filteredIndustries = industries.filter(i => i.priority <= maxPriority);

    // Add location pages to queue
    if (contentTypes.includes('location')) {
        for (const location of filteredLocations) {
            const result = await addToQueue({
                contentType: 'location',
                locationSlug: location.slug,
                priority: location.priority
            });
            if (result.duplicate) {
                results.skipped++;
            } else {
                results.locations++;
            }
        }
    }

    // Add industry pages to queue
    if (contentTypes.includes('industry')) {
        for (const industry of filteredIndustries) {
            const result = await addToQueue({
                contentType: 'industry',
                industrySlug: industry.slug,
                priority: industry.priority
            });
            if (result.duplicate) {
                results.skipped++;
            } else {
                results.industries++;
            }
        }
    }

    // Add combo pages to queue
    if (contentTypes.includes('combo')) {
        for (const location of filteredLocations) {
            for (const industry of filteredIndustries) {
                // Combo priority is average of location and industry priority
                const comboPriority = Math.ceil((location.priority + industry.priority) / 2);
                const result = await addToQueue({
                    contentType: 'combo',
                    locationSlug: location.slug,
                    industrySlug: industry.slug,
                    priority: comboPriority
                });
                if (result.duplicate) {
                    results.skipped++;
                } else {
                    results.combos++;
                }
            }
        }
    }

    return results;
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue statistics
 */
async function getStats() {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .select('status, content_type');

    if (error) {
        throw new Error(`Failed to get queue stats: ${error.message}`);
    }

    const stats = {
        total: data.length,
        byStatus: {},
        byType: {},
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0
    };

    data.forEach(item => {
        // By status
        stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
        stats[item.status] = (stats[item.status] || 0) + 1;

        // By type
        stats.byType[item.content_type] = stats.byType[item.content_type] || {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            skipped: 0
        };
        stats.byType[item.content_type][item.status]++;
    });

    return stats;
}

/**
 * Clear completed items from queue (cleanup)
 * @param {number} olderThanDays - Clear items completed more than X days ago
 * @returns {Promise<number>} Number of items cleared
 */
async function clearCompleted(olderThanDays = 7) {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .delete()
        .in('status', ['completed', 'skipped'])
        .lt('completed_at', cutoffDate)
        .select();

    if (error) {
        throw new Error(`Failed to clear completed: ${error.message}`);
    }

    return data.length;
}

/**
 * Reset failed items for retry
 * @returns {Promise<number>} Number of items reset
 */
async function resetFailed() {
    const { data, error } = await supabaseAdmin
        .from('content_generation_queue')
        .update({
            status: 'pending',
            attempts: 0,
            error_message: null,
            next_retry_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('status', 'failed')
        .select();

    if (error) {
        throw new Error(`Failed to reset failed items: ${error.message}`);
    }

    return data.length;
}

module.exports = {
    getNextItems,
    markAsProcessing,
    markAsCompleted,
    markAsFailed,
    markAsSkipped,
    addToQueue,
    populateFromSeedData,
    getStats,
    clearCompleted,
    resetFailed
};
