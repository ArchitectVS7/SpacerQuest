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

import {
  DARE_ANTE_BAND_FRACTION,
  LIARS_DICE_OPPONENTS,
  LIARS_DICE_RAISED_CEILING_MULT,
  LIARS_DICE_ROUNDS_PER_DAY,
  LIARS_DICE_UNLOCK_GAMES,
  LiarsDiceMix,
  LiarsDiceOpponent,
} from '@spacerquest/content';
import { wagerBandFor } from './hangoutRules.js';
import { DareBid, DareHandState, DareMoveKind, GameState } from './types.js';

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
 *
 * T-146 · THE ANTE NOW TAKES THE TIER (`docs/LIARS-DICE-PROGRESSION_SPEC.md`
 * §4.7). An ante that stayed at 30 while the ceiling went to 3,000 would make
 * raises nearly free relative to the pot and collapse the bid lattice into
 * "always raise", so the ante scales with the ceiling the tier actually plays at.
 *
 * **`tier >= 4`, NOT `tier === 4`, AND THAT IS THE RULING, NOT A BUG.** Tier 5
 * removes the band clamp entirely (§4.8), so there is no ceiling to take 3% of —
 * an ante derived from an unbounded ceiling is undefined. Unlimited betting
 * removes the SEED and EXPOSURE clamp; it does not and cannot remove the ante
 * SCALE, which needs a finite reference. Freezing that reference at the tier-4
 * ceiling is the only choice continuous with tier 4: a player crossing 80 games
 * sees their ante stay put rather than jump or vanish.
 *
 * PROVABLY INERT AT TIER 0 — `tier <= 3` reproduces the shipped expression
 * character for character.
 */
export function anteFor(systemId: number, tier: number): number {
  const mult = tier >= 4 ? LIARS_DICE_RAISED_CEILING_MULT : 1;
  return Math.max(1, Math.round(wagerBandFor(systemId).max * mult * DARE_ANTE_BAND_FRACTION));
}

/**
 * How much more a side may still stake in this hand, against the port's own
 * ceiling. PER SIDE, and the seed counts against it — which is what makes
 * `band.max` a whole-hand exposure ceiling rather than a seed ceiling only
 * (§4.3). A "5–200" dive bar can therefore never take 400 off a captain.
 */
export function headroomFor(hand: DareHandState, side: 'player' | 'dealer'): number {
  // T-146 · READS THE HAND'S **FROZEN** CEILING, never `wagerBandFor(hand.systemId)`
  // (§8 row 6). The tier is frozen at open (§4.6): a hand opened at tier 3 keeps
  // its tier-3 exposure ceiling even if the player's 40th game settles mid-scene,
  // and a content edit across a reload cannot move the rules of a hand already in
  // progress. INERT WHERE IT LANDS — T-145 wrote `bandMax` at exactly
  // `wagerBandFor(systemId).max`.
  //
  // `bandMax === null` IS the encoding of tier 5 (§4.8). The band clamp is gone;
  // `chargedAnte` already takes the min with the actor's credits, so the SOLVENCY
  // CLAMP becomes the sole ceiling with no signature change anywhere.
  if (hand.bandMax === null) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, hand.bandMax - (side === 'player' ? hand.potPlayer : hand.potDealer));
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

/**
 * T-145 · HOW MANY DICE EACH SIDE HOLDS AT AN UNLOCK TIER
 * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.2, §4.3).
 *
 * 4 at tier 0, 5 at tier 1, **6 at tier 2 and at every tier above it — a HARD
 * CAP, forever**. Six is the end of the ladder on this axis; a later milestone
 * that wants a longer ladder must move a different number.
 *
 * PROVABLY INERT WHERE IT LANDS: `dicePerSideForTier(0) === 4`, which is exactly
 * the constant this file already shipped, so introducing the function moves
 * nothing. T-146 rewires the call sites and only THEN lets the tier move — the
 * N3 `combatRules.ts` extract-before-add discipline.
 */
export function dicePerSideForTier(tier: number): number {
  if (tier <= 0) return 4;
  if (tier === 1) return 5;
  return 6;
}

/**
 * T-145 · THE CLAIM CEILING IS "EVERY DIE IN PLAY" (§4.3). Two sides, `n` dice
 * each, so a claim can never exceed `2n`. That is exactly what the shipped
 * `DARE_MAX_QUANTITY = 8` encodes at `n = 4`, which is why this rule is inert at
 * tier 0 and can land ahead of the ladder that will move it.
 */
export function maxQuantityForDice(dicePerSide: number): number {
  return 2 * dicePerSide;
}

/** Dice per side. Four each at tier 0, no wildcards — see §5.5, wildcards are
 *  permanently out of scope and must not be added by a later milestone. The
 *  constant STAYS (T-145 spec §8 row 2) and is now stated as its tier-0 value. */
export const DARE_DICE_PER_SIDE = dicePerSideForTier(0);
/** The quantity ceiling at tier 0: eight dice are in play, so no claim can exceed
 *  eight. The constant STAYS (§8 row 1), redefined through the rule above. */
