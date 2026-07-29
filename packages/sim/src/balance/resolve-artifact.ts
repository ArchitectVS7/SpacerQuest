/**
 * N7 · One path rule for the balance CLIs.
 *
 * `npm run balance:diff -w @spacerquest/sim` runs with cwd = `packages/sim`,
 * while every path a reader would type — `docs/balance/baseline-n1.json` — is
 * written relative to the REPO ROOT, because that is where the artefacts live and
 * how every command in the worklist is quoted. Resolving against cwd alone made
 * the first real invocation fail with
 * `ENOENT: .../packages/sim/docs/balance/baseline-r2c-final.json`, which reads as
 * "the file is missing" rather than "you are standing somewhere else".
 *
 * So: absolute paths are taken as given; a relative path is tried against cwd
 * first (so running the script directly from anywhere still works) and falls back
 * to the repo root. READERS: `./diff-cli.ts`, `./smoke-extract.ts`.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

import { REPO_ROOT } from './rules-fingerprint.js';

export function resolveArtifact(path: string): string {
  if (isAbsolute(path)) return path;
  const fromCwd = resolve(process.cwd(), path);
  return existsSync(fromCwd) ? fromCwd : resolve(REPO_ROOT, path);
}
