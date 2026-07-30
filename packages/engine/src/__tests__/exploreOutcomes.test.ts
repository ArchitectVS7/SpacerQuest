import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  LEGACY_POI_LOOT,
  POI_DISCOVERY_TABLE,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import {
  claimOutcome,
  drawPoiKind,
  recoveryDays,
  resolveExploreOutcome,
} from '../exploreOutcomes.js';
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
  //
  // RE-PIN LEDGER
  // -------------
  // T-110 (pinned '4ec3232f…'): the extraction itself. Behaviour-preserving by
  //   charter, so the hash carried over from the pre-refactor tree untouched.
  //
  // T-111 (pinned '668f8ce9…'): DELIBERATELY NOT INERT. A drawn row whose band
  //   carries `recoveryDays > 0` no longer pays out on the day of the board — it
  //   opens the multi-day recovery slot and is delivered at the dusk of `dueDay`
  //   (docs/EXPLORE_REDESIGN.md §3). Two of the four shipped legacy rows sit in
  //   band 2 (`legacy-salvage-derelict` at 20 vp, both `legacy-contraband-*` at
  //   14 vp), so this sweep sees the change directly.
  //
  //   WHAT MOVED, aggregate over the same 300 seeds:
  //     salvageEvents     202 → 79     fragmentEvents  96 → 102
  //     contrabandEvents   57 → 44     totalCredits    346,939 → 308,941
  //     RecoveryStarted      0 → 136   (the deferred finds — none paid out here:
  //                                     this sweep drives the ACTION only, never
  //                                     a dusk, so no payout can occur in it)
  //
  //   WHY THE FRAGMENT COUNT ROSE, which is the one number that looks wrong until
  //   you follow the rng: the DRAW stream in `drawLegacyLoot` — the leg chance
  //   rolls and the fragment index pick — is untouched. What moved is that a
  //   DEFERRED row consumes no within-payload roll (its value is rolled at payout,
  //   off a fork of the dusk rng, so nothing about the payload is frozen onto the
  //   save). The three legacy legs share one rng, so a skipped payload roll
  //   re-phases every subsequent leg on that board. This is inherent to the legacy
  //   MULTI-LEG draw and disappears with it at T-113, when a board draws one
  //   weighted row.
  //
  //   The rule is unchanged: never re-stamp this hash to make a change pass. It
  //   was re-derived here because T-111 is a ruled behaviour change with its own
  //   ledger entry, not because a measurement was inconvenient.
  const LEGACY_PARITY_HASH = '668f8ce9b165cd62bafd08d86b3803d6cf5ff447f5dea9db268d92eca867cfd3';

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
    let recoveryStarted = 0;
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
        if (e.type === 'RecoveryStarted') recoveryStarted += 1;
      }
    }
    // T-111 re-pin — see the LEGACY_PARITY_HASH ledger above for the pre/post
    // table and the rng mechanism. `recoveryStarted` is counted from T-111 on so
    // the readable signal names the deferred finds instead of leaving them as an
    // unexplained hole in the salvage count.
    expect({
      salvageEvents,
      fragmentEvents,
      contrabandEvents,
      recoveryStarted,
      totalCredits,
    }).toEqual({
      salvageEvents: 79,
      fragmentEvents: 102,
      contrabandEvents: 44,
      recoveryStarted: 136,
      totalCredits: 308941,
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

  it('unique-item naming an UNKNOWN item still speaks and mutates nothing', () => {
    // T-112 CLOSED the seam this test used to guard (F-110-D): the arm now grants
    // real items, and `uniqueItem.test.ts` owns those assertions. What survives
    // here is the content-drift half — a save or a row naming an item that no
    // longer exists must resolve to prose and nothing else, the same defensive
    // shape `CREW_BY_ID[…]?.benefit` and `RecoveryAbandoned{'unknown-outcome'}`
    // keep for every other stored content id.
    const state = baseState();
    const res = resolveRow(state, row('t-item', { kind: 'unique-item', itemId: 'item-retired' }));
    expect(res.events.map((e) => e.type)).toEqual(['WireEntry']);
    // Whole-state comparison: the miss must not invent a stand-in grant.
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

// ---------------------------------------------------------------------------
// T-111 · The recovery clock is a RULE over a CONTENT band table
// ---------------------------------------------------------------------------

describe('T-111 · recoveryDays reads the band table, never a per-row constant', () => {
  it('the band table is ordered ascending and starts at 0', () => {
    // `bandFor` walks the list and keeps the LAST satisfied entry (the
    // `rankForDeedCount` idiom), so ORDER is load-bearing — assert it rather than
    // trusting it silently. Band 0 starting at 0 is what makes the walk total.
    expect(EXPLORE_VALUE_BANDS[0].minValuePoints).toBe(0);
    for (let i = 1; i < EXPLORE_VALUE_BANDS.length; i += 1) {
      expect(EXPLORE_VALUE_BANDS[i].minValuePoints).toBeGreaterThan(
        EXPLORE_VALUE_BANDS[i - 1].minValuePoints,
      );
      expect(EXPLORE_VALUE_BANDS[i].band).toBeGreaterThan(EXPLORE_VALUE_BANDS[i - 1].band);
    }
  });

  it('pins N at each band floor and one point below each boundary', () => {
    // The §5.2 ladder: 0 / 0 / 1 / 3 / 6 at 0 / 1 / 11 / 31 / 61.
    expect(recoveryDays(0)).toBe(0);
    expect(recoveryDays(1)).toBe(0);
    expect(recoveryDays(10)).toBe(0); // one below band 2
    expect(recoveryDays(11)).toBe(1);
    expect(recoveryDays(30)).toBe(1); // one below band 3
    expect(recoveryDays(31)).toBe(3);
    expect(recoveryDays(60)).toBe(3); // one below band 4
    expect(recoveryDays(61)).toBe(6);
    expect(recoveryDays(100)).toBe(6); // the ladder's ceiling
  });

  it('is monotone non-decreasing over every authored row (the §5.4 property)', () => {
    // Written NOW so T-113/T-114/T-115 inherit it: "the most powerful outcomes are
    // the slowest to recover" is true BY CONSTRUCTION for any rows anyone authors,
    // because `recoveryDays` is a function of a band and a band is monotone in
    // `valuePoints`. This is a property, not a tuned threshold, so it cannot rot.
    for (const a of EXPLORE_OUTCOMES) {
      for (const b of EXPLORE_OUTCOMES) {
        if (a.valuePoints <= b.valuePoints) {
          expect(recoveryDays(a.valuePoints)).toBeLessThanOrEqual(recoveryDays(b.valuePoints));
        }
      }
    }
  });

  it('NO outcome row carries a recoveryDays key — the clock is not authorable per row', () => {
    // Pairs with the reviewer's `grep recoveryDays packages/content/src/exploration.ts`,
    // which must hit only inside EXPLORE_VALUE_BANDS. The real enforcement is the
    // TYPE (`ExploreOutcomeDefinition` has no such key, so writing one is a compile
    // error); this is the runtime half, in case the interface is ever widened.
    for (const outcome of EXPLORE_OUTCOMES) {
      expect(Object.keys(outcome)).not.toContain('recoveryDays');
    }
  });
});

describe('T-111 · claimOutcome — deliver today, or open the recovery slot', () => {
  function claimRow(
    state: GameState,
    outcome: ExploreOutcomeDefinition,
    seed = 7,
  ): { state: GameState; events: GameEvent[]; rng: SeededRng } {
    const next = cloneState(state);
    const events: GameEvent[] = [];
    const rng = new SeededRng(seed);
    claimOutcome(next, outcome, POI, rng, events);
    return { state: next, events, rng };
  }

  function valued(
    id: string,
    valuePoints: number,
    payload: ExploreOutcomeDefinition['payload'],
  ): ExploreOutcomeDefinition {
    return { id, valuePoints, pools: ['derelict'], wireFound: '', payload };
  }

  it('a band-0/1 row resolves IMMEDIATELY and never touches the slot', () => {
    const state = baseState();
    const before = state.player.credits;
    const res = claimRow(
      state,
      valued('t-b1', 8, { kind: 'salvage', minCredits: 40, maxCredits: 180 }),
    );
    expect(res.events.some((e) => e.type === 'SalvageRecovered')).toBe(true);
    expect(res.events.some((e) => e.type === 'RecoveryStarted')).toBe(false);
    expect(res.state.player.recovery).toBeNull();
    expect(res.state.player.credits).toBeGreaterThan(before);
  });

  it('a band-3 row opens the slot with dueDay = day + 3 and pays nothing today', () => {
    const state = baseState(); // day 3
    const before = state.player.credits;
    const res = claimRow(
      state,
      valued('t-b3', 40, { kind: 'salvage', minCredits: 40, maxCredits: 180 }),
    );

    expect(res.state.player.recovery).toEqual({
      outcomeId: 't-b3',
      poiId: POI.id,
      systemId: POI.systemId,
      startedDay: 3,
      dueDay: 6,
    });
    const started = res.events.find((e) => e.type === 'RecoveryStarted');
    expect(started).toEqual({
      type: 'RecoveryStarted',
      day: 3,
      outcomeId: 't-b3',
      poiId: POI.id,
      systemId: POI.systemId,
      dueDay: 6,
    });
    // The payload has NOT resolved: no credits, no SalvageRecovered.
    expect(res.state.player.credits).toBe(before);
    expect(res.events.some((e) => e.type === 'SalvageRecovered')).toBe(false);
  });

  it('the defer path consumes ZERO rng draws (the payload rolls at payout)', () => {
    // Load-bearing: the value is rolled fresh off the CURRENT content row at the
    // dusk of dueDay, not frozen onto the save at claim time.
    const rngBefore = new SeededRng(99).getState();
    const res = claimRow(
      baseState(),
      valued('t-b4', 70, { kind: 'salvage', minCredits: 1, maxCredits: 999 }),
      99,
    );
    expect(res.rng.getState()).toBe(rngBefore);
    expect(res.state.player.recovery?.dueDay).toBe(3 + 6);
  });

  it('a second recovery-bearing row on the SAME board resolves immediately', () => {
    // The multi-leg legacy draw is the only way one board yields two such rows.
    // The predicate is the SAME `recovery === null` the Explore verb refuses on —
    // one rule, not two. T-113: unreachable once the draw is a single weighted row.
    const state = baseState();
    const first = claimRow(state, valued('t-first', 40, { kind: 'lore' }));
    expect(first.state.player.recovery?.outcomeId).toBe('t-first');

    const before = first.state.player.credits;
    const second = claimRow(
      first.state,
      valued('t-second', 40, { kind: 'salvage', minCredits: 40, maxCredits: 180 }),
    );
    // The slot is untouched by the second row, which paid out on the spot.
    expect(second.state.player.recovery?.outcomeId).toBe('t-first');
    expect(second.events.some((e) => e.type === 'SalvageRecovered')).toBe(true);
    expect(second.events.some((e) => e.type === 'RecoveryStarted')).toBe(false);
    expect(second.state.player.credits).toBeGreaterThan(before);
  });
});
