import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

// ---------------------------------------------------------------------------
// T-163 · A CI trigger enumerated by branch name is not a gate.
//
// This file exists because the same defect landed twice, a fortnight apart, and
// both times the suite that would have caught it never ran on the branch that
// broke it:
//
//   F-112-D  T-1605 deleted the travel PILOT check while `starmap.spec.ts` still
//            asserted it. 7 of 95 specs sat RED on `main@74403ab4` from
//            2026-07-28 until T-112 tripped over them.
//   F-162-3  T-195 shipped `navDieFuelDiscount` / `navDieEvasionFactor` without
//            an e2e run. Six specs sat RED on `redesign/explore-hangout` until
//            T-162 tripped over them.
//
// The mechanism both times: `ci.yml` triggered `push` only on
// `[main, rimward-redesign]`, and every job skipped same-repo PRs on the grounds
// that "the push run of this commit already tested it". On an unlisted branch
// that premise was FALSE, so a `redesign/*` → `main` PR got no `ci` job, no `e2e`
// job, nothing — on the exact commit about to merge.
//
// So this file pins two things, and neither is a string match — it parses:
//
//   1. EVERY workflow runs on EVERY branch (`on.push.branches == ['**']`), or is
//      declared in `DECLARED_BRANCH_NARROWINGS` with a written reason. Two
//      states, no silent third — the `ACKNOWLEDGED_COVERAGE_GAPS` /
//      `SIM_NON_INSTRUMENT_SOURCES` discipline.
//   2. The no-duplicate-run rule the widening must not disturb: every `ci.yml`
//      job still carries the identical same-repo-PR skip, and `concurrency`
//      still cancels superseded runs.
//
// The RULE, stated once for whoever edits a trigger next: narrow a workflow by
// `paths` (a COST argument — it re-opens itself when the measured thing changes),
// never by branch name (a COVERAGE argument that rots one branch at a time; see
// the `redesign/explore-hangout` entry hand-added to `sweep-gate.yml`'s old list).
//
// L-018 — an acceptance assertion with no negative control passes against a
// no-op — applies with full force here, because every assertion below would also
// hold if `coversBranch` were `() => true`. So the same helper the live
// assertions run through is table-tested against GitHub's glob semantics AND run
// over an inline fixture reproducing the PRE-FIX trigger, which must NOT cover
// `redesign/explore-hangout` while the live file does.
//
// Recorded in `docs/TESTING-STRATEGY.md` Part H, `docs/LESSONS.md` L-036,
// `docs/BALANCE-RIG-DECISIONS.md` BR-40 and `docs/ENGINEERING-POLICY.md` §2.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const WORKFLOW_DIR = join(REPO_ROOT, '.github', 'workflows');

/** Every branch, including names containing `/`. A bare `*` would not match
 *  `redesign/explore-hangout`; under `push.branches` this still excludes tags. */
const EVERY_BRANCH = ['**'];

/**
 * The escape hatch, deliberately shaped so it cannot be used silently: a
 * workflow may narrow by branch name only by appearing here with a reason a
 * human wrote. Totality is asserted in BOTH directions below, so a stale entry
 * fails just as loudly as an undeclared narrowing.
 *
 * EMPTY TODAY, and that is the claim: all three workflows run on all branches.
 */
const DECLARED_BRANCH_NARROWINGS: Record<string, string> = {};

/**
 * The first disjunct of every `ci.yml` job's `if:`. A push ALWAYS runs; the
 * second disjunct only rescues fork PRs, which produce no push run here. Pinned
 * byte-for-byte so the widened trigger cannot be quietly conditioned away again.
 */
const PUSH_ALWAYS_RUNS =
  "github.event_name == 'push' || github.event.pull_request.head.repo.full_name != github.repository";

/** The clause that makes same-repo PR runs redundant rather than missing. */
const SAME_REPO_PR_SKIP = 'github.event.pull_request.head.repo.full_name != github.repository';

// ---------------------------------------------------------------------------
// The helper the whole file rests on, and therefore the thing most worth testing
// ---------------------------------------------------------------------------

/**
 * GitHub's branch-filter glob semantics, enough of them to answer this file's
 * question: `*` matches any run of characters EXCEPT `/`, `**` matches anything
 * including `/`, `?` matches one non-`/` character, and a leading `!` excludes.
 * A ref is covered when it matches at least one positive pattern and no negation.
 */
