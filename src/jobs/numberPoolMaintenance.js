/**
 * Number Pool Maintenance Job
 *
 * Runs periodically to:
 * 1. Clean up expired reservations
 * 2. Recycle released numbers back to the pool
 */

const cron = require('node-cron');
const {
  cleanupExpiredReservations,
  recycleReleasedNumbers,
  getPoolStats,
} = require('../services/numberPool');

let isRunning = false;

/**
 * Run the maintenance tasks
 */
async function runMaintenance() {
  if (isRunning) {
    console.log('[NumberPoolMaintenance] Already running, skipping');
    return;
  }

  isRunning = true;

  try {
    console.log('[NumberPoolMaintenance] Starting maintenance run');

    // Clean up expired reservations
    const expiredCount = await cleanupExpiredReservations();

    // Recycle released numbers (24 hour cooldown)
    const recycledCount = await recycleReleasedNumbers(24);

    // Log pool stats
    const stats = await getPoolStats();

    console.log('[NumberPoolMaintenance] Completed:', {
      expiredReservationsCleared: expiredCount,
      numbersRecycled: recycledCount,
      poolStats: {
        total: stats.total,
        available: stats.available,
        assigned: stats.assigned,
        reserved: stats.reserved,
      },
    });

    // Alert if pool is running low
    if (stats.available < 3) {
      console.warn('[NumberPoolMaintenance] WARNING: Low pool availability!', {
        available: stats.available,
        byRegion: stats.byRegion,
      });
      // TODO: Send admin notification
    }
  } catch (error) {
    console.error('[NumberPoolMaintenance] Error:', error);
  } finally {
    isRunning = false;
  }
}

/**
 * Start the number pool maintenance job
 * Runs every 5 minutes
 */
function startNumberPoolMaintenanceJob() {
  // Run immediately on startup
  runMaintenance();

  // Then run every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    runMaintenance();
  });

  console.log('[NumberPoolMaintenance] Job scheduled to run every 5 minutes');
}

module.exports = {
  startNumberPoolMaintenanceJob,
  runMaintenance,
};
