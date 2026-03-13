/**
 * SpacerQuest v4.0 - Upgrades System (SP.SPEED.S)
 */
export declare function upgradeShipComponent(characterId: string, component: string, upgradeType: 'STRENGTH' | 'CONDITION'): Promise<{
    success: boolean;
    error: string;
    cost?: undefined;
    newStrength?: undefined;
    newCondition?: undefined;
} | {
    success: boolean;
    cost: number;
    newStrength: number;
    newCondition: number;
    error?: undefined;
}>;
//# sourceMappingURL=upgrades.d.ts.map