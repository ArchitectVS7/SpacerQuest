/**
 * T-135 · THE LIAR'S DICE RESOLVER (`docs/LIARS-DICE_REDESIGN.md` §5, §6, §8, §9).
 *
 * One `Dare` action is one PLAYER move plus — when the hand still stands — the
 * DEALER'S ANSWER, computed in the same call off the same forked rng. That is
 * `resolveCombat`'s shape (the enemy counter-fires inside the player's own volley;
 * the player never sends an "enemy turn" action), and it is what makes the
 * returned state ALWAYS player-to-act — the invariant §2.3's missing `toAct` field
 * and §12's sim continuation loop both rest on.
 *
 * NEVER THROWS. Every player-possible input — a move with no open hand, a face
 * raise that also moves the quantity, a peek naming a spent die — resolves to a
 * typed `HangoutEvent{venue:'dare', failReason}` that spends nothing and moves
 * nothing. This is deliberately safer than `resolveCombat`, which throws and made
 * the sweep runner grow a special case (`sim/index.ts`'s Combat skip); the engine
 * must not require that of its drivers.
 *
 * A RESOLVER, NOT A RULE. Every number it decides with comes from
 * `liarsDiceRules.ts` (the lattice, the ante, the headroom, the dealer policy) or
 * `hangoutRules.ts` (the port's band and venue params). There is no per-port
 * branch here and no literal that a port could have authored.
 *
 * THE HAND IS OPENED ELSEWHERE: `actions/hangout.ts`'s `case 'dare'`, because the
 * opening move is still a `VisitHangout` and the die validation, the
 * `venueOffered` gate and the opponent resolution already live there.
 */

import { Stat } from '@spacerquest/content';
import { check, spendDie } from '../dice.js';
import { cloneState } from '../clone.js';
import { npcGuile, venueParamsFor } from '../hangoutRules.js';
import {
  dealerMove,
  headroomFor,
  isLatticeMove,
  legalDareMoves,
  nominalCost,
  resolveChallenge,
} from '../liarsDiceRules.js';
import { applyDisposition, mutableNpc } from '../npc.js';
import { SeededRng } from '../rng.js';
import {
  DareBidEntry,
  DareHandState,
  DareMoveKind,
  DareOutcome,
  GameEvent,
  GameState,
  PlayerAction,
} from '../types.js';

/** The five terminal outcomes, split by which disposition arm and which ledger
 *  direction they take. `dealer-fold` is mechanically a player win. */
function playerWonOn(outcome: DareOutcome): boolean {
  return outcome === 'challenge-win' || outcome === 'dealer-fold';
}

/**
 * SETTLE A HAND — the one place the escrow moves, the one place disposition
 * moves, and the one place `state.dareHand` is cleared.
 *
 * Exported because `endDay` needs it for the dusk timeout fold (§6.2): an open
 * hand at dusk is resolved as a player fold with `outcome: 'timeout-fold'` —
 * identical economics, identical disposition delta, identical events. It draws NO
 * rng, so `rngState` and every downstream dusk draw are unperturbed, which is what
 * keeps the day-loop goldens' EVENT hashes honest across this change.
 *
 * THE LEDGER (§6.3). `potPlayer` / `potDealer` are money ALREADY debited (§2.4),
 * so settlement is a transfer of an escrow that exists rather than the collection
 * of a promise:
 *   - the player takes the pot  → `player.credits += potPlayer + potDealer`,
 *     `creditsDelta = +potDealer`;
 *   - the dealer takes the pot  → `dealer.credits += potPlayer + potDealer`,
 *     `creditsDelta = −potPlayer`.
 * A player who has raised more than the dealer therefore loses more than they can
 * win. That asymmetry is the ante doing its job.
 *
 * THE REVEAL. `dealerDice` rides `DareHandResolved` on the two CHALLENGE outcomes
 * and on no other — a fold never reveals, and the player never learns whether it
 * was correct. §10.2's hidden-dice discipline is enforced here, at the only site
 * that could break it.
 */
