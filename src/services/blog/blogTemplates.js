/**
 * Blog Content Templates Service
 * Prompts for AI blog post generation
 */

/**
 * Category-specific writing guidelines
 */
const CATEGORY_GUIDELINES = {
    'industry-insights': {
        tone: 'authoritative and analytical',
        structure: 'data-driven analysis with expert commentary',
        wordCount: '1200-1500 words',
        focus: 'trends, statistics, and strategic implications'
    },
    'how-to': {
        tone: 'helpful and practical',
        structure: 'step-by-step guide with clear instructions',
        wordCount: '1000-1300 words',
        focus: 'actionable steps and best practices'
    },
    'case-studies': {
        tone: 'narrative and results-focused',
        structure: 'problem-solution-results with quotes',
        wordCount: '1100-1400 words',
        focus: 'specific metrics and transformation story'
    },
    'cost-analysis': {
        tone: 'objective and data-heavy',
        structure: 'comparison with calculations and breakdowns',
        wordCount: '1000-1300 words',
        focus: 'ROI, cost savings, and financial justification'
    },
    'product-features': {
        tone: 'educational and engaging',
        structure: 'feature explanation with use cases',
        wordCount: '900-1200 words',
        focus: 'technical capabilities and practical applications'
    },
    'trends': {
        tone: 'forward-looking and insightful',
        structure: 'trend analysis with predictions',
        wordCount: '1100-1400 words',
        focus: 'market direction and strategic implications'
    }
};

/**
 * Get blog post prompt based on topic seed
 * @param {Object} topicSeed - Topic seed data from database
 * @returns {string} Prompt for AI
 */
function getBlogPostPrompt(topicSeed) {
    const { category, topic_theme, keywords, target_audience, content_angle } = topicSeed;
    const guidelines = CATEGORY_GUIDELINES[category] || CATEGORY_GUIDELINES['industry-insights'];

    const keywordsStr = keywords?.length > 0 ? keywords.join(', ') : 'AI voice agents, business automation';

    return `You are a senior content writer for VoiceFleet, an AI voice agent service that handles phone calls for businesses. You're writing a blog post for our website.

TOPIC: ${topic_theme}

CATEGORY: ${category}
TARGET AUDIENCE: ${target_audience || 'Business owners and decision makers'}
CONTENT ANGLE: ${content_angle || 'General information'}
SEO KEYWORDS TO INCLUDE: ${keywordsStr}

WRITING GUIDELINES:
- Tone: ${guidelines.tone}
- Structure: ${guidelines.structure}
- Target length: ${guidelines.wordCount}
- Focus: ${guidelines.focus}

BRAND CONTEXT:
- VoiceFleet provides AI voice agents that answer phone calls 24/7
- Works across all industries: healthcare, restaurants, salons, professional services, home services, etc.
- Primary markets: Ireland and Europe
- Key value prop: 80% lower cost than human receptionists
- Features: appointment booking, FAQ handling, call qualification, calendar integration
- Pricing: Starter €49/mo, Growth €199/mo, Pro €599/mo

Generate a complete blog post in the following JSON structure (respond ONLY with valid JSON, no other text):

{
    "title": "Compelling, SEO-optimized title (max 70 chars)",
    "slug": "url-friendly-slug-based-on-title",
    "excerpt": "Compelling 2-3 sentence summary that hooks the reader (max 200 chars)",
    "content": "Full blog post content in Markdown format. Include:\n- Engaging introduction\n- Well-structured body with H2 and H3 headings\n- Data points and statistics where relevant\n- Practical examples and scenarios\n- Clear call-to-action at the end\n- Internal linking suggestions marked as [LINK: page-type]",
    "category": "${category}",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
    "author_name": "VoiceFleet Team",
    "featured_image_alt": "Descriptive alt text for the hero image",
    "meta_title": "SEO title (max 60 chars)",
    "meta_description": "SEO meta description (max 155 chars)"
}

IMPORTANT GUIDELINES:
- Use Irish English spelling (centre, colour, favour, organisation)
- All prices should be in Euro (€)
- Include the SEO keywords naturally throughout the content
- Make the content genuinely valuable, not promotional
- Include specific examples relevant to Irish/European businesses
- Use headers (##, ###) to break up content
- Include a clear CTA at the end suggesting the reader try VoiceFleet
- The content field should be valid Markdown
- Keep meta_title under 60 characters
- Keep meta_description under 155 characters
- Generate 5 relevant tags for the post`;
}

/**
 * Get headline variations prompt for A/B testing
 * @param {string} originalTitle - Original blog title
 * @returns {string} Prompt for AI
 */
function getHeadlineVariationsPrompt(originalTitle) {
    return `Generate 3 alternative headlines for this blog post title. The alternatives should:
- Be SEO-optimized (under 70 characters)
- Appeal to different motivations (curiosity, fear of missing out, desire for savings, etc.)
- Maintain the same core message

Original title: "${originalTitle}"

Respond with JSON only:
{
    "variations": [
        {"headline": "Alternative 1", "appeal": "curiosity"},
        {"headline": "Alternative 2", "appeal": "savings"},
        {"headline": "Alternative 3", "appeal": "authority"}
    ]
}`;
}

/**
 * Get content expansion prompt for adding depth to a section
 * @param {string} section - Section content to expand
 * @param {string} context - Additional context
 * @returns {string} Prompt for AI
 */
function getContentExpansionPrompt(section, context) {
    return `Expand this blog section with more detail, examples, and data points while maintaining the same tone:

SECTION TO EXPAND:
${section}

CONTEXT:
${context}

Respond with JSON only:
{
    "expanded_content": "The expanded section in Markdown format"
}`;
}

/**
 * Get FAQ generation prompt based on blog content
 * @param {string} title - Blog title
 * @param {string} excerpt - Blog excerpt
 * @returns {string} Prompt for AI
 */
function getFAQPrompt(title, excerpt) {
    return `Based on this blog post, generate 4 FAQ items that readers might have after reading:

TITLE: ${title}
EXCERPT: ${excerpt}

Respond with JSON only:
{
    "faq": [
        {"question": "Question 1", "answer": "Detailed answer 1"},
        {"question": "Question 2", "answer": "Detailed answer 2"},
        {"question": "Question 3", "answer": "Detailed answer 3"},
        {"question": "Question 4", "answer": "Detailed answer 4"}
    ]
}`;
}

/**
 * Get all available blog categories
 * @returns {Array} List of categories
 */
function getCategories() {
    return Object.keys(CATEGORY_GUIDELINES);
}

/**
 * Get category guidelines
 * @param {string} category - Category name
 * @returns {Object} Guidelines for the category
 */
function getCategoryGuidelines(category) {
    return CATEGORY_GUIDELINES[category] || CATEGORY_GUIDELINES['industry-insights'];
}

module.exports = {
    getBlogPostPrompt,
    getHeadlineVariationsPrompt,
    getContentExpansionPrompt,
    getFAQPrompt,
    getCategories,
    getCategoryGuidelines,
    CATEGORY_GUIDELINES
};
