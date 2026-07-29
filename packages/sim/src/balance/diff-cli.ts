/**
 * N7 · The I/O half of the capstone differ. Argv and the filesystem live here;
 * every comparison lives in the pure `./diff.ts` (the T-1602b split).
 *
 * HOW TO RUN (from the repo root):
 *
 *   npm run balance:diff -w @spacerquest/sim -- \
 *     docs/balance/baseline-r2c-final.json docs/balance/baseline-n1.json
 *
 * Exit code is 0 whether or not anything moved: "the fighter row moved" is a
 * RESULT, not an error, and a non-zero exit would make the tool unusable in the
 * one loop it exists for. `--fail-on-change` opts into the gate behaviour for a
 * caller that wants it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BaselineAggregate } from './aggregate.js';
import { diffAggregates, formatAggregateDiff } from './diff.js';
import { resolveArtifact } from './resolve-artifact.js';

function usage(): string {
  return [
    'Usage: npm run balance:diff -w @spacerquest/sim -- <before.json> <after.json> [options]',
    '',
    '  --epsilon <n>       Absolute numeric tolerance. Default 0 (exact) — both sides are',
    '                      seeded and deterministic, so exact is the honest default.',
    '  --json              Emit the diff as JSON instead of the report.',
    '  --fail-on-change    Exit 1 when anything moved.',
    '  --help',
  ].join('\n');
}

export interface DiffCliOptions {
  before: string;
  after: string;
  epsilon: number;
  json: boolean;
  failOnChange: boolean;
}

export function parseDiffArgs(argv: readonly string[]): DiffCliOptions | { help: true } {
  const positional: string[] = [];
  let epsilon = 0;
  let json = false;
  let failOnChange = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    else if (arg === '--json') json = true;
    else if (arg === '--fail-on-change') failOnChange = true;
    else if (arg === '--epsilon') {
      const value = Number(argv[index + 1]);
      if (!Number.isFinite(value) || value < 0) throw new Error('--epsilon must be a number >= 0');
      epsilon = value;
      index += 1;
    } else if (arg.startsWith('--')) throw new Error(`Unknown argument: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 2) throw new Error('Expected exactly two aggregate paths');
  return {
    before: resolveArtifact(positional[0]),
    after: resolveArtifact(positional[1]),
    epsilon,
    json,
    failOnChange,
  };
}

function load(path: string): BaselineAggregate {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as BaselineAggregate;
  if (typeof parsed.label !== 'string' || !Array.isArray(parsed.byPolicy)) {
    throw new Error(`${path} is not a sweep aggregate (no label / byPolicy)`);
  }
  return parsed;
}

export function main(argv: string[] = process.argv.slice(2)): void {
  try {
    const parsed = parseDiffArgs(argv);
    if ('help' in parsed) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const diff = diffAggregates(load(parsed.before), load(parsed.after), {
      epsilon: parsed.epsilon,
    });
    process.stdout.write(
      parsed.json ? `${JSON.stringify(diff, null, 2)}\n` : formatAggregateDiff(diff),
    );
    if (parsed.failOnChange && !diff.identical) process.exitCode = 1;
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
