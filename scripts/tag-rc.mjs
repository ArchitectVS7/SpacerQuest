#!/usr/bin/env node
// ---------------------------------------------------------------------------
// T-1704 · "RC TAG BUILDS GREEN FROM CLEAN CLONE" — the ceremony, as one command.
//
//   node scripts/tag-rc.mjs [--tag <name>] [--with-electron] [--keep]
//   npm run release:rc
//
// `scripts/verify-clean-clone.mjs` already answers "does <ref> build green from
// nothing?". What was missing was the step that MAKES the ref: the tag itself
// was written down as a question for the user ("shall the orchestrator run
// `git tag -a`?") rather than built, and the only transcript on record was taken
// against the commit PRECEDING this task — a tree the tag will never point at,
// which is evidence about the wrong thing. This file closes that gap. It is the
// whole ceremony, in order, with the two refusals that make it trustworthy.
//
// ORDER, AND WHY IT IS THIS ORDER:
//
//   1. SIGN-OFF FIRST. `docs/RELEASE-CHECKLIST.md` says "A release is not signed
//      off while §G has blanks", so this refuses to tag while any waiver is
//      unanswered. That sentence is the checklist's own definition of done, and
//      the tag is the artifact the definition is ABOUT; letting a tag exist
//      first would make the sentence decorative. There is deliberately NO
//      override flag — a `--force` here would be a self-waiver with a command
//      line, and the one thing this task must not do is grant its own waivers.
//   2. CLEAN TREE. A tag names a commit, and a commit does not contain
//      uncommitted work. Tagging from a dirty tree produces a tag whose green
//      build cannot be reproduced by the person who clones it — which is the
//      exact failure `verify-clean-clone.mjs` was written to catch, arriving one
//      step earlier.
//   3. TAG. Annotated (`-a`), never lightweight: an annotated tag carries an
//      author, a date and a message, and is what `git describe` and every
//      release tool treat as a release marker.
//   4. VERIFY. `verify-clean-clone.mjs --ref <tag>` — clone, checkout the TAG
//      (not HEAD, not a branch), `npm ci` → `tsc -b` → lint → format:check →
//      test.
//
// IT NEVER PUSHES, and it prints the push command instead. Pushing writes to
// someone else's remote; that is the user's act, and no script in this repo
// takes it unprompted. Everything up to the push is mechanical, so what is left
// for a human is one line they can read before they run it.
//
// A RED TREE LEAVES NO TAG BEHIND. If this run created the tag and the clean
// clone then failed, the tag is deleted again — an `v1.0.0-rc1` pointing at a
// tree that does not build is worse than no tag, because it is a claim. A tag
// that already existed before this run is never touched, and one that exists
// pointing SOMEWHERE ELSE is a refusal rather than a move: silently re-pointing
// a release tag is how two people end up building different "same" releases.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { openSignOffItems, defaultDocPath } from './check-signoff.mjs';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Capture stdout of a command that is expected to succeed. */
function capture(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

/**
 * Run a command, streaming output. Returns its exit code.
 *
 * NO `shell: true`, unlike `verify-clean-clone.mjs` — and the difference is
 * load-bearing rather than an inconsistency. That file has to shell out because
 * `npm` and `npx` are `.cmd` shims on win32 that `spawnSync` cannot resolve
 * otherwise; this one only ever runs `git` and this same Node binary, both real
 * executables. Going through `cmd.exe` here cost a run: `-m "Rimward 1.0.0
 * release candidate 1"` was re-split by the shell and git answered `fatal: too
 * many arguments`. An argv array is passed through untouched, so the tag message
 * keeps its spaces on every platform.
 */
function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  if (result.error) {
    console.error(`  ! ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

/**
 * The tag this repository releases as.
 *
 * DERIVED from the root manifest, never typed: `version.test.ts` already pins
 * all six manifests to one version and pins the doc's tag to that same version,
 * so deriving here means the tag cannot drift from the number the cockpit shows
 * a player at Settings → Build → Version. The `-rc1` suffix is the part that is
 * NOT in the manifests, and `version.ts` records why (NSIS wants an `x.y.z`
 * triple, and the packaged-shell specs assert one).
 */
export function rcTagName(rootManifestJson) {
  const { version } = JSON.parse(rootManifestJson);
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Root package.json has no x.y.z version (got ${String(version)})`);
  }
  return { version, tag: `v${version}-rc1` };
}

