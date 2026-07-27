import {
  STAR_SYSTEMS,
  CARGO_TYPES,
  STORYLETS,
  NPC_PROFILES,
  ANONYMOUS_INTERCEPTORS,
  SHIP_COMPONENTS,
  SPECIAL_EQUIPMENT,
  RENOWN_RANKS,
  RENOWN_DEED_THRESHOLDS,
  Stat,
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  EXPLORATION_NAV_DC,
  EXPLORATION_FUEL_COST,
  DARE_MIN_WAGER,
  DARE_MAX_WAGER,
  LOAN_MIN_PRINCIPAL,
  LOAN_MAX_PRINCIPAL,
  LOAN_DAILY_RATE,
  LOAN_TERM_DAYS,
  LENDER_ID,
  CREW_ROLES,
  CREW_BY_ID,
  PURCHASABLE_PORTS_BY_SYSTEM,
  isPurchasablePort,
  FACTION_IDS,
  FACTION_LABELS,
  NEMESIS_SYSTEM_ID,
  NEMESIS_CROSSING_DC,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_REQUIRED_RANK,
  CROSSING_ENDING,
  type FactionId,
  type StoryletTrigger,
  type CrewRole,
} from '@spacerquest/content';
import {
  maxJumpDistance,
  navBonus,
  quoteShipyard,
  nemesisLoreIndex,
  fragmentCount,
  quoteCrossingStake,
  careerEnded,
  careerEpilogue,
  componentTierForStrength,
  tributeForRound,
  nextRankFor,
  quoteStoryletChoice,
  travelPreview,
  quoteFuelPurchase,
  hangoutRumors,
  dawnDiceModifiers,
  equipmentDiceBenefits,
  quotePort,
  crewCapacity,
  isCarryingContraband,
  isCarryingIllicit,
  type CheckResult,
  type GameEvent,
  type GameState,
  type PlayerAction,
  type ShipComponentId,
  type SpecialEquipmentId,
  type ShipyardFail,
  type ShipyardQuote,
  type StoryletOffer,
  type NemesisLoreEntry,
  type CrossingRefusal,
  type TravelPreview,
  type FuelPurchaseQuote,
  type PortQuote,
  type PortEventFailReason,
  type SaveErrorCode,
} from '@spacerquest/engine';
import type { RenownRankId, AnonymousInterceptorKind } from '@spacerquest/content';
// T-1701a · TYPE-ONLY on purpose: `format.ts` is the pure-prose module and must
// not acquire a runtime dependency on the storage seam (which has module-scope
// side effects — it performs the one-time localStorage import). Only the two
// storage-failure sentences below are backend-dependent, and they take the
// backend as a parameter rather than reading it. T-1701b adds `UpdateStatus` on
// the same terms — `updateStatusMessage` takes it as a parameter too.
import type { StorageBackend, UpdateStatus } from './storage';

/** Display label for a stat. The Stat enum values are already the labels we
 * want, so this is a stable pure lookup (no fabricated names). */
export function statName(stat: Stat): string {
  return String(stat).toUpperCase();
}

/**
 * Derive the styling verdict for a resolved check from the engine's result —
 * never recomputed, only read. Nat 20 / nat 1 outrank ordinary pass/miss so the
 * readout can give them distinct juice (PRD: the dice are honest and visible).
 */
export function checkVerdict(r: CheckResult): 'crit' | 'fumble' | 'pass' | 'miss' {
  if (r.nat20) return 'crit';
  if (r.nat1) return 'fumble';
  return r.success ? 'pass' : 'miss';
}

/** Signed margin, e.g. "+3" / "-2" / "0", for the honest readout. */
export function signedMargin(margin: number): string {
  return margin > 0 ? `+${margin}` : `${margin}`;
}

export function systemName(id: number): string {
  return STAR_SYSTEMS[id]?.name ?? `System-${id}`;
}

export function cargoName(id: number): string {
  return CARGO_TYPES[id]?.name ?? `Cargo-${id}`;
}

// ---- T-305 manifest flags (display-only) ---------------------------------
//
// The URGENT / STORYLET badges the manifest board shows are PRESENTATIONAL
// reads of existing engine + content state — the UI invents no new rule and
// adds no field to CargoContract. A contract is URGENT when its destination is
// repriced by the active era event (the honest derivation of the PRD's
// "Medicinals to Fomalhaut-2, flagged URGENT — fever outbreak" example); it
// carries a STORYLET when the cargo it moves has a storylet keyed to it in
// content data (e.g. Medicinals → cargo.medicinals.quarantine-seal).

/** Cargo types that any content storylet is keyed to via
 *  `trigger.cargo.activeContractCargoType`. Computed once from content data —
 *  this reads authored data, never a rule. */
const CARGO_STORYLET_TYPES: ReadonlySet<number> = new Set(
  STORYLETS.map((s) => (s.trigger as StoryletTrigger).cargo?.activeContractCargoType).filter(
    (t): t is number => typeof t === 'number',
  ),
);

/** True when carrying this cargo type can surface a storylet (display-only). */
export function cargoHasStorylet(cargoType: number): boolean {
  return CARGO_STORYLET_TYPES.has(cargoType);
}

/** True when a contract's destination is repriced by the active era event, the
 *  single commented place the URGENT derivation lives (display-only). */
export function contractIsUrgent(game: GameState, destination: number): boolean {
  return game.eraEvent?.affectedSystemIds.includes(destination) ?? false;
}

/** T-1402 · The engine's advisory fuel-purchase preview (cost, delivered, wasted,
 *  overspend, affordability), re-exported so the fuel depot can warn BEFORE the buy
 *  commits. A pure read — the engine still clamps the tank on resolve; this only
 *  surfaces the clamp so the spacer isn't silently charged for fuel they can't hold. */
export function fuelPurchaseQuote(game: GameState, fuelAmount: number): FuelPurchaseQuote {
  return quoteFuelPurchase(game, fuelAmount);
}

// ---- T-304 starmap -------------------------------------------------------
//
// Every rule number the starmap shows flows out of an engine function — never
// recomputed here. `routePreview` is a thin pass-through to the engine's
// `travelPreview` (fuel cost / pilot DC / danger / reachability); the fuel-range
// ring radius comes from maxJumpDistance. The UI only projects coordinates onto
// the SVG plane.

/** A single previewed jump — fuel cost, pilot DC, danger and reachability, all
 *  read straight from the engine so the number shown is the number checked. The
 *  UI owns no route rule: this is the engine's own `TravelPreview`, re-exported
 *  under the name the starmap already calls. */
export type RoutePreview = TravelPreview;

/** T-1402 · A thin pass-through to the engine's `travelPreview` — the UI no longer
 *  reimplements the jumpFuelCost / travelDc / calculateRouteDanger stack (nor the
 *  fabricated `jumpsBetween` round) it used to; it consumes the engine truth. */
export function routePreview(game: GameState, dest: number): RoutePreview {
  return travelPreview(game, dest);
}

// ---- T-1403 off-lane exploration (display-only) --------------------------
//
// The off-lane sweep control is a pure CLIENT of the engine's `Explore` action.
// Every rule number it shows — the nav DC, the fuel cost, the effective PILOT
// modifier — reads from the SAME content constants and engine function the
// resolver (actions/exploration.ts) checks against, never a value invented in
// JSX. The loot summary is composed only from the action's typed events.

/** The advisory nav-check preview for the sweep button: the DC and fuel cost the
 *  engine will charge, the ship's effective PILOT modifier (stat + navBonus — the
 *  exact term `resolveExploration` adds), and whether the tank can afford the
 *  detour. A pure read; the engine still gates fuel on resolve. */
export interface ExplorationPreview {
  dc: number;
  fuelCost: number;
  effectiveModifier: number;
  canAfford: boolean;
}

export function explorationPreview(game: GameState): ExplorationPreview {
  const ship = game.player.ship;
  return {
    dc: EXPLORATION_NAV_DC,
    fuelCost: EXPLORATION_FUEL_COST,
    // The same modifier the resolver adds: PILOT stat + the ship's nav bonus.
    effectiveModifier: game.player.stats[Stat.PILOT] + navBonus(ship),
    canAfford: ship.fuel >= EXPLORATION_FUEL_COST,
  };
}

/**
 * One honest line summarising a SUCCESSFUL sweep, composed straight from the
 * action's typed events — the charted POI plus whatever loot the roll surfaced
 * (salvage credits, a Signal Fragment, a sealed contraband pod). Returns null when
 * no POI was discovered (a failed sweep speaks through its notice instead). The UI
 * invents nothing here: every clause reads an emitted event.
 */
export function explorationOutcome(events: GameEvent[]): string | null {
  const poi = events.find(
    (e): e is Extract<GameEvent, { type: 'PoiDiscovered' }> => e.type === 'PoiDiscovered',
  );
  if (!poi) return null;
  const parts: string[] = [`Charted ${poi.name}`];
  let salvage = 0;
  for (const e of events) if (e.type === 'SalvageRecovered') salvage += e.amount;
  if (salvage > 0) parts.push(`${salvage.toLocaleString()}cr in salvage`);
  if (events.some((e) => e.type === 'FragmentAcquired')) parts.push('a Signal Fragment recovered');
  if (events.some((e) => e.type === 'ContrabandFound'))
    parts.push('a sealed pod bolted in the hold');
  return `${parts.join(' · ')}.`;
}

// ---- T-1404 Hangout & lending pane (display-only) ------------------------
//
// The Hangout pane is a pure CLIENT of the engine's T-1303 `VisitHangout` venues
// and the T-1304 Penny Wise lending state. Every number it shows is read from the
// SAME source the engine gates on: the `hasHangout` flag `day.ts` blocks on, the
// wager/loan CONTENT constants the resolver clamps to, the live `player.loan`
// fields the engine writes, and the rumor lines the engine's own pure
// `hangoutRumors` synthesizes. Nothing here re-derives a rule — in particular the
// loan accrual (`ceil(principal * rate)`) is NEVER recomputed in the UI; the
// schedule is shown from raw constants and the realized interest reads off state.

/** True when the current system hosts a Hangout — the EXACT predicate `day.ts`
 *  gates `VisitHangout` on (`STAR_SYSTEMS[id].hasHangout === true`). Reader: the
 *  cockpit's Hangout launcher button + the pane mount, so the pane is offered
 *  only where the engine says a Hangout exists. */
export function hangoutOpen(game: GameState): boolean {
  return STAR_SYSTEMS[game.player.currentSystemId]?.hasHangout === true;
}

/** One present-NPC row for the Hangout — an NPC whose SIMULATED position is the
 *  player's current system (the same "actually in-system" set the Dare resolver
 *  requires an opponent to be in). Disposition rides along as a hint. Reader: the
 *  pane's present-NPC list / Dare opponent picker. */
export interface HangoutNpc {
  id: string;
  name: string;
  disposition: number;
}

export function hangoutNpcs(game: GameState): HangoutNpc[] {
  const here = game.player.currentSystemId;
  return game.npcs
    .filter((n) => n.currentSystemId === here)
    .map((n) => ({ id: n.id, name: n.name, disposition: n.disposition }));
}

/** The rumor-table lines — a pure pass-through to the engine's own exported
 *  `hangoutRumors` (synthesized from live NPC state). The UI never re-synthesizes
 *  gossip; it renders exactly what the engine produces. Reader: the pane's rumor
 *  table. */
