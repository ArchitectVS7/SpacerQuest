import { describe, it, expect } from 'vitest';
import { LIARS_DICE_OPPONENTS, Stat } from '@spacerquest/content';
import { createInitialState } from '../state.js';
import { applyPlayerAction } from '../day.js';
import { minOpeningQuantity } from '../liarsDiceRules.js';
import { CURRENT_SAVE_VERSION, createSave, loadSave } from '../save.js';
import { DawnHand, DayPhase, GameEvent, GameState, PlayerAction } from '../types.js';

/**
 * T-160 · A LEGAL OPENING CLAIM on `face`, DERIVED FROM THE HAND THE SEED ROLLED
 * (`docs/LIARS-DICE_REDESIGN.md` §16.2 shape (b), the F-137-1 fix). The opening
 * floor makes any hardcoded opening literal a function of the player's hidden
 * dice, so a literal that passes today passes by luck. This asks the ENGINE's own
 * `minOpeningQuantity` and then takes `atLeast` on top.
 */
function openingBid(state: GameState, face: number, atLeast = 1): PlayerAction {
  const own = state.dareHand!.playerDice.filter((d) => d === face).length;
  return { type: 'Dare', move: 'bid', face, quantity: Math.max(atLeast, minOpeningQuantity(own)) };
}

// ---------------------------------------------------------------------------
// T-147 · THE COMPLETION SIGNAL AND ITS FIFTEEN DEEDS
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §6.2-§6.4).
//
// SAME DISCIPLINE AS `liarsDiceLadder.test.ts`: every hand is played through the
// REAL loop (`applyPlayerAction(VisitHangout{venue:'dare'})` to open, `Dare{…}`
// per move), so the events asserted below are the ones `settleDareHand` actually
// emits and the deeds are the ones `evaluateDeeds` actually files. The only
// direct writes are FIXTURE SETUP before the first action — a beaten set, a
// purse, a credit balance, an odometer — which is exactly what the shipped
// Liar's Dice suites already do.
//
// THE HAND SCRIPT IS DERIVED, NOT HOPED FOR — and at T-160 so is the WIN.
// The script is `bid(face 3, at the engine's opening floor)` → (challenge if a
// bid still stands). Before T-160 that opening claim was true by construction
// (finding F-137-1), so seed 1 won against every seat and a literal seed was a
// safe pin. §16.2 shape (b) removed the guarantee deliberately, so `playWonHand`
// now SEARCHES for a winning seed and throws if none exists — the assertion these
// tests make is about the set-closure signal, never about dice.
//
// `liarsDiceGamesPlayed` is pinned at 0 in every fixture EXPLICITLY: the tier is
// frozen at open and drives `dicePerSide`, so an unpinned odometer would silently
// re-deal the hand and the script would stop being reproducible.
// ---------------------------------------------------------------------------

const SUN_3 = 1;
/** Sol-3's three authored seats, in seat order (`bad`, `mixed`, `optimal`). */
const [SUN3_BAD, SUN3_MIXED, SUN3_OPTIMAL] = LIARS_DICE_OPPONENTS[SUN_3].map((row) => row.id);
/** Cast index 0 — a POOL B roaming captain, starting co-located at Sol-3. */
const ROAMER = 'npc-iron-vex';
/** Every authored id, derived — never a hand-listed 42. */
const ALL_ROSTER_IDS = Object.values(LIARS_DICE_OPPONENTS)
  .flat()
  .map((row) => row.id);

/** A DAY-phase state at Sol-3 with a fat dawn hand, a solvent co-located roaming
 *  dealer, and a chosen beaten set. `liarsDiceGamesPlayed` is pinned at 0 — see
 *  the header. */
function tableState(beaten: readonly string[], seed = 1): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = SUN_3;
  state.player.stats[Stat.GUILE] = 0;
  state.player.credits = 200_000;
  state.player.liarsDiceGamesPlayed = 0;
  state.player.liarsDiceBeaten = [...beaten];
  const dice = [10, 10, 10, 10, 10];
  state.player.dawnHand = { dice: [...dice], spent: dice.map(() => false) } satisfies DawnHand;
  const dealer = state.npcs.find((npc) => npc.id === ROAMER)!;
  dealer.currentSystemId = SUN_3;
  dealer.credits = 200_000;
  dealer.disposition = 0;
  return state;
}

/** Open a hand and play it out under the derived script, returning the settled
 *  state and EVERY event the hand produced (opening batch included). */
function playHand(state: GameState, opponentId: string): { state: GameState; events: GameEvent[] } {
  const open: PlayerAction = {
    type: 'VisitHangout',
    venue: 'dare',
    opponentId,
    wager: 50,
  };
  const opened = applyPlayerAction(state, open);
  let current = opened.state;
  const events = [...opened.events];
  for (let step = 0; step < 24 && current.dareHand; step += 1) {
    const move: PlayerAction =
      current.dareHand.bid === null
        ? openingBid(current, 3, 2)
        : { type: 'Dare', move: 'challenge' };
    const result = applyPlayerAction(current, move);
    events.push(...result.events);
    current = result.state;
  }
  return { state: current, events };
}

