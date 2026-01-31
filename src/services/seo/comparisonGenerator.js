/**
 * Comparison Page Generator Service
 * Handles comparison page generation and management
 */

const { supabaseAdmin } = require('../supabase');
const comparisonTemplates = require('./comparisonTemplates');
const axios = require('axios');
const https = require('https');

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://91.98.76.231:8787';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// Create https agent for self-signed certificates
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Call the Claude proxy API
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model to use
 * @returns {Promise<Object>} The generated content with metadata
 */
async function callClaudeAPI(prompt, model = 'haiku') {
    if (!CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY is not configured');
    }

    const startTime = Date.now();

    const response = await axios.post(
        `${CLAUDE_API_URL}/v1/claude`,
        { prompt, model },
        {
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': CLAUDE_API_KEY
            },
            httpsAgent: CLAUDE_API_URL.startsWith('https') ? httpsAgent : undefined,
            timeout: 120000
        }
    );

    const generationTime = Date.now() - startTime;

    return {
        content: response.data.result || response.data.response || response.data.content || response.data,
        generationTime,
        promptLength: prompt.length
    };
}

/**
 * Parse JSON from AI response
 * @param {string|Object} content - Raw AI response
 * @returns {Object} Parsed JSON
 */
function parseAIResponse(content) {
    if (typeof content === 'object' && content !== null) {
        return content;
    }

    if (typeof content !== 'string') {
        throw new Error(`Expected string content, got ${typeof content}`);
    }

    let jsonStr = content;

    // Remove markdown code blocks if present
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1];
    }

    // Try to find JSON object in the response
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        jsonStr = objectMatch[0];
    }

    try {
        return JSON.parse(jsonStr);
    } catch (error) {
        throw new Error(`Failed to parse AI response as JSON: ${error.message}`);
    }
}

/**
 * Validate comparison page content
 * @param {Object} content - Parsed content
 * @returns {Object} Validation result
 */
function validateComparisonContent(content) {
    const errors = [];

    if (!content.slug || !/^[a-z0-9-]+$/.test(content.slug)) {
        errors.push('Missing or invalid slug');
    }

    if (!content.title || content.title.length < 10) {
        errors.push('Missing or too short title');
    }

    if (!content.hero_title || content.hero_title.length < 20) {
        errors.push('Missing or too short hero_title');
    }

    if (!content.hero_subtitle || content.hero_subtitle.length < 50) {
        errors.push('Missing or too short hero_subtitle');
    }

    if (!Array.isArray(content.who_this_is_for) || content.who_this_is_for.length < 3) {
        errors.push('Missing or insufficient who_this_is_for (need at least 3)');
    }

    if (!Array.isArray(content.quick_take) || content.quick_take.length < 2) {
        errors.push('Missing or insufficient quick_take (need at least 2)');
    }

    if (!Array.isArray(content.when_voicefleet_wins) || content.when_voicefleet_wins.length < 2) {
        errors.push('Missing or insufficient when_voicefleet_wins (need at least 2)');
    }

    if (!Array.isArray(content.when_alternative_wins) || content.when_alternative_wins.length < 1) {
        errors.push('Missing when_alternative_wins (need at least 1)');
    }

    if (!Array.isArray(content.faq) || content.faq.length < 2) {
        errors.push('Missing or insufficient faq (need at least 2)');
    }

    if (!content.meta_title || content.meta_title.length > 70) {
        errors.push('Missing or too long meta_title (max 70 chars)');
    }

    if (!content.meta_description || content.meta_description.length > 160) {
        errors.push('Missing or too long meta_description (max 160 chars)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Generate a comparison page from alternative data
 * @param {Object} alternative - Alternative data from database
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated comparison content
 */
async function generateComparisonPage(alternative, options = {}) {
    const { model = 'haiku' } = options;

    const prompt = comparisonTemplates.getComparisonPrompt(alternative);

    const { content, generationTime, promptLength } = await callClaudeAPI(prompt, model);
    const parsedContent = parseAIResponse(content);

    const validation = validateComparisonContent(parsedContent);
    if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    console.log(`[Comparison Generator] Generated comparison: VoiceFleet vs ${alternative.name} (${generationTime}ms)`);

    return parsedContent;
}

/**
 * Publish a comparison page to database
 * @param {Object} content - Generated comparison content
 * @param {Object} options - Publishing options
 * @returns {Promise<Object>} Published comparison page
 */
async function publishComparisonPage(content, options = {}) {
    const { status = 'draft' } = options;

    const pageData = {
        slug: content.slug,
        alternative_name: content.alternative_name,
        alternative_slug: content.alternative_slug,
        title: content.title,
        description: content.description,
        hero_title: content.hero_title,
        hero_subtitle: content.hero_subtitle,
        who_this_is_for: content.who_this_is_for,
        quick_take: content.quick_take,
        when_voicefleet_wins: content.when_voicefleet_wins,
        when_alternative_wins: content.when_alternative_wins,
        feature_comparison: content.feature_comparison || [],
        faq: content.faq,
        detailed_comparison: content.detailed_comparison,
        meta_title: content.meta_title,
        meta_description: content.meta_description,
        status,
        published_at: status === 'published' ? new Date().toISOString() : null
    };

    const { data, error } = await supabaseAdmin
        .from('comparison_pages')
        .upsert(pageData, {
            onConflict: 'slug'
        })
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to publish comparison page: ${error.message}`);
    }

    // Update alternative last_generated_at
    await supabaseAdmin
        .from('comparison_alternatives')
        .update({ last_generated_at: new Date().toISOString() })
        .eq('slug', content.alternative_slug);

    return data;
}

/**
 * Get alternatives to generate comparisons for
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Alternatives
 */
async function getAlternativesToGenerate(options = {}) {
    const { maxPriority = 5, limit = 10 } = options;

    // Get alternatives that don't have comparison pages yet
    const { data: alternatives, error: altError } = await supabaseAdmin
        .from('comparison_alternatives')
        .select('*')
        .eq('is_active', true)
        .lte('priority', maxPriority)
        .order('priority', { ascending: true })
        .order('last_generated_at', { ascending: true, nullsFirst: true })
        .limit(limit);

    if (altError) {
        throw new Error(`Failed to get alternatives: ${altError.message}`);
    }

    // Filter out those that already have comparison pages
    const { data: existingPages, error: pageError } = await supabaseAdmin
        .from('comparison_pages')
        .select('alternative_slug');

    if (pageError) {
        throw new Error(`Failed to get existing pages: ${pageError.message}`);
    }

    const existingSlugs = new Set(existingPages?.map(p => p.alternative_slug) || []);

    return (alternatives || []).filter(alt => !existingSlugs.has(alt.slug));
}

/**
 * Get all comparison alternatives
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Alternatives
 */
async function getAlternatives(options = {}) {
    const { isActive = true, alternativeType = null, limit = 50 } = options;

    let query = supabaseAdmin
        .from('comparison_alternatives')
        .select('*')
        .order('priority', { ascending: true })
        .order('name', { ascending: true })
        .limit(limit);

    if (isActive !== null) {
        query = query.eq('is_active', isActive);
    }

    if (alternativeType) {
        query = query.eq('alternative_type', alternativeType);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get alternatives: ${error.message}`);
    }

    return data || [];
}

/**
 * Get comparison pages
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Comparison pages
 */
async function getComparisonPages(options = {}) {
    const { status = null, limit = 50 } = options;

    let query = supabaseAdmin
        .from('comparison_pages')
        .select('*')
        .order('alternative_name', { ascending: true })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get comparison pages: ${error.message}`);
    }

    return data || [];
}

/**
 * Get comparison page by slug
 * @param {string} slug - Page slug
 * @returns {Promise<Object|null>} Comparison page or null
 */
async function getComparisonPageBySlug(slug) {
    const { data, error } = await supabaseAdmin
        .from('comparison_pages')
        .select('*')
        .eq('slug', slug)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return null;
        }
        throw new Error(`Failed to get comparison page: ${error.message}`);
    }

    return data;
}

/**
 * Check if comparison page exists
 * @param {string} slug - Page slug
 * @returns {Promise<boolean>} True if exists
 */
async function comparisonPageExists(slug) {
    const { data, error } = await supabaseAdmin
        .from('comparison_pages')
        .select('id')
        .eq('slug', slug)
        .single();

    if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to check comparison page: ${error.message}`);
    }

    return !!data;
}

