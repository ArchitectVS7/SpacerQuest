import {
  STAR_SYSTEMS,
  CARGO_TYPES,
  STORYLETS,
  FLAWS,
  NPC_PROFILES,
  SHIP_COMPONENTS,
  SPECIAL_EQUIPMENT,
  RENOWN_RANKS,
  RENOWN_DEED_THRESHOLDS,
  distance,
  Stat,
  FIGHT_FUEL_COST,
  RUN_FUEL_COST,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
  type StoryletTrigger,
} from '@spacerquest/content';
import {
  jumpFuelCost,
  travelDc,
  calculateRouteDanger,
  maxJumpDistance,
  quoteShipyard,
  nemesisLoreIndex,
  fragmentCount,
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
} from '@spacerquest/engine';
import type { RenownRankId } from '@spacerquest/content';

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

export function jumpsBetween(from: number, to: number): number {
  // Content distance is a float in the seed's x/y plane; one "jump" is a unit of
  // that distance. Rounded for the manifest read-out (the real fuel math is the
  // engine's job — surfaced honestly in the T-304 starmap pane later).
  return Math.max(1, Math.round(distance(from, to)));
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

// ---- T-304 starmap -------------------------------------------------------
//
// Every rule number the starmap shows flows out of an engine function — never
// recomputed here. `routePreview` reads jumpFuelCost / travelDc /
// calculateRouteDanger; the fuel-range ring radius comes from maxJumpDistance;
// reachability compares the engine's fuel cost against the ship's fuel. The UI
// only projects coordinates onto the SVG plane.

/** A single previewed jump — fuel cost, pilot DC, danger and reachability, all
 *  read straight from the engine so the number shown is the number checked. */
export interface RoutePreview {
  distance: number;
  fuelCost: number;
  dc: number;
  dangerLevel: number;
  reachable: boolean;
}

export function routePreview(game: GameState, dest: number): RoutePreview {
  const here = game.player.currentSystemId;
  const d = distance(here, dest);
  const ship = game.player.ship;
  const fuelCost = jumpFuelCost(ship.drives, d, ship.hasTransWarpDrive ?? false);
  return {
    distance: d,
    fuelCost,
    dc: travelDc(d),
    dangerLevel: calculateRouteDanger(game, here, dest).routeDangerLevel,
    reachable: fuelCost <= ship.fuel,
  };
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
 */
export function starmapProjection(game: GameState): StarmapProjection {
  const here = game.player.currentSystemId;
  const visited = new Set(game.player.charts.visitedSystemIds);
  const shown = new Map<number, (typeof STAR_SYSTEMS)[number]>();
  for (const sys of Object.values(STAR_SYSTEMS)) {
    if ((sys.id >= 1 && sys.id <= 20) || sys.id === here || visited.has(sys.id)) {
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

/** Past-tense flaw fragments the engine files after an NPC's name when a flaw
 *  overrides their day (see engine day.ts + content FLAWS). Read from authored
 *  content data so a `WireEntry` can be classified as a flaw override without
 *  any engine/schema change — the UI owns no rule here. */
const FLAW_DETAILS: readonly string[] = Object.values(FLAWS).map((f) => f.detail);

function isFlawOverrideMessage(msg: string): boolean {
  return FLAW_DETAILS.some((detail) => msg.endsWith(detail));
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
      return isFlawOverrideMessage(e.message) ? 'flaw-override' : 'npc';
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
 * PREVIEW of what a talk is likely to cost THIS round. This mirrors the engine's
 * own `tributeForRound` (min(round * base, cap)) using the imported content
 * constants — it is display-only. The amount actually charged always comes from
 * the engine's `TributeDemanded`/`TributePaid` events, never from this number.
 */
export function tributeThisRound(round: number): number {
  return Math.min(round * TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX);
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
    } else if (e.type === 'ShipLost') {
      lines.push('Your ship was lost in the exchange.');
    } else if (e.type === 'LegacySuccession') {
      lines.push(
        `A successor claims the license — ${e.inheritedCredits.toLocaleString()}cr inherited.`,
      );
    }
  }
  lines.push(`Resolved on round ${resolved.round}.`);
  return { resolution: resolved.resolution, lines };
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
  /** The tier this component currently sits at (strength/10, rounded up, min 1). */
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
    const tier = Math.max(1, Math.ceil(comp.strength / 10));
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

/** Does resolving this choice consume a die? True iff it declares a die spend
 *  or a stat check (the two paths the engine's `spendRequiredDie` burns a die
 *  on). The store passes `spendDie` ONLY for these — a no-requirement choice
 *  (answer / accept-thanks) must never demand or waste a die. */
export function storyletChoiceNeedsDie(choice: StoryletChoice): boolean {
  return !!(choice.requirements?.spendDie || choice.requirements?.statCheck);
}

/**
 * A compact, always-shown requirement/cost badge for a choice — the PRD's
 * "choices with visible requirements/costs". Renders the credit floor, the stat
 * check (STAT DC n), and a `die` token when a die is spent, joined by ` · `. An
 * unconditional choice returns '' (no badge). This shows the requirement whether
 * or not it is currently met; the LOCK (below) adds the disabled-state reason.
 */
export function storyletChoiceCostLabel(choice: StoryletChoice): string {
  const req = choice.requirements;
  if (!req) return '';
  const parts: string[] = [];
  if (req.credits?.gte !== undefined) parts.push(`${req.credits.gte.toLocaleString()}cr`);
  if (req.statCheck) parts.push(`${statName(req.statCheck.stat)} DC ${req.statCheck.dc}`);
  if (storyletChoiceNeedsDie(choice)) parts.push('die');
  return parts.join(' · ');
}

/**
 * Why this choice is locked right now, or null when it can be taken. Mirrors the
 * engine's own refusal order (resolveStoryletChoice): a credit shortfall blocks
 * first, then a missing die. `armed` is whether a die is currently selected —
 * a die-requiring choice is locked until one is assigned. This drives both the
 * disabled state and the visible requirement on a locked choice.
 */
export function storyletChoiceLock(
  game: GameState,
  choice: StoryletChoice,
  armed: boolean,
): string | null {
  const req = choice.requirements;
  if (req?.credits?.gte !== undefined && game.player.credits < req.credits.gte) {
    return `Need ${req.credits.gte.toLocaleString()}cr`;
  }
  if (storyletChoiceNeedsDie(choice) && !armed) {
    return 'Assign a die';
  }
  return null;
}

export interface DeedRegistryView {
  rankId: RenownRankId;
  rankLabel: string;
  deedCount: number;
  /** The next rank up, when one remains (null at the top rank). */
  nextRankLabel: string | null;
  /** Deeds still needed to reach that next rank (null at the top rank). */
  deedsToNextRank: number | null;
  /** Earned deeds, newest first (by eventIndex — stable within a day). */
  earned: { id: string; title: string; citation: string; day: number }[];
}

/**
 * The Registry of Deeds view — rank, deed count, next-rank progress, and the
 * earned-deed roll (newest first). All read from `game.player.registry`; the
 * rank labels come from RENOWN_RANKS and the next-rank threshold from
 * RENOWN_DEED_THRESHOLDS (content), never recomputed here.
 */
export function deedRegistry(game: GameState): DeedRegistryView {
  const registry = game.player.registry;
  const deedCount = registry.earned.length;
  // Ranks in ascending threshold order; the next rank is the first whose
  // threshold the current deed count has not yet reached.
  const rankOrder = (Object.keys(RENOWN_DEED_THRESHOLDS) as RenownRankId[]).sort(
    (a, b) => RENOWN_DEED_THRESHOLDS[a] - RENOWN_DEED_THRESHOLDS[b],
  );
  const next = rankOrder.find((id) => RENOWN_DEED_THRESHOLDS[id] > deedCount) ?? null;
  return {
    rankId: registry.renownRank,
    rankLabel: RENOWN_RANKS[registry.renownRank].label,
    deedCount,
    nextRankLabel: next ? RENOWN_RANKS[next].label : null,
    deedsToNextRank: next ? RENOWN_DEED_THRESHOLDS[next] - deedCount : null,
    earned: [...registry.earned]
      .sort((a, b) => b.eventIndex - a.eventIndex)
      .map((d) => ({ id: d.id, title: d.title, citation: d.citation, day: d.day })),
  };
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

// ---- T-311 onboarding & Tour One presentation ----------------------------
//
// The teaching layer for Tour One is PURELY PRESENTATIONAL. It reads existing
// engine state and never mutates a rule. "Which first-time prompts the player
// has already progressed past" is client meta-state (like `fx`), kept in the UI
// store and out of GameState — so the engine stays pure and a JSON round-trip of
// game state is unaffected. This section is the single source of truth for the
// prompts, shared by the selector (what to render) and the store's auto-dismiss
// reconcile (what to mark seen when the taught action lands).

/** Anchor a contextual prompt to the real affordance it teaches. */
export type OnboardingAnchor = 'hand' | 'manifest' | 'starmap' | 'combat';

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
    body: 'Five dice, once a day. Pick one, then assign it to an action.',
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
