// ---------------------------------------------------------------------------
// T-1504 · Conqueror / all-deed driver (test-only, legal play).
//
// Reaching every Deed — and the CONQUEROR rank at 30 of them — takes a player who
// does EVERYTHING: trades the marker clear, climbs renown through combat and rim
// runs, AND exercises the new verbs (gambling, lending, exploration, property,
// smuggling). The shipped `veteranPolicy` is a lean ENDGAME grinder and, by
// deliberate design (see the crew/port wrapper comments in campaign-reach.test.ts),
// does NOT gamble, borrow, buy ports, or clear the Tour One marker — folding those
// into it would degrade its documented 500-day ASTRAXIAL climb and re-pin the
// T-114a / tier / rim / disposition seed tests. So, exactly like
// `portBuyingVeteranPolicy` / `crewHiringVeteranPolicy`, the extra-verb steering
// lives HERE, in the test support layer, wrapping the shipped policy rather than
// changing it.
//
// HONESTY: every branch emits only LEGAL engine actions (VisitHangout / Port /
// Explore / Trade), each guarded by the same preconditions the protocol harness
// advertises (an in-system NPC for a Dare, a purchasable unowned port, fuel for an
// Explore, a Hangout system for lending). NOTHING pokes state.flags, registry,
// eraEvent, credits, or position to force a Deed. If a Deed were unearnable the
// fix would be to re-author it, not to poke state.
// ---------------------------------------------------------------------------
import {
  DARE_MIN_WAGER,
  EXPLORATION_FUEL_COST,
  LOAN_MIN_PRINCIPAL,
  PURCHASABLE_PORTS_BY_SYSTEM,
  STAR_SYSTEMS,
  isPurchasablePort,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  SeededRng,
  startDay,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { traderPolicy, veteranPolicy, type SimPolicy } from '../../index.js';

/** A credit floor the verb-steering never spends below, so the extra verbs never
 *  starve the veteran's core trade/upgrade loop (keeps the poverty-trap invariant
 *  intact — the wrapper only ever spends SURPLUS). */
const VERB_RESERVE = 4000;

/** The Deed a given verb chase targets — used to gate each branch so it fires only
 *  while its Deed is still unearned (then stops, leaving the dice for trade). */
type Need = (id: string) => boolean;

/** Indices of dice this batch has already claimed (veteran actions + earlier verb
 *  appends), so a verb append never collides with a spend already planned. */
function claimSpareDie(state: GameState, used: Set<number>): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && !used.has(i)) {
      used.add(i);
      return i;
    }
  }
  return undefined;
}

/**
 * Wrap the shipped `veteranPolicy` and, on dice it left free, append the
 * new-verb actions whose Deed is still unearned. Appends at most one action per
 * verb per day, each on a distinct spare die, only when flush above VERB_RESERVE.
 */
function deedVerbSteer(ctx: Parameters<SimPolicy>[0]): PlayerAction[] {
  const actions = veteranPolicy(ctx);
  const { state } = ctx;
  // Encounter days belong to combat — leave the veteran's stance plan untouched.
  if (state.encounter) return actions;

  const earned = new Set(state.player.registry.earned.map((deed) => deed.id));
  const need: Need = (id) => !earned.has(id);
  const player = state.player;
  const here = player.currentSystemId;
  const ship = player.ship;

  const used = new Set<number>();
  for (const action of actions) {
    const die = (action as PlayerAction & { spendDie?: number }).spendDie;
    if (typeof die === 'number') used.add(die);
  }

  const extra: PlayerAction[] = [];
  const hasHangout = STAR_SYSTEMS[here]?.hasHangout === true;
  // Gambling (the Dare Deeds) is handled as a dedicated home day in
  // conquerorDeedPolicy — the veteran leaves no free die at Sun-3 for an appended
  // Dare, so it must claim the whole day. The remaining verbs below DO append
  // cleanly on a spare die the veteran left.

  // --- Lending: borrow a minimum-band loan (first_loan), then clear it in full
  // (loan_cleared) once a loan is live and affordable. Penny Wise is the desk —
  // no co-located NPC needed, only a Hangout system. ---
  if (hasHangout && !player.loan && need('first_loan')) {
    const die = claimSpareDie(state, used);
    if (die !== undefined) {
      extra.push({
        type: 'VisitHangout',
        venue: 'borrow',
        amount: LOAN_MIN_PRINCIPAL,
        spendDie: die,
      });
    }
  } else if (
    hasHangout &&
    player.loan &&
    need('loan_cleared') &&
    player.credits >= player.loan.outstanding + VERB_RESERVE
  ) {
    const die = claimSpareDie(state, used);
    if (die !== undefined) {
      extra.push({
        type: 'VisitHangout',
        venue: 'repay',
        amount: player.loan.outstanding,
        spendDie: die,
      });
    }
  }

  // --- Property: buy the stake in a purchasable core port we do not own
  // (landlord / port_baron). ---
  if (
    isPurchasablePort(here) &&
    !player.ports.some((port) => port.systemId === here) &&
    (need('landlord') || need('port_baron')) &&
    player.credits >= PURCHASABLE_PORTS_BY_SYSTEM[here].purchasePrice + VERB_RESERVE
  ) {
    const die = claimSpareDie(state, used);
    if (die !== undefined) {
      extra.push({ type: 'Port', action: 'buy', systemId: here, spendDie: die });
    }
  }

  // --- Exploration: chart a POI (first_poi / salvager / pathfinder). Keep enough
  // fuel margin that the Explore burn never strands the ship. ---
  if (
    (need('first_poi') || need('salvager') || need('pathfinder')) &&
    ship.fuel >= EXPLORATION_FUEL_COST + 40
  ) {
    const die = claimSpareDie(state, used);
    if (die !== undefined) {
      extra.push({ type: 'Explore', spendDie: die });
    }
  }

  return extra.length > 0 ? [...actions, ...extra] : actions;
}

