/**
 * Blog Content Generator Service
 * Handles blog post generation using Claude proxy API
 */

const { supabaseAdmin } = require('../supabase');
const blogTemplates = require('./blogTemplates');
const crypto = require('crypto');

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://91.98.76.231:8787';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

/**
 * Call the Claude proxy API
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model to use (default: 'haiku' for cost efficiency)
 * @returns {Promise<Object>} The generated content with metadata
 */
async function callClaudeAPI(prompt, model = 'haiku') {
    if (!CLAUDE_API_KEY) {
        throw new Error('CLAUDE_API_KEY is not configured');
    }

    const startTime = Date.now();

    const response = await fetch(`${CLAUDE_API_URL}/prompt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': CLAUDE_API_KEY
        },
        body: JSON.stringify({ prompt, model })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    const generationTime = Date.now() - startTime;

    return {
        content: result.result || result.response || result.content || result,
        generationTime,
        promptLength: prompt.length
    };
}

/**
 * Parse JSON from AI response, handling common issues
 * @param {string|Object} content - Raw AI response
 * @returns {Object} Parsed JSON
 */
function parseAIResponse(content) {
    // If content is already an object, return it
    if (typeof content === 'object' && content !== null) {
        return content;
    }

    // Ensure content is a string
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
        throw new Error(`Failed to parse AI response as JSON: ${error.message}. Content: ${jsonStr.substring(0, 200)}`);
    }
}

/**
 * Generate MD5 hash of title for duplicate detection
 * @param {string} title - Blog title
 * @returns {string} MD5 hash
 */
function generateTitleHash(title) {
    return crypto.createHash('md5').update(title.toLowerCase().trim()).digest('hex');
}

/**
 * Check if a similar blog post already exists
 * @param {string} title - Blog title to check
 * @returns {Promise<boolean>} True if similar post exists
 */
async function checkDuplicateTitle(title) {
    const titleHash = generateTitleHash(title);

    const { data, error } = await supabaseAdmin
        .from('blog_generation_history')
        .select('id')
        .eq('title_hash', titleHash)
        .eq('status', 'success')
        .limit(1);

    if (error && error.code !== 'PGRST116') {
        console.error('Error checking duplicate title:', error);
    }

    return data && data.length > 0;
}

/**
 * Validate generated blog content structure
 * @param {Object} content - Parsed content
 * @returns {Object} Validation result
 */
function validateBlogContent(content) {
    const errors = [];

    // Required fields
    if (!content.title || content.title.length < 10 || content.title.length > 100) {
        errors.push('Missing or invalid title (10-100 chars required)');
    }

    if (!content.slug || !/^[a-z0-9-]+$/.test(content.slug)) {
        errors.push('Missing or invalid slug (lowercase alphanumeric with hyphens)');
    }

    if (!content.excerpt || content.excerpt.length < 50) {
        errors.push('Missing or too short excerpt (min 50 chars)');
    }

    if (!content.content || content.content.length < 500) {
        errors.push('Missing or too short content (min 500 chars)');
    }

    if (!content.category) {
        errors.push('Missing category');
    }

    if (!content.meta_title || content.meta_title.length > 70) {
        errors.push('Missing or too long meta_title (max 70 chars)');
    }

    if (!content.meta_description || content.meta_description.length > 160) {
        errors.push('Missing or too long meta_description (max 160 chars)');
    }

    if (!Array.isArray(content.tags) || content.tags.length < 2) {
        errors.push('Missing or insufficient tags (need at least 2)');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Generate a blog post from a topic seed
 * @param {Object} topicSeed - Topic seed from database
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} Generated blog content
 */
async function generateBlogPost(topicSeed, options = {}) {
    const { model = 'haiku', checkDuplicates = true } = options;

    const prompt = blogTemplates.getBlogPostPrompt(topicSeed);

    const { content, generationTime, promptLength } = await callClaudeAPI(prompt, model);
    const parsedContent = parseAIResponse(content);

    // Validate content structure
    const validation = validateBlogContent(parsedContent);
    if (!validation.valid) {
        // Log the failure
        await logBlogGeneration({
            topicSeedId: topicSeed.id,
            title: parsedContent.title || 'Unknown',
            generationTime,
            promptLength,
            responseLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
            status: 'validation_error',
            errorDetails: validation.errors.join(', ')
        });
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    // Check for duplicate titles
    if (checkDuplicates) {
        const isDuplicate = await checkDuplicateTitle(parsedContent.title);
        if (isDuplicate) {
            throw new Error(`Duplicate title detected: ${parsedContent.title}`);
        }
    }

    // Log successful generation
    await logBlogGeneration({
        topicSeedId: topicSeed.id,
        title: parsedContent.title,
        generationTime,
        promptLength,
        responseLength: typeof content === 'string' ? content.length : JSON.stringify(content).length,
        status: 'success'
    });

    return parsedContent;
}

/**
 * Log a blog generation attempt
 * @param {Object} logData - Log data
 */
async function logBlogGeneration({
    topicSeedId = null,
    blogPostId = null,
    title,
    generationTime,
    promptLength,
    responseLength,
    status,
    errorDetails = null
}) {
    try {
        const titleHash = generateTitleHash(title);

        await supabaseAdmin
            .from('blog_generation_history')
            .insert({
                topic_seed_id: topicSeedId,
                blog_post_id: blogPostId,
                title,
                title_hash: titleHash,
                generation_time_ms: generationTime,
                prompt_length: promptLength,
                response_length: responseLength,
                status,
                error_details: errorDetails
            });
    } catch (error) {
        console.error('Failed to log blog generation:', error);
        // Don't throw - logging failure shouldn't stop the process
    }
}

/**
 * Update topic seed after generation
 * @param {string} topicSeedId - Topic seed ID
 */
async function updateTopicSeedAfterGeneration(topicSeedId) {
    try {
        await supabaseAdmin
            .from('blog_topic_seeds')
            .update({
                last_generated_at: new Date().toISOString(),
                generation_count: supabaseAdmin.raw('generation_count + 1')
            })
            .eq('id', topicSeedId);
    } catch (error) {
        console.error('Failed to update topic seed:', error);
    }
}

/**
 * Get the next topic seed to generate
 * @param {Object} options - Filter options
 * @returns {Promise<Object|null>} Next topic seed or null
 */
async function getNextTopicSeed(options = {}) {
    const { category = null, maxPriority = 10 } = options;

    let query = supabaseAdmin
        .from('blog_topic_seeds')
        .select('*')
        .eq('is_active', true)
        .lte('priority', maxPriority)
        .order('priority', { ascending: true })
        .order('last_generated_at', { ascending: true, nullsFirst: true })
        .limit(1);

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get next topic seed: ${error.message}`);
    }

    return data?.[0] || null;
}

