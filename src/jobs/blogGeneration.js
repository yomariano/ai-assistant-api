/**
 * Blog Generation Job
 * Daily cron job to generate blog posts from topic seeds
 */

const cron = require('node-cron');
const {
    blogContentGenerator,
    blogPublisher
} = require('../services/blog');

let isRunning = false;

/**
 * Generate and publish blog posts from topic seeds
 * @param {number} maxPosts - Maximum posts to generate in this run
 * @returns {Promise<Object>} Results summary
 */
async function generateBlogPosts(maxPosts = 1) {
    const results = {
        processed: 0,
        success: 0,
        failed: 0,
        skipped: 0,
        posts: []
    };

    for (let i = 0; i < maxPosts; i++) {
        try {
            // Get next topic seed to process
            const topicSeed = await blogContentGenerator.getNextTopicSeed({
                maxPriority: Number(process.env.BLOG_CRON_MAX_PRIORITY || 5)
            });

            if (!topicSeed) {
                console.log('[Blog Cron] No more topic seeds available');
                break;
            }

            results.processed++;
            console.log(`[Blog Cron] Generating blog post from topic: "${topicSeed.topic_theme}"`);

            // Generate content
            const content = await blogContentGenerator.generateBlogPost(topicSeed, {
                model: process.env.BLOG_CRON_MODEL || 'haiku',
                checkDuplicates: true
            });

            // Publish the post
            const autoPublish = process.env.BLOG_AUTO_PUBLISH === 'true';
            const publishedPost = await blogPublisher.publishBlogPost(content, {
                topicSeedId: topicSeed.id,
                status: autoPublish ? 'published' : 'draft'
            });

            results.success++;
            results.posts.push({
                id: publishedPost.id,
                slug: publishedPost.slug,
                title: publishedPost.title,
                status: publishedPost.status
            });

            console.log(`[Blog Cron] Successfully generated: "${publishedPost.title}" (${publishedPost.status})`);

        } catch (error) {
            results.failed++;
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[Blog Cron] Failed to generate blog post:`, message);

            // If it's a duplicate, count as skipped
            if (message.includes('Duplicate')) {
                results.skipped++;
                results.failed--;
            }
        }
    }

    return results;
}

/**
 * Run blog generation once (can be called manually or by cron)
 * @param {Object} options - Run options
 * @returns {Promise<Object>} Results
 */
async function runBlogGenerationOnce(options = {}) {
    if (isRunning) {
        console.log('[Blog Cron] Skipping run (already running)');
        return { skipped: true, reason: 'already_running' };
    }

    const {
        maxPosts = Number(process.env.BLOG_CRON_MAX_POSTS || 1)
    } = options;

    isRunning = true;
    const startedAt = new Date();

    try {
        console.log(`[Blog Cron] Starting blog generation run (max ${maxPosts} posts)`);

        const results = await generateBlogPosts(maxPosts);

        console.log('[Blog Cron] Run complete:', {
            startedAt: startedAt.toISOString(),
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - startedAt.getTime(),
            ...results
        });

        return {
            ...results,
            startedAt: startedAt.toISOString(),
            endedAt: new Date().toISOString()
        };

    } catch (error) {
        console.error('[Blog Cron] Fatal error:', error);
        return {
            error: error.message,
            startedAt: startedAt.toISOString()
        };
    } finally {
        isRunning = false;
    }
}

/**
 * Start the blog generation cron job
 */
function startBlogGenerationJob() {
    if (process.env.ENABLE_BLOG_CRON !== 'true') {
        console.log('[Blog Cron] Disabled (set ENABLE_BLOG_CRON=true to enable)');
        return;
    }

    // Default: 3am UTC daily (1 hour after SEO cron)
    const schedule = process.env.BLOG_CRON_SCHEDULE || '0 3 * * *';
    const timezone = process.env.BLOG_CRON_TIMEZONE || 'UTC';

    console.log(`[Blog Cron] Scheduling blog generation: "${schedule}" (${timezone})`);

    cron.schedule(schedule, () => {
        runBlogGenerationOnce().catch((e) => {
            console.error('[Blog Cron] Unhandled error:', e);
        });
    }, { timezone });

    // Optional: run on startup
    if (process.env.BLOG_CRON_RUN_ON_STARTUP === 'true') {
        console.log('[Blog Cron] Running on startup...');
        runBlogGenerationOnce().catch((e) => {
            console.error('[Blog Cron] Startup run failed:', e);
        });
    }
}

/**
 * Get current job status
 * @returns {Object} Job status
 */
function getJobStatus() {
    return {
        isRunning,
        enabled: process.env.ENABLE_BLOG_CRON === 'true',
        schedule: process.env.BLOG_CRON_SCHEDULE || '0 3 * * *',
        timezone: process.env.BLOG_CRON_TIMEZONE || 'UTC',
        maxPostsPerRun: Number(process.env.BLOG_CRON_MAX_POSTS || 1),
        autoPublish: process.env.BLOG_AUTO_PUBLISH === 'true',
        model: process.env.BLOG_CRON_MODEL || 'haiku'
    };
}

module.exports = {
    startBlogGenerationJob,
    runBlogGenerationOnce,
    getJobStatus
};
