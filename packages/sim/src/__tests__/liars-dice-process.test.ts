import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../../../../..');

const SOURCE_ROOTS = [
  'packages/content/src',
  'packages/engine/src',
  'packages/sim/src',
  'packages/ui/src',
];

function sourceFiles(root: string): string[] {
  const abs = resolve(REPO_ROOT, root);
  const files: string[] = [];
  for (const entry of readdirSync(abs)) {
    const path = resolve(abs, entry);
    const rel = relative(REPO_ROOT, path);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (entry === '__tests__' || entry === 'dist') continue;
      files.push(...sourceFiles(rel));
    } else if (/\.[cm]?[jt]sx?$/.test(entry) && !entry.endsWith('.d.ts')) {
      files.push(rel);
    }
  }
  return files.sort();
}

function readRepoFile(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8');
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => '\n'.repeat(match.split('\n').length - 1))
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function callLines(symbol: string): string[] {
  const matcher = new RegExp(`\\b${symbol}\\s*\\(`);
  const hits: string[] = [];
  for (const file of SOURCE_ROOTS.flatMap(sourceFiles)) {
    const lines = stripComments(readRepoFile(file)).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]?.trim() ?? '';
      if (!matcher.test(line)) continue;
      if (line.startsWith(`function ${symbol}`) || line.startsWith(`export function ${symbol}`)) {
        continue;
      }
      hits.push(`${file}: ${line}`);
    }
  }
  return hits;
}

describe('T-243 · §4.6a Liars Dice live-tier read process', () => {
  it('keeps the liarsDiceTier call-site list closed at the four licensed reads', () => {
    const calls = callLines('liarsDiceTier');

    expect(calls).toEqual([
      'packages/engine/src/actions/hangout.ts: const tier = liarsDiceTier(nextState.player.liarsDiceGamesPlayed);',
      'packages/engine/src/liarsDiceRules.ts: const cap = liarsDiceRoundsPerDay(liarsDiceTier(state.player.liarsDiceGamesPlayed));',
      'packages/engine/src/liarsDiceRules.ts: liarsDiceTier(state.player.liarsDiceGamesPlayed),',
      'packages/ui/src/format.ts: return liarsDiceTier(game.player.liarsDiceGamesPlayed);',
    ]);

    for (const doc of ['docs/LIARS-DICE-PROGRESSION_SPEC.md', 'docs/LIARS-DICE-DECISIONS.md']) {
      const text = readRepoFile(doc);
      for (const phrase of [
        'actions/hangout.ts',
        'liarsDiceRoundsRemaining',
        'preHandWagerBand',
        'preHandTier',
      ]) {
        expect(text, `${doc} names ${phrase}`).toContain(phrase);
      }
    }
  });

  it('forbids non-engine stake-domain sizing from raw port bands or multiplier math', () => {
    const rawBandCalls = callLines('wagerBandFor').filter(
      (line) => !line.startsWith('packages/engine/src/'),
    );

    expect(rawBandCalls).toEqual([
      'packages/sim/src/index.ts: const base = wagerBandFor(event.systemId).max;',
    ]);

    const multiplierMentions = SOURCE_ROOTS.flatMap(sourceFiles).flatMap((file) => {
      if (file.startsWith('packages/engine/src/') || file.startsWith('packages/content/src/')) {
        return [];
      }
      return stripComments(readRepoFile(file))
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /\bLIARS_DICE_RAISED_CEILING_MULT\b/.test(line))
        .map((line) => `${file}: ${line}`);
    });

    expect(multiplierMentions).toEqual([]);
  });
});
