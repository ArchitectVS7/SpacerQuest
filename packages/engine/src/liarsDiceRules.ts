/**
 * T-135 · THE LIAR'S DICE RULES — the engine half of owner ruling D2
 * (`docs/LIARS-DICE_REDESIGN.md` §4, §5, §9).
 *
 * Content owns the INSTANCE (each port's wager band, its Peek DC, its three
 * disposition arms — `packages/content/src/portHangouts.ts`, and the three global
 * numbers in `packages/content/src/hangout.ts`). This module owns the RULES that
 * read them: what a raise costs, how much room a side has left, which moves are
 * legal, who wins a showdown, and how the house dealer plays. The `combatRules.ts`
 * / `exploreOutcomes.ts` / `hangoutRules.ts` precedent.
 *
 * PURE. Nothing here mutates a `GameState`, draws from an rng, or emits an event —
 * `actions/dare.ts` does all three. `dealerMove` even takes its randomness as a
 * pre-drawn `roll`, so the policy is a total function of its inputs and can be
 * unit-tested without a state at all.
 *
 * THERE IS NO PER-PORT BRANCH ANYWHERE IN THIS FILE. Every number a port can move
 * arrives through `wagerBandFor` / `venueParamsFor`; a port that wants a steeper
 * table authors a wider band, and this file never learns its id.
 *
 * WHERE THIS FILE LANDS IN THE FINGERPRINT: `ENGINE_RULE_DIRECTORIES = ['',
 * 'actions']` (`packages/sim/src/balance/rules-fingerprint.ts`), so an engine ROOT
 * module is hashed automatically and needs no `ENGINE_NON_RULE_SOURCES` entry.
 * `balance-rig.test.ts`'s "classifies every engine source" check stays green.
 */

import { DARE_ANTE_BAND_FRACTION } from '@spacerquest/content';
import { wagerBandFor } from './hangoutRules.js';
import { DareBid, DareHandState, DareMoveKind } from './types.js';

// ---------------------------------------------------------------------------
// §4 · The ante and the headroom
// ---------------------------------------------------------------------------

/**
 * The per-raise ante at a port: a fraction of that port's OWN wager ceiling.
 * A RULE READING CONTENT — the fraction is content's (`DARE_ANTE_BAND_FRACTION`),
 * the ceiling is the port's (`wagerBandFor`), and the arithmetic is the engine's.
 *
 * CALLED EXACTLY ONCE PER HAND, at open, and the result is stored in
 * `DareHandState.ante`; every subsequent raise reads the stored number. A content
 * edit between two `applyPlayerAction` calls therefore cannot move the price of a
 * raise mid-hand — the same reason `systemId` is frozen at open.
 *
 * Floored at 1 so a hypothetical band with a tiny ceiling still charges something
 * for a raise rather than making the whole lattice free.
 */
export function anteFor(systemId: number): number {
  return Math.max(1, Math.round(wagerBandFor(systemId).max * DARE_ANTE_BAND_FRACTION));
}

/**
 * How much more a side may still stake in this hand, against the port's own
 * ceiling. PER SIDE, and the seed counts against it — which is what makes
 * `band.max` a whole-hand exposure ceiling rather than a seed ceiling only
 * (§4.3). A "5–200" dive bar can therefore never take 400 off a captain.
 */
export function headroomFor(hand: DareHandState, side: 'player' | 'dealer'): number {
  const max = wagerBandFor(hand.systemId).max;
  return Math.max(0, max - (side === 'player' ? hand.potPlayer : hand.potDealer));
}

/**
 * What a raise of nominal cost `c` actually charges an actor:
 * `min(c, headroom, credits)`. The raise is LEGAL ONLY IF this equals `c` — a
 * partial ante is never taken, and an actor who cannot cover one in full has only
 * CALL and FOLD left (enforced identically on both sides through
 * {@link legalDareMoves}).
 */
export function chargedAnte(nominal: number, headroom: number, actorCredits: number): number {
  return Math.min(nominal, headroom, actorCredits);
}

// ---------------------------------------------------------------------------
// §5 · The bid lattice — ONE definition of legality, three consumers
// ---------------------------------------------------------------------------

/** The quantity ceiling: eight dice are in play, so no claim can exceed eight. */
export const DARE_MAX_QUANTITY = 8;
/** The face ceiling: a d6. */
export const DARE_MAX_FACE = 6;
/** Dice per side. Four each, no wildcards — see §5.5, wildcards are permanently
 *  out of scope and must not be added by a later milestone. */
