import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_WIRE,
  DEEDS,
  NEMESIS_SYSTEM_ID,
  RENOWN_DEED_THRESHOLDS,
  isGatedDestination,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  grantFragment,
  rankForDeedCount,
  startDay,
  syncMaxFuel,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-1505b · THE SCRIPTED CROSSING SIM.
//
// HONEST SPLIT, stated up front (the `nemesis-file.spec.ts` convention):
//
// SCENARIO INPUT — the injected fixture, and nothing else:
//   * Position: Mizar-9 (system 18), the Sage's bench.
//   * The twelve fragments, GRANTED (raw, undecoded) through the engine's own
//     `grantFragment` — never a hand-written nemesisFile record. That all three
//     acquisition modes actually yield fragments in play is proven separately by
//     `nemesis-fragments.test.ts`; this file declines to re-fly that journey.
//   * The registry stood up at the crossing's required rank — its ledger filled
//     with `RENOWN_DEED_THRESHOLDS.CONQUEROR` real content deeds and the rank
//     read back through `rankForDeedCount`, both DERIVED, so T-1603's threshold
//     rescale cannot rot the fixture. That a real, unguided career REACHES
//     CONQUEROR is proven by `deed-coverage.test.ts` (seed 2, crossed on day 102
//     of honest play); this file declines to re-pay that ~30s.
//   * A fitted-veteran ship (drives/hull/nav) with a full tank, a bank balance,
//     and a residue of Guild debt — the last of these deliberately, so the
//     refusal path below is exercised for real.
//
// PLAYED — through `applyPlayerAction` only, never a state poke:
//   * all twelve Sage decodes, via the real `sage.mizar.decode-*` storylets;
//   * the crossing storylet's DECLINE, and its re-offer at the next dawn;
//   * a REFUSED commit (Guild debt outstanding), and the debt payment that
//     clears it;
//   * the successful commit;
//   * the jump to NEMESIS.
//
// Budget: no campaign driver, no seed sweep — this is a scripted scene, and it
// costs the sim suite near-zero wall clock.
// ---------------------------------------------------------------------------

const MIZAR = 18;
const CROSSING_STORYLET = 'nemesis.crossing.the-stake';
/** Scenario input only — nothing here is seed-sensitive (the stake takes no rng). */
const SEED = 505;
/** The residue of debt the fixture opens with, so the refusal path is real. */
const LEFTOVER_DEBT = 4000;

type Crossing = Extract<GameEvent, { type: 'NemesisCrossing' }>;

const crossingEvents = (events: readonly GameEvent[]): Crossing[] =>
  events.filter((e): e is Crossing => e.type === 'NemesisCrossing');

/** Is this storylet on the board right now? */
function offered(state: GameState, storyletId: string): boolean {
  return state.storylets.available.some((offer) => offer.storyletId === storyletId);
}

/** The Sage's decode storylet id for a fragment — the SHIPPED content ids, so the
 *  test walks the same doors a player does. Fragment 01's path predates the
 *  numbered batch and is named differently. */
function decodeStoryletFor(fragmentId: string): string {
  return fragmentId === 'frag-nemesis-01'
    ? 'sage.mizar.decode-first'
    : `sage.mizar.decode-${fragmentId.slice(-2)}`;
}

/** The scenario fixture. See the HONEST SPLIT header for what is input vs played. */
function atTheSagesBench(): GameState {
  const base = createInitialState(SEED);
  base.player.currentSystemId = MIZAR;
  // The registry is stood up by its DEED COUNT, not by writing a rank: the engine
  // re-derives `renownRank` from `earned.length` on every deed evaluation
  // (`evaluateDeeds` → `rankForDeedCount`), so a hand-set rank is silently
  // demoted the first time any action earns a deed. Filling the ledger with the
  // capstone's threshold of REAL content deeds is the honest fixture — and both
  // the count and the rank are DERIVED from content, so T-1603's rescale moves
  // this fixture with the game instead of rotting it.
  base.player.registry.earned = DEEDS.slice(0, RENOWN_DEED_THRESHOLDS.CONQUEROR).map(
    (deed, index) => ({
      id: deed.id,
      title: deed.title,
      citation: deed.citationTemplate,
      day: 1,
      eventIndex: index,
    }),
  );
  base.player.registry.renownRank = rankForDeedCount(base.player.registry.earned.length);
  base.player.credits = CROSSING_STAKE_MIN_CREDITS + LEFTOVER_DEBT * 2;
  base.player.debt = LEFTOVER_DEBT;
  base.player.loan = null;
  // A veteran fit: drives that make the burn payable, a hull whose tank holds it,
  // and the navigation suite the crossing check leans on. Capacity is synced
  // through the engine's own chokepoint (applyPlayerAction re-syncs every action).
  base.player.ship.drives = { strength: 60, condition: 9 };
  base.player.ship.hull = { strength: 30, condition: 9 };
  base.player.ship.navigation = { strength: 90, condition: 9 };
  syncMaxFuel(base.player.ship);
  base.player.ship.fuel = base.player.ship.maxFuel;
  for (const id of ALL_FRAGMENT_IDS) {
    grantFragment(base.player.nemesisFile, id, 'sage', base.day);
  }
  return startDay(base).state;
}

