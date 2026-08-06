import { describe, expect, it } from 'vitest';

import { Stat } from '@spacerquest/content';
import {
  DARE_AI_CHALLENGE_MARGIN,
  DayPhase,
  applyPlayerAction,
  createInitialState,
  probAtLeast,
  resetDailyHangoutCaps,
  type DawnHand,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

import {
  dareChallengeCellKey,
  dareChallengeSplitKey,
  dareKBucket,
  isEvidenceBackedChallenge,
  planDareMove,
  readDareChallenge,
  runCampaign,
  zeroDareChallengeCells,
  zeroDareChallengeSplit,
  type DareChallengeCellKey,
  type DareChallengeCellStats,
  type DareChallenger,
} from '../index.js';

// ---------------------------------------------------------------------------
// T-176 · THE CHALLENGER-WON SPLIT AT MATCHED EVIDENCE (F-160-2),
// `HangoutPlayStats.dareChallengeCells` / `dareChallengeSplit`.
// Derivation and criterion: `docs/LIARS-DICE_REDESIGN.md` §18.
//
// WHY THIS FILE EXISTS. T-160's criterion C3 asked the two challenger rows to sit
// within 20 pp and neither shape met it; §18 re-derives the criterion as C3', which
// compares the two sides AT MATCHED EVIDENCE and prices the composition difference
// the original bar never did. That comparison ships on the INSTRUMENT (T-173
// retired the gitignored-probe lineage), and an instrument nobody checks is a probe
// with extra steps.
//
// FOUR PROPERTIES, in the order they matter:
//   1. THE CLASSIFIER IS RIGHT ABOUT REAL HANDS. `readDareChallenge` is checked
//      against a reference derivation written from the DICE — not from `outcome` —
//      over hands driven through the REAL engine loop. Two derivations of one fact
//      that agree is the fidelity channel; one derivation used twice is neither.
//   2. IT NEVER DISAGREES WITH ITSELF IN PLAY. `dareChallengeDisagreements` is 0 on
//      every career. A non-zero is a FINDING TO FILE, not a tolerance.
//   3. EVERY KEY IS PRESENT. T-173's `movesByReason` rule: a missing key and a zero
//      must not be the same reading. 108 cells and 16 rollup cells.
//   4. C3'(c) IS LIVE. The floor §18.2 pre-commits — a side's EVIDENCE-BACKED
//      challenges must beat a coin flip — is asserted here rather than only
//      reported once in a write-up, so a later rule change that re-breaks it is red
//      rather than silent.
//
// This file lives in `__tests__`, which is in `HASHED_ROOT_IGNORED_DIRECTORIES`,
// so nothing here can move a fingerprint.
// ---------------------------------------------------------------------------

/** The gambler is the ONLY policy that plans a Dare (`planDare` has one call site). */
const GAMBLER_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
/** C3'(c)'s detector is a POOLED rate, so it gets its own WIDER seed set: at eight
 *  seeds the player's evidence-backed cell holds n = 136, which is thin for a
 *  50%-floor assertion. The sample was widened rather than the guard lowered
 *  (N4/N10, and T-175's third arm is the precedent). */
const WIDE_GAMBLER_SEEDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
] as const;
const DAYS = 120;

const DEALER = 'npc-iron-vex'; // cast index 0 — starts co-located at Sol-3 (id 1).
const SOL_3 = 1;

function sum(
  cells: Record<string, DareChallengeCellStats>,
  of: keyof DareChallengeCellStats,
  where: (key: string) => boolean = () => true,
): number {
  return Object.entries(cells).reduce(
    (total, [key, cell]) => (where(key) ? total + cell[of] : total),
    0,
  );
}

// ---------------------------------------------------------------------------
// A REAL HAND, DRIVEN THROUGH THE REAL LOOP.
//
// Every state transition below comes from a RETURNED state and every event from
// `applyPlayerAction`'s own output. `state.dareHand` is never written by hand: the
// point of the exercise is to check the classifier against streams the engine
// actually emits, and a hand-built hand would prove only that the test can build
// one.
// ---------------------------------------------------------------------------

