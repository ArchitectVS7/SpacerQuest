/**
 * N7 · THE RULES FINGERPRINT — derived, never declared.
 *
 * `docs/VERSIONING.md` §3 is the contract this file implements: a balance
 * artefact is only meaningful against the ruleset that produced it, and a
 * hand-maintained "balance version" would be forgotten in exactly the commit
 * that changed a tribute constant. So the answer to *"is this measurement still
 * about the game we are shipping?"* is a HASH OVER THE SOURCES THAT DECIDE
 * OUTCOMES, computed on demand from the working tree.
 *
 * WHAT "THE SOURCES THAT DECIDE OUTCOMES" MEANS, PRECISELY (N7-FP, 2026-07-29):
 * their CODE, not their bytes. Comments are stripped before hashing, because a
 * comment decides nothing and a byte hash answered a broader question than §3
 * asks — it called a provably inert documentation fix a ruleset change. The
 * raw-byte hash is not lost, it is DEMOTED to `computeDocsFingerprint`: recorded
 * in fixture provenance, reported on mismatch, never failing. See `hashSemantic`
 * for the full argument and the trade it accepts.
 *
 * Nothing here may ever be bumped, refreshed or overridden to make a test pass
 * (`docs/VERSIONING.md`, "The rule that matters most"). There is deliberately no
 * `--force`, no environment escape hatch and no "expected" constant to edit: the
 * only way to move a fingerprint is to change the rules, and the only way to
 * make a stale fixture green again is to re-measure.
 *
 * READERS (constraint 7): `./checkpoints.ts` (stamps a fixture), the smoke suite
 * `../__tests__/balance-smoke.test.ts` (refuses a stale one), and
 * `../__tests__/balance-rig.test.ts` (holds the classification below honest).
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

// ---------------------------------------------------------------------------
// WHICH FILES ARE "RULES" — the judgment call, made here, in one place.
// ---------------------------------------------------------------------------

/**
 * THE TEST APPLIED, stated so a reviewer can disagree with it concretely:
 *
 *   A file is a RULE SOURCE if editing it can change the outcome of a seeded
 *   career — the numbers a capstone sweep measures — without any test author
 *   intending it to.
 *
 * Both failure directions are real and they are NOT symmetric:
 *
 *   - Too NARROW is a correctness failure. A rule change the fingerprint misses
 *     leaves a stale fixture reporting green about a game that no longer exists,
 *     which the smoke README calls "worse than no test at all".
 *   - Too BROAD is only a cost. A false positive fails loudly, and the remedy is
 *     one capstone sweep (measured 2026-07-28: ~2 min across 8 shards) plus a
 *     differ run that says "nothing moved" — which is exactly the N1 loop.
 *
 * The asymmetry decides every borderline case in favour of INCLUSION. Two
 * consequences are worth naming rather than discovering:
 *
 *   - `types.ts` is IN. It is nearly all erased at runtime, but it carries the
 *     `DayPhase` enum, and — more to the point — a change to the persisted state
 *     SHAPE is precisely the class of change that must force a re-measure. N1
 *     added `NpcState.ship` and *nothing moved*; the honest way to learn that was
 *     a capstone plus a diff, not an assumption.
 *   - `clone.ts` is IN. It looks like plumbing, and N0 is the counter-example:
 *     it changed how NPC records are shared between snapshots, which is a
 *     one-aliasing-bug-away-from-silent-divergence file.
 */
const ENGINE_RULE_DIRECTORIES = ['', 'actions'] as const;

/**
 * The ONLY engine sources excluded from the fingerprint, each with the reason it
 * is not a rule. Kept as a map rather than a list so the reason travels with the
 * decision, and enforced from both ends by `balance-rig.test.ts`: every `.ts`
 * under `packages/engine/src` must be either hashed or named here, so a new
 * engine module cannot join the tree unclassified.
 */
export const ENGINE_NON_RULE_SOURCES: Readonly<Record<string, string>> = {
  'index.ts':
    'A barrel of `export *` lines. It decides what is importable, never what a day produces; ' +
    'adding a re-export cannot move a seeded career.',
  'save.ts':
    'PERSISTENCE, versioned separately and deliberately by docs/VERSIONING.md §2 ' +
    '(`CURRENT_SAVE_VERSION`). It answers "can this build read that save file?", not "what ' +
    'happens on day 21". A sim career never serializes mid-run, so no sweep number can ' +
    'depend on it.',
  'schema.ts':
    'The same §2 boundary: validation plus the migration registry. Note the N1 precedent ' +
    'that makes this safe — MIGRATIONS[9] seeds an NPC ship by calling `npc.ts` ' +
    '`npcShipForTier` rather than restating it, so the RULE lives in a hashed file and the ' +
    'migration is only its caller. If a migration ever authors a rule of its own, that is a ' +
    'reason to move this file into the fingerprint, not a reason to keep the line here.',
};