/**
 * T-160 · Play the derived script until it actually WINS, and say so if it never
 * does.
 *
 * Before T-160 the script's opening claim was TRUE BY CONSTRUCTION (finding
 * F-137-1), so seed 1 won against every seat and the header could pin "seed 1
 * resolves to challenge-win". The opening floor (§16.2 shape (b)) removed that
 * guarantee on purpose: an opening claim is now a real claim that can be false,
 * so whether a given seed wins is dice. These tests are about the SET-CLOSURE
 * SIGNAL, not about dice, so the win is now DERIVED — searched for and asserted —
 * rather than hoped for from a literal. `build` takes the seed so the whole hand
 * (the eight d6 and every dealer roll) is re-dealt each attempt.
 */
function playWonHand(
  build: (seed: number) => GameState,
  opponentId: string,
): { state: GameState; events: GameEvent[] } {
  for (let seed = 1; seed <= 400; seed += 1) {
    const played = playHand(build(seed), opponentId);
    if (playerWon(played.events)) return played;
  }
  throw new Error(`no seed in 1..400 won a hand against ${opponentId} under the derived script`);
}

function clearedOf(events: readonly GameEvent[]) {
  return events.filter(
    (event): event is Extract<GameEvent, { type: 'LiarsDiceSetCleared' }> =>
      event.type === 'LiarsDiceSetCleared',
  );
}

function earnedOf(events: readonly GameEvent[]): string[] {
  return events
    .filter(
      (event): event is Extract<GameEvent, { type: 'DeedEarned' }> => event.type === 'DeedEarned',
    )
    .map((event) => event.deedId);
}

function playerWon(events: readonly GameEvent[]): boolean {
  const resolved = events.find(
    (event): event is Extract<GameEvent, { type: 'DareHandResolved' }> =>
      event.type === 'DareHandResolved',
  );
  return resolved?.outcome === 'challenge-win' || resolved?.outcome === 'dealer-fold';
}

// ---------------------------------------------------------------------------

describe('T-147 · a port set closes exactly once', () => {
  it('beating the LAST of a port’s three seats fires that port’s deed, once', () => {
    const { state, events } = playWonHand(
      (seed) => tableState([SUN3_BAD, SUN3_MIXED], seed),
      SUN3_OPTIMAL,
    );
    expect(playerWon(events), 'the derived script must win this hand').toBe(true);

    const cleared = clearedOf(events);
    expect(cleared).toHaveLength(1);
    expect(cleared[0]).toMatchObject({
      scope: 'port',
      systemId: SUN_3,
      opponentId: SUN3_OPTIMAL,
      beatenCount: 3,
    });
    expect(cleared[0].day).toBe(state.day);
    // The whole-roster deed must NOT come along for the ride — 42 seats are not
    // three seats, and `scope` is the only thing keeping them apart.
    expect(cleared.some((event) => event.scope === 'roster')).toBe(false);

    const earned = earnedOf(events);
    expect(earned.filter((id) => id === 'liars_dice_cleared_sun_3')).toHaveLength(1);
    expect(earned).not.toContain('liars_dice_grand_slam');
    expect(state.player.registry.earned.map((deed) => deed.id)).toContain(
      'liars_dice_cleared_sun_3',
    );
  });

  it('files a real citation with the day substituted, not a template', () => {
    const { state } = playWonHand((seed) => tableState([SUN3_BAD, SUN3_MIXED], seed), SUN3_OPTIMAL);
    const filed = state.player.registry.earned.find(
      (deed) => deed.id === 'liars_dice_cleared_sun_3',
    )!;
    expect(filed.citation).toContain('the Long Table');
    expect(filed.citation).toContain(String(state.day));
    expect(filed.citation).not.toContain('{day}');
    expect(filed.day).toBe(state.day);
  });

  it('two of three is NOT a set — the second win fires nothing', () => {
    const { state, events } = playWonHand((seed) => tableState([SUN3_BAD], seed), SUN3_MIXED);
    expect(playerWon(events)).toBe(true);
    expect(state.player.liarsDiceBeaten).toContain(SUN3_MIXED);
    expect(clearedOf(events)).toHaveLength(0);
    expect(earnedOf(events)).not.toContain('liars_dice_cleared_sun_3');
  });
});

