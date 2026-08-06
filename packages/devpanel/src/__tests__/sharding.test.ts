/**
 * T-143 · §6 CRITERION 2 — "a sweep run launches shards CONCURRENTLY (asserted by
 * process-count/timing, not just reading the code) and only merges after every
 * shard exits 0".
 *
 * Two independent proofs, because either alone is weak:
 *
 *  1. THE BARRIER TEST. A fake `SpawnFn` whose children refuse to exit until N of
 *     them are simultaneously live. A serial implementation DEADLOCKS on it and
 *     the test times out; a concurrent one passes in milliseconds. This is the
 *     only construction that makes the serial case an outright failure rather
 *     than a slower pass — a timing assertion over fast children can go green by
 *     luck, a barrier cannot.
 *  2. THE REAL-PROCESS TIMING TEST. Two genuine `npm run balance:sweep` children
 *     over a tiny arm, with each child's real start/exit wall clock recorded, and
 *     an assertion that the two intervals OVERLAP. This is the "process-count/
 *     timing" half of the criterion, run against `realSpawn` rather than a fake.
 *
 * Plus the merge ordering and the failure path, which are what §2's "only after
 * every shard exits 0" actually asks for.
 */

import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { findCommand, npmExecutable } from '../commands.js';
import {
  planShardedSweep,
  realSpawn,
  runShardedSweep,
  type ChildLike,
  type RunEvent,
  type SpawnFn,
} from '../runner.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const resolvePath = (path: string): string => resolve(REPO_ROOT, path);
const SWEEP = findCommand('sweep');
if (SWEEP === undefined) throw new Error('missing sweep command');

interface FakeChild extends ChildLike {
  exitWith(code: number): void;
}

function fakeChild(): FakeChild {
  const emitter = new EventEmitter();
  const child = emitter as unknown as FakeChild;
  Object.defineProperty(child, 'stdout', { value: null });
  Object.defineProperty(child, 'stderr', { value: null });
  child.kill = (): boolean => true;
  child.exitWith = (code: number): void => {
    emitter.emit('exit', code, null);
  };
  return child;
}

/**
 * A spawn seam whose shard children only exit once `barrier` of them exist. If
 * `runShardedSweep` awaited one child before spawning the next, the second would
 * never be created and this promise would never settle.
 */
function barrierSpawn(barrier: number): { spawn: SpawnFn; argvs: string[][] } {
  const argvs: string[][] = [];
  const live: FakeChild[] = [];
  const spawn: SpawnFn = (_command, argv) => {
    argvs.push([...argv]);
    const child = fakeChild();
    if (argv.includes('--merge')) {
      // The merge is not part of the barrier: by the time it is spawned the
      // shards are gone.
      setImmediate(() => {
        child.exitWith(0);
      });
      return child;
    }
    live.push(child);
    if (live.length === barrier) {
      // Only now does anything exit. A serial runner never reaches this line.
      for (const pending of live) {
        setImmediate(() => {
          pending.exitWith(0);
        });
      }
    }
    return child;
  };
  return { spawn, argvs };
}

function noopDeps(
  spawn: SpawnFn,
  events: RunEvent[] = [],
): {
  spawn: SpawnFn;
  cwd: string;
  onEvent: (event: RunEvent) => void;
} {
  return {
    spawn,
    cwd: REPO_ROOT,
    onEvent: (event) => {
      events.push(event);
    },
  };
}