export function hangoutRumorLines(game: GameState): string[] {
  return hangoutRumors(game);
}

/** The Dare wager band (content DARE_MIN/MAX_WAGER) — the same bounds the engine
 *  clamps a requested wager into. Reader: the pane's wager input + its label. */
export interface DareWagerBounds {
  min: number;
  max: number;
}

export function dareWagerBounds(): DareWagerBounds {
  return { min: DARE_MIN_WAGER, max: DARE_MAX_WAGER };
}

/** Penny Wise's up-front lending terms — the raw content constants the engine
 *  advances against: the principal band, the per-dusk rate and the term. Shown
 *  BEFORE a loan is taken so the schedule is visible up front ("dice are honest"
 *  applied to money). `ratePercent` is `LOAN_DAILY_RATE * 100` — a pure format of
 *  the rate constant, NOT an accrual computation (the engine still computes the
 *  realized `ceil(principal * rate)` interest each dusk). Reader: the pane's
 *  Penny Wise desk terms line. */
export interface LendingTerms {
  lenderId: string;
  minPrincipal: number;
  maxPrincipal: number;
  ratePercent: number;
  termDays: number;
}

export function lendingTerms(): LendingTerms {
  return {
    lenderId: LENDER_ID,
    minPrincipal: LOAN_MIN_PRINCIPAL,
    maxPrincipal: LOAN_MAX_PRINCIPAL,
    ratePercent: LOAN_DAILY_RATE * 100,
    termDays: LOAN_TERM_DAYS,
  };
}

// ---- T-1405 progression, property & smuggling surfaces (display-only) -----
//
// The dawn-hand modifiers, crew roster, port ledger and contraband-hold badge are
// pure CLIENTS of the T-1305 patrol / T-1306 dice-progression / T-1307 port
// mechanics. Every number reads a content constant or an engine export
// (`dawnDiceModifiers`, `quotePort`, `crewCapacity`, `isCarryingContraband` /
// `isCarryingIllicit`) — the same source the resolvers gate on. Nothing here
// re-derives a rule (income, floor, hire price, capacity all come from
// engine/content); the UI only projects them onto the pane.

/** The resolved dawn-hand parameters — crew-granted hand size / floor / per-day
 *  reroll grant (from the SAME `dawnDiceModifiers` aggregator `startDay` uses to
 *  deal the hand) merged with the LIVE remaining reroll charges off the dealt
 *  hand. T-1601c: it also passes the SAME equipment leg (`equipmentDiceBenefits`
 *  off the ship's fitted modules) that `startDay` does, so the badges a player
 *  reads can never disagree with the hand the engine dealt. That content table
 *  ships empty, so today's badges are unchanged. A pure read. READER: the HandDock
 *  floor badge + reroll count + per-die reroll affordance. */
export interface DawnHandModifiers {
  handSize: number;
  floor: number;
  rerolls: number;
  rerollsRemaining: number;
}

export function dawnHandModifiers(game: GameState): DawnHandModifiers {
  const mods = dawnDiceModifiers(game.player.crew, equipmentDiceBenefits(game.player.ship));
  return {
    handSize: mods.handSize,
    floor: mods.floor,
    rerolls: mods.rerolls,
    rerollsRemaining: game.player.dawnHand?.rerollsRemaining ?? 0,
  };
}

/** The one-word benefit label for a crew role, read straight off its content
 *  `benefit` discriminant — never a UI-invented effect. */
export function crewBenefitLabel(role: CrewRole): string {
  const b = role.benefit;
  switch (b.kind) {
    case 'extra-die':
      return '+1 die';
    case 'reroll':
      return 'one re-roll/day';
    case 'floor':
      return `floor ${b.floor}`;
  }
}

/** One hired crew member — its content role definition + the day it came aboard. */
export interface HiredCrewRow {
  role: CrewRole;
  hiredDay: number;
}

/** One hireable crew role — its definition plus affordability / berth state and a
 *  plain "here's why you can't hire" reason (mirrors quoteShipyard's reason style
 *  so the pane disables-not-hides). `canHire` folds every precondition (free berth
 *  AND the hire price) so the button gate is a single read. */
export interface HireableCrewRow {
  role: CrewRole;
  affordable: boolean;
  canHire: boolean;
  reason: string | null;
}

export interface CrewRoster {
  hired: HiredCrewRow[];
  hireable: HireableCrewRow[];
  /** Cabin berths (engine `crewCapacity`, the T-1205 cabin-strength socket). */
  berths: number;
  berthsUsed: number;
}

/**
 * The crew roster for the ship pane: which roles are aboard, which are hireable
 * (each with a disabled-reason), and the berth budget. `berths` is the engine's
 * `crewCapacity` (cabin strength → berths); a hire is gated on a free berth AND
 * the hire price — the SAME order `resolveCrew` checks — so the pane never enables
 * a hire the engine would refuse. READER: ShipPane crew section.
 */
export function crewRoster(game: GameState): CrewRoster {
  const crew = game.player.crew;
  const berths = crewCapacity(game.player.ship);
  const berthsUsed = crew.length;
  const hiredIds = new Set(crew.map((m) => m.roleId));
  const hired: HiredCrewRow[] = crew
    .map((m) => ({ role: CREW_BY_ID[m.roleId], hiredDay: m.hiredDay }))
    .filter((r): r is HiredCrewRow => r.role != null);
  const hireable: HireableCrewRow[] = CREW_ROLES.filter((role) => !hiredIds.has(role.id)).map(
    (role) => {
      const affordable = game.player.credits >= role.hirePrice;
      const hasBerth = berthsUsed < berths;
      let reason: string | null = null;
      if (!hasBerth) reason = 'No free cabin berth — upgrade the cabin';
      else if (!affordable)
        reason = `Need ${role.hirePrice.toLocaleString()}cr, have ${game.player.credits.toLocaleString()}cr`;
      return { role, affordable, canHire: hasBerth && affordable, reason };
    },
  );
  return { hired, hireable, berths, berthsUsed };
}

/** The current-system port stake (name + live `quotePort` buy preview), or null
 *  when the player stands in a non-purchasable (rim) system. */
export interface PortLedgerCurrent {
  systemId: number;
  name: string;
  quote: PortQuote;
}

/** One owned port stake — its per-dusk income (era-modulated, straight off
 *  `quotePort`) and the day it was bought. */
export interface OwnedPortRow {
  systemId: number;
  name: string;
  income: number;
  purchaseDay: number;
}

export interface PortLedger {
  current: PortLedgerCurrent | null;
  owned: OwnedPortRow[];
  /** Sum of the owned stakes' per-dusk incomes — the "watch income tick at dusk"
   *  figure the ledger surfaces. */
  totalDuskIncome: number;
}

/**
 * The port-authority ledger for the trade pane: the buy preview for the port the
 * player stands in (via `quotePort`, so the price / income / disabled-reason can
 * never disagree with the real purchase), plus every owned stake with its
 * era-modulated per-dusk income. Every number reads content (`baseDuskIncome`,
 * `purchasePrice`) through the engine — never recomputed here. READER: the
 * TradePane PORT AUTHORITY block + its income ledger.
 */
export function portLedger(game: GameState): PortLedger {
  const here = game.player.currentSystemId;
  const current: PortLedgerCurrent | null = isPurchasablePort(here)
    ? {
        systemId: here,
        name: PURCHASABLE_PORTS_BY_SYSTEM[here].name,
        quote: quotePort(game, here),
      }
    : null;
  const owned: OwnedPortRow[] = game.player.ports.map((port) => {
    const def = PURCHASABLE_PORTS_BY_SYSTEM[port.systemId];
    return {
      systemId: port.systemId,
      name: def?.name ?? `System-${port.systemId} Port Authority`,
      income: quotePort(game, port.systemId).income,
      purchaseDay: port.purchaseDay,
    };
  });
  const totalDuskIncome = owned.reduce((sum, o) => sum + o.income, 0);
  return { current, owned, totalDuskIncome };
}

/** Translate the engine's typed `PortEventFailReason` (also the `quotePort`
 *  failure set) into a one-line "disabled, here's why" reason for the buy button.
 *  Pure display translation — re-derives no rule. Every reason maps. */
export function portFailureExplanation(failure: PortEventFailReason): string {
  switch (failure) {
    case 'not-at-port':
      return 'Dock here to buy this authority';
    case 'not-purchasable':
      return 'No port authority for sale here';
    case 'already-owned':
      return 'You already hold this stake';
    case 'insufficient-credits':
      return 'Not enough credits';
    case 'no-die':
    case 'invalid-die-index':
    case 'die-already-spent':
      return 'Assign a die';
  }
}

/** The contraband-hold badge state — whether the ship is carrying illicit cargo
 *  and from which source(s). Reads the SAME `isCarryingContraband` / illicit-pod
 *  flag the T-1305 patrol scan gates on, so the badge shows exactly when a patrol
 *  would scan. READER: the TradePane hold badge. */
export interface ContrabandHold {
  carrying: boolean;
  source: 'contract' | 'pod' | 'both' | null;
}

export function contrabandHold(game: GameState): ContrabandHold {
  const contract = isCarryingContraband(game);
  const pod = game.flags['signal.contraband.carrying'] === true;
  let source: ContrabandHold['source'] = null;
  if (contract && pod) source = 'both';
  else if (contract) source = 'contract';
  else if (pod) source = 'pod';
  return { carrying: isCarryingIllicit(game), source };
}

/** A system placed on the SVG plane: raw coordinates plus projected (viewBox)
 *  screen coordinates. */
export interface ProjectedNode {
  id: number;
  name: string;
  isRim: boolean;
  x: number;
  y: number;
  sx: number;
  sy: number;
}

export interface StarmapProjection {
  /** SVG viewBox string sized to the displayed band. */
  viewBox: string;
  width: number;
  height: number;
  /** Distance-units → viewBox-units (uniform, so a distance circle stays round). */
  scale: number;
  nodes: ProjectedNode[];
  here: ProjectedNode | null;
  /** Fuel-range ring radius in distance units (from maxJumpDistance) … */
  ringUnits: number;
  /** … and in projected viewBox units. */
  ringRadius: number;
}

/**
 * Project the relevant band of systems onto an SVG plane. We do NOT fit all 28
 * systems: the Andromeda cluster sits at x up to 99 and would crush the core
 * lane into an unreadable sliver. Instead we render the core+rim lane (ids
 * 1–20) plus the current system and any charted system, then bound the box to
 * exactly that set. The scale is uniform so the fuel-range ring — a true
 * distance circle — is drawn round rather than sheared.
 *
 * T-1505b · ONE DELIBERATE EXCEPTION: NEMESIS (id 28) joins the band once
 * `nemesis.crossing.unlocked` is set. The band stretches only for the endgame,
 * and only after the stake is paid — before that the black hole is not on the
 * chart at all, so the map never advertises a door the player cannot open, and
 * the arc's terminus is never spoiled on day one. Andromeda (21–26) and MALIGNA
 * (27) are still never shown: the gate lift is NEMESIS-only (design call D1), so
 * showing them would offer six systems the engine would refuse. This is the UI
 * READER of the crossing flag; the other two are the engine gate (day.ts) and the
 * sim protocol's legalActions.
 */
