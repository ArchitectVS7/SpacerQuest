import {
  CARGO_TYPES,
  DEFAULT_IDEAL_WEIGHTS,
  FLAWS,
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NPC_CHECK_DCS,
  NPC_INTENT_TYPES,
  NPC_PATROL_FAIL_CREDITS,
  NPC_PATROL_SUCCESS_CREDITS,
  NPC_PROFILES,
  NPC_SOCIALIZE_LOSS_CREDITS,
  NPC_SOCIALIZE_WIN_CREDITS,
  NPC_TRAVEL_FAIL_EXTRA_FUEL,
  NpcIntentType,
  NpcProfile,
  STAR_SYSTEMS,
  distance as systemDistance,
} from '@spacerquest/content';
import {
  CargoContract,
  CheckResult,
  EraEventState,
  GameEvent,
  GameState,
  NpcAction,
  NpcState,
} from './types.js';
import { SeededRng } from './rng.js';
import { check } from './dice.js';
import { DriveBlock, jumpFuelCost, localFuelPrice, rollContract } from './economy.js';

/**
 * NPC simulation v2 — the living galaxy (T-106).
 *
 * One dusk tick = one NPC day, resolved coarsely: intent (from the Ideal
 * weight tables in content) → flaw check when the intent touches the flaw →
 * execution with REAL costs. NPCs jump with the same fuel math as the player
 * (jumpFuelCost), refuel at real local depot prices, and earn contract income
 * from the same payment formula that prices the player's manifest board.
 */

/** Named cast fly the systems the player's manifest board serves (1-14) plus
 *  the rim (15-20); Andromeda and the special systems stay off their routes. */
const NPC_SYSTEM_IDS: readonly number[] = Object.values(STAR_SYSTEMS)
  .map((system) => system.id)
  .filter((id) => id <= 20);

/** Nominal NPC ship by power tier: better drives make longer hauls cheaper.
 *  Tier 1 matches the player's starting drives (strength 10, condition 9).
 *
 *  T-106 intentionally SYNTHESIZES these numbers: the named cast never had
 *  ship stat blocks in the original, and the foundation anonymous-roster
 *  drives (20-30) are combat-encounter loadouts — too hot for an ambient
 *  economy sim (they would make every NPC jump nearly free). A gentle
 *  8 + 2×tier ramp keeps tier legible in fuel bills without breaking the
 *  shared jumpFuelCost math. */
export function npcDrives(tier: number): DriveBlock {
  return { strength: 8 + tier * 2, condition: 9 };
}

/** NPC cargo capacity by tier — feeds the same serviceable-pod payment math
 *  the player's board uses (tier 1 = 4 pods, tier 5 = 12).
 *
 *  T-106 synthesized, same rationale as npcDrives: no canonical NPC pod
 *  counts exist. 2 + 2×tier brackets the player's starting 10 pods around
 *  mid-tier so NPC contract income scales like the player's. */
function npcCargoPods(tier: number): number {
  return 2 + tier * 2;
}

/** Broke line: under this an NPC stops discretionary spending, takes odd
 *  jobs, and may show up on the wire begging for fuel money. */
const NPC_BROKE_CREDITS = 100;
/** Poverty pressure: below this an NPC's Trade weight gets a flat boost —
 *  a hungry spacer looks for paying work regardless of worldview. */
const NPC_POVERTY_CREDITS = 1000;
const NPC_POVERTY_TRADE_BOOST = 10;
/** Odd-job alms earned on an idle broke day — keeps the floor above zero so
 *  nobody is pinned at exactly 0 credits forever. */
const NPC_ODD_JOB_CREDITS = 25;
/** Fuel spends in combat/patrol mirror the player's stance costs. */
const NPC_COMBAT_FUEL = 50;
const NPC_PATROL_FUEL = 10;

export interface NpcDayContext {
  day: number;
  /** The player's live manifest board when this NPC is allowed to claim from
   *  it (same system as the player, no claim spent today); null otherwise.
   *  READ-ONLY here — the caller (day.ts) performs the splice and emits the
   *  claim events. */
  claimableBoard: readonly CargoContract[] | null;
  /** The active world economic event (T-107). NPCs feel the same re-priced
   *  economy as the player: synthesized contract income and depot refuel costs
   *  read the same modifiers. Null when no event is active. */
  eraEvent: EraEventState | null;
}

