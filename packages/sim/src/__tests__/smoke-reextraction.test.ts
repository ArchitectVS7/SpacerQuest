import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createInitialState } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

import type { BaselineAggregate } from '../balance/aggregate.js';
import { extractFixture, type SmokeFixture } from '../balance/checkpoints.js';
import { REPO_ROOT } from '../balance/rules-fingerprint.js';

// ---------------------------------------------------------------------------
// T-166 · THE RE-EXTRACTION RULE, CHECKED AGAINST THE COMMIT IT CITES.
//
// THE RULE (BR-8 / BR-9 / `docs/BALANCE-TELEMETRY_SPEC.md` §6, third bullet):
//
//   Re-extracting `docs/balance/smoke/tiers.json` after a behaviour-inert change
//   moves `productVersion`, the three fingerprints and `provenance` — AND NOTHING
//   ELSE. Every recorded measurement (the `checkpoints` array: tier spreads, seed
//   lists, folded outcomes, outcome hashes) and `saveSchemaVersion` are
//   byte-identical.
//
// THE DEFECT CLASS THIS FILE CLOSES (F-140-3, harvested at T-140, filed as T-166).
// §6 of the telemetry spec asserted an Accept criterion "the `rulesFingerprint`
// move is the ONLY expected diff" and cited T-110 (`3468ef5f`) as its precedent.
// It had been transcribed from a SUMMARY (`docs/TESTING-STRATEGY.md`) rather than
// read off the commit, and the commit contradicts it: four JSON paths moved. The
// owner ruling of 2026-08-01 reworded §6 to "fingerprints and `provenance` only",
// which is STILL one field short — `3468ef5f` also moved `productVersion`, which
// is neither a fingerprint nor `provenance`.
//
// Twice wrong about the same four-line diff, because nothing ever read it. So the
// check below does not restate the rule from a doc: it reads BOTH BLOBS OUT OF
// GIT at `3468ef5f` and its parent and asserts the rule against the real diff
// (section 1), then asserts the same rule over a LIVE re-extraction of the
// committed fixture from the baseline its own provenance names (section 2).
//
// EVIDENCE, so a reader need not re-derive it:
//   git show 3468ef5f^:docs/balance/smoke/tiers.json  vs  3468ef5f:...
//   moved: productVersion, rulesFingerprint, docsFingerprint, provenance.gitCommit
//   `JSON.stringify(checkpoints)` identical on both sides.
//
// NO ESCAPE HATCH. If this suite goes red:
//   - section 1 red  => a DOC no longer describes the precedent it cites. Repair
//     the doc (§6 and BR-8). NEVER edit the expectation, and never widen
//     `MUTABLE_FIXTURE_FIELDS` so a field stops being reported — that is the same
//     move as widening a balance band to clear a gate, and it is forbidden for the
//     same reason (`docs/BALANCE-POLICY.md`).
//   - section 2 red  => the committed fixture and the tree disagree about a
//     MEASURED number. The remedy is a re-extraction (BR-9), never a hand edit of
//     `docs/balance/smoke/tiers.json`.
//
// WHY THIS LIVES IN `__tests__` AND NOT IN `packages/sim/src/balance/`.
// Every module under `balance/` is either a hashed instrument source or a
// classified non-instrument; a new file there would move `instrumentFingerprint`,
// stale the very fixture this check is about, and owe a re-extraction just to
// check re-extractions. `__tests__` is in `HASHED_ROOT_IGNORED_DIRECTORIES`, so
// nothing in this file can move a fingerprint. Same argument, same reason, as
// `baseline-pointers.test.ts`.
//
// WHAT THIS DOES NOT DO. It does not grade freshness — `fixtureFreshness`, run by
// `balance-smoke.test.ts`, owns rules/instrument/save-schema staleness. It
// therefore does NOT assert that the allowed set is empty: `docsFingerprint` and
// `productVersion` are legitimately allowed to drift between capstones. This file
// owns exactly one question: when a re-extraction happens, did anything move that
// is not allowed to?
// ---------------------------------------------------------------------------