export function settleDareHand(state: GameState, outcome: DareOutcome, events: GameEvent[]): void {
  const hand = state.dareHand;
  if (!hand) return;

  const showdown = outcome === 'challenge-win' || outcome === 'challenge-loss';
  const actualCount = showdown ? resolveChallenge(hand).actualCount : undefined;

  const pot = hand.potPlayer + hand.potDealer;
  const playerWon = playerWonOn(outcome);
  const creditsDelta = playerWon ? hand.potDealer : -hand.potPlayer;
  if (playerWon) {
    state.player.credits += pot;
  } else {
    // COPY-ON-WRITE (npc.ts `mutableNpc`): NPC records are shared between
    // snapshots, so the dealer's winnings land on a private copy.
    const dealerPurse = mutableNpc(state, hand.dealerId);
    if (dealerPurse) dealerPurse.credits += pot;
  }

  // §7 · THREE ARMS, one `applyDisposition` call, `reason: 'dare'`, exactly once
  // per hand — the same cadence today's single-check Dare had, which is what keeps
  // T-125's interceptor measurement comparable (§7.5 property 2). The framing is
  // the HOUSE's: the dare's SUCCESS arm is the one where the dealer prevails.
  const params = venueParamsFor(hand.systemId, 'dare');
  const dispositionDelta =
    outcome === 'player-fold' || outcome === 'timeout-fold'
      ? params.dispositionOnFold
      : playerWon
        ? params.dispositionOnFailure
        : params.dispositionOnSuccess;
  // BEFORE the two terminal events, so the DispositionChanged sits in the same
  // batch and in the same order today's Dare produced it. `applyDisposition`'s
  // ±10 clamp and its `delta === 0` early return are unchanged, so a port that
  // authors `dispositionOnFold: 0` emits no DispositionChanged at all.
  applyDisposition(state, hand.dealerId, dispositionDelta, 'dare', events);

  events.push({
    type: 'DareHandResolved',
    day: state.day,
    handId: hand.id,
    opponentId: hand.dealerId,
    outcome,
    bid: hand.bid ? { ...hand.bid } : null,
    ...(actualCount !== undefined ? { actualCount } : {}),
    playerDice: [...hand.playerDice],
    ...(showdown ? { dealerDice: [...hand.dealerDice] } : {}),
    creditsDelta,
    dispositionDelta,
  });

  // §10.3 · THE TERMINAL HangoutEvent STAYS, unchanged in shape. Nine shipped
  // readers key on it — four content deeds, `HangoutPlayStats` (the instrument
  // T-137 measures with), and the Hangout pane. `wager` is the SEED (the player's
  // chosen stake, which is what `high_roller`'s >= 250 was calibrated against),
  // NOT the pot; `creditsDelta` is the NET over the whole hand, so
  // `hangoutPlay.netCredits` stays "the tables' net effect on the purse".
  events.push({
    type: 'HangoutEvent',
    day: state.day,
    venue: 'dare',
    opponentId: hand.dealerId,
    wager: hand.seedWager,
    playerWon,
    creditsDelta,
  });

  state.dareHand = null;
}

/** A typed refusal that changes nothing and spends nothing. */
function refuse(
  state: GameState,
  failReason:
    'no-dare-hand' | 'illegal-dare-move' | 'no-die' | 'invalid-die-index' | 'die-already-spent',
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [{ type: 'HangoutEvent', day: state.day, venue: 'dare', failReason }];
  return { state, events };
}

/** Apply one bid/raise to the hand: debit the actor's escrow, move the standing
 *  claim, and record it in the public history + a `DareBidPlaced`. */
function placeBid(
  state: GameState,
  hand: DareHandState,
  actor: 'player' | 'dealer',
  move: 'bid' | 'raise-face' | 'raise-quantity' | 'raise-both',
  quantity: number,
  face: number,
  events: GameEvent[],
): void {
  const antePaid = nominalCost(move, hand.ante);
  if (antePaid > 0) {
    if (actor === 'player') {
      state.player.credits -= antePaid;
      hand.potPlayer += antePaid;
    } else {
      const dealerPurse = mutableNpc(state, hand.dealerId);
      if (dealerPurse) dealerPurse.credits -= antePaid;
      hand.potDealer += antePaid;
    }
  }
  hand.bid = { quantity, face };
  hand.bidder = actor;
  const entry: DareBidEntry = { actor, move, quantity, face, antePaid };
  hand.history.push(entry);
  events.push({
    type: 'DareBidPlaced',
    day: state.day,
    handId: hand.id,
    actor,
    move,
    quantity,
    face,
    antePaid,
    potPlayer: hand.potPlayer,
    potDealer: hand.potDealer,
  });
}

/**
 * ONE MOVE IN THE OPEN HAND. See the module header for the never-throws contract
 * and the synchronous-dealer shape.
 */
