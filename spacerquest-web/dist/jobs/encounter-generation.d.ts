/**
 * SpacerQuest v4.0 - Encounter Generation Job
 *
 * Runs every 5 minutes to:
 * - Generate bot-vs-bot combats
 * - Process port takeover attempts
 * - Update fuel prices based on supply/demand
 */
export interface EncounterJobResult {
    botCombats: number;
    takeoverAttempts: number;
    successfulTakeovers: number;
    priceUpdates: number;
}
/**
 * Run the encounter generation job
 */
export declare function runEncounterJob(): Promise<EncounterJobResult>;
//# sourceMappingURL=encounter-generation.d.ts.map