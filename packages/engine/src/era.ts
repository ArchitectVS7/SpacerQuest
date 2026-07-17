import { ERA_EVENTS, ERA_EVENTS_BY_ID, STAR_SYSTEMS } from '@spacerquest/content';
import { EraEventState, GameEvent } from './types.js';
import { SeededRng } from './rng.js';

/**
 * Era-event engine glue (T-107) — the seeded schedule and the modifier
 * plumbing for the "economy fights back" beats. Content (packages/content
 * eraEvents.ts) owns the definitions; this module owns:
 *   1. resolving a live `EraEventState` into concrete price/danger modifiers by
 *      defId (nothing derivable is stored on the event — always recomputed here);
 *   2. applying those modifiers inside the shared player/NPC economy functions
 *      (economy.ts, npc.ts, actions/travel.ts);
 *   3. the deterministic dusk scheduler: one event active at a time, seeded
 *      onset after a cooldown, natural expiry at the day boundary.
 */

/** Onset probability per eligible dusk once the cooldown has elapsed. */
export const ERA_ONSET_CHANCE = 0.1;
/** Quiet days required after an era ends before another may begin. */
export const ERA_COOLDOWN_DAYS = 5;

/** Core band (the manifest-board destinations) and Rim band, for region scope. */
export const CORE_SYSTEM_IDS: readonly number[] = Array.from({ length: 14 }, (_, i) => i + 1);
export const RIM_SYSTEM_IDS: readonly number[] = Array.from({ length: 6 }, (_, i) => i + 15);

function affected(eraEvent: EraEventState, systemId: number): boolean {
  return eraEvent.affectedSystemIds.includes(systemId);
}

/**
 * Contract-payment multiplier for a single offer under the active era event.
 * Shared by the player's manifest board and NPC synthesized contract income so
 * everyone feels the same re-priced economy (T-107 decision 4).
 */
export function eraPaymentMultiplier(
  eraEvent: EraEventState | null,
  destination: number,
  cargoType: number,
): number {
  if (!eraEvent) return 1;
  const def = ERA_EVENTS_BY_ID[eraEvent.defId];
  if (!def) return 1;
  const m = def.modifiers;
  let mult = 1;
  if (m.paymentMultiplierAll) mult *= m.paymentMultiplierAll;
  if (affected(eraEvent, destination)) {
    if (m.paymentMultiplierIntoScope) mult *= m.paymentMultiplierIntoScope;
    const byType = m.paymentMultiplierByCargoType?.[cargoType];
    if (byType) mult *= byType;
  }
  return mult;
}

/** Local depot fuel-price multiplier under the active era event. */
export function eraFuelPriceMultiplier(eraEvent: EraEventState | null, systemId: number): number {
  if (!eraEvent) return 1;
  const def = ERA_EVENTS_BY_ID[eraEvent.defId];
  if (!def?.modifiers.fuelPriceMultiplier) return 1;
  return affected(eraEvent, systemId) ? def.modifiers.fuelPriceMultiplier : 1;
}

/**
 * T-1307 · Owned-port launch-fee income multiplier under the active era event.
 * Mirrors {@link eraFuelPriceMultiplier}: returns `portIncomeMultiplier` when the
 * owned port's system is in scope, else 1 (and 1 with no event / no modifier). The
 * per-port A/B lever the dusk income accrual (actions/port.ts `portDuskIncome`)
 * reads — a regional blockade lifts an owned core port's income, a crackdown dips
 * it; an event whose scope doesn't cover the port leaves it at base.
 */
export function eraPortIncomeMultiplier(eraEvent: EraEventState | null, systemId: number): number {
  if (!eraEvent) return 1;
  const def = ERA_EVENTS_BY_ID[eraEvent.defId];
  if (!def?.modifiers.portIncomeMultiplier) return 1;
  return affected(eraEvent, systemId) ? def.modifiers.portIncomeMultiplier : 1;
}

/** Additive route-danger delta under the active era event (galaxy-wide plus a
 *  scope-touch bonus/malus). */
