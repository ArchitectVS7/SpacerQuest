/**
 * T-143 · THE LOCAL-ONLY SERVER — spec §4.
 *
 * `node:http` and nothing else. This package has ZERO RUNTIME DEPENDENCIES, and
 * that is a deliberate property of a tool whose job is to spawn processes on a
 * developer's machine: a dev dashboard is a poor place to acquire a supply chain.
 * The live stream is Server-Sent Events, which the browser implements natively
 * (`EventSource`), so §4's "stdout/stderr as it happens" needs no library either.
 *
 * THREE GUARDS, ALL OF THEM LOAD-BEARING:
 *
 *  1. `listen(port, '127.0.0.1')` — the host argument is NOT OPTIONAL and is
 *     asserted in `__tests__/not-shipped.test.ts`. Node's default binds every
 *     interface; on a laptop on a cafe network that would publish a
 *     "run any of these commands" button to the LAN. Spec §4: "localhost, no
 *     external network exposure".
 *  2. A `Host`-header allowlist. Loopback binding alone does not stop DNS
 *     REBINDING: a page on the open internet can resolve its own hostname to
 *     127.0.0.1 and then talk to this server from the victim's browser. Rejecting
 *     any Host that is not localhost/127.0.0.1/[::1] closes it.
 *  3. A per-process random token, required on every POST — the only verbs that
 *     spawn a process or copy a file. It is inlined into the page this server
 *     serves, so a same-origin click has it and a cross-origin form post does not.
 *
 * WHAT THE SERVER DOES NOT DO: it never reimplements a single line of balance
 * logic (spec §0), never edits a source file, and never runs git. Promotion
 * copies one guarded file and hands back the `git add`/`git commit` text.
 */

import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { basename, extname, join, relative, resolve } from 'node:path';

import {
  GATE_STEPS,
  PANEL_COMMANDS,
  PanelArgError,
  buildArgv,
  findCommand,
  npmArgvFor,
  npmExecutable,
  renderCommandLine,
  type PanelFormValues,
} from './commands.js';
import { renderPanelPage } from './panel-html.js';
import {
  listRuns,
  panelRunDir,
  promoteBaseline,
  promotionGitLines,
  readRunRecord,
  resolveInsideRoot,
  writeRunRecord,
  type RunRecord,
} from './runs.js';
import {
  planShardedSweep,
  realSpawn,
  runGate,
  runShardedSweep,
  runSingleCommand,
  type RunEvent,
  type SpawnFn,
} from './runner.js';

export const LOOPBACK_HOST = '127.0.0.1';

