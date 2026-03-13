/**
 * SpacerQuest v4.0 - Docking System (SP.DOCK1.S)
 */
export declare function processDocking(characterId: string, systemId: number): Promise<{
    success: boolean;
    error: string;
    message?: undefined;
} | {
    success: boolean;
    message: string;
    error?: undefined;
}>;
//# sourceMappingURL=docking.d.ts.map