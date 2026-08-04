import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  POI_KINDS,
  PoiType,
} from '../index.js';

/**
 * T-113 / T-114 · THE CONTENT VALIDATOR for the authored explore table
 * (docs/EXPLORE_REDESIGN.md §5). Two things are asserted here and nowhere else:
 * that every authored ROW IS WELL-FORMED, and that the table's VALUE
 * DISTRIBUTION matches the spec's ladder.
 *
 * T-164 · WHY IT LIVES HERE NOW, BESIDE THE ROWS. `packages/content` had no test
 * runner at all until T-164 stood one up, which is the only reason this file
 * ever lived in the engine suite. The rule that replaces that accident is
 * `docs/TESTING-STRATEGY.md` Part I: a validator whose assertions read only
 * `@spacerquest/content` lives here; a validator that has to resolve a row
 * THROUGH THE ENGINE stays in `packages/engine/src/__tests__/`, because content
 * may never depend on the engine (npm workspace cycle, `tsc -b` project-reference
 * cycle — see `contentPackageBoundary.test.ts`, which enforces it).
 *
 * SO THE OLD FILE SPLIT RATHER THAN MOVED. Sections 1 and 2 — well-formedness
 * and the §5 ladder — are here. Sections 3-5 (id resolution against the live
 * roster, the real-`resolveExploration` reachability sweep, and the band-2 dusk
 * payout) stay in `packages/engine/src/__tests__/exploreContent.test.ts`, which
 * still names this file as its sibling. One assertion pair crossed the line the
 * other way: `recoveryDays`/`apCost` are ENGINE functions, so the second half of
 * the "no row carries a recoveryDays or apCost key" test is now an engine `it`.
 *
 * IT COSTS NO CAPSTONE. `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES`
 * (`packages/sim/src/balance/rules-fingerprint.ts`), so the walk skips this
 * directory before the undeclared-directory guard fires and nothing under it is
 * hashed into `rulesFingerprint`. The corollary is load-bearing: a content test
 * must live under `src/__tests__/` and NOWHERE ELSE — any other new directory
 * under `packages/content/src` throws by design.
 *
 * T-114 · EVERY ASSERTION THAT WAS BAND-1-ONLY IS NOW BAND-SCOPED. Those are
 * corrections of SCOPE, not of value: the credit range, the recovery clock and
 * the row counts are all read off `EXPLORE_VALUE_BANDS` or off a per-band table
 * transcribed from §5.2, so a band-2 row is checked against band 2's own column
 * rather than against band 1's.
 *
 * T-115 · `authored` AND `EXPLORE_OUTCOMES` ARE NOW THE SAME 100 ROWS. Until this
 * pass the two differed by the transitional `legacy-contraband-*` rows, and every
 * assertion here was scoped to the authored subset so those rows could not pollute
 * the ladder. They are deleted with the draw flip (F-113-B discharged), so the
 * filter below is kept for ONE reason only: the tripwire in section 2 asserts it
 * removes nothing. A future `legacy-` row would fail loudly rather than quietly
 * exempting itself from every check in this file.
 */

const LEGACY_PREFIX = 'legacy-';
const authored = EXPLORE_OUTCOMES.filter((row) => !row.id.startsWith(LEGACY_PREFIX));

/** §5.2's authored salvage credit ranges, per band, transcribed from the spec —
 *  NOT read back off the rows, or the assertion would only restate them. Bands
 *  0, 3 and 4 author no salvage at all (band 0 is dead ends; bands 3-4 are
 *  non-salvage by design), which is asserted rather than assumed. */
const SALVAGE_RANGE_BY_BAND: Readonly<Record<number, { min: number; max: number } | null>> = {
  0: null,
  1: { min: 40, max: 260 },
  2: { min: 240, max: 700 },
  3: null,
  4: null,
};

/** §5.5's credit-equivalent per band — the figure the spec prices the ladder's
 *  EV on, and therefore the figure the authored midpoints have to average near
 *  or the EV T-116 measures against is describing a different table. The window
 *  is derived from the spec figure (±~6%), never from what happened to be
 *  authored. */
const CREDIT_EQUIVALENT_BY_BAND: Readonly<Record<number, { target: number; window: number }>> = {
  1: { target: 150, window: 20 },
  2: { target: 470, window: 30 },
};

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

function salvageMidpoint(row: ExploreOutcomeDefinition): number {
  return row.payload.kind === 'salvage' ? (row.payload.minCredits + row.payload.maxCredits) / 2 : 0;
}

/** Salvage rows in a band, with their credit midpoint — the figure §5.5 prices a
 *  band's credit-equivalent on. */
