import { describe, expect, it } from 'vitest';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  legalDareMoves,
  minOpeningQuantity,
  startDay,
  wagerBandFor,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';

/**
 * T-160 · A LEGAL OPENING CLAIM on `face`, DERIVED FROM THE HAND THE SEED ROLLED
 * (`docs/LIARS-DICE_REDESIGN.md` §16.2 shape (b), the F-137-1 fix). An opening
 * claim must now EXCEED what the bidder holds of the claimed face, so a hardcoded
 * literal is a function of the player's hidden dice and passes only by luck.
 */
function openingBid(state: GameState, face: number): Extract<PlayerAction, { type: 'Dare' }> {
  const own = state.dareHand!.playerDice.filter((d) => d === face).length;
  return { type: 'Dare', move: 'bid', face, quantity: minOpeningQuantity(own) };
}
import {
  LIARS_DICE_OPPONENTS,
  LIARS_DICE_RAISED_CEILING_MULT,
  NPC_PROFILES,
} from '@spacerquest/content';
import {
  dareRevealFrom,
  dareScene,
  dareWagerBounds,
  dispositionHint,
  hangoutNpcs,
  hangoutRosterOpponents,
  liarsDiceDealerReadout,
} from '../format';

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

const DEALER = 'npc-iron-vex'; // cast index 0 — co-located at Sol-3 on any seed.
const SUN_3 = 1;

/** A live day-1 career at Sol-3, driven through the engine's own day loop — no
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
function openHand(game: GameState, wager = 25): { state: GameState; events: GameEvent[] } {
  const out = applyPlayerAction(game, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId: DEALER,
    wager,
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
    const opening = openingBid(state, 3);
    const after = applyPlayerAction(state, opening);
    const view = dareScene(after.state);
    if (view === null) {
      // The dealer answered the opening claim by challenging or folding, which
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
    expect(view.history[0]).toMatchObject({
      actor: 'player',
      move: 'bid',
      quantity: opening.quantity,
      face: 3,
    });
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
    const bid = applyPlayerAction(state, openingBid(state, 3));
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

// ---------------------------------------------------------------------------
// T-145 · POOL A IN THE PANE (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 rows 46a,
// 49, 50). The unit half of obligations 25 and 26; the real-clicks half is
// `packages/ui/e2e/liars-dice-roster.spec.ts`.
// ---------------------------------------------------------------------------

/** Open a hand against a fixed ROSTER opponent, the way the pane does. */
function openRosterHand(
  game: GameState,
  opponentId: string,
  wager = 100,
): { state: GameState; events: GameEvent[] } {
  const out = applyPlayerAction(game, {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId,
    wager,
  });
  expect(out.state.dareHand).not.toBeNull();
  return out;
}

