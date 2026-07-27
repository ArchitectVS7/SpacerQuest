#!/usr/bin/env node
// ---------------------------------------------------------------------------
// T-1704 · "RC TAG BUILDS GREEN FROM A CLEAN CLONE" — the mechanism, not a claim.
//
// The Accept for T-1704 is the only one in this task list that is about the
// REPOSITORY rather than about the game, and it cannot be discharged from inside
// the working tree: a tree that has been developed in has a warm `node_modules`,
// stale `dist/` output and `*.tsbuildinfo` files that can make a build pass for
// reasons a fresh machine would not reproduce. So this script clones the repo
// into a throwaway directory and runs the gate there, from nothing.
//
//   node scripts/verify-clean-clone.mjs [--ref <ref>] [--with-electron] [--keep]
//
// `git clone --no-local` is DELIBERATE and is the whole point of the file: the
// default local clone hardlinks `.git` objects and would still be a clone, but
// `--no-local` forces the real transport path, so what is verified is what a
// `git clone <url>` on someone else's machine would get. The working tree and
// `node_modules` are new either way — nothing from this checkout leaks in.
//
// STEPS, in order, and they are exactly the repo's gate as `TASKS.md` states it:
//   npm ci → npx tsc -b → npm run lint → npm run format:check → npm test
//
// PLAYWRIGHT SUITES ARE DELIBERATELY NOT RUN HERE. They need a browser download
// (`npx playwright install`) and, for the desktop suites, an Electron binary and
// a display server — a "clean clone" check that pulled ~500 MB of browsers would
// stop being run, and a check nobody runs proves nothing. The e2e, desktop and
// packaged evidence is the CI matrix in `.github/workflows/ci.yml`, which runs
// all four jobs against the pushed commit (and therefore against the tagged
// commit); `docs/RELEASE-CHECKLIST.md` §E records both halves.
//
// `ELECTRON_SKIP_BINARY_DOWNLOAD=1` is set for `npm ci` BY DEFAULT, and the
// reason is that this mirrors CI's `Build, lint, test` job exactly: that job sets
// the same variable, because `npx tsc -b` needs only the `electron.d.ts` that
// ships inside the npm package and `npm test` launches no shell at all (the
// shell's own unit suite deliberately imports no `electron` — structurally
// pinned by `packages/desktop/src/__tests__/saveStore.test.ts`). `--with-electron`
// opts back in for anyone who wants the ~100 MB download proved too.
//
// The temp directory is REMOVED on success and KEPT (with its path printed) on
// failure — a failed clean-clone run is exactly when someone needs to go and look
// at the tree that failed.
// ---------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function parseArgs(argv) {
  const opts = { ref: 'HEAD', withElectron: false, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--ref') {
      const value = argv[i + 1];
      if (!value) throw new Error('--ref needs a value (a branch, tag or commit sha)');
      opts.ref = value;
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

const WIN = process.platform === 'win32';

/**
 * Quote an argument for the win32 shell hop.
 *
 * `shell: true` (below) means `spawnSync` hands ONE command line to `cmd.exe`
 * instead of an argv array, so any argument containing a space is re-split by the
 * shell. That bit once already — a `--pretty=%h %s` reached git as two arguments
 * — and it would bite again on a temp path under `C:\Users\First Last\`. A no-op
 * off win32, where the argv array is passed through untouched.
 */
function shellArg(arg) {
  if (!WIN || !/[\s"]/.test(arg)) return arg;
  return `"${arg.replace(/"/g, '\\"')}"`;
}

function shellArgs(args) {
  return WIN ? args.map(shellArg) : args;
}

/** Run a command, streaming its output. Returns the exit code (0 = pass).
 *
 *  `shell: true` on win32 because `npm` and `npx` are `.cmd` shims there and
 *  `spawnSync` will not resolve them otherwise — the same portability rule
 *  `packages/desktop/scripts/*.mjs` follows for path separators. */
function run(cmd, args, cwd, env) {
  const result = spawnSync(cmd, shellArgs(args), {
    cwd,
    stdio: 'inherit',
    shell: WIN,
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(`  ! ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

/** Capture stdout of a command that is expected to succeed. */
function capture(cmd, args, cwd) {
  const result = spawnSync(cmd, shellArgs(args), {
    cwd,
    encoding: 'utf8',
    shell: WIN,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function seconds(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  // Resolve the ref IN THE SOURCE REPO first, so the clone checks out an exact
  // commit. `--ref HEAD` against a checkout that is mid-task therefore verifies
  // the last COMMIT, never the dirty working tree — which is the honest reading
  // of "builds green from a clean clone" and is stated here so a transcript
  // recorded during development cannot be mistaken for one recorded on the tag.
  const sha = capture('git', ['rev-parse', opts.ref], REPO_ROOT);
  const described = capture('git', ['log', '-1', '--pretty=%h %s', sha], REPO_ROOT);

  const dest = mkdtempSync(join(tmpdir(), 'sq-clean-clone-'));
  const tree = join(dest, 'repo');

  console.log('='.repeat(72));
  console.log('T-1704 · clean-clone verification');
  console.log(`  source   ${REPO_ROOT}`);
  console.log(`  ref      ${opts.ref} -> ${sha}`);
  console.log(`  commit   ${described}`);
  console.log(`  clone    ${tree}`);
  console.log(`  electron ${opts.withElectron ? 'downloaded' : 'skipped (mirrors CI)'}`);
  console.log('='.repeat(72));

  const ciEnv = opts.withElectron ? {} : { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' };

  const steps = [
    {
      name: 'git clone --no-local',
      cmd: 'git',
      args: ['clone', '--no-local', REPO_ROOT, tree],
      cwd: dest,
    },
    {
      name: `git checkout ${sha}`,
      cmd: 'git',
      args: ['-C', tree, 'checkout', '--detach', sha],
      cwd: dest,
    },
    { name: 'npm ci', cmd: 'npm', args: ['ci'], cwd: tree, env: ciEnv },
    { name: 'npx tsc -b', cmd: 'npx', args: ['tsc', '-b'], cwd: tree },
    { name: 'npm run lint', cmd: 'npm', args: ['run', 'lint'], cwd: tree },
    { name: 'npm run format:check', cmd: 'npm', args: ['run', 'format:check'], cwd: tree },
    { name: 'npm test', cmd: 'npm', args: ['test'], cwd: tree },
  ];

  const transcript = [];
  const startedAll = Date.now();
  let failed = null;

  for (const step of steps) {
    console.log(`\n--- ${step.name} ---`);
    const started = Date.now();
    const code = run(step.cmd, step.args, step.cwd, step.env);
    const took = Date.now() - started;
    transcript.push({ name: step.name, ok: code === 0, took });
    if (code !== 0) {
      failed = step.name;
      break;
    }
  }

  const total = Date.now() - startedAll;

  console.log(`\n${'='.repeat(72)}`);
  for (const line of transcript) {
    console.log(`  ${line.ok ? 'PASS' : 'FAIL'}  ${line.name.padEnd(28)} ${seconds(line.took)}`);
  }
  for (const step of steps.slice(transcript.length)) {
    console.log(`  SKIP  ${step.name}`);
  }
  console.log(`  total ${seconds(total)}`);
  console.log('='.repeat(72));

  if (failed) {
    console.error(`\nFAILED at: ${failed}`);
    console.error(`Clone kept for inspection: ${tree}`);
    process.exit(1);
  }

  if (opts.keep) {
    console.log(`\nGREEN. Clone kept (--keep): ${tree}`);
  } else {
    rmSync(dest, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    console.log('\nGREEN. Clone removed.');
  }
}

main();
