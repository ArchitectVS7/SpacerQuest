import { DayPhase, EarnedDeedState, GameEvent, GameState, NpcState, ShipState } from './types.js';
import { NPC_PROFILES, Stat } from '@spacerquest/content';
import { computeMatchCounts, rankForDeedCount } from './deeds.js';

/** The exact junker every spacer starts (and re-starts) with. SINGLE SOURCE OF
 *  TRUTH: createInitialState builds the opening ship from this, and T-108
 *  succession resets a lost ship back to it — the two must never drift. */
export function starterShip(): ShipState {
  return {
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
    hasTransWarpDrive: false,
    hasCloaker: false,
    hasAutoRepair: false,
    hasStarBuster: false,
    hasArchAngel: false,
    isAstraxialHull: false,
    hasTitaniumHull: false,
  };
}

function reconstructEarnedDeeds(eventLog: readonly GameEvent[]): EarnedDeedState[] {
  const seen = new Set<string>();
  const earned: EarnedDeedState[] = [];

  eventLog.forEach((event, index) => {
    if (event.type !== 'DeedEarned' || seen.has(event.deedId)) {
      return;
    }

    seen.add(event.deedId);
    earned.push({
      id: event.deedId,
      title: event.title,
      citation: event.citation,
      day: event.day,
      eventIndex: index,
    });
  });

  return earned;
}

export function createInitialState(seed: number): GameState {
  // Initialize the cast
  const npcs: NpcState[] = NPC_PROFILES.map((p, index) => ({
    id: p.id,
    name: p.name,
    profileId: p.id,
    currentSystemId: (index % 20) + 1, // Spread them out
    credits: 5000,
    fuel: 1000,
    disposition: 0,
  }));

  return {
    day: 1,
    rngState: seed,
    dayPhase: DayPhase.DAWN,
    dayEventCount: 0,
    era: 'TOUR_ONE',
    flags: {},
    storylets: {
      available: [],
      completed: {},
      scheduled: [],
      offeredToday: [],
    },
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
      tier: 1,
      currentSystemId: 1, // Sun-3
      ship: starterShip(),
      registry: {
        earned: [],
        renownRank: 'LIEUTENANT',
        matchCounts: {},
      },
      // Charts seed with the starting system — the spacer knows where they woke
      // up. Every subsequent arrival appends here (T-108 persistent knowledge).
      charts: { visitedSystemIds: [1] },
      legacy: { successionCount: 0 },
    },
    market: {
      manifestBoard: [],
      localFuelPrice: 5,
      npcClaims: 0,
    },
    npcs,
    encounter: null,
    eventLog: [],
  };
}

export function serializeState(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeState(json: string): GameState {
  const parsed = JSON.parse(json) as GameState;
  parsed.dayPhase ??= DayPhase.DAWN;
  parsed.dayEventCount ??= 0;
  parsed.era ??= 'TOUR_ONE';
  parsed.flags ??= {};
  parsed.storylets ??= {
    available: [],
    completed: {},
    scheduled: [],
    offeredToday: [],
  };
  parsed.storylets.available ??= [];
  parsed.storylets.completed ??= {};
  parsed.storylets.scheduled ??= [];
  parsed.storylets.offeredToday ??= [];
  parsed.eventLog ??= [];
  parsed.player.tier ??= 1;
  if (parsed.player.registry === undefined) {
    parsed.player.registry = {
      earned: reconstructEarnedDeeds(parsed.eventLog),
      renownRank: 'LIEUTENANT',
      matchCounts: computeMatchCounts(parsed.eventLog),
    };
  } else {
    if (parsed.player.registry.earned === undefined) {
      parsed.player.registry.earned = reconstructEarnedDeeds(parsed.eventLog);
    }
    parsed.player.registry.matchCounts ??= computeMatchCounts(parsed.eventLog);
  }
  parsed.player.registry.renownRank = rankForDeedCount(parsed.player.registry.earned.length);
  parsed.player.ship.hasTransWarpDrive ??= false;
  parsed.player.ship.hasCloaker ??= false;
  parsed.player.ship.hasAutoRepair ??= false;
  parsed.player.ship.hasStarBuster ??= false;
  parsed.player.ship.hasArchAngel ??= false;
  parsed.player.ship.isAstraxialHull ??= false;
  parsed.player.ship.hasTitaniumHull ??= false;
  // Save-compat: pre-T-108 fixtures have no charts/legacy. Seed charts with the
  // spacer's current system (they demonstrably know where they are) and start
  // the succession counter at 0.
  parsed.player.charts ??= { visitedSystemIds: [parsed.player.currentSystemId] };
  parsed.player.charts.visitedSystemIds ??= [parsed.player.currentSystemId];
  parsed.player.legacy ??= { successionCount: 0 };
  parsed.player.legacy.successionCount ??= 0;
  parsed.npcs ??= [];
  parsed.npcs.forEach((npc) => {
    npc.disposition ??= 0;
  });
  parsed.market.npcClaims ??= 0;
  parsed.encounter ??= null;
  return parsed;
}