export function coversBranch(patterns: readonly string[], ref: string): boolean {
  let matched = false;
  for (const pattern of patterns) {
    const negated = pattern.startsWith('!');
    const body = negated ? pattern.slice(1) : pattern;
    if (!globToRegExp(body).test(ref)) continue;
    if (negated) return false;
    matched = true;
  }
  return matched;
}

function globToRegExp(pattern: string): RegExp {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

interface WorkflowStep {
  name?: string;
  run?: string;
  'working-directory'?: string;
}

interface WorkflowJob {
  if?: string;
  steps?: WorkflowStep[];
}

interface Workflow {
  on?: { push?: { branches?: string[] } };
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean };
  jobs?: Record<string, WorkflowJob>;
}

function parseWorkflow(source: string): Workflow {
  // js-yaml v4 uses the YAML 1.2 core schema, so the `on:` key stays the STRING
  // "on" rather than being folded to the boolean `true` as YAML 1.1 would.
  return yaml.load(source) as Workflow;
}

const WORKFLOW_FILES = readdirSync(WORKFLOW_DIR)
  .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
  .sort();

const workflows = new Map<string, Workflow>(
  WORKFLOW_FILES.map((f) => [f, parseWorkflow(readFileSync(join(WORKFLOW_DIR, f), 'utf8'))]),
);

function pushBranches(file: string): string[] | undefined {
  return workflows.get(file)?.on?.push?.branches;
}

describe('coversBranch — GitHub branch-filter glob semantics', () => {
  const REFS = [
    'main',
    'rimward-redesign',
    'redesign/explore-hangout',
    'fix/jump-always-arrives',
    'claude/whatever-abc',
  ];

  it('`**` covers every branch this repository has used, including slashed names', () => {
    for (const ref of REFS) {
      expect(coversBranch(EVERY_BRANCH, ref), ref).toBe(true);
    }
  });

  it('a bare `*` does NOT cover a slashed branch name — which is why the pattern is `**`', () => {
    expect(coversBranch(['*'], 'main')).toBe(true);
    expect(coversBranch(['*'], 'redesign/explore-hangout')).toBe(false);
  });

  it('an enumerated allowlist covers only what it enumerates', () => {
    const OLD = ['main', 'rimward-redesign'];
    expect(coversBranch(OLD, 'main')).toBe(true);
    expect(coversBranch(OLD, 'rimward-redesign')).toBe(true);
    for (const ref of [
      'redesign/explore-hangout',
      'fix/jump-always-arrives',
      'claude/whatever-abc',
    ]) {
      expect(coversBranch(OLD, ref), ref).toBe(false);
    }
  });

  it('`redesign/**` is the same enumeration one iteration later, not a fix', () => {
    expect(coversBranch(['redesign/**'], 'redesign/explore-hangout')).toBe(true);
    expect(coversBranch(['redesign/**'], 'fix/jump-always-arrives')).toBe(false);
  });

  it('honours `?` and a leading `!` exclusion', () => {
    expect(coversBranch(['mai?'], 'main')).toBe(true);
    expect(coversBranch(['mai?'], 'mainline')).toBe(false);
    expect(coversBranch(['**', '!wip/**'], 'wip/scratch')).toBe(false);
    expect(coversBranch(['**', '!wip/**'], 'main')).toBe(true);
  });
});