export const DARE_MAX_QUANTITY = maxQuantityForDice(DARE_DICE_PER_SIDE);
/**
 * The face ceiling: a d6.
 *
 * **THIS IS A CONSTANT AT EVERY TIER, AND THAT IS AN EXPLICIT RULING** (§4.3).
 * A coder auditing the ladder will find `dicePerSideForTier` / `maxQuantityForDice`
 * beside it and be tempted to "complete the symmetry" with a `maxFaceForTier`.
 * That would be a BUG, twice over: (a) it is a d6 — a seventh face is a different
 * game, not a bigger die, and `SeededRng.d6` would have to become a parameterised
 * roll for a reward the ladder never asked for; (b) the closed exploit's search
 * space (§5.2 of the redesign) is bounded by the face ladder's length, and
 * widening the face range reopens a search against a fix proven only over 1..6.
 */
export const DARE_MAX_FACE = 6;

// ---------------------------------------------------------------------------
// T-146 · §4 · THE UNLOCK LADDER
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4.1, §4.5, §4.7, §4.8)
//
// CONTENT OWNS THE THRESHOLDS AND THE MULTIPLIER (`LIARS_DICE_UNLOCK_GAMES`,
// `LIARS_DICE_RAISED_CEILING_MULT`); the engine owns the arithmetic that reads
// them. There is no `if (` deciding an outcome in `packages/content` and no
// threshold literal in this file.
//
// **`liarsDiceTier` IS CALLED IN EXACTLY TWO PLACES IN THE WHOLE REPO** (§4.6):
//   1. `actions/hangout.ts`'s `case 'dare'` open arm — the one site that FREEZES a
//      tier's effects onto a hand.
//   2. `packages/ui/src/format.ts`'s `dareWagerBounds` — the pre-hand stake input,
//      legitimate precisely because there is no hand yet to read a frozen field
//      off. Display only; the engine re-clamps at open.
// A THIRD CALL SITE IS A BUG. If a site has a hand, it reads the frozen field
// (`hand.maxQuantity`, `hand.dicePerSide`, `hand.bandMax`) — that ruling is what
// collapses "every validation site must read the live tier" into a finite set of
// constant-to-field substitutions.
//
// T-197 · THE RULING IS ABOUT HANDS, AND THIS IS THE AMENDMENT THAT SAYS SO.
// `liarsDiceRoundsRemaining` (below) adds a third `liarsDiceTier` call, and it is
// NOT the bug the paragraph above forbids — the forbidden third is a site that HAS
// a hand and re-reads the live tier instead of the hand's frozen field. This one
// has no hand and cannot: it answers "may another hand be OPENED today", a
// question about the day whose only honest input is the live tier. The rule the
// paragraph actually protects is unchanged and still true — `actions/hangout.ts`'s
// open arm remains the ONE site that freezes a tier's effects onto a hand, and
// §4b's rounds cap is evaluated THERE, from THAT read, rather than by calling this
// accessor from inside the resolver.
// ---------------------------------------------------------------------------

/**
 * T-146 · How many rungs of the ladder `gamesPlayed` cumulative settled hands have
 * unlocked. Tier `n` is live at `gamesPlayed >= LIARS_DICE_UNLOCK_GAMES[n-1]`.
 *
 * THE OFF-BY-ONE, PINNED so it cannot be argued (§4.1): the SETTLEMENT of the 5th
 * hand increments the counter to 5, which makes tier 1 live for the **6th** hand.
 * A hand's tier is frozen at open, so the 5th hand itself is played entirely at
 * tier 0.
 *
 * TOTAL over every number, including negatives, fractions and `Infinity` — a
 * corrupt or hand-edited save must produce a tier, never a crash or a `NaN`.
 */
