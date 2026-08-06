import { describe, it, expect } from 'vitest';
import {
  DARE_ANTE_BAND_FRACTION,
  DARE_FOLD_DISPOSITION,
  DARE_LOSS_DISPOSITION,
  DARE_PEEK_DC,
  DARE_WIN_DISPOSITION,
  LIARS_DICE_OPPONENTS,
  Stat,
} from '@spacerquest/content';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import { resetDailyHangoutCaps, venueParamsFor, wagerBandFor } from '../hangoutRules.js';
import {
  DARE_DICE_PER_SIDE,
  DARE_MAX_QUANTITY,
  anteFor,
  dealerMove,
  dicePerSideForTier,
  headroomFor,
  legalDareMoves,
  isLatticeMove,
  legalMovesFrom,
  maxQuantityForDice,
  minOpeningQuantity,
  probAtLeast,
  resolveChallenge,
  seedLiarsDicePurses,
} from '../liarsDiceRules.js';
import { CURRENT_SAVE_VERSION, MIGRATIONS, createSave, loadSave } from '../save.js';
import { DareOutcome, DawnHand, DayPhase, GameEvent, GameState, PlayerAction } from '../types.js';

// ---------------------------------------------------------------------------
// T-135 · LIAR'S DICE (owner ruling D2, docs/LIARS-DICE_REDESIGN.md).
//
// EVERY hand in this file is driven through the REAL loop —
// `applyPlayerAction(VisitHangout{venue:'dare'})` to open, then
// `applyPlayerAction(Dare{…})` per move — and every state transition comes from a
// RETURNED state. `state.dareHand` is written by hand in exactly one place: the
// dealer-blindness test, which has to VARY HIDDEN INFORMATION to prove the dealer
// cannot read it. That is setting up the experiment, not driving the scene.
// ---------------------------------------------------------------------------

/**
 * T-160 · A LEGAL OPENING CLAIM on `face`, DERIVED FROM THE HAND THE SEED ROLLED
 * (`docs/LIARS-DICE_REDESIGN.md` §16.2 shape (b), the F-137-1 fix).
 *
 * The opening floor makes any hardcoded opening literal a function of the
 * player's hidden dice, so a literal that passes today passes by luck. These two
 * ask the ENGINE's own `minOpeningQuantity` for the floor and then take `atLeast`
 * on top, so a test that needs room UNDER the claim (the pinned-quantity
 * refusals, which probe `quantity - 1`) still gets it — without chasing seeds
 * until some literal happens to be legal.
 */
function openingQuantity(hand: NonNullable<GameState['dareHand']>, face: number, atLeast = 1) {
  return Math.max(atLeast, minOpeningQuantity(hand.playerDice.filter((d) => d === face).length));
}
function openingBid(state: GameState, face: number, atLeast = 1): PlayerAction {
  return {
    type: 'Dare',
    move: 'bid',
    face,
    quantity: openingQuantity(state.dareHand!, face, atLeast),
  };
}

/**
 * T-160 · The two BLINDNESS experiments below open at a FIXED public claim while
 * varying the player's hidden dice, because a claim DERIVED from those dice would
 * change the dealer's INPUT and the experiment would prove nothing.
 *
 * T-160's opening floor makes that harder than it was: a fixed claim must clear
 * `own(face) + 1` for EVERY variant, and a claim tall enough to clear a variant
 * that holds two of the face is tall enough for the dealer to CALL on move one —
 * which would leave the dealer with a single decision and make the experiment
 * vacuous (the witness at the end of (b) is what catches that). The resolution is
 * to vary the hidden hand over the five faces that are NOT the claimed one, so
 * `own(3) = 0` on every variant, the floor is 1 on every variant, and the public
 * claim `(1, 3)` is both fixed and minimal. Thirty variants, up from twenty.
 */
const BLIND_OPEN_QUANTITY = 1;
const BLIND_OPEN_FACE = 3;
/**
 * The variant table for both experiments: `a` over the five faces that are NOT
 * {@link BLIND_OPEN_FACE}, crossed with six tails that hold no threes either.
 * Thirty hidden hands spanning the other five faces, every one of them holding
 * `own(3) = 0` — which is what lets the PUBLIC claim stay fixed at the floor.
 */
function blindVariants(): number[][] {
  const variants: number[][] = [];
  for (const a of [1, 2, 4, 5, 6]) {
    for (const rest of [
      [1, 1, 1],
      [4, 5, 6],
      [6, 6, 6],
      [2, 2, 6],
      [1, 2, 4],
      [5, 5, 5],
    ]) {
      variants.push([a, ...rest]);
    }
  }
  return variants;
}
/** Proves the fixed claim really is legal — and really is the FLOOR — for every
 *  variant, so a later edit to the table cannot quietly re-break the experiment
 *  in either direction (an illegal claim, or a claim tall enough to be called on
 *  move one, which is what the vacuity witness below would then catch). */
function assertBlindOpenIsLegal(variants: readonly number[][]): void {
  for (const dice of variants) {
    const own = dice.filter((d) => d === BLIND_OPEN_FACE).length;
    expect(own, JSON.stringify(dice)).toBe(0);
    expect(BLIND_OPEN_QUANTITY, JSON.stringify(dice)).toBe(minOpeningQuantity(own));
  }
}

const DEALER = 'npc-iron-vex'; // cast index 0 — starts co-located at Sol-3 (id 1).
const SUN_3 = 1;

/** A DAY-phase state at a hasHangout port with a hand-picked dawn hand and a
 *  co-located, solvent dealer. Shaped on `hangout.test.ts`'s helper of the same
 *  name; `seed` is a parameter because the eight opening d6 and every dealer
 *  decision roll come off the action rng, which is derived from it. */
function hangoutState(seed = 1, dice = [10, 10, 10, 10, 10], systemId = SUN_3): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = systemId;
  state.player.stats[Stat.GUILE] = 0;
  state.player.credits = 20_000;
  const spent = new Array<boolean>(dice.length).fill(false);
  state.player.dawnHand = { dice: [...dice], spent } satisfies DawnHand;
  const dealer = state.npcs.find((n) => n.id === DEALER)!;
  dealer.currentSystemId = systemId;
  dealer.credits = 20_000;
  dealer.disposition = 0;
  return state;
}

function dealerOf(state: GameState) {
  return state.npcs.find((n) => n.id === DEALER)!;
}

/** Open a hand through the real resolver. */
function openHand(state: GameState, wager = 100) {
  return applyPlayerAction(state, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: DEALER,
    wager,
  });
}

function resolvedOf(events: GameEvent[]) {
  return events.find((e) => e.type === 'DareHandResolved');
}

// ---------------------------------------------------------------------------
// §4 · The ante is a RULE READING CONTENT, never a per-port branch
// ---------------------------------------------------------------------------

describe('T-135 · the ante rides the port’s own band', () => {
  // The spec's §4.5 worked table. Restated here as the EXPECTED side so the test
  // is a statement about the fourteen shipped bands rather than a re-derivation of
  // the formula against itself.
  const EXPECTED: Record<number, number> = {
    1: 30,
    2: 23,
    3: 30,
    4: 12,
    5: 60,
    6: 9,
    7: 36,
    8: 6,
    9: 27,
    10: 15,
    11: 90,
    12: 90,
    13: 54,
    14: 45,
  };

  it('is round(band.max × DARE_ANTE_BAND_FRACTION) at all fourteen ports', () => {
    for (const [systemId, ante] of Object.entries(EXPECTED)) {
      const id = Number(systemId);
      expect(anteFor(id, 0)).toBe(ante);
      // …and it IS the formula, not a table: the same number falls out of the
      // port's own band and content's one fraction. This is the "no per-port
      // branch" proof — there is one rule and fourteen instances.
      expect(anteFor(id, 0)).toBe(
        Math.max(1, Math.round(wagerBandFor(id).max * DARE_ANTE_BAND_FRACTION)),
      );
    }
  });

  it('is resolved ONCE at open and frozen onto the hand', () => {
    const opened = openHand(hangoutState(222)).state;
    expect(opened.dareHand?.ante).toBe(anteFor(SUN_3, 0));
    expect(opened.dareHand?.systemId).toBe(SUN_3);
  });

  it('the 12-raise lattice bound makes band.max a whole-hand exposure ceiling', () => {
    // §4.4: from (1,1) at most (8−1)+(6−1) = 12 raises are possible, and RAISE
    // BOTH costs exactly two steps' worth, so 12 × ante = 0.36 × band.max is the
    // most either side can ever pay in antes — the arithmetic F-134-1 rests on.
    for (const id of [1, 8, 11]) {
      expect(12 * anteFor(id, 0)).toBeLessThanOrEqual(Math.round(0.36 * wagerBandFor(id).max) + 12);
    }
  });
});

// ---------------------------------------------------------------------------
// §5 · A FULL HAND, end to end through the real loop
// ---------------------------------------------------------------------------

describe('T-135 · a full hand plays through startDay/applyPlayerAction', () => {
  // SEED 222 IS PINNED FOR A REASON, and the reason is the only thing a future
  // author needs: searching seeds 1..4000 × six raise orders × two opening
  // quantities, this is the first seed on which the dealer answers three
  // consecutive player raises — FACE, then BOTH, then QUANTITY — without ending
  // the hand, so it is the shortest script that exercises every raise kind in one
  // hand. Nothing about the seed is otherwise special and no constant was fitted
  // to it.
  it('open → raise-face → raise-both → raise-quantity → challenge, never poking state', () => {
    let state = hangoutState(222);
    const creditsBefore = state.player.credits;
    const dealerBefore = dealerOf(state).credits;

    const opened = openHand(state);
    state = opened.state;
    expect(events(opened).some((e) => e.type === 'DareHandStarted')).toBe(true);
    const seedWager = state.dareHand!.seedWager;
    const ante = state.dareHand!.ante;

    // §2.4's CONSERVATION INVARIANT, asserted at every step of the hand: money is
    // debited into escrow at contribution time, so `credits + potPlayer` never
    // moves while the hand is open.
    const conserved = creditsBefore;
    const checkConservation = (s: GameState) => {
      expect(s.player.credits + (s.dareHand?.potPlayer ?? 0)).toBe(conserved);
    };
    checkConservation(state);

    const played: string[] = [];
    const play = (move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both') => {
      const bid = state.dareHand!.bid;
      const quantity =
        move === 'bid' ? 1 : move === 'raise-face' ? bid!.quantity : bid!.quantity + 1;
      const face = move === 'bid' ? 1 : move === 'raise-quantity' ? bid!.face : bid!.face + 1;
      const step = applyPlayerAction(state, { type: 'Dare', move, quantity, face });
      state = step.state;
      played.push(move);
      // No refusal anywhere on this path.
      expect(step.events.some((e) => e.type === 'HangoutEvent')).toBe(false);
      expect(state.dareHand).not.toBeNull();
      checkConservation(state);
      return step;
    };

    play('bid');
    play('raise-face');
    play('raise-both');
    play('raise-quantity');

    // Both sides bid: the dealer answered every one of the four, in the same call.
    const history = state.dareHand!.history;
    expect(history.filter((h) => h.actor === 'player').map((h) => h.move)).toEqual(played);
    expect(history.filter((h) => h.actor === 'dealer').length).toBe(4);
    // The opening bid is NOT a raise (§4.2): it costs nothing.
    expect(history[0]).toMatchObject({ actor: 'player', move: 'bid', antePaid: 0 });
    // The player paid ante + 2×ante + ante across the three raises.
    const playerAntes = history
      .filter((h) => h.actor === 'player')
      .reduce((sum, h) => sum + h.antePaid, 0);
    expect(playerAntes).toBe(4 * ante);
    expect(state.dareHand!.potPlayer).toBe(seedWager + 4 * ante);

    const challenge = applyPlayerAction(state, { type: 'Dare', move: 'challenge' });
    state = challenge.state;
    expect(state.dareHand).toBeNull();

    const resolved = resolvedOf(challenge.events)!;
    expect(resolved.outcome).toBe('challenge-win');
    // A CHALLENGE reveals — and only a challenge does.
    expect(resolved.dealerDice).toHaveLength(4);
    expect(resolved.actualCount).toBeGreaterThanOrEqual(0);
    // The terminal HangoutEvent is unchanged in shape and reports the SEED, not
    // the pot (§10.3) — four content deeds and HangoutPlayStats read it.
    expect(challenge.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      venue: 'dare',
      opponentId: DEALER,
      wager: seedWager,
      playerWon: true,
      creditsDelta: resolved.creditsDelta,
    });
    // The whole ledger closes: the player is up the dealer's escrow, exactly.
    expect(state.player.credits).toBe(creditsBefore + resolved.creditsDelta);
    expect(dealerOf(state).credits).toBe(dealerBefore - resolved.creditsDelta);
  });

  it('drives a whole day through startDay and closes the hand inside it', () => {
    // The other half of "through the real loop": a hand opened on a day that
    // `startDay` produced, not on a hand-built DAY state.
    const dawn = startDay(createInitialStateAtHangout(222));
    let state = dawn.state;
    const dealer = state.npcs.find(
      (n) => !n.dead && n.currentSystemId === state.player.currentSystemId,
    )!;
    state = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId: dealer.id,
      wager: 100,
    }).state;
    expect(state.dareHand).not.toBeNull();

    state = applyPlayerAction(state, openingBid(state, 1)).state;
    while (state.dareHand) {
      state = applyPlayerAction(state, { type: 'Dare', move: 'challenge' }).state;
    }
    expect(state.dareHand).toBeNull();
    // The day still ends cleanly with no hand outstanding.
    expect(endDay(state).state.dareHand).toBeNull();
  });
});

