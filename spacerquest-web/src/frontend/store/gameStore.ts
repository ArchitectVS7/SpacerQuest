/**
 * SpacerQuest v4.0 - Game State Store
 * 
 * Zustand-based state management for game state, character data, and UI
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export type Rank = 
  | 'LIEUTENANT' | 'COMMANDER' | 'CAPTAIN' | 'COMMODORE' | 'ADMIRAL'
  | 'TOP_DOG' | 'GRAND_MUFTI' | 'MEGA_HERO' | 'GIGA_HERO';

export type AllianceType = 
  | 'NONE' | 'ASTRO_LEAGUE' | 'SPACE_DRAGONS' | 'WARLORD_CONFED' | 'REBEL_ALLIANCE';

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

// ============================================================================
// STORE STATE
// ============================================================================

export interface GameState {
  // Authentication
  isAuthenticated: boolean;
  token: string | null;
  userId: string | null;

  // Character & Ship
  character: Character | null;
  ship: Ship | null;
  currentSystem: number;
  dailyTripsRemaining: number;

  // Game State
  inCombat: boolean;
  inTransit: boolean;
  travelProgress: number;
  combatState: CombatState | null;
  travelState: TravelState | null;

  // UI State
  currentScreen: string;
  inputMode: InputMode;
  terminalBuffer: string[];
  pendingAction: string | null;

  // Actions
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

// ============================================================================
// STORE CREATION
// ============================================================================

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // Initial State
      isAuthenticated: false,
      token: null,
      userId: null,
      character: null,
      ship: null,
      currentSystem: 1,
      dailyTripsRemaining: 3,
      inCombat: false,
      inTransit: false,
      travelProgress: 0,
      combatState: null,
      travelState: null,
      currentScreen: 'login',
      inputMode: 'COMMAND',
      terminalBuffer: [],
      pendingAction: null,

      // Authentication Actions
      setAuthenticated: (token, userId) => set({ 
        isAuthenticated: true, 
        token, 
        userId,
        currentScreen: 'main-menu'
      }),
      
      logout: () => set({ 
        isAuthenticated: false, 
        token: null, 
        userId: null,
        character: null,
        ship: null,
        currentScreen: 'login'
      }),

      // Character Actions
      setCharacter: (character) => set({ character }),
      setShip: (ship) => set({ ship }),
      setCurrentSystem: (systemId) => set({ currentSystem: systemId }),
      setDailyTripsRemaining: (trips) => set({ dailyTripsRemaining: trips }),

      // Combat Actions
      setInCombat: (inCombat) => set({ inCombat }),
      setCombatState: (state) => set({ combatState: state }),

      // Travel Actions
      setInTransit: (inTransit) => set({ inTransit }),
      setTravelProgress: (progress) => set({ travelProgress: progress }),
      setTravelState: (state) => set({ travelState: state }),

      // UI Actions
      setCurrentScreen: (screen) => set({ currentScreen: screen }),
      setInputMode: (mode) => set({ inputMode: mode }),
      
      appendToTerminal: (text) => set((state) => ({
        terminalBuffer: [...state.terminalBuffer, ...text.split('\n')]
      })),
      
      clearTerminal: () => set({ terminalBuffer: [] }),
      setPendingAction: (action) => set({ pendingAction: action }),
    }),
    {
      name: 'spacerquest-storage',
      partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
