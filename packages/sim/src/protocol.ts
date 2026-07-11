// ---------------------------------------------------------------------------
// T-202 · UGT adapter — pure protocol core.
//
// A thin, transport-agnostic protocol layer that exposes the engine's day loop
// (state-summary + legal-actions + apply-action) as plain JSON messages, matching
// what an external harness (the sibling UGT repo) drives over stdio/WebSocket.
//
// PURITY CONTRACT (reviewer-enforced): this module performs NO I/O, reads NO
// clock, and never calls Math.random. Every message handler is a deterministic
// pure function of (session, request). All randomness flows through the engine's
// seeded rng, which rides on the serialized GameState (`state.rngState`). Real
// I/O lives ONLY in the transport shell (protocol-stdio.ts).
//
// See packages/sim/PROTOCOL.md for the full message-schema documentation.
// ---------------------------------------------------------------------------

import {
  EXPLORATION_FUEL_COST,
  STAR_SYSTEMS,
  YARD_COMPONENT_TIER_PRICES,
} from '@spacerquest/content';
import {
  DayPhase,
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  applyPlayerAction,
  createInitialState,
  deserializeState,
  eligibleStorylets,
  endDay,
  serializeState,
  startDay,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type ShipComponentId,
  type SpecialEquipmentId,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

/**
 * A protocol session: the seed the game was created from plus the live
 * GameState. The GameState already carries the seeded rng (`rngState`), so the
 * session is a complete, self-contained snapshot — serializing it captures
 * everything needed to resume or replay deterministically.
 */
export interface ProtocolSession {
  seed: number;
  state: GameState;
}

/** Serialize a session to a wire/replay string, reusing the engine's state
 *  serializer so the GameState round-trips exactly. */
export function serializeSession(session: ProtocolSession): string {
  return JSON.stringify({ seed: session.seed, state: serializeState(session.state) });
}

/** Restore a session from {@link serializeSession} output. */
export function deserializeSession(json: string): ProtocolSession {
  const parsed = JSON.parse(json) as { seed: number; state: string };
  return { seed: parsed.seed, state: deserializeState(parsed.state) };
}

// ---------------------------------------------------------------------------
// Message types (all plain-JSON serializable)
// ---------------------------------------------------------------------------

export type DayLifecycle = 'start-day' | 'end-day';

export type ProtocolRequest =
  | { type: 'new-game'; seed: number }
  | { type: 'reset'; seed: number }
  | { type: 'state-summary' }
  | { type: 'legal-actions' }
  | { type: 'start-day' }
  | { type: 'end-day' }
  | { type: 'apply-action'; action: PlayerAction };

export type ProtocolErrorCode =
  | 'no-session'
  | 'wrong-phase'
  | 'action-blocked'
  | 'apply-failed'
  | 'unknown-request';

export type ProtocolResponse =
  | { type: 'state-summary'; summary: StateSummary }
  | { type: 'legal-actions'; legalActions: LegalActions }
  | { type: 'action-result'; summary: StateSummary; events: GameEvent[] }
  | { type: 'error'; code: ProtocolErrorCode; message: string };

// ---------------------------------------------------------------------------
// State summary — a compact, UGT-friendly view of the current day/state. This
// is deliberately NOT the raw GameState: it surfaces exactly what an agent needs
// to decide, and nothing else. Every field is documented in PROTOCOL.md.
// ---------------------------------------------------------------------------

export interface SummaryContract {
  index: number;
  destination: number;
  destinationName: string;
  cargoType: number;
  payment: number;
  pods: number;
  haggled: boolean;
}

export interface SummaryEncounter {
  id: string;
  interceptorId: string;
  interceptorName: string;
  tier: number;
  round: number;
  enemyHull: number;
  routeDangerLevel: number;
}

export interface SummaryStorylet {
  storyletId: string;
  title: string;
  choices: { id: string; label: string; requiresDie: boolean }[];
}

export interface SummaryEraEvent {
  defId: string;
  startedDay: number;
  endsDay: number;
  affectedSystemIds: number[];
}

export interface StateSummary {
  day: number;
  /** DAWN → must start-day; DAY → actions legal; (WIRE/DUSK are transient). */
  phase: DayPhase;
  /** Campaign phase — 'TOUR_ONE' | 'VETERAN'. */
  era: string;
  credits: number;
  /** Outstanding Merchant Guild debt (a ledger, never negative credits). */
  debt: number;
  debtDueDay: number;
  fuel: number;
  maxFuel: number;
  systemId: number;
  systemName: string;
  /** The dawn hand rolled at start-day; null before the first start-day. */
  dawnHand: { dice: number[]; spent: boolean[] } | null;
  /** Indices into `dawnHand.dice` that are still UNSPENT — the legal values for
   *  any action's `spendDie` field this turn. Empty in DAWN / when exhausted. */
  diceRemaining: number[];
  /** The contract currently in the hold, or null. */
  activeContract: {
    destination: number;
    destinationName: string;
    cargoType: number;
    payment: number;
    pods: number;
  } | null;
  /** Active interceptor encounter (blocks trade/travel/shipyard), or null. */
  encounter: SummaryEncounter | null;
  /** Today's manifest board — signable cargo contracts. */
  manifestBoard: SummaryContract[];
  localFuelPrice: number;
  /** Storylets eligible to be chosen right now. */
  eligibleStorylets: SummaryStorylet[];
  /** The active world economic event (blockade/plague/rush), or null. */
  eraEvent: SummaryEraEvent | null;
  renownRank: string;
  deedCount: number;
  fragmentCount: number;
  poiCount: number;
  successionCount: number;
  /** Story flags currently set — small, and storylet triggers read them. */
  flags: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Legal actions — the PlayerActions available RIGHT NOW.
//
// PARAMETERIZATION: some actions have an unbounded or large parameter space
// (haggle payoff, fuel amount, debt payment, shipyard tier). Rather than
// enumerate every concrete value, a spec describes the action SHAPE and the
// legal DOMAIN of each parameter (a {@link ParamSpec}); the harness fills them.
// Concrete, cheap enumerations (die indices, contract indices, storylet choices)
// are listed exhaustively. See PROTOCOL.md § legal-actions.
// ---------------------------------------------------------------------------

export type ParamSpec =
  /** Pick a die INDEX from `choices` (an unspent dawn-hand die). */
  | { kind: 'die-index'; choices: number[] }
  /** Pick a destination system id from `choices`. */
  | { kind: 'system-id'; choices: number[] }
  /** Pick a manifest-board index from `choices`. */
  | { kind: 'contract-index'; choices: number[] }
  /** Any integer in [min, max]. */
  | { kind: 'int'; min: number; max: number }
  /** One of the listed values. */
  | { kind: 'enum'; choices: (string | number)[] }
  /** A fixed, non-negotiable value the caller must echo back. */
  | { kind: 'fixed'; value: string | number };

/**
 * One legal action the harness can turn into a {@link PlayerAction}. `type`
 * (plus `action`/`storyletId`/`choiceId` where relevant) fixes the discriminant;
 * `params` gives every remaining field's legal domain. A caller forms the action
 * by picking one value per param and merging in the fixed discriminants.
 */
export interface LegalActionSpec {
  type: PlayerAction['type'];
  /** Sub-action discriminant for Trade / Shipyard. */
  action?: string;
  /** Fixed discriminants for Storylet. */
  storyletId?: string;
  choiceId?: string;
  /** Parameters to fill; keys map 1:1 to PlayerAction fields. */
  params: Record<string, ParamSpec>;
  /** Caveats: affordability/renown validated on apply, unbounded outcomes, etc. */
  note?: string;
}

export interface LegalActions {
  phase: DayPhase;
  inEncounter: boolean;
  /** Unspent dawn-hand die INDICES — the domain of every `die-index` param. */
  diceRemaining: number[];
  actions: LegalActionSpec[];
  /** Whether a bare `{ type: 'Wait' }` is legal (always true in DAY). */
  canWait: boolean;
  /** Day-loop transitions available now (drive with start-day / end-day). */
  lifecycle: DayLifecycle[];
}

// ---------------------------------------------------------------------------
// Summary builder
// ---------------------------------------------------------------------------

function systemName(id: number): string {
  return STAR_SYSTEMS[id]?.name ?? `system ${id}`;
}

function unspentDieIndices(state: GameState): number[] {
  const hand = state.player.dawnHand;
  if (!hand) return [];
  const indices: number[] = [];
  for (let i = 0; i < hand.spent.length; i += 1) {
    if (!hand.spent[i]) indices.push(i);
  }
  return indices;
}

export function buildStateSummary(state: GameState): StateSummary {
  const player = state.player;
  const ship = player.ship;

  const manifestBoard: SummaryContract[] = state.market.manifestBoard.map((contract, index) => ({
    index,
    destination: contract.destination,
    destinationName: systemName(contract.destination),
    cargoType: contract.cargoType,
    payment: contract.payment,
    pods: contract.pods,
    haggled: contract.haggled ?? false,
  }));

  const encounter: SummaryEncounter | null = state.encounter
    ? {
        id: state.encounter.id,
        interceptorId: state.encounter.interceptor.id,
        interceptorName: state.encounter.interceptor.name,
        tier: state.encounter.interceptor.tier,
        round: state.encounter.round,
        enemyHull: state.encounter.enemyHull,
        routeDangerLevel: state.encounter.routeDangerLevel,
      }
    : null;

  const eligible = eligibleStorylets(state);
  const eligibleStoryletsSummary: SummaryStorylet[] = eligible.map((offer) => ({
    storyletId: offer.storyletId,
    title: offer.title,
    choices: offer.choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      requiresDie: Boolean(choice.requirements?.spendDie || choice.requirements?.statCheck),
    })),
  }));

  const contract = player.activeContract ?? null;

  return {
    day: state.day,
    phase: state.dayPhase,
    era: state.era,
    credits: player.credits,
    debt: player.debt,
    debtDueDay: player.debtDueDay,
    fuel: ship.fuel,
    maxFuel: ship.maxFuel,
    systemId: player.currentSystemId,
    systemName: systemName(player.currentSystemId),
    dawnHand: player.dawnHand
      ? { dice: [...player.dawnHand.dice], spent: [...player.dawnHand.spent] }
      : null,
    diceRemaining: unspentDieIndices(state),
    activeContract: contract
      ? {
          destination: contract.destination,
          destinationName: systemName(contract.destination),
          cargoType: contract.cargoType,
          payment: contract.payment,
          pods: contract.pods,
        }
      : null,
    encounter,
    manifestBoard,
    localFuelPrice: state.market.localFuelPrice,
    eligibleStorylets: eligibleStoryletsSummary,
    eraEvent: state.eraEvent
      ? {
          defId: state.eraEvent.defId,
          startedDay: state.eraEvent.startedDay,
          endsDay: state.eraEvent.endsDay,
          affectedSystemIds: [...state.eraEvent.affectedSystemIds],
        }
      : null,
    renownRank: player.registry.renownRank,
    deedCount: player.registry.earned.length,
    fragmentCount: player.nemesisFile.fragments.length,
    poiCount: player.charts.discoveredPois.length,
    successionCount: player.legacy.successionCount,
    flags: { ...state.flags },
  };
}