describe('shards run concurrently', () => {
  it('a serial implementation would deadlock: four children must be live at once', async () => {
    const { spawn } = barrierSpawn(4);
    const result = await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 'barrier' },
        shardCount: 4,
        runDir: join(tmpdir(), 't143-barrier-never-written'),
        resolvePath,
        writeLogs: false,
      },
      noopDeps(spawn),
    );
    expect(result.status).toBe('ok');
    expect(result.shards).toHaveLength(4);
    expect(result.shards.every((shard) => shard.code === 0)).toBe(true);
  }, 20_000);

  it('shards are 1-indexed 1/N … N/N — never 0-indexed', async () => {
    const { spawn, argvs } = barrierSpawn(3);
    await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 'idx' },
        shardCount: 3,
        runDir: join(tmpdir(), 't143-idx-never-written'),
        resolvePath,
        writeLogs: false,
      },
      noopDeps(spawn),
    );
    const shardValues = argvs
      .filter((argv) => argv.includes('--shard'))
      .map((argv) => argv[argv.indexOf('--shard') + 1]);
    // `inShard` is `(seed - seedStart) % count === index - 1`, so a 0-indexed
    // loop would silently drop 1/N of the seeds and still produce a merge that
    // looks complete.
    expect(shardValues).toEqual(['1/3', '2/3', '3/3']);
  }, 20_000);

  it('two REAL child processes overlap in wall-clock time', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 't143-timing-'));
    const spans = new Map<string, { start: number; end: number }>();
    const spawn: SpawnFn = (command, argv, options) => {
      const key = argv.join(' ');
      spans.set(key, { start: Date.now(), end: 0 });
      const child = realSpawn(command, argv, options);
      child.on('exit', () => {
        const span = spans.get(key);
        if (span !== undefined) span.end = Date.now();
      });
      return child;
    };
    const result = await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 't143-timing', seeds: '6', days: '12', policies: 'trader,fighter' },
        shardCount: 2,
        runDir,
        resolvePath,
        executable: npmExecutable(),
      },
      noopDeps(spawn),
    );
    expect(result.status).toBe('ok');
    const shardSpans = [...spans.entries()]
      .filter(([key]) => key.includes('--shard'))
      .map(([, span]) => span);
    expect(shardSpans).toHaveLength(2);
    // OVERLAP, not "both finished": interval A starts before interval B ends and
    // vice versa. A serial run cannot satisfy this however fast it is.
    const [a, b] = shardSpans;
    expect(a.start).toBeLessThan(b.end);
    expect(b.start).toBeLessThan(a.end);
  }, 300_000);
});

describe('the merge is gated on every shard exiting 0', () => {
  it('merges only after all N exit events, carrying --merge and the same directories', async () => {
    const events: RunEvent[] = [];
    const { spawn, argvs } = barrierSpawn(4);
    const runDir = join(tmpdir(), 't143-merge-never-written');
    await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 'merged' },
        shardCount: 4,
        runDir,
        resolvePath,
        writeLogs: false,
      },
      noopDeps(spawn, events),
    );
    const spawnOrder = events
      .map((event, index) => ({ event, index }))
      .filter((entry) => entry.event.kind === 'spawn' || entry.event.kind === 'exit');
    const mergeSpawnIndex = spawnOrder.findIndex(
      (entry) => entry.event.kind === 'spawn' && entry.event.commandLine.includes('--merge'),
    );
    const exitsBeforeMerge = spawnOrder
      .slice(0, mergeSpawnIndex)
      .filter((entry) => entry.event.kind === 'exit').length;
    expect(mergeSpawnIndex).toBeGreaterThan(-1);
    expect(exitsBeforeMerge).toBe(4);

    const mergeArgv = argvs.find((argv) => argv.includes('--merge'));
    expect(mergeArgv).toBeDefined();
    expect(mergeArgv).toContain('--merge');
    expect(mergeArgv).not.toContain('--shard');
    expect(mergeArgv?.[mergeArgv.indexOf('--out') + 1]).toBe(runDir);
    expect(mergeArgv?.[mergeArgv.indexOf('--aggregate-out') + 1]).toBe(runDir);
  }, 20_000);

  it('one failing shard means ZERO merge spawns and a failed result', async () => {
    const argvs: string[][] = [];
    const spawn: SpawnFn = (_command, argv) => {
      argvs.push([...argv]);
      const child = fakeChild();
      const index = argv[argv.indexOf('--shard') + 1];
      setImmediate(() => {
        child.exitWith(index === '3/4' ? 1 : 0);
      });
      return child;
    };
    const events: RunEvent[] = [];
    const result = await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 'partial' },
        shardCount: 4,
        runDir: join(tmpdir(), 't143-partial-never-written'),
        resolvePath,
        writeLogs: false,
      },
      noopDeps(spawn, events),
    );
    expect(result.status).toBe('failed');
    expect(result.merge).toBeNull();
    expect(argvs.filter((argv) => argv.includes('--merge'))).toHaveLength(0);
    // The failing shard is NAMED, so the operator opens one log rather than four.
    const note = events.find((event) => event.kind === 'note');
    expect(note?.kind === 'note' ? note.text : '').toContain('shard 3 exited 1');
  }, 20_000);
});