export const DARE_DICE_PER_SIDE = 4;

/**
 * THE SINGLE SOURCE OF LEGALITY (§5.4). `resolveDare` refuses a player move that
 * is not in this list, `dealerMove` chooses only from this list, and the sim's
 * `legalActions` / `planDareMove` filter through it. Anything else is how a dealer
 * ends up with a move the player cannot answer.
 *
 * The lattice, stated as arithmetic (§5.1), with `(q, f)` the standing bid:
 *   - OPEN            — `bid === null`. Any `(q', f')` in `1..8 × 1..6`. Costs 0.
 *   - RAISE FACE      — `f' = f + 1` EXACTLY, `q' = q` EXACTLY. Costs `ante`.
 *   - RAISE QUANTITY  — `f' = f` EXACTLY, `q < q' <= 8`. Costs `ante`.
 *   - RAISE BOTH      — `f' = f + 1` EXACTLY **and** `q < q' <= 8`. Costs `2×ante`.
 *   - CHALLENGE       — legal whenever a bid stands, unconditionally, at zero cost.
 *   - FOLD            — legal while the hand is open, always.
 *   - PEEK            — `bid === null` and not yet used. (The DIE check is the
 *                       resolver's, not this function's — this file never sees a
 *                       dawn hand.)
 *
 * WHY QUANTITY IS PINNED ON A FACE RAISE, in one line, so a later reader cannot
 * reintroduce the hole: if a face raise could also drop the quantity, a player
 * holding `k` dice of face `g` could always claim `(k, g)` — a claim `actual >= k`
 * guarantees, i.e. risk-free — and chain it across every face they hold. Pinning
 * `q` and fixing the face step at exactly one removes both the claim and the
 * search for a face on which it would still work.
 *
 * `actorCredits` is the raiser's purse. Legality is a function of the hand, the
 * side and that purse — never of anyone's dice, which is what lets the dealer's
 * policy share it without seeing the player's hand.
 */
export function legalDareMoves(
  hand: DareHandState,
  side: 'player' | 'dealer',
  actorCredits: number,
): DareMoveKind[] {
  return legalMovesFrom(hand.bid, hand.ante, headroomFor(hand, side), actorCredits, hand.peekUsed);
}

/**
 * THE BODY of {@link legalDareMoves}, stated against loose parameters rather than
 * a `DareHandState`. This exists for exactly one reason: {@link dealerMove}'s input
 * deliberately carries NO hand (a `DareHandState` contains `playerDice`), so the
 * dealer needs a way to ask the same question from the fields it does hold. Both
 * entry points route here, so there is still exactly ONE definition of legality
 * across the engine's refusal, the dealer's choice and the sim's planner.
 */
export function legalMovesFrom(
  bid: DareBid | null,
  ante: number,
  headroom: number,
  actorCredits: number,
  peekUsed: boolean,
): DareMoveKind[] {
  const moves: DareMoveKind[] = [];

  if (bid === null) {
    moves.push('bid');
    // The DIE is validated by the resolver; this only says the WINDOW is open.
    if (!peekUsed) moves.push('peek');
    // A fold before the opening bid is legal and forfeits the seed alone (§6.1):
    // a captain who rolls four ones may simply pay the table and leave.
    moves.push('fold');
    return moves;
  }

  const affordable = (nominal: number) => chargedAnte(nominal, headroom, actorCredits) === nominal;
  const faceRoom = bid.face < DARE_MAX_FACE;
  const quantityRoom = bid.quantity < DARE_MAX_QUANTITY;
  if (faceRoom && affordable(ante)) moves.push('raise-face');
  if (quantityRoom && affordable(ante)) moves.push('raise-quantity');
  if (faceRoom && quantityRoom && affordable(2 * ante)) moves.push('raise-both');
  moves.push('challenge');
  moves.push('fold');
  return moves;
}

/**
 * Is the proposed `(quantity, face)` a well-formed instance of `move` against the
 * standing bid? Separated from {@link legalDareMoves} because that answers "which
 * KINDS of move may this actor make", while this answers "is THIS one on the
 * lattice" — the two together are §5.1's table, and a move must pass both.
 *
 * Returns false for a move that carries no claim (`challenge` / `fold` / `peek`)
 * only if it was handed a claim it should not have; those three are validated by
 * their own kind alone, so callers check them before reaching here.
 */
