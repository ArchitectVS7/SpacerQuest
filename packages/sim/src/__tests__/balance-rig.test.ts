import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { aggregate, summarizeReport, type BaselineAggregate } from '../balance/aggregate.js';
import { assertFixtureFresh, fixtureFreshness, type SmokeFixture } from '../balance/checkpoints.js';
import { diffAggregates } from '../balance/diff.js';
import {
  allSourceKeys,
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  CONTENT_HASHED_DIRECTORIES,
  CONTENT_NON_RULE_SOURCES,
  CONTENT_SOURCE_ROOT,
  ENGINE_HASHED_DIRECTORIES,
  ENGINE_NON_RULE_SOURCES,
  ENGINE_SOURCE_ROOT,
  REPO_ROOT,
  ruleSources,
  SIM_HASHED_DIRECTORIES,
  SIM_NON_INSTRUMENT_SOURCES,
  SIM_SOURCE_ROOT,
} from '../balance/rules-fingerprint.js';
import { synthesizeTierState, type TierSpread } from '../balance/synthesize.js';
import { runCampaign } from '../index.js';

// ---------------------------------------------------------------------------
// N7 · THE MEASUREMENT RIG's own tests. Three things are held here that the
// staged smoke suite cannot hold about itself:
//
//   1. the rule-source classification is TOTAL — a new engine module cannot join
//      the tree without someone deciding whether it decides outcomes;
//   2. the differ gives the two answers the N-series needs, checked against real
//      committed capstone pairs whose answers are already written down;
//   3. a SYNTHESIZED run cannot become a balance number, by any route.
// ---------------------------------------------------------------------------

const DOCS_BALANCE = join(REPO_ROOT, 'docs', 'balance');
const load = (name: string): BaselineAggregate =>
  JSON.parse(readFileSync(join(DOCS_BALANCE, name), 'utf8')) as BaselineAggregate;

// ---------------------------------------------------------------------------
// 1 · The fingerprint
// ---------------------------------------------------------------------------

describe('N7 · the rule-source classification is total', () => {
  // THE point of these three: the fingerprint's worst failure is being too
  // NARROW (a rule change it misses leaves a stale fixture reporting green), and
  // the way a list goes narrow is by a new file being added and nobody noticing.
  // Here, nobody can not notice: an unclassified module fails the suite.
  it('classifies every engine source as rule or not-rule', () => {
    const hashed = new Set(
      ruleSources()
        .filter((source) => source.path.includes('/engine/'))
        .map((source) => source.path.replace('packages/engine/src/', '')),
    );
    const unclassified = allSourceKeys(
      REPO_ROOT,
      ENGINE_SOURCE_ROOT,
      ENGINE_HASHED_DIRECTORIES,
    ).filter((key) => !hashed.has(key) && !(key in ENGINE_NON_RULE_SOURCES));
    expect(unclassified).toEqual([]);
  });

  it('classifies every content source as rule or not-rule', () => {
    const hashed = new Set(
      ruleSources()
        .filter((source) => source.path.includes('/content/'))
        .map((source) => source.path.replace('packages/content/src/', '')),
    );
    const unclassified = allSourceKeys(
      REPO_ROOT,
      CONTENT_SOURCE_ROOT,
      CONTENT_HASHED_DIRECTORIES,
    ).filter((key) => !hashed.has(key) && !(key in CONTENT_NON_RULE_SOURCES));
    expect(unclassified).toEqual([]);
  });

  it('classifies every sim source as instrument or not', () => {
    const hashed = new Set(
      computeInstrumentFingerprint().files.map((source) =>
        source.path.replace('packages/sim/src/', ''),
      ),
    );
    const unclassified = allSourceKeys(REPO_ROOT, SIM_SOURCE_ROOT, SIM_HASHED_DIRECTORIES).filter(
      (key) => !hashed.has(key) && !(key in SIM_NON_INSTRUMENT_SOURCES),
    );
    expect(unclassified).toEqual([]);
  });

  it('keeps packages/sim out of the RULES fingerprint', () => {
    // The sim is the instrument, not the rules. Folding it in would make
    // `rulesFingerprint` assert something false — "the ruleset changed" — every
    // time a policy was tuned. It is hashed separately instead.
    expect(ruleSources().filter((source) => source.path.startsWith('packages/sim'))).toEqual([]);
    expect(computeInstrumentFingerprint().fingerprint).not.toBe(
      computeRulesFingerprint().fingerprint,
    );
  });

  it('hashes the whole content directory and both engine directories', () => {
    const paths = ruleSources().map((source) => source.path);
    expect(paths.some((path) => path.startsWith('packages/engine/src/actions/'))).toBe(true);
    expect(paths).toContain('packages/content/src/upgrades.ts');
    expect(paths).toContain('packages/engine/src/npc.ts');
    // The three deliberate engine exclusions, named so a silent re-inclusion is
    // as visible as a silent exclusion.
    expect(paths).not.toContain('packages/engine/src/save.ts');
    expect(paths).not.toContain('packages/engine/src/schema.ts');
    expect(paths).not.toContain('packages/engine/src/index.ts');
  });
});