export function liarsDiceTier(gamesPlayed: number): 0 | 1 | 2 | 3 | 4 | 5 {
  // `NaN` is the only value that compares false against every threshold AND
  // against `<= 0`, so it is named rather than folded into an `isFinite` guard —
  // an `isFinite` guard would send `Infinity` to tier 0, which is the wrong end of
  // the ladder for "more games than a number can hold".
  if (Number.isNaN(gamesPlayed) || gamesPlayed <= 0) return 0;
  const rungs = LIARS_DICE_UNLOCK_GAMES.filter((threshold) => gamesPlayed >= threshold).length;
  return rungs as 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * T-197 · HOW MANY HANDS A CAPTAIN AT `tier` MAY OPEN IN ONE DAY
 * (`docs/DAWN-HAND-REDESIGN.md` §4b). A RULE READING CONTENT: the table is
 * content's (`LIARS_DICE_ROUNDS_PER_DAY`), the read is the engine's, and there is
 * no threshold literal here — exactly the `dicePerSideForTier` shape it is modelled
 * on, one file down.
 *
 * TOTAL over garbage input, the same contract `liarsDiceTier` keeps and for the
 * same reason: a corrupt or hand-edited save must produce a cap, never a `NaN` and
 * never `undefined`. A non-integer, negative or over-long index clamps into the
 * table's own ends rather than reading off it.
 *
 * THIS IS NOT A SECOND TIER READ. It takes the tier as an argument precisely so
 * the RESOLVER can pass the one it already froze at `actions/hangout.ts`'s open
 * site (§4b: "the round cap reuses the SAME tier read, at the SAME call site").
 */
export function liarsDiceRoundsPerDay(tier: number): number {
  const last = LIARS_DICE_ROUNDS_PER_DAY.length - 1;
  if (Number.isNaN(tier) || tier <= 0) return LIARS_DICE_ROUNDS_PER_DAY[0];
  const index = Math.min(last, Math.floor(tier));
  return LIARS_DICE_ROUNDS_PER_DAY[index];
}

/**
 * T-197 · How many Liar's Dice opens the captain has LEFT today, floored at 0
 * (§4b). ONE accessor, read by the cockpit (to explain a closed table before the
 * click), by `sim/protocol.ts` (to stop advertising an open the engine will
 * refuse) and by `sim/index.ts`'s gambler loop (to stop planning one).
 *
 * A RULE ACCESSOR, NOT A THIRD `liarsDiceTier` CALL SITE IN THE SENSE §4.6
 * FORBIDS. The ruling at the header above is about the RESOLVER: a site that has a
 * HAND must read the hand's frozen fields rather than the live tier. This function
 * has no hand — it answers "may another hand be opened at all", which is a
 * question about the day, not about a hand in progress, and the live tier is the
 * only honest input to it. The resolver still reads the tier exactly once, at the
 * open site, and re-derives this bound there rather than trusting a caller.
 */
export function liarsDiceRoundsRemaining(state: GameState): number {
  const cap = liarsDiceRoundsPerDay(liarsDiceTier(state.player.liarsDiceGamesPlayed));
  return Math.max(0, cap - state.player.dareRoundsToday);
}

/**
 * T-146 · The wager band a hand OPENED AT `tier` plays inside (§4.2, §4.8).
 *
 *   tier <= 3 : the port's authored band, verbatim
 *   tier == 4 : `{ min, max × LIARS_DICE_RAISED_CEILING_MULT }` — raised BOUNDED
 *               betting. `headroomFor` reads the same number, so ×3 triples
 *               per-side WHOLE-HAND exposure and not merely the seed (§4.4 records
 *               this as a consequence of the ruling, not a reason to change it).
 *   tier == 5 : `{ min: 0, max: null }` — the band clamp is removed at BOTH ends.
 *               A veteran may sit at Regulus-6 for 10 credits if they want to; the
 *               floor existed to stop a captain playing beneath a house's dignity,
 *               and a captain 80 games in has earned the right to.
 *
 * `max === null` is the ONLY encoding of "unlimited" in the engine. THE SOLVENCY
 * CLAMP IS NOT REMOVED and is not this function's business: the open arm still
 * mins against both sides' live credits, and `chargedAnte` still mins against the
 * actor's purse.
 */
export function effectiveWagerBand(
  systemId: number,
  tier: number,
): { min: number; max: number | null } {
  const band = wagerBandFor(systemId);
  if (tier >= 5) return { min: 0, max: null };
  if (tier === 4) return { min: band.min, max: band.max * LIARS_DICE_RAISED_CEILING_MULT };
  return { min: band.min, max: band.max };
}

/** T-146 · The three "Read the Table" lines, exactly as authored (§4.5). */
const READ_SAFE = 'This one plays it safe.';
const READ_RECKLESS = "This one's reckless.";
const READ_UNKNOWN = "Can't get a read on this one.";

/**
 * T-146 · "READ THE TABLE" — unlocked at tier ≥ 3, shown at open, before the first
 * bid (§4.5).
 *
 * Pool A reads the hand's RESOLVED archetype (ruling 1): a `'mixed'` row is
 * resolved to one concrete arm once at open, so a mixed opponent genuinely IS one
 * of the three for the duration of the hand and the honest read is the resolved
 * one. A mixed opponent may therefore read differently from one hand to the next,
 * which is exactly what makes them unreadable over a career — at zero extra copy
 * and with no lie ever told to the player.
 *
 * Pool B has no archetype, so its read is derived by rule from the profile's GUILE
 * (ruling 2). Without this, tier 3 would unlock a feature DEAD at the pool that
 * supplies most of the player's hands. The mapping is honest rather than
 * decorative: `DARE_AI_GUILE_BLUFF` and `DARE_AI_GUILE_PATIENCE` mean a high-GUILE
 * dealer bluffs more AND challenges sooner, so they genuinely are the careful one.
 *
 * **MATHEMATICALLY INERT, AND IT MUST STAY THAT WAY.** This touches no dice, no
 * count, no cost, no legality and no probability — it is one string on one event.
 * That inertness is exactly why the read was chosen over wildcards. A later task
 * that makes it conditional on anything the resolver computes has stopped being
 * inert and has changed the game.
 */
export function readTheTableLine(
  kind: 'roster' | 'roaming',
  archetypeOrGuile: 'optimal' | 'bad' | 'random' | number,
): string {
  if (kind === 'roster') {
    if (archetypeOrGuile === 'optimal') return READ_SAFE;
    if (archetypeOrGuile === 'bad') return READ_RECKLESS;
    return READ_UNKNOWN;
  }
  const guile = typeof archetypeOrGuile === 'number' ? archetypeOrGuile : 0;
  if (guile >= 4) return READ_SAFE;
  if (guile <= 1) return READ_RECKLESS;
  return READ_UNKNOWN;
}

/**
 * THE SINGLE SOURCE OF LEGALITY (§5.4). `resolveDare` refuses a player move that
 * is not in this list, `dealerMove` chooses only from this list, and the sim's
 * `legalActions` / `planDareMove` filter through it. Anything else is how a dealer
 * ends up with a move the player cannot answer.
 *
 * The lattice, stated as arithmetic (§5.1), with `(q, f)` the standing bid:
 * T-146 · `Q` below is the HAND'S FROZEN `maxQuantity` (= `2 × dicePerSide`), which
 * is 8 at tier 0 and 10 / 12 above it. The FACE ceiling is the constant 6 at every
 * tier (§4.3).
 *
 *   - OPEN            — `bid === null`. Any `(q', f')` in `1..Q × 1..6` with
 *                       `q' > own(f')` — T-160's OPENING FLOOR, see
 *                       {@link minOpeningQuantity}. Costs 0.
 *   - RAISE FACE      — `f' = f + 1` EXACTLY, `q' = q` EXACTLY. Costs `ante`.
 *   - RAISE QUANTITY  — `f' = f` EXACTLY, `q < q' <= Q`. Costs `ante`.
 *   - RAISE BOTH      — `f' = f + 1` EXACTLY **and** `q < q' <= Q`. Costs `2×ante`.
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
 * T-160 · THE SAME ARGUMENT NOW GOVERNS THE OPEN. §5.2's pin closed the risk-free
 * claim on every RAISE and left it wide open on the OPENING bid, which is exactly
 * the hole F-137-1 measured (100.00% of openers true by construction).
 * {@link minOpeningQuantity} closes it at the one remaining entrance.
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
  // T-146 · `hand.maxQuantity` — the hand's FROZEN claim ceiling (§8 row 4), not
  // the `DARE_MAX_QUANTITY` constant. Inert at tier 0, where the two are equal.
  return legalMovesFrom(
    hand.bid,
    hand.ante,
    headroomFor(hand, side),
    actorCredits,
    hand.peekUsed,
    hand.maxQuantity,
  );
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
  /** T-146 · The hand's FROZEN claim ceiling (`DareHandState.maxQuantity`), never
   *  the `DARE_MAX_QUANTITY` constant (§8 row 3). Every caller reads it off the
   *  hand it was already handed; nothing here consults a live tier (§4.6). */
  maxQuantity: number,
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
  const quantityRoom = bid.quantity < maxQuantity;
  if (faceRoom && affordable(ante)) moves.push('raise-face');
  if (quantityRoom && affordable(ante)) moves.push('raise-quantity');
  if (faceRoom && quantityRoom && affordable(2 * ante)) moves.push('raise-both');
  moves.push('challenge');
  moves.push('fold');
  return moves;
}

