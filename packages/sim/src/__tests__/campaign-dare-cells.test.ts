import { describe, expect, it } from 'vitest';

import { LIARS_DICE_OPPONENTS, LIARS_DICE_UNLOCK_GAMES } from '@spacerquest/content';
import {
  DARE_MAX_FACE,
  anteFor,
  dicePerSideForTier,
  effectiveWagerBand,
  probAtLeast,
} from '@spacerquest/engine';

import {
  dareCellKey,
  dareMinSeedForOpeningGate,
  dareOpeningGate,
  dareTier5StakeCellKey,
  derivedDareTier,
  dicePerSideAgreesWithTier,
  runCampaign,
  zeroDareCells,
  zeroDareTier5StakeCells,
  type DareCellKey,
  type DareCellStats,
  type DareTier5StakeCellKey,
  type DareTier5StakeStats,
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
/** T-220 · LD-28's two EV invariants are POOLED credit averages, and credits per
 *  hand are far heavier-tailed than a win/loss indicator (the stake varies by port
 *  band, and a tier-5 hand can move thousands). Eight seeds hold ~1,400 hands,
 *  which is thin for an average with that variance, so this detector gets its own
 *  WIDER seed set — the sample was widened rather than the bar softened
 *  (N4/N10, `docs/VERSIONING.md`; `campaign-dare-challenges.test.ts`'s
 *  `WIDE_GAMBLER_SEEDS` is the precedent). At 48 seeds the pool holds ~8,450
 *  hands and reads +174.0 cr/hand against the capstone's +190.1 (n = 279,857,
 *  §20.3); bootstrapped over the capstone's own 1,600 careers, a 48-career pool
 *  lands below zero in 0 of 8,000 resamples. */
const WIDE_GAMBLER_SEEDS = Array.from({ length: 48 }, (_, index) => index + 1);
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
      expect(cell).toEqual({
        hands: 0,
        playerWon: 0,
        netCredits: 0,
        bids: 0,
        deadZoneHands: 0,
        deadZonePlayerWon: 0,
        deadZoneNetCredits: 0,
        deadZoneBids: 0,
      });
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
      deadZoneHands: 0,
      deadZonePlayerWon: 0,
      deadZoneNetCredits: 0,
      deadZoneBids: 0,
    });
  });
});

describe('T-224 · dareCells measure the bounded-band dead zone', () => {
  it.each(GAMBLER_SEEDS)(
    'gambler seed %i: the dead-zone subcut is a subset of the settled-cell rollup',
    (seed) => {
      const { hangoutPlay } = runCampaign(seed, DAYS, 'gambler');
      let deadZoneHands = 0;
      let deadZoneWon = 0;
      let deadZoneBids = 0;
      for (const [key, cell] of Object.entries(hangoutPlay.dareCells) as [
        DareCellKey,
        DareCellStats,
      ][]) {
        expect(cell.deadZoneHands, key).toBeLessThanOrEqual(cell.hands);
        expect(cell.deadZonePlayerWon, key).toBeLessThanOrEqual(cell.playerWon);
        expect(cell.deadZoneBids, key).toBeLessThanOrEqual(cell.bids);
        if (cell.deadZoneHands === 0) {
          expect(cell.deadZonePlayerWon, key).toBe(0);
          expect(cell.deadZoneNetCredits, key).toBe(0);
          expect(cell.deadZoneBids, key).toBe(0);
        } else {
          expect(cell.deadZoneBids, key).toBeGreaterThanOrEqual(cell.deadZoneHands);
        }
        deadZoneHands += cell.deadZoneHands;
        deadZoneWon += cell.deadZonePlayerWon;
        deadZoneBids += cell.deadZoneBids;
      }

      expect(deadZoneHands).toBeLessThanOrEqual(hangoutPlay.dares);
      expect(deadZoneWon).toBeLessThanOrEqual(hangoutPlay.daresWon);
      expect(deadZoneBids).toBeGreaterThanOrEqual(deadZoneHands);
    },
    120_000,
  );

  it('the shipped gambler arm reaches the zone often enough to measure, not just bound', () => {
    let hands = 0;
    let deadZoneHands = 0;
    let deadZoneWon = 0;
    let deadZoneNet = 0;
    let deadZoneBids = 0;
    const populatedCells = new Set<DareCellKey>();
    for (const seed of WIDE_GAMBLER_SEEDS) {
      const { dareCells } = runCampaign(seed, DAYS, 'gambler').hangoutPlay;
      for (const [key, cell] of Object.entries(dareCells) as [DareCellKey, DareCellStats][]) {
        hands += cell.hands;
        deadZoneHands += cell.deadZoneHands;
        deadZoneWon += cell.deadZonePlayerWon;
        deadZoneNet += cell.deadZoneNetCredits;
        deadZoneBids += cell.deadZoneBids;
        if (cell.deadZoneHands > 0) populatedCells.add(key);
      }
    }

    expect(hands).toBeGreaterThan(2_000);
    expect(
      deadZoneHands,
      `dead-zone hands ${deadZoneHands}/${hands}; populated cells ${[...populatedCells].join(', ')}`,
    ).toBeGreaterThan(0);
    expect(deadZoneWon).toBeGreaterThan(0);
    expect(deadZoneBids).toBeGreaterThanOrEqual(deadZoneHands);
    expect(Number.isFinite(deadZoneNet / deadZoneHands)).toBe(true);
  }, 480_000);
});

