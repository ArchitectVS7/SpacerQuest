import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

import { aggregate, summarizeReport, type BaselineAggregate } from '../balance/aggregate.js';
import {
  assertFixtureFresh,
  fixtureDocsDrift,
  fixtureFreshness,
  type SmokeFixture,
} from '../balance/checkpoints.js';
import { diffAggregates } from '../balance/diff.js';
import {
  allSourceKeys,
  assertParseClean,
  computeDocsFingerprint,
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  CONTENT_HASHED_DIRECTORIES,
  CONTENT_NON_RULE_SOURCES,
  CONTENT_SOURCE_ROOT,
  ENGINE_HASHED_DIRECTORIES,
  ENGINE_NON_RULE_SOURCES,
  ENGINE_SOURCE_ROOT,
  hashSemantic,
  HASHED_ROOT_IGNORED_DIRECTORIES,
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

  it('reports commentary drift as a NOTE, never as a freshness problem', () => {
    // The C-half of N7-FP: a moved docs hash is informational. If this ever
    // appears in `fixtureFreshness`, the false positive is back.
    const drifted: SmokeFixture = { ...fixture, docsFingerprint: '0000000000000000' };
    expect(fixtureFreshness(drifted)).toEqual([]);
    expect(() => assertFixtureFresh(drifted)).not.toThrow();
    expect(fixtureDocsDrift(drifted)).toContain('not a failure');
  });

  it('says nothing about docs drift for a fixture written before N7-FP', () => {
    const { docsFingerprint: _omitted, ...legacy } = fixture;
    expect(fixtureDocsDrift(legacy as SmokeFixture)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5 · N7-FP · the fingerprint hashes CODE, not bytes
// ---------------------------------------------------------------------------

/**
 * THE PROPERTY THAT MAKES THE SEMANTIC HASH SAFE, pinned in BOTH directions
 * because only the pair is meaningful. Comment-insensitivity alone would be
 * satisfied by a hash that ignored everything; rule-sensitivity alone is what the
 * old byte hash had. A regression in either direction is a silent correctness
 * failure — too loose and a real rule change slips past a stale fixture, too
 * tight and documentation is taxed again (see `hashSemantic` for the history).
 *
 * Driven against a synthetic tree rather than by mutating the real one: these
 * tests must never leave the working copy dirty, and `computeRulesFingerprint`
 * takes a repo root precisely so this is possible.
 */
describe('N7-FP · comments do not move the rules fingerprint, code does', () => {
  const roots: string[] = [];

  /** Builds the minimum tree the collectors walk: engine `''` + `actions`,
   *  content `''`, and sim `''` + `balance` (the docs hash spans all three). */
  function fakeRepo(contentBody: string): string {
    const root = mkdtempSync(join(tmpdir(), 'sq-fp-'));
    roots.push(root);
    mkdirSync(join(root, ENGINE_SOURCE_ROOT, 'actions'), { recursive: true });
    mkdirSync(join(root, CONTENT_SOURCE_ROOT), { recursive: true });
    mkdirSync(join(root, SIM_SOURCE_ROOT, 'balance'), { recursive: true });
    writeFileSync(join(root, ENGINE_SOURCE_ROOT, 'day.ts'), 'export const DAY = 1;\n', 'utf8');
    writeFileSync(
      join(root, ENGINE_SOURCE_ROOT, 'actions', 'travel.ts'),
      'export const TRAVEL = 2;\n',
      'utf8',
    );
    writeFileSync(join(root, CONTENT_SOURCE_ROOT, 'ports.ts'), contentBody, 'utf8');
    writeFileSync(join(root, SIM_SOURCE_ROOT, 'index.ts'), 'export const SIM = 3;\n', 'utf8');
    writeFileSync(
      join(root, SIM_SOURCE_ROOT, 'balance', 'aggregate.ts'),
      'export const AGG = 4;\n',
      'utf8',
    );
    return root;
  }

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  // The string literals here are the reason this uses a parser and not a regex:
  // both contain comment markers that a text strip would eat.
  const WITH_COMMENT = `
// The price ladder, assigned by traffic band.
/** See https://example.invalid/spec for the derivation. */
export const PRICE = 140000;
const NOTE = "/* not a comment */";
`;
  const COMMENT_EDITED = `
// The price ladder, assigned by MEASURED traffic band (reworded 2026-07-29).
export const PRICE = 140000;
const NOTE = "/* not a comment */";
`;
  const CONSTANT_EDITED = `
// The price ladder, assigned by traffic band.
/** See https://example.invalid/spec for the derivation. */
export const PRICE = 130000;
const NOTE = "/* not a comment */";
`;

  it('a comment-only edit leaves the rules fingerprint untouched', () => {
    const before = computeRulesFingerprint(fakeRepo(WITH_COMMENT)).fingerprint;
    const after = computeRulesFingerprint(fakeRepo(COMMENT_EDITED)).fingerprint;
    expect(after, 'rewriting a comment is not a ruleset change').toBe(before);
  });

  it('a one-constant edit in the same file DOES move it', () => {
    const before = computeRulesFingerprint(fakeRepo(WITH_COMMENT)).fingerprint;
    const after = computeRulesFingerprint(fakeRepo(CONSTANT_EDITED)).fingerprint;
    expect(after, '140000 -> 130000 is a ruleset change and must be caught').not.toBe(before);
  });

  it('the docs fingerprint moves on BOTH, which is what keeps the edit traceable', () => {
    const base = computeDocsFingerprint(fakeRepo(WITH_COMMENT)).fingerprint;
    expect(computeDocsFingerprint(fakeRepo(COMMENT_EDITED)).fingerprint).not.toBe(base);
    expect(computeDocsFingerprint(fakeRepo(CONSTANT_EDITED)).fingerprint).not.toBe(base);
  });

  it('a string literal containing comment markers survives hashing intact', () => {
    // Guards the specific way a regex implementation would break: truncating at
    // the `/*` inside NOTE would make these two trees collide.
    const keptMarkers = computeRulesFingerprint(fakeRepo(WITH_COMMENT)).fingerprint;
    const strippedMarkers = computeRulesFingerprint(
      fakeRepo(WITH_COMMENT.replace('"/* not a comment */"', '""')),
    ).fingerprint;
    expect(strippedMarkers, 'the literal is code and must be hashed').not.toBe(keptMarkers);
  });
});

// ---------------------------------------------------------------------------
// 6 · OI-6/OI-7 · the two ways a source could have escaped the hash silently
// ---------------------------------------------------------------------------

/** The minimum tree every collector walks — engine `''` + `actions`, content
 *  `''`, sim `''` + `balance` — so `computeRulesFingerprint`,
 *  `computeInstrumentFingerprint` and `computeDocsFingerprint` all run on it. */
function minimalRepo(roots: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'sq-oi6-'));
  roots.push(root);
  mkdirSync(join(root, ENGINE_SOURCE_ROOT, 'actions'), { recursive: true });
  mkdirSync(join(root, CONTENT_SOURCE_ROOT), { recursive: true });
  mkdirSync(join(root, SIM_SOURCE_ROOT, 'balance'), { recursive: true });
  writeFileSync(join(root, ENGINE_SOURCE_ROOT, 'day.ts'), 'export const DAY = 1;\n', 'utf8');
  writeFileSync(
    join(root, ENGINE_SOURCE_ROOT, 'actions', 'travel.ts'),
    'export const TRAVEL = 2;\n',
    'utf8',
  );
  writeFileSync(join(root, CONTENT_SOURCE_ROOT, 'ports.ts'), 'export const P = 3;\n', 'utf8');
  writeFileSync(join(root, SIM_SOURCE_ROOT, 'index.ts'), 'export const SIM = 4;\n', 'utf8');
  writeFileSync(
    join(root, SIM_SOURCE_ROOT, 'balance', 'aggregate.ts'),
    'export const AGG = 5;\n',
    'utf8',
  );
  return root;
}

describe('OI-6 · an undeclared SUBDIRECTORY under a hashed root fails loudly', () => {
  // The hole this closes: the walk only ever visited DECLARED directories, so a
  // new `engine/src/rules/` was invisible to the hash AND to the three
  // enumeration tests above, which inherit the walk's scope. Neither the too-broad
  // nor the too-narrow direction — a whole subtree simply not present.
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  const withDirectory = (relative: string[]): string => {
    const root = minimalRepo(roots);
    mkdirSync(join(root, ...relative), { recursive: true });
    writeFileSync(join(root, ...relative, 'dc.ts'), 'export const DC = 12;\n', 'utf8');
    return root;
  };

  it('refuses to fingerprint a tree with an unclassified rules subdirectory', () => {
    const root = withDirectory([ENGINE_SOURCE_ROOT, 'rules']);
    expect(() => computeRulesFingerprint(root)).toThrow(/UNDECLARED DIRECTORY/);
    // The message has to say WHICH directory and WHAT to do, or the loud failure
    // is just noise — the same bar the staleness message is held to above.
    expect(() => computeRulesFingerprint(root)).toThrow(/packages\/engine\/src\/rules/);
    expect(() => computeRulesFingerprint(root)).toThrow(/HASHED_ROOT_IGNORED_DIRECTORIES/);
  });

  it('does not offer the ignore list as the easy way out', () => {
    // The one thing that would quietly undo this guard is an author reading the
    // message as "add it to the ignore list". It says otherwise, in as many words.
    try {
      computeRulesFingerprint(withDirectory([ENGINE_SOURCE_ROOT, 'rules']));
      throw new Error('expected the guard to fire');
    } catch (error) {
      expect((error as Error).message).toContain('not the quick way out');
    }
  });

  it('catches it under a nested declared directory too, naming the full key', () => {
    const root = withDirectory([ENGINE_SOURCE_ROOT, 'actions', 'combat']);
    expect(() => computeRulesFingerprint(root)).toThrow(/packages\/engine\/src\/actions\/combat/);
  });

  it('catches it in content and in the instrument, not only in the engine', () => {
    expect(() => computeRulesFingerprint(withDirectory([CONTENT_SOURCE_ROOT, 'eras']))).toThrow(
      /packages\/content\/src\/eras/,
    );
    expect(() =>
      computeInstrumentFingerprint(withDirectory([SIM_SOURCE_ROOT, 'balance', 'policies'])),
    ).toThrow(/packages\/sim\/src\/balance\/policies/);
  });

  it('fires for the enumeration tests as well, not only for the hash', () => {
    // `allSourceKeys` is what the three totality tests above enumerate with. If it
    // walked a wider or narrower tree than `collect`, the totality they prove
    // would be about a different tree than the one that gets hashed.
    const root = withDirectory([ENGINE_SOURCE_ROOT, 'rules']);
    expect(() => allSourceKeys(root, ENGINE_SOURCE_ROOT, ENGINE_HASHED_DIRECTORIES)).toThrow(
      /UNDECLARED DIRECTORY/,
    );
  });

  it('lets the declared and the explicitly-ignored directories through', () => {
    const root = minimalRepo(roots);
    for (const ignored of Object.keys(HASHED_ROOT_IGNORED_DIRECTORIES)) {
      mkdirSync(join(root, ENGINE_SOURCE_ROOT, ignored), { recursive: true });
      writeFileSync(
        join(root, ENGINE_SOURCE_ROOT, ignored, 'noise.ts'),
        'export const NOISE = 0;\n',
        'utf8',
      );
    }
    expect(() => computeRulesFingerprint(root)).not.toThrow();
    // ...and their contents are still not hashed: the guard is about noticing a
    // directory, never about widening the hash to swallow one.
    expect(computeRulesFingerprint(root).files.map((source) => source.path)).toEqual([
      'packages/content/src/ports.ts',
      'packages/engine/src/actions/travel.ts',
      'packages/engine/src/day.ts',
    ]);
  });

  it('every ignored name carries the reason it decides nothing', () => {
    // Map-not-list, same as ENGINE_NON_RULE_SOURCES: an entry with no reason is
    // an entry nobody has to defend.
    for (const [name, reason] of Object.entries(HASHED_ROOT_IGNORED_DIRECTORIES)) {
      expect(reason.length, `${name} needs a stated reason`).toBeGreaterThan(40);
    }
    expect(Object.keys(HASHED_ROOT_IGNORED_DIRECTORIES)).toContain('__tests__');
  });

  it('passes on the real tree, which is the state it must hold', () => {
    expect(() => computeRulesFingerprint()).not.toThrow();
    expect(() => computeInstrumentFingerprint()).not.toThrow();
    expect(() => computeDocsFingerprint()).not.toThrow();
  });
});

describe('OI-6b · a SYMLINK does not get past the guard the way a directory cannot', () => {
  // The residual hole in the first cut, reproduced on the real tree before the
  // fix: `readdirSync(withFileTypes)` types a symlink by ITSELF, not its target,
  // so a symlinked `packages/engine/src/rules` answered `isDirectory()` false,
  // slipped the undeclared-directory guard, was not listed by `listTsFiles`, and
  // left the fingerprint sitting at 91cfa4adc626ba54/56 with a `sneak.ts` inside
  // it. One shell command wide, and the exact "invisible to the hash AND to the
  // enumeration tests" mode the guard above exists to close.
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  /** A repo with a link at `<relative>` pointing at a target OUTSIDE the hashed
   *  roots — the shape of the reproduction, and the shape any real one takes. */
  const withSymlink = (
    relative: string[],
    target: { readonly kind: 'directory' | 'file' | 'missing'; readonly contents?: string },
  ): string => {
    const root = minimalRepo(roots);
    const targetPath = join(root, 'elsewhere');
    if (target.kind === 'directory') {
      mkdirSync(targetPath, { recursive: true });
      writeFileSync(join(targetPath, 'sneak.ts'), 'export const SNEAK = 999;\n', 'utf8');
    } else if (target.kind === 'file') {
      writeFileSync(targetPath, target.contents ?? 'export const SNEAK = 999;\n', 'utf8');
    }
    symlinkSync(targetPath, join(root, ...relative));
    return root;
  };

  it('a symlinked DIRECTORY trips the undeclared-directory guard exactly as a real one does', () => {
    const root = withSymlink([ENGINE_SOURCE_ROOT, 'rules'], { kind: 'directory' });
    expect(() => computeRulesFingerprint(root)).toThrow(/UNDECLARED DIRECTORY/);
    expect(() => computeRulesFingerprint(root)).toThrow(/packages\/engine\/src\/rules/);
    // Same message, same two remedies: how the entry was created is not a fact
    // the author needs, and offering a symlink-specific escape would be one.
    expect(() => computeRulesFingerprint(root)).toThrow(/not the quick way out/);
  });

  it('and it trips the enumeration walk too, not only the hash', () => {
    const root = withSymlink([ENGINE_SOURCE_ROOT, 'rules'], { kind: 'directory' });
    expect(() => allSourceKeys(root, ENGINE_SOURCE_ROOT, ENGINE_HASHED_DIRECTORIES)).toThrow(
      /UNDECLARED DIRECTORY/,
    );
  });

  it('fires in content and in the instrument as well', () => {
    expect(() =>
      computeRulesFingerprint(withSymlink([CONTENT_SOURCE_ROOT, 'eras'], { kind: 'directory' })),
    ).toThrow(/packages\/content\/src\/eras/);
    expect(() =>
      computeInstrumentFingerprint(
        withSymlink([SIM_SOURCE_ROOT, 'balance', 'policies'], { kind: 'directory' }),
      ),
    ).toThrow(/packages\/sim\/src\/balance\/policies/);
  });

  it('a symlinked directory whose NAME is on the ignore list is still ignored', () => {
    // The escape has to work through a link too, and for the reason the ignore
    // list gives: what makes `__tests__` inert is what is inside it, never how
    // the entry was created. Anything else would be a guard that fails on the
    // legitimate case while the illegitimate one is the point.
    const root = withSymlink([ENGINE_SOURCE_ROOT, '__tests__'], { kind: 'directory' });
    expect(() => computeRulesFingerprint(root)).not.toThrow();
    expect(computeRulesFingerprint(root).files.map((source) => source.path)).toEqual([
      'packages/content/src/ports.ts',
      'packages/engine/src/actions/travel.ts',
      'packages/engine/src/day.ts',
    ]);
  });

  it('a symlinked `.ts` FILE is hashed, because its content is real rule code', () => {
    // The second instance of the same hole, decided the same way. `readFileSync`
    // follows the link, so this is a rule source that decides outcomes; skipping
    // it would leave the identical silent gap. It is the PATH in this tree that
    // enters the manifest, not the target's.
    const root = withSymlink([ENGINE_SOURCE_ROOT, 'sneak.ts'], { kind: 'file' });
    const files = computeRulesFingerprint(root).files.map((source) => source.path);
    expect(files).toContain('packages/engine/src/sneak.ts');
    expect(computeRulesFingerprint(root).fileCount).toBe(4);
    // ...and being hashed is what drags it in front of the totality tests, so it
    // still has to be classified as rule or non-rule like any other file.
    expect(allSourceKeys(root, ENGINE_SOURCE_ROOT, ENGINE_HASHED_DIRECTORIES)).toContain(
      'sneak.ts',
    );
  });

  it('and editing through that link moves the fingerprint, which is the whole point', () => {
    const before = withSymlink([ENGINE_SOURCE_ROOT, 'sneak.ts'], {
      kind: 'file',
      contents: 'export const SNEAK = 999;\n',
    });
    const after = withSymlink([ENGINE_SOURCE_ROOT, 'sneak.ts'], {
      kind: 'file',
      contents: 'export const SNEAK = 111;\n',
    });
    expect(computeRulesFingerprint(after).fingerprint).not.toBe(
      computeRulesFingerprint(before).fingerprint,
    );
  });

  it('a DANGLING symlink stops the fingerprint rather than raising a bare ENOENT', () => {
    // Skipping it would be a guess about a target we cannot see, and letting the
    // `statSync` ENOENT escape would surface as an unattributable stack trace out
    // of a fixture stamp. So: an explicit, named failure.
    const root = withSymlink([ENGINE_SOURCE_ROOT, 'ghost'], { kind: 'missing' });
    expect(() => computeRulesFingerprint(root)).toThrow(/UNRESOLVABLE SYMLINK/);
    expect(() => computeRulesFingerprint(root)).toThrow(/its target does not exist/);
    expect(() => computeRulesFingerprint(root)).toThrow(/ghost/);
    expect(() => computeRulesFingerprint(root)).toThrow(/do not fingerprint a broken tree/);
  });

  it('a dangling symlink named `.ts` fails the same way, not by hashing nothing', () => {
    const root = withSymlink([ENGINE_SOURCE_ROOT, 'ghost.ts'], { kind: 'missing' });
    expect(() => computeRulesFingerprint(root)).toThrow(/UNRESOLVABLE SYMLINK/);
  });

  it('the real tree contains no symlink under a hashed root, which is why this costs nothing', () => {
    // `statSync` is only reached for an entry that is genuinely a link. If this
    // ever fails, the note in `classifyEntries` about zero cost has stopped being
    // true and wants re-reading, not deleting.
    expect(() => computeRulesFingerprint()).not.toThrow();
    expect(() => computeInstrumentFingerprint()).not.toThrow();
  });
});

describe('OI-7 · a file TypeScript cannot parse never hashes silently', () => {
  const roots: string[] = [];
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  const fileWith = (body: string): string => {
    const root = mkdtempSync(join(tmpdir(), 'sq-oi7-'));
    roots.push(root);
    const path = join(root, 'broken.ts');
    writeFileSync(path, body, 'utf8');
    return path;
  };

  it('throws on the exact snippet that used to hash anyway', () => {
    // `ts.createSourceFile('export const A = (')` does not throw: it recovers,
    // records one diagnostic, and prints `export const A = ();`. The old code
    // hashed that recovered tree without a word.
    expect(() => hashSemantic(fileWith('export const A = ('))).toThrow(/UNPARSEABLE/);
  });

  it('names the file, the position and the parser message', () => {
    try {
      hashSemantic(fileWith('export const DC = 12;\nexport const A = (\n'));
      throw new Error('expected the parse check to fire');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('broken.ts:');
      expect(message).toContain('Expression expected.');
    }
  });

  it('does not fire on valid TypeScript, including the syntax this repo uses', () => {
    // The false-positive direction. A check that tripped on a real source would
    // be removed within the week, so it has to be quiet on the corpus.
    expect(() =>
      hashSemantic(
        fileWith(
          'import type { X } from "./x.js";\n' +
            'export const enum E { A = 1 }\n' +
            'export const f = <T,>(x: T): T => x satisfies T;\n' +
            'export const g = { a: 1 } as const;\n',
        ),
      ),
    ).not.toThrow();
  });

  it('stops the whole fingerprint, not just the one file', () => {
    const root = minimalRepo(roots);
    writeFileSync(join(root, CONTENT_SOURCE_ROOT, 'ports.ts'), 'export const P = (\n', 'utf8');
    expect(() => computeRulesFingerprint(root)).toThrow(/UNPARSEABLE/);
  });

  it('refuses to run at all if the parser stops reporting diagnostics', () => {
    // The assertion's own failure mode: `parseDiagnostics` is `@internal`, so a
    // TypeScript upgrade could rename it and leave a check that silently stops
    // checking. That fails loudly instead.
    expect(() => assertParseClean({} as ts.SourceFile, 'nowhere.ts')).toThrow(
      /no longer readable from the TypeScript API/,
    );
  });

  it('every currently hashed source parses with zero diagnostics', () => {
    // The corpus proof, pinned rather than remembered: this is what makes the
    // assertion safe to leave switched on, and it is exactly the check that would
    // catch a half-written rule module before a sweep measured one.
    const corpus = [
      ...ruleSources().map((source) => source.path),
      ...computeInstrumentFingerprint().files.map((source) => source.path),
    ];
    expect(corpus.length).toBeGreaterThan(50);
    const unparseable = corpus.filter((relative) => {
      try {
        hashSemantic(join(REPO_ROOT, relative));
        return false;
      } catch {
        return true;
      }
    });
    expect(unparseable).toEqual([]);
  });
});