function salvageMidpoints(band: number): number[] {
  return rowsInBand(band)
    .filter((row) => row.payload.kind === 'salvage')
    .map(salvageMidpoint);
}

// ---------------------------------------------------------------------------
// 1 · Well-formedness — every authored row
// ---------------------------------------------------------------------------

describe('T-113/T-114 · every authored explore row is well-formed', () => {
  it('ids are unique across the WHOLE table and follow the naming convention', () => {
    const ids = EXPLORE_OUTCOMES.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of authored) {
      // An id is the ONLY thing a save stores about an outcome
      // (`player.recovery.outcomeId`), so it is a compatibility surface: a row
      // that is ever re-banded must keep the id it shipped with. The convention
      // therefore describes the SHAPE, never the band — which is why T-114's
      // band-2 rows widen the shape list rather than adding a band segment.
      expect(row.id, `${row.id} is not an explore- id`).toMatch(
        /^explore-(deadend|salvage|lore|item|npc|quest)-[a-z0-9-]+$/,
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

  it('EVERY row in the table SPEAKS — non-empty copy, distinct, and {name} at most once', () => {
    // FINDING F-110-B LANDS HERE. `resolveExploreOutcome` guards on
    // `wireFound !== ''`, and the legacy rows' empty copy is exactly why §1.3
    // could charge 80 fuel and a die for total silence. A row with no copy is
    // that bug re-authored, so it fails here rather than shipping quietly.
    //
    // T-115 · RUN OVER `EXPLORE_OUTCOMES` DIRECTLY, not over the authored subset.
    // With the two empty-`wireFound` legacy rows deleted, "every row speaks" is
    // unconditional — which is §2.4's silent-return fix finally true BY SHAPE,
    // and it makes the engine's `!== ''` guard vacuous rather than load-bearing.
    const seen = new Set<string>();
    for (const row of EXPLORE_OUTCOMES) {
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

  it('NO authored row carries a recoveryDays or apCost key', () => {
    // The compile-time absence of the keys on `ExploreOutcomeDefinition` is the
    // real enforcement; this is the runtime belt.
    //
    // T-164 · THIS TEST SPLIT WITH THE FILE, and the split is exactly the rule in
    // `docs/TESTING-STRATEGY.md` Part I. The key-ABSENCE half is a claim about the
    // authored rows and reads nothing but content, so it lives here. The other
    // half — that `recoveryDays(vp)` and `apCost(vp)` return the row's BAND's
    // figures — calls two ENGINE functions (`../exploreOutcomes.js`) that content
    // cannot import, so it is now an engine `it` of its own in
    // `packages/engine/src/__tests__/exploreContent.test.ts`. Both comments travel
    // with the half they explain; no assertion was dropped in the move.
    for (const row of authored) {
      expect(Object.keys(row)).not.toContain('recoveryDays');
      expect(Object.keys(row)).not.toContain('apCost');
    }
  });

  it('T-131 · NO band charges BOTH calendar days AND extra dice', () => {
    // THE LOAD-BEARING INVARIANT of owner ruling D1, written as a test and not as
    // a comment. WHY it holds and must keep holding: a band is drawn AFTER the
    // nav check, with the sweep's own die and the 80 fuel already spent, and the
    // `apCost` is charged out of THAT SAME dawn hand at claim. A row that also
    // deferred N days would have to charge dice at a later dusk, when there is no
    // dawn hand left to charge against — so an `apCost` row can only ever resolve
    // same-day. The two costs are alternatives, never a sum.
    for (const band of EXPLORE_VALUE_BANDS) {
      expect(
        band.recoveryDays > 0 && band.apCost > 0,
        `band ${band.band} charges ${band.recoveryDays} days AND ${band.apCost} dice`,
      ).toBe(false);
    }
  });

  it('T-131 · every band‘s apCost is a non-negative integer, on the D1 ladder', () => {
    for (const band of EXPLORE_VALUE_BANDS) {
      expect(Number.isInteger(band.apCost), `band ${band.band} apCost`).toBe(true);
      expect(band.apCost, `band ${band.band} apCost`).toBeGreaterThanOrEqual(0);
    }
    // The ladder D1 ruled, pinned by index: bands 0-2 free, band 3 two extra
    // dice, band 4 three. These two numbers are FIRST-PASS and expected to move
    // by playtest — when they do, this line moves with the band table and the
    // ruling that authorises it, never on its own to make something else green.
    expect(EXPLORE_VALUE_BANDS.map((band) => band.apCost)).toEqual([0, 0, 0, 2, 3]);
  });

  it('salvage rows declare an ordered credit band inside their OWN band‘s §5.2 range', () => {
    for (const row of authored) {
      if (row.payload.kind !== 'salvage') continue;
      const band = bandOf(row);
      const range = SALVAGE_RANGE_BY_BAND[band.band];
      expect(range, `${row.id} is salvage in band ${band.band}, which authors none`).not.toBeNull();
      expect(row.payload.minCredits, `${row.id} band order`).toBeLessThanOrEqual(
        row.payload.maxCredits,
      );
      expect(row.payload.minCredits, `${row.id} floor`).toBeGreaterThanOrEqual(range!.min);
      expect(row.payload.maxCredits, `${row.id} ceiling`).toBeLessThanOrEqual(range!.max);
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

describe("T-113/T-114 · the authored table's value distribution matches the §5 ladder", () => {
  it('THE TABLE TOTALS 100 OUTCOMES, in the 14/20/33/25/8 spread §5.3 lays out', () => {
    // T-115's first accept clause, mechanically. Asserted BOTH ways round on
    // purpose: `EXPLORE_OUTCOMES` is what the engine draws from and `authored` is
    // what every other assertion in this file is scoped to, and the two being
    // EQUAL is what makes "the table totals 100" a claim with no asterisk on it.
    expect(EXPLORE_OUTCOMES).toHaveLength(100);
    expect(authored).toHaveLength(100);
    expect(rowsInBand(0)).toHaveLength(14);
    expect(rowsInBand(1)).toHaveLength(20);
    expect(rowsInBand(2)).toHaveLength(33);
    expect(rowsInBand(3)).toHaveLength(25);
    expect(rowsInBand(4)).toHaveLength(8);
  });

  it('THE DRAW WEIGHTS are §5.2 verbatim: five positive weights summing to 100', () => {
    // The sixth column, landed at T-117 with its consumer (`drawOutcome`). Two
    // invariants, both structural:
    //   - every weight is POSITIVE, or a band's rows would be unreachable no
    //     matter how many seeds the sweep in the engine-side section 4 burns;
    //   - the weights SUM TO 100, which is what makes a weight readable as a
    //     percentage of successful boards and what §5.3's per-row arithmetic
    //     (`bandWeight / rowsInBand`) is computed against.
    expect(EXPLORE_VALUE_BANDS.map((band) => band.weight)).toEqual([25, 33, 24, 15, 3]);
    for (const band of EXPLORE_VALUE_BANDS) {
      expect(band.weight, `band ${band.band} weight`).toBeGreaterThan(0);
    }
    expect(EXPLORE_VALUE_BANDS.reduce((sum, band) => sum + band.weight, 0)).toBe(100);
  });

  it('EVERY BAND HAS A ROW IN EVERY POOL — no pool is missing a rung (§2.5, §5.3)', () => {
    // POOL DISCIPLINE, and it is a reachability property rather than a style
    // rule. `drawOutcome` renormalises the band weights over the bands that
    // actually have rows in the pool it is drawing for, so a band with no beacon
    // row would silently hand its 15% (or 3%) to the other bands ON BEACONS — and
    // the §5.3 arithmetic the sweep is sized from would be describing a table
    // that does not exist. Asserting it here is cheaper than discovering it as a
    // mysteriously unreachable row.
    for (const band of EXPLORE_VALUE_BANDS) {
      for (const pool of Object.keys(POI_KINDS) as PoiType[]) {
        const rows = rowsInBand(band.band).filter((row) => row.pools.includes(pool));
        expect(rows.length, `band ${band.band} has no ${pool} row`).toBeGreaterThan(0);
      }
    }
  });

  it('every row carries a payload kind its own band permits', () => {
    // Checked against the band table's `permittedKinds` column, NOT against a
    // literal in this file — content owns where the bands sit. Band 2's column
    // gained `questline` at T-114 (finding F-114-A: §5.2's cell contradicted
    // §5.3, §8 and this task's charter, and the majority reading won).
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

  it('band 2 is the 14 + 8 + 6 + 3 + 2 spread §5.3 pass 2 authors', () => {
    const band2 = rowsInBand(2);
    const counted = (kind: string): number =>
      band2.filter((row) => row.payload.kind === kind).length;
    expect(counted('salvage')).toBe(14);
    expect(counted('unique-item')).toBe(8);
    expect(counted('npc')).toBe(6);
    expect(counted('questline')).toBe(3);
    expect(counted('lore')).toBe(2);
    // The two band-2 lore rows carry EFFECTS, never a fragment — the eight
    // fragment-bearing rows are derived from the pools at band 1, and a second
    // row per fragment would duplicate that coverage.
    for (const row of band2.filter((r) => r.payload.kind === 'lore')) {
      expect(row.payload.kind === 'lore' && row.payload.fragmentId).toBeUndefined();
      expect(row.payload.kind === 'lore' && row.payload.effects).toBeDefined();
    }
  });

  it('band 3 is the 14 + 6 + 5 spread §5.3 pass 3 authors', () => {
    const band3 = rowsInBand(3);
    const counted = (kind: string): number =>
      band3.filter((row) => row.payload.kind === kind).length;
    expect(counted('unique-item')).toBe(14);
    expect(counted('questline')).toBe(6);
    expect(counted('npc')).toBe(5);
    // Bands 3 and 4 are NON-SALVAGE BY DESIGN (§5.2's provenance note): the two
    // authored credit ranges stop at band 2's 700cr, so a salvage row up here
    // would be a credit figure with no band behind it.
    expect(counted('salvage')).toBe(0);
    expect(counted('lore')).toBe(0);
  });

  it('band 4 is the 6 + 2 spread §5.3 pass 3 authors', () => {
    const band4 = rowsInBand(4);
    const counted = (kind: string): number =>
      band4.filter((row) => row.payload.kind === kind).length;
    expect(counted('unique-item')).toBe(6);
    expect(counted('questline')).toBe(2);
    expect(counted('salvage')).toBe(0);
    expect(counted('npc')).toBe(0);
    expect(counted('lore')).toBe(0);
  });

  it.each([1, 2])(
    "band-%i salvage spans the §5.2 range and averages §5.5's credit-equivalent",
    (band) => {
      const range = SALVAGE_RANGE_BY_BAND[band]!;
      const rows = rowsInBand(band).filter((row) => row.payload.kind === 'salvage');
      const mins = rows.map((row) => (row.payload.kind === 'salvage' ? row.payload.minCredits : 0));
      const maxes = rows.map((row) =>
        row.payload.kind === 'salvage' ? row.payload.maxCredits : 0,
      );
      // The band's floor and ceiling are REACHED, not merely respected — a table
      // that never touches either end is a narrower band wearing §5.2's label.
      expect(Math.min(...mins)).toBe(range.min);
      expect(Math.max(...maxes)).toBe(range.max);
      // §5.5 prices band 1 at 150cr and band 2 at 470cr. The authored rows must
      // average near their band's figure or the EV the spec predicts — and that
      // T-116 measures against — is describing a different table.
      const mids = salvageMidpoints(band);
      const { target, window } = CREDIT_EQUIVALENT_BY_BAND[band];
      const mean = mids.reduce((sum, mid) => sum + mid, 0) / mids.length;
      expect(mean).toBeGreaterThanOrEqual(target - window);
      expect(mean).toBeLessThanOrEqual(target + window);
    },
  );

  it('valuePoints rank-orders salvage rows the same way their credits do', () => {
    // A PROPERTY of the table, not a tuned threshold: the one dial an author
    // writes per row has to actually track what the row is worth, or
    // `valuePoints` is decoration and the whole ladder is unanchored. Checked
    // across the WHOLE authored salvage set, so bands 1 and 2 have to agree with
    // each other and not merely each with itself.
    const rows = authored.filter((row) => row.payload.kind === 'salvage');
    for (const a of rows) {
      for (const b of rows) {
        if (a.valuePoints >= b.valuePoints) continue;
        expect(
          salvageMidpoint(a),
          `${a.id} (${a.valuePoints}vp) vs ${b.id} (${b.valuePoints}vp)`,
        ).toBeLessThanOrEqual(salvageMidpoint(b));
      }
    }
  });

  it('NO legacy row survives — F-113-A and F-113-B are discharged, visibly', () => {
    // THE SAME TRIPWIRE, WITH ITS CLAIM FLIPPED. It has named what the table
    // still owed since T-113, and what it owed is now paid:
    //
    //   F-113-A · the single band-weighted draw. T-117 — the dedicated engine
    //     task F-113-A asked for — landed `drawOutcome` reading the new `weight`
    //     column, and deleted the three-leg carrier `LEGACY_POI_LOOT` with it.
    //   F-113-B · the `contraband` payload kind. Deleting the union member was
    //     always engine work (the exhaustive `case 'contraband':` is a tsc error
    //     without it), which is why three content passes could not do it. T-117 is
    //     engine work by construction, so it retired there. The sealed-pod
    //     carry choice it armed is re-homed onto three band-1 derelict lore rows
    //     (`DERELICT_POD_EFFECTS`), not deleted.
    //
    // KEPT RATHER THAN DELETED, deliberately: the ledger is discharged where it
    // can be seen, and a `legacy-` row re-appearing in the table would fail here
    // instead of quietly exempting itself from every other check in this file.
    const legacy = EXPLORE_OUTCOMES.filter((row) => row.id.startsWith(LEGACY_PREFIX)).map(
      (row) => row.id,
    );
    expect(legacy).toEqual([]);
  });
});
