import { describe, expect, it } from 'vitest';
import { EXPLORATION_FUEL_COST, EXPLORE_VALUE_BANDS } from '@spacerquest/content';
import { applyPlayerAction, startDay } from '../day.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { apCost, outcomeById, recoveryDays } from '../exploreOutcomes.js';
import type { GameEvent, GameState } from '../types.js';

/**
 * T-131 · BANDS 3-4 PAY IN DICE, NOT DAYS (owner ruling D1, `/bakeoff`,
 * 2026-07-31; docs/EXPLORE_REDESIGN.md §3.3, §5.2).
 *
 * EVERY test in this file drives the REAL day loop — `startDay` →
 * `applyPlayerAction({type:'Explore'})` — against a real seed. NOTHING here
 * assigns to `player.dawnHand` or `player.recovery`. That is the point of the
 * suite and the reason it exists alongside the unit tests in
 * `exploreOutcomes.test.ts`: the `apCost` payment has to be reachable through the
 * verb a player actually presses, out of the hand `startDay` actually deals.
 *
 * THE SISTER SUITE IS `recovery.test.ts`, which owns band 2 — the one band the
 * ruling left completely alone. Its four interaction rulings (travel-away, death,
 * day-30 forfeit, the location predicate) are unchanged and untested here.
 *
 * --- Seeds, and how each was found -----------------------------------------
 *
 * Same discipline as `recovery.test.ts`: each seed was found by a scan written
 * once against the REAL loop under THE EXACT ACTION PREFIX the test using it
 * drives, then pinned here with the property it was selected for. Nothing about a
 * seed is magic; it is a board that reaches the state the ruling is about.
 *
 * THE PREFIX IS PART OF THE SEED. `day.ts` forks the action rng on the action's
 * event index, so burning dice BEFORE the Explore changes `dayEventCount` and
 * therefore changes which row the board draws. `SEED_FORFEIT` below is only a
 * forfeit under its own four-action burn prefix, and the scan that found it drove
 * exactly that prefix.
 */

/** Day-1 board draws a BAND-3 row (apCost 2), with a full hand behind it. */
const SEED_BAND3 = 9;
/** Day-1 board draws a BAND-4 row (apCost 3), with a full hand behind it. */
const SEED_BAND4 = 2;
/** Day-1 board draws a BAND-2 row — the untouched path, asserted as the control. */
const SEED_BAND2 = 10;
/** Day-1 board draws a band-3/4 row AFTER the four-die burn prefix below, so the
 *  hand cannot cover the `apCost` and the find is forfeited. */
const SEED_FORFEIT = 25;

/** The highest unspent die — what a real player would fly a DC-12 nav check with.
 *  Mirrors `recovery.test.ts`'s helper of the same name. */
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

function spentCount(state: GameState): number {
  return (state.player.dawnHand?.spent ?? []).filter(Boolean).length;
}

function unspentIndices(state: GameState): number[] {
  const hand = state.player.dawnHand;
  if (!hand) return [];
  const out: number[] = [];
  for (let i = 0; i < hand.dice.length; i += 1) if (!hand.spent[i]) out.push(i);
  return out;
}

/** Which indices flipped from unspent to spent across one action. */
function newlySpent(before: GameState, after: GameState): number[] {
  const from = before.player.dawnHand!;
  const to = after.player.dawnHand!;
  const out: number[] = [];
  for (let i = 0; i < to.dice.length; i += 1) if (!from.spent[i] && to.spent[i]) out.push(i);
  return out;
}

/** Dawn, then one Explore with the best die. The verb and nothing else. */
function sweep(seed: number): { before: GameState; after: GameState; events: GameEvent[] } {
  const dawn = startDay(createInitialState(seed)).state;
  const die = bestUnspentDie(dawn);
  expect(die).toBeGreaterThanOrEqual(0);
  const result = applyPlayerAction(dawn, { type: 'Explore', spendDie: die });
  return { before: dawn, after: result.state, events: result.events };
}

/** The band a sweep's find fell in, read back off the events it produced. A
 *  same-day find is identified through its `RecoveryStarted` when it defers, and
 *  otherwise by the dice it cost — which is the contract under test, so the
 *  per-test assertions below name the band explicitly rather than trusting this. */
function bandOfRecovery(state: GameState): number | null {
  const recovery = state.player.recovery;
  if (!recovery) return null;
  const row = outcomeById(recovery.outcomeId);
  return row
    ? EXPLORE_VALUE_BANDS.filter((b) => row.valuePoints >= b.minValuePoints).pop()!.band
    : null;
}

