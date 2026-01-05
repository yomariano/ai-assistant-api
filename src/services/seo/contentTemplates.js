/**
 * Content Templates Service
 * Prompts for AI content generation
 */

/**
 * Get use case description based on industry metadata
 * @param {Object} metadata - Industry metadata
 * @returns {string} Use case description
 */
function getUseCaseDescription(metadata = {}) {
    const useCaseMap = {
        'appointment-scheduling': 'scheduling appointments and managing bookings',
        'service-booking': 'booking services and scheduling visits',
        'quote-requests': 'handling quote requests and providing estimates',
        'consultation-booking': 'booking consultations and managing client inquiries',
        'emergency-dispatch': 'handling emergency calls and dispatching services',
        'reservation-booking': 'managing reservations and bookings',
        'order-taking': 'taking orders and processing requests',
        'sales-inquiries': 'handling sales inquiries and lead qualification',
        'product-inquiries': 'answering product questions and providing information',
        'support-tickets': 'managing support requests and troubleshooting',
        'membership-inquiries': 'handling membership questions and sign-ups',
        'class-booking': 'booking classes and managing schedules',
        'lesson-booking': 'scheduling lessons and sessions',
        'session-booking': 'booking sessions and appointments',
        'enrollment-inquiries': 'handling enrollment questions and registrations',
        'tenant-inquiries': 'managing tenant inquiries and property questions',
        'candidate-screening': 'screening candidates and scheduling interviews',
        'property-inquiries': 'handling property inquiries and viewings',
        'tracking-inquiries': 'providing tracking updates and delivery information',
        'pickup-scheduling': 'scheduling pickups and managing logistics',
        'rental-inquiries': 'handling rental inquiries and bookings',
        'ticket-inquiries': 'answering ticket questions and reservations',
        'tee-time-booking': 'booking tee times and managing reservations',
        'prescription-inquiries': 'handling prescription inquiries and refills',
        'arrangement-inquiries': 'managing arrangement inquiries with compassion',
        'service-inquiries': 'handling service inquiries and questions'
    };

    return useCaseMap[metadata.use_case] || 'handling phone calls and customer inquiries';
}

/**
 * Get industry type description
 * @param {Object} metadata - Industry metadata
 * @returns {string} Industry type description
 */
function getIndustryTypeDescription(metadata = {}) {
    const typeMap = {
        'food-service': 'restaurants, cafes, and food businesses',
        'healthcare': 'healthcare providers and medical practices',
        'professional-services': 'professional service firms',
        'home-services': 'home service providers and contractors',
        'automotive': 'automotive businesses and service providers',
        'beauty-wellness': 'beauty and wellness businesses',
        'education': 'educational institutions and training providers',
        'travel-hospitality': 'travel and hospitality businesses',
        'retail': 'retail stores and shops',
        'pet-services': 'pet service providers',
        'logistics': 'logistics and moving companies',
        'entertainment': 'entertainment and event businesses',
        'tech': 'technology and IT service providers',
        'funeral': 'funeral service providers',
        'security': 'security service companies'
    };

    return typeMap[metadata.type] || 'businesses';
}

/**
 * Generate prompt for location page
 * @param {string} cityName - City/town name
 * @param {Object} metadata - Location metadata
 * @returns {string} Prompt for AI
 */
