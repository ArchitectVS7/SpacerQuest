/**
 * T-154 · The native LLM pilot, proven against the REAL engine through the REAL
 * protocol seam.
 *
 * NOTHING HERE MAKES A NETWORK CALL. `pilot-anthropic.ts` is deliberately not
 * imported by this file: the live brain's only job is to name a candidate id, and
 * every claim worth making about the driver — that an unmapped answer is rejected
 * rather than fabricated, that an applied action was advertised, that a run is
 * reproducible — is a claim about `pilot.ts`, which is brain-agnostic by design.
 */

import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { makeSessionHandler } from '../protocol-stdio.js';
import type {
  LegalActionSpec,
  LegalActions,
  ProtocolRequest,
  ProtocolResponse,
} from '../protocol.js';
import type { PlayerAction } from '@spacerquest/engine';
import { comparePilotRuns, parsePilotArgs } from '../pilot-cli.js';
import {
  actionSequence,
  enumerateCandidates,
  firstDivergence,
  firstLegalBrain,
  paramValueIsLegal,
  parseJsonl,
  randomBrain,
  recordedBrain,
  runPassed,
  runPilot,
  specTypeOf,
  toJsonl,
  type PilotBrain,
  type PilotDecision,
  type PilotLogEntry,
  type PilotStepEntry,
  type PilotTransport,
  type PilotUnmappedAnswer,
} from '../pilot.js';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface SpyExchange {
  request: ProtocolRequest;
  response: ProtocolResponse;
}

/** The real reducer, with every exchange recorded — this is what proves that a
 *  rejected answer never reached the engine. */
function spyTransport(): { transport: PilotTransport; log: SpyExchange[] } {
  const handler = makeSessionHandler();
  const log: SpyExchange[] = [];
  return {
    log,
    transport: (request) => {
      const response = handler(request);
      log.push({ request, response });
      return response;
    },
  };
}

function steps(entries: readonly PilotLogEntry[]): PilotStepEntry[] {
  return entries.filter((entry): entry is PilotStepEntry => entry.type === 'step');
}

/** Discriminants match AND every filled field is inside its declared domain. */
function specAdvertises(spec: LegalActionSpec, action: PlayerAction): boolean {
  const fields = action as unknown as Record<string, unknown>;
  if (spec.type !== fields['type']) return false;
  if ((spec.action ?? undefined) !== (fields['action'] as string | undefined)) return false;
  if ((spec.storyletId ?? undefined) !== (fields['storyletId'] as string | undefined)) return false;
  if ((spec.choiceId ?? undefined) !== (fields['choiceId'] as string | undefined)) return false;
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'type' || key === 'action' || key === 'storyletId' || key === 'choiceId') continue;
    const param = spec.params[key];
    if (param === undefined || !paramValueIsLegal(param, value)) return false;
  }
  for (const key of Object.keys(spec.params)) {
    if (!(key in fields)) return false;
  }
  return true;
}

function isAdvertised(legal: LegalActions, action: PlayerAction): boolean {
  if ((action as { type: string }).type === 'Wait') return legal.canWait;
  return legal.actions.some((spec) => specAdvertises(spec, action));
}

// ---------------------------------------------------------------------------
// 1 · It runs against the real engine, through the seam, non-vacuously
// ---------------------------------------------------------------------------