export function isLatticeMove(
  bid: DareBid | null,
  move: DareMoveKind,
  quantity: number | undefined,
  face: number | undefined,
): boolean {
  if (move === 'challenge' || move === 'fold' || move === 'peek') return true;
  if (quantity === undefined || face === undefined) return false;
  if (!Number.isInteger(quantity) || !Number.isInteger(face)) return false;
  if (quantity < 1 || quantity > DARE_MAX_QUANTITY) return false;
  if (face < 1 || face > DARE_MAX_FACE) return false;

  if (move === 'bid') return bid === null;
  if (bid === null) return false;
  if (move === 'raise-face') return face === bid.face + 1 && quantity === bid.quantity;
  if (move === 'raise-quantity') return face === bid.face && quantity > bid.quantity;
  // raise-both
  return face === bid.face + 1 && quantity > bid.quantity;
}

/** What a move costs its actor, nominally, before the headroom/credits clamp. */
export function nominalCost(move: DareMoveKind, ante: number): number {
  if (move === 'raise-face' || move === 'raise-quantity') return ante;
  if (move === 'raise-both') return 2 * ante;
  // OPEN is not a raise; CHALLENGE, FOLD and PEEK cost no credits (a Peek costs a
  // DIE, which the resolver spends).
  return 0;
}

/**
 * CALL THE BLUFF (§5.3). Counts the claimed face across ALL EIGHT dice in play.
 * `actualCount >= quantity` ⇒ the BIDDER takes the whole pot; otherwise the
 * CHALLENGER does. The challenger is always the actor who played CALL, because a
 * bid is always answered before control returns.
 */
export function resolveChallenge(hand: DareHandState): {
  actualCount: number;
  bidderWins: boolean;
} {
  const bid = hand.bid;
  if (bid === null) {
    // Unreachable: 'challenge' is only ever in `legalDareMoves` when a bid stands.
    return { actualCount: 0, bidderWins: false };
  }
  const actualCount =
    hand.playerDice.filter((d) => d === bid.face).length +
    hand.dealerDice.filter((d) => d === bid.face).length;
  return { actualCount, bidderWins: actualCount >= bid.quantity };
}

// ---------------------------------------------------------------------------
// §9.7 · The AI dealer — the anti-cheat shape IS the signature
// ---------------------------------------------------------------------------

/**
 * A bid over-claiming by more than ~1.5 dice against the dealer's own count is
 * more likely false than true with four unknown dice on the other side.
 */
export const DARE_AI_CHALLENGE_MARGIN = 1.5;
/** GUILE 5 lowers the challenge margin to 0.75 — a sharper dealer calls a shade
 *  sooner, since reading a bluff is exactly what GUILE is. */
export const DARE_AI_GUILE_PATIENCE = 0.15;
/** Holding none of the claimed face and facing a claim of 5+ across eight dice,
 *  the dealer's four dice cannot rescue the challenge; walking is cheaper than
 *  paying an ante to find out. */
export const DARE_AI_FOLD_QUANTITY = 5;
/** Of 100. Rare by design — RAISE BOTH costs `2 × ante` and is always the riskier
 *  claim. T-137 measures how often it is actually taken. */
export const DARE_AI_RAISE_BOTH_CHANCE = 8;
/** Per point of GUILE, added to both bluff rolls: HIGHER GUILE ⇒ BLUFFS MORE,
 *  which is the stated meaning of the stat at the table. */
export const DARE_AI_GUILE_BLUFF = 4;
/** Of 100. A dealer who never bluffs is readable in three hands, which would make
 *  the player's own bluffs free. */
export const DARE_AI_BLUFF_CHANCE = 20;

/** What the dealer decided. `peek` is excluded by construction: the Peek costs a
 *  DAWN DIE, which only the player has. */
export interface DareMove {
  move: Exclude<DareMoveKind, 'peek'>;
  quantity?: number;
  face?: number;
}

