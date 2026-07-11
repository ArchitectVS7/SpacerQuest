import {
  STAR_SYSTEMS,
  CARGO_TYPES,
  STORYLETS,
  FLAWS,
  NPC_PROFILES,
  distance,
  Stat,
  type StoryletTrigger,
} from '@spacerquest/content';
import type { CheckResult, GameEvent, GameState } from '@spacerquest/engine';

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

export interface StarNode {
  id: number;
  name: string;
  x: number;
  y: number;
  isRim: boolean;
}

/** All systems projected into a [0..1] plane for the starmap SVG. */
export function starNodes(): StarNode[] {
  const systems = Object.values(STAR_SYSTEMS);
  const xs = systems.map((s) => s.coordinates.x);
  const ys = systems.map((s) => s.coordinates.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  return systems.map((s) => ({
    id: s.id,
    name: s.name,
    isRim: s.isRim,
    x: (s.coordinates.x - minX) / spanX,
    y: (s.coordinates.y - minY) / spanY,
  }));
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
