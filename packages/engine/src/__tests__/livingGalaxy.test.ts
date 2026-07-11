import { describe, it, expect } from 'vitest';
import { startDay, endDay, advanceDay } from '../day.js';
import { createInitialState } from '../state.js';
import { resolveCombat } from '../actions/combat.js';
import { SeededRng } from '../rng.js';
import { EncounterState, GameState } from '../types.js';

function namedEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  // Cargo King: named, tier 3, Cowardly (does NOT refuse tribute).
  return {
    id: 'enc-named',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'npc-cargo-king',
      source: 'named',
      name: 'Cargo King',
      shipName: 'Fat Profit',
      profileId: 'npc-cargo-king',
      stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 2 },
      tier: 3,
      flaw: 'Cowardly',
      flawDc: 13,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
    ...overrides,
  };
}

function combatReadyState(dice: number[]): GameState {
  const state = createInitialState(5);
  state.player.dawnHand = { dice, spent: dice.map(() => false) };
  state.player.credits = 5000;
  state.encounter = namedEncounter();
  return state;
}

function dispositionOf(state: GameState, npcId: string): number {
  return state.npcs.find((npc) => npc.id === npcId)!.disposition;
}

describe('Disposition — grudges and favors (T-106)', () => {
  it('paying tribute to a named interceptor raises their disposition (+2)', () => {
    // Talk DC = 10 + tier 3 = 13; die 15 + TRADE 1 succeeds without a nat 20,
    // so round-1 tribute (1,000 cr) is demanded and paid.
    const state = combatReadyState([15, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'talk', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events.some((e) => e.type === 'TributePaid')).toBe(true);
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(2);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: 2,
        reason: 'tribute',
      }),
    );
  });

  it('defeating a named interceptor leaves a grudge (-3)', () => {
    // Fight DC 13; die 18 + GUNS 0 wins, enemyHull 1 -> 0 -> defeated.
    const state = combatReadyState([18, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'fight', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events).toContainEqual(expect.objectContaining({ resolution: 'defeated' }));
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(-3);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: -3,
        reason: 'defeat',
      }),
    );
  });

  it('fleeing a named interceptor is a small mark in your favor (+1)', () => {
    // Run DC 13; die 19 + PILOT 1 escapes cleanly.
    const state = combatReadyState([19, 5, 5, 5, 5]);
    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'run', targetId: 'npc-cargo-king', spendDie: 0 },
      new SeededRng(5),
    );

    expect(events).toContainEqual(expect.objectContaining({ resolution: 'escaped' }));
    expect(dispositionOf(next, 'npc-cargo-king')).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-cargo-king',
        delta: 1,
        reason: 'player-fled',
      }),
    );
  });

  it('disposition decays one step toward 0 each dusk, from both directions', () => {
    const state = createInitialState(7);
    state.npcs[0].disposition = 3;
    state.npcs[1].disposition = -3;

    const { state: next, events } = advanceDay(state, []);

    expect(next.npcs[0].disposition).toBe(2);
    expect(next.npcs[1].disposition).toBe(-2);
    expect(
      events.filter((e) => e.type === 'DispositionChanged' && e.reason === 'decay'),
    ).toHaveLength(2);
  });
});

describe('Contract competition — the shared job pool (T-106)', () => {
  it('a same-system NPC claims a board offer at dusk; the wire reports it and the pool drains', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = createInitialState(seed);
      // Put a dedicated trader in the player's system.
      state.npcs.find((npc) => npc.id === 'npc-cargo-king')!.currentSystemId =
        state.player.currentSystemId;

      const dawn = startDay(state);
      expect(dawn.state.market.manifestBoard).toHaveLength(4);
      const boardSnapshot = dawn.state.market.manifestBoard.map((offer) => ({ ...offer }));

      const dusk = endDay(dawn.state);
      const claim = dusk.events.find((e) => e.type === 'ContractClaimed');
      if (!claim || claim.type !== 'ContractClaimed') continue;

      // The claimed offer is one the player saw on this morning's board...
      expect(
        boardSnapshot.some(
          (offer) =>
            offer.cargoType === claim.cargoType &&
            offer.destination === claim.destination &&
            offer.payment === claim.payment,
        ),
      ).toBe(true);
      // ...and it is gone from the live board.
      expect(dusk.state.market.manifestBoard).toHaveLength(3);
      expect(dusk.state.market.npcClaims).toBe(1);
      expect(
        dusk.events.some(
          (e) => e.type === 'WireEntry' && e.message.includes('undercut you on the'),
        ),
      ).toBe(true);

      // Next dawn the depot's pool is visibly thinner: 3 offers, not 4.
      const nextDawn = startDay(dusk.state);
      expect(nextDawn.state.market.manifestBoard).toHaveLength(3);
      expect(nextDawn.state.market.npcClaims).toBe(0);
      return;
    }
    throw new Error('no contract claim observed in 60 seeds');
  });

  it('a snipe registers a rival grudge: the sniping NPC drops one disposition (T-106)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const state = createInitialState(seed);
      const rival = state.npcs.find((npc) => npc.id === 'npc-cargo-king')!;
      rival.currentSystemId = state.player.currentSystemId;
      // Start neutral so the snipe's -1 is unambiguous (and survives dusk decay,
      // which is applied BEFORE the snipe grudge in endDay).
      rival.disposition = 0;

      const dawn = startDay(state);
      const dusk = endDay(dawn.state);
      const claim = dusk.events.find((e) => e.type === 'ContractClaimed');
      if (!claim || claim.type !== 'ContractClaimed') continue;

      // The competitive act emits a typed disposition change tied to the snipe...
      const dispositionEvent = dusk.events.find(
        (e) =>
          e.type === 'DispositionChanged' &&
          e.reason === 'contract-sniped' &&
          e.npcId === claim.npcId,
      );
      expect(dispositionEvent).toBeDefined();
      if (dispositionEvent?.type !== 'DispositionChanged') throw new Error('unreachable');
      expect(dispositionEvent.delta).toBe(-1);
      // ...and it persists past the same-dusk decay to a real -1 standing.
      expect(dispositionOf(dusk.state, claim.npcId)).toBe(-1);
      return;
    }
    throw new Error('no contract claim observed in 60 seeds');
  });
});