/**
 * THE HOUSE DEALER'S POLICY.
 *
 * **THERE IS NO PLAYER-DICE PARAMETER, AND THAT IS THE ENFORCEMENT.** The function
 * cannot read the player's hand because the function cannot EXPRESS the player's
 * hand: this input interface has no `playerDice`, no `GameState` and no
 * `DareHandState` (which contains `playerDice`). A cheating dealer would fail no
 * existing test, would move no fingerprint suspiciously, and would present to a
 * player as "the dealer is uncannily good" — indistinguishable from difficulty.
 * Hence the signature, and hence the behavioural test in `liarsDice.test.ts` that
 * varies the player's hidden dice across many values and asserts the dealer's
 * emitted move sequence never moves.
 *
 * `dealerDice` is `readonly` for the same reason: the policy reads the house's own
 * hand and may not rearrange it.
 *
 * The one thing it needs from the hand's shape — which raises are affordable — it
 * gets by rebuilding the minimal `DareHandState` fields `legalDareMoves` reads, so
 * legality still has exactly one definition (§5.4).
 */
export function dealerMove(input: {
  dealerDice: readonly number[];
  bid: DareBid | null;
  bidder: 'player' | 'dealer' | null;
  dealerGuile: number;
  ante: number;
  headroom: number;
  dealerCredits: number;
  /** 0..99, drawn by the caller from the action's forked rng. Keeps the policy pure. */
  roll: number;
}): DareMove {
  const { dealerDice, bid, dealerGuile, ante, headroom, dealerCredits, roll } = input;
  if (bid === null) {
    // §9.9 ruling 1 · The dealer is NEVER asked to move before the player's
    // opening bid — there is nothing to fold to, and the flow provably cannot
    // produce this. A throw rather than a silent fallback, because a silent
    // fallback would hide a real control-flow bug behind a plausible move.
    throw new Error('dealerMove called with no standing bid');
  }

  // Legality is asked of the SAME rule the player's moves go through
  // (`legalMovesFrom`, which `legalDareMoves` also delegates to). `peekUsed` is
  // passed true because a Peek costs a DAWN DIE and the house has none.
  const choices = legalMovesFrom(bid, ante, headroom, dealerCredits, true);

  const own = dealerDice.filter((d) => d === bid.face).length;
  // Four unknown dice on the other side, 1/6 each.
  const unknownExpectation = DARE_DICE_PER_SIDE / DARE_MAX_FACE;
  const expected = own + unknownExpectation;
  const surplus = bid.quantity - expected;

  // 1. Is the standing bid too tall to believe?
  if (
    surplus > DARE_AI_CHALLENGE_MARGIN - dealerGuile * DARE_AI_GUILE_PATIENCE &&
    choices.includes('challenge')
  ) {
    return { move: 'challenge' };
  }

  // 2. Hopeless and expensive: no matching dice and a large claim.
  if (own === 0 && bid.quantity >= DARE_AI_FOLD_QUANTITY && choices.includes('fold')) {
    return { move: 'fold' };
  }

  // 3. Raise if a legal, affordable raise exists.
  if (
    roll < DARE_AI_RAISE_BOTH_CHANCE + dealerGuile * DARE_AI_GUILE_BLUFF &&
    choices.includes('raise-both')
  ) {
    return { move: 'raise-both', quantity: bid.quantity + 1, face: bid.face + 1 };
  }
  if (own >= bid.quantity + 1 - unknownExpectation && choices.includes('raise-quantity')) {
    return { move: 'raise-quantity', quantity: bid.quantity + 1, face: bid.face };
  }
  const ownNextFace = dealerDice.filter((d) => d === bid.face + 1).length;
  if (ownNextFace >= bid.quantity - unknownExpectation && choices.includes('raise-face')) {
    return { move: 'raise-face', quantity: bid.quantity, face: bid.face + 1 };
  }
  if (roll < DARE_AI_BLUFF_CHANCE + dealerGuile * DARE_AI_GUILE_BLUFF) {
    // The cheapest legal raise, in the lattice's own order.
    if (choices.includes('raise-quantity')) {
      return { move: 'raise-quantity', quantity: bid.quantity + 1, face: bid.face };
    }
    if (choices.includes('raise-face')) {
      return { move: 'raise-face', quantity: bid.quantity, face: bid.face + 1 };
    }
    if (choices.includes('raise-both')) {
      return { move: 'raise-both', quantity: bid.quantity + 1, face: bid.face + 1 };
    }
  }

  // 4. Terminal fallback — ALWAYS available when a bid stands (§9.9 ruling 2).
  // CHALLENGE has the single precondition `bid !== null`, costs nothing, and no
  // clamp applies to it, so `legalDareMoves` is never empty for the dealer and
  // this branch always produces a legal move. That is the totality argument on
  // the dealer's side.
  return { move: 'challenge' };
}