// ---------------------------------------------------------------------------
// Legal-actions enumerator
// ---------------------------------------------------------------------------

const SHIPYARD_COMPONENTS: ShipComponentId[] = [
  'weapons',
  'hull',
  'shields',
  'drives',
  'navigation',
  'lifeSupport',
  'robotics',
  'cabin',
];

const SPECIAL_EQUIPMENT: SpecialEquipmentId[] = [
  'CLOAKER',
  'AUTO_REPAIR',
  'STAR_BUSTER',
  'ARCH_ANGEL',
  'ASTRAXIAL_HULL',
  'TITANIUM_HULL',
  'TRANS_WARP',
];

const ALL_SYSTEM_IDS: number[] = Object.keys(STAR_SYSTEMS)
  .map((id) => Number.parseInt(id, 10))
  .filter((id) => Number.isInteger(id))
  .sort((a, b) => a - b);

/**
 * Enumerate the PlayerActions legal in the given state RIGHT NOW, honoring the
 * engine's own gating: DAWN offers nothing but start-day; an active encounter
 * blocks trade/travel/shipyard/explore and offers only combat; die-spending
 * actions require an unspent die. Unbounded parameters are exposed as
 * {@link ParamSpec} domains, not enumerated. Pure — no I/O, no rng.
 */
