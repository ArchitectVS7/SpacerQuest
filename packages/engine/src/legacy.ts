import { STAR_SYSTEMS } from '@spacerquest/content';
import { EncounterState, GameEvent, GameState } from './types.js';
import { starterShip } from './state.js';
import { syncPlayerTier } from './tier.js';

/** What the fatal loss tells succession: who/what took the ship down and where
 *  the wreck ended up (the origin system it was towed back to). A combat death
 *  passes the fatal `encounter` (the wreck is towed to its origin); a non-combat
 *  loss (T-1205 life-support failure) passes an explicit `originSystem` instead —
 *  the license is claimed where the ship was standing. Exactly one of the two is
 *  supplied; `originSystem` falls back to the player's current system. */
export interface ShipLostContext {
  encounter?: EncounterState;
  originSystem?: number;
  interceptorId: string;
}

/**
 * T-108 · Death & legacy (PRD §5.2). A pure function: applied immediately when
 * ShipLost fires. The successor takes the license.
 *
 *   CARRIES (untouched on state): the deed registry (deeds, renownRank,
 *     matchCounts), charts (visited systems + charted POIs), the Nemesis file
 *     (Signal Fragments — knowledge death never takes, PRD §8.1; carried
 *     EXPLICITLY below since it lives on PlayerState, not charts), storylet flags
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
  const originSystem =
    context.encounter?.pendingTravel.origin ?? context.originSystem ?? state.player.currentSystemId;

  // HALVED: credits (floor division). CARRIED items (registry, charts, flags,
  // completed storylets, npc dispositions, stats, debt/debtDueDay) are left
  // exactly as they are — no code needed, that IS the inheritance.
  const inheritedCredits = Math.floor(state.player.credits / 2);
  state.player.credits = inheritedCredits;

  // CARRY (explicit): the Nemesis file is knowledge — the one currency death
  // never takes (PRD §8.1). It lives on PlayerState (not charts), so snapshot and
  // reassign it deliberately: the successor keeps every Signal Fragment, decoded
  // or not. Guards against any future full-player reset silently dropping it.
  const inheritedNemesisFile = state.player.nemesisFile;

  // RESET: ship back to the junker — single source of truth shared with
  // createInitialState.
  state.player.ship = starterShip();

  state.player.nemesisFile = inheritedNemesisFile;

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

  // T-1203 · DEFINED SUCCESSION BEHAVIOR for the matchmaking band. The ship was
  // just reset to the junker (shipClassTier → 1) but the registry/renownRank is
  // CARRIED (grudges attach to the name; the world remembers), so the successor's
  // tier = max(rankTier(carriedRank), 1) = rankTier(carriedRank). The successor
  // is NOT reset to tier 1 and does NOT inherit a stale over-fit tier: the
  // hunters that a renowned name draws still come, matched to the name's renown,
  // even though the ship under them is fresh. Recomputed here after the ship
  // reset so the band reflects the junker + carried rank exactly.
  syncPlayerTier(state);

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
