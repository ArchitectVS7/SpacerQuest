import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../balance/rules-fingerprint.js';

// ---------------------------------------------------------------------------
// T-198 · THE PACING BRIEF's figure pins.
//
// `docs/playtests/T-198-pacing-brief.md` is the document the owner reads before
// the post-M17 pacing session, and its whole value is that the numbers in it are
// the numbers the sources actually hold. This file is the T-158 precedent
// (`uat-brief-figures.test.ts`) applied one checkpoint later, with two additions
// that the T-198 planning pass earned:
//
//   * the cumulative dawn-hand arc table is DERIVED from the six committed
//     aggregates rather than transcribed, so a re-pinned baseline cannot leave a
//     stale row standing in either the spec or the brief (test 2);
//   * the Insult NULL RESULT is machine-checked against `packages/sim/src/index.ts`
//     rather than asserted in prose, so the day a sim policy learns to plan a
//     social venue, this suite says the finding is stale (test 3).
//
// NO ESCAPE HATCH. IF THIS TEST GOES RED, A SOURCE WAS RE-MEASURED. Re-read the
// section and re-quote the brief from it. Never edit a source document to match
// the brief and never edit the brief to match a stale pin — that is the same move
// as widening a band to clear a gate, and it is forbidden for the same reason.
//
// -------------------------------------------------------------------------
// THE INVERSION HAPPENED AT T-202 (2026-08-05). THIS BLOCK IS THE RECORD OF IT.
//
// T-198 was a human-gate checkpoint: it halted with three EMPTY ruling cells in the
// brief's §10, and test 5 asserted they were empty, because a filled cell no owner
// wrote is a coder self-waiver. The owner recorded R1 (pacing accept-as-is), R2
// (`SOCIAL_PLAYS_PER_DAY = 3` confirmed, no change) and R3
// (`LIARS_DICE_ROUNDS_PER_DAY` revised to `[1, 2, 3, 4, 5, 6]`) on 2026-08-05, so
// T-202 FLIPPED test 5 to assert the cells are NON-EMPTY and FLIPPED test 4 from
// asserting three `PROPOSED` markers to asserting three CONFIRMED ones — neither was
// deleted. This is exactly what T-158 did: see `uat-brief-figures.test.ts`'s third
// test, which asserts its two cells non-empty and points at its own git history for
// the pre-ruling shape. The asserted-empty / asserts-PROPOSED shapes live in this
// file's git history at the T-198 and T-197 commits; do not resurrect them.
// -------------------------------------------------------------------------
//
// The figure table lives IN THIS TEST FILE on purpose. A new module under
// `packages/sim/src` outside `__tests__` would owe a `SIM_NON_INSTRUMENT_SOURCES`
// entry and would move `instrumentFingerprint`; `__tests__` is in
// `HASHED_ROOT_IGNORED_DIRECTORIES` (`rules-fingerprint.ts`), so nothing here can
// move a fingerprint.
// ---------------------------------------------------------------------------

const DOCS = join(REPO_ROOT, 'docs');
const readDoc = (name: string): string => readFileSync(join(DOCS, name), 'utf8');
const readRepo = (relative: string): string => readFileSync(join(REPO_ROOT, relative), 'utf8');

const BRIEF_RELATIVE = 'docs/playtests/T-198-pacing-brief.md';
const BRIEF = readRepo(BRIEF_RELATIVE);

interface BriefFigure {
  /** File name under `docs/`. */
  readonly doc: string;
  /** An exact substring of the heading LINE the figure lives under. */
  readonly section: string;
  /** The exact quoted string, transcribed from the source document. */
  readonly value: string;
  /** Which item of the brief this figure backs — so a failure says what breaks. */
  readonly why: string;
}

