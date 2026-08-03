import { describe, it, expect } from 'vitest';
import {
  LIARS_DICE_RAISED_CEILING_MULT,
  LIARS_DICE_UNLOCK_GAMES,
  Stat,
} from '@spacerquest/content';
import { createInitialState } from '../state.js';
import { applyPlayerAction, endDay } from '../day.js';
import { npcGuile, wagerBandFor } from '../hangoutRules.js';
import {
  anteFor,
  dicePerSideForTier,
  effectiveWagerBand,
  headroomFor,
  legalDareMoves,
  liarsDiceTier,
  maxQuantityForDice,
  readTheTableLine,
  minOpeningQuantity,
} from '../liarsDiceRules.js';
import { opponentCredits } from '../actions/dare.js';
import { CURRENT_SAVE_VERSION, MIGRATIONS, createSave, loadSave } from '../save.js';
import { DareOutcome, DawnHand, DayPhase, GameEvent, GameState, PlayerAction } from '../types.js';

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
// T-146 · THE UNLOCK LADDER (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §4).
//
// The register this file discharges is §9's, and the obligation numbers are in the
// describe titles so a reader can check the register off against the suite:
//   13 — each of the five unlocks, at `threshold − 1` and at `threshold`
//   14 — the six-dice HARD CAP
//   15 — tier 5 is still SOLVENCY-clamped
//   16 — the tier is FROZEN AT OPEN
//   27 — the counter increments exactly once per settled hand, at every outcome
//   28 — the save round trip at several tiers, WITHOUT moving CURRENT_SAVE_VERSION
//
// SAME DISCIPLINE AS `liarsDice.test.ts`: every hand is driven through the REAL
// loop (`applyPlayerAction(VisitHangout{venue:'dare'})` to open, `Dare{…}` per
// move), and the only direct writes to state are FIXTURE SETUP before the first
// action — a purse, a credit balance, a games-played odometer — which is exactly
// what the shipped tests already do with `npc.credits`. The one deliberate
// exception is obligation 16, which MUST move `liarsDiceGamesPlayed` mid-hand,
// because that is the experiment.
//
// EVERY THRESHOLD IS READ FROM CONTENT (`LIARS_DICE_UNLOCK_GAMES`), never restated
// as a literal — a test that hardcoded 5/10/20/40/80 would silently stop testing
// the shipped ladder the moment content moved.
// ---------------------------------------------------------------------------

const DEALER = 'npc-iron-vex'; // cast index 0 — starts co-located at Sun-3 (id 1).
const SUN_3 = 1;
/** Sun-3's three authored seats: `bad`, `mixed`, `optimal` in seat order. */
const SUN3_BAD = 'ld-1-1';
const SUN3_MIXED = 'ld-1-2';
const SUN3_OPTIMAL = 'ld-1-3';
/** Mira-9 seat 1 — the first authored `random` seat, and the only reliable source
 *  of a `dealer-fold` (`bad` never folds; `optimal` folds only when `-potDealer`
 *  beats every alternative). Reused from `liarsDice.test.ts`'s own sweep. */
const MIRA_9 = 8;
const MIRA9_RANDOM = 'ld-8-1';

const [T1, T2, T3, T4, T5] = LIARS_DICE_UNLOCK_GAMES;

/** A DAY-phase state at a hasHangout port with a hand-picked dawn hand, a
 *  co-located solvent dealer, and a chosen point on the unlock ladder. */
function ladderState(
  gamesPlayed: number,
  seed = 1,
  systemId = SUN_3,
  credits = 200_000,
  dice = [10, 10, 10, 10, 10],
): GameState {
  const state = createInitialState(seed);
  state.dayPhase = DayPhase.DAY;
  state.dayEventCount = 0;
  state.player.currentSystemId = systemId;
  state.player.stats[Stat.GUILE] = 0;
  state.player.credits = credits;
  state.player.liarsDiceGamesPlayed = gamesPlayed;
  state.player.dawnHand = { dice: [...dice], spent: dice.map(() => false) } satisfies DawnHand;
  const dealer = state.npcs.find((n) => n.id === DEALER)!;
  dealer.currentSystemId = systemId;
  dealer.credits = credits;
  dealer.disposition = 0;
  return state;
}

