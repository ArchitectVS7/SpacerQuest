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
import { loanBandFor, venueOffered, wagerBandFor } from '../hangoutRules.js';
import { SeededRng } from '../rng.js';
import { DawnHand, DayPhase, GameState } from '../types.js';

// ---------------------------------------------------------------------------
// T-1303 · Spacers Hangout: the place + Spacer's Dare.
// ---------------------------------------------------------------------------

const DEALER = 'npc-iron-vex'; // cast index 0 — starts co-located at Sun-3 (id 1).

/** A DAY-phase state at a hasHangout port with a hand-picked dawn hand and a
 *  co-located, solvent dealer. `dice` become the player's Dare die by index, so a
 *  nat-20 / nat-1 is dialled in directly.
 *
 *  T-121 · `systemId` defaults to Sun-3 so no existing test moves, and is a
 *  parameter so the reach change can be driven at a port that is not the home
 *  hub. The dealer is moved to WHEREVER the player is put, which is what keeps a
 *  Dare off-hub from decaying into a 'no-opponent' fail. */
function hangoutState(dice: number[], systemId = 1): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = systemId;
  state.player.stats[Stat.GUILE] = 0;
  const spent = new Array<boolean>(dice.length).fill(false);
  state.player.dawnHand = { dice: [...dice], spent } satisfies DawnHand;
  const dealer = state.npcs.find((n) => n.id === DEALER)!;
  dealer.currentSystemId = systemId;
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

  // T-1501 · The rumor table fills its slots from AUTHORED templates (content
  // RUMOR_TEMPLATES) interpolated with LIVE NPC fields. This is the batch's
  // acceptance #3: ≥3 dynamic slots, each varying with live NPC state (action
  // type, details, position, disposition).
  it('fills ≥3 dynamic slots from live NPC state (distinct co-located NPCs)', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    // Seat three distinct NPCs at the player's table (Sun-3), each with a
    // different live action-type + details, and a distinct disposition sign.
    const seated = state.npcs.slice(0, 3);
    expect(seated).toHaveLength(3);
    seated[0].currentSystemId = 1;
    seated[0].disposition = 4; // warm
    seated[0].lastAction = { type: 'Trade', details: 'hauled Spices to Aldebaran-1' };
    seated[1].currentSystemId = 1;
    seated[1].disposition = -6; // grudge → cold phrasing
    seated[1].lastAction = { type: 'Combat', details: 'traded fire near Sun-3' };
    seated[2].currentSystemId = 1;
    seated[2].disposition = 0; // neutral → warm phrasing
    seated[2].lastAction = { type: 'Patrol', details: 'ran a clean sweep of the Sun-3 lanes' };
    // Push every other NPC out of system so the three seated ones lead the roster.
    for (const npc of state.npcs.slice(3)) npc.currentSystemId = 5;

    const rumors = hangoutRumors(state);
    expect(rumors.length).toBeGreaterThanOrEqual(3);
    // Each seated NPC's live details clause appears in a slot.
    expect(rumors.some((r) => r.includes('hauled Spices to Aldebaran-1'))).toBe(true);
    expect(rumors.some((r) => r.includes('traded fire near Sun-3'))).toBe(true);
    expect(rumors.some((r) => r.includes('ran a clean sweep of the Sun-3 lanes'))).toBe(true);

    // The slots are genuinely dynamic: distinct action types + dispositions
    // produce three DISTINCT authored phrasings (not one repeated template).
    const seatedLines = rumors.slice(0, 3);
    expect(new Set(seatedLines).size).toBe(3);

    // And disposition is live: the grudge-holder's line uses the cold variant,
    // which is NOT the warm phrasing for the same action + fields.
    const combatLine = rumors.find((r) => r.includes('traded fire near Sun-3'))!;
    seated[1].disposition = 5; // flip to warm and re-log
    const warmRumors = hangoutRumors(state);
    const warmCombatLine = warmRumors.find((r) => r.includes('traded fire near Sun-3'))!;
    expect(warmCombatLine).not.toBe(combatLine);
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
    // T-121 · Antares-5, a RIM port. Aldebaran-1 used to stand here; it now runs a
    // bar like every other core port. §4.5 keeps the rim unflagged precisely so
    // this refusal stays reachable — an empty un-flagged set would delete the only
    // state that can produce ActionBlocked{'no-hangout'} and this test with it.
    state.player.currentSystemId = 15;
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

// ---------------------------------------------------------------------------
// T-121 · THE REACH CHANGE, DRIVEN (docs/HANGOUT_REDESIGN.md §4).
//
// Both tests go through `applyPlayerAction`, NOT `resolveVisitHangout` — the gate
// in `day.ts` is precisely the thing that changed, so a test that calls the
// resolver directly would have passed before this task and proves nothing.
//
// The numbers here were Sun-3's numbers, on purpose: at T-121 ids 2–14 all carried
// BASELINE rows that resolved field-wise to `DEFAULT_PORT_HANGOUT`, so this was a
// proof about REACH and not about parameters.
//
// T-123 · VEGA-6 IS NOW AN AUTHORED PORT (band 250/1500, §6.3 pass 2), so a 100cr
// request is clamped UP to the port's floor and the restated 1,100 stopped being
// true. The test is repaired the way the standing constraint requires — by reading
// the stake through `wagerBandFor`, the same accessor the resolver clamps with,
// rather than by re-recording a literal. It is still a REACH proof: what it asserts
// is that the action resolves off-hub at all, that the transfer is zero-sum, and
// that the die is spent.
// ---------------------------------------------------------------------------
describe('T-121 · VisitHangout resolves at a port that is not Sun-3', () => {
  it('a Dare plays at Vega-6 (id 14) — no ActionBlocked, credits move, the die is spent', () => {
    const VEGA_6 = 14;
    const state = hangoutState([20, 3, 3, 3, 3], VEGA_6); // die[0] = 20 → player wins
    state.player.credits = 10_000;
    const dealerStart = dealerOf(state).credits;
    // The port's own floor — inside its band by construction, and inside both
    // purses, so the resolver's clamp is the identity and the transfer is exact.
    const stake = wagerBandFor(VEGA_6).min;
    const { state: after, events } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'dare',
      opponentId: DEALER,
      wager: stake,
      spendDie: 0,
    });

    expect(events.some((e) => e.type === 'ActionBlocked')).toBe(false);
    expect(events.some((e) => e.type === 'HangoutEvent' && e.venue === 'dare')).toBe(true);
    // The same zero-sum transfer the home port produces.
    expect(after.player.credits).toBe(10_000 + stake);
    expect(dealerOf(after).credits).toBe(dealerStart - stake);
    expect(after.player.dawnHand?.spent[0]).toBe(true);
  });

  it('a borrow works at Mira-9 (id 8) with NO co-located NPC — the desk travels with the flag', () => {
    const MIRA_9 = 8;
    const state = hangoutState([5, 5, 5, 5, 5], MIRA_9);
    // Empty the port: 'borrow' is opponent-less (Penny Wise is the counterparty,
    // not a captain), so this also proves the off-hub path does not quietly
    // depend on a dealer being in the room.
    for (const npc of state.npcs) npc.currentSystemId = 1;
    const startCredits = state.player.credits;

    const { state: after, events } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'borrow',
      amount: 500,
      spendDie: 0,
    });

    expect(events.some((e) => e.type === 'ActionBlocked')).toBe(false);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'LoanEvent', kind: 'borrowed', principal: 500 }),
    );
    expect(after.player.loan).toMatchObject({ principal: 500, outstanding: 500 });
    expect(after.player.credits).toBe(startCredits + 500);
  });
});