export interface NpcDayResult {
  npc: NpcState;
  events: GameEvent[];
  /** Index into ctx.claimableBoard of the offer this NPC took (T-106 contract
   *  competition). Only set when the NPC actually executed the haul. */
  claimedContractIndex?: number;
}

function systemName(systemId: number): string {
  return STAR_SYSTEMS[systemId]?.name ?? `system ${systemId}`;
}

/** Weighted intent pick: base weight from the Ideal table x (1 + affinity
 *  stat, floored at 0). Poverty pressure adds a flat Trade boost. Returns
 *  'Idle' only in the all-weights-zero corner. */
export function pickIntent(
  profile: NpcProfile,
  credits: number,
  rng: SeededRng,
): NpcIntentType | 'Idle' {
  const base = IDEAL_WEIGHTS[profile.ideal] ?? DEFAULT_IDEAL_WEIGHTS;
  const weighted = NPC_INTENT_TYPES.map((intent) => {
    const stat = Math.max(0, profile.stats[INTENT_STAT_AFFINITY[intent]]);
    let weight = base[intent] * (1 + stat);
    if (intent === 'Trade' && credits < NPC_POVERTY_CREDITS) {
      weight += NPC_POVERTY_TRADE_BOOST;
    }
    return { intent, weight };
  });

  const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  if (total <= 0) {
    // Invariant: a weight of 0 DISABLES a verb (ideals.ts contract), so an
    // Ideal that zeroes every verb must resolve to a no-op day — never to a
    // verb the table forbade. Unreachable with the current tables (every
    // Ideal has a positive weight), but future content must not break it.
    return 'Idle';
  }

  let roll = rng.next() * total;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll < 0) return entry.intent;
  }
  return weighted[weighted.length - 1].intent;
}

/** Clamp-and-apply a disposition change, emitting a typed event when the
 *  value actually moves. Shared by combat (tribute/defeat/fled), dusk decay,
 *  and anything else that touches per-NPC standing. */
export function applyDisposition(
  state: GameState,
  npcId: string,
  delta: number,
  reason:
    | 'tribute'
    | 'defeat'
    | 'player-fled'
    | 'decay'
    | 'storylet'
    | 'contract-sniped'
    // T-1303 Hangout beats (Dare / befriend / insult / meet) move dealer standing.
    | 'dare'
    | 'befriend'
    | 'insult'
    | 'meet'
    // T-1304: a Penny Wise loan default sours her standing (one-time).
    | 'loan-default'
    // T-1305: a NAMED patrol captain who catches you smuggling holds a grudge.
    | 'contraband-caught',
  events: GameEvent[],
): void {
  const npc = state.npcs.find((candidate) => candidate.id === npcId);
  if (!npc || delta === 0) return;

  const next = Math.max(-10, Math.min(10, npc.disposition + delta));
  if (next === npc.disposition) return;

  const applied = next - npc.disposition;
  npc.disposition = next;
  events.push({
    type: 'DispositionChanged',
    day: state.day,
    npcId,
    delta: applied,
    disposition: next,
    reason,
  });
}

/** Refuel at the CURRENT system's real depot price when the tank can't cover
 *  `needed`. Keeps a small credit reserve so refueling never zeroes an NPC. */
function refuelIfNeeded(npc: NpcState, needed: number, eraEvent: EraEventState | null): void {
  if (npc.fuel >= needed) return;
  const price = localFuelPrice(npc.currentSystemId, eraEvent);
  const spendable = Math.max(0, npc.credits - NPC_BROKE_CREDITS);
  const affordable = Math.floor(spendable / price);
  const amount = Math.min(needed - npc.fuel + 100, affordable);
  if (amount <= 0) return;
  npc.credits -= amount * price;
  npc.fuel += amount;
}

function brokeIdle(npc: NpcState, rng: SeededRng, day: number, events: GameEvent[]): NpcAction {
  // Odd jobs at the docks: keeps broke NPCs off an exact-zero pin and gives
  // them a road back to solvency (they'll trade again under poverty pressure).
  npc.credits += NPC_ODD_JOB_CREDITS;
  if (rng.next() < 0.3) {
    events.push({
      type: 'WireEntry',
      day,
      kind: 'npc',
      message: `${npc.name} seen begging for fuel money at ${systemName(npc.currentSystemId)}.`,
    });
  }
  return {
    type: 'Idle',
    details: `worked odd jobs at the ${systemName(npc.currentSystemId)} docks, hard up for credits`,
  };
}