/**
 * The all-verb driver policy. Two phases:
 *   1. Days 1-30 with the marker still open → the competent `traderPolicy`, which
 *      clears the 25,000 Tour One marker in ~100% of seeds by day 30 (measured in
 *      campaign-policies.test.ts) — earning tour_one_cleared + debt_cleared at the
 *      day-30 resolution, which no endgame grinder does.
 *   2. Afterwards → the veteran career + new-verb steering (deedVerbSteer). The
 *      base veteran already earns the combat / rim / era-storylet Deeds
 *      (war_profiteer, crisis_courier, beacon_keeper, contraband) through play; the
 *      wrapper adds gambling / lending / property / exploration on top.
 */
export const conquerorDeedPolicy: SimPolicy = (ctx) => {
  const { state } = ctx;
  if (state.day <= 30 && state.player.debt > 0) {
    // Play any offered storylet as a standalone day first (the trader itself does
    // not) so the Tour-One-only doc-salvage chain — the beacon_keeper source — is
    // walked when co-located with Doc, exactly as the veteran phase would.
    const storylet = firstFreeStoryletAction(state);
    if (storylet) return [storylet];
    return traderPolicy(ctx);
  }

  // Dedicated Dare day. high_roller needs FIVE Dares, but the veteran spends every
  // die on trade at Sun-3 (the only Hangout), so appending a Dare after it almost
  // never finds a free die. When a gambling Deed is still open and we are at the
  // Hangout with an opponent, sacrifice this one home day to a Dare instead — the
  // honest way a player farms the wager Deeds. Skipped the moment they are earned.
  if (!state.encounter) {
    const earned = new Set(state.player.registry.earned.map((deed) => deed.id));
    const wantsGambling =
      !earned.has('first_wager') || !earned.has('dare_winner') || !earned.has('high_roller');
    const opponent = state.npcs.find((n) => n.currentSystemId === state.player.currentSystemId);
    const die = firstFreeDieIndex(state);
    if (
      wantsGambling &&
      STAR_SYSTEMS[state.player.currentSystemId]?.hasHangout === true &&
      opponent &&
      state.player.credits > DARE_MIN_WAGER * 2 &&
      die !== undefined
    ) {
      return [
        {
          type: 'VisitHangout',
          venue: 'dare',
          opponentId: opponent.id,
          wager: DARE_MIN_WAGER,
          spendDie: die,
        },
      ];
    }
  }

  return deedVerbSteer(ctx);
};

/** First unspent dawn die index, or undefined if the hand is spent/absent. */
function firstFreeDieIndex(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i]) return i;
  }
  return undefined;
}

/** A Storylet action for the doc-salvage chain when it is offered (the ONLY
 *  Tour-One storylet that feeds a Deed — beacon_keeper). Restricted to that chain
 *  so phase 1 does not squander its trading days on unrelated cards and stall the
 *  marker clear. Picks a requirement-free choice (no die, no credit collision). */
function firstFreeStoryletAction(state: GameState): PlayerAction | null {
  for (const offer of state.storylets.available) {
    if (!offer.storyletId.startsWith('chain.doc-salvage.')) continue;
    const choice = offer.choices.find((c) => !c.requirements);
    if (choice) {
      return { type: 'Storylet', storyletId: offer.storyletId, choiceId: choice.id };
    }
  }
  return null;
}

/** Drive `conquerorDeedPolicy` headlessly (same shape as driveCompetentCampaign),
 *  returning the final GameState. A mid-batch-blocked action (e.g. an encounter
 *  starting) is tolerated exactly as the disposition sim's driver tolerates it, so
 *  a speculative verb append never aborts the whole run. */
export function driveConquerorCampaign(seed: number, days: number): GameState {
  let state = createInitialState(seed);
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const rng = new SeededRng(seed)
      .fork('policy')
      .fork(`day-${state.day}`)
      .fork(`index-${dayIndex}`);
    let dayState = startDay(state).state;
    const actions = conquerorDeedPolicy({ state: dayState, dayIndex, rng });
    for (const action of actions) {
      try {
        dayState = applyPlayerAction(dayState, action).state;
      } catch {
        // A planned action can be invalidated by a mid-batch state change (an
        // encounter interrupting a jump); skip it and keep the run going.
      }
    }
    state = endDay(dayState).state;
  }
  return state;
}