/** A DAWN-phase state standing at Sol-3 with a solvent co-located dealer, for the
 *  tests that want `startDay` to roll the hand rather than a fixture. */
function createInitialStateAtHangout(seed: number): GameState {
  const state = createInitialState(seed);
  state.player.credits = 20_000;
  for (const npc of state.npcs) {
    if (npc.currentSystemId === state.player.currentSystemId) npc.credits = 20_000;
  }
  return state;
}

function events(step: { events: GameEvent[] }): GameEvent[] {
  return step.events;
}

// ---------------------------------------------------------------------------
// §5.1/§5.2 · THE EXPLOIT STAYS CLOSED
// ---------------------------------------------------------------------------

describe('T-135 · the bid lattice refuses, never clamps (the closed exploit)', () => {
  /** Open a hand and put a standing bid on the table, returning a state whose
   *  `dareHand` still stands. */
  function withStandingBid(): GameState {
    // Opened at (3,2) rather than (1,1) so BOTH directions of the pinned-quantity
    // rule are testable: `quantity - 1` and `face - 1` are still inside the
    // lattice, so a refusal below is about the RULE and not about a bound.
    let state = openHand(hangoutState(222)).state;
    state = applyPlayerAction(state, openingBid(state, 2, 3)).state;
    // The DEALER answered inside that same call (§9.4), so the standing bid the
    // refusals below are measured against is the dealer's, which is exactly the
    // state a player is ever asked to move from.
    expect(state.dareHand).not.toBeNull();
    const bid = state.dareHand!.bid!;
    expect(bid.quantity).toBeGreaterThanOrEqual(3);
    expect(bid.quantity).toBeLessThan(8);
    expect(bid.face).toBeGreaterThanOrEqual(2);
    expect(bid.face).toBeLessThan(6);
    return state;
  }

  /** Every refusal must be typed, must change NOTHING, and must spend nothing. */
  function expectRefused(
    before: GameState,
    move: 'raise-face' | 'raise-quantity',
    q: number,
    f: number,
  ) {
    const step = applyPlayerAction(before, { type: 'Dare', move, quantity: q, face: f });
    expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      venue: 'dare',
      failReason: 'illegal-dare-move',
    });
    expect(step.state.dareHand?.bid).toEqual(before.dareHand?.bid);
    expect(step.state.dareHand?.bidder).toEqual(before.dareHand?.bidder);
    expect(step.state.dareHand?.potPlayer).toBe(before.dareHand?.potPlayer);
    expect(step.state.dareHand?.history.length).toBe(before.dareHand?.history.length);
    expect(step.state.player.credits).toBe(before.player.credits);
    expect(step.state.player.dawnHand?.spent).toEqual(before.player.dawnHand?.spent);
    return step;
  }

  it('a FACE raise that also changes the quantity is refused (the risk-free claim)', () => {
    // §5.2: if a face raise could move the quantity, a player holding k of some
    // face could always claim (k, that face) — a claim `actual >= k` guarantees.
    // Pinning the quantity is what makes the face raise a claim about the OTHER
    // side's dice, which is the whole game.
    const state = withStandingBid();
    const bid = state.dareHand!.bid!;
    expectRefused(state, 'raise-face', bid.quantity + 1, bid.face + 1);
    expectRefused(state, 'raise-face', bid.quantity - 1 || 1, bid.face + 1);
  });

  it('a FACE raise that jumps more than one value is refused (no face search)', () => {
    // §5.2: a multi-step jump would let a player SEARCH for the face on which
    // their own count still matches the quantity, restoring the risk-free claim.
    const state = withStandingBid();
    const bid = state.dareHand!.bid!;
    expectRefused(state, 'raise-face', bid.quantity, bid.face + 3);
    expectRefused(state, 'raise-face', bid.quantity, bid.face + 2);
  });

  it('a QUANTITY raise that changes the face, or does not raise, is refused', () => {
    const state = withStandingBid();
    const bid = state.dareHand!.bid!;
    expectRefused(state, 'raise-quantity', bid.quantity + 1, bid.face + 1);
    expectRefused(state, 'raise-quantity', bid.quantity, bid.face);
    expectRefused(state, 'raise-quantity', bid.quantity - 1 || 1, bid.face);
  });

  it('a second OPEN against a standing bid is refused', () => {
    const state = withStandingBid();
    const step = applyPlayerAction(state, openingBid(state, 4, 4));
    expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      failReason: 'illegal-dare-move',
    });
    expect(step.state.dareHand?.bid).toEqual(state.dareHand?.bid);
  });

  it('an opening bid outside 1..8 × 1..6 is refused', () => {
    const opened = openHand(hangoutState(222)).state;
    for (const [q, f] of [
      [9, 3],
      [0, 3],
      [2, 7],
      [2, 0],
    ]) {
      const step = applyPlayerAction(opened, { type: 'Dare', move: 'bid', quantity: q, face: f });
      expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
        failReason: 'illegal-dare-move',
      });
      expect(step.state.dareHand?.bid).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// §6 · FOLD's economics
// ---------------------------------------------------------------------------

describe('T-135 · FOLD forfeits exactly the seed plus the antes paid', () => {
  it('a player fold moves the whole escrow to the dealer and reveals nothing', () => {
    let state = hangoutState(222);
    const creditsBefore = state.player.credits;
    const dealerBefore = dealerOf(state).credits;

    state = openHand(state).state;
    const seedWager = state.dareHand!.seedWager;
    const ante = state.dareHand!.ante;

    state = applyPlayerAction(state, openingBid(state, 1)).state;
    let bid = state.dareHand!.bid!;
    state = applyPlayerAction(state, {
      type: 'Dare',
      move: 'raise-face',
      quantity: bid.quantity,
      face: bid.face + 1,
    }).state;
    expect(state.dareHand).not.toBeNull();
    bid = state.dareHand!.bid!;
    state = applyPlayerAction(state, {
      type: 'Dare',
      move: 'raise-both',
      quantity: bid.quantity + 1,
      face: bid.face + 1,
    }).state;
    expect(state.dareHand).not.toBeNull();

    // THE FORFEIT, stated twice: once against the ledger the hand is carrying,
    // once against the named prices of the two raises (ante + 2×ante).
    const potPlayer = state.dareHand!.potPlayer;
    const potDealer = state.dareHand!.potDealer;
    expect(potPlayer).toBe(seedWager + 3 * ante);
    expect(state.player.credits).toBe(creditsBefore - potPlayer); // escrow, not a promise

    const fold = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    const resolved = resolvedOf(fold.events)!;

    expect(resolved.outcome).toBe('player-fold');
    expect(resolved.creditsDelta).toBe(-potPlayer);
    // A FOLD NEVER REVEALS (§6.1) — the player does not learn whether it was right.
    expect(resolved.dealerDice).toBeUndefined();
    expect(resolved.actualCount).toBeUndefined();

    // Exactly the seed plus every ante the player paid this hand, and nothing more.
    expect(fold.state.player.credits).toBe(creditsBefore - (seedWager + 3 * ante));
    // The dealer takes the WHOLE pot; their own escrow was already their money, so
    // their net is the player's forfeit.
    expect(dealerOf(fold.state).credits).toBe(dealerBefore - potDealer + potPlayer + potDealer);
    expect(dealerOf(fold.state).credits).toBe(dealerBefore + potPlayer);
    expect(fold.state.dareHand).toBeNull();
  });

  it('a fold BEFORE the opening bid forfeits the seed alone', () => {
    let state = hangoutState(222);
    const creditsBefore = state.player.credits;
    state = openHand(state).state;
    const seedWager = state.dareHand!.seedWager;
    // §6.1: legal, and it is what a captain who rolls four ones does.
    expect(legalDareMoves(state.dareHand!, 'player', state.player.credits)).toContain('fold');
    const fold = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    const resolved = resolvedOf(fold.events)!;
    expect(resolved.outcome).toBe('player-fold');
    expect(resolved.bid).toBeNull();
    expect(resolved.creditsDelta).toBe(-seedWager);
    expect(fold.state.player.credits).toBe(creditsBefore - seedWager);
  });

  it('the dusk timeout fold is a player fold in every respect (§6.2)', () => {
    const build = () => {
      let s = openHand(hangoutState(222)).state;
      s = applyPlayerAction(s, openingBid(s, 1)).state;
      return s;
    };
    const forFold = build();
    const forDusk = build();
    expect(forDusk.dareHand).not.toBeNull();

    const creditsAtDusk = forDusk.player.credits;
    const potPlayer = forDusk.dareHand!.potPlayer;
    const dealerAtDusk = dealerOf(forDusk).credits;

    const dusk = endDay(forDusk);
    const duskResolved = resolvedOf(dusk.events)!;
    expect(duskResolved.outcome).toBe('timeout-fold');
    expect(duskResolved.dealerDice).toBeUndefined();
    expect(duskResolved.creditsDelta).toBe(-potPlayer);
    expect(dusk.state.dareHand).toBeNull();
    // Identical economics to the explicit fold from the same position.
    const explicit = applyPlayerAction(forFold, { type: 'Dare', move: 'fold' });
    expect(resolvedOf(explicit.events)!.creditsDelta).toBe(duskResolved.creditsDelta);
    expect(resolvedOf(explicit.events)!.dispositionDelta).toBe(duskResolved.dispositionDelta);
    // The player's purse does not move at settlement — the escrow was already gone.
    expect(dusk.state.player.credits).toBe(creditsAtDusk);
    expect(dealerOf(dusk.state).credits).toBeGreaterThan(dealerAtDusk);
  });

  it('NO reachable state carries a hand into the next dawn', () => {
    let state = openHand(hangoutState(222)).state;
    state = applyPlayerAction(state, openingBid(state, 2, 2)).state;
    const next = startDay(endDay(state).state);
    expect(next.state.dareHand).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §7 · Disposition — three arms, one call per hand
// ---------------------------------------------------------------------------

describe('T-135 · the three disposition arms apply exactly as settled', () => {
  const params = () => venueParamsFor(SUN_3, 'dare');

  function dispositionEventsOf(evts: GameEvent[]) {
    return evts.filter((e) => e.type === 'DispositionChanged');
  }

  it('challenge-win reads dispositionOnFailure (the beaten dealer sours)', () => {
    // The seed-222 script from the full-hand block above, which lands on a
    // challenge-WIN — asserted, not hoped for, so this test cannot pass vacuously.
    let state = openHand(hangoutState(222)).state;
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    for (const move of ['raise-face', 'raise-both', 'raise-quantity'] as const) {
      const bid = state.dareHand!.bid!;
      const quantity = move === 'raise-face' ? bid.quantity : bid.quantity + 1;
      const face = move === 'raise-quantity' ? bid.face : bid.face + 1;
      state = applyPlayerAction(state, { type: 'Dare', move, quantity, face }).state;
      expect(state.dareHand).not.toBeNull();
    }
    const step = applyPlayerAction(state, { type: 'Dare', move: 'challenge' });
    const resolved = resolvedOf(step.events)!;
    expect(resolved.outcome).toBe('challenge-win');
    const disp = dispositionEventsOf(step.events);
    expect(disp).toHaveLength(1);
    expect(disp[0]).toMatchObject({ npcId: DEALER, reason: 'dare', delta: DARE_WIN_DISPOSITION });
    expect(resolved.dispositionDelta).toBe(params().dispositionOnFailure);
    expect(params().dispositionOnFailure).toBe(DARE_WIN_DISPOSITION);
  });

  it('challenge-loss reads dispositionOnSuccess (the house prevailed, the dealer warms)', () => {
    // An (8,6) claim needs all eight dice showing 6 — arithmetically almost
    // impossible, so this is a deterministic player loss whichever side calls it.
    let state = openHand(hangoutState(222)).state;
    const step = applyPlayerAction(state, openingBid(state, 6, 8));
    state = step.state;
    let evts = step.events;
    if (state.dareHand) {
      const called = applyPlayerAction(state, { type: 'Dare', move: 'challenge' });
      state = called.state;
      evts = called.events;
    }
    const resolved = resolvedOf(evts)!;
    expect(resolved.outcome).toBe('challenge-loss');
    expect(resolved.actualCount).toBeLessThan(8);
    const disp = dispositionEventsOf(evts);
    expect(disp).toHaveLength(1);
    expect(disp[0]).toMatchObject({ npcId: DEALER, reason: 'dare', delta: DARE_LOSS_DISPOSITION });
    expect(resolved.dispositionDelta).toBe(params().dispositionOnSuccess);
  });

  it('player-fold and timeout-fold read the NEW dispositionOnFold arm', () => {
    for (const kind of ['player-fold', 'timeout-fold'] as const) {
      let state = openHand(hangoutState(222)).state;
      state = applyPlayerAction(state, openingBid(state, 1)).state;
      const step =
        kind === 'player-fold'
          ? applyPlayerAction(state, { type: 'Dare', move: 'fold' })
          : endDay(state);
      const resolved = resolvedOf(step.events)!;
      expect(resolved.outcome).toBe(kind);
      expect(resolved.dispositionDelta).toBe(params().dispositionOnFold);
      expect(params().dispositionOnFold).toBe(DARE_FOLD_DISPOSITION);
      const disp = dispositionEventsOf(step.events);
      expect(disp).toHaveLength(1);
      expect(disp[0]).toMatchObject({
        npcId: DEALER,
        reason: 'dare',
        delta: DARE_FOLD_DISPOSITION,
      });
      // §7.2: a fold WARMS the dealer, like a loss, and less than one.
      expect(DARE_FOLD_DISPOSITION).toBeGreaterThan(0);
      expect(DARE_FOLD_DISPOSITION).toBeLessThan(DARE_LOSS_DISPOSITION);
    }
  });

  it('no new DispositionChanged reason — every arm reports `dare` (§7.4)', () => {
    let state = openHand(hangoutState(222)).state;
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    const step = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    for (const e of step.events) {
      if (e.type === 'DispositionChanged') expect(e.reason).toBe('dare');
    }
  });

  it('emits NO DispositionChanged when the applied delta would be zero', () => {
    // `applyDisposition`'s early returns are unchanged (§7.1). A dealer already at
    // the +10 ceiling cannot warm further, so a fold moves nothing and says
    // nothing — the same behaviour every other venue has for a zeroed field.
    let state = hangoutState(222);
    dealerOf(state).disposition = 10;
    state = openHand(state).state;
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    const step = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    expect(resolvedOf(step.events)!.outcome).toBe('player-fold');
    // The event still REPORTS the delta that was passed; the applied one is zero.
    expect(resolvedOf(step.events)!.dispositionDelta).toBe(DARE_FOLD_DISPOSITION);
    expect(step.events.some((e) => e.type === 'DispositionChanged')).toBe(false);
    expect(dealerOf(step.state).disposition).toBe(10);
  });

  it('applies exactly ONE disposition move per hand, whatever the hand’s length', () => {
    // §7.5 property 2: the CADENCE is unchanged from the single-check Dare, which
    // is what keeps T-125's interceptor measurement comparable.
    let state = openHand(hangoutState(222)).state;
    const all: GameEvent[] = [];
    let step = applyPlayerAction(state, openingBid(state, 1));
    state = step.state;
    all.push(...step.events);
    while (state.dareHand) {
      const bid = state.dareHand.bid!;
      const legal = legalDareMoves(state.dareHand, 'player', state.player.credits);
      const next = legal.includes('raise-quantity')
        ? ({ move: 'raise-quantity', quantity: bid.quantity + 1, face: bid.face } as const)
        : ({ move: 'challenge' } as const);
      step = applyPlayerAction(state, { type: 'Dare', ...next });
      state = step.state;
      all.push(...step.events);
    }
    expect(all.filter((e) => e.type === 'DispositionChanged')).toHaveLength(1);
    expect(all.filter((e) => e.type === 'DareHandResolved')).toHaveLength(1);
    expect(all.filter((e) => e.type === 'HangoutEvent')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// §9.7 · The dealer CANNOT see the player's dice
// ---------------------------------------------------------------------------

describe('T-135 · the dealer policy cannot read the player’s hand', () => {
  // (a) COMPILE-TIME. The input interface has no member through which the
  // player's dice, a GameState, or a DareHandState (which CONTAINS playerDice)
  // could arrive. If the parameter ever grows one, this line stops compiling.
  const _noPlayerDice: 'playerDice' extends keyof Parameters<typeof dealerMove>[0] ? never : true =
    true;
  const _noHand: 'hand' extends keyof Parameters<typeof dealerMove>[0] ? never : true = true;
  const _noState: 'state' extends keyof Parameters<typeof dealerMove>[0] ? never : true = true;
  void _noPlayerDice;
  void _noHand;
  void _noState;

  it('(a) the signature has no channel for hidden player information', () => {
    // The type-level guards above are the assertion; this keeps them from being
    // dead code a formatter could strip, and names the property in the report.
    expect(_noPlayerDice).toBe(true);
    expect(_noHand).toBe(true);
    expect(_noState).toBe(true);
  });

  it('(b) varying the player’s hidden dice never changes the dealer’s moves', () => {
    // Seed, port, dealer, dealer dice and the player's SCRIPT are all fixed; only
    // the hidden player dice vary. A dealer that peeked would diverge on at least
    // one of these. Every move goes through the REAL applyPlayerAction — the one
    // legitimate poke is writing the hidden hand BEFORE the first move, which is
    // setting up the experiment rather than driving the scene.
    const variants = blindVariants();
    expect(variants.length).toBeGreaterThanOrEqual(20);
    assertBlindOpenIsLegal(variants);

    const signatures = variants.map((playerDice) => {
      let state = openHand(hangoutState(222)).state;
      const fixedDealerDice = [...state.dareHand!.dealerDice];
      state.dareHand!.playerDice = [...playerDice]; // the experiment's only poke
      const script: Array<'bid' | 'raise-face' | 'raise-quantity'> = [
        'bid',
        'raise-face',
        'raise-quantity',
      ];
      let endedAfter: number | null = null;
      for (let i = 0; i < script.length; i += 1) {
        if (!state.dareHand) {
          endedAfter = i;
          break;
        }
        const move = script[i];
        const bid = state.dareHand.bid;
        const quantity =
          move === 'bid'
            ? BLIND_OPEN_QUANTITY
            : move === 'raise-face'
              ? bid!.quantity
              : bid!.quantity + 1;
        const face = move === 'bid' ? 3 : move === 'raise-quantity' ? bid!.face : bid!.face + 1;
        state = applyPlayerAction(state, { type: 'Dare', move, quantity, face }).state;
      }
      // The dealer's DECISIONS — not the hand's outcome, which of course depends
      // on the player's dice at a showdown.
      const dealerMoves = state.dareHand
        ? state.dareHand.history.filter((h) => h.actor === 'dealer')
        : [];
      return JSON.stringify({ dealerMoves, endedAfter, fixedDealerDice });
    });

    // Every dealer dice hand is the same (same seed), so the ONLY input that moved
    // is the hidden player hand — and the dealer's answer sequence did not.
    expect(new Set(signatures).size).toBe(1);
    // …and the experiment is not vacuous: the dealer actually MADE decisions
    // across the script rather than ending every variant on move one.
    const witness = JSON.parse(signatures[0]) as {
      dealerMoves: unknown[];
      endedAfter: number | null;
    };
    expect(witness.dealerMoves.length + (witness.endedAfter ?? 0)).toBeGreaterThanOrEqual(2);
  });

  it('is a pure function of its declared inputs', () => {
    const input = {
      dealerDice: [3, 3, 5, 1] as const,
      dicePerSide: DARE_DICE_PER_SIDE,
      bid: { quantity: 3, face: 3 },
      bidder: 'player' as const,
      dealerGuile: 2,
      ante: 30,
      headroom: 900,
      dealerCredits: 5000,
      roll: 50,
    };
    expect(dealerMove({ ...input })).toEqual(dealerMove({ ...input }));
  });

  it('throws rather than inventing an opening policy it can never need (§9.9)', () => {
    expect(() =>
      dealerMove({
        dicePerSide: DARE_DICE_PER_SIDE,
        dealerDice: [1, 2, 3, 4],
        bid: null,
        bidder: null,
        dealerGuile: 0,
        ante: 30,
        headroom: 900,
        dealerCredits: 5000,
        roll: 0,
      }),
    ).toThrow();
  });

  it('always has a legal move once a bid stands (the totality argument)', () => {
    // §9.9 ruling 2: CHALLENGE is legal whenever a bid stands, unconditionally and
    // at zero cost, so the dealer can never be asked a question it cannot answer —
    // even broke, even with no headroom left.
    for (const [quantity, face] of [
      [1, 1],
      [8, 6],
      [4, 3],
    ]) {
      const move = dealerMove({
        dicePerSide: DARE_DICE_PER_SIDE,
        dealerDice: [1, 1, 1, 1],
        bid: { quantity, face },
        bidder: 'player',
        dealerGuile: 0,
        ante: 30,
        headroom: 0,
        dealerCredits: 0,
        roll: 0,
      });
      expect(['challenge', 'fold']).toContain(move.move);
    }
  });

  it('F-135-2 · the §9.8 challenge test STRICTLY DOMINATES its fold test', () => {
    // A REPORTED FINDING, pinned mechanically rather than left as prose. Step 2's
    // fold requires `own === 0` and `quantity >= 5`; with no matching dice the
    // surplus is `quantity - 4/6 >= 4.33`, which always exceeds step 1's margin
    // (`1.5 - guile*0.15`, at most 1.5), and 'challenge' is unconditionally in
    // `choices`. So `DareHandResolved{outcome:'dealer-fold'}` is UNREACHABLE under
    // the specified policy. The engine implements the outcome (it is a legal
    // dealer answer and settlement handles it); it is the POLICY that never
    // produces it, which is M4e archetype business, not a T-135 tuning licence.
    for (let guile = 0; guile <= 5; guile += 1) {
      for (let quantity = 5; quantity <= 8; quantity += 1) {
        const move = dealerMove({
          dicePerSide: DARE_DICE_PER_SIDE,
          dealerDice: [1, 1, 1, 1], // holds none of face 3
          bid: { quantity, face: 3 },
          bidder: 'player',
          dealerGuile: guile,
          ante: 30,
          headroom: 900,
          dealerCredits: 5000,
          roll: 0,
        });
        expect(move.move).toBe('challenge');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §10.2 · The hidden-dice discipline
// ---------------------------------------------------------------------------

describe('T-135 · the dealer’s dice never enter the log before a reveal', () => {
  it('a folded hand never reveals them, anywhere in the event log', () => {
    let state = openHand(hangoutState(222)).state;
    const dealerDice = [...state.dareHand!.dealerDice];
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    const fold = applyPlayerAction(state, { type: 'Dare', move: 'fold' });

    // The WHOLE persisted log, not just this batch's events.
    const log = JSON.stringify(fold.state.eventLog);
    expect(log).not.toContain('dealerDice');
    expect(fold.state.eventLog.some((e) => e.type === 'DareHandStarted')).toBe(true);
    // …and the dice themselves are still in the scene state, which is where the
    // hand has to live. The discipline is about the NARRATIVE LOG the UI renders.
    expect(dealerDice).toHaveLength(4);
  });

  it('a challenged hand reveals them on DareHandResolved and nowhere earlier', () => {
    let state = openHand(hangoutState(222)).state;
    const before = state.eventLog.length;
    state = applyPlayerAction(state, openingBid(state, 6, 8)).state;
    let log = state.eventLog.slice(before);
    if (state.dareHand) {
      state = applyPlayerAction(state, { type: 'Dare', move: 'challenge' }).state;
      log = state.eventLog.slice(before);
    }
    const revealers = log.filter(
      (e) => e.type === 'DareHandResolved' && e.dealerDice !== undefined,
    );
    expect(revealers).toHaveLength(1);
    for (const e of log) {
      if (e.type !== 'DareHandResolved') {
        expect(JSON.stringify(e)).not.toContain('dealerDice');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §8 · The Peek
// ---------------------------------------------------------------------------

describe('T-135 · the Peek', () => {
  it('spends a SECOND die against the port’s dare.dc and reveals one dealer die', () => {
    // A nat-20 auto-succeeds, so this is deterministic without pinning a DC.
    const state = openHand(hangoutState(222, [10, 20, 10, 10, 10])).state;
    const dealerDice = [...state.dareHand!.dealerDice];
    const step = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 1 });

    expect(venueParamsFor(SUN_3, 'dare').dc).toBe(DARE_PEEK_DC);
    const check = step.events.find((e) => e.type === 'StatCheck');
    expect(check).toMatchObject({
      actor: 'Player',
      stat: Stat.GUILE,
      dc: DARE_PEEK_DC,
      actionContext: 'gamble',
    });
    const peeked = step.events.find((e) => e.type === 'DarePeeked')!;
    expect(peeked).toMatchObject({ success: true });
    const revealed = step.state.dareHand!.peekedDealerDie!;
    expect(revealed.value).toBe(dealerDice[revealed.index]);
    expect(step.state.dareHand!.peekUsed).toBe(true);
    expect(step.state.player.dawnHand!.spent[1]).toBe(true);
    // A Peek answers no bid, so the dealer does not move.
    expect(step.state.dareHand!.bid).toBeNull();
    expect(step.state.dareHand!.history).toHaveLength(0);
  });

  it('a FAILED peek reveals nothing but still burns the die and the attempt', () => {
    const state = openHand(hangoutState(222, [10, 1, 10, 10, 10])).state; // nat-1 auto-fail
    const step = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 1 });
    expect(step.events.find((e) => e.type === 'DarePeeked')).toMatchObject({ success: false });
    expect(step.state.dareHand!.peekedDealerDie).toBeNull();
    expect(step.state.dareHand!.peekUsed).toBe(true);
    expect(step.state.player.dawnHand!.spent[1]).toBe(true);
  });

  it('is refused a second time, and after the bidding opens', () => {
    let state = openHand(hangoutState(222, [10, 20, 20, 10, 10])).state;
    state = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 1 }).state;
    const again = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 2 });
    expect(again.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      failReason: 'illegal-dare-move',
    });
    expect(again.state.player.dawnHand!.spent[2]).toBe(false);

    let afterBid = openHand(hangoutState(222, [10, 20, 20, 10, 10])).state;
    afterBid = applyPlayerAction(afterBid, {
      type: 'Dare',
      move: 'bid',
      quantity: 1,
      face: 1,
    }).state;
    if (afterBid.dareHand) {
      const late = applyPlayerAction(afterBid, { type: 'Dare', move: 'peek', spendDie: 1 });
      expect(late.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
        failReason: 'illegal-dare-move',
      });
    }
  });

  it('refuses malformed die input BEFORE the rule input, spending nothing', () => {
    const state = openHand(hangoutState(222)).state;
    // T-197 · THE OPEN NO LONGER SPENDS A DIE (docs/DAWN-HAND-REDESIGN.md §3), so
    // die 0 is not already-spent by having opened the hand — it is marked spent
    // here as a FIXTURE. PEEK is the one Hangout-family verb that still costs a
    // die and still raises all three of these reasons, which is exactly what this
    // test exists to pin, and freeing the venues did not touch it.
    state.player.dawnHand!.spent[0] = true;
    const cases: Array<[number | undefined, string]> = [
      [undefined, 'no-die'],
      [99, 'invalid-die-index'],
      [0, 'die-already-spent'],
    ];
    for (const [spendDie, failReason] of cases) {
      const step = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie });
      expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
        venue: 'dare',
        failReason,
      });
      expect(step.state.dareHand!.peekUsed).toBe(false);
      expect(step.state.player.dawnHand!.spent).toEqual(state.player.dawnHand!.spent);
    }
  });
});

// ---------------------------------------------------------------------------
// §4.3 · The headroom clamp
// ---------------------------------------------------------------------------

describe('T-135 · the ante clamp closes the raising game, never the hand', () => {
  const ante = anteFor(SUN_3, 0);

  it('an INSOLVENT actor is offered no raise, and a raise it cannot cover is refused', () => {
    // Driven, not poked: the fixture starts the captain on 910 credits and seeds
    // 900 into escrow, so after the open they hold 10 — less than the port's ante.
    // The dealer is rich, so the hand STANDS and the clamp is visible on a live
    // scene rather than on a hand that has already closed.
    const fixture = hangoutState(1);
    fixture.player.credits = 910; // fixture setup, before any action is taken
    let state = openHand(fixture, 900).state;
    expect(state.dareHand!.seedWager).toBe(900);
    expect(state.player.credits).toBe(10);
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    expect(state.dareHand).not.toBeNull();
    expect(state.player.credits).toBeLessThan(ante);

    // §4.3's forced ending: only the two FREE moves are left, and they are ALWAYS
    // left — that is the totality claim on the player's side.
    expect(legalDareMoves(state.dareHand!, 'player', state.player.credits)).toEqual([
      'challenge',
      'fold',
    ]);

    const bid = state.dareHand!.bid!;
    const potBefore = state.dareHand!.potPlayer;
    const creditsBefore = state.player.credits;
    for (const move of ['raise-face', 'raise-quantity', 'raise-both'] as const) {
      const quantity = move === 'raise-face' ? bid.quantity : bid.quantity + 1;
      const face = move === 'raise-quantity' ? bid.face : bid.face + 1;
      const step = applyPlayerAction(state, { type: 'Dare', move, quantity, face });
      expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
        venue: 'dare',
        failReason: 'illegal-dare-move',
      });
      // A PARTIAL ANTE IS NEVER TAKEN: nothing moved at all.
      expect(step.state.dareHand!.potPlayer).toBe(potBefore);
      expect(step.state.player.credits).toBe(creditsBefore);
      expect(step.state.dareHand!.bid).toEqual(bid);
    }
    // …and the hand is still playable, which is the point of the section title.
    expect(applyPlayerAction(state, { type: 'Dare', move: 'fold' }).state.dareHand).toBeNull();
  });

  it('headroom is measured per side against the port’s ceiling, seed included', () => {
    // §4.3, and the reason `band.max` is a WHOLE-HAND exposure ceiling: a seed of
    // 900 at a 1,000 port leaves 100, not another 1,000.
    const band = wagerBandFor(SUN_3);
    const opened = openHand(hangoutState(222), 900).state;
    expect(headroomFor(opened.dareHand!, 'player')).toBe(band.max - 900);
    expect(headroomFor(opened.dareHand!, 'dealer')).toBe(band.max - 900);
    const atCeiling = openHand(hangoutState(222), band.max).state;
    expect(headroomFor(atCeiling.dareHand!, 'player')).toBe(0);
    expect(headroomFor(atCeiling.dareHand!, 'dealer')).toBe(0);
  });

  it('the legality rule itself refuses every raise once headroom < ante', () => {
    // The pure arithmetic behind the two tests above, exercised across the whole
    // boundary rather than at the one point a seeded hand happens to reach. Both
    // `legalDareMoves` and the dealer's own choice route through this function, so
    // this is one statement about all three consumers.
    const bid = { quantity: 3, face: 3 };
    const rich = 10_000;
    expect(legalMovesFrom(bid, ante, ante * 2, rich, true, DARE_MAX_QUANTITY)).toEqual([
      'raise-face',
      'raise-quantity',
      'raise-both',
      'challenge',
      'fold',
    ]);
    // One ante of room: the single raises fit, the double does not.
    expect(legalMovesFrom(bid, ante, ante, rich, true, DARE_MAX_QUANTITY)).toEqual([
      'raise-face',
      'raise-quantity',
      'challenge',
      'fold',
    ]);
    // A hair under one ante: no raise is legal at any price.
    expect(legalMovesFrom(bid, ante, ante - 1, rich, true, DARE_MAX_QUANTITY)).toEqual([
      'challenge',
      'fold',
    ]);
    expect(legalMovesFrom(bid, ante, 0, rich, true, DARE_MAX_QUANTITY)).toEqual([
      'challenge',
      'fold',
    ]);
    // Credits clamp identically to headroom — §4.3's insolvency rule.
    expect(legalMovesFrom(bid, ante, 10_000, ante - 1, true, DARE_MAX_QUANTITY)).toEqual([
      'challenge',
      'fold',
    ]);
    // The lattice ceilings, independent of money.
    expect(
      legalMovesFrom({ quantity: 8, face: 3 }, ante, 10_000, rich, true, DARE_MAX_QUANTITY),
    ).toEqual(['raise-face', 'challenge', 'fold']);
    expect(
      legalMovesFrom({ quantity: 3, face: 6 }, ante, 10_000, rich, true, DARE_MAX_QUANTITY),
    ).toEqual(['raise-quantity', 'challenge', 'fold']);
    expect(
      legalMovesFrom({ quantity: 8, face: 6 }, ante, 10_000, rich, true, DARE_MAX_QUANTITY),
    ).toEqual(['challenge', 'fold']);
    // Before any bid: open, peek (once) and fold — and never a raise.
    expect(legalMovesFrom(null, ante, 10_000, rich, false, DARE_MAX_QUANTITY)).toEqual([
      'bid',
      'peek',
      'fold',
    ]);
    expect(legalMovesFrom(null, ante, 10_000, rich, true, DARE_MAX_QUANTITY)).toEqual([
      'bid',
      'fold',
    ]);
  });
});

// ---------------------------------------------------------------------------
// §9.3 · The three gates
// ---------------------------------------------------------------------------

describe('T-135 · the gates', () => {
  it('gate 1 · an open hand blocks the world with ActionBlocked{active-dare-hand}', () => {
    const state = openHand(hangoutState(222)).state;
    for (const action of [
      { type: 'Travel', destinationId: 2, spendDie: 1 },
      { type: 'Trade', action: 'buy-fuel', fuelAmount: 1 },
      { type: 'Explore', spendDie: 1 },
      { type: 'VisitHangout', venue: 'rumor', spendDie: 1 },
    ] as const) {
      const step = applyPlayerAction(state, action);
      expect(step.events).toEqual([
        expect.objectContaining({
          type: 'ActionBlocked',
          actionType: action.type,
          reason: 'active-dare-hand',
        }),
      ]);
      // No die spent, no state moved, no throw.
      expect(step.state.player.dawnHand?.spent).toEqual(state.player.dawnHand?.spent);
      expect(step.state.dareHand).toEqual(state.dareHand);
    }
  });

  it('gate 1 · Dare, Reroll, Crew and Port stay exempt', () => {
    const state = openHand(hangoutState(222)).state;
    for (const action of [
      { type: 'Dare', move: 'fold' },
      { type: 'Reroll', dieIndex: 1 },
      { type: 'Crew', action: 'hire', roleId: 'crew-second' },
      { type: 'Port', action: 'buy', systemId: SUN_3 },
    ] as const) {
      const step = applyPlayerAction(state, action);
      expect(step.events.some((e) => e.type === 'ActionBlocked')).toBe(false);
    }
  });

  it('gate 3 · a Dare with no open hand is a typed no-op, NEVER a throw', () => {
    const state = hangoutState(222);
    expect(state.dareHand).toBeNull();
    for (const move of ['bid', 'raise-face', 'challenge', 'fold', 'peek'] as const) {
      const step = applyPlayerAction(state, { type: 'Dare', move, quantity: 2, face: 2 });
      expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
        venue: 'dare',
        failReason: 'no-dare-hand',
      });
      expect(step.state.dareHand).toBeNull();
      expect(step.state.player.credits).toBe(state.player.credits);
      expect(step.state.player.dawnHand?.spent).toEqual(state.player.dawnHand?.spent);
    }
  });
});

// ---------------------------------------------------------------------------
// §11 · Save version, migration, round trip
// ---------------------------------------------------------------------------

describe('T-135 · the hand survives serialization', () => {
  /** A MID-HAND state with a standing bid, non-zero escrow on BOTH sides, a
   *  revealed peek die and at least two history entries — built by playing, not by
   *  assembling a literal. */
  function midHand(): GameState {
    let state = openHand(hangoutState(222, [10, 20, 10, 10, 10])).state;
    state = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 1 }).state;
    expect(state.dareHand!.peekedDealerDie).not.toBeNull();
    state = applyPlayerAction(state, openingBid(state, 1)).state;
    expect(state.dareHand).not.toBeNull();
    const bid = state.dareHand!.bid!;
    state = applyPlayerAction(state, {
      type: 'Dare',
      move: 'raise-face',
      quantity: bid.quantity,
      face: bid.face + 1,
    }).state;
    expect(state.dareHand).not.toBeNull();
    expect(state.dareHand!.history.length).toBeGreaterThanOrEqual(2);
    expect(state.dareHand!.potPlayer).toBeGreaterThan(0);
    expect(state.dareHand!.potDealer).toBeGreaterThan(0);
    return state;
  }

  it('round-trips a mid-hand scene byte-identically, both hidden hands included', () => {
    const state = midHand();
    const s1 = serializeState(state);
    const restored = deserializeState(s1);
    expect(serializeState(restored)).toBe(s1);
    expect(restored.dareHand).toEqual(state.dareHand);
    expect(restored.dareHand!.playerDice).toEqual(state.dareHand!.playerDice);
    expect(restored.dareHand!.dealerDice).toEqual(state.dareHand!.dealerDice);
    expect(restored.dareHand!.peekedDealerDie).toEqual(state.dareHand!.peekedDealerDie);
  });

  it('the conservation invariant survives a reload (§2.4)', () => {
    const state = midHand();
    const restored = deserializeState(serializeState(state));
    expect(restored.player.credits + restored.dareHand!.potPlayer).toBe(
      state.player.credits + state.dareHand!.potPlayer,
    );
    // …and the reloaded hand plays on and settles for exactly the same money.
    const foldA = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    const foldB = applyPlayerAction(restored, { type: 'Dare', move: 'fold' });
    expect(foldB.state.player.credits).toBe(foldA.state.player.credits);
  });

  it('a full save envelope round-trips a mid-hand scene', () => {
    const state = midHand();
    const loaded = loadSave(createSave(state, 222));
    expect(loaded.state.dareHand).toEqual(state.dareHand);
  });

  // T-145 · THIS IS THE INTENDED VERSION MOVE LANDING, not a golden edited to make
  // a test pass. `CURRENT_SAVE_VERSION` went 14 → 15 with the fixed Liar's Dice
  // roster's persisted state (docs/LIARS-DICE-PROGRESSION_SPEC.md §5), so the pin
  // moves with it and MIGRATIONS[13]'s own behaviour is asserted unchanged beside
  // the new MIGRATIONS[14].
  // T-208 · 16 → 17 with the quest captains' declared home ports (`MIGRATIONS[16]`),
  // another intended landing. This pin tracks the current version; the claim under
  // test is still MIGRATIONS[13]'s unchanged behaviour below it.
  it('CURRENT_SAVE_VERSION tracks the current version and MIGRATIONS[13] still backfills dareHand: null', () => {
    expect(CURRENT_SAVE_VERSION).toBe(17);
    const v13 = JSON.parse(serializeState(createInitialState(9))) as Record<string, unknown>;
    delete v13.dareHand;
    expect('dareHand' in v13).toBe(false);
    const migrated = MIGRATIONS[13](v13) as { dareHand: unknown };
    expect(migrated.dareHand).toBeNull();
  });

  it('the migration is idempotent — a state already holding a hand keeps it exactly', () => {
    const state = midHand();
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>;
    const once = MIGRATIONS[13](raw) as { dareHand: unknown };
    const twice = MIGRATIONS[13](once) as { dareHand: unknown };
    expect(once.dareHand).toEqual(raw.dareHand);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('a v13 envelope CHAINS through 13→14→15 and loads with no open hand', () => {
    const state = createInitialState(9);
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>;
    delete raw.dareHand;
    delete (raw.player as Record<string, unknown>).liarsDiceBeaten;
    delete (raw.player as Record<string, unknown>).liarsDiceGamesPlayed;
    delete raw.liarsDicePurses;
    const v13 = JSON.stringify({ version: 13, state: raw, seed: 9 });
    const loaded = loadSave(v13);
    expect(loaded.state.dareHand).toBeNull();
    // …and the v14→v15 step ran too, in the same sequential loop.
    expect(loaded.state.player.liarsDiceBeaten).toEqual([]);
    expect(loaded.state.player.liarsDiceGamesPlayed).toBe(0);
    expect(Object.keys(loaded.state.liarsDicePurses)).toHaveLength(42);
  });
});

// ---------------------------------------------------------------------------
// §5.3 · The showdown arithmetic, in isolation
// ---------------------------------------------------------------------------

describe('T-135 · resolveChallenge counts across all eight dice', () => {
  it('the bidder wins iff the actual count reaches the claim', () => {
    const base = openHand(hangoutState(222)).state.dareHand!;
    const hand = { ...base, playerDice: [3, 3, 1, 2], dealerDice: [3, 5, 6, 6] };
    expect(resolveChallenge({ ...hand, bid: { quantity: 3, face: 3 } })).toEqual({
      actualCount: 3,
      bidderWins: true,
    });
    expect(resolveChallenge({ ...hand, bid: { quantity: 4, face: 3 } })).toEqual({
      actualCount: 3,
      bidderWins: false,
    });
    // No wildcards, permanently (§5.5): a held 1 satisfies only face 1.
    expect(resolveChallenge({ ...hand, bid: { quantity: 2, face: 6 } })).toEqual({
      actualCount: 2,
      bidderWins: true,
    });
  });
});

// ---------------------------------------------------------------------------
// T-145 · POOL A — THE FIXED ROSTER (`docs/LIARS-DICE-PROGRESSION_SPEC.md`)
//
// Same discipline as the rest of this file: every hand is driven through the REAL
// loop (`applyPlayerAction`), and the only direct writes to state are FIXTURE
// SETUP before the first action — a live purse, a beaten list — which is exactly
// what the shipped tests already do with `npc.credits`.
// ---------------------------------------------------------------------------

const SUN3_ROSTER = ['ld-1-1', 'ld-1-2', 'ld-1-3'] as const;

/** Open a ROSTER hand through the real resolver. */
function openRosterHand(state: GameState, opponentId: string, wager = 100) {
  return applyPlayerAction(state, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId,
    wager,
  });
}

/**
 * Play one roster hand to settlement through the real loop, and report the
 * conservation ledger across it. `script` is a move generator so a challenge can
 * answer whatever bid actually stands.
 */
function playRosterHand(
  seed: number,
  opponentId: string,
  systemId: number,
  mode: 'challenge' | 'fold' | 'timeout',
  wager = 100,
): {
  before: number;
  after: number;
  outcome: DareOutcome | null;
  events: GameEvent[];
  state: GameState;
} {
  let state = hangoutState(seed, [10, 10, 10, 10, 10], systemId);
  const before = state.player.credits + state.liarsDicePurses[opponentId];
  const opened = openRosterHand(state, opponentId, wager);
  state = opened.state;
  const events: GameEvent[] = [...opened.events];
  if (!state.dareHand) {
    return {
      before,
      after: state.player.credits + state.liarsDicePurses[opponentId],
      outcome: null,
      events,
      state,
    };
  }
  if (mode === 'timeout') {
    // The dusk clause settles an open hand as a player fold. It draws no rng.
    const dusk = endDay(state);
    state = dusk.state;
    events.push(...dusk.events);
  } else if (mode === 'fold') {
    const r = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    state = r.state;
    events.push(...r.events);
  } else {
    for (let step = 0; step < 24 && state.dareHand; step += 1) {
      const action: PlayerAction =
        state.dareHand.bid === null ? openingBid(state, 3, 2) : { type: 'Dare', move: 'challenge' };
      const r = applyPlayerAction(state, action);
      state = r.state;
      events.push(...r.events);
    }
  }
  const resolved = events.find(
    (e): e is Extract<GameEvent, { type: 'DareHandResolved' }> => e.type === 'DareHandResolved',
  );
  return {
    before,
    after: state.player.credits + state.liarsDicePurses[opponentId],
    outcome: resolved?.outcome ?? null,
    events,
    state,
  };
}

describe('T-145 · the roster is reachable, and its identity survives the round trip', () => {
  it('a roster opponent seats a hand tagged with the pool and a CONCRETE archetype', () => {
    const opened = openRosterHand(hangoutState(3), 'ld-1-3').state;
    const hand = opened.dareHand!;
    expect(hand.dealerId).toBe('ld-1-3');
    expect(hand.opponentKind).toBe('roster');
    // Seat 3 is the house — always 'optimal', never the string 'mixed'.
    expect(hand.opponentArchetype).toBe('optimal');
    expect(hand.dicePerSide).toBe(4);
    expect(hand.maxQuantity).toBe(8);
    expect(hand.bandMax).toBe(wagerBandFor(SUN_3).max);
    expect(hand.playerDice).toHaveLength(4);
    expect(hand.dealerDice).toHaveLength(4);
  });

  it('a MIXED row is resolved ONCE at open and stores the concrete arm', () => {
    // Seat 2 is 'mixed' at every port. Across seeds it must resolve to more than
    // one arm (or the archetype roll is not being drawn), and it must NEVER store
    // the literal 'mixed'.
    const arms = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const hand = openRosterHand(hangoutState(seed), 'ld-1-2').state.dareHand!;
      expect(hand.opponentArchetype).not.toBe('mixed');
      expect(['optimal', 'bad', 'random']).toContain(hand.opponentArchetype);
      arms.add(hand.opponentArchetype!);
    }
    expect(arms.size).toBeGreaterThan(1);
  });

  it('a roaming hand still carries the five fields, at their tier-0 values', () => {
    // §5.6 ruling A: T-145 writes all five at EVERY open. Behaviour-preserving on
    // the ladder axis — these are exactly the numbers the shipped engine computed.
    const hand = openHand(hangoutState(222)).state.dareHand!;
    expect(hand.opponentKind).toBe('roaming');
    expect(hand.opponentArchetype).toBeNull();
    expect(hand.dicePerSide).toBe(4);
    expect(hand.maxQuantity).toBe(8);
    expect(hand.bandMax).toBe(wagerBandFor(SUN_3).max);
  });

  it('a roster id at a SOCIAL venue is `no-opponent` — pool A has no NpcState', () => {
    // A determined consequence, not an oversight: meet/befriend/insult all call
    // `applyDisposition`, which needs a record to move.
    for (const venue of ['meet', 'befriend', 'insult'] as const) {
      const state = hangoutState(4);
      const before = state.player.dawnHand!.spent.slice();
      const r = applyPlayerAction(state, {
        type: 'VisitHangout',
        venue,
        opponentId: 'ld-1-1',
      });
      const fail = r.events.find((e) => e.type === 'HangoutEvent');
      expect(fail).toMatchObject({ failReason: 'no-opponent' });
      expect(r.state.player.dawnHand!.spent).toEqual(before);
    }
  });

  it('a roster id from ANOTHER port is `no-opponent` at this one', () => {
    const r = openRosterHand(hangoutState(4), 'ld-5-2');
    expect(r.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      failReason: 'no-opponent',
    });
    expect(r.state.dareHand).toBeNull();
  });
});

describe('T-145 · obligation 17 — a roster hand is ZERO-SUM against the persisted purse', () => {
  it('conserves credits + purse at EVERY outcome, through the real action loop', () => {
    const seen = new Set<DareOutcome>();
    for (const opponentId of SUN3_ROSTER) {
      for (let seed = 1; seed <= 40; seed += 1) {
        for (const mode of ['challenge', 'fold', 'timeout'] as const) {
          const run = playRosterHand(seed, opponentId, SUN_3, mode);
          // THE ROSTER IS NEVER A MINT (§7.1): every credit the player takes came
          // out of that opponent's own purse, and vice versa.
          expect(run.after, `${opponentId} seed ${seed} ${mode}`).toBe(run.before);
          expect(run.state.dareHand).toBeNull();
          if (run.outcome) seen.add(run.outcome);
        }
      }
    }
    // …and the sweep is not vacuous: it reached every terminal arm the outcome
    // union has. (Mira-9's seat 1 is the 'random' archetype, the only one that
    // folds at a meaningful rate — see below for the dealer-fold arm.)
    expect(seen).toContain('challenge-win');
    expect(seen).toContain('challenge-loss');
    expect(seen).toContain('player-fold');
    expect(seen).toContain('timeout-fold');
  });

  it('reaches the dealer-fold arm too, and conserves there as well', () => {
    // `bad` never folds and `optimal` folds only when `-potDealer` beats every
    // alternative, so the reliable source of a dealer fold is the 'random' seat —
    // Mira-9 (port 8) seat 1, the first port whose seat 1 is 'random' (§2.4).
    let dealerFolds = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      const run = playRosterHand(seed, 'ld-8-1', 8, 'challenge', 100);
      expect(run.after, `seed ${seed}`).toBe(run.before);
      if (run.outcome === 'dealer-fold') dealerFolds += 1;
    }
    expect(dealerFolds).toBeGreaterThan(0);
  });

  it('the purse actually MOVES — conservation is not two zeroes', () => {
    let moved = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      const run = playRosterHand(seed, 'ld-1-1', SUN_3, 'challenge');
      if (run.state.liarsDicePurses['ld-1-1'] !== 3000) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('a roaming hand never touches a roster purse', () => {
    const run = openHand(hangoutState(222)).state;
    expect(run.liarsDicePurses).toEqual(createInitialState(222).liarsDicePurses);
  });
});

describe('T-145 · the solvency clamp reads the LIVE purse (§7.2)', () => {
  it('caps the seed at whatever the opponent actually still holds', () => {
    const state = hangoutState(9);
    // FIXTURE SETUP, before any action — the same thing the shipped tests do with
    // `npc.credits` to make a poor dealer. The clamp must read THIS number, not
    // the authored 3,000 bankroll.
    state.liarsDicePurses['ld-1-1'] = 137;
    const band = wagerBandFor(SUN_3);
    const opened = openRosterHand(state, 'ld-1-1', band.max).state;
    expect(opened.dareHand!.seedWager).toBe(137);
    // Both sides posted it, so the purse is exactly emptied and the escrow holds
    // money that exists (§2.4).
    expect(opened.liarsDicePurses['ld-1-1']).toBe(0);
    expect(opened.dareHand!.potDealer).toBe(137);
  });

  it('sits BELOW the port’s band.min when that is all they have — no new branch (§7.3)', () => {
    const state = hangoutState(9, [10, 10, 10, 10, 10], 11); // Regulus-6, band 500-3000
    state.player.credits = 500_000;
    state.liarsDicePurses['ld-11-1'] = 40;
    const opened = openRosterHand(state, 'ld-11-1', 3000).state;
    // The shipped clamp is `max(0, min(max(requested, band.min), cap))`, and `cap`
    // has always been allowed to fall under `band.min` — this is already today's
    // behaviour for a poor ROAMING dealer, and nothing about it changed.
    expect(wagerBandFor(11).min).toBe(500);
    expect(opened.dareHand!.seedWager).toBe(40);
  });
});

describe('T-145 · obligation 18 — the broke refusal spends nothing and moves nothing', () => {
  it('a purse at zero refuses with `opponent-broke`, BEFORE the die is spent', () => {
    const state = hangoutState(9);
    state.liarsDicePurses['ld-1-2'] = 0;
    const credits = state.player.credits;
    const r = openRosterHand(state, 'ld-1-2', 100);

    expect(r.events.filter((e) => e.type === 'HangoutEvent')).toEqual([
      {
        type: 'HangoutEvent',
        day: state.day,
        venue: 'dare',
        opponentId: 'ld-1-2',
        failReason: 'opponent-broke',
      },
    ]);
    // Nothing about the scene was started: no hand event of any kind.
    expect(r.events.some((e) => e.type === 'DareHandStarted')).toBe(false);
    // A refusal must never burn a dawn die — the invariant every pre-spend refusal
    // in `resolveVisitHangout` upholds.
    expect(r.state.player.dawnHand!.spent).toEqual([false, false, false, false, false]);
    expect(r.state.dareHand).toBeNull();
    expect(r.state.player.credits).toBe(credits);
    expect(r.state.liarsDicePurses['ld-1-2']).toBe(0);
  });

  it('a NEGATIVE purse refuses the same way, and the OTHER two seats still sit', () => {
    const state = hangoutState(9);
    state.liarsDicePurses['ld-1-2'] = -5;
    expect(openRosterHand(state, 'ld-1-2', 100).events[0]).toMatchObject({
      failReason: 'opponent-broke',
    });
    expect(openRosterHand(state, 'ld-1-1', 100).state.dareHand).not.toBeNull();
    expect(openRosterHand(state, 'ld-1-3', 100).state.dareHand).not.toBeNull();
  });
});

describe('T-145 · obligation 19a — a beaten roster opponent is recorded EXACTLY ONCE', () => {
  /** The first seed on which a scripted challenge hand against `opponentId` ends
   *  in a PLAYER WIN. Scanned rather than pinned, so the test states the property
   *  rather than depending on a lucky constant. */
  function seedOfPlayerWin(opponentId: string, systemId = SUN_3): number {
    for (let seed = 1; seed <= 400; seed += 1) {
      const run = playRosterHand(seed, opponentId, systemId, 'challenge');
      if (run.outcome === 'challenge-win' || run.outcome === 'dealer-fold') return seed;
    }
    throw new Error(`no player win found against ${opponentId} in 400 seeds`);
  }

  it('a win pushes the id; a REMATCH win against the same opponent does not duplicate', () => {
    const seed = seedOfPlayerWin('ld-1-1');
    const first = playRosterHand(seed, 'ld-1-1', SUN_3, 'challenge');
    expect(first.state.player.liarsDiceBeaten).toEqual(['ld-1-1']);

    // THE REMATCH, played through the real loop off the state the first hand
    // returned — a fresh dawn hand is the only fixture, so the second hand is the
    // same scene a player would sit down to on the next day.
    let state = first.state;
    state.player.dawnHand = {
      dice: [10, 10, 10, 10, 10],
      spent: [false, false, false, false, false],
    } satisfies DawnHand;
    const purseBefore = state.liarsDicePurses['ld-1-1'];
    const creditsBefore = state.player.credits;
    const opened = openRosterHand(state, 'ld-1-1', 100);
    state = opened.state;
    for (let step = 0; step < 24 && state.dareHand; step += 1) {
      state = applyPlayerAction(
        state,
        state.dareHand.bid === null ? openingBid(state, 3, 2) : { type: 'Dare', move: 'challenge' },
      ).state;
    }
    // The rematch is LEGAL and PAYS — it simply records nothing (§1 rule 3a).
    expect(state.player.credits + state.liarsDicePurses['ld-1-1']).toBe(
      creditsBefore + purseBefore,
    );
    expect(state.player.liarsDiceBeaten).toEqual(['ld-1-1']);
    expect(state.player.liarsDiceBeaten).toHaveLength(1);
  });

  it('a LOSS records nothing at all', () => {
    let losses = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const run = playRosterHand(seed, 'ld-1-3', SUN_3, 'challenge');
      if (run.outcome === 'challenge-loss') {
        losses += 1;
        expect(run.state.player.liarsDiceBeaten).toEqual([]);
      }
      // A player fold never records either.
      const folded = playRosterHand(seed, 'ld-1-3', SUN_3, 'fold');
      expect(folded.state.player.liarsDiceBeaten).toEqual([]);
    }
    expect(losses).toBeGreaterThan(0);
  });

  it('the list is FIRST-DEFEAT ORDER across different opponents', () => {
    // Two distinct wins, in the order they happened — not sorted, because it is a
    // career record and a sort would destroy information.
    const third = seedOfPlayerWin('ld-1-3');
    let state = playRosterHand(third, 'ld-1-3', SUN_3, 'challenge').state;
    expect(state.player.liarsDiceBeaten).toEqual(['ld-1-3']);
    // T-197 · EACH ATTEMPT IS A NEW DAY. §4b caps opens per day (one at tier 0),
    // so a search that re-opens a hand until it wins one has to roll the day's
    // allowance over between attempts — through the engine's own dawn-reset rule,
    // never by widening the cap. The dawn-hand refresh this loop used to carry is
    // gone with the die: opening a hand costs no die any more, so the hand was
    // never what ran out here.
    resetDailyHangoutCaps(state.player);
    for (let seed = 1; seed <= 400 && state.player.liarsDiceBeaten.length < 2; seed += 1) {
      let attempt = openRosterHand(state, 'ld-1-1', 100).state;
      for (let step = 0; step < 24 && attempt.dareHand; step += 1) {
        attempt = applyPlayerAction(
          attempt,
          attempt.dareHand.bid === null
            ? openingBid(attempt, 3, 2)
            : { type: 'Dare', move: 'challenge' },
        ).state;
      }
      resetDailyHangoutCaps(attempt.player);
      state = attempt;
    }
    expect(state.player.liarsDiceBeaten).toEqual(['ld-1-3', 'ld-1-1']);
  });
});

describe('T-145 · obligation 20a — a ROAMING win never touches liarsDiceBeaten', () => {
  it('over many seeds and every outcome, pool B writes nothing to the beaten set', () => {
    let wins = 0;
    for (let seed = 1; seed <= 80; seed += 1) {
      let state = openHand(hangoutState(seed)).state;
      for (let step = 0; step < 24 && state.dareHand; step += 1) {
        state = applyPlayerAction(
          state,
          state.dareHand.bid === null
            ? openingBid(state, 3, 2)
            : { type: 'Dare', move: 'challenge' },
        ).state;
      }
      if (state.player.credits > 20_000) wins += 1;
      // §1 rule 3: pool B respawns its willingness to play every day, so counting
      // it would turn a finite authored gauntlet into a grind timer.
      expect(state.player.liarsDiceBeaten, `seed ${seed}`).toEqual([]);
    }
    expect(wins).toBeGreaterThan(0);
  });
});

describe('T-145 · roster hands apply NO disposition (§7.6)', () => {
  it('emit no DispositionChanged and carry dispositionDelta 0, at every outcome', () => {
    for (const mode of ['challenge', 'fold', 'timeout'] as const) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const run = playRosterHand(seed, 'ld-1-2', SUN_3, mode);
        expect(run.events.some((e) => e.type === 'DispositionChanged')).toBe(false);
        const resolved = run.events.find((e) => e.type === 'DareHandResolved');
        expect(resolved).toMatchObject({ dispositionDelta: 0 });
      }
    }
  });

  it('the terminal HangoutEvent is UNCHANGED in shape (§7.7)', () => {
    // Nine shipped readers key on it and none of them should learn about the
    // roster. The pool split is derivable from `opponentId`'s `ld-` prefix alone.
    const run = playRosterHand(1, 'ld-1-1', SUN_3, 'fold');
    const terminal = run.events.filter((e) => e.type === 'HangoutEvent').at(-1)!;
    expect(Object.keys(terminal).sort()).toEqual(
      ['type', 'day', 'venue', 'opponentId', 'wager', 'playerWon', 'creditsDelta'].sort(),
    );
    expect(terminal).toMatchObject({ venue: 'dare', opponentId: 'ld-1-1', playerWon: false });
  });

  it('a ROAMING hand still applies disposition exactly as before', () => {
    // Obligation 6's other half: nothing about pool B moved.
    const run = openHand(hangoutState(1)).state;
    const r = applyPlayerAction(run, { type: 'Dare', move: 'fold' });
    const resolved = r.events.find((e) => e.type === 'DareHandResolved')!;
    expect(resolved).toMatchObject({
      dispositionDelta: venueParamsFor(SUN_3, 'dare').dispositionOnFold,
    });
  });
});

