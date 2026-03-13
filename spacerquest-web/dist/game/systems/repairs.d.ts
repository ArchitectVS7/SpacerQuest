/**
 * SpacerQuest v4.0 - Repairs System (SP.DAMAGE.S)
 */
export declare function repairAllComponents(characterId: string): Promise<{
    success: boolean;
    error: string;
    cost?: undefined;
    message?: undefined;
} | {
    success: boolean;
    cost: number;
    message: string;
    error?: undefined;
}>;
//# sourceMappingURL=repairs.d.ts.map