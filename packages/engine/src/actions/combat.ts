import {
  Stat,
  COMBAT_SALVAGE_PER_TIER,
  RUN_FUEL_COST,
  FIGHT_FUEL_COST,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
  RETREAT_KILL_EDGE,
  DISPOSITION_DELTAS,
  TALK_DC_PER_DISPOSITION,
  PATROL_TRIBUTE_LEAGUE_DELTA,
  PATROL_EVADED_LEAGUE_DELTA,
} from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction, EncounterState } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { completePendingTravel } from './travel.js';
import { applyDisposition } from '../npc.js';
import { applyReputation } from '../reputation.js';
import { applySuccession } from '../legacy.js';
import { weaponVolleyDamage } from '../components.js';
import { cloneState } from '../clone.js';
// N3 · The rules neither side owns. `applyInterceptorHit` and
// `interceptorPressureDc` were inlined in this file, reachable only through
// `state.player.*`; they now live in a neutral module so the NPC's dusk encounter
// calls the SAME definitions. See combatRules.ts for why it is a separate file.
import {
  applyInterceptorHit,
  interceptorPressureDc,
  interceptorRefusesTribute,
  tributeForRound,
} from '../combatRules.js';

// Combat balance numbers are data — sourced from @spacerquest/content
// (see packages/content/src/combat.ts for values, foundation citation, and the
// intentional round-cap divergence). Re-exported here so existing engine/sim
// importers of these names keep resolving through the engine surface.
export { RUN_FUEL_COST, FIGHT_FUEL_COST, TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX };

// N3 · `tributeForRound` and the flaw-refusal roll MOVED to the neutral
// `combatRules.ts` so the cast can pay tribute through the same schedule (this
// file imports `../npc.js`, so npc.ts cannot import it back). Re-exported here
// because `tributeForRound` is part of the engine's public surface — the barrel
// (index.ts `export *`) and the UI's tribute preview both resolve it through this
// module, and T-1401/T-1402 made that preview a pass-through to this exact symbol.
export { tributeForRound };

function resolveEncounter(
  state: GameState,
  encounter: EncounterState,
  events: GameEvent[],
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped',
): void {
  // R2c · PAY THE VICTORY. A destroyed interceptor leaves a wreck worth
  // COMBAT_SALVAGE_PER_TIER per tier (content combat.ts — the same 150/tier the
  // NPC side has always paid its own combat wins). ONLY on 'defeated': the other
  // resolutions are exits or escapes, not kills, and leave nothing to strip.
  // Consumes no rng, so no golden's roll order moves.
  const salvageCredits =
    resolution === 'defeated' ? COMBAT_SALVAGE_PER_TIER * encounter.interceptor.tier : 0;
  if (salvageCredits > 0) {
    state.player.credits += salvageCredits;
  }
  events.push({
    type: 'EncounterResolved',
    encounterId: encounter.id,
    resolution,
    round: encounter.round,
    interceptorId: encounter.interceptor.id,
    ...(salvageCredits > 0 ? { salvageCredits } : {}),
  });
  state.encounter = null;

  // T-106 disposition: named interceptors remember how it ended. T-1204 moved
  // the deltas into content (DISPOSITION_DELTAS) and enlarged them so a single
  // organic event survives the rebalanced decay (day.ts) — a defeat now cuts a
  // serious grudge (−5) that the T-1204 interception weighting makes hunt you.
  // - defeated: you shot their ship out from under them.
  // - escaped: the player fled and the interceptor keeps the field — relief, no
  //   blood spilled, a small mark in the player's favor (documented design call).
  // - interceptor-fled (driven off by a bonded third party): no change; their
  //   quarrel is with the rescuer, not the player.
  // - interceptor-escaped (T-1207): the interceptor lost the fight but slipped
  //   the kill under its own power. They were bested — a named one keeps the same
  //   grudge a `defeated` foe would ("he'll heal, he'll remember"), so we reuse
  //   DISPOSITION_DELTAS.defeat. (A distinct, milder key was considered but the
  //   fictional beat is identical: you shot their ship apart; they just lived.)
  if (encounter.interceptor.source === 'named') {
    if (resolution === 'defeated' || resolution === 'interceptor-escaped') {
      applyDisposition(
        state,
        encounter.interceptor.id,
        DISPOSITION_DELTAS.defeat,
        'defeat',
        events,
      );
    } else if (resolution === 'escaped') {
      applyDisposition(
        state,
        encounter.interceptor.id,
        DISPOSITION_DELTAS.playerFled,
        'player-fled',
        events,
      );
    }
  }

  // T-1503 · Astro-League reputation (the "patrol tribute" organic mover, PRD §8.1).
  // The League IS the law/patrol power, so a resolved PATROL encounter moves League
  // standing: complying with the checkpoint (talked-down — the tribute path, or a
  // nat-20 wave-through) WARMS the League; fighting or fleeing it (defeated /
  // escaped / interceptor-escaped) COOLS it. Gated on the anonymous interceptor's
  // `kind === 'PATROL'` (named interceptors carry no kind → no move), and takes NO
  // rng, so it can never perturb a replay's stream. This is what makes League rep
  // near-unavoidably nonzero for a travelling trader (patrols resolve one way or the
  // other). The contraband-scan consequence lives in patrol.ts.
  if (encounter.interceptor.kind === 'PATROL') {
    if (resolution === 'talked-down') {
      applyReputation(state, 'league', PATROL_TRIBUTE_LEAGUE_DELTA, 'patrol-tribute', events);
    } else if (
      resolution === 'escaped' ||
      resolution === 'defeated' ||
      resolution === 'interceptor-escaped'
    ) {
      applyReputation(state, 'league', PATROL_EVADED_LEAGUE_DELTA, 'patrol-evaded', events);
    }
  }

  if (resolution === 'escaped') {
    state.player.currentSystemId = encounter.pendingTravel.origin;
    return;
  }

  completePendingTravel(state, encounter, events);
}