const PAYLOAD_EVENTS: readonly GameEvent['type'][] = [
  'SalvageRecovered',
  'UniqueItemAcquired',
  'FragmentAcquired',
  'DispositionChanged',
  'StoryletScheduled',
];

describe('T-131 · a band-3 find costs the sweep die plus 2 more, same day', () => {
  it('spends exactly 1 + apCost dice, opens no recovery, and resolves today', () => {
    const { before, after, events } = sweep(SEED_BAND3);

    // The board really is band 3 — asserted through the CONTENT table, not by
    // counting the dice the rule under test spent.
    expect(events.some((e) => e.type === 'PoiDiscovered')).toBe(true);
    expect(EXPLORE_VALUE_BANDS[3].apCost).toBe(2);

    // NO recovery. This is the whole ruling: bands 3-4 stopped opening the slot.
    expect(after.player.recovery).toBeNull();
    expect(events.some((e) => e.type === 'RecoveryStarted')).toBe(false);
    expect(events.some((e) => e.type === 'ExplorationFailed')).toBe(false);

    // The payload landed TODAY, exactly as a band-0/1 find does.
    expect(events.some((e) => PAYLOAD_EVENTS.includes(e.type))).toBe(true);

    // 1 (the sweep) + 2 (the band's apCost) = 3 dice, off ONE player action.
    expect(spentCount(after) - spentCount(before)).toBe(1 + 2);
  });
});

describe('T-131 · a band-4 find costs the sweep die plus 3 more, same day', () => {
  it('spends exactly 1 + apCost dice, opens no recovery, and resolves today', () => {
    const { before, after, events } = sweep(SEED_BAND4);

    expect(events.some((e) => e.type === 'PoiDiscovered')).toBe(true);
    expect(EXPLORE_VALUE_BANDS[4].apCost).toBe(3);
    expect(after.player.recovery).toBeNull();
    expect(events.some((e) => e.type === 'RecoveryStarted')).toBe(false);
    expect(events.some((e) => e.type === 'ExplorationFailed')).toBe(false);
    expect(events.some((e) => PAYLOAD_EVENTS.includes(e.type))).toBe(true);

    // The base dawn hand is five dice, so 1 + 3 is reachable but not comfortable —
    // which is the point of the price.
    expect(before.player.dawnHand!.dice).toHaveLength(5);
    expect(spentCount(after) - spentCount(before)).toBe(1 + 3);
  });

  it('pays the LOWEST-VALUE unspent dice first, on a hand of mixed values', () => {
    // THE RULE, stated so the pick is never implementation-defined: the payment
    // ignores die values entirely, so it takes the CHEAPEST dice and leaves the
    // player's best ones for the checks still ahead in the day.
    const { before, after, events } = sweep(SEED_BAND4);
    const hand = before.player.dawnHand!;
    const die = bestUnspentDie(before);

    // NOT VACUOUS: a hand of five identical dice would make any pick look correct.
    expect(new Set(hand.dice).size, `seed ${SEED_BAND4} dealt a uniform hand`).toBeGreaterThan(1);

    // Compute the expected payment INDEPENDENTLY of the engine: unspent indices
    // after the sweep's own die is taken, sorted ascending by value then index.
    const cost = EXPLORE_VALUE_BANDS[4].apCost;
    const expectedPayment = unspentIndices(before)
      .filter((i) => i !== die)
      .sort((a, b) => hand.dice[a] - hand.dice[b] || a - b)
      .slice(0, cost);
    expect(expectedPayment).toHaveLength(cost);

    expect(newlySpent(before, after).sort((a, b) => a - b)).toEqual(
      [die, ...expectedPayment].sort((a, b) => a - b),
    );
    // …and the dice it deliberately did NOT take are the dear ones.
    for (const kept of unspentIndices(after)) {
      for (const paid of expectedPayment) {
        expect(
          hand.dice[kept],
          `kept ${hand.dice[kept]} but paid ${hand.dice[paid]}`,
        ).toBeGreaterThanOrEqual(hand.dice[paid]);
      }
    }
    expect(events.some((e) => e.type === 'ExplorationFailed')).toBe(false);
  });
});

