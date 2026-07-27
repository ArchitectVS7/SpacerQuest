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

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', '..', 'ui', 'dist-web');
const DEST = join(here, '..', 'renderer');

if (!existsSync(join(SRC, 'index.html'))) {
  console.error(
    `[copy-renderer] No cockpit bundle at ${SRC}.\n` +
      `                Build it first: npm run build -w @spacerquest/ui`,
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

console.log(`[copy-renderer] ${countFiles(DEST)} files -> ${DEST}`);
