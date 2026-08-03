import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../balance/rules-fingerprint.js';

// ---------------------------------------------------------------------------
// T-158 · THE PRE-UAT BRIEF's figure pins.
//
// `docs/playtests/T-158-pre-uat-brief.md` is the document the owner reads before
// the first human UAT pass. Its whole value is that the numbers in it are the
// numbers the source documents actually hold — a brief that quotes a stale
// magnitude is worse than no brief, because it spends the owner's attention on a
// measurement that has already moved.
//
// `docs/LESSONS.md` Standards carries the standing rule this file implements:
//
//   "Every measured figure quoted from a document carries a resolvable pin
//    checked against the live file in BOTH directions, and is transcribed from
//    the source document, never from a summary of it."
//
// L-035 is the lesson this exact class of document already broke once, and
// F-157-2 is the same defect one level down (a ledger row whose STATUS was
// machine-checked while its MAGNITUDES were prose). So each figure below is
// asserted three ways:
//
//   1. the named section heading still exists in the source document;
//   2. the value appears INSIDE that section (heading line → the next heading of
//      the same-or-shallower depth, or EOF) — not merely somewhere in the file;
//   3. the value appears in the BRIEF — the reverse direction, so a pin cannot
//      outlive the prose it was written to guard.
//
// NO ESCAPE HATCH. IF THIS TEST GOES RED, A SOURCE DOCUMENT WAS RE-MEASURED.
// Re-read the section and re-quote the brief from it. Never edit the brief to
// match a stale pin, and never edit a source document to match the brief — that
// is the same move as widening a band to clear a gate, and it is forbidden for
// the same reason.
//
// Note on the parse, deliberately simpler than `archetype-coverage.test.ts`'s:
// that suite resolves a table row's LAST column, which is right for its tables
// and wrong here (the last column of §11.3's decay table is `explorer only` —
// 96.47% — not the fleet's 96.52%). A plain in-section substring is general
// enough for prose, tables and code spans alike, and it fails loudly on a
// reword rather than silently resolving the wrong cell.
//
// The list lives IN THIS TEST FILE on purpose. A new module under
// `packages/sim/src` outside `__tests__` would owe a `SIM_NON_INSTRUMENT_SOURCES`
// entry and would move `instrumentFingerprint`; `__tests__` is in
// `HASHED_ROOT_IGNORED_DIRECTORIES`, so nothing here can move a fingerprint.
// ---------------------------------------------------------------------------

const DOCS = join(REPO_ROOT, 'docs');
const readDoc = (name: string): string => readFileSync(join(DOCS, name), 'utf8');

const BRIEF_PATH = join(DOCS, 'playtests', 'T-158-pre-uat-brief.md');
const BRIEF = readFileSync(BRIEF_PATH, 'utf8');

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