/** Per-intent StatCheck.actionContext tag (T-1201). Lets the wire (day.ts /
 *  ui format.ts) and T-1202 discriminate NPC checks per verb without parsing
 *  the `actor` string. */
const NPC_CHECK_CONTEXT: Record<
  NpcIntentType,
  'npc-trade' | 'npc-travel' | 'npc-combat' | 'npc-patrol' | 'npc-socialize'
> = {
  Trade: 'npc-trade',
  Travel: 'npc-travel',
  Combat: 'npc-combat',
  Patrol: 'npc-patrol',
  Socialize: 'npc-socialize',
};

/**
 * Route an NPC verb through the SAME shared check() the player uses (T-1201,
 * PRD §7: "one system — there is no separate AI"). Rolls d20 + the intent's
 * affinity stat vs its content-defined DC and emits a StatCheck event.
 *
 * Invariant (asserted by tests): a resolved NPC day whose lastAction.type is
 * one of the five verbs ⟺ exactly one StatCheck was emitted. Every broke /
 * underfunded fallback returns Idle/FlawOverride and rolls NOTHING, so the
 * wire's trade-failure rate and the acceptance test's denominator stay honest.
 */
function rollNpcCheck(
  npc: NpcState,
  profile: NpcProfile,
  intent: NpcIntentType,
  rng: SeededRng,
  events: GameEvent[],
): CheckResult {
  const stat = INTENT_STAT_AFFINITY[intent];
  const dc = NPC_CHECK_DCS[intent];
  const result = check(rng.d20(), profile.stats[stat], dc);
  events.push({
    type: 'StatCheck',
    actor: npc.id,
    stat,
    dc,
    result,
    actionContext: NPC_CHECK_CONTEXT[intent],
  });
  return result;
}

function executeTrade(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): { action: NpcAction; claimedContractIndex?: number } {
  // T-106 contract competition mechanism: when trading in the player's
  // system, the NPC pulls a SPECIFIC offer off the live manifest board (the
  // shared per-system job pool) instead of synthesizing one. The caller
  // splices it from the board and shrinks tomorrow's board generation pool,
  // so the player watches an offer they saw disappear.
  let claimedContractIndex: number | undefined;
  let contract: CargoContract;
  if (ctx.claimableBoard && ctx.claimableBoard.length > 0) {
    claimedContractIndex = Math.floor(rng.next() * ctx.claimableBoard.length);
    contract = ctx.claimableBoard[claimedContractIndex]!;
  } else {
    contract = rollContract(
      npc.currentSystemId,
      rng,
      {
        cargoPods: npcCargoPods(profile.tier),
        hullCondition: 9,
        drives: npcDrives(profile.tier),
      },
      ctx.eraEvent,
    );
  }

  const routeDistance = systemDistance(npc.currentSystemId, contract.destination);
  const fuelCost = jumpFuelCost(npcDrives(profile.tier), routeDistance);
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.fuel < fuelCost) {
    // Can't fund the haul: the claim never happens (the offer stays on the
    // board) and the day is lost to the docks.
    return { action: brokeIdle(npc, rng, ctx.day, events) };
  }

  // Coarse NPC day: sign, jump, deliver in one dusk tick. Real fuel out —
  // the same formula that prices the player's day. The contract is fulfilled
  // and paid either way (payment is contractual); the Trade check (T-1201)
  // decides how CLEANLY the run went and is recorded as a StatCheck for the
  // wire (day.ts / ui format.ts) and T-1202.
  //
  // WHY the Trade check carries no CREDIT/FUEL swing (unlike the other four
  // verbs): Trade is by far the most FREQUENT NPC verb, and a Trade check is a
  // SKILL check — high-TRADE (rich) NPCs almost never fail while low-TRADE ones
  // fail often. Any per-trade economic penalty therefore (a) drains the poor
  // toward the fuel-cost floor while the rich dodge it, and (b) — because it
  // fires ~1000×/200 days — perturbs the shared poverty/refuel/intent RNG
  // stream cast-wide, both of which make the 200-day wealth distribution
  // degenerate (max > 10x median), which the sim's solvency invariant rejects.
  // So the soured-run consequence is the visible wire narrative + the recorded
  // failure, not a payout change. (Verified: a payout/fuel penalty here pushes
  // the seed-1 solvency ratio out of band; this design holds it at baseline.)
  npc.fuel -= fuelCost;
  npc.currentSystemId = contract.destination;
  npc.credits += contract.payment;
  const cargoName = CARGO_TYPES[contract.cargoType]?.name ?? `type-${contract.cargoType} cargo`;

  const result = rollNpcCheck(npc, profile, 'Trade', rng, events);
  if (result.success) {
    return {
      action: {
        type: 'Trade',
        details: `hauled ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits`,
      },
      claimedContractIndex,
    };
  }
  return {
    action: {
      type: 'Trade',
      details: `delivered ${cargoName} to ${systemName(contract.destination)} for ${contract.payment} credits, but the run soured — a rough, costly haul`,
    },
    claimedContractIndex,
  };
}

