// ---------------------------------------------------------------------------
// T-1703 · Gate the demo package on its distributable size.
//
// Runs as the LAST step of `package:win:demo` / `package:mac:demo`, so a demo
// that grew past the budget fails the packaging command rather than being
// discovered on a storefront. It carries NO POLICY of its own: the budget and the
// predicate live in `../dist/size.js` (compiled from `src/size.ts`, unit-tested),
// and this script only measures and reports.
//
// WHAT IT MEASURES, and why: the DISTRIBUTABLE artifacts in `release-demo/` —
// `.exe`, `.dmg`, `.zip`, `.AppImage` — never the unpacked tree. The full
// argument is at `DEMO_MAX_DISTRIBUTABLE_BYTES`'s definition site; the short
// version is that the unpacked tree is ~216 MB of Chromium that is never
// transferred in that form.
//
// Node, not shell: the dev machine is win32 and CI runs macOS and Windows.
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_MAX_DISTRIBUTABLE_BYTES, formatMegabytes, overBudget } from '../dist/size.js';

const here = dirname(fileURLToPath(import.meta.url));
const RELEASE_DIR = join(here, '..', 'release-demo');

/** electron-builder's distributable extensions. `.blockmap` is metadata, and the
 *  `*-unpacked` / `mac*` directories are staging, so neither is a download. */
const DISTRIBUTABLE_EXTENSIONS = new Set(['.exe', '.dmg', '.zip', '.appimage', '.deb', '.snap']);

if (!existsSync(RELEASE_DIR)) {
  console.error(
    `[check-size] No demo release at ${RELEASE_DIR}.\n` +
      `             Build it first: npm run package:win:demo (or package:mac:demo)`,
  );
  process.exit(1);
}

const artifacts = readdirSync(RELEASE_DIR)
  .filter((name) => DISTRIBUTABLE_EXTENSIONS.has(extname(name).toLowerCase()))
  .map((name) => ({ name, bytes: statSync(join(RELEASE_DIR, name)).size }))
  .sort((a, b) => b.bytes - a.bytes);

if (artifacts.length === 0) {
  // Loud, not lenient: "no artifact found" must never read as "the size is fine".
  console.error(
    `[check-size] No distributable artifact in ${RELEASE_DIR} ` +
      `(looked for ${[...DISTRIBUTABLE_EXTENSIONS].join(', ')}).`,
  );
  process.exit(1);
}

let failed = false;
for (const { name, bytes } of artifacts) {
  const bad = overBudget(bytes);
  failed = failed || bad;
  console.log(
    `[check-size] ${bad ? 'OVER  ' : 'ok    '} ${formatMegabytes(bytes).padStart(9)}  ${name}`,
  );
}

console.log(`[check-size] budget ${formatMegabytes(DEMO_MAX_DISTRIBUTABLE_BYTES)} per artifact`);
if (failed) process.exit(1);