/**
 * Content is hashed WHOLESALE (minus its barrel), and that is not laziness: it
 * is standing constraint 4, "content is data, and it is not logic". Every file
 * under `packages/content/src` is outcome-deciding by construction, so a curated
 * list would add a judgment call where the repository has already made one.
 * `docs/VERSIONING.md` §3 names the directory for the same reason.
 */
export const CONTENT_NON_RULE_SOURCES: Readonly<Record<string, string>> = {
  'index.ts': 'A barrel of `export *` lines — see the engine entry above.',
};

/**
 * WHERE `packages/sim` LANDS: OUT of the rules fingerprint, and hashed
 * separately as the INSTRUMENT.
 *
 * The sim is the measuring device, not the thing measured. It decides how a
 * policy plays and what gets counted; it decides nothing about what the game
 * does. Folding it into `rulesFingerprint` would make that field assert
 * something false — "the ruleset changed" when only the thermometer was
 * recalibrated — and would churn on every policy tweak during exactly the
 * N2–N6 steps this rig exists to serve.
 *
 * But a checkpoint IS produced by the instrument, so an instrument change
 * invalidates it just as thoroughly. Conflating the two would lose that; so
 * would ignoring it. A fixture therefore carries BOTH hashes, and the smoke
 * suite reports them with different sentences, because they call for different
 * responses: a moved `rulesFingerprint` means re-run the capstone and read the
 * diff, a moved `instrumentFingerprint` means the measurement changed and the
 * old numbers were never about a different game at all.
 *
 * `dist/` is excluded — it is a build artifact of these same sources, and
 * hashing both would make a stale `tsc -b` output look like a source change.
 */
const SIM_INSTRUMENT_DIRECTORIES = ['', 'balance'] as const;

/**
 * The instrument hash covers what MEASURES: the policies and day loop
 * (`index.ts`), the aggregation definitions (`balance/aggregate.ts`), and the
 * two halves of a smoke tier (`balance/synthesize.ts`, `balance/smoke.ts`).
 * Everything else in `packages/sim/src` is named here with its reason, and
 * `balance-rig.test.ts` enforces that the two sets are exhaustive — a new sim
 * module cannot land unclassified.
 *
 * The line drawn is MEASURE vs REPORT. A file that reads artefacts and prints
 * about them cannot change a number, so hashing it would only add churn.
 */
export const SIM_NON_INSTRUMENT_SOURCES: Readonly<Record<string, string>> = {
  'protocol.ts':
    'The UGT protocol adapter — an external-client surface. `runCampaign` never calls it, so ' +
    'no sweep or smoke number can depend on it.',
  'protocol-stdio.ts': 'The stdio wrapper around the above. Transport, not measurement.',
  'balance/sweep.ts':
    'The I/O half of the sweep (argv, sharding, file writes). The arithmetic it invokes lives ' +
    'in `balance/aggregate.ts`, which IS hashed — the T-1602b pure/IO split, used here to keep ' +
    'the hash on the pure side.',
  'balance/diff.ts': 'Reads two finished aggregates and reports. It cannot produce a number.',
  'balance/diff-cli.ts': 'The argv/filesystem half of the above.',
  'balance/resolve-artifact.ts':
    'One path rule shared by the two CLIs above. Filesystem plumbing; it resolves where an ' +
    'artefact lives, never what is in it.',
  'balance/smoke-extract.ts':
    'The argv/filesystem half of the extractor. Same split, same reason as `balance/sweep.ts`.',
  'balance/checkpoints.ts':
    'The extractor. It transcribes measurements into a fixture; the measuring is done by the ' +
    'hashed files above. A change here alters the SHAPE of a fixture, which the schema check ' +
    'catches directly rather than via a hash.',
  'balance/rules-fingerprint.ts':
    'This file. It classifies sources; it neither plays a career nor scores one. Self-inclusion ' +
    'would also invalidate every fixture on a comment edit here — churn with no signal in it.',
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export interface HashedSource {
  /** Repo-relative, POSIX-separated, so a Windows and a macOS checkout of the
   *  same commit produce the same fingerprint. */
  path: string;
  sha256: string;
}

export interface SourceFingerprint {
  /** 16 hex chars of a sha256 over the manifest — the same width as the report
   *  fingerprints in `campaign-degraded.test.ts`, for the same reason: long
   *  enough that a collision is not a practical concern, short enough to read in
   *  a failure message. */
  fingerprint: string;
  fileCount: number;
  files: HashedSource[];
}

function listTsFiles(directory: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    throw new Error(`Rule-source directory missing: ${directory}`);
  }
  return entries.filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts')).sort();
}