export function legalActions(state: GameState): LegalActions {
  const phase = state.dayPhase;
  const diceRemaining = unspentDieIndices(state);
  const hasDie = diceRemaining.length > 0;
  const dieParam: ParamSpec = { kind: 'die-index', choices: diceRemaining };

  // DAWN (or any non-DAY phase): no PlayerActions are legal until start-day.
  if (phase !== DayPhase.DAY) {
    return {
      phase,
      inEncounter: state.encounter !== null,
      diceRemaining,
      actions: [],
      canWait: false,
      lifecycle: phase === DayPhase.DAWN ? ['start-day'] : [],
    };
  }

  const actions: LegalActionSpec[] = [];
  const player = state.player;
  const ship = player.ship;

  if (state.encounter) {
    // Active encounter: ONLY combat is legal. Trade/Travel/Shipyard/Explore are
    // blocked by the engine (ActionBlocked). Combat needs an unspent die.
    if (hasDie) {
      const stances: string[] = ['talk'];
      if (ship.fuel >= RUN_FUEL_COST) stances.push('run');
      if (ship.fuel >= FIGHT_FUEL_COST) stances.push('fight');
      actions.push({
        type: 'Combat',
        params: {
          stance: { kind: 'enum', choices: stances },
          targetId: { kind: 'fixed', value: state.encounter.interceptor.id },
          spendDie: dieParam,
        },
        note: 'talk costs no fuel; run costs RUN_FUEL_COST; fight costs FIGHT_FUEL_COST per volley.',
      });
    }
    return {
      phase,
      inEncounter: true,
      diceRemaining,
      actions,
      canWait: true,
      lifecycle: ['end-day'],
    };
  }

  // --- Trade -------------------------------------------------------------
  const fuelPrice = state.market.localFuelPrice || 5;
  const fuelCapacity = ship.maxFuel - ship.fuel;
  const affordableFuel = Math.floor(player.credits / fuelPrice);
  if (hasDie && fuelCapacity > 0 && affordableFuel >= 1) {
    actions.push({
      type: 'Trade',
      action: 'buy-fuel',
      params: {
        fuelAmount: { kind: 'int', min: 1, max: Math.min(fuelCapacity, affordableFuel) },
        spendDie: dieParam,
      },
    });
  }

  if (hasDie && state.market.manifestBoard.length > 0 && !player.activeContract) {
    const boardIndices = state.market.manifestBoard.map((_, index) => index);
    actions.push({
      type: 'Trade',
      action: 'sign-contract',
      params: {
        contractIndex: { kind: 'contract-index', choices: boardIndices },
        spendDie: dieParam,
      },
    });
    const haggleIndices = state.market.manifestBoard
      .map((contract, index) => ({ contract, index }))
      .filter(({ contract }) => !contract.haggled)
      .map(({ index }) => index);
    if (haggleIndices.length > 0) {
      actions.push({
        type: 'Trade',
        action: 'haggle',
        params: {
          contractIndex: { kind: 'contract-index', choices: haggleIndices },
          spendDie: dieParam,
        },
        note: 'TRADE stat check (DC 12); success bumps payment 50%. Outcome is a roll.',
      });
    }
  }

  if (player.debt > 0 && player.credits > 0) {
    actions.push({
      type: 'Trade',
      action: 'pay-debt',
      params: {
        amount: { kind: 'int', min: 1, max: Math.min(player.credits, player.debt) },
      },
      note: 'Ledger transfer — spends credits, not a die.',
    });
  }

  // --- Travel ------------------------------------------------------------
  if (hasDie) {
    const destinations = ALL_SYSTEM_IDS.filter((id) => id !== player.currentSystemId);
    actions.push({
      type: 'Travel',
      params: {
        destinationId: { kind: 'system-id', choices: destinations },
        spendDie: dieParam,
      },
      note: 'Fuel burned scales with distance; a jump may be interrupted by an encounter.',
    });
  }

  // --- Explore -----------------------------------------------------------
  if (hasDie && ship.fuel >= EXPLORATION_FUEL_COST) {
    actions.push({
      type: 'Explore',
      params: { spendDie: dieParam },
      note: `Burns ${EXPLORATION_FUEL_COST} fuel; PILOT nav check charts a POI on success.`,
    });
  }

  // --- Shipyard (parameterized shape; engine validates cost/renown) ------
  if (hasDie) {
    actions.push({
      type: 'Shipyard',
      action: 'buy-component-tier',
      params: {
        component: { kind: 'enum', choices: [...SHIPYARD_COMPONENTS] },
        tier: { kind: 'int', min: 1, max: YARD_COMPONENT_TIER_PRICES.length },
        spendDie: dieParam,
      },
      note: 'Affordability/renown validated on apply (emits ShipyardFail if not met).',
    });
    actions.push({
      type: 'Shipyard',
      action: 'repair',
      params: {
        repairMode: { kind: 'enum', choices: ['all', 'single'] },
        component: { kind: 'enum', choices: [...SHIPYARD_COMPONENTS] },
        spendDie: dieParam,
      },
      note: 'component is required only when repairMode is "single".',
    });
    actions.push({
      type: 'Shipyard',
      action: 'buy-cargo-pods',
      params: {
        quantity: { kind: 'int', min: 1, max: 100 },
        spendDie: dieParam,
      },
      note: 'Capped by hull capacity; over-buying emits ShipyardFail (CAPACITY_EXCEEDED).',
    });
    actions.push({
      type: 'Shipyard',
      action: 'buy-special-equipment',
      params: {
        equipment: { kind: 'enum', choices: [...SPECIAL_EQUIPMENT] },
        spendDie: dieParam,
      },
      note: 'Affordability/renown/mutual-exclusion validated on apply (emits ShipyardFail if not met).',
    });
  }

  // --- Storylets (concrete choices enumerated) ---------------------------
  for (const offer of state.storylets.available) {
    for (const choice of offer.choices) {
      const requiresDie = Boolean(choice.requirements?.spendDie || choice.requirements?.statCheck);
      if (requiresDie && !hasDie) continue;
      actions.push({
        type: 'Storylet',
        storyletId: offer.storyletId,
        choiceId: choice.id,
        params: requiresDie ? { spendDie: dieParam } : {},
        ...(choice.requirements?.credits
          ? { note: 'Has a credits requirement; blocked (insufficient-credits) if unmet.' }
          : {}),
      });
    }
  }

  return {
    phase,
    inEncounter: false,
    diceRemaining,
    actions,
    canWait: true,
    lifecycle: ['end-day'],
  };
}

