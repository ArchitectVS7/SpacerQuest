import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../balance/rules-fingerprint.js';

// ---------------------------------------------------------------------------
// T-165 · BR-14's enforcement — the baseline-of-record pointer sites must agree.
//
// `docs/BALANCE-RIG-DECISIONS.md` BR-14 says: "Re-pinning the baseline of record
// moves ALL its pointers in the same commit." Until this file existed, that rule
// was enforced only by a human remembering it, and it was broken three times:
//
//   T-131 and T-133 both left `docs/balance/smoke/README.md` stale (T-137 caught
//   it by hand, which is the harvest this task came from), and then T-188, T-195
//   and T-199 each moved the baseline while leaving THREE of the five sites
//   behind — the status banner, the smoke README, and BR-14's own sentence. All
//   three were still stale at T-165's start; this suite was RED ON ARRIVAL
//   against real drift, not against a synthetic fixture.
//
// THE FIVE SITES. The task block and `TODO.md`'s backlog bullet both say "four";
// they were written from the T-116/T-137 harvest, BEFORE T-182 added a fifth
// (BR-14's own "current baseline of record" sentence — see `TASKS.md:305` and
// BR-14's parenthetical). This suite checks all five:
//
//   1. `packages/sim/src/__tests__/balance-targets.test.ts` — `BASELINE_OF_RECORD_PATH`.
//      THE AUTHORITATIVE SITE: it is the only one a test actually READS at runtime,
//      so it is the one the other four are compared against.
//   2. `docs/NPC_REDESIGN.md` — standing amendment 1's "Baseline of record is …".
//   3. `docs/NPC_REDESIGN.md` — the status banner's NEWEST "BASELINE OF RECORD
//      RE-PINNED AT T-nnn" block.
//   4. `docs/balance/smoke/README.md` — the "The current baseline (…)" line.
//   5. `docs/BALANCE-RIG-DECISIONS.md` — BR-14's own "current baseline of record is …".
//
// NO ESCAPE HATCH. IF THIS SUITE GOES RED, A POINTER WENT STALE — RE-PIN IT.
// The fix is always to move the lagging site forward to the capstone that
// actually describes HEAD. Never edit a site to match a stale one, never relax an
// extractor so a divergence stops resolving, and never delete a site from `SITES`
// to make the comparison pass: that is the same move as widening a band to clear
// a gate, and it is forbidden for the same reason.
//
// A "no match" is a FAILURE, never agreement. `readPointer` returning `null` is
// treated as loudly as a mismatch (test 1), because the cheapest way to silently
// disable a doc-scraping check is to reword the sentence it anchors on.
//
// The check is PROVEN ABLE TO GO RED, permanently: `disagreements()` is a pure
// function over already-read values, and test 3 drives it with seeded-bad reading
// sets (`archetype-coverage.test.ts`'s section-B idiom). That proof survives in
// the repo, unlike a one-off manual de-sync that gets reverted.
//
// This list lives IN THIS TEST FILE on purpose. A module under
// `packages/sim/src/balance/` — including a step in `balance/gate.ts` — is a
// hashed instrument source: adding one would move `instrumentFingerprint`, stale
// `docs/balance/smoke/tiers.json` and the baseline it was extracted from, and turn
// a documentation-consistency check into an 8,000-row capstone. `__tests__` is in
// `HASHED_ROOT_IGNORED_DIRECTORIES`, so nothing here can move a fingerprint.
// ---------------------------------------------------------------------------

const DOCS = join(REPO_ROOT, 'docs');

/** A bare `baseline-*.json` name, with or without its `docs/balance/` prefix —
 *  site 4 writes it without, the other four with. */
const BASELINE_NAME = String.raw`(?:docs\/balance\/)?(baseline-[A-Za-z0-9._-]+\.json)`;