describe('T-145 · hangoutRosterOpponents lists the house’s own three seats', () => {
  it('returns exactly the port’s authored roster, with names and live purses', () => {
    const game = dayOneAtSun3(1);
    const rows = hangoutRosterOpponents(game);
    const authored = LIARS_DICE_OPPONENTS[SUN_3];
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.id)).toEqual(authored.map((a) => a.id));
    expect(rows.map((r) => r.name)).toEqual(authored.map((a) => a.name));
    // The LIVE purse, which at day 1 is the authored bankroll.
    expect(rows.map((r) => r.purse)).toEqual(authored.map((a) => a.bankroll));
    expect(rows.every((r) => !r.beaten && !r.broke)).toBe(true);
  });

  it('is populated at EVERY hasHangout port, so all 42 are reachable', () => {
    const game = dayOneAtSun3(1);
    const seen = new Set<string>();
    for (const systemId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]) {
      const at = { ...game, player: { ...game.player, currentSystemId: systemId } };
      const rows = hangoutRosterOpponents(at);
      expect(rows, `port ${systemId}`).toHaveLength(3);
      for (const row of rows) seen.add(row.id);
    }
    expect(seen.size).toBe(42);
  });

  it('marks a beaten seat and disables a broke one', () => {
    const game = dayOneAtSun3(1);
    const marked = {
      ...game,
      player: { ...game.player, liarsDiceBeaten: ['ld-1-1'] },
      liarsDicePurses: { ...game.liarsDicePurses, 'ld-1-3': 0 },
    };
    const rows = hangoutRosterOpponents(marked);
    expect(rows[0]).toMatchObject({ id: 'ld-1-1', beaten: true, broke: false });
    expect(rows[1]).toMatchObject({ id: 'ld-1-2', beaten: false, broke: false });
    // The engine refuses a purse <= 0 with `opponent-broke` before the die is
    // spent, so the pane must not offer the row at all.
    expect(rows[2]).toMatchObject({ id: 'ld-1-3', beaten: false, broke: true, purse: 0 });
  });

  it('hangoutNpcs is UNCHANGED — pool A never leaks into pool B’s list', () => {
    const game = dayOneAtSun3(1);
    for (const npc of hangoutNpcs(game)) expect(npc.id.startsWith('ld-')).toBe(false);
  });
});

describe('T-145 · the scene shows the AUTHORED name, never the raw `ld-` id', () => {
  it('resolves a roster dealer through the engine’s own accessor', () => {
    const { state } = openRosterHand(dayOneAtSun3(1), 'ld-1-2');
    const view = dareScene(state)!;
    // The shipped `game.npcs.find(...)` fallback rendered `ld-1-2` at the table —
    // pool A has no `NpcState` — which is the Accept failure row 49 exists to fix.
    expect(view.dealerId).toBe('ld-1-2');
    expect(view.dealerName).toBe(LIARS_DICE_OPPONENTS[SUN_3][1].name);
    expect(view.dealerName).not.toBe('ld-1-2');
    expect(view.opponentKind).toBe('roster');
    // Obligation 26, table-talk arm.
    expect(view.tableTalk).toBe(LIARS_DICE_OPPONENTS[SUN_3][1].lines.tableTalk);
    // …and the hidden-dice discipline is unchanged for a roster hand.
    expect(Object.keys(view)).not.toContain('dealerDice');
    expect(view.dealerDieCount).toBe(state.dareHand!.dealerDice.length);
  });

  it('a ROAMING hand still resolves its captain and carries no table talk', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const view = dareScene(state)!;
    expect(view.dealerName).toBe(state.npcs.find((n) => n.id === DEALER)!.name);
    expect(view.opponentKind).toBe('roaming');
    expect(view.tableTalk).toBeNull();
  });
});

describe('T-145 · obligation 26 — the reveal carries the win/lose line', () => {
  it('shows the opponent’s LOSE line when the captain takes the pot', () => {
    // A dealer-fold or challenge-win is the captain's; scan for one rather than
    // pinning a lucky seed.
    for (let seed = 1; seed <= 200; seed += 1) {
      let { state } = openRosterHand(dayOneAtSun3(seed), 'ld-1-1');
      let events: GameEvent[] = [];
      for (let step = 0; step < 24 && state.dareHand; step += 1) {
        const out = applyPlayerAction(
          state,
          state.dareHand.bid === null ? openingBid(state, 3) : { type: 'Dare', move: 'challenge' },
        );
        state = out.state;
        events = out.events;
      }
      const view = dareRevealFrom(events, state);
      if (!view) continue;
      const playerWon = view.outcome === 'challenge-win' || view.outcome === 'dealer-fold';
      const row = LIARS_DICE_OPPONENTS[SUN_3][0];
      expect(view.dealerName).toBe(row.name);
      expect(view.opponentLine).toBe(playerWon ? row.lines.lose : row.lines.win);
      // §7.6 — a roster hand moves no disposition, and a zero here is an honest
      // nothing rather than a regression the pane should hide.
      expect(view.dispositionDelta).toBe(0);
      if (playerWon) return;
    }
    throw new Error('no player win against ld-1-1 in 200 seeds');
  });

  it('a ROAMING reveal carries no opponentLine, and its disposition still moves', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const out = applyPlayerAction(state, { type: 'Dare', move: 'fold' });
    const view = dareRevealFrom(out.events, out.state)!;
    expect(view.opponentLine).toBeNull();
    expect(view.dealerName).not.toMatch(/^ld-/);
  });
});