// ---------------------------------------------------------------------------
// Pure message handler
// ---------------------------------------------------------------------------

function summaryResponse(state: GameState): ProtocolResponse {
  return { type: 'state-summary', summary: buildStateSummary(state) };
}

function errorResponse(code: ProtocolErrorCode, message: string): ProtocolResponse {
  return { type: 'error', code, message };
}

/** True when the engine surfaced an encounter-block for this action. */
function isActionBlocked(events: GameEvent[]): boolean {
  return events.some((event) => event.type === 'ActionBlocked');
}

/**
 * The pure heart of the adapter: given the current session (or null before a
 * game exists) and a request, return the next session and the response. Never
 * throws for a well-formed request — illegal actions and phase violations come
 * back as typed `error` responses so the session survives.
 */
export function handleMessage(
  session: ProtocolSession | null,
  request: ProtocolRequest,
): { session: ProtocolSession | null; response: ProtocolResponse } {
  switch (request.type) {
    case 'new-game':
    case 'reset': {
      const next: ProtocolSession = { seed: request.seed, state: createInitialState(request.seed) };
      return { session: next, response: summaryResponse(next.state) };
    }
    case 'state-summary': {
      if (!session) return { session, response: errorResponse('no-session', 'No active session') };
      return { session, response: summaryResponse(session.state) };
    }
    case 'legal-actions': {
      if (!session) return { session, response: errorResponse('no-session', 'No active session') };
      return {
        session,
        response: { type: 'legal-actions', legalActions: legalActions(session.state) },
      };
    }
    case 'start-day': {
      if (!session) return { session, response: errorResponse('no-session', 'No active session') };
      if (session.state.dayPhase !== DayPhase.DAWN) {
        return {
          session,
          response: errorResponse('wrong-phase', 'start-day requires the DAWN phase'),
        };
      }
      const { state } = startDay(session.state);
      const next: ProtocolSession = { seed: session.seed, state };
      return { session: next, response: summaryResponse(next.state) };
    }
    case 'end-day': {
      if (!session) return { session, response: errorResponse('no-session', 'No active session') };
      if (session.state.dayPhase !== DayPhase.DAY) {
        return {
          session,
          response: errorResponse('wrong-phase', 'end-day requires the DAY phase'),
        };
      }
      const { state } = endDay(session.state);
      const next: ProtocolSession = { seed: session.seed, state };
      return { session: next, response: summaryResponse(next.state) };
    }
    case 'apply-action': {
      if (!session) return { session, response: errorResponse('no-session', 'No active session') };
      if (session.state.dayPhase !== DayPhase.DAY) {
        return {
          session,
          response: errorResponse('wrong-phase', 'apply-action requires the DAY phase'),
        };
      }
      let result: { state: GameState; events: GameEvent[] };
      try {
        result = applyPlayerAction(session.state, request.action);
      } catch (error) {
        // Malformed action (e.g. a die/param the resolver requires is missing).
        // Surface as a typed error; the session is untouched (no commit).
        const message = error instanceof Error ? error.message : 'apply-action failed';
        return { session, response: errorResponse('apply-failed', message) };
      }
      if (isActionBlocked(result.events)) {
        // A legal-shape action the engine refused (active encounter). Do NOT
        // commit — keep the session clean and report the block as an error.
        return {
          session,
          response: errorResponse('action-blocked', 'Action blocked by an active encounter'),
        };
      }
      const next: ProtocolSession = { seed: session.seed, state: result.state };
      return {
        session: next,
        response: {
          type: 'action-result',
          summary: buildStateSummary(next.state),
          events: result.events,
        },
      };
    }
    default: {
      // Exhaustiveness guard for runtime-unknown request shapes (stdio).
      const unknown = request as { type?: unknown };
      return {
        session,
        response: errorResponse('unknown-request', `Unknown request type: ${String(unknown.type)}`),
      };
    }
  }
}
