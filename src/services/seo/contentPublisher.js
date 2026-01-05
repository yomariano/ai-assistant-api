/**
 * Content Publisher Service
 * Publishes generated content to the appropriate database tables
 */

const { supabaseAdmin } = require('../supabase');

/**
 * Publish a location page to location_pages table
 * @param {string} slug - Location slug
 * @param {string} cityName - City display name
 * @param {Object} content - Generated content
 * @param {Object} metadata - Location metadata
 * @returns {Promise<Object>} Published page
 */
async function publishLocationPage(slug, cityName, content, metadata = {}) {
    const pageData = {
        slug,
        city_name: cityName,
        state_code: metadata.county || null,
        country_code: 'IE',
        headline: content.headline,
        subheadline: content.subheadline,
        local_description: content.local_description,
        local_benefits: content.local_benefits,
        local_stats: content.local_stats,
        local_testimonial: content.local_testimonial,
        nearby_locations: content.nearby_locations || [],
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        latitude: metadata.latitude || null,
        longitude: metadata.longitude || null,
        status: 'published',
        published_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
        .from('location_pages')
        .upsert(pageData, {
            onConflict: 'slug'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to publish location page: ${error.message}`);
    }

    return data;
}

/**
 * Publish an industry page to use_case_pages table
 * @param {string} slug - Industry slug
 * @param {string} industryName - Industry display name
 * @param {Object} content - Generated content
 * @returns {Promise<Object>} Published page
 */
async function publishIndustryPage(slug, industryName, content) {
    const pageData = {
        slug,
        industry_name: industryName,
        headline: content.headline,
        subheadline: content.subheadline,
        problem_statement: content.problem_statement,
        solution_description: content.solution_description,
        benefits: content.benefits,
        use_cases: content.use_cases,
        testimonial: content.testimonial,
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        related_locations: content.related_industries || [],
        status: 'published',
        published_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
        .from('use_case_pages')
        .upsert(pageData, {
            onConflict: 'slug'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to publish industry page: ${error.message}`);
    }

    return data;
}

/**
 * Publish a combo page to combo_pages table
 * @param {string} locationSlug - Location slug
 * @param {string} industrySlug - Industry slug
 * @param {string} cityName - City display name
 * @param {string} industryName - Industry display name
 * @param {Object} content - Generated content
 * @returns {Promise<Object>} Published page
 */
async function publishComboPage(locationSlug, industrySlug, cityName, industryName, content) {
    const slug = `${industrySlug}-${locationSlug}`;

    const pageData = {
        slug,
        location_slug: locationSlug,
        industry_slug: industrySlug,
        city_name: cityName,
        industry_name: industryName,
        headline: content.headline,
        subheadline: content.subheadline,
        content: {
            intro: content.intro,
            why_need: content.why_need,
            local_industry_context: content.local_industry_context,
            benefits: content.benefits,
            local_stats: content.local_stats,
            case_study: content.case_study,
            faq: content.faq,
            cta_text: content.cta_text
        },
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        related_locations: content.related_locations || [],
        related_industries: content.related_industries || [],
        status: 'published',
        published_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
        .from('combo_pages')
        .upsert(pageData, {
            onConflict: 'slug'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to publish combo page: ${error.message}`);
    }

    return data;
}

/**
 * Check if a location page already exists
 * @param {string} slug - Location slug
 * @returns {Promise<boolean>} True if exists
 */
async function locationPageExists(slug) {
    const { data, error } = await supabaseAdmin
        .from('location_pages')
        .select('id')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to check location page: ${error.message}`);
    }

    return !!data;
}

/**
 * Check if an industry page already exists
 * @param {string} slug - Industry slug
 * @returns {Promise<boolean>} True if exists
 */
async function industryPageExists(slug) {
    const { data, error } = await supabaseAdmin
        .from('use_case_pages')
        .select('id')
        .eq('slug', slug)
        .eq('status', 'published')
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to check industry page: ${error.message}`);
    }

    return !!data;
}

/**
 * Check if a combo page already exists
 * @param {string} locationSlug - Location slug
 * @param {string} industrySlug - Industry slug
 * @returns {Promise<boolean>} True if exists
 */
async function comboPageExists(locationSlug, industrySlug) {
    const { data, error } = await supabaseAdmin
        .from('combo_pages')
        .select('id')
        .eq('location_slug', locationSlug)
        .eq('industry_slug', industrySlug)
        .eq('status', 'published')
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to check combo page: ${error.message}`);
    }

    return !!data;
}

/**
 * Get published content counts
 * @returns {Promise<Object>} Content counts
 */
async function getPublishedCounts() {
    const [locations, industries, combos] = await Promise.all([
        supabaseAdmin
            .from('location_pages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published'),
        supabaseAdmin
            .from('use_case_pages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published'),
        supabaseAdmin
            .from('combo_pages')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'published')
    ]);

    return {
        locations: locations.count || 0,
        industries: industries.count || 0,
        combos: combos.count || 0,
        total: (locations.count || 0) + (industries.count || 0) + (combos.count || 0)
    };
}

/**
 * Unpublish a page (set to draft)
 * @param {string} table - Table name
 * @param {string} slug - Page slug
 * @returns {Promise<boolean>} Success status
 */
async function unpublishPage(table, slug) {
    const { error } = await supabaseAdmin
        .from(table)
        .update({
            status: 'draft',
            published_at: null
        })
        .eq('slug', slug);

    if (error) {
        throw new Error(`Failed to unpublish page: ${error.message}`);
    }

    return true;
}

/**
 * Get all combo pages for a location
 * @param {string} locationSlug - Location slug
 * @returns {Promise<Array>} Combo pages
 */
async function getCombosByLocation(locationSlug) {
    const { data, error } = await supabaseAdmin
        .from('combo_pages')
        .select('*')
        .eq('location_slug', locationSlug)
        .eq('status', 'published')
        .order('industry_name', { ascending: true });

    if (error) {
        throw new Error(`Failed to get combos by location: ${error.message}`);
    }

    return data;
}

/**
 * Get all combo pages for an industry
 * @param {string} industrySlug - Industry slug
 * @returns {Promise<Array>} Combo pages
 */
async function getCombosByIndustry(industrySlug) {
    const { data, error } = await supabaseAdmin
        .from('combo_pages')
        .select('*')
        .eq('industry_slug', industrySlug)
        .eq('status', 'published')
        .order('city_name', { ascending: true });

    if (error) {
        throw new Error(`Failed to get combos by industry: ${error.message}`);
    }

    return data;
}

module.exports = {
    publishLocationPage,
    publishIndustryPage,
    publishComboPage,
    locationPageExists,
    industryPageExists,
    comboPageExists,
    getPublishedCounts,
    unpublishPage,
    getCombosByLocation,
    getCombosByIndustry
};