describe('T-131 · a hand too thin to pay FORFEITS the find', () => {
  // THE BURN PREFIX IS PART OF THE FIXTURE. Four dice go through the real Trade
  // verb — the standard die burner (`day.test.ts`, `crossing.test.ts` both use
  // it) — leaving exactly one unspent die for the sweep and none for the payment.
  // Because the burn moves `dayEventCount`, and `day.ts` forks the action rng on
  // it, THIS PREFIX IS WHAT MAKES SEED 25 DRAW A BAND-3/4 ROW. A different prefix
  // is a different board.
  function burnedDownTo(seed: number): GameState {
    let live = startDay(createInitialState(seed)).state;
    for (const index of [1, 2, 3, 4]) {
      const res = applyPlayerAction(live, {
        type: 'Trade',
        action: 'buy-fuel',
        fuelAmount: 1,
        spendDie: index,
      });
      expect(res.state.player.dawnHand!.spent[index], `die ${index} did not burn`).toBe(true);
      live = res.state;
    }
    expect(unspentIndices(live)).toEqual([0]);
    return live;
  }

  it('emits ExplorationFailed{insufficient-dice} and pays nothing at all', () => {
    const live = burnedDownTo(SEED_FORFEIT);
    const fuelBefore = live.player.ship.fuel;
    const creditsBefore = live.player.credits;

    const res = applyPlayerAction(live, { type: 'Explore', spendDie: 0 });

    // THE FIND WAS REAL — the player is told what was charted. Only the recovery
    // of it failed.
    expect(res.events.some((e) => e.type === 'PoiDiscovered')).toBe(true);
    expect(res.state.player.charts.discoveredPois).toHaveLength(1);

    const failed = res.events.find((e) => e.type === 'ExplorationFailed');
    expect(failed && failed.type === 'ExplorationFailed' && failed.reason).toBe(
      'insufficient-dice',
    );

    // NO downgrade and NO partial payout — the simple forfeit, per the ruling.
    for (const kind of PAYLOAD_EVENTS) {
      expect(
        res.events.some((e) => e.type === kind),
        `${kind} paid out on a forfeited find`,
      ).toBe(false);
    }
    expect(res.state.player.credits).toBe(creditsBefore);
    // …and no recovery was opened as a consolation either.
    expect(res.state.player.recovery).toBeNull();

    // The detour was still FLOWN: the sweep's own die and the fuel are spent.
    expect(res.state.player.ship.fuel).toBe(fuelBefore - EXPLORATION_FUEL_COST);
    expect(res.state.player.dawnHand!.spent[0]).toBe(true);
    expect(unspentIndices(res.state)).toEqual([]);

    // The typed fail RENDERS: a wire line is filed alongside it, never silence.
    // (The UI half — `explorationFailExplanation` — is asserted in
    // `packages/ui/src/__tests__/exploration-notice.test.ts`.)
    expect(res.events.filter((e) => e.type === 'WireEntry').length).toBeGreaterThan(1);
  });

  it('the new reason round-trips through a real save', () => {
    // A reason the zod enum rejects is a SAVE THAT FAILS TO LOAD — the event log
    // is validated on deserialize. The compile-time pairing of the union with the
    // enum lives in `schema.ts` (`_covExplorationFailReason`); this is the runtime
    // belt, taken through the real save seam rather than by poking the schema.
    const live = burnedDownTo(SEED_FORFEIT);
    const res = applyPlayerAction(live, { type: 'Explore', spendDie: 0 });
    const reloaded = deserializeState(serializeState(res.state));
    expect(
      reloaded.eventLog.some(
        (e) => e.type === 'ExplorationFailed' && e.reason === 'insufficient-dice',
      ),
    ).toBe(true);
  });
});

describe('T-131 · BAND 2 IS UNTOUCHED — the ruling reached only bands 3 and 4', () => {
  it('a band-2 find still spends exactly ONE die and still opens the slot', () => {
    const { before, after, events } = sweep(SEED_BAND2);

    const started = events.find((e) => e.type === 'RecoveryStarted');
    expect(started, `seed ${SEED_BAND2} no longer opens a recovery`).toBeDefined();
    expect(bandOfRecovery(after)).toBe(2);
    expect(after.player.recovery).not.toBeNull();

    // ONE die: the sweep's own. Band 2 carries `apCost: 0`, so nothing extra is
    // charged — this is the assertion that would catch the rejected D1
    // alternative (all non-zero bands converted) being folded in by mistake.
    expect(spentCount(after) - spentCount(before)).toBe(1);
    expect(EXPLORE_VALUE_BANDS[2].apCost).toBe(0);
    expect(recoveryDays(outcomeById(after.player.recovery!.outcomeId)!.valuePoints)).toBe(1);
    expect(apCost(outcomeById(after.player.recovery!.outcomeId)!.valuePoints)).toBe(0);
  });
});