interface PointerSite {
  /** Short id, used in failure messages. */
  readonly id: string;
  /** Repo-relative path, so a failure names a file a reader can open. */
  readonly path: string;
  /** The sentence or declaration the pointer lives in. */
  readonly what: string;
  /** Returns the bare `baseline-*.json`, or `null` if the anchor no longer resolves. */
  readonly extract: (text: string) => string | null;
}

/** `RegExp.exec` against `text` from `from`, returning capture group 1. */
function firstAfter(text: string, from: number, pattern: RegExp): string | null {
  if (from < 0) return null;
  const scoped = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g',
  );
  scoped.lastIndex = from;
  const match = scoped.exec(text);
  return match?.[1] ?? null;
}

/** Every index at which the status banner opens a re-pin block. */
function repinBlockIndices(text: string): number[] {
  const indices: number[] = [];
  const pattern = /\*\*BASELINE OF RECORD RE-PINNED AT T-(\d+)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    indices.push(match.index);
    match = pattern.exec(text);
  }
  return indices;
}

/** The T-numbers of the status banner's re-pin blocks, in file order. */
export function repinBlockTaskIds(text: string): string[] {
  const ids: string[] = [];
  // `[a-z]?` because task ids are not always bare numbers: the M17 arc split T-196
  // into T-196a/b/c. The suffix is part of the id and is captured, not discarded.
  const pattern = /\*\*BASELINE OF RECORD RE-PINNED AT T-(\d+[a-z]?)/g;
  let match = pattern.exec(text);
  while (match !== null) {
    ids.push(match[1]);
    match = pattern.exec(text);
  }
  return ids;
}

const SITES: readonly PointerSite[] = [
  {
    id: 'balance-targets',
    path: 'packages/sim/src/__tests__/balance-targets.test.ts',
    what: '`BASELINE_OF_RECORD_PATH` — the one pointer a test reads at runtime',
    extract: (text) =>
      firstAfter(text, text.indexOf('const BASELINE_OF_RECORD_PATH ='), new RegExp(BASELINE_NAME)),
  },
  {
    id: 'npc-amendment-1',
    path: 'docs/NPC_REDESIGN.md',
    what: "standing amendment 1's `**Baseline of record is …**` blockquote",
    extract: (text) =>
      new RegExp(String.raw`\*\*Baseline of record is \`` + BASELINE_NAME + '`').exec(text)?.[1] ??
      null,
  },
  {
    id: 'npc-status-banner',
    path: 'docs/NPC_REDESIGN.md',
    what: 'the status banner\'s NEWEST "BASELINE OF RECORD RE-PINNED AT T-nnn" block',
    extract: (text) => {
      const indices = repinBlockIndices(text);
      if (indices.length === 0) return null;
      // The newest block sits at the TOP of the banner — load-bearing, and asserted
      // as such in the suite below, not merely assumed here.
      return firstAfter(text, Math.min(...indices), new RegExp(BASELINE_NAME));
    },
  },
  {
    id: 'smoke-readme',
    path: 'docs/balance/smoke/README.md',
    what: 'the "Re-measuring? Match the outgoing capstone\'s shape" paragraph\'s current-baseline line',
    extract: (text) =>
      new RegExp(String.raw`The current baseline \(\`` + BASELINE_NAME + '`').exec(text)?.[1] ??
      null,
  },
  {
    id: 'rig-decisions-br14',
    path: 'docs/BALANCE-RIG-DECISIONS.md',
    what: 'BR-14\'s own "current baseline of record is …" sentence (the fifth pointer, added at T-182)',
    // Whitespace-tolerant: BR-14 wraps as "The current\nbaseline of record is".
    extract: (text) =>
      new RegExp(String.raw`current\s+baseline of record is \`` + BASELINE_NAME + '`').exec(
        text,
      )?.[1] ?? null,
  },
];

/** The site the other four are graded against — the only one read at runtime. */
const AUTHORITATIVE_SITE_ID = 'balance-targets';

