import { describe, expect, it } from 'vitest';
import { advanceDay, applyPlayerAction, endDay, startDay } from '../day.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import type { EncounterState, GameEvent, GameState } from '../types.js';

/**
 * T-111 · THE MULTI-DAY COMMITTED RECOVERY (docs/EXPLORE_REDESIGN.md §3).
 *
 * EVERY recovery in this file is opened by driving the REAL day loop — `startDay`
 * → `applyPlayerAction({type:'Explore'})` → `endDay` — against a real seed, never
 * by assigning to `player.recovery`. That is the point of the suite: the slot is
 * reachable through the verb a player uses, and the clock is ticked by the loop a
 * player lives in. The two places state IS shaped by hand are both deliberate and
 * neither touches the recovery:
 *   - the fatal encounter in the death test, planted exactly as `legacy.test.ts`
 *     has always planted it (the only way to force a dusk killing blow);
 *   - the two content-drift tests, which build their subject by round-tripping a
 *     REAL recovered state through `serializeState`/`deserializeState` and editing
 *     the JSON — because "a save whose stored row no longer resolves" is a LOAD,
 *     and constructing it as one is the honest construction.
 */

// --- Seeds, and how each was found -----------------------------------------
//
// Every seed below was found by a scan written once against the real loop (open
// a recovery on day 1 with the best unspent die, then drive the path under test)
// and then PINNED here with the property it was selected for. Nothing about a
// seed is magic: it is simply a board that reaches the state the ruling is about.
//
// All of them draw `legacy-salvage-derelict` — 20 `valuePoints`, band 2, N = 1.
// Band 2 is the HIGHEST band any drawable row reaches while the authored table
// covers only bands 0-1 (T-113 pass 1), so every recovery here is a one-day one.
// The rulings under test are all clock-agnostic (`day >= dueDay`, a location
// compare, a slot compare), so N = 1 exercises them identically to N = 6; T-115
// makes N = 6 drivable when band-4 rows exist.
//
// T-113 RE-SEEDED — ONE seed of the three (4 → 36). MECHANISM: the authored
// band-1 BEACON salvage rows joined the beacon salvage leg, which now holds six
// ids where it held one, so a fired beacon salvage leg consumes one further index
// draw and re-phases that board. The derelict half is untouched (F-113-D), which
// is why the two derelict-driven seeds below are unmoved. Seed 4 still OPENS a
// recovery on day 1; what it lost is the second property `SEED_OPENS` carries —
// its day-1 jump now arrives instead of being interdicted. The same scan was
// re-run against the real loop, with the same extra condition (the opened row IS
// `legacy-salvage-derelict`), and seed 36 is the first that satisfies BOTH the
// interrupted-jump property and the day-30 one, exactly as seed 4 used to. No
// assertion below changed shape or value.

/** Opens a recovery on day 1 at Sun-3, and its day-1 Travel is INTERRUPTED. */
const SEED_OPENS = 36;
/** Opens a recovery on day 1 AND its day-1 Travel to system 2 actually ARRIVES. */
const SEED_TRAVELS_AWAY = 10;
/** Opens a recovery on day 1 AND the planted dusk encounter lands a fatal blow. */
const SEED_DIES = 24;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The highest unspent die in the dawn hand — what a real player would fly a
 *  DC-12 nav check with. Returns -1 when the hand is exhausted. */
function bestUnspentDie(state: GameState): number {
  const hand = state.player.dawnHand;
  if (!hand) return -1;
  let best = -1;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      best = i;
    }
  }
  return best;
}

/**
 * Drive a real career to a day-1 DAY-phase state with ONE open recovery, through
 * the loop and nothing else. Asserts the `RecoveryStarted` fired, so a seed that
 * silently stops opening one fails here rather than three assertions later.
 */
function openRecovery(seed: number): { state: GameState; events: GameEvent[] } {
  const dawn = startDay(createInitialState(seed));
  const die = bestUnspentDie(dawn.state);
  expect(die).toBeGreaterThanOrEqual(0);
  const result = applyPlayerAction(dawn.state, { type: 'Explore', spendDie: die });
  expect(result.events.some((e) => e.type === 'RecoveryStarted')).toBe(true);
  expect(result.state.player.recovery).not.toBeNull();
  return result;
}

function eventsOfType<T extends GameEvent['type']>(
  events: GameEvent[],
  type: T,
): Extract<GameEvent, { type: T }>[] {
  return events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
}

/** Round-trip a live state through the SAVE path and hand back the parsed JSON
 *  for editing, so a drift case is built as the load it actually is. */
function reloadWith(state: GameState, edit: (parsed: Record<string, never>) => void): GameState {
  const parsed = JSON.parse(serializeState(state)) as Record<string, never>;
  edit(parsed);
  return deserializeState(JSON.stringify(parsed));
}