/**
 * Get all topic seeds
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Topic seeds
 */
async function getTopicSeeds(options = {}) {
    const { category = null, isActive = true, limit = 100 } = options;

    let query = supabaseAdmin
        .from('blog_topic_seeds')
        .select('*')
        .order('priority', { ascending: true })
        .order('topic_theme', { ascending: true })
        .limit(limit);

    if (isActive !== null) {
        query = query.eq('is_active', isActive);
    }

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get topic seeds: ${error.message}`);
    }

    return data || [];
}

/**
 * Get blog generation statistics
 * @returns {Promise<Object>} Statistics
 */
async function getBlogGenerationStats() {
    const { data, error } = await supabaseAdmin
        .from('blog_generation_history')
        .select('status, generation_time_ms, created_at');

    if (error) {
        throw new Error(`Failed to get blog generation stats: ${error.message}`);
    }

    const stats = {
        total: data.length,
        success: 0,
        failed: 0,
        validationError: 0,
        avgGenerationTime: 0,
        last24Hours: 0,
        last7Days: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let totalTime = 0;

    data.forEach(log => {
        if (log.status === 'success') stats.success++;
        else if (log.status === 'validation_error') stats.validationError++;
        else stats.failed++;

        if (log.generation_time_ms) {
            totalTime += log.generation_time_ms;
        }

        const createdAt = new Date(log.created_at);
        if (createdAt > oneDayAgo) stats.last24Hours++;
        if (createdAt > sevenDaysAgo) stats.last7Days++;
    });

    stats.avgGenerationTime = data.length > 0 ? Math.round(totalTime / data.length) : 0;

    // Get topic seed stats
    const { data: seedData } = await supabaseAdmin
        .from('blog_topic_seeds')
        .select('is_active, priority, last_generated_at');

    if (seedData) {
        stats.topicSeeds = {
            total: seedData.length,
            active: seedData.filter(s => s.is_active).length,
            neverGenerated: seedData.filter(s => !s.last_generated_at).length,
            byPriority: {}
        };

        seedData.forEach(seed => {
            const p = seed.priority || 5;
            stats.topicSeeds.byPriority[p] = (stats.topicSeeds.byPriority[p] || 0) + 1;
        });
    }

    return stats;
}

/**
 * Get generation history/logs
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Log entries
 */
async function getGenerationLogs(options = {}) {
    const { limit = 50, status = null } = options;

    let query = supabaseAdmin
        .from('blog_generation_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get generation logs: ${error.message}`);
    }

    return data || [];
}

module.exports = {
    generateBlogPost,
    getNextTopicSeed,
    getTopicSeeds,
    getBlogGenerationStats,
    getGenerationLogs,
    updateTopicSeedAfterGeneration,
    logBlogGeneration,
    validateBlogContent,
    generateTitleHash
};