describe('N7 · the fingerprint is derived from content, not declared', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A miniature repo with the directory shape the collector walks. */
  function fakeRepo(engineBody: string, engineName = 'day.ts'): string {
    const root = mkdtempSync(join(tmpdir(), 'sq-fingerprint-'));
    roots.push(root);
    mkdirSync(join(root, 'packages', 'engine', 'src', 'actions'), { recursive: true });
    mkdirSync(join(root, 'packages', 'content', 'src'), { recursive: true });
    writeFileSync(join(root, 'packages', 'engine', 'src', engineName), engineBody, 'utf8');
    writeFileSync(
      join(root, 'packages', 'engine', 'src', 'actions', 'trade.ts'),
      'export const TRADE = 1;\n',
      'utf8',
    );
    writeFileSync(
      join(root, 'packages', 'content', 'src', 'upgrades.ts'),
      'export const TRIBUTE = 1000;\n',
      'utf8',
    );
    return root;
  }

  it('moves when a rule constant changes', () => {
    const before = computeRulesFingerprint(fakeRepo('export const DC = 12;\n')).fingerprint;
    const after = computeRulesFingerprint(fakeRepo('export const DC = 13;\n')).fingerprint;
    expect(after).not.toBe(before);
  });

  it('moves when a rule module is renamed, even byte-for-byte', () => {
    const body = 'export const DC = 12;\n';
    expect(computeRulesFingerprint(fakeRepo(body, 'day.ts')).fingerprint).not.toBe(
      computeRulesFingerprint(fakeRepo(body, 'dayloop.ts')).fingerprint,
    );
  });

  it('does not move on a line-ending difference', () => {
    // A CRLF checkout is the same ruleset as an LF one. A fingerprint that moved
    // when someone cloned on Windows would train readers to ignore it.
    expect(computeRulesFingerprint(fakeRepo('export const DC = 12;\n')).fingerprint).toBe(
      computeRulesFingerprint(fakeRepo('export const DC = 12;\r\n')).fingerprint,
    );
  });

  it('is stable across repeated calls on the same tree', () => {
    expect(computeRulesFingerprint().fingerprint).toBe(computeRulesFingerprint().fingerprint);
  });
});

// ---------------------------------------------------------------------------
// 2 · The differ, against real committed capstones
// ---------------------------------------------------------------------------

describe('N7 · the differ answers "nothing moved"', () => {
  it('reports nothing moved between baseline-r2c-final and baseline-n1', () => {
    // N1's central finding: its capstone is byte-identical to its predecessor
    // apart from the `label`. A differ that could not say so would have made
    // that finding unrepeatable, so this pair is the differ's own acceptance
    // test — see the N1 result in docs/BALANCE-REDESIGN-WORKLIST.md.
    const diff = diffAggregates(load('baseline-r2c-final.json'), load('baseline-n1.json'));
    expect(diff.identical).toBe(true);
    expect(diff.movedRows).toEqual([]);
    expect(diff.numericChanges).toEqual([]);
    expect(diff.valueChanges).toEqual([]);
    expect(diff.shapeChanges).toEqual([]);
    // ...and it says out loud which field it deliberately did not look at.
    expect(diff.ignoredPaths).toContain('label');
    expect(diff.beforeLabel).not.toBe(diff.afterLabel);
  });
});

