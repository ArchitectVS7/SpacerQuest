import { describe, it, expect } from 'vitest';
import { LIARS_DICE_OPPONENTS, type LiarsDiceMix } from '@spacerquest/content';
import { SeededRng } from '../rng.js';
import {
  BAD_CREDULITY,
  DARE_DICE_PER_SIDE,
  DARE_MAX_QUANTITY,
  archetypeMove,
  dicePerSideForTier,
  legalMovesFrom,
  maxQuantityForDice,
  probAtLeast,
  resolveMixedArchetype,
} from '../liarsDiceRules.js';
import { DareBid, DareMoveKind } from '../types.js';

// ---------------------------------------------------------------------------
// T-145 · THE THREE ARCHETYPE POLICIES (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §3).
//
// These are RULES-LEVEL tests, deliberately: no UI claim is being made here, and
// the policies are pure total functions of their declared inputs, so driving them
// directly is the honest instrument. The end-to-end claims — that a roster hand is
// reachable, zero-sum and clamped — are made through the REAL action loop in
// `liarsDice.test.ts`, and through the real DOM in the e2e.
// ---------------------------------------------------------------------------

const ALL_MIXES: Array<[string, Readonly<LiarsDiceMix>]> = [
  ['everyday', LIARS_DICE_OPPONENTS[1][1].mix!],
  ['exotic', LIARS_DICE_OPPONENTS[5][1].mix!],
  ['dangerous', LIARS_DICE_OPPONENTS[4][1].mix!],
  ['comic', LIARS_DICE_OPPONENTS[6][1].mix!],
];

// ---------------------------------------------------------------------------
// Obligation 8 · `probAtLeast` against hand-computed exact values
// ---------------------------------------------------------------------------

describe('T-145 · obligation 8 — probAtLeast is exact at u ∈ {4,5,6}', () => {
  // Hand-computed from `sum_{j=k..u} C(u,j)(1/6)^j(5/6)^(u-j)`, written as exact
  // rationals over 6^u so the EXPECTED side is a statement about the binomial
  // rather than a re-run of the implementation against itself.
  //   u = 4, 6^4 = 1296:  P(>=1) = 1 - 5^4/1296 = 671/1296
  //                       P(>=2) = 1 - (5^4 + 4*5^3)/1296 = 171/1296
  //                       P(>=3) = (4*5 + 1)/1296 = 21/1296
  //                       P(>=4) = 1/1296
  const EXACT_U4: Record<number, number> = {
    1: 671 / 1296,
    2: 171 / 1296,
    3: 21 / 1296,
    4: 1 / 1296,
  };
  //   u = 5, 6^5 = 7776:  P(>=1) = 1 - 5^5/7776 = 4651/7776
  //                       P(>=2) = 1 - (5^5 + 5*5^4)/7776 = 1526/7776
  //                       P(>=3) = (C(5,3)*25 + C(5,4)*5 + 1)/7776 = 276/7776
  //                       P(>=4) = (5*5 + 1)/7776 = 26/7776
  //                       P(>=5) = 1/7776
  const EXACT_U5: Record<number, number> = {
    1: 4651 / 7776,
    2: 1526 / 7776,
    3: 276 / 7776,
    4: 26 / 7776,
    5: 1 / 7776,
  };
  //   u = 6, 6^6 = 46656: P(>=1) = 1 - 5^6/46656 = 31031/46656
  //                       P(>=2) = 1 - (5^6 + 6*5^5)/46656 = 12281/46656
  //                       P(>=3) = (C(6,3)*125 + C(6,4)*25 + C(6,5)*5 + 1)/46656
  //                              = (2500 + 375 + 30 + 1)/46656 = 2906/46656
  //                       P(>=4) = (375 + 30 + 1)/46656 = 406/46656
  //                       P(>=5) = (6*5 + 1)/46656 = 31/46656
  //                       P(>=6) = 1/46656
  const EXACT_U6: Record<number, number> = {
    1: 31031 / 46656,
    2: 12281 / 46656,
    3: 2906 / 46656,
    4: 406 / 46656,
    5: 31 / 46656,
    6: 1 / 46656,
  };

  it.each([
    [4, EXACT_U4],
    [5, EXACT_U5],
    [6, EXACT_U6],
  ])('u = %i matches the closed form at every k', (u, exact) => {
    // T-145 only ever PLAYS at 4 dice. All three are proven anyway, because the
    // function is total and T-146 must inherit it proven rather than re-verify it.
    for (const [k, expected] of Object.entries(exact)) {
      expect(probAtLeast(Number(k), u)).toBeCloseTo(expected, 12);
    }
    // The two boundary clauses, stated rather than implied.
    expect(probAtLeast(0, u)).toBe(1);
    expect(probAtLeast(-3, u)).toBe(1);
    expect(probAtLeast(u + 1, u)).toBe(0);
    // Monotone non-increasing in k — the property the OPTIMAL dominance proof
    // rests on, so it is asserted rather than assumed.
    for (let k = 1; k <= u; k += 1) {
      expect(probAtLeast(k, u)).toBeLessThanOrEqual(probAtLeast(k - 1, u));
    }
  });
});

