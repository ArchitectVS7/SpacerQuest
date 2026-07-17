import { DayPhase, EarnedDeedState, GameEvent, GameState, NpcState, ShipState } from './types.js';
import { NPC_PROFILES, Stat } from '@spacerquest/content';
import { computeMatchCounts, rankForDeedCount } from './deeds.js';
import { calculateFuelCapacity, syncMaxFuel } from './economy.js';
import { computePlayerTier, syncPlayerTier } from './tier.js';

/** The exact junker every spacer starts (and re-starts) with. SINGLE SOURCE OF
 *  TRUTH: createInitialState builds the opening ship from this, and T-108
 *  succession resets a lost ship back to it — the two must never drift. */
export function starterShip(): ShipState {
  return {
    fuel: 300,
    // T-1102: derived from the junker hull (strength 1, condition 9) via the
    // hull-capacity formula → 300, not the old hardcoded 10,000. PRD §7.1: the
    // fresh tank carries ~300, exactly two starter jumps' worth of scarcity.
    maxFuel: calculateFuelCapacity(1, 9),
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
      // T-1304: no Penny Wise loan at the start of a run.
      loan: null,
      // T-1306: no crew at the start of a run — a Day-1 spacer rolls the base
      // 5-die dawn hand (dice.ts dawnDiceModifiers of an empty crew).
      crew: [],
      // T-1307: a fresh spacer owns no port — the first stake is bought later once
      // the veteran clears the price (PRD §9).
      ports: [],
      // T-1503: a fresh spacer holds neutral standing with all four galactic
      // powers — reputation is earned/spent through organic play + questlines.
      reputation: { league: 0, dragons: 0, confederation: 0, rebels: 0 },
      stats: {
        [Stat.PILOT]: 1,
        [Stat.GUNS]: 0,
        [Stat.TRADE]: 1,
        [Stat.GRIT]: 1,
        [Stat.GUILE]: 0,
      },
      // T-1203: derived from the opening rank + junker fit rather than a magic
      // literal — computePlayerTier('LIEUTENANT', junker) resolves to 1, so the
      // starting band is unchanged, but the field is honest to the formula that
      // every later write site (day.ts, legacy.ts, deserialize) recomputes.
      tier: computePlayerTier('LIEUTENANT', starterShip()),
      currentSystemId: 1, // Sun-3
      ship: starterShip(),
      registry: {
        earned: [],
        renownRank: 'LIEUTENANT',
        matchCounts: {},
      },
      // Charts seed with the starting system — the spacer knows where they woke
      // up. Every subsequent arrival appends here (T-108 persistent knowledge).
      charts: { visitedSystemIds: [1], discoveredPois: [] },
      // The Nemesis file starts empty — the first fragment is the Day-30 Wise One
      // hook (PRD §5.1). Knowledge that will survive death (T-111b).
      nemesisFile: { fragments: [] },
      legacy: { successionCount: 0 },
    },
    market: {
      manifestBoard: [],
      localFuelPrice: 5,
      npcClaims: 0,
    },
    npcs,
    encounter: null,
    eraEvent: null,
    lastEraEventEndedDay: 0,
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
  // T-1203 save round-trip: `parsed.player.tier` above defaulted stale/legacy
  // saves to 1, but a carried registry (rank) + ship fit determine the real
  // band. Resync AFTER the renownRank reconstruction so a loaded save's tier
  // reflects its earned rank + current ship, not a defaulted or stale value.
  syncPlayerTier(parsed);
  parsed.player.ship.hasTransWarpDrive ??= false;
  parsed.player.ship.hasCloaker ??= false;
  parsed.player.ship.hasAutoRepair ??= false;
  parsed.player.ship.hasStarBuster ??= false;
  parsed.player.ship.hasArchAngel ??= false;
  parsed.player.ship.isAstraxialHull ??= false;
  parsed.player.ship.hasTitaniumHull ??= false;
  // T-1102 fuel-capacity migration: `maxFuel` is now derived from the hull, not
  // stored. A legacy save carrying the old flat `maxFuel: 10000` recomputes to
  // its hull-derived ceiling (a fresh junker → 300) and clamps current fuel to
  // it. READER of `maxFuel`: the App.tsx fuel gauge and the sim's refuel planner.
  syncMaxFuel(parsed.player.ship);
  // Save-compat: pre-T-108 fixtures have no charts/legacy. Seed charts with the
  // spacer's current system (they demonstrably know where they are) and start
  // the succession counter at 0.
  parsed.player.charts ??= {
    visitedSystemIds: [parsed.player.currentSystemId],
    discoveredPois: [],
  };
  parsed.player.charts.visitedSystemIds ??= [parsed.player.currentSystemId];
  // Save-compat: pre-T-111a states have no charted POIs. Default to empty.
  parsed.player.charts.discoveredPois ??= [];
  // Save-compat: pre-T-111b states have no Nemesis file. Default to empty — an
  // un-defaulted field would leave nemesisFile undefined and break fragment
  // grants/decodes on an old save.
  parsed.player.nemesisFile ??= { fragments: [] };
  parsed.player.nemesisFile.fragments ??= [];
  parsed.player.legacy ??= { successionCount: 0 };
  parsed.player.legacy.successionCount ??= 0;
  // T-1304 save-compat: pre-T-1304 states have no Penny Wise loan field. Default
  // to null (no active loan) — the same backfill the v2→v3 save migration applies
  // for the envelope path. Without it a legacy save leaves `loan` undefined and
  // fails the strict schema's non-optional `loan` key.
  parsed.player.loan ??= null;
  // T-1306 save-compat: pre-T-1306 states have no crew field. Default to empty —
  // the same backfill the v3→v4 save migration applies for the envelope path.
  // Without it a legacy save leaves `crew` undefined and fails the strict schema's
  // non-optional `crew` key. (`dawnHand.rerollsRemaining` needs no backfill — it is
  // optional; a loaded hand without it simply banks no charge until the next dawn.)
  parsed.player.crew ??= [];
  // T-1307 save-compat: pre-T-1307 states have no ports field. Default to empty —
  // the same backfill the v4→v5 save migration applies for the envelope path.
  // Without it a legacy save leaves `ports` undefined and fails the strict schema's
  // non-optional `ports` key.
  parsed.player.ports ??= [];
  // T-1503 save-compat: pre-T-1503 states have no reputation field. Default the
  // whole nested container to neutral and backfill each faction key — the same
  // backfill the v6→v7 save migration applies for the envelope path. Without it a
  // legacy save leaves `reputation` (or a faction key) undefined and fails the
  // strict schema's non-optional, four-key `reputation` shape.
  parsed.player.reputation ??= { league: 0, dragons: 0, confederation: 0, rebels: 0 };
  parsed.player.reputation.league ??= 0;
  parsed.player.reputation.dragons ??= 0;
  parsed.player.reputation.confederation ??= 0;
  parsed.player.reputation.rebels ??= 0;
  parsed.npcs ??= [];
  parsed.npcs.forEach((npc) => {
    npc.disposition ??= 0;
  });
  parsed.market.npcClaims ??= 0;
  parsed.encounter ??= null;
  // Save-compat: older states predate era events — default to no active event
  // and a zero cooldown anchor (T-107).
  parsed.eraEvent ??= null;
  parsed.lastEraEventEndedDay ??= 0;
  return parsed;
}