/** T-106 bond hook: a bonded NPC drives the interceptor off at dusk — the
 *  encounter resolves before the dusk free attack and pending travel
 *  completes. Exposed for day.ts (endDay). */
export function resolveInterceptorFled(state: GameState, events: GameEvent[]): void {
  if (!state.encounter) return;
  resolveEncounter(state, state.encounter, events, 'interceptor-fled');
}

function applyEnemyPressure(
  state: GameState,
  encounter: EncounterState,
  rng: SeededRng,
  pressure: 'between-rounds' | 'day-end',
  events: GameEvent[],
): void {
  const round = encounter.round;
  const die = rng.d20();
  // N3 · `10 + defender GRIT`, from `combatRules.ts` — the same DC the cast is
  // shot at, so a future tweak cannot move one side without the other.
  const dc = interceptorPressureDc(state.player.stats);
  const result = check(die, encounter.interceptor.stats[Stat.GUNS], dc);

  events.push({
    type: 'StatCheck',
    actor: encounter.interceptor.name,
    stat: Stat.GUNS,
    dc,
    result,
  });
  events.push({
    type: 'EnemyCounterAction',
    encounterId: encounter.id,
    round,
    interceptorId: encounter.interceptor.id,
    pressure,
    check: result,
    success: result.success,
  });

  if (result.success) {
    // N3 · The damage rule now lives in `combatRules.ts` — ONE definition, called
    // both here and by the NPC's dusk encounter (`npc.ts` `resolveNpcEncounter`),
    // so the player and the cast cannot be shot at on different terms. The three
    // scaling terms (margin, tier gap, shields) and their full history are
    // documented at `applyInterceptorHit`; the component pick is still drawn only
    // now that the hit landed, so the miss stream stays byte-identical.
    const hit = applyInterceptorHit(
      state.player.ship,
      state.player.tier,
      encounter.interceptor.tier,
      result,
      rng,
    );
    const { component, previousCondition, newCondition, amount, mitigated } = hit;
    events.push({
      type: 'ComponentDamaged',
      encounterId: encounter.id,
      component,
      previousCondition,
      newCondition,
      amount,
      // Shields' visible consumption: how much of the raw hit they soaked. 0 for a
      // junker; a full absorb (amount === 0) emits amount 0 with mitigated === raw
      // so the wire can narrate the shields holding. READER: wire.ts + ui format.ts.
      mitigated,
    });

    if (hit.shipLost) {
      events.push({
        type: 'ShipLost',
        day: state.day,
        encounterId: encounter.id,
        interceptorId: encounter.interceptor.id,
        reason: 'combat-defeat',
        component,
      });
      // T-108: ShipLost is the trigger — succession resolves immediately while
      // the encounter still carries its origin (where the wreck is towed).
      events.push(
        ...applySuccession(state, {
          encounter,
          interceptorId: encounter.interceptor.id,
        }),
      );
      state.encounter = null;
      return;
    }
  }

  if (state.encounter) {
    state.encounter.round = round + 1;
  }
}

