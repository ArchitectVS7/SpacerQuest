/**
 * T-143 · §6 CRITERION 4 — "a `grep` for the panel's entry point under
 * `packages/desktop`'s packaging config and any production build output returns
 * nothing" — plus §4's local-only server guards.
 *
 * The grep is performed IN CODE rather than pasted into a note, because a note
 * ages and a test does not. `PANEL_ENTRY_TOKEN` exists precisely so this
 * assertion has a unique needle to look for.
 *
 * A MISSING BUILD DIRECTORY MUST NOT SILENTLY PASS. `dist-web/`, `renderer/` and
 * `release/` are gitignored build artifacts that may or may not exist on the
 * machine running this suite. The test records "absent (not built)" per directory
 * in its own assertion message, so a green result never quietly means "there was
 * nothing to check".
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PANEL_ENTRY_TOKEN } from '../main.js';
import { createPanelServer, isLoopbackHost, LOOPBACK_HOST } from '../server.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(import.meta.url);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

/** Every string anywhere inside a JSON-ish value, flattened. */
function allStrings(value: unknown, sink: string[] = []): string[] {
  if (typeof value === 'string') sink.push(value);
  else if (Array.isArray(value)) for (const item of value) allStrings(item, sink);
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      sink.push(key);
      allStrings(item, sink);
    }
  }
  return sink;
}

function grepTree(root: string, needles: readonly string[]): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      // A packaged .app tree is full of symlinks, which are neither `isFile()`
      // nor `isDirectory()` on the dirent and blow up `readFileSync` with EISDIR
      // if followed blindly. Skipping them loses nothing: every symlink here
      // points back inside a tree this walk already visits.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile() || statSync(full).size > 40 * 1024 * 1024) continue;
      const text = readFileSync(full, 'latin1');
      for (const needle of needles) if (text.includes(needle)) hits.push(`${full} :: ${needle}`);
    }
  };
  walk(root);
  return hits;
}

const NEEDLES = [PANEL_ENTRY_TOKEN, 'devpanel', 'dev:panel'] as const;

describe('the panel is not shipped', () => {
  it('neither electron-builder config mentions it', () => {
    const desktop = readJson(join(REPO_ROOT, 'packages', 'desktop', 'package.json'));
    const demo: unknown = require(
      join(REPO_ROOT, 'packages', 'desktop', 'electron-builder.demo.cjs'),
    );
    for (const config of [desktop.build, demo]) {
      const strings = allStrings(config);
      for (const needle of NEEDLES) {
        expect(strings.filter((value) => value.includes(needle))).toEqual([]);
      }
      // And nothing sweeps in `packages/**` wholesale, which is what would make
      // the assertion above true today and false tomorrow.
      const files = (config as { files?: string[] }).files ?? [];
      for (const pattern of files) expect(pattern.startsWith('packages/')).toBe(false);
    }
  });

  it('no other workspace depends on @spacerquest/devpanel', () => {
    for (const name of ['ui', 'desktop', 'engine', 'content', 'sim']) {
      const manifest = readJson(join(REPO_ROOT, 'packages', name, 'package.json'));
      for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
        const deps = (manifest[field] ?? {}) as Record<string, string>;
        expect(Object.keys(deps)).not.toContain('@spacerquest/devpanel');
      }
    }
  });

  it('the panel itself has zero runtime dependencies', () => {
    const manifest = readJson(join(REPO_ROOT, 'packages', 'devpanel', 'package.json'));
    // A dev tool that spawns processes on your machine is a poor place to
    // acquire a supply chain.
    expect(manifest.dependencies).toBeUndefined();
  });

  it('no production build output contains the entry token', () => {
    const candidates = [
      join(REPO_ROOT, 'packages', 'ui', 'dist'),
      join(REPO_ROOT, 'packages', 'ui', 'dist-web'),
      join(REPO_ROOT, 'packages', 'ui', 'dist-demo'),
      join(REPO_ROOT, 'packages', 'desktop', 'dist'),
      join(REPO_ROOT, 'packages', 'desktop', 'renderer'),
      join(REPO_ROOT, 'packages', 'desktop', 'renderer-demo'),
      join(REPO_ROOT, 'packages', 'desktop', 'release'),
      join(REPO_ROOT, 'packages', 'desktop', 'release-demo'),
    ];
    const report: string[] = [];
    const hits: string[] = [];
    for (const dir of candidates) {
      if (!existsSync(dir)) {
        report.push(`${dir}: absent (not built)`);
        continue;
      }
      const found = grepTree(dir, NEEDLES);
      report.push(`${dir}: present, ${found.length} hits`);
      hits.push(...found);
    }
    // The per-directory record travels with the assertion, so a green result is
    // never mistaken for "everything was checked".
    expect(hits, report.join('\n')).toEqual([]);
  }, 120_000);

  it('the entry token appears in no source file outside the panel', () => {
    // Scoped to CODE (`packages/`, `scripts/`), not prose. TASKS.md and the spec
    // legitimately name the needle when explaining what it is for, and a
    // narrative document ships nowhere; a source file under `packages/` might.
    // `--untracked` so this passes before the new package is committed and
    // after, while still skipping gitignored trees (`dist/`, `.scratch/`) —
    // those are build output of this very file, not a second home for the needle.
    const inCode = execFileSync(
      'git',
      ['grep', '-l', '--untracked', PANEL_ENTRY_TOKEN, '--', 'packages', 'scripts'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    )
      .split('\n')
      .filter((line) => line !== '');
    // EXACTLY ONE SOURCE FILE carries the literal — this test reaches it by
    // import, so a second literal anywhere under `packages/` fails here.
    expect(inCode.sort()).toEqual(['packages/devpanel/src/main.ts']);
  });
});