describe('every workflow runs on every branch', () => {
  it('found the workflows to check (a vacuous sweep is not a pass)', () => {
    expect(WORKFLOW_FILES).toEqual(['ci.yml', 'e2e-flake.yml', 'sweep-gate.yml']);
  });

  it.each(WORKFLOW_FILES)('%s triggers `push` on `**`, or is a declared narrowing', (file) => {
    const branches = pushBranches(file);
    if (file in DECLARED_BRANCH_NARROWINGS) {
      expect(DECLARED_BRANCH_NARROWINGS[file].trim().length).toBeGreaterThan(0);
      return;
    }
    // The WHOLE array, not `.includes('**')` — a re-added allowlist alongside
    // `**` is exactly the drift this is here to catch.
    expect(branches).toEqual(EVERY_BRANCH);
  });

  it('every declared narrowing names a workflow that exists and is actually narrow', () => {
    for (const [file, reason] of Object.entries(DECLARED_BRANCH_NARROWINGS)) {
      expect(WORKFLOW_FILES, `${file} is declared but not present`).toContain(file);
      expect(reason.trim().length, `${file} declares an empty reason`).toBeGreaterThan(0);
      expect(pushBranches(file), `${file} is declared narrow but runs on **`).not.toEqual(
        EVERY_BRANCH,
      );
    }
  });

  it('NEGATIVE CONTROL: the pre-fix trigger fails the same check the live one passes', () => {
    const PRE_FIX = parseWorkflow(
      [
        'name: CI',
        'on:',
        '  push:',
        '    branches: [main, rimward-redesign]',
        '  pull_request:',
      ].join('\n'),
    );
    const preFixBranches = PRE_FIX.on?.push?.branches ?? [];
    // The shape assertion above would have gone RED against this.
    expect(preFixBranches).not.toEqual(EVERY_BRANCH);
    // And the reason it matters, in the terms the failure was actually reported:
    expect(coversBranch(preFixBranches, 'redesign/explore-hangout')).toBe(false);
    expect(coversBranch(pushBranches('ci.yml') ?? [], 'redesign/explore-hangout')).toBe(true);
  });

  it('e2e-flake.yml keeps its `paths` cost filter — only the BRANCH narrowing was removed', () => {
    const flake = workflows.get('e2e-flake.yml') as
      { on?: { push?: { paths?: string[] } } } | undefined;
    const paths = flake?.on?.push?.paths ?? [];
    expect(paths).toContain('packages/ui/e2e/**');
    expect(paths).toContain('.github/workflows/e2e-flake.yml');
  });
});

describe('ci.yml — the e2e suite provably runs on a push to any branch', () => {
  const ci = workflows.get('ci.yml') as Workflow;

  it('the `e2e` job still runs `npm run test:e2e` in packages/ui', () => {
    const steps = ci.jobs?.e2e?.steps ?? [];
    const run = steps.find(
      (s) => s.run?.trim() === 'npm run test:e2e' && s['working-directory'] === 'packages/ui',
    );
    expect(run, 'ci.yml `e2e` job no longer runs `npm run test:e2e`').toBeDefined();
  });

  it('a push can never be conditioned away — the `if:` leads with the push disjunct', () => {
    expect(PUSH_ALWAYS_RUNS.startsWith("github.event_name == 'push' ||")).toBe(true);
    expect(ci.jobs?.e2e?.if).toBe(PUSH_ALWAYS_RUNS);
  });

  it('every job carries the IDENTICAL same-repo-PR skip — no duplicate runs', () => {
    const jobs = Object.entries(ci.jobs ?? {});
    expect(jobs.map(([name]) => name)).toEqual(['ci', 'e2e', 'desktop', 'package']);
    for (const [name, job] of jobs) {
      expect(job.if, `job ${name}`).toBe(PUSH_ALWAYS_RUNS);
      expect(job.if, `job ${name}`).toContain(SAME_REPO_PR_SKIP);
    }
  });

  it('concurrency still cancels superseded runs, keyed by PR number or ref', () => {
    expect(ci.concurrency?.['cancel-in-progress']).toBe(true);
    expect(ci.concurrency?.group).toContain('github.event.pull_request.number');
    expect(ci.concurrency?.group).toContain('github.ref');
  });
});

describe('sweep-gate.yml keeps its shape while its branch list goes', () => {
  const sweep = workflows.get('sweep-gate.yml') as Workflow;

  it('the `gate` job still skips same-repo PRs', () => {
    expect(sweep.jobs?.gate?.if).toContain(SAME_REPO_PR_SKIP);
  });

  it('the gate still sweeps 1-INDEXED shards, then merges, with milestones and both out dirs', () => {
    const runs = (sweep.jobs?.gate?.steps ?? []).map((s) => s.run ?? '').join('\n');
    expect(runs).toContain('--shard 1/2');
    expect(runs).toContain('--shard 2/2');
    expect(runs).toContain('--merge');
    expect(runs).toContain('--milestone-days');
    expect(runs).toContain('--out "$RUNNER_TEMP/balance"');
    expect(runs).toContain('--aggregate-out "$RUNNER_TEMP/balance"');
  });
});
