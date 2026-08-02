// ---------------------------------------------------------------------------
// T-154 · THE NATIVE LLM PILOT — pure core.
//
// A driver that puts an LLM in the PLAYER's seat and has it pick one action per
// step off the engine's own `legal-actions` enumerator, through the protocol seam
// (`protocol.ts` / `protocol-stdio.ts` `makeSessionHandler`). No dependency on the
// external UGT package; `packages/sim/PILOT.md` is the operator's manual.
//
// WHY A PROTOCOL DRIVER AND NOT A `SimPolicy` (the task offered either):
//
//   1. `SimPolicy` is SYNCHRONOUS (`./index.ts` — `(context) => PlayerAction[]`).
//      An LLM call is async. A policy cannot await one without either blocking the
//      day loop or pre-computing every decision, and both are worse than the
//      alternative.
//   2. `balance/gate.ts` `SWEEP_INVARIANT_DISPOSITIONS` records exactly why the
//      sweep cannot see the protocol invariants: "the sim policies form actions
//      directly, never off the `legal-actions` enumerator". Driving the seam IS
//      the point — it is what gives this driver a `blockedFromLegal` denominator
//      that a `SimPolicy` structurally cannot have.
//
// THE NO-FABRICATION GUARANTEE, AND WHY IT IS STRUCTURAL RATHER THAN VALIDATED:
// a {@link PilotBrain} can only ever return a CANDIDATE ID. There is no code path
// anywhere in this module that builds a `PlayerAction` field out of brain-supplied
// values — every candidate is formed by {@link enumerateCandidates} from a
// `LegalActionSpec` and its declared `ParamSpec` domains, before the brain is ever
// asked. An answer that names nothing in that list is REJECTED and LOGGED, never
// coerced into an action. {@link assertCandidateIsLegal} is belt-and-braces on top
// of that: it re-checks every filled parameter against the LIVE spec immediately
// before dispatch, so a future enumerator bug surfaces as a logged rejection
// rather than as a fabricated action reaching the engine.
//
// PURITY: no I/O, no `Math.random`, no ambient clock. The transport is injected
// (`PilotTransport`) and so is the clock (`now`), which is what makes a run's JSONL
// byte-reproducible under a deterministic brain. All filesystem/argv work lives in
// `pilot-cli.ts`; the network client lives in `pilot-anthropic.ts`.
//
// SCOPE (state this wherever the pilot is cited): this is a PROTOCOL/STATE-LEVEL
// driver. It cannot see UI-only bugs by construction — see PILOT.md §2 and
// `docs/TESTING-STRATEGY.md` Part D's bridge-blind-spot warning.
// ---------------------------------------------------------------------------

import { MAX_DAWN_HAND_SIZE } from '@spacerquest/content';
import type { Edition, GameEvent, PlayerAction } from '@spacerquest/engine';