describe('T-145 · obligation 26 — the authored catchphrases ride the events', () => {
  it('table talk rides DareHandStarted, and only for a roster hand', () => {
    const roster = openRosterHand(hangoutState(3), 'ld-1-1');
    const started = roster.events.find((e) => e.type === 'DareHandStarted')!;
    expect(started).toMatchObject({
      opponentLine: LIARS_DICE_OPPONENTS[1][0].lines.tableTalk,
      dicePerSide: 4,
    });

    const roaming = openHand(hangoutState(222));
    const roamingStarted = roaming.events.find((e) => e.type === 'DareHandStarted')!;
    expect('opponentLine' in roamingStarted).toBe(false);
    // …but the dice count rides BOTH, because the pane cannot render a table
    // without it.
    expect(roamingStarted).toMatchObject({ dicePerSide: 4 });
  });

  it('the win line rides a hand the OPPONENT took; the lose line one they lost', () => {
    const row = LIARS_DICE_OPPONENTS[1][0];
    let sawWin = false;
    let sawLose = false;
    for (let seed = 1; seed <= 80; seed += 1) {
      const run = playRosterHand(seed, 'ld-1-1', SUN_3, 'challenge');
      const resolved = run.events.find(
        (e): e is Extract<GameEvent, { type: 'DareHandResolved' }> => e.type === 'DareHandResolved',
      )!;
      const playerWon = resolved.outcome === 'challenge-win' || resolved.outcome === 'dealer-fold';
      // THEIR win line when THEY won; their lose line when they lost.
      expect(resolved.opponentLine).toBe(playerWon ? row.lines.lose : row.lines.win);
      if (playerWon) sawLose = true;
      else sawWin = true;
    }
    expect(sawWin && sawLose).toBe(true);
  });

  it('a ROAMING resolution carries no opponentLine', () => {
    const run = openHand(hangoutState(1)).state;
    const r = applyPlayerAction(run, { type: 'Dare', move: 'fold' });
    const resolved = r.events.find((e) => e.type === 'DareHandResolved')!;
    expect('opponentLine' in resolved).toBe(false);
  });
});