describe('T-225 · tier-5 stake cells measure the uncapped gate', () => {
  it('every authored Liar’s Dice port is present and zero-filled on a career that never dares', () => {
    const { hangoutPlay } = runCampaign(1, 40, 'explorer');
    expect(hangoutPlay.dares).toBe(0);
    const keys = Object.keys(hangoutPlay.dareTier5StakeCells);
    expect(keys).toHaveLength(Object.keys(LIARS_DICE_OPPONENTS).length);
    expect(new Set(keys)).toEqual(new Set(Object.keys(zeroDareTier5StakeCells())));
    for (const cell of Object.values(hangoutPlay.dareTier5StakeCells)) {
      expect(cell).toEqual({
        hands: 0,
        playerWon: 0,
        netCredits: 0,
        sumSeedWager: 0,
        maxSeedWager: 0,
        k4Hands: 0,
        pastK4Hands: 0,
        pastK4NetCredits: 0,
        pastK4SumSeedWager: 0,
        pastK4MaxSeedWager: 0,
        dissolvedHands: 0,
      });
    }
  });

  it('the opening-gate helper agrees with the derived boundary at every authored port', () => {
    const tier = 5;
    const dicePerSide = dicePerSideForTier(tier);
    for (const systemId of Object.keys(LIARS_DICE_OPPONENTS).map(Number)) {
      const ante = anteFor(systemId, tier);
      const k4 = dareMinSeedForOpeningGate(4, ante, dicePerSide);
      const k5 = dareMinSeedForOpeningGate(5, ante, dicePerSide);
      const context = `system ${systemId} ante ${ante}`;
      expect(dareOpeningGate(k4, ante, dicePerSide), context).toBeGreaterThanOrEqual(4);
      expect(dareOpeningGate(k4 - 1, ante, dicePerSide), context).toBeLessThan(4);
      expect(dareOpeningGate(k5, ante, dicePerSide), context).toBeGreaterThanOrEqual(5);
      expect(dareOpeningGate(k5 - 1, ante, dicePerSide), context).toBeLessThan(5);
      expect(k5, context).toBeGreaterThan(effectiveWagerBand(systemId, 4).max!);
    }
  });

  it('the shipped gambler arm reaches tier 5 and reports the past-k4 port cut with n', () => {
    let tier5Hands = 0;
    let tier5Won = 0;
    let k4Hands = 0;
    let pastK4Hands = 0;
    let pastK4Net = 0;
    let dissolvedHands = 0;
    const populatedPorts = new Set<DareTier5StakeCellKey>();
    const pastK4Ports = new Set<DareTier5StakeCellKey>();
    for (const seed of WIDE_GAMBLER_SEEDS) {
      const { dareTier5StakeCells } = runCampaign(seed, DAYS, 'gambler').hangoutPlay;
      for (const [key, cell] of Object.entries(dareTier5StakeCells) as [
        DareTier5StakeCellKey,
        DareTier5StakeStats,
      ][]) {
        expect(cell.playerWon, key).toBeLessThanOrEqual(cell.hands);
        expect(cell.k4Hands, key).toBeLessThanOrEqual(cell.hands);
        expect(cell.pastK4Hands, key).toBeLessThanOrEqual(cell.k4Hands);
        expect(cell.dissolvedHands, key).toBeLessThanOrEqual(cell.pastK4Hands);
        if (cell.hands === 0) {
          expect(cell).toEqual(zeroDareTier5StakeCells()[key]);
        } else {
          populatedPorts.add(key);
          expect(cell.maxSeedWager, key).toBeGreaterThan(0);
          expect(cell.sumSeedWager, key).toBeGreaterThan(0);
        }
        if (cell.pastK4Hands > 0) {
          pastK4Ports.add(key);
          expect(cell.pastK4MaxSeedWager, key).toBeGreaterThan(0);
          expect(cell.pastK4SumSeedWager, key).toBeGreaterThan(0);
        }
        tier5Hands += cell.hands;
        tier5Won += cell.playerWon;
        k4Hands += cell.k4Hands;
        pastK4Hands += cell.pastK4Hands;
        pastK4Net += cell.pastK4NetCredits;
        dissolvedHands += cell.dissolvedHands;
      }
    }

    expect(tier5Hands).toBeGreaterThan(1_000);
    expect(tier5Won).toBeGreaterThan(0);
    expect(k4Hands).toBeGreaterThan(0);
    expect(
      pastK4Hands,
      `past-k4 hands ${pastK4Hands}/${tier5Hands}; populated ports ${[...populatedPorts].join(
        ', ',
      )}; past-k4 ports ${[...pastK4Ports].join(', ')}`,
    ).toBeGreaterThan(0);
    expect(dissolvedHands).toBe(0);
    expect(Number.isFinite(pastK4Net / pastK4Hands)).toBe(true);
  }, 480_000);

  it('dareTier5StakeCellKey is the only spelling, and the zero-fill uses it', () => {
    expect(dareTier5StakeCellKey(1)).toBe('system1');
    const cells = zeroDareTier5StakeCells();
    expect(cells[dareTier5StakeCellKey(1)]).toEqual({
      hands: 0,
      playerWon: 0,
      netCredits: 0,
      sumSeedWager: 0,
      maxSeedWager: 0,
      k4Hands: 0,
      pastK4Hands: 0,
      pastK4NetCredits: 0,
      pastK4SumSeedWager: 0,
      pastK4MaxSeedWager: 0,
      dissolvedHands: 0,
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

// ---------------------------------------------------------------------------
// T-220 · LD-28 — THE TABLE'S STANDING INVARIANTS.
//
// `docs/LIARS-DICE_REDESIGN.md` §20 / `docs/LIARS-DICE-DECISIONS.md` LD-28 ruled
// on T-160's arbitration criterion C2 ("55-70% player win rate, EV/hand well under
// +558 cr"). C2 is PARTITIONED:
//
//   * its WIN-RATE limb is RETIRED as the bakeoff instrument it declares itself to
//     be ("Disqualifies; does not pick"). All three of its anchors — T-137's
//     94.66%, T-148's 80.07% and §1.3's opposed-d20 57.3% — were measured on a
//     game whose opening claim was risk-free by construction, which is the very
//     defect T-160's own bakeoff removed. THE 55-70% WAS NOT EDITED and is left
//     verbatim in §17.2; it simply is not a bar the shipped game is held to.
//   * its EV limb SURVIVES and is PROMOTED to a standing invariant, unchanged.
//   * a SECOND invariant is added from design intent: the pooled EV/hand must stay
//     POSITIVE, because the Dare is a VOLUNTARY action whose headline value is the
//     disposition channel (`docs/HANGOUT_REDESIGN.md` §7 / §10.4).
//
// A ruling with no enforcement is prose. These are the checks.
//
// ALL FOUR ARE SIZED AS DETECTORS, NOT KNIFE EDGES: pooled over `WIDE_GAMBLER_SEEDS`,
// each printing its value, its `n` and its SE on failure. IF ONE GOES RED, WIDEN THE
// SAMPLE — NEVER MOVE THE BAR (N4/N10, `docs/VERSIONING.md`).
//
// STATED SO IT IS NOT MISREAD AS A GAP: LD-28's invariants are POOLED, not
// per-pool, and that is a recorded consequence of a WRONG prediction rather than a
// convenience. §20.6 predicted EV > 0 on both pools; the ROSTER pool measures
// -200.8 cr/hand (n = 122,820). That is filed as F-220-1 / `TASKS.md` T-223 and is
// an owner call, not something this file may quietly bound.
// ---------------------------------------------------------------------------

/** T-148's MEASURED money-printer signature — the EV per hand of a table that was
 *  provably broken (openers guaranteed true 100.00%; progression spec §12.2, and
 *  §17.3's control arm reproduces it at +565.8). C2's EV limb is kept BECAUSE this
 *  is an observed pathology rather than a picked figure. NOT A TUNABLE. */
const T148_MONEY_PRINTER_EV_PER_HAND = 558;

/** The three CONCRETE archetypes a roster seat can play. `'mixed'` is resolved to
 *  one of these at OPEN (§4.5 ruling 1), so it is never a cell key. */
const CONCRETE_ARCHETYPES = ['optimal', 'bad', 'random'] as const;
type ConcreteArchetype = (typeof CONCRETE_ARCHETYPES)[number];

/** T-223 · HOISTED TO MODULE SCOPE so the LD-30 describe below reads the SAME
 *  memo rather than taking a fourth full pass over 48 careers. Nothing about the
 *  computation moved; only its scope did, and the T-220 assertions below are
 *  byte-identical. */
let cachedPooled: ReturnType<typeof computePooled> | null = null;
const pooled = () => (cachedPooled ??= computePooled());

function computePooled() {
  let hands = 0;
  let playerWon = 0;
  let netCredits = 0;
  let sumSquaredNet = 0;
  const byPool: Record<'roaming' | 'roster', { hands: number; netCredits: number }> = {
    roaming: { hands: 0, netCredits: 0 },
    roster: { hands: 0, netCredits: 0 },
  };
  // T-223 · the ROSTER pool cut by archetype — the axis LD-30 rests on. Keyed by
  // every concrete archetype up front so a MISSING key and a ZERO are not the same
  // reading (T-173's `movesByReason` rule, which this file's header already cites).
  const rosterByArchetype: Record<ConcreteArchetype, { hands: number; netCredits: number }> = {
    optimal: { hands: 0, netCredits: 0 },
    bad: { hands: 0, netCredits: 0 },
    random: { hands: 0, netCredits: 0 },
  };
  let reportedDares = 0;
  let reportedDaresWon = 0;
  for (const seed of WIDE_GAMBLER_SEEDS) {
    const { hangoutPlay } = runCampaign(seed, DAYS, 'gambler');
    reportedDares += hangoutPlay.dares;
    reportedDaresWon += hangoutPlay.daresWon;
    for (const [key, cell] of Object.entries(hangoutPlay.dareCells) as [
      DareCellKey,
      DareCellStats,
    ][]) {
      hands += cell.hands;
      playerWon += cell.playerWon;
      netCredits += cell.netCredits;
      // A per-cell mean-square, the coarsest dispersion the raw counters admit.
      // Used ONLY to print an SE in a failure message, never to gate anything.
      if (cell.hands > 0) sumSquaredNet += (cell.netCredits / cell.hands) ** 2 * cell.hands;
      const pool = key.startsWith('roaming|') ? 'roaming' : 'roster';
      byPool[pool].hands += cell.hands;
      byPool[pool].netCredits += cell.netCredits;
      if (pool === 'roster') {
        const archetype = key.split('|')[1] as ConcreteArchetype;
        const bucket = rosterByArchetype[archetype];
        // An unknown archetype must NOT be dropped silently — the lossless check
        // in the LD-30 describe is what would catch it, and it can only catch it
        // if the sum here excludes it rather than mis-filing it.
        if (bucket) {
          bucket.hands += cell.hands;
          bucket.netCredits += cell.netCredits;
        }
      }
    }
  }
  const evPerHand = hands ? netCredits / hands : 0;
  const variance = hands ? Math.max(0, sumSquaredNet / hands - evPerHand ** 2) : 0;
  return {
    hands,
    playerWon,
    netCredits,
    evPerHand,
    se: hands ? Math.sqrt(variance / hands) : 0,
    byPool,
    rosterByArchetype,
    reportedDares,
    reportedDaresWon,
  };
}

describe('T-220 · LD-28 — the table`s standing invariants', () => {
  it('the Dare is not a tax on a voluntary action: pooled EV/hand stays POSITIVE', () => {
    const p = pooled();
    // Vacuity guard, in the shape C3'(c) uses: an empty pool would pass anything.
    expect(p.hands, 'the widened seed set played no settled hands at all').toBeGreaterThan(2_000);
    expect(
      p.evPerHand,
      `pooled EV/hand = ${p.evPerHand.toFixed(1)} cr over n = ${p.hands} settled hands ` +
        `(SE ${p.se.toFixed(1)}; roaming n=${p.byPool.roaming.hands}, ` +
        `roster n=${p.byPool.roster.hands}). LD-28 requires it to stay ABOVE ZERO: the Dare is a ` +
        `VOLUNTARY action whose headline value is the disposition channel ` +
        `(docs/HANGOUT_REDESIGN.md §7 / §10.4), and a negative-EV table is one a rational player ` +
        `never sits at, which closes that channel. The demonstrated violator is T-160 shape (a) ` +
        `at -314.9 cr/hand (§18.6). IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE THE BAR ` +
        `(N4/N10, docs/VERSIONING.md).`,
    ).toBeGreaterThan(0);
  }, 480_000);

  it("EV/hand stays far under T-148's money-printer signature", () => {
    const p = pooled();
    expect(p.hands).toBeGreaterThan(2_000);
    expect(
      p.evPerHand,
      `pooled EV/hand = ${p.evPerHand.toFixed(1)} cr over n = ${p.hands} settled hands ` +
        `(SE ${p.se.toFixed(1)}). C2's EV limb — the one limb LD-28 KEPT — bars ` +
        `${T148_MONEY_PRINTER_EV_PER_HAND}, which is not a picked number: it is T-148's MEASURED ` +
        `EV per hand on the pre-fix table whose openers were 100.00% guaranteed true. Reaching ` +
        `it again means the money printer is back. IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE ` +
        `THE BAR (N4/N10, docs/VERSIONING.md).`,
    ).toBeLessThan(T148_MONEY_PRINTER_EV_PER_HAND);
  }, 480_000);

  it('the per-pool cut is lossless and both pools are non-empty', () => {
    // NOT a duplicate of the T-175 join block above, which asserts the sum over ALL
    // 48 cells per seed. This asserts the PARTITION LD-28's per-pool table rests on:
    // every cell belongs to exactly one pool, the two marginals reconstitute the
    // total, and neither marginal is empty (a one-sided cut would make §20.3's
    // headline table a relabelling of the aggregate).
    const p = pooled();
    expect(p.byPool.roaming.hands + p.byPool.roster.hands).toBe(p.hands);
    expect(p.byPool.roaming.netCredits + p.byPool.roster.netCredits).toBeCloseTo(p.netCredits, 6);
    expect(p.hands).toBe(p.reportedDares);
    expect(p.playerWon).toBe(p.reportedDaresWon);
    expect(p.byPool.roaming.hands, 'the roaming pool is empty').toBeGreaterThan(0);
    expect(p.byPool.roster.hands, 'the roster pool is empty').toBeGreaterThan(0);
  }, 480_000);

  it("the ply-1 opening burden is the engine's own arithmetic, not a restated literal", () => {
    // §20.2's REPLACEMENT ANCHOR, pinned. `minOpeningQuantity(m) = m + 1` forces the
    // opener to claim strictly above their own count, and both house policies throw
    // on `bid === null`, so THE OPENER IS ALWAYS THE PLAYER. The minimum legal
    // opening claim is therefore true iff the other side holds at least one of the
    // claimed face among its `dicePerSide` dice — `probAtLeast(1, d)`.
    //
    // The comparison is computed from the engine's OWN `DARE_MAX_FACE` rather than
    // from a 1/6 written into this file, so a change to the dice model goes RED and
    // RE-OPENS LD-28 rather than silently voiding its anchor (LD-27's
    // `liarsDiceArchetypes.test.ts` pin is the precedent).
    const widths = [0, 1, 2, 3, 4, 5].map((tier) => dicePerSideForTier(tier));
    expect(new Set(widths)).toEqual(new Set([4, 5, 6]));

    const missChance = (DARE_MAX_FACE - 1) / DARE_MAX_FACE;
    for (const d of [4, 5, 6]) {
      expect(probAtLeast(1, d), `d=${d}`).toBeCloseTo(1 - missChance ** d, 12);
    }

    // MONOTONE IN `d`: a wider opposing hand makes the same minimum claim likelier
    // to be true, so the burden EASES up the ladder. This is the shape §20.3a's
    // measured offsets track (roaming -5.03 / -4.34 / -7.70 pp; roster -21.35 /
    // -19.57 / -19.84 pp against these three values).
    expect(probAtLeast(1, 4)).toBeLessThan(probAtLeast(1, 5));
    expect(probAtLeast(1, 5)).toBeLessThan(probAtLeast(1, 6));

    // THE LOAD-BEARING SIGN, and the reason a 62.5%-centred band was never
    // derivable from these rules: even the CHEAPEST legal opener is worse than a
    // coin flip for the side forced to make it. Asserted as a strict inequality on
    // a derived quantity — there is no tunable constant here to move.
    expect(probAtLeast(1, Math.min(...widths))).toBeGreaterThan(0.5);
    expect(1 - probAtLeast(1, Math.min(...widths))).toBeLessThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// T-223 · LD-30 — THE ROSTER SEAT'S PRICE.
//
// `docs/LIARS-DICE_REDESIGN.md` §22 / `docs/LIARS-DICE-DECISIONS.md` LD-30 ruled on
// F-220-1: the roster pool measures -200.8 cr/hand (n = 122,820) while the roaming
// pool measures +495.8 (n = 157,037), and nothing named or bounded the difference.
//
// THE RULING, in one line: the -200.8 is a property of the SEAT ELECTION, not a
// price the game charges. `planDare` elects the RICHEST candidate (§12.9 F-148-2,
// RULED and not this task's to move) and content authors the purse monotone in
// difficulty, so a bankroll-chasing policy sits opposite `optimal` on 77.82% of its
// roster hands. Re-weighted to the AUTHORED SEAT CENSUS — content's own weighting,
// with every cell's measured EV held fixed — the same pool reads +172.8 cr/hand.
//
// WHAT THIS FILE PINS, and why each is not a fitted bar:
//
//   1. THE CENSUS BOUND — the roster pool, weighted as CONTENT authors it, must not
//      be a credit sink. The weights come from `LIARS_DICE_OPPONENTS` itself (a
//      `'mixed'` row distributed across the concrete archetypes by its own `mix`,
//      which is what the engine does at open), so THERE IS NO LITERAL THRESHOLD IN
//      THE MECHANISM — the bar is zero, and zero is not -200.8 minus slack. This is
//      the standing invariant LD-30 adds.
//   2. THE MIX HEADROOM — LD-28's pooled `EV > 0` survives exactly while
//      `roster share < EV_roaming / (EV_roaming - EV_roster)`. Algebraically that
//      IS LD-28's invariant, restated in mix space; it is asserted here because the
//      HEADROOM is the quantity that says how much composition drift the promoted
//      invariant tolerates, and nothing reported it before.
//   3. THE ARCHETYPE ROLLUP IS LOSSLESS and non-empty at all three concrete
//      archetypes — so a later pooled roster figure published WITHOUT the archetype
//      cut goes red rather than repeating F-220-1's mistake.
//
// Sized as detectors, not knife edges, on the same memoised pass the T-220 describe
// uses (no fourth walk over 48 careers). IF ONE GOES RED, WIDEN THE SAMPLE — NEVER
// MOVE THE BAR (N4/N10, `docs/VERSIONING.md`).
// ---------------------------------------------------------------------------

/** LD-11's authored seat census, COMPUTED from the shipped table rather than
 *  restated: one unit of weight per row, and a `'mixed'` row split across the three
 *  concrete archetypes by its own `mix` — the same resolution the engine performs
 *  at open (§4.5 ruling 1). A content pass that re-authors the census moves these
 *  weights, which is the point: the bound is content's own, not this file's. */
function authoredSeatCensus(): Record<ConcreteArchetype, number> {
  const census: Record<ConcreteArchetype, number> = { optimal: 0, bad: 0, random: 0 };
  for (const rows of Object.values(LIARS_DICE_OPPONENTS)) {
    for (const row of rows) {
      if (row.archetype === 'mixed') {
        for (const archetype of CONCRETE_ARCHETYPES) {
          census[archetype] += (row.mix?.[archetype] ?? 0) / 100;
        }
      } else {
        census[row.archetype] += 1;
      }
    }
  }
  return census;
}

describe("T-223 · LD-30 — the roster seat's price", () => {
  it('the roster pool is NOT a sink under content`s OWN seat census', () => {
    const p = pooled();
    // Vacuity guard, in the shape the T-220 `it`s use.
    expect(p.hands, 'the widened seed set played no settled hands at all').toBeGreaterThan(2_000);
    expect(p.byPool.roster.hands, 'the roster pool is empty').toBeGreaterThan(500);

    const census = authoredSeatCensus();
    const weightTotal = CONCRETE_ARCHETYPES.reduce((total, a) => total + census[a], 0);
    expect(
      weightTotal,
      'the authored census is empty — content has no roster rows',
    ).toBeGreaterThan(0);

    let censusEv = 0;
    const detail: string[] = [];
    for (const archetype of CONCRETE_ARCHETYPES) {
      const cell = p.rosterByArchetype[archetype];
      // Every archetype must be REACHED, or the re-weighting would be silently
      // extrapolating a cell it never measured.
      expect(
        cell.hands,
        `roster|${archetype} was never played across ${WIDE_GAMBLER_SEEDS.length} careers — ` +
          `the census re-weighting cannot be computed without it`,
      ).toBeGreaterThan(0);
      const cellEv = cell.netCredits / cell.hands;
      censusEv += (census[archetype] / weightTotal) * cellEv;
      detail.push(
        `${archetype}: n=${cell.hands} EV=${cellEv.toFixed(1)} w=${(census[archetype] / weightTotal).toFixed(3)}`,
      );
    }
    const measuredEv = p.byPool.roster.netCredits / p.byPool.roster.hands;

    expect(
      censusEv,
      `the roster pool re-weighted to LD-11's AUTHORED seat census reads ` +
        `${censusEv.toFixed(1)} cr/hand over n = ${p.byPool.roster.hands} roster hands ` +
        `(as MEASURED, under the seat-picker's own mix, it reads ${measuredEv.toFixed(1)}). ` +
        `Cells: ${detail.join('; ')}. LD-30 requires the roster table, weighted as CONTENT ` +
        `AUTHORS IT, not to be a credit sink — the measured sink is the richest-candidate seat ` +
        `election (docs/LIARS-DICE-PROGRESSION_SPEC.md §12.9 F-148-2), not the table. The bar ` +
        `is ZERO and the weights are computed from LIARS_DICE_OPPONENTS, so there is no literal ` +
        `to move here. IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE THE BAR ` +
        `(N4/N10, docs/VERSIONING.md).`,
    ).toBeGreaterThan(0);
  }, 480_000);

  it('LD-28`s pooled EV invariant keeps HEADROOM against composition drift', () => {
    const p = pooled();
    expect(p.hands).toBeGreaterThan(2_000);
    const evRoaming = p.byPool.roaming.netCredits / p.byPool.roaming.hands;
    const evRoster = p.byPool.roster.netCredits / p.byPool.roster.hands;
    // The formula is only meaningful while the pools point in opposite directions
    // with roaming ahead; assert the premise rather than dividing blind.
    expect(
      evRoaming,
      `the pools no longer separate (roaming ${evRoaming.toFixed(1)}, roster ` +
        `${evRoster.toFixed(1)}) — LD-30's headroom reading has no referent and §22 must be ` +
        `re-derived rather than this bar relaxed`,
    ).toBeGreaterThan(evRoster);
    const breakEvenShare = evRoaming / (evRoaming - evRoster);
    const measuredShare = p.byPool.roster.hands / p.hands;
    expect(
      measuredShare,
      `roster share of all hands = ${(100 * measuredShare).toFixed(2)}% against a BREAK-EVEN ` +
        `share of ${(100 * breakEvenShare).toFixed(2)}% (roaming ${evRoaming.toFixed(1)} cr/hand ` +
        `over n = ${p.byPool.roaming.hands}, roster ${evRoster.toFixed(1)} over n = ` +
        `${p.byPool.roster.hands}). Past the break-even share the POOLED EV that LD-28 promoted ` +
        `goes negative. Both sides are DERIVED from the live rollups — there is no threshold ` +
        `here to move. IF THIS IS RED, WIDEN THE SAMPLE — NEVER MOVE THE BAR ` +
        `(N4/N10, docs/VERSIONING.md).`,
    ).toBeLessThan(breakEvenShare);
    // The two readings are the same statement; assert they cannot disagree, so a
    // future edit to either side is caught rather than absorbed.
    expect(p.netCredits / p.hands > 0).toBe(measuredShare < breakEvenShare);
  }, 480_000);

  it('the archetype rollup is LOSSLESS against the roster pool and reaches all three arms', () => {
    // F-220-1 was published as a POOLED roster figure and the pooled figure hid the
    // spread (`optimal` -482.3 against `random` +1,354.3 at the capstone). A later
    // roster number quoted without this cut reddens here.
    const p = pooled();
    const hands = CONCRETE_ARCHETYPES.reduce((t, a) => t + p.rosterByArchetype[a].hands, 0);
    const net = CONCRETE_ARCHETYPES.reduce((t, a) => t + p.rosterByArchetype[a].netCredits, 0);
    expect(hands).toBe(p.byPool.roster.hands);
    expect(net).toBeCloseTo(p.byPool.roster.netCredits, 6);
    for (const archetype of CONCRETE_ARCHETYPES) {
      expect(
        p.rosterByArchetype[archetype].hands,
        `roster|${archetype} is empty — the pool cut cannot be published without it`,
      ).toBeGreaterThan(0);
    }
    // …and `optimal` really is the MAJORITY seat under the shipped seat election,
    // which is the whole of §22.0 correction 3. Stated as "more than any other
    // single arm", never as a fitted percentage.
    expect(p.rosterByArchetype.optimal.hands).toBeGreaterThan(p.rosterByArchetype.bad.hands);
    expect(p.rosterByArchetype.optimal.hands).toBeGreaterThan(p.rosterByArchetype.random.hands);
  }, 480_000);
});