function hangoutState(seed: number): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = SOL_3;
  state.player.stats[Stat.GUILE] = 0;
  state.player.credits = 200_000;
  const dice = [10, 10, 10, 10, 10];
  state.player.dawnHand = {
    dice: [...dice],
    spent: new Array<boolean>(dice.length).fill(false),
  } satisfies DawnHand;
  const dealer = state.npcs.find((npc) => npc.id === DEALER)!;
  dealer.currentSystemId = SOL_3;
  dealer.credits = 200_000;
  dealer.disposition = 0;
  return state;
}

/** Play `hands` complete Liar's Dice hands with the SHIPPED planner and return the
 *  raw event stream. The planner is asked for one move at a time against the LIVE
 *  state, which is exactly `runCampaign`'s own continuation loop. */
function playHands(seed: number, hands: number): GameEvent[] {
  let state = hangoutState(seed);
  const stream: GameEvent[] = [];
  for (let hand = 0; hand < hands; hand += 1) {
    // The day advances between hands because `dareHand.id` is
    // `dare-<day>-<dealer>-<dayEventCount>` — parking many hands on one day would
    // collide their `handId`s and silently join the wrong bids to the wrong
    // settlement, which is exactly the class of bug this file is here to catch.
    state.day += 1;
    state.dayEventCount = 0;
    const opened = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId: DEALER,
      wager: 100,
    });
    state = opened.state;
    stream.push(...opened.events);
    // The bid lattice bounds a hand; the tripwire mirrors the sim's own
    // DARE_MAX_MOVES_PER_HAND and must never be the thing that ends a hand.
    let moves = 0;
    while (state.dareHand && moves < 32) {
      const move = planDareMove(state);
      if (!move) break;
      const applied = applyPlayerAction(state, move);
      state = applied.state;
      stream.push(...applied.events);
      moves += 1;
    }
    expect(moves, `hand ${hand} of seed ${seed} hit the move tripwire`).toBeLessThan(32);
    // The player's dawn hand and the purses are refreshed so the next hand opens.
    state.player.dawnHand = {
      dice: [10, 10, 10, 10, 10],
      spent: [false, false, false, false, false],
    } satisfies DawnHand;
    state.player.credits = 200_000;
    // ...and LD-23's rounds-per-day cap is released the same way dawn releases it
    // (`resetDailyHangoutCaps` at `day.ts`'s chokepoint), so the loop plays many
    // hands without having to simulate the days between them.
    resetDailyHangoutCaps(state.player);
    const dealer = state.npcs.find((npc) => npc.id === DEALER)!;
    dealer.credits = 200_000;
    dealer.currentSystemId = SOL_3;
  }
  return stream;
}

/** THE REFERENCE DERIVATION, written from the DICE and from the bid stream, with
 *  no reference to `outcome` and no call into the instrument. This is the thing
 *  `readDareChallenge` is checked against. */
interface ReferenceReading {
  handId: string;
  challenger: DareChallenger;
  challengerWon: boolean;
  actualCount: number;
  k: number;
  dicePerSide: number;
}

function referenceReadings(stream: GameEvent[]): ReferenceReading[] {
  const lastBidder = new Map<string, DareChallenger>();
  const out: ReferenceReading[] = [];
  for (const event of stream) {
    if (event.type === 'DareBidPlaced') {
      lastBidder.set(event.handId, event.actor);
    } else if (event.type === 'DareHandResolved') {
      if (event.dealerDice === undefined || event.bid === null) continue;
      const bidder = lastBidder.get(event.handId)!;
      const challenger: DareChallenger = bidder === 'player' ? 'dealer' : 'player';
      const own = challenger === 'player' ? event.playerDice : event.dealerDice;
      const other = challenger === 'player' ? event.dealerDice : event.playerDice;
      const count = (dice: readonly number[]) =>
        dice.filter((die) => die === event.bid!.face).length;
      // THE SHOWDOWN, RE-DERIVED FROM THE DICE. `resolveChallenge` makes the bidder
      // win iff the claim holds across BOTH hands; the challenger wins iff it does
      // not. Nothing here reads `outcome`.
      const actualCount = count(event.playerDice) + count(event.dealerDice);
      out.push({
        handId: event.handId,
        challenger,
        challengerWon: actualCount < event.bid.quantity,
        actualCount,
        k: event.bid.quantity - count(own),
        dicePerSide: other.length,
      });
    }
  }
  return out;
}

