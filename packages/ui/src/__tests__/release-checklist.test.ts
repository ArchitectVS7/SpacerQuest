import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENT_MANIFEST } from '../steam';

// ---------------------------------------------------------------------------
// T-1704 · "checklist doc complete with every item checked or explicitly waived"
// — read MECHANICALLY, not by eye.
//
// The Accept for this task is a document, and a document is the easiest kind of
// deliverable to half-finish: one row left blank, one `TODO` nobody scrolled to,
// and the checklist reports done while an item is open. So the doc has exactly
// TWO status markers and this file refuses everything else. A row is either
// closed with evidence, or it is a question waiting on the user — there is no
// third state, and "in progress" is not one of them.
//
// THE SECOND HALF OF THE ACCEPT LIVES IN §G, and the first version of this file
// only got halfway to it. It checked that every ⏸ row REACHED the sign-off
// table; it did not check anything about the answers, and the doc's own sentence
// — "A release is not signed off while §G has blanks" — was enforced by nobody.
// So a checklist whose every question was unanswered passed a suite whose whole
// purpose was to make "complete" machine-checked. `scripts/check-signoff.mjs` is
// the missing enforcement and the tests below are what prove IT works: fixtures
// in both directions, plus a both-ways consistency check against the real
// document so this file can neither go red when the user answers nor green while
// they have not.
//
// AND THERE IS A THIRD WAY TO HALF-FINISH A DOCUMENT, which cost a review round
// of its own: not a blank cell but a ✅ on a row that is not closed. E8 — "the
// RC tag itself builds green from a clean clone", which IS the Accept's second
// half — was marked done on the strength of a REHEARSAL performed in a throwaway
// clone whose §G had been filled with fabricated answers, while `git tag -l` in
// this repository returned nothing. "Every waiver has an answer" cannot catch
// that, because the row had stopped being a waiver. `the rows about the tag
// itself` below is the guard for it.
//
// The icon-count assertion is the other half. The store-page art order says how
// many achievement icons to draw; that number is `ACHIEVEMENT_MANIFEST.length ×
// 2`, so it is derived from the constant rather than typed into a doc — the same
// guard `ACHIEVEMENT_MANIFEST.length === DEEDS.length + 1` gives the manifest
// itself. Add a Deed and the art order goes red instead of going short.
// ---------------------------------------------------------------------------

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const doc = readFileSync(join(REPO_ROOT, 'docs', 'RELEASE-CHECKLIST.md'), 'utf8');

const DONE = '✅ DONE';
const WAIVER = '⏸ WAIVER REQUESTED';

/** The header line that marks a table as a CHECKLIST table. Section G (sign-off)
 *  has a different header on purpose, so it is not swept up here. */
const CHECKLIST_HEADER = '| ID | Item | Status | Evidence / open question |';

/** The header of §G, where the user's verbatim answers live. Kept byte-identical
 *  to `scripts/check-signoff.mjs`'s copy — the two are asserted to agree by
 *  "agrees with the real checklist in BOTH directions" below, which would go red
 *  if either header drifted and one of the two parsers stopped seeing the table. */
const SIGNOFF_HEADER = "| ID | Question (short form) | User's response (verbatim) |";

/** Parse the rows of the table introduced by `header`, tracking which table each
 *  line belongs to. A regex over the whole file would also match every other
 *  table in the document; anchoring on the header keeps "which table is this?" a
 *  decision the DOCUMENT makes rather than one the regex makes. */
function tableRows(markdown: string, header: string): string[][] {
  const out: string[][] = [];
  let inTable = false;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === header) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!trimmed.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|[\s-|]+\|$/.test(trimmed)) continue;
    out.push(
      trimmed
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    );
  }
  return out;
}

interface Row {
  cells: string[];
  id: string;
  item: string;
  status: string;
  evidence: string;
}

const rows: Row[] = tableRows(doc, CHECKLIST_HEADER).map((cells) => ({
  cells,
  id: cells[0] ?? '',
  item: cells[1] ?? '',
  status: cells[2] ?? '',
  evidence: cells[3] ?? '',
}));

interface SignOffRow {
  cells: string[];
  id: string;
  question: string;
  answer: string;
}

const signOffRows: SignOffRow[] = tableRows(doc, SIGNOFF_HEADER).map((cells) => ({
  cells,
  id: cells[0] ?? '',
  question: cells[1] ?? '',
  answer: cells[2] ?? '',
}));

