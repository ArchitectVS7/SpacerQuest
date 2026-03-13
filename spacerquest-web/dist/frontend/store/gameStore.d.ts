/**
 * SpacerQuest v4.0 - Game State Store
 *
 * Zustand-based state management for game state, character data, and UI
 */
export type Rank = 'LIEUTENANT' | 'COMMANDER' | 'CAPTAIN' | 'COMMODORE' | 'ADMIRAL' | 'TOP_DOG' | 'GRAND_MUFTI' | 'MEGA_HERO' | 'GIGA_HERO';
export type AllianceType = 'NONE' | 'ASTRO_LEAGUE' | 'SPACE_DRAGONS' | 'WARLORD_CONFED' | 'REBEL_ALLIANCE';
export interface Character {
    id: string;
    spacerId: number;
    name: string;
    shipName: string;
    allianceSymbol: AllianceType;
    rank: Rank;
    score: number;
    creditsHigh: number;
    creditsLow: number;
    currentSystem: number;
    tripCount: number;
    tripsCompleted: number;
    battlesWon: number;
    battlesLost: number;
    cargoPods: number;
    cargoType: number;
    destination: number;
    missionType: number;
}
export interface Ship {
    hullStrength: number;
    hullCondition: number;
    driveStrength: number;
    driveCondition: number;
    cabinStrength: number;
    cabinCondition: number;
    lifeSupportStrength: number;
    lifeSupportCondition: number;
    weaponStrength: number;
    weaponCondition: number;
    navigationStrength: number;
    navigationCondition: number;
    roboticsStrength: number;
    roboticsCondition: number;
    shieldStrength: number;
    shieldCondition: number;
    fuel: number;
    cargoPods: number;
    maxCargoPods: number;
    hasCloaker: boolean;
    hasAutoRepair: boolean;
    hasStarBuster: boolean;
    hasArchAngel: boolean;
    isAstraxialHull: boolean;
}
export interface TravelState {
    inTransit: boolean;
    progress: number;
    timeRemaining: number;
    origin?: number;
    destination?: number;
}
export interface CombatState {
    inCombat: boolean;
    enemy?: {
        type: string;
        class: string;
        name: string;
        commander: string;
        battleFactor: number;
    };
    round: number;
    playerBattleFactor: number;
}
export type InputMode = 'COMMAND' | 'CONFIRM' | 'INPUT' | 'COMBAT';
export interface GameState {
    isAuthenticated: boolean;
    token: string | null;
    userId: string | null;
    character: Character | null;
    ship: Ship | null;
    currentSystem: number;
    dailyTripsRemaining: number;
    inCombat: boolean;
    inTransit: boolean;
    travelProgress: number;
    combatState: CombatState | null;
    travelState: TravelState | null;
    currentScreen: string;
    inputMode: InputMode;
    terminalBuffer: string[];
    pendingAction: string | null;
    setAuthenticated: (token: string, userId: string) => void;
    logout: () => void;
    setCharacter: (character: Character) => void;
    setShip: (ship: Ship) => void;
    setCurrentSystem: (systemId: number) => void;
    setDailyTripsRemaining: (trips: number) => void;
    setInCombat: (inCombat: boolean) => void;
    setCombatState: (state: CombatState | null) => void;
    setInTransit: (inTransit: boolean) => void;
    setTravelProgress: (progress: number) => void;
    setTravelState: (state: TravelState | null) => void;
    setCurrentScreen: (screen: string) => void;
    setInputMode: (mode: InputMode) => void;
    appendToTerminal: (text: string) => void;
    clearTerminal: () => void;
    setPendingAction: (action: string | null) => void;
}
export declare const useGameStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<GameState>, "setState" | "persist"> & {
    setState(partial: GameState | Partial<GameState> | ((state: GameState) => GameState | Partial<GameState>), replace?: false): unknown;
    setState(state: GameState | ((state: GameState) => GameState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<GameState, {
            token: string;
            userId: string;
            isAuthenticated: boolean;
        }, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: GameState) => void) => () => void;
        onFinishHydration: (fn: (state: GameState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<GameState, {
            token: string;
            userId: string;
            isAuthenticated: boolean;
        }, unknown>>;
    };
}>;
//# sourceMappingURL=gameStore.d.ts.map