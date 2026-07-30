import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  LEGACY_POI_LOOT,
  POI_KINDS,
  PoiType,
  Stat,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { recoveryDays } from '../exploreOutcomes.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DayPhase, GameState } from '../types.js';

/**
 * T-113 · THE CONTENT VALIDATOR for the authored explore table
 * (docs/EXPLORE_REDESIGN.md §5). Two things are asserted here and nowhere else:
 * that every authored ROW IS WELL-FORMED, and that the table's VALUE
 * DISTRIBUTION matches the spec's ladder.
 *
 * WHY IT LIVES IN THE ENGINE SUITE. `packages/content` has no test runner at
 * all — its `package.json` carries a `build` script and nothing else, and there
 * is not one `*.test.ts` under it. The content-integrity block in
 * `exploreOutcomes.test.ts` established the precedent at T-110; this file is its
 * sibling, scoped to the authored table. Standing observation for the milestone
 * owner: giving `packages/content` a runner is real infra and belongs to a task
 * chartered for it, not to a content pass.
 *
 * EVERY ASSERTION BELOW IS SCOPED TO THE **AUTHORED** ROWS. The two surviving
 * `legacy-contraband-*` rows are transitional (finding F-113-B) and would
 * otherwise pollute the ladder: `contraband` appears in no band's
 * `permittedKinds`, which is the mechanical statement that it is not part of the
 * settled taxonomy.
 */

const LEGACY_PREFIX = 'legacy-';
const authored = EXPLORE_OUTCOMES.filter((row) => !row.id.startsWith(LEGACY_PREFIX));

function bandOf(row: ExploreOutcomeDefinition): ExploreValueBand {
  let band = EXPLORE_VALUE_BANDS[0];
  for (const candidate of EXPLORE_VALUE_BANDS) {
    if (row.valuePoints >= candidate.minValuePoints) band = candidate;
  }
  return band;
}

function rowsInBand(band: number): ExploreOutcomeDefinition[] {
  return authored.filter((row) => bandOf(row).band === band);
}

/** Salvage rows in a band, with their credit midpoint — the figure §5.5 prices a
 *  band's credit-equivalent on. */
function salvageMidpoints(band: number): number[] {
  return rowsInBand(band)
    .filter((row) => row.payload.kind === 'salvage')
    .map((row) =>
      row.payload.kind === 'salvage' ? (row.payload.minCredits + row.payload.maxCredits) / 2 : 0,
    );
}

// ---------------------------------------------------------------------------
// 1 · Well-formedness — every authored row
// ---------------------------------------------------------------------------