/**
 * T-160 · THE OPENING FLOOR (`docs/LIARS-DICE_REDESIGN.md` §16.2 shape (b), the
 * fix for finding F-137-1). An OPENING claim must exceed what the bidder already
 * holds of the claimed face.
 *
 * WHY, in the same terms §5.2 already pins quantity on a face raise: a claim of
 * dice you are HOLDING is risk-free. `resolveChallenge` counts the claimed face
 * across ALL the dice in play, so `actualCount >= own(face)` **always** — a claim
 * at or under `own(face)` cannot be false, and the opponent's dice can only add to
 * it. F-137-1 measured the consequence: 100.00% of the baseline planner's 15,235
 * opening bids were true by construction, and a bidding game whose opening claim
 * can be made risk-free has no bluffing in it at all.
 *
 * TOTALITY, so a later reader cannot fear an unplayable hand: `own(f) <=
 * dicePerSide` for every face, so `own(f) + 1 <= dicePerSide + 1 <= 2 *
 * dicePerSide = maxQuantity` at every tier (`dicePerSide` is 4, 5 or 6). **An
 * opening bid is therefore still legal on EVERY face at EVERY tier, including a
 * six-dice hand showing all six faces** — where every face floors at 2 and the
 * ceiling is 12.
 *
 * The DEALER is not affected: §9.9 ruling 1 — the dealer is never asked to move
 * before the player's opening bid, so it never opens.
 */
