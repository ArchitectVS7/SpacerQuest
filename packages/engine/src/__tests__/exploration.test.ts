import { describe, it, expect } from 'vitest';
import { Stat, EXPLORATION_NAV_DC, EXPLORATION_FUEL_COST, PoiType } from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { advanceDay, startDay, applyPlayerAction } from '../day.js';
import { createInitialState, serializeState, deserializeState } from '../state.js';
import { SeededRng } from '../rng.js';
import { GameState, DayPhase } from '../types.js';

/** A DAY-phase state with a single controllable die in the dawn hand, plenty of
 *  fuel, and a chosen PILOT modifier — lets us drive the nav check precisely. */
function craftExploreState(die: number, pilot: number): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [die], spent: [false] };
  state.player.stats[Stat.PILOT] = pilot;
  state.player.ship.fuel = 1000;
  return state;
}

describe('exploration — nav check reads PILOT', () => {
  it('a higher PILOT modifier flips a boundary nav check from fail to discovery', () => {
    // die 10 vs DC 12: PILOT +1 → total 11 (fail); PILOT +2 → total 12 (success).
    // Same seed on both so only the modifier differs.
    expect(EXPLORATION_NAV_DC).toBe(12);

    const low = resolveExploration(
      craftExploreState(10, 1),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(42),
    );
    const high = resolveExploration(
      craftExploreState(10, 2),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(42),
    );

    expect(low.events.some((e) => e.type === 'ExplorationFailed')).toBe(true);
    expect(low.events.some((e) => e.type === 'PoiDiscovered')).toBe(false);
    expect(low.state.player.charts.discoveredPois).toHaveLength(0);

    expect(high.events.some((e) => e.type === 'PoiDiscovered')).toBe(true);
    expect(high.events.some((e) => e.type === 'ExplorationFailed')).toBe(false);
    expect(high.state.player.charts.discoveredPois).toHaveLength(1);
  });

  it('the StatCheck event carries the PILOT stat and DC', () => {
    const res = resolveExploration(
      craftExploreState(18, 3),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(1),
    );
    const statCheck = res.events.find((e) => e.type === 'StatCheck');
    expect(statCheck).toBeDefined();
    if (statCheck && statCheck.type === 'StatCheck') {
      expect(statCheck.stat).toBe(Stat.PILOT);
      expect(statCheck.dc).toBe(EXPLORATION_NAV_DC);
      expect(statCheck.result.modifier).toBe(3);
    }
  });

  it('spends the die and burns fuel on the attempt', () => {
    const state = craftExploreState(18, 3);
    const before = state.player.ship.fuel;
    const res = resolveExploration(state, { type: 'Explore', spendDie: 0 }, new SeededRng(1));
    expect(res.state.player.dawnHand?.spent[0]).toBe(true);
    expect(res.state.player.ship.fuel).toBe(before - EXPLORATION_FUEL_COST);
  });

  it('fails with insufficient-fuel (die still spent) when the tank is too low', () => {
    const state = craftExploreState(18, 3);
    state.player.ship.fuel = EXPLORATION_FUEL_COST - 1;
    const res = resolveExploration(state, { type: 'Explore', spendDie: 0 }, new SeededRng(1));
    const fail = res.events.find((e) => e.type === 'ExplorationFailed');
    expect(fail && fail.type === 'ExplorationFailed' && fail.reason).toBe('insufficient-fuel');
    expect(res.state.player.dawnHand?.spent[0]).toBe(true);
    expect(res.events.some((e) => e.type === 'PoiDiscovered')).toBe(false);
  });
});

describe('exploration — deterministic discovery per seed', () => {
  /** Play the same explore turn (same seed, same die index) via the real
   *  dispatch and return the discovered POIs. */
  function exploreOnce(seed: number): GameState['player']['charts']['discoveredPois'] {
    const dawn = startDay(createInitialState(seed));
    const state = dawn.state;
    // Guarantee the nav check clears regardless of the rolled die by boosting
    // PILOT — determinism of WHICH poi is what we're asserting, not success.
    state.player.stats[Stat.PILOT] = 40;
    state.player.ship.fuel = 1000;
    const res = applyPlayerAction(state, { type: 'Explore', spendDie: 0 });
    return res.state.player.charts.discoveredPois;
  }

  it('same seed → identical POI (id, type, name)', () => {
    const a = exploreOnce(777);
    const b = exploreOnce(777);
    expect(a).toHaveLength(1);
    expect(b).toEqual(a);
  });

  it('a full advanceDay run is reproducible for a seed', () => {
    function run(seed: number): string[] {
      const state = createInitialState(seed);
      // Boost PILOT so explores land, then spend three dice exploring.
      state.player.stats[Stat.PILOT] = 40;
      state.player.ship.fuel = 5000;
      const res = advanceDay(state, [
        { type: 'Explore', spendDie: 0 },
        { type: 'Explore', spendDie: 1 },
        { type: 'Explore', spendDie: 2 },
      ]);
      return res.state.player.charts.discoveredPois.map((p) => `${p.id}:${p.type}:${p.name}`);
    }
    expect(run(2024)).toEqual(run(2024));
    // Three distinct explores → three distinct POI ids.
    expect(new Set(run(2024)).size).toBe(3);
  });
});

