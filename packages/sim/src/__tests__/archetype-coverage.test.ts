import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { summarizeReport, type SeedRow } from '../balance/aggregate.js';
import {
  ACKNOWLEDGED_COVERAGE_GAPS,
  ARCHETYPE_COVERAGE,
  SWEEP_ARCHETYPES,
  VERB_PARITY,
  checkArchetypeCoverage,
  coverageFailures,
  coverageWarnings,
  type ArchetypeCoverageResult,
  type VerbParityStatus,
} from '../balance/coverage.js';
import { buildGateReport, formatGateReport, type GateReport } from '../balance/gate.js';
import { REPO_ROOT } from '../balance/rules-fingerprint.js';
import { DEFAULT_POLICIES, parseSweepArgs, reportGate } from '../balance/sweep.js';
import { cleanReport } from './support/gate-fixtures.js';

// ---------------------------------------------------------------------------
// T-157 · THE COVERAGE MATRIX's own tests.
//
// `balance/coverage.ts` answers "is this sweep archetype's headline verb even
// TESTABLE?" by cross-referencing two committed documents. This suite holds five
// things about that answer:
//
//   A. the verdicts it reaches TODAY, named archetype by named archetype;
//   B. the warn-versus-fail split, proven through the gate's OWN `passed` verdict
//      and through seeded-bad results — not merely observed agreeing;
//   C. the wiring is LIVE: a real `reportGate` call writes the coverage block into
//      the same `gate-*.json` every sweep shard and every `--merge` leg writes;
//   D. totality — every policy the sweep can run has a matrix row;
//   E. DOC DRIFT, in both directions, against both named sources. This is what the
//      task's "the parity-status source is named so it can be kept current" costs:
//      the statuses are transcribed, and the transcription is machine-checked.
//      SINCE FIX ROUND 2 (finding F-157-2) that covers the MAGNITUDES too, not only
//      the statuses: every measured figure an acknowledgement quotes is resolved
//      against the live table row it came from, because a ledger row can hold a
//      settled status while its prose carries a number a companion document has
//      already re-measured — which is precisely what `| VisitHangout |` did.
//
// NOTHING IN `balance/coverage.ts` MAY BE EDITED TO MAKE THIS SUITE PASS. If E
// fails, a source document moved and the TABLE is re-transcribed from it. If A
// fails, the ledger was ruled and the expectation is re-derived from the ruling.
// Editing a mapping so an archetype lands on a verb that happens to be green is
// the same move as widening a band to clear a gate, and it is forbidden for the
// same reason.
// ---------------------------------------------------------------------------

const DOCS = join(REPO_ROOT, 'docs');
const readDoc = (name: string): string => readFileSync(join(DOCS, name), 'utf8');

/** Sorted policy names at a given verdict — asserted as SETS, never as counts, so
 *  a failure names the archetype that moved. */
function policiesAt(
  results: readonly ArchetypeCoverageResult[],
  verdict: ArchetypeCoverageResult['verdict'],
): string[] {
  return results
    .filter((result) => result.verdict === verdict)
    .map((result) => result.policy)
    .sort();
}

const TODAY = (): ArchetypeCoverageResult[] => checkArchetypeCoverage(SWEEP_ARCHETYPES);

// ---------------------------------------------------------------------------
// A · The verdicts as of this task
// ---------------------------------------------------------------------------

