/**
 * Content Templates Service
 * Prompts for AI content generation
 */

/**
 * Generate prompt for location page
 * @param {string} cityName - City/town name
 * @param {Object} metadata - Location metadata
 * @returns {string} Prompt for AI
 */
function getLocationPrompt(cityName, metadata = {}) {
    const population = metadata.population ? `Population: approximately ${metadata.population.toLocaleString()}` : '';
    const county = metadata.county ? `County: ${metadata.county}` : '';

    return `You are a content writer for OrderBot, an AI phone answering service for Irish restaurants, cafes, and takeaways.

Generate SEO-optimized content for a location page targeting "${cityName}", Ireland.

Context:
- OrderBot answers phone calls for restaurants 24/7 using AI
- Target audience: Restaurant, cafe, and takeaway owners in ${cityName}
- Tone: Professional, helpful, locally relevant
- Brand: OrderBot - "Never Miss an Order Again"
${population ? `- ${population}` : ''}
${county ? `- ${county}` : ''}

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "AI Phone Answering for ${cityName} Restaurants",
  "subheadline": "A compelling value proposition specific to ${cityName} (max 150 chars)",
  "local_description": "2-3 paragraphs about the restaurant/food scene in ${cityName} and how OrderBot helps local businesses. Mention specific areas, neighborhoods, or characteristics of the local food industry.",
  "local_benefits": [
    {"title": "Benefit 1 title", "description": "Description specific to ${cityName}"},
    {"title": "Benefit 2 title", "description": "Description specific to ${cityName}"},
    {"title": "Benefit 3 title", "description": "Description specific to ${cityName}"},
    {"title": "Benefit 4 title", "description": "Description specific to ${cityName}"}
  ],
  "local_stats": {
    "restaurants_estimate": "Number of restaurants in the area",
    "missed_calls_cost": "Average cost of missed calls in Euro",
    "busy_times": "Peak busy times for local restaurants"
  },
  "local_testimonial": {
    "quote": "A realistic testimonial from a fictional ${cityName} restaurant owner",
    "author": "Owner name",
    "business": "A realistic ${cityName} restaurant name",
    "business_type": "Type of restaurant"
  },
  "faq": [
    {"question": "Question specific to ${cityName} restaurant owners", "answer": "Detailed answer"},
    {"question": "Question 2", "answer": "Answer 2"},
    {"question": "Question 3", "answer": "Answer 3"},
    {"question": "Question 4", "answer": "Answer 4"},
    {"question": "Question 5", "answer": "Answer 5"}
  ],
  "nearby_locations": ["3-5 nearby towns/areas that would also benefit"],
  "meta_title": "AI Phone Answering for Restaurants in ${cityName} | OrderBot (max 60 chars)",
  "meta_description": "SEO-optimized description for ${cityName} restaurants using OrderBot AI phone answering. Under 155 chars."
}

Important:
- Use Irish English spelling (centre, colour, favour)
- Reference local landmarks, areas, or characteristics of ${cityName}
- Make the content feel authentic and locally relevant
- All prices should be in Euro (€)
- Keep meta_title under 60 characters
- Keep meta_description under 155 characters`;
}

/**
 * Generate prompt for industry page
 * @param {string} industryName - Industry/business type name
 * @param {Object} metadata - Industry metadata
 * @returns {string} Prompt for AI
 */
function getIndustryPrompt(industryName, metadata = {}) {
    const avgOrder = metadata.avg_order ? `Average order value: €${metadata.avg_order}` : '';

    return `You are a content writer for OrderBot, an AI phone answering service for Irish restaurants, cafes, and takeaways.

Generate SEO-optimized content for an industry page targeting "${industryName}" businesses in Ireland.

Context:
- OrderBot answers phone calls for restaurants 24/7 using AI
- Target audience: ${industryName} owners and managers in Ireland
- Tone: Professional, helpful, industry-specific
- Brand: OrderBot - "Never Miss an Order Again"
${avgOrder ? `- ${avgOrder}` : ''}

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "${industryName} Phone Answering Solution",
  "subheadline": "A compelling value proposition for ${industryName} (max 150 chars)",
  "problem_statement": "2-3 paragraphs about the specific challenges ${industryName} face with phone calls. Include pain points like missed orders during busy periods, staff juggling phones while serving, lost revenue, etc.",
  "solution_description": "2-3 paragraphs about how OrderBot specifically solves these problems for ${industryName}. Be specific about features relevant to this industry.",
  "benefits": [
    {"title": "Benefit 1", "description": "How this benefits ${industryName} specifically", "icon": "phone"},
    {"title": "Benefit 2", "description": "Description", "icon": "clock"},
    {"title": "Benefit 3", "description": "Description", "icon": "euro"},
    {"title": "Benefit 4", "description": "Description", "icon": "users"},
    {"title": "Benefit 5", "description": "Description", "icon": "check"},
    {"title": "Benefit 6", "description": "Description", "icon": "star"}
  ],
  "use_cases": [
    {"title": "Use case 1", "description": "Detailed description", "example": "Example call scenario for ${industryName}"},
    {"title": "Use case 2", "description": "Description", "example": "Example"},
    {"title": "Use case 3", "description": "Description", "example": "Example"},
    {"title": "Use case 4", "description": "Description", "example": "Example"}
  ],
  "testimonial": {
    "quote": "A realistic testimonial from a ${industryName} owner",
    "author": "Owner name",
    "business": "A realistic Irish ${industryName} name",
    "location": "Irish city/town"
  },
  "industry_stats": {
    "missed_call_rate": "Percentage of missed calls in ${industryName}",
    "avg_order_value": "Average order value",
    "peak_hours": "Typical peak hours for ${industryName}"
  },
  "faq": [
    {"question": "Industry-specific question about ${industryName}", "answer": "Detailed answer"},
    {"question": "Question 2", "answer": "Answer 2"},
    {"question": "Question 3", "answer": "Answer 3"},
    {"question": "Question 4", "answer": "Answer 4"},
    {"question": "Question 5", "answer": "Answer 5"}
  ],
  "related_industries": ["3-5 related business types"],
  "meta_title": "${industryName} AI Phone Answering | OrderBot Ireland (max 60 chars)",
  "meta_description": "SEO-optimized description for ${industryName} using OrderBot. Under 155 chars."
}

Important:
- Use Irish English spelling
- Be specific to the ${industryName} industry
- Include realistic scenarios and examples
- All prices in Euro (€)
- Keep meta_title under 60 characters
- Keep meta_description under 155 characters`;
}

