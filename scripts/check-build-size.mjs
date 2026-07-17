#!/usr/bin/env node
// ============================================================================
//  T-1703 · Demo build size gate — assert the shippable DISTRIBUTABLE is < 200MB
// ============================================================================
//
// De-risking finding (T-1703 plan): the packaged `.app` is ~244MB UNCOMPRESSED,
// dominated by the shared Electron framework the demo cannot shrink — but that is not
// what ships. The honest reading of "build size sane (<200MB)" is the COMPRESSED
// distributable the player downloads (dmg / zip / Steam depot payload), which measures
// ~97MB. So this script asserts on the compressed artifact, never the raw `.app`:
//
//   • If a `.dmg` exists under release-demo/, stat it directly (already compressed).
//   • Otherwise compress the packaged `.app` (ditto -c -k, the same codec a zip depot
//     upload uses) and stat that.
//
// Exit non-zero (failing CI) when the artifact is >= the limit or when no packaged demo
// app is found (the CI demo job packages it first via `package:demo:dir`).

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT_BYTES = 200 * 1024 * 1024; // 200MB — the "build size sane" bar
const here = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = path.resolve(here, '../packages/desktop/release-demo');

function fail(msg) {
  console.error(`check-build-size: FAIL — ${msg}`);
  process.exit(1);
}

function fmtMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

if (!fs.existsSync(RELEASE_DIR)) {
  fail(
    `no demo release dir at ${RELEASE_DIR}. Run \`npm run package:demo:dir -w @spacerquest/desktop\` first.`,
  );
}

/** Recursively find the first file matching a predicate under a dir. */
function findFirst(dir, pred) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        if (pred(full, true)) return full;
        continue; // do not descend into the app bundle
      }
      const nested = findFirst(full, pred);
      if (nested) return nested;
    } else if (pred(full, false)) {
      return full;
    }
  }
  return null;
}

// Prefer a real distributable (dmg / zip) if the packager produced one.
const dmg = findFirst(RELEASE_DIR, (p, isDir) => !isDir && p.endsWith('.dmg'));
const zip = findFirst(RELEASE_DIR, (p, isDir) => !isDir && p.endsWith('.zip'));
const distributable = dmg ?? zip;

let artifactPath;
let artifactLabel;
let cleanup = null;

if (distributable) {
  artifactPath = distributable;
  artifactLabel = path.basename(distributable);
} else {
  // No installer — compress the packaged `.app` to measure the shippable size.
  const app = findFirst(RELEASE_DIR, (p, isDir) => isDir && p.endsWith('.app'));
  if (!app) fail(`no .dmg, .zip, or .app under ${RELEASE_DIR}.`);
  const tmpZip = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sq-demo-size-')), 'demo.zip');
  try {
    // `ditto -c -k` is the macOS zip codec (same as a zip depot upload). On a non-mac
    // box this throws — the size gate is a macOS CI step, mirroring the desktop job.
    execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, tmpZip]);
  } catch (err) {
    fail(`could not compress ${app}: ${err instanceof Error ? err.message : String(err)}`);
  }
  artifactPath = tmpZip;
  artifactLabel = `${path.basename(app)} (compressed)`;
  cleanup = tmpZip;
}

const bytes = fs.statSync(artifactPath).size;
if (cleanup) {
  try {
    fs.rmSync(path.dirname(cleanup), { recursive: true, force: true });
  } catch {
    /* best-effort temp cleanup */
  }
}

if (bytes >= LIMIT_BYTES) {
  fail(`${artifactLabel} is ${fmtMB(bytes)} — over the ${fmtMB(LIMIT_BYTES)} limit.`);
}

console.log(
  `check-build-size: OK — ${artifactLabel} is ${fmtMB(bytes)} (< ${fmtMB(LIMIT_BYTES)}).`,
);