/** Open a hand through the real resolver, against either pool. */
function open(state: GameState, opponentId: string = DEALER, wager?: number, spendDie = 0) {
  const action: PlayerAction = { type: 'VisitHangout', venue: 'dare', opponentId, spendDie };
  return applyPlayerAction(state, wager === undefined ? action : { ...action, wager });
}

function startedOf(events: GameEvent[]) {
  return events.find(
    (e): e is Extract<GameEvent, { type: 'DareHandStarted' }> => e.type === 'DareHandStarted',
  );
}

function resolvedOf(events: GameEvent[]) {
  return events.find(
    (e): e is Extract<GameEvent, { type: 'DareHandResolved' }> => e.type === 'DareHandResolved',
  );
}

// ---------------------------------------------------------------------------
// The pure functions, before any hand is dealt
// ---------------------------------------------------------------------------

describe('T-146 · liarsDiceTier is a total function with five exact steps', () => {
  it('steps at exactly the authored thresholds, and nowhere else', () => {
    // Stated as pairs so the OFF-BY-ONE is the assertion rather than an artefact
    // of a loop: §4.1 pins "the settlement of the 5th hand makes tier 1 live for
    // the 6th hand", i.e. the tier is live AT the threshold, not one past it.
    const boundaries: Array<[number, number]> = [
      [0, 0],
      [T1 - 1, 0],
      [T1, 1],
      [T2 - 1, 1],
      [T2, 2],
      [T3 - 1, 2],
      [T3, 3],
      [T4 - 1, 3],
      [T4, 4],
      [T5 - 1, 4],
      [T5, 5],
    ];
    for (const [games, tier] of boundaries) {
      expect(liarsDiceTier(games), `${games} games`).toBe(tier);
    }
  });

  it('is total over garbage a hand-edited save could carry', () => {
    for (const bad of [-1, -1000, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(liarsDiceTier(bad), String(bad)).toBe(0);
    }
    // A fraction sits on the rung it has actually passed, never between two.
    expect(liarsDiceTier(T1 - 0.5)).toBe(0);
    expect(liarsDiceTier(T1 + 0.5)).toBe(1);
    // Beyond the last rung the ladder simply ends — it never runs off.
    expect(liarsDiceTier(Number.POSITIVE_INFINITY)).toBe(5);
    expect(liarsDiceTier(Number.MAX_SAFE_INTEGER)).toBe(5);
  });
});

describe('T-146 · effectiveWagerBand is the port band until tier 4 moves it', () => {
  // One WIDE band and one NARROW one, so the multiplier is proven to ride the
  // port's own number rather than a constant that happens to match at Sun-3.
  const PORTS = [SUN_3, 11];

  it('tiers 0–3 return the port’s authored band verbatim', () => {
    for (const systemId of PORTS) {
      for (const tier of [0, 1, 2, 3]) {
        expect(effectiveWagerBand(systemId, tier)).toEqual(wagerBandFor(systemId));
      }
    }
  });

  it('tier 4 triples the CEILING and leaves the floor alone', () => {
    for (const systemId of PORTS) {
      const band = wagerBandFor(systemId);
      expect(effectiveWagerBand(systemId, 4)).toEqual({
        min: band.min,
        max: band.max * LIARS_DICE_RAISED_CEILING_MULT,
      });
    }
  });

  it('tier 5 removes BOTH ends — the floor as well as the ceiling (§4.8)', () => {
    for (const systemId of PORTS) {
      expect(effectiveWagerBand(systemId, 5)).toEqual({ min: 0, max: null });
    }
  });
});

describe('T-146 · readTheTableLine maps both pools onto the three authored lines', () => {
  it('pool A reads the RESOLVED archetype (§4.5 ruling 1)', () => {
    expect(readTheTableLine('roster', 'optimal')).toBe('This one plays it safe.');
    expect(readTheTableLine('roster', 'bad')).toBe("This one's reckless.");
    expect(readTheTableLine('roster', 'random')).toBe("Can't get a read on this one.");
  });

  it('pool B derives from GUILE, and the ≤1 / ≥4 edges land on the right side', () => {
    // The boundaries are the whole content of ruling 2, so they are asserted one
    // by one rather than swept: 1 is still reckless, 2 and 3 are unreadable, 4 is
    // already careful.
    expect(readTheTableLine('roaming', 0)).toBe("This one's reckless.");
    expect(readTheTableLine('roaming', 1)).toBe("This one's reckless.");
    expect(readTheTableLine('roaming', 2)).toBe("Can't get a read on this one.");
    expect(readTheTableLine('roaming', 3)).toBe("Can't get a read on this one.");
    expect(readTheTableLine('roaming', 4)).toBe('This one plays it safe.');
    expect(readTheTableLine('roaming', 5)).toBe('This one plays it safe.');
  });

  it('is one of exactly three strings, whatever it is asked', () => {
    const lines = new Set<string>();
    for (const archetype of ['optimal', 'bad', 'random'] as const) {
      lines.add(readTheTableLine('roster', archetype));
    }
    for (let guile = -3; guile <= 12; guile += 1) lines.add(readTheTableLine('roaming', guile));
    expect(lines.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Obligation 13 · each of the five unlocks, at `threshold − 1` and at `threshold`
// ---------------------------------------------------------------------------

describe('T-146 · obligation 13 — every rung is reachable ONLY at its threshold', () => {
  it('rung 1 (dice 4 → 5) is dead one hand short and live on the threshold', () => {
    const before = open(ladderState(T1 - 1)).state.dareHand!;
    expect(before.dicePerSide).toBe(4);
    expect(before.maxQuantity).toBe(8);
    // The DEALT ARRAYS, not just the field — a field the deal ignored would be a
    // lie the rest of the suite could not see.
    expect(before.playerDice).toHaveLength(4);
    expect(before.dealerDice).toHaveLength(4);

    const after = open(ladderState(T1)).state.dareHand!;
    expect(after.dicePerSide).toBe(5);
    expect(after.maxQuantity).toBe(10);
    expect(after.playerDice).toHaveLength(5);
    expect(after.dealerDice).toHaveLength(5);
  });

  it('rung 2 (dice 5 → 6) is dead one hand short and live on the threshold', () => {
    const before = open(ladderState(T2 - 1)).state.dareHand!;
    expect(before.dicePerSide).toBe(5);
    expect(before.maxQuantity).toBe(10);
    expect(before.playerDice).toHaveLength(5);
    expect(before.dealerDice).toHaveLength(5);

    const after = open(ladderState(T2)).state.dareHand!;
    expect(after.dicePerSide).toBe(6);
    expect(after.maxQuantity).toBe(12);
    expect(after.playerDice).toHaveLength(6);
    expect(after.dealerDice).toHaveLength(6);
  });

  it('rung 3 (Read the Table) is absent one hand short and present on the threshold', () => {
    // BOTH POOLS, because ruling 2 exists precisely so tier 3 is not dead at the
    // pool that supplies most of the player's hands.
    expect(startedOf(open(ladderState(T3 - 1)).events)!.opponentRead).toBeUndefined();
    expect(startedOf(open(ladderState(T3 - 1), SUN3_OPTIMAL).events)!.opponentRead).toBeUndefined();

    const roaming = startedOf(open(ladderState(T3)).events)!.opponentRead;
    expect(roaming).toBeTruthy();
    // npc-iron-vex has GUILE 0 — the reckless read, by rule and not by table.
    expect(roaming).toBe(readTheTableLine('roaming', npcGuile(createInitialState(1).npcs[0])));

    const roster = startedOf(open(ladderState(T3), SUN3_OPTIMAL).events)!.opponentRead;
    expect(roster).toBe('This one plays it safe.');
  });

  it('rung 3 reads a MIXED seat’s RESOLVED arm, never the label', () => {
    // §4.5 ruling 1: a mix is resolved once at open, so the honest read is the
    // resolved one — and it may differ from hand to hand, which is exactly what
    // makes a mixed opponent unreadable over a career.
    const reads = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const opened = open(ladderState(T3, seed), SUN3_MIXED);
      const read = startedOf(opened.events)!.opponentRead!;
      expect(read).toBe(readTheTableLine('roster', opened.state.dareHand!.opponentArchetype!));
      reads.add(read);
    }
    expect(reads.size).toBeGreaterThan(1);
  });

  it('rung 4 (the raised ceiling) is dead one hand short and live on the threshold', () => {
    const band = wagerBandFor(SUN_3);
    const raised = band.max * LIARS_DICE_RAISED_CEILING_MULT;

    // One short: the ceiling is the port's, and a stake above it is CLAMPED to it.
    const before = open(ladderState(T4 - 1), DEALER, raised).state.dareHand!;
    expect(before.bandMax).toBe(band.max);
    expect(before.seedWager).toBe(band.max);
    expect(before.ante).toBe(anteFor(SUN_3, 0));

    // On the threshold: the same stake is accepted in full, and the ante triples
    // with it so a raise does not become free relative to the pot (§4.7).
    const after = open(ladderState(T4), DEALER, raised).state.dareHand!;
    expect(after.bandMax).toBe(raised);
    expect(after.seedWager).toBe(raised);
    expect(after.ante).toBe(anteFor(SUN_3, 4));
    expect(after.ante).toBe(Math.round(anteFor(SUN_3, 0) * LIARS_DICE_RAISED_CEILING_MULT));
    // The raised ceiling is a WHOLE-HAND exposure ceiling, not a seed ceiling
    // (§4.4's recorded second effect): `headroomFor` reads the same number.
    expect(headroomFor(after, 'player')).toBe(raised - after.potPlayer);
  });

  it('rung 5 (unlimited betting) is dead one hand short and live on the threshold', () => {
    const band = wagerBandFor(SUN_3);

    // One short: still bounded, and the FLOOR still bites.
    const before = open(ladderState(T5 - 1), DEALER, 10).state.dareHand!;
    expect(before.bandMax).toBe(band.max * LIARS_DICE_RAISED_CEILING_MULT);
    expect(before.bandMax).not.toBeNull();
    expect(before.seedWager).toBe(band.min);

    // On the threshold: no ceiling, and no floor either — a veteran may sit at a
    // high table for ten credits if they want to (§4.8).
    const after = open(ladderState(T5), DEALER, 10).state.dareHand!;
    expect(after.bandMax).toBeNull();
    expect(after.seedWager).toBe(10);
    // …and the ante is deliberately the TIER-4 ante, not something derived from a
    // ceiling that no longer exists (§4.7's "note"). A player crossing 80 games
    // sees their ante stay put rather than jump or vanish.
    expect(after.ante).toBe(anteFor(SUN_3, 4));
    expect(after.ante).toBe(before.ante);
    // The headroom clamp is gone; only the solvency clamp remains.
    expect(headroomFor(after, 'player')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('an OMITTED wager still defaults to the port’s authored floor at tier 5', () => {
    // The clamp loses its floor; the DEFAULT does not. Defaulting an omitted wager
    // to `band.min === 0` would silently open FREE hands for a veteran, which is a
    // different feature from "unlimited betting".
    const hand = open(ladderState(T5)).state.dareHand!;
    expect(hand.seedWager).toBe(wagerBandFor(SUN_3).min);
  });
});

// ---------------------------------------------------------------------------
// Obligation 14 · the six-dice hard cap
// ---------------------------------------------------------------------------

describe('T-146 · obligation 14 — six dice is the end of the ladder, forever', () => {
  it('dicePerSideForTier never exceeds six, at any tier a number can name', () => {
    for (const tier of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100, 10_000, Number.MAX_SAFE_INTEGER]) {
      expect(dicePerSideForTier(tier), `tier ${tier}`).toBeLessThanOrEqual(6);
    }
    // …and it is a real ladder on the way up, not a constant that happens to obey
    // the bound.
    expect([0, 1, 2, 3].map(dicePerSideForTier)).toEqual([4, 5, 6, 6]);
  });

  it('a hand opened a million games in still deals exactly six and six', () => {
    const hand = open(ladderState(1_000_000)).state.dareHand!;
    expect(hand.dicePerSide).toBe(6);
    expect(hand.playerDice).toHaveLength(6);
    expect(hand.dealerDice).toHaveLength(6);
    expect(hand.maxQuantity).toBe(12);
    expect(hand.maxQuantity).toBe(maxQuantityForDice(6));
    // A claim of thirteen is off the lattice even at the top of the ladder.
    const tooTall = applyPlayerAction(open(ladderState(1_000_000)).state, {
      type: 'Dare',
      move: 'bid',
      quantity: 13,
      face: 3,
    });
    expect(tooTall.events[0]).toMatchObject({
      type: 'HangoutEvent',
      failReason: 'illegal-dare-move',
    });
  });

  it('the FACE ceiling is six at every tier — an explicit ruling, not an oversight', () => {
    // §4.3: a seventh face is a different game, and widening the range reopens the
    // §5.2 exploit search against a fix proven only over 1..6. Asserted at the top
    // of the ladder, where a "completed symmetry" would show.
    const refused = applyPlayerAction(open(ladderState(1_000_000)).state, {
      type: 'Dare',
      move: 'bid',
      quantity: 2,
      face: 7,
    });
    expect(refused.events[0]).toMatchObject({ failReason: 'illegal-dare-move' });
  });
});

// ---------------------------------------------------------------------------
// Obligation 15 · tier 5 is still solvency-clamped
// ---------------------------------------------------------------------------

/**
 * Play a whole hand at an absurd requested stake and assert the money invariants
 * after EVERY step, not merely at settlement. This is the whole content of the
 * owner's "the pot can never literally run away".
 */
function assertSolventThroughout(
  state: GameState,
  opponentId: string,
  wager: number,
  label: string,
): void {
  const playerAtOpen = state.player.credits;
  const kind = opponentId.startsWith('ld-') ? ('roster' as const) : ('roaming' as const);
  const party = { dealerId: opponentId, opponentKind: kind };
  const opponentAtOpen = opponentCredits(state, party);

  const check = (s: GameState, where: string) => {
    expect(s.player.credits, `${label} ${where}: player credits`).toBeGreaterThanOrEqual(0);
    expect(opponentCredits(s, party), `${label} ${where}: opponent credits`).toBeGreaterThanOrEqual(
      0,
    );
    if (s.dareHand) {
      // Escrow is money ALREADY DEBITED, so a pot larger than the purse it came
      // out of would mean the engine minted credits.
      expect(s.dareHand.potPlayer, `${label} ${where}: potPlayer`).toBeLessThanOrEqual(
        playerAtOpen,
      );
      expect(s.dareHand.potDealer, `${label} ${where}: potDealer`).toBeLessThanOrEqual(
        opponentAtOpen,
      );
    }
    // ZERO-SUM across the whole hand, at every intermediate point: escrow is not a
    // third party, it is money on its way between two.
    const live =
      s.player.credits +
      opponentCredits(s, party) +
      (s.dareHand ? s.dareHand.potPlayer + s.dareHand.potDealer : 0);
    expect(live, `${label} ${where}: zero-sum`).toBe(playerAtOpen + opponentAtOpen);
  };

  let current = open(state, opponentId, wager).state;
  expect(current.dareHand, `${label}: the hand opened`).not.toBeNull();
  check(current, 'after open');

  for (let step = 0; step < 40 && current.dareHand; step += 1) {
    // The move is chosen through the ENGINE'S OWN legality accessor, never guessed
    // — at these purses a raise is frequently unaffordable, and a driver that
    // proposed one anyway would spin on typed refusals instead of playing a hand.
    const legal = legalDareMoves(current.dareHand, 'player', current.player.credits);
    const action: PlayerAction =
      current.dareHand.bid === null
        ? openingBid(current, 3, 2)
        : legal.includes('raise-quantity')
          ? {
              type: 'Dare',
              move: 'raise-quantity',
              quantity: current.dareHand.bid.quantity + 1,
              face: current.dareHand.bid.face,
            }
          : { type: 'Dare', move: 'challenge' };
    const result = applyPlayerAction(current, action);
    current = result.state;
    check(current, `after step ${step}`);
  }
  check(current, 'after settlement');
  expect(current.dareHand, `${label}: the hand settled`).toBeNull();
}

describe('T-146 · obligation 15 — removing the band clamp leaves the solvency clamp', () => {
  it('no wager can ever exceed either side’s actual credits, at any tier', () => {
    // Asymmetric purses in BOTH directions, because a clamp that only ever binds
    // on the player's side would pass a symmetric test and still mint credits.
    const cases: Array<{ label: string; player: number; opponent: number }> = [
      { label: 'player poorer', player: 400, opponent: 50_000 },
      { label: 'opponent poorer', player: 50_000, opponent: 400 },
      { label: 'both thin', player: 90, opponent: 90 },
    ];
    for (const c of cases) {
      for (let seed = 1; seed <= 6; seed += 1) {
        const roaming = ladderState(T5, seed, SUN_3, c.player);
        roaming.npcs.find((n) => n.id === DEALER)!.credits = c.opponent;
        assertSolventThroughout(roaming, DEALER, 10_000_000, `roaming ${c.label} seed ${seed}`);

        const roster = ladderState(T5, seed, SUN_3, c.player);
        roster.liarsDicePurses[SUN3_BAD] = c.opponent;
        assertSolventThroughout(roster, SUN3_BAD, 10_000_000, `roster ${c.label} seed ${seed}`);
      }
    }
  });

  it('the seed at tier 5 is exactly min(requested, both purses) — no band, no floor', () => {
    const state = ladderState(T5, 1, SUN_3, 777);
    state.npcs.find((n) => n.id === DEALER)!.credits = 3_000_000;
    const hand = open(state, DEALER, 10_000_000).state.dareHand!;
    expect(hand.seedWager).toBe(777);
    expect(hand.bandMax).toBeNull();
    // …and the player is not in debt for it.
    expect(open(state, DEALER, 10_000_000).state.player.credits).toBe(0);
  });

  it('tier 5 still beats tier 4’s ceiling — the unlock is not cosmetic', () => {
    const raised = wagerBandFor(SUN_3).max * LIARS_DICE_RAISED_CEILING_MULT;
    const capped = open(ladderState(T5 - 1), DEALER, raised * 4).state.dareHand!;
    const free = open(ladderState(T5), DEALER, raised * 4).state.dareHand!;
    expect(capped.seedWager).toBe(raised);
    expect(free.seedWager).toBe(raised * 4);
  });
});

// ---------------------------------------------------------------------------
// Obligation 16 · the tier is FROZEN AT OPEN
// ---------------------------------------------------------------------------

describe('T-146 · obligation 16 — a hand keeps the rules it was dealt under', () => {
  it('crossing every threshold mid-scene moves nothing about the open hand', () => {
    // Opened one hand short of rung 1, so the hand is a four-dice hand.
    let state = open(ladderState(T1 - 1)).state;
    const hand = state.dareHand!;
    expect(hand.dicePerSide).toBe(4);

    // THE EXPERIMENT: the odometer jumps past every rung while the hand stands.
    // This is the one place in this file that writes state mid-hand, and it is
    // the point of the test rather than a shortcut around the loop.
    state.player.liarsDiceGamesPlayed = 1_000;

    expect(state.dareHand!.dicePerSide).toBe(4);
    expect(state.dareHand!.maxQuantity).toBe(8);
    expect(state.dareHand!.bandMax).toBe(wagerBandFor(SUN_3).max);
    expect(state.dareHand!.playerDice).toHaveLength(4);
    expect(headroomFor(state.dareHand!, 'player')).toBe(
      wagerBandFor(SUN_3).max - state.dareHand!.potPlayer,
    );

    // No VALIDATION site reads a live tier either (§4.6): a claim of nine is still
    // off this hand's lattice, even though the player is now a 1,000-game veteran
    // whose next hand will allow twelve.
    const refused = applyPlayerAction(state, {
      type: 'Dare',
      move: 'bid',
      quantity: 9,
      face: 3,
    });
    expect(refused.events[0]).toMatchObject({ failReason: 'illegal-dare-move' });
    expect(refused.state.dareHand!.bid).toBeNull();

    // …and the frozen fields survive a SAVE/RELOAD mid-hand unchanged, which is
    // the other half of "a reload must not move the rules of a hand in progress".
    const restored = loadSave(createSave(state, 1)).state;
    expect(restored.dareHand!.dicePerSide).toBe(4);
    expect(restored.dareHand!.maxQuantity).toBe(8);
    expect(restored.dareHand!.bandMax).toBe(wagerBandFor(SUN_3).max);
    expect(restored.player.liarsDiceGamesPlayed).toBe(1_000);

    // The NEXT hand, opened after this one settles, is a six-dice hand — proving
    // the freeze is a freeze and not a failure to read the ladder at all.
    state = applyPlayerAction(state, { type: 'Dare', move: 'fold' }).state;
    expect(state.dareHand).toBeNull();
    const next = open(state, DEALER, 100, 1).state.dareHand!;
    expect(next.dicePerSide).toBe(6);
    expect(next.maxQuantity).toBe(12);
  });

  it('a settlement that crosses a threshold does not retro-fit the hand it settled', () => {
    // The 5th hand is played entirely at tier 0 even though its own settlement is
    // what makes tier 1 live — §4.1's pinned off-by-one, driven rather than argued.
    const state = ladderState(T1 - 1);
    const opened = open(state).state;
    expect(opened.dareHand!.dicePerSide).toBe(4);
    const settled = applyPlayerAction(opened, { type: 'Dare', move: 'fold' }).state;
    expect(settled.player.liarsDiceGamesPlayed).toBe(T1);
    expect(liarsDiceTier(settled.player.liarsDiceGamesPlayed)).toBe(1);
    // The 6th hand is the first five-dice hand.
    expect(open(settled, DEALER, 100, 1).state.dareHand!.dicePerSide).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Obligation 27 · the odometer, at every outcome
// ---------------------------------------------------------------------------

describe('T-146 · obligation 27 — exactly one increment per SETTLED hand', () => {
  it('player-fold counts', () => {
    const opened = open(ladderState(0)).state;
    const settled = applyPlayerAction(opened, { type: 'Dare', move: 'fold' });
    expect(resolvedOf(settled.events)!.outcome).toBe('player-fold');
    expect(settled.state.player.liarsDiceGamesPlayed).toBe(1);
  });

  it('the dusk timeout-fold counts — day.ts inherits the increment, it does not restate it', () => {
    const opened = open(ladderState(0)).state;
    const dusk = endDay(opened);
    expect(resolvedOf(dusk.events)!.outcome).toBe('timeout-fold');
    expect(dusk.state.dareHand).toBeNull();
    expect(dusk.state.player.liarsDiceGamesPlayed).toBe(1);
  });

  it('both challenge arms count, and each exactly once', () => {
    const seen = new Set<DareOutcome>();
    for (let seed = 1; seed <= 40; seed += 1) {
      let state = open(ladderState(0, seed)).state;
      for (let step = 0; step < 24 && state.dareHand; step += 1) {
        const action: PlayerAction =
          state.dareHand.bid === null
            ? openingBid(state, 3, 2)
            : { type: 'Dare', move: 'challenge' };
        const result = applyPlayerAction(state, action);
        const resolved = resolvedOf(result.events);
        state = result.state;
        if (resolved) seen.add(resolved.outcome);
      }
      expect(state.player.liarsDiceGamesPlayed, `seed ${seed}`).toBe(1);
    }
    expect(seen).toContain('challenge-win');
    expect(seen).toContain('challenge-loss');
  });

  it('dealer-fold counts too', () => {
    // Mira-9 seat 1 is the authored `random` seat — the only archetype that folds
    // at a meaningful rate, and the same source `liarsDice.test.ts` uses.
    let folds = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      let state = open(ladderState(0, seed, MIRA_9), MIRA9_RANDOM).state;
      let outcome: DareOutcome | null = null;
      for (let step = 0; step < 24 && state.dareHand; step += 1) {
        const action: PlayerAction =
          state.dareHand.bid === null
            ? openingBid(state, 3, 2)
            : { type: 'Dare', move: 'challenge' };
        const result = applyPlayerAction(state, action);
        outcome = resolvedOf(result.events)?.outcome ?? outcome;
        state = result.state;
      }
      expect(state.player.liarsDiceGamesPlayed, `seed ${seed}`).toBe(1);
      if (outcome === 'dealer-fold') folds += 1;
    }
    expect(folds).toBeGreaterThan(0);
  });

  it('a REFUSED move increments nothing — all three typed refusals', () => {
    // no-dare-hand: there is no hand at all.
    const noHand = applyPlayerAction(ladderState(7), { type: 'Dare', move: 'challenge' });
    expect(noHand.events[0]).toMatchObject({ failReason: 'no-dare-hand' });
    expect(noHand.state.player.liarsDiceGamesPlayed).toBe(7);

    // illegal-dare-move: a claim off this hand's lattice.
    const opened = open(ladderState(7)).state;
    expect(opened.player.liarsDiceGamesPlayed).toBe(7);
    const illegal = applyPlayerAction(opened, {
      type: 'Dare',
      move: 'bid',
      quantity: 99,
      face: 3,
    });
    expect(illegal.events[0]).toMatchObject({ failReason: 'illegal-dare-move' });
    expect(illegal.state.player.liarsDiceGamesPlayed).toBe(7);
    expect(illegal.state.dareHand).not.toBeNull();

    // opponent-broke: the sit-down itself is refused before a hand exists.
    const broke = ladderState(7);
    broke.liarsDicePurses[SUN3_BAD] = 0;
    const refused = open(broke, SUN3_BAD);
    expect(refused.events.some((e) => 'failReason' in e && e.failReason === 'opponent-broke')).toBe(
      true,
    );
    expect(refused.state.player.liarsDiceGamesPlayed).toBe(7);
    expect(refused.state.dareHand).toBeNull();
  });

  it('the counter is GLOBAL across both pools — the ladder is not gated on the roster', () => {
    // A player who never sits at the house's own table still unlocks, and one who
    // only ever sits there unlocks at the same rate. That decoupling is what keeps
    // the ladder off the 42-opponent bottleneck.
    let roaming = ladderState(0);
    let roster = ladderState(0);
    for (let hand = 0; hand < 3; hand += 1) {
      roaming = applyPlayerAction(open(roaming, DEALER, 100, hand).state, {
        type: 'Dare',
        move: 'fold',
      }).state;
      roster = applyPlayerAction(open(roster, SUN3_BAD, 100, hand).state, {
        type: 'Dare',
        move: 'fold',
      }).state;
    }
    expect(roaming.player.liarsDiceGamesPlayed).toBe(3);
    expect(roster.player.liarsDiceGamesPlayed).toBe(3);
  });

  it('drives the odometer across a real rung through the loop alone', () => {
    // No fixture write at all: five folded hands take the captain from four dice
    // to five, which is the ladder working end to end.
    let state = ladderState(0, 3, SUN_3, 200_000, [10, 10, 10, 10, 10]);
    for (let hand = 0; hand < 5; hand += 1) {
      const opened = open(state, DEALER, 100, hand).state;
      expect(opened.dareHand!.dicePerSide, `hand ${hand}`).toBe(4);
      state = applyPlayerAction(opened, { type: 'Dare', move: 'fold' }).state;
    }
    expect(state.player.liarsDiceGamesPlayed).toBe(T1);
    // The dawn hand is spent, so the sixth hand needs a fresh day's dice.
    state.player.dawnHand = {
      dice: [10, 10, 10, 10, 10],
      spent: [false, false, false, false, false],
    };
    expect(open(state).state.dareHand!.dicePerSide).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Obligation 28 · the save round trip, at several tiers, at the SAME version
// ---------------------------------------------------------------------------

describe('T-146 · obligation 28 — the odometer round-trips without a version move', () => {
  it('CURRENT_SAVE_VERSION does NOT move — the field shipped with T-145', () => {
    // §5.6 Ruling A. Pinned HERE, beside the reason, so a future accidental bump
    // fails loudly in the task that must not make one. T-146 adds one OPTIONAL key
    // to an existing event variant, which `docs/VERSIONING.md` §2 states is not a
    // schema change.
    expect(CURRENT_SAVE_VERSION).toBe(15);
    expect(MIGRATIONS[15]).toBeUndefined();
  });

  it('survives createSave/loadSave exactly, at every tier and between them', () => {
    for (const games of [0, T1 - 1, T1, T2, T3, T4, T5 - 1, T5, 500]) {
      const state = ladderState(games);
      const restored = loadSave(createSave(state, 1)).state;
      expect(restored.player.liarsDiceGamesPlayed, `${games} games`).toBe(games);
      // …and the tier the reloaded save plays at is the tier it went in with.
      expect(liarsDiceTier(restored.player.liarsDiceGamesPlayed)).toBe(liarsDiceTier(games));
    }
  });

  it('a v14 fixture missing the key still backfills to 0 — T-146 disturbed nothing', () => {
    // NOT a duplicate of T-145's migration suite: this asserts only that the
    // ladder's reader did not break the backfill it depends on.
    const raw = JSON.parse(JSON.stringify(createInitialState(9))) as Record<string, unknown>;
    delete (raw.player as Record<string, unknown>).liarsDiceGamesPlayed;
    const migrated = MIGRATIONS[14](raw) as { player: { liarsDiceGamesPlayed: number } };
    expect(migrated.player.liarsDiceGamesPlayed).toBe(0);
    expect(liarsDiceTier(migrated.player.liarsDiceGamesPlayed)).toBe(0);
  });
});