describe('T-147 · once means once — the rematch and the roaming pool', () => {
  it('a REMATCH against an already-beaten seat is silent', () => {
    // T-145 §6.2 step 1's `includes` guard is the whole mechanism; there is no
    // de-dup bookkeeping downstream to test, which is exactly the point.
    const before = 3;
    const { state, events } = playWonHand(
      (seed) => tableState([SUN3_BAD, SUN3_MIXED, SUN3_OPTIMAL], seed),
      SUN3_OPTIMAL,
    );
    expect(playerWon(events)).toBe(true);
    expect(clearedOf(events)).toHaveLength(0);
    // The generic gambling deeds (`dare_first`/`dare_won`) legitimately fire off
    // the terminal `HangoutEvent` — it is the COMPLETION family that must stay
    // silent, so the filter is on the family rather than on the whole batch.
    expect(earnedOf(events).filter((id) => id.startsWith('liars_dice_'))).toHaveLength(0);
    expect(state.player.liarsDiceBeaten).toHaveLength(before);
    expect(state.player.registry.earned.map((deed) => deed.id)).not.toContain(
      'liars_dice_cleared_sun_3',
    );
  });

  it('a ROAMING win is silent — pool B can never close an authored set', () => {
    // THE ACCEPTANCE'S "not once per remaining game against the roaming pool".
    // Pool B respawns its willingness to play every dusk, so a roaming win that
    // counted would turn a finite gauntlet into a grind timer.
    const played = playWonHand((seed) => tableState([SUN3_BAD, SUN3_MIXED], seed), ROAMER);
    expect(playerWon(played.events)).toBe(true);
    expect(clearedOf(played.events)).toHaveLength(0);
    expect(played.state.player.liarsDiceBeaten).toEqual([SUN3_BAD, SUN3_MIXED]);
    expect(earnedOf(played.events)).not.toContain('liars_dice_cleared_sun_3');
  });
});

describe('T-147 · the whole roster closes exactly once, alongside its port', () => {
  /** All 42 authored ids except Sol-3's `optimal` seat — the one win away state. */
  const ALL_BUT_ONE = ALL_ROSTER_IDS.filter((id) => id !== SUN3_OPTIMAL);

  it('the 42nd win fires PORT then ROSTER, in that order, both once', () => {
    expect(ALL_BUT_ONE).toHaveLength(ALL_ROSTER_IDS.length - 1);
    const { state, events } = playWonHand((seed) => tableState(ALL_BUT_ONE, seed), SUN3_OPTIMAL);
    expect(playerWon(events)).toBe(true);

    const cleared = clearedOf(events);
    expect(cleared.map((event) => event.scope)).toEqual(['port', 'roster']);
    for (const event of cleared) {
      expect(event.systemId).toBe(SUN_3);
      expect(event.opponentId).toBe(SUN3_OPTIMAL);
      // Derived from content, so a roster that grows moves this with it.
      expect(event.beatenCount).toBe(ALL_ROSTER_IDS.length);
    }

    const earned = earnedOf(events);
    expect(earned.filter((id) => id === 'liars_dice_cleared_sun_3')).toHaveLength(1);
    expect(earned.filter((id) => id === 'liars_dice_grand_slam')).toHaveLength(1);
    const filed = state.player.registry.earned.find((deed) => deed.id === 'liars_dice_grand_slam')!;
    expect(filed.citation).toContain(String(state.day));
    expect(filed.citation).not.toContain('{day}');
  });

  it('playing on after the clear emits nothing further, at either pool', () => {
    const closed = playWonHand((seed) => tableState(ALL_BUT_ONE, seed), SUN3_OPTIMAL).state;
    expect(clearedOf(closed.eventLog)).toHaveLength(2);

    const again = playHand(closed, SUN3_BAD);
    expect(clearedOf(again.events)).toHaveLength(0);
    expect(again.events.filter((event) => event.type === 'LiarsDiceSetCleared')).toHaveLength(0);

    const roaming = playHand(again.state, ROAMER);
    expect(clearedOf(roaming.events)).toHaveLength(0);

    // ...and the registry still holds exactly the two COMPLETION deeds the clear
    // filed — no port deed for a house the player never finished, no second
    // capstone. (The generic gambling deeds are filtered out: they are earned off
    // the terminal `HangoutEvent` and are not this family's business.)
    expect(
      roaming.state.player.registry.earned
        .map((deed) => deed.id)
        .filter((id) => id.startsWith('liars_dice_'))
        .sort(),
    ).toEqual(['liars_dice_cleared_sun_3', 'liars_dice_grand_slam']);
  });
});

describe('T-147 · the event round-trips through eventLog without a version move', () => {
  it('CURRENT_SAVE_VERSION does NOT move — no GameState field was added', () => {
    // The event rides `eventLog`, which is already versioned, so §3 of the
    // standing constraints is N/A with the reason stated rather than skipped.
    expect(CURRENT_SAVE_VERSION).toBe(16);
  });

  it('survives createSave/loadSave byte-identically', () => {
    // THIS is what proves the `schema.ts` variant is real: the union parses in
    // STRIP mode, so a missing member would silently drop every key of the event
    // (or fail the load outright) rather than announcing itself.
    const played = playWonHand(
      (seed) => tableState([SUN3_BAD, SUN3_MIXED], seed),
      SUN3_OPTIMAL,
    ).state;
    const logged = clearedOf(played.eventLog);
    expect(logged).toHaveLength(1);

    const restored = loadSave(createSave(played, 1)).state;
    expect(clearedOf(restored.eventLog)).toEqual(logged);
    // ...and the registry entry the event earned came back with it.
    expect(restored.player.registry.earned.map((deed) => deed.id)).toContain(
      'liars_dice_cleared_sun_3',
    );
  });
});