describe('T-1704 · docs/RELEASE-CHECKLIST.md is complete', () => {
  it('has checklist rows at all', () => {
    // A doc that lost its tables — a bad merge, a heading renamed — must not pass
    // vacuously. Sections A–G exist, so the floor is deliberately not 1.
    expect(rows.length).toBeGreaterThanOrEqual(20);
  });

  it('EVERY row is either done or explicitly waiting on the user', () => {
    // The mechanical reading of the Accept. No `TODO`, no blank, no `WIP`, no
    // third marker: if a row cannot be closed in this repo it must be a question
    // addressed to the user, phrased as one.
    const bad = rows.filter((row) => row.status !== DONE && row.status !== WAIVER);
    expect(bad).toEqual([]);
  });

  it('has at least one row of each kind', () => {
    // Both halves of the Accept ("every item checked OR explicitly waived") are
    // exercised by the real document, so neither branch of the rule above is
    // dead.
    expect(rows.some((row) => row.status === DONE)).toBe(true);
    expect(rows.some((row) => row.status === WAIVER)).toBe(true);
  });

  it('every row carries an id and evidence, and ids are unique', () => {
    // A done row without evidence is an assertion; a waiver without a question is
    // a shrug. Both are the failure mode this file exists to prevent.
    for (const row of rows) {
      expect(row.cells).toHaveLength(4);
      expect(row.id).toMatch(/^[A-G]\d+$/);
      expect(row.item.length).toBeGreaterThan(0);
      expect(row.evidence.length).toBeGreaterThan(0);
    }
    const ids = rows.map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every waiver is carried into the sign-off table, so none can be lost', () => {
    // Section G is where the user's verbatim answer is recorded. A waiver that
    // never reached it would be a question nobody was ever asked.
    const signOff = doc.slice(doc.indexOf('## G.'));
    expect(signOff.length).toBeGreaterThan(0);
    for (const row of rows.filter((r) => r.status === WAIVER)) {
      expect(signOff).toContain(`| ${row.id} |`);
    }
  });

  it('§G carries the waivers exactly once each, in document order', () => {
    // "Carried forward" is not enough on its own: a duplicated id gives the user
    // two cells to answer and a script one of them to read, and a §G shuffled out
    // of order is how a reader answers the row above the one they meant. Order is
    // asserted against the checklist tables rather than typed out here, so adding
    // a waiver in §C cannot silently land at the bottom of §G.
    const signOffIds = signOffRows.map((row) => row.id);
    const waiverIds = rows.filter((row) => row.status === WAIVER).map((row) => row.id);
    expect(signOffIds).toEqual(waiverIds);
    expect(new Set(signOffIds).size).toBe(signOffIds.length);
  });

  it('every §G row asks a question and has an answer cell to fill', () => {
    for (const row of signOffRows) {
      expect(row.cells).toHaveLength(3);
      expect(row.id).toMatch(/^[A-G]\d+$/);
      expect(row.question.length).toBeGreaterThan(0);
    }
  });

  it('the rows about the tag itself cannot be DONE while §G is still blank', () => {
    // The Accept's second half, pinned so the round-2 finding cannot recur. A7
    // (the tag is pushed) and E8 (the tag exists and builds green from a clean
    // clone) are rows about the TAG, not about the machinery that makes one —
    // that is A6 and E1, and both are legitimately closed. `scripts/tag-rc.mjs`
    // reads §G before it reaches `git tag` and has no override flag, so while a
    // single answer is blank NO `v1.0.0-rc1` can exist and no row may claim one.
    // A rehearsal in a throwaway clone is evidence about the ceremony; it is not
    // a tag in this repository, and this is where the difference is enforced.
    //
    // Phrased as an implication over the DOCUMENT rather than as a `git tag -l`
    // shell-out, deliberately: a CI checkout is not guaranteed to fetch tags, so
    // asking git would make this test's colour depend on the fetch depth of
    // whoever ran it. §G is the input the gate itself reads, so §G is the input
    // asserted here — and the constraint retires itself the moment the user
    // answers, which is exactly when the claim becomes possible to earn.
    const signedOff = signOffRows.every((row) => row.answer.length > 0);
    const tagRows = rows.filter((row) => row.id === 'A7' || row.id === 'E8');
    expect(tagRows.map((row) => row.id)).toEqual(['A7', 'E8']);
    for (const row of tagRows) {
      expect(
        signedOff || row.status === WAIVER,
        `${row.id} is "${row.status}" while §G still has blanks — the tag it names cannot exist yet`,
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The sign-off GATE. `scripts/check-signoff.mjs` turns the doc's own sentence
// ("A release is not signed off while §G has blanks") into an exit code, and
// `scripts/tag-rc.mjs` refuses to tag a release candidate while that exit code
// is non-zero. Both halves are asserted here, because an unenforced rule in a
// markdown file is exactly what let a §G of blank cells pass for "complete".
// ---------------------------------------------------------------------------

const CHECK_SIGNOFF = join(REPO_ROOT, 'scripts', 'check-signoff.mjs');
const TAG_RC = join(REPO_ROOT, 'scripts', 'tag-rc.mjs');

interface Run {
  status: number | null;
  output: string;
}

/** Run the sign-off checker against a document and collect its verdict. */
function checkSignOff(docPath: string): Run {
  const result = spawnSync(process.execPath, [CHECK_SIGNOFF, '--doc', docPath], {
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** A minimal but structurally REAL checklist: one done row, two waivers, a §G. */
function fixture(answers: Record<string, string>, signOffIds = ['A6', 'C2']): string {
  const rowsOut = signOffIds
    .map((id) => `| ${id} | Question for ${id}? | ${answers[id] ?? ''} |`)
    .join('\n');
  return [
    '# Fixture',
    '',
    '## A. Section',
    '',
    '| ID | Item | Status | Evidence / open question |',
    '| --- | --- | --- | --- |',
    '| A1 | Something closed | ✅ DONE | evidence |',
    `| A6 | Something for the user | ${WAIVER} | **Q:** a question |`,
    '',
    '## C. Section',
    '',
    '| ID | Item | Status | Evidence / open question |',
    '| --- | --- | --- | --- |',
    `| C2 | Something else for the user | ${WAIVER} | **Q:** another question |`,
    '',
    '## G. Sign-off',
    '',
    "| ID | Question (short form) | User's response (verbatim) |",
    '| --- | --- | --- |',
    rowsOut,
    '',
  ].join('\n');
}

describe('T-1704 · the sign-off gate is enforced, not merely written down', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sq-signoff-'));
  const write = (name: string, body: string): string => {
    const path = join(dir, name);
    writeFileSync(path, body, 'utf8');
    return path;
  };

  it('passes only when EVERY waiver has an answer', () => {
    const path = write('complete.md', fixture({ A6: 'Yes, tag it.', C2: 'Our artist, by March.' }));
    const run = checkSignOff(path);
    expect(run.status).toBe(0);
    expect(run.output).toContain('SIGNED OFF');
  });

  it('fails on a blank answer and NAMES the row still waiting', () => {
    // The failure has to be actionable: "not signed off" without the id is a
    // reader's problem to solve twice.
    const path = write('one-blank.md', fixture({ A6: 'Yes, tag it.' }));
    const run = checkSignOff(path);
    expect(run.status).toBe(1);
    expect(run.output).toContain('AWAITING THE USER');
    expect(run.output).toContain('C2');
    expect(run.output).toContain('NOT SIGNED OFF');
  });

  it('fails when a waiver never reached §G at all — the question nobody is asked', () => {
    // Distinguished from a blank cell on purpose. A blank is visible to anyone
    // who scrolls; a missing row is invisible, which makes it the worse failure
    // and the one that most needs a machine to notice.
    const path = write('lost.md', fixture({ A6: 'Yes.' }, ['A6']));
    const run = checkSignOff(path);
    expect(run.status).toBe(1);
    expect(run.output).toContain('MISSING FROM §G');
    expect(run.output).toContain('C2');
  });

  it('a whitespace-only answer is not an answer', () => {
    const path = write('spaces.md', fixture({ A6: 'Yes.', C2: '   ' }));
    expect(checkSignOff(path).status).toBe(1);
  });

  it('agrees with the real checklist in BOTH directions', () => {
    // The load-bearing test, and the reason it is phrased as an agreement rather
    // than as a fixed expectation: §G is blank today and this must be red-hot
    // about that, but the moment the user records their answers this test must
    // go on passing rather than becoming the thing that has to be edited. So it
    // asserts the GATE and the DOCUMENT say the same thing, whatever that is.
    const blanks = signOffRows.filter((row) => row.answer.length === 0);
    const run = checkSignOff(join(REPO_ROOT, 'docs', 'RELEASE-CHECKLIST.md'));
    expect(run.status).toBe(blanks.length === 0 ? 0 : 1);
    for (const row of blanks) expect(run.output).toContain(row.id);
  });

  it('never writes to the document it judges', () => {
    // A tool that could fill §G in would be a tool that can self-waive — the one
    // thing the checklist's own rules forbid. Structural, in the shape
    // `saveStore.test.ts` and `updater.test.ts` already use: the file imports no
    // writing primitive and calls none.
    const source = readFileSync(CHECK_SIGNOFF, 'utf8');
    expect(source).toContain("import { readFileSync } from 'node:fs'");
    for (const forbidden of ['writeFileSync', 'appendFileSync', 'createWriteStream', 'spawn']) {
      expect(source).not.toContain(forbidden);
    }
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
});

describe('T-1704 · scripts/tag-rc.mjs is the RC ceremony, and it refuses things', () => {
  const source = readFileSync(TAG_RC, 'utf8');

  /** The body of the argument parser — the only place a flag can enter the
   *  script. Scoped deliberately: the file's header PROSE discusses `--force` at
   *  length (to say why there isn't one), so a whole-file substring search would
   *  fail on the very comment that explains the rule. What matters is that no
   *  override reaches the parser. */
  const parser = source.slice(
    source.indexOf('function parseArgs('),
    source.indexOf('function fail('),
  );

  it('gates the tag on the sign-off, with no override flag', () => {
    // The ordering is the whole design: sign-off, then clean tree, then tag,
    // then clean clone. A `--force` here would be a self-waiver with a command
    // line, so its ABSENCE is asserted rather than assumed.
    expect(source).toContain(
      "import { openSignOffItems, defaultDocPath } from './check-signoff.mjs'",
    );
    expect(source).toContain('NOT SIGNED OFF');
    expect(parser.length).toBeGreaterThan(0);
    expect(parser).toContain("'--tag'");
    for (const override of ['--force', '--skip-signoff', '--no-verify', '--yes', '--waive']) {
      expect(parser).not.toContain(override);
    }
    // An unrecognised flag is refused rather than ignored, so a typo'd override
    // cannot look like it worked.
    expect(parser).toContain('Unknown argument');
  });

  it('never pushes — the remote is the user’s', () => {
    // The one genuinely remote-affecting act in the release, deliberately left
    // to a human. The script prints the command; it does not run it.
    expect(source).not.toMatch(/\[\s*'push'/);
    expect(source).not.toMatch(/'git',\s*\[\s*'push'/);
    expect(source).toContain('git push origin ');
  });

  it('creates an ANNOTATED tag and verifies the TAG, not HEAD', () => {
    expect(source).toContain("'tag', '-a', tag");
    expect(source).toContain("'scripts/verify-clean-clone.mjs', '--ref', tag");
  });

  it('deletes a tag it created if the clean clone goes red', () => {
    // A tag pointing at a tree that does not build is a false claim, not a
    // marker — so a failed run must not leave one behind.
    expect(source).toContain("run('git', ['tag', '-d', tag])");
  });

  it('derives the tag from the root manifest rather than typing it', () => {
    // The script building the tag from the manifest is the whole guarantee — it is why
    // a bump cannot produce a tag for the wrong version.
    expect(source).toContain('`v${version}-rc1`');
    const root = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      version?: string;
      scripts?: Record<string, string>;
    };
    // DROPPED 2026-07-28: this used to also require the CHECKLIST to spell out
    // `v<version>-rc1`. That was the second test forcing a version to be hand-copied into
    // prose, and hand-copying is what rotted — a bump left the doc holding two different
    // versions in different paragraphs with the suite green. The doc now names no live
    // version at all (`version.test.ts` enforces that), so there is nothing to keep in
    // step. The derivation above is the real assertion; the doc restating it added no
    // safety and one more thing to forget.
    expect(root.scripts?.['release:rc']).toBe('node scripts/tag-rc.mjs');
    expect(root.scripts?.['release:signoff']).toBe('node scripts/check-signoff.mjs');
  });
});

describe('T-1704 · the store-page art order is derived, not typed', () => {
  it('orders two icons per achievement, from the manifest itself', () => {
    const achievements = ACHIEVEMENT_MANIFEST.length;
    expect(doc).toContain(`${achievements * 2} files (${achievements} achievements × 2 states)`);
  });
});
