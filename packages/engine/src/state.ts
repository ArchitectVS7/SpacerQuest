import { DayPhase, EarnedDeedState, GameEvent, GameState, NpcState } from './types.js';
import {
  NPC_PROFILES,
  RENOWN_DEED_THRESHOLDS,
  RENOWN_RANKS,
  Stat,
  type RenownRankId,
} from '@spacerquest/content';

const RENOWN_RANK_ORDER = Object.keys(RENOWN_RANKS) as RenownRankId[];

function renownRankForDeedCount(deedCount: number): RenownRankId {
  let rank: RenownRankId = 'LIEUTENANT';
  for (const candidate of RENOWN_RANK_ORDER) {
    if (deedCount >= RENOWN_DEED_THRESHOLDS[candidate]) {
      rank = candidate;
    }
  }
  return rank;
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
  }));

  return {
    day: 1,
    rngState: seed,
    dayPhase: DayPhase.DAWN,
    dayEventCount: 0,
    player: {
      // Tour One opening position (PRD §5.1): pocket money plus a 25,000cr
      // Merchant Guild debt due on day 30 — tracked as a ledger, never as a
      // negative balance.
      credits: 1000,
      score: 0,
      isConqueror: false,
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
        hasTransWarpDrive: false,
        hasCloaker: false,
        hasAutoRepair: false,
        hasStarBuster: false,
        hasArchAngel: false,
        isAstraxialHull: false,
        hasTitaniumHull: false,
      },
      registry: {
        earned: [],
        renownRank: 'LIEUTENANT',
      },
    },
    market: {
      manifestBoard: [],
      localFuelPrice: 5,
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
  parsed.eventLog ??= [];
  parsed.player.tier ??= 1;
  parsed.player.score ??= 0;
  parsed.player.isConqueror ??= false;
  if (parsed.player.registry === undefined) {
    parsed.player.registry = {
      earned: reconstructEarnedDeeds(parsed.eventLog),
      renownRank: 'LIEUTENANT',
    };
  } else if (parsed.player.registry.earned === undefined) {
    parsed.player.registry.earned = reconstructEarnedDeeds(parsed.eventLog);
  }
  parsed.player.registry.renownRank = renownRankForDeedCount(parsed.player.registry.earned.length);
  parsed.player.ship.hasTransWarpDrive ??= false;
  parsed.player.ship.hasCloaker ??= false;
  parsed.player.ship.hasAutoRepair ??= false;
  parsed.player.ship.hasStarBuster ??= false;
  parsed.player.ship.hasArchAngel ??= false;
  parsed.player.ship.isAstraxialHull ??= false;
  parsed.player.ship.hasTitaniumHull ??= false;
  parsed.encounter ??= null;
  return parsed;
}