describe('T-145 · obligation 7(b) — the roster policy cannot read the player’s hand', () => {
  it('varying the player’s hidden dice never changes the archetype’s moves', () => {
    // The same experiment `dealerMove` already answers, extended verbatim to
    // `archetypeMove`. Seed, port, opponent, dealer dice and the player's SCRIPT
    // are fixed; only the hidden player dice vary. The one poke is writing the
    // hidden hand BEFORE the first move — setting up the experiment, not driving
    // the scene.
    const variants = blindVariants();
    expect(variants.length).toBeGreaterThanOrEqual(20);
    assertBlindOpenIsLegal(variants);

    for (const opponentId of SUN3_ROSTER) {
      const signatures = variants.map((playerDice) => {
        let state = openRosterHand(hangoutState(222), opponentId).state;
        const fixedDealerDice = [...state.dareHand!.dealerDice];
        const archetype = state.dareHand!.opponentArchetype;
        state.dareHand!.playerDice = [...playerDice]; // the experiment's only poke
        const script = ['bid', 'raise-face', 'raise-quantity'] as const;
        let endedAfter: number | null = null;
        for (let i = 0; i < script.length; i += 1) {
          if (!state.dareHand) {
            endedAfter = i;
            break;
          }
          const move = script[i];
          const bid = state.dareHand.bid;
          const quantity =
            move === 'bid'
              ? BLIND_OPEN_QUANTITY
              : move === 'raise-face'
                ? bid!.quantity
                : bid!.quantity + 1;
          const face = move === 'bid' ? 3 : move === 'raise-quantity' ? bid!.face : bid!.face + 1;
          state = applyPlayerAction(state, { type: 'Dare', move, quantity, face }).state;
        }
        const dealerMoves = state.dareHand
          ? state.dareHand.history.filter((h) => h.actor === 'dealer')
          : [];
        return JSON.stringify({ dealerMoves, endedAfter, fixedDealerDice, archetype });
      });
      expect(new Set(signatures).size, opponentId).toBe(1);
    }
  });
});