// ---------------------------------------------------------------------------
// T-146 · THE UNLOCK LADDER, AS THE PANE SEES IT
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 rows 46b, 47, 48, 51).
//
// Row 48 is a CONFIRM-AND-EXTEND: the tier-0 `toHaveLength(4)` assertions above
// stay valid and unchanged — a day-1 career IS a tier-0 career — and the ladder
// gets its own cases beside them rather than an edit to theirs.
//
// `liarsDiceGamesPlayed` is set as FIXTURE SETUP before the first action, exactly
// as this file already seats a dealer and sets a purse. Every hand is still opened
// through the real `applyPlayerAction`.
// ---------------------------------------------------------------------------

/** A day-1 career already `games` hands into the ladder. */
function atLadder(seed: number, games: number): GameState {
  const game = dayOneAtSun3(seed);
  game.player.liarsDiceGamesPlayed = games;
  game.player.credits = 200_000;
  const dealer = game.npcs.find((n) => n.id === DEALER)!;
  dealer.credits = 200_000;
  return game;
}

describe('T-146 · the scene projection follows the hand’s frozen dice count', () => {
  it('projects 5 dice and a ceiling of 10 once the first rung is unlocked', () => {
    const { state } = openHand(atLadder(1, 5));
    const view = dareScene(state)!;
    expect(view.dealerDieCount).toBe(5);
    expect(view.maxQuantity).toBe(10);
    expect(view.playerDice).toHaveLength(5);
  });

  it('projects 6 dice and a ceiling of 12 at the hard cap, and no further', () => {
    for (const games of [10, 40, 80, 5_000]) {
      const { state } = openHand(atLadder(1, games));
      const view = dareScene(state)!;
      expect(view.dealerDieCount, `${games} games`).toBe(6);
      expect(view.maxQuantity, `${games} games`).toBe(12);
      expect(view.playerDice, `${games} games`).toHaveLength(6);
    }
  });

  it('still carries a COUNT and never the dealer’s values, at every tier', () => {
    // The fog discipline is not a tier-0 property. Re-proved at six dice, where a
    // careless "render the dealer's hand now that it is bigger" would show.
    const { state } = openHand(atLadder(1, 10));
    const view = dareScene(state)!;
    expect(Object.keys(view)).not.toContain('dealerDice');
    expect(dareScene(withDealerDice(state, [6, 6, 6, 6, 6, 6]))).toEqual(view);
  });
});

describe('T-146 · dareWagerBounds is the EFFECTIVE band for the live tier', () => {
  const band = wagerBandFor(SUN_3);

  it('is the port’s own band below tier 4', () => {
    for (const games of [0, 4, 5, 10, 20, 39]) {
      expect(dareWagerBounds(atLadder(1, games)), `${games} games`).toEqual(band);
    }
  });

  it('triples the ceiling at tier 4 and drops both ends at tier 5', () => {
    expect(dareWagerBounds(atLadder(1, 40))).toEqual({
      min: band.min,
      max: band.max * LIARS_DICE_RAISED_CEILING_MULT,
    });
    expect(dareWagerBounds(atLadder(1, 79))).toEqual({
      min: band.min,
      max: band.max * LIARS_DICE_RAISED_CEILING_MULT,
    });
    // A null ceiling is the pane's cue to stop rendering a range at all.
    expect(dareWagerBounds(atLadder(1, 80))).toEqual({ min: 0, max: null });
  });
});

