import { describe, it, expect } from 'vitest';
import {
  DARE_LOSS_DISPOSITION,
  DARE_WIN_DISPOSITION,
  INSULT_DISPOSITION,
  Stat,
} from '@spacerquest/content';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { applyPlayerAction } from '../day.js';
import { resolveVisitHangout, hangoutRumors } from '../actions/hangout.js';
import { SeededRng } from '../rng.js';
import { DawnHand, DayPhase, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1303 · Spacers Hangout: the place + Spacer's Dare.
// ---------------------------------------------------------------------------

const DEALER = 'npc-iron-vex'; // cast index 0 — starts co-located at Sun-3 (id 1).

/** A DAY-phase state at Sun-3 (the hasHangout hub) with a hand-picked dawn hand
 *  and a co-located, solvent dealer. `dice` become the player's Dare die by
 *  index, so a nat-20 / nat-1 is dialled in directly. */
function hangoutState(dice: number[]): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = 1; // Sun-3
  state.player.stats[Stat.GUILE] = 0;
  const spent = new Array<boolean>(dice.length).fill(false);
  state.player.dawnHand = { dice: [...dice], spent } satisfies DawnHand;
  const dealer = state.npcs.find((n) => n.id === DEALER)!;
  dealer.currentSystemId = 1;
  dealer.credits = 5000;
  dealer.disposition = 0;
  return state;
}

function dealerOf(state: GameState) {
  return state.npcs.find((n) => n.id === DEALER)!;
}

describe("Spacer's Dare — win/loss move credits both directions + shift dealer", () => {
  it('a player WIN pays the wager to the player and sours the dealer', () => {
    const state = hangoutState([20, 3, 3, 3, 3]); // die[0] = 20 → nat-20 → player wins
    state.player.credits = 1000;
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 100, spendDie: 0 },
      new SeededRng(1),
    );

    // Credits move BOTH directions off the one wager.
    expect(after.player.credits).toBe(1100);
    expect(dealerOf(after).credits).toBe(4900);

    const hangout = events.find((e) => e.type === 'HangoutEvent');
    expect(hangout).toMatchObject({
      type: 'HangoutEvent',
      venue: 'dare',
      opponentId: DEALER,
      wager: 100,
      playerWon: true,
      creditsDelta: 100,
    });

    // Disposition shifts on a win (dealer just lost money — a sore-loser grudge).
    const disp = events.find((e) => e.type === 'DispositionChanged');
    expect(disp).toMatchObject({ npcId: DEALER, reason: 'dare', delta: DARE_WIN_DISPOSITION });
    expect(DARE_WIN_DISPOSITION).not.toBe(0);
    expect(dealerOf(after).disposition).toBe(DARE_WIN_DISPOSITION);

    // Both sides' GUILE rolls are recorded; the player's carries the gamble
    // context that routes a nat to the wire.
    const playerCheck = events.find((e) => e.type === 'StatCheck' && e.actor === 'Player');
    expect(playerCheck).toMatchObject({ actionContext: 'gamble', stat: Stat.GUILE });
    const dealerCheck = events.find((e) => e.type === 'StatCheck' && e.actor === DEALER);
    expect(dealerCheck).toBeDefined();
  });

  it('a player LOSS pays the wager to the dealer and warms the dealer', () => {
    const state = hangoutState([1, 3, 3, 3, 3]); // die[0] = 1 → nat-1 → player loses
    state.player.credits = 1000;
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 100, spendDie: 0 },
      new SeededRng(1),
    );

    expect(after.player.credits).toBe(900);
    expect(dealerOf(after).credits).toBe(5100);

    expect(events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      venue: 'dare',
      playerWon: false,
      creditsDelta: -100,
    });

    const disp = events.find((e) => e.type === 'DispositionChanged');
    expect(disp).toMatchObject({ npcId: DEALER, reason: 'dare', delta: DARE_LOSS_DISPOSITION });
    expect(DARE_LOSS_DISPOSITION).not.toBe(0);
  });

  it('caps the wager to what the dealer can cover instead of crashing', () => {
    const state = hangoutState([20, 3, 3, 3, 3]);
    state.player.credits = 10_000;
    dealerOf(state).credits = 40; // dealer can only cover 40
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 500, spendDie: 0 },
      new SeededRng(1),
    );
    const hangout = events.find((e) => e.type === 'HangoutEvent');
    expect(hangout).toMatchObject({ venue: 'dare', playerWon: true, wager: 40 });
    expect(after.player.credits).toBe(10_040);
    expect(dealerOf(after).credits).toBe(0); // never negative
  });
});

