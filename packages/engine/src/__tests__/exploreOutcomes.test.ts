import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  EXPLORE_OUTCOMES,
  ExploreOutcomeDefinition,
  LEGACY_POI_LOOT,
  POI_DISCOVERY_TABLE,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { drawPoiKind, resolveExploreOutcome } from '../exploreOutcomes.js';
import { cloneState } from '../clone.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DiscoveredPoi, GameEvent, GameState, DayPhase } from '../types.js';

/** Same shape as `exploration.test.ts`'s helper — a DAY-phase state with one
 *  controllable die, a PILOT modifier that guarantees the nav check, and fuel. */
function craftExploreState(die: number, pilot: number): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [die], spent: [false] };
  state.player.stats[Stat.PILOT] = pilot;
  state.player.ship.fuel = 1000;
  return state;
}

/** The whole observable result of one boarded POI, flattened to a string. */
function digest(seed: number): string {
  const res = resolveExploration(
    craftExploreState(18, 40),
    { type: 'Explore', spendDie: 0 },
    new SeededRng(seed),
  );
  return JSON.stringify({
    credits: res.state.player.credits,
    fragments: res.state.player.nemesisFile.fragments,
    pending: res.state.flags['signal.contraband.pending'] ?? null,
    pois: res.state.player.charts.discoveredPois,
    events: res.events,
  });
}

describe('explore outcome framework — legacy parity (T-110)', () => {
  // THE SPINE OF THE EXTRACTION COMMIT. Pinned from the PRE-refactor tree: the
  // whole per-seed result (credits, nemesisFile, the contraband flag, the charted
  // POI and the ORDERED event stream) over 300 seeds, hashed. If the extraction
  // moved a single rng draw, an event field or an emission order, this goes red.
  // NEVER re-stamp it to make T-110 pass — a move here means the extraction is
  // not behaviour-preserving.
  const LEGACY_PARITY_HASH = '4ec3232f14e5bcf132b8a2845c4a16fb9991fb4264f3d587575977bf60b89b8f';

  it('300 seeds of boarded POIs are byte-identical to the pre-extraction resolver', () => {
    const hash = createHash('sha256');
    for (let seed = 0; seed < 300; seed += 1) {
      hash.update(digest(seed));
      hash.update('\n');
    }
    expect(hash.digest('hex')).toBe(LEGACY_PARITY_HASH);
  });

  it('the legacy aggregate shape is unmoved (readable signal when the hash drifts)', () => {
    let salvageEvents = 0;
    let fragmentEvents = 0;
    let contrabandEvents = 0;
    let totalCredits = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40),
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      totalCredits += res.state.player.credits;
      for (const e of res.events) {
        if (e.type === 'SalvageRecovered') salvageEvents += 1;
        if (e.type === 'FragmentAcquired') fragmentEvents += 1;
        if (e.type === 'ContrabandFound') contrabandEvents += 1;
      }
    }
    expect({ salvageEvents, fragmentEvents, contrabandEvents, totalCredits }).toEqual({
      salvageEvents: 202,
      fragmentEvents: 96,
      contrabandEvents: 57,
      totalCredits: 346939,
    });
  });
});

// --- The five resolvable kinds, driven by SYNTHETIC rows ---
//
// None of these instances is authored into EXPLORE_OUTCOMES: T-110 ships the
// RESOLVERS, T-113/T-114 ship the instances. Each row below carries real
// `wireFound` copy, which is also what proves the wire path the legacy rows
// deliberately leave dark (finding F-110-B).

const POI: DiscoveredPoi = {
  id: 'poi-test-1',
  type: 'derelict',
  systemId: 1,
  name: 'a gutted freighter hulk',
  day: 3,
};

function row(
  id: string,
  payload: ExploreOutcomeDefinition['payload'],
  wireFound = 'Player found something aboard {name}.',
): ExploreOutcomeDefinition {
  return { id, valuePoints: 10, pools: ['derelict'], wireFound, payload };
}

