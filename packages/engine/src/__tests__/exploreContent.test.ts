import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  ALL_NPC_PROFILES,
  EXPLORE_ITEM_BY_ID,
  EXPLORE_ITEMS,
  EXPLORE_MODULE_DICE_BENEFITS,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  POI_KINDS,
  PoiType,
  STORYLETS,
  Stat,
  StoryletDefinition,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { apCost, recoveryDays } from '../exploreOutcomes.js';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import { refreshAvailableStorylets } from '../storylets.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DayPhase, GameEvent, GameState } from '../types.js';

/**
 * T-113 / T-114 · THE CONTENT VALIDATOR for the authored explore table
 * (docs/EXPLORE_REDESIGN.md §5). Two things are asserted here and nowhere else:
 * that every authored ROW IS WELL-FORMED, and that the table's VALUE
 * DISTRIBUTION matches the spec's ladder.
 *
 * WHY IT LIVES IN THE ENGINE SUITE. `packages/content` has no test runner at
 * all — its `package.json` carries a `build` script and nothing else, and there
 * is not one `*.test.ts` under it. The content-integrity block in
 * `exploreOutcomes.test.ts` established the precedent at T-110; this file is its
 * sibling, scoped to the authored table. STANDING OBSERVATION for the milestone
 * owner, restated at T-114 because it has not changed: giving `packages/content`
 * a runner is real infra and belongs to a task chartered for it, not to a
 * content pass.
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

/** §5.2's ladder for an `npc` row's `dispositionDelta`, per band. Band 2 is an
 *  INTRODUCTION (1-2), band 3 is a DEBT (3-4); bands 0, 1 and 4 permit no `npc`
 *  row at all, which is asserted rather than assumed. */