describe("Spacer's Dare — opponents are drawn from in-system NPCs (asserted)", () => {
  it('an opponent NOT in the player system is a typed fail (no dare, no die spent)', () => {
    const state = hangoutState([15, 3, 3, 3, 3]);
    state.player.credits = 1000;
    dealerOf(state).currentSystemId = 2; // dealer wandered off to Aldebaran-1

    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 100, spendDie: 0 },
      new SeededRng(1),
    );

    expect(events.find((e) => e.type === 'HangoutEvent')).toMatchObject({
      venue: 'dare',
      failReason: 'no-opponent',
    });
    // Nothing resolved: no roll, no credit movement, and the die is UNSPENT.
    expect(events.some((e) => e.type === 'StatCheck')).toBe(false);
    expect(after.player.credits).toBe(1000);
    expect(after.player.dawnHand?.spent[0]).toBe(false);
  });

  it('an in-system opponent resolves the dare and burns the die', () => {
    const state = hangoutState([15, 3, 3, 3, 3]);
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 100, spendDie: 0 },
      new SeededRng(1),
    );
    const hangout = events.find((e) => e.type === 'HangoutEvent');
    expect(hangout).toMatchObject({ venue: 'dare' });
    expect((hangout as { failReason?: string }).failReason).toBeUndefined();
    expect(after.player.dawnHand?.spent[0]).toBe(true);
  });
});

describe('Hangout social beats feed T-1204 disposition readers', () => {
  it('insult always lands and drops the dealer hard (no check)', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'insult', opponentId: DEALER, spendDie: 0 },
      new SeededRng(1),
    );
    expect(events.some((e) => e.type === 'StatCheck')).toBe(false); // no roll — it always lands
    expect(events.find((e) => e.type === 'DispositionChanged')).toMatchObject({
      npcId: DEALER,
      reason: 'insult',
      delta: INSULT_DISPOSITION,
    });
    expect(dealerOf(after).disposition).toBe(INSULT_DISPOSITION);
  });
});

describe('rumor slot renders ≥1 fact from live NPC state', () => {
  it('reflects an NPC live lastAction + position, and follows them when they change', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    const iv = dealerOf(state);
    iv.lastAction = { type: 'Trade', details: 'hauled Medicinals to Fomalhaut-2' };
    iv.currentSystemId = 7; // Fomalhaut-2

    const rumors = hangoutRumors(state);
    expect(rumors.length).toBeGreaterThan(0);
    expect(rumors.some((r) => r.includes('hauled Medicinals to Fomalhaut-2'))).toBe(true);
    expect(rumors.some((r) => r.includes('Fomalhaut-2'))).toBe(true);

    // Prove it is LIVE: move the NPC and re-log, the rumor follows.
    iv.currentSystemId = 12; // Rigel-8
    iv.lastAction = { type: 'Combat', details: 'ran down a mark near Rigel-8' };
    const rumors2 = hangoutRumors(state);
    expect(rumors2.some((r) => r.includes('ran down a mark near Rigel-8'))).toBe(true);
    expect(rumors2).not.toEqual(rumors);
  });

  it('the rumor venue attaches ≥1 live fact to its HangoutEvent', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    const { events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'rumor', spendDie: 0 },
      new SeededRng(1),
    );
    const hangout = events.find((e) => e.type === 'HangoutEvent') as { rumors?: string[] };
    expect(hangout.rumors?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('malformed die input is a typed fail, never a throw', () => {
  it('a missing die yields no-die and spends nothing', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    const { events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'rumor' },
      new SeededRng(1),
    );
    expect(events.find((e) => e.type === 'HangoutEvent')).toMatchObject({ failReason: 'no-die' });
  });
});

describe('day loop: a Dare nat makes the wire (via T-1202) naming the in-system opponent', () => {
  it('routes a player nat-20 Dare to the gamble wire bucket', () => {
    const state = hangoutState([20, 3, 3, 3, 3]);
    // Make the dealer the SOLE co-located NPC so the wire loser is deterministic.
    for (const npc of state.npcs) {
      if (npc.id !== DEALER) npc.currentSystemId = 5;
    }
    const { events } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId: DEALER,
      wager: 100,
      spendDie: 0,
    });
    const wire = events.filter((e) => e.type === 'WireEntry');
    // The gamble templates all name the Hangout, and the player's nat names the
    // co-located dealer (Iron Vex) as the loser — "an NPC actually present".
    expect(wire.some((w) => w.message.includes('Hangout'))).toBe(true);
    expect(wire.some((w) => w.message.includes('Iron Vex'))).toBe(true);
  });
});

describe('mid-day serialization round-trip', () => {
  it('a state carrying a HangoutEvent round-trips byte-identically', () => {
    const state = hangoutState([20, 3, 3, 3, 3]);
    const { state: after } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId: DEALER,
      wager: 100,
      spendDie: 0,
    });
    const s1 = serializeState(after);
    const restored = deserializeState(s1);
    const s2 = serializeState(restored);
    expect(s2).toBe(s1);
    expect(restored.eventLog.some((e) => e.type === 'HangoutEvent' && e.venue === 'dare')).toBe(
      true,
    );
  });
});

describe('hangout-system gate', () => {
  it('blocks a VisitHangout at a system without a Hangout (no die spent)', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    state.player.currentSystemId = 2; // Aldebaran-1 — no Hangout
    const { state: after, events } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'rumor',
      spendDie: 0,
    });
    expect(events).toEqual([
      expect.objectContaining({
        type: 'ActionBlocked',
        actionType: 'VisitHangout',
        reason: 'no-hangout',
      }),
    ]);
    expect(after.player.dawnHand?.spent[0]).toBe(false);
  });
});
