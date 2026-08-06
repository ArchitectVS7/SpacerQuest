/**
 * T-183 · WHERE A BALANCE ARTEFACT SAYS WHAT TREE PRODUCED IT.
 *
 * Two CLIs need the same three facts at write time — `./smoke-extract.ts` for a
 * smoke fixture, `./sweep.ts --merge` for an aggregate — so they are computed in
 * one place rather than twice (BR-38: an invariant helper has exactly ONE
 * definition). Everything here reads the working tree; nothing here folds a row or
 * plays a day, which is why it is classified NON-INSTRUMENT in
 * `./rules-fingerprint.ts` (self-inclusion would also be circular — it CALLS
 * `computeInstrumentFingerprint`).
 *
 * WHAT THE THREE FIELDS ARE FOR, AND WHICH IS AUTHORITATIVE. The two fingerprints
 * describe the tree that was actually hashed; `gitCommit` is a LOCATOR, not a
 * guarantee — a dirty working tree has a perfectly valid HEAD and fingerprints that
 * reflect the edits. When they disagree, believe the fingerprints. (`smoke-extract.ts`
 * has recorded HEAD without a dirty marker since N7; that convention is kept
 * deliberately rather than changed under a task that is not about it.)
 *
 * READERS (constraint 7): `./sweep.ts` (`--merge`) and `./smoke-extract.ts`.
 */

import { execFileSync } from 'node:child_process';

import type { AggregateStamp } from './aggregate.js';
import {
  computeInstrumentFingerprint,
  computeRulesFingerprint,
  REPO_ROOT,
} from './rules-fingerprint.js';

/** HEAD, or `'unknown'` when git cannot answer. */
export function headCommit(repoRoot: string = REPO_ROOT): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    // Recorded as 'unknown' rather than omitted — a missing provenance field reads
    // as "nobody thought about it".
    return 'unknown';
  }
}

/** The three facts a merged {@link AggregateStamp} carries, read off the tree. */
export function computeAggregateStamp(repoRoot: string = REPO_ROOT): AggregateStamp {
  return {
    rulesFingerprint: computeRulesFingerprint(repoRoot).fingerprint,
    instrumentFingerprint: computeInstrumentFingerprint(repoRoot).fingerprint,
    gitCommit: headCommit(repoRoot),
  };
}