function continueEncounter(
  state: GameState,
  encounter: EncounterState,
  rng: SeededRng,
  events: GameEvent[],
): void {
  applyEnemyPressure(state, encounter, rng, 'between-rounds', events);
}

export function applyEncounterDuskPressure(state: GameState, rng: SeededRng): GameEvent[] {
  if (!state.encounter) return [];
  const events: GameEvent[] = [];
  applyEnemyPressure(state, state.encounter, rng, 'day-end', events);
  return events;
}

export function resolveCombat(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Combat' }>,
  rng: SeededRng,
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (!nextState.encounter) {
    throw new Error('Combat requires an active encounter');
  }

  if (action.targetId !== nextState.encounter.interceptor.id) {
    throw new Error('Combat target must be the active encounter interceptor');
  }

  if (action.spendDie === undefined) {
    throw new Error('Must spend a die for combat stance');
  }

  const { die, hand } = spendDie(nextState.player.dawnHand!, action.spendDie);
  nextState.player.dawnHand = hand;

  const encounter = nextState.encounter;
  const targetId = action.targetId;
  const dc = 10 + encounter.interceptor.tier;
  const fuelUsed =
    action.stance === 'run' ? RUN_FUEL_COST : action.stance === 'fight' ? FIGHT_FUEL_COST : 0;

  if (action.stance === 'run' && nextState.player.ship.fuel < RUN_FUEL_COST) {
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'run',
      fuelUsed: 0,
      success: false,
      insufficientFuel: true,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: 'run',
      continues: true,
      success: false,
      fuelUsed: 0,
      insufficientFuel: true,
    });
    continueEncounter(nextState, encounter, rng, events);
    return { state: nextState, events };
  }

  if (action.stance === 'fight' && nextState.player.ship.fuel < FIGHT_FUEL_COST) {
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed: 0,
      success: false,
      insufficientFuel: true,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: 'fight',
      continues: true,
      success: false,
      fuelUsed: 0,
      insufficientFuel: true,
    });
    continueEncounter(nextState, encounter, rng, events);
    return { state: nextState, events };
  }

  if (fuelUsed > 0) {
    nextState.player.ship.fuel -= fuelUsed;
  }

  // Talk is the credit-cost corner of the triangle: a deal always costs the
  // round's tribute (or a nat-20 waiver). Handled ahead of the generic check so
  // the flaw-refusal roll fires first (Repair A).
  if (action.stance === 'talk') {
    return resolveTalk(nextState, encounter, targetId, die, dc, rng, events);
  }

  // Run is an OPPOSED PILOT roll (T-1207) — handled in its own resolver so both
  // the player's break-off and the interceptor's pursuit emit a StatCheck.
  if (action.stance === 'run') {
    return resolveRun(nextState, encounter, targetId, die, fuelUsed, rng, events);
  }

  // Fight: a hit check against the tier DC (unchanged, T-1207 leaves it as-is).
  const result = check(die, nextState.player.stats[Stat.GUNS], dc);
  events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.GUNS, dc, result });

  if (result.success) {
    // T-1205 weapons → attack: a winning volley removes `weaponVolleyDamage` hull
    // points, not a flat 1. FOUNDATION DIVERGENCE — foundation (f2f95fa9) resolved
    // damage as weapon-power minus enemy-shield; the engine keeps the PRD hit-check
    // form and scales the damage a WIN deals by the player's weapons instead. A
    // junker (weapons score 1) removes 1 (unchanged); an upgraded gun removes more,
    // shortening time-to-kill. READER OF `weapons`: this line (components.ts).
    const enemyHull = Math.max(
      0,
      Math.max(1, encounter.enemyHull) - weaponVolleyDamage(nextState.player.ship),
    );
    encounter.enemyHull = enemyHull;
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'fight',
      fuelUsed,
      success: true,
      enemyHullRemaining: enemyHull,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: 'fight',
      continues: enemyHull > 0,
      success: true,
      fuelUsed,
    });

    if (enemyHull <= 0) {
      // T-1207 (PRD §7.4): a cracked-drive interceptor makes an OPPOSED PILOT
      // retreat check as it dies. The player is pressing the kill, so they carry
      // a RETREAT_KILL_EDGE — ordinary interceptors almost never slip a lost
      // fight, but a strong enemy roll (or a nat-20 "miracle burn") escapes them
      // ALIVE instead of being destroyed. Both actors emit a StatCheck so the
      // margin is on the wire; the enemy's rides actionContext 'retreat' → a
      // nat-20 becomes the miracle-burn wire story. FOUNDATION DIVERGENCE
      // (f2f95fa9): foundation had no post-kill enemy retreat.
      const enemyDie = rng.d20();
      const playerDie = rng.d20();
      const playerRetreatTotal = playerDie + nextState.player.stats[Stat.PILOT] + RETREAT_KILL_EDGE;
      const enemyRetreat = check(
        enemyDie,
        encounter.interceptor.stats[Stat.PILOT],
        playerRetreatTotal,
      );
      const playerPin = check(
        playerDie,
        nextState.player.stats[Stat.PILOT] + RETREAT_KILL_EDGE,
        enemyDie + encounter.interceptor.stats[Stat.PILOT],
      );
      events.push({
        type: 'StatCheck',
        actor: encounter.interceptor.name,
        stat: Stat.PILOT,
        dc: enemyRetreat.dc,
        result: enemyRetreat,
        actionContext: 'retreat',
      });
      events.push({
        type: 'StatCheck',
        actor: 'Player',
        stat: Stat.PILOT,
        dc: playerPin.dc,
        result: playerPin,
      });
      resolveEncounter(
        nextState,
        encounter,
        events,
        enemyRetreat.success ? 'interceptor-escaped' : 'defeated',
      );
    } else {
      continueEncounter(nextState, encounter, rng, events);
    }
    return { state: nextState, events };
  }

  // A missed volley (talk handled above, run extracted, a fight win returned
  // earlier): the shot goes wide, the enemy presses, and the round advances.
  events.push({
    type: 'CombatEvent',
    characterId: 'player',
    targetId,
    stance: 'fight',
    fuelUsed,
    success: false,
  });
  events.push({
    type: 'EncounterRound',
    encounterId: encounter.id,
    round: encounter.round,
    stance: 'fight',
    continues: true,
    success: false,
    fuelUsed,
  });
  continueEncounter(nextState, encounter, rng, events);

  return { state: nextState, events };
}