/** The dusk-fatal encounter `legacy.test.ts` uses — a high-GUNS interceptor whose
 *  day-end free attack finishes a one-condition hull. Origin 1 (Sun-3). */
function fatalEncounter(): EncounterState {
  return {
    id: 'enc-fatal',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-1',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 4,
    enemyHull: 1,
  };
}

// ---------------------------------------------------------------------------
// 1 · The headline clause: a recovery that SPANS DAYS, end to end
// ---------------------------------------------------------------------------

describe('T-111 · a recovery spans real calendar days (the whole loop, no poking)', () => {
  it('opens on the day of the find, pays nothing that dusk, and pays out at the next one', () => {
    const opened = openRecovery(SEED_OPENS);
    const recovery = opened.state.player.recovery!;

    // (a) THE DAY OF THE FIND. The slot opens, the clock is `day + N`, and the
    // payoff explicitly does NOT land — no SalvageRecovered, no credit change.
    expect(recovery.startedDay).toBe(1);
    expect(recovery.dueDay).toBe(2);
    expect(recovery.systemId).toBe(opened.state.player.currentSystemId);
    expect(eventsOfType(opened.events, 'SalvageRecovered')).toHaveLength(0);
    expect(opened.state.player.credits).toBe(createInitialState(SEED_OPENS).player.credits);
    // The POI is charted IMMEDIATELY — the knowledge is not what waits.
    expect(opened.state.player.charts.discoveredPois.map((p) => p.id)).toContain(recovery.poiId);

    // (b) THAT DAY'S DUSK. `day` is still 1, `dueDay` is 2, so nothing happens and
    // the slot is left exactly as it was.
    const duskOne = endDay(opened.state);
    expect(eventsOfType(duskOne.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(eventsOfType(duskOne.events, 'RecoveryAbandoned')).toHaveLength(0);
    expect(duskOne.state.player.recovery).toEqual(recovery);
    expect(duskOne.state.day).toBe(2);

    // (c) THE NEXT DUSK. `day >= dueDay`, the captain never left, so it pays.
    const creditsBefore = startDay(duskOne.state).state.player.credits;
    const duskTwo = endDay(startDay(duskOne.state).state);

    const paid = eventsOfType(duskTwo.events, 'RecoveryPaidOut');
    expect(paid).toHaveLength(1);
    expect(paid[0]).toEqual({
      type: 'RecoveryPaidOut',
      day: 2,
      outcomeId: recovery.outcomeId,
      poiId: recovery.poiId,
      // Read off the CONTENT row at payout, never off the save.
      valuePoints: 20,
    });

    const salvage = eventsOfType(duskTwo.events, 'SalvageRecovered');
    expect(salvage).toHaveLength(1);
    expect(salvage[0].poiId).toBe(recovery.poiId);
    // The credit delta is EXACTLY the payload's own amount — the payout is the
    // row resolving late, not a second economy.
    expect(duskTwo.state.player.credits - creditsBefore).toBe(salvage[0].amount);

    // The payout event precedes its own payload detail (wire reading order).
    const paidIndex = duskTwo.events.findIndex((e) => e.type === 'RecoveryPaidOut');
    const salvageIndex = duskTwo.events.findIndex((e) => e.type === 'SalvageRecovered');
    expect(paidIndex).toBeLessThan(salvageIndex);

    // And the slot is free again.
    expect(duskTwo.state.player.recovery).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 · Travelling away mid-recovery → FORFEIT, by a LOCATION predicate
// ---------------------------------------------------------------------------

describe('T-111 · §3.3(a) travelling away forfeits the op', () => {
  it('a Travel that ARRIVES elsewhere loses the recovery at dusk, with no payout', () => {
    const opened = openRecovery(SEED_TRAVELS_AWAY);
    const anchor = opened.state.player.recovery!.systemId;

    const travel = applyPlayerAction(opened.state, {
      type: 'Travel',
      destinationId: 2,
      spendDie: bestUnspentDie(opened.state),
    });
    // The premise of the test: the captain really is somewhere else at dusk.
    expect(travel.state.player.currentSystemId).toBe(2);
    expect(travel.state.player.currentSystemId).not.toBe(anchor);

    const dusk = endDay(travel.state);
    const abandoned = eventsOfType(dusk.events, 'RecoveryAbandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].reason).toBe('departed');
    expect(abandoned[0].outcomeId).toBe('legacy-salvage-derelict');
    expect(dusk.state.player.recovery).toBeNull();
    // No partial credit, and nothing paid out.
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(eventsOfType(dusk.events, 'SalvageRecovered')).toHaveLength(0);
  });

  it('a jump INTERRUPTED at the origin keeps the recovery — position at dusk is the rule', () => {
    // The verified price of deciding this by LOCATION rather than by hooking the
    // Travel verb, asserted rather than left as a comment: an interrupted jump
    // leaves the captain standing at the origin (the encounter holds the pending
    // travel), so dusk sees the anchor system and the op survives. Seed 4's day-1
    // jump to system 2 is interdicted.
    const opened = openRecovery(SEED_OPENS);
    const recovery = opened.state.player.recovery!;

    const travel = applyPlayerAction(opened.state, {
      type: 'Travel',
      destinationId: 2,
      spendDie: bestUnspentDie(opened.state),
    });
    expect(travel.events.some((e) => e.type === 'EncounterStarted')).toBe(true);
    expect(travel.state.player.currentSystemId).toBe(recovery.systemId);

    const dusk = endDay(travel.state);
    expect(eventsOfType(dusk.events, 'RecoveryAbandoned')).toHaveLength(0);
    expect(dusk.state.player.recovery).toEqual(recovery);
  });
});

// ---------------------------------------------------------------------------
// 3 · Dying mid-recovery → FORFEIT at succession (knowledge survives)
// ---------------------------------------------------------------------------

describe('T-111 · §3.3(b) death forfeits the op but not the chart', () => {
  it('succession clears the slot exactly once; the POI stays on the successor charts', () => {
    const opened = openRecovery(SEED_DIES);
    const recovery = opened.state.player.recovery!;

    // The ONE hand-shaped thing here, and it is the encounter, not the recovery:
    // the `legacy.test.ts` idiom for forcing a dusk killing blow.
    const doomed = opened.state;
    doomed.player.ship.hull.condition = 1;
    doomed.encounter = fatalEncounter();

    const dusk = endDay(doomed);
    expect(dusk.events.some((e) => e.type === 'LegacySuccession')).toBe(true);

    const abandoned = eventsOfType(dusk.events, 'RecoveryAbandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].reason).toBe('succession');
    expect(abandoned[0].outcomeId).toBe(recovery.outcomeId);
    expect(dusk.state.player.recovery).toBeNull();

    // Nothing paid out — and note the succession clear runs ABOVE the dusk
    // departure predicate, even though `applySuccession` relocates the captain,
    // so there is no second 'departed' emission.
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(eventsOfType(dusk.events, 'SalvageRecovered')).toHaveLength(0);

    // THE KNOWLEDGE HALF IS INHERITED. The charted POI is in `charts`, which
    // death never takes — the salvage was a claim against a live captain.
    expect(dusk.state.player.charts.discoveredPois.map((p) => p.id)).toContain(recovery.poiId);
  });
});

// ---------------------------------------------------------------------------
// 4 · A second recovery while one is open → the VERB is refused
// ---------------------------------------------------------------------------

describe('T-111 · §3.3(c) the Explore verb is refused while a recovery is open', () => {
  it('refuses with a typed event and charges NEITHER a die NOR fuel', () => {
    const opened = openRecovery(SEED_OPENS);
    const handBefore = structuredClone(opened.state.player.dawnHand);
    const fuelBefore = opened.state.player.ship.fuel;
    const poisBefore = opened.state.player.charts.discoveredPois.length;
    const recoveryBefore = structuredClone(opened.state.player.recovery);

    const refused = applyPlayerAction(opened.state, {
      type: 'Explore',
      spendDie: bestUnspentDie(opened.state),
    });

    const failed = eventsOfType(refused.events, 'ExplorationFailed');
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toBe('recovery-in-progress');

    // The ship was already committed, so there was nothing to fly and nothing to
    // charge: the hand is deep-equal unchanged and the tank is untouched.
    expect(refused.state.player.dawnHand).toEqual(handBefore);
    expect(refused.state.player.ship.fuel).toBe(fuelBefore);
    // No second board, and the open op is not disturbed.
    expect(refused.events.some((e) => e.type === 'PoiDiscovered')).toBe(false);
    expect(refused.state.player.charts.discoveredPois).toHaveLength(poisBefore);
    expect(refused.state.player.recovery).toEqual(recoveryBefore);
  });

  it('the verb becomes available again the moment the slot clears', () => {
    const opened = openRecovery(SEED_OPENS);
    // Day 1 dusk → day 2 dawn → day 2 dusk pays out and frees the slot.
    const afterPayout = endDay(startDay(endDay(opened.state).state).state);
    expect(afterPayout.state.player.recovery).toBeNull();

    const nextDay = startDay(afterPayout.state);
    const retried = applyPlayerAction(nextDay.state, {
      type: 'Explore',
      spendDie: bestUnspentDie(nextDay.state),
    });
    expect(
      retried.events.some(
        (e) => e.type === 'ExplorationFailed' && e.reason === 'recovery-in-progress',
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5 · The day-30 Tour One marker → the recovery SURVIVES the era flip
// ---------------------------------------------------------------------------

describe('T-111 · §3.3(d) the Tour One marker does nothing to an open recovery', () => {
  it('survives the day-30 era flip untouched, then pays out on day 31', () => {
    // Drive to day 30 through the real loop — twenty-nine Waits, no shortcuts.
    let state = createInitialState(SEED_OPENS);
    for (let day = 1; day < 30; day += 1) {
      state = advanceDay(state, [{ type: 'Wait' }]).state;
    }
    expect(state.day).toBe(30);
    expect(state.era).toBe('TOUR_ONE');

    const dawn = startDay(state);
    const opened = applyPlayerAction(dawn.state, {
      type: 'Explore',
      spendDie: bestUnspentDie(dawn.state),
    });
    expect(opened.events.some((e) => e.type === 'RecoveryStarted')).toBe(true);
    const recovery = opened.state.player.recovery!;
    // dueDay 31, not the spec's illustrative 33: band 2 (N = 1) is the highest
    // band any DRAWABLE row reaches while bands 0-1 are the authored table. The ruling
    // under test — the era flip does nothing to an open recovery — is exercised
    // identically; T-115 makes N = 6 drivable when band-4 rows are authored.
    expect(recovery.dueDay).toBe(31);

    const marker = endDay(opened.state);
    expect(marker.events.some((e) => e.type === 'TourOneResolved')).toBe(true);
    expect(marker.state.era).toBe('VETERAN');
    // NO early payout, NO forfeit, NO clock change — deep-equal, key for key.
    expect(marker.state.player.recovery).toEqual(recovery);

    const dayThirtyOne = endDay(startDay(marker.state).state);
    const paid = eventsOfType(dayThirtyOne.events, 'RecoveryPaidOut');
    expect(paid).toHaveLength(1);
    expect(paid[0].day).toBe(31);
    expect(dayThirtyOne.state.player.recovery).toBeNull();
    // The era is still VETERAN: the payout is era-blind in both directions.
    expect(dayThirtyOne.state.era).toBe('VETERAN');
  });
});

// ---------------------------------------------------------------------------
// 6 · Content drift and the `>=` predicate
// ---------------------------------------------------------------------------

describe('T-111 · a stored outcome id that no longer resolves', () => {
  it('clears the slot as unknown-outcome and mutates nothing else', () => {
    const opened = openRecovery(SEED_OPENS);
    // Built as a LOAD, because that is what this case is: a save written when the
    // row existed, opened after it was renamed or removed.
    const drifted = reloadWith(opened.state, (parsed) => {
      (parsed as unknown as GameState).player.recovery!.outcomeId = 'legacy-row-that-was-deleted';
    });
    const creditsBefore = drifted.player.credits;
    const poisBefore = drifted.player.charts.discoveredPois.length;

    // Day 1 dusk leaves it (dueDay 2); day 2's dusk is where it comes due.
    const dusk = endDay(startDay(endDay(drifted).state).state);

    const abandoned = eventsOfType(dusk.events, 'RecoveryAbandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].reason).toBe('unknown-outcome');
    expect(abandoned[0].outcomeId).toBe('legacy-row-that-was-deleted');
    expect(dusk.state.player.recovery).toBeNull();
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(eventsOfType(dusk.events, 'SalvageRecovered')).toHaveLength(0);
    // Nothing else moved: no credits, no charts.
    expect(dusk.state.player.credits).toBe(creditsBefore);
    expect(dusk.state.player.charts.discoveredPois).toHaveLength(poisBefore);
  });

  it('a POI that is no longer on the charts is the same unknown-outcome case', () => {
    const opened = openRecovery(SEED_OPENS);
    const drifted = reloadWith(opened.state, (parsed) => {
      (parsed as unknown as GameState).player.charts.discoveredPois = [];
    });
    const dusk = endDay(startDay(endDay(drifted).state).state);
    const abandoned = eventsOfType(dusk.events, 'RecoveryAbandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].reason).toBe('unknown-outcome');
    expect(dusk.state.player.recovery).toBeNull();
  });

  it('a dueDay in the PAST pays at the next dusk (the predicate is >=, never ===)', () => {
    const opened = openRecovery(SEED_OPENS);
    const overdue = reloadWith(opened.state, (parsed) => {
      // A save edited, or a migration from some future shape: the clock already ran
      // out. Writing `===` here would leave the slot stuck forever.
      (parsed as unknown as GameState).player.recovery!.dueDay = -5;
    });
    expect(overdue.day).toBe(1);
    expect(overdue.player.recovery!.dueDay).toBeLessThan(overdue.day);

    const dusk = endDay(overdue);
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(1);
    expect(eventsOfType(dusk.events, 'SalvageRecovered')).toHaveLength(1);
    expect(dusk.state.player.recovery).toBeNull();
  });
});