/**
 * Update comparison page status
 * @param {string} id - Page ID
 * @param {string} status - New status
 * @returns {Promise<Object>} Updated page
 */
async function updateComparisonPageStatus(id, status) {
    const updateData = { status };

    if (status === 'published') {
        updateData.published_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
        .from('comparison_pages')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        throw new Error(`Failed to update comparison page: ${error.message}`);
    }

    return data;
}

/**
 * Get comparison generation statistics
 * @returns {Promise<Object>} Statistics
 */
async function getComparisonStats() {
    const [alternatives, pages] = await Promise.all([
        supabaseAdmin
            .from('comparison_alternatives')
            .select('is_active, alternative_type, last_generated_at'),
        supabaseAdmin
            .from('comparison_pages')
            .select('status')
    ]);

    if (alternatives.error) {
        throw new Error(`Failed to get stats: ${alternatives.error.message}`);
    }

    const stats = {
        alternatives: {
            total: alternatives.data?.length || 0,
            active: alternatives.data?.filter(a => a.is_active).length || 0,
            neverGenerated: alternatives.data?.filter(a => !a.last_generated_at).length || 0,
            byType: {}
        },
        pages: {
            total: pages.data?.length || 0,
            byStatus: { draft: 0, published: 0, archived: 0 }
        }
    };

    alternatives.data?.forEach(alt => {
        const type = alt.alternative_type || 'unknown';
        stats.alternatives.byType[type] = (stats.alternatives.byType[type] || 0) + 1;
    });

    pages.data?.forEach(page => {
        stats.pages.byStatus[page.status] = (stats.pages.byStatus[page.status] || 0) + 1;
    });

    return stats;
}

module.exports = {
    generateComparisonPage,
    publishComparisonPage,
    getAlternativesToGenerate,
    getAlternatives,
    getComparisonPages,
    getComparisonPageBySlug,
    comparisonPageExists,
    updateComparisonPageStatus,
    getComparisonStats,
    validateComparisonContent
};