describe('T-176 · readDareChallenge against real hands the engine emitted', () => {
  const stream = playHands(20260806, 220);
  const reference = referenceReadings(stream);
  const lastBidder = new Map<string, DareChallenger>();
  const shipped = new Map<string, ReturnType<typeof readDareChallenge>>();
  for (const event of stream) {
    if (event.type === 'DareBidPlaced') lastBidder.set(event.handId, event.actor);
    else if (event.type === 'DareHandResolved') {
      shipped.set(event.handId, readDareChallenge(event, lastBidder.get(event.handId)));
    }
  }

  it('produced a non-trivial population, settled by challenge in BOTH directions', () => {
    expect(reference.length).toBeGreaterThan(50);
    const byChallenger = { player: 0, dealer: 0 };
    for (const row of reference) byChallenger[row.challenger] += 1;
    // If either direction were absent the identity checks below would be vacuous
    // for it, and the whole split would be untested on one of its two rows.
    expect(byChallenger.player, JSON.stringify(byChallenger)).toBeGreaterThan(0);
    expect(byChallenger.dealer, JSON.stringify(byChallenger)).toBeGreaterThan(0);
  });

  it('agrees with the dice-derived reference on challenger, winner, k and arity', () => {
    for (const row of reference) {
      const read = shipped.get(row.handId);
      expect(read, row.handId).toBeDefined();
      expect(read!.kind, row.handId).toBe('challenge');
      if (read!.kind !== 'challenge') continue;
      expect(read!.challenger, row.handId).toBe(row.challenger);
      // The instrument reads the winner off `outcome`; the reference counts the
      // dice. Two derivations of the same fact.
      expect(read!.challengerWon, `${row.handId} winner`).toBe(row.challengerWon);
      expect(read!.claimFalse, `${row.handId} claimFalse`).toBe(row.challengerWon);
      expect(read!.k, `${row.handId} k`).toBe(row.k);
      expect(read!.dicePerSide, `${row.handId} arity`).toBe(row.dicePerSide);
      expect(read!.wellFormed, `${row.handId} wellFormed`).toBe(true);
    }
  });

  it("the ENGINE's actualCount agrees with the reference count across both hands", () => {
    // A third channel on the same population: `DareHandResolved.actualCount` is
    // written by `resolveChallenge`, and the reference recounts it off the two
    // revealed hands. A disagreement would mean the reveal and the arithmetic have
    // drifted apart, which would silently corrupt every `k` above.
    const counts = new Map<string, number>();
    for (const event of stream) {
      if (event.type === 'DareHandResolved' && event.actualCount !== undefined) {
        counts.set(event.handId, event.actualCount);
      }
    }
    for (const row of reference) {
      expect(counts.get(row.handId), row.handId).toBe(row.actualCount);
    }
  });

  it('classifies a folded hand as not-a-challenge rather than as a join miss', () => {
    // Folds are the common non-challenge outcome and they reveal nothing (§6.1),
    // so a classifier that treated the absent `dealerDice` as a miss would report a
    // disagreement on every one of them.
    const folded = stream.filter(
      (event): event is Extract<GameEvent, { type: 'DareHandResolved' }> =>
        event.type === 'DareHandResolved' && event.dealerDice === undefined,
    );
    expect(folded.length).toBeGreaterThan(0);
    for (const event of folded) {
      expect(readDareChallenge(event, lastBidder.get(event.handId)).kind).toBe('not-a-challenge');
    }
  });

  it('reports a join miss when the last bidder is unknown, instead of guessing', () => {
    const settled = stream.find(
      (event): event is Extract<GameEvent, { type: 'DareHandResolved' }> =>
        event.type === 'DareHandResolved' && event.dealerDice !== undefined,
    )!;
    expect(readDareChallenge(settled, undefined).kind).toBe('join-miss');
  });
});

