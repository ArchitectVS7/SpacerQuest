import { CREW_BY_ID } from '@spacerquest/content';
import { GameEvent, GameState, PlayerAction } from '../types.js';
import { SeededRng } from '../rng.js';
import { crewCapacity } from '../components.js';
import { dawnDiceModifiers, spendDie } from '../dice.js';

/**
 * T-1306 · The crew + re-roll resolvers (PRD §7 dice progression). Both are PURE
 * (clone → mutate the clone → typed events) and NEVER throw: every player-possible
 * input — malformed die selection, an out-of-range reroll, a crew rule refusal —
 * resolves to a typed event that spends nothing, mirroring resolveExploration /
 * resolveVisitHangout. The Hangout/port gate and encounter handling live in day.ts
 * (the only runtime caller).
 */

/**
 * Re-roll one un-spent dawn die, consuming a single `rerollsRemaining` charge (PRD
 * §7 "allow one re-roll"). Deterministic: the new face is `rng.d20()` off the
 * forked action rng, floored by any crew floor. The die is written IN PLACE and
 * the hand is NOT re-sorted — mid-day die indices are referenced by `spent` /
 * `spendDie`, so a re-roll may legitimately break the descending display order
 * (T-1405 renders the live faces). Validation failures emit a typed
 * `DiceRerolled{ failReason }` with no charge spent and no mutation.
 */
export function resolveReroll(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Reroll' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;
  const day = nextState.day;

  const hand = nextState.player.dawnHand;
  if (!hand) {
    events.push({ type: 'DiceRerolled', day, failReason: 'no-hand' });
    return { state: nextState, events };
  }
  const index = action.dieIndex;
  if (index < 0 || index >= hand.dice.length) {
    events.push({ type: 'DiceRerolled', day, failReason: 'invalid-die-index' });
    return { state: nextState, events };
  }
  if (hand.spent[index]) {
    events.push({ type: 'DiceRerolled', day, failReason: 'die-already-spent' });
    return { state: nextState, events };
  }
  if ((hand.rerollsRemaining ?? 0) <= 0) {
    events.push({ type: 'DiceRerolled', day, failReason: 'no-charge' });
    return { state: nextState, events };
  }

  const previous = hand.dice[index];
  const floor = dawnDiceModifiers(nextState.player.crew).floor;
  const result = Math.max(rng.d20(), floor);
  hand.dice[index] = result;
  hand.rerollsRemaining = (hand.rerollsRemaining ?? 0) - 1;

  events.push({
    type: 'DiceRerolled',
    day,
    dieIndex: index,
    previous,
    result,
    rerollsRemaining: hand.rerollsRemaining,
  });
  return { state: nextState, events };
}

/**
 * Hire or dismiss a crew role (PRD §7 dice progression). PURE, no rng. Die
 * validation is the same three-way split as resolveExploration/hangout (no die /
 * out-of-range / already-spent → typed fail, NO die spent). A hire needs the role
 * to exist, not already be aboard, a free cabin berth (`crewCapacity`, the T-1205
 * socket), and the hire price; a dismiss needs the role to be aboard (no refund).
 */
export function resolveCrew(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Crew' }>,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = JSON.parse(JSON.stringify(state)) as GameState;
  const day = nextState.day;

  // --- Die validation (malformed input → typed fail, NO die spent) ----------
  const hand = nextState.player.dawnHand;
  const index = action.spendDie;
  if (index === undefined) {
    events.push({ type: 'CrewEvent', day, kind: 'failed', failReason: 'no-die' });
    return { state: nextState, events };
  }
  if (!hand || index < 0 || index >= hand.dice.length) {
    events.push({ type: 'CrewEvent', day, kind: 'failed', failReason: 'invalid-die-index' });
    return { state: nextState, events };
  }
  if (hand.spent[index]) {
    events.push({ type: 'CrewEvent', day, kind: 'failed', failReason: 'die-already-spent' });
    return { state: nextState, events };
  }

  const crew = nextState.player.crew;
  const roleId = action.roleId;

  if (action.action === 'hire') {
    const role = CREW_BY_ID[roleId];
    if (!role) {
      events.push({ type: 'CrewEvent', day, kind: 'failed', roleId, failReason: 'unknown-role' });
      return { state: nextState, events };
    }
    if (crew.some((member) => member.roleId === roleId)) {
      events.push({ type: 'CrewEvent', day, kind: 'failed', roleId, failReason: 'already-hired' });
      return { state: nextState, events };
    }
    const berths = crewCapacity(nextState.player.ship);
    if (crew.length >= berths) {
      events.push({ type: 'CrewEvent', day, kind: 'failed', roleId, failReason: 'no-berth' });
      return { state: nextState, events };
    }
    if (nextState.player.credits < role.hirePrice) {
      events.push({
        type: 'CrewEvent',
        day,
        kind: 'failed',
        roleId,
        failReason: 'insufficient-credits',
      });
      return { state: nextState, events };
    }
    // Commit: spend the die, pay the hire price, berth the crew.
    const { die } = spendDie(hand, index);
    void die;
    hand.spent[index] = true;
    nextState.player.credits -= role.hirePrice;
    crew.push({ roleId, hiredDay: day });
    events.push({
      type: 'CrewEvent',
      day,
      kind: 'hired',
      roleId,
      cost: role.hirePrice,
      berths,
      crewCount: crew.length,
    });
    return { state: nextState, events };
  }

  // dismiss
  const memberIndex = crew.findIndex((member) => member.roleId === roleId);
  if (memberIndex === -1) {
    events.push({ type: 'CrewEvent', day, kind: 'failed', roleId, failReason: 'not-hired' });
    return { state: nextState, events };
  }
  const { die } = spendDie(hand, index);
  void die;
  hand.spent[index] = true;
  crew.splice(memberIndex, 1);
  events.push({ type: 'CrewEvent', day, kind: 'dismissed', roleId, crewCount: crew.length });
  return { state: nextState, events };
}