function executeTravel(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  const options = NPC_SYSTEM_IDS.filter((id) => id !== npc.currentSystemId);
  const destination = options[Math.floor(rng.next() * options.length)];
  const fuelCost = jumpFuelCost(
    npcDrives(profile.tier),
    systemDistance(npc.currentSystemId, destination),
  );
  refuelIfNeeded(npc, fuelCost, ctx.eraEvent);
  if (npc.fuel < fuelCost) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.fuel -= fuelCost;
  npc.currentSystemId = destination;
  // A Travel (PILOT) check decides a clean jump vs a rough one (T-1201).
  const result = rollNpcCheck(npc, profile, 'Travel', rng, events);
  if (result.success) {
    return { type: 'Travel', details: `jumped to ${systemName(destination)}` };
  }
  npc.fuel = Math.max(0, npc.fuel - NPC_TRAVEL_FAIL_EXTRA_FUEL);
  return {
    type: 'Travel',
    details: `made a rough jump to ${systemName(destination)}, burning extra fuel`,
  };
}

function executeCombat(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  refuelIfNeeded(npc, NPC_COMBAT_FUEL, ctx.eraEvent);
  if (npc.fuel < NPC_COMBAT_FUEL) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.fuel -= NPC_COMBAT_FUEL;
  // A Combat (GUNS) check through the shared check() decides the engagement
  // (T-1201, replacing a raw inline d20+GUNS threshold of 12 — the DC now lives
  // in content NPC_CHECK_DCS); a win pays a tier-scaled bounty (the anonymous
  // rank-and-file don't fly empty).
  //
  // T-106 synthesized number: foundation combat pays fixed per-roster prize
  // values sized for player encounters — fed into a 30-NPC daily sim they
  // would swamp trade income. 150×tier keeps fighting a living, not a
  // money printer, next to the shared contract-payment formula.
  const result = rollNpcCheck(npc, profile, 'Combat', rng, events);
  if (result.success) {
    const bounty = 150 * profile.tier;
    npc.credits += bounty;
    return {
      type: 'Combat',
      details: `ran down a mark near ${systemName(npc.currentSystemId)} and collected ${bounty} credits`,
    };
  }
  return {
    type: 'Combat',
    details: `traded fire near ${systemName(npc.currentSystemId)} and broke off with nothing to show`,
  };
}

function executePatrol(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  if (npc.credits < NPC_BROKE_CREDITS) {
    return brokeIdle(npc, rng, ctx.day, events);
  }
  npc.fuel = Math.max(0, npc.fuel - NPC_PATROL_FUEL);
  // A Patrol (GRIT) check decides a productive sweep vs a costly quiet day
  // (T-1201).
  const result = rollNpcCheck(npc, profile, 'Patrol', rng, events);
  if (result.success) {
    npc.credits += NPC_PATROL_SUCCESS_CREDITS;
    return {
      type: 'Patrol',
      details: `ran a clean sweep of the ${systemName(npc.currentSystemId)} lanes`,
    };
  }
  npc.credits = Math.max(0, npc.credits - NPC_PATROL_FAIL_CREDITS);
  return {
    type: 'Patrol',
    details: `patrolled the ${systemName(npc.currentSystemId)} lanes, a quiet day that cost more than it paid`,
  };
}