/**
 * Run resolution (T-1207, PRD §7.4 "your [14] +1 vs. his pursuit roll"). The
 * player's break-off is an OPPOSED PILOT roll against a fresh interceptor pursuit
 * d20 + its PILOT. BOTH actors emit a StatCheck — the player's (context-less →
 * classifies `nav` for the wire) and the interceptor's pursuit (actionContext
 * 'npc-combat' → the `combat` wire bucket, a hot-pursuit story). Each side's
 * check is framed against the OTHER's total so both carry a well-formed opposed
 * `margin` (the T-1202 margin surface), and the enemy's nat-20/nat-1 auto-flows
 * to the wire.
 *
 * Escape iff the player's opposed check succeeds: `check()` gives the player a
 * nat-20 auto-escape and a nat-1 auto-fail, otherwise player total >= enemy total
 * (ties break to the player). FOUNDATION DIVERGENCE (f2f95fa9): foundation ran NO
 * check on player break-off at all — `attemptRetreat` unconditionally returned
 * success (there was no PILOT stat in foundation; drive power only decided whether
 * the ENEMY chased afterward). The PRD turns the player's own break-off into an
 * opposed PILOT roll, so a run can now fail. (The pre-T-1207 engine's flat-DC
 * PILOT check was itself an engine invention, never a foundation rule.)
 *
 * rng NOTE: the enemy pursuit d20 is drawn here, BEFORE any `continueEncounter`
 * pressure draw, on EVERY run (both StatChecks are always emitted). This shifts
 * downstream rng streams for scenarios that run — that stream shift is T-1207's
 * declared fixture fallout.
 */