export function resolveDare(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Dare' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);
  const events: GameEvent[] = [];

  // --- GATE 3 (§9.3): a Dare with no open hand is a typed no-op, never a throw.
  const hand = nextState.dareHand;
  if (!hand) return refuse(nextState, 'no-dare-hand');

  const move: DareMoveKind = action.move;

  // --- PEEK (§8) ----------------------------------------------------------
  if (move === 'peek') {
    // ORDER, chosen deliberately: the three-way DIE split fires BEFORE the
    // `bid === null && !peekUsed` legality check, mirroring `resolveVisitHangout`
    // — malformed input is refused before rule input. Both spend nothing, so the
    // ordering only decides which reason the player is shown.
    if (action.spendDie === undefined) return refuse(nextState, 'no-die');
    const dawnHand = nextState.player.dawnHand;
    const index = action.spendDie;
    if (!dawnHand || index < 0 || index >= dawnHand.dice.length) {
      return refuse(nextState, 'invalid-die-index');
    }
    if (dawnHand.spent[index]) return refuse(nextState, 'die-already-spent');
    if (!legalDareMoves(hand, 'player', nextState.player.credits).includes('peek')) {
      return refuse(nextState, 'illegal-dare-move');
    }

    const { die } = spendDie(dawnHand, index);
    dawnHand.spent[index] = true;
    // THE `dare` ROW'S `dc` CELL, previously ignored while a Dare was opposed, is
    // the Peek DC — a rule reading content, per port, never a literal here.
    const dc = venueParamsFor(hand.systemId, 'dare').dc;
    const result = check(die, nextState.player.stats[Stat.GUILE], dc);
    events.push({
      type: 'StatCheck',
      actor: 'Player',
      stat: Stat.GUILE,
      dc,
      result,
      // The ONLY StatCheck a Liar's Dice hand ever emits (§8.4). Routes to the
      // wire's gamble bucket, exactly as today's player Dare check does.
      actionContext: 'gamble',
    });
    hand.peekUsed = true;
    if (result.success) {
      // The rng picks the die, not the player: with four exchangeable dice and one
      // peek, a chosen index is the same distribution wearing a UI (§8.3).
      const dieIndex = Math.floor(rng.next() * hand.dealerDice.length);
      const value = hand.dealerDice[dieIndex];
      hand.peekedDealerDie = { index: dieIndex, value };
      events.push({
        type: 'DarePeeked',
        day: nextState.day,
        handId: hand.id,
        success: true,
        dieIndex,
        value,
      });
    } else {
      events.push({ type: 'DarePeeked', day: nextState.day, handId: hand.id, success: false });
    }
    // A Peek answers no bid, so the dealer does not move.
    return { state: nextState, events };
  }

  // --- LEGALITY (§5.1) ----------------------------------------------------
  // ONE source of legality for the refusal, the dealer's choice and the sim's
  // planner. Refused with a typed event rather than clamped into legality, and a
  // refusal spends nothing: no die, no ante, no escrow, no disposition.
  if (!legalDareMoves(hand, 'player', nextState.player.credits).includes(move)) {
    return refuse(nextState, 'illegal-dare-move');
  }
  if (!isLatticeMove(hand.bid, move, action.quantity, action.face)) {
    return refuse(nextState, 'illegal-dare-move');
  }

  // --- THE PLAYER'S MOVE --------------------------------------------------
  if (move === 'fold') {
    settleDareHand(nextState, 'player-fold', events);
    return { state: nextState, events };
  }
  if (move === 'challenge') {
    // The CHALLENGER is the actor who played CALL; the BIDDER owns the standing
    // claim. `bidderWins` decides which of them takes the pot.
    const { bidderWins } = resolveChallenge(hand);
    const playerIsBidder = hand.bidder === 'player';
    const playerTakesIt = bidderWins === playerIsBidder;
    settleDareHand(nextState, playerTakesIt ? 'challenge-win' : 'challenge-loss', events);
    return { state: nextState, events };
  }

  placeBid(
    nextState,
    hand,
    'player',
    move,
    action.quantity as number,
    action.face as number,
    events,
  );

  // --- THE DEALER'S ANSWER, in the same call (§9.4) ------------------------
  const dealerNpc = nextState.npcs.find((n) => n.id === hand.dealerId);
  if (!dealerNpc) {
    // The dealer left the roster mid-hand (a death, a content edit across a
    // reload). Nothing to answer with and nothing to take the pot — close the hand
    // the same way dusk would, so no state can carry a counterparty-less scene.
    settleDareHand(nextState, 'timeout-fold', events);
    return { state: nextState, events };
  }
  // `npcGuile` reads the profile; the POLICY never sees an NpcState (§9.7).
  const answer = dealerMove({
    dealerDice: hand.dealerDice,
    bid: hand.bid,
    bidder: hand.bidder,
    dealerGuile: npcGuile(dealerNpc),
    ante: hand.ante,
    headroom: headroomFor(hand, 'dealer'),
    dealerCredits: dealerNpc.credits,
    roll: Math.floor(rng.next() * 100),
  });

  if (answer.move === 'fold') {
    settleDareHand(nextState, 'dealer-fold', events);
    return { state: nextState, events };
  }
  if (answer.move === 'challenge') {
    const { bidderWins } = resolveChallenge(hand);
    // The dealer challenged, so the PLAYER owns the standing bid by construction.
    settleDareHand(nextState, bidderWins ? 'challenge-win' : 'challenge-loss', events);
    return { state: nextState, events };
  }

  placeBid(
    nextState,
    hand,
    'dealer',
    answer.move,
    answer.quantity as number,
    answer.face as number,
    events,
  );
  return { state: nextState, events };
}
