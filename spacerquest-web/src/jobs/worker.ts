/**
 * SpacerQuest v4.0 - Background Worker
 *
 * Runs background jobs on schedule:
 * - Daily tick: Midnight UTC (reset trips, collect port income)
 * - Encounter generation: Every 5 minutes (bot combats, takeovers)
 * - Mission generation: Every 6 hours (patrol missions, Nemesis)
 *
 * Usage:
 *   npm run worker              # Run worker
 *   npm run worker:once         # Run all jobs once (for testing)
 */

import { runDailyTick } from './daily-tick.js';
import { runEncounterJob } from './encounter-generation.js';
import { runMissionJob } from './mission-generation.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  encounterInterval: 5 * 60 * 1000,    // 5 minutes
  missionInterval: 6 * 60 * 60 * 1000,  // 6 hours
  healthCheckPort: parseInt(process.env.WORKER_HEALTH_PORT || '3001'),
  logLevel: process.env.WORKER_LOG_LEVEL || 'info',
};

// ============================================================================
// LOGGING
// ============================================================================

const log = {
  info: (msg: string) => {
    if (CONFIG.logLevel !== 'silent') {
      console.log(`[${new Date().toISOString()}] [INFO] ${msg}`);
    }
  },
  error: (msg: string, err?: any) => {
    console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`, err || '');
  },
  warn: (msg: string) => {
    console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`);
  },
};

// ============================================================================
// HEALTH CHECK SERVER
// ============================================================================

const healthStatus = {
  status: 'starting',
  uptime: process.uptime(),
  lastDailyTick: null as Date | null,
  lastEncounterJob: null as Date | null,
  lastMissionJob: null as Date | null,
  errors: [] as string[],
};

async function startHealthServer() {
  const http = await import('http');
  
  const server = http.default.createServer((req: any, res: any) => {
    if (req.url === '/health') {
      healthStatus.status = 'healthy';
      healthStatus.uptime = process.uptime();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthStatus, null, 2));
    } else if (req.url === '/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ready: true }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  server.listen(CONFIG.healthCheckPort, () => {
    log.info(`Health server listening on port ${CONFIG.healthCheckPort}`);
  });

  return server;
}

// ============================================================================
// JOB SCHEDULERS
// ============================================================================

function scheduleDailyTick() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  const minutesUntil = Math.floor(msUntilMidnight / 1000 / 60);

  log.info(`Daily tick scheduled in ${minutesUntil} minutes (at ${tomorrow.toISOString()})`);

  setTimeout(async () => {
    try {
      log.info('Running daily tick...');
      const result = await runDailyTick();
      healthStatus.lastDailyTick = new Date();
      log.info(`Daily tick completed: ${result.tripsReset} trips reset, ${result.portsProcessed} ports processed`);
    } catch (error) {
      healthStatus.errors.push(`Daily tick failed: ${error}`);
      log.error('Daily tick failed', error);
    }

    // Schedule next daily tick
    scheduleDailyTick();
  }, msUntilMidnight);
}

function scheduleEncounterJob() {
  log.info(`Encounter job scheduled every ${CONFIG.encounterInterval / 1000 / 60} minutes`);

  setInterval(async () => {
    try {
      log.info('Running encounter generation...');
      const result = await runEncounterJob();
      healthStatus.lastEncounterJob = new Date();
      log.info(`Encounter job completed: ${result.botCombats} bot combats, ${result.takeoverAttempts} takeover attempts`);
    } catch (error) {
      healthStatus.errors.push(`Encounter job failed: ${error}`);
      log.error('Encounter job failed', error);
    }
  }, CONFIG.encounterInterval);
}

function scheduleMissionJob() {
  log.info(`Mission job scheduled every ${CONFIG.missionInterval / 1000 / 60 / 60} hours`);

  setInterval(async () => {
    try {
      log.info('Running mission generation...');
      const result = await runMissionJob();
      healthStatus.lastMissionJob = new Date();
      log.info(`Mission job completed: ${result.patrolMissionsGenerated} patrol missions, ${result.nemesisOffers} Nemesis offers`);
    } catch (error) {
      healthStatus.errors.push(`Mission job failed: ${error}`);
      log.error('Mission job failed', error);
    }
  }, CONFIG.missionInterval);
}

// ============================================================================
// RUN ALL JOBS ONCE (FOR TESTING)
// ============================================================================

export async function runAllJobsOnce() {
  log.info('Running all jobs once (test mode)...');
  
  try {
    log.info('Running daily tick...');
    const dailyResult = await runDailyTick();
    log.info(`Daily tick: ${dailyResult.tripsReset} trips, ${dailyResult.portsProcessed} ports`);
  } catch (error) {
    log.error('Daily tick failed', error);
  }

  try {
    log.info('Running encounter generation...');
    const encounterResult = await runEncounterJob();
    log.info(`Encounters: ${encounterResult.botCombats} combats, ${encounterResult.takeoverAttempts} takeovers`);
  } catch (error) {
    log.error('Encounter job failed', error);
  }

  try {
    log.info('Running mission generation...');
    const missionResult = await runMissionJob();
    log.info(`Missions: ${missionResult.patrolMissionsGenerated} patrol, ${missionResult.nemesisOffers} Nemesis`);
  } catch (error) {
    log.error('Mission job failed', error);
  }

  log.info('All jobs completed');
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once') || args.includes('-o');

  log.info('🚀 SpacerQuest v4.0 Background Worker starting...');
  log.info(`Configuration: encounters=${CONFIG.encounterInterval/1000}s, missions=${CONFIG.missionInterval/1000}s`);

  // Start health server
  const healthServer = await startHealthServer();

  if (runOnce) {
    // Run all jobs once and exit
    await runAllJobsOnce();
    log.info('Test run complete, shutting down...');
    healthServer.close();
    process.exit(0);
    return;
  }

  // Start scheduled jobs
  scheduleDailyTick();
  scheduleEncounterJob();
  scheduleMissionJob();

  log.info('✅ Background worker running. Press Ctrl+C to stop.');
  log.info(`📊 Health check: http://localhost:${CONFIG.healthCheckPort}/health`);
}

// Handle graceful shutdown
function shutdown(signal: string) {
  log.info(`\n👋 Received ${signal}, shutting down gracefully...`);
  healthStatus.status = 'shutting_down';
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', error);
  healthStatus.errors.push(`Uncaught exception: ${error}`);
});

// Start the worker
main();
