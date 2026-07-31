import { describe, expect, it } from 'vitest';
import { advanceDay, applyPlayerAction, endDay, startDay } from '../day.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import type { EncounterState, GameEvent, GameState } from '../types.js';
import { outcomeById, recoveryDays } from '../exploreOutcomes.js';
import { EXPLORE_VALUE_BANDS } from '@spacerquest/content';

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
// The three ruling seeds open a BAND-2 row — N = 1. The rulings under test are all
// clock-agnostic (`day >= dueDay`, a location compare, a slot compare), so N = 1
// exercises them identically to N = 6, and a one-day clock keeps each test to the
// smallest number of real days that can demonstrate it. SECTION 7 ADDS THE N = 6
// CASE ON ITS OWN SEED, which is what T-115 owed: bands 3 and 4 are authored, so
// the longest recovery on the ladder is drivable through the real loop for the
// first time and no longer has to be argued by analogy.
//
// T-113 RE-SEEDED one seed of the three (4 → 36), because the authored band-1
// beacon rows joined the beacon salvage leg and re-phased that board.
//
// T-114 RE-SEEDED THE SAME ONE (36 → 82): the row all three seeds drew,
// `legacy-salvage-derelict`, was deleted (F-113-D discharged).
//
// T-117 RE-SEEDED TWO OF THE THREE, and the mechanism is the largest yet — THE
// DRAW ITSELF CHANGED. A board no longer walks three independent legs; it draws
// one band-weighted row (F-113-A discharged, engine `drawOutcome`), so every
// board in the game re-phases and which seed reaches which state is entirely
// re-derived. The same scan was re-run against the real loop, condition unchanged
// ("the opened row is an authored band-2 salvage row", plus the per-seed property):
//   - SEED_OPENS → 52. The lowest seed satisfying ALL THREE properties the tests
//     using it require: a band-2 salvage row on day 1, an INTERRUPTED day-1 jump
//     to system 2, and a day-30 board that also opens a one-day op.
//   - SEED_TRAVELS_AWAY (10) is UNMOVED — it still opens on day 1 and still
//     ARRIVES at system 2. Only the identity of the row it opens changed.
//   - SEED_DIES → 12. Seed 24's board no longer opens a recovery at all under the
//     weighted draw (it draws a band-0/1 row, which resolves same-day), so there
//     is nothing for the succession to forfeit; 12 is the lowest seed that opens
//     one AND dies to the planted dusk encounter.
// NO ASSERTION CHANGED SHAPE. Two literals moved because they NAME THE DRAWN ROW:
// the payout's `valuePoints` (18 → 11, read off
// `explore-salvage-beacon-fusion-stack`) and the abandoned op's `outcomeId`
// (`explore-salvage-derelict-flag-bridge` → `explore-lore-rebel-cache`, seed 10's
// row). Both are still read off CONTENT at payout, which is what they were there
// to prove.

/** Opens a recovery on day 1 at Sun-3 with an authored band-2 SALVAGE row, and
 *  its day-1 Travel is INTERRUPTED. */
const SEED_OPENS = 52;
/** Opens a recovery on day 1 AND its day-1 Travel to system 2 actually ARRIVES. */
const SEED_TRAVELS_AWAY = 10;
/** Opens a recovery on day 1 AND the planted dusk encounter lands a fatal blow. */
const SEED_DIES = 12;
/** T-115 · Opens a BAND-4 recovery on day 1 — N = 6, the longest clock on the
 *  ladder and the one no seed could reach until bands 3-4 were authored. */
