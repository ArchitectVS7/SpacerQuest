import {
  CARGO_TYPES,
  CREW_BY_ID,
  DISPOSITION_DECAY_INTERVAL_DAYS,
  DISPOSITION_DELTAS,
  GUILD_DEBT_DAILY_RATE,
  LENDER_ID,
  LIFE_SUPPORT_SURVIVAL_DC,
  LOAN_DEFAULT_DISPOSITION,
  NEMESIS_SYSTEM_ID,
  isSimulatedCaptain,
  ALL_NPC_PROFILES,
  STAR_SYSTEMS,
  SUBSISTENCE_FLOOR_CREDITS,
  Stat,
  DEMO_FINAL_DAY,
  isGatedDestination,
} from '@spacerquest/content';
import { DayPhase, GameState, GameEvent, PlayerAction } from './types.js';
import { SeededRng } from './rng.js';
import { dawnDiceModifiers, equipmentDiceBenefits, rollDawnHand } from './dice.js';
import { autoRepairRegen, lifeSupportCritical } from './components.js';
import { applySuccession } from './legacy.js';
import { applyDisposition, mutableNpc, resolveNpcDay, type NpcDecisionTraceSink } from './npc.js';
import {
  debitJobPool,
  generateManifestBoard,
  jobPoolDepth,
  localFuelPrice,
  regeneratePools,
  syncMaxFuel,
} from './economy.js';
import { advanceEraSchedule } from './era.js';
import { resetDailyHangoutCaps } from './hangoutRules.js';
import { resolveTrade } from './actions/trade.js';
import { resolveTravel } from './actions/travel.js';
import {
  applyEncounterDuskPressure,
  resolveCombat,
  resolveInterceptorFled,
} from './actions/combat.js';
import { resolveShipyard } from './actions/shipyard.js';
import { resolveExploration } from './actions/exploration.js';
// T-111: the dusk recovery payout resolves the STORED outcome row through the
// same generic payoff resolver the day-of draw uses (exploreOutcomes.ts).
import { outcomeById, resolveExploreOutcome } from './exploreOutcomes.js';
import { resolveVisitHangout } from './actions/hangout.js';
import { resolveDare, settleDareHand } from './actions/dare.js';
import { resolveCrew, resolveReroll } from './actions/crew.js';
import { portDuskIncome, resolvePortPurchase } from './actions/port.js';
import { evaluateDeeds } from './deeds.js';
import { syncPlayerTier } from './tier.js';
import {
  refreshAvailableStorylets,
  resolveAbandonedChains,
  resolveStoryletChoice,
} from './storylets.js';
import { computeGuildStanding, guildManifestPenalty, guildSeverity } from './guild.js';
import { careerEnded } from './nemesis.js';
import { demoConcluded, demoLocked, isDemo } from './demo.js';
import { natWireStories } from './wire.js';
import { cloneState } from './clone.js';

function appendEvents(state: GameState, events: GameEvent[]): void {
  state.eventLog.push(...events);
}

/**
 * N10 · How many offers may be taken off the player's LIVE board in one dusk —
 * T-106's implicit `boardClaimSpent` boolean, named so it can be swept.
 *
 * IT IS NO LONGER A THROTTLE ON PARTICIPATION, which is the whole change. Pre-N10
 * this cap and the co-location gate together decided whether a captain competed
 * for contracts AT ALL, so 29 of the 30 were economically invisible on any given
 * day. Now every trading captain claims against their system's pool
 * (`NpcDayResult.claimedFromPool`) and this cap governs only the SPECTACLE: how
 * many offers can vanish from under the player's nose in one evening.
 *
 * ITS VALUE IS A SWEPT DECISION, not an inheritance — N10's Change clause asks
 * for exactly that, and the measured comparison (this value against 2 and against
 * unbounded, on claim counts and on the player's board depth) is recorded in
 * N10's Result block in `docs/NPC_REDESIGN.md`. Read it there before moving this.
 */
const MAX_VISIBLE_SNIPES_PER_DUSK = 1;

/**
 * T-1703 · The verbs a refusal can name — exactly the members of
 * `ActionBlocked.actionType`, so this predicate and the event type cannot drift.
 *
 * `Reroll`, `Combat` and `Wait` are NOT members and therefore cannot be refused
 * without widening the enum again, which the demo gate has no reason to do:
 * `Wait` only refreshes an offer set, a `Reroll` charge spends on a hand that
 * buys nothing once every verb is inert, and `Combat` needs a live encounter —
 * which a career that has ALREADY rolled past its last dusk cannot acquire (a
 * jump is what generates one, and jumping is blocked).
 */
function isBlockableAction(action: PlayerAction): action is Extract<
  PlayerAction,
  {
    type:
      'Trade' | 'Travel' | 'Shipyard' | 'Storylet' | 'Explore' | 'VisitHangout' | 'Port' | 'Crew';
  }
> {
  return (
    action.type === 'Trade' ||
    action.type === 'Travel' ||
    action.type === 'Shipyard' ||
    action.type === 'Storylet' ||
    action.type === 'Explore' ||
    action.type === 'VisitHangout' ||
    action.type === 'Port' ||
    action.type === 'Crew'
  );
}

