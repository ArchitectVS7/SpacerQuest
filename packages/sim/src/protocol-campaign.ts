// ---------------------------------------------------------------------------
// T-1604 · UGT campaign harness — drive the PROTOCOL surface, not the engine.
//
// The sibling UGT tool plays Rimward through the T-1003 stdio protocol
// (new-game → start-day → legal-actions → apply-action … → end-day). This
// harness drives that EXACT surface in-process via `handleMessage` — the same
// pure core the stdio/WebSocket transports wrap — so a campaign exercises what a
// real UGT client hits (over-advertised legal actions, phase stalls, ActionBlocked
// leakage), not just the internal engine loop `runCampaign` (index.ts) tests.
//
// PURITY CONTRACT (reviewer-enforced): pure function of (seed, budget, picker).
// No I/O, no clock, no Math.random. Every pick flows through a `SeededRng` forked
// deterministically from the seed, so the whole campaign is byte-reproducible.
// Real I/O lives ONLY in the CLI shell (protocol-campaign-cli.ts).
//
// This module only READS state and events — it adds NO GameState field, NO event,
// NO migration. The ≥1,000-action log is evidence; the invariants it checks are
// the acceptance surface. See docs/playtests/T-1604-ugt-campaign.md.
// ---------------------------------------------------------------------------