function resolveRow(
  state: GameState,
  outcome: ExploreOutcomeDefinition,
  seed = 7,
): { state: GameState; events: GameEvent[] } {
  const next = cloneState(state);
  const events: GameEvent[] = [];
  resolveExploreOutcome(next, outcome, POI, new SeededRng(seed), events);
  return { state: next, events };
}

function baseState(): GameState {
  const state = createInitialState(1);
  state.day = 3;
  return state;
}

describe('explore outcome framework — the resolvable kinds (T-110)', () => {
  it('salvage pays credits inside the authored band and emits SalvageRecovered', () => {
    const state = baseState();
    const before = state.player.credits;
    const res = resolveRow(
      state,
      row('t-salvage', { kind: 'salvage', minCredits: 40, maxCredits: 180 }),
    );
    const paid = res.state.player.credits - before;
    expect(paid).toBeGreaterThanOrEqual(40);
    expect(paid).toBeLessThanOrEqual(180);
    const salvage = res.events.find((e) => e.type === 'SalvageRecovered');
    expect(salvage && salvage.type === 'SalvageRecovered' && salvage.amount).toBe(paid);
    expect(salvage && salvage.type === 'SalvageRecovered' && salvage.poiId).toBe(POI.id);
  });

  it('salvage is deterministic for a fixed seed', () => {
    const outcome = row('t-salvage', { kind: 'salvage', minCredits: 40, maxCredits: 180 });
    const a = resolveRow(baseState(), outcome, 4242);
    const b = resolveRow(baseState(), outcome, 4242);
    expect(a.state.player.credits).toBe(b.state.player.credits);
    expect(a.events).toEqual(b.events);
  });

  it('lore with a fragmentId grants it into the Nemesis file', () => {
    const res = resolveRow(
      baseState(),
      row('t-lore', { kind: 'lore', fragmentId: 'frag-nemesis-03' }),
    );
    const held = res.state.player.nemesisFile.fragments.map((f) => f.fragmentId);
    expect(held).toContain('frag-nemesis-03');
    const acquired = res.events.find((e) => e.type === 'FragmentAcquired');
    expect(acquired && acquired.type === 'FragmentAcquired' && acquired.source).toBe('derelict');
  });

  it('lore with effects routes through the shared applyEffects, stamped with the row id', () => {
    const state = baseState();
    const before = state.player.credits;
    const res = resolveRow(
      state,
      row('t-lore-effects', { kind: 'lore', effects: { credits: 250 } }),
    );
    expect(res.state.player.credits).toBe(before + 250);
    const applied = res.events.find((e) => e.type === 'StoryletEffectApplied');
    expect(applied && applied.type === 'StoryletEffectApplied' && applied.storyletId).toBe(
      't-lore-effects',
    );
    expect(applied && applied.type === 'StoryletEffectApplied' && applied.choiceId).toBe('explore');
  });

  it('a DEAD END (lore, neither field) still speaks — the wire line, nothing else', () => {
    // §2.4: a board is NEVER 80 fuel and a die for total silence. The dead end is
    // a shape, not a branch: `{ kind: 'lore' }` with both optional fields absent.
    const state = baseState();
    const res = resolveRow(state, row('t-dead-end', { kind: 'lore' }));
    expect(res.events.map((e) => e.type)).toEqual(['WireEntry']);
    expect(res.state.player.credits).toBe(state.player.credits);
    expect(res.state.player.nemesisFile).toEqual(state.player.nemesisFile);
    const wire = res.events[0];
    expect(wire.type === 'WireEntry' && wire.message).toBe(
      'Player found something aboard a gutted freighter hulk.',
    );
  });

  it('unique-item resolves to its wire line and mutates nothing (the T-112 seam)', () => {
    const state = baseState();
    const res = resolveRow(
      state,
      row('t-item', { kind: 'unique-item', itemId: 'explore-module-x' }),
    );
    expect(res.events.map((e) => e.type)).toEqual(['WireEntry']);
    // Whole-state comparison: the seam must not invent a stand-in grant.
    expect(res.state).toEqual(cloneState(state));
  });

  it('questline schedules its episode for state.day + delayDays', () => {
    const state = baseState();
    const res = resolveRow(
      state,
      row('t-quest', { kind: 'questline', storyletId: 'ticking-crate', delayDays: 4 }),
    );
    const entry = res.state.storylets.scheduled.find((s) => s.storyletId === 'ticking-crate');
    expect(entry).toBeDefined();
    expect(entry?.dueDay).toBe(state.day + 4);
    expect(entry?.sourceStoryletId).toBe('t-quest');
    expect(entry?.sourceChoiceId).toBe('explore');
    const scheduled = res.events.find((e) => e.type === 'StoryletScheduled');
    expect(scheduled && scheduled.type === 'StoryletScheduled' && scheduled.dueDay).toBe(
      state.day + 4,
    );
  });

  it('npc moves the named profile disposition by the authored delta', () => {
    const state = baseState();
    const target = state.npcs[0];
    const before = target.disposition;
    const res = resolveRow(
      state,
      row('t-npc', { kind: 'npc', profileId: target.id, dispositionDelta: 5 }),
    );
    const after = res.state.npcs.find((n) => n.id === target.id);
    expect(after?.disposition).toBe(before + 5);
    const applied = res.events.find(
      (e) => e.type === 'StoryletEffectApplied' && e.effect === 'disposition',
    );
    expect(applied && applied.type === 'StoryletEffectApplied' && applied.storyletId).toBe('t-npc');
  });

  it('an empty wireFound emits no line — the legacy rows stay dark (F-110-B)', () => {
    const res = resolveRow(baseState(), row('t-silent', { kind: 'lore' }, ''));
    expect(res.events).toEqual([]);
  });
});