function getLocationPrompt(cityName, metadata = {}) {
    const population = metadata.population ? `Population: approximately ${metadata.population.toLocaleString()}` : '';
    const county = metadata.county ? `County: ${metadata.county}` : '';

    return `You are a content writer for VoiceFleet, an AI voice agent service that handles phone calls for businesses across all industries in Ireland and Europe.

Generate SEO-optimized content for a location page targeting "${cityName}", Ireland.

Context:
- VoiceFleet provides AI voice agents that answer phone calls 24/7
- Works for ANY industry: healthcare, professional services, home services, automotive, beauty, retail, and more
- Target audience: Business owners of all types in ${cityName}
- Tone: Professional, helpful, locally relevant
- Brand: VoiceFleet - "AI Voice Agents at 80% Lower Cost"
${population ? `- ${population}` : ''}
${county ? `- ${county}` : ''}

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "AI Voice Agents for ${cityName} Businesses",
  "subheadline": "A compelling value proposition for all business types in ${cityName} (max 150 chars)",
  "local_description": "2-3 paragraphs about the business landscape in ${cityName} and how VoiceFleet helps local businesses of all types. Mention the diverse business community, local economy, and specific areas or business districts.",
  "local_benefits": [
    {"title": "24/7 Availability", "description": "How this benefits ${cityName} businesses specifically"},
    {"title": "Cost Savings", "description": "Description specific to ${cityName} business costs"},
    {"title": "Local Understanding", "description": "How VoiceFleet understands ${cityName} context"},
    {"title": "Scalability", "description": "Description specific to ${cityName} business growth"}
  ],
  "local_stats": {
    "businesses_estimate": "Estimated number of businesses in the area",
    "missed_calls_cost": "Average cost of missed calls in Euro",
    "peak_times": "When local businesses are busiest"
  },
  "local_testimonial": {
    "quote": "A realistic testimonial from a fictional ${cityName} business owner",
    "author": "Owner name",
    "business": "A realistic ${cityName} business name",
    "business_type": "Type of business (e.g., dental practice, plumber, salon)"
  },
  "industries_served": ["Healthcare", "Professional Services", "Home Services", "Beauty & Wellness", "Retail", "Automotive"],
  "faq": [
    {"question": "Question specific to ${cityName} business owners", "answer": "Detailed answer"},
    {"question": "Question about industries served in ${cityName}", "answer": "Answer 2"},
    {"question": "Question about pricing for ${cityName} businesses", "answer": "Answer 3"},
    {"question": "Question about integration and setup", "answer": "Answer 4"},
    {"question": "Question about local support", "answer": "Answer 5"}
  ],
  "nearby_locations": ["3-5 nearby towns/areas that would also benefit"],
  "meta_title": "AI Voice Agents for ${cityName} Businesses | VoiceFleet (max 60 chars)",
  "meta_description": "SEO-optimized description for ${cityName} businesses using VoiceFleet AI voice agents. Under 155 chars."
}

Important:
- Use Irish English spelling (centre, colour, favour)
- Reference local landmarks, areas, or characteristics of ${cityName}
- Make the content feel authentic and locally relevant
- Mention multiple industries that can benefit
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
    const useCase = getUseCaseDescription(metadata);
    const industryType = getIndustryTypeDescription(metadata);

    return `You are a content writer for VoiceFleet, an AI voice agent service that handles phone calls for businesses across all industries.

Generate SEO-optimized content for an industry page targeting "${industryName}" businesses in Ireland and Europe.

Context:
- VoiceFleet provides AI voice agents that answer phone calls 24/7
- Main use case for ${industryName}: ${useCase}
- Industry category: ${industryType}
- Target audience: ${industryName} owners and managers
- Tone: Professional, helpful, industry-specific
- Brand: VoiceFleet - "AI Voice Agents at 80% Lower Cost"

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "AI Voice Agents for ${industryName}",
  "subheadline": "A compelling value proposition for ${industryName} (max 150 chars)",
  "problem_statement": "2-3 paragraphs about the specific challenges ${industryName} face with phone calls. Include pain points like missed calls during busy periods, staff juggling phones while working, lost revenue, poor customer experience, after-hours calls, etc.",
  "solution_description": "2-3 paragraphs about how VoiceFleet specifically solves these problems for ${industryName}. Focus on ${useCase}. Be specific about features relevant to this industry.",
  "benefits": [
    {"title": "Never Miss a Call", "description": "How 24/7 availability benefits ${industryName} specifically", "icon": "phone"},
    {"title": "80% Cost Savings", "description": "Cost comparison vs traditional receptionists", "icon": "euro"},
    {"title": "Instant Response", "description": "How quick response benefits ${industryName}", "icon": "clock"},
    {"title": "Professional Service", "description": "How AI maintains professionalism", "icon": "users"},
    {"title": "Smart Integration", "description": "How it integrates with ${industryName} systems", "icon": "check"},
    {"title": "Scalable Solution", "description": "How it scales with ${industryName} growth", "icon": "star"}
  ],
  "use_cases": [
    {"title": "Use case 1 for ${industryName}", "description": "Detailed description of ${useCase}", "example": "Example call scenario"},
    {"title": "Use case 2", "description": "Description", "example": "Example"},
    {"title": "Use case 3", "description": "Description", "example": "Example"},
    {"title": "Use case 4", "description": "Description", "example": "Example"}
  ],
  "testimonial": {
    "quote": "A realistic testimonial from a ${industryName} owner",
    "author": "Owner name",
    "business": "A realistic ${industryName} name",
    "location": "Irish city/town"
  },
  "industry_stats": {
    "missed_call_rate": "Percentage of missed calls in ${industryName}",
    "avg_call_value": "Average value of each call/inquiry",
    "peak_hours": "Typical peak hours for ${industryName}"
  },
  "faq": [
    {"question": "Industry-specific question about ${industryName} and AI voice agents", "answer": "Detailed answer"},
    {"question": "Question about ${useCase}", "answer": "Answer 2"},
    {"question": "Question about pricing for ${industryName}", "answer": "Answer 3"},
    {"question": "Question about setup and integration", "answer": "Answer 4"},
    {"question": "Question about call handling quality", "answer": "Answer 5"}
  ],
  "related_industries": ["3-5 related business types that also use VoiceFleet"],
  "meta_title": "AI Voice Agents for ${industryName} | VoiceFleet (max 60 chars)",
  "meta_description": "SEO-optimized description for ${industryName} using VoiceFleet. Under 155 chars."
}

