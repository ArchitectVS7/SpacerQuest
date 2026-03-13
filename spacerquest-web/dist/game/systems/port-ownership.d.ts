/**
 * SpacerQuest v4.0 - Port Ownership System (SP.REAL.S)
 */
export declare function buyPort(characterId: string, systemId: number): Promise<{
    success: boolean;
    error: string;
    message?: undefined;
} | {
    success: boolean;
    message: string;
    error?: undefined;
}>;
export declare function collectPortDividends(characterId: string, systemId: number): Promise<{
    success: boolean;
    error: string;
}>;
//# sourceMappingURL=port-ownership.d.ts.map