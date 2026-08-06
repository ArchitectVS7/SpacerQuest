import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAT_WIRE_TEMPLATES } from '../wireStories.js';

/**
 * T-253 · THE "VERBATIM PRD §6 SAMPLE" CONTRACT, MADE ENFORCEABLE.
 *
 * `wireStories.ts` declares `NAT_WIRE_TEMPLATES.gamble.nat20[0]` to be the
 * verbatim PRD §6 sample and pins it exactly in `packages/engine/.../wire.test.ts`.
 * Both are pins on the CODE side only: for months the template said "Cantina"
 * (HO-23's player-facing rename) while `docs/PRD-REIMAGINED.md` §6 still said
 * "Hangout", and nothing anywhere went red — the contract was prose, and per
 * `docs/LESSONS.md` L-020 prose is not enforcement.
 *
 * So this test is the enforcement, and it is deliberately DIRECTION-FREE: the
 * expected string is derived FROM THE TEMPLATE and required to be present in the
 * PRD. Editing either side alone fails, which is the whole point — whoever moves
 * one is told to move the other rather than told which one is "right".
 *
 * It lives in `packages/content` because it resolves nothing through the engine
 * (see `contentPackageBoundary.test.ts` for why an engine import here is barred),
 * and under `src/__tests__/` because that is the one directory the rules
 * fingerprint declares inert (`rules-fingerprint.ts` HASHED_ROOT_IGNORED_DIRECTORIES)
 * — a content-side validator there owes no capstone sweep.
 */

const PRD = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'docs',
  'PRD-REIMAGINED.md',
);

const SECTION_6_HEADING = '## 6. The Living Galaxy — NPCs as Characters';

/** The three names the sample fixes — the same ones `wire.test.ts` seeds. */
const SAMPLE_FILL = {
  actor: 'Lucky Seven',
  loserShip: 'Fat Profit',
  loser: 'Cargo King',
} as const;

/** The §6 body only. A renamed heading must fail LOUDLY rather than silently
 *  vacate the assertion by slicing an empty (or whole-document) string. */
function section6(): string {
  const doc = readFileSync(PRD, 'utf8');
  const start = doc.indexOf(SECTION_6_HEADING);
  if (start === -1) {
    throw new Error(
      `docs/PRD-REIMAGINED.md no longer contains the heading "${SECTION_6_HEADING}". ` +
        'The §6 boundary this test slices on was renamed — re-point it deliberately; ' +
        'do not delete the assertion.',
    );
  }
  const rest = doc.slice(start + SECTION_6_HEADING.length);
  const end = rest.indexOf('\n## ');
  if (end === -1) {
    throw new Error(
      'docs/PRD-REIMAGINED.md §6 has no following "## " heading — the section boundary ' +
        'is gone and this test would otherwise silently match the whole document.',
    );
  }
  return rest.slice(0, end);
}

function fill(template: string): string {
  return template
    .replaceAll('{actor}', SAMPLE_FILL.actor)
    .replaceAll('{loserShip}', SAMPLE_FILL.loserShip)
    .replaceAll('{loser}', SAMPLE_FILL.loser);
}

const DIVERGENCE =
  '`wireStories.ts` gamble.nat20[0] is designated the verbatim PRD §6 sample (HO-25). ' +
  'Either the PRD or the template moved. Fix the divergence — do not edit this test to match.';

describe('the verbatim PRD §6 wire sample', () => {
  it('appears in docs/PRD-REIMAGINED.md §6 exactly as the template fills it', () => {
    const filled = fill(NAT_WIRE_TEMPLATES.gamble.nat20[0]);
    expect(section6(), DIVERGENCE).toContain(filled);
  });

  it('is INDEX 0 of the gamble nat-20 bucket, and no sibling line claims that role', () => {
    // Index 0 is load-bearing: the `wireStories.ts` header comment and
    // `wire.test.ts`'s seeded pin both name it specifically, so a reorder of the
    // bucket would silently retarget the contract at a line the PRD never quoted.
    const siblings = NAT_WIRE_TEMPLATES.gamble.nat20.slice(1).map(fill);
    const body = section6();
    for (const sibling of siblings) {
      expect(
        body,
        `A gamble nat-20 line other than index 0 also appears in PRD §6 — the verbatim ` +
          `contract must name exactly one line. Offending line: ${sibling}`,
      ).not.toContain(sibling);
    }
  });
});