describe('Bond hook — one intervention per dusk (T-106)', () => {
  it('a bonded NPC (disposition >= +5) answers a dry-tank mayday with fuel', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createInitialState(seed);
      const doc = state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      doc.currentSystemId = state.player.currentSystemId;
      doc.disposition = 6;

      const dawn = startDay(state);
      dawn.state.player.ship.fuel = 0;
      const docFuelBefore = dawn.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!.fuel;

      const dusk = endDay(dawn.state);
      const gift = dusk.events.find((e) => e.type === 'BondIntervention' && e.kind === 'fuel-gift');
      if (!gift) continue;

      expect(gift).toMatchObject({ npcId: 'npc-doc-salvage', amount: 50 });
      expect(dusk.state.player.ship.fuel).toBe(50);
      expect(
        dusk.events.some(
          (e) => e.type === 'WireEntry' && e.message.includes('answered your mayday'),
        ),
      ).toBe(true);
      // The intervention IS Doc's dusk action: the fuel came out of his tank
      // and he spent his whole day on it — exactly 50 fuel gone, no contract
      // hauled, no jump made, lastAction is the rescue.
      const docAfter = dusk.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      expect(docAfter.fuel).toBe(docFuelBefore - 50);
      expect(docAfter.currentSystemId).toBe(dusk.state.player.currentSystemId);
      expect(docAfter.lastAction).toMatchObject({ type: 'Trade' });
      expect(docAfter.lastAction?.details).toContain('answering a mayday');
      return;
    }
    throw new Error('no fuel-gift intervention observed in 20 seeds');
  });

  it('does not intervene below the bond threshold (disposition < +5)', () => {
    const state = createInitialState(3);
    const doc = state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
    doc.currentSystemId = state.player.currentSystemId;
    doc.disposition = 4;

    const dawn = startDay(state);
    dawn.state.player.ship.fuel = 0;
    const dusk = endDay(dawn.state);

    expect(dusk.events.some((e) => e.type === 'BondIntervention')).toBe(false);
    expect(dusk.state.player.ship.fuel).toBe(0);
  });

  it('a bonded NPC can drive an interceptor off before the dusk free attack', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createInitialState(seed);
      const doc = state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      doc.currentSystemId = state.player.currentSystemId;
      doc.disposition = 7;

      const dawn = startDay(state);
      dawn.state.encounter = {
        id: 'enc-dusk-rescue',
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

      const dusk = endDay(dawn.state);
      const rescue = dusk.events.find(
        (e) => e.type === 'BondIntervention' && e.kind === 'drive-off',
      );
      if (!rescue) continue;

      expect(dusk.events).toContainEqual(
        expect.objectContaining({ type: 'EncounterResolved', resolution: 'interceptor-fled' }),
      );
      // Resolved BEFORE the dusk free attack: no day-end counter fire.
      expect(
        dusk.events.some((e) => e.type === 'EnemyCounterAction' && e.pressure === 'day-end'),
      ).toBe(false);
      expect(dusk.state.encounter).toBeNull();
      // Pending travel completes — the convoy limps in under escort.
      expect(dusk.state.player.currentSystemId).toBe(2);
      // The rescue IS Doc's dusk action — he skips his own NPC day.
      const docAfter = dusk.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!;
      expect(docAfter.lastAction).toMatchObject({ type: 'Combat' });
      expect(docAfter.lastAction?.details).toContain('driving');
      expect(docAfter.currentSystemId).toBe(1);
      return;
    }
    throw new Error('no drive-off intervention observed in 20 seeds');
  });
});