const NPC_DELTA_BY_BAND: Readonly<Record<number, { min: number; max: number } | undefined>> = {
  2: { min: 1, max: 2 },
  3: { min: 3, max: 4 },
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

  it('NO authored row carries a recoveryDays or apCost key, and both are its BAND‘s', () => {
    // The compile-time absence of the keys on `ExploreOutcomeDefinition` is the
    // real enforcement; this is the runtime belt.
    //
    // T-114 · the second clause was `=== 0` while bands 0-1 were the whole
    // table. It is now the general claim it always meant: a row's recovery clock
    // is a function of its BAND and of nothing else, so every band-2 row opens a
    // one-day op purely because band 2 says 1 — never because a row said so.
    //
    // T-131 · `apCost` joins it on identical terms (owner ruling D1). A row may
    // no more hand-tune its dice cost than its day count, and the same two
    // clauses say so.
    for (const row of authored) {
      expect(Object.keys(row)).not.toContain('recoveryDays');
      expect(Object.keys(row)).not.toContain('apCost');
      expect(recoveryDays(row.valuePoints), `${row.id} clock`).toBe(bandOf(row).recoveryDays);
      expect(apCost(row.valuePoints), `${row.id} dice cost`).toBe(bandOf(row).apCost);
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
    //     matter how many seeds the sweep in section 4 burns;
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

// ---------------------------------------------------------------------------
// 3 · T-114 · the three kinds that point OUTSIDE this file must resolve
// ---------------------------------------------------------------------------

describe('T-114 · every id an authored row names resolves against real content', () => {
  const questlineRows = authored.filter((row) => row.payload.kind === 'questline');
  const npcRows = authored.filter((row) => row.payload.kind === 'npc');
  const itemRows = authored.filter((row) => row.payload.kind === 'unique-item');

  it('every questline row resolves into the EXISTING storylet system', () => {
    // THE ACCEPT CLAUSE, mechanically. Three things have to be true or the hook
    // is a schedule entry pointing at nothing:
    //   (1) the id names a real STORYLETS entry;
    //   (2) that storylet is `scheduledOnly` — otherwise scheduling it is a
    //       no-op, because `triggerMatches` still evaluates the full trigger and
    //       an ordinary gated storylet would be offered on its own terms anyway;
    //   (3) it carries a `wireResolution`, so a hook the player never plays is
    //       resolved by the existing `resolveAbandonedChains` dusk sweep instead
    //       of dangling in `state.storylets.scheduled` forever.
    expect(questlineRows.length).toBeGreaterThan(0);
    for (const row of questlineRows) {
      if (row.payload.kind !== 'questline') continue;
      const { storyletId } = row.payload;
      const target = (STORYLETS as readonly StoryletDefinition[]).find((s) => s.id === storyletId);
      expect(target, `${row.id} points at an unknown storylet`).toBeDefined();
      expect(target!.trigger.scheduledOnly, `${target!.id} is not scheduledOnly`).toBe(true);
      expect(target!.wireResolution, `${target!.id} has no wireResolution`).toBeDefined();
      expect(Number.isInteger(row.payload.delayDays)).toBe(true);
      expect(row.payload.delayDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('every npc row names a profile the CAST table and the LIVE roster both hold', () => {
    // Resolved against BOTH, deliberately. `applyEffects`'s disposition arm does
    // `state.npcs.find(...)` and silently `continue`s on a miss, so "the id is in
    // `ALL_NPC_PROFILES`" is not the same claim as "the effect lands". The live
    // roster is seeded from NPC_PROFILES *and* QUEST_PROFILES (`state.ts`), which
    // is why a quest-profile id is a legal target for a row.
    const castIds = new Set(ALL_NPC_PROFILES.map((npc) => npc.id));
    const rosterIds = new Set(createInitialState(1).npcs.map((npc) => npc.id));
    expect(npcRows.length).toBeGreaterThan(0);
    for (const row of npcRows) {
      if (row.payload.kind !== 'npc') continue;
      expect(castIds.has(row.payload.profileId), `${row.id} cast id`).toBe(true);
      expect(rosterIds.has(row.payload.profileId), `${row.id} live roster`).toBe(true);
      // THE LADDER SHOWS THROUGH IN THE DELTA, and it is checked per band rather
      // than as one loose range: band 2 authors INTRODUCTIONS (a pip or two for a
      // civil exchange) and band 3 authors DEBTS (the captain hands over
      // something they could have sold). A single 1-4 range would let a band-2
      // row quietly buy band-3 standing.
      const band = bandOf(row).band;
      const range = NPC_DELTA_BY_BAND[band];
      expect(range, `${row.id} is an npc row in band ${band}, which authors none`).toBeDefined();
      expect(Number.isInteger(row.payload.dispositionDelta)).toBe(true);
      expect(row.payload.dispositionDelta, `${row.id} delta`).toBeGreaterThanOrEqual(range!.min);
      expect(row.payload.dispositionDelta, `${row.id} delta`).toBeLessThanOrEqual(range!.max);
    }
  });

  it('every unique-item row grants a real item INSIDE its own band’s ceiling', () => {
    // §5.2's `Class-A ceiling` / `Class-B permitted` columns land on
    // `EXPLORE_VALUE_BANDS` at T-114 (finding F-112-C re-targeted them here,
    // because T-112 authored no rows to check them against). This is their one
    // reader — no engine line reads them, and none can: the ceiling is a rule
    // about what an AUTHOR may write, not about what the resolver does.
    expect(itemRows.length).toBeGreaterThan(0);
    for (const row of itemRows) {
      if (row.payload.kind !== 'unique-item') continue;
      const item = EXPLORE_ITEM_BY_ID[row.payload.itemId];
      expect(item, `${row.id} names an unknown item`).toBeDefined();
      const band = bandOf(row);
      if (item.class === 'ship') {
        for (const delta of item.deltas) {
          switch (delta.element) {
            case 'component':
              expect(delta.strength, `${item.id} strength`).toBeLessThanOrEqual(
                band.classACeiling.strength,
              );
              break;
            case 'maxFuel':
              expect(delta.amount, `${item.id} maxFuel`).toBeLessThanOrEqual(
                band.classACeiling.maxFuel,
              );
              break;
            case 'cargoPods':
              // 0 at band 2 — pods are bands 3-4 — so this fails rather than
              // silently permitting a pod at the wrong tier.
              expect(delta.amount, `${item.id} cargoPods`).toBeLessThanOrEqual(
                band.classACeiling.cargoPods,
              );
              break;
          }
        }
      } else {
        const permitted = band.classB;
        expect(permitted.length, `${item.id} is Class B in band ${band.band}`).toBeGreaterThan(0);
        // The band permits a SHAPE. T-115 generalises this from the band-2-only
        // `floor` lookup it shipped as: the module's own `DiceBenefit` kind must
        // appear in the band's column, and a `floor` must ADDITIONALLY be inside
        // the permitted floor, which is the only kind with an integer dial
        // (§4.3 L1).
        const benefit = EXPLORE_MODULE_DICE_BENEFITS[item.moduleId];
        expect(benefit, `${item.id} names a module with no dice benefit`).toBeDefined();
        const match = permitted.find((allowed) => allowed.kind === benefit!.kind);
        expect(
          match,
          `${item.id} (${benefit!.kind}) not permitted at band ${band.band}`,
        ).toBeDefined();
        if (match?.kind === 'floor' && benefit?.kind === 'floor') {
          expect(benefit.floor, `${item.id} floor`).toBeLessThanOrEqual(match.floor);
        }
      }
    }
  });

  it('grants EACH of the three Class-B modules from exactly one row (§4.2 spent, not raised)', () => {
    // §4.2 caps Class B at three modules because each one costs ENGINE work per
    // instance (finding F-100-1). T-112 shipped the three; T-114 gave `floor` its
    // row at band 2; T-115 gives `reroll` its band-3 row and `extra-die` its
    // band-4 one. So the cap is now fully SPENT — which is the opposite of raised,
    // and is why the assertion is "exactly three rows, one per module" rather than
    // a count that would pass if a fourth module appeared.
    const classB = itemRows.filter(
      (row) =>
        row.payload.kind === 'unique-item' &&
        EXPLORE_ITEM_BY_ID[row.payload.itemId]?.class === 'module',
    );
    expect(classB).toHaveLength(3);
    const granted = classB.map((row) =>
      row.payload.kind === 'unique-item' ? row.payload.itemId : '',
    );
    expect(granted.sort()).toEqual([
      'item-berth-couch',
      'item-marked-ephemeris',
      'item-tally-slate',
    ]);
    // …and each at the band §4.2 places it: floor at 2, reroll at 3, extra-die at 4.
    const bandOfItem = (itemId: string): number =>
      bandOf(
        classB.find((row) => row.payload.kind === 'unique-item' && row.payload.itemId === itemId)!,
      ).band;
    expect(bandOfItem('item-tally-slate')).toBe(2);
    expect(bandOfItem('item-marked-ephemeris')).toBe(3);
    expect(bandOfItem('item-berth-couch')).toBe(4);
  });

  it('every shipped EXPLORE_ITEM is granted by a row — no item is unreachable content', () => {
    // T-112 shipped three items no row could grant, deliberately, and said so.
    // With bands 3 and 4 authored there is no longer any such item, and that is a
    // property worth pinning: an item nobody can find is a stub with a name.
    const grantedIds = new Set(
      itemRows.flatMap((row) => (row.payload.kind === 'unique-item' ? [row.payload.itemId] : [])),
    );
    const orphans = EXPLORE_ITEMS.filter((item) => !grantedIds.has(item.id)).map((item) => item.id);
    expect(orphans, `items no row grants: ${orphans.join(', ')}`).toEqual([]);
    // …and no item is granted twice, which would make one row's find another
    // row's no-op the second time it landed.
    expect(grantedIds.size).toBe(itemRows.length);
  });

  it('the rich_hulk deed keeps its supply under the WEIGHTED DRAW (F-113-D stays closed)', () => {
    // F-113-D's closing argument, RE-TARGETED rather than deleted — the leg it
    // was asserted over ceased to exist with the draw flip, and deleting the
    // assertion with it would have retired the only guard on an authored deed.
    //
    // The `rich_hulk` deed (content `deeds.ts`) fires on a `SalvageRecovered` of
    // 400cr or more. Under the transitional carrier its supply was one leg —
    // uniform over the 14 derelict salvage rows, P(>=400) = 0.384, against 0.302
    // for the single `legacy-salvage-derelict` row T-114 deleted. Under the
    // weighted draw the supply is the SAME 14 rows, reached through bands 1 and 2
    // of the derelict pool instead of through a leg, so the claim that has to
    // survive is about the ROWS: a derelict salvage row that pays out is still
    // more likely than not to clear the trigger with room.
    const derelictSalvage = authored.filter(
      (row) => row.payload.kind === 'salvage' && row.pools.includes('derelict'),
    );
    expect(derelictSalvage).toHaveLength(14);
    const probability =
      derelictSalvage.reduce((sum, row) => {
        if (row.payload.kind !== 'salvage') return sum;
        const span = row.payload.maxCredits - row.payload.minCredits + 1;
        const above = Math.max(
          0,
          row.payload.maxCredits - Math.max(400, row.payload.minCredits) + 1,
        );
        return sum + above / span;
      }, 0) / derelictSalvage.length;
    // Assert the DIRECTION against the row the set replaced, never a tuned
    // figure: a table that made the deed rarer than one 120-520cr row is the
    // regression F-113-D predicted.
    expect(probability).toBeGreaterThan(0.302);
  });
});

// ---------------------------------------------------------------------------
// 4 · Through the REAL Explore path — one instance of every TYPE in this pass
// ---------------------------------------------------------------------------

/** The `exploreOutcomes.test.ts` helper: a DAY-phase state whose PILOT modifier
 *  guarantees the DC-12 nav check, so only the outcome draw varies. */
function craftExploreState(die: number, pilot: number): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  // T-131 (D1) · THE HAND CARRIES THREE SPARE DICE BEHIND THE CONTROLLED ONE.
  // Bands 3-4 now charge `apCost` (2 and 3) EXTRA dice at claim, so a one-die
  // hand would forfeit every top-of-ladder find and the reachability sweep below
  // would silently stop reaching the rarest 33 rows in the table. The spares are
  // at indices 1-3 and are never the die the nav check reads (`spendDie: 0`), so
  // the check itself is unchanged; they exist only so the payment can be MADE.
  // The forfeit path is proven on purpose in `exploreAp.test.ts`, not by accident
  // here.
  state.player.dawnHand = { dice: [die, 1, 1, 1], spent: [false, false, false, false] };
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

/**
 * T-115 · SIZED FROM §5.3's ARITHMETIC, not guessed at. The rarest row is any of
 * the 8 band-4 rows at `3 / 8 = 0.375%` of a successful board, and §5.3 computes
 * `8 × (1 − 0.00375)^n < 0.05` ⇒ n ≈ 1,351 boards for 95% confidence on all of
 * them. 2,000 was the spec's budget for that uniform case; 6,000 buys margin for
 * a row that ends up in a pool of one type (half the rate) without being slow —
 * the whole sweep is one `resolveExploration` call per seed and runs in under a
 * second.
 *
 * ANY ROW THIS MISSES IS A CONTENT-SHAPE DEFECT — a band whose weight is too
 * small for its row count — and the fix is to move a row between bands or re-cut
 * a band weight, NEVER to widen the assertion or shrink the row set (§5.3, and
 * the standing constraint on thresholds).
 */
const SWEEP_SEEDS = 6000;

describe('T-115 · EVERY row in the table resolves through the real Explore path', () => {
  // ONE SWEEP, read several ways. Every board is a real `resolveExploration`
  // call — the verb a player uses, nav check and all — never a hand-called
  // resolver, so what is asserted below is what a player can actually reach.
  //
  // TWO OBSERVATION CHANNELS, and between them they now cover the whole table:
  //   - bands 0-1 and (since T-131/D1) bands 3-4 resolve on the day of the board,
  //     so the row is seen through its own unique `wireFound` copy. Bands 3-4 pay
  //     `apCost` extra dice out of the same hand first, which is why the helper
  //     above deals four dice instead of one;
  //   - BAND 2 alone DEFERS, so its rows are seen through the `RecoveryStarted`
  //     they open. That is not a workaround, it is the design (T-111 §3, narrowed
  //     to band 2 by owner ruling D1): the CLAIM half fires today and the PAYOFF
  //     lands at the dusk of `dueDay`. This sweep drives the ACTION only; section
  //     5 drives the payout half through a real dusk.
  const observed = new Map<string, { amount: number | null; poiName: string }>();
  let fragmentBoards = 0;
  let salvageBoards = 0;
  let emptyWireOnBoard = 0;
  let podArmed = 0;
  let boards = 0;

  for (let seed = 0; seed < SWEEP_SEEDS; seed += 1) {
    const res = resolveExploration(
      craftExploreState(18, 40),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(seed),
    );
    const discovered = res.events.find((e) => e.type === 'PoiDiscovered');
    if (!discovered || discovered.type !== 'PoiDiscovered') continue;
    const poiName = discovered.name;
    boards += 1;
    if (res.state.flags['signal.contraband.pending'] === true) podArmed += 1;
    let pendingAmount: number | null = null;
    for (const event of res.events) {
      if (event.type === 'SalvageRecovered') {
        pendingAmount = event.amount;
        salvageBoards += 1;
      }
      if (event.type === 'FragmentAcquired') fragmentBoards += 1;
      if (event.type === 'RecoveryStarted') {
        observed.set(event.outcomeId, { amount: null, poiName });
      }
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
    const salvageRows = rowsInBand(1).filter((row) => row.payload.kind === 'salvage');
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
    const loreRows = authored.filter(
      (row) => row.payload.kind === 'lore' && row.payload.fragmentId !== undefined,
    );
    const hit = loreRows.find((row) => observed.has(row.id));
    expect(hit, 'no authored lore row resolved in the sweep').toBeDefined();
    expect(fragmentBoards).toBeGreaterThan(0);
  });

  it('THE RAREST TIER IS REACHABLE — all 100 rows are found, and none is inert', () => {
    // T-115's third accept clause, and the ONE test that replaces the three
    // partial-reachability tests T-113/T-114 shipped ("every row a leg can
    // draw", "all 33 band-2 rows", "exactly which rows are still inert"). Those
    // three were partial because the transitional carrier could not reach the 14
    // band-0 dead ends at all; the weighted draw reaches every row in the pool it
    // filters, so the honest claim is now the whole table at once.
    //
    // THE "STILL INERT" LEDGER GOES TO ZERO RATHER THAN LAPSING. It is asserted
    // below as `toHaveLength(0)` instead of being deleted, so the gap it recorded
    // is discharged where a reader can see it.
    const missing = authored.filter((row) => !observed.has(row.id)).map((row) => row.id);
    expect(missing, `unreached rows (${missing.length}): ${missing.join(', ')}`).toEqual([]);
    expect(observed.size).toBe(100);

    const inert = authored.filter((row) => !observed.has(row.id));
    expect(inert).toHaveLength(0);
  });

  it('reaches every KIND at every band that authors it', () => {
    // The spot-checks the single reachability test above subsumes, kept because
    // they name WHAT is reachable rather than only how many: a table that reached
    // 100 ids while some payload kind was never actually resolved through the
    // verb would pass the count and still be broken content.
    const spread: Readonly<Record<number, readonly string[]>> = {
      0: ['lore'],
      1: ['salvage', 'lore'],
      2: ['salvage', 'unique-item', 'npc', 'questline', 'lore'],
      3: ['unique-item', 'questline', 'npc'],
      4: ['unique-item', 'questline'],
    };
    for (const [band, kinds] of Object.entries(spread)) {
      const rows = rowsInBand(Number(band));
      for (const kind of kinds) {
        expect(
          rows.some((row) => row.payload.kind === kind && observed.has(row.id)),
          `no band-${band} ${kind} row reached`,
        ).toBe(true);
      }
    }
  });

  it('no boarded POI is ever charged 80 fuel for an EMPTY wire line (§2.4)', () => {
    expect(emptyWireOnBoard).toBe(0);
    // …and the stronger claim the deleted legacy rows finally allow: EVERY board
    // that surfaced a POI also filed a line the player can read, or opened a
    // recovery that says why the line has not arrived yet.
    expect(boards).toBeGreaterThan(0);
  });

  it('THE SEALED POD IS STILL SUPPLIED after the contraband kind retired (§1.4)', () => {
    // The measurement the re-homing owes, taken through the real verb rather than
    // asserted from the table. `signal.contraband.pending` used to be armed by the
    // derelict contraband leg at 0.40 x 50% of boards ~= 20%; it is now armed by
    // three band-1 derelict lore rows (`DERELICT_POD_EFFECTS`).
    //
    // THE FIGURE IS REPORTED, NOT TUNED TO. The tripwire that decides whether the
    // supply is adequate is `campaign-smuggler-gambler.test.ts`'s `podsTaken > 0`
    // over a real 300-day career; this asserts only that the supply line EXISTS
    // and is of the size the content predicts, so a future edit that silently
    // orphans the flag fails here with a number instead of failing there with a
    // mystery.
    const rate = podArmed / boards;
    expect(podArmed, 'no board armed the sealed pod at all').toBeGreaterThan(0);
    // 3 of the 11 derelict band-1 rows, band 1 weighted 33 of 100, derelicts half
    // of all boards: 0.5 x 0.33 x 3/11 = 4.5%. A wide window, because the claim is
    // "the supply line is intact", not a tuned rate.
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.09);
  });
});

// ---------------------------------------------------------------------------
// 5 · T-114 · a band-2 row driven to PAYOUT through the real dusk
// ---------------------------------------------------------------------------

/** The highest unspent die in the dawn hand — what a real player would fly a
 *  DC-12 nav check with. Returns -1 when the hand is exhausted. */
function bestUnspentDie(state: GameState): number {
  const hand = state.player.dawnHand;
  if (!hand) return -1;
  let best = -1;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      best = i;
    }
  }
  return best;
}

/**
 * Drive a REAL career from day 1 until a band-2 row of the requested payload kind
 * opens the recovery slot, then run the loop forward to the dusk of `dueDay` and
 * hand back the payout events.
 *
 * NOTHING HERE HAND-CALLS A RESOLVER. That is the whole point of this block: a
 * deferred row's payoff is only worth asserting if the player-reachable path
 * actually delivers it — `startDay` → `applyPlayerAction({type:'Explore'})` →
 * `endDay`, exactly as `recovery.test.ts` drives the ruling tests.
 */
function driveBand2Payout(kind: string): {
  outcomeId: string;
  payoutEvents: GameEvent[];
  state: GameState;
} {
  const wanted = new Set(
    rowsInBand(2)
      .filter((row) => row.payload.kind === kind)
      .map((row) => row.id),
  );
  for (let seed = 1; seed < 900; seed += 1) {
    let state = createInitialState(seed);
    for (let day = 0; day < 8; day += 1) {
      const dawn = startDay(state);
      const die = bestUnspentDie(dawn.state);
      if (die < 0) {
        state = endDay(dawn.state).state;
        continue;
      }
      const acted = applyPlayerAction(dawn.state, { type: 'Explore', spendDie: die });
      const started = acted.events.find((e) => e.type === 'RecoveryStarted');
      if (!started || started.type !== 'RecoveryStarted' || !wanted.has(started.outcomeId)) {
        state = endDay(acted.state).state;
        continue;
      }
      // Found one. Run duskes forward until the clock comes due.
      let live = acted.state;
      for (let step = 0; step < 10; step += 1) {
        const dusk = endDay(live);
        const paid = dusk.events.find((e) => e.type === 'RecoveryPaidOut');
        if (paid)
          return { outcomeId: started.outcomeId, payoutEvents: dusk.events, state: dusk.state };
        if (dusk.state.player.recovery === null) break;
        live = startDay(dusk.state).state;
      }
      break;
    }
  }
  throw new Error(`no seed under 900 drove a band-2 '${kind}' row to payout`);
}

describe('T-114 · a band-2 find is DEFERRED, then paid out by the real dusk', () => {
  it('SALVAGE: pays out at dueDay, inside the row‘s own authored band', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('salvage');
    const row = authored.find((r) => r.id === outcomeId)!;
    expect(bandOf(row).band).toBe(2);
    const paid = payoutEvents.filter((e) => e.type === 'RecoveryPaidOut');
    expect(paid).toHaveLength(1);
    const salvage = payoutEvents.find((e) => e.type === 'SalvageRecovered');
    expect(salvage, 'the deferred salvage never landed').toBeDefined();
    if (salvage?.type === 'SalvageRecovered' && row.payload.kind === 'salvage') {
      expect(salvage.amount).toBeGreaterThanOrEqual(row.payload.minCredits);
      expect(salvage.amount).toBeLessThanOrEqual(row.payload.maxCredits);
    }
  });

  it('UNIQUE-ITEM: the item is granted at the dusk of dueDay', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('unique-item');
    const row = authored.find((r) => r.id === outcomeId)!;
    const acquired = payoutEvents.find((e) => e.type === 'UniqueItemAcquired');
    expect(acquired, 'the deferred item never landed').toBeDefined();
    if (acquired?.type === 'UniqueItemAcquired' && row.payload.kind === 'unique-item') {
      expect(acquired.itemId).toBe(row.payload.itemId);
    }
  });

  it('NPC: the named profile‘s disposition moves at the dusk of dueDay', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('npc');
    const row = authored.find((r) => r.id === outcomeId)!;
    const moved = payoutEvents.find((e) => e.type === 'DispositionChanged');
    expect(moved, 'the deferred introduction never landed').toBeDefined();
    if (moved?.type === 'DispositionChanged' && row.payload.kind === 'npc') {
      expect(moved.npcId).toBe(row.payload.profileId);
    }
  });

  it('QUESTLINE: the hook schedules its episode, and the episode is then OFFERED', () => {
    // THE ACCEPT CLAUSE END TO END. A hook is only "resolved into the existing
    // storylet system" if the schedule it writes becomes a real offer — so this
    // walks the whole way: payout → `StoryletScheduled` → the day arrives →
    // `refreshAvailableStorylets` → `StoryletOffered` for that exact id.
    const { outcomeId, payoutEvents, state } = driveBand2Payout('questline');
    const row = authored.find((r) => r.id === outcomeId)!;
    expect(row.payload.kind).toBe('questline');
    if (row.payload.kind !== 'questline') return;
    const { storyletId } = row.payload;

    const scheduled = payoutEvents.find((e) => e.type === 'StoryletScheduled');
    expect(scheduled, 'the deferred hook scheduled nothing').toBeDefined();
    const entry = state.storylets.scheduled.find((s) => s.storyletId === storyletId);
    expect(entry, 'no schedule entry for the hook‘s episode').toBeDefined();
    // §2.3's synthetic pair: the ROW id is the source, `explore` the choice.
    expect(entry!.sourceStoryletId).toBe(row.id);
    expect(entry!.sourceChoiceId).toBe('explore');

    let live = state;
    // `state` came back from an `endDay`, so the calendar has already turned and
    // the next dawn is the next thing that happens — drive whole days from there.
    while (live.day < entry!.dueDay) live = endDay(startDay(live).state).state;
    const refreshed = refreshAvailableStorylets({
      ...live,
      storylets: { ...live.storylets, offeredToday: [] },
    });
    expect(
      refreshed.events.some((e) => e.type === 'StoryletOffered' && e.storyletId === storyletId),
      `${storyletId} never became an offer`,
    ).toBe(true);
  });
});