interface PointerReading {
  readonly id: string;
  readonly path: string;
  readonly value: string | null;
}

function readPointer(site: PointerSite): PointerReading {
  const absolute = join(REPO_ROOT, site.path);
  return { id: site.id, path: site.path, value: site.extract(readFileSync(absolute, 'utf8')) };
}

/**
 * THE PURE COMPARISON. Separated from disk I/O so the checker itself can be
 * driven with seeded-bad input and PROVEN to go red — see test 3. Returns one
 * human-readable line per problem; an empty array means every site agrees.
 */
export function disagreements(readings: readonly PointerReading[]): string[] {
  const problems: string[] = [];
  for (const reading of readings) {
    if (reading.value === null) {
      problems.push(
        `${reading.id} (${reading.path}): the pointer ANCHOR DID NOT RESOLVE — the sentence was ` +
          `reworded or the pointer removed. A site that cannot be read is not a site that agrees.`,
      );
    }
  }
  const resolved = readings.filter((reading) => reading.value !== null);
  if (resolved.length === 0) return problems;
  const reference = resolved.find((reading) => reading.id === AUTHORITATIVE_SITE_ID) ?? resolved[0];
  for (const reading of resolved) {
    if (reading.value !== reference.value) {
      problems.push(
        `${reading.id} (${reading.path}) points at ${String(reading.value)} but ${reference.id} ` +
          `(${reference.path}) points at ${String(reference.value)} — one of them is stale. ` +
          `Re-pin the lagging site; never edit a site to match a stale one.`,
      );
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 1 · Every site still resolves
// ---------------------------------------------------------------------------

describe('T-165 · the five baseline-of-record pointer sites', () => {
  it('every site still resolves to a baseline file name', () => {
    for (const site of SITES) {
      const reading = readPointer(site);
      expect(
        reading.value,
        `${site.id}: could not find the pointer in ${site.path} (${site.what}). A doc reword ` +
          `must not be allowed to silently switch this check off — re-anchor the extractor on ` +
          `the new wording, or restore the pointer.`,
      ).not.toBeNull();
      expect(reading.value).toMatch(/^baseline-[A-Za-z0-9._-]+\.json$/);
    }
  });

  // -------------------------------------------------------------------------
  // 2 · They all agree, and the file they name exists
  // -------------------------------------------------------------------------

  it('all five agree with the runtime pointer, and that capstone exists on disk', () => {
    const readings = SITES.map(readPointer);
    expect(disagreements(readings).join('\n')).toBe('');

    const agreed = readings[0].value;
    expect(agreed).not.toBeNull();
    // Existence only — NEVER label-equals-filename. `baseline-t195-dawn-dice.json`
    // carries `label: "t193-dawn-dice"`, a pre-existing historical mismatch that is
    // out of scope here; asserting the label would red on an artifact nobody may edit.
    expect(
      existsSync(join(DOCS, 'balance', String(agreed))),
      `every pointer names ${String(agreed)}, but docs/balance/${String(agreed)} does not exist — ` +
        `the capstone was renamed or never committed.`,
    ).toBe(true);
  });

  it('the status banner keeps its newest re-pin block at the TOP', () => {
    // T-196a · THE PROXY CHANGED; THE PROPERTY DID NOT — and the proxy was wrong, not
    // merely inconvenient. This test used to assert `taskNumbers[0] === max(taskNumbers)`,
    // i.e. that task ids increase monotonically with time. They do not in this repo:
    // T-196a is the re-pin AFTER T-199 (see `TASKS.md` — "sequence T-199 first, gate the
    // rest of the backlog behind T-198", and the M17 arc's own T-196a/b/c split), so the
    // numeric check would demand the banner be ordered OLDEST-first, which is the exact
    // opposite of what `npc-status-banner`'s extractor needs.
    //
    // What the extractor actually needs is asserted directly instead: the FIRST block in
    // file order must name the baseline every other pointer agrees on. That is strictly
    // stronger than the ordering proxy — a re-pin appended at the BOTTOM still fails,
    // because the first block would then name the previous capstone.
    const text = readFileSync(join(DOCS, 'NPC_REDESIGN.md'), 'utf8');
    const taskIds = repinBlockTaskIds(text);
    expect(taskIds.length).toBeGreaterThan(1);

    const firstBlock = firstAfter(
      text,
      Math.min(...repinBlockIndices(text)),
      new RegExp(BASELINE_NAME),
    );
    const authoritative = SITES.find((site) => site.id === 'balance-targets')!;
    const agreed = authoritative.extract(readFileSync(join(REPO_ROOT, authoritative.path), 'utf8'));
    expect(agreed).not.toBeNull();
    expect(
      firstBlock,
      `the status banner's FIRST re-pin block (T-${taskIds[0]}) names ${String(firstBlock)}, but ` +
        `the authoritative pointer names ${String(agreed)} — a new re-pin was appended at the ` +
        `BOTTOM. Insert it at the top, where every reader and this check look for it.`,
    ).toBe(agreed);
  });

  // -------------------------------------------------------------------------
  // 3 · Seeded-bad — the permanent proof the check can go red
  // -------------------------------------------------------------------------

  it('reports a de-synced site (seeded-bad, so the teeth outlive the manual demo)', () => {
    const clean: PointerReading[] = SITES.map((site) => ({
      id: site.id,
      path: site.path,
      value: 'baseline-t199-pacifist.json',
    }));
    expect(disagreements(clean)).toEqual([]);

    const desynced = clean.map((reading) =>
      reading.id === 'smoke-readme' ? { ...reading, value: 'baseline-t125-hangout.json' } : reading,
    );
    const found = disagreements(desynced);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('smoke-readme');
    expect(found[0]).toContain('baseline-t125-hangout.json');
    expect(found[0]).toContain('baseline-t199-pacifist.json');
  });

  it('reports an unresolved site rather than treating "no match" as agreement', () => {
    const withNull: PointerReading[] = SITES.map((site) => ({
      id: site.id,
      path: site.path,
      value: site.id === 'rig-decisions-br14' ? null : 'baseline-t199-pacifist.json',
    }));
    const found = disagreements(withNull);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('rig-decisions-br14');
    expect(found[0]).toContain('ANCHOR DID NOT RESOLVE');
  });

  it('grades the other sites against the runtime pointer, not against a majority', () => {
    // Four stale sites and one correct one is still four stale sites: the authoritative
    // reading is the one `balance-targets.test.ts` actually loads, never the popular one.
    const readings: PointerReading[] = SITES.map((site) => ({
      id: site.id,
      path: site.path,
      value:
        site.id === AUTHORITATIVE_SITE_ID
          ? 'baseline-t199-pacifist.json'
          : 'baseline-t125-hangout.json',
    }));
    const found = disagreements(readings);
    expect(found).toHaveLength(SITES.length - 1);
    for (const problem of found) expect(problem).toContain('balance-targets');
  });
});

// ---------------------------------------------------------------------------
// 4 · Totality — no SIXTH pointer appears the way the fifth did
// ---------------------------------------------------------------------------

/**
 * The phrases a baseline-of-record pointer is written in. Any `docs/**` file
 * carrying one is either a checked site or an acknowledged non-pointer.
 */
const POINTER_PHRASES: readonly RegExp[] = [
  /current\s+baseline of record/i,
  /Baseline of record is/i,
  /BASELINE OF RECORD RE-PINNED AT/i,
  /The current baseline \(/,
];

/**
 * Files that carry a pointer PHRASE but are NOT pointers — each with the reason,
 * because a bare list is a place to dump inconvenient names (the map-not-list
 * shape `rules-fingerprint.ts` uses for the same reason).
 *
 * NOT SCANNED AT ALL: `TASKS.md` and `TODO.md` at the repo root. They are work
 * logs — by construction full of historical baseline filenames recording what the
 * pointer WAS at each task — so every line in them would need an entry here. They
 * are outside `docs/`, so the walk below never reaches them; this note is the
 * record that the omission is a decision, not an oversight.
 */
const ACKNOWLEDGED_NON_POINTERS: Readonly<Record<string, string>> = {
  'BALANCE-REDESIGN-WORKLIST.md':
    'The R-series worklist, PAUSED and frozen. Its :730 note SUBORDINATES ITSELF IN ITS OWN ' +
    'TEXT ("The authoritative pointer is standing amendment 1 … If this note and the amendment ' +
    'ever disagree, the amendment wins"); :233 and :317 are dated R0/R1 results recording what ' +
    'the baseline was at those steps.',
  'HANGOUT_REDESIGN.md':
    "T-125's and T-150's delivery notes, recording what the pointer LIST was at those tasks " +
    '(":2168 · Baseline of record re-pinned in all four places"). History of a re-pin, not a pointer.',
  'LIARS-DICE_REDESIGN.md':
    '§17.5\'s "four corrections to the task\'s own framing", naming the baseline that was current ' +
    'when T-160 ran. A dated correction note, superseded by construction.',
  'N-SERIES-REVIEW-2026-07-30.md':
    'A dated review brief quoting the state of the record on 2026-07-30, explicitly as a fact ' +
    'about the record rather than as the pointer.',
  'DEV-CONTROL-PANEL_SPEC.md':
    'Names no filename at all — the phrase appears in "Promoting a run to the committed baseline ' +
    'of record is a separate, deliberate action", a rule about how re-pinning happens.',
};

/** Every `.md` under `docs/`, repo-relative to `docs/`. */
function docsMarkdownFiles(directory: string = DOCS): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...docsMarkdownFiles(absolute));
    else if (entry.name.endsWith('.md')) found.push(relative(DOCS, absolute).split(sep).join('/'));
  }
  return found.sort();
}

describe('T-165 · totality — every pointer phrase under docs/ is classified', () => {
  it('carries no unclassified sixth pointer', () => {
    const siteFiles = new Set(
      SITES.filter((site) => site.path.startsWith('docs/')).map((site) =>
        site.path.slice('docs/'.length),
      ),
    );
    const unclassified: string[] = [];
    for (const file of docsMarkdownFiles()) {
      const text = readFileSync(join(DOCS, file), 'utf8');
      if (!POINTER_PHRASES.some((phrase) => phrase.test(text))) continue;
      if (siteFiles.has(file)) continue;
      if (file in ACKNOWLEDGED_NON_POINTERS) continue;
      unclassified.push(file);
    }
    expect(
      unclassified,
      `docs/${unclassified.join(', docs/')} names the baseline of record but is neither a checked ` +
        `site nor an acknowledged non-pointer. This is how the FIFTH pointer appeared unnoticed ` +
        `(T-182). Decide which it is: add it to SITES with an extractor, or to ` +
        `ACKNOWLEDGED_NON_POINTERS with the reason it decides nothing.`,
    ).toEqual([]);
  });

  it('acknowledges nothing that has stopped carrying a pointer phrase', () => {
    // The other direction: an entry that no longer matches is an allowlist growing
    // stale, which is how an allowlist stops describing the repo.
    for (const [file, reason] of Object.entries(ACKNOWLEDGED_NON_POINTERS)) {
      const absolute = join(DOCS, file);
      expect(existsSync(absolute), `${file} is acknowledged but no longer exists`).toBe(true);
      const text = readFileSync(absolute, 'utf8');
      expect(
        POINTER_PHRASES.some((phrase) => phrase.test(text)),
        `${file} no longer carries any pointer phrase — drop its entry ("${reason}").`,
      ).toBe(true);
    }
  });
});