describe('T-146 · the roster picker carries a read only once tier 3 is live', () => {
  it('carries no read at all below the threshold', () => {
    for (const games of [0, 5, 10, 19]) {
      for (const row of hangoutRosterOpponents(atLadder(1, games))) {
        expect(row.read, `${row.id} at ${games} games`).toBeUndefined();
      }
    }
  });

  it('carries the archetype’s line at the threshold — except on the MIXED seat', () => {
    const rows = hangoutRosterOpponents(atLadder(1, 20));
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      const authored = LIARS_DICE_OPPONENTS[SUN_3].find((r) => r.id === row.id)!;
      if (authored.archetype === 'mixed') {
        // THE RULING, ASSERTED DELIBERATELY (§4.5 ruling 1): a mix has no resolved
        // arm before the hand exists, so the picker shows NOTHING rather than
        // inventing the `random` line. The real read arrives at open, on
        // `DareHandStarted.opponentRead`.
        expect(row.read, row.id).toBeUndefined();
      } else {
        expect(row.read, row.id).toBeTruthy();
      }
    }
  });
});

describe('T-146 · the scene shows the engine’s Read-the-Table line at open', () => {
  it('is null below tier 3 and the engine’s own string at or above it', () => {
    expect(dareScene(openHand(atLadder(1, 19)).state)!.opponentRead).toBeNull();
    const read = dareScene(openHand(atLadder(1, 20)).state)!.opponentRead;
    expect(read).toBeTruthy();
    // The pane maps nothing: whatever it shows is byte-identical to what the
    // engine put on the event.
    expect(read).toBe(startedRead(openHand(atLadder(1, 20)).events));
  });

  it('shows a MIXED seat’s resolved read, which the picker could not know', () => {
    const opened = openRosterHand(atLadder(1, 20), 'ld-1-2');
    expect(dareScene(opened.state)!.opponentRead).toBe(startedRead(opened.events));
    expect(dareScene(opened.state)!.opponentRead).toBeTruthy();
  });

  it('survives the whole hand — it is read off the log, not off a transient beat', () => {
    const opened = openHand(atLadder(1, 20));
    const bid = applyPlayerAction(opened.state, openingBid(opened.state, 3));
    if (bid.state.dareHand) {
      expect(dareScene(bid.state)!.opponentRead).toBe(dareScene(opened.state)!.opponentRead);
    }
  });
});

function startedRead(events: GameEvent[]): string | undefined {
  const started = events.find((e) => e.type === 'DareHandStarted');
  return started && 'opponentRead' in started ? started.opponentRead : undefined;
}

// ---------------------------------------------------------------------------
// T-203 · THE RIVAL ACROSS THE TABLE.
//
// The same 30 named captains the player Meets / Befriends / Insults at a Hangout
// are the ones who turn up as a ROAMING dealer, and until now that connection was
// invisible at the table. These tests pin the cue's presence on a roaming hand,
// its ABSENCE on a `ld-` roster hand (pool A has no disposition, so a synthesised
// "No standing with you" there would be a false cue, not a neutral one), and the
// fact that adding the field did not open a leak.
//
// Every expectation is DERIVED from the exported `dispositionHint` or from live
// state — never a hardcoded band string. A literal here would be the second copy
// of the wording that exporting `dispositionHint` exists to prevent, and it would
// pass while the pane printed something else. The real-clicks half is
// `packages/ui/e2e/hangout.spec.ts` and `packages/ui/e2e/liars-dice-roster.spec.ts`.
// ---------------------------------------------------------------------------

/** A structural clone whose named dealer's disposition is set outright. Used ONLY
 *  to sweep the bands of a pure display projection — the disposition MOVES in the
 *  tests below are driven through the engine's own `VisitHangout`. */
