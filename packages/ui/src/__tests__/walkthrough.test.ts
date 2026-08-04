import { describe, expect, it } from 'vitest';
import { createInitialState, startDay, type GameEvent, type GameState } from '@spacerquest/engine';
import { ONBOARDING_PROMPTS } from '../format';
import {
  ackWalkthroughStep,
  armedWalkthrough,
  currentWalkthroughStep,
  nextWalkthroughFlags,
  parseWalkthrough,
  railsAllows,
  railsHighlights,
  railsSuspended,
  serializeWalkthrough,
  settleWalkthrough,
  WALKTHROUGH_STEPS,
  WALKTHROUGH_STEP_COUNT,
  walkthroughActive,
  walkthroughCardCopy,
  walkthroughJumpTarget,
  walkthroughStepDone,
  type RailsRegion,
  type WalkthroughRecord,
} from '../walkthrough';

// ---------------------------------------------------------------------------
// T-187 · THE FIRST-TURN WALKTHROUGH — the pure rules.
//
// Everything under test here is presentation logic with no engine rule in it, so
// it is unit-testable without a DOM. The e2e (`e2e/walkthrough.spec.ts`) drives
// the same seven steps through the real cockpit; this file guards the two things
// a click-through cannot cheaply prove: that the step pointer is MONOTONE (it can
// never walk backwards when the engine nulls a field), and that the rails are
// TOTAL (there is no state in which every region is closed and the player is
// trapped).
// ---------------------------------------------------------------------------

const REGIONS: readonly RailsRegion[] = [
  'hand',
  'manifest',
  'starmap',
  'explore',
  'trade',
  'fuel',
  'ship',
  'hangout',
  'wire',
  'chrome',
];

function freshGame(seed = 424242): GameState {
  return startDay(createInitialState(seed)).state;
}

/** An active record with a chosen set of signals already landed. */
function recordAt(
  acked: WalkthroughRecord['acked'],
  flags: WalkthroughRecord['flags'],
): WalkthroughRecord {
  return { v: 1, status: 'active', acked, flags };
}

/** Walk the record forward to the step with this id by landing every prior
 *  step's signal — the honest way to reach a step, never by hand-setting one. */
function advanceTo(id: string): WalkthroughRecord {
  const acked: WalkthroughRecord['acked'] = {};
  const flags: WalkthroughRecord['flags'] = {};
  for (const step of WALKTHROUGH_STEPS) {
    if (step.id === id) break;
    if (step.ack) acked[step.id] = true;
    else if (step.flag) flags[step.flag] = true;
  }
  return recordAt(acked, flags);
}

describe('T-187 · the script', () => {
  it('is exactly seven steps, in the owner’s stated order, each with a what AND a why', () => {
    expect(WALKTHROUGH_STEPS).toHaveLength(WALKTHROUGH_STEP_COUNT);
    expect(WALKTHROUGH_STEPS.map((s) => s.id)).toEqual([
      'w1-dawn-hand',
      'w2-assign-die',
      'w3-take-contract',
      'w4-make-the-jump',
      'w5-collect-payout',
      'w6-explore',
      'w7-liars-dice',
    ]);
    WALKTHROUGH_STEPS.forEach((step, i) => {
      expect(step.index).toBe(i + 1);
      // The Accept: a popup "naming what to do AND why".
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.what.length).toBeGreaterThan(0);
      expect(step.why.length).toBeGreaterThan(0);
      // Every action step carries a one-shot flag; every ack step does not.
      if (step.ack) expect(step.flag).toBeUndefined();
      else expect(step.flag).toBeDefined();
    });
  });

  it('does not collide with T-311’s contextual coach registry', () => {
    const promptIds = new Set(ONBOARDING_PROMPTS.map((p) => p.id));
    for (const step of WALKTHROUGH_STEPS) expect(promptIds.has(step.id)).toBe(false);
  });
});