describe('the plan is gitignored by default', () => {
  it('a blank --out / --aggregate-out points at the run dir, not docs/balance', () => {
    const runDir = join(REPO_ROOT, '.scratch', 'balance', 'panel-runs', 'x-20260801-000000');
    const plan = planShardedSweep({
      command: SWEEP,
      values: { label: 'x' },
      shardCount: 2,
      runDir,
      resolvePath,
    });
    for (const argv of [...plan.shards, plan.merge]) {
      expect(argv[argv.indexOf('--out') + 1]).toBe(runDir);
      expect(argv[argv.indexOf('--aggregate-out') + 1]).toBe(runDir);
      // sweep.ts's own default for --aggregate-out is docs/balance, which would
      // drop a committed-looking baseline into the repo on every ad hoc click.
      expect(argv.join(' ')).not.toContain(join(REPO_ROOT, 'docs', 'balance'));
    }
  });

  it('an operator-supplied --out is honoured verbatim (absolute)', () => {
    const plan = planShardedSweep({
      command: SWEEP,
      values: { label: 'x', out: '.scratch/elsewhere' },
      shardCount: 1,
      runDir: '/tmp/unused',
      resolvePath,
    });
    expect(plan.shards[0][plan.shards[0].indexOf('--out') + 1]).toBe(
      join(REPO_ROOT, '.scratch', 'elsewhere'),
    );
  });

  it('the merge never carries --trace-npc-decisions (parseSweepArgs throws on the pair)', () => {
    const plan = planShardedSweep({
      command: SWEEP,
      values: { label: 'x', traceNpcDecisions: 'true' },
      shardCount: 1,
      runDir: '/tmp/unused',
      resolvePath,
    });
    expect(plan.shards[0]).toContain('--trace-npc-decisions');
    expect(plan.merge).not.toContain('--trace-npc-decisions');
  });

  it('rejects a shard count that is not an integer >= 1', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() =>
        planShardedSweep({
          command: SWEEP,
          values: { label: 'x' },
          shardCount: bad,
          runDir: '/tmp/unused',
          resolvePath,
        }),
      ).toThrow();
    }
  });
});

describe('a real sharded sweep produces a real aggregate', () => {
  it('4 shards + merge writes baseline-<label>.json into the run dir only', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 't143-real-'));
    const result = await runShardedSweep(
      {
        command: SWEEP,
        values: { label: 't143-real', seeds: '8', days: '10', policies: 'trader' },
        shardCount: 4,
        runDir,
        resolvePath,
      },
      noopDeps(realSpawn),
    );
    expect(result.status).toBe('ok');
    expect(result.merge?.code).toBe(0);
    const aggregatePath = join(runDir, 'baseline-t143-real.json');
    expect(existsSync(aggregatePath)).toBe(true);
    const aggregate = JSON.parse(readFileSync(aggregatePath, 'utf8')) as {
      label: string;
      runs: number;
    };
    expect(aggregate.label).toBe('t143-real');
    // 8 seeds x 1 policy, split 4 ways and re-merged: every seed present exactly once.
    expect(aggregate.runs).toBe(8);
    // The shard log files exist, so a closed browser tab loses nothing.
    for (let index = 1; index <= 4; index += 1) {
      expect(existsSync(join(runDir, `shard${index}of4.err.log`))).toBe(true);
    }
  }, 300_000);
});
