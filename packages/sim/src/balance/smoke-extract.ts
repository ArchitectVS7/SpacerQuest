/**
 * N7 · The I/O half of the checkpoint extractor: read a capstone aggregate, run
 * the tiers, write `docs/balance/smoke/<name>.json`. Every decision lives in the
 * pure-ish `./checkpoints.ts`.
 *
 * THIS IS THE ONLY THING THAT WRITES A FIXTURE, and it is only ever run by hand.
 * The smoke suite reads fixtures and never calls this — a test that could refresh
 * its own expectations would turn a stale-ruleset failure into a silent re-pin,
 * which is the exact failure `docs/VERSIONING.md` closes with.
 *
 * HOW TO RUN (from the repo root):
 *
 *   npm run balance:extract -w @spacerquest/sim -- \
 *     --aggregate docs/balance/baseline-n1.json
 *
 * Add `--milestone-days 21,29,41` to the capstone sweep first if you want the
 * tier spreads HARVESTED rather than estimated; the extractor detects them and
 * flips `provenance.spreadSource` on its own.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createInitialState } from '@spacerquest/engine';

import type { BaselineAggregate } from './aggregate.js';
import { extractFixture } from './checkpoints.js';
import { resolveArtifact } from './resolve-artifact.js';
import { REPO_ROOT } from './rules-fingerprint.js';

function usage(): string {
  return [
    'Usage: npm run balance:extract -w @spacerquest/sim -- [options]',
    '',
    '  --aggregate <path>  Capstone aggregate to extract from.',
    '                      Default docs/balance/baseline-n1.json.',
    '  --out <path>        Fixture path. Default docs/balance/smoke/tiers.json.',
    '  --date <iso>        Extraction date recorded in provenance. Default: today.',
    '  --help',
  ].join('\n');
}

export interface ExtractCliOptions {
  aggregate: string;
  out: string;
  date: string;
}

export function parseExtractArgs(argv: readonly string[]): ExtractCliOptions | { help: true } {
  const options: ExtractCliOptions = {
    aggregate: join(REPO_ROOT, 'docs', 'balance', 'baseline-n1.json'),
    out: join(REPO_ROOT, 'docs', 'balance', 'smoke', 'tiers.json'),
    date: new Date().toISOString().slice(0, 10),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    const value = argv[index + 1];
    if (arg === '--aggregate') {
      if (value === undefined) throw new Error('Missing value for --aggregate');
      options.aggregate = resolveArtifact(value);
      index += 1;
    } else if (arg === '--out') {
      if (value === undefined) throw new Error('Missing value for --out');
      options.out = resolveArtifact(value);
      index += 1;
    } else if (arg === '--date') {
      if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error('--date must be YYYY-MM-DD');
      }
      options.date = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function gitCommit(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    // Recorded as 'unknown' by the extractor rather than omitted — a missing
    // provenance field reads as "nobody thought about it".
    return 'unknown';
  }
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const parsed = parseExtractArgs(argv);
    if ('help' in parsed) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const aggregate = JSON.parse(readFileSync(parsed.aggregate, 'utf8')) as BaselineAggregate;
    const started = Date.now();
    const fixture = extractFixture(aggregate, {
      extractedOn: parsed.date,
      gitCommit: gitCommit(),
      // The roster size the spread must cover, taken from the engine's own world
      // creation rather than a literal 30.
      npcCount: createInitialState(1).npcs.length,
    });
    mkdirSync(join(parsed.out, '..'), { recursive: true });
    writeFileSync(parsed.out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    process.stderr.write(
      `[smoke] ${fixture.checkpoints.length} tiers, spreads ${fixture.provenance.spreadSource}, ` +
        `rules ${fixture.rulesFingerprint} / instrument ${fixture.instrumentFingerprint} / ` +
        `docs ${fixture.docsFingerprint} -> ` +
        `${parsed.out} (${Date.now() - started} ms)\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`${message}\n${usage()}\n`);
    process.exitCode = 1;
  }
}

// Guarded exactly as ./sweep.ts guards its own CLI.
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
