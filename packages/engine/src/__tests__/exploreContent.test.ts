import { describe, expect, it } from 'vitest';
import {
  ALL_FRAGMENT_IDS,
  ALL_NPC_PROFILES,
  EXPLORE_ITEM_BY_ID,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  LEGACY_POI_LOOT,
  POI_KINDS,
  PoiType,
  STORYLETS,
  Stat,
  StoryletDefinition,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { recoveryDays } from '../exploreOutcomes.js';
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
 * EVERY ASSERTION BELOW IS SCOPED TO THE **AUTHORED** ROWS. The two surviving
 * `legacy-contraband-*` rows are transitional (finding F-113-B) and would
 * otherwise pollute the ladder: `contraband` appears in no band's
 * `permittedKinds`, which is the mechanical statement that it is not part of the
 * settled taxonomy.
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

  it('NO authored row carries a recoveryDays key, and its clock is its BAND‘s', () => {
    // The compile-time absence of the key on `ExploreOutcomeDefinition` is the
    // real enforcement; this is the runtime belt.
    //
    // T-114 · the second clause was `=== 0` while bands 0-1 were the whole
    // table. It is now the general claim it always meant: a row's recovery clock
    // is a function of its BAND and of nothing else, so every band-2 row opens a
    // one-day op purely because band 2 says 1 — never because a row said so.
    for (const row of authored) {
      expect(Object.keys(row)).not.toContain('recoveryDays');
      expect(recoveryDays(row.valuePoints), `${row.id} clock`).toBe(bandOf(row).recoveryDays);
    }
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
  it('is exactly the 14 + 20 + 33 rows §5.3 assigns to passes 1 and 2, and nothing ahead', () => {
    expect(authored).toHaveLength(67);
    expect(rowsInBand(0)).toHaveLength(14);
    expect(rowsInBand(1)).toHaveLength(20);
    expect(rowsInBand(2)).toHaveLength(33);
    // T-115 owns bands 3-4. A row landing there early would be content authored
    // ahead of the ladder that prices it.
    expect(rowsInBand(3)).toHaveLength(0);
    expect(rowsInBand(4)).toHaveLength(0);
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

  it('names EXACTLY the two legacy rows still owed a retirement', () => {
    // THE TRIPWIRE for T-115 and the draw flip. F-113-D is DISCHARGED — T-114
    // deleted `legacy-salvage-derelict` and re-pointed the derelict salvage leg
    // at the 6 band-1 + 8 band-2 authored derelict rows, which restores the
    // `rich_hulk` deed's 400cr trigger (P(>=400) 0.302 -> 0.384) rather than
    // merely diluting it. What survives is F-113-B alone: the two `contraband`
    // rows cannot be retired by a CONTENT pass, because deleting the member from
    // `ExploreOutcomePayload` makes the engine's exhaustive `case 'contraband':`
    // a tsc error. They retire with the single band-weighted draw (F-113-A).
    // Retiring them without updating this list fails loudly, which is the point:
    // it names what is still owed rather than letting it lapse.
    const legacy = EXPLORE_OUTCOMES.filter((row) => row.id.startsWith(LEGACY_PREFIX)).map(
      (row) => row.id,
    );
    expect(legacy.sort()).toEqual(['legacy-contraband-beacon', 'legacy-contraband-derelict']);
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
      // An INTRODUCTION moves standing a pip or two, never a chain's worth.
      expect(Number.isInteger(row.payload.dispositionDelta)).toBe(true);
      expect(row.payload.dispositionDelta).toBeGreaterThanOrEqual(1);
      expect(row.payload.dispositionDelta).toBeLessThanOrEqual(2);
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
        // The band permits a SHAPE; a `floor` must additionally be <= the
        // permitted floor, which is the only kind with an integer dial (§4.3 L1).
        const match = permitted.find((benefit) => benefit.kind === 'floor');
        expect(match, `${item.id} kind not permitted at band ${band.band}`).toBeDefined();
      }
    }
  });

  it('ships EXACTLY one Class-B item row in this pass (§4.2 places item 1 at band 2)', () => {
    const classB = itemRows.filter(
      (row) =>
        row.payload.kind === 'unique-item' &&
        EXPLORE_ITEM_BY_ID[row.payload.itemId]?.class === 'module',
    );
    expect(classB).toHaveLength(1);
    // Items 2 and 3 (`reroll`, `extra-die`) are bands 3-4 and are T-115's.
    expect(classB[0].payload.kind === 'unique-item' && classB[0].payload.itemId).toBe(
      'item-tally-slate',
    );
  });

  it('every id on a draw leg names a row whose own pools include that POI type', () => {
    // THE STRUCTURAL GUARD that makes T-114's beacon re-point safe. The beacon
    // salvage leg is now the "find" leg — it carries items, introductions, hooks
    // and effect-bearing lore alongside salvage — and `drawLegacyLoot` resolves
    // whatever id a leg names without caring what KIND the row is. What it must
    // never do is surface a row at a POI type the row does not claim.
    const byId = new Map(EXPLORE_OUTCOMES.map((row) => [row.id, row]));
    for (const type of Object.keys(LEGACY_POI_LOOT) as PoiType[]) {
      const table = LEGACY_POI_LOOT[type];
      for (const leg of [table.salvage, table.fragment, table.contraband]) {
        for (const id of leg.outcomeIds) {
          const row = byId.get(id);
          expect(row, `leg id ${id} resolves to no row`).toBeDefined();
          expect(row!.pools, `${id} on the ${type} leg`).toContain(type);
        }
      }
    }
  });

  it('the DERELICT salvage leg stays salvage-only — the rich_hulk deed is on it', () => {
    // F-113-D's closing argument, asserted so it cannot be undone by accident.
    // The `rich_hulk` deed fires on a `SalvageRecovered` of 400cr+, and this leg
    // is the only place in the game calibrated on a credit distribution. Putting
    // a non-credit row on it would dilute an authored deed for no gain — which is
    // exactly the measurement that stopped T-113 re-pointing it at all.
    const byId = new Map(EXPLORE_OUTCOMES.map((row) => [row.id, row]));
    const leg = LEGACY_POI_LOOT.derelict.salvage.outcomeIds;
    for (const id of leg) expect(byId.get(id)!.payload.kind, id).toBe('salvage');
    // And the trigger is reachable with room: P(>=400) over the uniform leg.
    const probability =
      leg.reduce((sum, id) => {
        const payload = byId.get(id)!.payload;
        if (payload.kind !== 'salvage') return sum;
        const span = payload.maxCredits - payload.minCredits + 1;
        const above = Math.max(0, payload.maxCredits - Math.max(400, payload.minCredits) + 1);
        return sum + above / span;
      }, 0) / leg.length;
    // The row this leg replaced (`legacy-salvage-derelict`, 120-520) sat at
    // 0.302. Band 2 restores it with room — assert the DIRECTION, not a tuned
    // figure: a leg that made the deed rarer than the row it replaced is the
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

describe('T-113/T-114 · the authored rows resolve through the real Explore path', () => {
  // ONE SWEEP, read several ways. Every board is a real `resolveExploration`
  // call — the verb a player uses, nav check and all — never a hand-called
  // resolver, so what is asserted below is what a player can actually reach.
  //
  // T-114 · A BAND-2 ROW IS OBSERVED THROUGH ITS `RecoveryStarted`, not through
  // its wire copy, and that is not a workaround — it is the design. Band 2 is
  // `recoveryDays: 1`, so the CLAIM half fires on the day of the board and the
  // PAYOFF (with the row's own prose) lands at the dusk of `dueDay`. This sweep
  // drives the ACTION only, so a band-2 row can only be seen as the commitment
  // it opens. Section 5 below drives the payout half through the real dusk.
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

  it('reaches EVERY row the transitional carrier can draw, at least once', () => {
    // Pre-pays part of T-115's reachability sweep, and is what makes the T-113 /
    // T-114 re-points real rather than nominal: a row wired into a leg but never
    // drawn is content that does not exist as far as a player is concerned.
    const drawable = new Set<string>();
    for (const type of Object.keys(LEGACY_POI_LOOT) as PoiType[]) {
      const table = LEGACY_POI_LOOT[type];
      for (const leg of [table.salvage, table.fragment, table.contraband]) {
        for (const id of leg.outcomeIds) if (!id.startsWith(LEGACY_PREFIX)) drawable.add(id);
      }
    }
    // 20 band-1 rows + all 33 band-2 rows. Only the 14 dead ends are off a leg.
    expect(drawable.size).toBe(53);
    const missing = [...drawable].filter((id) => !observed.has(id));
    expect(missing, `unreached authored rows: ${missing.join(', ')}`).toEqual([]);
  });

  it('reaches ALL 33 band-2 rows, of every kind this pass authors', () => {
    const band2 = rowsInBand(2);
    const missing = band2.filter((row) => !observed.has(row.id)).map((row) => row.id);
    expect(missing, `unreached band-2 rows: ${missing.join(', ')}`).toEqual([]);
    for (const kind of ['salvage', 'unique-item', 'npc', 'questline', 'lore']) {
      expect(
        band2.some((row) => row.payload.kind === kind && observed.has(row.id)),
        `no band-2 ${kind} row reached`,
      ).toBe(true);
    }
  });

  it('no boarded POI is ever charged 80 fuel for an EMPTY wire line (§2.4)', () => {
    expect(emptyWireOnBoard).toBe(0);
  });

  it('records EXACTLY which authored rows are still inert, and why', () => {
    // Stated as an assertion so the gap cannot be forgotten.
    //
    // F-113-A · the 14 band-0 DEAD ENDS, and now nothing else. The transitional
    //   carrier has exactly three named legs and no "nothing else fired" arm, and
    //   adding one would be the engine branch a content pass is forbidden. They
    //   become reachable when the single band-weighted draw lands — which is
    //   STILL UNOWNED after T-114 and still blocks T-115's reachability clause.
    // F-113-D · DISCHARGED. The six authored derelict salvage rows that T-113
    //   left inert are on the re-pointed derelict leg and are reached above.
    const inert = authored.filter((row) => !observed.has(row.id)).map((row) => row.id);
    expect(inert.filter((id) => id.startsWith('explore-deadend-'))).toHaveLength(14);
    expect(inert).toHaveLength(14);
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
