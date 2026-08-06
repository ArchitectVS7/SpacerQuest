import { describe, expect, it } from 'vitest';

import { LIARS_DICE_UNLOCK_GAMES } from '@spacerquest/content';
import { dicePerSideForTier } from '@spacerquest/engine';

import {
  dareCellKey,
  derivedDareTier,
  dicePerSideAgreesWithTier,
  runCampaign,
  zeroDareCells,
  type DareCellKey,
  type DareCellStats,
} from '../index.js';

// ---------------------------------------------------------------------------
// T-175 · THE ARCHETYPE-ORDERING SPLIT (F-160-1), `HangoutPlayStats.dareCells`.
//
// WHY THIS FILE EXISTS. `docs/HANGOUT_REDESIGN.md` §10.7 retired the gitignored
// `.scratch/` probe lineage at T-173 — "a new measurement reads the sweep's own
// rows instead of descending from this file" — so F-160-1's pool × archetype ×
// tier split ships on the INSTRUMENT. An instrument nobody checks is a probe with
// extra steps; these are the checks.
//
// THREE PROPERTIES, in the order they matter:
//   1. THE JOIN IS LOSSLESS. `Σ hands === dares`, `Σ playerWon === daresWon`,
//      `Σ netCredits === netCredits`. Every split rests on this, and it is also
//      the only assertion that the ENGINE-derived `playerWon` (read off
//      `DareHandResolved.outcome`) agrees with the `HangoutEvent`-derived one the
//      three existing counters are folded from. Two independent derivations that
//      agree is the fidelity channel; one derivation used twice would be neither.
//   2. THE TIER IS DERIVED, NOT READ. `docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.6a
//      CLOSES the licensed live-`liarsDiceTier` list at four; T-175 follows T-148's
//      probe precedent and derives the tier arithmetically instead. The derivation
//      is cross-checked against the hand's OWN frozen `dicePerSide` on every hand,
//      which turns the constraint into a free correctness check on freeze-at-open.
//      A non-zero `dareTierDisagreements` is a FINDING TO FILE, not a tolerance.
//   3. EVERY KEY IS PRESENT. T-173's `movesByReason` rule: a missing key and a
//      zero must not be the same reading.
//
// This file lives in `__tests__`, which is in `HASHED_ROOT_IGNORED_DIRECTORIES`,
// so nothing here can move a fingerprint.
// ---------------------------------------------------------------------------

/** The gambler is the ONLY policy that plans a Dare (`planDare` has one call
 *  site). Every cell figure below therefore comes off gambler careers, and the
 *  `explorer` control below is what proves the cells are policy-sensitive rather
 *  than incidentally populated. */
const GAMBLER_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const DAYS = 120;

function sum(cells: Record<DareCellKey, DareCellStats>, of: keyof DareCellStats): number {
  return Object.values(cells).reduce((total, cell) => total + cell[of], 0);
}

describe('T-175 · dareCells — the join is lossless', () => {
  it.each(GAMBLER_SEEDS)(
    'gambler seed %i: Σ over the cells reproduces dares / daresWon / netCredits exactly',
    (seed) => {
      const { hangoutPlay } = runCampaign(seed, DAYS, 'gambler');
      // A career that never sat at a table would make the identity vacuous.
      expect(hangoutPlay.dares).toBeGreaterThan(0);

      expect(sum(hangoutPlay.dareCells, 'hands')).toBe(hangoutPlay.dares);
      // THE TWO-DERIVATION CHANNEL: the cells count a win off
      // `DareHandResolved.outcome`; `daresWon` counts it off `HangoutEvent.playerWon`.
      // They are folded from different events and must agree.
      expect(sum(hangoutPlay.dareCells, 'playerWon')).toBe(hangoutPlay.daresWon);
      expect(sum(hangoutPlay.dareCells, 'netCredits')).toBeCloseTo(hangoutPlay.netCredits, 6);
      // A raise or a bid is a beat of a hand, so there is at least one per hand.
      expect(sum(hangoutPlay.dareCells, 'bids')).toBeGreaterThanOrEqual(hangoutPlay.dares);
    },
    120_000,
  );

  it('every cell is present and zero-filled on a career that never dares', () => {
    const { hangoutPlay } = runCampaign(1, 40, 'explorer');
    expect(hangoutPlay.dares).toBe(0);
    const keys = Object.keys(hangoutPlay.dareCells);
    // 2 pools × 4 archetype slots × 6 tiers.
    expect(keys).toHaveLength(48);
    expect(new Set(keys)).toEqual(new Set(Object.keys(zeroDareCells())));
    for (const cell of Object.values(hangoutPlay.dareCells)) {
      expect(cell).toEqual({ hands: 0, playerWon: 0, netCredits: 0, bids: 0 });
    }
  });

  it('is policy-sensitive: the gambler populates cells the explorer leaves at zero', () => {
    const gambler = runCampaign(1, DAYS, 'gambler').hangoutPlay;
    const explorer = runCampaign(1, DAYS, 'explorer').hangoutPlay;
    const populated = (cells: Record<DareCellKey, DareCellStats>) =>
      Object.values(cells).filter((cell) => cell.hands > 0).length;
    expect(populated(gambler.dareCells)).toBeGreaterThan(0);
    expect(populated(explorer.dareCells)).toBe(0);
  }, 120_000);
});