/** Play a storylet choice through the real action path. */
function play(
  state: GameState,
  storyletId: string,
  choiceId: string,
): { state: GameState; events: GameEvent[] } {
  return applyPlayerAction(state, { type: 'Storylet', storyletId, choiceId });
}

/** Highest unspent die — a real hand, just not a wasted die on the endgame roll. */
function bestDie(state: GameState): number {
  const hand = state.player.dawnHand;
  if (!hand) throw new Error('no dawn hand');
  let bestIndex = -1;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      bestIndex = i;
    }
  }
  if (bestIndex < 0) throw new Error('no unspent die');
  return bestIndex;
}

describe('T-1505b · the crossing is completable only with the full decoded set and the stake paid', () => {
  it('walks the whole terminus through legal actions', () => {
    let state = atTheSagesBench();

    // (a) PRE-STAKE: the NEMESIS gate is shut. A Travel there is a typed refusal.
    const early = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: bestDie(state),
    });
    expect(
      early.events.some(
        (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
      ),
      'the NEMESIS gate was open before the stake was paid',
    ).toBe(true);
    // The refusal spent nothing, so the run continues on the SAME state.
    expect(early.state.player.dawnHand?.spent.some(Boolean)).toBe(false);
    state = early.state;

    // (b) WITH ONE FRAGMENT STILL RAW the crossing is not on the board at all.
    //     Decode eleven of the twelve through the Sage's real storylets.
    const [lastFragment, ...firstEleven] = [...ALL_FRAGMENT_IDS].reverse();
    for (const fragmentId of firstEleven) {
      const storyletId = decodeStoryletFor(fragmentId);
      expect(offered(state, storyletId), `${storyletId} was not offered at the Sage's bench`).toBe(
        true,
      );
      state = play(state, storyletId, 'decode').state;
    }
    expect(state.player.nemesisFile.fragments.filter((f) => f.decoded)).toHaveLength(
      ALL_FRAGMENT_IDS.length - 1,
    );
    expect(
      offered(state, CROSSING_STORYLET),
      'the crossing was offered with the set still incomplete',
    ).toBe(false);

    // (c) THE TWELFTH DECODE opens the door.
    state = play(state, decodeStoryletFor(lastFragment), 'decode').state;
    expect(offered(state, CROSSING_STORYLET), 'the crossing never appeared').toBe(true);

    // (d) DECLINE: 'stand-down' changes nothing, and the beat RE-OFFERS tomorrow.
    const creditsBeforeDecline = state.player.credits;
    const declined = play(state, CROSSING_STORYLET, 'stand-down');
    expect(crossingEvents(declined.events)).toHaveLength(0);
    expect(declined.state.flags['nemesis.crossing.unlocked']).toBeUndefined();
    expect(declined.state.player.credits).toBe(creditsBeforeDecline);
    expect(offered(declined.state, CROSSING_STORYLET), 'a decline should retire it TODAY').toBe(
      false,
    );
    state = startDay(endDay(declined.state).state).state;
    expect(
      offered(state, CROSSING_STORYLET),
      'the crossing did not re-offer after a decline (repeat:daily)',
    ).toBe(true);

    // (e) A COMMIT WITH DEBT OUTSTANDING is refused and changes nothing…
    const creditsBeforeRefusal = state.player.credits;
    const refused = play(state, CROSSING_STORYLET, 'commit');
    expect(crossingEvents(refused.events)).toEqual([
      {
        type: 'NemesisCrossing',
        day: refused.state.day,
        kind: 'stake-refused',
        reason: 'debt-outstanding',
      },
    ]);
    expect(refused.state.flags['nemesis.crossing.unlocked']).toBeUndefined();
    expect(refused.state.player.credits).toBe(creditsBeforeRefusal);
    state = refused.state;

    // …and after the ledger is cleared through the real pay-debt action, the SAME
    // choice commits. (The beat is spent for today — it re-offers at dawn.)
    state = applyPlayerAction(state, {
      type: 'Trade',
      action: 'pay-debt',
      amount: state.player.debt,
    }).state;
    expect(state.player.debt).toBe(0);
    state = startDay(endDay(state).state).state;
    expect(offered(state, CROSSING_STORYLET)).toBe(true);

    const balance = state.player.credits;
    const committed = play(state, CROSSING_STORYLET, 'commit');
    expect(crossingEvents(committed.events)).toEqual([
      {
        type: 'NemesisCrossing',
        day: committed.state.day,
        kind: 'stake-committed',
        stakeCredits: balance,
      },
    ]);
    expect(committed.events).toContainEqual({
      type: 'WireEntry',
      day: committed.state.day,
      kind: 'plain',
      message: CROSSING_WIRE.stakeCommitted,
    });
    state = committed.state;
    expect(state.player.credits).toBe(0);
    expect(state.flags['nemesis.crossing.unlocked']).toBe(true);
    expect(state.flags['nemesis.crossing.stake.credits']).toBe(balance);
    // Once paid, the beat is retired for good — the trigger's `exists:false`.
    state = startDay(endDay(state).state).state;
    expect(
      offered(state, CROSSING_STORYLET),
      'the crossing re-offered after the stake was already signed',
    ).toBe(false);

    // (f) ANDROMEDA STAYS SEALED. The lift is NEMESIS-only: with the stake PAID
    //     and the gate open, every other gated id is still refused.
    //
    //     T-1505c FALLOUT (rebalance-fallout rule): this loop used to run AFTER
    //     the jump. It cannot any more — from the far side the engine's terminal
    //     guard refuses every verb with `career-ended` BEFORE the destination gate
    //     is reached (that ordering is deliberate and asserted in day.test.ts), so
    //     a post-arrival Travel no longer reports 'destination-locked'. Moving the
    //     loop here does not weaken it: post-commit / pre-crossing is exactly where
    //     "the lift opened one door and only one" is load-bearing, because it is
    //     the only window in which the flag is set and the ship can still fly.
    for (let id = 21; id <= 27; id += 1) {
      expect(isGatedDestination(id)).toBe(true);
      const blocked = applyPlayerAction(state, {
        type: 'Travel',
        destinationId: id,
        spendDie: bestDie(state),
      });
      expect(
        blocked.events.some(
          (event) => event.type === 'ActionBlocked' && event.reason === 'destination-locked',
        ),
        `system ${id} was travelable with the stake paid`,
      ).toBe(true);
    }

    // (g) POST-COMMIT the jump lands. The crossing takes no encounter roll and
    //     rolls the content DC, so this is deterministic on the fitted nav suite.
    const jump = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: NEMESIS_SYSTEM_ID,
      spendDie: bestDie(state),
    });
    const check = jump.events.find((event) => event.type === 'StatCheck');
    if (check?.type !== 'StatCheck' || !check.result.success) {
      throw new Error('fixture regression: the pinned hand no longer clears the crossing DC');
    }
    expect(jump.state.player.currentSystemId).toBe(NEMESIS_SYSTEM_ID);
    expect(crossingEvents(jump.events)).toContainEqual({
      type: 'NemesisCrossing',
      day: jump.state.day,
      kind: 'crossed',
    });
    expect(jump.state.eventLog).toContainEqual({
      type: 'WireEntry',
      day: jump.state.day,
      kind: 'plain',
      message: CROSSING_WIRE.crossed,
    });
    state = jump.state;

    // (h) THE FAR SIDE IS TERMINAL (T-1505c). Andromeda is not "still sealed" from
    //     here — nothing is reachable at all, because the career is over. Every
    //     blockable verb, including a Travel to a gated id, now reads 'career-ended'
    //     ahead of any other refusal. The ending itself (the epilogue, the empty
    //     legal-action set) is proven in `nemesis-arc.test.ts`.
    const afterCrossing = applyPlayerAction(state, {
      type: 'Travel',
      destinationId: 21,
      spendDie: bestDie(state),
    });
    expect(afterCrossing.events).toContainEqual({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Travel',
      reason: 'career-ended',
    });
    expect(isGatedDestination(21)).toBe(true);
  });
});