import {
  DayPhase,
  SeededRng,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { cannotAffordCheapestJump, type SimPolicy } from './index.js';
import {
  handleMessage,
  type LegalActionSpec,
  type LegalActions,
  type ParamSpec,
  type ProtocolResponse,
  type ProtocolSession,
  type StateSummary,
} from './protocol.js';

// ---------------------------------------------------------------------------
// Picker — turns a LegalActionSpec into a concrete PlayerAction.
// ---------------------------------------------------------------------------

/** The decision surface a picker sees each DAY step: the advertised legal
 *  actions, a compact state summary, and a forked rng (purity). A picker returns
 *  a concrete PlayerAction to apply, or 'end-day' to close the day. */
export interface PickerContext {
  legal: LegalActions;
  summary: StateSummary;
  rng: SeededRng;
  /** The live engine state — read by the policy-backed picker (which plans a
   *  whole-day batch with a shipped SimPolicy). The spec-only pickers ignore it. */
  state: GameState;
}

export type CampaignPicker = (ctx: PickerContext) => PlayerAction | 'end-day';

/** Pick a random element of a non-empty array using the forked rng. */
function pick<T>(arr: readonly T[], rng: SeededRng): T {
  return arr[Math.floor(rng.next() * arr.length)];
}

/** Pick a concrete value for one ParamSpec, or `undefined` for an empty enum
 *  (e.g. VisitHangout.opponentId with no in-system NPC — the key is omitted). */
function pickParam(spec: ParamSpec, rng: SeededRng): string | number | undefined {
  switch (spec.kind) {
    case 'die-index':
    case 'system-id':
    case 'contract-index':
      return spec.choices.length === 0 ? undefined : pick(spec.choices, rng);
    case 'enum':
      return spec.choices.length === 0 ? undefined : pick(spec.choices, rng);
    case 'int':
      return spec.min + Math.floor(rng.next() * (spec.max - spec.min + 1));
    case 'fixed':
      return spec.value;
  }
}

/**
 * Build a concrete PlayerAction from a LegalActionSpec, filling every param from
 * its domain (random within the advertised choices/range) unless `overrides`
 * pins a key. Only ever forms actions from the advertised spec — this is the
 * guarantee that a legal pick never produces an ActionBlocked.
 */
function formAction(
  spec: LegalActionSpec,
  rng: SeededRng,
  overrides: Record<string, string | number> = {},
): PlayerAction {
  const action: Record<string, unknown> = { type: spec.type };
  if (spec.action !== undefined) action.action = spec.action;
  if (spec.storyletId !== undefined) action.storyletId = spec.storyletId;
  if (spec.choiceId !== undefined) action.choiceId = spec.choiceId;
  for (const [key, paramSpec] of Object.entries(spec.params)) {
    if (key in overrides) {
      action[key] = overrides[key];
      continue;
    }
    const value = pickParam(paramSpec, rng.fork(`param-${key}`));
    if (value !== undefined) action[key] = value;
  }
  return action as unknown as PlayerAction;
}

/** Read an enum spec's choices, or [] for a non-enum. */
function enumChoices(spec: ParamSpec | undefined): (string | number)[] {
  return spec?.kind === 'enum' ? spec.choices : [];
}

/** Read a choices-list spec (system-id/contract-index/die-index), or []. */
function listChoices(spec: ParamSpec | undefined): number[] {
  return spec &&
    (spec.kind === 'system-id' || spec.kind === 'contract-index' || spec.kind === 'die-index')
    ? spec.choices
    : [];
}

// ---------------------------------------------------------------------------
// The two shipped pickers.
// ---------------------------------------------------------------------------

/**
 * (a) The legal-actions-OBEYING fuzzer. Forms an action ONLY from the advertised
 * specs (random spec, random params). This is the picker that proves the core
 * parity guarantee: across the whole campaign, NO ActionBlocked ever results from
 * a spec `legalActions` advertised (any occurrence is a HIGH enumerator finding).
 */
export const randomLegalPicker: CampaignPicker = ({ legal, rng }) => {
  if (legal.actions.length === 0) return 'end-day';
  // With no dice left, a bare end-day is the honest move most steps; occasionally
  // take a no-die action (pay-debt) that is still advertised.
  if (legal.diceRemaining.length === 0 && rng.fork('exhausted').next() < 0.5) {
    return 'end-day';
  }
  const spec = pick(legal.actions, rng.fork('spec'));
  return formAction(spec, rng.fork('form'));
};

/**
 * (b) The COMPETENT picker — a thin heuristic over the specs + summary that
 * reaches deep game states (deliveries, upgrades, combat, hangout, ports,
 * storylets) rather than churning early game. Still forms actions only from the
 * advertised specs, so it upholds the same zero-ActionBlocked guarantee.
 */
export const competentPicker: CampaignPicker = ({ legal, summary, rng }) => {
  const specs = legal.actions;

  // The highest-value UNSPENT die — a competent captain spends its best die on a
  // stat-checked action (a botched Travel pilot check leaves the ship at origin,
  // travel.ts:561, so a low die is a wasted jump). Over the campaign this is what
  // turns the loop from "1195 failed jumps" into real deliveries + progression.
  const bestDie = (): number => {
    const values = summary.dawnHand?.dice ?? [];
    return legal.diceRemaining.reduce(
      (best, i) => ((values[i] ?? 0) > (values[best] ?? 0) ? i : best),
      legal.diceRemaining[0] ?? 0,
    );
  };

  // --- Combat: survive, occasionally press the attack. ---------------------
  if (legal.inEncounter) {
    const combat = specs.find((s) => s.type === 'Combat');
    if (!combat) return 'end-day';
    const stances = enumChoices(combat.params.stance).map(String);
    let stance: string = stances.includes('talk') ? 'talk' : (stances[0] ?? 'talk');
    if (stances.includes('fight') && summary.encounter && summary.encounter.enemyHull <= 3) {
      stance = 'fight';
    } else if (stances.includes('run') && rng.fork('flee').next() < 0.2) {
      stance = 'run';
    }
    return formAction(combat, rng.fork('combat'), { stance, spendDie: bestDie() });
  }

  // --- Out of dice: settle debt if flush, else close the day. --------------
  if (legal.diceRemaining.length === 0) {
    const payDebt = specs.find((s) => s.type === 'Trade' && s.action === 'pay-debt');
    if (payDebt && summary.credits > 200) {
      return formAction(payDebt, rng.fork('paydebt'));
    }
    return 'end-day';
  }

  // --- Service the Merchant Guild debt when flush (keep it from compounding). -
  if (summary.debt > 0 && summary.credits > 2000) {
    const payDebt = specs.find((s) => s.type === 'Trade' && s.action === 'pay-debt');
    if (payDebt && rng.fork('debt').next() < 0.5) return formAction(payDebt, rng.fork('paydebt'));
  }

  // --- Keep a cargo contract in the hold. ----------------------------------
  if (!summary.activeContract) {
    const sign = specs.find((s) => s.type === 'Trade' && s.action === 'sign-contract');
    const choices = listChoices(sign?.params.contractIndex);
    const travelDests = listChoices(specs.find((s) => s.type === 'Travel')?.params.destinationId);
    if (sign && choices.length > 0) {
      // Prefer the best-paying contract whose destination is REACHABLE now (a
      // Travel choice); fall back to best-paying overall if none is reachable.
      const reachable = choices.filter((i) =>
        travelDests.includes(summary.manifestBoard[i]?.destination ?? -1),
      );
      const pool = reachable.length > 0 ? reachable : choices;
      const bestIdx = pool.reduce(
        (best, i) =>
          (summary.manifestBoard[i]?.payment ?? 0) > (summary.manifestBoard[best]?.payment ?? 0)
            ? i
            : best,
        pool[0],
      );
      return formAction(sign, rng.fork('sign'), { contractIndex: bestIdx });
    }
  }

  // --- Top the tank up before a run. ---------------------------------------
  if (summary.fuel < summary.maxFuel * 0.4) {
    const buyFuel = specs.find((s) => s.type === 'Trade' && s.action === 'buy-fuel');
    if (buyFuel) return formAction(buyFuel, rng.fork('fuel'));
  }

  // --- Run the cargo toward its destination (spend the best die). ----------
  if (summary.activeContract) {
    const travel = specs.find((s) => s.type === 'Travel');
    const dests = listChoices(travel?.params.destinationId);
    if (travel && dests.length > 0) {
      const dest = summary.activeContract.destination;
      const destinationId = dests.includes(dest) ? dest : pick(dests, rng.fork('reroute'));
      return formAction(travel, rng.fork('travel'), { destinationId, spendDie: bestDie() });
    }
  }

  // --- Opportunistic depth: invest, explore, socialize, chart. -------------
  // A weighted roll over the interesting verbs when they are on offer, so the
  // campaign reaches upgrades / hangout / ports / storylets, not just the loop.
  // Stat-checked verbs (Explore/Travel) take the best die.
  const depthOrder: LegalActionSpec['type'][] = [
    'Storylet',
    'VisitHangout',
    'Shipyard',
    'Explore',
    'Crew',
    'Port',
    'Travel',
  ];
  const roll = rng.fork('depth').next();
  if (roll < 0.75) {
    for (const type of depthOrder) {
      const candidates = specs.filter((s) => s.type === type);
      if (candidates.length > 0) {
        const spec = pick(candidates, rng.fork('depth-spec'));
        const overrides: Record<string, number> =
          'spendDie' in spec.params ? { spendDie: bestDie() } : {};
        return formAction(spec, rng.fork('depth-form'), overrides);
      }
    }
  }

  // --- Fallback: a random advertised action. -------------------------------
  return formAction(pick(specs, rng.fork('fallback-spec')), rng.fork('fallback-form'));
};

/**
 * (c) A POLICY-BACKED picker — routes one of the sim's proven `SimPolicy`s
 * (e.g. `veteranPolicy`) through the exact protocol surface UGT hits. The policy
 * plans a coherent whole-day batch on the day-start state (as `runCampaign` in
 * index.ts does); this driver dequeues that batch one action at a time into
 * apply-action, so the campaign reaches the DEEP states a competent captain
 * reaches (debt cleared, ship upgraded, encounters fought) — not the poverty
 * spirals a naive per-action heuristic falls into. The rng is derived exactly as
 * `runCampaign` derives it (seed → 'policy' → day → index), so this driver's play
 * is byte-identical to the engine-path campaign — validating protocol/engine
 * parity while it plays. Stateful (holds the day's queue) — one per campaign.
 */
export function makePolicyPicker(policy: SimPolicy, seed: number): CampaignPicker {
  let queue: PlayerAction[] = [];
  let plannedDay = -1;
  let dayIndex = 0;
  return ({ state, legal, summary }): PlayerAction | 'end-day' => {
    if (summary.day !== plannedDay) {
      // A new day just opened: plan the batch on the fresh day state, mirroring
      // runCampaign's rng derivation (index.ts) so the two paths agree exactly.
      const policyRng = new SeededRng(seed)
        .fork('policy')
        .fork(`day-${summary.day}`)
        .fork(`index-${dayIndex}`);
      queue = [...policy({ state, dayIndex, rng: policyRng })];
      plannedDay = summary.day;
      dayIndex += 1;
    }
    while (queue.length > 0) {
      const action = queue.shift() as PlayerAction;
      // Re-read the live legal set between steps and drop a queued action the
      // engine would now refuse — the exact discipline a batch planner lacks and
      // a real UGT client keeps ("re-reads legal actions between steps and would
      // never send it", runCampaign index.ts:2050). Two mid-batch divergences:
      //   • an encounter STARTED (a queued Travel interdicted): only Combat is
      //     legal now, so drop the queued Trade/Travel/Shipyard/etc. Without this
      //     the protocol commits an ActionBlocked(active-encounter) the planner
      //     never anticipated — a parity break the campaign flags.
      //   • an encounter ENDED (mid-batch death / resolution): a leftover queued
      //     Combat is orphaned; drop it (runCampaign index.ts:2053 does the same).
      if (legal.inEncounter) {
        if (action.type !== 'Combat') continue;
      } else if (action.type === 'Combat') {
        continue;
      }
      return action;
    }
    return 'end-day';
  };
}

// ---------------------------------------------------------------------------
// Campaign log + aggregates.
// ---------------------------------------------------------------------------

/** One recorded apply-action step. */
export interface CampaignLogEntry {
  step: number;
  day: number;
  phase: string;
  action: PlayerAction;
  responseType: ProtocolResponse['type'];
  eventTypes: string[];
  /** True when the applied action produced an ActionBlocked event. */
  blocked: boolean;
  /** The protocol error code, when the response was an `error` (should not
   *  happen for a legal pick). */
  errorCode?: string;
}

/** A machine-checked invariant violation — each is a HIGH finding. */
export interface InvariantViolation {
  step: number;
  day: number;
  kind:
    | 'negative-credits'
    | 'fuel-out-of-range'
    | 'negative-debt'
    | 'dice-inconsistent'
    | 'blocked-from-legal-pick'
    | 'unexpected-error'
    | 'core-threw';
  detail: string;
}

export interface ProtocolCampaignLog {
  seed: number;
  actionBudget: number;
  actionsLogged: number;
  daysPlayed: number;
  finalCredits: number;
  finalDebt: number;
  deaths: number;
  /** Days the run ended stranded (cannotAffordCheapestJump) — a soft-lock probe. */
  fuelStarvationStalls: number;
  blockedByReasonAndType: Record<string, number>;
  errorsByCode: Record<string, number>;
  eventTypeCounts: Record<string, number>;
  actionTypeCounts: Record<string, number>;
  violations: InvariantViolation[];
  log: CampaignLogEntry[];
}

export interface RunProtocolCampaignOptions {
  seed: number;
  actionBudget: number;
  picker?: CampaignPicker;
  /** Hard day cap so a phase stall is recorded as a finding, never a hang.
   *  Defaults to a generous bound (actionBudget days ≥ 5× the days needed). */
  maxDays?: number;
  /** Keep the full per-action log (default true). Set false for a light run. */
  keepLog?: boolean;
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

function actionBlockedReasons(events: GameEvent[]): string[] {
  const reasons: string[] = [];
  for (const event of events) {
    if (event.type === 'ActionBlocked') reasons.push(`${event.reason}:${event.actionType}`);
  }
  return reasons;
}

/**
 * Drive a full protocol campaign of ≥ `actionBudget` apply-actions through the
 * pure `handleMessage` core. Returns the per-action log plus the machine-checked
 * aggregates the acceptance test asserts on.
 */
export function runProtocolCampaign(opts: RunProtocolCampaignOptions): ProtocolCampaignLog {
  const { seed, actionBudget } = opts;
  const picker = opts.picker ?? competentPicker;
  const keepLog = opts.keepLog ?? true;
  const maxDays = opts.maxDays ?? Math.max(2000, actionBudget);

  const baseRng = new SeededRng(seed).fork('ugt-campaign');

  const log: CampaignLogEntry[] = [];
  const violations: InvariantViolation[] = [];
  const blockedByReasonAndType: Record<string, number> = {};
  const errorsByCode: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};
  const actionTypeCounts: Record<string, number> = {};

  let actionsLogged = 0;
  let daysPlayed = 0;
  let deaths = 0;
  let fuelStarvationStalls = 0;

  let session: ProtocolSession | null = handleMessage(null, { type: 'new-game', seed }).session;
  if (!session) throw new Error('new-game produced no session');

  // A hard iteration cap independent of the day cap: even if every step were a
  // no-op transition, this bounds the loop so a bug can never hang the harness.
  const iterationCap = actionBudget * 8 + maxDays * 4;
  let iterations = 0;

  while (actionsLogged < actionBudget && daysPlayed < maxDays && iterations < iterationCap) {
    iterations += 1;
    if (!session) break; // a lifecycle transition never nulls the session, but narrow for TS
    const summary = handleMessage(session, { type: 'state-summary' }).response;
    const summaryData = summary.type === 'state-summary' ? summary.summary : null;
    if (!summaryData) break;

    // DAWN → roll the day.
    if (summaryData.phase === DayPhase.DAWN) {
      const started = handleMessage(session, { type: 'start-day' });
      session = started.session;
      continue;
    }

    // Anything other than DAY at a decision point is a transient/stall — record
    // and try to advance rather than hang.
    if (summaryData.phase !== DayPhase.DAY) {
      violations.push({
        step: actionsLogged,
        day: summaryData.day,
        kind: 'dice-inconsistent',
        detail: `unexpected decision-point phase ${summaryData.phase}`,
      });
      break;
    }

    const legalResp = handleMessage(session, { type: 'legal-actions' }).response;
    if (legalResp.type !== 'legal-actions') break;
    const legal = legalResp.legalActions;

    const decision = picker({
      legal,
      summary: summaryData,
      rng: baseRng.fork(`step-${actionsLogged}-${summaryData.day}`),
      state: session.state,
    });

    if (decision === 'end-day') {
      const ended = handleMessage(session, { type: 'end-day' });
      session = ended.session;
      daysPlayed += 1;
      // Soft-lock probe: did the run just end a day stranded?
      if (session?.state && cannotAffordCheapestJump(session.state)) {
        fuelStarvationStalls += 1;
      }
      continue;
    }

    // Apply the picked action through the exact protocol surface UGT hits.
    let applied: ReturnType<typeof handleMessage>;
    try {
      applied = handleMessage(session, { type: 'apply-action', action: decision });
    } catch (error) {
      violations.push({
        step: actionsLogged,
        day: summaryData.day,
        kind: 'core-threw',
        detail: `${JSON.stringify(decision)} → ${error instanceof Error ? error.message : String(error)}`,
      });
      break;
    }
    session = applied.session;
    const response = applied.response;

    let eventTypes: string[] = [];
    let blocked = false;
    let errorCode: string | undefined;

    if (response.type === 'action-result') {
      eventTypes = response.events.map((e) => e.type);
      const blockReasons = actionBlockedReasons(response.events);
      blocked = blockReasons.length > 0;
      for (const reason of blockReasons) bump(blockedByReasonAndType, reason);
      for (const t of eventTypes) bump(eventTypeCounts, t);
      if (blocked) {
        // The parity guarantee: a spec `legalActions` advertised must NEVER apply
        // to an ActionBlocked. Any occurrence is a HIGH enumerator finding.
        violations.push({
          step: actionsLogged,
          day: summaryData.day,
          kind: 'blocked-from-legal-pick',
          detail: `${JSON.stringify(decision)} → ActionBlocked(${blockReasons.join(',')})`,
        });
      }
    } else if (response.type === 'error') {
      errorCode = response.code;
      bump(errorsByCode, response.code);
      violations.push({
        step: actionsLogged,
        day: summaryData.day,
        kind: 'unexpected-error',
        detail: `${JSON.stringify(decision)} → ${response.code}: ${response.message}`,
      });
    }

    // --- Machine-checked state invariants after every apply. ---------------
    if (session?.state) {
      const st = session.state;
      const p = st.player;
      if (p.credits < 0) {
        violations.push({
          step: actionsLogged,
          day: st.day,
          kind: 'negative-credits',
          detail: `credits=${p.credits}`,
        });
      }
      if (p.ship.fuel < 0 || p.ship.fuel > p.ship.maxFuel) {
        violations.push({
          step: actionsLogged,
          day: st.day,
          kind: 'fuel-out-of-range',
          detail: `fuel=${p.ship.fuel}/${p.ship.maxFuel}`,
        });
      }
      if (p.debt < 0) {
        violations.push({
          step: actionsLogged,
          day: st.day,
          kind: 'negative-debt',
          detail: `debt=${p.debt}`,
        });
      }
      // diceRemaining (as the protocol REPORTS it) must equal the unspent indices
      // of the committed dawn hand. The action-result already carries the post-
      // action summary, so reuse it — no extra round-trip in the hot path.
      const hand = p.dawnHand;
      if (hand && response.type === 'action-result') {
        const unspent = hand.spent.map((s, i) => (s ? -1 : i)).filter((i) => i >= 0);
        const got = response.summary.diceRemaining;
        if (JSON.stringify(got) !== JSON.stringify(unspent)) {
          violations.push({
            step: actionsLogged,
            day: st.day,
            kind: 'dice-inconsistent',
            detail: `summary=${JSON.stringify(got)} vs hand=${JSON.stringify(unspent)}`,
          });
        }
      }
      deaths = p.legacy.successionCount;
    }

    if (keepLog) {
      log.push({
        step: actionsLogged,
        day: summaryData.day,
        phase: summaryData.phase,
        action: decision,
        responseType: response.type,
        eventTypes,
        blocked,
        ...(errorCode ? { errorCode } : {}),
      });
    }
    bump(actionTypeCounts, decision.type);
    actionsLogged += 1;
  }

  const finalSummary = session?.state
    ? handleMessage(session, { type: 'state-summary' }).response
    : null;
  const finalData =
    finalSummary && finalSummary.type === 'state-summary' ? finalSummary.summary : null;

  return {
    seed,
    actionBudget,
    actionsLogged,
    daysPlayed,
    finalCredits: finalData?.credits ?? 0,
    finalDebt: finalData?.debt ?? 0,
    deaths,
    fuelStarvationStalls,
    blockedByReasonAndType,
    errorsByCode,
    eventTypeCounts,
    actionTypeCounts,
    violations,
    log,
  };
}