describe('T-145 · obligation 4/5 — the v14→v15 migration', () => {
  /** A v14-shaped raw state: today's serialization with the three T-145 keys
   *  stripped, which is exactly what an engine that predates the roster wrote. */
  function asV14(state: GameState): Record<string, unknown> {
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>;
    delete raw.liarsDicePurses;
    const player = raw.player as Record<string, unknown>;
    delete player.liarsDiceBeaten;
    delete player.liarsDiceGamesPlayed;
    if (raw.dareHand) {
      const hand = raw.dareHand as Record<string, unknown>;
      for (const key of [
        'opponentKind',
        'opponentArchetype',
        'dicePerSide',
        'maxQuantity',
        'bandMax',
      ]) {
        delete hand[key];
      }
    }
    return raw;
  }

  it('obligation 5 — createInitialState seeds 42 purses at the AUTHORED bankrolls', () => {
    const purses = createInitialState(7).liarsDicePurses;
    const rows = Object.values(LIARS_DICE_OPPONENTS).flat();
    expect(Object.keys(purses)).toHaveLength(42);
    for (const row of rows) expect(purses[row.id], row.id).toBe(row.bankroll);
    expect(Object.values(purses).reduce((a, b) => a + b, 0)).toBe(280_800);
    expect(createInitialState(7).player.liarsDiceBeaten).toEqual([]);
    expect(createInitialState(7).player.liarsDiceGamesPlayed).toBe(0);
  });

  it('case 1 — a v14 save with NO open hand backfills all three keys', () => {
    const v14 = asV14(createInitialState(9));
    expect('liarsDicePurses' in v14).toBe(false);
    const migrated = MIGRATIONS[14](v14) as {
      liarsDicePurses: Record<string, number>;
      player: { liarsDiceBeaten: string[]; liarsDiceGamesPlayed: number };
      dareHand: unknown;
    };
    // STATEMENTS OF FACT about a v14 save, not defaults: no roster existed then.
    expect(migrated.player.liarsDiceBeaten).toEqual([]);
    expect(migrated.player.liarsDiceGamesPlayed).toBe(0);
    expect(migrated.dareHand).toBeNull();
    expect(Object.keys(migrated.liarsDicePurses)).toHaveLength(42);
    for (const row of Object.values(LIARS_DICE_OPPONENTS).flat()) {
      expect(migrated.liarsDicePurses[row.id], row.id).toBe(row.bankroll);
    }
    // …and it round-trips through the STRICT schema.
    const loaded = loadSave(JSON.stringify({ version: 14, state: v14, seed: 9 }));
    expect(Object.keys(loaded.state.liarsDicePurses)).toHaveLength(42);
    expect(loaded.state.player.liarsDiceBeaten).toEqual([]);
  });

  it('case 2 — a v14 save with a MID-HAND open dareHand keeps every old key exactly', () => {
    // Built by PLAYING, not by assembling a literal: a standing bid, non-zero
    // escrow on both sides, a used peek and a non-empty history.
    let live = openHand(hangoutState(222, [10, 20, 10, 10, 10])).state;
    live = applyPlayerAction(live, { type: 'Dare', move: 'peek', spendDie: 1 }).state;
    live = applyPlayerAction(live, openingBid(live, 1)).state;
    const bid = live.dareHand!.bid!;
    live = applyPlayerAction(live, {
      type: 'Dare',
      move: 'raise-face',
      quantity: bid.quantity,
      face: bid.face + 1,
    }).state;
    expect(live.dareHand!.peekUsed).toBe(true);
    expect(live.dareHand!.history.length).toBeGreaterThanOrEqual(2);
    expect(live.dareHand!.potDealer).toBeGreaterThan(0);

    const v14 = asV14(live);
    const oldHand = { ...(v14.dareHand as Record<string, unknown>) };
    const migrated = MIGRATIONS[14](v14) as { dareHand: Record<string, unknown> };

    // The five new keys, at TIER-0 values derived from RULES, not literals.
    expect(migrated.dareHand.opponentKind).toBe('roaming');
    expect(migrated.dareHand.opponentArchetype).toBeNull();
    expect(migrated.dareHand.dicePerSide).toBe(dicePerSideForTier(0));
    expect(migrated.dareHand.maxQuantity).toBe(maxQuantityForDice(dicePerSideForTier(0)));
    expect(migrated.dareHand.bandMax).toBe(wagerBandFor(live.dareHand!.systemId).max);
    // EVERY pre-existing key byte-identical — hidden dice and escrow included.
    for (const [key, value] of Object.entries(oldHand)) {
      expect(migrated.dareHand[key], key).toEqual(value);
    }

    const loaded = loadSave(JSON.stringify({ version: 14, state: v14, seed: 222 }));
    expect(loaded.state.dareHand!.dealerDice).toEqual(live.dareHand!.dealerDice);
    expect(loaded.state.dareHand!.potPlayer).toBe(live.dareHand!.potPlayer);
    expect(loaded.state.dareHand!.opponentKind).toBe('roaming');
  });

  it('case 3 — the migration is IDEMPOTENT, and preserves a played-down purse', () => {
    const live = openRosterHand(hangoutState(3), 'ld-1-1', 250).state;
    expect(live.liarsDicePurses['ld-1-1']).toBe(3000 - 250);
    const raw = JSON.parse(serializeState(live)) as Record<string, unknown>;
    const once = MIGRATIONS[14](raw) as Record<string, unknown>;
    const twice = MIGRATIONS[14](once) as Record<string, unknown>;
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
    // `seedLiarsDicePurses` PRESERVES EVERY EXISTING KEY — which is what makes it
    // idempotent and what lets a later content pass add a fourth seat with no
    // further save version.
    expect((once.liarsDicePurses as Record<string, number>)['ld-1-1']).toBe(2750);
    expect(seedLiarsDicePurses({ 'ld-1-1': 2750 })['ld-1-1']).toBe(2750);
    expect(seedLiarsDicePurses({ 'ld-1-1': 2750 })['ld-1-2']).toBe(5000);
    // A brand-new opponent id an older save has never seen arrives at its authored
    // bankroll through the very same call.
    expect(Object.keys(seedLiarsDicePurses({ 'ld-1-1': 2750 }))).toHaveLength(42);
  });

  it('a full save envelope round-trips a roster mid-hand scene', () => {
    let live = openRosterHand(hangoutState(5), 'ld-1-2', 250).state;
    live = applyPlayerAction(live, openingBid(live, 3, 2)).state;
    if (!live.dareHand) return; // the dealer ended it; the no-hand case is covered above
    const loaded = loadSave(createSave(live, 5));
    expect(loaded.state.dareHand).toEqual(live.dareHand);
    expect(loaded.state.liarsDicePurses).toEqual(live.liarsDicePurses);
    expect(loaded.state.player.liarsDiceBeaten).toEqual(live.player.liarsDiceBeaten);
  });

  it('deserializeState performs the SAME backfill as the migration', () => {
    const v14 = asV14(createInitialState(11));
    const restored = deserializeState(JSON.stringify(v14));
    expect(restored.player.liarsDiceBeaten).toEqual([]);
    expect(restored.player.liarsDiceGamesPlayed).toBe(0);
    expect(Object.keys(restored.liarsDicePurses)).toHaveLength(42);
    expect(restored.liarsDicePurses['ld-11-3']).toBe(24_000);
  });
});