/** Only these Host values are served. Anything else is a rebinding attempt. */
export function isLoopbackHost(hostHeader: string | undefined): boolean {
  if (hostHeader === undefined) return false;
  const host = hostHeader.replace(/:\d+$/, '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export interface PanelServerOptions {
  readonly repoRoot: string;
  readonly runsRoot: string;
  readonly spawn?: SpawnFn;
  /** Overridden in tests; `npm`/`npm.cmd` in real use. */
  readonly executable?: string;
  readonly now?: () => Date;
}

interface LiveRun {
  record: RunRecord;
  readonly events: RunEvent[];
  readonly listeners: Set<(event: RunEvent | { kind: 'done' }) => void>;
  done: boolean;
}

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function createPanelServer(options: PanelServerOptions): {
  server: Server;
  token: string;
} {
  const token = randomBytes(16).toString('hex');
  const spawn = options.spawn ?? realSpawn;
  const executable = options.executable ?? npmExecutable();
  const now = options.now ?? ((): Date => new Date());
  const runs = new Map<string, LiveRun>();
  const resolvePath = (path: string): string => resolve(options.repoRoot, path);

  function send(response: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(payload);
  }

  function readBody(request: IncomingMessage): Promise<unknown> {
    return new Promise((resolveBody, rejectBody) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on('data', (chunk: Buffer) => {
        size += chunk.length;
        // A dev tool still gets a bound: an unbounded body is an OOM away.
        if (size > 1_000_000) {
          rejectBody(new Error('request body too large'));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          resolveBody(text === '' ? {} : (JSON.parse(text) as unknown));
        } catch {
          rejectBody(new Error('body was not JSON'));
        }
      });
      request.on('error', rejectBody);
    });
  }

  function emit(live: LiveRun, event: RunEvent): void {
    live.events.push(event);
    for (const listener of live.listeners) listener(event);
  }

  function finish(live: LiveRun, patch: Partial<RunRecord>): void {
    live.record = { ...live.record, ...patch, finishedAt: now().toISOString() };
    live.done = true;
    writeRunRecord(live.record.runDir, live.record);
    for (const listener of [...live.listeners]) listener({ kind: 'done' });
    live.listeners.clear();
  }

  /** `baseline-*.json` files a completed sweep left in its run directory. */
  function promotableFiles(runDir: string): string[] {
    if (!existsSync(runDir)) return [];
    return readdirSync(runDir)
      .filter((name) => /^baseline-[A-Za-z0-9._-]+\.json$/.test(name))
      .sort();
  }

  function outputLinks(runDir: string): { name: string; href: string }[] {
    if (!existsSync(runDir)) return [];
    const links: { name: string; href: string }[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(html|json|log|jsonl)$/.test(entry.name)) {
          links.push({
            name: relative(runDir, full).split('\\').join('/'),
            href: `/runs/${relative(options.runsRoot, full).split('\\').join('/')}`,
          });
        }
      }
    };
    walk(runDir);
    return links.sort((a, b) => a.name.localeCompare(b.name));
  }

  function planFor(
    commandId: string,
    values: PanelFormValues,
    shardCount: number,
    runDir: string,
  ): string[] {
    const command = findCommand(commandId);
    if (command === undefined) throw new PanelArgError(`unknown command: ${commandId}`);
    if (command.id === 'gate') {
      return GATE_STEPS.map((step) => renderCommandLine(executable, step.argv));
    }
    if (command.id === 'sweep') {
      const plan = planShardedSweep({
        command,
        values,
        shardCount,
        runDir,
        resolvePath,
      });
      return [
        ...plan.shards.map((argv) => renderCommandLine(executable, npmArgvFor(command, argv))),
        renderCommandLine(executable, npmArgvFor(command, plan.merge)),
      ];
    }
    return [
      renderCommandLine(
        executable,
        npmArgvFor(command, buildArgv(command, values, { resolvePath })),
      ),
    ];
  }

  function startRun(input: {
    commandId: string;
    values: PanelFormValues;
    shardCount: number;
    label: string;
  }): { id: string; runDir: string; commandLines: string[] } {
    const command = findCommand(input.commandId);
    if (command === undefined) throw new PanelArgError(`unknown command: ${input.commandId}`);
    const startedAt = now().toISOString();
    const runDir = panelRunDir(options.runsRoot, input.label, startedAt);
    const id = basename(runDir);
    const commandLines = planFor(input.commandId, input.values, input.shardCount, runDir);

    const record: RunRecord = {
      id,
      commandId: command.id,
      title: command.title,
      commandLines,
      startedAt,
      finishedAt: null,
      exitCode: null,
      shardCount: command.id === 'sweep' ? input.shardCount : 1,
      status: 'running',
      outputs: [],
      runDir,
    };
    const live: LiveRun = { record, events: [], listeners: new Set(), done: false };
    runs.set(id, live);
    writeRunRecord(runDir, record);

    const deps = {
      spawn,
      cwd: options.repoRoot,
      onEvent: (event: RunEvent): void => {
        emit(live, event);
      },
    };

    const work: Promise<{ status: 'ok' | 'failed'; exitCode: number | null }> =
      command.id === 'sweep'
        ? runShardedSweep(
            { command, values: input.values, shardCount: input.shardCount, runDir, resolvePath },
            deps,
          ).then((result) => ({
            status: result.status,
            exitCode: result.merge?.code ?? result.shards.find((s) => s.code !== 0)?.code ?? null,
          }))
        : command.id === 'gate'
          ? runGate({ runDir, steps: GATE_STEPS }, deps).then((result) => ({
              status: result.status,
              exitCode: result.results[result.results.length - 1]?.code ?? null,
            }))
          : runSingleCommand({ command, values: input.values, runDir, resolvePath }, deps).then(
              (result) => ({
                status: result.result.code === 0 ? ('ok' as const) : ('failed' as const),
                exitCode: result.result.code,
              }),
            );

    work.then(
      (result) => {
        finish(live, {
          status: result.status,
          exitCode: result.exitCode,
          outputs: outputLinks(runDir).map((link) => link.name),
        });
      },
      (error: unknown) => {
        emit(live, {
          kind: 'note',
          stream: command.id,
          text: `${error instanceof Error ? error.message : 'unknown error'}\n`,
        });
        finish(live, { status: 'failed', exitCode: -1 });
      },
    );

    return { id, runDir, commandLines };
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      send(response, 500, { error: error instanceof Error ? error.message : 'unknown error' });
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (!isLoopbackHost(request.headers.host)) {
      // Guard 2. Named in the body so a developer who hits it knows why.
      send(response, 403, { error: 'host not allowed (loopback only; DNS-rebinding guard)' });
      return;
    }
    const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`);
    const method = request.method ?? 'GET';

    if (method === 'POST' && request.headers['x-panel-token'] !== token) {
      send(response, 403, { error: 'missing or wrong x-panel-token' });
      return;
    }

    if (method === 'GET' && url.pathname === '/') {
      const html = renderPanelPage({
        commands: PANEL_COMMANDS,
        token,
        repoRoot: options.repoRoot,
        runsRoot: options.runsRoot,
      });
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end(html);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/commands') {
      send(response, 200, PANEL_COMMANDS);
      return;
    }

    if (method === 'GET' && url.pathname === '/api/runs') {
      const merged = listRuns(options.runsRoot).map((record) => ({
        ...record,
        outputs: outputLinks(record.runDir),
        promotable: record.commandId === 'sweep' ? promotableFiles(record.runDir) : [],
      }));
      send(response, 200, merged);
      return;
    }

    const streamMatch = /^\/api\/runs\/([^/]+)\/stream$/.exec(url.pathname);
    if (method === 'GET' && streamMatch !== null) {
      const live = runs.get(decodeURIComponent(streamMatch[1]));
      if (live === undefined) {
        send(response, 404, { error: 'no live run with that id' });
        return;
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      const write = (event: RunEvent | { kind: 'done' }): void => {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
        // CLOSE THE STREAM ON `done`. An SSE response that stays open after the
        // run finishes leaves `EventSource` reconnecting forever and any
        // non-browser reader (a test, `curl`) hanging on a body that will never
        // end.
        if (event.kind === 'done') response.end();
      };
      // Replay first: a browser that attaches a beat after the POST returns must
      // not lose the lines already emitted.
      for (const event of live.events) write(event);
      if (live.done) {
        write({ kind: 'done' });
        response.end();
        return;
      }
      live.listeners.add(write);
      request.on('close', () => {
        live.listeners.delete(write);
      });
      return;
    }

    if (method === 'POST' && (url.pathname === '/api/plan' || url.pathname === '/api/run')) {
      const body = (await readBody(request)) as {
        commandId?: string;
        values?: PanelFormValues;
        shardCount?: number;
      };
      const commandId = body.commandId ?? '';
      const values = body.values ?? {};
      const shardCount = Number(body.shardCount ?? 1);
      const command = findCommand(commandId);
      if (command === undefined) {
        send(response, 400, { error: `unknown command: ${commandId}` });
        return;
      }
      // `parseSweepArgs` THROWS on `--trace-npc-decisions` + `--merge`, so a
      // sharded run that will merge must refuse the flag here rather than spend
      // four shards' wall clock and fail at the last step.
      if (command.id === 'sweep' && values.traceNpcDecisions !== undefined) {
        send(response, 400, {
          error:
            '--trace-npc-decisions cannot be combined with the merge this panel runs after the ' +
            'shards (parseSweepArgs throws). Run a traced sweep by hand instead: it is for ' +
            'diagnosis, never a capstone.',
        });
        return;
      }
      const label =
        typeof values.label === 'string' && values.label !== '' ? values.label : command.id;
      try {
        if (url.pathname === '/api/plan') {
          const runDir = panelRunDir(options.runsRoot, label, now().toISOString());
          send(response, 200, { commandLines: planFor(commandId, values, shardCount, runDir) });
          return;
        }
        send(response, 200, startRun({ commandId, values, shardCount, label }));
      } catch (error) {
        send(response, 400, {
          error: error instanceof Error ? error.message : 'could not build the command',
        });
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/report') {
      const body = (await readBody(request)) as { runId?: string };
      const source = findRecord(body.runId ?? '');
      if (source === undefined) {
        send(response, 404, { error: 'no such run' });
        return;
      }
      const runDir = source.runDir;
      const aggregate = promotableFiles(runDir)[0];
      if (aggregate === undefined) {
        send(response, 400, { error: `no baseline-*.json in ${runDir} — did the merge run?` });
        return;
      }
      try {
        send(
          response,
          200,
          startRun({
            commandId: 'report',
            values: { aggregate: join(runDir, aggregate), out: join(runDir, 'report') },
            shardCount: 1,
            label: `report-${basename(runDir)}`,
          }),
        );
      } catch (error) {
        send(response, 400, { error: error instanceof Error ? error.message : 'report failed' });
      }
      return;
    }

    if (method === 'POST' && url.pathname === '/api/promote') {
      const body = (await readBody(request)) as {
        runId?: string;
        file?: string;
        confirm?: string;
      };
      const record = findRecord(body.runId ?? '');
      if (record === undefined) {
        send(response, 404, { error: 'no such run' });
        return;
      }
      const file = body.file ?? '';
      // THE TYPED CONFIRMATION. A bare click is not enough for the one action in
      // this panel that writes outside `.scratch/`.
      if (file === '' || body.confirm !== file) {
        send(response, 400, {
          error: 'promotion requires the exact baseline filename echoed back in "confirm"',
        });
        return;
      }
      const src = join(record.runDir, file);
      const dest = join(options.repoRoot, 'docs', 'balance', file);
      try {
        promoteBaseline({ src, dest, runsRoot: options.runsRoot, repoRoot: options.repoRoot });
      } catch (error) {
        send(response, 400, { error: error instanceof Error ? error.message : 'refused' });
        return;
      }
      send(response, 200, {
        dest,
        // NOT RUN, returned as text. docs/VERSIONING.md: a baseline pointer move
        // is its own deliberate commit, never a side effect of running a tool.
        gitLines: promotionGitLines(`docs/balance/${file}`),
      });
      return;
    }

    if (method === 'GET' && url.pathname.startsWith('/runs/')) {
      const target = resolveInsideRoot(options.runsRoot, url.pathname.slice('/runs/'.length));
      if (target === null || !existsSync(target) || statSync(target).isDirectory()) {
        send(response, 404, { error: 'not found' });
        return;
      }
      response.writeHead(200, {
        'content-type': MIME[extname(target)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      createReadStream(target).pipe(response);
      return;
    }

    send(response, 404, { error: `no route for ${method} ${url.pathname}` });
  }

  function findRecord(id: string): RunRecord | undefined {
    const live = runs.get(id);
    if (live !== undefined) return live.record;
    if (id === '' || id.includes('/') || id.includes('\\') || id.includes('..')) return undefined;
    return readRunRecord(join(options.runsRoot, id)) ?? undefined;
  }

  return { server, token };
}