import type {
  LegalActionSpec,
  LegalActions,
  ParamSpec,
  ProtocolRequest,
  ProtocolResponse,
  StateSummary,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/**
 * The seam. `makeSessionHandler()` from `./protocol-stdio.js` satisfies this
 * directly; so does a socket client, so does a spy in a test. PROTOCOL.md
 * § Transports is explicit that stdio and WebSocket are the same reducer behind
 * bytes, which is why this task deliberately ships NO stdio-subprocess transport:
 * it would add flake and prove nothing `protocol.test.ts` does not already prove.
 */
export type PilotTransport = (
  request: ProtocolRequest,
) => ProtocolResponse | Promise<ProtocolResponse>;

// ---------------------------------------------------------------------------
// Candidates — the only things a brain may name
// ---------------------------------------------------------------------------

/** One concrete, fully-parameterised move formed from a {@link LegalActionSpec}. */
export interface PilotCandidate {
  /** Stable within a step, and the ONLY token a brain may return. */
  id: string;
  /** Human/LLM-readable rendering, e.g. `Travel {destinationId: 2, spendDie: 0}`. */
  label: string;
  /** `action` → `apply-action`; `lifecycle` → a day-loop transition. */
  kind: 'action' | 'lifecycle';
  action?: PlayerAction;
  lifecycle?: 'end-day';
  /** Index into `legalActions.actions` this was filled from (-1 for lifecycle/Wait). */
  specIndex: number;
  /** T-1604a P4's `specType` — the CLASS actually sent, so a per-id ledger is verifiable. */
  specType: string;
  /** The spec's own caveat, passed through verbatim. */
  note?: string;
}

/** Why a brain's answer was refused. Every one of these is logged, never applied. */
export type PilotRejectionReason =
  'unparseable' | 'unknown-candidate-id' | 'brain-error' | 'refusal' | 'illegal-candidate';

export interface PilotDecision {
  candidateId: string;
  reason?: string;
  meta?: Record<string, unknown>;
}

/** An answer the driver could not map. `raw` is logged verbatim. */
export interface PilotUnmappedAnswer {
  raw: string;
  reason?: PilotRejectionReason;
  meta?: Record<string, unknown>;
}

export interface PilotDecisionContext {
  summary: StateSummary;
  legal: LegalActions;
  candidates: readonly PilotCandidate[];
  day: number;
  step: number;
  /** True when a candidate cap fired — recorded, never silently swallowed. */
  truncated: boolean;
}

export interface PilotBrain {
  readonly kind: string;
  readonly model?: string;
  decide(context: PilotDecisionContext): Promise<PilotDecision | PilotUnmappedAnswer>;
}

// ---------------------------------------------------------------------------
// Candidate enumeration
// ---------------------------------------------------------------------------

/**
 * How many candidates one spec may contribute. Coverage beats depth: the caps
 * exist so a single wide spec (a Hangout with seven venues x nine opponents x two
 * unbounded int bands) cannot crowd every other verb out of the prompt — which is
 * T-1604a's P3 failure ("truncation is silent starvation") wearing a different hat.
 */
export const DEFAULT_PER_SPEC_CANDIDATE_CAP = 8;
/** How many candidates the whole step may carry, filled round-robin across specs. */
export const DEFAULT_TOTAL_CANDIDATE_CAP = 60;

/**
 * The deterministic ladder an unbounded `int` domain is sampled at. Every sampled
 * value is INSIDE the declared domain, so it can never be illegal; sampling rather
 * than enumerating is what keeps buy-fuel / pay-debt / tiers / pod quantity from
 * flooding the list. Order is fixed (min, midpoint, max) because T-155's replay
 * depends on candidate ordering being reproducible.
 */
function intLadder(spec: Extract<ParamSpec, { kind: 'int' }>): number[] {
  const mid = Math.floor((spec.min + spec.max) / 2);
  const ladder = [spec.min, mid, spec.max];
  return [...new Set(ladder.filter((value) => value >= spec.min && value <= spec.max))];
}

function paramDomain(spec: ParamSpec): (string | number)[] {
  switch (spec.kind) {
    case 'die-index':
    case 'system-id':
    case 'contract-index':
      return [...spec.choices];
    case 'enum':
      return [...spec.choices];
    case 'int':
      return intLadder(spec);
    case 'fixed':
      return [spec.value];
  }
}

/** True when `value` sits inside the spec's own declared domain. */
export function paramValueIsLegal(spec: ParamSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'die-index':
    case 'system-id':
    case 'contract-index':
      return typeof value === 'number' && spec.choices.includes(value);
    case 'enum':
      return (
        (typeof value === 'string' || typeof value === 'number') && spec.choices.includes(value)
      );
    case 'int':
      return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= spec.min &&
        value <= spec.max
      );
    case 'fixed':
      return value === spec.value;
  }
}

/** The class actually sent — `Trade/buy-fuel`, `Storylet/id#choice`, `Travel`. */
export function specTypeOf(spec: LegalActionSpec): string {
  if (spec.storyletId !== undefined) {
    return `Storylet/${spec.storyletId}#${spec.choiceId ?? ''}`;
  }
  if (spec.action !== undefined) return `${spec.type}/${spec.action}`;
  return spec.type;
}

function renderLabel(specType: string, filled: Record<string, string | number>): string {
  const keys = Object.keys(filled);
  if (keys.length === 0) return specType;
  const rendered = keys.map((key) => `${key}=${String(filled[key])}`).join(', ');
  return `${specType} {${rendered}}`;
}

/**
 * Fill one spec into at most `perSpecCap` concrete candidates.
 *
 * ORDER: an odometer in which the FIRST declared parameter varies FASTEST. That
 * is deliberate and it is the whole reason the cap is survivable — the leading
 * parameter is the discriminating one in every wide spec the enumerator produces
 * (`venue` on VisitHangout, `move` on Dare, `stance` on Combat, `destinationId` on
 * Travel, `roleId` on Crew, `equipment` on the yard). With the conventional
 * last-fastest odometer, a cap of 8 on VisitHangout would return eight rows that
 * all say `venue=dare`, and the loan desk would be invisible to the pilot forever.
 */