describe('T-176 · the k axis and the evidence classifier', () => {
  it('buckets k with both clamps explicit', () => {
    expect(dareKBucket(-3)).toBe(0);
    expect(dareKBucket(0)).toBe(0);
    expect(dareKBucket(1)).toBe(1);
    expect(dareKBucket(7)).toBe(7);
    expect(dareKBucket(8)).toBe(8);
    expect(dareKBucket(12)).toBe(8);
  });

  it("the evidence classifier is the ENGINE's margin and lands on k >= 3 at every arity", () => {
    // §18.2's claim, executed rather than asserted in prose: this is why `w`,
    // `p_backed` and `p_unbacked` are pure summation over the shipped cells.
    for (const dicePerSide of [4, 5, 6]) {
      for (let k = -2; k <= 8; k += 1) {
        expect(isEvidenceBackedChallenge(k, dicePerSide), `k=${k} d=${dicePerSide}`).toBe(k >= 3);
      }
      // ...and it really is the constant, not a 3 hardcoded next to it.
      expect(
        isEvidenceBackedChallenge(DARE_AI_CHALLENGE_MARGIN + dicePerSide / 6, dicePerSide),
      ).toBe(false);
      expect(
        isEvidenceBackedChallenge(DARE_AI_CHALLENGE_MARGIN + dicePerSide / 6 + 0.001, dicePerSide),
      ).toBe(true);
    }
  });

  it('the analytic prior the criterion is derived from is the engine`s own', () => {
    // §18.2 derives C3'(c)'s bar from `1 - probAtLeast(3, 6) = 93.77%` — the
    // WEAKEST evidence-backed cell. If the engine's Binomial ever moves, this is
    // the line that says the derivation moved with it.
    expect(1 - probAtLeast(3, 6)).toBeCloseTo(0.9377, 4);
    expect(1 - probAtLeast(3, 4)).toBeGreaterThan(0.9377);
    expect(1 - probAtLeast(3, 5)).toBeGreaterThan(0.9377);
  });

  it('the key spellings are the only ones, and the zero-fills use them', () => {
    expect(dareChallengeCellKey('roster', 'dealer', 6, 3)).toBe('roster|dealer|d6|k3');
    expect(dareChallengeCellKey('roaming', 'player', 4, 0)).toBe('roaming|player|d4|k0');
    expect(dareChallengeSplitKey('roster', 'optimal', 'dealer')).toBe('roster|optimal|dealer');
    expect(zeroDareChallengeCells()[dareChallengeCellKey('roaming', 'dealer', 5, 8)]).toEqual({
      challenges: 0,
      won: 0,
    });
    expect(zeroDareChallengeSplit()[dareChallengeSplitKey('roaming', 'none', 'player')]).toEqual({
      challenges: 0,
      won: 0,
    });
  });
});

describe('T-176 · the cells on a real career', () => {
  it('every cell is present and zero-filled on a career that never dares', () => {
    const { hangoutPlay } = runCampaign(1, 40, 'explorer');
    expect(hangoutPlay.dares).toBe(0);
    // 2 pools × 2 challengers × 3 arities × 9 k-buckets.
    expect(Object.keys(hangoutPlay.dareChallengeCells)).toHaveLength(108);
    expect(new Set(Object.keys(hangoutPlay.dareChallengeCells))).toEqual(
      new Set(Object.keys(zeroDareChallengeCells())),
    );
    // 2 pools × 4 archetype slots × 2 challengers.
    expect(Object.keys(hangoutPlay.dareChallengeSplit)).toHaveLength(16);
    expect(new Set(Object.keys(hangoutPlay.dareChallengeSplit))).toEqual(
      new Set(Object.keys(zeroDareChallengeSplit())),
    );
    for (const cell of [
      ...Object.values(hangoutPlay.dareChallengeCells),
      ...Object.values(hangoutPlay.dareChallengeSplit),
    ]) {
      expect(cell).toEqual({ challenges: 0, won: 0 });
    }
  });

  it.each(GAMBLER_SEEDS)(
    'gambler seed %i: ZERO challenge disagreements, and the two cuts agree',
    (seed) => {
      const { hangoutPlay } = runCampaign(seed, DAYS, 'gambler');
      expect(hangoutPlay.dares).toBeGreaterThan(0);
      expect(
        hangoutPlay.dareChallengeDisagreements,
        `${hangoutPlay.dareChallengeDisagreements} settled challenges failed one of the three ` +
          `structural checks (the two-derivation identity, the join, the arity). That is a bug ` +
          `in the instrument or in the event stream — FILE IT, do not widen a tolerance.`,
      ).toBe(0);

      const cellTotal = sum(hangoutPlay.dareChallengeCells, 'challenges');
      const splitTotal = sum(hangoutPlay.dareChallengeSplit, 'challenges');
      // The two tables are folded from the same events through DIFFERENT key
      // functions and different zero-fills, so a key-derivation bug in either shows
      // up here as a mismatch.
      expect(cellTotal).toBe(splitTotal);
      expect(sum(hangoutPlay.dareChallengeCells, 'won')).toBe(
        sum(hangoutPlay.dareChallengeSplit, 'won'),
      );
      // Challenges are a SUBSET of settled hands (the rest folded), and the subset
      // is non-empty on a career that plays this many hands.
      expect(cellTotal).toBeGreaterThan(0);
      expect(cellTotal).toBeLessThanOrEqual(hangoutPlay.dares);
      expect(sum(hangoutPlay.dareChallengeCells, 'won')).toBeLessThanOrEqual(cellTotal);

      // ...and the POOL marginal agrees with T-175's independently-keyed cells.
      for (const pool of ['roaming', 'roster'] as const) {
        const challengesInPool = sum(hangoutPlay.dareChallengeCells, 'challenges', (key) =>
          key.startsWith(`${pool}|`),
        );
        const handsInPool = Object.entries(hangoutPlay.dareCells).reduce(
          (total, [key, cell]) => (key.startsWith(`${pool}|`) ? total + cell.hands : total),
          0,
        );
        expect(challengesInPool, pool).toBeLessThanOrEqual(handsInPool);
      }
    },
    240_000,
  );

  it('is policy-sensitive: the gambler populates cells the explorer leaves at zero', () => {
    const gambler = runCampaign(1, DAYS, 'gambler').hangoutPlay;
    const explorer = runCampaign(1, DAYS, 'explorer').hangoutPlay;
    const populated = (cells: Record<DareChallengeCellKey, DareChallengeCellStats>) =>
      Object.values(cells).filter((cell) => cell.challenges > 0).length;
    expect(populated(gambler.dareChallengeCells)).toBeGreaterThan(0);
    expect(populated(explorer.dareChallengeCells)).toBe(0);
  }, 240_000);
});