export function starmapProjection(game: GameState): StarmapProjection {
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  const crossingOpen = game.flags['nemesis.crossing.unlocked'] === true;
  const shown = new Map<number, (typeof STAR_SYSTEMS)[number]>();
  for (const sys of Object.values(STAR_SYSTEMS)) {
    if (
      (sys.id >= 1 && sys.id <= 20) ||
      sys.id === here ||
      visited.has(sys.id) ||
      (crossingOpen && sys.id === NEMESIS_SYSTEM_ID)
    ) {
      shown.set(sys.id, sys);
    }
  }
  const systems = [...shown.values()];
  const xs = systems.map((s) => s.coordinates.x);
  const ys = systems.map((s) => s.coordinates.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const pad = 8; // viewBox units of margin around the band
  const targetSpan = 220; // desired long-axis size in viewBox units
  const scale = targetSpan / Math.max(spanX, spanY, 1);

  const width = spanX * scale + pad * 2;
  // A pure lane (spanY 0) still needs vertical room for the node + label.
  const laneHeight = 64;
  const height = Math.max(spanY * scale, laneHeight) + pad * 2;
  const yOffset = spanY === 0 ? height / 2 : pad;

  const project = (sys: (typeof STAR_SYSTEMS)[number]): ProjectedNode => ({
    id: sys.id,
    name: sys.name,
    isRim: sys.isRim,
    x: sys.coordinates.x,
    y: sys.coordinates.y,
    sx: pad + (sys.coordinates.x - minX) * scale,
    sy: spanY === 0 ? yOffset : pad + (sys.coordinates.y - minY) * scale,
  });

  const nodes = systems.map(project);
  const hereSys = STAR_SYSTEMS[here];
  const ship = game.player.ship;
  const ringUnits = maxJumpDistance(ship.drives, ship.fuel, ship.hasTransWarpDrive ?? false);

  return {
    viewBox: `0 0 ${round(width)} ${round(height)}`,
    width,
    height,
    scale,
    nodes,
    here: hereSys ? project(hereSys) : null,
    ringUnits,
    ringRadius: ringUnits * scale,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Known-NPC pip counts per system. There is no `known` flag on engine state, so
 * this is a deliberate T-304-LOCAL definition (a full knownNpcIds set would be
 * engine scope, out of this task): a ship is "known" if the player has standing
 * with it (`disposition !== 0`) OR it is co-located in the player's current
 * system. Returns systemId → count of known ships there.
 */
export function knownNpcCounts(game: GameState): Map<number, number> {
  const here = game.player.currentSystemId;
  const counts = new Map<number, number>();
  for (const npc of game.npcs) {
    const known = npc.disposition !== 0 || npc.currentSystemId === here;
    if (!known) continue;
    counts.set(npc.currentSystemId, (counts.get(npc.currentSystemId) ?? 0) + 1);
  }
  return counts;
}

/** Human-readable wire lines, newest first, derived from the event log. */
export function wireLines(state: GameState, limit = 24): string[] {
  const lines: string[] = [];
  for (let i = state.eventLog.length - 1; i >= 0 && lines.length < limit; i--) {
    const line = eventToWire(state.eventLog[i]);
    if (line) lines.push(line);
  }
  return lines;
}

function eventToWire(e: GameEvent): string | null {
  switch (e.type) {
    case 'WireEntry':
      return e.message;
    case 'DeedEarned':
      return `DEED — ${e.title}: ${e.citation}`;
    case 'RenownRankUp':
      return `RENOWN — the spacer is now ${e.newRank}.`;
    case 'EraEventStarted':
      return `${e.name} — the ${systemName(e.affectedSystemIds[0] ?? 0)} region reprices.`;
    case 'EraEventEnded':
      return `The ${e.defId} event has passed; markets settle.`;
    case 'PoiDiscovered':
      return `Beacon return — ${e.name} logged off the lane.`;
    case 'ComponentDamaged':
      // T-1205: the wire is the reader of shields' mitigation. Junker hits (no
      // shields, `mitigated` 0/absent) stay silent to avoid ticker spam; a hit an
      // upgraded shield soaked is newsworthy. A full absorb reports amount 0.
      if ((e.mitigated ?? 0) <= 0) return null;
      return e.amount === 0
        ? `Shields held — absorbed a ${e.mitigated}-point hit to ${componentName(e.component).toLowerCase()}.`
        : `Shields bled off ${e.mitigated} of a hit to ${componentName(e.component).toLowerCase()}.`;
    case 'LifeSupportCritical':
      // T-1205: the wire is a reader of the lifeSupport survival check.
      return e.survived
        ? 'LIFE SUPPORT — critical failure ridden out on emergency air.'
        : 'LIFE SUPPORT — catastrophic failure; the ship was lost to the dark.';
    case 'NemesisCrossing':
      // T-1505b · The wire renders the REFUSAL only. The committed and crossed
      // beats already arrive as authored `WireEntry`s (content CROSSING_WIRE),
      // filed by the engine at the same moment — rendering them here too would
      // double every line. A refusal, though, is the one crossing beat the galaxy
      // never hears about: no escrow was opened and no flight plan was filed, so
      // the captain's own terminal is the only thing that logs it.
      return e.kind === 'stake-refused' ? `CROSSING — ${crossingRefusalText(e.reason)}` : null;
    default:
      return null;
  }
}

// ---- T-306 wire log (display-only) ---------------------------------------
//
// The browsable day-by-day log and the NPC mini-dossier are PRESENTATIONAL
// reads of state that already exists — `state.eventLog` (append-only, JSON
// round-tripped through the save envelope), `state.npcs`, and the authored
// content data `FLAWS` / `NPC_PROFILES`. Same charter as T-304/T-305: the UI
// invents no rule, mutates nothing, and never surfaces raw NPC stats.

export type WireLogKind = 'flaw-override' | 'deed' | 'renown' | 'era' | 'poi' | 'npc' | 'plain';

/** One rendered wire line, tagged with its source day, a cheap display kind and
 *  the originating `eventLog` index (a stable React key + virtualization id). */
export interface WireLogEntry {
  day: number;
  text: string;
  kind: WireLogKind;
  eventIndex: number;
}

/** A day's worth of wire lines, oldest day first for chronological reading. */
export interface WireLogDay {
  day: number;
  entries: WireLogEntry[];
}

function wireKind(e: GameEvent): WireLogKind {
  switch (e.type) {
    case 'DeedEarned':
      return 'deed';
    case 'RenownRankUp':
      return 'renown';
    case 'EraEventStarted':
    case 'EraEventEnded':
      return 'era';
    case 'PoiDiscovered':
      return 'poi';
    case 'WireEntry':
      // T-1402 · Read the engine-stamped `WireEntry.kind` (T-1401) instead of the
      // UI re-classifying the message by suffix-matching content FLAWS. The kind
      // ('flaw-override' | 'npc' | 'plain') is decided at emission; the UI owns no
      // rule here. Every WireEntryKind member is a valid WireLogKind.
      return e.kind;
    default:
      return 'plain';
  }
}

/**
 * Group the event log into a day-by-day wire log (oldest day first). Reuses the
 * ticker's `eventToWire` mapping for text — an event that produces no wire line
 * (returns null) is skipped, as is any event without a `day` (none of the wire
 * events lack one, but the guard keeps this honest). Pure derivation over the
 * existing snapshot; the full history rides along in a loaded save.
 */
export function wireLog(state: GameState): WireLogDay[] {
  const byDay = new Map<number, WireLogEntry[]>();
  for (let i = 0; i < state.eventLog.length; i++) {
    const e = state.eventLog[i];
    const text = eventToWire(e);
    if (text === null) continue;
    if (!('day' in e)) continue;
    const day = e.day;
    const entry: WireLogEntry = { day, text, kind: wireKind(e), eventIndex: i };
    const arr = byDay.get(day);
    if (arr) arr.push(entry);
    else byDay.set(day, [entry]);
  }
  return [...byDay.keys()].sort((a, b) => a - b).map((day) => ({ day, entries: byDay.get(day)! }));
}

/** NPC name → id, longest name first so a multi-word name wins over any name
 *  that is a substring of it when the renderer scans a wire line for links. */
export function npcNameIndex(state: GameState): { name: string; id: string }[] {
  return state.npcs
    .map((n) => ({ name: n.name, id: n.id }))
    .sort((a, b) => b.name.length - a.name.length);
}

/** A mini dossier: name, ship and prose HINTS only — never the raw stat block,
 *  flawDc or tier (PRD: "disposition hints — not raw stats"). */
export interface NpcDossier {
  name: string;
  shipName: string;
  location: string;
  standing: string;
  temperament: string;
}

/** Disposition rendered as a standing HINT, never the number. Checked in
 *  most-extreme-first order so the bands don't overlap. */
function dispositionHint(disposition: number): string {
  if (disposition < -2) return 'Wants you dead';
  if (disposition < 0) return 'Holds a grudge';
  if (disposition === 0) return 'No standing with you';
  if (disposition > 2) return 'Owes you goodwill';
  return 'Warming to you';
}

export function npcDossier(state: GameState, npcId: string): NpcDossier | null {
  const npc = state.npcs.find((n) => n.id === npcId);
  if (!npc) return null;
  const profile = NPC_PROFILES.find((p) => p.id === npc.profileId);
  if (!profile) return null;
  return {
    name: profile.name,
    shipName: profile.shipName,
    location: systemName(npc.currentSystemId),
    standing: dispositionHint(npc.disposition),
    // Prose temperament from authored bond + flaw — no numeric stat/flawDc/tier.
    temperament: `${profile.bond}. Said to be ${profile.flaw.toLowerCase()}.`,
  };
}

// ---- T-307 combat overlay (display-only) ---------------------------------
//
// Read-only projections of the engine's live `EncounterState` and of the events
// a Combat action returns. The overlay is a CLIENT of the combat rules exactly
// as the starmap is a client of travel: every balance number here is imported
// from `@spacerquest/content` (FIGHT/RUN fuel, tribute schedule), never
// hardcoded, and nothing recomputes a check — the honest roll is read straight
// off the engine's StatCheck via CheckBreakdown.

/** Human label for an anonymous interceptor's kind (display flavour only). */
const KIND_LABELS: Record<string, string> = {
  PIRATE: 'Pirate',
  PATROL: 'Patrol',
  RIM_PIRATE: 'Rim pirate',
  BRIGAND: 'Brigand',
  REPTILOID: 'Reptiloid',
};

export interface EncounterReadout {
  name: string;
  shipName: string;
  shipClass?: string;
  /** Deliberately surfaced here (task spec: "name/ship/tier"); the wire dossier
   *  never shows tier, but the instrument that decides whether to fire does. */
  tier: number;
  kindLabel: string;
  /** Prose known-history HINT — never a raw stat block. */
  history: string;
}

/**
 * The enemy readout: name, ship, tier and a prose history hint. For a named
 * interceptor the history reuses the same disposition-hint machinery as the
 * dossier plus a last-seen system and a count of prior wire mentions; an
 * anonymous raider has no record. Reads live `game.encounter`; returns null when
 * there is no active encounter.
 */
export function encounterReadout(game: GameState): EncounterReadout | null {
  const enc = game.encounter;
  if (!enc) return null;
  const int = enc.interceptor;
  let history: string;
  if (int.source === 'named') {
    const npc = game.npcs.find((n) => n.id === int.id);
    const mentions = countWireMentions(game, int.name);
    const parts = [dispositionHint(npc?.disposition ?? 0)];
    if (npc) parts.push(`Last known at ${systemName(npc.currentSystemId)}`);
    if (mentions > 0)
      parts.push(`${mentions} prior wire ${mentions === 1 ? 'mention' : 'mentions'}`);
    history = `${parts.join(' · ')}.`;
  } else {
    history = 'Unknown raider — no record on file.';
  }
  return {
    name: int.name,
    shipName: int.shipName,
    shipClass: int.shipClass,
    tier: int.tier,
    kindLabel: int.kind
      ? (KIND_LABELS[int.kind] ?? 'Raider')
      : int.source === 'named'
        ? 'Named'
        : 'Raider',
    history,
  };
}

/** Count of prior WireEntry lines that name this interceptor (read-only scan of
 *  the append-only event log — the same source the wire pane renders). */
function countWireMentions(game: GameState, name: string): number {
  let n = 0;
  for (const e of game.eventLog) {
    if (e.type === 'WireEntry' && e.message.includes(name)) n++;
  }
  return n;
}

export interface CombatFuelStatus {
  fuel: number;
  fightCost: number;
  runCost: number;
  canFight: boolean;
  canRun: boolean;
}

/**
 * The "can I afford to fire?" readout (the PRD's front-and-centre fuel budget).
 * Compares the ship's fuel against the imported FIGHT/RUN fuel costs. When
 * `canFight` is false the overlay raises the weapons-offline band — the fuel-gate
 * that the engine also enforces (a fight with fuel < FIGHT_FUEL_COST malfunctions).
 */
export function combatFuelStatus(game: GameState): CombatFuelStatus {
  const fuel = game.player.ship.fuel;
  return {
    fuel,
    fightCost: FIGHT_FUEL_COST,
    runCost: RUN_FUEL_COST,
    canFight: fuel >= FIGHT_FUEL_COST,
    canRun: fuel >= RUN_FUEL_COST,
  };
}

/**
 * PREVIEW of what a talk is likely to cost THIS round. T-1402 · Delegates to the
 * engine's own `tributeForRound`, forwarding the interceptor's CLASS so an
 * anonymous Brigand (÷2) / Reptiloid (×2) previews the exact demand the engine
 * charges — the old UI reimplementation ignored the class modifier and could
 * preview a tribute the engine never charges. Named interceptors pass `undefined`
 * (the unmodified ×1 schedule). The amount actually charged always comes from the
 * engine's `TributeDemanded`/`TributePaid` events, never from this number.
 *
 * T-1603c adds `tierGap` for exactly the same reason the class modifier was
 * forwarded in T-1402: the engine now scales the demand by how many tiers the
 * interceptor outranks the player (content `TRIBUTE_TIER_GAP_STEP`), so a preview
 * that ignored it would quote a number the engine never charges. The UI stays a
 * CLIENT of the engine rule — this function still owns no arithmetic of its own.
 */
export function tributeThisRound(
  round: number,
  kind?: AnonymousInterceptorKind,
  tierGap = 0,
): number {
  return tributeForRound(round, kind, tierGap);
}

export interface CombatAftermath {
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped';
  lines: string[];
}

const RESOLUTION_HEADLINE: Record<CombatAftermath['resolution'], string> = {
  escaped: 'Broke off — you slipped the net.',
  'talked-down': 'Talked down — tribute bought the lane.',
  defeated: 'Interceptor destroyed — the wreck drifts.',
  'interceptor-fled': 'Driven off — a friend cleared your tail.',
  // T-1207: the interceptor won its post-kill retreat roll — a miracle burn.
  'interceptor-escaped': 'Miracle burn — the interceptor slipped the kill.',
};

/**
 * Build the in-the-moment aftermath summary from the events a Combat (or dusk)
 * action returned. Returns null when the encounter did not resolve this action.
 * The same events also ride the wire (eventLog); this panel is just the cockpit
 * echo of that news the instant it lands.
 */
export function combatAftermathSummary(events: GameEvent[]): CombatAftermath | null {
  const resolved = events.find(
    (e): e is Extract<GameEvent, { type: 'EncounterResolved' }> => e.type === 'EncounterResolved',
  );
  if (!resolved) return null;
  const lines: string[] = [RESOLUTION_HEADLINE[resolved.resolution]];
  // T-1602b: the loop below deliberately has NO ShipLost / LegacySuccession
  // branch. The killing blow in `combat.ts` nulls the encounter and returns
  // WITHOUT emitting `EncounterResolved`, so this function has already returned
  // null by the time a death's events reach it — the two branches that used to
  // sit here were provably unreachable copy. A ship loss routes to
  // `successionSummary` below and renders in its own notice, not in this panel.
  for (const e of events) {
    if (e.type === 'TributePaid') {
      lines.push(
        `Paid ${e.amount.toLocaleString()}cr tribute — ${e.creditsRemaining.toLocaleString()}cr left.`,
      );
    } else if (
      e.type === 'CombatEvent' &&
      e.stance === 'fight' &&
      e.success &&
      e.enemyHullRemaining === 0
    ) {
      lines.push('Final volley connected — their hull gave way.');
    }
  }
  lines.push(`Resolved on round ${resolved.round}.`);
  return { resolution: resolved.resolution, lines };
}

// ---- T-1602b · death & succession (display-only) -------------------------

/**
 * The estate summary of a ship loss, for the succession notice.
 *
 * PURE TRANSLATION, exactly like `shipyardFailureExplanation`: every field below
 * is COPIED off a typed engine event (`ShipLost`, `LegacySuccession`, the
 * `TradeEvent{action:'forfeit-cargo'}` and the obituary `WireEntry` that
 * `applySuccession` emits together in one batch). Nothing here is re-derived —
 * in particular the halved bank is the engine's own `inheritedCredits` and the
 * obituary is the engine's own sentence, never prose authored in the UI.
 *
 * READERS: `store.ts` (`succession`, set from BOTH death paths — the combat
 * killing blow and the dusk life-support failure) and `App.tsx`'s
 * `SuccessionNotice`. The DURABLE reader of the persisted counter is the
 * Registry pane's `registry-successions` row, which survives a reload; this
 * summary is the in-the-moment beat only.
 */
export interface SuccessionSummary {
  /** The day the ship went down (`ShipLost.day`). */
  day: number;
  /** What took the ship down: the interceptor's id, or the literal
   *  'life-support-failure' on the dusk path (`ShipLost.interceptorId`). */
  lostTo: string;
  /** `lostTo` rendered for a human — the interceptor's authored NAME (the same
   *  string the combat overlay's `combat-enemy-name` showed), looked up in
   *  content exactly as `componentName` looks up a component. A pure name
   *  translation, never a rule; unknown ids fall back to the id itself. */
  lostToLabel: string;
  /** The typed cause (`ShipLost.reason`) — rendered as the notice's data-reason. */
  reason: 'combat-defeat' | 'life-support-failure';
  /** Half the bank, floored, straight off `LegacySuccession.inheritedCredits`. */
  inheritedCredits: number;
  /** The Guild marker the estate still owes (`LegacySuccession.debtOutstanding`). */
  debtOutstanding: number;
  /** How many licences this career has passed on (`LegacySuccession.successionCount`). */
  successionCount: number;
  /** The cargo that went down with the ship, or null when the hold was empty. */
  cargoForfeited: string | null;
  /** The engine's own wire obituary, verbatim. */
  obituary: string;
}

/** The authored display name behind a `ShipLost.interceptorId` — anonymous
 *  roster first, then the named cast, then the non-combat causes. Same shape as
 *  `componentName` / `equipmentName`: a content lookup, not a rule. */
function shipLostToLabel(interceptorId: string): string {
  if (interceptorId === 'life-support-failure') return 'Life support failure';
  const anon = ANONYMOUS_INTERCEPTORS.find((i) => i.id === interceptorId);
  if (anon) return anon.name;
  return NPC_PROFILES.find((p) => p.id === interceptorId)?.name ?? interceptorId;
}

/**
 * Build the succession summary from the events an action (or a dusk) returned.
 * Returns null when no ship was lost — which is every action but two in a career.
 */
export function successionSummary(events: GameEvent[]): SuccessionSummary | null {
  const lost = events.find(
    (e): e is Extract<GameEvent, { type: 'ShipLost' }> => e.type === 'ShipLost',
  );
  const succession = events.find(
    (e): e is Extract<GameEvent, { type: 'LegacySuccession' }> => e.type === 'LegacySuccession',
  );
  // Both always ride together (`applySuccession` is called at the ShipLost site),
  // but the UI refuses to render half an estate rather than invent the other half.
  if (!lost || !succession) return null;

  const forfeit = events.find(
    (e): e is Extract<GameEvent, { type: 'TradeEvent' }> =>
      e.type === 'TradeEvent' && e.action === 'forfeit-cargo',
  );
  const obituary = events.find(
    (e): e is Extract<GameEvent, { type: 'WireEntry' }> =>
      e.type === 'WireEntry' && e.message.includes('A successor claims the license'),
  );

  return {
    day: lost.day,
    lostTo: lost.interceptorId,
    lostToLabel: shipLostToLabel(lost.interceptorId),
    reason: lost.reason,
    inheritedCredits: succession.inheritedCredits,
    debtOutstanding: succession.debtOutstanding,
    successionCount: succession.successionCount,
    cargoForfeited: forfeit?.cargoType === undefined ? null : cargoName(forfeit.cargoType),
    obituary: obituary?.message ?? '',
  };
}

// ---- T-308 ship & shipyard (display-only) --------------------------------
//
// Every number and every "you can't buy this because…" reason the ship pane
// shows is read from the engine's pure `quoteShipyard` (cost, exclusion,
// prereq, renown, capacity, and the before→after fuel/pod projection). The UI
// owns NO shipyard rule: `shipyardFailureExplanation` is the single new function
// here and it is a pure TRANSLATION of the engine's typed `ShipyardFail` into
// prose — never a re-derivation of the rule. Balance numbers (tier prices, pod
// capacity, fuel curve) all live in engine/content.

type ShipyardAction = Extract<PlayerAction, { type: 'Shipyard' }>;

/** Thin re-export so panes never import the engine directly (the store stays the
 *  sole engine caller for MUTATIONS; this is a pure read used for previews). */
export function shipyardQuote(game: GameState, action: ShipyardAction): ShipyardQuote {
  return quoteShipyard(game, action);
}

/** Authored display name for a component (from content SHIP_COMPONENTS). */
export function componentName(id: ShipComponentId): string {
  return SHIP_COMPONENTS.find((c) => c.id === id)?.name ?? id;
}

/** Authored display name for a special-equipment item. */
export function equipmentName(id: SpecialEquipmentId): string {
  return SPECIAL_EQUIPMENT.find((e) => e.id === id)?.name ?? id;
}

/** A component grid row — strength/condition read straight off the ship, with a
 *  `damaged` flag for the highlight (condition below the 9 maximum). */
export interface ShipComponentRow {
  id: ShipComponentId;
  name: string;
  strength: number;
  condition: number;
  damaged: boolean;
  /** The tier this component currently sits at, from the engine's
   *  `componentTierForStrength` (floor(strength/10); a junker sits at tier 0). */
  tier: number;
  /** The next purchasable tier, or null when already at the top tier (9). */
  nextTier: number | null;
}

/** The eight ship components as grid rows (order from content). */
export function shipComponents(game: GameState): ShipComponentRow[] {
  const ship = game.player.ship;
  return SHIP_COMPONENTS.map((def) => {
    const id = def.id;
    const comp = ship[id];
    // T-1402 · Consume the engine's floor-based tier inverse instead of the UI's
    // old `Math.max(1, Math.ceil(strength/10))`, which mapped a junker (strength 1)
    // to tier 1 → nextTier 2, making TIER 1 UNBUYABLE. floor maps it to tier 0 →
    // nextTier 1 is buyable.
    const tier = componentTierForStrength(comp.strength);
    return {
      id,
      name: def.name,
      strength: comp.strength,
      condition: comp.condition,
      damaged: comp.condition < 9,
      tier,
      nextTier: tier < 9 ? tier + 1 : null,
    };
  });
}

/** Whether the player already owns a special-equipment item (read from the
 *  ship's install flags — the same booleans the engine sets on purchase). */
function equipmentOwned(game: GameState, id: SpecialEquipmentId): boolean {
  const ship = game.player.ship;
  switch (id) {
    case 'CLOAKER':
      return ship.hasCloaker === true;
    case 'AUTO_REPAIR':
      return ship.hasAutoRepair === true;
    case 'STAR_BUSTER':
      return ship.hasStarBuster === true;
    case 'ARCH_ANGEL':
      return ship.hasArchAngel === true;
    case 'ASTRAXIAL_HULL':
      return ship.isAstraxialHull === true;
    case 'TITANIUM_HULL':
      return ship.hasTitaniumHull === true;
    case 'TRANS_WARP':
      return ship.hasTransWarpDrive === true;
  }
}

export interface SpecialEquipmentRow {
  id: SpecialEquipmentId;
  name: string;
  owned: boolean;
  quote: ShipyardQuote;
}

/** One row per special-equipment item — ALL of them, always rendered (the pane
 *  disables, never hides, an item you can't buy, and shows the engine's reason).
 *  `quote` carries whether it's buyable and the typed `failure` when it isn't. */
export function specialEquipmentRows(game: GameState): SpecialEquipmentRow[] {
  return SPECIAL_EQUIPMENT.map((def) => {
    const id = def.id as SpecialEquipmentId;
    return {
      id,
      name: def.name,
      owned: equipmentOwned(game, id),
      quote: quoteShipyard(game, {
        type: 'Shipyard',
        action: 'buy-special-equipment',
        equipment: id,
        spendDie: 0,
      }),
    };
  });
}

const PREREQUISITE_PROSE: Record<string, string> = {
  HULL_STRENGTH_1_TO_4: 'Needs a light hull (strength 1–4)',
  SHIELDS: 'Needs shields installed',
  DRIVES_STRENGTH_25: 'Needs drives at strength 25+',
};

/**
 * Translate the engine's TYPED failure reason into a one-line explanation for
 * the pane — the "exclusion conflict shows why" surface. This is pure display
 * translation of `ShipyardFail`; it re-derives no rule. Every branch maps a
 * `ShipyardFailureReason` the engine emitted to prose.
 */
export function shipyardFailureExplanation(fail: ShipyardFail): string {
  switch (fail.reason) {
    case 'MUTUALLY_EXCLUSIVE_EQUIPMENT':
      return fail.conflictingEquipment
        ? `Conflicts with ${equipmentName(fail.conflictingEquipment)}`
        : 'Conflicts with installed equipment';
    case 'INSUFFICIENT_RENOWN':
      return fail.requiredRank
        ? `Requires ${RENOWN_RANKS[fail.requiredRank].label} renown`
        : 'Requires higher renown';
    case 'PREREQUISITE_NOT_MET':
      return fail.prerequisite
        ? (PREREQUISITE_PROSE[fail.prerequisite] ?? `Requires ${fail.prerequisite}`)
        : 'Prerequisite not met';
    case 'INSUFFICIENT_CREDITS':
      return `Need ${(fail.cost ?? 0).toLocaleString()}cr, have ${(fail.credits ?? 0).toLocaleString()}cr`;
    case 'CAPACITY_EXCEEDED':
      return `Hold maxes at ${fail.maxPods ?? 0} pods`;
    case 'ALREADY_INSTALLED':
      return 'Already installed';
    case 'AT_MAX_CONDITION':
      return 'Already at full condition';
    case 'NO_HULL':
      return 'No hull to fit this to';
  }
}

// ---- T-309 storylet & registry UX (display-only) -------------------------
//
// Pure reads of existing engine surface: the storylet offer's authored
// requirements, the player's DeedRegistryState + Nemesis file. The UI invents
// no rule — the cost labels and lock reasons are honest projections of the same
// `requirements` the engine (resolveStoryletChoice) enforces, and the registry
// / nemesis views read straight off `game.player`. Every threshold comes from
// content (RENOWN_DEED_THRESHOLDS), never a hardcoded balance number.

/** One presented storylet choice (the offer's authored choice shape). */
export type StoryletChoice = StoryletOffer['choices'][number];

/** Does resolving this choice consume a die? T-1402 · Reads the engine's own
 *  `quoteStoryletChoice(...).needsDie` (a `spendDie` requirement or a stat check —
 *  the two paths the engine burns a die on) rather than reimplementing the gate.
 *  The store passes `spendDie` ONLY for these — a no-requirement choice
 *  (answer / accept-thanks) must never demand or waste a die. */
export function storyletChoiceNeedsDie(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
): boolean {
  return quoteStoryletChoice(game, storyletId, choice.id).needsDie;
}

/**
 * A compact, always-shown requirement/cost badge for a choice — the PRD's
 * "choices with visible requirements/costs". T-1402 · Assembled from the engine's
 * `quoteStoryletChoice` FACTS (credit floor, stat check, die spend), never from a
 * UI-reimplemented read of `choice.requirements`. Renders the credit floor, the
 * stat check (STAT DC n), and a `die` token when a die is spent, joined by ` · `.
 * An unconditional choice returns '' (no badge). This shows the requirement whether
 * or not it is currently met; the LOCK (below) adds the disabled-state reason.
 */
export function storyletChoiceCostLabel(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
): string {
  const quote = quoteStoryletChoice(game, storyletId, choice.id);
  const parts: string[] = [];
  if (quote.requiredCredits !== null) parts.push(`${quote.requiredCredits.toLocaleString()}cr`);
  if (quote.statCheck) parts.push(`${statName(quote.statCheck.stat)} DC ${quote.statCheck.dc}`);
  if (quote.needsDie) parts.push('die');
  return parts.join(' · ');
}

/**
 * Why this choice is locked right now, or null when it can be taken. T-1402 ·
 * Delegates to the engine's `quoteStoryletChoice`, which runs the EXACT read-only
 * refusal ladder `resolveStoryletChoice` runs (insufficient-credits before
 * missing-die), and translates its typed reason into prose. `armedDie` is the die
 * index the UI has tentatively assigned (undefined = none) — a die-requiring
 * choice previews `missing-die` until a valid, unspent die is armed. This drives
 * both the disabled state and the visible requirement on a locked choice.
 */
export function storyletChoiceLock(
  game: GameState,
  storyletId: string,
  choice: StoryletChoice,
  armedDie?: number,
): string | null {
  const quote = quoteStoryletChoice(game, storyletId, choice.id, armedDie);
  switch (quote.reason) {
    case 'insufficient-credits':
      return `Need ${(quote.requiredCredits ?? 0).toLocaleString()}cr`;
    case 'missing-die':
      return 'Assign a die';
    case 'not-available':
    case 'unknown-choice':
      // A live offer's own choice never hits these; map defensively so a stale
      // render is disabled rather than mis-enabled.
      return 'Unavailable';
    case null:
      return null;
  }
}

export interface DeedRegistryView {
  rankId: RenownRankId;
  rankLabel: string;
  deedCount: number;
  /** The next rank up, when one remains (null at the top rank). */
  nextRankLabel: string | null;
  /** Deeds still needed to reach that next rank (null at the top rank). */
  deedsToNextRank: number | null;
  /** T-1504c · The CURRENT rank's authored citation (content RENOWN_RANKS).
   *  Until now this text existed only as the rank-up wire moment (engine
   *  `deeds.ts`), a single ticker frame — so a player who missed it never saw
   *  their own citation. READER: the `registry-rank-citation` line in
   *  RecordsOverlay (App.tsx), asserted at two ranks in `e2e/derule.spec.ts`.
   *  Emitted verbatim: content owns the prose, the UI owns no rule here. */
  rankCitation: string;
  /** T-1602b · How many times this career has passed the licence on — a verbatim
   *  read of the PERSISTED `player.legacy.successionCount` (T-108). This is the
   *  DURABLE reader of that field: unlike the transient succession notice it
   *  survives a reload, which is what proves the counter is state and not a
   *  modal. READER: the `registry-successions` row in RecordsOverlay (App.tsx),
   *  rendered only when the count is non-zero — the same "a first-run spacer is
   *  not told about a counter that reads zero" rule `endingScreen` follows. */
  successionCount: number;
  /** Earned deeds, newest first (by eventIndex — stable within a day). */
  earned: { id: string; title: string; citation: string; day: number }[];
}

/**
 * The Registry of Deeds view — rank, the current rank's citation, deed count,
 * next-rank progress, and the earned-deed roll (newest first). All read from
 * `game.player.registry`; the rank labels and citations come from RENOWN_RANKS and
 * the next-rank threshold from RENOWN_DEED_THRESHOLDS (content), never recomputed
 * here.
 */
export function deedRegistry(game: GameState): DeedRegistryView {
  const registry = game.player.registry;
  const deedCount = registry.earned.length;
  // T-1402 · The next rank up comes from the engine's `nextRankFor` (the canonical
  // RENOWN_RANK_ORDER), not a UI re-sort of RENOWN_DEED_THRESHOLDS. The threshold
  // itself is still a content lookup for the remaining-deeds countdown.
  const next = nextRankFor(registry.renownRank);
  return {
    rankId: registry.renownRank,
    rankLabel: RENOWN_RANKS[registry.renownRank].label,
    deedCount,
    nextRankLabel: next ? RENOWN_RANKS[next].label : null,
    deedsToNextRank: next ? Math.max(0, RENOWN_DEED_THRESHOLDS[next] - deedCount) : null,
    rankCitation: RENOWN_RANKS[registry.renownRank].citation,
    successionCount: game.player.legacy.successionCount,
    earned: [...registry.earned]
      .sort((a, b) => b.eventIndex - a.eventIndex)
      .map((d) => ({ id: d.id, title: d.title, citation: d.citation, day: d.day })),
  };
}

/** One faction's standing row for the ALLIANCE STANDING readout. */
export interface FactionStandingView {
  faction: FactionId;
  /** Display name (content FACTION_LABELS). */
  label: string;
  /** The raw standing value (engine `player.reputation[faction]`). */
  value: number;
  /** A coarse tone for styling — friendly / hostile / neutral. */
  tone: 'friendly' | 'hostile' | 'neutral';
}

/**
 * T-1503 · The four-faction ALLIANCE STANDING view — a pure read of
 * `game.player.reputation`, one row per galactic power in the canonical
 * FACTION_IDS order, labelled from content FACTION_LABELS. The UI owns NO rule: the
 * value is the engine's stored standing verbatim; `tone` is a display-only sign
 * bucket. READER of the reputation state the T-1503 movers/questlines write.
 */
export function factionStanding(game: GameState): FactionStandingView[] {
  return FACTION_IDS.map((faction) => {
    const value = game.player.reputation[faction];
    return {
      faction,
      label: FACTION_LABELS[faction],
      value,
      tone: value > 0 ? 'friendly' : value < 0 ? 'hostile' : 'neutral',
    };
  });
}

export interface NemesisFileView {
  count: number;
  decodedCount: number;
  entries: NemesisLoreEntry[];
}

/**
 * The Nemesis file view — the decoded-lore index (one entry per held fragment,
 * arc-ordered) plus the fragment and decoded counts. A pure read via the
 * engine's own `nemesisLoreIndex` / `fragmentCount`; each entry's `text` is the
 * decoded lore when decoded, else the raw signal (the engine decides which).
 */
export function nemesisFile(game: GameState): NemesisFileView {
  const file = game.player.nemesisFile;
  const entries = nemesisLoreIndex(file);
  return {
    count: fragmentCount(file),
    decodedCount: entries.filter((e) => e.decoded).length,
    entries,
  };
}

/**
 * T-1505b · Number-free prose for a crossing refusal, used by the WIRE ticker
 * (which only has the event, never the quote). The pane's own lock line —
 * {@link crossingStatus} — reuses the same switch shape but folds in the live
 * numbers off the engine quote. Both translate the SAME typed reason, so they can
 * never describe different failures.
 */
function crossingRefusalText(reason: CrossingRefusal | undefined): string {
  switch (reason) {
    case 'not-conqueror':
      return 'the escrow clerk would not open a file for a captain of your rank.';
    case 'fragments-undecoded':
      return 'the solution is not whole — the ledger has gaps you cannot fly through.';
    case 'debt-outstanding':
      return 'you cannot stake what you owe. The ledger comes first.';
    case 'insufficient-stake':
      return 'the account on the table did not amount to a stake.';
    case 'ship-cannot-carry-the-burn':
      return 'the tank cannot carry the burn, and there is no port on the far side.';
    case 'already-committed':
      return 'the stake is already signed; there is nothing left to put on the table.';
    case undefined:
      return 'the attempt was refused.';
  }
}

/** T-1505b · The THE CROSSING block's state, for the Records → Nemesis pane. */
export interface CrossingStatusView {
  /**
   * `hidden`    — the spacer has decoded nothing, so the pane says nothing (the
   *               endgame is not spoiled on day one);
   * `locked`    — visible, with the next unmet clause named;
   * `committed` — the stake is signed and the gate is lifted;
   * `crossed`   — the ship has been to the far side.
   */
  state: 'hidden' | 'locked' | 'committed' | 'crossed';
  /** The engine's first failing clause while `locked`, else null. */
  reason: CrossingRefusal | null;
  /** Player-facing lock line with live numbers, or null when not `locked`. */
  lockText: string | null;
  /** What was signed over (flag `nemesis.crossing.stake.credits`), once paid. */
  stakeCredits: number | null;
  /** The day it was signed (flag `nemesis.crossing.stake.day`). */
  stakeDay: number | null;
  /** Decoded-set progress, straight off the engine quote. */
  decoded: number;
  decodedRequired: number;
  /** The crossing jump's PILOT DC (content) — shown so the door names its price. */
  dc: number;
}

/**
 * T-1505b · The crossing pane's read. A pure client of the engine's
 * `quoteCrossingStake` (the same ladder `commitCrossingStake` runs) plus the two
 * stake-receipt flags — so the pane can never disagree with the resolver about
 * WHY the door is shut, and the flags this task writes have a named reader.
 *
 * The `hidden` state is deliberate: a captain who has decoded nothing has no
 * business being told about a black hole they have not heard of yet.
 */
export function crossingStatus(game: GameState): CrossingStatusView {
  const quote = quoteCrossingStake(game);
  const committed = game.flags['nemesis.crossing.unlocked'] === true;
  const stakeCredits = game.flags['nemesis.crossing.stake.credits'];
  const stakeDay = game.flags['nemesis.crossing.stake.day'];
  const crossed =
    game.player.currentSystemId === NEMESIS_SYSTEM_ID ||
    game.player.charts.visitedSystemIds.includes(NEMESIS_SYSTEM_ID);

  const base = {
    reason: null as CrossingRefusal | null,
    lockText: null as string | null,
    stakeCredits: typeof stakeCredits === 'number' ? stakeCredits : null,
    stakeDay: typeof stakeDay === 'number' ? stakeDay : null,
    decoded: quote.decoded,
    decodedRequired: quote.decodedRequired,
    dc: NEMESIS_CROSSING_DC,
  };

  // T-1505c NOTE: in v1 this branch is HEADLESS-ONLY. Arrival at NEMESIS ends the
  // career (engine `careerEnded`), the ending screen replaces the cockpit, and a
  // new career starts with empty charts — so no player can open Records while
  // `crossed` holds. It is kept, rather than deleted, because the read is correct
  // and it becomes player-visible the moment the far side is playable (the
  // Andromeda expansion, PRD §10). Its live readers today are the engine/sim
  // tests; the arrival's player-facing surface is `endingScreen` below.
  if (crossed) return { ...base, state: 'crossed' };
  if (committed) return { ...base, state: 'committed' };
  if (quote.decoded === 0) return { ...base, state: 'hidden' };
  if (quote.ok) return { ...base, state: 'locked', lockText: null };

  return {
    ...base,
    state: 'locked',
    reason: quote.reason,
    lockText: crossingLockText(quote.reason, quote),
  };
}

/** The lock line with live numbers — same typed reasons as
 *  {@link crossingRefusalText}, in the style of `storyletChoiceLock`'s switch. */
function crossingLockText(
  reason: CrossingRefusal | null,
  quote: ReturnType<typeof quoteCrossingStake>,
): string {
  switch (reason) {
    case 'not-conqueror':
      return `Requires the rank of ${RENOWN_RANKS[CROSSING_REQUIRED_RANK].label}`;
    case 'fragments-undecoded':
      return `Decode the Signal — ${quote.decoded} of ${quote.decodedRequired}`;
    case 'debt-outstanding':
      return 'Clear every debt before you stake anything';
    case 'insufficient-stake':
      return `Need ${CROSSING_STAKE_MIN_CREDITS.toLocaleString()}cr on the table`;
    case 'ship-cannot-carry-the-burn':
      return `Carry the burn — ${quote.burnRequired.toLocaleString()} fuel`;
    case 'already-committed':
    case null:
      return 'Ready';
  }
}

/** T-1505c · One label/value row of the ending screen's career summary. `key`
 *  rides the DOM as `data-stat`, so the e2e spec addresses rows by meaning
 *  rather than by position. */
export interface EndingStatRow {
  key: string;
  label: string;
  value: string;
}

/** T-1505c · Everything the ending screen renders. */
export interface EndingView {
  kicker: string;
  title: string;
  prose: readonly string[];
  signOff: string;
  /** The arrival wire line (content `CROSSING_WIRE.crossed`), shown as the
   *  screen's epigraph — this screen is the line's only player-facing reader,
   *  because it replaces the cockpit ticker that used to carry it. */
  lastWire: string;
  /** Copy on the screen's single control (content `CROSSING_ENDING`). */
  returnLabel: string;
  /** The career summary, in display order. */
  stats: EndingStatRow[];
}

/**
 * T-1505c · The ending screen's view-model — NULL unless the ENGINE says the
 * career is over (`careerEnded`). A pure client in the strictest sense: every
 * number comes from the engine's `careerEpilogue` and every string from content's
 * `CROSSING_ENDING`; this function owns no rule, invents no figure, and decides
 * nothing except formatting and row order.
 *
 * READER: `EndingScreen` (App.tsx), which App mounts INSTEAD of the cockpit —
 * see the design note there for why the far side replaces the terminal rather
 * than covering it.
 */
export function endingScreen(game: GameState): EndingView | null {
  if (!careerEnded(game)) return null;
  const epilogue = careerEpilogue(game);

  const stats: EndingStatRow[] = [
    { key: 'day', label: 'DAYS FLOWN', value: String(epilogue.day) },
    { key: 'rank', label: 'FINAL RANK', value: epilogue.rankLabel },
    { key: 'deeds', label: 'DEEDS ON THE BOARD', value: String(epilogue.deedCount) },
    {
      key: 'fragments',
      label: 'THE SIGNAL',
      value: `${epilogue.fragmentsDecoded} of ${epilogue.fragmentsHeld} decoded`,
    },
    {
      key: 'stake',
      label: 'STAKE SIGNED OVER',
      value: `${epilogue.stakeCredits.toLocaleString()} CR`,
    },
    { key: 'charted', label: 'SYSTEMS CHARTED', value: String(epilogue.systemsCharted) },
  ];
  // Only a career that actually lost a ship gets the succession line — a
  // first-run spacer is not told about a counter that reads zero.
  if (epilogue.successionCount > 0) {
    stats.push({
      key: 'successions',
      label: 'LICENCES PASSED ON',
      value: String(epilogue.successionCount),
    });
  }

  return {
    kicker: epilogue.kicker,
    title: epilogue.title,
    prose: epilogue.prose,
    signOff: epilogue.signOff,
    lastWire: epilogue.lastWire,
    returnLabel: CROSSING_ENDING.returnLabel,
    stats,
  };
}

// ---- T-311 onboarding & Tour One presentation ----------------------------
//
// The teaching layer for Tour One is PURELY PRESENTATIONAL. It reads existing
// engine state and never mutates a rule. "Which first-time prompts the player
// has already progressed past" is client meta-state (like `fx`), kept in the UI
// store and out of GameState — so the engine stays pure and a JSON round-trip of
// game state is unaffected. This section is the single source of truth for the
// prompts, shared by the selector (what to render) and the store's auto-dismiss
// reconcile (what to mark seen when the taught action lands).

/** Anchor a contextual prompt to the real affordance it teaches. T-1407 adds the
 *  new-verb anchors: `hangout` (the cockpit launch switch) and `port` (the Trade
 *  pane's PORT AUTHORITY block) are new screen-level anchors; `loan` renders
 *  INSIDE the open Hangout panel (a distinct mount — see `onboardingMount`).
 *  explore reuses `starmap` and the contraband nudge reuses `manifest`, since each
 *  teaches an affordance already living in those panes. */
export type OnboardingAnchor =
  'hand' | 'manifest' | 'starmap' | 'combat' | 'hangout' | 'loan' | 'port';

/** One contextual, first-time coach prompt. `active(game)` is a pure predicate
 *  over existing engine state — no new rule, no new field. A prompt shows while
 *  it is active and unseen; it auto-dismisses (is marked seen) the instant the
 *  player performs the taught action and the predicate flips to false. */
export interface OnboardingPrompt {
  id: string;
  title: string;
  body: string;
  anchor: OnboardingAnchor;
  active(game: GameState): boolean;
  /** T-1407 · When false, the prompt is marked seen ONLY via explicit dismissal
   *  (the "Got it" button → `dismissOnboarding`), never by the auto-dismiss
   *  reconcile. The new-verb prompts gate on affordance/location/resource state
   *  (a hangout system, an affordable tank, a contraband board, a purchasable
   *  port) rather than on the taught action landing, so a mere context change —
   *  jumping away from a hangout, a board reroll — would otherwise spuriously
   *  consume them before the player ever acts. Reader: `nextOnboardingSeen`.
   *  Omitted/true for the T-311 delivery-flow prompts, whose predicate flips
   *  false precisely when the taught action completes (so auto-dismiss is right). */
  autoDismiss?: boolean;
}

/**
 * The Tour One prompt registry, in PRIORITY order (first match wins in the
 * selector, so at most one shows at a time — non-modal, never stacked). The
 * encounter coach outranks everything so a mid-delivery interception surfaces
 * the combat teaching instead of the jump teaching. Predicates read only
 * existing engine surface (`encounter`, `day`, `dawnHand`, `activeContract`,
 * `market.manifestBoard`).
 */
export const ONBOARDING_PROMPTS: readonly OnboardingPrompt[] = [
  {
    id: 'first-encounter',
    title: 'Intercepted',
    body: 'A ship has you. Pick a die and a stance — the fuel budget shows if you can afford to fire.',
    anchor: 'combat',
    active: (game) => game.encounter != null,
  },
  {
    id: 'dawn-roll',
    title: 'The Dawn Hand',
    // T-1405 · Hand-size-neutral copy: crew (a First Officer) can grow the dawn
    // hand to 6–7 dice, so the count is no longer a fixed "five".
    body: 'Your dawn hand — one roll each day. Pick a die, then assign it to an action.',
    anchor: 'hand',
    active: (game) => {
      const hand = game.player.dawnHand;
      return game.day === 1 && !!hand && hand.spent.every((s) => !s);
    },
  },
  {
    id: 'first-sign',
    title: 'Sign a Job',
    body: 'Your hold is empty — assign a die to a manifest offer to take a job.',
    anchor: 'manifest',
    active: (game) => game.player.activeContract == null && game.market.manifestBoard.length > 0,
  },
  {
    id: 'first-jump',
    title: 'Plot the Jump',
    body: 'Cargo aboard. Pick a die, plot the destination on the map, then confirm the jump.',
    anchor: 'starmap',
    active: (game) => game.player.activeContract != null,
  },
  // ---- T-1407 · the new-verb coach prompts -------------------------------
  // Appended BELOW the four delivery-flow prompts so the guided first delivery
  // (dawn → sign → jump) is unchanged: these only ever win once that chain is
  // exhausted (or its prompts pre-seen). All five are `autoDismiss: false` — they
  // gate on affordance state, not on the taught action, so only the "Got it"
  // button marks them seen (see the interface note above). Each predicate is a
  // pure read of existing engine/content surface; the reader is `OnboardingCallout`
  // (the screen mount, plus the in-panel `hangout` mount for `first-loan`).
  {
    id: 'first-hangout',
    title: 'The Spacers Hangout',
    body: 'This port keeps a Hangout — open it to wager at the tables or borrow from Penny Wise.',
    // Ranked ABOVE first-loan: at a hangout system both are active, but the
    // player must be told to OPEN the panel before the in-panel loan nudge (which
    // renders inside that panel) can be reached.
    anchor: 'hangout',
    // Same predicate the cockpit's Hangout launcher gates on (STAR_SYSTEMS
    // hasHangout), so the nudge shows exactly where the button does.
    active: (game) => hangoutOpen(game),
    autoDismiss: false,
  },
  {
    id: 'first-loan',
    title: 'Penny Wise Lends',
    body: 'Short on coin? Borrow against your future runs — mind the interest before you sign.',
    anchor: 'loan',
    // Only while the Hangout is open (the mount lives inside the panel) AND no
    // loan is already outstanding — the exact state the `loan-borrow` button is
    // live in.
    active: (game) => hangoutOpen(game) && game.player.loan == null,
    autoDismiss: false,
  },
  {
    id: 'first-contraband',
    title: 'Running Contraband',
    body: 'A CONTRABAND offer pays well but rides dirty — signing it courts inspections. Your call.',
    anchor: 'manifest',
    // A contraband offer is on the board and the hold is free to take it — the
    // decision the player faces at the manifest. Reads CARGO_TYPES.isContraband,
    // the same flag the manifest row badges.
    active: (game) =>
      game.player.activeContract == null &&
      game.market.manifestBoard.some((c) => CARGO_TYPES[c.cargoType]?.isContraband === true),
    autoDismiss: false,
  },
  {
    id: 'first-port',
    title: 'Buy the Port',
    body: 'You can buy a stake in this Port Authority — it pays a launch-fee income every dusk.',
    anchor: 'port',
    // Standing in a purchasable core port you do not already own — the exact
    // state the Trade pane's `buy-port` button is live in (isPurchasablePort +
    // not-owned).
    active: (game) => {
      const here = game.player.currentSystemId;
      return isPurchasablePort(here) && !game.player.ports.some((p) => p.systemId === here);
    },
    autoDismiss: false,
  },
  {
    id: 'first-explore',
    title: 'Off-Lane Sweep',
    body: 'Burn fuel to sweep off-lane for a discovery — salvage, a Signal Fragment, a sealed pod.',
    anchor: 'starmap',
    // The tank can afford the sweep — the same fuel gate `explorationPreview`
    // reports and the sweep button disables on.
    active: (game) => explorationPreview(game).canAfford,
    autoDismiss: false,
  },
];

/**
 * The single prompt to show right now: the first registry prompt that is active
 * for this state AND not yet seen. Returns null when nothing is due — the callout
 * then renders nothing. At most one at a time (non-modal, no stacking).
 */
export function activeOnboardingPrompt(
  game: GameState,
  seen: Record<string, true>,
): OnboardingPrompt | null {
  for (const prompt of ONBOARDING_PROMPTS) {
    if (!seen[prompt.id] && prompt.active(game)) return prompt;
  }
  return null;
}

/** T-1407 · Where a prompt's callout renders. The single global selector still
 *  picks at-most-one prompt anywhere; this routes the winner to the right mount so
 *  a prompt anchored to an overlaid surface is not hidden behind that overlay. */
export type OnboardingMount = 'screen' | 'combat' | 'hangout';

/** Derive the mount a prompt's anchor renders in: the combat coach rides inside
 *  the combat overlay, the loan nudge inside the open Hangout panel, everything
 *  else at cockpit screen level. Reader: `OnboardingCallout` (each of the three
 *  mounts asks whether the current winner belongs to it). */
export function onboardingMount(anchor: OnboardingAnchor): OnboardingMount {
  if (anchor === 'combat') return 'combat';
  if (anchor === 'loan') return 'hangout';
  return 'screen';
}

/**
 * Auto-dismiss reconcile: given the state BEFORE and AFTER an action, mark seen
 * every not-yet-seen prompt that WAS active and is now inactive — i.e. the player
 * just performed the taught action. This is what makes a prompt disappear the
 * moment its affordance is used ("guided only by visible affordances") without
 * wiring each callsite. Returns the SAME reference when nothing changed so the
 * store never re-renders needlessly.
 */
export function nextOnboardingSeen(
  prev: GameState,
  next: GameState,
  seen: Record<string, true>,
): Record<string, true> {
  let out: Record<string, true> | null = null;
  for (const prompt of ONBOARDING_PROMPTS) {
    if (seen[prompt.id]) continue;
    // T-1407 · Affordance-gated prompts opt out of auto-dismiss: a context change
    // that is NOT the taught action (jumping away from a hangout, a board reroll)
    // must not consume them. They are seen only via explicit dismissal.
    if (prompt.autoDismiss === false) continue;
    if (prompt.active(prev) && !prompt.active(next)) {
      out ??= { ...seen };
      out[prompt.id] = true;
    }
  }
  return out ?? seen;
}

/** True for a Merchant-Guild storylet — the letterhead presentation switch. The
 *  day-30 resolution storylets are presented by the ceremony below, so `guild.`
 *  is the sole letterhead family (their ids start with `resolution.`). */
export function isGuildLetter(storyletId: string): boolean {
  return storyletId.startsWith('guild.');
}

/** True for a day-30 Tour One resolution storylet — the ceremony intercepts
 *  these so the generic storylet launcher/panel never double-renders them. */
export function isResolutionStorylet(storyletId: string): boolean {
  return storyletId.startsWith('resolution.tour-one.');
}

// ---- T-1406 diegetic storylet delivery (display-only) --------------------
//
// PRD §8.3: a storylet is "delivered by the economy — a contract, a price spike,
// a wire item — rather than a quest marker." The old cockpit put every offer
// behind a single badge-counted launcher button; this classifier instead routes
// each live offer to the DIEGETIC surface that opens it (a hold/manifest line, a
// Galactic-Wire bulletin, a Port-Ledger dispatch). It owns NO rule — the routing
// is a pure function of the authored storylet id prefix, and every mutation still
// flows through the store's `resolveStorylet`.

/** The in-fiction surface a storylet opens from. `ceremony` is the day-30 Tour
 *  One resolution, owned by the full-screen ResolutionCeremony (never an opener). */
export type StoryletSurface = 'hold' | 'wire' | 'port' | 'ceremony';

/**
 * Route a storylet id to the diegetic surface that opens it. Pure, id-prefix
 * based, and TOTAL: the `port` default is the reachability guarantee — a newly
 * authored storylet whose prefix isn't listed here still lands on the Port-Ledger
 * dispatches rather than becoming unreachable (the invariant the sweep spec
 * asserts). READERS: the cockpit surface openers (App.tsx TradePane / Wire) and
 * the storylet-delivery sweep spec's audit.
 */
export function storyletSurface(storyletId: string): StoryletSurface {
  if (isResolutionStorylet(storyletId)) return 'ceremony';
  // Hold: cargo riding in the hold, a boarded derelict's pod, a fence at the dock.
  if (
    storyletId.startsWith('cargo.') ||
    storyletId.startsWith('derelict.') ||
    storyletId.startsWith('fence.')
  ) {
    return 'hold';
  }
  // Wire: a Galactic-Wire bulletin — Guild pressure notices and wire rumors.
  if (storyletId.startsWith('wire.') || storyletId.startsWith('guild.')) return 'wire';
  // T-1504b · Era-event tie-ins. An era event ANNOUNCES itself on the wire (engine
  // era.ts `resolveWireCopy` files the def's wireStart/wireEnd as a WireEntry), so
  // the storylet that plays the story behind that bulletin belongs on the same
  // surface — PRD §8.3's "delivered by the economy ... a wire item." READER: the
  // Wire cap-bar bulletin opener (App.tsx `Wire`, `offersForSurface(game,'wire')`),
  // which renders every wire offer generically, so this needs no App change.
  // NOTE: era-tied storylets that are NOT `era.*` keep their own surface —
  // `cargo.medicinals.plague-relief` is a hold/manifest beat and stays 'hold'.
  if (storyletId.startsWith('era.')) return 'wire';
  // Port dispatches: port auditors, passengers, the Wise One / Sage, chains,
  // veteran beats — and, by the total default, anything not classified above.
  return 'port';
}

/** The non-resolution offers currently live — the ground truth the openers and
 *  the sweep audit both project. The day-30 resolution offers are excluded (the
 *  ceremony presents those). READERS: the cockpit surface openers + the audit. */
export function availableStorylets(game: GameState): StoryletOffer[] {
  return game.storylets.available.filter((o) => !isResolutionStorylet(o.storyletId));
}

/** The live offers whose diegetic surface is `surface`. READER: each cockpit
 *  surface opener (hold / wire / port). */
export function offersForSurface(game: GameState, surface: StoryletSurface): StoryletOffer[] {
  return availableStorylets(game).filter((o) => storyletSurface(o.storyletId) === surface);
}

export interface ResolutionCeremonyView {
  outcome: 'cleared' | 'unpaid';
  offer: StoryletOffer;
  rankLabel: string;
  /** The earned `tour_one_cleared` deed's title on the cleared path; null on
   *  unpaid (no deed is earned there). */
  deedTitle: string | null;
  /** The veteran lanes are open — read straight off the engine's flag. */
  veteranUnlocked: boolean;
}

/**
 * The day-30 resolution ceremony view, or null when no resolution is on offer.
 * Pure read of existing engine surface: the forced `resolution.tour-one.*` offer
 * (T-113b), the `veteran.unlocked` flag, and the earned `tour_one_cleared` deed.
 * The ceremony is a PRESENTATION of the engine's already-forced resolution — it
 * owns no rule and resolves through the standard `resolveStorylet` path.
 */
export function resolutionCeremony(game: GameState): ResolutionCeremonyView | null {
  const offer = game.storylets.available.find((o) => isResolutionStorylet(o.storyletId));
  if (!offer) return null;
  const outcome: 'cleared' | 'unpaid' =
    offer.storyletId === 'resolution.tour-one.cleared' ? 'cleared' : 'unpaid';
  const registry = deedRegistry(game);
  const deedTitle =
    outcome === 'cleared'
      ? (registry.earned.find((d) => d.id === 'tour_one_cleared')?.title ?? 'Tour One Complete')
      : null;
  return {
    outcome,
    offer,
    rankLabel: registry.rankLabel,
    deedTitle,
    veteranUnlocked: game.flags['veteran.unlocked'] === true,
  };
}

// ---- T-1605a corrupt-save recovery (display-only) ------------------------
//
// Until this task a save that would not load was swallowed by the store's boot
// path (`readSave`'s bare `catch { return null }`) and the player was handed a
// fresh career with NO notice — and the first autosave after any action then
// overwrote the damaged bytes, losing the career twice over. The fix is two
// halves: the store QUARANTINES the unreadable blob (store.ts), and this
// function turns the engine's own reason into one honest sentence.
//
// PURE TRANSLATION, exactly like `shipyardFailureExplanation`: the UI classifies
// nothing. Save validity is decided in the ENGINE (`save.ts` `loadSave`, which
// throws a typed `SaveError` carrying a `SaveErrorCode`) and proved there
// headlessly (engine `__tests__/save.test.ts` covers all five codes). The store
// reads `err.code`; this function only voices it. No new rule is added anywhere,
// so there is nothing new to make reachable headlessly.

/**
 * Why the cockpit could not boot the player's last career.
 *
 * `SaveErrorCode` is the engine's own union, re-exported through
 * `@spacerquest/engine`. Two UI-side codes extend it, and only one of them is a
 * failure of the SAVE:
 *  - `storage-unavailable` — the save-storage READ itself threw (private mode or
 *    a blocked store on the web build; an unreadable app-data dir on the desktop
 *    shell). The save is not damaged and the message must not say it is;
 *  - `unknown` — something other than a `SaveError` escaped `loadSave`. Honest
 *    catch-all: never claim a cause we do not have.
 *
 * READER: `App.tsx`'s `RecoveryNotice`, via {@link saveRecoveryMessage}.
 */
export type SaveRecoveryCode = SaveErrorCode | 'storage-unavailable' | 'unknown';

export interface SaveRecoveryNotice {
  code: SaveRecoveryCode;
  /**
   * True when the unreadable bytes were successfully copied to the quarantine
   * key (`sq.save.v1.corrupt`), so the message may promise they were kept. False
   * when the copy failed (full quota / blocked store) — the sentence then says
   * so rather than promising custody the game does not have.
   * READER: {@link saveRecoveryMessage}'s third clause.
   */
  preserved: boolean;
}

/**
 * One clause per cause, in the player's language. `satisfies Record<...>` is the
 * exhaustiveness guard that matters here: if the engine ever adds a
 * `SaveErrorCode`, this object stops type-checking instead of silently handing
 * the player `undefined` prose.
 */
const SAVE_RECOVERY_CAUSE = {
  'corrupt-json': 'the save data was damaged and could not be read',
  'bad-envelope': "the save file's header was unreadable",
  'invalid-state': 'that save no longer matches this build of Rimward',
  'no-migration': 'there is no upgrade path from that save’s version',
  'future-version': 'that save was written by a NEWER build of Rimward',
  // T-1701a: the ONLY cause whose wording depends on which store the cockpit is
  // running against — every other clause is about the save's own bytes, which
  // are identical on both backends. See `STORAGE_UNAVAILABLE_CAUSE` below.
  'storage-unavailable': 'save storage could not be reached',
  unknown: 'the save could not be loaded',
} satisfies Record<SaveRecoveryCode, string>;

/**
 * T-1701a · The one storage-dependent clause, per backend.
 *
 * "this browser" became a LIE the moment the Electron shell shipped: on desktop
 * there is no browser, there is an app-data folder, and telling a desktop player
 * to check their browser's site settings sends them somewhere that cannot help.
 * The rebalance-fallout rule applies to prose the same way it applies to
 * numbers — the sentence had to move in the same commit as the shell.
 *
 * READER of `StorageBackend` here: {@link saveRecoveryMessage} and
 * {@link saveWriteFailedMessage}; the value comes from `storage.ts`'s
 * `storageBackend` and is passed in by `App.tsx`.
 */
const STORAGE_UNAVAILABLE_CAUSE = {
  browser: 'this browser blocked access to save storage',
  desktop: 'the game could not reach its save folder',
} satisfies Record<StorageBackend, string>;

/** The quarantine key the message names. Mirrors the store's `CORRUPT_SAVE_KEY`
 *  — the sentence must name the exact key a player (or a bug report) can go
 *  looking for, so the two are stated once each and asserted together in
 *  `e2e/recovery.spec.ts`. */
const QUARANTINE_KEY_LABEL = 'sq.save.v1.corrupt';

/**
 * The corrupt-save notice, as one sentence in three clauses — cause, consequence,
 * custody. The player is TOLD (a) their last career could not be loaded and why,
 * (b) that the fresh career on screen is a fallback and not their save, and (c)
 * exactly what happened to the unreadable bytes.
 *
 * `storage-unavailable` is deliberately not accused of damage, and the custody
 * clause is never a promise the store did not keep (`preserved`).
 */
export function saveRecoveryMessage(
  notice: SaveRecoveryNotice,
  // T-1701a. Defaulted to `'browser'` so the ~30 existing call sites and tests
  // that predate the desktop shell keep their exact wording; `App.tsx` passes
  // the live `storageBackend`.
  backend: StorageBackend = 'browser',
): string {
  const cause =
    notice.code === 'storage-unavailable'
      ? STORAGE_UNAVAILABLE_CAUSE[backend]
      : SAVE_RECOVERY_CAUSE[notice.code];
  const custody = notice.preserved
    ? `The unreadable save was kept as “${QUARANTINE_KEY_LABEL}” and has not been overwritten.`
    : 'Nothing could be kept.';
  return `Your last career could not be loaded — ${cause}. A fresh career has been started. ${custody}`;
}

// ---------------------------------------------------------------------------
// T-1605c · THE WRITE SIDE OF THE SAME HONESTY.
//
// T-1605a made a save that would not LOAD say so (`saveRecoveryMessage` above).
// This says so when a save will not WRITE. The trigger is not hypothetical: this
// task measured a 1,000-day career at ~11 MB of JSON, against a ~5 MB
// localStorage quota per origin in Chromium — a long career crosses it around
// day ~420, and until now `store.ts autosave()` swallowed the resulting
// QuotaExceededError in a bare catch. The cockpit kept playing and kept writing
// nothing.
//
// T-1701a · THE QUOTA IS GONE ON DESKTOP, THE MESSAGE IS NOT. The Electron shell
// writes saves as ordinary files in the OS app-data dir, so the ~5 MB ceiling
// that motivated this message does not exist there. The message stays because
// the web build is still the dev/playtest loop (TECH-STACK §3) and still has the
// quota, and because a disk write can still fail (full disk, read-only profile
// dir). What changed is that it no longer says "the browser" when there is no
// browser — see `backend` below.
//
// Player-facing copy lives HERE, in format.ts, not in packages/content: content
// is game DATA (systems, storylets, balance tables), and this is UI chrome about
// the browser's storage, which the engine knows nothing about.
//
// PURE, like every other function in this file: no state, no I/O. The store owns
// the flag (`CockpitState.saveWriteFailed`), App.tsx owns the banner, this owns
// only the sentence.
// ---------------------------------------------------------------------------

/**
 * The autosave-failed notice, as one sentence in three clauses — cause,
 * consequence, and what the player can actually DO about it.
 *
 * The remedy clause names saving to a slot because that is the one write path
 * still worth trying: it is a different key, so it can succeed where the
 * autosave's ~11 MB blob does not, and `store.ts saveToSlot` reports its OWN
 * failure honestly if it also fails (T-312). The cause clause does not guess
 * between "quota full" and "storage blocked" — the browser does not reliably
 * distinguish them across engines, and claiming the wrong one would be worse
 * than naming both.
 *
 * READER: `App.tsx`'s `SaveWriteFailedNotice`, rendered while
 * `CockpitState.saveWriteFailed` is true. Asserted in
 * `e2e/save-write-failure.spec.ts`.
 */
export function saveWriteFailedMessage(
  // T-1701a. Defaulted for the same reason as `saveRecoveryMessage`'s parameter.
  backend: StorageBackend = 'browser',
): string {
  // The two clauses that name the CONTAINER. Everything else is backend-neutral
  // and stays word-for-word what T-1605c shipped — including the three phrases
  // `e2e/save-write-failure.spec.ts` asserts ("no longer being saved
  // automatically", "lost when you close or reload", "Save to a slot"), which is
  // why both variants still contain all three.
  const refuser =
    backend === 'desktop' ? 'the write to disk failed' : 'the browser refused the write';
  const closing = backend === 'desktop' ? 'close or reload the game' : 'close or reload the page';
  return (
    `This career is no longer being saved automatically — ${refuser}, ` +
    'usually because save storage is full or blocked. Everything you do from here will be ' +
    `lost when you ${closing}. Save to a slot from Settings to keep it.`
  );
}

// ---------------------------------------------------------------------------
// T-1701b · WHETHER THIS BUILD UPDATES ITSELF.
//
// One honest sentence per state, and honesty is the whole point: the shipped
// desktop package resolves to `inert` (no feed is compiled in, and
// electron-builder's `publish` is `null`, so no `app-update.yml` exists either),
// so the row must NOT imply that an update will ever arrive. A "checking for
// updates…" that never checks is the kind of small lie that turns into a
// support ticket when a patch does not land.
//
// READER of `storage.ts`'s `updateStatus`: `App.tsx`'s `BuildRow`. `null` means
// the web build — there is no shell, and the browser is what fetches a new
// version.
// ---------------------------------------------------------------------------
export function updateStatusMessage(status: UpdateStatus | null): string {
  switch (status) {
    case 'armed':
      return 'Checking for updates in the background.';
    case 'inert':
      // The sentence the shipped desktop package actually shows today.
      return 'Automatic updates are off in this build.';
    case 'unsupported':
      return 'This build does not check for updates.';
    default:
      return 'Updates are handled by your browser.';
  }
}