function toPosix(relative: string): string {
  return relative.split(sep).join(posix.sep);
}

/**
 * Line endings are normalised before hashing. A CRLF checkout is the same
 * ruleset as an LF one, and this repo is developed on both (the sweep header's
 * runtime budget was measured on Windows). A fingerprint that moved when someone
 * cloned on a different OS would train readers to ignore it.
 */
function readNormalised(absolute: string): string {
  return readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n');
}

/** The RAW hash — every byte, comments included. Feeds `docsFingerprint` only. */
function hashRaw(absolute: string): string {
  return createHash('sha256').update(readNormalised(absolute)).digest('hex');
}

const SEMANTIC_PRINTER = ts.createPrinter({ removeComments: true });

/**
 * THE SEMANTIC HASH — comments stripped before hashing, which is the whole of
 * the N7-FP fix (2026-07-29).
 *
 * WHY THIS CHANGED. `docs/VERSIONING.md` §3 defines this hash as one "over the
 * files that decide outcomes", answering *"is this measurement still about the
 * game we are shipping?"* Hashing raw bytes answered a broader question — "has
 * any byte of these files changed?" — so a comment edit made it answer NO when
 * the truth was YES. That is a FALSE POSITIVE, and it was not free: the trigger
 * case was a documentation audit correcting two wrong figures in
 * `content/ports.ts` (a payback range understated 2.2x, and an invariant that had
 * stopped being true). Comment-only, provably inert — an 8-shard capstone on the
 * edited tree against clean HEAD, identical seeds, diffed to "NOTHING MOVED" —
 * and it still cost a full re-stamp. Content here is deliberately comment-dense
 * (`ports.ts` carries ~180 lines of commentary over ~120 lines of data), so the
 * old rule taxed exactly the activity that keeps the commentary true, which is
 * how those two figures survived as long as they did. This file's own header
 * already made the argument in miniature: it excludes itself because
 * self-inclusion "would invalidate every fixture on a comment edit here — churn
 * with no signal in it". The same reasoning applies to every hashed source.
 *
 * WHY AN AST AND NOT A REGEX. `//` and `/* ... *\/` occur inside string literals
 * in this codebase (URLs, printed banners), so text-stripping would corrupt real
 * code and silently change the hash for the wrong reason. The TypeScript parser
 * is the only thing that knows the difference. Re-printing also normalises quote
 * style and layout, so a Prettier pass cannot move a rules fingerprint either —
 * correct for the same reason.
 *
 * THE COST, STATED PLAINLY: the printer's output can change across TypeScript
 * MAJOR versions, which would move every fingerprint at once on a dependency
 * bump. That is a loud, one-time, obviously-attributable failure rather than a
 * silent one, and the remedy is the same re-stamp. It is a deliberate trade of a
 * rare loud false positive for a frequent quiet one. `typescript` is pinned at
 * ^5.4 in this package; treat a major bump as a re-stamp event.
 *
 * WHAT THIS DOES NOT WEAKEN: any change to code — a constant, an operator, an
 * import, a rename — changes the printed output and still moves the hash. The
 * pair of rig tests in `balance-rig.test.ts` pins BOTH directions, so this
 * property cannot rot.
 */
function hashSemantic(absolute: string): string {
  const source = ts.createSourceFile(
    absolute,
    readNormalised(absolute),
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TS,
  );
  return createHash('sha256').update(SEMANTIC_PRINTER.printFile(source)).digest('hex');
}

function fingerprintOf(files: HashedSource[]): string {
  const manifest = createHash('sha256');
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    // The PATH is hashed alongside the content, so renaming a rule module moves
    // the fingerprint even when not one byte of logic changed. A rename can
    // absolutely change behaviour (import order, module init) and, more simply,
    // a fixture should not claim to describe a tree it cannot be matched to.
    manifest.update(`${file.path} ${file.sha256}\n`);
  }
  return manifest.digest('hex').slice(0, 16);
}