/** The depth of a markdown heading line, or 0 if the line is not a heading. */
function headingDepth(line: string): number {
  const match = /^(#{1,6})\s/.exec(line);
  return match === null ? 0 : match[1].length;
}

/**
 * The body of the section whose heading LINE contains `anchor`, running to the
 * next heading of the same-or-shallower depth (so `####` subsections stay in).
 * Returns `null` when no heading line contains the anchor.
 */
function sectionOf(markdown: string, anchor: string): string | null {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => headingDepth(line) > 0 && line.includes(anchor));
  if (start < 0) return null;
  const depth = headingDepth(lines[start]);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const d = headingDepth(lines[i]);
    if (d > 0 && d <= depth) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

const DAWN_SECTION_0 = '## 0 · M17 as measured';

const PACING_BRIEF_FIGURES: readonly BriefFigure[] = [
  // --- brief §6 · the Insult null result -----------------------------------
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '**BYTE-IDENTICAL**',
    why: "brief §6 — the fighter row's verdict against T-196b",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '19.6460',
    why: "brief §6 — the fighter row's encounters/run, unmoved by the social pool",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '82,671',
    why: "brief §6 — the fighter row's median credits",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '0.6030',
    why: "brief §6 — the fighter row's clear rate",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '3 plays/day × −4',
    why: 'brief §6 — the analytic bound R2 actually rules on',
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: 'ONE grudge to the −10 floor',
    why: 'brief §6 — the per-day ceiling the pool imposes on manufactured grudges',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**2.358×**',
    why: 'brief §6 — the fleet-wide grudge lift the farming loop would have exploited',
  },

  // --- brief §4 · what the arc actually shows -------------------------------
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '0.5689 → 0.6310 (+6.2 pp)',
    why: "brief §4 — T-195's single-step clear-rate move, nearly the whole easing",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '36,947 → 50,813',
    why: "brief §4 — T-195's single-step median-credits move",
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: 'within ±0.4 pp of clear rate',
    why: 'brief §4 — how little everything after T-195 moved',
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '±2.6% of median credits',
    why: 'brief §4 — the same bound on credits',
  },
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '(21.63 → 22.25)',
    why: 'brief §4 — encounters/run rising with ships lost, so deaths track exposure',
  },

  // --- brief §7 · R3's pre-ruling record, RETAINED as history ---------------
  //
  // T-202 · These four pins were written when the table was PROPOSED. R3 is now
  // ruled and the documents carry the confirmation, but every one of these phrases
  // was kept beside the new text as dated history rather than deleted ("do not just
  // delete the history", T-202's own instruction). So the pins stay, and what they
  // now guard is THE RETAINED HISTORY: a later cleanup pass that quietly drops the
  // pre-ruling record turns this suite red instead of passing unnoticed.
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: 'PROPOSED — awaiting owner confirmation',
    why: "brief §7 — R3's pre-ruling marker, RETAINED in §0's dated resolution paragraph",
  },
  {
    doc: 'LIARS-DICE-DECISIONS.md',
    section: '## 6. The action economy (M17)',
    value: 'LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]',
    why: "brief §7 — the superseded table, RETAINED verbatim beneath LD-23's confirmation",
  },
  {
    doc: 'LIARS-DICE-DECISIONS.md',
    section: '## 6. The action economy (M17)',
    value: 'PROPOSED, NOT RULED',
    why: 'brief §7 — LD-23 saying so in its own words, RETAINED as the superseded framing',
  },
  {
    doc: 'LIARS-DICE-DECISIONS.md',
    section: '## 6. The action economy (M17)',
    value: '**What IS ruled is the SHAPE**',
    why: 'brief §7 — the shape/numbers split R3 turned on, RETAINED',
  },

  // --- brief §10 · R3 AS RULED (T-202) --------------------------------------
  //
  // The live state, pinned in the same both-directions shape as everything above:
  // each resolves in the brief through R3's now-filled ruling cell in §10.
  {
    doc: 'DAWN-HAND-REDESIGN.md',
    section: DAWN_SECTION_0,
    value: '[1, 2, 3, 4, 5, 6]',
    why: "brief §10 — R3's ruled table, as §0 now states it",
  },
  {
    doc: 'LIARS-DICE-DECISIONS.md',
    section: '## 6. The action economy (M17)',
    value: '[1, 2, 3, 4, 5, 6]',
    why: 'brief §10 — LD-23 carrying the confirmed numbers',
  },
];

