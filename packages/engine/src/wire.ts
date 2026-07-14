import { NAT_WIRE_TEMPLATES, NPC_PROFILES, Stat, WireStoryCategory } from '@spacerquest/content';
import { GameEvent, NpcState } from './types.js';
import { SeededRng } from './rng.js';

/**
 * T-1202 · Nat-20 / nat-1 story scanner (PRD §6).
 *
 * "A natural 20 or natural 1 always generates a story, and stories go out on the
 *  Galactic News Wire." Every check() call site — player or NPC — already emits a
 *  `StatCheck` event carrying the `CheckResult` (with `nat20`/`nat1`). Rather than
 *  bolt a wire hook onto all eight sites, this one pure scanner walks a batch of
 *  emitted events and produces exactly one `WireEntry` per natted StatCheck. It is
 *  wired into BOTH day-loop chokepoints (day.ts: applyPlayerAction for player/day
 *  checks, endDay for the NPC dusk batch + encounter pressure), so no nat is ever
 *  dropped.
 *
 * READER of these WireEntry events: the Galactic Wire ticker (`wireLines`) and the
 * browsable log (`wireLog`) in packages/ui/src/format.ts, rendered by the `Wire`
 * component in App.tsx — the player reads the story on their terminal.
 *
 * Purity: the only randomness is the seeded `rng` argument (template + gamble-loser
 * picks). The caller MUST seed it from a STABLE value (the pre-action rngState),
 * never from the live day RNG, so scanning cannot perturb the persisted rngState
 * and break determinism/golden fixtures. No DOM / Date / Math.random.
 */
export function natWireStories(
  events: readonly GameEvent[],
  day: number,
  rng: SeededRng,
  npcs: readonly NpcState[],
): GameEvent[] {
  const out: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== 'StatCheck') continue;
    if (!event.result.nat20 && !event.result.nat1) continue;

    const isNat20 = event.result.nat20;
    let category = classifyCheck(event.actor, event.stat, event.actionContext);
    const actorName = resolveActorName(event.actor, npcs);

    let loserName = '';
    let loserShip = '';
    if (category === 'gamble') {
      const loser = pickGambleLoser(event.actor, npcs, rng);
      if (loser) {
        loserName = loser.name;
        loserShip = NPC_PROFILES.find((p) => p.id === loser.profileId)?.shipName ?? 'ship';
      } else {
        // No rival to lose the ship to (degenerate single-NPC roster) — fall back
        // to a generic bucket so the "always emit" guarantee never drops an entry.
        category = actorName === 'Player' ? 'talk' : 'combat';
      }
    }

    const bucket = NAT_WIRE_TEMPLATES[category][isNat20 ? 'nat20' : 'nat1'];
    const template = bucket[Math.floor(rng.next() * bucket.length)] ?? bucket[0];
    const message = template
      .split('{actor}')
      .join(actorName)
      .split('{loserShip}')
      .join(loserShip)
      .split('{loser}')
      .join(loserName);

    out.push({ type: 'WireEntry', day, message });
  }

  return out;
}

/** Map a natted check onto a story bucket. The `npc-*` actionContexts (T-1201)
 *  discriminate NPC verbs directly. Player combat/travel/exploration/talk checks
 *  carry NO actionContext (adding one would change the CheckBreakdown label the UI
 *  renders — T-1202 keeps that client untouched), so they are classified by
 *  actor+stat. A context-less non-Player actor is the interceptor's display name
 *  from enemy-pressure GUNS checks → combat. */
function classifyCheck(
  actor: string,
  stat: Stat,
  actionContext: Extract<GameEvent, { type: 'StatCheck' }>['actionContext'],
): WireStoryCategory {
  if (actionContext) {
    switch (actionContext) {
      case 'npc-socialize':
        return 'gamble';
      case 'npc-trade':
        return 'trade';
      case 'npc-travel':
        return 'travel';
      case 'npc-combat':
        return 'combat';
      case 'npc-patrol':
        return 'patrol';
      case 'haggle':
        return 'haggle';
      case 'storylet':
        return 'storylet';
      case 'retreat':
        // T-1207: an interceptor's post-kill retreat roll — a nat-20 is the
        // "miracle burn" escape story, its own wire beat.
        return 'retreat';
    }
  }
  if (actor === 'Player') {
    if (stat === Stat.GUNS) return 'combat';
    if (stat === Stat.PILOT) return 'nav';
    return 'talk';
  }
  return 'combat';
}

/** Player checks report the literal actor "Player" (matches existing wire copy,
 *  e.g. exploration.ts). NPC/interceptor checks carry an id or display name in
 *  `actor`; resolve the id to the cast name, falling back to the raw actor. */
function resolveActorName(actor: string, npcs: readonly NpcState[]): string {
  if (actor === 'Player') return 'Player';
  return npcs.find((n) => n.id === actor)?.name ?? actor;
}

/** Deterministically choose the rival who loses/wins the ship in a gamble story.
 *  Prefers an NPC in the winner's current system (fiction: they were at the same
 *  Hangout table); falls back to any other NPC. Returns null only when there is
 *  no other NPC at all. */
function pickGambleLoser(
  winnerId: string,
  npcs: readonly NpcState[],
  rng: SeededRng,
): NpcState | null {
  const winner = npcs.find((n) => n.id === winnerId);
  const others = npcs.filter((n) => n.id !== winnerId);
  if (others.length === 0) return null;
  const coLocated = winner
    ? others.filter((n) => n.currentSystemId === winner.currentSystemId)
    : [];
  const pool = coLocated.length > 0 ? coLocated : others;
  return pool[Math.floor(rng.next() * pool.length)] ?? null;
}