describe('T-175 · dareCells — the tier is derived and cross-checked', () => {
  it.each(GAMBLER_SEEDS)(
    'gambler seed %i: ZERO tier/dicePerSide disagreements',
    (seed) => {
      const { hangoutPlay } = runCampaign(seed, DAYS, 'gambler');
      expect(
        hangoutPlay.dareTierDisagreements,
        `${hangoutPlay.dareTierDisagreements} of ${hangoutPlay.dares} settled hands had an ` +
          `arithmetic tier that disagreed with their own FROZEN dicePerSide. That is a bug in ` +
          `freeze-at-open or in the derivation — FILE IT, do not widen a tolerance.`,
      ).toBe(0);
    },
    120_000,
  );

  it('derivedDareTier reproduces the engine ladder at and around every rung', () => {
    // The thresholds are content's; the off-by-one is the engine's (the hand being
    // settled was OPENED while the counter still read the pre-increment value).
    expect(derivedDareTier(0)).toBe(0);
    expect(derivedDareTier(-1)).toBe(0);
    for (let rung = 0; rung < LIARS_DICE_UNLOCK_GAMES.length; rung += 1) {
      const threshold = LIARS_DICE_UNLOCK_GAMES[rung];
      expect(derivedDareTier(threshold - 1), `${threshold - 1} settled`).toBe(rung);
      expect(derivedDareTier(threshold), `${threshold} settled`).toBe(rung + 1);
    }
    expect(derivedDareTier(1_000_000)).toBe(5);
  });

  it('dicePerSideAgreesWithTier is the engine mapping and nothing restated', () => {
    for (const tier of [0, 1, 2, 3, 4, 5]) {
      expect(dicePerSideAgreesWithTier(dicePerSideForTier(tier), tier)).toBe(true);
      expect(dicePerSideAgreesWithTier(dicePerSideForTier(tier) + 1, tier)).toBe(false);
    }
    // Tiers 2..5 all hold six dice — the cross-check is a BAND, and that is why a
    // disagreement is meaningful in only one direction.
    expect(dicePerSideForTier(2)).toBe(dicePerSideForTier(5));
  });

  it('dareCellKey is the only spelling, and the zero-fill uses it', () => {
    expect(dareCellKey('roster', 'optimal', 3)).toBe('roster|optimal|t3');
    expect(dareCellKey('roaming', 'none', 0)).toBe('roaming|none|t0');
    const cells = zeroDareCells();
    expect(cells[dareCellKey('roster', 'random', 5)]).toEqual({
      hands: 0,
      playerWon: 0,
      netCredits: 0,
      bids: 0,
    });
  });
});

describe('T-175 · the archetype ordering, as a LIVE assertion (F-160-1)', () => {
  it('optimal is NOT the softest roster seat: the player wins no more often against it than against bad', () => {
    // THE REGRESSION DETECTOR FOR F-160-1. Before T-175 the player won 64.48%
    // against `optimal` and 51.98% against `bad` — bad − optimal = −12.50 pp,
    // z = −21.02. This test goes red if that inversion comes back.
    //
    // SIZED AS A DETECTOR, NOT A KNIFE EDGE: it asserts only the SIGN of the
    // difference, over every gambler seed pooled, and it prints both rates and
    // both `n` in the failure message. If it ever goes red, WIDEN THE SAMPLE —
    // never move the bar (N4/N10, `docs/VERSIONING.md`).
    let optimalHands = 0;
    let optimalWon = 0;
    let badHands = 0;
    let badWon = 0;
    for (const seed of GAMBLER_SEEDS) {
      const { dareCells } = runCampaign(seed, DAYS, 'gambler').hangoutPlay;
      for (const [key, cell] of Object.entries(dareCells) as [DareCellKey, DareCellStats][]) {
        if (key.startsWith('roster|optimal|')) {
          optimalHands += cell.hands;
          optimalWon += cell.playerWon;
        } else if (key.startsWith('roster|bad|')) {
          badHands += cell.hands;
          badWon += cell.playerWon;
        }
      }
    }
    // The cells must actually be populated, or the assertion below is vacuous.
    expect(optimalHands).toBeGreaterThan(200);
    expect(badHands).toBeGreaterThan(50);

    const optimalRate = optimalWon / optimalHands;
    const badRate = badWon / badHands;
    const se = Math.sqrt(
      (optimalRate * (1 - optimalRate)) / optimalHands + (badRate * (1 - badRate)) / badHands,
    );
    const message =
      `player win vs optimal ${(100 * optimalRate).toFixed(2)}% (n=${optimalHands}) ` +
      `vs bad ${(100 * badRate).toFixed(2)}% (n=${badHands}) — ` +
      `bad − optimal = ${(100 * (badRate - optimalRate)).toFixed(2)} pp, SE ${(100 * se).toFixed(2)}`;
    // `optimal` must be AT LEAST as hard as `bad`: the player must not win more
    // often against it. Stated as `<=` on the win rates, which is the ordering
    // F-160-1 names, and reported either way in the message.
    expect(optimalRate, message).toBeLessThanOrEqual(badRate);
  }, 240_000);
});
