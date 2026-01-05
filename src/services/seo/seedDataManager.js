/**
 * Seed Data Manager Service
 * Handles CRUD operations for SEO seed data (locations and industries)
 */

const { supabaseAdmin } = require('../supabase');

/**
 * Get all locations from seed data
 * @param {Object} options - Filter options
 * @param {boolean} options.activeOnly - Only return active items
 * @param {number} options.priority - Filter by priority (1-5)
 * @returns {Promise<Array>} List of locations
 */
async function getLocations({ activeOnly = true, priority = null } = {}) {
    let query = supabaseAdmin
        .from('seo_seed_data')
        .select('*')
        .eq('data_type', 'location')
        .order('priority', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    if (priority) {
        query = query.eq('priority', priority);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get locations: ${error.message}`);
    }

    return data;
}

/**
 * Get all industries from seed data
 * @param {Object} options - Filter options
 * @param {boolean} options.activeOnly - Only return active items
 * @param {number} options.priority - Filter by priority (1-5)
 * @returns {Promise<Array>} List of industries
 */
async function getIndustries({ activeOnly = true, priority = null } = {}) {
    let query = supabaseAdmin
        .from('seo_seed_data')
        .select('*')
        .eq('data_type', 'industry')
        .order('priority', { ascending: true })
        .order('name', { ascending: true });

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    if (priority) {
        query = query.eq('priority', priority);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get industries: ${error.message}`);
    }

    return data;
}

/**
 * Get a single seed data item by slug
 * @param {string} dataType - 'location' or 'industry'
 * @param {string} slug - The slug to look up
 * @returns {Promise<Object|null>} The seed data item or null
 */
async function getSeedItem(dataType, slug) {
    const { data, error } = await supabaseAdmin
        .from('seo_seed_data')
        .select('*')
        .eq('data_type', dataType)
        .eq('slug', slug)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw new Error(`Failed to get seed item: ${error.message}`);
    }

    return data;
}

/**
 * Add a new seed data item
 * @param {Object} item - The item to add
 * @param {string} item.dataType - 'location' or 'industry'
 * @param {string} item.slug - URL-friendly identifier
 * @param {string} item.name - Display name
 * @param {number} item.priority - Priority (1-5, lower is higher)
 * @param {Object} item.metadata - Additional metadata
 * @returns {Promise<Object>} The created item
 */
async function addSeedItem({ dataType, slug, name, priority = 5, metadata = {} }) {
    const { data, error } = await supabaseAdmin
        .from('seo_seed_data')
        .insert({
            data_type: dataType,
            slug,
            name,
            priority,
            metadata,
            is_active: true
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to add seed item: ${error.message}`);
    }

    return data;
}

/**
 * Bulk add seed data items
 * @param {Array} items - Array of items to add
 * @returns {Promise<Object>} Result with counts
 */
async function bulkAddSeedItems(items) {
    const formattedItems = items.map(item => ({
        data_type: item.dataType,
        slug: item.slug,
        name: item.name,
        priority: item.priority || 5,
        metadata: item.metadata || {},
        is_active: true
    }));

    const { data, error } = await supabaseAdmin
        .from('seo_seed_data')
        .upsert(formattedItems, {
            onConflict: 'data_type,slug',
            ignoreDuplicates: true
        })
        .select();

    if (error) {
        throw new Error(`Failed to bulk add seed items: ${error.message}`);
    }

    return {
        added: data.length,
        items: data
    };
}

/**
 * Update a seed data item
 * @param {string} dataType - 'location' or 'industry'
 * @param {string} slug - The slug to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} The updated item
 */
async function updateSeedItem(dataType, slug, updates) {
    const { data, error } = await supabaseAdmin
        .from('seo_seed_data')
        .update(updates)
        .eq('data_type', dataType)
        .eq('slug', slug)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update seed item: ${error.message}`);
    }

    return data;
}

/**
 * Deactivate a seed data item (soft delete)
 * @param {string} dataType - 'location' or 'industry'
 * @param {string} slug - The slug to deactivate
 * @returns {Promise<boolean>} Success status
 */
async function deactivateSeedItem(dataType, slug) {
    const { error } = await supabaseAdmin
        .from('seo_seed_data')
        .update({ is_active: false })
        .eq('data_type', dataType)
        .eq('slug', slug);

    if (error) {
        throw new Error(`Failed to deactivate seed item: ${error.message}`);
    }

    return true;
}

/**
 * Get seed data statistics
 * @returns {Promise<Object>} Statistics object
 */
async function getStats() {
    const { data: locations, error: locError } = await supabaseAdmin
        .from('seo_seed_data')
        .select('priority, is_active')
        .eq('data_type', 'location');

    const { data: industries, error: indError } = await supabaseAdmin
        .from('seo_seed_data')
        .select('priority, is_active')
        .eq('data_type', 'industry');

    if (locError || indError) {
        throw new Error('Failed to get seed data stats');
    }

    const countByPriority = (items) => {
        return items.reduce((acc, item) => {
            if (item.is_active) {
                acc[`priority_${item.priority}`] = (acc[`priority_${item.priority}`] || 0) + 1;
            }
            return acc;
        }, {});
    };

    return {
        locations: {
            total: locations.length,
            active: locations.filter(l => l.is_active).length,
            byPriority: countByPriority(locations)
        },
        industries: {
            total: industries.length,
            active: industries.filter(i => i.is_active).length,
            byPriority: countByPriority(industries)
        },
        potentialCombos: locations.filter(l => l.is_active).length * industries.filter(i => i.is_active).length
    };
}

module.exports = {
    getLocations,
    getIndustries,
    getSeedItem,
    addSeedItem,
    bulkAddSeedItems,
    updateSeedItem,
    deactivateSeedItem,
    getStats
};