describe('N7 · the differ answers "these rows moved"', () => {
  const diff = diffAggregates(load('baseline-vet-1k.json'), load('baseline-vet-1k-r2a.json'));

  it('names exactly fighter and veteran (plus the fleet union they feed)', () => {
    // R2a's own control: "at 1,000 seeds it moves ONLY fighter and veteran (the
    // two policies sharing the wishlist); the other six rows are byte-identical".
    expect(diff.identical).toBe(false);
    expect(diff.movedRows).toEqual(['fleet', 'fighter', 'veteran']);
    // Row order follows the aggregate's own `policies` order, which the merge
    // step sorts alphabetically — so this list IS the "other six rows are
    // byte-identical" control, in the order the file carries them.
    expect(diff.unchangedRows).toEqual([
      'header',
      'explorer',
      'gambler',
      'greedy',
      'smuggler',
      'trader',
      'trader-degraded',
    ]);
  });

  it('reproduces the R2a result table to the credit', () => {
    const at = (path: string): { before: number; after: number } => {
      const change = diff.numericChanges.find((entry) => entry.path === path);
      if (!change) throw new Error(`expected ${path} to have moved`);
      return { before: change.before, after: change.after };
    };
    // fighter | 0.70 -> 0.61 | 20 -> 23 | 158,978 -> 155,059 | 56 -> 41 | 0.47 -> 0.34
    expect(at('byPolicy[fighter].debtClearedDay.median')).toEqual({ before: 20, after: 23 });
    expect(at('byPolicy[fighter].finalCredits.median')).toEqual({
      before: 158978,
      after: 155059,
    });
    expect(at('byPolicy[fighter].survival.shipsLost')).toEqual({ before: 56, after: 41 });
    // veteran | 0.01 -> 0.00 | 90 -> 96 | 12,501 -> 8,372 | 84 -> 103 | 0.70 -> 0.86
    expect(at('byPolicy[veteran].debtClearedDay.median')).toEqual({ before: 90, after: 96 });
    expect(at('byPolicy[veteran].finalCredits.median')).toEqual({ before: 12501, after: 8372 });
    expect(at('byPolicy[veteran].survival.shipsLost')).toEqual({ before: 84, after: 103 });
    expect(at('byPolicy[veteran].survival.deathsPer1000Days').before).toBeCloseTo(0.7, 4);
    expect(at('byPolicy[veteran].survival.deathsPer1000Days').after).toBeCloseTo(0.8583, 4);
  });

  it('ignores the label and only the label', () => {
    const before = load('baseline-n1.json');
    const relabelled = { ...before, label: 'something-else' };
    expect(diffAggregates(before, relabelled).identical).toBe(true);
    const seedsChanged = { ...before, seeds: before.seeds + 1 };
    expect(diffAggregates(before, seedsChanged).identical).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 · The synthesized-state caveat, enforced rather than documented
// ---------------------------------------------------------------------------

/** A spread with one slot per NPC, deliberately minimal — this block is about the
 *  guard, not about the numbers. */
function spreadFor(npcCount: number): TierSpread {
  return {
    source: 'estimated',
    player: [
      {
        credits: 5000,
        debt: 10000,
        weaponsStrength: 30,
        hullStrength: 20,
        shieldsStrength: 20,
        drivesStrength: 20,
        cargoPods: 10,
        fuelShare: 0.5,
      },
    ],
    npc: Array.from({ length: npcCount }, (_, index) => ({
      credits: 1000 * (index + 1),
      hullStrength: 6,
      fuelShare: 0.5,
    })),
  };
}

describe('N7 · a synthesized run cannot become a balance number', () => {
  const npcCount = synthesizeTierState(1, 0, 1, spreadFor(30)).npcs.length;
  const spread = spreadFor(npcCount);
  const synthetic = runCampaign(1, 2, 'trader', {
    startState: synthesizeTierState(1, 0, 21, spread),
  });

  it('stamps the report and the row', () => {
    expect(synthetic.syntheticStart).toBe(true);
    expect(summarizeReport(synthetic).syntheticStart).toBe(true);
  });

  it('makes the baseline aggregator THROW rather than fold it', () => {
    // The structural form of the honest caveat. Not a warning, not a filter that
    // drops the row quietly — a filter would turn "you measured something you
    // may not measure" into "your sample was smaller than you thought".
    expect(() => aggregate('smuggled-in', [summarizeReport(synthetic)])).toThrow(
      /Refusing to aggregate 1 SYNTHESIZED row/,
    );
    // ...and it still throws when hidden among honest rows.
    const honest = summarizeReport(runCampaign(2, 2, 'trader'));
    expect(() => aggregate('smuggled-in', [honest, summarizeReport(synthetic)])).toThrow(
      /SYNTHESIZED/,
    );
    expect(() => aggregate('honest', [honest])).not.toThrow();
  });

  it('leaves an ordinary career byte-identical to its pre-N7 shape', () => {
    // The optional fields must be ABSENT, not false/empty: `JSON.stringify` omits
    // an absent optional, which is what keeps the pinned report fingerprints in
    // campaign-degraded.test.ts from moving.
    const ordinary = runCampaign(1, 2, 'trader');
    expect('syntheticStart' in ordinary).toBe(false);
    expect('milestones' in ordinary).toBe(false);
    expect(JSON.stringify(ordinary)).not.toContain('syntheticStart');
  });

  it('harvests milestones only when asked, and only at the requested days', () => {
    const harvested = runCampaign(1, 5, 'trader', { milestoneDays: [2, 4] });
    expect(harvested.milestones?.map((sample) => sample.day)).toEqual([2, 4]);
    expect(harvested.milestones?.[0].npcCredits.length).toBe(npcCount);
    // Non-invasive: asking for milestones must not change the career itself.
    const { milestones: _milestones, ...rest } = harvested;
    expect(JSON.stringify(rest)).toBe(JSON.stringify(runCampaign(1, 5, 'trader')));
  });
});

describe('N7 · the synthesizer refuses a partial field', () => {
  it('throws when the spread does not cover every NPC', () => {
    expect(() => synthesizeTierState(1, 0, 21, spreadFor(12))).toThrow(
      /covers 12 NPCs but the roster has/,
    );
  });

  it('writes the day, the fit and the tank through the engine chokepoints', () => {
    const npcCount = synthesizeTierState(1, 0, 1, spreadFor(30)).npcs.length;
    const state = synthesizeTierState(3, 0, 41, spreadFor(npcCount));
    expect(state.day).toBe(41);
    // maxFuel follows the synthesized hull (syncMaxFuel), never a stale literal.
    expect(state.player.ship.maxFuel).toBeGreaterThan(0);
    expect(state.player.ship.fuel).toBeLessThanOrEqual(state.player.ship.maxFuel);
    // tier follows the synthesized fit (syncPlayerTier): weapons 30 -> class 2.
    expect(state.player.tier).toBe(2);
    for (const npc of state.npcs) {
      expect(npc.ship.fuel).toBeLessThanOrEqual(npc.ship.maxFuel);
    }
  });
});

// ---------------------------------------------------------------------------
// 4 · Staleness fails loudly and is never auto-refreshed
// ---------------------------------------------------------------------------

describe('N7 · a stale fixture fails loudly', () => {
  const fixture = JSON.parse(
    readFileSync(join(DOCS_BALANCE, 'smoke', 'tiers.json'), 'utf8'),
  ) as SmokeFixture;

  it('rejects a fixture measured against another ruleset', () => {
    const stale: SmokeFixture = { ...fixture, rulesFingerprint: '0000000000000000' };
    const problems = fixtureFreshness(stale);
    expect(problems.map((problem) => problem.field)).toEqual(['rulesFingerprint']);
    // The message has to be actionable, or the loud failure is just noise.
    expect(problems[0].message).toContain('STALE FIXTURE');
    expect(problems[0].message).toContain('balance:sweep');
    expect(problems[0].message).toContain('Never edit a fingerprint to make this pass');
    expect(() => assertFixtureFresh(stale)).toThrow(/STALE FIXTURE/);
  });

  it('rejects a fixture measured by another instrument, with a different sentence', () => {
    const stale: SmokeFixture = { ...fixture, instrumentFingerprint: '0000000000000000' };
    const problems = fixtureFreshness(stale);
    expect(problems.map((problem) => problem.field)).toEqual(['instrumentFingerprint']);
    expect(problems[0].message).toContain('MEASURING INSTRUMENT');
  });

  it('rejects a fixture measured against another save schema', () => {
    const stale: SmokeFixture = { ...fixture, saveSchemaVersion: 1 };
    expect(fixtureFreshness(stale).map((problem) => problem.field)).toEqual(['saveSchemaVersion']);
  });

  it('does not repair the fixture it rejected', () => {
    // No auto-refresh, anywhere. Checking a stale fixture must leave it stale:
    // a check that healed what it found would convert every rules change into a
    // silent re-pin, which is the failure docs/VERSIONING.md closes with.
    const stale: SmokeFixture = { ...fixture, rulesFingerprint: '0000000000000000' };
    try {
      assertFixtureFresh(stale);
    } catch {
      /* expected */
    }
    expect(stale.rulesFingerprint).toBe('0000000000000000');
    expect(readFileSync(join(DOCS_BALANCE, 'smoke', 'tiers.json'), 'utf8')).toContain(
      fixture.rulesFingerprint,
    );
  });
});
