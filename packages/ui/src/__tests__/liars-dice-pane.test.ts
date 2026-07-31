import { describe, expect, it } from 'vitest';
import {
  applyPlayerAction,
  createInitialState,
  legalDareMoves,
  startDay,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';
import { dareRevealFrom, dareScene } from '../format';

// ---------------------------------------------------------------------------
// T-136 · THE FOG PROJECTION, PROVED RATHER THAN CLAIMED
// (`docs/LIARS-DICE_REDESIGN.md` §10.2; `format.ts`'s `DareSceneView`).
//
// The engine keeps the dealer's four dice out of every event. It cannot keep them
// out of `GameState` — the resolver has to count them at a challenge — so
// `game.dareHand.dealerDice` is one property access away from any JSX in the
// cockpit. `DareSceneView` closes that by CONSTRUCTION: it carries a COUNT and no
// values, and the live scene component is handed nothing else.
//
// The headline test below is the only kind of proof that argument admits. It does
// not read the projection and check for absence (which passes trivially if the
// field is renamed); it VARIES the hidden information across three different
// dealer hands and asserts the projection is deep-equal every time. A function
// whose output cannot move with the dealer's dice cannot leak them.
//
// Everything here is a selector over `format.ts`, never over `store.ts` — the
// store runs `init()` at module load and reaches for storage and sound. Vitest
// runs these in a NODE environment (`vitest.config.ts`), so there is no DOM and
// no `.tsx`; the real-clicks half lives in `packages/ui/e2e/liars-dice.spec.ts`.
// ---------------------------------------------------------------------------

const DEALER = 'npc-iron-vex'; // cast index 0 — co-located at Sun-3 on any seed.
const SUN_3 = 1;

/** A live day-1 career at Sun-3, driven through the engine's own day loop — no
 *  poked phase, no hand-written dawn hand. `createInitialState` seats NPCs at
 *  `(index % 20) + 1` and `startDay` never moves them, so Iron Vex is a valid,
 *  solvent dealer at the home hall on every seed. */
function dayOneAtSun3(seed: number): GameState {
  const game = createInitialState(seed);
  expect(game.player.currentSystemId).toBe(SUN_3);
  const dealer = game.npcs.find((n) => n.id === DEALER);
  expect(dealer?.currentSystemId).toBe(SUN_3);
  return startDay(game).state;
}

/** Open a hand the way the pane does: one `VisitHangout{venue:'dare'}`. */
function openHand(
  game: GameState,
  wager = 25,
  spendDie = 0,
): { state: GameState; events: GameEvent[] } {
  const out = applyPlayerAction(game, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: DEALER,
    wager,
    spendDie,
  });
  expect(out.state.dareHand).not.toBeNull();
  return out;
}

/** A structural clone whose dealer dice are replaced wholesale. Used ONLY to vary
 *  the hidden information — the experiment, not the scene. */
function withDealerDice(game: GameState, dice: number[]): GameState {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  clone.dareHand!.dealerDice = [...dice];
  return clone;
}

describe('T-136 · the scene projection cannot express the dealer’s hand', () => {
  it('is deep-equal across three completely different dealer hands', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const asDealt = dareScene(state);
    const allSixes = dareScene(withDealerDice(state, [6, 6, 6, 6]));
    const allOnes = dareScene(withDealerDice(state, [1, 1, 1, 1]));

    expect(asDealt).not.toBeNull();
    // The premise of the experiment: the three states really do differ.
    expect(state.dareHand!.dealerDice).not.toEqual([6, 6, 6, 6]);
    expect(allSixes).toEqual(asDealt);
    expect(allOnes).toEqual(asDealt);
  });

  it('carries a COUNT of the dealer’s dice and no values', () => {
    const { state } = openHand(dayOneAtSun3(7));
    const view = dareScene(state)!;
    expect(view.dealerDieCount).toBe(state.dareHand!.dealerDice.length);
    // Not a shape assertion for its own sake: `JSON.stringify` is exactly what a
    // curious player would run against a save, and the projection is what the
    // pane renders. Neither may contain a `dealerDice` key.
    expect(Object.keys(view)).not.toContain('dealerDice');
    expect(JSON.stringify(view)).not.toContain('dealerDice');
  });

  it('is null when no hand is on the table', () => {
    expect(dareScene(dayOneAtSun3(1))).toBeNull();
  });
});