export function eraDangerDelta(
  eraEvent: EraEventState | null,
  origin: number,
  destination: number,
): number {
  if (!eraEvent) return 0;
  const def = ERA_EVENTS_BY_ID[eraEvent.defId];
  if (!def) return 0;
  const m = def.modifiers;
  let delta = m.routeDangerDeltaAll ?? 0;
  if (m.routeDangerDelta && (affected(eraEvent, origin) || affected(eraEvent, destination))) {
    delta += m.routeDangerDelta;
  }
  return delta;
}

function regionLabel(eraEvent: EraEventState): string {
  const first = eraEvent.affectedSystemIds[0] ?? 1;
  return first <= 14 ? 'the Core Worlds' : 'the Rim';
}

function resolveWireCopy(template: string, eraEvent: EraEventState): string {
  const first = eraEvent.affectedSystemIds[0] ?? 1;
  const systemName = STAR_SYSTEMS[first]?.name ?? `system ${first}`;
  return template.split('{system}').join(systemName).split('{region}').join(regionLabel(eraEvent));
}

function rollNewEra(upcomingDay: number, rng: SeededRng): EraEventState {
  const def = ERA_EVENTS[Math.floor(rng.next() * ERA_EVENTS.length)];
  let affectedSystemIds: number[];
  if (def.scope.kind === 'single-system') {
    const sys = CORE_SYSTEM_IDS[Math.floor(rng.next() * CORE_SYSTEM_IDS.length)];
    affectedSystemIds = [sys];
  } else {
    const region = def.scope.region ?? (rng.next() < 0.5 ? 'core' : 'rim');
    affectedSystemIds = region === 'core' ? [...CORE_SYSTEM_IDS] : [...RIM_SYSTEM_IDS];
  }
  const [min, max] = def.durationDays;
  const duration = min + Math.floor(rng.next() * (max - min + 1));
  return {
    defId: def.id,
    startedDay: upcomingDay,
    endsDay: upcomingDay + duration,
    affectedSystemIds,
  };
}

/**
 * The dusk scheduler (T-107 decision 3). Deterministic, seeded from the day RNG
 * stream. When an event is active it expires at the day boundary (once the
 * upcoming day reaches endsDay). When none is active and the cooldown has
 * elapsed, roll for onset (~10%/day); on onset pick def + scope + duration.
 * Emits EraEventStarted/EraEventEnded plus period-voice wire entries.
 */
export function advanceEraSchedule(
  params: { eraEvent: EraEventState | null; lastEraEventEndedDay: number; currentDay: number },
  rng: SeededRng,
): { eraEvent: EraEventState | null; lastEraEventEndedDay: number; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const { currentDay } = params;
  const upcomingDay = currentDay + 1;
  let eraEvent = params.eraEvent;
  let lastEraEventEndedDay = params.lastEraEventEndedDay;

  if (eraEvent) {
    if (upcomingDay >= eraEvent.endsDay) {
      const def = ERA_EVENTS_BY_ID[eraEvent.defId];
      events.push({
        type: 'EraEventEnded',
        day: currentDay,
        defId: eraEvent.defId,
        name: def?.name ?? eraEvent.defId,
      });
      if (def) {
        events.push({
          type: 'WireEntry',
          day: currentDay,
          kind: 'plain',
          message: resolveWireCopy(def.wireEnd, eraEvent),
        });
      }
      lastEraEventEndedDay = currentDay;
      eraEvent = null;
    }
  } else if (
    currentDay - lastEraEventEndedDay >= ERA_COOLDOWN_DAYS &&
    rng.next() < ERA_ONSET_CHANCE
  ) {
    const started = rollNewEra(upcomingDay, rng);
    const def = ERA_EVENTS_BY_ID[started.defId];
    eraEvent = started;
    events.push({
      type: 'EraEventStarted',
      day: currentDay,
      defId: started.defId,
      name: def.name,
      endsDay: started.endsDay,
      affectedSystemIds: [...started.affectedSystemIds],
    });
    events.push({
      type: 'WireEntry',
      day: currentDay,
      kind: 'plain',
      message: resolveWireCopy(def.wireStart, started),
    });
  }

  return { eraEvent, lastEraEventEndedDay, events };
}