const SEED_BAND4 = 2;

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
      // 11 = `explore-salvage-beacon-fusion-stack`, the band-2 row seed 52 opens.
      valuePoints: 11,
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
    expect(abandoned[0].outcomeId).toBe('explore-lore-rebel-cache');
    expect(dusk.state.player.recovery).toBeNull();
    // No partial credit, and nothing paid out.
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(eventsOfType(dusk.events, 'SalvageRecovered')).toHaveLength(0);
  });

  it('a jump INTERRUPTED at the origin keeps the recovery — position at dusk is the rule', () => {
    // The verified price of deciding this by LOCATION rather than by hooking the
    // Travel verb, asserted rather than left as a comment: an interrupted jump
    // leaves the captain standing at the origin (the encounter holds the pending
    // travel), so dusk sees the anchor system and the op survives. SEED_OPENS'
    // day-1 jump to system 2 is interdicted.
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
    // dueDay 31: seed 52's day-30 board draws a band-2 row (N = 1). That is a
    // property of the seed, not of the table — bands 3 and 4 are authored now, so
    // a day-30 board CAN open a six-day op. The ruling under test (the era flip
    // does nothing to an open recovery) is clock-agnostic and is exercised
    // identically either way; section 7 drives the N = 6 clock end to end.
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

  it('T-114 · an IN-FLIGHT save holding the retired legacy-salvage-derelict is safe', () => {
    // NOT a hypothetical, and not the same test as the one above with a different
    // string. T-114 DELETED a row that could be on a real save right now: any
    // career that opened a derelict salvage op before this pass stored
    // `legacy-salvage-derelict` in `player.recovery.outcomeId`. The retirement is
    // therefore a content-drift event that already happened, and the claim it
    // owes is that no save bump is needed — the payout resolver's defensive
    // lookup (the `CREW_BY_ID[…]?.benefit` shape) already tolerates the miss:
    // clear the slot, say so, mutate nothing else.
    const opened = openRecovery(SEED_OPENS);
    const drifted = reloadWith(opened.state, (parsed) => {
      (parsed as unknown as GameState).player.recovery!.outcomeId = 'legacy-salvage-derelict';
    });
    const creditsBefore = drifted.player.credits;

    const dusk = endDay(startDay(endDay(drifted).state).state);

    const abandoned = eventsOfType(dusk.events, 'RecoveryAbandoned');
    expect(abandoned).toHaveLength(1);
    expect(abandoned[0].reason).toBe('unknown-outcome');
    expect(abandoned[0].outcomeId).toBe('legacy-salvage-derelict');
    expect(dusk.state.player.recovery).toBeNull();
    expect(eventsOfType(dusk.events, 'RecoveryPaidOut')).toHaveLength(0);
    expect(dusk.state.player.credits).toBe(creditsBefore);
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

// ---------------------------------------------------------------------------
// 7 · T-115 · THE LONGEST CLOCK ON THE LADDER, driven end to end
// ---------------------------------------------------------------------------

describe('T-115 · a BAND-4 find is a six-day commitment (§5.2, §5.4)', () => {
  it('opens N = 6 from the band table alone, and pays out on the sixth dusk', () => {
    // WHAT THIS PROVES, and why it could not be written before T-115: "the most
    // powerful outcomes are the slowest to recover" has been asserted since T-111
    // as a PROPERTY of the band table (`exploreOutcomes.test.ts`, §5.4). Until
    // bands 3 and 4 were authored, no row in the game could reach N = 3 or N = 6,
    // so the longest clock had never actually run through the real day loop. This
    // runs it: dawn, the Explore verb, six real duskes, and the payout.
    //
    // NOTHING HERE NAMES A NUMBER THE CONTENT DOES NOT. The expected `dueDay` is
    // `day + recoveryDays(row.valuePoints)` read off the drawn row, so a re-banded
    // row moves the test with it rather than breaking it — and the assertion that
    // matters (`N === 6` at band 4) is checked against the BAND TABLE, which is
    // the one place a day-count may be written.
    const opened = openRecovery(SEED_BAND4);
    const recovery = opened.state.player.recovery!;
    const row = outcomeById(recovery.outcomeId)!;
    expect(row, `${recovery.outcomeId} resolves to no content row`).toBeDefined();

    const N = recoveryDays(row.valuePoints);
    expect(N).toBe(EXPLORE_VALUE_BANDS[4].recoveryDays);
    expect(N).toBe(6);
    expect(recovery.dueDay).toBe(recovery.startedDay + N);

    // Six real duskes pass without paying (the predicate is `day >= dueDay`, and
    // the day of the find is `dueDay - 6`), and the Explore verb is refused on
    // every dawn in between — which is the cost the ladder charges for the top of
    // the table, and the whole point of §5.4's correlation.
    let live = opened.state;
    for (let step = 0; step < N; step += 1) {
      const dusk = endDay(live);
      expect(
        eventsOfType(dusk.events, 'RecoveryPaidOut'),
        `paid early on step ${step}`,
      ).toHaveLength(0);
      expect(eventsOfType(dusk.events, 'RecoveryAbandoned')).toHaveLength(0);
      expect(dusk.state.player.recovery).toEqual(recovery);
      live = startDay(dusk.state).state;
      const refused = applyPlayerAction(live, { type: 'Explore', spendDie: bestUnspentDie(live) });
      expect(
        refused.events.some(
          (e) => e.type === 'ExplorationFailed' && e.reason === 'recovery-in-progress',
        ),
        `the verb was not refused on day ${live.day}`,
      ).toBe(true);
    }

    // The sixth dusk is the one `day >= dueDay` is true on.
    const payout = endDay(live);
    const paid = eventsOfType(payout.events, 'RecoveryPaidOut');
    expect(paid).toHaveLength(1);
    expect(paid[0].day).toBe(recovery.dueDay);
    expect(paid[0].outcomeId).toBe(recovery.outcomeId);
    expect(paid[0].valuePoints).toBe(row.valuePoints);
    expect(payout.state.player.recovery).toBeNull();
  });
});