describe('T-136 · the pane asks the engine what is legal, it never decides', () => {
  it('legalMoves is `legalDareMoves` verbatim — no UI-side filtering', () => {
    const { state } = openHand(dayOneAtSun3(3));
    const view = dareScene(state)!;
    expect(view.legalMoves).toEqual(
      legalDareMoves(state.dareHand!, 'player', state.player.credits),
    );
    // The opening window: bid / peek / fold, and nothing that answers a claim.
    expect(view.legalMoves).toContain('bid');
    expect(view.legalMoves).toContain('fold');
    expect(view.legalMoves).not.toContain('challenge');
  });

  it('follows the engine after a bid lands — challenge becomes legal', () => {
    const { state } = openHand(dayOneAtSun3(3));
    const after = applyPlayerAction(state, { type: 'Dare', move: 'bid', quantity: 2, face: 3 });
    const view = dareScene(after.state);
    if (view === null) {
      // The dealer answered a 2×3 opening claim by challenging or folding, which
      // settles the hand inside the same action (§9.4). A legal arm, not a miss.
      expect(after.events.some((e) => e.type === 'DareHandResolved')).toBe(true);
      return;
    }
    expect(view.legalMoves).toEqual(
      legalDareMoves(after.state.dareHand!, 'player', after.state.player.credits),
    );
    expect(view.legalMoves).toContain('challenge');
    expect(view.legalMoves).not.toContain('bid');
    expect(view.history.length).toBeGreaterThan(0);
    expect(view.history[0]).toMatchObject({ actor: 'player', move: 'bid', quantity: 2, face: 3 });
  });

  it('reports the escrow and the headroom the engine actually holds', () => {
    const { state } = openHand(dayOneAtSun3(5), 25);
    const view = dareScene(state)!;
    const hand = state.dareHand!;
    expect(view.seedWager).toBe(hand.seedWager);
    expect(view.potPlayer).toBe(hand.potPlayer);
    expect(view.potDealer).toBe(hand.potDealer);
    expect(view.ante).toBe(hand.ante);
    // Headroom is the port's ceiling less this side's escrow — never recomputed
    // in the pane, and never negative.
    expect(view.playerHeadroom).toBeGreaterThanOrEqual(0);
  });
});

describe('T-136 · the Peek is the one legal leak, and it is exactly one die', () => {
  it('surfaces precisely the engine’s `peekedDealerDie` and nothing more', () => {
    // The DC-12 GUILE roll is seed-dependent, so sweep seeds until one hand
    // actually peeks successfully, and assert the invariant on whichever lands.
    let peekedView: ReturnType<typeof dareScene> = null;
    let peekedState: GameState | null = null;
    for (let seed = 1; seed <= 40 && peekedView === null; seed++) {
      const { state } = openHand(dayOneAtSun3(seed));
      const after = applyPlayerAction(state, { type: 'Dare', move: 'peek', spendDie: 1 });
      const hand = after.state.dareHand;
      if (!hand || hand.peekedDealerDie === null) continue;
      peekedState = after.state;
      peekedView = dareScene(after.state);
    }
    expect(peekedView, 'no seed in 1..40 produced a successful Peek').not.toBeNull();
    const hand = peekedState!.dareHand!;
    expect(peekedView!.peeked).toEqual(hand.peekedDealerDie);
    // ONE die, named by index — the other three are still nothing but a count.
    expect(peekedView!.peeked!.value).toBe(hand.dealerDice[peekedView!.peeked!.index]);
    expect(peekedView!.dealerDieCount).toBe(4);
  });

  it('leaves `peeked` null before any Peek', () => {
    const { state } = openHand(dayOneAtSun3(2));
    expect(dareScene(state)!.peeked).toBeNull();
  });
});

describe('T-136 · the settled frame comes off the event, never off state', () => {
  it('a FOLD reveals nothing — `dealerDice` is null on both fold arms', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const folded = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    const reveal = dareRevealFrom(folded.events, folded.state)!;
    expect(reveal.outcome).toBe('player-fold');
    expect(reveal.dealerDice).toBeNull();
    expect(reveal.actualCount).toBeNull();
    // The money still moved: a fold forfeits the seed and every ante paid (§6.1).
    expect(reveal.creditsDelta).toBeLessThan(0);
    expect(reveal.playerDice).toHaveLength(4);
  });

  it('a CHALLENGE reveals all four — and the count the engine actually found', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const bid = applyPlayerAction(state, { type: 'Dare', move: 'bid', quantity: 2, face: 3 });
    // The dealer may already have ended it inside that action; if not, call it.
    const settled = bid.state.dareHand
      ? applyPlayerAction(bid.state, { type: 'Dare', move: 'challenge' })
      : bid;
    const reveal = dareRevealFrom(settled.events, settled.state)!;
    expect(reveal.outcome).toMatch(/^(challenge-win|challenge-loss|dealer-fold)$/);
    if (reveal.outcome === 'dealer-fold') {
      // A fold NEVER reveals, whichever side folds.
      expect(reveal.dealerDice).toBeNull();
      return;
    }
    expect(reveal.dealerDice).toHaveLength(4);
    expect(reveal.actualCount).not.toBeNull();
    const claimed = reveal.bid!.face;
    const counted =
      reveal.playerDice.filter((d) => d === claimed).length +
      reveal.dealerDice!.filter((d) => d === claimed).length;
    expect(reveal.actualCount).toBe(counted);
  });

  it('is null when the action settled nothing', () => {
    const { state, events } = openHand(dayOneAtSun3(1));
    expect(dareRevealFrom(events, state)).toBeNull();
  });
});