function parseArgs(argv) {
  const opts = { tag: null, withElectron: false, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--tag') {
      const value = argv[i + 1];
      if (!value) throw new Error('--tag needs a value');
      opts.tag = value;
      i += 1;
    } else if (arg === '--with-electron') {
      opts.withElectron = true;
    } else if (arg === '--keep') {
      opts.keep = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { version, tag: derived } = rcTagName(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const tag = opts.tag ?? derived;

  console.log('='.repeat(72));
  console.log('T-1704 · release candidate');
  console.log(`  version  ${version}`);
  console.log(`  tag      ${tag}`);
  console.log('='.repeat(72));

  // --- 1. Sign-off ---------------------------------------------------------
  const report = openSignOffItems(readFileSync(defaultDocPath(), 'utf8'));
  if (report.missing.length > 0 || report.open.length > 0) {
    console.error('\n--- sign-off ---');
    for (const id of report.missing) console.error(`  MISSING FROM §G  ${id}`);
    for (const row of report.open)
      console.error(`  UNANSWERED       ${row.id.padEnd(4)} ${row.question}`);
    fail(
      `NOT SIGNED OFF: ${report.open.length + report.missing.length} item(s) still need the user.\n` +
        'Record each answer verbatim in docs/RELEASE-CHECKLIST.md §G, then run this again.\n' +
        'There is no override flag on purpose — see the header of this file.',
    );
  }
  console.log(`\n  sign-off   OK (${report.signOff.length} waivers, all answered)`);

  // --- 2. Clean tree -------------------------------------------------------
  const dirty = capture('git', ['status', '--porcelain']);
  if (dirty.length > 0) {
    console.error(`\n${dirty}`);
    fail('WORKING TREE IS DIRTY. Commit or stash first — a tag names a commit.');
  }
  const head = capture('git', ['rev-parse', 'HEAD']);
  console.log(`  tree       clean at ${head.slice(0, 8)}`);

  // --- 3. Tag --------------------------------------------------------------
  const existing = spawnSync('git', ['rev-parse', '-q', '--verify', `refs/tags/${tag}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  let created = false;
  if (existing.status === 0) {
    const at = capture('git', ['rev-list', '-n', '1', tag]);
    if (at !== head) {
      fail(
        `TAG ${tag} ALREADY EXISTS at ${at.slice(0, 8)}, which is not HEAD (${head.slice(0, 8)}).\n` +
          'Refusing to move a release tag: two people would then build different "same" releases.\n' +
          `Delete it deliberately (\`git tag -d ${tag}\`) if that is really what you want.`,
      );
    }
    console.log(`  tag        ${tag} already at HEAD — re-verifying`);
  } else {
    if (run('git', ['tag', '-a', tag, '-m', `Rimward ${version} release candidate 1`]) !== 0) {
      fail(`Could not create the annotated tag ${tag}.`);
    }
    created = true;
    console.log(`  tag        ${tag} created (annotated, local only)`);
  }

  // --- 4. Verify -----------------------------------------------------------
  const verifyArgs = ['scripts/verify-clean-clone.mjs', '--ref', tag];
  if (opts.withElectron) verifyArgs.push('--with-electron');
  if (opts.keep) verifyArgs.push('--keep');

  console.log(`\n--- node ${verifyArgs.join(' ')} ---\n`);
  // `process.execPath`, not the string `node`: the ceremony must run under the
  // same Node that started it, not whatever a PATH lookup happens to find.
  const code = run(process.execPath, verifyArgs);

  if (code !== 0) {
    if (created) {
      run('git', ['tag', '-d', tag]);
      console.error(`\n${tag} DELETED — it was created by this run and the clean clone failed.`);
      console.error('A tag pointing at a tree that does not build is a false claim, not a marker.');
    }
    fail('RELEASE CANDIDATE REJECTED.');
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log(`${tag} is GREEN from a clean clone.`);
  console.log('');
  console.log('This script does not push. The remote is yours; run this when you agree:');
  console.log(`  git push origin ${tag}`);
  console.log('');
  console.log('Then confirm the four CI jobs on that commit and record them in the');
  console.log("task's Delivered note (TASKS.md, CI-evidence rule) and §E6.");
  console.log('='.repeat(72));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
