import { describe, expect, it } from 'vitest';
import { advanceDay, applyPlayerAction, startDay } from '../day.js';
import { eligibleStorylets } from '../storylets.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { validateGameState } from '../schema.js';
import { DayPhase, GameEvent, GameState, PlayerAction } from '../types.js';

/**
 * T-113b — the Day-30 Tour One resolution. The engine FORCES the resolution at
 * the dusk of day 30 (day.ts), debt-aware and exactly once. These tests drive
 * the real day lifecycle (advanceDay) so the resolution fires the way it does in
 * a live campaign — no direct poking of the resolution path.
 */

/** A fresh spacer parked at the dawn of day 30, ready to play out the last day
 *  of Tour One. Deterministic per seed. */
function atDawnOfDay30(seed: number): GameState {
  const state = createInitialState(seed);
  state.day = 30;
  return state;
}

/** Drive `days` more full days from a DAWN state, asserting the anti-soft-lock
 *  invariant every day: a fresh five-die hand with usable dice, and a legal
 *  action (Wait) that advances the clock without throwing. */
function assertPlayableFor(start: GameState, days: number): GameState {
  let state = start;
  for (let i = 0; i < days; i += 1) {
    expect(state.dayPhase).toBe(DayPhase.DAWN);

    // Dice are available: startDay rolls a fresh five-die hand, none spent.
    const dawn = startDay(state);
    expect(dawn.state.player.dawnHand?.dice).toHaveLength(5);
    expect(dawn.state.player.dawnHand?.spent.some((spent) => !spent)).toBe(true);

    // A legal action remains available and the day resolves without a lock.
    const before = state.day;
    const result = advanceDay(state, [{ type: 'Wait' }]);
    expect(result.state.day).toBe(before + 1);
    state = result.state;
  }
  return state;
}

describe('T-113b Tour One resolution — debt cleared', () => {
  it('a scripted clear by day 30 fires the resolution, earns the Deed, and unlocks the veteran game', () => {
    const state = atDawnOfDay30(4242);
    // The scripted policy has banked enough to discharge the 25,000cr marker and
    // clears it on the final day via the real pay-debt action (no die required).
    state.player.credits = 30000;
    const payDebt: PlayerAction = { type: 'Trade', action: 'pay-debt', amount: 25000 };

    const { state: resolved, events } = advanceDay(state, [payDebt]);

    // Resolution event fired, cleared branch, debt discharged.
    const resolution = events.find(
      (event): event is Extract<GameEvent, { type: 'TourOneResolved' }> =>
        event.type === 'TourOneResolved',
    );
    expect(resolution).toBeDefined();
    expect(resolution?.outcome).toBe('cleared');
    expect(resolution?.debtOutstanding).toBe(0);
    expect(resolved.player.debt).toBe(0);

    // Veteran-unlock flag + resolution discriminator flag set.
    expect(resolved.flags['veteran.unlocked']).toBe(true);
    expect(resolved.flags['tour-one.resolved']).toBe('cleared');

    // T-1301: the Day-30 resolution owns the campaign-era transition — the
    // cleared branch is a CLEAN veteran (era flipped past day 30).
    expect(resolved.era).toBe('VETERAN');

    // The Tour-One-resolution Deed is earned, and renown/rank-up followed.
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'DeedEarned', deedId: 'tour_one_cleared' }),
    );
    expect(resolved.player.registry.earned.map((deed) => deed.id)).toContain('tour_one_cleared');
    expect(resolved.player.registry.renownRank).not.toBe('LIEUTENANT');

    // The forced resolution storylet surfaces at the very next dawn (via the
    // standard eligibility refresh keyed on the discriminator flag) and is
    // playable — proving the trigger was forced deterministically.
    const dawn31 = startDay(resolved);
    expect(dawn31.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'resolution.tour-one.cleared',
    );
    const played = applyPlayerAction(dawn31.state, {
      type: 'Storylet',
      storyletId: 'resolution.tour-one.cleared',
      choiceId: 'log-it',
    });
    expect(played.state.flags['resolution.tour-one.cleared.logged']).toBe(true);

    // Fires exactly once: replaying day 31 forward does not re-resolve.
    const nextResult = advanceDay(resolved, [{ type: 'Wait' }]);
    expect(nextResult.events.some((event) => event.type === 'TourOneResolved')).toBe(false);
  });

  it('the cleared game stays playable for 10 more days (no soft-lock)', () => {
    const state = atDawnOfDay30(4242);
    state.player.credits = 30000;
    const { state: resolved } = advanceDay(state, [
      { type: 'Trade', action: 'pay-debt', amount: 25000 },
    ]);
    expect(resolved.flags['tour-one.resolved']).toBe('cleared');
    assertPlayableFor(resolved, 10);
  });
});

