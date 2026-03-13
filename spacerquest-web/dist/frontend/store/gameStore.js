/**
 * SpacerQuest v4.0 - Game State Store
 *
 * Zustand-based state management for game state, character data, and UI
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
// ============================================================================
// STORE CREATION
// ============================================================================
export const useGameStore = create()(persist((set, get) => ({
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
}), {
    name: 'spacerquest-storage',
    partialize: (state) => ({
        token: state.token,
        userId: state.userId,
        isAuthenticated: state.isAuthenticated,
    }),
}));
//# sourceMappingURL=gameStore.js.map