/** Full sha, never an abbreviation — an abbreviation can collide as history grows. */
const PRECEDENT = '3468ef5f138e51e468b19bd1cf58e1a80ed440dc';

/** Repo-relative, POSIX — this string is handed to `git show`, not to the OS. */
const FIXTURE_REPO_PATH = 'docs/balance/smoke/tiers.json';

const FIXTURE_PATH = join(REPO_ROOT, 'docs', 'balance', 'smoke', 'tiers.json');

/**
 * The fields a re-extraction MAY move, plus the whole `provenance` subtree.
 *
 * DO NOT ADD TO THIS LIST TO MAKE A FAILURE GO AWAY. Every entry here is a field
 * that carries no measurement: a version string and three hashes. A measured
 * number that starts moving is a finding, not a classification error.
 */
const MUTABLE_FIXTURE_FIELDS: readonly string[] = [
  'productVersion',
  'rulesFingerprint',
  'instrumentFingerprint',
  'docsFingerprint',
];

/** The subtree that records WHEN and WHERE the measurement ran, never WHAT it measured. */
const MUTABLE_FIXTURE_SUBTREE = 'provenance';

// ---------------------------------------------------------------------------
// 0 · The pure classifier — exported so it can be driven with seeded-bad input
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function walk(before: unknown, after: unknown, path: string, moved: string[]): void {
  if (isRecord(before) && isRecord(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const child = path === '' ? key : `${path}.${key}`;
      if (!(key in before) || !(key in after)) {
        // An added or removed key is a move of that key, not a recursion target.
        moved.push(child);
        continue;
      }
      walk(before[key], after[key], child, moved);
    }
    return;
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    for (let index = 0; index < before.length; index += 1) {
      walk(before[index], after[index], `${path}[${index}]`, moved);
    }
    return;
  }
  // Leaves — and arrays whose LENGTH changed, which are reported whole rather than
  // as a bogus element-wise diff. `JSON.stringify` equality is the byte-identity
  // test the rule is written in.
  if (JSON.stringify(before) !== JSON.stringify(after)) moved.push(path === '' ? '<root>' : path);
}

/** Every leaf path that differs between two parsed fixtures, sorted, deduped by construction. */
export function movedPaths(before: unknown, after: unknown): string[] {
  const moved: string[] = [];
  walk(before, after, '', moved);
  return moved.sort();
}

export interface MoveClassification {
  readonly allowed: string[];
  /** Non-empty means the rule was broken. There is no "acceptable" forbidden move. */
  readonly forbidden: string[];
}

/**
 * A path is ALLOWED iff it is one of the four version/hash fields or lives under
 * `provenance`. Everything else is FORBIDDEN — including `saveSchemaVersion`,
 * deliberately: a moved save schema is already a hard `FreshnessProblem` in
 * `fixtureFreshness`, so forbidding it here introduces no new false-positive class.
 */