export function startDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAWN) {
    throw new Error('startDay requires DAWN phase');
  }

  const dayRng = new SeededRng(nextState.rngState).fork(`day-${nextState.day}`);
  nextState.storylets.offeredToday = [];

  // Generate manifest board and price the local depot from canon tables.
  //
  // T-106 contract competition, GENERALISED BY N10: the board is sized from the
  // pool of the system the player is STANDING IN, and that pool is drained by
  // every captain who worked it — not only by the one who sniped an offer from
  // under the player's nose. So arriving somewhere the cast has been hauling out
  // of is visibly thin, which is the difference between watching the competition
  // and merely sharing a galaxy with it.
  const boardSize = jobPoolDepth(nextState.market.jobPoolClaims, nextState.player.currentSystemId);
  // T-1309 · Port-clerk flag reader (worse manifest terms). A `guild.debt-flagged`
  // captain (unpaid Tour One marker, day.ts endDay) gets the lower-paying runs: the
  // stored flag value is a guild-standing severity, and `guildManifestPenalty` maps
  // it to a <1 payment multiplier threaded into every contract on today's board.
  // Guarded on the flag → penalty is exactly 1 for a clean captain (every existing
  // golden), and rollContract applies it AFTER all rng draws, so a clean board is
  // byte-identical. READER of the flag: this call site (via economy.ts rollContract).
  const guildFlag = Number(nextState.flags['guild.debt-flagged'] ?? 0);
  const manifestPenalty = guildFlag > 0 ? guildManifestPenalty(guildFlag) : 1;
  const manifestBoard = generateManifestBoard(
    nextState.player.currentSystemId,
    dayRng.fork('market'),
    nextState.player.ship,
    boardSize,
    nextState.eraEvent,
    manifestPenalty,
  );
  // N10 · The pools restock AFTER the board is drawn, and the order is the whole
  // reason the pre-N10 signal survives: a claim taken at dusk N is read by dawn
  // N+1 (thinner board) and only then restocked. Restocking first would refill the
  // pool before anyone could see it drained, which would silently delete T-106's
  // mechanism rather than generalise it.
  //
  // The claims record is carried forward rather than reset — pools are galaxy
  // state now, not a one-day counter. `regeneratePools` deletes tallies that reach
  // 0, so the record does not grow.
  const jobPoolClaims = nextState.market.jobPoolClaims;
  regeneratePools(jobPoolClaims);
  nextState.market = {
    manifestBoard,
    localFuelPrice: localFuelPrice(nextState.player.currentSystemId, nextState.eraEvent),
    jobPoolClaims,
  };

  // Roll player hand. T-1306: the hand size / floor / re-roll charges are now
  // PARAMETERIZED off the player's crew (dice.ts dawnDiceModifiers) rather than a
  // hardcoded 5 — a die-granting crew rolls 6, a floor crew never rolls below its
  // floor, a reroll crew banks a charge. An empty crew yields
  // `{ handSize: 5, floor: 0, rerolls: 0 }`, so the `rng.rollHand(5)` draw is
  // byte-identical to before (only the added `rerollsRemaining: 0` key on the hand
  // moves the serialized-state golden hashes; the DawnRoll event is unchanged).
  // T-1601c: the aggregation also takes the EQUIPMENT leg — the dice benefits of
  // the modules fitted to this ship (`equipmentDiceBenefits`). T-112 made that leg
  // LIVE without touching this call: the yard's `EQUIPMENT_DICE_BENEFITS` still
  // ships empty, but the sibling `EXPLORE_MODULE_DICE_BENEFITS` now carries the
  // three explore-granted modules, folded in by a second loop inside the same pure
  // function. A ship with no fitted module still contributes `[]`, so the draw is
  // byte-identical for every career that has not recovered one.
  const modifiers = dawnDiceModifiers(
    nextState.player.crew,
    equipmentDiceBenefits(nextState.player.ship),
  );
  const playerHand = rollDawnHand(dayRng.fork('player-hand'), modifiers);
  nextState.player.dawnHand = playerHand;

  events.push({
    type: 'DawnRoll',
    day: nextState.day,
    hand: [...playerHand.dice],
  });

  const refreshed = refreshAvailableStorylets(nextState);
  nextState = refreshed.state;
  events.push(...refreshed.events);
  events.push(...evaluateDeeds(nextState, events));
  // T-1203: a dawn deed can rank the player up; recompute the matchmaking band
  // AFTER evaluateDeeds so the day's first jump reads the fresh tier.
  syncPlayerTier(nextState);

  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAY;
  nextState.dayEventCount = events.length;
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function applyPlayerAction(
  state: GameState,
  action: PlayerAction,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('applyPlayerAction requires DAY phase');
  }

  if (action.type === 'Wait') {
    const refreshed = refreshAvailableStorylets(nextState);
    const events = refreshed.events;
    refreshed.state.dayEventCount = nextState.dayEventCount + events.length;
    appendEvents(refreshed.state, events);
    return { state: refreshed.state, events };
  }

  // T-1306: Reroll and Crew are exempt from the encounter block. Re-rolling a die
  // or hiring/dismissing crew mid-encounter is harmless (it touches the dawn hand /
  // crew roster, never the encounter) and is never offered by the sim/UI during a
  // fight — exempting them here avoids widening the ActionBlocked.actionType enum
  // for actions that have no reason to be blocked.
  // T-1307: Port is exempt for the SAME reason — a port purchase touches only
  // `player.ports` and credits, never the encounter, and the sim/UI never offer it
  // mid-fight. Exempting it avoids widening the ActionBlocked.actionType enum for
  // an action that has no reason to be blocked.
  // T-135: `Dare` is exempt for the same reason the three above are — it touches
  // only `state.dareHand`, never the encounter, and the two scenes are mutually
  // exclusive by construction (this gate refuses the `VisitHangout` that would
  // open a hand mid-fight; the dare gate below refuses the `Travel` that would
  // start a fight mid-hand). Exempting it avoids widening `ActionBlocked.actionType`
  // for a verb that has no reason to be blocked, exactly the T-1306/T-1307
  // precedent.
  if (
    nextState.encounter &&
    action.type !== 'Combat' &&
    action.type !== 'Dare' &&
    action.type !== 'Reroll' &&
    action.type !== 'Crew' &&
    action.type !== 'Port'
  ) {
    // Trade/Travel/Shipyard during an active encounter are player-possible acts,
    // not malformed input — surface a typed ActionBlocked event instead of
    // throwing. Refusals are logged (ShipyardFail precedent): the event is
    // appended to the event log, but no die is spent, dayEventCount is not
    // bumped, and no other state changes.
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'active-encounter',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-135 · GATE 1 · AN OPEN LIAR'S DICE HAND BLOCKS THE WORLD, exactly as an
  // encounter does (docs/LIARS-DICE_REDESIGN.md §9.3). This is what makes "a hand
  // is a scene like Combat" true rather than asserted, and it is what stops the
  // pathological state where a captain opens a hand, flies three jumps, and asks
  // a dealer they have left behind to answer a standing bid.
  //
  // EXEMPTIONS ARE THE ENCOUNTER GATE'S, verbatim and for the identical reasons:
  // `Reroll` / `Crew` / `Port` touch the dawn hand, the roster and the ports and
  // never the scene; `Combat` cannot co-occur (the gate above refuses the
  // `VisitHangout` that would open a hand mid-fight, and this gate refuses the
  // `Travel` that would start a fight mid-hand); `Dare` is the scene's own verb.
  // Placed BELOW the encounter gate so that if both were somehow live the truer
  // reason wins, matching the terminal guard's ordering rationale below.
  //
  // Refusal shape, also the encounter gate's: one typed ActionBlocked appended to
  // the log, NO die spent, NO rng fork, `dayEventCount` untouched, no throw. This
  // widens `ActionBlocked.reason` only — `actionType` already carries all six
  // blockable verbs.
  if (
    nextState.dareHand &&
    action.type !== 'Dare' &&
    action.type !== 'Combat' &&
    action.type !== 'Reroll' &&
    action.type !== 'Crew' &&
    action.type !== 'Port'
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'active-dare-hand',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1505c · THE TERMINAL GUARD (design call D7/D8). Arrival at NEMESIS ends the
  // career: there is no port, no board, no fuel and no return leg on the far side
  // of the shear, so every player verb from there is inert. The ENGINE owns that
  // rule — the UI's ending screen only renders it — and a refusal here is a
  // player-possible act, not malformed input, so it takes the same shape as the
  // two gates around it: one typed ActionBlocked appended to the log, NO die
  // spent, NO rng fork, `dayEventCount` untouched, no throw.
  //
  // ORDER: deliberately ABOVE the destination gate, so a jump attempted from the
  // far side reads 'career-ended' (the true reason — the career is over) rather
  // than 'destination-locked' (which would imply a door that could still open).
  // Asserted in day.test.ts.
  //
  // WHAT IS GUARDED, and why the rest is exempt: the six members of
  // `ActionBlocked.actionType`. `Reroll`/`Crew`/`Port`/`Combat` are NOT in that
  // enum and fall through — exactly the T-1306/T-1307 precedent, which declined to
  // widen the enum for actions that have no reason to be blocked. None of them can
  // do anything at system 28: there is no encounter to fight (the crossing route
  // takes no encounter roll), no port to buy, no hangout to hire from, and no
  // reroll charge worth spending on a hand that can no longer be played. `Wait`
  // likewise falls through above (it only refreshes an offer set that is empty on
  // the far side). READER of the event: the sim's `legalActions`, which advertises
  // nothing on an ended career so a headless driver never earns this refusal.
  if (
    careerEnded(nextState) &&
    (action.type === 'Trade' ||
      action.type === 'Travel' ||
      action.type === 'Shipyard' ||
      action.type === 'Storylet' ||
      action.type === 'Explore' ||
      action.type === 'VisitHangout')
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'career-ended',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1703 · THE DEMO GATE, in two halves, placed immediately after the T-1505c
  // terminal guard and before the T-1101 destination gate. Both halves take the
  // exact shape of the three gates around them: one typed ActionBlocked appended
  // to the log, NO die spent, NO rng fork, `dayEventCount` untouched, no throw.
  //
  // HALF ONE — THE CEILING. A demo career past `DEMO_FINAL_DAY` is over, exactly
  // as a career on the far side of the shear is: the licence has expired and
  // every blockable verb is inert. The same six verbs as the terminal guard, for
  // the same reason (they are `ActionBlocked.actionType`'s original members), plus
  // the two the demo gate added — `Port` and `Crew` — because unlike the shear
  // (no port, no hangout, no berth to fill out there) a concluded demo career is
  // standing in a perfectly ordinary port where those two verbs would otherwise
  // still resolve.
  if (demoConcluded(nextState) && isBlockableAction(action)) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'demo-ended',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // HALF TWO — THE TWO REACHABLE LOCKS. A port stake (cheapest 7,150cr) and a
  // crew hire (cheapest 2,000cr) are both affordable inside Tour One, so they are
  // the veteran content a demo could actually reach; the rest of the veteran game
  // is held out by the ceiling above, not by a flag (see content demo.ts).
  //
  // `Crew{dismiss}` is deliberately NOT gated: a promoted-then-demoted save can
  // carry crew in, and refusing to let a captain let someone go would be a lock
  // that takes something away rather than one that withholds a purchase.
  if (
    (action.type === 'Port' && demoLocked(nextState, 'port-ownership')) ||
    (action.type === 'Crew' &&
      action.action === 'hire' &&
      demoLocked(nextState, 'crew-progression'))
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'demo-locked',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1101 · Destination gate. Andromeda (21–26) and the special systems (27–28)
  // are sealed in v1 (§10); the Nemesis crossing is the endgame, unlocked by the
  // 'nemesis.crossing.unlocked' flag. A Travel to a still-sealed destination is a
  // player-possible act, not malformed input — surface a typed ActionBlocked
  // (mirrors the encounter block above: the refusal is logged, but no die is
  // spent, no RNG fork, dayEventCount is not bumped, and no throw).
  //
  // T-1505b · THE LIFT IS NEMESIS-ONLY (design call D1, stated in full at
  // `GATED_DESTINATION_MIN_ID` in content systems.ts). The flag now has a setter —
  // engine `commitCrossingStake`, driven by the `nemesis.crossing.the-stake`
  // storylet — and paying the stake opens EXACTLY ONE id: NEMESIS_SYSTEM_ID.
  // Andromeda (21–26) and MALIGNA (27) stay sealed for the expansion, so a
  // post-stake Travel to any of them is STILL 'destination-locked'. This is
  // asserted both ways in day.test.ts (unset blocks 28; set lifts 28 and leaves
  // 21–27 blocked).
  // READER of the flag: this branch (T-1505b is its writer).
  const crossingOpen =
    action.type === 'Travel' &&
    action.destinationId === NEMESIS_SYSTEM_ID &&
    nextState.flags['nemesis.crossing.unlocked'] === true;
  if (action.type === 'Travel' && isGatedDestination(action.destinationId) && !crossingOpen) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: 'Travel',
      reason: 'destination-locked',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1303 · Hangout gate. A VisitHangout is only legal at a system flagged
  // `hasHangout` (Sol-3 first, systems.ts). Elsewhere it is a player-possible act,
  // not malformed input — surface a typed ActionBlocked (mirrors the destination
  // gate above: refusal logged, no die spent, no RNG fork, dayEventCount not
  // bumped, no throw). READER of `hasHangout`: this branch (and the sim protocol's
  // legalActions, which won't advertise VisitHangout at an un-flagged system).
  if (
    action.type === 'VisitHangout' &&
    STAR_SYSTEMS[nextState.player.currentSystemId]?.hasHangout !== true
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: 'VisitHangout',
      reason: 'no-hangout',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  const dayRng = new SeededRng(nextState.rngState);
  const actionEventIndex = nextState.dayEventCount;

  let result: { state: GameState; events: GameEvent[] };
  if (action.type === 'Trade') {
    result = resolveTrade(nextState, action, dayRng.fork(`action-trade-${actionEventIndex}`));
  } else if (action.type === 'Travel') {
    result = resolveTravel(nextState, action, dayRng.fork(`action-travel-${actionEventIndex}`));
  } else if (action.type === 'Shipyard') {
    dayRng.fork(`action-shipyard-${actionEventIndex}`);
    result = resolveShipyard(nextState, action);
  } else if (action.type === 'Combat') {
    result = resolveCombat(nextState, action, dayRng.fork(`action-combat-${actionEventIndex}`));
  } else if (action.type === 'Explore') {
    result = resolveExploration(
      nextState,
      action,
      dayRng.fork(`action-explore-${actionEventIndex}`),
    );
  } else if (action.type === 'VisitHangout') {
    result = resolveVisitHangout(
      nextState,
      action,
      dayRng.fork(`action-hangout-${actionEventIndex}`),
    );
  } else if (action.type === 'Dare') {
    // T-135 · one move in the open Liar's Dice hand. A DEDICATED branch, and it
    // must sit above the terminal `else` (which treats anything unmatched as a
    // Storylet — a `Dare` falling into it would be a silent disaster). The fork
    // label matches every other action's shape.
    result = resolveDare(nextState, action, dayRng.fork(`action-dare-${actionEventIndex}`));
  } else if (action.type === 'Reroll') {
    result = resolveReroll(nextState, action, dayRng.fork(`action-reroll-${actionEventIndex}`));
  } else if (action.type === 'Crew') {
    // resolveCrew is pure (no rng), but fork+discard to keep the action rng stream
    // aligned with every OTHER action (mirrors the Shipyard branch). T-196a: the
    // hire/dismiss verbs are FREE now (docs/DAWN-HAND-REDESIGN.md §3), and the fork
    // stays exactly as it was — dropping it would re-phase every seeded campaign
    // and every golden for a second, unrelated reason.
    dayRng.fork(`action-crew-${actionEventIndex}`);
    result = resolveCrew(nextState, action);
  } else if (action.type === 'Port') {
    // resolvePortPurchase is pure (no rng), but fork+discard to keep the action rng
    // stream aligned with every OTHER action (mirrors the Crew/Shipyard branches).
    // T-196a: the buy is FREE now, and the fork stays — see the Crew branch.
    dayRng.fork(`action-port-${actionEventIndex}`);
    result = resolvePortPurchase(nextState, action);
  } else {
    result = resolveStoryletChoice(
      nextState,
      action,
      dayRng.fork(`action-storylet-${actionEventIndex}`),
    );
  }

  let resolvedState = result.state;
  resolvedState.rngState = dayRng.getState();
  resolvedState.dayPhase = DayPhase.DAY;
  // T-1102 single recompute chokepoint: any action that changed the hull
  // (shipyard upgrade, astraxial/cloaker fit, repair, combat damage) re-derives
  // the fuel ceiling here rather than at each low-level site. Combat damage
  // shrinking the tank falls out naturally (on-PRD: a fragile ship holds less).
  syncMaxFuel(resolvedState.player.ship);
  const deedEvents = evaluateDeeds(resolvedState, result.events);
  // T-1203 tier chokepoint: the resolved action may have upgraded the ship
  // (resolveShipyard above) or earned a rank-up (evaluateDeeds just now), so
  // recompute the matchmaking band here — the live field the NEXT jump's
  // selectEncounterInterceptor reads. Placed after evaluateDeeds so a
  // same-action rank-up is reflected.
  syncPlayerTier(resolvedState);
  const refreshed = refreshAvailableStorylets(resolvedState);
  resolvedState = refreshed.state;
  const events = [...result.events, ...deedEvents, ...refreshed.events];
  // T-1202 (PRD §6): any player/interceptor check in this action that came up a
  // natural 20 or natural 1 always spins a Galactic Wire story. Seeded from the
  // STABLE pre-action rngState (never `dayRng`, whose state is already persisted
  // above) so scanning cannot perturb determinism or the golden fixtures.
  const natWire = natWireStories(
    events,
    resolvedState.day,
    new SeededRng(state.rngState).fork(`wire-nat-day-${actionEventIndex}`),
    resolvedState.npcs,
    // T-1303: a player Spacer's Dare nat names a co-located NPC as the loser.
    resolvedState.player.currentSystemId,
  );
  events.push(...natWire);
  resolvedState.dayEventCount = actionEventIndex + events.length;
  appendEvents(resolvedState, events);

  return { state: resolvedState, events };
}

/**
 * T-140 · Diagnostic-only options for {@link endDay}. Absent on every ordinary
 * call — the parameter defaults to `{}` precisely so that every existing caller
 * (the cockpit's `endDay(state)`, the sim's day loop, ~120 tests) compiles and
 * behaves untouched, which is what makes the addition provably inert.
 */
export interface EndDayOptions {
  /**
   * Where the dusk's NPC decision traces go (docs/BALANCE-TELEMETRY_SPEC.md).
   * Supplied ONLY by `packages/sim`'s sweep runner behind `--trace-npc-decisions`;
   * `packages/ui` and `packages/desktop` never pass one.
   */
  npcDecisionTrace?: NpcDecisionTraceSink;
}

export function endDay(
  state: GameState,
  options: EndDayOptions = {},
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('endDay requires DAY phase');
  }

  const dayRng = new SeededRng(nextState.rngState);

  // T-135 · THE DUSK FOLD (docs/LIARS-DICE_REDESIGN.md §6.2). An open Liar's Dice
  // hand at dusk is resolved as a PLAYER FOLD — identical economics, identical
  // disposition delta, identical events, `outcome: 'timeout-fold'`.
  //
  // WHY A FOLD and not an auto-challenge or a void: an auto-challenge would make
  // "let the day run out" a free showdown, strictly better than folding, which
  // would make FOLD dead; a void (refund both escrows) would be strictly better
  // than ANY move. A fold is also what a table does when you walk away. With this
  // clause NO REACHABLE STATE CAN CARRY A HAND INTO THE NEXT DAWN, which is the
  // second safety net under the sim's continuation loop (§12.4).
  //
  // IT DRAWS NO RNG, deliberately: `settleDareHand` is pure arithmetic over the
  // escrow plus `applyDisposition`, so `dayRng` is untouched and every downstream
  // dusk draw — the bond hook, the NPC loop, the era scheduler — lands exactly
  // where it did before. That is what keeps the day-loop goldens' EVENT hashes
  // honest for scripts that never open a hand.
  //
  // FIRST, before the dawn-hand spend-out and before the NPC dusk loop, so the
  // dealer's purse settles on the same tick their own day is simulated.
  if (nextState.dareHand) settleDareHand(nextState, 'timeout-fold', events);

  // Set all dice to spent if player didn't use them (day is over)
  if (nextState.player.dawnHand) {
    for (let i = 0; i < nextState.player.dawnHand.spent.length; i++) {
      nextState.player.dawnHand.spent[i] = true;
    }
  }

  // Bond hook — ONE mechanical intervention per dusk (T-106, rebuilt T-1204).
  // The intervention is now a TYPED per-profile character hook (profile.bondHook)
  // keyed to the NPC's Bond, not the old bare inline `disposition >= 5` + hard-
  // coded DCs: an NPC does the beat THEIR bond implies (Doc Salvage answers a
  // mayday → fuel-gift; Admiral Stern protects → drive-off), activates at the
  // profile's own threshold, and rolls against the profile's own DC. Candidate
  // rescuers are same-system NPCs whose hook is live (disposition >= its
  // activateAt); the HIGHEST disposition acts (id as tiebreak). An intervention
  // IS the rescuer's dusk action — helping the player costs them their own day,
  // so they skip the NPC loop below.
  //
  // Reachability (the T-1204 acceptance): the old bare 5-threshold + dry-tank-
  // only (===0) fuel gate never co-occurred in organic play — the hook fired
  // zero times ever. The data-driven low activateAt + broadened lowFuelThreshold,
  // together with the rebalanced slower decay, let a storylet-bonded NPC (Doc)
  // hold their standing long enough for a low-fuel dusk to reach it.
  let intervenedNpcId: string | null = null;
  // COPY-ON-WRITE (npc.ts `mutableNpc`): the rescuer is WRITTEN to below (ship.fuel
  // and lastAction), and NPC records are shared between snapshots, so the search below
  // finds the read-only record and `mutableNpc` swaps in a private copy before any
  // write. Named `rescuerRef` to make the read-only half explicit at the use sites.
  const rescuerRef = nextState.npcs
    .filter((npc) => {
      const hook = ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)?.bondHook;
      return (
        hook !== undefined &&
        npc.disposition >= hook.activateAt &&
        npc.currentSystemId === nextState.player.currentSystemId
      );
    })
    .sort((a, b) => b.disposition - a.disposition || a.id.localeCompare(b.id))[0];
  // The search above reads the SHARED record; this swaps in a private copy before
  // the fuel / lastAction writes below.
  const rescuer = rescuerRef ? mutableNpc(nextState, rescuerRef.id) : null;
  if (rescuer) {
    const rescuerProfile = ALL_NPC_PROFILES.find((p) => p.id === rescuer.profileId);
    const hook = rescuerProfile?.bondHook;
    const grit = rescuerProfile?.stats[Stat.GRIT] ?? 0;
    if (hook?.beat === 'drive-off' && nextState.encounter) {
      const rescueRng = dayRng.fork(`bond-rescue-${rescuer.id}`);
      if (rescueRng.d20() + grit >= hook.dc) {
        const interceptorName = nextState.encounter.interceptor.name;
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'drive-off',
        });
        resolveInterceptorFled(nextState, events);
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          kind: 'npc',
          message: `${rescuer.name} drove ${interceptorName} off your tail.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Combat',
          details: `spent the day driving ${interceptorName} off a friend's tail`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    } else if (
      hook?.beat === 'fuel-gift' &&
      !nextState.encounter &&
      nextState.player.ship.fuel <= (hook.lowFuelThreshold ?? 0) &&
      rescuer.ship.fuel >= (hook.minRescuerFuel ?? 100)
    ) {
      const giftRng = dayRng.fork(`bond-gift-${rescuer.id}`);
      if (giftRng.d20() + grit >= hook.dc) {
        const amount = hook.fuelAmount ?? 50;
        // N1: the gifted fuel comes out of the rescuer's SHIP's tank. `rescuer`
        // is the `mutableNpc` copy, whose `structuredClone` gave it a private
        // ship — writing through the shared record would reach every snapshot.
        rescuer.ship.fuel -= amount;
        nextState.player.ship.fuel = Math.min(
          nextState.player.ship.maxFuel,
          nextState.player.ship.fuel + amount,
        );
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'fuel-gift',
          amount,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          kind: 'npc',
          message: `${rescuer.name} answered your mayday and transferred ${amount} fuel.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Trade',
          details: `spent the day answering a mayday at ${
            STAR_SYSTEMS[rescuer.currentSystemId]?.name ?? `system ${rescuer.currentSystemId}`
          }`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    }
  }

  if (nextState.encounter) {
    events.push(
      ...applyEncounterDuskPressure(
        nextState,
        dayRng.fork(`encounter-dusk-${nextState.encounter.id}-${nextState.encounter.round}`),
      ),
    );
  }

  // T-1205 lifeSupport → survival reader. Life support driven to condition 0 —
  // only reachable now that enemy fire seed-targets components — faces a dusk GRIT
  // survival check (content LIFE_SUPPORT_SURVIVAL_DC). Passing it is a scare (no
  // state change); failing it loses the ship to a life-support failure, reusing
  // the tested T-108 succession path (the "newly-possible sim deaths" T-1205
  // anticipates). Runs after the dusk combat pressure above (which may itself have
  // driven lifeSupport to 0, or on a hull kill reset the ship to the junker — in
  // which case lifeSupportCritical is false and this is skipped) and before the
  // day increment, so the LifeSupportCritical event carries the correct day.
  // This is the named reader for the `lifeSupport` component (components.ts).
  if (lifeSupportCritical(nextState.player.ship)) {
    const survivalRng = dayRng.fork(`life-support-${nextState.day}`);
    const survived =
      survivalRng.d20() + nextState.player.stats[Stat.GRIT] >= LIFE_SUPPORT_SURVIVAL_DC;
    events.push({
      type: 'LifeSupportCritical',
      day: nextState.day,
      component: 'lifeSupport',
      survived,
    });
    if (survived) {
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message:
          'Life support gave out on the edge of the dark — the spacer rode it out on emergency air and lived to refit.',
      });
    } else {
      events.push({
        type: 'ShipLost',
        day: nextState.day,
        encounterId: '',
        interceptorId: 'life-support-failure',
        reason: 'life-support-failure',
        component: 'lifeSupport',
      });
      events.push(
        ...applySuccession(nextState, {
          originSystem: nextState.player.currentSystemId,
          interceptorId: 'life-support-failure',
        }),
      );
      // The wreck (and any still-live interdiction) dies with the ship — the
      // successor starts clear, exactly as the combat-death path nulls the
      // encounter after applySuccession.
      nextState.encounter = null;
    }
  }

  // T-1206 AUTO_REPAIR → dusk condition regen (the named reader for
  // `hasAutoRepair`, components.ts `autoRepairRegen`). PORTED FROM foundation
  // `applyAutoRepair`: the module patches each fitted system (hull excluded) up by
  // AUTO_REPAIR_REGEN overnight. Pure, no rng — so it consumes NO fork and cannot
  // perturb the dusk rng stream; every existing golden (all built on ships without
  // the module) is byte-identical.
  //
  // ORDERING — RETUNED, NOT RATIFIED (T-1603c; supersedes the T-1804 "RATIFIED
  // DESIGN CALL" comment that stood here, which asserted the opposite ordering and
  // its consequence as settled). This block runs AFTER the encounter dusk pressure
  // above (which may have driven a component to 0 this very dusk — the module then
  // heals that fresh damage) and, since T-1603c, AFTER the life-support survival
  // gate above rather than before it.
  //
  // WHY THE ORDER MOVED. Under the old ordering the module healed lifeSupport 0→1
  // before the gate could fire, which made the life-support survival/succession
  // death path UNREACHABLE outright whenever Auto-Repair was fitted. That is not a
  // strong module; it is a switch that turns off a death path — and life support
  // is 9 of 10 deaths in the sweep's veteran arm, so the one policy that buys the
  // module early (`fighter`) posted ZERO deaths and ZERO scares in 12,000
  // simulated days (`docs/balance/BASELINE-T-1603a.md` Flag 5, restated in
  // `docs/balance/TUNING-T-1603.md` §6). PRD-REIMAGINED line 85 asks that death be
  // "a real loss, not a soft reset … a decision you dread"; an always-rescue
  // module makes it a rumour for anyone who can afford 25,000 credits.
  //
  // WHAT THE MODULE STILL DOES — foundation fidelity is intact. Auto-Repair still
  // repairs life support (foundation `applyAutoRepair` patches every fitted
  // system); it now repairs it AFTER the dusk roll. So a critical life support
  // costs a fitted spacer exactly ONE GRIT save instead of nothing at all, and on
  // a survived roll the 0→1 regen below means they are not re-rolled at the next
  // dusk. The module turns a death SPIRAL into a single roll; it no longer
  // switches the death path off. Recorded as a design call in memo §12.
  //
  // ON A FAILED ROLL there is nothing to guard against: `applySuccession` (above,
  // via legacy.ts) has already reset the player's ship to `starterShip()`, so
  // `hasAutoRepair` is false and lifeSupport is back at 9 — this block naturally
  // no-ops on the successor rather than handing them a free repair. Asserted in
  // `components.test.ts` rather than defended with a redundant guard.
  //
  // RNG / GOLDENS. The `life-support-${day}` fork above is now taken whenever
  // lifeSupport is 0, INCLUDING for module-fitted ships (the previous comment here
  // claimed the opposite, which was true only of the old ordering). No shipped
  // golden or sim policy fixture fits the module with life support at 0, so no
  // golden moves for THIS lever; the goldens that did move in T-1603c moved on the
  // combat-targeting levers. This block itself still consumes no rng.
  if (nextState.player.ship.hasAutoRepair) {
    const { updates, repaired } = autoRepairRegen(nextState.player.ship);
    for (const id of repaired) {
      nextState.player.ship[id].condition = updates[id]!;
    }
    if (repaired.length > 0) {
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `Auto-Repair module restored condition to ${repaired.length} system${
          repaired.length === 1 ? '' : 's'
        } overnight.`,
      });
    }
  }

  // 3. DUSK (NPC Actions). Every captain works the shared job pool wherever they
  // are (N10). TWO THINGS ARE HAPPENING HERE and they used to be one:
  //
  //   - THE VISIBLE SNIPE. A captain in the player's system takes an offer off
  //     the player's LIVE board, so it disappears in front of them and the wire
  //     names who took it. Still throttled — see MAX_VISIBLE_SNIPES_PER_DUSK.
  //   - THE POOL CLAIM. Every other trading captain claims against their own
  //     system's pool, which thins the board the player will find when they get
  //     there. Ungated: this is the participation N10 exists to open up.
  //
  // Pre-N10 only the first existed, so a captain hauling out of Vega-7 was
  // economically invisible and the co-location gate was a gate on TAKING PART.
  const npcOrder = dayRng.shuffle([...nextState.npcs]);
  let visibleSnipes = 0;
  let snipingNpcId: string | null = null;

  for (const npc of npcOrder) {
    // The bond-hook rescuer already spent their day intervening.
    if (npc.id === intervenedNpcId) continue;
    // Quest characters do not participate in the daily simulation — the shared
    // predicate, not a local `.some()`, because this distinction has already
    // caused four live bugs by being spelled differently at each site (see
    // `isSimulatedCaptain` in content/cast.ts). The Set lookup also drops this
    // from an 11-element scan per captain per day to O(1) in the dusk loop.
    if (!isSimulatedCaptain(npc.profileId)) continue;
    // N3 · A dead captain takes no turn. The record STAYS (the wire, the Honor
    // List's history and the player's grudges reference it) — it is skipped here,
    // never removed, which is why the roster length does not shrink even as the
    // living field does.
    if (npc.dead) continue;
    const npcRng = dayRng.fork(`npc-${npc.id}`);
    const canClaim =
      visibleSnipes < MAX_VISIBLE_SNIPES_PER_DUSK &&
      npc.currentSystemId === nextState.player.currentSystemId &&
      nextState.market.manifestBoard.length > 0;
    const {
      npc: updatedNpc,
      events: npcEvents,
      claimedContractIndex,
      claimedFromPool,
    } = resolveNpcDay(npc, npcRng, {
      day: nextState.day,
      claimableBoard: canClaim ? nextState.market.manifestBoard : null,
      jobPoolClaims: nextState.market.jobPoolClaims,
      eraEvent: nextState.eraEvent,
      // N3 · Tour One damps the interdiction rate for the cast the same way it
      // damps it for the player — the multiplier belongs to the era, not to who
      // is flying.
      era: nextState.era,
      // N11 · Same argument for the licence: the demo's CONQUEROR ceiling is a
      // property of the world, so a captain's deed accrual meets it too.
      edition: nextState.edition,
      // T-140 · Undefined on every ordinary dusk. Observation only: `resolveNpcDay`
      // reads this to decide whether to build an entry, never to decide anything a
      // captain does.
      npcDecisionTrace: options.npcDecisionTrace,
    });

    // N10 · The pool claim: a captain trading anywhere but under the player's nose
    // debits that system's pool. One line, and it is the whole mechanism the step
    // is about — the reverted attempt's fatal shape was calling
    // `generateManifestBoard` per captain with no counterpart to this write.
    if (claimedFromPool !== undefined) {
      debitJobPool(nextState.market.jobPoolClaims, claimedFromPool);
    }

    let sniped = false;
    if (claimedContractIndex !== undefined) {
      visibleSnipes++;
      const [claimed] = nextState.market.manifestBoard.splice(claimedContractIndex, 1);
      if (claimed) {
        sniped = true;
        // The visible snipe debits the SAME pool the away-claims do — one ledger,
        // so tomorrow's board does not care which of the two routes took the job.
        debitJobPool(nextState.market.jobPoolClaims, nextState.player.currentSystemId);
        const cargoName = CARGO_TYPES[claimed.cargoType]?.name ?? 'cargo';
        const destinationName =
          STAR_SYSTEMS[claimed.destination]?.name ?? `system ${claimed.destination}`;
        events.push({
          type: 'ContractClaimed',
          day: nextState.day,
          npcId: updatedNpc.id,
          cargoType: claimed.cargoType,
          destination: claimed.destination,
          payment: claimed.payment,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          kind: 'npc',
          message: `${updatedNpc.name} undercut you on the ${cargoName} run to ${destinationName}.`,
        });
      }
    }

    const npcIndex = nextState.npcs.findIndex((n) => n.id === npc.id);
    if (npcIndex !== -1) {
      nextState.npcs[npcIndex] = updatedNpc;
    }
    if (sniped) snipingNpcId = updatedNpc.id;
    events.push(...npcEvents);
  }

  // Grudges and favors fade — but SLOWLY. T-1204 DECAY REBALANCE (the acceptance's
  // "decay divergence documented at its definition site"):
  //
  //   FOUNDATION (f2f95fa9) has NO per-NPC player-disposition decay to port —
  //   disposition itself is engine-original (T-106 invented it; T-106 also
  //   invented this decay). So this is not a foundation divergence but a T-1204
  //   RE-TUNING of an engine-original rule.
  //
  //   WHY the interval moved from every-dusk to every-Nth-dusk: the old
  //   unconditional −1/dusk erased every organic gain before it could matter —
  //   the tribute (+2) / defeat (−3) deltas were swamped within 2–3 days, so a
  //   300-day sim peaked at |disposition| = 1 and the bond hook (which needed +5)
  //   fired ZERO times ever. Stepping one point toward 0 only every
  //   DISPOSITION_DECAY_INTERVAL_DAYS dusks — combined with the larger deltas
  //   above — lets a paid-off / storylet-bonded NPC HOLD their standing across
  //   several days, so repeated interactions accumulate past the hook threshold
  //   and past |5|.
  //
  //   Keyed to `state.day % N` (a value already in GameState), so this needs NO
  //   new save field and no migration; it is fully deterministic across a JSON
  //   round-trip.
  //
  //   READER: this loop. CONSUMERS the slower decay unblocks — the bond hook
  //   above (§ reachability), the interception grudge-weighting (travel.ts
  //   chooseWeighted), and the talk DC term (combat.ts resolveTalk): all three
  //   read a disposition that now actually persists.
  if (nextState.day % DISPOSITION_DECAY_INTERVAL_DAYS === 0) {
    for (const npc of nextState.npcs) {
      // N3 · A dead captain's standing STOPS MOVING — it does not fade to neutral
      // over the remaining career. This is the deliberate reading of "a dead
      // captain's record stays … for any grudge the player still carries": the
      // grudge is part of what the record is FOR. Letting it decay would quietly
      // erase the history of everyone the player ever wronged who later died.
      if (npc.dead) continue;
      if (npc.disposition !== 0) {
        applyDisposition(nextState, npc.id, npc.disposition > 0 ? -1 : 1, 'decay', events);
      }
    }
  }

  // An NPC that undercut the player on a board contract registers as a rival:
  // the competitive act ticks their disposition toward the player down (T-106,
  // delta from content DISPOSITION_DELTAS). Applied AFTER dusk decay so the fresh
  // grudge actually persists to the next day instead of being cancelled by the
  // same-dusk fade on a decay day.
  if (snipingNpcId) {
    applyDisposition(
      nextState,
      snipingNpcId,
      DISPOSITION_DELTAS.contractSniped,
      'contract-sniped',
      events,
    );
  }

  // Generate daily wire entries from notable events
  for (const npc of nextState.npcs) {
    // N3 · A DEAD CAPTAIN DOES NOT TALK. Their `lastAction` is preserved (it is
    // how they died) and this loop would otherwise re-narrate it on the wire every
    // day for the rest of the career — the exact "a dead captain talks" failure the
    // roster split was designed around, arriving through a different door.
    if (npc.dead) continue;
    if (npc.lastAction) {
      // Flaw overrides are ALWAYS notable. Other actions are semi-randomly notable.
      const isFlawOverride = npc.lastAction.type === 'FlawOverride';
      if (isFlawOverride || dayRng.next() > 0.7) {
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          // T-1401 · THE load-bearing kind stamp. A flaw-override line is tagged
          // 'flaw-override' at exactly this one site — the else-branch (a semi-
          // random notable NPC action) is a plain 'npc' line. This kills the UI's
          // `msg.endsWith(FLAWS[*].detail)` reverse-derivation (format.ts, T-1402
          // consumer): a plain 'npc' line that merely happened to end with a flaw
          // detail no longer false-positives as a flaw override.
          kind: isFlawOverride ? 'flaw-override' : 'npc',
          message: `${npc.name} ${npc.lastAction.details}`,
        });
      }
    }
  }

  // T-1304 · Penny Wise loan — per-dusk interest accrual + default flip. The
  // WHOLE block is guarded on a non-null loan, so the loan-null path (every
  // existing golden) is byte-identical: no accrual, no default, no new events,
  // and NO rng draw (accrual is pure arithmetic, default detection is a pure
  // `day >= dueDay` compare). Deterministic across a JSON round-trip.
  if (nextState.player.loan) {
    const loan = nextState.player.loan;
    // Simple interest on the ORIGINAL principal (never compounding), accruing to
    // the loan's `outstanding` — NEVER to player.credits (debt-as-ledger law).
    const interest = Math.ceil(loan.principal * loan.dailyRate);
    loan.outstanding += interest;
    events.push({
      type: 'LoanEvent',
      day: nextState.day,
      kind: 'accrued',
      lender: loan.lender,
      interest,
      outstanding: loan.outstanding,
    });

    // Default: crossing the due day still owing flips the collection flag ONCE
    // (active→defaulted guard). The flip applies the one-time Penny Wise
    // disposition hit (read by the interceptor grudge-weighting, travel.ts
    // chooseWeighted) and leaves the elevated encounter pressure standing (read
    // by generateEncounter, travel.ts) until the loan is repaid, which nulls it.
    if (loan.status === 'active' && nextState.day >= loan.dueDay) {
      loan.status = 'defaulted';
      applyDisposition(nextState, LENDER_ID, LOAN_DEFAULT_DISPOSITION, 'loan-default', events);
      events.push({
        type: 'LoanEvent',
        day: nextState.day,
        kind: 'defaulted',
        lender: loan.lender,
        outstanding: loan.outstanding,
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `Penny Wise's marker on your name went unpaid — word is the Thrift Star's collectors are asking after you on the lanes.`,
      });
    }
  }

  // T-1306 · Crew wage upkeep (PRD §7 dice progression). The WHOLE block is guarded
  // on a non-empty crew, so the crew-free path (every existing golden) is
  // byte-identical: no wage event, no credit change, no crew mutation, and NO rng
  // draw (this is pure arithmetic). The day's total wage is the sum of each hired
  // role's dailyWage (content crew.ts). If the spacer can cover it, the credits are
  // deducted and a single CrewEvent{wage} is logged. If NOT, the crew WALK — every
  // member is dismissed (one CrewEvent{dismissed} per departure) and no credits are
  // charged, so credits never go negative and an unpayable crew can't be kept for
  // free. Deterministic across a JSON round-trip. This is the in-task upkeep
  // decision (the "hiring/upkeep as actions" the task calls for, resolved at dusk).
  if (nextState.player.crew.length > 0) {
    const wage = nextState.player.crew.reduce(
      (sum, member) => sum + (CREW_BY_ID[member.roleId]?.dailyWage ?? 0),
      0,
    );
    if (nextState.player.credits >= wage) {
      nextState.player.credits -= wage;
      events.push({
        type: 'CrewEvent',
        day: nextState.day,
        kind: 'wage',
        amount: wage,
        crewCount: nextState.player.crew.length,
      });
    } else {
      // Can't make payroll — the crew walk. Dismiss each (deterministic order) with
      // its own event; no credits change hands.
      for (const member of nextState.player.crew) {
        events.push({
          type: 'CrewEvent',
          day: nextState.day,
          kind: 'dismissed',
          roleId: member.roleId,
        });
      }
      nextState.player.crew = [];
    }
  }

  // T-1307 · Port launch-fee income (PRD §9 "ports as purchasable property"). The
  // WHOLE block is guarded on a non-empty port roster, so the port-free path (every
  // existing golden) is byte-identical: no income event, no credit change, and NO
  // rng draw (this is pure arithmetic — the sum of each owned port's era-modulated
  // base income, actions/port.ts `portDuskIncome`). While ≥1 stake is owned the
  // income is credited and a single PortEvent{income} + a WireEntry are logged
  // (the WireEntry is the wire reader for accrual). Deterministic across a JSON
  // round-trip. This is the named DUSK-ECONOMY reader the acceptance asserts.
  if (nextState.player.ports.length > 0) {
    const income = portDuskIncome(nextState);
    nextState.player.credits += income;
    const portCount = nextState.player.ports.length;
    events.push({
      type: 'PortEvent',
      day: nextState.day,
      kind: 'income',
      income,
      portCount,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Launch fees from ${portCount} port stake${
        portCount === 1 ? '' : 's'
      } clear to your account: ${income} credits.`,
    });
  }

  // T-111 · THE DUSK RECOVERY TICK (docs/EXPLORE_REDESIGN.md §3.3). The WHOLE
  // block is guarded on `recovery !== null`, so every recovery-free dusk — i.e.
  // every existing golden — is byte-identical: no event, no credit change, and NO
  // rng draw. The `dayRng.fork` below sits INSIDE the payout branch precisely
  // because `SeededRng.fork` ADVANCES ITS PARENT (rng.ts): a fork on the guard
  // path would move every golden in the repo. Same argument the AUTO_REPAIR dusk
  // block and the subsistence floor below make for their own guards.
  //
  // ORDER INSIDE THE BLOCK IS RULED: departure check FIRST, payout second. A
  // recovery whose day arrived while the captain was away is forfeit, not paid.
  //
  // POSITION: above the DebtDue check and well above the day-30 Tour One
  // resolution, so the marker check and `evaluateDeeds` both see the paid-out
  // state. The honest consequence, stated rather than hidden: a payout landing on
  // day 30's dusk CANNOT retroactively clear the marker — `cleared` reads
  // `player.debt`, and a recovery pays CREDITS, which become debt reduction only
  // through a DAY-phase `pay-debt` act. A recovery with `dueDay >= 30` is a
  // deliberate bet against the marker; that is the trade the day cost exists to
  // create. The era flip itself does nothing to an open recovery: the payout
  // predicate is `day >= dueDay`, era-blind by construction.
  const recovery = nextState.player.recovery;
  if (recovery !== null) {
    if (nextState.player.currentSystemId !== recovery.systemId) {
      // §3.3(a) — a LOCATION predicate, never a hook on the Travel verb. One rule
      // covers `resolveTravel`, any future storylet that relocates the captain,
      // and anything else that ever moves them, with ZERO per-caller wiring. Its
      // verified price: a jump that is INTERRUPTED and fled returns the captain
      // to the origin (actions/combat.ts), so dusk sees the anchor and the
      // recovery survives. Position at dusk is the rule.
      nextState.player.recovery = null;
      events.push({
        type: 'RecoveryAbandoned',
        day: nextState.day,
        outcomeId: recovery.outcomeId,
        reason: 'departed',
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `Player broke station and left the salvage op off ${
          STAR_SYSTEMS[recovery.systemId]?.name ?? `system ${recovery.systemId}`
        } to the scavengers.`,
      });
    } else if (nextState.day >= recovery.dueDay) {
      // `>=`, NEVER `===` — a `dueDay` in the past on load (a hand-edited save, a
      // future migration) must pay at the next dusk rather than stick forever.
      const row = outcomeById(recovery.outcomeId);
      const poi = nextState.player.charts.discoveredPois.find((p) => p.id === recovery.poiId);
      nextState.player.recovery = null;
      if (!row || !poi) {
        // CONTENT DRIFT SAFETY, covering BOTH a renamed/removed row and a POI
        // that is no longer on the charts. A stored content id must never be able
        // to throw — the `CREW_BY_ID[member.roleId]?.benefit` guard in dice.ts is
        // the same defensive shape for the same class of stored id. Clear the
        // slot, say so, mutate nothing else.
        events.push({
          type: 'RecoveryAbandoned',
          day: nextState.day,
          outcomeId: recovery.outcomeId,
          reason: 'unknown-outcome',
        });
      } else {
        // Emitted BEFORE the payload resolves, so the wire and the UI read
        // payout-then-detail in the order the player experiences it.
        events.push({
          type: 'RecoveryPaidOut',
          day: nextState.day,
          outcomeId: row.id,
          poiId: poi.id,
          valuePoints: row.valuePoints,
        });
        resolveExploreOutcome(
          nextState,
          row,
          poi,
          dayRng.fork(`recovery-${recovery.outcomeId}-${nextState.day}`),
          events,
        );
      }
    }
  }

  // T-1604b · Dusk SUBSISTENCE FLOOR — the world provides floors (PRD §"Scarcity
  // of choices, never a poverty trap": "no actor in the simulation, PLAYER OR
  // CAST, gets permanently trapped at zero with no move left"). Closes UGT
  // finding F2 (docs/playtests/T-1604a-ugt-campaign.md §7): the cast has had this
  // floor since T-106 (`npc.ts` brokeIdle pays NPC_ODD_JOB_CREDITS on an idle
  // broke day, "keeps broke NPCs off an exact-zero pin"); the player was the one
  // actor without it, and the campaign measured a career pinned at 0 credits for
  // 385 consecutive days because of it.
  //
  // The WHOLE block is guarded on `credits < SUBSISTENCE_FLOOR_CREDITS`, so every
  // solvent dusk — i.e. every existing golden — is byte-identical: no event, no
  // credit change, and NO rng draw (pure arithmetic, a single compare). It is a
  // FLOOR, not a faucet: credits are raised TO the line, never BY it, so it can
  // never be farmed and never touches a working career (one contract pays 2,200+).
  // Deterministic across a JSON round-trip; NO new GameState field, so no save
  // migration (content SUBSISTENCE_FLOOR_CREDITS + the existing credits field).
  //
  // POSITION is load-bearing. The T-111 RECOVERY PAYOUT immediately above is the
  // LAST credit mutation of the dusk — it was the T-1307 port income until T-111
  // inserted the payout between them, and this comment is kept honest deliberately
  // (a comment that lies about ordering is how the next person introduces a bug).
  // Everything else below writes LEDGERS, never credits: the Penny Wise accrual
  // writes `loan.outstanding` and the T-1309 guild accrual writes `player.debt`,
  // per the debt-as-ledger law; the T-1306 crew wage already refuses to go
  // negative. So this is still a true END-of-dusk floor, and a captain whose
  // recovery just paid out is floored on the POST-payout balance. It also lands
  // BEFORE the
  // day-30 Tour One resolution and `evaluateDeeds` below, so the marker check and
  // every deed that reads credits sees the floored value.
  //
  // `careerEnded` gates it: a career that ended on the far side of the Nemesis
  // shear accrues nothing.
  //
  // READERS: the sim campaign roll-up's `subsistenceDays` (packages/sim/src/index.ts
  // accumulateMetricEvents), and the UI wire pane via the paired WireEntry
  // (kind 'plain' → packages/ui/src/format.ts `wireKind`).
  if (!careerEnded(nextState) && nextState.player.credits < SUBSISTENCE_FLOOR_CREDITS) {
    const amount = SUBSISTENCE_FLOOR_CREDITS - nextState.player.credits;
    nextState.player.credits = SUBSISTENCE_FLOOR_CREDITS;
    events.push({
      type: 'SubsistenceIncome',
      day: nextState.day,
      amount,
      creditsAfter: nextState.player.credits,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `Nothing in the purse at lock-up, so you take what the gantry crews are handing out — hoses coiled, pallets walked, a hull scrubbed for somebody with a fuller account. ${amount} credits and a meal, and the ship is not yet a dead thing at a mooring.`,
    });
  }

  // The Guild calls its marker (enforcement/consequences are story-layer work;
  // the engine's job is to surface the fact as an event).
  if (nextState.player.debt > 0 && nextState.day === nextState.player.debtDueDay) {
    events.push({
      type: 'DebtDue',
      day: nextState.day,
      outstanding: nextState.player.debt,
    });
  }

  // T-113b — Tour One resolution (PRD §5.1). The Merchant Guild marker is due on
  // day 30. TIMING: this fires at the DUSK of day 30, after the player has spent
  // the whole of day 30 (its DAY phase — including any final `pay-debt`), and
  // BEFORE the day rolls over. That is the correct "by day 30" boundary: the
  // spacer gets every one of the thirty days to clear the debt, mirroring the
  // sibling DebtDue check above. Forced regardless of the player's system or
  // normal storylet eligibility, and guarded to fire exactly once by the
  // `tour-one.resolved` flag it sets. It COEXISTS with the T-113a Day-30 Wise
  // One hook (a DAY-phase Polaris-1 storylet that opens the Signal) and the
  // guild-pressure beats: those are separate storylets keyed on their own days/
  // flags, so nothing double-fires or clobbers another beat's flags here.
  if (
    nextState.era === 'TOUR_ONE' &&
    nextState.day === 30 &&
    nextState.flags['tour-one.resolved'] === undefined
  ) {
    const cleared = nextState.player.debt <= 0;
    const outcome: 'cleared' | 'unpaid' = cleared ? 'cleared' : 'unpaid';
    const debtOutstanding = Math.max(0, nextState.player.debt);

    // The discriminator flag is the deterministic FORCE for the resolution
    // storylet: `resolution.tour-one.cleared` / `.unpaid` trigger on this flag's
    // value and surface at the very next dawn via the standard T-110 eligibility
    // refresh — no parallel offer path.
    nextState.flags['tour-one.resolved'] = outcome;

    events.push({
      type: 'TourOneResolved',
      day: nextState.day,
      outcome,
      debtOutstanding,
    });

    // T-1301 — the Day-30 resolution OWNS the campaign-era transition. On BOTH
    // branches the era flips TOUR_ONE→VETERAN here, at the dusk of day 30 after
    // the day phase has fully played out. This is the single owner nobody had
    // before: without it `state.era` was permanently 'TOUR_ONE', so TOUR_ONE-
    // gated content never expired (guild-pressure beats stayed eligible into a
    // day-400 career) and any `eras:['VETERAN']` content was dead on arrival.
    // TIMING is safe: the flip is at dusk, AFTER the DAY-phase T-113a Wise One
    // hook (`eras:['TOUR_ONE'] + day:30`) has had its chance to fire, so it is
    // not clobbered; from the day-31 dawn onward all TOUR_ONE-gated storylets
    // (guild-pressure, the Sol-3 auditor, etc.) go ineligible via the
    // `trigger.eras` gate. READERS already written against this flip: the
    // storylet eligibility gate (`storylets.ts` triggerMatches, `trigger.eras`)
    // that expires TOUR_ONE content and admits VETERAN content, and
    // `generateEncounter` (`actions/travel.ts`), which stops applying its 0.5×
    // TOUR_ONE damp so the veteran game runs at the full foundation encounter
    // rate. The unpaid branch below proceeds as VETERAN-with-debt: the era is
    // flipped for everyone, but `veteran.unlocked` (the CLEAN-veteran
    // discriminator) is set only on the cleared branch, and the debt survives
    // untouched.
    nextState.era = 'VETERAN';

    // T-1309 · READER of the six guild-pressure beat flags on BOTH branches
    // (computeGuildStanding). The signed standing (cooperative < 0 < hostile) is
    // consumed differently per branch below — the cleared branch reads its SIGN
    // for the sign-off text, the unpaid branch reads its magnitude for the
    // port-clerk flag severity — so every surviving pressure flag has a consumer
    // regardless of how day 30 resolves.
    const guildStanding = computeGuildStanding(nextState.flags);

    if (cleared) {
      // Debt cleared → the CLEAN veteran career opens (PRD §5.2). The era flip
      // above is shared with the unpaid branch; this flag is the additional
      // discriminator that says the marker closed without a shortfall.
      nextState.flags['veteran.unlocked'] = true;
      // T-1309 · the sign-off reads the guild standing: a captain who kept the
      // Guild informed (cooperative record, standing <= 0) gets the warm close;
      // one who stonewalled/defied its way to the finish (standing > 0) gets the
      // terse one. This is the cleared-branch consumer of the pressure flags.
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message:
          guildStanding > 0
            ? 'The Merchant Guild marker closes — barely. Your name comes off the debt slate onto the Registry, but the clerks logged how you fought them the whole way. The veteran lanes are open, cold welcome and all.'
            : 'The Merchant Guild marker closes clean. Your name comes off the debt slate and onto the Registry — the veteran lanes are open, and the clerks remember you kept them in the loop.',
      });
    } else {
      // Debt NOT cleared: the game continues indebted (PRD §5.1). The debt
      // SURVIVES untouched — no forgiveness, no soft-lock, no game-over. But the
      // consequence is no longer purely story-layer: T-1309 sets the port-clerk
      // flag the unpaid storylet's prose has always claimed ("your name now
      // carries a flag every port clerk can see"). Its VALUE is the guild-standing
      // severity (guildSeverity), so a hostile record bites harder. Two readers
      // consume it: worse manifest terms (day.ts startDay → economy.ts) and
      // heavier patrol/collection attention (actions/travel.ts generateEncounter).
      // The debt itself begins accruing interest from the NEXT dusk (the accrual
      // block below, gated on day > 30 so this day-30 pass leaves it untouched).
      const severity = guildSeverity(guildStanding);
      nextState.flags['guild.debt-flagged'] = severity;
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        kind: 'plain',
        message: `The marker goes unpaid. The Guild files the shortfall — ${debtOutstanding} credits still owed, and the interest keeps running — and flags your name where every port clerk can read it: leaner manifests, keener patrols. You fly on indebted.`,
      });
    }
  }

  // T-1703 · THE DEMO'S LAST DUSK. Placed immediately after the Tour One
  // resolution block above, because that is the beat it counts from: the demo
  // plays Tour One and then `DEMO_POST_RESOLUTION_DAYS` more (content demo.ts),
  // so day 30's dusk still fires `TourOneResolved`, still flips the era to
  // VETERAN and still sets `veteran.unlocked` — the three teaser days ARE the
  // point, and the player sees the veteran lanes light up before the licence
  // expires.
  //
  // NO SPECIAL-CASED ROLLOVER: the day rolls to 34 exactly as it always does, and
  // `demoConcluded` (a DERIVED predicate, not a flag) goes true at that dawn.
  // This event is the RECORD of the last dusk; the predicate is the rule.
  // Byte-identical for every full career — the whole block is `edition` guarded,
  // and no existing save is a demo.
  if (isDemo(nextState) && nextState.day === DEMO_FINAL_DAY) {
    events.push({
      type: 'DemoConcluded',
      day: nextState.day,
      edition: nextState.edition,
      daysPlayed: nextState.day,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message:
        'Port control files the last entry your demo licence will carry. The lanes stay lit, the Signal keeps repeating, and your papers are still good — somewhere other than here.',
    });
  }

  // T-1309 · Unpaid Tour One marker — per-dusk interest accrual. The unpaid
  // resolution storylet's prose has always claimed "the interest keeps running",
  // but the 25,000 marker (state.ts) never actually grew — this block gives that
  // prose teeth. The WHOLE block is guarded on the `guild.debt-flagged` flag
  // (set only by the day-30 UNPAID branch above) AND `day > 30`, so:
  //   - every non-flagged state (a cleared marker, or any pre-day-30 day, or every
  //     existing golden) is byte-identical: no accrual, no event, and NO rng draw
  //     (this is pure arithmetic — accrual detection is a flag+day compare);
  //   - the `day > 30` gate leaves the day-30 resolution pass itself untouched, so
  //     the marker still reports its exact 25,000 shortfall at resolution.
  // Interest compounds on the CURRENT balance (content GUILD_DEBT_DAILY_RATE) and
  // accrues to `player.debt` ONLY — never to player.credits (debt-as-ledger law),
  // so growing debt can never strand the ship or drive credits negative (the
  // no-soft-lock invariant). Deterministic across a JSON round-trip (day + a flag
  // already in GameState; no new field). READERS of the growth: the WireEntry
  // (UI wire, format.ts wireLines) and the sim's per-day `CampaignDayStats.debt`.
  if (
    nextState.player.debt > 0 &&
    Number(nextState.flags['guild.debt-flagged'] ?? 0) > 0 &&
    nextState.day > 30
  ) {
    const interest = Math.ceil(nextState.player.debt * GUILD_DEBT_DAILY_RATE);
    nextState.player.debt += interest;
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      kind: 'plain',
      message: `The Guild marker keeps running: ${interest} credits in interest added — ${nextState.player.debt} now owed.`,
    });
  }

  events.push(...evaluateDeeds(nextState, events));
  // T-1203: dusk deeds (deliveries, debt clears) can rank the player up;
  // recompute the band so tomorrow's jumps read the fresh tier.
  syncPlayerTier(nextState);

  // T-1502 · NPC personal-chain abandonment (PRD §8.1: a chain "can resolve
  // without you"). Any scheduled chain episode carrying a `wireResolution` that
  // has sat unplayed past its `dueDay + graceDays` is resolved by the Galactic
  // News Wire here: the authored line is filed and the disposition consequence
  // lands through the same applyEffects path a played choice uses (identical
  // DispositionChanged / StoryletEffectApplied events). Runs while nextState.day
  // still holds the current day (before the increment below) so the WireEntry
  // carries the correct day and rides the final appendEvents. Pure (no rng/Date),
  // no new GameState field — deterministic across a JSON round-trip. A clean
  // (no-abandonment) dusk returns zero events and an unchanged state, so every
  // existing golden is byte-identical.
  const abandoned = resolveAbandonedChains(nextState);
  nextState = abandoned.state;
  events.push(...abandoned.events);

  // T-107 era scheduler: the world's economic weather turns at dusk. One event
  // active at a time; seeded onset after a cooldown; natural expiry at the day
  // boundary. Runs before the day increment so the next dawn's board and fuel
  // prices already read the new modifiers.
  const eraResult = advanceEraSchedule(
    {
      eraEvent: nextState.eraEvent,
      lastEraEventEndedDay: nextState.lastEraEventEndedDay,
      currentDay: nextState.day,
    },
    dayRng.fork('era-schedule'),
  );
  nextState.eraEvent = eraResult.eraEvent;
  nextState.lastEraEventEndedDay = eraResult.lastEraEventEndedDay;
  events.push(...eraResult.events);

  // T-1202 (PRD §6): scan the dusk batch — every NPC verb check (T-1201) plus any
  // interceptor enemy-pressure check — for natural 20s / 1s and file a Wire story
  // for each. Runs while `nextState.day` still holds the current day (before the
  // increment below) so the entries carry the correct day, and rides along in the
  // single appendEvents at the end. Seeded from the STABLE pre-dusk rngState, not
  // the live `dayRng` (whose state is persisted below), to keep determinism.
  const natWire = natWireStories(
    events,
    nextState.day,
    new SeededRng(state.rngState).fork('wire-nat-dusk'),
    nextState.npcs,
    nextState.player.currentSystemId,
  );
  events.push(...natWire);

  // 4. NEXT DAY PREP
  const nextDay = nextState.day + 1;
  nextState.day = nextDay;
  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAWN;
  nextState.dayEventCount = 0;
  // T-197 · THE DAWN RESET FOR BOTH HANGOUT CAPS
  // (docs/DAWN-HAND-REDESIGN.md §4a/§4b), at the EXISTING chokepoint beside
  // `dayEventCount` rather than in a second reset of its own. `startDay` must NOT
  // acquire a matching write: two reset sites for one daily allowance is exactly
  // how a mid-day reload or a re-entered dawn silently refills a cap. The values
  // come from the rule (`resetDailyHangoutCaps`), which `MIGRATIONS[15]` and
  // `createInitialState` also read, so the three cannot drift.
  resetDailyHangoutCaps(nextState.player);
  events.push({ type: 'DayAdvanced', day: nextDay });
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function advanceDay(
  state: GameState,
  playerActions: PlayerAction[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const dawn = startDay(state);
  let nextState = dawn.state;
  events.push(...dawn.events);

  for (const action of playerActions) {
    const result = applyPlayerAction(nextState, action);
    nextState = result.state;
    events.push(...result.events);
  }

  const dusk = endDay(nextState);
  events.push(...dusk.events);

  return { state: dusk.state, events };
}
