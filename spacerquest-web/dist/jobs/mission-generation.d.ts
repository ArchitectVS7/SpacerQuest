/**
 * SpacerQuest v4.0 - Mission Generation Job
 *
 * Runs every 6 hours to:
 * - Generate patrol missions
 * - Check Nemesis/Maligna eligibility
 * - Generate special events
 */
export interface MissionJobResult {
    patrolMissionsGenerated: number;
    nemesisOffers: number;
    specialEvents: number;
}
/**
 * Run the mission generation job
 */
export declare function runMissionJob(): Promise<MissionJobResult>;
//# sourceMappingURL=mission-generation.d.ts.map