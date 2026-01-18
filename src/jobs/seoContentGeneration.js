const cron = require('node-cron');
const {
  seedDataManager,
  queueManager,
  aiContentGenerator,
  contentPublisher
} = require('../services/seo');

let isRunning = false;

async function processQueueBatch(batchSize = 5) {
  const results = {
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0,
  };

  const queueItems = await queueManager.getNextItems(batchSize);
  if (!queueItems.length) return results;

  for (const item of queueItems) {
    results.processed++;

    try {
      await queueManager.markAsProcessing(item.id);

      let locationData = null;
      let industryData = null;

      if (item.location_slug) {
        locationData = await seedDataManager.getSeedItem('location', item.location_slug);
      }
      if (item.industry_slug) {
        industryData = await seedDataManager.getSeedItem('industry', item.industry_slug);
      }

      // Check if content already exists
      let exists = false;
      if (item.content_type === 'location') {
        exists = await contentPublisher.locationPageExists(item.location_slug);
      } else if (item.content_type === 'industry') {
        exists = await contentPublisher.industryPageExists(item.industry_slug);
      } else if (item.content_type === 'combo') {
        exists = await contentPublisher.comboPageExists(item.location_slug, item.industry_slug);
      }

      if (exists) {
        await queueManager.markAsSkipped(item.id, 'Content already exists');
        results.skipped++;
        continue;
      }

      // Generate and publish
      let content;
      let publishedPage;

      if (item.content_type === 'location') {
        content = await aiContentGenerator.generateLocationPage(
          item.location_slug,
          locationData?.name,
          locationData?.metadata
        );
        publishedPage = await contentPublisher.publishLocationPage(
          item.location_slug,
          locationData?.name,
          content,
          locationData?.metadata
        );
      } else if (item.content_type === 'industry') {
        content = await aiContentGenerator.generateIndustryPage(
          item.industry_slug,
          industryData?.name,
          industryData?.metadata
        );
        publishedPage = await contentPublisher.publishIndustryPage(
          item.industry_slug,
          industryData?.name,
          content
        );
      } else if (item.content_type === 'combo') {
        content = await aiContentGenerator.generateComboPage(
          item.location_slug,
          item.industry_slug,
          locationData?.name,
          industryData?.name,
          locationData?.metadata,
          industryData?.metadata
        );
        publishedPage = await contentPublisher.publishComboPage(
          item.location_slug,
          item.industry_slug,
          locationData?.name,
          industryData?.name,
          content
        );
      } else {
        throw new Error(`Unknown content type: ${item.content_type}`);
      }

      await queueManager.markAsCompleted(item.id, publishedPage?.id);
      results.success++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[SEO Cron] Failed processing queue item ${item.id}:`, message);
      await queueManager.markAsFailed(item.id, message);
      results.failed++;
    }
  }

  return results;
}

async function runSeoGenerationOnce(options = {}) {
  if (isRunning) {
    console.log('[SEO Cron] Skipping run (already running)');
    return { skipped: true };
  }

  const {
    batchSize = Number(process.env.SEO_CRON_BATCH_SIZE || 10),
    autoPopulate = process.env.SEO_CRON_AUTO_POPULATE === 'true',
    populateMaxPriority = Number(process.env.SEO_CRON_POPULATE_MAX_PRIORITY || 3),
  } = options;

  isRunning = true;
  const startedAt = new Date();

  try {
    if (autoPopulate) {
      try {
        await queueManager.populateFromSeedData({
          contentTypes: ['location', 'industry', 'combo'],
          maxPriority: populateMaxPriority
        });
      } catch (e) {
        console.error('[SEO Cron] Failed to populate queue:', e);
      }
    }

    const results = await processQueueBatch(batchSize);
    console.log('[SEO Cron] Run complete:', {
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      ...results,
    });
    return results;
  } finally {
    isRunning = false;
  }
}

function startSeoContentGenerationJob() {
  if (process.env.ENABLE_SEO_CRON !== 'true') {
    console.log('[SEO Cron] Disabled (set ENABLE_SEO_CRON=true to enable)');
    return;
  }

  const schedule = process.env.SEO_CRON_SCHEDULE || '0 2 * * *'; // 2am UTC
  const timezone = process.env.SEO_CRON_TIMEZONE || 'UTC';

  console.log(`[SEO Cron] Scheduling SEO generation: "${schedule}" (${timezone})`);

  cron.schedule(schedule, () => {
    runSeoGenerationOnce().catch((e) => {
      console.error('[SEO Cron] Unhandled error:', e);
    });
  }, { timezone });

  if (process.env.SEO_CRON_RUN_ON_STARTUP === 'true') {
    runSeoGenerationOnce().catch((e) => {
      console.error('[SEO Cron] Startup run failed:', e);
    });
  }
}

module.exports = {
  startSeoContentGenerationJob,
  runSeoGenerationOnce,
};

