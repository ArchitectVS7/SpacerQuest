import { describe, it, expect } from 'vitest';
import { distance, NPC_PROFILES, STAR_SYSTEMS } from '@spacerquest/content';
import { createInitialState } from '../state.js';
import { advanceDay } from '../day.js';
import { resolveTrade } from '../actions/trade.js';
import { resolveCombat, RUN_FUEL_COST, FIGHT_FUEL_COST } from '../actions/combat.js';
import { resolveNpcDay } from '../npc.js';
import { rollDawnHand } from '../dice.js';
import { SeededRng } from '../rng.js';
import { EncounterState, NpcState } from '../types.js';

describe('Debt is a ledger, not a negative balance', () => {
  it('starts the player with pocket money and a separate Guild debt', () => {
    const state = createInitialState(1);
    expect(state.player.credits).toBeGreaterThan(0);
    expect(state.player.debt).toBe(25000);
    expect(state.player.debtDueDay).toBe(30);
  });

  it('pay-debt moves credits to the ledger without costing a die', () => {
    const state = createInitialState(1);
    state.player.credits = 5000;

    const { state: next, events } = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'pay-debt',
        amount: 3000,
      },
      new SeededRng(1),
    );

    expect(next.player.credits).toBe(2000);
    expect(next.player.debt).toBe(22000);
    expect(events).toContainEqual({
      type: 'DebtPayment',
      characterId: 'player',
      amount: 3000,
      remaining: 22000,
    });
  });

  it('clamps overpayment to what the player has and what is owed', () => {
    const state = createInitialState(1);
    state.player.credits = 500;

    const { state: next } = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'pay-debt',
        amount: 99999,
      },
      new SeededRng(1),
    );

    expect(next.player.credits).toBe(0);
    expect(next.player.debt).toBe(24500);
  });

  it('emits DebtDue when the marker is called with debt outstanding', () => {
    const state = createInitialState(7);
    state.player.debtDueDay = 1; // due today

    const { events } = advanceDay(state, []);
    expect(events).toContainEqual({ type: 'DebtDue', day: 1, outstanding: 25000 });
  });
});

describe('Combat fuel gates (no free volleys, no free getaways)', () => {
  function fixtureEncounter(): EncounterState {
    return {
      id: 'enc-fuel',
      pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
      interceptor: {
        id: 'anon-pirate-1',
        source: 'anonymous',
        name: 'K)(akj',
        shipName: 'K1++++',
        shipClass: 'Maligna Bat',
        homeSystem: 'Pollux-7',
        kind: 'PIRATE',
        rosterIndex: 1,
        stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
        tier: 1,
      },
      routeDangerLevel: 1,
      routeDangerChance: 0.08,
      encounterRoll: 0.01,
      round: 1,
      enemyHull: 1,
    };
  }

  function combatState(fuel: number) {
    const state = createInitialState(9);
    state.player.ship.fuel = fuel;
    state.player.dawnHand = rollDawnHand(new SeededRng(9), 5);
    state.encounter = fixtureEncounter();
    return state;
  }

  it('fight with dry tanks is a weapons malfunction: no check, no fuel lied about', () => {
    const state = combatState(FIGHT_FUEL_COST - 1);
    const { state: next, events } = resolveCombat(
      state,
      {
        type: 'Combat',
        stance: 'fight',
        targetId: state.encounter!.interceptor.id,
        spendDie: 0,
      },
      new SeededRng(9),
    );

    expect(next.player.ship.fuel).toBe(FIGHT_FUEL_COST - 1); // untouched
    const combat = events.find((e) => e.type === 'CombatEvent');
    expect(combat).toMatchObject({ fuelUsed: 0, success: false, insufficientFuel: true });
    expect(events.some((e) => e.type === 'StatCheck' && e.actor === 'Player')).toBe(false);
    expect(events.some((e) => e.type === 'EnemyCounterAction')).toBe(true);
  });

  it('running on fumes fails automatically — escape is never free', () => {
    const state = combatState(RUN_FUEL_COST - 1);
    const { state: next, events } = resolveCombat(
      state,
      {
        type: 'Combat',
        stance: 'run',
        targetId: state.encounter!.interceptor.id,
        spendDie: 0,
      },
      new SeededRng(9),
    );

    expect(next.player.ship.fuel).toBe(RUN_FUEL_COST - 1);
    const combat = events.find((e) => e.type === 'CombatEvent');
    expect(combat).toMatchObject({ fuelUsed: 0, success: false, insufficientFuel: true });
    expect(events.some((e) => e.type === 'StatCheck' && e.actor === 'Player')).toBe(false);
    expect(events.some((e) => e.type === 'EnemyCounterAction')).toBe(true);
  });
});