describe("T-176 · C3'(c) as a LIVE assertion (F-160-2, §18.2)", () => {
  it('neither side`s EVIDENCE-BACKED challenges are a coin-flip loser', () => {
    // THE PRE-COMMITTED FLOOR. At an evidence-backed cell the shared model puts the
    // claim's falsity at >= 93.77%, and BOTH margins' docblocks derive 1.5 from
    // "more likely false than true". A side whose own evidence bar does not clear a
    // coin flip has a bar mis-set for its actual counterparty.
    //
    // SIZED AS A DETECTOR, NOT A KNIFE EDGE: pooled over every gambler seed, with
    // both rates, both `n` and the SE in the failure message. If it ever goes red,
    // WIDEN THE SAMPLE — never move the bar (N4/N10, `docs/VERSIONING.md`).
    const backed: Record<DareChallenger, { challenges: number; won: number }> = {
      player: { challenges: 0, won: 0 },
      dealer: { challenges: 0, won: 0 },
    };
    for (const seed of WIDE_GAMBLER_SEEDS) {
      const { dareChallengeCells } = runCampaign(seed, DAYS, 'gambler').hangoutPlay;
      for (const [key, cell] of Object.entries(dareChallengeCells) as [
        DareChallengeCellKey,
        DareChallengeCellStats,
      ][]) {
        const [, challenger, dice, kBucket] = key.split('|');
        const k = Number(kBucket.slice(1));
        if (!isEvidenceBackedChallenge(k, Number(dice.slice(1)))) continue;
        const side = backed[challenger as DareChallenger];
        side.challenges += cell.challenges;
        side.won += cell.won;
      }
    }
    for (const challenger of ['player', 'dealer'] as const) {
      const { challenges, won } = backed[challenger];
      // A side with no evidence-backed challenges at all would make the assertion
      // vacuous, which is itself worth failing on.
      expect(challenges, `${challenger} played no evidence-backed challenges`).toBeGreaterThan(200);
      const rate = won / challenges;
      const se = Math.sqrt((rate * (1 - rate)) / challenges);
      expect(
        rate,
        `${challenger}-as-challenger won ${(100 * rate).toFixed(2)}% of its EVIDENCE-BACKED ` +
          `challenges (n=${challenges}, SE ${(100 * se).toFixed(2)} pp). C3'(c) requires > 50%: ` +
          `at these cells the shared model puts the claim's falsity at >= 93.77%.`,
      ).toBeGreaterThan(0.5);
    }
  }, 480_000);
});