Important:
- Use Irish English spelling
- Be specific to the ${industryName} industry
- Focus on ${useCase} as the main value proposition
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
    const useCase = getUseCaseDescription(industryMetadata);
    const industryType = getIndustryTypeDescription(industryMetadata);

    return `You are a content writer for VoiceFleet, an AI voice agent service that handles phone calls for businesses across all industries.

Generate SEO-optimized content for a combo page targeting "${industryName}" in "${cityName}", Ireland.

Context:
- VoiceFleet provides AI voice agents that answer phone calls 24/7
- Main use case: ${useCase}
- Industry category: ${industryType}
- Target audience: ${industryName} owners in ${cityName}, Ireland
- Tone: Professional, helpful, hyper-local and industry-specific
- Brand: VoiceFleet - "AI Voice Agents at 80% Lower Cost"
${county ? `- ${county}` : ''}

Generate the following JSON structure (respond ONLY with valid JSON, no other text):

{
  "headline": "AI Voice Agents for ${industryName} in ${cityName}",
  "subheadline": "Hyper-local value proposition combining ${industryName} and ${cityName} (max 150 chars)",
  "intro": "2-3 paragraphs introducing VoiceFleet specifically for ${industryName} in ${cityName}. Mention the local ${industryName} scene, competition, and unique challenges. Focus on ${useCase}.",
  "why_need": "2-3 paragraphs explaining why ${industryName} in ${cityName} specifically need AI voice agents. Reference local factors, competition, busy periods, local events, tourism (if relevant), etc.",
  "local_industry_context": "A paragraph about the ${industryName} landscape in ${cityName} - how many there are, popular areas, competition level, local market conditions.",
  "benefits": [
    {"title": "24/7 Local Availability", "description": "Specific to ${industryName} in ${cityName}"},
    {"title": "Cost Effective", "description": "Savings compared to local staff costs"},
    {"title": "Local Understanding", "description": "How the AI understands ${cityName} context"},
    {"title": "Professional Service", "description": "Maintaining ${industryName} standards"}
  ],
  "local_stats": {
    "estimated_businesses": "Estimated number of ${industryName} in ${cityName}",
    "competition_level": "High/Medium/Low",
    "peak_seasons": "When ${industryName} in ${cityName} are busiest"
  },
  "case_study": {
    "business_name": "A fictional but realistic ${industryName} in ${cityName}",
    "challenge": "The challenge they faced with phone calls",
    "solution": "How VoiceFleet helped with ${useCase}",
    "results": ["Result 1 (e.g., 40% more bookings)", "Result 2", "Result 3"]
  },
  "faq": [
    {"question": "Hyper-local question about ${industryName} in ${cityName}", "answer": "Detailed answer"},
    {"question": "Question about ${useCase} for local businesses", "answer": "Answer 2"},
    {"question": "Question about pricing", "answer": "Answer 3"},
    {"question": "Question about getting started", "answer": "Answer 4"}
  ],
  "cta_text": "Get VoiceFleet for Your ${cityName} ${industryName}",
  "related_locations": ["3-4 nearby locations with ${industryName}"],
  "related_industries": ["3-4 related business types in ${cityName}"],
  "meta_title": "${industryName} AI Voice Agents ${cityName} | VoiceFleet (max 60 chars)",
  "meta_description": "AI voice agents for ${industryName} in ${cityName}. Under 155 chars."
}

Important:
- Use Irish English spelling
- Make content feel hyper-local and specific to ${industryName} in ${cityName}
- Reference local characteristics, areas, and context
- Focus on ${useCase} as the main value proposition
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
    getTemplateTypes,
    getUseCaseDescription,
    getIndustryTypeDescription
};