// ---------------------------------------------------------------------------
// T-120 · The one new refusal (docs/HANGOUT_REDESIGN.md §2.6). A port whose venue
// definition omits a beat refuses it BEFORE the die is spent, routed through the
// same `failVenue` helper — so the five social venues report a HangoutEvent and
// the two lending venues report a LoanEvent.
//
// F-120-1 · THE REFUSAL WAS NOT REACHABLE END TO END AT T-120, and that was
// deliberate rather than an omission: Sun-3's row and `DEFAULT_PORT_HANGOUT` both
// offer all seven venues, so no state could drive `resolveVisitHangout` into that
// branch while exactly one port existed. What is asserted here is the SERIALIZED
// SHAPE of both event variants (the schema mirror + the drift guard); the
// resolver-level assertion it named as owed is DISCHARGED by T-123 in the
// describe block below — Arcturus-6 (4) runs no credit desk and Deneb-4 (5) seats
// no stranger, so both event variants are now driven for real.
// ---------------------------------------------------------------------------
describe("T-120 · the 'venue-not-offered' refusal round-trips on both event shapes", () => {
  it('a HangoutEvent carrying it survives serialize → deserialize byte-identically', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    state.eventLog.push({
      type: 'HangoutEvent',
      day: state.day,
      venue: 'befriend',
      failReason: 'venue-not-offered',
    });
    const s1 = serializeState(state);
    const restored = deserializeState(s1);
    expect(serializeState(restored)).toBe(s1);
    expect(
      restored.eventLog.some(
        (e) => e.type === 'HangoutEvent' && e.failReason === 'venue-not-offered',
      ),
    ).toBe(true);
  });

  it('a LoanEvent carrying it survives serialize → deserialize byte-identically', () => {
    const state = hangoutState([10, 3, 3, 3, 3]);
    state.eventLog.push({
      type: 'LoanEvent',
      day: state.day,
      kind: 'failed',
      failReason: 'venue-not-offered',
    });
    const s1 = serializeState(state);
    const restored = deserializeState(s1);
    expect(serializeState(restored)).toBe(s1);
    expect(
      restored.eventLog.some((e) => e.type === 'LoanEvent' && e.failReason === 'venue-not-offered'),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-123 · THE REFUSAL, DRIVEN FOR REAL — the assertion F-120-1 recorded as owed
// by the first task to author a port that withholds a beat
// (`docs/HANGOUT_REDESIGN.md` §2.6, §6.2).
//
// TWO ports narrow their venue set, for two different reasons:
//   * Deneb-4 (5) — the partisan hall will not seat a stranger, so 'meet' reports
//     a `HangoutEvent{kind:'failed'}`;
//   * Spica-3 (13) — T-124's second watch tolerates no insults, so 'insult'
//     reports a `HangoutEvent` too. Driven here because a SECOND social venue at a
//     DIFFERENT port is what says the refusal is a property of `venueOffered`
//     rather than of Deneb-4's row or of the `meet` arm in particular.
// In both cases the refusal lands BEFORE the die is spent, which is the property
// that matters: nothing is charged for an act the house never offered.
//
// T-133 (owner ruling D7) · IT WAS THREE PORTS, AND THE THIRD WAS THE ONE THAT
// REACHED THE `LoanEvent` VARIANT. Arcturus-6 (4) withheld 'borrow'/'repay'
// because a withheld venue was the only per-port lending control ruling 5 granted;
// D7 gives a row its own `loanBand`, so the garrison runs its desk again against a
// tight ceiling and its two refusal tests have been REPLACED by the clamp tests in
// the block below — the coverage moved with the content rather than being deleted.
// CONSEQUENCE, recorded rather than discovered later: no authored row withholds a
// lending venue any more, so `LoanEvent{failReason:'venue-not-offered'}` is once
// again unreachable from content — the exact F-120-1 situation, restored by an
// amendment rather than by an oversight. The resolver arm and its schema mirror
// stay (a later row may close a desk), and the serialized-shape pins above are
// again the whole of that variant's coverage.
//
// NO NUMBER FROM THE CONTENT ROWS IS RESTATED HERE. The tests read `venueOffered`
// and `loanBandFor` to state their preconditions, so an author who later gives
// Deneb-4 a `meet` — or widens the garrison's band — gets a failing precondition
// assertion rather than a silently vacuous test.
// ---------------------------------------------------------------------------
describe('T-123 · a port that withholds a venue refuses it BEFORE the die is spent', () => {
  const ARCTURUS_6 = 4;
  const DENEB_4 = 5;
  const SPICA_3 = 13;

  it('meet at Deneb-4 is a typed HangoutEvent fail — no die spent, no disposition moved', () => {
    expect(venueOffered(DENEB_4, 'meet')).toBe(false);
    const state = hangoutState([10, 3, 3, 3, 3], DENEB_4);
    const startDisposition = dealerOf(state).disposition;

    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'meet', opponentId: DEALER, spendDie: 0 },
      new SeededRng(1),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'HangoutEvent',
        venue: 'meet',
        failReason: 'venue-not-offered',
      }),
    );
    expect(events.some((e) => e.type === 'LoanEvent')).toBe(false);
    expect(events.some((e) => e.type === 'DispositionChanged')).toBe(false);
    expect(after.player.dawnHand?.spent[0]).toBe(false);
    expect(dealerOf(after).disposition).toBe(startDisposition);
  });

  it('T-124 · insult at Spica-3 is a typed HangoutEvent fail — no die spent, no disposition moved', () => {
    expect(venueOffered(SPICA_3, 'insult')).toBe(false);
    const state = hangoutState([10, 3, 3, 3, 3], SPICA_3);
    const startDisposition = dealerOf(state).disposition;

    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'insult', opponentId: DEALER, spendDie: 0 },
      new SeededRng(1),
    );

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'HangoutEvent',
        venue: 'insult',
        failReason: 'venue-not-offered',
      }),
    );
    expect(events.some((e) => e.type === 'LoanEvent')).toBe(false);
    expect(events.some((e) => e.type === 'DispositionChanged')).toBe(false);
    expect(after.player.dawnHand?.spent[0]).toBe(false);
    expect(dealerOf(after).disposition).toBe(startDisposition);
  });

  it('the beats those ports DO run still resolve normally', () => {
    // The control. Without it the tests above would also pass at a port that
    // refused everything, and "narrowed" would be indistinguishable from "broken".
    const state = hangoutState([20, 3, 3, 3, 3], ARCTURUS_6);
    state.player.credits = 1000;
    const { state: after, events } = resolveVisitHangout(
      state,
      { type: 'VisitHangout', venue: 'dare', opponentId: DEALER, wager: 200, spendDie: 0 },
      new SeededRng(1),
    );
    expect(events.some((e) => e.type === 'HangoutEvent' && e.venue === 'dare')).toBe(true);
    expect(
      events.some((e) => e.type === 'HangoutEvent' && e.failReason === 'venue-not-offered'),
    ).toBe(false);
    expect(after.player.dawnHand?.spent[0]).toBe(true);

    // …and the same at Spica-3, on a venue it DOES run, so the insult refusal above
    // is a statement about the venue rather than about the port being broken.
    expect(venueOffered(SPICA_3, 'befriend')).toBe(true);
    const watch = hangoutState([20, 3, 3, 3, 3], SPICA_3);
    const { state: afterWatch, events: watchEvents } = resolveVisitHangout(
      watch,
      { type: 'VisitHangout', venue: 'befriend', opponentId: DEALER, spendDie: 0 },
      new SeededRng(1),
    );
    expect(watchEvents.some((e) => e.type === 'HangoutEvent' && e.venue === 'befriend')).toBe(true);
    expect(
      watchEvents.some((e) => e.type === 'HangoutEvent' && e.failReason === 'venue-not-offered'),
    ).toBe(false);
    expect(afterWatch.player.dawnHand?.spent[0]).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-133 · THE PER-PORT LOAN BAND, DRIVEN THROUGH THE REAL ACTION PATH (owner
// ruling D7, `docs/HANGOUT_REDESIGN.md` §2.2 ruling 5 as amended).
//
// The block above proves a withheld VENUE is refused. This one proves the thing
// D7 replaced that mechanism with: a desk that is OPEN but shallow. An over-ask at
// the garrison mess is CLAMPED, not refused — the die is spent, a marker is
// written, and the captain walks out with less than they asked for. That
// distinction is the whole ruling: a band is a clamp, not a counterparty.
//
// DRIVEN THROUGH `applyPlayerAction`, not through `resolveVisitHangout` directly,
// because the Accept clause asks for the real path: the day-loop gates (hangout
// system, encounter, phase) run first, and a clamp that only worked when the
// resolver was called by hand would prove nothing about the game.
//
// EVERY EXPECTATION READS `loanBandFor`. Nothing here names 1,000 or 5,000, so the
// authored ceiling can move without this file needing an edit — and if the two
// ports ever stop differing, the non-vacuity assertion says so out loud instead of
// the tests quietly agreeing with each other.
// ---------------------------------------------------------------------------
describe('T-133 · a requested principal clamps into the PORT’s band', () => {
  const ARCTURUS_6 = 4;
  const SUN_3 = 1;

  /** The engine-written marker off a real `applyPlayerAction`, plus its event. */
  function borrowAt(systemId: number, amount: number) {
    const state = hangoutState([10, 3, 3, 3, 3], systemId);
    const before = state.player.credits;
    const { state: after, events } = applyPlayerAction(state, {
      type: 'VisitHangout',
      venue: 'borrow',
      amount,
      spendDie: 0,
    });
    return { after, events, before };
  }

  it('the garrison mess deals a tighter band than the home hall — the precondition', () => {
    // NON-VACUITY. Every assertion below is a comparison between these two ports;
    // if the content ever collapses them, this fails first and says why.
    expect(venueOffered(ARCTURUS_6, 'borrow')).toBe(true);
    expect(loanBandFor(ARCTURUS_6).max).toBeLessThan(loanBandFor(SUN_3).max);
  });

  it('an over-ask at Arcturus-6 CLAMPS to the port’s ceiling — it does not error', () => {
    const ceiling = loanBandFor(ARCTURUS_6).max;
    const { after, events, before } = borrowAt(ARCTURUS_6, loanBandFor(SUN_3).max);

    // Not blocked, not refused: the desk is open and it answered.
    expect(events.some((e) => e.type === 'ActionBlocked')).toBe(false);
    expect(events.some((e) => e.type === 'LoanEvent' && e.kind === 'failed')).toBe(false);

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'LoanEvent', kind: 'borrowed', principal: ceiling }),
    );
    expect(after.player.loan?.principal).toBe(ceiling);
    expect(after.player.loan?.outstanding).toBe(ceiling);
    // Credits moved by exactly the CLAMPED amount, not by the amount asked for.
    expect(after.player.credits).toBe(before + ceiling);
    // …and the die was spent, because the action resolved rather than refusing.
    expect(after.player.dawnHand?.spent[0]).toBe(true);
  });

  it('an under-ask at Arcturus-6 clamps UP to the port’s floor', () => {
    const floor = loanBandFor(ARCTURUS_6).min;
    const { after, before } = borrowAt(ARCTURUS_6, 1);
    expect(after.player.loan?.principal).toBe(floor);
    expect(after.player.credits).toBe(before + floor);
  });

  it('THE SAME REQUEST AT SUN-3 IS NOT CLAMPED — the two ports diverge through one accessor', () => {
    // The control, and the behaviour-preserving half of the Accept clause driven
    // rather than asserted: the request that the garrison trims is honoured in
    // full at every port that did not author a band.
    const asked = loanBandFor(SUN_3).max;
    const { after, before } = borrowAt(SUN_3, asked);
    expect(after.player.loan?.principal).toBe(asked);
    expect(after.player.credits).toBe(before + asked);
    expect(asked).toBeGreaterThan(loanBandFor(ARCTURUS_6).max);
  });
});