describe('T-187 · the step pointer', () => {
  it('advances 1 → 7 as each signal lands, then finishes', () => {
    let r = armedWalkthrough();
    expect(currentWalkthroughStep(r)?.id).toBe('w1-dawn-hand');

    r = ackWalkthroughStep(r);
    expect(currentWalkthroughStep(r)?.id).toBe('w2-assign-die');

    r = { ...r, flags: { ...r.flags, dieAssigned: true } };
    expect(currentWalkthroughStep(r)?.id).toBe('w3-take-contract');

    r = { ...r, flags: { ...r.flags, signed: true } };
    expect(currentWalkthroughStep(r)?.id).toBe('w4-make-the-jump');

    r = { ...r, flags: { ...r.flags, jumped: true, delivered: true } };
    expect(currentWalkthroughStep(r)?.id).toBe('w5-collect-payout');

    r = ackWalkthroughStep(r);
    expect(currentWalkthroughStep(r)?.id).toBe('w6-explore');

    r = settleWalkthrough({ ...r, flags: { ...r.flags, explored: true } });
    expect(currentWalkthroughStep(r)?.id).toBe('w7-liars-dice');
    expect(r.status).toBe('active');

    r = settleWalkthrough({ ...r, flags: { ...r.flags, dareResolved: true } });
    expect(currentWalkthroughStep(r)).toBeNull();
    expect(r.status).toBe('done');
    expect(walkthroughActive(r)).toBe(false);
  });

  it('NEVER regresses to step 3 once the delivery nulls the contract (the trap)', () => {
    // THE BUG THIS GUARDS. Deriving "signed" from `player.activeContract != null`
    // would send the pointer back to step 3 the instant the cargo is delivered,
    // because the engine nulls the contract on arrival. The signals are one-shot
    // flags precisely so this cannot happen.
    const game = freshGame();
    game.player.activeContract = null;
    const r = advanceTo('w5-collect-payout');
    expect(game.player.activeContract).toBeNull();
    expect(currentWalkthroughStep(r)?.id).toBe('w5-collect-payout');
    const after = ackWalkthroughStep(r);
    expect(currentWalkthroughStep(after)?.id).toBe('w6-explore');
    // and never at any point back at w3.
    expect(walkthroughStepDone(r, WALKTHROUGH_STEPS[2])).toBe(true);
  });

  it('ack is a no-op on an action step', () => {
    const r = advanceTo('w3-take-contract');
    expect(ackWalkthroughStep(r)).toBe(r);
  });
});

describe('T-187 · folding the engine’s typed events into the flags', () => {
  const base = () => armedWalkthrough();

  it('returns the SAME reference when nothing relevant landed', () => {
    const r = base();
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'x',
        action: 'buy-fuel',
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(events, r)).toBe(r);
    expect(nextWalkthroughFlags([], r)).toBe(r);
  });

  it('does nothing at all when the walkthrough is not running', () => {
    const r: WalkthroughRecord = { v: 1, status: 'skipped', acked: {}, flags: {} };
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'x',
        action: 'sign-contract',
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(events, r)).toBe(r);
  });

  it('sets `signed` from a successful sign-contract', () => {
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'x',
        action: 'sign-contract',
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(events, base()).flags.signed).toBe(true);
  });

  it('ignores a REFUSED sign-contract', () => {
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'x',
        action: 'sign-contract',
        success: false,
      },
    ];
    const r = base();
    expect(nextWalkthroughFlags(events, r)).toBe(r);
    expect(nextWalkthroughFlags(events, r).flags.signed).toBeUndefined();
  });

  it('sets `jumped` from the PLAYER’s successful travel only', () => {
    const mine: GameEvent[] = [
      {
        type: 'TravelEvent',
        characterId: 'player',
        origin: 1,
        destination: 9,
        fuelUsed: 40,
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(mine, base()).flags.jumped).toBe(true);

    const failed: GameEvent[] = [
      {
        type: 'TravelEvent',
        characterId: 'player',
        origin: 1,
        destination: 9,
        fuelUsed: 40,
        success: false,
      },
    ];
    expect(nextWalkthroughFlags(failed, base()).flags.jumped).toBeUndefined();

    const npc: GameEvent[] = [
      {
        type: 'TravelEvent',
        characterId: 'npc-iron-vex',
        origin: 1,
        destination: 9,
        fuelUsed: 40,
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(npc, base()).flags.jumped).toBeUndefined();
  });

  it('sets `delivered` AND captures the payout from deliver-cargo', () => {
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'delivered',
        action: 'deliver-cargo',
        success: true,
        payment: 2500,
      },
    ];
    const next = nextWalkthroughFlags(events, base());
    expect(next.flags.delivered).toBe(true);
    expect(next.lastPayment).toBe(2500);
  });

  it('sets `explored` from a discovery OR from a failed nav check, but not from a refusal', () => {
    const found: GameEvent[] = [
      { type: 'PoiDiscovered', day: 1, poiId: 'p', poiType: 'derelict', systemId: 1, name: 'Hulk' },
    ];
    expect(nextWalkthroughFlags(found, base()).flags.explored).toBe(true);

    // A failed nav check STILL spent the die and the fuel — the verb was used.
    const missed: GameEvent[] = [
      { type: 'ExplorationFailed', day: 1, systemId: 1, reason: 'nav-check' },
    ];
    expect(nextWalkthroughFlags(missed, base()).flags.explored).toBe(true);

    // A refusal cost nothing and taught nothing.
    for (const reason of ['no-die', 'insufficient-fuel'] as const) {
      const refused: GameEvent[] = [{ type: 'ExplorationFailed', day: 1, systemId: 1, reason }];
      expect(nextWalkthroughFlags(refused, base()).flags.explored).toBeUndefined();
    }
  });

  it('sets `dareResolved` from DareHandResolved', () => {
    const events: GameEvent[] = [
      {
        type: 'DareHandResolved',
        day: 1,
        handId: 'h1',
        opponentId: 'npc-iron-vex',
        outcome: 'challenge-win',
        bid: null,
        playerDice: [1, 2, 3, 4],
        creditsDelta: 200,
        dispositionDelta: 0,
      },
    ];
    expect(nextWalkthroughFlags(events, base()).flags.dareResolved).toBe(true);
  });

  it('never clears a flag that already landed', () => {
    const r = recordAt({}, { signed: true });
    const events: GameEvent[] = [
      {
        type: 'TradeEvent',
        characterId: 'player',
        actionDetails: 'x',
        action: 'sign-contract',
        success: true,
      },
    ];
    expect(nextWalkthroughFlags(events, r)).toBe(r);
  });
});

