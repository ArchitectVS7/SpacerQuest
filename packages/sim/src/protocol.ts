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
  CREW_ROLES,
  EXPLORATION_FUEL_COST,
  NEMESIS_SYSTEM_ID,
  PURCHASABLE_PORTS,
  STAR_SYSTEMS,
  YARD_COMPONENT_TIER_PRICES,
  isGatedDestination,
  isPurchasablePort,
  type HangoutVenueId,
} from '@spacerquest/content';
import {
  DARE_MAX_FACE,
  DayPhase,
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  applyPlayerAction,
  canReachSystem,
  careerEnded,
  createInitialState,
  crewCapacity,
  demoConcluded,
  demoDaysRemaining,
  demoLocked,
  deserializeState,
  eligibleStorylets,
  endDay,
  eraPortIncomeMultiplier,
  quotePort,
  shipyardFailure,
  serializeState,
  startDay,
  loanBandFor,
  venueOffered,
  wagerBandFor,
  liarsDiceOpponentsAt,
  legalDareMoves,
  minOpeningQuantity,
  type Edition,
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
  // T-1703 · `edition` is OPTIONAL and defaults to 'full', so every existing
  // caller and every recorded replay log is unchanged. It exists because
  // `createInitialState` has always taken an edition while this message passed
  // only the seed — which left the entire demo licence (both `demo-locked` verbs,
  // the `demo-ended` refusal, the demo branch of the stop signal, and the
  // `edition` / `demoDaysRemaining` summary fields) unreachable from ANY protocol
  // client, including the harness that would regression-test the shipped demo
  // build. Standing constraint 2: if a feature cannot be reached headlessly, it is
  // not done.
  | { type: 'new-game'; seed: number; edition?: Edition }
  | { type: 'reset'; seed: number; edition?: Edition }
  | { type: 'state-summary' }
  | { type: 'legal-actions' }
  | { type: 'start-day' }
  | { type: 'end-day' }
  | { type: 'apply-action'; action: PlayerAction };

export type ProtocolErrorCode = 'no-session' | 'wrong-phase' | 'apply-failed' | 'unknown-request';

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
  /** T-1703 · Which licence this career is flown on — 'full' | 'demo' (engine
   *  `GameState.edition`). A harness needs it to interpret the two gated verbs it
   *  will never be offered in a demo session. */
  edition: string;
  /** T-1703 · Days of demo left, counting today, or `null` for a full career —
   *  the harness's warning that this session has a hard end. 0 once the licence
   *  has expired (at which point `legalActions` returns the stop signal). */
  demoDaysRemaining: number | null;
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
  /** T-1306 · Re-roll charges left today (from a reroll crew member); 0 with none. */
  rerollsRemaining: number;
  /** T-1306 · Hired crew, by role id — the dice-progression source. */
  crew: string[];
  /** T-1306 · Cabin berths (crewCapacity) — the hiring cap. */
  crewCapacity: number;
  /** T-1307 · Owned port stakes, by system id — the purchasable-property income
   *  ledger (each accrues per-dusk launch-fee income). Read by the harness/T-1405. */
  ports: number[];
  /** T-1604a F10 · The port stakes that are STILL FOR SALE, with what each costs
   *  and what it pays back per dusk. `ports` above says only what you already own,
   *  so before this field a protocol client could not find out that stakes exist,
   *  where they are sold, or what they cost: `Port/buy` is advertised only while
   *  you are already standing in a purchasable system with the local price
   *  covered, so the whole property tier was discoverable only by coincidence.
   *  The UI reads the same content table to draw its ledger pane; this publishes
   *  it on the wire so a headless client can plan a purchase instead of stumbling
   *  into one. Excludes systems already owned (those are in `ports`). */
  portOffers: { systemId: number; price: number; duskIncome: number }[];
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
    edition: state.edition,
    demoDaysRemaining: demoDaysRemaining(state),
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
    rerollsRemaining: player.dawnHand?.rerollsRemaining ?? 0,
    crew: player.crew.map((member) => member.roleId),
    crewCapacity: crewCapacity(ship),
    ports: player.ports.map((port) => port.systemId),
    // T-1604a F10 · every stake still for sale, priced. `eraPortIncomeMultiplier`
    // is the same era lever quotePort() applies, so the published duskIncome is
    // what the stake would actually pay today rather than the raw content number.
    portOffers: PURCHASABLE_PORTS.filter(
      (port) => !player.ports.some((owned) => owned.systemId === port.systemId),
    ).map((port) => ({
      systemId: port.systemId,
      price: port.purchasePrice,
      duskIncome: Math.round(
        port.baseDuskIncome * eraPortIncomeMultiplier(state.eraEvent, port.systemId),
      ),
    })),
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

/** The ceiling the cargo-pod quantity search bisects against. The engine's own
 *  `CAPACITY_EXCEEDED` check is what actually bounds a purchase — this is only the
 *  upper end of the range being searched, kept at the value the unbounded spec used
 *  to advertise so nothing that was reachable before becomes unreachable. */
const MAX_ADVERTISED_CARGO_PODS = 100;

/** The licences `new-game`/`reset` accept. Kept beside the handler that validates
 *  against it so an added edition cannot reach `createInitialState` unchecked. */
const EDITIONS: Edition[] = ['full', 'demo'];

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

  // T-1703 · THE DEMO LICENCE HAS EXPIRED — the protocol's stop signal, and it
  // MUST SIT ABOVE THE PHASE BRANCH. That placement is the one interesting thing
  // here, and it is a real difference from the T-1505c terminus below rather than
  // a style choice: a career ends at the Nemesis shear MID-DAY (the ship arrives
  // in the DAY phase), so the phase branch below never sees it; a demo ends at a
  // DAY BOUNDARY, so the state a driver is holding when `demoConcluded` first goes
  // true is DAWN — and the phase branch would cheerfully advertise `start-day`
  // forever, spinning a headless driver through day 34, 35, 36 … of a career whose
  // every verb is refused with `ActionBlocked{'demo-ended'}`.
  //
  // Empty `actions` + `canWait: false` + no `lifecycle` is the same stop signal
  // the terminus uses: there is nothing left to do, and no dawn worth starting.
  if (demoConcluded(state)) {
    return {
      phase,
      inEncounter: state.encounter !== null,
      diceRemaining,
      actions: [],
      canWait: false,
      lifecycle: [],
    };
  }

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

  // T-1505c · D8 · THE CAREER IS OVER. The ship stands on the far side of the
  // Nemesis shear (engine `careerEnded`), where `applyPlayerAction` refuses every
  // blockable verb with `ActionBlocked{'career-ended'}` — so advertising anything
  // here would stall a headless driver on a guaranteed refusal, the same failure
  // mode the T-1101 destination gate below exists to prevent. An empty
  // `actions` + `canWait: false` + no `lifecycle` IS the protocol's stop signal:
  // there is nothing left to do, and no dusk worth rolling.
  if (careerEnded(state)) {
    return {
      phase,
      inEncounter: false,
      diceRemaining,
      actions: [],
      canWait: false,
      lifecycle: [],
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

  // T-135 · AN OPEN LIAR'S DICE HAND, and the SAME SHAPE the encounter branch
  // above takes, deliberately: the engine's gate 1 refuses every one of the six
  // blockable verbs with `ActionBlocked{'active-dare-hand'}` while a hand stands,
  // so advertising any of them — including the `VisitHangout{venue:'dare'}` that
  // would open a second hand — would hand a headless driver a guaranteed refusal.
  // That is the T-1101 law and the same drift the T-120 port mirror closed. Only
  // the scene's own verb is offered, exactly as only `Combat` is offered above.
  //
  // The `move` domain is filtered through the engine's OWN `legalDareMoves` (§5.4),
  // so there is one definition of legality across the engine's refusal, the
  // dealer's choice, this advertisement and the sim's planner. 'peek' is dropped
  // when no die is left, mirroring the resolver's own die check.
  if (state.dareHand) {
    const hand = state.dareHand;
    const moveChoices = legalDareMoves(hand, 'player', player.credits).filter(
      (move) => move !== 'peek' || hasDie,
    );
    // T-160 · THE OPENING FLOOR, advertised (§16.2 shape (b)). `quantity` and
    // `face` are advertised INDEPENDENTLY, so the honest per-param floor for an
    // opening is the floor that holds for EVERY face the driver might pick —
    // `1 + min over faces of own(face)`, i.e. the engine's own
    // `minOpeningQuantity` at its weakest input. A driver that picks a face it
    // holds more of still needs a taller claim, which the `note` says and the
    // resolver refuses; a per-param spec cannot express a cross-param rule, and
    // over-advertising a floor would forbid legal claims.
    const openingFloor = hand.bid
      ? hand.bid.quantity
      : minOpeningQuantity(
          Math.min(
            ...Array.from(
              { length: DARE_MAX_FACE },
              (_unused, index) => hand.playerDice.filter((die) => die === index + 1).length,
            ),
          ),
        );
    const params: LegalActionSpec['params'] = {
      move: { kind: 'enum', choices: moveChoices },
      // T-160 · the ceiling is the HAND'S FROZEN `maxQuantity` (§8 row 5), not the
      // literal 8 that stood here — a literal 8 under-advertises the domain at
      // every tier >= 1, where `maxQuantity` is 10 or 12. Found while threading
      // the opening floor through this same object; fixed here because the fix is
      // one token on a line already being edited.
      quantity: { kind: 'int', min: openingFloor, max: hand.maxQuantity },
      face: { kind: 'int', min: hand.bid ? hand.bid.face : 1, max: DARE_MAX_FACE },
    };
    if (hasDie) params.spendDie = dieParam;
    actions.push({
      type: 'Dare',
      params,
      note: "One move in the open Liar's Dice hand. quantity/face are required for bid and the raises; an OPENING bid must claim MORE of the face than you hold of it (quantity > your own count of that face); a face raise moves the face up by exactly one and leaves quantity unchanged; a quantity raise leaves the face unchanged. spendDie applies to 'peek' only.",
    });
    return {
      phase,
      inEncounter: false,
      diceRemaining,
      actions,
      canWait: true,
      lifecycle: ['end-day'],
    };
  }

  // --- Trade -------------------------------------------------------------
  // T-196b: buy-fuel / sign-contract / abandon-contract are FREE ACTIONS as of
  // T-196a, but this enumerator still gates them on `hasDie` and still advertises
  // `spendDie: dieParam`. The engine IGNORES the field (zod strips it), so the
  // advertising is inert-but-stale — it is the INSTRUMENT, and instruments move in
  // T-196b so the two capstone arms stay attributable. Same for the Shipyard, Crew
  // and Port blocks below. `haggle` keeps its die for real.
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

  // T-1604b · The player-initiated hold release (UGT finding F2). This is the
  // HEADLESS reachability of the fix: without it a protocol driver carrying an
  // undeliverable contract has no advertised way to free the hold, which is half
  // of the measured poverty trap. Advertised exactly when the engine will honour
  // it — a die in hand and something in the hold — so it is never a guaranteed
  // refusal (the same T-1101 law the destination gate below follows).
  if (hasDie && player.activeContract) {
    actions.push({
      type: 'Trade',
      action: 'abandon-contract',
      params: { spendDie: dieParam },
      note: 'Dumps the cargo and frees the hold. Forfeits the payment; the contract does not return to the board.',
    });
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
    // T-1101 · Honor the engine's destination gate here so legalActions never
    // advertises a Travel the day.ts gate will deterministically refuse with a
    // 'destination-locked' ActionBlocked. Gated systems (Andromeda 21–26 and the
    // specials 27–28) stay off the choice list until the 'nemesis.crossing.unlocked'
    // flag is set — the exact predicate day.ts applyPlayerAction reads. Without
    // this, a UGT-protocol client (incl. the LLM playtest harness) could pick a
    // "legal" destination that always fails, burning a die on the block — the same
    // stall risk that made the sim pickers in index.ts adopt travelableSystemIds().
    //
    // T-1505b · The lift is NEMESIS-ONLY, mirroring day.ts exactly: paying the
    // crossing stake opens NEMESIS_SYSTEM_ID and nothing else, so Andromeda
    // (21–26) and MALIGNA (27) are never advertised — they stay sealed for the
    // expansion (PRD §10) and the engine would still ActionBlock them.
    //
    // T-1604a F3 · …and honor the FUEL gate for the same reason. The lock filter
    // above was the only one here, so a tank that could not cover a jump still saw
    // every system on the map advertised; `resolveTravel` spends the die and rolls
    // the pilot check BEFORE it reaches its fuel branch, so the refusal
    // (`TravelEvent{insufficientFuel}`) costs a die and returns nothing. That is not
    // an `ActionBlocked`, so it never touched the parity counter and went unnoticed
    // until a campaign measured a captain burning all five dice a day on it for a
    // fortnight. `canReachSystem` is the resolver's own predicate, exported from
    // `actions/travel.ts` and shared with the cockpit's route preview — the same
    // "never advertise a guaranteed refusal" law as the lock filter, applied to the
    // other thing that guarantees one.
    const nemesisUnlocked = state.flags['nemesis.crossing.unlocked'] === true;
    const destinations = ALL_SYSTEM_IDS.filter(
      (id) =>
        id !== player.currentSystemId &&
        (!isGatedDestination(id) || (nemesisUnlocked && id === NEMESIS_SYSTEM_ID)) &&
        canReachSystem(state, id),
    );
    // A dry tank reaches nothing, and an empty `choices` list would be a spec no
    // caller can fill — so the verb is withheld entirely rather than advertised
    // unfillable. The way out of that state is fuel, the dusk subsistence floor, or
    // `abandon-contract`, all of which stay advertised.
    if (destinations.length > 0) {
      actions.push({
        type: 'Travel',
        params: {
          destinationId: { kind: 'system-id', choices: destinations },
          spendDie: dieParam,
        },
        note: 'Only destinations the current tank can reach are listed; fuel burned scales with distance, and a jump may be interrupted by an encounter.',
      });
    }
  }

  // --- Explore -----------------------------------------------------------
  // T-111: an open multi-day recovery makes the verb a GUARANTEED refusal
  // (`ExplorationFailed{'recovery-in-progress'}`, actions/exploration.ts), so it
  // is withheld rather than advertised — the same discipline the dry-tank Travel
  // gate above applies. Without this the policies would spend actions on a no-op
  // and T-116's ablation would measure noise instead of the verb.
  if (hasDie && ship.fuel >= EXPLORATION_FUEL_COST && player.recovery === null) {
    actions.push({
      type: 'Explore',
      params: { spendDie: dieParam },
      note: `Burns ${EXPLORATION_FUEL_COST} fuel; PILOT nav check charts a POI on success. A high-value find opens a multi-day recovery that must be held station on.`,
    });
  }

  // --- Re-roll a dawn die (T-1306) ---------------------------------------
  // Advertised only while a re-roll charge is banked (a reroll crew member set it
  // at dawn) AND there is an unspent die to re-roll. `dieIndex` reuses the die-
  // index domain (the unspent indices). Consumes a charge, not a whole die.
  if ((player.dawnHand?.rerollsRemaining ?? 0) > 0 && hasDie) {
    actions.push({
      type: 'Reroll',
      params: { dieIndex: dieParam },
      note: 'Consumes one re-roll charge (from a reroll crew member); re-rolls the named unspent die in place.',
    });
  }

  // --- Hire / dismiss crew (T-1306) --------------------------------------
  // Hiring is advertised while a cabin berth is free and there is an unhired role
  // to fill it; dismissing while any crew is aboard. Affordability (hire price) is
  // validated on apply — this only keeps the harness from proposing a hire with no
  // berth. Crew are the dice-progression source (extra die / re-roll / floor).
  if (hasDie) {
    const hiredRoleIds = new Set(player.crew.map((member) => member.roleId));
    const hireableRoleIds = CREW_ROLES.map((role) => role.id).filter((id) => !hiredRoleIds.has(id));
    // T-1703 · A demo licence does not sign hands (content demo.ts's
    // 'crew-progression' lock — the "Hangout progression" on the task's gate
    // list). Never advertise a GUARANTEED refusal (the T-1101 law): the engine
    // answers a demo hire with `ActionBlocked{'demo-locked'}`, so offering it
    // would stall a headless driver on a wall. DISMISS stays advertised below —
    // a promoted-then-demoted career can carry crew in, and letting someone go is
    // not progression.
    // T-1604a F5 · …and filter the roles by the HIRE PRICE, for the same reason.
    // `resolveCrew` used to spend the die before it checked credits, so an
    // unaffordable hire cost a die and returned `CrewEvent{failed}` — the campaign
    // sent 247 of them and berthed nobody. T-196a made the hire FREE, so the wasted
    // die is gone; the filter STAYS, because the T-1101 law is "never advertise a
    // guaranteed refusal", not "never waste a die". `roleId` is the only
    // discriminating parameter here, so filtering it is exact: every role still
    // advertised can actually be signed.
    const affordableRoleIds = hireableRoleIds.filter((id) => {
      const role = CREW_ROLES.find((candidate) => candidate.id === id);
      return role !== undefined && player.credits >= role.hirePrice;
    });
    if (
      !demoLocked(state, 'crew-progression') &&
      player.crew.length < crewCapacity(ship) &&
      affordableRoleIds.length > 0
    ) {
      actions.push({
        type: 'Crew',
        action: 'hire',
        params: {
          roleId: { kind: 'enum', choices: affordableRoleIds },
          spendDie: dieParam,
        },
        note: 'Only roles the purse can cover are listed. Berthed against cabin capacity.',
      });
    }
    if (player.crew.length > 0) {
      actions.push({
        type: 'Crew',
        action: 'dismiss',
        params: {
          roleId: { kind: 'enum', choices: player.crew.map((member) => member.roleId) },
          spendDie: dieParam,
        },
        note: 'Removes the crew member (no refund), freeing a berth.',
      });
    }
  }

  // --- Buy a port stake (T-1307) -----------------------------------------
  // Advertised only at a purchasable core port (isPurchasablePort) the player does
  // not already own, with an unspent die. `systemId` is FIXED to the current system
  // (you buy the port you stand in — resolvePortPurchase typed-fails otherwise). The
  // purchase price is validated on apply (emits PortEvent{failed} if unaffordable),
  // exactly like the crew/shipyard advertise-gates. Ports are purchasable property:
  // each owned stake accrues per-dusk launch-fee income (PRD §9).
  // T-1703 · `!demoLocked(state, 'port-ownership')` — a demo licence does not buy
  // the dock ("ports" on the task's gate list). Same reasoning as the crew hire
  // above: the engine refuses it with `ActionBlocked{'demo-locked'}`, so
  // advertising it would be advertising a guaranteed refusal.
  // T-1604a F5 · The stake is now gated on the engine's own `quotePort().ok` — the
  // exact predicate the ledger pane disables its button on. `resolvePortPurchase`
  // used to spend the die before it checked credits, so advertising an unaffordable
  // stake cost a die and returned `PortEvent{failed}`; T-196a made the buy FREE, so
  // the wasted die is gone and the gate stays for the T-1101 reason alone (never
  // advertise a guaranteed refusal). `systemId` is fixed here, so there is no domain
  // to narrow and the whole verb is withheld instead.
  if (
    hasDie &&
    !demoLocked(state, 'port-ownership') &&
    isPurchasablePort(player.currentSystemId) &&
    !player.ports.some((port) => port.systemId === player.currentSystemId) &&
    quotePort(state, player.currentSystemId).ok
  ) {
    actions.push({
      type: 'Port',
      action: 'buy',
      params: {
        systemId: { kind: 'fixed', value: player.currentSystemId },
        spendDie: dieParam,
      },
      note: 'Advertised only when affordable (engine quotePort().ok). Accrues per-dusk launch-fee income.',
    });
  }

  // --- Visit the Hangout (T-1303) ----------------------------------------
  // Advertised only where the engine's hangout gate (day.ts) will admit it: a
  // `hasHangout` system with at least one in-system NPC to face and an unspent
  // die. `opponentId` is enumerated to the ids of NPCs whose SIMULATED position
  // is the player's system — the exact set resolveVisitHangout accepts (a Dare /
  // social beat against anyone else is a typed HangoutEvent fail), honoring "an
  // NPC actually present in-system". `venue` picks the beat; `wager` is the Dare
  // stake domain. The engine validates the rest on apply.
  // F-121-1 · `!npc.dead` is part of "the exact set resolveVisitHangout accepts"
  // the comment below claims: the resolver filters `!n.dead` (its N3 guard), so
  // advertising a dead captain as an opponent offers the driver an action the
  // engine answers with a typed 'no-opponent' fail. Latent until T-121 gave
  // fourteen ports a bar; see the same repair in `planDare`.
  const inSystemNpcIds = state.npcs
    .filter((npc) => !npc.dead && npc.currentSystemId === player.currentSystemId)
    .map((npc) => npc.id);
  // T-145 · POOL A, the fixed Liar's Dice roster. Without this the UGT protocol
  // cannot reach the 42 authored opponents AT ALL, and T-145's own "all 42 are
  // reachable through the real UI" criterion fails — which is exactly why this
  // lands here rather than with the ladder. Broke opponents are dropped for the
  // same reason a dead captain is: the engine refuses them with a typed
  // 'opponent-broke' (§7.4) and advertising one would burn a die on a refusal that
  // was knowable before it was sent.
  const rosterOpponentIds = liarsDiceOpponentsAt(player.currentSystemId)
    .filter((opponent) => (state.liarsDicePurses[opponent.id] ?? 0) > 0)
    .map((opponent) => opponent.id);
  if (hasDie && STAR_SYSTEMS[player.currentSystemId]?.hasHangout) {
    // T-1304: the venue set depends on live state. 'rumor' is always available at
    // a Hangout; the social/dare beats need an in-system NPC to face; the Penny
    // Wise lending beat is `borrow` while there's no loan and `repay` while there
    // is (the engine typed-fails the wrong one either way — this just keeps the
    // harness honest). Lending needs NO co-located NPC (Penny Wise is the desk),
    // so it — and the whole VisitHangout action — is now advertised even at an
    // empty Hangout, making the §7.5 bad-day loan out reliably reachable.
    const liveVenues: HangoutVenueId[] = ['rumor', state.player.loan ? 'repay' : 'borrow'];
    if (inSystemNpcIds.length > 0) {
      liveVenues.unshift('dare', 'meet', 'befriend', 'insult');
    } else if (rosterOpponentIds.length > 0) {
      // T-145 · The house's own three seats are ALWAYS at their port, so 'dare' is
      // possible at an otherwise-empty Hangout. The three SOCIAL beats are not:
      // they need an `NpcState` for `applyDisposition`, which pool A does not have
      // (§1 rule 1), and the engine typed-fails a roster id at a social venue with
      // 'no-opponent'. So only 'dare' is advertised on this arm.
      liveVenues.unshift('dare');
    }
    // T-120 · THE PORT MIRROR. Live state decides which beats are POSSIBLE (above);
    // the port's venue definition decides which it OFFERS. Advertising a venue the
    // house does not run would burn a die on a guaranteed 'venue-not-offered'
    // refusal, so the harness drops it here — the same rule the engine enforces,
    // read through the same accessor. At Sol-3 all seven are offered, so this
    // filter is the identity and the advertised array is byte-identical to before.
    const venueChoices: string[] = liveVenues.filter((venue) =>
      venueOffered(player.currentSystemId, venue),
    );
    // A port that offers none of the currently-possible beats is not advertised at
    // all rather than advertised with an empty domain.
    if (venueChoices.length > 0) {
      const wagerBand = wagerBandFor(player.currentSystemId);
      // T-133 · the PRINCIPAL domain is the port's too (owner ruling D7), read
      // through the same `loanBandFor` accessor the resolver clamps with. A
      // harness that advertised the global 250–5,000 at the garrison mess would
      // hand a driver an `amount` the engine silently trims, which is the same
      // class of drift as advertising a venue the house does not run.
      const loanBand = loanBandFor(player.currentSystemId);
      actions.push({
        type: 'VisitHangout',
        params: {
          venue: { kind: 'enum', choices: venueChoices },
          opponentId: { kind: 'enum', choices: [...inSystemNpcIds, ...rosterOpponentIds] },
          wager: { kind: 'int', min: wagerBand.min, max: wagerBand.max },
          amount: { kind: 'int', min: loanBand.min, max: loanBand.max },
          spendDie: dieParam,
        },
        note: "opponentId required for dare/meet/befriend/insult; omitted for rumor/borrow/repay. The choices span BOTH pools: an in-system roaming NPC, or one of the port's three fixed Liar's Dice roster opponents (the 'ld-' ids, listed only while their purse is above zero). A roster id is valid for 'dare' ONLY — meet/befriend/insult need a roaming NPC. wager applies to 'dare' only (clamped to the port's band and to what both sides can cover). amount applies to borrow (principal, clamped to the port's loan band) and repay (credits to pay, default = full outstanding, clamped to credits).",
      });
    }
  }

  // --- Shipyard ----------------------------------------------------------
  //
  // T-1604a F5 · THE YARD USED TO ADVERTISE FOUR SHAPES AND LET THE ENGINE SAY NO.
  // `resolveShipyard` documents that the die is spent BEFORE the business checks
  // (`shipyard.ts` ~L545), and the cockpit's mitigation is to gate every button on
  // `quoteShipyard().ok` — a mitigation that existed only in the UI. Over the wire
  // the four unconditional shapes meant 707 shipyard applies produced **482
  // `ShipyardFail`s**, each one a die burned on a refusal that was knowable before
  // it was sent (docs/playtests/T-1604a-ugt-campaign.md §7 F5).
  //
  // The fix is not a new "is this affordable" field for the caller to interpret —
  // it is to narrow what is advertised until FILLING A SPEC FROM ITS OWN DECLARED
  // DOMAINS ALWAYS SUCCEEDS, which is the contract the rest of this enumerator
  // already keeps. Two of the four shapes have a single discriminating parameter,
  // so the domain can be filtered exactly. The other two are JOINT (cost depends on
  // component AND tier / on repairMode AND component), and a `ParamSpec` cannot
  // express a joint domain — so those split into one spec per component, each with
  // an exact domain. More specs, no guesswork.
  //
  // Every gate below calls the engine's own `shipyardFailure` rather than
  // recomputing a price here: content owns the numbers, and a second copy of them
  // in the enumerator is exactly the drift this file exists to avoid.
  //
  // T-196a · the probe actions no longer carry a placeholder `spendDie` — the
  // Shipyard shape dropped the field when M17 made the yard a Free Action
  // (docs/DAWN-HAND-REDESIGN.md §3). The `hasDie` gate and the `spendDie: dieParam`
  // entries in the ADVERTISED param specs below are deliberately left in place:
  // they are the instrument, and the instrument moves in T-196b, not here.
  if (hasDie) {
    const canAfford = (action: Extract<PlayerAction, { type: 'Shipyard' }>): boolean =>
      shipyardFailure(state.player, action) === null;

    // buy-component-tier — one spec per component. `YARD_COMPONENT_TIER_PRICES` is
    // strictly increasing and the trade-in is a per-component constant, so the
    // affordable tiers are a PREFIX 1..k and an int domain expresses them exactly.
    for (const component of SHIPYARD_COMPONENTS) {
      let maxTier = 0;
      for (let tier = 1; tier <= YARD_COMPONENT_TIER_PRICES.length; tier += 1) {
        if (
          !canAfford({
            type: 'Shipyard',
            action: 'buy-component-tier',
            component,
            tier,
          })
        ) {
          break;
        }
        maxTier = tier;
      }
      if (maxTier >= 1) {
        actions.push({
          type: 'Shipyard',
          action: 'buy-component-tier',
          params: {
            component: { kind: 'fixed', value: component },
            tier: { kind: 'int', min: 1, max: maxTier },
            spendDie: dieParam,
          },
          note: `Every listed tier is affordable right now (tiers above ${maxTier} are not).`,
        });
      }
    }

    // repair — 'all' and 'single' price differently and 'single' also gates on the
    // component's condition, so they are separate specs. `repairMode: 'all'` carries
    // NO `component` key at all: the resolver branches on the mere presence of one
    // (shipyard.ts:206-207,428), so filling it would silently downgrade a repair-all
    // to a single-part repair — the F-R2-2 defect, made unrepresentable here.
    if (canAfford({ type: 'Shipyard', action: 'repair', repairMode: 'all' })) {
      actions.push({
        type: 'Shipyard',
        action: 'repair',
        params: {
          repairMode: { kind: 'fixed', value: 'all' },
          spendDie: dieParam,
        },
        note: 'Repairs every component. Send no `component` key — its presence selects a single-part repair.',
      });
    }
    for (const component of SHIPYARD_COMPONENTS) {
      if (
        canAfford({
          type: 'Shipyard',
          action: 'repair',
          repairMode: 'single',
          component,
        })
      ) {
        actions.push({
          type: 'Shipyard',
          action: 'repair',
          params: {
            repairMode: { kind: 'fixed', value: 'single' },
            component: { kind: 'fixed', value: component },
            spendDie: dieParam,
          },
          note: 'Repairs this component only; it is below max condition and the repair is affordable.',
        });
      }
    }

    // buy-cargo-pods — `quantity` is the only discriminating parameter and the
    // failure predicate is monotone in it (capacity and cost both rise), so the
    // largest legal quantity is found by bisection over the engine's own check
    // rather than by re-deriving the pod price and the hull capacity rule here.
    if (canAfford({ type: 'Shipyard', action: 'buy-cargo-pods', quantity: 1 })) {
      let low = 1;
      let high = MAX_ADVERTISED_CARGO_PODS;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (
          canAfford({
            type: 'Shipyard',
            action: 'buy-cargo-pods',
            quantity: mid,
          })
        ) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      actions.push({
        type: 'Shipyard',
        action: 'buy-cargo-pods',
        params: {
          quantity: { kind: 'int', min: 1, max: low },
          spendDie: dieParam,
        },
        note: 'Every quantity in range fits the hull and the purse.',
      });
    }

    // buy-special-equipment — `equipment` is the only discriminating parameter, so
    // the enum filters exactly: affordability, renown and mutual exclusion all live
    // inside `shipyardFailure`, and anything still listed will be sold.
    const purchasableEquipment = SPECIAL_EQUIPMENT.filter((equipment) =>
      canAfford({
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment,
      }),
    );
    if (purchasableEquipment.length > 0) {
      actions.push({
        type: 'Shipyard',
        action: 'buy-special-equipment',
        params: {
          equipment: { kind: 'enum', choices: [...purchasableEquipment] },
          spendDie: dieParam,
        },
        note: 'Only equipment that passes affordability, renown and mutual exclusion is listed.',
      });
    }
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
      // T-1703 · An unrecognised edition is a typed error, not a silent fall back
      // to 'full': a harness that asked for a demo and got a full career would
      // report demo coverage it never had, which is worse than a refusal.
      if (request.edition !== undefined && !EDITIONS.includes(request.edition)) {
        return {
          session,
          response: errorResponse(
            'unknown-request',
            `Unknown edition: ${String(request.edition)}. Expected one of ${EDITIONS.join(' | ')}.`,
          ),
        };
      }
      const next: ProtocolSession = {
        seed: request.seed,
        state: createInitialState(request.seed, request.edition ?? 'full'),
      };
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
        // PARITY (T-1003): the engine appended the ActionBlocked event to
        // result.state.eventLog (day.ts) and the UI commits that state — so the
        // protocol MUST commit it too, or the two event streams diverge (the
        // protocol used to discard the state and return a bare `error`, leaving
        // its consumer's event log missing the refusal the UI records). The block
        // is side-effect-free (no die spent, no dayEventCount bump — day.ts
        // returns early), so this commit is a pure log-append. We surface the
        // refusal as an action-result whose `events` carry the ActionBlocked; a
        // harness detects the refusal by scanning events for 'ActionBlocked',
        // exactly as App.tsx does.
        const blockedNext: ProtocolSession = { seed: session.seed, state: result.state };
        return {
          session: blockedNext,
          response: {
            type: 'action-result',
            summary: buildStateSummary(blockedNext.state),
            events: result.events,
          },
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