describe('exploration — seed sweep surfaces both POI types', () => {
  it('both beacon and derelict are reachable across a seed sweep', () => {
    const seen = new Set<PoiType>();
    for (let seed = 0; seed < 200 && seen.size < 2; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40), // guaranteed nav success
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      const disc = res.events.find((e) => e.type === 'PoiDiscovered');
      if (disc && disc.type === 'PoiDiscovered') {
        seen.add(disc.poiType);
      }
    }
    expect(seen.has('beacon')).toBe(true);
    expect(seen.has('derelict')).toBe(true);
  });
});

describe('exploration — T-111b loot resolution', () => {
  it('a seed sweep surfaces salvage, a fragment, and a contraband pod', () => {
    let sawSalvage = false;
    let sawFragment = false;
    let sawContraband = false;

    for (let seed = 0; seed < 300; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40), // guaranteed nav success
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      for (const e of res.events) {
        if (e.type === 'SalvageRecovered') sawSalvage = true;
        if (e.type === 'FragmentAcquired') sawFragment = true;
        if (e.type === 'ContrabandFound') sawContraband = true;
      }
    }

    expect(sawSalvage).toBe(true);
    expect(sawFragment).toBe(true);
    expect(sawContraband).toBe(true);
  });

  it('a granted fragment lands in the nemesisFile and the count matches the event', () => {
    // Find a seed whose discovery grants a fragment, then assert the file grew.
    let granted: ReturnType<typeof resolveExploration> | null = null;
    for (let seed = 0; seed < 300 && !granted; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40),
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      if (res.events.some((e) => e.type === 'FragmentAcquired')) {
        granted = res;
      }
    }
    expect(granted).not.toBeNull();

    const acquired = granted!.events.find((e) => e.type === 'FragmentAcquired');
    expect(acquired && acquired.type === 'FragmentAcquired').toBe(true);
    if (acquired && acquired.type === 'FragmentAcquired') {
      const held = granted!.state.player.nemesisFile.fragments.map((f) => f.fragmentId);
      expect(held).toContain(acquired.fragmentId);
      // The event's running count equals the file length (decoded-lore index).
      expect(acquired.fragmentCount).toBe(granted!.state.player.nemesisFile.fragments.length);
    }
  });

  it('contraband arms the sealed-pod storylet flag', () => {
    let armed: ReturnType<typeof resolveExploration> | null = null;
    for (let seed = 0; seed < 300 && !armed; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40),
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      if (res.events.some((e) => e.type === 'ContrabandFound')) {
        armed = res;
      }
    }
    expect(armed).not.toBeNull();
    expect(armed!.state.flags['signal.contraband.pending']).toBe(true);
  });

  it('loot is deterministic for a fixed seed (credits, nemesisFile, flags)', () => {
    function loot(seed: number) {
      const res = resolveExploration(
        craftExploreState(18, 40),
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      return {
        credits: res.state.player.credits,
        fragments: res.state.player.nemesisFile.fragments,
        pending: res.state.flags['signal.contraband.pending'],
      };
    }
    expect(loot(12345)).toEqual(loot(12345));
  });
});

describe('exploration — encounter gating and serialization', () => {
  it('is blocked during an active encounter (typed ActionBlocked, no die spent)', () => {
    const dawn = startDay(createInitialState(5));
    const state = dawn.state;
    state.player.ship.fuel = 1000;
    // Fake an active encounter so the gate in applyPlayerAction fires.
    state.encounter = {
      id: 'enc-test',
      pendingTravel: { origin: 1, destination: 2, fuelUsed: 0 },
      interceptor: {
        id: 'x',
        source: 'anonymous',
        name: 'Test',
        shipName: 'Test',
        stats: { PILOT: 0, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 0 },
        tier: 1,
      },
      routeDangerLevel: 1,
      routeDangerChance: 0.3,
      encounterRoll: 0.1,
      round: 1,
      enemyHull: 1,
    };
    const before = state.player.dawnHand ? [...state.player.dawnHand.spent] : [];
    const res = applyPlayerAction(state, { type: 'Explore', spendDie: 0 });
    const blocked = res.events.find((e) => e.type === 'ActionBlocked');
    expect(blocked && blocked.type === 'ActionBlocked' && blocked.actionType).toBe('Explore');
    expect(res.state.player.dawnHand?.spent).toEqual(before);
    expect(res.state.player.charts.discoveredPois).toHaveLength(0);
  });

  it('discovered POIs round-trip through serialize/deserialize', () => {
    const res = resolveExploration(
      craftExploreState(18, 40),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(99),
    );
    expect(res.state.player.charts.discoveredPois).toHaveLength(1);
    const restored = deserializeState(serializeState(res.state));
    expect(restored.player.charts.discoveredPois).toEqual(res.state.player.charts.discoveredPois);
  });

  it('older saves with no discoveredPois default to an empty list', () => {
    const obj = JSON.parse(serializeState(createInitialState(1))) as {
      player: { charts: { discoveredPois?: unknown } };
    };
    delete obj.player.charts.discoveredPois;
    const restored = deserializeState(JSON.stringify(obj));
    expect(restored.player.charts.discoveredPois).toEqual([]);
  });
});