describe('T-187 · the rails', () => {
  const game = freshGame();
  const ctx = { game };

  it('opens `hand` and `chrome` on every step — the player is never trapped', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const r = advanceTo(step.id);
      expect(railsAllows(r, ctx, 'hand')).toBe(true);
      expect(railsAllows(r, ctx, 'chrome')).toBe(true);
    }
  });

  it('closes the shipyard on every step', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const r = advanceTo(step.id);
      expect(railsAllows(r, ctx, 'ship')).toBe(false);
    }
  });

  it('opens `manifest` only on step 3, `explore` only on 6, `hangout` only on 7', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const r = advanceTo(step.id);
      expect(railsAllows(r, ctx, 'manifest')).toBe(step.id === 'w3-take-contract');
      expect(railsAllows(r, ctx, 'explore')).toBe(step.id === 'w6-explore');
      expect(railsAllows(r, ctx, 'hangout')).toBe(step.id === 'w7-liars-dice');
    }
  });

  it('opens `fuel` on steps 4 and 6 — the depot the scripted run genuinely needs', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const r = advanceTo(step.id);
      expect(railsAllows(r, ctx, 'fuel')).toBe(
        step.id === 'w4-make-the-jump' || step.id === 'w6-explore',
      );
    }
  });

  it('never opens the trade ledger or the wire', () => {
    for (const step of WALKTHROUGH_STEPS) {
      const r = advanceTo(step.id);
      expect(railsAllows(r, ctx, 'trade')).toBe(false);
      expect(railsAllows(r, ctx, 'wire')).toBe(false);
    }
  });

  it('highlights the region the current step is asking for', () => {
    expect(railsHighlights(advanceTo('w1-dawn-hand'), ctx, 'hand')).toBe(true);
    expect(railsHighlights(advanceTo('w3-take-contract'), ctx, 'manifest')).toBe(true);
    expect(railsHighlights(advanceTo('w3-take-contract'), ctx, 'ship')).toBe(false);
    expect(railsHighlights(advanceTo('w7-liars-dice'), ctx, 'hangout')).toBe(true);
  });
});

describe('T-187 · the dead-end escapes', () => {
  it('step 7 at a rim port (no Hangout) opens the starmap and the depot', () => {
    const game = freshGame();
    game.player.currentSystemId = 15; // Antares-5 — a rim port, no Hangout
    const r = advanceTo('w7-liars-dice');
    expect(railsAllows(r, { game }, 'starmap')).toBe(true);
    expect(railsAllows(r, { game }, 'fuel')).toBe(true);
    // and the card says why, rather than pointing at a switch that is not there.
    const copy = walkthroughCardCopy(r, WALKTHROUGH_STEPS[6], game);
    expect(copy.what).toContain('no Hangout');
  });

  it('step 6 with a tank that cannot pay for the sweep opens the depot', () => {
    const game = freshGame();
    game.player.ship.fuel = 0;
    const r = advanceTo('w6-explore');
    expect(railsAllows(r, { game }, 'fuel')).toBe(true);
    expect(walkthroughCardCopy(r, WALKTHROUGH_STEPS[5], game).what).toContain('depot');
  });

  it('step 6 with a salvage op pinning the ship opens the starmap instead', () => {
    const game = freshGame();
    game.player.recovery = {
      poiId: 'p',
      systemId: game.player.currentSystemId,
      outcomeId: 'salvage.deep',
      startedDay: game.day,
      dueDay: game.day + 2,
    };
    const r = advanceTo('w6-explore');
    expect(railsAllows(r, { game }, 'starmap')).toBe(true);
    expect(walkthroughCardCopy(r, WALKTHROUGH_STEPS[5], game).what).toContain('salvage');
  });
});

