/**
 * Comparison Page Templates Service
 * Prompts for AI comparison page generation
 */

/**
 * Alternative type descriptions for context
 */
const ALTERNATIVE_TYPE_CONTEXT = {
    'traditional': 'a traditional approach that many businesses still use',
    'competitor': 'a competing AI/technology solution in the market',
    'service-category': 'a category of service that businesses might consider'
};

/**
 * Generate prompt for comparison page
 * @param {Object} alternative - Alternative data from database
 * @returns {string} Prompt for AI
 */
function getComparisonPrompt(alternative) {
    const {
        name,
        slug,
        alternative_type,
        description,
        key_features,
        typical_pricing
    } = alternative;

    const typeContext = ALTERNATIVE_TYPE_CONTEXT[alternative_type] || 'an alternative solution';
    const featuresStr = key_features?.length > 0 ? key_features.join(', ') : 'basic functionality';

    return `You are a content writer for VoiceFleet, an AI voice agent service that handles phone calls for businesses. You're writing a comparison page: "VoiceFleet vs ${name}".

ALTERNATIVE: ${name}
TYPE: ${typeContext}
DESCRIPTION: ${description || 'A common alternative to AI voice agents'}
KEY FEATURES OF ${name.toUpperCase()}: ${featuresStr}
${typical_pricing ? `TYPICAL PRICING: ${typical_pricing}` : ''}

VOICEFLEET CONTEXT:
- VoiceFleet provides AI voice agents that answer phone calls 24/7
- Works across all industries: healthcare, restaurants, salons, professional services, etc.
- Primary markets: Ireland and Europe
- Key value prop: 80% lower cost than human receptionists
- Features: appointment booking, FAQ handling, call qualification, calendar integration
- Pricing: Starter €49/mo, Growth €199/mo, Pro €599/mo

Generate a comprehensive comparison page in the following JSON structure (respond ONLY with valid JSON, no other text):

{
    "slug": "voicefleet-vs-${slug}",
    "alternative_name": "${name}",
    "alternative_slug": "${slug}",
    "title": "VoiceFleet vs ${name}",
    "description": "A compelling 1-2 sentence comparison description for listings/SEO (max 200 chars)",
    "hero_title": "VoiceFleet vs ${name}: [compelling comparison hook]",
    "hero_subtitle": "A 2-3 sentence summary explaining the key difference between VoiceFleet and ${name}",
    "who_this_is_for": ["industry1", "industry2", "industry3", "industry4", "industry5"],
    "quick_take": [
        {"label": "Best if you want", "value": "Key differentiator"},
        {"label": "Customer experience", "value": "How customers experience each"},
        {"label": "Outcome", "value": "What you get from each option"}
    ],
    "when_voicefleet_wins": [
        "Specific scenario where VoiceFleet is clearly better",
        "Another scenario favoring VoiceFleet",
        "Third scenario where VoiceFleet excels"
    ],
    "when_alternative_wins": [
        "Specific scenario where ${name} might be preferred",
        "Another scenario where ${name} could be better"
    ],
    "feature_comparison": [
        {"feature": "24/7 Availability", "voicefleet": "Always on", "alternative": "${name}'s capability", "winner": "voicefleet"},
        {"feature": "Cost", "voicefleet": "€49-599/mo", "alternative": "${name}'s cost", "winner": "voicefleet or alternative"},
        {"feature": "Setup Time", "voicefleet": "VoiceFleet setup time", "alternative": "${name} setup", "winner": "winner"},
        {"feature": "Scalability", "voicefleet": "VoiceFleet scalability", "alternative": "${name} scalability", "winner": "winner"},
        {"feature": "Integration", "voicefleet": "Calendar, booking systems", "alternative": "${name} integrations", "winner": "winner"},
        {"feature": "Consistency", "voicefleet": "VoiceFleet consistency", "alternative": "${name} consistency", "winner": "winner"}
    ],
    "faq": [
        {"question": "Question about choosing between VoiceFleet and ${name}?", "answer": "Detailed, helpful answer"},
        {"question": "Question about migration or switching?", "answer": "Helpful answer about transitioning"},
        {"question": "Question about specific use cases?", "answer": "Detailed answer with examples"},
        {"question": "Question about cost comparison?", "answer": "Honest cost analysis"}
    ],
    "detailed_comparison": "A longer Markdown-formatted section (3-4 paragraphs) providing deeper analysis of both options. Include:\n- Detailed breakdown of differences\n- Use case scenarios\n- Total cost of ownership considerations\n- Implementation complexity\n- Long-term scalability",
    "meta_title": "VoiceFleet vs ${name} - Comparison (max 60 chars)",
    "meta_description": "Compare VoiceFleet AI voice agents with ${name}. See which fits your business phone needs. (max 155 chars)"
}

IMPORTANT GUIDELINES:
- Be fair and honest - acknowledge genuine strengths of ${name}
- Use Irish English spelling (centre, colour, favour)
- All prices should be in Euro (€)
- Focus on helping the reader make the right choice for their needs
- Don't be overly promotional - let the facts speak for themselves
- Include specific, realistic scenarios
- The "winner" in feature_comparison should be objective
- Keep meta_title under 60 characters
- Keep meta_description under 155 characters`;
}

/**
 * Generate prompt for updating/enriching existing comparison
 * @param {Object} existingPage - Existing comparison page data
 * @param {string} focusArea - Area to enrich (e.g., 'feature_comparison', 'faq')
 * @returns {string} Prompt for AI
 */
function getComparisonEnrichmentPrompt(existingPage, focusArea) {
    return `Review and enrich this comparison page section. Current content:

PAGE: VoiceFleet vs ${existingPage.alternative_name}
FOCUS AREA: ${focusArea}
CURRENT CONTENT: ${JSON.stringify(existingPage[focusArea], null, 2)}

Generate an improved version with:
- More specific details and examples
- Better clarity and readability
- Additional relevant points if applicable

Respond with JSON only:
{
    "${focusArea}": [improved content array or object]
}`;
}

/**
 * Generate prompt for comparison page SEO optimization
 * @param {Object} page - Comparison page data
 * @returns {string} Prompt for AI
 */
function getSEOOptimizationPrompt(page) {
    return `Optimize the SEO elements for this comparison page:

TITLE: ${page.title}
CURRENT META TITLE: ${page.meta_title}
CURRENT META DESCRIPTION: ${page.meta_description}

Generate improved SEO elements:
- meta_title: Max 60 chars, include both brand names, compelling
- meta_description: Max 155 chars, include key differentiators, CTA
- Additional keywords to target

Respond with JSON only:
{
    "meta_title": "Optimized title",
    "meta_description": "Optimized description",
    "target_keywords": ["keyword1", "keyword2", "keyword3"]
}`;
}

/**
 * Get all alternative types
 * @returns {Array} List of alternative types
 */
function getAlternativeTypes() {
    return Object.keys(ALTERNATIVE_TYPE_CONTEXT);
}

module.exports = {
    getComparisonPrompt,
    getComparisonEnrichmentPrompt,
    getSEOOptimizationPrompt,
    getAlternativeTypes,
    ALTERNATIVE_TYPE_CONTEXT
};