export function classifyMoves(paths: readonly string[]): MoveClassification {
  const allowed: string[] = [];
  const forbidden: string[] = [];
  for (const path of paths) {
    const root = path.split(/[.[]/)[0];
    if (MUTABLE_FIXTURE_FIELDS.includes(path) || root === MUTABLE_FIXTURE_SUBTREE)
      allowed.push(path);
    else forbidden.push(path);
  }
  return { allowed, forbidden };
}

// ---------------------------------------------------------------------------
// 1 · THE PRECEDENT CHECK — read the commit, not a summary of it
// ---------------------------------------------------------------------------

function assertPrecedentReachable(): void {
  for (const rev of [`${PRECEDENT}^{commit}`, `${PRECEDENT}^^{commit}`]) {
    try {
      execFileSync('git', ['cat-file', '-e', rev], { cwd: REPO_ROOT, stdio: 'ignore' });
    } catch {
      throw new Error(
        `T-166: cannot reach ${rev}. This check reads the precedent commit ITSELF out of ` +
          `history — that is the whole point of it, because the defect it closes is a rule ` +
          `transcribed from a summary instead of from the diff. A shallow clone cannot answer ` +
          `it: run \`git fetch --unshallow\` (CI checks out with fetch-depth: 0 for exactly ` +
          `this reason — see .github/workflows/ci.yml). Do NOT skip this test to make it pass.`,
      );
    }
  }
}

function gitShowFixture(rev: string): unknown {
  const blob = execFileSync('git', ['show', `${rev}:${FIXTURE_REPO_PATH}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(blob) as unknown;
}

describe('T-166 · the rule §6 and BR-8 state, checked against `3468ef5f` itself', () => {
  it('moves exactly productVersion, two fingerprints and provenance.gitCommit', () => {
    assertPrecedentReachable();
    const before = gitShowFixture(`${PRECEDENT}^`);
    const after = gitShowFixture(PRECEDENT);

    expect(
      movedPaths(before, after),
      'the rule in `docs/BALANCE-TELEMETRY_SPEC.md` §6 and `docs/BALANCE-RIG-DECISIONS.md` ' +
        'BR-8 no longer describes the precedent it cites — REPAIR THE DOC, do not edit this ' +
        'expectation. This list is the real diff of the commit both documents point at.',
    ).toEqual(
      ['productVersion', 'rulesFingerprint', 'docsFingerprint', 'provenance.gitCommit'].sort(),
    );
  });

  it('moves nothing outside the allowed set', () => {
    assertPrecedentReachable();
    const moved = movedPaths(gitShowFixture(`${PRECEDENT}^`), gitShowFixture(PRECEDENT));
    expect(classifyMoves(moved).forbidden).toEqual([]);
  });

  it('leaves every recorded measurement byte-identical', () => {
    // Stated separately from the path list so a failure names WHICH half of the
    // rule broke: the "only these fields move" half, or the "measurements are
    // byte-identical" half.
    assertPrecedentReachable();
    const before = gitShowFixture(`${PRECEDENT}^`) as SmokeFixture;
    const after = gitShowFixture(PRECEDENT) as SmokeFixture;
    expect(JSON.stringify(after.checkpoints)).toBe(JSON.stringify(before.checkpoints));
    expect(after.saveSchemaVersion).toBe(before.saveSchemaVersion);
  });
});

// ---------------------------------------------------------------------------
// 2 · THE LIVE RE-EXTRACTION CHECK — the same rule, over this tree
// ---------------------------------------------------------------------------

describe('T-166 · re-extracting the committed fixture moves no measurement', () => {
  it('reproduces every recorded number from the baseline its provenance names', () => {
    const committed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as SmokeFixture;
    const label = committed.provenance.sweepLabel;
    const aggregatePath = join(REPO_ROOT, 'docs', 'balance', `baseline-${label}.json`);

    // NO FALLBACK. Resolving to some other baseline when the named one is missing
    // is F-146-0's trap: it turns "the capstone is gone" into a green run measured
    // against the wrong sweep.
    expect(
      existsSync(aggregatePath),
      `docs/balance/smoke/tiers.json names sweepLabel "${label}", but ` +
        `docs/balance/baseline-${label}.json does not exist. The fixture cannot be ` +
        `re-extracted from a capstone that is not in the repo — restore it, or re-extract ` +
        `from the current baseline of record with:\n` +
        `  npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/baseline-<label>.json`,
    ).toBe(true);

    const aggregate = JSON.parse(readFileSync(aggregatePath, 'utf8')) as BaselineAggregate;
    expect(
      aggregate.label,
      `docs/balance/baseline-${label}.json carries label "${aggregate.label}" — the file name ` +
        `and the sweep it holds disagree, so the fixture's provenance points at the wrong run.`,
    ).toBe(label);

    // Hold still the two fields that move UNCONDITIONALLY (the extraction date and
    // the commit it ran at), so every remaining move is a real one.
    const fresh = extractFixture(aggregate, {
      extractedOn: committed.provenance.extractedOn,
      gitCommit: committed.provenance.gitCommit,
      npcCount: createInitialState(1).npcs.length,
    });

    const { forbidden } = classifyMoves(movedPaths(committed, fresh));
    expect(
      forbidden,
      `re-extracting docs/balance/smoke/tiers.json from docs/balance/baseline-${label}.json ` +
        `moved fields that carry MEASUREMENTS, not provenance:\n  ${forbidden.join('\n  ')}\n` +
        `Either the tree no longer produces what the fixture records, or the fixture was ` +
        `hand-edited. The remedy is a re-extraction (BR-9), never a hand edit:\n` +
        `  npm run balance:extract -w @spacerquest/sim -- --aggregate docs/balance/baseline-${label}.json`,
    ).toEqual([]);

    expect(JSON.stringify(fresh.checkpoints)).toBe(JSON.stringify(committed.checkpoints));
    expect(fresh.saveSchemaVersion).toBe(committed.saveSchemaVersion);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// 3 · PROVEN ABLE TO GO RED — seeded-bad input against the pure classifier
// ---------------------------------------------------------------------------

describe('T-166 · the checker has teeth (seeded-bad, so the proof outlives a manual demo)', () => {
  const committed = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as SmokeFixture;
  const clone = (): SmokeFixture => JSON.parse(JSON.stringify(committed)) as SmokeFixture;

  /** ANTI-VACUITY: an empty result must mean "walked and found nothing", not "never recursed". */
  it('reports no move for identical fixtures', () => {
    expect(movedPaths(committed, clone())).toEqual([]);
    expect(committed.checkpoints.length).toBeGreaterThan(0);
    expect(committed.checkpoints[0].expected.length).toBeGreaterThan(0);
  });

  it('catches a nudged credits median', () => {
    const bad = clone();
    bad.checkpoints[0].expected[0].creditsMedian += 1;
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual(['checkpoints[0].expected[0].creditsMedian']);
  });

  it('catches a changed outcome hash', () => {
    const bad = clone();
    bad.checkpoints[0].expected[0].outcomeHash = '0000000000000000';
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual(['checkpoints[0].expected[0].outcomeHash']);
  });

  it('catches a dropped seed', () => {
    const bad = clone();
    bad.checkpoints[0].seeds = bad.checkpoints[0].seeds.slice(0, -1);
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual(['checkpoints[0].seeds']);
  });

  it('catches a perturbed tier spread', () => {
    const index = committed.checkpoints.findIndex((tier) => tier.spread !== null);
    expect(
      index,
      'no tier carries a spread — the seeded-bad case below would be vacuous',
    ).toBeGreaterThanOrEqual(0);
    const bad = clone();
    const spread = bad.checkpoints[index].spread;
    expect(spread).not.toBeNull();
    if (spread === null) throw new Error('unreachable');
    spread.player[0].credits += 1;
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual([`checkpoints[${index}].spread.player[0].credits`]);
  });

  it('catches a moved save schema version rather than waving it through', () => {
    const bad = clone();
    bad.saveSchemaVersion += 1;
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual(['saveSchemaVersion']);
  });

  it('catches a dropped checkpoint', () => {
    const bad = clone();
    bad.checkpoints = bad.checkpoints.slice(0, -1);
    const { forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual(['checkpoints']);
  });

  it('allows exactly the four version/hash fields and the whole provenance subtree', () => {
    const bad = clone();
    bad.productVersion = '99.99.99';
    bad.rulesFingerprint = '0000000000000001';
    bad.instrumentFingerprint = '0000000000000002';
    bad.docsFingerprint = '0000000000000003';
    bad.provenance.gitCommit = 'f'.repeat(40);
    bad.provenance.extractedOn = '1999-01-01';
    const { allowed, forbidden } = classifyMoves(movedPaths(committed, bad));
    expect(forbidden).toEqual([]);
    expect(allowed.sort()).toEqual(
      [
        'docsFingerprint',
        'instrumentFingerprint',
        'productVersion',
        'provenance.extractedOn',
        'provenance.gitCommit',
        'rulesFingerprint',
      ].sort(),
    );
  });
});