describe('T-187 · the rails stand down whenever the ENGINE has taken over', () => {
  const cases: { name: string; ctx: () => { game: GameState } & Record<string, unknown> }[] = [
    {
      name: 'a live encounter',
      ctx: () => {
        const game = freshGame();
        game.encounter = { id: 'e1' } as unknown as GameState['encounter'];
        return { game };
      },
    },
    {
      name: 'a hand at the tables',
      ctx: () => {
        const game = freshGame();
        game.dareHand = { handId: 'h1' } as unknown as GameState['dareHand'];
        return { game };
      },
    },
    { name: 'a combat aftermath', ctx: () => ({ game: freshGame(), combatAftermath: {} }) },
    { name: 'a succession', ctx: () => ({ game: freshGame(), succession: {} }) },
    { name: 'a patrol scan', ctx: () => ({ game: freshGame(), patrolScan: {} }) },
  ];

  for (const { name, ctx } of cases) {
    it(`suspends for ${name}, and every region is then open`, () => {
      const context = ctx();
      expect(railsSuspended(context)).toBe(true);
      const r = advanceTo('w4-make-the-jump');
      for (const region of REGIONS) expect(railsAllows(r, context, region)).toBe(true);
      // …and the card hides (the component's own guard reads the same predicate).
      expect(railsHighlights(r, context, 'starmap')).toBe(false);
    });
  }

  it('does NOT suspend on an ordinary cockpit', () => {
    expect(railsSuspended({ game: freshGame() })).toBe(false);
  });
});

describe('T-187 · a walkthrough that is not running constrains nothing', () => {
  for (const status of ['off', 'done', 'skipped'] as const) {
    it(`status "${status}" opens every region`, () => {
      const game = freshGame();
      const r: WalkthroughRecord = { v: 1, status, acked: {}, flags: {} };
      expect(walkthroughActive(r)).toBe(false);
      for (const region of REGIONS) expect(railsAllows(r, { game }, region)).toBe(true);
      expect(railsHighlights(r, { game }, 'manifest')).toBe(false);
      expect(walkthroughJumpTarget(r, game)).toBeNull();
    });
  }
});

describe('T-187 · the step-4 destination lock', () => {
  it('pins the hold’s own destination on step 4 and nothing anywhere else', () => {
    const game = freshGame();
    game.player.activeContract = { ...game.market.manifestBoard[0] };
    const at4 = advanceTo('w4-make-the-jump');
    expect(walkthroughJumpTarget(at4, game)).toBe(game.player.activeContract.destination);
    expect(walkthroughJumpTarget(advanceTo('w3-take-contract'), game)).toBeNull();
    expect(walkthroughJumpTarget(advanceTo('w6-explore'), game)).toBeNull();
  });

  it('is null with an empty hold — no lock, rather than a lock on nothing', () => {
    const game = freshGame();
    game.player.activeContract = null;
    expect(walkthroughJumpTarget(advanceTo('w4-make-the-jump'), game)).toBeNull();
  });
});

describe('T-187 · persistence is total over any input', () => {
  const OFF: WalkthroughRecord = { v: 1, status: 'off', acked: {}, flags: {} };

  it('degrades every malformed value to the `off` default without throwing', () => {
    for (const raw of [
      null,
      undefined,
      '',
      '{',
      '[]',
      'null',
      '"x"',
      '{"v":99}',
      '{"v":1}',
      '{"v":1,"status":"nope"}',
    ]) {
      expect(parseWalkthrough(raw as string | null)).toEqual(OFF);
    }
  });

  it('round-trips a real record', () => {
    const r: WalkthroughRecord = {
      v: 1,
      status: 'active',
      acked: { 'w1-dawn-hand': true },
      flags: { dieAssigned: true, signed: true },
      lastPayment: 2500,
    };
    expect(parseWalkthrough(serializeWalkthrough(r))).toEqual(r);
  });

  it('drops a non-numeric lastPayment rather than trusting it', () => {
    const parsed = parseWalkthrough(
      '{"v":1,"status":"active","acked":{},"flags":{},"lastPayment":"lots"}',
    );
    expect(parsed.lastPayment).toBeUndefined();
    expect(parsed.status).toBe('active');
  });
});

describe('T-187 · the card copy', () => {
  it('names the real payout on step 5 once the engine has paid one', () => {
    const game = freshGame();
    const r: WalkthroughRecord = { ...advanceTo('w5-collect-payout'), lastPayment: 2500 };
    const copy = walkthroughCardCopy(r, WALKTHROUGH_STEPS[4], game);
    expect(copy.what).toContain('2,500');
  });

  it('falls back to the static line when no payout was recorded', () => {
    const game = freshGame();
    const r = advanceTo('w5-collect-payout');
    expect(walkthroughCardCopy(r, WALKTHROUGH_STEPS[4], game).what).toBe(WALKTHROUGH_STEPS[4].what);
  });
});