// ---------------------------------------------------------------------------
// The cumulative dawn-hand arc, DERIVED. Each row is re-computed from the
// committed aggregate, then required to appear — as a whole table row — in both
// `docs/DAWN-HAND-REDESIGN.md` §0 and the brief. A re-pinned baseline therefore
// cannot leave a stale arc row standing anywhere.
// ---------------------------------------------------------------------------
//
// T-202 · SIX, NOT SEVEN — `baseline-t202-liars-dice-ceiling.json` is deliberately
// NOT in this list. Every row here must appear in BOTH the spec §0 and the brief,
// and the brief is a frozen 2026-08-05 PRE-SESSION artifact: adding the seventh
// capstone would force a retro-edit of the document the owner actually read. The
// spec's §0 table carries the t202 row; this derivation covers the six that the
// brief reproduces.
const ARC_BASELINES: readonly string[] = [
  'baseline-t182-reroll-fix.json',
  'baseline-t195-dawn-dice.json',
  'baseline-t199-pacifist.json',
  'baseline-t196a-free-actions.json',
  'baseline-t196b-instruments.json',
  'baseline-t197-hangout-caps.json',
];

interface ArcAggregate {
  readonly runs: number;
  readonly fleet: {
    readonly tourOneClearRate: number;
    readonly finalCredits: { readonly median: number };
    readonly survival: { readonly shipsLost: number };
    readonly encountersPerRun: number;
  };
}

/** The four measured columns of one arc row, formatted exactly as both documents print them. */
function arcRow(aggregate: ArcAggregate): string {
  const { fleet } = aggregate;
  return (
    `| ${fleet.tourOneClearRate.toFixed(4)} ` +
    `| ${fleet.finalCredits.median.toLocaleString('en-US')} ` +
    `| ${fleet.survival.shipsLost} ` +
    `| ${fleet.encountersPerRun.toFixed(4)} |`
  );
}