function executeSocialize(
  npc: NpcState,
  profile: NpcProfile,
  rng: SeededRng,
  ctx: NpcDayContext,
  events: GameEvent[],
): NpcAction {
  if (npc.credits < NPC_BROKE_CREDITS + 50) {
    // Can't cover the ante — no roll, no verb. Falls back to odd jobs (Idle),
    // so a returned Socialize action ALWAYS means a check was rolled (T-1201
    // verb⟺StatCheck invariant).
    return brokeIdle(npc, rng, ctx.day, events);
  }
  // A night at the Hangout: a Socialize (GUILE) check through the shared
  // check() to come out ahead at the tables (T-1201, replacing a raw inline
  // d20+GUILE threshold of 14 — the DC now lives in content NPC_CHECK_DCS).
  const result = rollNpcCheck(npc, profile, 'Socialize', rng, events);
  if (result.success) {
    npc.credits += NPC_SOCIALIZE_WIN_CREDITS;
    return {
      type: 'Socialize',
      details: `cleaned up at the ${systemName(npc.currentSystemId)} Hangout tables`,
    };
  }
  npc.credits -= NPC_SOCIALIZE_LOSS_CREDITS;
  return {
    type: 'Socialize',
    details: `bought a round at the ${systemName(npc.currentSystemId)} Hangout`,
  };
}

export function resolveNpcDay(npc: NpcState, rng: SeededRng, ctx: NpcDayContext): NpcDayResult {
  const events: GameEvent[] = [];
  const updatedNpc = JSON.parse(JSON.stringify(npc)) as NpcState;

  const profile = NPC_PROFILES.find((p) => p.id === updatedNpc.profileId);
  if (!profile) {
    throw new Error(`Profile not found for NPC ${updatedNpc.id}`);
  }

  // 1. Intent — content weight tables (Ideal x stats), replacing the old
  //    3-branch stat comparison.
  const intent = pickIntent(profile, updatedNpc.credits, rng);

  // 2. The Flaw Check — only when the day's intent touches the flaw
  // (PRD §6: flaws override optimal play when a decision touches them,
  // not on a blanket daily roll). Resist on d20 >= the character's own
  // flawDc: disciplined characters resist easily, volatile ones rarely.
  const flawDef = FLAWS[profile.flaw];
  const touchesFlaw = flawDef !== undefined && (flawDef.triggers as string[]).includes(intent);

  let overridden = false;
  if (touchesFlaw) {
    const die = rng.d20();
    const resisted = die >= profile.flawDc;

    events.push({
      type: 'FlawCheck',
      npcId: updatedNpc.id,
      flaw: profile.flaw,
      die,
      dc: profile.flawDc,
      resisted,
    });

    overridden = !resisted;
  }

  let action: NpcAction;
  let claimedContractIndex: number | undefined;

  if (overridden && flawDef) {
    // Flaw Override! The flaw chooses the day.
    action = { type: 'FlawOverride', details: flawDef.detail };
    if (flawDef.credits) {
      if (flawDef.credits > 0) {
        updatedNpc.credits += flawDef.credits;
      } else {
        // Losses never take an NPC below pocket change (and never below what
        // they already had) — nobody gambles away their last meal, and nobody
        // gets pinned at exactly 0 credits.
        updatedNpc.credits = Math.max(
          Math.min(updatedNpc.credits, NPC_ODD_JOB_CREDITS),
          updatedNpc.credits + flawDef.credits,
        );
      }
    }
    if (flawDef.fuel === 'drain') {
      updatedNpc.fuel = 0;
    } else if (flawDef.fuel) {
      updatedNpc.fuel = Math.max(0, updatedNpc.fuel + flawDef.fuel);
    }
  } else if (intent === 'Trade') {
    const result = executeTrade(updatedNpc, profile, rng, ctx, events);
    action = result.action;
    claimedContractIndex = result.claimedContractIndex;
  } else if (intent === 'Travel') {
    action = executeTravel(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Combat') {
    action = executeCombat(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Patrol') {
    action = executePatrol(updatedNpc, profile, rng, ctx, events);
  } else if (intent === 'Socialize') {
    action = executeSocialize(updatedNpc, profile, rng, ctx, events);
  } else {
    // 'Idle' — the all-weights-zero corner of pickIntent: a true no-op day.
    action = {
      type: 'Idle',
      details: `kept to their bunk at ${systemName(updatedNpc.currentSystemId)}`,
    };
  }

  updatedNpc.lastAction = action;

  events.push({
    type: 'NpcAction',
    npcId: updatedNpc.id,
    actionDetails: action.details,
  });

  return { npc: updatedNpc, events, claimedContractIndex };
}
