import { GameState, NpcState } from './types.js';
import { NPC_PROFILES, Stat } from '@spacerquest/content';

export function createInitialState(seed: number): GameState {
  // Initialize the cast
  const npcs: NpcState[] = NPC_PROFILES.map((p, index) => ({
    id: p.id,
    name: p.name,
    profileId: p.id,
    currentSystemId: (index % 20) + 1, // Spread them out
    credits: 5000,
    fuel: 1000,
  }));

  return {
    day: 1,
    rngState: seed,
    player: {
      // Tour One opening position (PRD §5.1): pocket money plus a 25,000cr
      // Merchant Guild debt due on day 30 — tracked as a ledger, never as a
      // negative balance.
      credits: 1000,
      debt: 25000,
      debtDueDay: 30,
      stats: {
        [Stat.PILOT]: 1,
        [Stat.GUNS]: 0,
        [Stat.TRADE]: 1,
        [Stat.GRIT]: 1,
        [Stat.GUILE]: 0,
      },
      currentSystemId: 1, // Sun-3
      ship: {
        fuel: 300,
        maxFuel: 10000,
        cargoPods: 10,
        hull: { strength: 1, condition: 9 },
        drives: { strength: 10, condition: 9 },
        weapons: { strength: 1, condition: 9 },
        shields: { strength: 1, condition: 9 },
        navigation: { strength: 10, condition: 9 },
        lifeSupport: { strength: 10, condition: 9 },
        robotics: { strength: 10, condition: 9 },
        cabin: { strength: 1, condition: 9 },
      }
    },
    market: {
      manifestBoard: [],
      localFuelPrice: 5
    },
    npcs,
    eventLog: [],
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): GameState {
  return JSON.parse(json) as GameState;
}
