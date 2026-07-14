import {
  FLAWS,
  Stat,
  RUN_FUEL_COST,
  FIGHT_FUEL_COST,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_MAX,
  TRIBUTE_CLASS_MULTIPLIER,
  RETREAT_KILL_EDGE,
  DISPOSITION_DELTAS,
  TALK_DC_PER_DISPOSITION,
  AnonymousInterceptorKind,
} from '@spacerquest/content';
import { GameState, GameEvent, PlayerAction, EncounterState, ShipComponentId } from '../types.js';
import { SeededRng } from '../rng.js';
import { check, spendDie } from '../dice.js';
import { completePendingTravel } from './travel.js';
import { applyDisposition } from '../npc.js';
import { applySuccession } from '../legacy.js';
import { shieldMitigation, weaponVolleyDamage } from '../components.js';

// Combat balance numbers are data — sourced from @spacerquest/content
// (see packages/content/src/combat.ts for values, foundation citation, and the
// intentional round-cap divergence). Re-exported here so existing engine/sim
// importers of these names keep resolving through the engine surface.
export { RUN_FUEL_COST, FIGHT_FUEL_COST, TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX };

const DAMAGE_COMPONENTS: readonly ShipComponentId[] = [
  'shields',
  'drives',
  'weapons',
  'hull',
  'navigation',
  'lifeSupport',
  'robotics',
  'cabin',
];

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

/**
 * T-1207: the demanded tribute for a round, scaled by the interceptor's CLASS.
 * The base round schedule (min(round·base, max)) is multiplied by the class
 * modifier (TRIBUTE_CLASS_MULTIPLIER — Brigand ÷2, Reptiloid ×2, everyone else
 * ×1) and re-capped at TRIBUTE_MAX. Anonymous interceptors carry a `kind`; named
 * interceptors do not, so they take the unmodified ×1 schedule. Exported for the
 * acceptance test (per-class demand) — T-1401 will re-export it through the UI
 * pack.
 */
export function tributeForRound(round: number, kind?: AnonymousInterceptorKind): number {
  const base = Math.min(round * TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX);
  const mult = kind ? TRIBUTE_CLASS_MULTIPLIER[kind] : 1;
  return Math.min(TRIBUTE_MAX, Math.floor(base * mult));
}

function enemyRefusesTribute(
  encounter: EncounterState,
  rng: SeededRng,
  events: GameEvent[],
): boolean {
  const flaw = encounter.interceptor.flaw;
  if (!flaw) return false;

  const flawDef = FLAWS[flaw];
  if (!flawDef || !flawDef.refusesTribute) return false;

  const dc = encounter.interceptor.flawDc ?? 10;
  const die = rng.d20();
  const resisted = die >= dc;
  events.push({
    type: 'FlawCheck',
    npcId: encounter.interceptor.id,
    flaw,
    die,
    dc,
    resisted,
  });
  return !resisted;
}

/**
 * T-1205 seeded damage targeting. Replaces the old deterministic
 * `(round - 1) % 8` rotation, under which hull could only ever be struck on rounds
 * 4, 12, 20, … — so a never-miss interceptor needed 68 rounds to kill a
 * full-condition hull, and `ComponentDamaged` on the other components was pure
 * theatre. A uniform seeded pick makes EVERY component (hull included) reachable
 * on ANY round. FOUNDATION DIVERGENCE — foundation (f2f95fa9) resolved enemy
 * vandalism against a fixed cascade order (shields→cabin→nav→…→hull); the engine
 * uses a flat seeded pick so the property "hull is damageable on any round" holds
 * without threading cascade state through the encounter. The draw is taken ONLY on
 * a successful hit (after the d20 check) so the miss stream — and every existing
 * golden that turns on a missed pressure roll — is byte-identical.
 */
function damageComponentForHit(rng: SeededRng): ShipComponentId {
  const index = Math.floor(rng.next() * DAMAGE_COMPONENTS.length);
  return DAMAGE_COMPONENTS[index] ?? 'hull';
}

function resolveEncounter(
  state: GameState,
  encounter: EncounterState,
  events: GameEvent[],
  resolution: 'escaped' | 'talked-down' | 'defeated' | 'interceptor-fled' | 'interceptor-escaped',
): void {
  events.push({
    type: 'EncounterResolved',
    encounterId: encounter.id,
    resolution,
    round: encounter.round,
    interceptorId: encounter.interceptor.id,
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
  const dc = 10 + state.player.stats[Stat.GRIT];
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
    // T-1205: the struck component is a seeded pick (hull reachable on any round),
    // drawn only now that the hit landed so misses don't perturb the rng stream.
    const component = damageComponentForHit(rng);
    const target = state.player.ship[component];
    const previousCondition = target.condition;
    // T-1202 (PRD §6 "the margin decides how well it goes"): a clean interceptor
    // hit bites deeper. A natural 20 removes 3 condition, a big-margin (>=10) hit
    // 2, an ordinary hit the base 1. FOUNDATION DIVERGENCE — foundation (f2f95fa9)
    // resolved enemy damage as a flat vandalism roll with no d20 margin; the
    // margin scaling is new. The >=10 threshold is deliberately out of reach for
    // the low-GUNS rank-and-file (margin = die + interceptorGUNS - (10+playerGRIT)),
    // so ordinary interceptors still chip 1/round; only strong guns or a nat-20
    // land the deeper hit.
    const raw = result.nat20 ? 3 : result.margin >= 10 ? 2 : 1;
    // T-1205 shields → mitigation: the player's shields absorb condition off the
    // incoming hit. A junker (shields score 1) mitigates 0, so the raw damage is
    // unchanged; upgraded shields subtract more, capped by the raw hit so a nat-20
    // (raw 3) still penetrates strong shields for at least (3 - mitigation). This
    // is what makes "upgraded shields reduce damage taken" true, and keeps the hull
    // killable. READER OF `shields`: this line (via components.ts shieldMitigation).
    const mitigated = Math.min(raw, shieldMitigation(state.player.ship));
    const dmg = raw - mitigated;
    target.condition = Math.max(0, target.condition - dmg);
    events.push({
      type: 'ComponentDamaged',
      encounterId: encounter.id,
      component,
      previousCondition,
      newCondition: target.condition,
      amount: previousCondition - target.condition,
      // Shields' visible consumption: how much of the raw hit they soaked. 0 for a
      // junker; a full absorb (dmg === 0) emits amount 0 with mitigated === raw so
      // the wire can narrate the shields holding. READER: wire.ts + ui format.ts.
      mitigated,
    });

    if (component === 'hull' && target.condition === 0) {
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
  // interceptors carry `kind`; named ones do not (→ ×1). The margin discount
  // (below) still applies on top; TributeDemanded.amount reports this scaled demand.
  const amount = tributeForRound(round, encounter.interceptor.kind);

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
  if (enemyRefusesTribute(encounter, rng, events)) {
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