export function minOpeningQuantity(ownOfClaimedFace: number): number {
  return ownOfClaimedFace + 1;
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
  /** T-146 · The hand's FROZEN claim ceiling (§8 row 5). A caller with a hand
   *  passes `hand.maxQuantity`; nothing here reads a live tier (§4.6). */
  maxQuantity: number,
  /**
   * T-160 · How many dice of the CLAIMED FACE the bidder holds — the input to
   * {@link minOpeningQuantity}, and read ONLY on the `bid` arm (an opening claim
   * is the only move this rule governs; every raise is already pinned by the
   * lattice). REQUIRED rather than optional, deliberately and by the T-146
   * `maxQuantity` precedent: a required parameter turns the sweep of call sites
   * into compile errors, so no site can silently skip the rule.
   */
  ownOfClaimedFace: number,
): boolean {
  if (move === 'challenge' || move === 'fold' || move === 'peek') return true;
  if (quantity === undefined || face === undefined) return false;
  if (!Number.isInteger(quantity) || !Number.isInteger(face)) return false;
  if (quantity < 1 || quantity > maxQuantity) return false;
  // T-146 · THE FACE BOUND STAYS THE CONSTANT, AT EVERY TIER, AND THAT IS AN
  // EXPLICIT RULING (§4.3) — see `DARE_MAX_FACE`'s own comment. A reader who has
  // just watched the quantity bound become a parameter will be tempted to
  // "complete the symmetry" here. Do not: a seventh face is a different game, and
  // widening the range reopens the §5.2 exploit search against a fix proven only
  // over 1..6.
  if (face < 1 || face > DARE_MAX_FACE) return false;

  // T-160 · THE OPENING FLOOR (§16.2 shape (b), fixing F-137-1). An opening claim
  // must EXCEED what the bidder holds of the face they are claiming — see
  // `minOpeningQuantity` for the argument and the totality proof.
  if (move === 'bid') return bid === null && quantity >= minOpeningQuantity(ownOfClaimedFace);
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
// T-145 · POOL A — the fixed roster (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §2, §7)
// ---------------------------------------------------------------------------

/**
 * T-145 · The authored roster row for `opponentId` at `systemId`, or `undefined`.
 *
 * A RULE READING CONTENT, in this file's own idiom: the 42 rows are content
 * (`packages/content/src/liarsDice.ts`), and this is the one accessor every engine
 * and UI reader goes through rather than reaching into the table. It is keyed on
 * BOTH the port and the id deliberately — an opponent authored at Deneb-4 is not
 * seatable at Sol-3, and a lookup that ignored the port would let a stale UI
 * selection open a hand at the wrong house.
 */
export function liarsDiceOpponentFor(
  systemId: number,
  opponentId: string,
): LiarsDiceOpponent | undefined {
  return LIARS_DICE_OPPONENTS[systemId]?.find((row) => row.id === opponentId);
}

/** T-145 · Every authored roster opponent at a port, in seat order. */
export function liarsDiceOpponentsAt(systemId: number): readonly LiarsDiceOpponent[] {
  return LIARS_DICE_OPPONENTS[systemId] ?? [];
}

/**
 * T-147 · Is this port's WHOLE authored set beaten?
 *
 * A RULE, not a count: the engine owns "what closes a set" and content owns the
 * rows, so `packages/content` carries no `if (` deciding this. READER: the
 * `LiarsDiceSetCleared{scope:'port'}` emission in `actions/dare.ts`'s
 * `settleDareHand`, which is the only caller.
 *
 * THE NON-EMPTY GUARD IS LOAD-BEARING. `liarsDiceOpponentsAt` answers `[]` for
 * any port with no authored house, and `[].every(…)` is VACUOUSLY TRUE — so a
 * bare `.every()` would declare a set closed at a port that never had one. The
 * guard is what makes "cleared" mean "beat somebody".
 */
export function liarsDicePortCleared(systemId: number, beaten: readonly string[]): boolean {
  const seats = liarsDiceOpponentsAt(systemId);
  if (seats.length === 0) return false;
  const set = new Set(beaten);
  return seats.every((seat) => set.has(seat.id));
}

/**
 * T-147 · Is the WHOLE authored roster beaten — every seat at every house?
 *
 * DERIVED FROM CONTENT, never from a literal 42, using the same wholesale
 * iteration idiom `seedLiarsDicePurses` uses above. A later content pass that
 * adds a fourth seat to a port, or a fifteenth house, moves this rule with it
 * rather than silently leaving the capstone earnable one seat early.
 *
 * READER: the `LiarsDiceSetCleared{scope:'roster'}` emission in `settleDareHand`.
 */
export function liarsDiceRosterCleared(beaten: readonly string[]): boolean {
  const set = new Set(beaten);
  for (const rows of Object.values(LIARS_DICE_OPPONENTS)) {
    for (const row of rows) {
      if (!set.has(row.id)) return false;
    }
  }
  return true;
}

/**
 * T-145 · The full roster purse map, derived from the AUTHORED bankrolls (§5.4
 * step 3). PURE: returns a NEW object and mutates nothing — the module's PURE
 * header contract is preserved across the roster additions.
 *
 * **PRESERVES EVERY EXISTING KEY.** That is what makes it idempotent AND what
 * makes a later content pass that adds a 4th opponent to a port need no further
 * save version: the loader's backfill path picks the new id up with its authored
 * bankroll and leaves every played-down balance exactly where it was.
 *
 * Called from exactly THREE places, deliberately: `MIGRATIONS[14]`,
 * `createInitialState`, and `deserializeState`'s backfill path. That is the
 * "a migration CALLS a rule, it never restates one" house rule discharged the way
 * `MIGRATIONS[11]` discharged it with `emptyDeedRegistry`.
 */
export function seedLiarsDicePurses(existing?: Record<string, number>): Record<string, number> {
  const purses: Record<string, number> = {};
  for (const rows of Object.values(LIARS_DICE_OPPONENTS)) {
    for (const row of rows) purses[row.id] = row.bankroll;
  }
  if (existing) {
    for (const [id, balance] of Object.entries(existing)) {
      if (typeof balance === 'number' && Number.isFinite(balance)) purses[id] = balance;
    }
  }
  return purses;
}

// ---------------------------------------------------------------------------
// T-145 · §3.1 · The shared probability model
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.1)
// ---------------------------------------------------------------------------

/** `C(n, k)`, by the multiplicative recurrence so no factorial overflows. `n` is
 *  at most 6 here, so this is exact in double precision. */
function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= k; i += 1) {
    result = (result * (n - k + i)) / i;
  }
  return result;
}

