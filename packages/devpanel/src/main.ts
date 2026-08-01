/**
 * T-143 · THE DEV CONTROL PANEL ENTRY POINT — `npm run dev:panel`.
 *
 * ============================================================================
 * THIS PROCESS IS DEV-ONLY AND MUST NEVER BE SHIPPED.
 *
 * It spawns arbitrary balance CLIs as child processes on the machine that runs
 * it. It has no place in a packaged game, a `dist-web` bundle, or an
 * electron-builder `files` list, and it must never be imported — not even
 * `import type` — by `packages/ui` or `packages/desktop`.
 *
 * That is enforced three ways rather than asserted once:
 *   - `@spacerquest/devpanel` is listed as a dependency of NO other workspace, so
 *     nothing in the game can resolve it.
 *   - `packages/desktop`'s two electron-builder configs ship only that package's
 *     own `dist` and staged `renderer` trees; no `packages/` glob exists in
 *     either. There is nothing to remove, and `__tests__/not-shipped.test.ts`
 *     re-reads both configs on every run in case that ever changes.
 *   - {@link PANEL_ENTRY_TOKEN} below is a deliberately unique grep needle. The
 *     §6 acceptance criterion ("a grep for the panel's entry point under
 *     packages/desktop's packaging config and any production build output returns
 *     nothing") is therefore something a test can ASSERT rather than something a
 *     reviewer has to eyeball.
 * ============================================================================
 *
 * Guarded exactly as `packages/sim/src/balance/sweep.ts` guards its own CLI:
 * importing this module (or type-checking it) must never open a port.
 */

import type { Server } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPanelServer, LOOPBACK_HOST } from './server.js';

/**
 * THE GREP NEEDLE for §6's packaging criterion. Unique on purpose: it appears in
 * this file and in the test that asserts its absence everywhere else, and
 * nowhere in any build output.
 */
export const PANEL_ENTRY_TOKEN = 'SPACERQUEST_DEV_PANEL_ENTRY';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** §3's location, under a `.gitignore` rule that already exists (`.scratch/`). */
export const PANEL_RUNS_ROOT = join(REPO_ROOT, '.scratch', 'balance', 'panel-runs');

export const DEFAULT_PORT = 7343;

/**
 * Returns the listening server rather than swallowing it, so
 * `__tests__/not-shipped.test.ts` can assert on the ADDRESS IT ACTUALLY BOUND —
 * the §4 "no external network exposure" property proved at runtime instead of by
 * reading the argument list below.
 *
 * `--port 0` is accepted and means "let the OS choose", which is what that test
 * uses; a fixed port would make it flaky the day something else holds it.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): Server | undefined {
  const portIndex = argv.indexOf('--port');
  const port = portIndex === -1 ? DEFAULT_PORT : Number(argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`--port must be an integer 0-65535 (0 = OS-assigned)\n`);
    process.exitCode = 1;
    return undefined;
  }
  const { server } = createPanelServer({ repoRoot: REPO_ROOT, runsRoot: PANEL_RUNS_ROOT });
  // The host argument is NOT OPTIONAL. Node's default binds every interface,
  // which would publish a "run any of these commands" button to the LAN.
  server.listen(port, LOOPBACK_HOST, () => {
    process.stdout.write(
      `[devpanel] ${PANEL_ENTRY_TOKEN} listening on http://${LOOPBACK_HOST}:${String(port)}\n` +
        `[devpanel] repo root ${REPO_ROOT}\n` +
        `[devpanel] runs land in ${PANEL_RUNS_ROOT} (gitignored)\n` +
        '[devpanel] dev-only. Never bundled, never imported by the game.\n',
    );
  });
  return server;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  main();
}
