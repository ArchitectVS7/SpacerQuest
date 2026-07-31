import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  BEACON_FRAGMENT_POOL,
  DERELICT_FRAGMENT_POOL,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  POI_DISCOVERY_TABLE,
  POI_KINDS,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import {
  claimOutcome,
  drawOutcome,
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

/** Which band index a `valuePoints` falls in — the `bandFor` walk, restated here
 *  because the engine keeps `bandFor` module-private on purpose (its header says
 *  so: a bare `bandFor` on a barrel would collide with the Hangout's own band
 *  lookup). Reads the CONTENT table, so it cannot drift from the rule it mirrors. */
function bandIndexOf(valuePoints: number): number {
  let band = EXPLORE_VALUE_BANDS[0];
  for (const candidate of EXPLORE_VALUE_BANDS) {
    if (valuePoints >= candidate.minValuePoints) band = candidate;
  }
  return band.band;
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

describe('explore outcome framework — the WEIGHTED DRAW aggregate (T-117)', () => {
  // THE SPINE OF THE EXTRACTION COMMIT, AND NOW OF THE FLIP THAT ENDED IT. The
  // whole per-seed result (credits, nemesisFile, the sealed-pod flag, the charted
  // POI and the ORDERED event stream) over 300 seeds, hashed. If a draw, an event
  // field or an emission order moves, this goes red. NEVER re-stamp it to make a
  // change pass — a move here is either a ruled behaviour change with its own
  // ledger entry below, or a bug.
  //
  // T-117 RENAMED THIS BLOCK. It was "legacy parity (T-110)" and it pinned the
  // transitional three-leg carrier; that carrier is deleted, so the block is
  // re-pointed at the mechanism that replaced it rather than retired with it —
  // the 300-seed hash is the cheapest tripwire in the tree and the draw still
  // needs one.
  //
  // RE-PIN LEDGER
  // -------------
  // T-110 (pinned '4ec3232f…'): the extraction itself. Behaviour-preserving by
  //   charter, so the hash carried over from the pre-refactor tree untouched.
  //
  // T-111 (pinned '668f8ce9…'): DELIBERATELY NOT INERT. A drawn row whose band
  //   carries `recoveryDays > 0` no longer pays out on the day of the board — it
  //   opens the multi-day recovery slot and is delivered at the dusk of `dueDay`
  //   (docs/EXPLORE_REDESIGN.md §3).
  //     salvageEvents     202 → 79     fragmentEvents  96 → 102
  //     contrabandEvents   57 → 44     totalCredits    346,939 → 308,941
  //     RecoveryStarted      0 → 136
  //
  // T-113 (pinned '4e8f44b4…'): THE AUTHORED POOLS LANDED (bands 0-1), and the
  //   carrier addressed them on two of its five legs.
  //     salvageEvents      79 → 79     fragmentEvents  102 → 97
  //     contrabandEvents   44 → 44     totalCredits    308,941 → 309,047
  //     RecoveryStarted   136 → 136
  //
  // T-114 (pinned 'f62b45af…'): BAND 2 LANDED and both salvage legs became
  //   authored; the derelict leg went from 1 id to 14 and so consumed an index
  //   draw it never used to.
  //     salvageEvents      79 → 70     fragmentEvents   97 → 93
  //     contrabandEvents   44 → 26     totalCredits     309,047 → 310,192
  //     RecoveryStarted   136 → 167
  //
  // T-117 (pinned below): THE SINGLE BAND-WEIGHTED DRAW. This is the largest move
  //   in the ledger and it is a RULE change, not a content one — the one T-110
  //   deferred, §2.4 specified, and F-113-A recorded as unowned through two
  //   passes. The mechanism, in one sentence: A BOARD NOW DRAWS EXACTLY ONE ROW
  //   INSTEAD OF UP TO THREE INDEPENDENT LEGS.
  //
  //   Four consequences, each traceable rather than lumped together:
  //     (1) EVENT COUNTS FALL BY CONSTRUCTION. Under the carrier a lucky board
  //         yielded salvage AND a fragment AND a pod; one row cannot. §2.4 said
  //         outright that the flip is not behaviour-preserving on its own.
  //     (2) THE DRAW COST IS NOW A FLAT TWO `rng.next()` CALLS (band, then row)
  //         where the carrier consumed one chance roll per leg plus a conditional
  //         index draw. Every board's stream re-phases.
  //     (3) THE 14 BAND-0 DEAD ENDS ARE DRAWABLE FOR THE FIRST TIME, at 25% of
  //         boards — the single biggest contributor to the fall in credits and in
  //         payload events, and the entire point of the flip.
  //     (4) `ContrabandFound` IS NEVER EMITTED AGAIN. The payload kind is deleted
  //         (F-113-B); the sealed pod is armed instead by three band-1 derelict
  //         lore rows through `effects.flags`, which is what `podFlagged` counts.
  //
  //   WHAT MOVED, aggregate over the same 300 seeds:
  //     salvageEvents      70 → 78     fragmentEvents   93 → 38
  //     contrabandEvents   26 → 0      podFlagged       26 → 15
  //     totalCredits  310,192 → 310,219
  //     RecoveryStarted   167 → 134
  //
  //   READ THOSE AGAINST THE PREDICTED SHARES rather than as a verdict. All 300
  //   seeds board (the helper hands the nav check a 18 on a +40 PILOT), so a
  //   count divided by 300 is a share of successful boards:
  //     RecoveryStarted 134/300 = 44.7%, against the 24+15+3 = 42% of the table
  //       that sits in bands 2-4 — the deferring bands, exactly;
  //     fragmentEvents 38/300 = 12.7%, against the 13.0% the band-1 lore rows
  //       occupy once the per-pool renormalisation is done;
  //     podFlagged 15/300 = 5.0%, against the 4.5% three of eleven band-1
  //       derelict rows predict (see `DERELICT_POD_EFFECTS`);
  //     contrabandEvents 0, exactly and permanently.
  //   `salvageEvents` runs high against its own 20% (78 vs ≈60, about 2.6 sd on
  //   300 draws) and `totalCredits` lands within 30cr of T-114's, which is
  //   coincidence rather than signal: this sweep never reaches a dusk, so the
  //   entire band-2-and-up payout — most of the ladder's value — is invisible to
  //   it. IT IS NOT A MEASUREMENT OF WHETHER EXPLORE PAYS. §5.5 predicts ≈447cr
  //   of value per successful board; T-116 measures it over real careers and owns
  //   the verdict, and nothing here is tuned to reach a number.
  const WEIGHTED_DRAW_HASH = 'bb6ae5834b4dcc087390672c7a2137f9856611da2da11252266543aeae9625b8';

  it('300 seeds of boarded POIs match the pinned per-seed result, exactly', () => {
    const hash = createHash('sha256');
    for (let seed = 0; seed < 300; seed += 1) {
      hash.update(digest(seed));
      hash.update('\n');
    }
    expect(hash.digest('hex')).toBe(WEIGHTED_DRAW_HASH);
  });

  it('the aggregate shape is unmoved (readable signal when the hash drifts)', () => {
    let salvageEvents = 0;
    let fragmentEvents = 0;
    let contrabandEvents = 0;
    let podFlagged = 0;
    let recoveryStarted = 0;
    let totalCredits = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const res = resolveExploration(
        craftExploreState(18, 40),
        { type: 'Explore', spendDie: 0 },
        new SeededRng(seed),
      );
      totalCredits += res.state.player.credits;
      if (res.state.flags['signal.contraband.pending'] === true) podFlagged += 1;
      for (const e of res.events) {
        if (e.type === 'SalvageRecovered') salvageEvents += 1;
        if (e.type === 'FragmentAcquired') fragmentEvents += 1;
        if (e.type === 'ContrabandFound') contrabandEvents += 1;
        if (e.type === 'RecoveryStarted') recoveryStarted += 1;
      }
    }
    // T-117 re-pin — see the ledger above for the pre/post table and the four
    // mechanisms. `contrabandEvents` is still COUNTED, at zero: the event variant
    // survives in `types.ts`/`schema.ts` (deleting an event shape is save/schema
    // surface and would drag a version bump into a content pass), so a future
    // change that started emitting it again would show up here rather than
    // silently.
    expect({
      salvageEvents,
      fragmentEvents,
      contrabandEvents,
      podFlagged,
      recoveryStarted,
      totalCredits,
    }).toEqual({
      salvageEvents: 78,
      fragmentEvents: 38,
      contrabandEvents: 0,
      podFlagged: 15,
      recoveryStarted: 134,
      totalCredits: 310219,
    });
  });
});

describe('T-117 · drawOutcome — one band-weighted row per board', () => {
  it('draws only rows whose OWN pools include the drawn POI type', () => {
    // The structural guard the transitional carrier needed a leg-by-leg check
    // for. It is now a property of the draw itself, so it is asserted as one.
    for (const type of Object.keys(POI_KINDS) as PoiType[]) {
      for (let seed = 0; seed < 400; seed += 1) {
        const row = drawOutcome(type, new SeededRng(seed));
        expect(row, `${type} drew nothing on seed ${seed}`).toBeDefined();
        expect(row!.pools, `${row!.id} drawn at a ${type}`).toContain(type);
      }
    }
  });

  it('consumes EXACTLY two rng draws, always — even for a one-row band', () => {
    // Load-bearing determinism: the legacy draw's single-id short-circuit made
    // the stream depend on how many ids an author happened to write on a leg.
    // A flat cost means a content edit inside a band cannot re-phase the day.
    for (const type of Object.keys(POI_KINDS) as PoiType[]) {
      const measured = new SeededRng(11);
      drawOutcome(type, measured);
      const reference = new SeededRng(11);
      reference.next();
      reference.next();
      expect(measured.getState(), `${type} draw cost`).toBe(reference.getState());
    }
  });

  it('is deterministic for a seed, and spreads across every band of the pool', () => {
    for (const type of Object.keys(POI_KINDS) as PoiType[]) {
      expect(drawOutcome(type, new SeededRng(4242))!.id).toBe(
        drawOutcome(type, new SeededRng(4242))!.id,
      );
      const bands = new Set<number>();
      for (let seed = 0; seed < 3000; seed += 1) {
        bands.add(bandIndexOf(drawOutcome(type, new SeededRng(seed))!.valuePoints));
      }
      // Every band of the table is reachable at every POI type — the property
      // `exploreContent.test.ts` asserts on the CONTENT side (every band has a
      // row in every pool), observed here on the DRAW side.
      expect([...bands].sort(), `${type} bands reached`).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it('honours the §5.2 band weights within sampling error', () => {
    // A distribution check, not a tuned threshold: the tolerance is a wide ±4
    // percentage points on a 20,000-draw sample, which no plausible re-weighting
    // could slip through and no seed choice could break. It exists so that a
    // `drawOutcome` that silently stopped renormalising — handing an absent
    // band's share to whichever band happened to be last — would be caught.
    const counts = new Map<number, number>();
    const SAMPLES = 20000;
    for (let seed = 0; seed < SAMPLES; seed += 1) {
      const rng = new SeededRng(seed);
      const type = drawPoiKind(rng).type;
      const row = drawOutcome(type, rng)!;
      const band = bandIndexOf(row.valuePoints);
      counts.set(band, (counts.get(band) ?? 0) + 1);
    }
    for (const band of EXPLORE_VALUE_BANDS) {
      const observed = ((counts.get(band.band) ?? 0) / SAMPLES) * 100;
      expect(Math.abs(observed - band.weight), `band ${band.band} share ${observed}`).toBeLessThan(
        4,
      );
    }
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

  it('every row is reachable at a POI type it claims, and claims at least one', () => {
    // T-117 RETARGETED. This asserted the transitional carrier's leg ids resolved
    // to rows whose pools included the leg's POI type; the legs are gone, so the
    // claim that survives is the one that always mattered — a row declares which
    // POI types can surface it, and `drawOutcome` filters on exactly that. A row
    // with no pool is content that exists and cannot be found.
    const types = new Set(Object.keys(POI_KINDS) as PoiType[]);
    for (const outcome of EXPLORE_OUTCOMES) {
      expect(outcome.pools.length, `${outcome.id} pools`).toBeGreaterThan(0);
      for (const pool of outcome.pools) {
        expect(types.has(pool), `${outcome.id} names pool ${pool}`).toBe(true);
      }
    }
  });

  it('every fragment in either pool has a lore row in that pool, derived not transcribed', () => {
    // A pool edit that never reaches the rows would silently drop a fragment from
    // the game; deriving the rows from the pools is what makes that impossible.
    //
    // T-117 RETARGETED, intent preserved exactly. The old form walked the
    // carrier's fragment LEGS and checked the row at pool index i carried the
    // fragment at pool index i, because a seeded index pick landed on that order.
    // With the legs deleted the order is no longer load-bearing, but the coverage
    // claim is — so it is asserted directly against the pools.
    const legs: [PoiType, readonly string[]][] = [
      ['beacon', BEACON_FRAGMENT_POOL],
      ['derelict', DERELICT_FRAGMENT_POOL],
    ];
    for (const [type, pool] of legs) {
      const rows = EXPLORE_OUTCOMES.filter(
        (o) => o.pools.includes(type) && o.payload.kind === 'lore' && o.payload.fragmentId,
      );
      expect(rows).toHaveLength(pool.length);
      for (const fragmentId of pool) {
        const row = rows.find(
          (o) => o.payload.kind === 'lore' && o.payload.fragmentId === fragmentId,
        );
        expect(row, `no ${type} row grants ${fragmentId}`).toBeDefined();
      }
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

  it('is monotone non-decreasing over every row in the table (§5.4 part 1)', () => {
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

  it('RECOVERY TIME CORRELATES WITH VALUE across the whole table (§5.4 part 2)', () => {
    // T-115's SECOND ACCEPT CLAUSE, and §5.4's second half: the mean
    // `recoveryDays` of the top `valuePoints` quartile is STRICTLY GREATER than
    // the bottom quartile's.
    //
    // WHY THIS IS NOT A TUNED THRESHOLD, said plainly so nobody later "fixes" it
    // by moving a number: `recoveryDays` is a function of BAND and band is a
    // monotone function of `valuePoints`, so part 1 above (monotonicity over every
    // pair) is true by construction for any 100 rows anyone authors. Part 2 adds
    // the only thing part 1 cannot say — that the ladder is not FLAT — and it is
    // strict as long as the table spans more than one band, which the 14/20/33/25/8
    // spread does by definition. Neither half can rot, and neither can be made to
    // pass by editing a band (docs/BALANCE-POLICY.md forbids that anyway).
    //
    // WHOLE-TABLE, NOT ROW BY ROW, which is the clause's own wording: no
    // assertion here names a row or an id.
    const sorted = [...EXPLORE_OUTCOMES].sort((a, b) => a.valuePoints - b.valuePoints);
    const quartile = Math.floor(sorted.length / 4);
    expect(quartile).toBeGreaterThan(0);
    const mean = (rows: ExploreOutcomeDefinition[]): number =>
      rows.reduce((sum, row) => sum + recoveryDays(row.valuePoints), 0) / rows.length;
    const bottom = mean(sorted.slice(0, quartile));
    const top = mean(sorted.slice(sorted.length - quartile));
    expect(top, `top quartile mean N ${top} vs bottom ${bottom}`).toBeGreaterThan(bottom);
    // …and the ladder's ends are the ones §5.2 authored: the cheapest quarter of
    // the table recovers same-day, the dearest quarter never does.
    expect(bottom).toBe(0);
    expect(top).toBeGreaterThanOrEqual(EXPLORE_VALUE_BANDS[3].recoveryDays);
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