// ---------------------------------------------------------------------------
// T-160 · §16.2 SHAPE (b) — THE OPENING FLOOR, fixing finding F-137-1
// (`docs/LIARS-DICE_REDESIGN.md` §16.2 / §17)
//
// The defect these tests pin: `resolveChallenge` counts the claimed face across
// ALL the dice in play, so `actualCount >= own(face)` ALWAYS. An opening claim at
// or under `own(face)` therefore could not be false, and T-137 measured 15,235 of
// 15,235 openers (100.00%) guaranteed true. `minOpeningQuantity` closes it at the
// one entrance the §5.2 pin left open.
// ---------------------------------------------------------------------------

describe('T-160 · the opening floor (§16.2 shape (b), fixing F-137-1)', () => {
  it('is the arithmetic §16.2 asked for: own + 1', () => {
    for (let own = 0; own <= 6; own += 1) {
      expect(minOpeningQuantity(own)).toBe(own + 1);
    }
  });

  it('refuses an opening claim at or under what the bidder holds, and accepts own+1', () => {
    // Directly against the rule, at every shipped dice-per-side (§4.6's 4 | 5 | 6),
    // so the fix is proven on the ladder and not only at tier 0.
    for (const dicePerSide of [4, 5, 6]) {
      const maxQuantity = maxQuantityForDice(dicePerSide);
      for (let own = 0; own <= dicePerSide; own += 1) {
        for (let quantity = 1; quantity <= own; quantity += 1) {
          expect(
            isLatticeMove(null, 'bid', quantity, 3, maxQuantity, own),
            `dice ${dicePerSide}, own ${own}, claim ${quantity}`,
          ).toBe(false);
        }
        expect(
          isLatticeMove(null, 'bid', minOpeningQuantity(own), 3, maxQuantity, own),
          `dice ${dicePerSide}, own ${own}, floor`,
        ).toBe(true);
      }
    }
  });

  it('TOTALITY: every face still has a legal opening, even holding all six', () => {
    // The worst case the rule can be handed — six dice showing all six faces, so
    // `own(f) = 1` on every face and the floor is 2 everywhere. The proof is
    // `own(f) <= dicePerSide` ⇒ `own(f) + 1 <= dicePerSide + 1 <= 2 × dicePerSide
    // = maxQuantity`; this is that proof, executed.
    const allSix = [1, 2, 3, 4, 5, 6];
    const maxQuantity = maxQuantityForDice(6);
    for (let face = 1; face <= 6; face += 1) {
      const own = allSix.filter((d) => d === face).length;
      expect(own).toBe(1);
      const floor = minOpeningQuantity(own);
      expect(floor).toBeLessThanOrEqual(maxQuantity);
      expect(isLatticeMove(null, 'bid', floor, face, maxQuantity, own), `face ${face}`).toBe(true);
    }
    // …and at four dice, where a captain can hold all four of one face.
    const allOnes = [1, 1, 1, 1];
    const maxFour = maxQuantityForDice(4);
    const ownOnes = allOnes.filter((d) => d === 1).length;
    expect(minOpeningQuantity(ownOnes)).toBeLessThanOrEqual(maxFour);
    expect(isLatticeMove(null, 'bid', minOpeningQuantity(ownOnes), 1, maxFour, ownOnes)).toBe(true);
  });

  it('the resolver REFUSES a risk-free opener and SPENDS NOTHING', () => {
    let state = openHand(hangoutState(222)).state;
    const hand = state.dareHand!;
    // The face the captain holds most of — the exact claim `planDareMove` used to
    // make, and the one F-137-1 is about.
    let bestFace = 1;
    for (let face = 1; face <= 6; face += 1) {
      if (
        hand.playerDice.filter((d) => d === face).length >=
        hand.playerDice.filter((d) => d === bestFace).length
      )
        bestFace = face;
    }
    const own = hand.playerDice.filter((d) => d === bestFace).length;
    expect(
      own,
      'four d6 over six faces always leaves a modal face of at least one',
    ).toBeGreaterThanOrEqual(1);

    const creditsBefore = state.player.credits;
    const potPlayerBefore = hand.potPlayer;
    const potDealerBefore = hand.potDealer;
    const diceBefore = JSON.stringify(state.player.dawnHand);

    const step = applyPlayerAction(state, {
      type: 'Dare',
      move: 'bid',
      quantity: own,
      face: bestFace,
    });
    expect(step.events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      failReason: 'illegal-dare-move',
    });
    // A REFUSAL SPENDS NOTHING: credits, both escrow pots and the dawn hand are
    // byte-identical, and the hand is still open with no claim on it.
    expect(step.state.player.credits).toBe(creditsBefore);
    expect(step.state.dareHand!.potPlayer).toBe(potPlayerBefore);
    expect(step.state.dareHand!.potDealer).toBe(potDealerBefore);
    expect(JSON.stringify(step.state.player.dawnHand)).toBe(diceBefore);
    expect(step.state.dareHand!.bid).toBeNull();

    // …and the claim ONE higher is accepted, so the refusal is the rule and not a
    // bound.
    state = applyPlayerAction(state, {
      type: 'Dare',
      move: 'bid',
      quantity: minOpeningQuantity(own),
      face: bestFace,
    }).state;
    expect(state.dareHand === null || state.dareHand.history.length > 0).toBe(true);
  });

  it('THE DEFECT IS GONE AT ITS SOURCE: openers are no longer true by construction', () => {
    // The headline F-137-1 measured, re-measured. `resolveChallenge` counts across
    // ALL the dice in play, so an opener is GUARANTEED TRUE iff
    // `quantity <= own(face)`. Over a large sample of real hands opened through
    // the real loop, that must now be ZERO — and the FALSE-opener rate must be
    // strictly positive, or the rule would have moved nothing but the arithmetic.
    let openers = 0;
    let guaranteedTrue = 0;
    let actuallyFalse = 0;
    for (let seed = 1; seed <= 2000; seed += 1) {
      const opened = openHand(hangoutState(seed)).state;
      const hand = opened.dareHand;
      if (!hand) continue;
      let bestFace = 1;
      for (let face = 1; face <= 6; face += 1) {
        if (
          hand.playerDice.filter((d) => d === face).length >=
          hand.playerDice.filter((d) => d === bestFace).length
        )
          bestFace = face;
      }
      const own = hand.playerDice.filter((d) => d === bestFace).length;
      const quantity = minOpeningQuantity(own);
      openers += 1;
      if (quantity <= own) guaranteedTrue += 1;
      const actual = [...hand.playerDice, ...hand.dealerDice].filter((d) => d === bestFace).length;
      if (actual < quantity) actuallyFalse += 1;
    }
    expect(openers).toBeGreaterThanOrEqual(2000);
    expect(guaranteedTrue, 'T-137 measured 15,235 / 15,235 here').toBe(0);
    expect(actuallyFalse, 'an opening claim is now a real claim that can be false').toBeGreaterThan(
      0,
    );
  });

  it('the DEALER is unaffected: it is never asked to open (§9.9 ruling 1)', () => {
    // Asserted rather than argued in prose. Both house policies throw on a null
    // bid, which is what makes "the dealer never opens" a property of the code.
    expect(() =>
      dealerMove({
        dealerDice: [1, 2, 3, 4],
        dicePerSide: 4,
        bid: null,
        bidder: null,
        dealerGuile: 0,
        ante: 10,
        headroom: 1000,
        dealerCredits: 1000,
        roll: 0,
      }),
    ).toThrow(/no standing bid/);
  });
});