function resolveRun(
  state: GameState,
  encounter: EncounterState,
  targetId: string,
  die: number,
  fuelUsed: number,
  rng: SeededRng,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const playerPilot = state.player.stats[Stat.PILOT];
  const enemyPilot = encounter.interceptor.stats[Stat.PILOT];

  const enemyPursuitDie = rng.d20();
  const playerTotalBase = die + playerPilot;
  const enemyTotalBase = enemyPursuitDie + enemyPilot;

  const playerRun = check(die, playerPilot, enemyTotalBase);
  const enemyPursuit = check(enemyPursuitDie, enemyPilot, playerTotalBase);

  events.push({
    type: 'StatCheck',
    actor: 'Player',
    stat: Stat.PILOT,
    dc: playerRun.dc,
    result: playerRun,
  });
  events.push({
    type: 'StatCheck',
    actor: encounter.interceptor.name,
    stat: Stat.PILOT,
    dc: enemyPursuit.dc,
    result: enemyPursuit,
    actionContext: 'npc-combat',
  });

  events.push({
    type: 'CombatEvent',
    characterId: 'player',
    targetId,
    stance: 'run',
    fuelUsed,
    success: playerRun.success,
  });

  if (playerRun.success) {
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round: encounter.round,
      stance: 'run',
      continues: false,
      success: true,
      fuelUsed,
    });
    resolveEncounter(state, encounter, events, 'escaped');
    return { state, events };
  }

  events.push({
    type: 'EncounterRound',
    encounterId: encounter.id,
    round: encounter.round,
    stance: 'run',
    continues: true,
    success: false,
    fuelUsed,
  });
  continueEncounter(state, encounter, rng, events);
  return { state, events };
}

/** Talk resolution: tribute always has a price. See Repair A for the full
 *  decision table (flaw refusal → nat-20 waiver → pay → unaffordable → refuse). */
