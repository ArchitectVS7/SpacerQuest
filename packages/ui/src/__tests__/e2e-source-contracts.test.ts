import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '..', '..');
const UI_E2E = join(PACKAGE_ROOT, 'e2e');
const DESKTOP_E2E = join(REPO_ROOT, 'packages/desktop/e2e');

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);
    const stat = statSync(absolute);
    if (stat.isDirectory()) files.push(...walk(absolute));
    else if (absolute.endsWith('.spec.ts')) files.push(absolute);
  }
  return files;
}

function testTitles(source: string): string[] {
  const titles: string[] = [];
  const pattern = /\btest(?:\.describe)?\(\s*(['"`])([^'"`]*?)\1/g;
  let match = pattern.exec(source);
  while (match !== null) {
    titles.push(match[2]);
    match = pattern.exec(source);
  }
  return titles;
}

describe('M8 · e2e source contracts', () => {
  it('T-240 · every Playwright spec declares its first-run walkthrough stance', () => {
    const optOut = /FIRST_RUN_WALKTHROUGH:\s*(tests-first-run|preseeded|not-virgin)/;
    const problems: string[] = [];
    for (const file of [...walk(UI_E2E), ...walk(DESKTOP_E2E)]) {
      const source = readFileSync(file, 'utf8');
      if (source.includes('skipFirstTurnWalkthrough(') || optOut.test(source)) continue;
      problems.push(
        `${relative(REPO_ROOT, file)} must call skipFirstTurnWalkthrough or carry FIRST_RUN_WALKTHROUGH opt-out`,
      );
    }
    expect(problems).toEqual([]);
  });

  it('T-265 · only tour-one specs may put @tags in Playwright titles', () => {
    const allowed = new Set(['tour-one-career.spec.ts', 'tour-one-death.spec.ts']);
    const problems: string[] = [];
    for (const file of walk(UI_E2E)) {
      const source = readFileSync(file, 'utf8');
      for (const title of testTitles(source)) {
        const tag = /@\w[\w-]*/.exec(title);
        if (tag !== null && !allowed.has(basename(file))) {
          problems.push(
            `${relative(PACKAGE_ROOT, file)} title "${title}" contains ${tag[0]}; allowed files: ${[
              ...allowed,
            ].join(', ')}`,
          );
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('T-266 · authored-copy testids in App.tsx have e2e assertions', () => {
    const authoredCopyTestIds = [
      'dare-dealer-table-talk',
      'combat-enemy-bark',
      'combat-enemy-battle-bark',
      'combat-aftermath-bark',
    ];
    const app = readFileSync(join(PACKAGE_ROOT, 'src/App.tsx'), 'utf8');
    const e2eText = walk(UI_E2E)
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    const problems = authoredCopyTestIds.filter((testId) => {
      return (
        app.includes(`data-testid="${testId}"`) && !e2eText.includes(`getByTestId('${testId}')`)
      );
    });
    expect(problems).toEqual([]);
  });

  it('the first-run opt-out convention is documented where e2e authors will see it', () => {
    const docs = readFileSync(join(REPO_ROOT, 'docs/TESTING-STRATEGY.md'), 'utf8');
    expect(docs).toContain('FIRST_RUN_WALKTHROUGH');
    expect(existsSync(join(UI_E2E, 'walkthrough.spec.ts'))).toBe(true);
  });
});