describe('T-198 · the pacing brief quotes live figures, in both directions', () => {
  it('resolves every quoted figure against the section of the document it came from', () => {
    let pinned = 0;

    for (const figure of PACING_BRIEF_FIGURES) {
      const doc = readDoc(figure.doc);
      const section = sectionOf(doc, figure.section);

      expect(
        section !== null,
        `docs/${figure.doc} no longer has a heading containing "${figure.section}" ` +
          `(pinned for ${figure.why}). Re-read the document and re-anchor the pin.`,
      ).toBe(true);
      if (section === null) continue;

      expect(
        section.includes(figure.value),
        `docs/${figure.doc} · "${figure.section}" no longer contains "${figure.value}" ` +
          `(pinned for ${figure.why}). THE SOURCE WAS RE-MEASURED: re-read the section and ` +
          `re-quote ${BRIEF_RELATIVE} from it. Never edit the document or the brief to make ` +
          'this pass.',
      ).toBe(true);

      expect(
        BRIEF.includes(figure.value),
        `${BRIEF_RELATIVE} no longer states the pinned figure "${figure.value}" ` +
          `(docs/${figure.doc} · "${figure.section}", ${figure.why}). A pin whose prose has ` +
          'gone is a pin guarding nothing — restore the sentence or drop the pin deliberately.',
      ).toBe(true);

      pinned += 1;
    }

    // No test that quantifies over nothing: prove the mechanism ran.
    expect(pinned).toBeGreaterThan(0);
    expect(pinned).toBe(PACING_BRIEF_FIGURES.length);
  });

  it('re-derives the cumulative dawn-hand arc from the six committed aggregates', () => {
    const spec = readDoc('DAWN-HAND-REDESIGN.md');
    const section = sectionOf(spec, DAWN_SECTION_0);
    expect(
      section !== null,
      `docs/DAWN-HAND-REDESIGN.md no longer has a "${DAWN_SECTION_0}" heading — the arc table's ` +
        'section anchor is gone. Re-anchor it; do not drop the check.',
    ).toBe(true);
    if (section === null) return;

    let derived = 0;

    for (const file of ARC_BASELINES) {
      const aggregate = JSON.parse(
        readRepo(join('docs', 'balance', file)),
      ) as unknown as ArcAggregate;

      expect(
        aggregate.runs,
        `docs/balance/${file} is no longer an 8,000-row aggregate (runs=${aggregate.runs}). ` +
          'The cumulative arc table compares like with like — a row measured at a different ' +
          'sample size is not comparable and must not be silently spanned.',
      ).toBe(8000);

      const row = arcRow(aggregate);

      expect(
        section.includes(row),
        `docs/DAWN-HAND-REDESIGN.md § "${DAWN_SECTION_0}"'s cumulative arc table no longer ` +
          `carries the row derived from docs/balance/${file}: "${row}". THE BASELINE MOVED — ` +
          're-read the aggregate and re-write the table row from it.',
      ).toBe(true);

      expect(
        BRIEF.includes(row),
        `${BRIEF_RELATIVE} §4 no longer carries the arc row derived from docs/balance/${file}: ` +
          `"${row}". The brief reproduces the spec's table; re-quote it from the spec.`,
      ).toBe(true);

      derived += 1;
    }

    expect(derived).toBe(ARC_BASELINES.length);
  });

  it('proves the Insult null result still holds — no sim policy plans a social venue', () => {
    const sim = readRepo(join('packages', 'sim', 'src', 'index.ts'));

    for (const venue of ['meet', 'befriend', 'insult'] as const) {
      expect(
        sim.includes(`venue: '${venue}'`),
        `packages/sim/src/index.ts now contains \`venue: '${venue}'\` — a sim policy now plans ` +
          "a social venue — T-198's Insult null result is STALE and the loop must be re-measured " +
          'before `SOCIAL_PLAYS_PER_DAY` is ruled on. Do not delete this assertion: re-run the ' +
          'measurement, re-write the brief §6 from it, and re-anchor this check.',
      ).toBe(false);
    }

    // The three venues that ARE planned, asserted positively so this test cannot pass
    // by the file having been renamed, emptied or moved out from under it.
    for (const venue of ['borrow', 'repay', 'dare'] as const) {
      expect(sim.includes(`venue: '${venue}'`)).toBe(true);
    }
  });

  it("keeps R3's confirmed markers and the ruled rounds array moving together", () => {
    // T-202 · THE INVERSION. Until 2026-08-05 this test asserted the word PROPOSED at
    // all three sites AND that the array still read `[1, 2, 2, 3, 3, 4]`, so that a
    // marker flip could not ship without the array and vice versa. The owner ruled R3,
    // so it now asserts the CONFIRMED markers and the RULED array — the identical
    // four-sites-move-together property, re-anchored. The pre-ruling shape is in this
    // file's git history at the T-198 commit; do not resurrect it.
    const content = readRepo(join('packages', 'content', 'src', 'liarsDice.ts'));

    const declaration = content.indexOf('export const LIARS_DICE_ROUNDS_PER_DAY');
    expect(
      declaration,
      'packages/content/src/liarsDice.ts no longer declares LIARS_DICE_ROUNDS_PER_DAY.',
    ).toBeGreaterThan(-1);

    const docblockStart = content.lastIndexOf('/**', declaration);
    expect(
      docblockStart,
      'LIARS_DICE_ROUNDS_PER_DAY has lost its docblock — the CONFIRMED marker lives there.',
    ).toBeGreaterThan(-1);
    const docblock = content.slice(docblockStart, declaration);

    expect(
      docblock.includes('CONFIRMED (owner, 2026-08-05)'),
      "packages/content/src/liarsDice.ts's LIARS_DICE_ROUNDS_PER_DAY docblock no longer carries " +
        "R3's dated confirmation. All FOUR sites move in ONE edit: this docblock, " +
        "docs/DAWN-HAND-REDESIGN.md §5's last bullet, docs/LIARS-DICE-DECISIONS.md LD-23, and " +
        'the array itself. If only one moved, that is the defect this test exists to catch.',
    ).toBe(true);

    const spec = sectionOf(
      readDoc('DAWN-HAND-REDESIGN.md'),
      '## 5 · Things this document flags rather than silently resolves',
    );
    expect(spec !== null).toBe(true);
    expect(
      spec !== null && spec.includes('RESOLVED (owner, 2026-08-05)'),
      "docs/DAWN-HAND-REDESIGN.md §5's rounds bullet no longer carries R3's dated resolution — " +
        'see the four-site note above.',
    ).toBe(true);
    expect(
      spec !== null && !spec.includes('STILL OPEN'),
      'docs/DAWN-HAND-REDESIGN.md §5 still heads a bullet STILL OPEN. R3 was ruled on 2026-08-05 ' +
        'and the bullet was re-headed RESOLVED; a STILL OPEN heading here means the resolution was ' +
        'reverted or a new open question was filed without its own slot.',
    ).toBe(true);

    const ld = sectionOf(readDoc('LIARS-DICE-DECISIONS.md'), '## 6. The action economy (M17)');
    expect(ld !== null).toBe(true);
    expect(
      ld !== null && ld.includes('CONFIRMED (owner, 2026-08-05'),
      'docs/LIARS-DICE-DECISIONS.md LD-23 no longer carries the dated confirmation of the rounds ' +
        'table — see the four-site note above.',
    ).toBe(true);

    expect(
      content.includes('[1, 2, 3, 4, 5, 6] as const;'),
      'LIARS_DICE_ROUNDS_PER_DAY is no longer [1, 2, 3, 4, 5, 6] — R3 as the owner ruled it on ' +
        '2026-08-05. Revising the ARRAY is a CONTENT edit and owes a capstone diffed against ' +
        'docs/balance/baseline-t202-liars-dice-ceiling.json — it is not a marker-comment flip. ' +
        'Re-quote the brief §10 and re-anchor this check.',
    ).toBe(true);
  });

  it('carries the three ruling slots the task halted on, all now recorded by the owner', () => {
    // T-202 · THE INVERSION (2026-08-05). T-198 halted on THREE owner rulings (R1
    // pacing, R2 SOCIAL_PLAYS_PER_DAY, R3 the §4b rounds table) and this test asserted
    // all six ruling/date cells EMPTY, because a filled cell no owner wrote is a coder
    // self-waiver. The owner ruled all three on 2026-08-05 — R1 accept-as-is, R2
    // `SOCIAL_PLAYS_PER_DAY = 3` confirmed with no change, R3 revised to
    // `[1, 2, 3, 4, 5, 6]` and shipped by T-202 — so the test is FLIPPED, not deleted,
    // exactly as T-158's `uat-brief-figures.test.ts` third test was. The asserted-empty
    // shape is in this file's git history at the T-198 commit.
    expect(BRIEF).toContain('| **R1** | **Is the post-M17 pacing acceptable?**');
    expect(BRIEF).toContain('| **R2** | **Does `SOCIAL_PLAYS_PER_DAY = 3` need tightening?**');
    expect(BRIEF).toContain('| **R3** | **Confirm or revise `LIARS_DICE_ROUNDS_PER_DAY');
    expect(BRIEF).toContain(
      '**"Fix", "defer" and "accept-as-is" all count as a ruling. What does not count is silence.**',
    );

    const rulingRows = BRIEF.split('\n').filter(
      (line) =>
        line.startsWith('| **R1** |') ||
        line.startsWith('| **R2** |') ||
        line.startsWith('| **R3** |'),
    );
    expect(rulingRows).toHaveLength(3);

    for (const row of rulingRows) {
      const cells = row.split('|').map((cell) => cell.trim());
      // ['', '#', 'the ask', "owner's ruling", 'date', '']
      expect(cells).toHaveLength(6);
      expect(
        cells[3].length > 0,
        `A ruling cell in the T-198 brief is EMPTY (row: "${row}"). The owner recorded all three ` +
          "rulings on 2026-08-05 and T-202 is only DONE once every slot carries the owner's " +
          'actual ruling text, transcribed from TASKS.md T-198 rather than paraphrased. An empty ' +
          'cell here means a ruling was dropped — restore it from TASKS.md; never loosen this back ' +
          'to asserts-empty.',
      ).toBe(true);
      expect(
        cells[4].length > 0,
        `A ruling DATE cell in the T-198 brief is EMPTY (row: "${row}"). Same rule.`,
      ).toBe(true);
    }
  });
});