function collect(
  repoRoot: string,
  packageDir: string,
  subdirectories: readonly string[],
  excluded: Readonly<Record<string, string>>,
  hash: (absolute: string) => string = hashSemantic,
): SourceFingerprint {
  const files: HashedSource[] = [];
  for (const subdirectory of subdirectories) {
    const absoluteDir = join(repoRoot, packageDir, subdirectory);
    for (const name of listTsFiles(absoluteDir)) {
      const key = subdirectory === '' ? name : `${subdirectory}/${name}`;
      if (key in excluded) continue;
      files.push({
        path: toPosix(join(packageDir, subdirectory, name)),
        sha256: hash(join(absoluteDir, name)),
      });
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { fingerprint: fingerprintOf(files), fileCount: files.length, files };
}

/** Every hashed rule source, engine + content, repo-relative and sorted. Exposed
 *  so a failure message and a reviewer can both see the exact input set rather
 *  than being handed an opaque hash. */
export function ruleSources(
  repoRoot: string = REPO_ROOT,
  hash: (absolute: string) => string = hashSemantic,
): HashedSource[] {
  const engine = collect(
    repoRoot,
    join('packages', 'engine', 'src'),
    ENGINE_RULE_DIRECTORIES,
    ENGINE_NON_RULE_SOURCES,
    hash,
  );
  const content = collect(
    repoRoot,
    join('packages', 'content', 'src'),
    [''],
    { ...CONTENT_NON_RULE_SOURCES },
    hash,
  );
  return [...engine.files, ...content.files].sort((a, b) => a.path.localeCompare(b.path));
}

/** THE fingerprint: `packages/content/src` plus the engine's rule modules,
 *  hashed SEMANTICALLY (comments stripped — see `hashSemantic`). */
export function computeRulesFingerprint(repoRoot: string = REPO_ROOT): SourceFingerprint {
  const files = ruleSources(repoRoot);
  return { fingerprint: fingerprintOf(files), fileCount: files.length, files };
}

/** The measuring device: `packages/sim/src`. See `SIM_NON_INSTRUMENT_SOURCES`
 *  for why this is a second number and not part of the first. Semantic, for the
 *  same reason as the rules hash. */
export function computeInstrumentFingerprint(repoRoot: string = REPO_ROOT): SourceFingerprint {
  return collect(
    repoRoot,
    join('packages', 'sim', 'src'),
    SIM_INSTRUMENT_DIRECTORIES,
    SIM_NON_INSTRUMENT_SOURCES,
  );
}

/**
 * THE DOCS FINGERPRINT — raw bytes over every hashed source, rules AND
 * instrument, so the commentary state of the measured tree stays recorded.
 *
 * WHY THIS EXISTS RATHER THAN JUST DELETING THE BYTE HASH. Making the two hashes
 * above semantic removes a false alarm, but it also silently discards a true
 * fact: that the prose describing a ruleset moved. That fact has real diagnostic
 * value — "the numbers are from the same game, but the explanation of them was
 * rewritten in between" is exactly the thing a reader chasing a stale comment
 * wants to know. So it is KEPT, and merely demoted.
 *
 * IT MUST NEVER FAIL A TEST. It is reported by `fixtureFreshness` as an
 * informational note and is not a `FreshnessProblem`; a fixture whose docs hash
 * has moved is still perfectly fresh, because comments decide no outcomes. If
 * this is ever promoted to a failing check, the false positive it was created to
 * remove comes straight back.
 */
export function computeDocsFingerprint(repoRoot: string = REPO_ROOT): SourceFingerprint {
  const rules = ruleSources(repoRoot, hashRaw);
  const instrument = collect(
    repoRoot,
    join('packages', 'sim', 'src'),
    SIM_INSTRUMENT_DIRECTORIES,
    SIM_NON_INSTRUMENT_SOURCES,
    hashRaw,
  ).files;
  const files = [...rules, ...instrument].sort((a, b) => a.path.localeCompare(b.path));
  return { fingerprint: fingerprintOf(files), fileCount: files.length, files };
}

/** Every `.ts` under a package's hashed directories, INCLUDING the excluded
 *  ones — the input `balance-rig.test.ts` uses to prove the classification is
 *  total. */
export function allSourceKeys(
  repoRoot: string,
  packageDir: string,
  subdirectories: readonly string[],
): string[] {
  const keys: string[] = [];
  for (const subdirectory of subdirectories) {
    for (const name of listTsFiles(join(repoRoot, packageDir, subdirectory))) {
      keys.push(subdirectory === '' ? name : `${subdirectory}/${name}`);
    }
  }
  return keys.sort();
}

export const ENGINE_SOURCE_ROOT = join('packages', 'engine', 'src');
export const CONTENT_SOURCE_ROOT = join('packages', 'content', 'src');
export const SIM_SOURCE_ROOT = join('packages', 'sim', 'src');
export const ENGINE_HASHED_DIRECTORIES = ENGINE_RULE_DIRECTORIES;
export const CONTENT_HASHED_DIRECTORIES = [''] as const;
export const SIM_HASHED_DIRECTORIES = SIM_INSTRUMENT_DIRECTORIES;
