import {
  STAR_SYSTEMS,
  CARGO_TYPES,
  STORYLETS,
  FLAWS,
  NPC_PROFILES,
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
  type CheckResult,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

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
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled';
  lines: string[];
}

const RESOLUTION_HEADLINE: Record<CombatAftermath['resolution'], string> = {
  escaped: 'Broke off — you slipped the net.',
  'talked-down': 'Talked down — tribute bought the lane.',
  defeated: 'Interceptor destroyed — the wreck drifts.',
  'interceptor-fled': 'Driven off — a friend cleared your tail.',
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
