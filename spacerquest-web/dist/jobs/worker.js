/**
 * SpacerQuest v4.0 - Background Worker
 *
 * Runs background jobs on schedule:
 * - Daily tick: Midnight UTC
 * - Encounter generation: Every 5 minutes
 * - Mission generation: Every 6 hours
 */
import { runDailyTick } from './daily-tick.js';
import { runEncounterJob } from './encounter-generation.js';
import { runMissionJob } from './mission-generation.js';
console.log('🚀 SpacerQuest v4.0 Background Worker starting...');
// Daily tick - runs at midnight UTC
function scheduleDailyTick() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    console.log(`[Scheduler] Daily tick scheduled in ${Math.floor(msUntilMidnight / 1000 / 60)} minutes`);
    setTimeout(async () => {
        try {
            await runDailyTick();
        }
        catch (error) {
            console.error('[Scheduler] Daily tick failed:', error);
        }
        // Schedule next daily tick
        scheduleDailyTick();
    }, msUntilMidnight);
}
// Encounter generation - every 5 minutes
setInterval(async () => {
    try {
        console.log('[Scheduler] Running encounter generation...');
        await runEncounterJob();
    }
    catch (error) {
        console.error('[Scheduler] Encounter generation failed:', error);
    }
}, 5 * 60 * 1000); // 5 minutes
// Mission generation - every 6 hours
setInterval(async () => {
    try {
        console.log('[Scheduler] Running mission generation...');
        await runMissionJob();
    }
    catch (error) {
        console.error('[Scheduler] Mission generation failed:', error);
    }
}, 6 * 60 * 60 * 1000); // 6 hours
// Start the daily tick scheduler
scheduleDailyTick();
// Keep the process running
console.log('✅ Background worker running. Press Ctrl+C to stop.');
// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Background worker shutting down...');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.log('\n👋 Background worker shutting down...');
    process.exit(0);
});
//# sourceMappingURL=worker.js.map