function withDisposition(game: GameState, npcId: string, disposition: number): GameState {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  clone.npcs.find((n) => n.id === npcId)!.disposition = disposition;
  return clone;
}

describe('T-203 · a roaming dealer wears their standing with you', () => {
  it('reads the neutral band for a captain the player has no history with', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const npc = state.npcs.find((n) => n.id === DEALER)!;
    expect(npc.disposition).toBe(0);
    const readout = liarsDiceDealerReadout(state, DEALER)!;
    expect(readout.standing).toBe(dispositionHint(0));
    expect(dareScene(state)!.dealerHistory).toBe(readout.line);
    expect(dareScene(state)!.dealerHistory).toContain(dispositionHint(0));
  });

  it('reads DIFFERENTLY once the player has insulted that captain', () => {
    const neutral = dareScene(openHand(dayOneAtSun3(1)).state)!.dealerHistory;

    // Driven through the engine, not poked onto the projection. An insult ALWAYS
    // lands (no check — `actions/hangout.ts`), so this is deterministic on any
    // seed and needs no sweep.
    const insulted = applyPlayerAction(dayOneAtSun3(1), {
      type: 'VisitHangout',
      venue: 'insult',
      opponentId: DEALER,
    }).state;
    const npc = insulted.npcs.find((n) => n.id === DEALER)!;
    // Read the live disposition rather than asserting a delta: a port authors its
    // own `insult.dispositionOnSuccess`, so a literal here would pin content.
    expect(npc.disposition).toBeLessThan(0);

    const { state } = openHand(insulted);
    const readout = liarsDiceDealerReadout(state, DEALER)!;
    expect(readout.standing).toBe(dispositionHint(npc.disposition));
    expect(dareScene(state)!.dealerHistory).toBe(readout.line);
    // The whole point of the task: the insulted rival does NOT read like a
    // stranger at the table.
    expect(dareScene(state)!.dealerHistory).not.toBe(neutral);
  });

  it('covers every band, straight off the shared hint', () => {
    const { state } = openHand(dayOneAtSun3(1));
    for (const disposition of [-5, -1, 0, 1, 3]) {
      const at = withDisposition(state, DEALER, disposition);
      const readout = liarsDiceDealerReadout(at, DEALER)!;
      expect(readout.standing, `disposition ${disposition}`).toBe(dispositionHint(disposition));
      expect(dareScene(at)!.dealerHistory, `disposition ${disposition}`).toContain(
        dispositionHint(disposition),
      );
    }
    // The bands really are distinguishable — otherwise the sweep above is vacuous.
    const bands = new Set([-5, -1, 0, 1, 3].map((d) => dispositionHint(d)));
    expect(bands.size).toBe(5);
  });

  it('appends the prior-wire-mention clause only when there is a record', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const name = state.npcs.find((n) => n.id === DEALER)!.name;
    const clean = liarsDiceDealerReadout(state, DEALER)!;
    expect(clean.mentions).toBe(0);
    expect(clean.line).not.toContain('wire');

    const mentioned: GameState = {
      ...state,
      eventLog: [
        ...state.eventLog,
        {
          type: 'WireEntry',
          day: state.day,
          message: `${name} was seen at the docks.`,
          kind: 'npc',
        },
      ],
    };
    const withRecord = liarsDiceDealerReadout(mentioned, DEALER)!;
    expect(withRecord.mentions).toBe(1);
    expect(withRecord.line).toContain('1 prior wire mention');
    expect(withRecord.line).not.toContain('mentions');
  });

  it('omits the last-known-system clause — a roaming dealer is standing right here', () => {
    const { state } = openHand(dayOneAtSun3(1));
    // Deliberate trim of `encounterReadout`'s history, not an oversight: the clause
    // could only ever print the port the player is already in.
    expect(liarsDiceDealerReadout(state, DEALER)!.line).not.toContain('Last known at');
  });

  it('is NULL on a `ld-` roster seat, and leaves the authored table talk alone', () => {
    const { state } = openRosterHand(dayOneAtSun3(1), 'ld-1-2');
    // Pool A has no `NpcState`, so it has no standing — and a synthesised neutral
    // band on a seat that cannot have one is a false cue, not a harmless default.
    expect(liarsDiceDealerReadout(state, 'ld-1-2')).toBeNull();
    const view = dareScene(state)!;
    expect(view.dealerHistory).toBeNull();
    // Asserted in the SAME test so a regression that swapped one line for the
    // other fails right here rather than passing both halves separately.
    expect(view.tableTalk).toBe(LIARS_DICE_OPPONENTS[SUN_3][1].lines.tableTalk);
  });

  it('is null for an id with no live NpcState at all', () => {
    expect(liarsDiceDealerReadout(dayOneAtSun3(1), 'npc-does-not-exist')).toBeNull();
  });

  it('did not open a leak — the new field is blind to the dealer’s dice', () => {
    const { state } = openHand(dayOneAtSun3(1));
    // The T-136 experiment, re-run for T-203's field specifically.
    expect(dareScene(withDealerDice(state, [6, 6, 6, 6]))!.dealerHistory).toBe(
      dareScene(state)!.dealerHistory,
    );
  });
});

