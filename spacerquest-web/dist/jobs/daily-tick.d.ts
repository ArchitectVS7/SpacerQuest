/**
 * SpacerQuest v4.0 - Daily Tick Job
 *
 * Runs at midnight UTC daily to:
 * - Reset trip counters for all players
 * - Collect port income
 * - Evict inactive port owners
 * - Generate daily news
 */
export interface DailyTickResult {
    date: string;
    tripsReset: number;
    portsProcessed: number;
    totalIncomeCollected: number;
    portsEvicted: number;
    promotionsGranted: number;
    newsGenerated: string[];
}
/**
 * Run the daily tick
 */
export declare function runDailyTick(): Promise<DailyTickResult>;
/**
 * Reset daily landing fees and fuel sales tracking
 * Called after income is collected
 */
export declare function resetDailyPortTracking(): Promise<void>;
//# sourceMappingURL=daily-tick.d.ts.map