const UAT_BRIEF_FIGURES: readonly BriefFigure[] = [
  // --- §5 · Explore is still a net credit loss -----------------------------
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 9.1 The verdict, first',
    value: '**85 of 120 seeds**',
    why: "brief §5 — T-116's paired sign count, seeds richer WITHOUT the verb",
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 9.1 The verdict, first',
    value: '**101 of 120**',
    why: 'brief §5 — the pre-rebuild sign count the above narrowed from',
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '`EXPLORATION_FUEL_COST` is still **80**',
    why: 'brief §5 — the unpulled R-series pricing lever',
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '`EXPLORATION_NAV_DC` is still **12**',
    why: 'brief §5 — the unpulled R-series pricing lever',
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '**60,638cr**',
    why: "brief §5 — the current-at-HEAD read: `explorer`'s median final credits",
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '**0.795**',
    why: "brief §5 — the current-at-HEAD read: `explorer`'s tourOneClearRate",
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '**26.53**',
    why: "brief §5 — the current-at-HEAD read: `explorer`'s deeds",
  },
  {
    doc: 'EXPLORE_REDESIGN.md',
    section: '### 10.4 The Explore PARITY LEDGER row, RE-ASKED',
    value: '**7.69% of what the fixed policy queues is still refused**',
    why: 'brief §5 — the within-day residual still refusing queued Explores',
  },

  // --- §6 · F-150-1, disposition inertness ---------------------------------
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**96.52%**',
    why: 'brief §6 — share of live captain-days at exactly 0 disposition',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: 'survives a median of **3 days**',
    why: 'brief §6 — how long a nonzero standing lasts (one decay interval)',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**1.53 : 1**',
    why: 'brief §6 — decay steps against interaction moves',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**71.52%**',
    why: 'brief §6 — inert named-pool draws (every candidate at 0)',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**25.07%**',
    why: 'brief §6 — the named share, against an analytic 25.00%',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: 'roughly 7% of all interceptions',
    why: 'brief §6 — the multiplied-through reach of disposition',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**2.358×**',
    why: 'brief §6 — fleet-wide grudge lift over uniform',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**41.46%**',
    why: "brief §6 — the `gambler` counter-case's inertness",
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.3 THE NEW FINDING',
    value: '**2.806×**',
    why: "brief §6 — the `gambler` counter-case's lift",
  },

  // --- §6 companion context, from the (already ruled) VisitHangout re-ask ---
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.4 THE PARITY LEDGER RE-ASK',
    value: '+3.44cr',
    why: 'brief §6 — the counterparty-less socialize faucet at HEAD',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.4 THE PARITY LEDGER RE-ASK',
    value: '**0.22%**',
    why: "brief §6 — the faucet's share of terminal NPC wealth",
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.4 THE PARITY LEDGER RE-ASK',
    value: '**37.97%**',
    why: 'brief §6 — Socialize captain-days resolving where there is no Hangout',
  },
  {
    doc: 'HANGOUT_REDESIGN.md',
    section: '### 11.4 THE PARITY LEDGER RE-ASK',
    value: '**17.49%**',
    why: 'brief §6 — live captain-days locked out by the 150cr ante',
  },

  // --- §4 · what is known-uncovered going in -------------------------------
  {
    doc: 'NPC_REDESIGN.md',
    section: '### THE PARITY LEDGER',
    value: '6.4 interdictions each and **0 deaths**',
    why: "brief §4 item 1 — ruling ask R1, `executeCombat`'s missing shared rules",
  },
  {
    doc: 'LIARS-DICE_REDESIGN.md',
    section: '### 16.2 FINDING F-137-1',
    value: 'openers guaranteed true 100.00% → 0.00%',
    why: 'brief §4 item 4 — the T-160 fix the owner will actually play',
  },
  {
    doc: 'LIARS-DICE_REDESIGN.md',
    section: '### 16.2 FINDING F-137-1',
    value: '80.30% → 61.07%',
    why: 'brief §4 item 4 — player win rate, post-fix',
  },
  {
    doc: 'LIARS-DICE_REDESIGN.md',
    section: '### 16.2 FINDING F-137-1',
    value: '+565.8 → +197.3 cr',
    why: 'brief §4 item 4 — EV per hand, post-fix',
  },
  {
    doc: 'LIARS-DICE_REDESIGN.md',
    section: '### 17.8 Findings filed by T-160',
    value: 'dealer-as-challenger 40.73%, player-as-challenger 82.43%',
    why: 'brief §4 item 4 — F-160-2, still open on the bar being played',
  },
];

describe('T-158 · the pre-UAT brief quotes live figures, in both directions', () => {
  it('resolves every quoted figure against the section of the document it came from', () => {
    let pinned = 0;

    for (const figure of UAT_BRIEF_FIGURES) {
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
          're-quote docs/playtests/T-158-pre-uat-brief.md from it. Never edit the document ' +
          'or the brief to make this pass.',
      ).toBe(true);

      pinned += 1;
    }

    // No test that quantifies over nothing: prove the mechanism ran.
    expect(pinned).toBeGreaterThan(0);
    expect(pinned).toBe(UAT_BRIEF_FIGURES.length);
  });

  it('proves the brief still states every figure it pins', () => {
    let checked = 0;

    for (const figure of UAT_BRIEF_FIGURES) {
      expect(
        BRIEF.includes(figure.value),
        `docs/playtests/T-158-pre-uat-brief.md no longer states the pinned figure ` +
          `"${figure.value}" (docs/${figure.doc} · "${figure.section}", ${figure.why}). ` +
          'A pin whose prose has gone is a pin guarding nothing — restore the sentence ' +
          'or drop the pin deliberately.',
      ).toBe(true);
      checked += 1;
    }

    expect(checked).toBeGreaterThan(0);
  });

  it('carries the two ruling slots the task halts on, both still empty', () => {
    // T-158 closes on TWO recorded owner rulings and nothing else. The slots are
    // asserted here so a future edit cannot quietly drop one, and so the halt is
    // visible from the test suite rather than only from `TASKS.md` prose.
    expect(BRIEF).toContain("| **R1** | **Combat's chosen branch**");
    expect(BRIEF).toContain('| **R2** | **F-150-1**');
    expect(BRIEF).toContain(
      '**"Fix", "defer" and "accept-as-is" all count as a ruling. What does not count is silence.**',
    );

    // The coder does not self-waive: the answer column of both rows is blank.
    // Any non-empty text is the owner's, and it is what closes the task.
    const rulingRows = BRIEF.split('\n').filter(
      (line) => line.startsWith('| **R1** |') || line.startsWith('| **R2** |'),
    );
    expect(rulingRows).toHaveLength(2);
    for (const row of rulingRows) {
      const cells = row.split('|').map((cell) => cell.trim());
      // ['', '#', 'the ask', "owner's ruling", 'date', '']
      expect(cells).toHaveLength(6);
      expect(
        cells[3],
        'A ruling cell in the pre-UAT brief is non-empty. If the owner filled it in, ' +
          'close T-158 by transcribing it to the sites named in the TO CLOSE THIS TASK ' +
          'checklist and update this test. If anything else filled it in, that is a ' +
          'self-waiver and must be reverted.',
      ).toBe('');
    }
  });
});