describe("T-157 · today's verdicts against the parity ledger", () => {
  it('covers trader, trader-degraded, veteran and smuggler; exempts greedy', () => {
    const results = TODAY();
    expect(policiesAt(results, 'covered')).toEqual([
      'smuggler',
      'trader',
      'trader-degraded',
      'veteran',
    ]);
    // EXEMPT IS ITS OWN VALUE, never folded into "covered": `greedy` has no
    // headline verb at all (D.2a's secondary-spread cell reads "none, on
    // purpose"), and a control reported as covered would be a green-but-hollow
    // row — the Part A failure mode.
    expect(policiesAt(results, 'exempt')).toEqual(['greedy']);
    expect(policiesAt(results, 'unclassified')).toEqual([]);
  });

  it('warns for fighter, explorer AND gambler — three archetypes, not the two the Accept clause names', () => {
    // THE ACCEPTANCE CLAUSE FOR T-157 reads: fails/warns for `fighter` and
    // `explorer`, "passes cleanly for trader, trader-degraded, veteran, smuggler,
    // gambler, greedy". The first half holds. The `gambler` half does NOT, and the
    // deviation is a FINDING (TASKS.md F-157-1), not a mapping choice:
    //
    //   * `docs/BALANCE-POLICY.md` D.2a gives `gambler`'s prime focus as "the
    //     tables" (`index.ts:3767`), i.e. VisitHangout — with an anti-idle
    //     travel-toward-Hangout branch to match;
    //   * `docs/NPC_REDESIGN.md`'s PARITY LEDGER `| VisitHangout |` reads
    //     "RE-ASKED at T-150 (2026-08-01) — still DEFERRED pending owner ruling",
    //     and `docs/TESTING-STRATEGY.md` Part C files it in the SAME **Deferred**
    //     row as Explore.
    //
    // Mapping `gambler` onto Trade to make this list green would be gerrymandering
    // the matrix to clear its own gate. The honest rule is implemented instead and
    // the third row is reported. Closing it is an OWNER RULING on the ledger row
    // (`docs/HANGOUT_REDESIGN.md` §11.4), after which VERB_PARITY is re-transcribed
    // and this expectation is re-derived — never the other way round.
    const results = TODAY();
    expect(policiesAt(results, 'uncovered')).toEqual(['explorer', 'fighter', 'gambler']);
  });

  it('every uncovered archetype names its verb, its status and its ledger row', () => {
    for (const result of TODAY().filter((row) => row.verdict === 'uncovered')) {
      expect(result.definingVerb).not.toBeNull();
      expect(result.status).not.toBe('shipped');
      expect(result.detail).toContain(result.definingVerb ?? '');
      expect(result.detail).toContain('docs/NPC_REDESIGN.md');
    }
  });

  it('every uncovered archetype is acknowledged, with an owner and cited evidence', () => {
    const results = TODAY();
    const uncovered = policiesAt(results, 'uncovered');
    for (const result of results.filter((row) => row.verdict === 'uncovered')) {
      expect(`${result.policy}:${result.acknowledged}`).toBe(`${result.policy}:true`);
    }
    // No orphans in EITHER direction: an acknowledgement that no longer describes a
    // real gap is a stale exemption, and a gap with no acknowledgement must fail
    // rather than warn.
    expect(ACKNOWLEDGED_COVERAGE_GAPS.map((gap) => gap.policy).sort()).toEqual(uncovered);
    for (const gap of ACKNOWLEDGED_COVERAGE_GAPS) {
      expect(gap.owner).toMatch(/docs\//);
      expect(gap.evidence).toMatch(/docs\//);
      expect(gap.since.length).toBeGreaterThan(0);
      // The acknowledgement must name the same verb the matrix maps the policy to,
      // or it is acknowledging a gap that is not the one being warned about.
      expect(`${gap.policy}:${gap.verb}`).toBe(
        `${gap.policy}:${ARCHETYPE_COVERAGE[gap.policy].definingVerb ?? 'none'}`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// B · Warn versus fail, through the gate's own verdict
// ---------------------------------------------------------------------------

describe('T-157 · the warn/fail split is real', () => {
  it("an acknowledged gap WARNS: today's matrix does not fail a gate report", () => {
    const results = TODAY();
    expect(
      coverageWarnings(results)
        .map((row) => row.policy)
        .sort(),
    ).toEqual(['explorer', 'fighter', 'gambler']);
    expect(coverageFailures(results)).toEqual([]);
    expect(buildGateReport('t157', 'fixture', 1, [], [], results).passed).toBe(true);
  });

  it('an UNCLASSIFIED policy FAILS the gate', () => {
    // The regression half: a ninth archetype joins the fleet and nobody adds a
    // matrix row for it. Silence there would be the exact failure this task exists
    // to remove.
    const results = checkArchetypeCoverage(['trader', 'not-a-policy']);
    expect(policiesAt(results, 'unclassified')).toEqual(['not-a-policy']);
    expect(coverageFailures(results).map((row) => row.policy)).toEqual(['not-a-policy']);
    expect(buildGateReport('t157', 'fixture', 1, [], [], results).passed).toBe(false);
  });

  it('an UNACKNOWLEDGED uncovered archetype FAILS the gate', () => {
    // Seeded-bad, constructed directly: this is what deleting an entry from
    // ACKNOWLEDGED_COVERAGE_GAPS — or a verb slipping off Shipped with nobody
    // recording why — produces. It must be red, not a warning.
    const seeded: ArchetypeCoverageResult[] = [
      {
        policy: 'trader',
        definingVerb: 'Trade',
        status: 'deferred',
        verdict: 'uncovered',
        acknowledged: false,
        detail: 'seeded-bad fixture: Trade slipped off Shipped with no recorded acknowledgement',
      },
    ];
    expect(coverageFailures(seeded).map((row) => row.policy)).toEqual(['trader']);
    expect(coverageWarnings(seeded)).toEqual([]);
    expect(buildGateReport('t157', 'fixture', 1, [], [], seeded).passed).toBe(false);
  });

  it('formatGateReport prints one grep-able coverage line per archetype', () => {
    const results = TODAY();
    const printed = formatGateReport(buildGateReport('t157', 'fixture', 1, [], [], results));
    for (const result of results) {
      expect(printed).toContain(`[gate] coverage ${result.policy}:`);
    }
    expect(printed).toContain('[gate] coverage fighter: UNCOVERED (warn) — Combat is partial');
    expect(printed).toContain('[gate] coverage explorer: UNCOVERED (warn) — Explore is deferred');
    expect(printed).toContain(
      '[gate] coverage gambler: UNCOVERED (warn) — VisitHangout is deferred',
    );
    expect(printed).toContain('[gate] coverage trader: COVERED');
    expect(printed).toContain('[gate] coverage greedy: EXEMPT');
  });
});

// ---------------------------------------------------------------------------
// C · The wiring is live, not merely present
// ---------------------------------------------------------------------------

/** Run against a fresh temp dir, ALWAYS restoring `process.exitCode` — the same
 *  guard `sweep-gate.test.ts` states its reason for. */
function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'sq-t157-'));
  const previousExitCode = process.exitCode;
  try {
    return run(dir);
  } finally {
    process.exitCode = previousExitCode;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('T-157 · the sweep actually evaluates the matrix', () => {
  it('reportGate writes the coverage block into gate-*.json and stays green', () => {
    withTempDir((dir) => {
      const parsed = parseSweepArgs([
        '--label',
        't157-wiring',
        '--out',
        dir,
        '--aggregate-out',
        dir,
      ]);
      expect('help' in parsed).toBe(false);
      if ('help' in parsed) return;

      // Real rows from real careers, so the policies the check reads are the
      // policies the sample actually contains — which is the contract `reportGate`
      // states (it derives them from the rows, not from argv).
      const rows: SeedRow[] = [
        summarizeReport(cleanReport('trader')),
        summarizeReport(cleanReport('gambler')),
      ];
      reportGate(parsed, 'shard 1/1', rows, []);
      expect(process.exitCode ?? 0).toBe(0);

      const report = JSON.parse(
        readFileSync(join(dir, 'gate-t157-wiring-shard1of1.json'), 'utf8'),
      ) as GateReport;
      expect(report.coverage.map((row) => row.policy)).toEqual(['gambler', 'trader']);
      expect(policiesAt(report.coverage, 'covered')).toEqual(['trader']);
      expect(policiesAt(report.coverage, 'uncovered')).toEqual(['gambler']);
      // A warning must never turn a clean sweep red.
      expect(report.passed).toBe(true);
    });
  }, 120_000);
});

// ---------------------------------------------------------------------------
// D · Totality
// ---------------------------------------------------------------------------

describe('T-157 · totality', () => {
  // Totality over `SimPolicyName` itself is COMPILE-TIME: `ARCHETYPE_COVERAGE` is
  // declared `satisfies Record<SimPolicyName, ArchetypeCoverageRow>`, so a new
  // policy name with no row fails `tsc`. No runtime list is maintained here for
  // that; these two assertions cover the parts a type cannot see.
  it('every DEFAULT_POLICIES member is a graded sweep archetype', () => {
    for (const policy of DEFAULT_POLICIES) {
      expect(SWEEP_ARCHETYPES).toContain(policy);
    }
  });

  it('SWEEP_ARCHETYPES is exactly the 8 names Part G lists, deduped', () => {
    // Part G: "The sweep runs 8 scripted policies (trader, fighter, explorer,
    // veteran, smuggler, gambler, greedy, trader-degraded)."
    expect([...SWEEP_ARCHETYPES].sort()).toEqual([
      'explorer',
      'fighter',
      'gambler',
      'greedy',
      'smuggler',
      'trader',
      'trader-degraded',
      'veteran',
    ]);
    expect(new Set(SWEEP_ARCHETYPES).size).toBe(SWEEP_ARCHETYPES.length);
  });

  it('every defining verb resolves to a VERB_PARITY row', () => {
    const verbs = new Set(VERB_PARITY.map((row) => row.verb));
    for (const [policy, row] of Object.entries(ARCHETYPE_COVERAGE)) {
      if (row.definingVerb === null) {
        expect(`${policy}:${row.exempt !== null}`).toBe(`${policy}:true`);
        continue;
      }
      expect(`${policy}:${verbs.has(row.definingVerb)}`).toBe(`${policy}:true`);
    }
  });
});

// ---------------------------------------------------------------------------
// E · Doc drift — the "named source, kept current" criterion
// ---------------------------------------------------------------------------

/** Split one markdown table row into trimmed cells. Rows are `| a | b | c |`. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  return /^\|[\s|:-]+\|$/.test(line.trim());
}

function sectionBetween(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  expect(`${start}:${from >= 0}`).toBe(`${start}:true`);
  const to = text.indexOf(end, from + start.length);
  expect(`${end}:${to >= 0}`).toBe(`${end}:true`);
  return text.slice(from, to);
}

describe('T-157 · the transcription still matches its named sources', () => {
  it('mirrors docs/TESTING-STRATEGY.md Part C, in both directions', () => {
    // THE PARSE'S ASSUMPTIONS, stated so a reword that breaks it is understood as
    // sending a human back to the ledger rather than as a flaky test:
    //   * Part C's table rows begin with `|`; column 1 is a comma-separated verb
    //     list; column 2 opens with the status in **bold**.
    //   * The status is that bold token's FIRST word, lowercased.
    const partC = sectionBetween(readDoc('TESTING-STRATEGY.md'), '## Part C', '## Part D');
    const fromDoc = new Map<string, VerbParityStatus>();
    for (const line of partC.split('\n')) {
      if (!line.trim().startsWith('|') || isSeparatorRow(line)) continue;
      const [verbCell, statusCell] = cells(line);
      if (verbCell === 'Verb' || statusCell === undefined) continue;
      const bold = /\*\*([^*]+)\*\*/.exec(statusCell);
      if (bold === null) continue;
      const status = bold[1]
        .trim()
        .split(/[\s(,]/)[0]
        .toLowerCase() as VerbParityStatus;
      for (const verb of verbCell.split(',').map((name) => name.trim())) {
        if (verb.length > 0) fromDoc.set(verb, status);
      }
    }

    const fromCode = new Map(VERB_PARITY.map((row) => [row.verb, row.status]));
    const asObject = (map: Map<string, VerbParityStatus>): Record<string, VerbParityStatus> =>
      Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)));

    // EQUAL IN BOTH DIRECTIONS. A verb added to Part C and never transcribed is as
    // much of a defect as a transcribed verb Part C no longer carries.
    expect(
      asObject(fromDoc),
      'docs/TESTING-STRATEGY.md Part C and VERB_PARITY disagree. Re-read ' +
        "docs/NPC_REDESIGN.md's PARITY LEDGER and re-transcribe VERB_PARITY in " +
        'packages/sim/src/balance/coverage.ts. Do NOT edit the doc to match the code.',
    ).toEqual(asObject(fromCode));
  });

  it("mirrors docs/NPC_REDESIGN.md's PARITY LEDGER row by row", () => {
    // The mapping from a status keyword to the ledger's "owed by" cell, stated once:
    //   shipped   ⇒ says shipped, and owes nothing further
    //   partial   ⇒ says shipped AND says something is still owed (Combat today)
    //   deferred  ⇒ says DEFERRED (Explore and VisitHangout today)
    //   undecided ⇒ says "N13 decides" (Crew, Reroll)
    const ledger = sectionBetween(
      readDoc('NPC_REDESIGN.md'),
      '### THE PARITY LEDGER',
      '> [!CAUTION]',
    );
    const owedByVerb = new Map<string, string>();
    for (const line of ledger.split('\n')) {
      if (!line.trim().startsWith('|') || isSeparatorRow(line)) continue;
      const parts = cells(line);
      if (parts.length < 3 || parts[0] === 'player verb') continue;
      owedByVerb.set(parts[0], parts[2]);
    }
    expect(owedByVerb.size).toBeGreaterThan(0);

    for (const row of VERB_PARITY) {
      if (row.ledgerRow === null) {
        // The one documented exception: N11 REMOVED the Renown row, so the ledger
        // carries it as prose. Asserted against that prose rather than skipped.
        expect(`${row.verb}:${row.status}`).toBe('Renown:shipped');
        expect(ledger).toMatch(/Renown is the verb-less twelfth row/);
        expect(ledger).toMatch(/N11 removed it \(2026-07-30\)/);
        continue;
      }
      const owed = owedByVerb.get(row.verb);
      expect(`${row.verb}:${owed !== undefined}`).toBe(`${row.verb}:true`);
      const cell = owed ?? '';
      const message =
        `PARITY LEDGER row "${row.verb}" reads "${cell}", which does not match the ` +
        `transcribed status "${row.status}" in packages/sim/src/balance/coverage.ts. ` +
        'Re-transcribe the table from the ledger; never edit the ledger to match the table.';
      switch (row.status) {
        case 'shipped':
          expect(/shipped/i.test(cell), message).toBe(true);
          expect(/still owed|DEFERRED|EXCLUDED|N13 decides/.test(cell), message).toBe(false);
          break;
        case 'partial':
          expect(/shipped/i.test(cell), message).toBe(true);
          expect(/still owed/i.test(cell), message).toBe(true);
          break;
        case 'deferred':
          expect(/DEFERRED/.test(cell), message).toBe(true);
          break;
        case 'undecided':
          expect(/N13 decides/.test(cell), message).toBe(true);
          break;
      }
    }
  });

  it('pins every measured figure an acknowledgement quotes to its live document row', () => {
    // T-157 FIX ROUND 2 · finding F-157-2. The status half of the transcription was
    // machine-checked from the first pass; the EVIDENCE half was prose, and prose
    // went stale in exactly the way this task exists to stop — the `gambler`
    // acknowledgement quoted the PARITY LEDGER's ruling-time magnitudes
    // (+4.86cr/captain-day, 95.91%) as current, when `docs/HANGOUT_REDESIGN.md`
    // §11.4 — the re-ask the ledger row itself points at — had already re-measured
    // both at HEAD before this task ran. A ledger row's STATUS and its MAGNITUDES
    // are not the same currency, and only the first was being checked.
    //
    // THE PARSE'S ASSUMPTIONS: the section runs from its exact heading line to the
    // next `### ` heading; the pinned row's first cell matches after `**` stripping;
    // and the value is the row's LAST column, because every table pinned here puts
    // its most recent re-measurement in the last column. A reword that breaks this
    // is supposed to send a human back to §11.4, not to this file.
    const stripBold = (cell: string): string => cell.replace(/\*\*/g, '').trim();
    let pinned = 0;

    for (const gap of ACKNOWLEDGED_COVERAGE_GAPS) {
      for (const figure of gap.figures) {
        const doc = readDoc(figure.doc);
        const from = doc.indexOf(figure.section);
        expect(`${figure.doc} ${figure.section}: ${from >= 0}`).toBe(
          `${figure.doc} ${figure.section}: true`,
        );
        const nextHeading = doc.indexOf('\n### ', from + figure.section.length);
        const section = doc.slice(from, nextHeading >= 0 ? nextHeading : undefined);

        const match = section
          .split('\n')
          .filter((line) => line.trim().startsWith('|') && !isSeparatorRow(line))
          .map(cells)
          .find((parts) => parts.length >= 2 && stripBold(parts[0]) === figure.row);

        const where = `docs/${figure.doc} ${figure.section} · row "${figure.row}"`;
        expect(`${where} found: ${match !== undefined}`).toBe(`${where} found: true`);
        if (match === undefined) continue;

        expect(
          stripBold(match[match.length - 1]),
          `${where} now reads "${stripBold(match[match.length - 1])}", not the ` +
            `"${figure.value}" quoted by ACKNOWLEDGED_COVERAGE_GAPS.${gap.policy} in ` +
            'packages/sim/src/balance/coverage.ts. Re-read the section and re-quote the ' +
            'acknowledgement; never edit the document to match the code.',
        ).toBe(figure.value);

        // The pin and the sentence must not drift apart either: a pinned figure the
        // prose no longer states is a pin guarding nothing.
        expect(
          gap.evidence.includes(figure.value),
          `ACKNOWLEDGED_COVERAGE_GAPS.${gap.policy}'s evidence no longer quotes the ` +
            `pinned figure "${figure.value}" (${where}).`,
        ).toBe(true);
        pinned += 1;
      }
    }

    // An empty `figures` list is a CLAIM (this acknowledgement quotes no
    // re-measurable magnitude), so the suite must prove the mechanism actually ran
    // rather than passing vacuously the day every list is emptied.
    expect(pinned).toBeGreaterThan(0);
    expect(
      ACKNOWLEDGED_COVERAGE_GAPS.find((gap) => gap.policy === 'gambler')?.figures,
    ).toHaveLength(3);
  });

  it('quotes every prime focus verbatim from docs/BALANCE-POLICY.md D.2a', () => {
    const d2a = sectionBetween(
      readDoc('BALANCE-POLICY.md'),
      '### D.2a The one-prime-focus property',
      '### D.3',
    );
    for (const [policy, row] of Object.entries(ARCHETYPE_COVERAGE)) {
      // Only the rows that CITE D.2a are held to it. `idle`/`random` are protocol
      // instruments and `trader-degraded` is the R1 measurement instrument — none
      // is an archetype and none appears in D.2a's table; each names its own
      // anchor instead, and this test says so rather than silently skipping.
      if (!row.anchor.includes('docs/BALANCE-POLICY.md D.2a')) {
        expect(['idle', 'random', 'trader-degraded']).toContain(policy);
        continue;
      }
      expect(
        d2a,
        `ARCHETYPE_COVERAGE.${policy}'s prime focus "${row.primeFocus}" is no longer in ` +
          "docs/BALANCE-POLICY.md D.2a's table. Re-read D.2a and re-transcribe the row.",
      ).toContain(row.primeFocus);
    }
  });
});