describe('Contracts', () => {
  function marketState() {
    const state = createInitialState(3);
    state.player.dawnHand = rollDawnHand(new SeededRng(3), 5);
    state.market.manifestBoard = [
      { destination: 5, cargoType: 4, payment: 3000, pods: 10 },
      { destination: 9, cargoType: 2, payment: 2000, pods: 10 },
    ];
    return state;
  }

  it('signing costs a die and takes the contract off the board', () => {
    const state = marketState();
    const { state: next } = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: 0,
        spendDie: 2,
      },
      new SeededRng(3),
    );

    expect(next.player.activeContract?.destination).toBe(5);
    expect(next.market.manifestBoard).toHaveLength(1);
    expect(next.player.dawnHand?.spent[2]).toBe(true);
  });

  it('refuses a second contract while one is active', () => {
    const state = marketState();
    state.player.activeContract = { destination: 5, cargoType: 4, payment: 3000, pods: 10 };

    const { state: next, events } = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'sign-contract',
        contractIndex: 1,
        spendDie: 0,
      },
      new SeededRng(3),
    );

    expect(next.player.activeContract?.destination).toBe(5); // unchanged
    expect(next.market.manifestBoard).toHaveLength(2); // nothing taken
    expect(next.player.dawnHand?.spent[0]).toBe(false); // die not wasted
    expect(
      events.some((e) => e.type === 'TradeEvent' && e.actionDetails.includes('Cannot sign')),
    ).toBe(true);
  });

  it("haggle uses the player's actual TRADE stat and is once per contract", () => {
    const state = marketState();
    state.player.stats.TRADE = 3;

    const first = resolveTrade(
      state,
      {
        type: 'Trade',
        action: 'haggle',
        contractIndex: 0,
        spendDie: 0,
      },
      new SeededRng(3),
    );

    const statCheck = first.events.find((e) => e.type === 'StatCheck');
    expect(statCheck && statCheck.type === 'StatCheck' && statCheck.result.modifier).toBe(3);
    expect(first.state.market.manifestBoard[0].haggled).toBe(true);

    const second = resolveTrade(
      first.state,
      {
        type: 'Trade',
        action: 'haggle',
        contractIndex: 0,
        spendDie: 1,
      },
      new SeededRng(3),
    );
    expect(
      second.events.some(
        (e) => e.type === 'TradeEvent' && e.actionDetails.includes('not renegotiate'),
      ),
    ).toBe(true);
    expect(second.state.player.dawnHand?.spent[1]).toBe(false); // die not wasted
  });
});

describe('Flaws trigger only when touched (PRD §6)', () => {
  function npcFor(profileId: string): NpcState {
    const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
    return {
      id: profile.id,
      name: profile.name,
      profileId: profile.id,
      currentSystemId: 1,
      credits: 5000,
      fuel: 1000,
      disposition: 0,
    };
  }

  it('Iron Vex (Bloodthirsty, combat-facing) risks his flaw most days; the check uses HIS flawDc', () => {
    const profile = NPC_PROFILES.find((p) => p.id === 'npc-iron-vex')!;
    let flawCheckDays = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const { npc, events } = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(seed), {
        day: 1,
        claimableBoard: null,
        eraEvent: null,
      });
      const flawCheck = events.find((e) => e.type === 'FlawCheck');
      if (flawCheck?.type === 'FlawCheck') {
        flawCheckDays += 1;
        expect(flawCheck.dc).toBe(profile.flawDc);
        if (!flawCheck.resisted) {
          expect(npc.lastAction?.type).toBe('FlawOverride');
        } else {
          expect(npc.lastAction?.type).not.toBe('FlawOverride');
        }
      } else {
        // No check means the day's intent never touched Bloodthirsty
        // (Combat/Patrol) — so the flaw cannot have chosen the day.
        expect(npc.lastAction?.type).not.toBe('FlawOverride');
      }
    }
    // Dominance + GUNS 4 keeps him on Combat/Patrol the vast majority of
    // days — the flaw stays a constant presence, not a rare edge.
    expect(flawCheckDays / 200).toBeGreaterThan(0.7);
  });

  it('Stellar Monk (Pacifist) never faces his flaw while trading and travelling', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { npc, events } = resolveNpcDay(npcFor('npc-stellar-monk'), new SeededRng(seed), {
        day: 1,
        claimableBoard: null,
        eraEvent: null,
      });
      // His intents (Trade/Travel/Socialize) never touch Pacifist (Combat/Patrol)
      expect(events.some((e) => e.type === 'FlawCheck')).toBe(false);
      expect(npc.lastAction?.type).not.toBe('FlawOverride');
    }
  });
});

describe('Local fuel price comes from canon tables', () => {
  it('prices Sun-3 at 8 credits per unit (SP.LIFT.S: sp=1 fh=8)', () => {
    const state = createInitialState(11);
    state.player.currentSystemId = 1; // Sun-3
    const { state: next } = advanceDay(state, []);
    expect(next.market.localFuelPrice).toBe(8);
  });
});

describe('Starmap distance', () => {
  it('T-1101: the degenerate same-line layout is replaced by real 2D coordinates', () => {
    // The shipped layout put every core/rim system on y=0 at x=id-1, so distance
    // collapsed into |id difference|. T-1101 authors genuine 2D coordinates
    // (PRD §9 geography): Sun-3 stays at the origin, but Vega-6 no longer sits on
    // the x-axis, and distance(1,14) now reflects Math.hypot — NOT the |id-1|=13
    // the old collinear layout produced.
    const sun = STAR_SYSTEMS[1];
    const vega = STAR_SYSTEMS[14];

    expect(sun.coordinates).toEqual({ x: 0, y: 0 });
    expect(vega.coordinates.y).not.toBe(0);

    const idDiff = Math.abs(vega.id - sun.id); // what the degenerate layout gave
    expect(distance(1, 14)).not.toBe(idDiff);
    expect(distance(1, 14)).toBe(
      Math.ceil(
        Math.hypot(vega.coordinates.x - sun.coordinates.x, vega.coordinates.y - sun.coordinates.y),
      ),
    );
  });

  it('uses 2D coordinates for non-collinear systems', () => {
    expect(distance(1, 21)).toBe(50);
    expect(distance(21, 1)).toBe(50);
    expect(distance(1, 1)).toBe(1);
  });
});
