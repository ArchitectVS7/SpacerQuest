// ---------------------------------------------------------------------------
// T-1605b · The anti-poverty-trap INVARIANT, over adversarial states.
//
// THE LAW BEING ASSERTED (docs/PRD-REIMAGINED.md:35, "Scarcity of choices, never
// a poverty trap"): "the world provides floors: NPCs work odd jobs and small
// income, so no actor in the simulation, player or cast, gets permanently trapped
// at zero with no move left. A bad run makes a *different* game … not a dead one."
//
// PROVENANCE. The UGT campaign (T-1604a, docs/playtests/T-1604a-ugt-campaign.md
// §7 finding F2) measured a career pinned at 0 credits at Mira-9 for 385
// consecutive days, hold nailed shut by an undeliverable contract and not one
// income verb advertised. T-1604b fixed both of that trap's locks (the dusk
// SUBSISTENCE floor in `packages/engine/src/day.ts` endDay, and the player-initiated
// `abandon-contract` verb) and shipped the regression for the ONE witnessed state
// (`protocol.test.ts` describe('T-1604b · F2 poverty/immobility trap')). It
// explicitly deferred the exhaustive property — "the exhaustive 'no sequence
// escapes' INVARIANT stays T-1605b's" — which is this file.
//
// WHY NOT `longestZeroIncomeStreak(daily) < 5`. That is the invariant the campaign
// specs already assert (`campaign-policies.test.ts`, `campaign-smuggler-gambler.test.ts`)
// and it is the WRONG shape here. From an adversarial start the recovery is
// legitimately spent buying fuel a day at a time off a 100-credit floor, and
// `buy-fuel` is deliberately not an `isIncomeAction`. Measured below: a CORRECT
// recovery does not land its first income action for as many as 20 days, so the
// leading zero-income streak alone is four times the `< 5` bound. Re-using it
// would fail on a game that is behaving exactly as the PRD says it should. The law is also not about
// one policy being clever — it is about the WORLD still offering a move. So the
// invariant here is EXISTENTIAL and BOUNDED (there EXISTS a bounded sequence of
// ADVERTISED actions that restores mobility and income) plus universal safety
// properties that hold whatever the captain does.
//
// THE FIVE PROPERTIES (named PT-1..PT-5 in the describe/it titles so a reviewer
// can map every assertion to the claim it discharges):
//   PT-1 · Debt is a ledger, never negative money — credits/fuel/debt/loan are
//          non-negative at every dawn and every dusk.
//   PT-2 · The world provides a floor — from the first dusk onward, dawn credits
//          are >= SUBSISTENCE_FLOOR_CREDITS.
//   PT-3 · Every move the escape takes was ADVERTISED by `legalActions` — an
//          escape a headless UGT client could never discover is not an escape.
//   PT-4 · The trap has a BOUNDED exit — from a state verified trapped at
//          construction, mobility and income both return inside a fixed horizon.
//   PT-5 · The out never expires — idle for 150 days with the ledgers compounding
//          without limit, and PT-1..PT-4 still hold from the resulting state.
//
// MEASURED BOUNDS (this file's own sweep — 3 states over 16 state/system arms ×
// seeds 1–4 = 64 escape runs, plus PT-5's, horizon 45, 0 unadvertised actions):
//
//   state                      worst days→mobility   worst days→income   min dawn cr
//   indebted (4 systems)             19  (Mizar-9 s4)      20                 100
//   post-confiscation (6 rim)        16  (Mizar-9 s4)      18                 100
//   zero-fuel-rim (6 rim)            17  (Mizar-9 s2)      19                 100
//   PT-5 (idled 150 days)            16                    16                 100
//
// so MAX_DAYS_TO_MOBILITY / MAX_DAYS_TO_INCOME are set at 30 / 32 against a
// 45-day horizon — an 11/12-day margin over the worst arm. These are TEST
// TOLERANCES measured from that sweep, not game balance numbers, which is why they
// live here rather than in `packages/content` — exactly like the `< 5` streak bound
// the campaign specs already carry.
//
// DELIBERATELY NOT ASSERTED: end-of-horizon wealth. Escaping the trap does not
// imply prospering — a run can escape correctly and still be back at the floor at
// the end of the horizon, so asserting credit growth would be flaky. The invariant
// is ESCAPE, not prosperity, and a bounded first income already proves real money
// landed.
//
// STANDING CONSTRAINTS. No engine, content or UI file is touched by this task —
// it is a property over rules that already ship. The whole property is asserted
// through `legalActions` + `applyPlayerAction`, i.e. the exact surface a headless
// driver sees, so it is reachable headlessly by construction (PT-3). No new
// GameState field and no new event shape, so `CURRENT_SAVE_VERSION` is unchanged
// and no `MIGRATIONS` entry is owed. Every verb the escape witness uses is already
// cockpit-reachable and was surfaced by T-1104 (`sign-contract`/`buy-fuel`),
// T-1402 (`Travel`/`Combat`) and T-1604b (`abandon-contract`, `TradePane`'s
// `[data-testid="abandon-contract"]`). No `Math.random`, no `Date`, no I/O — every
// draw runs through `SeededRng`.
// ---------------------------------------------------------------------------
import { describe, expect, it } from 'vitest';
import {
  CONTRABAND_FINE,
  LOAN_MAX_PRINCIPAL,
  LOAN_TERM_DAYS,
  STAR_SYSTEMS,
  SUBSISTENCE_FLOOR_CREDITS,
  distance,
} from '@spacerquest/content';
import {
  DayPhase,
  SeededRng,
  applyPatrolContrabandScan,
  applyPlayerAction,
  careerEnded,
  createInitialState,
  endDay,
  jumpFuelCost,
  startDay,
  type EncounterState,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { cannotAffordCheapestJump, idlePolicy, isIncomeAction } from '../index.js';
import { legalActions, type LegalActions, type ParamSpec } from '../protocol.js';
import { driveFrom } from './support/campaign-drivers.js';

// ---------------------------------------------------------------------------
// Tolerances (see the header: measured, not tuned)
// ---------------------------------------------------------------------------

/** Days the escape witness may take to make `cannotAffordCheapestJump` false
 *  again. Worst measured arm: 19 (indebted-to-Penny-Wise at Mizar-9, seed 4). */
const MAX_DAYS_TO_MOBILITY = 30;
/** Days the escape witness may take to land its first `isIncomeAction`. Worst
 *  measured arm: 20 (indebted-to-Penny-Wise at Mizar-9, seed 4). */
const MAX_DAYS_TO_INCOME = 32;
/** Days each escape run is driven for. Comfortably past both bounds so a run that
 *  blows a bound produces a diagnosable series rather than an inconclusive one. */
const HORIZON = 45;
/** Seeds every arm of the matrix is swept over. */
const SEEDS = [1, 2, 3, 4] as const;
/** The six rim systems (content `isRim`) — derived, never a hard-coded id list,
 *  so a seventh rim system joins this sweep automatically. */
const RIM_SYSTEM_IDS = Object.values(STAR_SYSTEMS)
  .filter((system) => system.isRim)
  .map((system) => system.id);

// ---------------------------------------------------------------------------
// The escape witness
//
// A bespoke, test-local planner. It is deliberately NOT a shipped policy and is
// NOT added to `SimPolicyName`/`POLICY_NAMES`: shipping it would make the sim's
// policy roster the owner of the invariant, when the point of the property is
// that the WORLD offers the exit to anyone who looks. (Precedent: T-1604b's
// bespoke-policy `runCampaign` test, for the same reason.)
//
// It plans ONE action at a time against the LIVE day state, exactly as a UGT
// client re-reads legal actions between steps — which is what lets the driver
// validate every single action against `legalActions` immediately before applying
// it (PT-3). A batch policy could not do that honestly: `sign-contract` is not
// advertised until `abandon-contract` has actually freed the hold.
//
// The moves, in the order a stranded captain would try them:
//   1. in an encounter → talk (costs no fuel)
//   2. hold nailed shut by an undeliverable contract → abandon-contract
//   3. top the tank with everything the purse allows → buy-fuel
//   4. a held contract the tank can now reach → Travel to deliver it
//   5. otherwise sign the cheapest-leg board offer the tank can fly, then Travel
//   6. otherwise plan nothing — a legitimate day. At 0 credits with a dry tank
//      `buy-fuel` is (correctly) not advertised and there is nothing to do but
//      wait for the dusk floor; the driver tolerates empty days and only asserts
//      that whatever IS proposed was advertised.
// ---------------------------------------------------------------------------

function unspentDieIndices(state: GameState): number[] {
  const hand = state.player.dawnHand;
  if (!hand) return [];
  const indices: number[] = [];
  for (let i = 0; i < hand.spent.length; i += 1) {
    if (!hand.spent[i]) indices.push(i);
  }
  return indices;
}

/** Fuel this ship's own drives burn on a jump of `dist` — the same `jumpFuelCost`
 *  the engine prices travel with, so "reachable" here means what the resolver
 *  means by it. */
function playerJumpFuel(state: GameState, dist: number): number {
  const ship = state.player.ship;
  return jumpFuelCost(ship.drives, dist, ship.hasTransWarpDrive ?? false);
}

function planEscapeStep(state: GameState): PlayerAction | null {
  const dice = unspentDieIndices(state);
  const spendDie = dice[0];
  if (spendDie === undefined) return null;

  const player = state.player;
  const ship = player.ship;

  if (state.encounter) {
    return {
      type: 'Combat',
      stance: 'talk',
      targetId: state.encounter.interceptor.id,
      spendDie,
    };
  }

  const here = player.currentSystemId;
  const contract = player.activeContract;
  if (contract) {
    const needed = playerJumpFuel(state, distance(here, contract.destination));
    // Undeliverable, for either of two reasons, so dump it:
    //  · the leg costs more fuel than the tank can physically hold (the
    //    zero-fuel-rim lock), or
    //  · the destination is the system we already stand in. Delivery only fires
    //    on ARRIVAL (`travel.ts` resolveTravel / completePendingTravel), and a
    //    jump to your own system is never advertised, so such a contract can
    //    never be discharged. See the board filter below for how one is acquired.
    if (needed > ship.maxFuel || contract.destination === here) {
      return { type: 'Trade', action: 'abandon-contract' };
    }
    if (ship.fuel >= needed) {
      return { type: 'Travel', destinationId: contract.destination, spendDie };
    }
  }

  const fuelPrice = state.market.localFuelPrice || 5;
  const fuelAmount = Math.min(ship.maxFuel - ship.fuel, Math.floor(player.credits / fuelPrice));
  if (fuelAmount >= 1) {
    return { type: 'Trade', action: 'buy-fuel', fuelAmount };
  }

  if (!contract && state.market.manifestBoard.length > 0) {
    let cheapestIndex: number | null = null;
    let cheapestCost = Number.POSITIVE_INFINITY;
    state.market.manifestBoard.forEach((offer, index) => {
      // Skip an offer bound for the system we are standing in. `rollContract`
      // never rolls the ORIGIN as a destination, but the board is generated once
      // at dawn for the dawn system and `legalActions` keeps advertising it after
      // a jump — so a captain who delivers and then signs again on the same day is
      // offered the port they just left FROM as a destination they are already AT.
      // Signing one is legal and the engine honours it, but it is a dead run, and
      // the witness is here to escape, not to collect one. (An observation about
      // the advertised board, deliberately NOT fixed here: T-1605b changes no
      // engine or protocol rule.)
      if (offer.destination === here) return;
      const cost = playerJumpFuel(state, distance(here, offer.destination));
      if (cost <= ship.fuel && cost < cheapestCost) {
        cheapestCost = cost;
        cheapestIndex = index;
      }
    });
    if (cheapestIndex !== null) {
      return { type: 'Trade', action: 'sign-contract', contractIndex: cheapestIndex };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// PT-3 · advertisement check
//
// Every field of the proposed action is checked against the DOMAIN `legalActions`
// advertised for it, not merely against the verb's presence — a `buy-fuel` for
// more fuel than the advertised `int` max, or a `spendDie` outside `diceRemaining`,
// is just as unreachable as an unadvertised verb.
// ---------------------------------------------------------------------------

function paramSatisfied(spec: ParamSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'die-index':
    case 'system-id':
    case 'contract-index':
      return typeof value === 'number' && spec.choices.includes(value);
    case 'int':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= spec.min &&
        value <= spec.max
      );
    case 'enum':
      return (
        (typeof value === 'string' || typeof value === 'number') && spec.choices.includes(value)
      );
    case 'fixed':
      return value === spec.value;
  }
}

/** The Trade/Shipyard sub-action discriminant, or undefined for verbs that have
 *  none — the same key `LegalActionSpec.action` carries. */
function subActionOf(action: PlayerAction): string | undefined {
  return 'action' in action && typeof action.action === 'string' ? action.action : undefined;
}

/** A verb's display name, e.g. `Travel` or `Trade/abandon-contract`. */
function verbLabel(action: PlayerAction): string {
  const subAction = subActionOf(action);
  return subAction === undefined ? action.type : `${action.type}/${subAction}`;
}

/** T-196a · The nine action types M17 freed from the dawn hand
 *  (docs/DAWN-HAND-REDESIGN.md §3). Their engine shapes carry no `spendDie` at all. */
function isFreeAction(action: PlayerAction): boolean {
  if (action.type === 'Shipyard' || action.type === 'Crew' || action.type === 'Port') return true;
  return (
    action.type === 'Trade' &&
    (action.action === 'buy-fuel' ||
      action.action === 'sign-contract' ||
      action.action === 'abandon-contract')
  );
}

/** Why `action` is not advertised by `legal`, or `null` when it is. Returned as a
 *  string so a failure names the exact action and the exact reason. */
function advertisementViolation(legal: LegalActions, action: PlayerAction): string | null {
  const fields = action as unknown as Record<string, unknown>;
  const spec = legal.actions.find(
    (candidate) => candidate.type === action.type && candidate.action === subActionOf(action),
  );
  if (!spec) {
    return `${verbLabel(action)} is not advertised`;
  }
  for (const [key, param] of Object.entries(spec.params)) {
    // T-196a · `legalActions` still ADVERTISES `spendDie` on the nine M17 Free
    // Actions (docs/DAWN-HAND-REDESIGN.md §3) even though the engine's action shapes
    // dropped the field and zod strips it. That staleness is deliberate and belongs
    // to T-196b — the instruments move in the second arm of the control-arm pair, so
    // the two capstones stay attributable. Until then an OMITTED die on a verb the
    // engine will not accept one for is conformant, not a violation. The check still
    // bites everywhere else, including `Trade/haggle`, whose die is real.
    const dieIsVestigial = key === 'spendDie' && fields[key] === undefined && isFreeAction(action);
    if (dieIsVestigial) continue;
    if (!paramSatisfied(param, fields[key])) {
      return `${verbLabel(action)} param ${key}=${JSON.stringify(fields[key])} is outside the advertised ${param.kind} domain`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// The escape driver
//
// READERS of every `EscapeDay` field, named per standing constraint 7 — each one
// has an assertion in `assertEscapeInvariants` below or it would not exist here:
//   creditsAtDawn/creditsAtDusk, fuelAtDawn/fuelAtDusk,
//   debtAtDawn/debtAtDusk, loanAtDawn/loanAtDusk  → PT-1 (and dawn credits → PT-2)
//   unadvertised                                   → PT-3
//   strandedAtDawn                                 → PT-4 mobility clock
//   incomeActionCount                              → PT-4 income clock
//   actions                                        → PT-4's per-state verb assertions
// ---------------------------------------------------------------------------

interface EscapeDay {
  day: number;
  creditsAtDawn: number;
  creditsAtDusk: number;
  fuelAtDawn: number;
  fuelAtDusk: number;
  debtAtDawn: number;
  debtAtDusk: number;
  loanAtDawn: number;
  loanAtDusk: number;
  /** True when, at dawn, even spending every credit on fuel cannot buy the
   *  cheapest jump available — the T-1004 stranding measure. */
  strandedAtDawn: boolean;
  incomeActionCount: number;
  /** Human-readable verbs taken, e.g. `Trade/abandon-contract`. */
  actions: string[];
  /** PT-3 violations: actions the witness proposed that `legalActions` had not
   *  advertised. Always expected empty. */
  unadvertised: string[];
}

/** Drive the escape witness from `state` for `days` days, re-planning against the
 *  LIVE day state after every applied action and validating each proposal against
 *  `legalActions` before it is applied. */
function driveEscape(state: GameState, days: number): { daily: EscapeDay[]; state: GameState } {
  const daily: EscapeDay[] = [];
  let current = state;

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    let dayState = startDay(current).state;
    const creditsAtDawn = dayState.player.credits;
    const fuelAtDawn = dayState.player.ship.fuel;
    const debtAtDawn = dayState.player.debt;
    const loanAtDawn = dayState.player.loan?.outstanding ?? 0;
    const strandedAtDawn = cannotAffordCheapestJump(dayState);

    const actions: string[] = [];
    const unadvertised: string[] = [];
    let incomeActionCount = 0;

    // Bounded by the dawn hand: every branch of the witness spends exactly one
    // die, so the hand is a hard stop. The extra +2 headroom exists only so a
    // witness bug loops loudly (an unspendable proposal) instead of silently.
    const maxSteps = (dayState.player.dawnHand?.dice.length ?? 0) + 2;
    for (let step = 0; step < maxSteps; step += 1) {
      const action = planEscapeStep(dayState);
      if (!action) break;
      const violation = advertisementViolation(legalActions(dayState), action);
      if (violation) {
        unadvertised.push(violation);
        break;
      }
      actions.push(verbLabel(action));
      if (isIncomeAction(action)) incomeActionCount += 1;
      dayState = applyPlayerAction(dayState, action).state;
    }

    daily.push({
      day: dayState.day,
      creditsAtDawn,
      creditsAtDusk: dayState.player.credits,
      fuelAtDawn,
      fuelAtDusk: dayState.player.ship.fuel,
      debtAtDawn,
      debtAtDusk: dayState.player.debt,
      loanAtDawn,
      loanAtDusk: dayState.player.loan?.outstanding ?? 0,
      strandedAtDawn,
      incomeActionCount,
      actions,
      unadvertised,
    });

    current = endDay(dayState).state;
  }

  return { daily, state: current };
}

/** PT-1 + PT-2 + PT-3 + PT-4, asserted over one escape run. Split out so PT-5 can
 *  re-assert the identical property from a state that has already idled for 150
 *  days, rather than restating it. */
function assertEscapeInvariants(daily: EscapeDay[], label: string): void {
  // --- PT-1 · debt is a LEDGER, never negative money -----------------------
  // PRD-REIMAGINED.md:35 and `PlayerState.debt`'s own contract at
  // packages/engine/src/types.ts:1229 ("Outstanding Merchant Guild debt — a
  // ledger entry, NOT negative credits. Modeling debt as a negative balance
  // recreates the UGT poverty trap").
  for (const day of daily) {
    const where = `${label} day ${day.day}`;
    expect(day.creditsAtDawn, `${where}: dawn credits`).toBeGreaterThanOrEqual(0);
    expect(day.creditsAtDusk, `${where}: dusk credits`).toBeGreaterThanOrEqual(0);
    expect(day.fuelAtDawn, `${where}: dawn fuel`).toBeGreaterThanOrEqual(0);
    expect(day.fuelAtDusk, `${where}: dusk fuel`).toBeGreaterThanOrEqual(0);
    expect(day.debtAtDawn, `${where}: dawn debt`).toBeGreaterThanOrEqual(0);
    expect(day.debtAtDusk, `${where}: dusk debt`).toBeGreaterThanOrEqual(0);
    expect(day.loanAtDawn, `${where}: dawn loan`).toBeGreaterThanOrEqual(0);
    expect(day.loanAtDusk, `${where}: dusk loan`).toBeGreaterThanOrEqual(0);
  }

  // --- PT-2 · the world provides a floor ----------------------------------
  // Day 0's dawn is the constructed adversarial state itself (no dusk has run
  // yet), so the floor is asserted from the FIRST dusk onward — which is exactly
  // what the T-1604b `endDay` block promises.
  for (const day of daily.slice(1)) {
    expect(
      day.creditsAtDawn,
      `${label} day ${day.day}: dawn credits vs subsistence floor`,
    ).toBeGreaterThanOrEqual(SUBSISTENCE_FLOOR_CREDITS);
  }

  // --- PT-3 · every move was ADVERTISED -----------------------------------
  const violations = daily.flatMap((day) => day.unadvertised.map((v) => `day ${day.day}: ${v}`));
  expect(
    violations,
    `${label}: actions the escape took that legalActions never advertised`,
  ).toEqual([]);

  // --- PT-4 · the trap has a BOUNDED exit ---------------------------------
  const firstMobileIndex = daily.findIndex((day) => !day.strandedAtDawn);
  const firstIncomeIndex = daily.findIndex((day) => day.incomeActionCount > 0);
  expect(
    firstMobileIndex,
    `${label}: never regained mobility inside ${HORIZON} days`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    firstIncomeIndex,
    `${label}: never took an income action inside ${HORIZON} days`,
  ).toBeGreaterThanOrEqual(0);
  expect(firstMobileIndex, `${label}: days to mobility`).toBeLessThanOrEqual(MAX_DAYS_TO_MOBILITY);
  expect(firstIncomeIndex, `${label}: days to first income`).toBeLessThanOrEqual(
    MAX_DAYS_TO_INCOME,
  );
}

// ---------------------------------------------------------------------------
// The three adversarial states, each built by driving the REAL mechanism that
// produces it. A hand-poked GameState literal would assert nothing about the
// game; these are states the engine itself put the captain in.
// ---------------------------------------------------------------------------

/** What a builder hands back: the DAWN state the escape is driven from, plus the
 *  snapshot taken the instant the adversarial mechanism completed (which for the
 *  confiscation is mid-DAY, before the dusk floor has had a chance to fire). The
 *  non-vacuity suite asserts against BOTH. */
interface AdversarialState {
  /** The state at the instant the mechanism completed — credits are 0 here. */
  atConstruction: GameState;
  /** The DAWN-phase state handed to the escape driver. */
  dawn: GameState;
}

/** A · INDEBTED TO PENNY WISE. A real borrow at the real desk (Sol-3 — the home
 *  hall, and since T-121 one of fourteen `hasHangout` ports) for the maximum
 *  principal, then LOAN_TERM_DAYS + 6 real
 *  dusks so the ENGINE itself accrues the interest and flips `status` to
 *  'defaulted' — after which the lending window is closed to this captain
 *  (`hangout.ts` refuses a second borrow with `failReason: 'already-has-loan'`),
 *  which is what makes the state adversarial: the obvious way out is gone. */
function buildIndebted(seed: number, systemId: number): AdversarialState {
  let state = startDay(createInitialState(seed)).state;
  state.player.currentSystemId = 1;
  state = applyPlayerAction(state, {
    type: 'VisitHangout',
    venue: 'borrow',
    amount: LOAN_MAX_PRINCIPAL,
    spendDie: 0,
  }).state;

  for (let i = 0; i < LOAN_TERM_DAYS + 6; i += 1) {
    state = endDay(state).state;
    state = startDay(state).state;
  }
  state = endDay(state).state;

  // Broke and dry, far from the desk. The loan and everything the engine accrued
  // onto it is untouched.
  state.player.currentSystemId = systemId;
  state.player.credits = 0;
  state.player.ship.fuel = 0;
  state.player.activeContract = null;
  return { atConstruction: state, dawn: state };
}

/** A PATROL interceptor fixture. Same shape as the engine's own
 *  `patrol.test.ts:18` fixture (the sim package cannot import an engine test
 *  file, so it is restated rather than shared). */
function patrolFixture(): EncounterState {
  return {
    id: 'enc-patrol-t1605b',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-patrol-t1605b',
      source: 'anonymous',
      name: 'Lt.Savage',
      shipName: 'SP1.Thor',
      shipClass: 'SLOOP',
      homeSystem: 'Procyon-5',
      kind: 'PATROL',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: 30 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

/** The scan rng. FIXED (not derived from the campaign seed) and chosen so the
 *  patrol's d20 is a natural 20: `dice.ts` `check` makes a nat 20 auto-succeed, so
 *  the CAUGHT branch is forced without the fixture depending on GUILE tuning or on
 *  a particular seed rolling well. The campaign variation for this arm comes from
 *  `createInitialState(seed)`, not from the scan. */
function confiscationScanRng(): SeededRng {
  return new SeededRng(3).fork('t-1605b-confiscation-scan');
}

/** B · POST-CONFISCATION. The real scan, caught branch: a rim captain carrying
 *  BOTH illicit sources (a type-10 Contraband contract and the derelict pod flag)
 *  is boarded, loses both, and is fined to exactly zero. `applyPatrolContrabandScan`
 *  is called directly with the encounter as an argument, which is precisely how
 *  `travel.ts:554` invokes it mid-interdiction — the encounter is never installed
 *  on the state, so there is nothing to clear afterwards. */
function buildConfiscated(seed: number, systemId: number): AdversarialState {
  const state = startDay(createInitialState(seed)).state;
  state.player.currentSystemId = systemId;
  // Exactly the fine, so `min(credits, CONTRABAND_FINE)` takes the purse to 0.
  state.player.credits = CONTRABAND_FINE;
  state.player.ship.fuel = 0;
  state.player.activeContract = { destination: 1, cargoType: 10, payment: 4000, pods: 10 };
  state.flags['signal.contraband.carrying'] = true;

  const events: GameEvent[] = [];
  // Mutates `state` in place (the engine calls it mid-resolution).
  applyPatrolContrabandScan(state, patrolFixture(), confiscationScanRng(), events);

  // The dusk that closes the day of the boarding is a REAL dusk, so this arm's
  // escape starts the morning after — with the subsistence floor's first fire
  // already on the books. That is the honest post-confiscation state.
  const dawn = endDay(state).state;
  return { atConstruction: state, dawn };
}

/** The rim system furthest from `id` — the destination that makes a contract
 *  genuinely undeliverable (see `buildZeroFuelRim`). */
function furthestRim(id: number): number {
  return RIM_SYSTEM_IDS.reduce((best, other) =>
    distance(id, other) > distance(id, best) ? other : best,
  );
}

/** C · ZERO-FUEL RIM. Both of F2's locks at once: a dry tank and an empty purse
 *  at the frontier, with the hold nailed shut by a contract bound for the far side
 *  of the rim shell — a leg that costs more fuel than the tank can physically hold,
 *  so no amount of refuelling makes it deliverable. The only way out is the T-1604b
 *  `abandon-contract` verb, which is why this arm asserts that verb was used. */
function buildZeroFuelRim(seed: number, systemId: number): AdversarialState {
  const state = createInitialState(seed);
  state.player.currentSystemId = systemId;
  state.player.credits = 0;
  state.player.ship.fuel = 0;
  state.player.activeContract = {
    destination: furthestRim(systemId),
    cargoType: 3,
    payment: 2200,
    pods: 10,
  };
  return { atConstruction: state, dawn: state };
}

type AdversarialBuilder = (seed: number, systemId: number) => AdversarialState;

const MATRIX: readonly [name: string, build: AdversarialBuilder, systems: number[]][] = [
  // The hangout home, the audited F2 system (Mira-9), and two rim.
  ['indebted-to-Penny-Wise', buildIndebted, [1, 8, 15, 18]],
  ['post-confiscation', buildConfiscated, RIM_SYSTEM_IDS],
  ['zero-fuel-rim', buildZeroFuelRim, RIM_SYSTEM_IDS],
];

// ---------------------------------------------------------------------------

describe('T-1605b · anti-poverty-trap invariant over adversarial states', () => {
  // -------------------------------------------------------------------------
  // NON-VACUITY. A property test over states that were never actually trapped
  // proves nothing, so each mechanism is asserted to have really fired before any
  // escape is measured.
  // -------------------------------------------------------------------------
  describe('the three adversarial states are genuinely trapped', () => {
    it('indebted-to-Penny-Wise: the loan really defaulted, and the desk is now closed', () => {
      const { dawn } = buildIndebted(1, 18);
      const loan = dawn.player.loan;
      expect(loan).not.toBeNull();
      expect(loan!.principal).toBe(LOAN_MAX_PRINCIPAL);
      // The ENGINE flipped this, not the fixture (day.ts endDay, `day >= dueDay`).
      expect(loan!.status).toBe('defaulted');
      // Real per-dusk accrual happened on top of the principal.
      expect(loan!.outstanding).toBeGreaterThan(LOAN_MAX_PRINCIPAL);

      // The adversarial bite: borrowing again is refused, so the obvious way out
      // of being broke is shut (`hangout.ts` 'already-has-loan').
      const atDesk = startDay(dawn).state;
      atDesk.player.currentSystemId = 1;
      const retry = applyPlayerAction(atDesk, {
        type: 'VisitHangout',
        venue: 'borrow',
        amount: LOAN_MAX_PRINCIPAL,
        spendDie: 0,
      });
      expect(
        retry.events.some(
          (event) =>
            event.type === 'LoanEvent' &&
            event.kind === 'failed' &&
            event.failReason === 'already-has-loan',
        ),
      ).toBe(true);
      expect(retry.state.player.credits).toBe(0);
    });

    it('post-confiscation: the patrol really caught them, took both loads and fined them to zero', () => {
      const state = startDay(createInitialState(1)).state;
      state.player.currentSystemId = RIM_SYSTEM_IDS[0]!;
      state.player.credits = CONTRABAND_FINE;
      state.player.ship.fuel = 0;
      state.player.activeContract = { destination: 1, cargoType: 10, payment: 4000, pods: 10 };
      state.flags['signal.contraband.carrying'] = true;

      const events: GameEvent[] = [];
      applyPatrolContrabandScan(state, patrolFixture(), confiscationScanRng(), events);

      const scan = events.filter((event) => event.type === 'ContrabandScan');
      expect(scan, 'the scan fired at all').toHaveLength(1);
      expect(scan[0].caught).toBe(true);

      const seizure = events.filter((event) => event.type === 'ContrabandConfiscated');
      expect(seizure, 'ContrabandConfiscated was emitted').toHaveLength(1);
      expect(seizure[0].confiscatedContract).toBe(true);
      expect(seizure[0].confiscatedPod).toBe(true);
      expect(seizure[0].fine).toBe(CONTRABAND_FINE);

      expect(state.player.credits).toBe(0);
      expect(state.player.activeContract).toBeNull();
      expect(state.flags['signal.contraband.carrying']).toBeUndefined();
    });

    it('zero-fuel-rim: every held contract is undeliverable at ANY tank level', () => {
      // Table-driven so the arm cannot silently stop being adversarial if drive
      // tuning or the rim layout moves: the leg must cost more than the tank can
      // physically hold, not merely more than it currently holds.
      for (const systemId of RIM_SYSTEM_IDS) {
        const { dawn } = buildZeroFuelRim(1, systemId);
        const ship = dawn.player.ship;
        const cost = jumpFuelCost(
          ship.drives,
          distance(systemId, dawn.player.activeContract!.destination),
          ship.hasTransWarpDrive ?? false,
        );
        expect(
          cost,
          `${STAR_SYSTEMS[systemId].name} → ${STAR_SYSTEMS[dawn.player.activeContract!.destination].name} must exceed maxFuel ${ship.maxFuel}`,
        ).toBeGreaterThan(ship.maxFuel);
      }
    });

    it.each(MATRIX)(
      '%s: every seed × system is stranded and penniless at construction',
      (_name, build, systems) => {
        for (const systemId of systems) {
          for (const seed of SEEDS) {
            const { atConstruction, dawn } = build(seed, systemId);
            expect(atConstruction.player.credits, `system ${systemId} seed ${seed}`).toBe(0);
            expect(atConstruction.player.ship.fuel, `system ${systemId} seed ${seed}`).toBe(0);
            // The T-1004 stranding measure: even spending everything on fuel does
            // not buy the cheapest jump available.
            expect(
              cannotAffordCheapestJump(atConstruction),
              `system ${systemId} seed ${seed}`,
            ).toBe(true);
            expect(cannotAffordCheapestJump(dawn), `system ${systemId} seed ${seed} at dawn`).toBe(
              true,
            );
            expect(dawn.dayPhase, 'the escape driver starts at DAWN').toBe(DayPhase.DAWN);
            expect(careerEnded(dawn)).toBe(false);
          }
        }
      },
      60_000,
    );
  });

  // -------------------------------------------------------------------------
  // PT-4, carrying PT-1/PT-2/PT-3 with it. One named CI line per adversarial
  // state, so the acceptance's "three named adversarial states" reads off the
  // test output rather than out of one opaque loop.
  // -------------------------------------------------------------------------
  describe('PT-4 · the trap has a bounded exit (PT-1/PT-2/PT-3 asserted per day)', () => {
    it.each(MATRIX)(
      '%s: an ADVERTISED sequence restores mobility and income within the bound',
      (name, build, systems) => {
        for (const systemId of systems) {
          for (const seed of SEEDS) {
            const label = `${name} @ ${STAR_SYSTEMS[systemId].name} seed ${seed}`;
            const { daily } = driveEscape(build(seed, systemId).dawn, HORIZON);
            assertEscapeInvariants(daily, label);

            if (name === 'zero-fuel-rim') {
              // This arm's hold cannot be freed any other way, so the T-1604b verb
              // is the load-bearing move — assert it was actually taken rather than
              // inferring it from the escape succeeding.
              expect(
                daily.some((day) => day.actions.includes('Trade/abandon-contract')),
                `${label}: the escape must have used abandon-contract to free the hold`,
              ).toBe(true);
            }
          }
        }
      },
      120_000,
    );
  });

  // -------------------------------------------------------------------------
  // PT-5. The direct answer to the 385-day pin the campaign measured: the exit is
  // not a narrow window that closes. Idle for 150 days from the indebted state —
  // the loan accrues every dusk and the guild marker compounds, both without any
  // ceiling — and the same bounded escape is still there on the far side.
  // -------------------------------------------------------------------------
  describe('PT-5 · the out never expires', () => {
    it('after 150 idle days with the ledgers compounding, the bounded escape still holds', () => {
      const seed = 3;
      const { dawn } = buildIndebted(seed, 18);
      const idled = driveFrom(idlePolicy, dawn, seed, 150);

      // A career, not a corpse: no terminal state was reached by doing nothing.
      expect(careerEnded(idled)).toBe(false);
      // A six-figure ledger, and the purse still holds exactly the floor — the
      // one assertion that says debt is an OUT, never negative money.
      // Measured at this seed: debt 416,441 and a loan outstanding of 48,000.
      expect(idled.player.debt).toBeGreaterThan(100_000);
      expect(idled.player.loan!.outstanding).toBeGreaterThan(LOAN_MAX_PRINCIPAL);
      expect(idled.player.credits).toBe(SUBSISTENCE_FLOOR_CREDITS);
      // Still trapped — idling never bought its way out, so the escape below is
      // measured from a genuinely stuck state and not from a recovered one.
      expect(cannotAffordCheapestJump(idled)).toBe(true);

      const { daily } = driveEscape(idled, HORIZON);
      assertEscapeInvariants(daily, `indebted-to-Penny-Wise after 150 idle days (seed ${seed})`);
    }, 120_000);
  });
});