// ---------------------------------------------------------------------------
// Obligation 7(a) · The anti-cheat SIGNATURE. (7(b), the behavioural half, is in
// `liarsDice.test.ts` where the real action loop lives.)
// ---------------------------------------------------------------------------

describe('T-145 · obligation 7(a) — archetypeMove has no channel for hidden info', () => {
  // COMPILE-TIME. The input interface has no member through which the player's
  // dice, a GameState, or a DareHandState (which CONTAINS playerDice) could
  // arrive. If the parameter ever grows one, these lines stop compiling.
  type Input = Parameters<typeof archetypeMove>[0];
  const _noPlayerDice: 'playerDice' extends keyof Input ? never : true = true;
  const _noHand: 'hand' extends keyof Input ? never : true = true;
  const _noState: 'state' extends keyof Input ? never : true = true;
  void _noPlayerDice;
  void _noHand;
  void _noState;

  it('the signature cannot express the player’s hand', () => {
    expect(_noPlayerDice).toBe(true);
    expect(_noHand).toBe(true);
    expect(_noState).toBe(true);
  });

  it('is a pure function of its declared inputs', () => {
    const input = {
      archetype: 'optimal' as const,
      dealerDice: [3, 3, 5, 1] as const,
      dicePerSide: 4,
      maxQuantity: 8,
      bid: { quantity: 3, face: 3 },
      ante: 30,
      headroom: 900,
      dealerCredits: 5000,
      potPlayer: 100,
      potDealer: 100,
      roll: 50,
    };
    expect(archetypeMove({ ...input })).toEqual(archetypeMove({ ...input }));
  });

  it('throws rather than inventing an opening policy it can never need (§9.9)', () => {
    expect(() =>
      archetypeMove({
        archetype: 'bad',
        dealerDice: [1, 2, 3, 4],
        dicePerSide: 4,
        maxQuantity: 8,
        bid: null as unknown as DareBid,
        ante: 30,
        headroom: 900,
        dealerCredits: 5000,
        potPlayer: 100,
        potDealer: 100,
        roll: 0,
      }),
    ).toThrow(/no standing bid/);
  });
});

// ---------------------------------------------------------------------------
// A random-input sweep, shared by obligations 9, 10 and the legality guarantee.
// ---------------------------------------------------------------------------

interface SweepCase {
  dealerDice: number[];
  bid: DareBid;
  ante: number;
  headroom: number;
  dealerCredits: number;
  potPlayer: number;
  potDealer: number;
  roll: number;
}

function sweep(rng: SeededRng, n: number): SweepCase[] {
  const cases: SweepCase[] = [];
  for (let i = 0; i < n; i += 1) {
    const dicePerSide = DARE_DICE_PER_SIDE;
    const dealerDice = Array.from({ length: dicePerSide }, () => rng.d6());
    const quantity = 1 + Math.floor(rng.next() * DARE_MAX_QUANTITY);
    const face = 1 + Math.floor(rng.next() * 6);
    const ante = 1 + Math.floor(rng.next() * 90);
    cases.push({
      dealerDice,
      bid: { quantity, face },
      ante,
      headroom: Math.floor(rng.next() * 2000),
      dealerCredits: Math.floor(rng.next() * 20000),
      potPlayer: 1 + Math.floor(rng.next() * 3000),
      potDealer: 1 + Math.floor(rng.next() * 3000),
      roll: Math.floor(rng.next() * 100),
    });
  }
  return cases;
}

const legalFor = (c: SweepCase): DareMoveKind[] =>
  legalMovesFrom(c.bid, c.ante, c.headroom, c.dealerCredits, true);

