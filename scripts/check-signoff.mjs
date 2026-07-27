#!/usr/bin/env node
// ---------------------------------------------------------------------------
// T-1704 · "EVERY ITEM CHECKED OR EXPLICITLY WAIVED BY THE USER" — the check.
//
// `docs/RELEASE-CHECKLIST.md` says, in its own prose, "A release is not signed
// off while §G has blanks." Until this file existed that sentence was a PROMISE
// AND NOTHING ELSE: no command reported the blanks, nothing consumed them, and
// nothing downstream refused to proceed while they were there. A rule that only
// a careful reader enforces is the same failure mode `release-checklist.test.ts`
// exists to prevent one section earlier — it made "every row has a marker"
// machine-checked precisely because a document is the easiest deliverable to
// half-finish. §G was the half that was still eyeballed.
//
//   node scripts/check-signoff.mjs [--doc <path>]
//
// Exit 0 when every ⏸ WAIVER REQUESTED row in §A–§F has a NON-EMPTY answer in
// §G. Exit 1, with the open ids and their questions printed, otherwise.
//
// THIS SCRIPT NEVER WRITES TO THE DOC, and that is the point rather than an
// omission. The answers in §G are the user's words; a tool that could fill them
// in would be a tool that can self-waive, which is exactly what the checklist's
// "The coder does not self-waive" rule forbids. It reads, it reports, it exits.
//
// READER: `scripts/tag-rc.mjs`, which imports {@link openSignOffItems} and
// REFUSES TO CREATE THE RC TAG while any item is open — so the sign-off gates
// the release candidate mechanically instead of by good intentions. Also
// `packages/ui/src/__tests__/release-checklist.test.ts`, which runs this file
// against fixtures (a filled §G passes, a blank one names the blank ids) and
// against the real doc.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The marker a row carries when it cannot be closed by code in this repository. */
export const WAIVER = '⏸ WAIVER REQUESTED';

/** Header of the §A–§F checklist tables. §G has a different header on purpose. */
const CHECKLIST_HEADER = '| ID | Item | Status | Evidence / open question |';

/** Header of the §G sign-off table — the one with the user's answers in it. */
const SIGNOFF_HEADER = "| ID | Question (short form) | User's response (verbatim) |";

/** Split one markdown table row into trimmed cells. */
function cells(line) {
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/** Is this the `| --- | --- |` separator under a table header? */
function isSeparator(line) {
  return /^\|[\s\-|:]+\|$/.test(line.trim());
}

/**
 * Collect the rows of every table introduced by `header`.
 *
 * Anchoring on the header line — rather than regexing the whole file for pipes —
 * keeps "which table is this?" a decision the DOCUMENT makes. It is the same
 * choice `release-checklist.test.ts` made, and it is what stops §G from being
 * swept into the §A–§F sweep (and vice versa) when a future section adds a third
 * table.
 */
function tableRows(markdown, header) {
  const rows = [];
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
    if (isSeparator(trimmed)) continue;
    rows.push(cells(trimmed));
  }
  return rows;
}

/**
 * Everything §G still owes an answer for.
 *
 * Two DIFFERENT failures are reported, because they have different causes and
 * different fixes:
 *
 *   `open`    — the row is in §G and its answer cell is empty. The user has not
 *               answered yet. This is the ordinary state of a fresh checklist.
 *   `missing` — a ⏸ row in §A–§F has no §G row at all. That is a question
 *               nobody will ever be asked, and it is the worse of the two: an
 *               empty cell is visible, a lost question is not.
 *
 * Returned rather than printed so the tag gate and the test suite can both
 * consume it without parsing this file's stdout.
 */
export function openSignOffItems(markdown) {
  const waiverIds = tableRows(markdown, CHECKLIST_HEADER)
    .filter((row) => row[2] === WAIVER)
    .map((row) => row[0]);

  const signOff = tableRows(markdown, SIGNOFF_HEADER).map((row) => ({
    id: row[0] ?? '',
    question: row[1] ?? '',
    answer: row[2] ?? '',
  }));

  const answered = new Map(signOff.map((row) => [row.id, row.answer]));

  return {
    waiverIds,
    signOff,
    open: signOff.filter((row) => row.answer.length === 0),
    missing: waiverIds.filter((id) => !answered.has(id)),
  };
}

/** Absolute path of `docs/RELEASE-CHECKLIST.md` in this repository. */
export function defaultDocPath() {
  return fileURLToPath(new URL('../docs/RELEASE-CHECKLIST.md', import.meta.url));
}

function parseArgs(argv) {
  const opts = { doc: defaultDocPath() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--doc') {
      const value = argv[i + 1];
      if (!value) throw new Error('--doc needs a path');
      opts.doc = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = openSignOffItems(readFileSync(opts.doc, 'utf8'));

  const total = report.signOff.length;
  const answered = total - report.open.length;

  console.log('='.repeat(72));
  console.log('T-1704 · release sign-off (docs/RELEASE-CHECKLIST.md §G)');
  console.log(`  waivers requested  ${report.waiverIds.length}`);
  console.log(`  answers recorded   ${answered} of ${total}`);
  console.log('='.repeat(72));

  if (report.missing.length > 0) {
    console.error('\nWAIVER REQUESTS MISSING FROM §G — these questions would never be asked:');
    for (const id of report.missing) console.error(`  ${id}`);
  }

  if (report.open.length > 0) {
    console.error('\nAWAITING THE USER (answers go in §G, verbatim):');
    for (const row of report.open) console.error(`  ${row.id.padEnd(4)} ${row.question}`);
  }

  if (report.missing.length > 0 || report.open.length > 0) {
    console.error(
      '\nNOT SIGNED OFF. The coder does not self-waive: each answer above is the' +
        "\nuser's decision, and `scripts/tag-rc.mjs` will not tag a release" +
        '\ncandidate until they are recorded.',
    );
    process.exit(1);
  }

  console.log('\nSIGNED OFF. Every waiver carries a recorded answer.');
}

// Only run when invoked as a script — the tag gate and the tests import from
// here, and an import must not print a report or call `process.exit`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
