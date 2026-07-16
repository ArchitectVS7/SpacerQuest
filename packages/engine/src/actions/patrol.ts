import {
  Stat,
  CONTRABAND_FINE,
  CONTRABAND_FENCE_REP_SCAN_PENALTY,
  CONTRABAND_CAUGHT_DISPOSITION,
  FENCE_REP_FLAG,
} from '@spacerquest/content';
import { EncounterState, GameEvent, GameState } from '../types.js';
import { SeededRng } from '../rng.js';
import { check } from '../dice.js';
import { isCarryingContraband, isCarryingIllicit } from '../economy.js';
import { applyDisposition } from '../npc.js';

/**
 * T-1305 · Patrol contraband GUILE scan (pure).
 *
 * PRD §7.2: "patrol captains roll GUILE checks against smugglers." A PATROL
 * interdiction scans a player who is carrying illicit cargo; on a caught scan
 * the hold is confiscated, a fine is levied, and a NAMED patrol nurses a grudge.
 *
 * FOUNDATION DIVERGENCE (f2f95fa9): the foundation has no such scan rule — this
 * is a T-1305-original consequence. The scan resolves against the SAME
 * `check(die, stat, dc)` primitive combat/travel use; PATROL succeeding == the
 * player is CAUGHT.
 *
 * PURITY / GOLDEN SAFETY: the single `rng.d20()` draw sits BEHIND the
 * `PATROL && isCarryingIllicit` guard, so any encounter that is not a patrol, or
 * a player with a clean hold, consumes ZERO rng — every pre-T-1305 replay golden
 * is byte-identical (no golden carries contraband through a patrol; the
 * contraband contract is T-1104 and the pod-through-patrol path is new here).
 *
 * READERS of what this emits: the `StatCheck` (actionContext 'npc-patrol')
 * routes to the patrol wire bucket (wire.ts classifyCheck); `ContrabandScan` /
 * `ContrabandConfiscated` are surfaced by T-1405's UI pass; the named-NPC grudge
 * feeds the existing disposition readers (encounter weighting + talk DC).
 */
export function applyPatrolContrabandScan(
  state: GameState,
  encounter: EncounterState,
  rng: SeededRng,
  events: GameEvent[],
): void {
  // Guard BEFORE any rng draw — see the purity/golden note above.
  if (encounter.interceptor.kind !== 'PATROL' || !isCarryingIllicit(state)) {
    return;
  }

  // Concealment = the player's GUILE, minus a penalty if they carry a known
  // fence reputation (Ray's flag). A known smuggler is scanned harder.
  const fenceRep = state.flags[FENCE_REP_FLAG] === true;
  const playerConceal =
    state.player.stats[Stat.GUILE] - (fenceRep ? CONTRABAND_FENCE_REP_SCAN_PENALTY : 0);

  // Higher concealment raises the DC the patrol must beat (player resists);
  // the fence-rep penalty lowers it (easier to catch). nat20 always catches,
  // nat1 never (per the shared `check` primitive).
  const dc = 10 + playerConceal;
  const patrolDie = rng.d20();
  const scan = check(patrolDie, encounter.interceptor.stats[Stat.GUILE], dc);
  const caught = scan.success;

  events.push({
    type: 'StatCheck',
    actor: encounter.interceptor.name,
    stat: Stat.GUILE,
    dc,
    result: scan,
    actionContext: 'npc-patrol',
  });
  events.push({
    type: 'ContrabandScan',
    encounterId: encounter.id,
    interceptorId: encounter.interceptor.id,
    caught,
    check: scan,
  });

  if (!caught) {
    return;
  }

  // --- Caught path: confiscate, fine, grudge ---
  // The two contraband sources are confiscated INDEPENDENTLY (a player could in
  // principle hold both a Contraband contract and a sealed pod).
  let confiscatedContract = false;
  let confiscatedPod = false;

  if (isCarryingContraband(state)) {
    // Void the run — no delivery payment for seized illegal cargo.
    state.player.activeContract = null;
    confiscatedContract = true;
  }
  if (state.flags['signal.contraband.carrying'] === true) {
    // Clear the pod flag (delete, matching storylet clear semantics).
    delete state.flags['signal.contraband.carrying'];
    confiscatedPod = true;
  }

  // Flat fine, clamped at 0 credits — this game has separate debt mechanics
  // (T-1304); a scan fine never drives credits negative on its own.
  const fine = Math.min(state.player.credits, CONTRABAND_FINE);
  state.player.credits -= fine;

  // A NAMED patrol captain remembers you. Anonymous patrols (the common case)
  // have no persistent NPC to attach to; faction/patrol-standing rep is
  // explicitly deferred to T-1503, so no unread faction flag is invented here.
  if (encounter.interceptor.source === 'named') {
    applyDisposition(
      state,
      encounter.interceptor.id,
      CONTRABAND_CAUGHT_DISPOSITION,
      'contraband-caught',
      events,
    );
  }

  events.push({
    type: 'ContrabandConfiscated',
    encounterId: encounter.id,
    fine,
    creditsRemaining: state.player.credits,
    confiscatedContract,
    confiscatedPod,
  });
}
