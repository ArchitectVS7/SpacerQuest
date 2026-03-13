/**
 * SpacerQuest v4.0 - Character Registry System (SP.REG.S)
 */
export declare function registerCharacter(userId: string, name: string, shipName: string): Promise<{
    success: boolean;
    error: string;
    character?: undefined;
} | {
    success: boolean;
    character: {
        id: string;
        spacerId: number;
        name: string;
        shipName: string | null;
        allianceSymbol: import(".prisma/client").$Enums.AllianceType;
        creditsHigh: number;
        creditsLow: number;
        rank: import(".prisma/client").$Enums.Rank;
        score: number;
        promotions: number;
        tripsCompleted: number;
        astrecsTraveled: number;
        cargoDelivered: number;
        battlesWon: number;
        battlesLost: number;
        rescuesPerformed: number;
        currentSystem: number;
        tripCount: number;
        lastTripDate: Date | null;
        missionType: number;
        cargoPods: number;
        cargoType: number;
        cargoPayment: number;
        destination: number;
        cargoManifest: string | null;
        isConqueror: boolean;
        isLost: boolean;
        lostLocation: number | null;
        patrolSector: number | null;
        createdAt: Date;
        updatedAt: Date;
        userId: string;
    };
    error?: undefined;
}>;
//# sourceMappingURL=registry.d.ts.map