/**
 * Generate prompt for combo page (industry + location)
 * @param {string} cityName - City/town name
 * @param {string} industryName - Industry/business type name
 * @param {Object} locationMetadata - Location metadata
 * @param {Object} industryMetadata - Industry metadata
 * @returns {string} Prompt for AI
 */
function getComboPrompt(cityName, industryName, locationMetadata = {}, industryMetadata = {}) {
    const county = locationMetadata.county ? `County: ${locationMetadata.county}` : '';
    const avgOrder = industryMetadata.avg_order ? `Average order: €${industryMetadata.avg_order}` : '';

    return `You are a content writer for OrderBot, an AI phone answering service for Irish restaurants, cafes, and takeaways.

Generate SEO-optimized content for a combo page targeting "${industryName}" in "${cityName}", Ireland.

Context:
- OrderBot answers phone calls for restaurants 24/7 using AI
- Target audience: ${industryName} owners in ${cityName}, Ireland
- Tone: Professional, helpful, hyper-local and industry-specific
- Brand: OrderBot - "Never Miss an Order Again"
${county ? `- ${county}` : ''}
${avgOrder ? `- ${avgOrder}` : ''}

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "${industryName} Phone Answering in ${cityName}",
  "subheadline": "Hyper-local value proposition combining ${industryName} and ${cityName} (max 150 chars)",
  "intro": "2-3 paragraphs introducing OrderBot specifically for ${industryName} in ${cityName}. Mention the local ${industryName} scene, competition, and unique challenges.",
  "why_need": "2-3 paragraphs explaining why ${industryName} in ${cityName} specifically need AI phone answering. Reference local factors, competition, busy periods, events, etc.",
  "local_industry_context": "A paragraph about the ${industryName} landscape in ${cityName} - how many there are, popular areas, competition level.",
  "benefits": [
    {"title": "Benefit 1", "description": "Specific to ${industryName} in ${cityName}"},
    {"title": "Benefit 2", "description": "Description"},
    {"title": "Benefit 3", "description": "Description"},
    {"title": "Benefit 4", "description": "Description"}
  ],
  "local_stats": {
    "estimated_businesses": "Estimated number of ${industryName} in ${cityName}",
    "competition_level": "High/Medium/Low",
    "peak_seasons": "When ${industryName} in ${cityName} are busiest"
  },
  "case_study": {
    "business_name": "A fictional but realistic ${industryName} in ${cityName}",
    "challenge": "The challenge they faced",
    "solution": "How OrderBot helped",
    "results": ["Result 1", "Result 2", "Result 3"]
  },
  "faq": [
    {"question": "Hyper-local question about ${industryName} in ${cityName}", "answer": "Detailed answer"},
    {"question": "Question 2", "answer": "Answer 2"},
    {"question": "Question 3", "answer": "Answer 3"},
    {"question": "Question 4", "answer": "Answer 4"}
  ],
  "cta_text": "Get OrderBot for Your ${cityName} ${industryName}",
  "related_locations": ["3-4 nearby locations with ${industryName}"],
  "related_industries": ["3-4 related business types in ${cityName}"],
  "meta_title": "${industryName} Phone Answering ${cityName} | OrderBot (max 60 chars)",
  "meta_description": "AI phone answering for ${industryName} in ${cityName}. Under 155 chars."
}

Important:
- Use Irish English spelling
- Make content feel hyper-local and specific to ${industryName} in ${cityName}
- Reference local characteristics, areas, and context
- All prices in Euro (€)
- Keep meta_title under 60 characters
- Keep meta_description under 155 characters
- The case study should feel realistic but is fictional`;
}

/**
 * Get all available template types
 * @returns {Array} List of template types
 */
function getTemplateTypes() {
    return ['location', 'industry', 'combo'];
}

module.exports = {
    getLocationPrompt,
    getIndustryPrompt,
    getComboPrompt,
    getTemplateTypes
};