function fillSpec(
  spec: LegalActionSpec,
  specIndex: number,
  perSpecCap: number,
): { candidates: Omit<PilotCandidate, 'id'>[]; truncated: boolean } {
  const keys = Object.keys(spec.params);
  const domains = keys.map((key) => paramDomain(spec.params[key]));
  // A spec with an empty declared domain is unfillable; the enumerator withholds
  // such verbs entirely (PROTOCOL.md), so this is defence, not an expected path.
  if (domains.some((domain) => domain.length === 0)) return { candidates: [], truncated: false };

  const total = domains.reduce((product, domain) => product * domain.length, 1);
  const take = Math.min(total, perSpecCap);
  const specType = specTypeOf(spec);
  const candidates: Omit<PilotCandidate, 'id'>[] = [];

  for (let n = 0; n < take; n += 1) {
    const filled: Record<string, string | number> = {};
    let remainder = n;
    for (let k = 0; k < keys.length; k += 1) {
      const domain = domains[k];
      filled[keys[k]] = domain[remainder % domain.length]!;
      remainder = Math.floor(remainder / domain.length);
    }
    const action = {
      type: spec.type,
      ...(spec.action !== undefined ? { action: spec.action } : {}),
      ...(spec.storyletId !== undefined ? { storyletId: spec.storyletId } : {}),
      ...(spec.choiceId !== undefined ? { choiceId: spec.choiceId } : {}),
      ...filled,
    } as PlayerAction;
    candidates.push({
      label: renderLabel(specType, filled),
      kind: 'action',
      action,
      specIndex,
      specType,
      ...(spec.note !== undefined ? { note: spec.note } : {}),
    });
  }

  return { candidates, truncated: take < total };
}

/**
 * Turn a `legal-actions` response into the concrete, fully-parameterised moves a
 * brain may choose between. Deterministic: spec order, then declared choice order.
 * `truncated` is true when either cap fired, and it rides on the step's log entry —
 * a starved list is a finding, not a footnote.
 */
export function enumerateCandidates(
  legal: LegalActions,
  options: { perSpecCap?: number; totalCap?: number } = {},
): { candidates: PilotCandidate[]; truncated: boolean } {
  const perSpecCap = options.perSpecCap ?? DEFAULT_PER_SPEC_CANDIDATE_CAP;
  const totalCap = options.totalCap ?? DEFAULT_TOTAL_CANDIDATE_CAP;

  let truncated = false;
  const perSpec: Omit<PilotCandidate, 'id'>[][] = [];
  for (let index = 0; index < legal.actions.length; index += 1) {
    const filled = fillSpec(legal.actions[index], index, perSpecCap);
    if (filled.truncated) truncated = true;
    perSpec.push(filled.candidates);
  }

  // ROUND-ROBIN across specs, so every advertised verb is represented before any
  // one verb gets a second filling. Then re-sorted back into (spec, fill) order so
  // the printed list reads as the enumerator wrote it.
  const selected: { specIndex: number; fillIndex: number; body: Omit<PilotCandidate, 'id'> }[] = [];
  const depth = perSpec.reduce((max, list) => Math.max(max, list.length), 0);
  outer: for (let round = 0; round < depth; round += 1) {
    for (let index = 0; index < perSpec.length; index += 1) {
      const body = perSpec[index][round];
      if (body === undefined) continue;
      if (selected.length >= totalCap) {
        truncated = true;
        break outer;
      }
      selected.push({ specIndex: index, fillIndex: round, body });
    }
  }
  selected.sort((a, b) => a.specIndex - b.specIndex || a.fillIndex - b.fillIndex);

  const bodies: Omit<PilotCandidate, 'id'>[] = selected.map((entry) => entry.body);

  // Wait and end-day are never subject to the caps: they are the two moves that
  // guarantee the driver can always make progress, so starving them would turn a
  // truncation into a stall.
  if (legal.canWait) {
    bodies.push({
      label: 'Wait (spend no die, pass the beat)',
      kind: 'action',
      action: { type: 'Wait' },
      specIndex: -1,
      specType: 'Wait',
    });
  }
  if (legal.lifecycle.includes('end-day')) {
    bodies.push({
      label: 'End the day (run dusk, advance to the next dawn)',
      kind: 'lifecycle',
      lifecycle: 'end-day',
      specIndex: -1,
      specType: 'end-day',
    });
  }

  const candidates: PilotCandidate[] = bodies.map((body, index) => ({
    id: `a${String(index).padStart(2, '0')}`,
    ...body,
  }));
  return { candidates, truncated };
}

// ---------------------------------------------------------------------------
// The legality re-check (belt and braces)
// ---------------------------------------------------------------------------

const DISCRIMINANT_KEYS = new Set(['type', 'action', 'storyletId', 'choiceId']);

