/**
 * SpacerQuest v4.0 - Alliance System
 *
 * Implements SP.VEST.S (Investing in Alliance, DEFCON, Takeovers)
 */
export declare function investInAlliance(characterId: string, amount: number): Promise<{
    success: boolean;
    error: string;
    newBalance?: undefined;
} | {
    success: boolean;
    newBalance: number;
    error?: undefined;
}>;
export declare function withdrawFromAlliance(characterId: string, amount: number): Promise<{
    success: boolean;
    error: string;
    withdrawn?: undefined;
} | {
    success: boolean;
    withdrawn: number;
    error?: undefined;
}>;
export declare function investInDefcon(characterId: string, systemId: number, levels: number): Promise<{
    success: boolean;
    error: string;
    message?: undefined;
} | {
    success: boolean;
    message: string;
    error?: undefined;
}>;
//# sourceMappingURL=alliance.d.ts.map