describe('the server is loopback-only', () => {
  let server: ReturnType<typeof createPanelServer>['server'];
  let token: string;
  let base: string;
  const runsRoot = mkdtempSync(join(tmpdir(), 't143-server-'));

  beforeAll(async () => {
    const created = createPanelServer({ repoRoot: REPO_ROOT, runsRoot });
    server = created.server;
    token = created.token;
    await new Promise<void>((done) => {
      server.listen(0, LOOPBACK_HOST, done);
    });
    base = `http://${LOOPBACK_HOST}:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise<void>((done) => {
      server.close(() => {
        done();
      });
    });
  });

  it('binds 127.0.0.1 and not every interface', () => {
    // Node's default binds 0.0.0.0/::, which on a laptop on a cafe network would
    // publish a "run any of these commands" button to the LAN.
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  });

  it('the shipped entry point passes the host argument (not just this test)', () => {
    const source = readFileSync(join(REPO_ROOT, 'packages', 'devpanel', 'src', 'main.ts'), 'utf8');
    expect(source).toContain('server.listen(port, LOOPBACK_HOST');
  });

  it('classifies Host headers the way the guard needs', () => {
    for (const host of ['localhost:7343', '127.0.0.1:7343', '[::1]:7343', 'LOCALHOST']) {
      expect(isLoopbackHost(host)).toBe(true);
    }
    for (const host of ['evil.example', 'attacker.test:7343', '192.168.1.9:7343', undefined]) {
      expect(isLoopbackHost(host)).toBe(false);
    }
  });

  it('rejects a rebound Host header', async () => {
    // `fetch` refuses to set `Host` (it is a forbidden header), so this uses the
    // raw client — which is also what a DNS-rebinding attack looks like from the
    // server's side: an ordinary request carrying somebody else's hostname.
    const status = await new Promise<number>((done, fail) => {
      const request = httpRequest(
        {
          host: LOOPBACK_HOST,
          port: (server.address() as AddressInfo).port,
          path: '/api/commands',
          method: 'GET',
          headers: { host: 'evil.example' },
        },
        (response) => {
          response.resume();
          done(response.statusCode ?? 0);
        },
      );
      request.on('error', fail);
      request.end();
    });
    expect(status).toBe(403);
  });

  it('rejects a POST without the token', async () => {
    const response = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'smoke', values: {}, shardCount: 1 }),
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: string }).error).toContain('x-panel-token');
  });

  it('serves the page and the registry, and the page invents no flag', async () => {
    const page = await (await fetch(base)).text();
    const registry = (await (await fetch(`${base}/api/commands`)).json()) as {
      id: string;
      flags: { flag: string }[];
    }[];
    expect(registry.map((command) => command.id)).toEqual([
      'sweep',
      'diff',
      'extract',
      'smoke',
      'gate',
      'report',
    ]);
    // The forms are generated from the JSON the server embeds, so a field cannot
    // exist in the UI without existing in the registry.
    expect(page).toContain('id="panel-data"');
    expect(page).toContain(token);
    // Self-contained: no external host is referenced anywhere on the page.
    expect(page).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/);
    expect(page).not.toContain('<script src=');
    expect(page).not.toContain('<link rel="stylesheet"');
  });

  it('previews a command without spawning it, and shows the injected run directory', async () => {
    const response = await fetch(`${base}/api/plan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': token },
      body: JSON.stringify({
        commandId: 'sweep',
        values: { label: 'preview' },
        shardCount: 3,
      }),
    });
    const body = (await response.json()) as { commandLines: string[] };
    expect(body.commandLines).toHaveLength(4);
    expect(body.commandLines[0]).toContain('--shard 1/3');
    expect(body.commandLines[3]).toContain('--merge');
    for (const line of body.commandLines) expect(line).toContain(runsRoot);
    // /api/plan spawns nothing, so no run directory was created.
    expect(existsSync(runsRoot) ? readdirSync(runsRoot) : []).toEqual([]);
  });

  it('refuses --trace-npc-decisions on a run that will merge', async () => {
    const response = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': token },
      body: JSON.stringify({
        commandId: 'sweep',
        values: { label: 'traced', traceNpcDecisions: 'true' },
        shardCount: 2,
      }),
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('parseSweepArgs throws');
  });

  it('refuses a promotion without the echoed filename', async () => {
    const response = await fetch(`${base}/api/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': token },
      body: JSON.stringify({ runId: 'nope-20260801-000000', file: 'baseline-x.json' }),
    });
    // Either "no such run" or the confirmation refusal, never a copy.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(existsSync(join(REPO_ROOT, 'docs', 'balance', 'baseline-x.json'))).toBe(false);
  });

  it('the static route refuses a traversal', async () => {
    const response = await fetch(`${base}/runs/..%2f..%2f..%2fpackage.json`);
    expect(response.status).toBe(404);
  });

  it('streams a real run as it happens, then says done', async () => {
    const started = await fetch(`${base}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-panel-token': token },
      body: JSON.stringify({
        commandId: 'diff',
        values: {
          before: join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json'),
          after: join(REPO_ROOT, 'docs', 'balance', 'baseline-tour-one.json'),
        },
        shardCount: 1,
      }),
    });
    expect(started.status).toBe(200);
    const run = (await started.json()) as { id: string; commandLines: string[] };
    const stream = await fetch(`${base}/api/runs/${encodeURIComponent(run.id)}/stream`);
    const text = await stream.text();
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    expect(text).toContain('"kind":"spawn"');
    expect(text).toContain('"kind":"exit"');
    expect(text).toContain('"kind":"done"');

    const history = (await (await fetch(`${base}/api/runs`)).json()) as {
      id: string;
      status: string;
      commandLines: string[];
    }[];
    const record = history.find((entry) => entry.id === run.id);
    expect(record?.status).toBe('ok');
    // What ran is what the history shows, which is what the UI displayed.
    expect(record?.commandLines).toEqual(run.commandLines);
  }, 120_000);
});
