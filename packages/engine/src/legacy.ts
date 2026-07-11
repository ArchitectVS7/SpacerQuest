import { STAR_SYSTEMS } from '@spacerquest/content';
import { EncounterState, GameEvent, GameState } from './types.js';
import { starterShip } from './state.js';

/** What the fatal encounter tells succession: who took the ship down and where
 *  the wreck ended up (the origin system it was towed back to). */
export interface ShipLostContext {
  encounter: EncounterState;
  interceptorId: string;
}

/**
 * T-108 · Death & legacy (PRD §5.2). A pure function: applied immediately when
 * ShipLost fires. The successor takes the license.
 *
 *   CARRIES (untouched on state): the deed registry (deeds, renownRank,
 *     matchCounts), charts (visited systems + T-111 knowledge), storylet flags
 *     and completed storylets — the world remembers — every NPC disposition
 *     (grudges attach to the NAME, per 'the syndicate remembers your name'),
 *     stats (v1: no reset), and the debt + debtDueDay (the Guild collects from
 *     the estate).
 *   HALVED: credits (floor division).
 *   RESET: ship to the exact starterShip(); the active contract is FORFEITED
 *     here (the cargo went down with the ship — a TradeEvent 'forfeit-cargo'
 *     records it; the killing-blow path nulls the encounter directly and never
 *     routes through resolveEncounter, so nothing upstream clears it);
 *     scheduled storylets CANCELLED (they were appointments with a dead
 *     spacer); the day's remaining dawn hand is LOST (succession consumes the
 *     day — the successor starts fresh at dawn).
 *   LOCATION: the successor starts at the origin system of the fatal encounter
 *     (where the wreck was towed).
 *
 * Emits LegacySuccession plus a period-voice wire obituary. Caller clears the
 * encounter (already nulled at the ShipLost site).
 */
export function applySuccession(state: GameState, context: ShipLostContext): GameEvent[] {
  const events: GameEvent[] = [];
  const originSystem = context.encounter.pendingTravel.origin;

  // HALVED: credits (floor division). CARRIED items (registry, charts, flags,
  // completed storylets, npc dispositions, stats, debt/debtDueDay) are left
  // exactly as they are — no code needed, that IS the inheritance.
  const inheritedCredits = Math.floor(state.player.credits / 2);
  state.player.credits = inheritedCredits;

  // RESET: ship back to the junker — single source of truth shared with
  // createInitialState.
  state.player.ship = starterShip();

  // LOCATION: the license is claimed where the wreck was towed in.
  state.player.currentSystemId = originSystem;

  // FORFEIT: the signed cargo was destroyed with the ship. Without this, the
  // successor could fly an empty starter ship to the destination and
  // resolveTravel's destination-only check would pay out for cargo that no
  // longer exists.
  const forfeited = state.player.activeContract;
  if (forfeited) {
    state.player.activeContract = null;
    events.push({
      type: 'TradeEvent',
      characterId: 'player',
      action: 'forfeit-cargo',
      success: false,
      destination: forfeited.destination,
      cargoType: forfeited.cargoType,
      payment: forfeited.payment,
      actionDetails: 'Contract cargo lost with the ship.',
    });
  }

  // RESET: cancel scheduled storylets — appointments the dead spacer will never
  // keep.
  state.storylets.scheduled = [];

  // The day's remaining dice die with the ship: succession consumes the hand,
  // and the successor rolls a fresh one at the next dawn.
  if (state.player.dawnHand) {
    state.player.dawnHand.spent = state.player.dawnHand.spent.map(() => true);
  }

  state.player.legacy.successionCount += 1;

  events.push({
    type: 'LegacySuccession',
    day: state.day,
    successionCount: state.player.legacy.successionCount,
    inheritedCredits,
    debtOutstanding: state.player.debt,
    previousShipLostTo: context.interceptorId,
  });

  const systemName = STAR_SYSTEMS[originSystem]?.name ?? `system ${originSystem}`;
  events.push({
    type: 'WireEntry',
    day: state.day,
    message: `The Registry records the loss of a spacer at ${systemName}. A successor claims the license, the charts, and the debts.`,
  });

  return events;
}
