import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREDITS, creditDetail, creditLine } from '../credits';

// ---------------------------------------------------------------------------
// T-1704 · The credits, and the two claims they make about this repository.
//
// `docs/CREDITS.md` is a DELIVERABLE, so it is tested like one — the same rule
// `docs/STEAM-ACHIEVEMENTS.md` gets from `steam.test.ts`: a hand-maintained copy
// of a constant rots, and an attribution list that rots is a licensing problem
// rather than a documentation one.
//
// The two file-system walks below are the interesting part. `CREDITS` claims
// that every sound is original synthesis and that no font binary ships; both are
// STRUCTURAL claims about the tree, so both are asserted against the tree instead
// of being trusted. The day someone drops a sample or a .woff2 in without a
// credit row, this file goes red — which is exactly when someone needs to be
// told.
// ---------------------------------------------------------------------------

const UI_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = join(UI_ROOT, '..', '..');

/** Directories that are build output, dependencies or test debris — none of them
 *  are sources this repository owns, so none of them answer the question the two
 *  walks below ask. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'dist-web',
  'dist-demo',
  'test-results',
  'flake-results',
  'playwright-report',
  '.vite',
]);

/** Every file extension present under `packages/ui`, excluding the trees above. */
function extensionsUnder(root: string): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else {
        found.add(extname(entry.name).toLowerCase());
      }
    }
  };
  walk(root);
  return found;
}

const UI_EXTENSIONS = extensionsUnder(UI_ROOT);

describe('T-1704 · the credits are well formed', () => {
  it('every row names something, someone and a licence', () => {
    for (const credit of CREDITS) {
      expect(credit.id.length).toBeGreaterThan(0);
      expect(credit.name.length).toBeGreaterThan(0);
      expect(credit.holder.length).toBeGreaterThan(0);
      expect(credit.license.length).toBeGreaterThan(0);
    }
  });

  it('ids are unique and kebab-case — they are structural handles, not prose', () => {
    // `data-credit-id` is what the e2e suites assert on, so an id that changed
    // shape (or collided) would silently take a row's proof with it.
    const ids = CREDITS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('no cell contains a pipe — the doc renders these as a markdown table', () => {
    // Not pedantry: a pipe in a note would split a row in `docs/CREDITS.md` and
    // the parity test below would fail for a reason that has nothing to do with
    // the credits themselves.
    for (const credit of CREDITS) {
      expect(`${credit.name}${credit.holder}${credit.license}${credit.note ?? ''}`).not.toContain(
        '|',
      );
    }
  });

  it('creditLine and creditDetail compose exactly what the panel renders', () => {
    // `App.tsx`'s `CreditsPanel` owns NO prose — it calls these two. Pinning them
    // here is what lets the e2e specs assert on text without duplicating format.
    const font = CREDITS.find((c) => c.id === 'font-chakra-petch')!;
    expect(creditLine(font)).toBe('Cadson Demak · SIL Open Font License 1.1');
    expect(creditDetail(font)).toContain('https://openfontlicense.org');

    const provenance = CREDITS.find((c) => c.id === 'spacer-quest-1991')!;
    // No licence URL for a provenance row: the join must not leave a stray space.
    expect(creditDetail(provenance)).toBe(provenance.note);
    expect(creditDetail({ id: 'x', name: 'x', holder: 'x', license: 'x' })).toBe('');
  });
});

describe('T-1704 · the claims CREDITS makes about this tree are true', () => {
  it('ZERO audio asset files exist under packages/ui', () => {
    // The `audio` row says every cue is original procedural WebAudio synthesis
    // with no third-party samples (`sound.ts`'s header says the same). That is a
    // claim about the TREE, so it is asserted against the tree — a sample dropped
    // in later without a credit row fails here.
    for (const ext of ['.mp3', '.ogg', '.wav', '.m4a', '.flac', '.aac']) {
      expect(UI_EXTENSIONS.has(ext)).toBe(false);
    }
  });

  it('ZERO font binaries exist under packages/ui', () => {
    // The two font rows say the families are LOADED FROM GOOGLE FONTS and not
    // bundled (`index.html`). THIS IS THE ASSERTION THAT MOVES if open decision
    // F1 in `docs/RELEASE-CHECKLIST.md` is granted and the families are
    // self-hosted — at which point the notes in `credits.ts` move with it and the
    // OFL's redistribution requirements come into play. That it must be edited
    // deliberately is the feature.
    for (const ext of ['.woff', '.woff2', '.ttf', '.otf', '.eot']) {
      expect(UI_EXTENSIONS.has(ext)).toBe(false);
    }
  });

  it('the walk actually walked something', () => {
    // Guard against a vacuous pass: if `SKIP_DIRS` or the root ever swallowed the
    // whole tree, both assertions above would pass while proving nothing.
    expect(UI_EXTENSIONS.has('.ts')).toBe(true);
    expect(UI_EXTENSIONS.has('.tsx')).toBe(true);
    expect(UI_EXTENSIONS.has('.css')).toBe(true);
  });
});

describe('T-1704 · docs/CREDITS.md is the constant, row for row', () => {
  const doc = readFileSync(join(REPO_ROOT, 'docs', 'CREDITS.md'), 'utf8');

  /** Every `| Component | Holder | License | Notes |` row in the table. */
  const rows = [...doc.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
    .map((m) => ({
      name: m[1].trim(),
      holder: m[2].trim(),
      license: m[3].trim(),
      note: m[4].trim(),
    }))
    .filter((row) => row.name !== 'Component' && !/^-+$/.test(row.name));

  it('lists exactly the credits, in order, with the same prose', () => {
    expect(rows).toEqual(
      CREDITS.map((c) => ({
        name: c.name,
        holder: c.holder,
        license: c.license,
        note: c.note ?? '—',
      })),
    );
  });

  it('carries every licence URL the shipped build shows', () => {
    // The URL is what makes an attribution actionable, and the cockpit shows it;
    // the doc must not be the shorter version of the same list.
    for (const credit of CREDITS) {
      if (credit.licenseUrl) expect(doc).toContain(credit.licenseUrl);
    }
  });

  it('says that dev-only tooling is deliberately absent', () => {
    // A reader's first question about a credits file is "is this everything?".
    // The answer — that Vite/vitest/Playwright/TypeScript/ESLint/Prettier are
    // never distributed to a player — has to be IN the file, or the omission
    // looks like an oversight.
    expect(doc).toMatch(/dev(elopment)?-only/i);
  });
});