describe('T-113 · every authored explore row is well-formed', () => {
  it('ids are unique across the WHOLE table and follow the naming convention', () => {
    const ids = EXPLORE_OUTCOMES.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of authored) {
      // An id is the ONLY thing a save stores about an outcome
      // (`player.recovery.outcomeId`), so it is a compatibility surface: a row
      // that is ever re-banded must keep the id it shipped with. The convention
      // therefore describes the SHAPE, never the band.
      expect(row.id, `${row.id} is not an explore- id`).toMatch(
        /^explore-(deadend|salvage|lore)-[a-z0-9-]+$/,
      );
    }
  });

  it('valuePoints is an integer on the 0-100 ladder', () => {
    for (const row of authored) {
      expect(Number.isInteger(row.valuePoints), `${row.id} valuePoints`).toBe(true);
      expect(row.valuePoints).toBeGreaterThanOrEqual(0);
      expect(row.valuePoints).toBeLessThanOrEqual(100);
    }
  });

  it('pools are non-empty and name only real POI types', () => {
    const types = new Set(Object.keys(POI_KINDS) as PoiType[]);
    for (const row of authored) {
      expect(row.pools.length, `${row.id} pools`).toBeGreaterThan(0);
      for (const pool of row.pools) expect(types.has(pool), `${row.id} pool ${pool}`).toBe(true);
    }
  });

  it('every authored row SPEAKS — non-empty copy, distinct, and {name} at most once', () => {
    // FINDING F-110-B LANDS HERE. `resolveExploreOutcome` guards on
    // `wireFound !== ''`, and the legacy rows' empty copy is exactly why §1.3
    // could charge 80 fuel and a die for total silence. A row with no copy is
    // that bug re-authored, so it fails here rather than shipping quietly.
    const seen = new Set<string>();
    for (const row of authored) {
      expect(row.wireFound.length, `${row.id} has empty wireFound`).toBeGreaterThan(0);
      // `{name}` is substituted with String.replace, which replaces the FIRST
      // occurrence only — a second one would ship a literal brace to the wire.
      expect(
        row.wireFound.split('{name}').length - 1,
        `${row.id} {name} count`,
      ).toBeLessThanOrEqual(1);
      // The house voice: third person, the literal subject `Player` (the wire's
      // own convention — `wire.ts` treats the string 'Player' as the player).
      expect(row.wireFound.startsWith('Player'), `${row.id} voice`).toBe(true);
      expect(seen.has(row.wireFound), `${row.id} duplicates another row's copy`).toBe(false);
      seen.add(row.wireFound);
    }
  });

  it('NO authored row carries a recoveryDays key, and none can open a recovery', () => {
    // The compile-time absence of the key on `ExploreOutcomeDefinition` is the
    // real enforcement; this is the runtime belt. The second clause is §5.3's
    // own claim about pass 1: bands 0-1 are `recoveryDays: 0` throughout, so
    // this pass authors nothing that can commit the ship to a salvage op.
    for (const row of authored) {
      expect(Object.keys(row)).not.toContain('recoveryDays');
      expect(recoveryDays(row.valuePoints), `${row.id} opens a recovery`).toBe(0);
    }
  });

  it('salvage rows declare an ordered credit band inside the §5.2 authored range', () => {
    for (const row of authored) {
      if (row.payload.kind !== 'salvage') continue;
      expect(row.payload.minCredits, `${row.id} band order`).toBeLessThanOrEqual(
        row.payload.maxCredits,
      );
      // §5.2 authors band-1 salvage at 40-260cr. Band 2's 240-700 is T-114's.
      expect(row.payload.minCredits).toBeGreaterThanOrEqual(40);
      expect(row.payload.maxCredits).toBeLessThanOrEqual(260);
    }
  });

  it('every fragment a lore row names is a real Signal Fragment', () => {
    for (const row of authored) {
      if (row.payload.kind !== 'lore' || row.payload.fragmentId === undefined) continue;
      expect(ALL_FRAGMENT_IDS, `${row.id} fragment`).toContain(row.payload.fragmentId);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 · The ladder — the distribution matches the spec
// ---------------------------------------------------------------------------

describe("T-113 · the authored table's value distribution matches the §5 ladder", () => {
  it('is exactly the 14 + 20 rows §5.3 assigns to pass 1, and nothing ahead of it', () => {
    expect(authored).toHaveLength(34);
    expect(rowsInBand(0)).toHaveLength(14);
    expect(rowsInBand(1)).toHaveLength(20);
    // T-114 and T-115 own bands 2-4. A row landing there early would be content
    // authored ahead of the ladder that prices it.
    expect(rowsInBand(2)).toHaveLength(0);
    expect(rowsInBand(3)).toHaveLength(0);
    expect(rowsInBand(4)).toHaveLength(0);
  });

  it('every row carries a payload kind its own band permits', () => {
    // Checked against the band table's `permittedKinds` column, NOT against a
    // literal in this file — content owns where the bands sit.
    for (const row of authored) {
      const band = bandOf(row);
      expect(band.permittedKinds, `${row.id} in band ${band.band}`).toContain(row.payload.kind);
    }
  });

  it('every band-0 row is a DEAD END — lore with neither optional field (§2.2)', () => {
    for (const row of rowsInBand(0)) {
      expect(row.valuePoints).toBe(0);
      expect(row.payload.kind).toBe('lore');
      if (row.payload.kind !== 'lore') continue;
      expect(row.payload.fragmentId).toBeUndefined();
      expect(row.payload.effects).toBeUndefined();
      // A dead end still SPEAKS and still charts the POI — the player learns
      // something and keeps the coordinate. The copy is asserted above.
    }
  });

  it('band 1 is 12 salvage rows and 8 fragment-bearing lore rows', () => {
    const band1 = rowsInBand(1);
    expect(band1.filter((row) => row.payload.kind === 'salvage')).toHaveLength(12);
    const lore = band1.filter((row) => row.payload.kind === 'lore');
    expect(lore).toHaveLength(8);
    for (const row of lore) {
      expect(row.payload.kind === 'lore' && row.payload.fragmentId).toBeDefined();
    }
  });

  it("band-1 salvage spans the §5.2 range and averages §5.5's credit-equivalent", () => {
    const mids = salvageMidpoints(1);
    const rows = rowsInBand(1).filter((row) => row.payload.kind === 'salvage');
    const mins = rows.map((row) => (row.payload.kind === 'salvage' ? row.payload.minCredits : 0));
    const maxes = rows.map((row) => (row.payload.kind === 'salvage' ? row.payload.maxCredits : 0));
    // The band's floor and ceiling are REACHED, not merely respected — a table
    // that never touches either end is a narrower band wearing §5.2's label.
    expect(Math.min(...mins)).toBe(40);
    expect(Math.max(...maxes)).toBe(260);
    // §5.5 prices band 1's credit-equivalent at 150cr (the mid of 40-260). The
    // authored rows must average near it or the EV the spec predicts — and that
    // T-116 measures against — is describing a different table.
    const mean = mids.reduce((sum, mid) => sum + mid, 0) / mids.length;
    expect(mean).toBeGreaterThanOrEqual(130);
    expect(mean).toBeLessThanOrEqual(170);
  });

  it('valuePoints rank-orders salvage rows the same way their credits do', () => {
    // A PROPERTY of the table, not a tuned threshold: the one dial an author
    // writes per row has to actually track what the row is worth, or
    // `valuePoints` is decoration and the whole ladder is unanchored.
    const rows = authored.filter((row) => row.payload.kind === 'salvage');
    for (const a of rows) {
      for (const b of rows) {
        if (a.valuePoints >= b.valuePoints) continue;
        const midA =
          a.payload.kind === 'salvage' ? (a.payload.minCredits + a.payload.maxCredits) / 2 : 0;
        const midB =
          b.payload.kind === 'salvage' ? (b.payload.minCredits + b.payload.maxCredits) / 2 : 0;
        expect(
          midA,
          `${a.id} (${a.valuePoints}vp) vs ${b.id} (${b.valuePoints}vp)`,
        ).toBeLessThanOrEqual(midB);
      }
    }
  });

  it('names EXACTLY the three legacy rows still owed a retirement', () => {
    // THE TRIPWIRE for T-114/T-115. Two findings are pinned by this one list:
    //   F-113-B · the two `contraband` rows cannot be retired by a content pass,
    //     because deleting the member from `ExploreOutcomePayload` makes the
    //     engine's exhaustive `case 'contraband':` a tsc error.
    //   F-113-D · `legacy-salvage-derelict` is retired at T-114, not here: the
    //     `rich_hulk` deed fires on a `SalvageRecovered` of 400cr+, band 1 tops
    //     out at 260, and band 2's 240-700 is T-114's pass — so retiring it now
    //     (or even diluting its leg) makes an authored deed effectively unearnable
    //     for one task. `legacy-salvage-beacon` carries no such coupling and IS
    //     retired here, which is why only one salvage row is on this list.
    // Retiring either pair without updating this list fails loudly, which is the
    // point: it names what is still owed rather than letting it lapse.
    const legacy = EXPLORE_OUTCOMES.filter((row) => row.id.startsWith(LEGACY_PREFIX)).map(
      (row) => row.id,
    );
    expect(legacy.sort()).toEqual([
      'legacy-contraband-beacon',
      'legacy-contraband-derelict',
      'legacy-salvage-derelict',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3 · Through the REAL Explore path — one instance of every TYPE in this pass
// ---------------------------------------------------------------------------

/** The `exploreOutcomes.test.ts` helper: a DAY-phase state whose PILOT modifier
 *  guarantees the DC-12 nav check, so only the outcome draw varies. */
function craftExploreState(die: number, pilot: number): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [die], spent: [false] };
  state.player.stats[Stat.PILOT] = pilot;
  state.player.ship.fuel = 1000;
  return state;
}

/** Which authored row a board's wire line came from. The row's copy is unique
 *  (asserted above), so the message is a faithful back-pointer to the row —
 *  which is also why `SalvageRecovered` needing no `outcomeId` costs nothing. */
const ROW_BY_WIRE = new Map(authored.map((row) => [row.wireFound, row]));

function rowForMessage(message: string, poiName: string): ExploreOutcomeDefinition | undefined {
  for (const [copy, row] of ROW_BY_WIRE) {
    if (copy.replace('{name}', poiName) === message) return row;
  }
  return undefined;
}

const SWEEP_SEEDS = 2000;

describe('T-113 · the authored rows resolve through the real Explore path', () => {
  // ONE SWEEP, read several ways. Every board is a real `resolveExploration`
  // call — the verb a player uses, nav check and all — never a hand-called
  // resolver, so what is asserted below is what a player can actually reach.
  const observed = new Map<string, { amount: number | null; poiName: string }>();
  let fragmentBoards = 0;
  let salvageBoards = 0;
  let emptyWireOnBoard = 0;

  for (let seed = 0; seed < SWEEP_SEEDS; seed += 1) {
    const res = resolveExploration(
      craftExploreState(18, 40),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(seed),
    );
    const discovered = res.events.find((e) => e.type === 'PoiDiscovered');
    if (!discovered || discovered.type !== 'PoiDiscovered') continue;
    const poiName = discovered.name;
    let pendingAmount: number | null = null;
    for (const event of res.events) {
      if (event.type === 'SalvageRecovered') {
        pendingAmount = event.amount;
        salvageBoards += 1;
      }
      if (event.type === 'FragmentAcquired') fragmentBoards += 1;
      if (event.type !== 'WireEntry') continue;
      if (event.message === '') emptyWireOnBoard += 1;
      const row = rowForMessage(event.message, poiName);
      if (!row) continue;
      observed.set(row.id, {
        amount: row.payload.kind === 'salvage' ? pendingAmount : null,
        poiName,
      });
      pendingAmount = null;
    }
  }

  it('drives a SALVAGE row: the payout lands inside its authored band, with its copy', () => {
    const salvageRows = authored.filter((row) => row.payload.kind === 'salvage');
    const hit = salvageRows.find((row) => observed.has(row.id));
    expect(hit, 'no authored salvage row resolved in the sweep').toBeDefined();
    expect(salvageBoards).toBeGreaterThan(0);
    const seen = observed.get(hit!.id)!;
    expect(seen.amount).not.toBeNull();
    if (hit!.payload.kind === 'salvage') {
      expect(seen.amount!).toBeGreaterThanOrEqual(hit!.payload.minCredits);
      expect(seen.amount!).toBeLessThanOrEqual(hit!.payload.maxCredits);
    }
  });

  it('drives a LORE row: the fragment is granted and the row speaks', () => {
    const loreRows = authored.filter((row) => row.payload.kind === 'lore');
    const hit = loreRows.find((row) => observed.has(row.id));
    expect(hit, 'no authored lore row resolved in the sweep').toBeDefined();
    expect(hit!.payload.kind === 'lore' && hit!.payload.fragmentId).toBeDefined();
    expect(fragmentBoards).toBeGreaterThan(0);
  });

  it('reaches EVERY row the transitional carrier can draw, at least once', () => {
    // Pre-pays part of T-115's reachability sweep, and is what makes the T-113
    // re-point real rather than nominal: a row wired into a leg but never drawn
    // is content that does not exist as far as a player is concerned.
    const drawable = new Set<string>();
    for (const type of Object.keys(LEGACY_POI_LOOT) as PoiType[]) {
      const table = LEGACY_POI_LOOT[type];
      for (const leg of [table.salvage, table.fragment, table.contraband]) {
        for (const id of leg.outcomeIds) if (!id.startsWith(LEGACY_PREFIX)) drawable.add(id);
      }
    }
    expect(drawable.size).toBe(14);
    const missing = [...drawable].filter((id) => !observed.has(id));
    expect(missing, `unreached authored rows: ${missing.join(', ')}`).toEqual([]);
  });

  it('no boarded POI is ever charged 80 fuel for an EMPTY wire line (§2.4)', () => {
    expect(emptyWireOnBoard).toBe(0);
  });

  it('records EXACTLY which authored rows are still inert, and why', () => {
    // Stated as an assertion so neither gap can be forgotten.
    //
    // F-113-A · the 14 band-0 DEAD ENDS. The transitional carrier has exactly
    //   three named legs and no "nothing else fired" arm, and adding one would be
    //   the engine branch this task is forbidden. They become reachable when the
    //   single band-weighted draw lands.
    // F-113-D · the 6 authored DERELICT salvage rows. Their leg still draws
    //   `legacy-salvage-derelict` alone, because that row is the only source of
    //   the `rich_hulk` deed's 400cr trigger until band 2 is authored. T-114 takes
    //   the re-point together with band 2.
    const inert = authored.filter((row) => !observed.has(row.id)).map((row) => row.id);
    expect(inert.filter((id) => id.startsWith('explore-deadend-'))).toHaveLength(14);
    expect(inert.filter((id) => id.startsWith('explore-salvage-derelict-'))).toHaveLength(6);
    expect(inert).toHaveLength(20);
  });
});