// ---------------------------------------------------------------------------
// T-177 · THE FOLD RULING (F-160-3) — `docs/LIARS-DICE-DECISIONS.md` LD-26,
// `docs/LIARS-DICE_REDESIGN.md` §16.3 / §17.7.
//
// The ruling is that the two currencies PARTITION: FOLD is never the better
// CREDIT play (§16.3's derivation, untouched) and is always the better
// DISPOSITION play at every state where the credit comparison is not a tie. So
// it is a PRICED TRADE, not a dead move. Both halves are asserted here from the
// live constants and the live probability model — nothing below is a literal,
// and that is deliberate: if a later task retunes a disposition constant or adds
// a dice tier, this file goes red and the ruling is RE-OPENED rather than
// silently voided.
// ---------------------------------------------------------------------------

describe('T-177 · the FOLD ruling — the two currencies partition', () => {
  // FOLD is the disposition-better play  ⟺  P_false > (LOSS − FOLD)/(LOSS − WIN).
  const crossover =
    (DARE_LOSS_DISPOSITION - DARE_FOLD_DISPOSITION) /
    (DARE_LOSS_DISPOSITION - DARE_WIN_DISPOSITION);

  it('the disposition crossover is strictly interior — FOLD is neither always nor never disposition-better', () => {
    // A crossover at 0 would mean FOLD always wins the second currency (and the
    // ruling would be trivial); at 1 it would mean it never does (and FOLD would
    // be dead in BOTH currencies, which is what F-160-3 feared). It is interior,
    // so the ruling is a real partition rather than a restatement.
    expect(crossover).toBeGreaterThan(0);
    expect(crossover).toBeLessThan(1);
    // …and it is a statement about the three constants, checked against the
    // definition rather than against a copy of it.
    const dispFold = DARE_FOLD_DISPOSITION;
    const dispChallengeAt = (pFalse: number) =>
      pFalse * DARE_WIN_DISPOSITION + (1 - pFalse) * DARE_LOSS_DISPOSITION;
    expect(dispChallengeAt(crossover)).toBeCloseTo(dispFold, 12);
    expect(dispChallengeAt(crossover + 0.01)).toBeLessThan(dispFold);
    expect(dispChallengeAt(crossover - 0.01)).toBeGreaterThan(dispFold);
  });

  it('THE RULING: every reachable non-zero P_false clears the crossover, at every shipped tier', () => {
    // `P_false = 1 - probAtLeast(q - own(face), dicePerSide)`, so it is NOT dense
    // on [0,1]: `q - own <= 0` gives exactly 0 (the claim is true by
    // construction — and there the CREDIT comparison is a tie, so nothing is
    // given up by challenging), and `q - own >= 1` gives at least
    // `1 - probAtLeast(1, u) = (5/6)^u`, minimised at the ladder's widest hand.
    // The reachable spectrum is therefore `{0} ∪ [(5/6)^u, 1]`.
    //
    // ***THIS ASSERTION IS THE RULING.*** If a future task retunes any of
    // DARE_FOLD_DISPOSITION / DARE_WIN_DISPOSITION / DARE_LOSS_DISPOSITION, or
    // adds a dice tier wider than six, this goes red — and that is the intended
    // behaviour: LD-26 is re-opened and re-argued, not quietly voided. Do NOT
    // move the bar to make it pass (N4/N10, `docs/VERSIONING.md`).
    for (const tier of [0, 1, 2]) {
      const u = dicePerSideForTier(tier);
      const smallestNonZero = 1 - probAtLeast(1, u);
      expect(smallestNonZero, `tier ${tier}, u = ${u}`).toBeGreaterThan(crossover);
      // Non-vacuity: the zero end of the spectrum is genuinely reachable too.
      expect(1 - probAtLeast(0, u)).toBe(0);
    }
  });

  it('the CREDIT half, as a test rather than only prose: EV_challenge − EV_fold = P_false · (potPlayer + potDealer) ≥ 0', () => {
    // §16.3's derivation, re-run over a randomised sweep. The escrow is debited
    // at CONTRIBUTION time, so a fold forfeits `potPlayer` with certainty and a
    // challenge costs nothing to make: EV_fold = −potPlayer, and
    // EV_challenge = P_false·potDealer − (1 − P_false)·potPlayer.
    const rng = new SeededRng(20_260_806);
    let strict = 0;
    let equal = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const u = dicePerSideForTier(i % 3);
      const dice = Array.from({ length: u }, () => rng.d6());
      const face = 1 + Math.floor(rng.next() * 6);
      const quantity = 1 + Math.floor(rng.next() * maxQuantityForDice(u));
      const own = dice.filter((d) => d === face).length;
      const potPlayer = Math.floor(rng.next() * 3000);
      const potDealer = Math.floor(rng.next() * 3000);
      const pFalse = 1 - probAtLeast(quantity - own, u);
      const evFold = -potPlayer;
      const evChallenge = pFalse * potDealer - (1 - pFalse) * potPlayer;
      const where = `u=${u} q=${quantity} own=${own} pots=${potPlayer}/${potDealer}`;
      expect(evChallenge - evFold, where).toBeCloseTo(pFalse * (potPlayer + potDealer), 9);
      expect(evChallenge - evFold, where).toBeGreaterThanOrEqual(0);
      // …with equality IFF P_false is 0 or the whole pot is empty. The pot is a
      // real degree of freedom here, so both directions are stated.
      if (pFalse === 0 || potPlayer + potDealer === 0) {
        expect(evChallenge - evFold, where).toBe(0);
        equal += 1;
      } else {
        expect(evChallenge - evFold, where).toBeGreaterThan(0);
        strict += 1;
      }
    }
    // Non-vacuity: BOTH branches were reached.
    expect(strict).toBeGreaterThan(0);
    expect(equal).toBeGreaterThan(0);
  });

  it('the two together: wherever FOLD loses credits it WINS disposition — the partition, stated as one assertion', () => {
    // The join of the two halves above, over the same reachable spectrum. For
    // every state with a non-empty pot: either P_false = 0 (credits TIE, so FOLD
    // gives up nothing measurable, and the disposition read is the only live
    // difference — challenge wins it) or P_false >= (5/6)^u > crossover (FOLD
    // strictly loses credits AND strictly wins disposition). There is no state
    // where FOLD loses both, which is exactly what "priced trade, not a dead
    // move" means.
    const rng = new SeededRng(177);
    let tiedCredits = 0;
    let pricedTrades = 0;
    for (let i = 0; i < 20_000; i += 1) {
      const u = dicePerSideForTier(i % 3);
      const dice = Array.from({ length: u }, () => rng.d6());
      const face = 1 + Math.floor(rng.next() * 6);
      const quantity = 1 + Math.floor(rng.next() * maxQuantityForDice(u));
      const own = dice.filter((d) => d === face).length;
      const pFalse = 1 - probAtLeast(quantity - own, u);
      const dispChallenge = pFalse * DARE_WIN_DISPOSITION + (1 - pFalse) * DARE_LOSS_DISPOSITION;
      const where = `u=${u} q=${quantity} own=${own} pFalse=${pFalse}`;
      if (pFalse === 0) {
        // Credits tie; disposition strictly prefers the challenge.
        expect(dispChallenge, where).toBeGreaterThan(DARE_FOLD_DISPOSITION);
        tiedCredits += 1;
      } else {
        // Credits strictly prefer the challenge; disposition strictly prefers
        // the fold. That opposition IS the price.
        expect(pFalse, where).toBeGreaterThan(crossover);
        expect(dispChallenge, where).toBeLessThan(DARE_FOLD_DISPOSITION);
        pricedTrades += 1;
      }
    }
    expect(tiedCredits).toBeGreaterThan(0);
    expect(pricedTrades).toBeGreaterThan(0);
  });
});