function resolveTalk(
  state: GameState,
  encounter: EncounterState,
  targetId: string,
  die: number,
  dc: number,
  rng: SeededRng,
  events: GameEvent[],
): { state: GameState; events: GameEvent[] } {
  const round = encounter.round;
  // T-1207: the demand is class-scaled (Brigand ÷2, Reptiloid ×2). Anonymous
  // interceptors carry `kind`; named ones do not (→ ×1). T-1603c: it is ALSO
  // scaled by how many tiers the interceptor outranks the player
  // (TRIBUTE_TIER_GAP_STEP, content) — an interceptor holding the stronger hand
  // prices accordingly. The margin discount (below) still applies on top;
  // TributeDemanded.amount reports this fully scaled demand.
  const amount = tributeForRound(
    round,
    encounter.interceptor.kind,
    encounter.interceptor.tier - state.player.tier,
  );

  // T-1204 (PRD §6 "they remember"; the unbuilt v0.1 T-104 "this is personal"
  // Rattlesnake beat): the tribute/talk DC gains a relationship term. A named
  // interceptor the player has WRONGED is harder to buy off (grudge → higher DC);
  // one the player has WON OVER cuts a deal (favor → lower DC). Anonymous
  // interceptors carry no standing (default 0), so their DC is unchanged.
  // FOUNDATION DIVERGENCE — foundation (f2f95fa9) tribute/combat DC carried no
  // relationship term (extends the T-104 note). Scoped to TALK only (the PRD-
  // literal reading: "buying him off is a TRADE check … his Flaw makes the DC
  // brutal") so the run/fight DC — and their goldens — are untouched.
  const interceptorDisposition =
    encounter.interceptor.source === 'named'
      ? (state.npcs.find((npc) => npc.id === encounter.interceptor.id)?.disposition ?? 0)
      : 0;
  const talkDc = dc - TALK_DC_PER_DISPOSITION * interceptorDisposition;

  // 1. Flaw refusal FIRST: some interceptors want blood, not credits. Talking
  //    cannot resolve — the enemy presses on and the tribute escalates.
  if (interceptorRefusesTribute(encounter.interceptor, rng, events)) {
    const affordable = state.player.credits >= amount;
    events.push({
      type: 'CombatEvent',
      characterId: 'player',
      targetId,
      stance: 'talk',
      fuelUsed: 0,
      success: false,
    });
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: true,
      affordable,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: true,
      success: false,
      fuelUsed: 0,
    });
    continueEncounter(state, encounter, rng, events);
    return { state, events };
  }

  // 2. Talk stat check — against the disposition-adjusted DC.
  const result = check(die, state.player.stats[Stat.TRADE], talkDc);
  events.push({ type: 'StatCheck', actor: 'Player', stat: Stat.TRADE, dc: talkDc, result });
  const affordable = state.player.credits >= amount;
  events.push({
    type: 'CombatEvent',
    characterId: 'player',
    targetId,
    stance: 'talk',
    fuelUsed: 0,
    success: result.success,
  });

  // Natural 20: the interceptor waves you through free of charge.
  if (result.nat20) {
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: false,
      affordable,
      waived: true,
    });
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: false,
      success: true,
      fuelUsed: 0,
    });
    resolveEncounter(state, encounter, events, 'talked-down');
    return { state, events };
  }

  // Non-nat-20 success: the interceptor accepts this round's tribute.
  if (result.success) {
    // T-1202 (PRD §6 "the margin decides how well it goes"): the DEMAND stays the
    // round schedule `amount`, but a stronger talk-down SHAVES what is actually
    // handed over — 5% off per point of margin. FOUNDATION DIVERGENCE — foundation
    // (f2f95fa9) paid the full demanded tribute with no margin discount. The
    // TributeDemanded.amount still reports the demand; affordability + the actual
    // deduction + TributePaid.amount all use the discounted `paid`.
    const paid = Math.max(1, Math.floor(amount * (1 - 0.05 * Math.max(0, result.margin))));
    const canAfford = state.player.credits >= paid;
    events.push({
      type: 'TributeDemanded',
      encounterId: encounter.id,
      round,
      amount,
      refused: false,
      affordable: canAfford,
    });

    if (canAfford) {
      state.player.credits -= paid;
      events.push({
        type: 'TributePaid',
        encounterId: encounter.id,
        round,
        amount: paid,
        creditsRemaining: state.player.credits,
      });
      // T-106 disposition: a named interceptor who got paid remembers the
      // easy mark fondly. Delta is content data (T-1204 DISPOSITION_DELTAS).
      if (encounter.interceptor.source === 'named') {
        applyDisposition(
          state,
          encounter.interceptor.id,
          DISPOSITION_DELTAS.tribute,
          'tribute',
          events,
        );
      }
      events.push({
        type: 'EncounterRound',
        encounterId: encounter.id,
        round,
        stance: 'talk',
        continues: false,
        success: true,
        fuelUsed: 0,
      });
      resolveEncounter(state, encounter, events, 'talked-down');
      return { state, events };
    }

    // Deal struck but the tank of credits is empty — no payment, encounter runs on.
    events.push({
      type: 'EncounterRound',
      encounterId: encounter.id,
      round,
      stance: 'talk',
      continues: true,
      success: true,
      fuelUsed: 0,
    });
    continueEncounter(state, encounter, rng, events);
    return { state, events };
  }

  // Failure: they refuse to bargain this round — no tribute is demanded, and the
  // price escalates for the next attempt.
  events.push({
    type: 'EncounterRound',
    encounterId: encounter.id,
    round,
    stance: 'talk',
    continues: true,
    success: false,
    fuelUsed: 0,
  });
  continueEncounter(state, encounter, rng, events);
  return { state, events };
}