describe('T-113b Tour One resolution — debt unpaid', () => {
  it('a failing policy hits the consequence branch and the debt survives', () => {
    const state = atDawnOfDay30(909);
    const debtBefore = state.player.debt; // 25,000 untouched
    expect(debtBefore).toBeGreaterThan(0);

    const { state: resolved, events } = advanceDay(state, [{ type: 'Wait' }]);

    const resolution = events.find(
      (event): event is Extract<GameEvent, { type: 'TourOneResolved' }> =>
        event.type === 'TourOneResolved',
    );
    expect(resolution).toBeDefined();
    expect(resolution?.outcome).toBe('unpaid');
    expect(resolution?.debtOutstanding).toBe(debtBefore);

    // Consequence branch: the marker also comes due, the discriminator flag is
    // 'unpaid', the veteran game is NOT unlocked, and the debt SURVIVES.
    expect(events.some((event) => event.type === 'DebtDue')).toBe(true);
    expect(resolved.flags['tour-one.resolved']).toBe('unpaid');
    expect(resolved.flags['veteran.unlocked']).toBeUndefined();
    expect(resolved.player.debt).toBe(debtBefore);

    // T-1301: the unpaid branch proceeds as VETERAN-with-debt — the era flips
    // for everyone (so TOUR_ONE content expires and veteran content opens), but
    // the debt survives untouched and the clean-veteran discriminator stays off.
    expect(resolved.era).toBe('VETERAN');

    // No cleared Deed on this path.
    expect(
      events.some((event) => event.type === 'DeedEarned' && event.deedId === 'tour_one_cleared'),
    ).toBe(false);

    // The unpaid resolution storylet is forced at the next dawn and is playable.
    const dawn31 = startDay(resolved);
    expect(dawn31.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'resolution.tour-one.unpaid',
    );
    const played = applyPlayerAction(dawn31.state, {
      type: 'Storylet',
      storyletId: 'resolution.tour-one.unpaid',
      choiceId: 'keep-flying',
    });
    expect(played.state.flags['resolution.tour-one.unpaid.pressing-on']).toBe(true);
  });

  it('the indebted game stays playable for 10 more days (no soft-lock)', () => {
    const state = atDawnOfDay30(909);
    const { state: resolved } = advanceDay(state, [{ type: 'Wait' }]);
    expect(resolved.flags['tour-one.resolved']).toBe('unpaid');
    // T-1309: the unpaid branch flags the captain's name and the marker begins
    // accruing interest from the next dusk. Its VALUE is a guild-standing severity
    // (> 0), the boolean gate the two port readers use.
    expect(Number(resolved.flags['guild.debt-flagged'])).toBeGreaterThan(0);

    const after = assertPlayableFor(resolved, 10);
    // T-1309: debt now GROWS across the post-resolution days — "the interest keeps
    // running" has teeth (was `toBe(state.player.debt)` when the branch was
    // cosmetic). The ship stays fully playable throughout (assertPlayableFor drives
    // a legal action every day) — debt is a ledger, never a soft-lock. MUTATION
    // NOTE: revert the day.ts accrual block and this goes back to equality → red.
    expect(after.player.debt).toBeGreaterThan(state.player.debt);
  });

  it('the CLEARED branch never flags the captain and never accrues interest', () => {
    // The mirror of the unpaid test: a cleared marker sets no port-clerk flag, so
    // the accrual block (guarded on that flag) never fires and debt stays at 0
    // across the same 10 post-resolution days. This is what keeps every cleared /
    // clean-veteran golden byte-identical.
    const state = atDawnOfDay30(4242);
    state.player.credits = 30000;
    const { state: resolved } = advanceDay(state, [
      { type: 'Trade', action: 'pay-debt', amount: 25000 },
    ]);
    expect(resolved.flags['tour-one.resolved']).toBe('cleared');
    expect(resolved.flags['guild.debt-flagged']).toBeUndefined();
    const after = assertPlayableFor(resolved, 10);
    expect(after.player.debt).toBe(0);
  });
});