describe('explore outcome framework — content integrity (T-110)', () => {
  it('outcome ids are unique', () => {
    const ids = EXPLORE_OUTCOMES.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every legacy draw-table id resolves to a row whose pools include that POI type', () => {
    const byId = new Map(EXPLORE_OUTCOMES.map((o) => [o.id, o]));
    for (const type of Object.keys(LEGACY_POI_LOOT) as PoiType[]) {
      const table = LEGACY_POI_LOOT[type];
      for (const leg of [table.salvage, table.fragment, table.contraband]) {
        expect(leg.outcomeIds.length).toBeGreaterThan(0);
        for (const id of leg.outcomeIds) {
          const outcome = byId.get(id);
          expect(outcome, `unresolved outcome id ${id}`).toBeDefined();
          expect(outcome?.pools).toContain(type);
        }
      }
    }
  });

  it('the legacy lore rows are exactly the two fragment pools, in pool order', () => {
    // A pool edit that never reaches the rows would silently drop a fragment from
    // the game; deriving both sides from the pools is what makes that impossible.
    const beacon = LEGACY_POI_LOOT.beacon.fragment.outcomeIds;
    const derelict = LEGACY_POI_LOOT.derelict.fragment.outcomeIds;
    const loreIds = EXPLORE_OUTCOMES.filter((o) => o.payload.kind === 'lore').map((o) => o.id);
    expect(loreIds).toEqual([...beacon, ...derelict]);
    for (const outcome of EXPLORE_OUTCOMES) {
      if (outcome.payload.kind !== 'lore') continue;
      expect(outcome.payload.fragmentId).toBeDefined();
      expect(outcome.id.endsWith(outcome.payload.fragmentId!)).toBe(true);
    }
  });

  it('the POI discovery table is a total distribution and drives the engine draw', () => {
    const total = POI_DISCOVERY_TABLE.reduce((sum, entry) => sum + entry.chance, 0);
    expect(total).toBeCloseTo(1, 10);
    const seen = new Set<PoiType>();
    for (let seed = 0; seed < 200 && seen.size < POI_DISCOVERY_TABLE.length; seed += 1) {
      seen.add(drawPoiKind(new SeededRng(seed)).type);
    }
    expect([...seen].sort()).toEqual(POI_DISCOVERY_TABLE.map((e) => e.type).sort());
  });
});