// ---------------------------------------------------------------------------
// T-207 · THE ROAMING CAPTAIN'S OWN VOICE AT THE TABLE (`docs/HANGOUT_REDESIGN.md`;
// `format.ts`'s `LiarsDiceDealerReadout.tableTalk` → `DareSceneView.dealerTableTalk`).
//
// T-206 finished authoring `NpcProfile.tableTalk` for all 30 named captains; this
// is the reader. EVERY EXPECTATION BELOW IS DERIVED FROM CONTENT — a literal quote
// here would be a second copy of an authored line that passes while the pane prints
// something else, which is the same discipline T-203's section states at its head
// for `dispositionHint`.
//
// Two assertions carry more than they look like they do:
//   · the STABILITY test is what would have caught a `Math.random()` pick. This
//     projection runs on every React paint, so a random draw would reshuffle the
//     captain's line while the player was still reading it.
//   · the ROSTER test asserts BOTH fields in one body, so a regression that swapped
//     pool A's line for pool B's fails right here rather than passing both halves
//     separately.
// ---------------------------------------------------------------------------

describe('T-207 · a roaming captain speaks in their own authored voice', () => {
  const AUTHORED = NPC_PROFILES.find((p) => p.id === DEALER)!.tableTalk!;

  it('draws the table-talk line from that captain’s own authored pool', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const readout = liarsDiceDealerReadout(state, DEALER)!;
    expect(readout.tableTalk).toBeTruthy();
    // Derived from content, never a hardcoded quote.
    expect(AUTHORED).toContain(readout.tableTalk);
    expect(dareScene(state)!.dealerTableTalk).toBe(readout.tableTalk);
  });

  it('holds the SAME line for the life of the hand, across paints and across moves', () => {
    const { state } = openHand(dayOneAtSun3(1));
    // Two calls on one state: the anti-`Math.random()` assertion.
    expect(dareScene(state)!.dealerTableTalk).toBe(dareScene(state)!.dealerTableTalk);
    const first = dareScene(state)!.dealerTableTalk;

    // And it survives a legal move, exactly as `opponentRead` does.
    const after = applyPlayerAction(state, openingBid(state, 3)).state;
    expect(after.dareHand).not.toBeNull();
    expect(dareScene(after)!.dealerTableTalk).toBe(first);
  });

  it('does not say the same thing every hand of a career', () => {
    // The pool is 2-4 lines (`castValidation.ts`), so a single-line captain would
    // make this vacuous — assert the premise rather than assume it.
    expect(AUTHORED.length).toBeGreaterThan(1);

    // THE SAMPLE IS A CAREER OF DAYS, NOT A SPREAD OF SEEDS, and that is a
    // statement about what the line is keyed on rather than a convenience. The
    // line is seeded on the HAND (`dare-${day}-${dealerId}-${dayEventCount}`,
    // `actions/hangout.ts`), which is a function of WHEN a hand was dealt and not of
    // the world seed — forty seeds all deal their first hand on day 1 at the same
    // event count, so a seed sweep is a sample of size one dressed up as forty. The
    // day is also the only axis available: the engine allows ONE dare hand per day
    // (`daily-round-limit`), so "the next hand" is by construction "tomorrow's".
    let game = atLadder(1, 0); // purses topped up; the ladder tier stays at 0.
    const drawn = new Set<string>();
    for (let day = 0; day < 12; day += 1) {
      const opened = openHand(game, 25).state;
      drawn.add(dareScene(opened)!.dealerTableTalk!);
      // Fold to settle, then run the real day loop to reach tomorrow's table.
      game = startDay(
        endDay(applyPlayerAction(opened, { type: 'Dare', move: 'fold' }).state).state,
      ).state;
      // Same fixture setup as `atLadder`, re-applied so a long career cannot end the
      // sweep early on an empty purse or a dealer who wandered off.
      game.player.credits = 200_000;
      const dealer = game.npcs.find((n) => n.id === DEALER)!;
      dealer.credits = 200_000;
      dealer.currentSystemId = game.player.currentSystemId;
    }
    // A wider sample is the fix if this ever narrows — never a weaker assertion.
    expect(drawn.size).toBeGreaterThan(1);
    for (const line of drawn) expect(AUTHORED).toContain(line);
  });

  it('is NULL on a `ld-` roster seat, and leaves pool A’s authored line alone', () => {
    const { state } = openRosterHand(dayOneAtSun3(1), 'ld-1-2');
    // The roaming/roster gate is the readout's own hard null — T-207 extended it
    // rather than opening a second one, so this needs no new branch to be true.
    expect(liarsDiceDealerReadout(state, 'ld-1-2')).toBeNull();
    const view = dareScene(state)!;
    expect(view.dealerTableTalk).toBeNull();
    // Same body, deliberately: a swap of one field for the other dies here.
    expect(view.tableTalk).toBe(LIARS_DICE_OPPONENTS[SUN_3][1].lines.tableTalk);
  });

  it('never shows two table-talk lines at once, on either pool', () => {
    const roaming = dareScene(openHand(dayOneAtSun3(1)).state)!;
    const roster = dareScene(openRosterHand(dayOneAtSun3(1), 'ld-1-2').state)!;
    // The claim the pane's comment makes, pinned. Mutually exclusive BY
    // CONSTRUCTION: `tableTalk` is pool A's, `dealerTableTalk` is pool B's.
    for (const view of [roaming, roster]) {
      expect(Boolean(view.tableTalk && view.dealerTableTalk)).toBe(false);
    }
    expect(roaming.dealerTableTalk).toBeTruthy();
    expect(roster.tableTalk).toBeTruthy();
  });

  it('did not open a leak — the new field is blind to the dealer’s dice', () => {
    const { state } = openHand(dayOneAtSun3(1));
    // The T-136 experiment, re-run for T-207's field specifically.
    expect(dareScene(withDealerDice(state, [6, 6, 6, 6]))!.dealerTableTalk).toBe(
      dareScene(state)!.dealerTableTalk,
    );
  });

  it('left T-203’s standing line exactly where it was', () => {
    const { state } = openHand(dayOneAtSun3(1));
    const readout = liarsDiceDealerReadout(state, DEALER)!;
    expect(readout.line).toBe(dareScene(state)!.dealerHistory);
    // The bark is a SEPARATE element, never composed into the standing line.
    expect(readout.line).not.toContain(readout.tableTalk!);
    expect(readout.line).toBe(`${dispositionHint(0)}.`);
  });
});