describe('T-113b Tour One resolution — serialization sync', () => {
  it('round-trips a resolved state through the versioned schema (event + flags)', () => {
    const state = atDawnOfDay30(4242);
    state.player.credits = 30000;
    const { state: resolved } = advanceDay(state, [
      { type: 'Trade', action: 'pay-debt', amount: 25000 },
    ]);

    // The eventLog now carries a TourOneResolved variant; the schema must accept
    // it, and the deserialize round-trip must be exact.
    const serialized = serializeState(resolved);
    expect(() => validateGameState(JSON.parse(serialized))).not.toThrow();
    expect(deserializeState(serialized).flags['veteran.unlocked']).toBe(true);
    expect(resolved.eventLog.some((event) => event.type === 'TourOneResolved')).toBe(true);
  });

  it('T-1301: round-trips the mid-transition state with era already flipped to VETERAN', () => {
    // "Mid-transition" = the day-30-dusk/day-31-dawn resolved state where era has
    // just flipped and the resolution flag/event are freshly present.
    const state = atDawnOfDay30(4242);
    state.player.credits = 30000;
    const { state: resolved } = advanceDay(state, [
      { type: 'Trade', action: 'pay-debt', amount: 25000 },
    ]);
    expect(resolved.era).toBe('VETERAN');

    const serialized = serializeState(resolved);
    expect(() => validateGameState(JSON.parse(serialized))).not.toThrow();
    // The flipped era survives the JSON round-trip exactly.
    expect(deserializeState(serialized).era).toBe('VETERAN');
  });
});

/**
 * T-1301 — the Day-30 resolution OWNS the campaign-era transition. These tests
 * prove the flip's two downstream consequences that were previously dead:
 * TOUR_ONE-gated content expires, and VETERAN-gated content becomes reachable.
 */
describe('T-1301 era transition — TOUR_ONE content expires, VETERAN content fires', () => {
  /** Resolve day 30 on the cleared branch and return the resolved (era=VETERAN)
   *  state. */
  function resolveCleared(): GameState {
    const state = atDawnOfDay30(4242);
    state.player.credits = 30000;
    const { state: resolved } = advanceDay(state, [
      { type: 'Trade', action: 'pay-debt', amount: 25000 },
    ]);
    return resolved;
  }

  /** Resolve day 30 on the unpaid branch and return the resolved (era=VETERAN)
   *  state. */
  function resolveUnpaid(): GameState {
    const state = atDawnOfDay30(909);
    const { state: resolved } = advanceDay(state, [{ type: 'Wait' }]);
    return resolved;
  }

  it('a TOUR_ONE-gated storylet is offered under TOUR_ONE and ineligible under VETERAN (era is the sole cause)', () => {
    // `port.sun3.guild-auditor` gates on { systemIds:[1], eras:['TOUR_ONE'] }.
    // The spacer starts at system 1, so the system gate is satisfied; the era
    // gate is the only variable. Hold everything else constant across the two
    // states and flip only `era` — the auditor must appear, then vanish.
    const tourOne = atDawnOfDay30(4242);
    tourOne.day = 31;
    tourOne.era = 'TOUR_ONE';
    expect(eligibleStorylets(tourOne).map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    const veteran: GameState = { ...tourOne, era: 'VETERAN' };
    expect(eligibleStorylets(veteran).map((offer) => offer.storyletId)).not.toContain(
      'port.sun3.guild-auditor',
    );

    // And the REAL post-transition state (era already flipped by the resolution)
    // does not offer it either.
    const resolved = resolveCleared();
    expect(eligibleStorylets(resolved).map((offer) => offer.storyletId)).not.toContain(
      'port.sun3.guild-auditor',
    );
  });

  it('the VETERAN-gated opener fires and is playable at the first veteran dawn — cleared branch', () => {
    const resolved = resolveCleared();
    expect(resolved.era).toBe('VETERAN');

    const dawn = startDay(resolved);
    expect(dawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'veteran.first-lane',
    );

    // Drive it through the same code path the UI uses — the player-reachable proof.
    const played = applyPlayerAction(dawn.state, {
      type: 'Storylet',
      storyletId: 'veteran.first-lane',
      choiceId: 'set-a-heading',
    });
    expect(played.state.flags['veteran.first-lane.committed']).toBe(true);
  });

  it('the VETERAN-gated opener fires and is playable at the first veteran dawn — unpaid branch', () => {
    const resolved = resolveUnpaid();
    expect(resolved.era).toBe('VETERAN');

    const dawn = startDay(resolved);
    expect(dawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'veteran.first-lane',
    );

    const played = applyPlayerAction(dawn.state, {
      type: 'Storylet',
      storyletId: 'veteran.first-lane',
      choiceId: 'take-stock',
    });
    expect(played.state.flags['veteran.first-lane.took-stock']).toBe(true);
  });
});