/**
 * Re-verify a candidate against the LIVE `legal-actions` immediately before
 * dispatch. Nothing a brain says can reach this — it guards against an
 * ENUMERATOR bug, so that a mis-filled parameter becomes a logged rejection
 * instead of an action the engine was never offered.
 */
export function assertCandidateIsLegal(
  candidate: PilotCandidate,
  legal: LegalActions,
): { ok: true } | { ok: false; detail: string } {
  if (candidate.kind === 'lifecycle') {
    return legal.lifecycle.includes('end-day')
      ? { ok: true }
      : { ok: false, detail: 'end-day is not an advertised lifecycle transition' };
  }
  const action = candidate.action;
  if (action === undefined) return { ok: false, detail: 'action candidate carries no action' };
  if (candidate.specType === 'Wait') {
    return legal.canWait ? { ok: true } : { ok: false, detail: 'Wait is not legal right now' };
  }

  const spec = legal.actions[candidate.specIndex];
  if (spec === undefined) {
    return { ok: false, detail: `no spec at index ${candidate.specIndex}` };
  }
  if (specTypeOf(spec) !== candidate.specType) {
    return {
      ok: false,
      detail: `spec ${candidate.specIndex} is ${specTypeOf(spec)}, candidate claims ${candidate.specType}`,
    };
  }

  const fields = action as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(fields)) {
    if (DISCRIMINANT_KEYS.has(key)) continue;
    const paramSpec = spec.params[key];
    if (paramSpec === undefined) {
      return { ok: false, detail: `${key} is not a declared parameter of ${candidate.specType}` };
    }
    if (!paramValueIsLegal(paramSpec, value)) {
      return { ok: false, detail: `${key}=${String(value)} is outside its declared domain` };
    }
  }
  for (const key of Object.keys(spec.params)) {
    if (!(key in fields)) {
      return { ok: false, detail: `${key} is declared but the candidate did not fill it` };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Decision resolution — the "never fabricated" gate
// ---------------------------------------------------------------------------

export type PilotResolution =
  | { ok: true; candidate: PilotCandidate; reason?: string }
  | { ok: false; reason: PilotRejectionReason; raw: string };

/**
 * Map a brain's answer onto a candidate, or refuse it. The refusal path NEVER
 * constructs an action — that is the structural half of the no-fabrication
 * guarantee, and it is why an LLM cannot invent a `spendDie` or a destination
 * however creatively it answers.
 */
export function resolveDecision(
  answer: PilotDecision | PilotUnmappedAnswer,
  candidates: readonly PilotCandidate[],
  legal: LegalActions,
): PilotResolution {
  if (!('candidateId' in answer)) {
    return { ok: false, reason: answer.reason ?? 'unparseable', raw: answer.raw };
  }
  const candidate = candidates.find((entry) => entry.id === answer.candidateId);
  if (candidate === undefined) {
    return { ok: false, reason: 'unknown-candidate-id', raw: answer.candidateId };
  }
  const legality = assertCandidateIsLegal(candidate, legal);
  if (!legality.ok) {
    return {
      ok: false,
      reason: 'illegal-candidate',
      raw: `${candidate.id}: ${legality.detail}`,
    };
  }
  return { ok: true, candidate, ...(answer.reason !== undefined ? { reason: answer.reason } : {}) };
}

// ---------------------------------------------------------------------------
// Deterministic brains (no SDK, no network — usable in tests and dry runs)
// ---------------------------------------------------------------------------

/**
 * Picks the first candidate that SPENDS THE DAY rather than ending it, so a dry
 * run is never vacuous (T-1604a §3: a run that applied nothing measured nothing).
 *
 * "Spends the day" means SPENDS A DIE, and once no die-costed move is left it ENDS
 * THE DAY. Both halves are load-bearing, and both were learned the same way: `Wait`
 * is legal for the whole of DAY and `Trade/pay-debt` costs credits rather than a
 * die, so a plain "first non-`Wait`" rule loops on one of them until the per-day
 * step cap forces the transition — 40 no-op steps a day, every day, each one
 * counted in `stepsApplied` as though it were work.
 */
export function firstLegalBrain(): PilotBrain {
  return {
    kind: 'first-legal',
    decide(context) {
      const acting = context.candidates.find(
        (candidate) =>
          candidate.kind === 'action' &&
          candidate.action !== undefined &&
          'spendDie' in candidate.action,
      );
      const ending = context.candidates.find((candidate) => candidate.kind === 'lifecycle');
      const chosen = acting ?? ending ?? context.candidates[0];
      if (chosen === undefined) {
        return Promise.resolve({ raw: '<no candidates>', reason: 'unparseable' as const });
      }
      return Promise.resolve({
        candidateId: chosen.id,
        reason:
          acting === undefined ? 'nothing left to spend a die on' : 'first legal die-spending move',
      });
    },
  };
}

/** Replays a fixed id sequence; falls back to the first candidate once exhausted. */
export function scriptedBrain(ids: readonly string[]): PilotBrain {
  let cursor = 0;
  return {
    kind: 'scripted',
    decide(context) {
      const id = ids[cursor];
      cursor += 1;
      if (id === undefined) {
        const fallback = context.candidates[context.candidates.length - 1];
        return Promise.resolve(
          fallback === undefined
            ? { raw: '<script exhausted>', reason: 'unparseable' as const }
            : { candidateId: fallback.id, reason: 'script exhausted' },
        );
      }
      return Promise.resolve({ candidateId: id, reason: 'scripted' });
    },
  };
}

/**
 * THE REPRODUCIBILITY LEVER (T-155). LLM sampling is not pinned; a recorded run's
 * JSONL is. Feeding a prior run's `step` entries back through this brain replays
 * the same action sequence against the same seed, byte for byte.
 */
export function recordedBrain(entries: readonly PilotLogEntry[]): PilotBrain {
  const ids = entries
    .filter((entry): entry is PilotStepEntry => entry.type === 'step')
    .map((entry) => entry.chosen.id);
  const scripted = scriptedBrain(ids);
  return { kind: 'recorded', decide: (context) => scripted.decide(context) };
}

// ---------------------------------------------------------------------------
// The JSONL log shape (mirrors T-1604a's per-action trail, plus state deltas)
// ---------------------------------------------------------------------------

export interface PilotStateSnapshot {
  day: number;
  phase: string;
  credits: number;
  debt: number;
  fuel: number;
  systemId: number;
  diceRemaining: number[];
}

export interface PilotStateDelta {
  credits: number;
  debt: number;
  fuel: number;
  diceSpent: number;
  systemChanged: boolean;
}

export interface PilotRejectionRecord {
  raw: string;
  reason: PilotRejectionReason;
}

export interface PilotRunStartEntry {
  type: 'run-start';
  runId: string;
  seed: number;
  edition: Edition;
  days: number;
  brain: string;
  model: string | null;
  startedAt: number;
  engineNote: string;
}

export interface PilotStepEntry {
  type: 'step';
  n: number;
  day: number;
  phase: string;
  candidateCount: number;
  truncated: boolean;
  chosen: {
    id: string;
    label: string;
    specType: string;
    specIndex: number;
    note: string | null;
  };
  action: PlayerAction | null;
  lifecycle: 'end-day' | null;
  brain: {
    kind: string;
    model: string | null;
    reason: string | null;
    latencyMs: number;
    meta: Record<string, unknown> | null;
  };
  rejected: PilotRejectionRecord[];
  fellBack: boolean;
  response: ProtocolResponse['type'];
  events: GameEvent[];
  blocked: boolean;
  blockReason: string | null;
  before: PilotStateSnapshot;
  after: PilotStateSnapshot;
  delta: PilotStateDelta;
}

export interface PilotLifecycleEntry {
  type: 'lifecycle';
  n: number;
  day: number;
  transition: 'start-day' | 'end-day' | 'forced-end-day';
  response: ProtocolResponse['type'];
  before: PilotStateSnapshot;
  after: PilotStateSnapshot;
}

export interface PilotErrorEntry {
  type: 'protocol-error';
  n: number;
  day: number;
  request: ProtocolRequest['type'];
  code: string;
  message: string;
}

export interface PilotRunSummary {
  type: 'run-summary';
  runId: string;
  stepsApplied: number;
  illegalAttempts: number;
  fallbacks: number;
  /**
   * UGT `inv_blocked_from_legal_non_increasing` — `balance/gate.ts`
   * SWEEP_INVARIANT_DISPOSITIONS records this as `not-observable` by the sweep and
   * names T-154/T-155 as owning it. It counts `action-result`s carrying an
   * `ActionBlocked` for an action that was picked off `legal-actions`; detected by
   * scanning `events`, NOT by an error code (PROTOCOL.md § apply-action). It must
   * be 0 — that IS the enumerator-parity claim.
   */
  blockedFromLegal: number;
  /** UGT `inv_protocol_errors_non_increasing` — same disposition row, same owner. Must be 0. */
  protocolErrors: number;
  /** UGT `inv_dice_bounds` — same disposition row, same owner. Must be 0. */
  diceBoundsViolations: number;
  daysPlayed: number;
  finalDay: number;
  stoppedBy: 'days' | 'stop-signal' | 'protocol-error';
  brain: string;
  model: string | null;
  seed: number;
}

export type PilotLogEntry =
  PilotRunStartEntry | PilotStepEntry | PilotLifecycleEntry | PilotErrorEntry | PilotRunSummary;

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_STEPS_PER_DAY = 40;
export const DEFAULT_MAX_BRAIN_RETRIES = 2;

export interface PilotRunOptions {
  transport: PilotTransport;
  brain: PilotBrain;
  seed: number;
  days: number;
  edition?: Edition;
  maxStepsPerDay?: number;
  maxBrainRetries?: number;
  perSpecCap?: number;
  totalCap?: number;
  /** Injected clock. Pin it and a deterministic brain gives byte-identical JSONL. */
  now?: () => number;
  runId?: string;
  /** Called once per entry, in order — the CLI flushes each line here. */
  onEntry?: (entry: PilotLogEntry) => void;
}

export interface PilotRunResult {
  summary: PilotRunSummary;
  entries: PilotLogEntry[];
}

/** `{ actions: [], canWait: false, lifecycle: [] }` — PROTOCOL.md's stop signal. */
export function isStopSignal(legal: LegalActions): boolean {
  return legal.actions.length === 0 && !legal.canWait && legal.lifecycle.length === 0;
}

function snapshot(summary: StateSummary): PilotStateSnapshot {
  return {
    day: summary.day,
    phase: String(summary.phase),
    credits: summary.credits,
    debt: summary.debt,
    fuel: summary.fuel,
    systemId: summary.systemId,
    diceRemaining: [...summary.diceRemaining],
  };
}

function deltaOf(before: PilotStateSnapshot, after: PilotStateSnapshot): PilotStateDelta {
  return {
    credits: after.credits - before.credits,
    debt: after.debt - before.debt,
    fuel: after.fuel - before.fuel,
    diceSpent: before.diceRemaining.length - after.diceRemaining.length,
    systemChanged: before.systemId !== after.systemId,
  };
}

/**
 * The Rimward dawn hand is a hand of **d20s**, not d6s (`engine/src/rng.ts`
 * `rollHand` → `d20()`, and `dice.ts` `check()` branches on nat-20 / nat-1). The
 * hand SIZE ceiling is content's `MAX_DAWN_HAND_SIZE`, imported rather than
 * restated so a content change moves this check with it.
 */
const DAWN_DIE_SIDES = 20;

function diceBoundsViolation(summary: StateSummary): boolean {
  const hand = summary.dawnHand;
  if (hand === null) return summary.diceRemaining.length > 0;
  if (hand.dice.length > MAX_DAWN_HAND_SIZE) return true;
  if (hand.spent.length !== hand.dice.length) return true;
  if (hand.dice.some((face) => !Number.isInteger(face) || face < 1 || face > DAWN_DIE_SIDES)) {
    return true;
  }
  if (summary.diceRemaining.length > hand.dice.length) return true;
  return summary.diceRemaining.some((index) => index < 0 || index >= hand.dice.length);
}

function blockedReason(events: readonly GameEvent[]): string | null {
  for (const event of events) {
    if (event.type !== 'ActionBlocked') continue;
    const reason = (event as unknown as { reason?: unknown }).reason;
    return typeof reason === 'string' ? reason : 'unknown';
  }
  return null;
}

/**
 * Drive one seeded career through the protocol seam with an LLM (or a
 * deterministic stand-in) in the player's seat. The loop is exactly PROTOCOL.md's:
 * `new-game` → per day `start-day` → { `legal-actions` → enumerate → brain →
 * resolve → `apply-action` } → `end-day`, stopping on the stop signal or `days`.
 */
export async function runPilot(options: PilotRunOptions): Promise<PilotRunResult> {
  const {
    transport,
    brain,
    seed,
    days,
    edition = 'full',
    maxStepsPerDay = DEFAULT_MAX_STEPS_PER_DAY,
    maxBrainRetries = DEFAULT_MAX_BRAIN_RETRIES,
    perSpecCap,
    totalCap,
    now = () => Date.now(),
    onEntry,
  } = options;

  const entries: PilotLogEntry[] = [];
  const emit = (entry: PilotLogEntry): void => {
    entries.push(entry);
    onEntry?.(entry);
  };

  const runId = options.runId ?? `${brain.kind}-s${seed}-d${days}-${now()}`;
  let stepCounter = 0;
  let stepsApplied = 0;
  let illegalAttempts = 0;
  let fallbacks = 0;
  let blockedFromLegal = 0;
  let protocolErrors = 0;
  let diceBoundsViolations = 0;
  let daysPlayed = 0;
  let stoppedBy: PilotRunSummary['stoppedBy'] = 'days';

  emit({
    type: 'run-start',
    runId,
    seed,
    edition,
    days,
    brain: brain.kind,
    model: brain.model ?? null,
    startedAt: now(),
    engineNote: 'protocol seam (handleMessage reducer); protocol/state level only, not the UI',
  });

  // A BOX rather than a bare `let`. `send` is a closure and assigns the live
  // summary from inside it; TypeScript's flow analysis only sees outer-scope
  // assignments, so a plain `let current: StateSummary | null = null` narrows to
  // `null` forever and every read below becomes `never`. A property on an object
  // is not flow-narrowed that way, so the box keeps the type honest instead of
  // scattering assertions through the loop.
  const box: { summary: StateSummary | null } = { summary: null };
  /** The live summary, after the bootstrap guard below has proved it exists. */
  const state = (): StateSummary => box.summary as StateSummary;

  const send = async (
    request: ProtocolRequest,
  ): Promise<{ response: ProtocolResponse; ok: boolean }> => {
    const response = await transport(request);
    if (response.type === 'error') {
      protocolErrors += 1;
      stepCounter += 1;
      emit({
        type: 'protocol-error',
        n: stepCounter,
        day: box.summary?.day ?? 0,
        request: request.type,
        code: response.code,
        message: response.message,
      });
      return { response, ok: false };
    }
    if (response.type === 'state-summary' || response.type === 'action-result') {
      box.summary = response.summary;
      if (diceBoundsViolation(response.summary)) diceBoundsViolations += 1;
    }
    return { response, ok: true };
  };

  const finish = (): PilotRunResult => {
    const summary: PilotRunSummary = {
      type: 'run-summary',
      runId,
      stepsApplied,
      illegalAttempts,
      fallbacks,
      blockedFromLegal,
      protocolErrors,
      diceBoundsViolations,
      daysPlayed,
      finalDay: box.summary?.day ?? 0,
      stoppedBy,
      brain: brain.kind,
      model: brain.model ?? null,
      seed,
    };
    emit(summary);
    return { summary, entries };
  };

  const start = await send({ type: 'new-game', seed, edition });
  if (!start.ok || box.summary === null) {
    stoppedBy = 'protocol-error';
    return finish();
  }

  const askLegal = async (): Promise<LegalActions | null> => {
    const result = await send({ type: 'legal-actions' });
    return result.response.type === 'legal-actions' ? result.response.legalActions : null;
  };

  dayLoop: for (let day = 0; day < days; day += 1) {
    let legal = await askLegal();
    if (legal === null) {
      stoppedBy = 'protocol-error';
      break;
    }
    if (isStopSignal(legal)) {
      stoppedBy = 'stop-signal';
      break;
    }

    if (legal.lifecycle.includes('start-day')) {
      const before = snapshot(state());
      stepCounter += 1;
      const started = await send({ type: 'start-day' });
      emit({
        type: 'lifecycle',
        n: stepCounter,
        day: before.day,
        transition: 'start-day',
        response: started.response.type,
        before,
        after: snapshot(state()),
      });
      if (!started.ok) {
        stoppedBy = 'protocol-error';
        break;
      }
    }

    let dayEnded = false;
    for (let step = 0; step < maxStepsPerDay && !dayEnded; step += 1) {
      legal = await askLegal();
      if (legal === null) {
        stoppedBy = 'protocol-error';
        break dayLoop;
      }
      if (isStopSignal(legal)) {
        stoppedBy = 'stop-signal';
        break dayLoop;
      }

      const enumerated = enumerateCandidates(legal, { perSpecCap, totalCap });
      const candidates = enumerated.candidates;
      if (candidates.length === 0) break;

      // --- ask the brain, refusing anything it cannot name -------------------
      const rejected: PilotRejectionRecord[] = [];
      let chosen: PilotCandidate | null = null;
      let chosenReason: string | null = null;
      let chosenMeta: Record<string, unknown> | null = null;
      let latencyMs = 0;

      for (let attempt = 0; attempt <= maxBrainRetries && chosen === null; attempt += 1) {
        const startedAt = now();
        let answer: PilotDecision | PilotUnmappedAnswer;
        try {
          answer = await brain.decide({
            summary: state(),
            legal,
            candidates,
            day: state().day,
            step,
            truncated: enumerated.truncated,
          });
        } catch (error) {
          latencyMs += now() - startedAt;
          rejected.push({
            raw: error instanceof Error ? error.message : String(error),
            reason: 'brain-error',
          });
          continue;
        }
        latencyMs += now() - startedAt;
        const resolution = resolveDecision(answer, candidates, legal);
        if (resolution.ok) {
          chosen = resolution.candidate;
          chosenReason = resolution.reason ?? null;
          chosenMeta = 'meta' in answer && answer.meta !== undefined ? answer.meta : null;
        } else {
          rejected.push({ raw: resolution.raw, reason: resolution.reason });
        }
      }

      illegalAttempts += rejected.length;
      let fellBack = false;
      if (chosen === null) {
        // T-1604a P4: the fallback is RECORDED, never silent. Prefer ending the
        // day cleanly over spending a die the brain never asked to spend.
        chosen = candidates.find((entry) => entry.kind === 'lifecycle') ?? candidates[0];
        fellBack = true;
        fallbacks += 1;
      }

      const before = snapshot(state());
      stepCounter += 1;

      if (chosen.kind === 'lifecycle') {
        const ended = await send({ type: 'end-day' });
        emit({
          type: 'step',
          n: stepCounter,
          day: before.day,
          phase: before.phase,
          candidateCount: candidates.length,
          truncated: enumerated.truncated,
          chosen: {
            id: chosen.id,
            label: chosen.label,
            specType: chosen.specType,
            specIndex: chosen.specIndex,
            note: chosen.note ?? null,
          },
          action: null,
          lifecycle: 'end-day',
          brain: {
            kind: brain.kind,
            model: brain.model ?? null,
            reason: chosenReason,
            latencyMs,
            meta: chosenMeta,
          },
          rejected,
          fellBack,
          response: ended.response.type,
          events: [],
          blocked: false,
          blockReason: null,
          before,
          after: snapshot(state()),
          delta: deltaOf(before, snapshot(state())),
        });
        if (!ended.ok) {
          stoppedBy = 'protocol-error';
          break dayLoop;
        }
        dayEnded = true;
        continue;
      }

      const applied = await send({ type: 'apply-action', action: chosen.action! });
      const events =
        applied.response.type === 'action-result' ? applied.response.events : ([] as GameEvent[]);
      const reason = blockedReason(events);
      if (reason !== null) blockedFromLegal += 1;
      if (applied.ok) stepsApplied += 1;
      const after = snapshot(state());
      emit({
        type: 'step',
        n: stepCounter,
        day: before.day,
        phase: before.phase,
        candidateCount: candidates.length,
        truncated: enumerated.truncated,
        chosen: {
          id: chosen.id,
          label: chosen.label,
          specType: chosen.specType,
          specIndex: chosen.specIndex,
          note: chosen.note ?? null,
        },
        action: chosen.action!,
        lifecycle: null,
        brain: {
          kind: brain.kind,
          model: brain.model ?? null,
          reason: chosenReason,
          latencyMs,
          meta: chosenMeta,
        },
        rejected,
        fellBack,
        response: applied.response.type,
        events,
        blocked: reason !== null,
        blockReason: reason,
        before,
        after,
        delta: deltaOf(before, after),
      });
      if (!applied.ok) {
        stoppedBy = 'protocol-error';
        break dayLoop;
      }
    }

    if (!dayEnded) {
      // The per-day step cap fired (a Wait loop, or a brain that never ends a
      // day). Force the transition and SAY SO, so a paid run cannot be silently
      // burned on one stuck day.
      const before = snapshot(state());
      stepCounter += 1;
      const forced = await send({ type: 'end-day' });
      emit({
        type: 'lifecycle',
        n: stepCounter,
        day: before.day,
        transition: 'forced-end-day',
        response: forced.response.type,
        before,
        after: snapshot(state()),
      });
      if (!forced.ok) {
        stoppedBy = 'protocol-error';
        break;
      }
    }

    daysPlayed += 1;
  }

  return finish();
}

/** Render a finished run as JSONL — one entry per line, in emission order. */
export function toJsonl(entries: readonly PilotLogEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

/** Parse a JSONL trail back into entries (the `--brain recorded` input path). */
export function parseJsonl(text: string): PilotLogEntry[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as PilotLogEntry);
}

/** True when a run is clean on all four counters the CLI exits non-zero on. */
export function runPassed(summary: PilotRunSummary): boolean {
  return (
    summary.illegalAttempts === 0 &&
    summary.blockedFromLegal === 0 &&
    summary.protocolErrors === 0 &&
    summary.diceBoundsViolations === 0
  );
}