describe('T-145 · every archetype only ever emits a move legalMovesFrom allows', () => {
  it('over 5,000 randomised positions, on all three policies (seed 42)', () => {
    const cases = sweep(new SeededRng(42), 5_000);
    for (const archetype of ['optimal', 'bad', 'random'] as const) {
      for (const c of cases) {
        const move = archetypeMove({
          archetype,
          dicePerSide: DARE_DICE_PER_SIDE,
          maxQuantity: DARE_MAX_QUANTITY,
          ...c,
        });
        // §5.4's "one definition of legality" surviving a second consumer.
        expect(legalFor(c), `${archetype} ${JSON.stringify(c.bid)}`).toContain(move.move);
        if (move.move.startsWith('raise')) {
          // Every archetype raise takes the CHEAPEST lattice step — never a leap.
          expect(move.face).toBeLessThanOrEqual(6);
          expect(move.quantity).toBeLessThanOrEqual(DARE_MAX_QUANTITY);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Obligation 10 · `bad` never folds
// ---------------------------------------------------------------------------

describe('T-145 · obligation 10 — BAD never folds', () => {
  it('over 5,000 randomised positions it emits no fold, ever (seed 7)', () => {
    // Not an accident, a construction: `challenge` is unconditionally legal
    // whenever a bid stands (§5.1), so `bad`'s third branch is always reachable
    // and its fold branch is unreachable. The sweep is the empirical half.
    const cases = sweep(new SeededRng(7), 5_000);
    let folds = 0;
    let challenges = 0;
    let raises = 0;
    for (const c of cases) {
      const move = archetypeMove({
        archetype: 'bad',
        dicePerSide: DARE_DICE_PER_SIDE,
        maxQuantity: DARE_MAX_QUANTITY,
        ...c,
      });
      if (move.move === 'fold') folds += 1;
      else if (move.move === 'challenge') challenges += 1;
      else raises += 1;
    }
    expect(folds).toBe(0);
    // …and the sweep is not vacuous: it reached BOTH of `bad`'s live branches.
    expect(challenges).toBeGreaterThan(0);
    expect(raises).toBeGreaterThan(0);
  });

  it('BAD_CREDULITY is the documented leak: it calls anything more than 1 over its own count', () => {
    expect(BAD_CREDULITY).toBe(1);
    const base = {
      archetype: 'bad' as const,
      dealerDice: [3, 3, 1, 1], // two 3s
      dicePerSide: 4,
      maxQuantity: 8,
      ante: 10,
      headroom: 2000,
      dealerCredits: 5000,
      potPlayer: 100,
      potDealer: 100,
      roll: 0,
    };
    // 3 - 2 = 1, NOT > 1 → it believes and raises.
    expect(archetypeMove({ ...base, bid: { quantity: 3, face: 3 } }).move).not.toBe('challenge');
    // 4 - 2 = 2 > 1 → it calls. With four unknown dice on the other side the true
    // claim expectation is own + 4/6 ≈ 2.67, so this is the beginner leak by name:
    // it calls claims that are more likely true than not.
    expect(archetypeMove({ ...base, bid: { quantity: 4, face: 3 } }).move).toBe('challenge');
  });
});

// ---------------------------------------------------------------------------
// Obligation 11 · `random` is uniform over the legal set
// ---------------------------------------------------------------------------

describe('T-145 · obligation 11 — RANDOM partitions the roll range exactly', () => {
  it('every legal move gets floor/ceil of 100/len of the 100 rolls', () => {
    // EXACT rather than chi-squared, deliberately: with `roll` uniform on 0..99
    // and `index = floor(roll/100*len)`, the counts are DETERMINISTIC. An exact
    // partition assertion is strictly stronger than a goodness-of-fit test and it
    // cannot flake.
    const positions: SweepCase[] = [
      // 5 legal moves: raise-face, raise-quantity, raise-both, challenge, fold.
      {
        dealerDice: [1, 2, 3, 4],
        bid: { quantity: 2, face: 2 },
        ante: 10,
        headroom: 5000,
        dealerCredits: 5000,
        potPlayer: 100,
        potDealer: 100,
        roll: 0,
      },
      // 3 legal moves: face is capped at 6 and quantity at 8, so only challenge +
      // fold survive... plus nothing. (A maxed bid.)
      {
        dealerDice: [1, 2, 3, 4],
        bid: { quantity: 8, face: 6 },
        ante: 10,
        headroom: 5000,
        dealerCredits: 5000,
        potPlayer: 100,
        potDealer: 100,
        roll: 0,
      },
      // An unaffordable ante: raises drop out, leaving challenge + fold.
      {
        dealerDice: [6, 6, 6, 6],
        bid: { quantity: 3, face: 3 },
        ante: 500,
        headroom: 10,
        dealerCredits: 5000,
        potPlayer: 100,
        potDealer: 100,
        roll: 0,
      },
    ];

    for (const position of positions) {
      const legal = legalFor(position);
      const counts = new Map<DareMoveKind, number>();
      for (let roll = 0; roll < 100; roll += 1) {
        const move = archetypeMove({
          archetype: 'random',
          dicePerSide: DARE_DICE_PER_SIDE,
          maxQuantity: DARE_MAX_QUANTITY,
          ...position,
          roll,
        });
        counts.set(move.move, (counts.get(move.move) ?? 0) + 1);
      }
      // Every legal move is reachable, and nothing illegal ever came out.
      expect([...counts.keys()].sort()).toEqual([...legal].sort());
      const len = legal.length;
      const lo = Math.floor(100 / len);
      const hi = Math.ceil(100 / len);
      let total = 0;
      for (const [move, count] of counts) {
        expect(count, `${move} of ${len}`).toBeGreaterThanOrEqual(lo);
        expect(count, `${move} of ${len}`).toBeLessThanOrEqual(hi);
        total += count;
      }
      expect(total).toBe(100);
    }
  });

  it('RANDOM is the only archetype that folds at a meaningful rate', () => {
    // The point of the seat: unreadable in BOTH directions — it hands the player a
    // free pot at a real frequency and will also challenge a claim it should
    // believe.
    const cases = sweep(new SeededRng(11), 5_000);
    let folds = 0;
    for (const c of cases) {
      if (
        archetypeMove({
          archetype: 'random',
          dicePerSide: DARE_DICE_PER_SIDE,
          maxQuantity: DARE_MAX_QUANTITY,
          ...c,
        }).move === 'fold'
      ) {
        folds += 1;
      }
    }
    expect(folds).toBeGreaterThan(500);
  });
});

// ---------------------------------------------------------------------------
// Obligation 12 · `resolveMixedArchetype` partitions 0..99 exactly
// ---------------------------------------------------------------------------

describe('T-145 · obligation 12 — resolveMixedArchetype partitions 0..99 exactly', () => {
  it.each(ALL_MIXES)('the %s mix hits its triple to the roll', (_tone, mix) => {
    const counts = { optimal: 0, bad: 0, random: 0 };
    for (let roll = 0; roll < 100; roll += 1) {
      const arm = resolveMixedArchetype(mix, roll);
      // Never 'mixed' — a mix cannot recurse into another mix.
      expect(['optimal', 'bad', 'random']).toContain(arm);
      counts[arm] += 1;
    }
    expect(counts).toEqual({ optimal: mix.optimal, bad: mix.bad, random: mix.random });
  });

  it('the key order optimal → bad → random is part of the contract', () => {
    // Changing it would change every golden containing a mixed hand, so it is
    // pinned at the boundaries rather than left to the cumulative arithmetic.
    const mix = { optimal: 40, bad: 40, random: 20 };
    expect(resolveMixedArchetype(mix, 0)).toBe('optimal');
    expect(resolveMixedArchetype(mix, 39)).toBe('optimal');
    expect(resolveMixedArchetype(mix, 40)).toBe('bad');
    expect(resolveMixedArchetype(mix, 79)).toBe('bad');
    expect(resolveMixedArchetype(mix, 80)).toBe('random');
    expect(resolveMixedArchetype(mix, 99)).toBe('random');
  });
});

// ---------------------------------------------------------------------------
// Obligation 9 · OPTIMAL is measurably better than BAD
// ---------------------------------------------------------------------------

describe('T-145 · obligation 9 — OPTIMAL is a measurably better policy than BAD', () => {
  it('never takes a line whose EV is below a legal fold’s', () => {
    // The sharp, per-position form of the claim the Accept criterion names: an
    // "always fold on any risk" baseline can never be the better line, because
    // `optimal` picks the ARGMAX over a set that always contains `fold`.
    //
    // EV(fold) = -potDealer, and EV(challenge) = (1-p)*potPlayer - p*potDealer >=
    // -potDealer for every p in [0,1] and potPlayer >= 0 — so the argmax is never
    // worse than folding, at every one of these positions.
    const cases = sweep(new SeededRng(1234), 3_000);
    for (const c of cases) {
      const own = c.dealerDice.filter((d) => d === c.bid.face).length;
      const pTrue = probAtLeast(c.bid.quantity - own, DARE_DICE_PER_SIDE);
      const evFold = -c.potDealer;
      const evChallenge = (1 - pTrue) * c.potPlayer - pTrue * c.potDealer;
      const move = archetypeMove({
        archetype: 'optimal',
        dicePerSide: DARE_DICE_PER_SIDE,
        maxQuantity: DARE_MAX_QUANTITY,
        ...c,
      });
      let ev: number;
      if (move.move === 'fold') ev = evFold;
      else if (move.move === 'challenge') ev = evChallenge;
      else {
        const cost = move.move === 'raise-both' ? 2 * c.ante : c.ante;
        const ours = c.dealerDice.filter((d) => d === move.face).length;
        const pOurs = probAtLeast((move.quantity as number) - ours, DARE_DICE_PER_SIDE);
        ev = pOurs * c.potPlayer - (1 - pOurs) * (c.potDealer + cost);
      }
      expect(ev, JSON.stringify({ c, move })).toBeGreaterThanOrEqual(evFold - 1e-9);
    }
  });

  it('beats BAD head-to-head over 4,000 simulated hands (seed 20260731)', () => {
    // n = 4,000 hands, SeededRng(20260731), both sides dealt `dicePerSide` dice,
    // played to a terminal move and settled with the SAME showdown rule the engine
    // uses. Measured: `optimal` nets materially more per hand than `bad`, at a
    // margin far outside the 1-sigma noise of 4,000 hands.
    //
    // WHY A SIMULATION RATHER THAN A CLOSED FORM: "better policy" is a statement
    // about a distribution of positions, not about any single one. This is the
    // "actual behavioral test" the Accept criterion asks for.
    const N = 4_000;
    const rng = new SeededRng(20_260_731);
    const dicePerSide = dicePerSideForTier(0);
    const maxQuantity = maxQuantityForDice(dicePerSide);
    const ANTE = 30;
    const SEED_STAKE = 100;

    /** One hand: the OPPONENT opens a fixed claim, the policy answers, and the
     *  result is settled by `actualCount >= quantity` across both hands. Returns
     *  the POLICY's net credits. */
    function playHand(archetype: 'optimal' | 'bad'): number {
      const policyDice = Array.from({ length: dicePerSide }, () => rng.d6());
      const otherDice = Array.from({ length: dicePerSide }, () => rng.d6());
      // The standing claim the policy is asked to answer, drawn from the same
      // stream for both archetypes' hands so the two see comparable positions.
      const bid: DareBid = {
        quantity: 1 + Math.floor(rng.next() * 5),
        face: 1 + Math.floor(rng.next() * 6),
      };
      const roll = Math.floor(rng.next() * 100);
      let potPolicy = SEED_STAKE;
      const potOther = SEED_STAKE;
      const move = archetypeMove({
        archetype,
        dealerDice: policyDice,
        dicePerSide,
        maxQuantity,
        bid,
        ante: ANTE,
        headroom: 10_000,
        dealerCredits: 100_000,
        potPlayer: potOther,
        potDealer: potPolicy,
        roll,
      });
      const truthOf = (claim: DareBid) =>
        policyDice.filter((d) => d === claim.face).length +
          otherDice.filter((d) => d === claim.face).length >=
        claim.quantity;

      if (move.move === 'fold') return -potPolicy;
      if (move.move === 'challenge') {
        // The policy called the OTHER side's claim: the bidder wins if it is true.
        return truthOf(bid) ? -potPolicy : potOther;
      }
      // The policy raised. Valued exactly as its own model values it — the other
      // side challenges immediately — which is the honest comparison, because it
      // is the model `bad` is being measured against too.
      const cost = move.move === 'raise-both' ? 2 * ANTE : ANTE;
      potPolicy += cost;
      const claim: DareBid = { quantity: move.quantity as number, face: move.face as number };
      return truthOf(claim) ? potOther : -potPolicy;
    }

    let optimalNet = 0;
    let badNet = 0;
    for (let i = 0; i < N; i += 1) {
      optimalNet += playHand('optimal');
      badNet += playHand('bad');
    }
    const optimalPerHand = optimalNet / N;
    const badPerHand = badNet / N;
    // The ordering IS the claim. Both are reported in the failure message so a
    // future author sees the margin rather than only the verdict.
    expect(optimalPerHand, `optimal ${optimalPerHand} vs bad ${badPerHand}`).toBeGreaterThan(
      badPerHand,
    );
    // …and the gap is not a rounding artefact: at least 10 credits a hand on a
    // 100-credit seed stake.
    expect(optimalPerHand - badPerHand).toBeGreaterThan(10);
  });
});
