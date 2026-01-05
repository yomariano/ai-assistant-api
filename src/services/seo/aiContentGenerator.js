/**
 * AI Content Generator Service
 * Handles content generation using Claude proxy API
 */

const { supabaseAdmin } = require('../supabase');
const contentTemplates = require('./contentTemplates');

const CLAUDE_API_URL = process.env.CLAUDE_API_URL || 'http://91.98.76.231:8787';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

/**
 * Call the Claude proxy API
 * @param {string} prompt - The prompt to send
 * @param {string} model - Model to use (default: 'haiku')
 * @returns {Promise<string>} The generated content
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

    // Try to extract JSON from the response
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
 * Validate generated content structure
 * @param {Object} content - Parsed content
 * @param {string} contentType - Type of content
 * @returns {Object} Validation result
 */
function validateContent(content, contentType) {
    const errors = [];

    // Common required fields
    if (!content.headline || content.headline.length < 10) {
        errors.push('Missing or too short headline');
    }
    if (!content.meta_title || content.meta_title.length > 70) {
        errors.push('Missing or too long meta_title (max 70 chars)');
    }
    if (!content.meta_description || content.meta_description.length > 160) {
        errors.push('Missing or too long meta_description (max 160 chars)');
    }

    // Type-specific validation
    if (contentType === 'location') {
        if (!content.local_description) errors.push('Missing local_description');
        if (!Array.isArray(content.local_benefits) || content.local_benefits.length < 3) {
            errors.push('Missing or insufficient local_benefits (need at least 3)');
        }
    } else if (contentType === 'industry') {
        if (!content.problem_statement) errors.push('Missing problem_statement');
        if (!content.solution_description) errors.push('Missing solution_description');
        if (!Array.isArray(content.benefits) || content.benefits.length < 4) {
            errors.push('Missing or insufficient benefits (need at least 4)');
        }
    } else if (contentType === 'combo') {
        if (!content.intro) errors.push('Missing intro');
        if (!content.why_need) errors.push('Missing why_need');
        if (!Array.isArray(content.benefits) || content.benefits.length < 3) {
            errors.push('Missing or insufficient benefits (need at least 3)');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Generate content for a location page
 * @param {string} locationSlug - Location slug
 * @param {string} locationName - Location display name
 * @param {Object} metadata - Additional location metadata
 * @returns {Promise<Object>} Generated content
 */
async function generateLocationPage(locationSlug, locationName, metadata = {}) {
    const prompt = contentTemplates.getLocationPrompt(locationName, metadata);

    const { content, generationTime, promptLength } = await callClaudeAPI(prompt);
    const parsedContent = parseAIResponse(content);

    const validation = validateContent(parsedContent, 'location');
    if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    // Log the generation
    await logGeneration({
        contentType: 'location',
        targetSlug: locationSlug,
        generationTime,
        promptLength,
        responseLength: content.length,
        status: 'success'
    });

    return parsedContent;
}

/**
 * Generate content for an industry page
 * @param {string} industrySlug - Industry slug
 * @param {string} industryName - Industry display name
 * @param {Object} metadata - Additional industry metadata
 * @returns {Promise<Object>} Generated content
 */
async function generateIndustryPage(industrySlug, industryName, metadata = {}) {
    const prompt = contentTemplates.getIndustryPrompt(industryName, metadata);

    const { content, generationTime, promptLength } = await callClaudeAPI(prompt);
    const parsedContent = parseAIResponse(content);

    const validation = validateContent(parsedContent, 'industry');
    if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    // Log the generation
    await logGeneration({
        contentType: 'industry',
        targetSlug: industrySlug,
        generationTime,
        promptLength,
        responseLength: content.length,
        status: 'success'
    });

    return parsedContent;
}

/**
 * Generate content for a combo page (industry + location)
 * @param {string} locationSlug - Location slug
 * @param {string} industrySlug - Industry slug
 * @param {string} locationName - Location display name
 * @param {string} industryName - Industry display name
 * @param {Object} locationMetadata - Location metadata
 * @param {Object} industryMetadata - Industry metadata
 * @returns {Promise<Object>} Generated content
 */
async function generateComboPage(
    locationSlug,
    industrySlug,
    locationName,
    industryName,
    locationMetadata = {},
    industryMetadata = {}
) {
    const prompt = contentTemplates.getComboPrompt(
        locationName,
        industryName,
        locationMetadata,
        industryMetadata
    );

    const { content, generationTime, promptLength } = await callClaudeAPI(prompt);
    const parsedContent = parseAIResponse(content);

    const validation = validateContent(parsedContent, 'combo');
    if (!validation.valid) {
        throw new Error(`Content validation failed: ${validation.errors.join(', ')}`);
    }

    // Log the generation
    await logGeneration({
        contentType: 'combo',
        targetSlug: `${industrySlug}-${locationSlug}`,
        generationTime,
        promptLength,
        responseLength: content.length,
        status: 'success'
    });

    return parsedContent;
}

/**
 * Log a content generation attempt
 * @param {Object} logData - Log data
 */
async function logGeneration({
    queueId = null,
    contentType,
    targetSlug,
    generationTime,
    promptLength,
    responseLength,
    status,
    errorDetails = null
}) {
    try {
        await supabaseAdmin
            .from('content_generation_logs')
            .insert({
                queue_id: queueId,
                content_type: contentType,
                target_slug: targetSlug,
                ai_model: 'haiku',
                generation_time_ms: generationTime,
                prompt_length: promptLength,
                response_length: responseLength,
                status,
                error_details: errorDetails
            });
    } catch (error) {
        console.error('Failed to log generation:', error);
        // Don't throw - logging failure shouldn't stop the process
    }
}

/**
 * Get generation logs
 * @param {Object} options - Filter options
 * @returns {Promise<Array>} Log entries
 */
async function getLogs({ limit = 100, status = null, contentType = null } = {}) {
    let query = supabaseAdmin
        .from('content_generation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (status) {
        query = query.eq('status', status);
    }

    if (contentType) {
        query = query.eq('content_type', contentType);
    }

    const { data, error } = await query;

    if (error) {
        throw new Error(`Failed to get logs: ${error.message}`);
    }

    return data;
}

/**
 * Get generation statistics
 * @returns {Promise<Object>} Statistics
 */
async function getGenerationStats() {
    const { data, error } = await supabaseAdmin
        .from('content_generation_logs')
        .select('status, content_type, generation_time_ms, created_at');

    if (error) {
        throw new Error(`Failed to get generation stats: ${error.message}`);
    }

    const stats = {
        total: data.length,
        success: 0,
        failed: 0,
        validationError: 0,
        avgGenerationTime: 0,
        byType: {},
        last24Hours: 0
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let totalTime = 0;

    data.forEach(log => {
        stats[log.status === 'validation_error' ? 'validationError' : log.status]++;

        if (log.generation_time_ms) {
            totalTime += log.generation_time_ms;
        }

        stats.byType[log.content_type] = stats.byType[log.content_type] || { success: 0, failed: 0 };
        if (log.status === 'success') {
            stats.byType[log.content_type].success++;
        } else {
            stats.byType[log.content_type].failed++;
        }

        if (new Date(log.created_at) > oneDayAgo) {
            stats.last24Hours++;
        }
    });

    stats.avgGenerationTime = data.length > 0 ? Math.round(totalTime / data.length) : 0;

    return stats;
}

module.exports = {
    generateLocationPage,
    generateIndustryPage,
    generateComboPage,
    getLogs,
    getGenerationStats,
    logGeneration
};