describe('T-154 · the pilot drives the real engine through the protocol seam', () => {
  it('plays a seeded career and reports clean counters', async () => {
    const { transport } = spyTransport();
    const { summary, entries } = await runPilot({
      transport,
      brain: firstLegalBrain(),
      seed: 1,
      days: 10,
      now: () => 0,
      runId: 'test-clean',
    });

    expect(summary.daysPlayed).toBe(10);
    expect(summary.finalDay).toBeGreaterThan(1);
    expect(summary.stepsApplied).toBeGreaterThan(0);

    // The three counters `balance/gate.ts` SWEEP_INVARIANT_DISPOSITIONS records as
    // not-observable by the sweep and names T-154/T-155 as owning.
    expect(summary.blockedFromLegal).toBe(0);
    expect(summary.protocolErrors).toBe(0);
    expect(summary.diceBoundsViolations).toBe(0);
    expect(summary.illegalAttempts).toBe(0);
    expect(summary.fallbacks).toBe(0);

    // Non-vacuous: T-1604a §3's lesson — a run that applied nothing measured
    // nothing. Every played day must carry at least one applied action.
    const appliedDays = new Set(
      steps(entries)
        .filter((entry) => entry.response === 'action-result')
        .map((entry) => entry.day),
    );
    expect(appliedDays.size).toBe(10);
  });

  it('never applies an action the enumerator did not advertise', async () => {
    const { transport, log } = spyTransport();
    await runPilot({
      transport,
      brain: firstLegalBrain(),
      seed: 7,
      days: 10,
      now: () => 0,
      runId: 'test-advertised',
    });

    // The property, not an anecdote: for EVERY apply-action that reached the
    // engine, cross-check its discriminants and every filled parameter against the
    // `legal-actions` response captured immediately before it.
    let lastLegal: LegalActions | null = null;
    let checked = 0;
    for (const exchange of log) {
      if (exchange.response.type === 'legal-actions') {
        lastLegal = exchange.response.legalActions;
        continue;
      }
      if (exchange.request.type !== 'apply-action') continue;
      expect(lastLegal).not.toBeNull();
      expect(isAdvertised(lastLegal!, exchange.request.action)).toBe(true);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · Illegal attempts are rejected and logged, never silently applied
// ---------------------------------------------------------------------------

describe('T-154 · an unmapped answer is rejected, never fabricated into an action', () => {
  /** A brain that answers with an id that does not exist. */
  const unknownIdBrain: PilotBrain = {
    kind: 'hostile-unknown-id',
    decide: () => Promise.resolve({ candidateId: 'a999' } satisfies PilotDecision),
  };

  /** A brain that answers in prose. There is no code path that can use this. */
  const proseBrain: PilotBrain = {
    kind: 'hostile-prose',
    decide: () =>
      Promise.resolve({
        raw: 'I travel to Andromeda and buy a bigger ship',
      } as PilotUnmappedAnswer),
  };

  /** A brain that throws — a live model's HTTP failure, in miniature. */
  const throwingBrain: PilotBrain = {
    kind: 'hostile-throw',
    decide: () => Promise.reject(new Error('socket hang up')),
  };

  /**
   * A brain that names a REAL id after mutating that candidate out of its declared
   * domain. Nothing a brain says can do this — it stands in for a future
   * enumerator bug, and `assertCandidateIsLegal` is what must catch it.
   */
  const mutatingBrain: PilotBrain = {
    kind: 'hostile-mutation',
    decide: (context) => {
      const target = context.candidates.find(
        (candidate) =>
          candidate.kind === 'action' &&
          candidate.action !== undefined &&
          'spendDie' in candidate.action,
      );
      if (target === undefined || target.action === undefined) {
        return Promise.resolve({ raw: '<no die-spending candidate>' } as PilotUnmappedAnswer);
      }
      (target.action as unknown as Record<string, unknown>)['spendDie'] = 99;
      return Promise.resolve({ candidateId: target.id });
    },
  };

  const cases: { brain: PilotBrain; reason: string }[] = [
    { brain: unknownIdBrain, reason: 'unknown-candidate-id' },
    { brain: proseBrain, reason: 'unparseable' },
    { brain: throwingBrain, reason: 'brain-error' },
    { brain: mutatingBrain, reason: 'illegal-candidate' },
  ];

  for (const testCase of cases) {
    it(`rejects and logs "${testCase.reason}" without dispatching anything`, async () => {
      const { transport, log } = spyTransport();
      const { summary, entries } = await runPilot({
        transport,
        brain: testCase.brain,
        seed: 3,
        days: 3,
        now: () => 0,
        runId: `test-${testCase.reason}`,
      });

      const recorded = steps(entries).flatMap((entry) => entry.rejected);
      expect(recorded.length).toBeGreaterThan(0);
      expect(recorded.every((rejection) => rejection.reason === testCase.reason)).toBe(true);
      expect(summary.illegalAttempts).toBe(recorded.length);

      // The load-bearing assertion: NO illegal action reached the transport. The
      // hostile brains name nothing valid, so no apply-action may have been sent
      // at all — and the mutated `spendDie: 99` in particular must be absent.
      const applied = log.filter((exchange) => exchange.request.type === 'apply-action');
      expect(applied).toEqual([]);

      // …and the run CONTINUED, via a recorded fallback rather than a silent one.
      expect(summary.fallbacks).toBeGreaterThan(0);
      expect(steps(entries).some((entry) => entry.fellBack)).toBe(true);
      expect(summary.protocolErrors).toBe(0);
      expect(summary.blockedFromLegal).toBe(0);
      expect(summary.daysPlayed).toBe(3);
    });
  }
});

// ---------------------------------------------------------------------------
// 3 · The log is reviewable, and its two tallies reconcile
// ---------------------------------------------------------------------------

describe('T-154 · the JSONL trail is reviewable and self-consistent', () => {
  it('round-trips through JSONL and reconciles both independent tallies', async () => {
    const { transport } = spyTransport();
    const emitted: PilotLogEntry[] = [];
    const { summary, entries } = await runPilot({
      transport,
      brain: firstLegalBrain(),
      seed: 2,
      days: 8,
      now: () => 0,
      runId: 'test-tallies',
      onEntry: (entry) => emitted.push(entry),
    });

    // Streamed entries and returned entries are the same trail.
    expect(emitted).toEqual(entries);

    const parsed = parseJsonl(toJsonl(entries));
    expect(parsed).toHaveLength(entries.length);
    expect(parsed[0].type).toBe('run-start');
    expect(parsed[parsed.length - 1].type).toBe('run-summary');

    // T-1604a §3's two-independent-tallies discipline: assert the RELATION between
    // the summary counters and the per-step records, do not hand-wave it.
    const applied = steps(parsed).filter((entry) => entry.response === 'action-result');
    expect(summary.stepsApplied).toBe(applied.length);
    expect(summary.illegalAttempts).toBe(
      steps(parsed).reduce((total, entry) => total + entry.rejected.length, 0),
    );
    expect(summary.fallbacks).toBe(steps(parsed).filter((entry) => entry.fellBack).length);

    // Every applied step carries the state delta the Accept criterion asks for.
    for (const entry of applied) {
      expect(entry.delta.credits).toBe(entry.after.credits - entry.before.credits);
      expect(entry.delta.fuel).toBe(entry.after.fuel - entry.before.fuel);
      expect(entry.delta.diceSpent).toBe(
        entry.before.diceRemaining.length - entry.after.diceRemaining.length,
      );
    }
  });

  it('records a truncated candidate list rather than starving silently', async () => {
    const { transport } = spyTransport();
    const { entries } = await runPilot({
      transport,
      brain: firstLegalBrain(),
      seed: 5,
      days: 2,
      totalCap: 1,
      perSpecCap: 1,
      now: () => 0,
      runId: 'test-truncation',
    });
    expect(steps(entries).some((entry) => entry.truncated)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 · Reproducibility — the lever T-155 leans on
// ---------------------------------------------------------------------------

describe('T-154 · a run is reproducible', () => {
  it('produces byte-identical JSONL for the same seed, brain and clock', async () => {
    const run = async (): Promise<string> => {
      const { transport } = spyTransport();
      const { entries } = await runPilot({
        transport,
        brain: firstLegalBrain(),
        seed: 11,
        days: 6,
        now: () => 1_700_000_000_000,
        runId: 'test-determinism',
      });
      return toJsonl(entries);
    };
    expect(await run()).toBe(await run());
  });

  it('replays a recorded trail through --brain recorded', async () => {
    const first = await runPilot({
      transport: spyTransport().transport,
      brain: firstLegalBrain(),
      seed: 13,
      days: 6,
      now: () => 0,
      runId: 'test-record',
    });

    const replay = await runPilot({
      transport: spyTransport().transport,
      brain: recordedBrain(parseJsonl(toJsonl(first.entries))),
      seed: 13,
      days: 6,
      now: () => 0,
      runId: 'test-record',
    });

    expect(replay.summary.illegalAttempts).toBe(0);
    expect(replay.summary.fallbacks).toBe(0);
    expect(steps(replay.entries).map((entry) => entry.chosen.id)).toEqual(
      steps(first.entries).map((entry) => entry.chosen.id),
    );
    expect(steps(replay.entries).map((entry) => JSON.stringify(entry.action))).toEqual(
      steps(first.entries).map((entry) => JSON.stringify(entry.action)),
    );
  });
});

// ---------------------------------------------------------------------------
// 4b · T-155 · The volume brain, and the run report's claims as checks
//
// The run artifact (`docs/playtests/T-155-pilot-validation.md`) is evidence about
// one afternoon; these are what keep it true. Part F's rule: "a committed,
// re-runnable check, not a one-off manual confirmation."
// ---------------------------------------------------------------------------

describe('T-155 · the random brain is the volume leg the audit claim rests on', () => {
  it('is deterministic across two independent runs of the same seed', async () => {
    const run = async (): Promise<string[]> => {
      const { entries } = await runPilot({
        transport: spyTransport().transport,
        brain: randomBrain(7),
        seed: 7,
        days: 30,
        now: () => 1_700_000_000_000,
        runId: 'test-random-determinism',
      });
      return actionSequence(entries);
    };
    const first = await run();
    const second = await run();
    expect(first.length).toBeGreaterThan(30);
    expect(firstDivergence(first, second)).toBeNull();
  });

  it('is not first-legal in disguise — it exercises real verb breadth', async () => {
    const { entries } = await runPilot({
      transport: spyTransport().transport,
      brain: randomBrain(3),
      seed: 3,
      days: 30,
      now: () => 0,
      runId: 'test-random-breadth',
    });
    const { entries: smoke } = await runPilot({
      transport: spyTransport().transport,
      brain: firstLegalBrain(),
      seed: 3,
      days: 30,
      now: () => 0,
      runId: 'test-first-legal-breadth',
    });

    const verbs = (log: readonly PilotLogEntry[]): Set<string> =>
      new Set(steps(log).map((entry) => entry.chosen.specType));

    // A FLOOR, not an exact set: content growth must not make this brittle, but a
    // silent regression to "sign a contract, abandon it, end the day" must fail.
    // Measured at 23 distinct specTypes on 2026-08-04; `first-legal` reaches 3.
    expect(verbs(entries).size).toBeGreaterThanOrEqual(8);
    expect(verbs(entries).size).toBeGreaterThan(verbs(smoke).size);
  });

  it('completes 30 days x 3 seeds with every counter at zero', async () => {
    for (const seed of [1, 2, 3]) {
      const { summary } = await runPilot({
        transport: spyTransport().transport,
        brain: randomBrain(seed),
        seed,
        days: 30,
        now: () => 0,
        runId: `test-volume-s${seed}`,
      });
      // T-155's Accept criterion 1, encoded — a regression fails CI rather than
      // waiting for someone to re-read a markdown file.
      expect(runPassed(summary)).toBe(true);
      expect(summary.illegalAttempts).toBe(0);
      expect(summary.blockedFromLegal).toBe(0);
      expect(summary.protocolErrors).toBe(0);
      expect(summary.diceBoundsViolations).toBe(0);
      expect(summary.daysPlayed).toBe(30);
      expect(summary.stoppedBy).toBe('days');
      expect(summary.stepsApplied).toBeGreaterThan(30);
    }
  });
});

describe('T-155 · actionSequence normalises exactly the volatile fields, and no more', () => {
  async function trail(runId: string, startedAt: number): Promise<PilotLogEntry[]> {
    const { entries } = await runPilot({
      transport: spyTransport().transport,
      brain: randomBrain(5),
      seed: 5,
      days: 4,
      now: () => startedAt,
      runId,
    });
    return entries;
  }

  it('ignores runId, startedAt and latencyMs', async () => {
    const a = await trail('run-a', 1_700_000_000_000);
    const b = await trail('run-b', 1_900_000_000_000);
    // The raw trails differ — that is the whole reason the normaliser exists.
    expect(toJsonl(a)).not.toBe(toJsonl(b));
    expect(actionSequence(a)).toEqual(actionSequence(b));
  });

  it('still diverges when a single action parameter changes', async () => {
    const a = await trail('run-a', 0);
    const mutated = parseJsonl(toJsonl(a));
    const stepEntries = mutated.filter((entry): entry is PilotStepEntry => entry.type === 'step');
    const index = stepEntries.findIndex((entry) => entry.action !== null);
    expect(index).toBeGreaterThanOrEqual(0);
    stepEntries[index].action = {
      ...(stepEntries[index].action as object),
      spendDie: 99,
    } as PlayerAction;
    expect(firstDivergence(actionSequence(a), actionSequence(mutated))).toBe(index);
  });

  it('reports a divergence index through the CLI --compare path', async () => {
    const a = await trail('run-a', 0);
    const mutated = parseJsonl(toJsonl(a));
    const stepEntries = mutated.filter((entry): entry is PilotStepEntry => entry.type === 'step');
    stepEntries[2].chosen.id = 'a99';

    const same = comparePilotRuns(toJsonl(a), toJsonl(parseJsonl(toJsonl(a))));
    expect(same.identical).toBe(true);
    expect(same.report).toContain('IDENTICAL');

    const different = comparePilotRuns(toJsonl(a), toJsonl(mutated));
    expect(different.identical).toBe(false);
    expect(different.report).toContain('DIVERGED at step index 2');
  });
});

describe('T-155 · the CLI wires the new brain and the new mode', () => {
  it('accepts --brain random', () => {
    const parsed = parsePilotArgs(['--brain', 'random', '--seed', '4', '--days', '30']);
    expect(parsed).toMatchObject({ mode: 'run', brain: 'random', seeds: [4], days: 30 });
  });

  it('anchors every relative path on the repo root, not on the workspace cwd (F-155-2)', () => {
    // `npm run pilot` runs with cwd = packages/sim, while the DEFAULT out dir is
    // built from REPO_ROOT. A relative `--out`/`--replay` used to mean a different
    // directory from the default, so PILOT.md's own documented replay command
    // could not find the file the documented run had just written.
    const repoRoot = resolve(fileURLToPath(import.meta.url), '../../../../..');
    const parsed = parsePilotArgs([
      '--out',
      'test-results/pilot/x',
      '--brain',
      'recorded',
      '--replay',
      'test-results/pilot/prior.jsonl',
    ]);
    expect(parsed).toMatchObject({
      mode: 'run',
      outDir: join(repoRoot, 'test-results/pilot/x'),
      replay: join(repoRoot, 'test-results/pilot/prior.jsonl'),
    });
    const absolute = parsePilotArgs(['--out', join(repoRoot, 'elsewhere')]);
    expect(absolute).toMatchObject({ outDir: join(repoRoot, 'elsewhere') });
  });

  it('rejects --compare mixed with run flags rather than ignoring them', () => {
    expect(() => parsePilotArgs(['--compare', 'a.jsonl', 'b.jsonl'])).not.toThrow();
    expect(() =>
      parsePilotArgs(['--compare', 'a.jsonl', 'b.jsonl', '--brain', 'anthropic']),
    ).toThrow(/--compare takes no other flags/);
    expect(() => parsePilotArgs(['--compare', 'only-one.jsonl'])).toThrow(/two paths/);
  });
});

// ---------------------------------------------------------------------------
// 5 · The enumerator itself
// ---------------------------------------------------------------------------

describe('T-154 · candidate enumeration fills only declared domains', () => {
  function liveLegalActions(): LegalActions {
    const handler = makeSessionHandler();
    handler({ type: 'new-game', seed: 1 });
    handler({ type: 'start-day' });
    const response = handler({ type: 'legal-actions' });
    if (response.type !== 'legal-actions') throw new Error('expected legal-actions');
    return response.legalActions;
  }

  it('fills every parameter from its own ParamSpec, and nothing else', () => {
    const legal = liveLegalActions();
    const { candidates } = enumerateCandidates(legal, { perSpecCap: 8, totalCap: 200 });
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      if (candidate.kind !== 'action' || candidate.specType === 'Wait') continue;
      const spec = legal.actions[candidate.specIndex];
      expect(specTypeOf(spec)).toBe(candidate.specType);
      expect(specAdvertises(spec, candidate.action!)).toBe(true);
    }
  });

  it('offers every advertised spec before it deepens any one of them', () => {
    const legal = liveLegalActions();
    const { candidates } = enumerateCandidates(legal, { perSpecCap: 8, totalCap: 200 });
    const covered = new Set(
      candidates
        .filter((candidate) => candidate.specIndex >= 0)
        .map((candidate) => candidate.specIndex),
    );
    expect(covered.size).toBe(legal.actions.length);
  });

  it('always offers a way to end the day', () => {
    const legal = liveLegalActions();
    const { candidates } = enumerateCandidates(legal, { perSpecCap: 1, totalCap: 1 });
    expect(candidates.some((candidate) => candidate.kind === 'lifecycle')).toBe(true);
  });

  it('assigns stable ids for the same legal-actions payload', () => {
    const first = enumerateCandidates(liveLegalActions());
    const second = enumerateCandidates(liveLegalActions());
    expect(JSON.stringify(first.candidates)).toBe(JSON.stringify(second.candidates));
  });
});