/**
 * T-145 · `P(Binomial(u, 1/6) >= k)` — the chance that `u` unknown d6 show at
 * least `k` of a given face. EXACT and closed-form; no rng, no state, no
 * approximation, no table.
 *
 *   k <= 0  ->  1        (a claim of "at least zero" is free)
 *   k > u   ->  0        (more of a face than there are dice)
 *   else       sum_{j=k..u} C(u,j) (1/6)^j (5/6)^(u-j)
 *
 * `u` is the LIVE `dicePerSide` off the hand, never a constant — this function is
 * total over u ∈ {4,5,6} and is unit-proven at all three even though T-145 only
 * ever plays at 4, because T-146 must inherit it proven.
 *
 * THE ONE PROBABILITY MODEL EVERY ARCHETYPE USES. Seen from the dealer's seat,
 * holding `own` dice of the claimed face, the truth probability of a standing
 * claim `(q, f)` is `probAtLeast(q - own, dicePerSide)`. It assumes nothing about
 * how the other side plays, which is precisely why it is implementable and
 * testable without an opponent model.
 */
export function probAtLeast(k: number, u: number): number {
  if (k <= 0) return 1;
  if (k > u) return 0;
  let total = 0;
  for (let j = k; j <= u; j += 1) {
    total += binomial(u, j) * Math.pow(1 / 6, j) * Math.pow(5 / 6, u - j);
  }
  return total;
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
/**
 * Holding none of the claimed face and facing a claim of 5+ across eight dice,
 * the dealer's four dice cannot rescue the challenge; walking is cheaper than
 * paying an ante to find out.
 *
 * T-146 · THIS IS THE **TIER-0 VALUE** of the live expression the dealer now
 * evaluates, `round(5 × dicePerSide / 4)` (§8 row 8): the threshold is "5 out of a
 * 4-dice hand", scaled so the same evidence bar holds at 5 and 6 dice. The constant
 * STAYS exported, at exactly `round(5 × 4 / 4) = 5`, so the rewire is provably
 * inert at four dice — which is what keeps T-137's 8,000-row pool-B baseline
 * directly comparable rather than a fresh, uncomparable sample.
 */
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
  /** T-146 · The hand's FROZEN dice-per-side (§8 row 8). Passed rather than read
   *  off `dealerDice.length` so the policy's inputs stay explicit and the two
   *  tier-derived numbers below have one named source. */
  dicePerSide: number;
  bid: DareBid | null;
  bidder: 'player' | 'dealer' | null;
  dealerGuile: number;
  ante: number;
  headroom: number;
  dealerCredits: number;
  /** 0..99, drawn by the caller from the action's forked rng. Keeps the policy pure. */
  roll: number;
}): DareMove {
  const { dealerDice, dicePerSide, bid, dealerGuile, ante, headroom, dealerCredits, roll } = input;
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
  const choices = legalMovesFrom(
    bid,
    ante,
    headroom,
    dealerCredits,
    true,
    // T-146 · the hand's frozen ceiling, derived from the same `dicePerSide` the
    // caller froze at open. `maxQuantityForDice(4) === DARE_MAX_QUANTITY === 8`,
    // so this is inert at tier 0.
    maxQuantityForDice(dicePerSide),
  );

  const own = dealerDice.filter((d) => d === bid.face).length;
  // `dicePerSide` unknown dice on the other side, 1/6 each. T-146: LIVE off the
  // hand (§8 row 8), not the `DARE_DICE_PER_SIDE` constant — identical at 4.
  const unknownExpectation = dicePerSide / DARE_MAX_FACE;
  // T-146 · The fold bar, scaled to the hand's size. `DARE_AI_FOLD_QUANTITY` is
  // exactly this expression's tier-0 value, so the rewire moves nothing at 4 dice.
  const foldQuantity = Math.round((DARE_AI_FOLD_QUANTITY * dicePerSide) / 4);
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
  if (own === 0 && bid.quantity >= foldQuantity && choices.includes('fold')) {
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

// ---------------------------------------------------------------------------
// T-145 · §3 · THE ROSTER ARCHETYPES — pool A's policies
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §3.2–§3.6)
//
// A LABEL IS NOT A POLICY. Content owns the label on each of the 42 rows; this is
// where each label becomes an executable rule. There is no unquantified
// "heuristic" below, and every archetype asks `legalMovesFrom` for legality and
// nowhere else, so §5.4's "one definition of legality" survives a second consumer.
//
// `dealerMove` above KEEPS ITS SHIPPED BODY, byte for byte (§3.8). A roster hand
// never calls it; a roaming hand never calls `archetypeMove`. That is what keeps
// T-137's 8,000-row pool-B baseline directly comparable rather than a fresh,
// uncomparable sample — and it is why F-137-1 is discharged on the ROSTER PATH
// ONLY (§3.9). Do not "fix" the roaming dealer here.
// ---------------------------------------------------------------------------

/**
 * T-145 · How far over its own count `bad` will believe a claim before calling it.
 *
 * ONE. With four dice per side the unknown half contributes `4/6 ≈ 0.67` expected
 * matches, so a threshold of "more than one over what I hold" makes `bad`
 * challenge TRUE claims constantly at low quantities. That is the leak, stated as
 * a number: `bad` plays as though the other side of the table were blank, which is
 * the classic beginner error and is LEGIBLE — a player who watches a `bad`
 * opponent learns to make tall true claims and let them call.
 */
export const BAD_CREDULITY = 1;

/**
 * T-145 · Resolve a `'mixed'` content row to ONE CONCRETE archetype, ONCE PER
 * HAND, at open (§3.6).
 *
 * *Ruling, with its reason:* a mixed opponent that re-rolled its personality on
 * every move would not be "unpredictable", it would be NOISE — the player could
 * learn nothing from it within a hand, and T-146's "Read the Table" would have
 * nothing true to say. Resolving once per hand makes a mixed opponent a genuine
 * identity for the duration of a hand and a genuine unknown across a career.
 *
 * Cumulative thresholds in the FIXED KEY ORDER optimal, bad, random. **The order
 * is part of the contract** — changing it changes every golden containing a mixed
 * hand. Because the mix sums to exactly 100 (validator-enforced), the three
 * branches partition 0..99 with no gap and no overlap, which is why the third
 * needs no bound check. Returns a CONCRETE archetype; never `'mixed'`.
 */
export function resolveMixedArchetype(
  mix: Readonly<LiarsDiceMix>,
  roll: number,
): 'optimal' | 'bad' | 'random' {
  if (roll < mix.optimal) return 'optimal';
  if (roll < mix.optimal + mix.bad) return 'bad';
  return 'random';
}

/** The three cheapest lattice steps, with their nominal cost (§3.3's table). */
interface RaiseCandidate {
  move: 'raise-quantity' | 'raise-face' | 'raise-both';
  quantity: number;
  face: number;
  cost: number;
}

/**
 * The legal move kinds available to a ROSTER dealer, bounded by the hand's FROZEN
 * `maxQuantity`.
 *
 * T-146 · `legalMovesFrom` NOW TAKES THE CEILING ITSELF (§8 row 3), so the
 * post-filter T-145 shipped here is gone. **That deletion is behaviour-preserving
 * over the integers, not a change**: every archetype raise steps the quantity by
 * exactly one, so T-145's guard was `bid.quantity + 1 <= maxQuantity`, and
 * `legalMovesFrom`'s own `quantityRoom` is `bid.quantity < maxQuantity` — the same
 * predicate on integers. This function is now a one-line pass-through and stays
 * only because it names WHY `peekUsed` is passed true.
 */
function archetypeChoices(
  bid: DareBid,
  ante: number,
  headroom: number,
  dealerCredits: number,
  maxQuantity: number,
): DareMoveKind[] {
  // `peekUsed` is passed true because a Peek costs a DAWN DIE and the house has
  // none — the same argument `dealerMove` makes.
  return legalMovesFrom(bid, ante, headroom, dealerCredits, true, maxQuantity);
}

function raiseCandidates(bid: DareBid, ante: number, choices: DareMoveKind[]): RaiseCandidate[] {
  const candidates: RaiseCandidate[] = [];
  if (choices.includes('raise-quantity')) {
    candidates.push({
      move: 'raise-quantity',
      quantity: bid.quantity + 1,
      face: bid.face,
      cost: ante,
    });
  }
  if (choices.includes('raise-face')) {
    candidates.push({ move: 'raise-face', quantity: bid.quantity, face: bid.face + 1, cost: ante });
  }
  if (choices.includes('raise-both')) {
    candidates.push({
      move: 'raise-both',
      quantity: bid.quantity + 1,
      face: bid.face + 1,
      cost: 2 * ante,
    });
  }
  return candidates;
}

/** The FIXED total order that breaks an EV tie, so `optimal` is a total function
 *  of its inputs and its unit tests are stable (§3.3). */
const OPTIMAL_TIE_BREAK: readonly DareMoveKind[] = [
  'challenge',
  'raise-quantity',
  'raise-face',
  'raise-both',
  'fold',
];

/**
 * T-145 · THE ROSTER DEALER'S POLICY — one entry point, three concrete archetypes.
 *
 * **THE ANTI-CHEAT DISCIPLINE, EXTENDED VERBATIM (§3.2).** There is no
 * `playerDice`, no `GameState` and no `DareHandState` in this input, **and that
 * absence IS the enforcement**: the function cannot read the player's hand because
 * it cannot EXPRESS the player's hand. `liarsDice.test.ts` applies the same
 * behavioural test it applies to `dealerMove` — vary the player's hidden dice
 * across many values, hold everything else fixed, and assert the emitted move
 * sequence never moves.
 *
 * `dealerDice` is `readonly` for the same reason as before: the policy reads the
 * house's own hand and may not rearrange it.
 *
 * `archetype` is CONCRETE, never `'mixed'` — a mix is resolved at open by
 * {@link resolveMixedArchetype} and the concrete result is stored on the hand.
 * `bid` is never null: like the roaming dealer, the roster dealer is never asked
 * to move before the player's opening bid (§9.9 ruling 1), so a null THROWS rather
 * than silently inventing an opening policy that would hide a control-flow bug.
 */
export function archetypeMove(input: {
  archetype: 'optimal' | 'bad' | 'random';
  dealerDice: readonly number[];
  dicePerSide: number;
  maxQuantity: number;
  bid: DareBid;
  ante: number;
  headroom: number;
  dealerCredits: number;
  /** ESCROW, and PUBLIC — both pots ride every `DareBidPlaced`, so reading them is
   *  not hidden information. Needed because EV is a function of the pot. */
  potPlayer: number;
  potDealer: number;
  /** 0..99, drawn by the CALLER from the action's forked rng. Keeps the policy a
   *  total function of its inputs. `optimal` ignores it; the caller draws it
   *  anyway (§3.7), so the rng stream never depends on the archetype. */
  roll: number;
}): DareMove {
  const {
    archetype,
    dealerDice,
    dicePerSide,
    maxQuantity,
    bid,
    ante,
    headroom,
    dealerCredits,
    potPlayer,
    potDealer,
    roll,
  } = input;
  if (bid === null || bid === undefined) {
    throw new Error('archetypeMove called with no standing bid');
  }

  const choices = archetypeChoices(bid, ante, headroom, dealerCredits, maxQuantity);
  const own = (face: number) => dealerDice.filter((die) => die === face).length;

  if (archetype === 'random') {
    // §3.5 · UNIFORM OVER THE LEGAL SET, using the ONE already-drawn roll — no
    // extra rng draw, which is what keeps the per-move draw count identical across
    // all three archetypes and across both pools. Genuinely uniform INCLUDING over
    // `fold`, which makes `random` the only archetype that hands the player a free
    // pot at meaningful frequency and the only one that will challenge a claim it
    // should believe. Unreadable in both directions; that is the point.
    const index = Math.floor((roll / 100) * choices.length);
    const move = choices[Math.min(Math.max(index, 0), choices.length - 1)];
    if (move === 'challenge' || move === 'fold') return { move };
    const candidate = raiseCandidates(bid, ante, choices).find((c) => c.move === move);
    // A raise kind takes the cheapest lattice step, exactly as §3.3's table.
    if (candidate) {
      return { move: candidate.move, quantity: candidate.quantity, face: candidate.face };
    }
    return { move: 'challenge' };
  }

  if (archetype === 'bad') {
    // §3.4 · A SPECIFIED LEAK, not "worse random". `bad` reasons only from its own
    // dice and never credits the unknown side with anything.
    //
    // IT NEVER FOLDS, and that is a property rather than an accident: `challenge`
    // is unconditionally legal whenever a bid stands (§5.1), so branch 3 below is
    // always reachable and the fold branch is unreachable by construction.
    if (bid.quantity - own(bid.face) > BAD_CREDULITY && choices.includes('challenge')) {
      return { move: 'challenge' };
    }
    const cheapest = raiseCandidates(bid, ante, choices)[0];
    if (cheapest) {
      return { move: cheapest.move, quantity: cheapest.quantity, face: cheapest.face };
    }
    return { move: 'challenge' };
  }

  // §3.3 · OPTIMAL — an EXPECTED-VALUE ARGMAX. Deterministic; the `roll` is
  // ignored (see the input's own note on why it is drawn anyway).
  //
  // THE MODEL ASSUMPTION, STATED RATHER THAN HIDDEN: a raise is valued AS IF THE
  // OPPONENT CHALLENGES IT IMMEDIATELY. This is a conservative, model-free
  // valuation — it needs no belief about how the player plays, which is exactly
  // why "optimal" here means "optimal against the information it has" and not
  // "solves the game". It is honest, it is testable, and it is a genuinely strong
  // policy: it will not over-challenge a claim `probAtLeast` says is likely true,
  // which is the specific failure F-137-1 named on the roaming path.
  //
  // THE DOMINANCE PROOF, so nobody "improves" this by searching the whole lattice:
  // a `raise-quantity` to any `q' > q` costs exactly `ante`, FLAT in `q'`, while
  // `pOurs` is monotone non-increasing in `q'` (`probAtLeast` is non-increasing in
  // `k`) and EV is monotone increasing in `pOurs` at fixed cost. So every
  // `q' > q + 1` is weakly dominated by `q' = q + 1`, and the same argument applies
  // to the quantity component of `raise-both`. The face component is already
  // pinned to exactly `+1` by §5.2's exploit fix. The search space is PROVABLY
  // THREE candidates, not O(maxQuantity), and the policy is O(1).
  const pTrue = probAtLeast(bid.quantity - own(bid.face), dicePerSide);
  const scored: Array<{ move: DareMove; ev: number }> = [
    { move: { move: 'challenge' }, ev: (1 - pTrue) * potPlayer - pTrue * potDealer },
    // A fold is legal while the hand is open, always. `optimal` folds only when
    // `-potDealer` beats every alternative, which needs `pTrue` very high AND every
    // raise unaffordable or worse. Rare but REACHABLE, and it must not be
    // special-cased away.
    { move: { move: 'fold' }, ev: -potDealer },
  ];
  for (const candidate of raiseCandidates(bid, ante, choices)) {
    const pOurs = probAtLeast(candidate.quantity - own(candidate.face), dicePerSide);
    scored.push({
      move: { move: candidate.move, quantity: candidate.quantity, face: candidate.face },
      ev: pOurs * potPlayer - (1 - pOurs) * (potDealer + candidate.cost),
    });
  }

  let best = scored[0];
  for (const entry of scored.slice(1)) {
    if (entry.ev > best.ev) {
      best = entry;
      continue;
    }
    if (entry.ev === best.ev) {
      const rank = (move: DareMoveKind) => OPTIMAL_TIE_BREAK.indexOf(move);
      if (rank(entry.move.move) < rank(best.move.move)) best = entry;
    }
  }
  return best.move;
}
