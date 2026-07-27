// ---------------------------------------------------------------------------
// T-1701b · Stage the built cockpit into the Electron package.
//
// `packages/ui/dist-web` (vite's bundle — the SAME artifact the web e2e suite
// tests) is copied to `packages/desktop/renderer`, which `main.ts` serves over
// the `app://` scheme when packaged and electron-builder includes via its
// `files` list.
//
// A COPY rather than an electron-builder `extraResources`/`from` mapping,
// because `main.ts` must resolve one path (`__dirname/../renderer`) that means
// the same thing inside and outside the asar — and because the copy is the step
// that can FAIL LOUDLY when the cockpit was never built.
//
// Node, not shell: the dev machine is win32 and CI runs macOS and Windows. No
// `cp -r`, no `rm -rf`, no path separators assumed.
// ---------------------------------------------------------------------------

import { cpSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// T-1703 · `--edition demo` stages the DEMO bundle instead. Two source
// directories, two destinations, one script — because the staging step is
// identical and a second copy of it is a second place to forget the loud failure
// below. The shell itself never learns what an edition is (see `main.ts`'s
// RENDERER_DIR): only one of the two destinations exists in any given package,
// and `electron-builder.demo.json`'s `files` list picks which.
const here = dirname(fileURLToPath(import.meta.url));
const editionIndex = process.argv.indexOf('--edition');
const edition = editionIndex >= 0 ? process.argv[editionIndex + 1] : 'full';
if (edition !== 'full' && edition !== 'demo') {
  console.error(`[copy-renderer] Unknown --edition "${edition}" (expected "full" or "demo").`);
  process.exit(1);
}
const demo = edition === 'demo';
const SRC = join(here, '..', '..', 'ui', demo ? 'dist-demo' : 'dist-web');
const DEST = join(here, '..', demo ? 'renderer-demo' : 'renderer');

if (!existsSync(join(SRC, 'index.html'))) {
  console.error(
    `[copy-renderer] No cockpit bundle at ${SRC}.\n` +
      `                Build it first: npm run build${demo ? ':demo' : ''} -w @spacerquest/ui`,
  );
  process.exit(1);
}

// Wipe first: a stale asset left behind from an older bundle would be shipped
// inside the package and served over `app://` forever.
rmSync(DEST, { recursive: true, force: true });
cpSync(SRC, DEST, { recursive: true });

function countFiles(dir) {
  let n = 0;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    n += statSync(full).isDirectory() ? countFiles(full) : 1;
  }
  return n;
}

console.log(`[copy-renderer] ${edition}: ${countFiles(DEST)} files -> ${DEST}`);
