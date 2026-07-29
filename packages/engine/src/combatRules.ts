import {
  AnonymousInterceptorKind,
  BIG_HIT_MARGIN,
  FLAWS,
  HULL_DAMAGE_WEIGHT,
  Stat,
  StatBlock,
  SYSTEM_DAMAGE_WEIGHT,
  TIER_GAP_DAMAGE_BONUS,
  TRIBUTE_BASE_MULTIPLIER,
  TRIBUTE_CLASS_MULTIPLIER,
  TRIBUTE_MAX,
  TRIBUTE_TIER_GAP_STEP,
} from '@spacerquest/content';
import { shieldMitigation } from './components.js';
import { SeededRng } from './rng.js';
import {
  CheckResult,
  EncounterInterceptorState,
  GameEvent,
  ShipComponentId,
  ShipState,
} from './types.js';

/**
 * N3 · THE COMBAT RULES NEITHER SIDE OWNS.
 *
 * This module exists because of the standing constraint: *"Where an NPC cannot use
 * the engine's own function today, the fix is to make the function usable by both
 * (give it an actor parameter), never to write the NPC a private one."* R2c is the
 * standing warning — the sim kept a private copy of the yard ladder that had
 * inherited the same bug as the engine, so it agreed with the engine FOR THE WRONG
 * REASON and hid a live economy defect for months.
 *
 * The rules below were previously inlined inside `actions/combat.ts`
 * `applyEnemyPressure`, reachable only through the player's `state.player.*`. They
 * are now here, in a module that imports NEITHER `actions/combat.ts` NOR `npc.ts`,
 * so both callers reach one definition:
 *   · the player's multi-round encounter (`actions/combat.ts`), and
 *   · the NPC's one-tick dusk encounter (`npc.ts` `resolveNpcEncounter`).
 *
 * WHY A NEW FILE and not an export from `actions/combat.ts`: `actions/combat.ts`
 * already imports `../npc.js` (for `applyDisposition`), so `npc.ts` importing it
 * back would close a cycle. A neutral module is also the honest home for a rule
 * that belongs to the GAME rather than to either actor.
 *
 * Everything here is a total function of its arguments plus content tuning — the
 * only impurity is the explicit `rng` a caller passes in.
 */

/** The eight damageable ship components, in the order the weighted pick walks. */
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

/**
 * T-1205 / T-1603c · Which component a landed interceptor hit strikes.
 *
 * MOVED HERE UNCHANGED by N3 (it was private to `actions/combat.ts`). The history
 * is load-bearing and must not be re-derived: T-1205 replaced a deterministic
 * `(round - 1) % 8` rotation under which hull could only be struck on rounds 4,
 * 12, 20 … — so a never-miss interceptor needed 68 rounds to kill a full-condition
 * hull. T-1603c then WEIGHTED the pick (`HULL_DAMAGE_WEIGHT` /
 * `SYSTEM_DAMAGE_WEIGHT`) because the flat 1-in-8 made the killing blow
 * arithmetically unreachable: the sweep measured ONE combat defeat in 34,000+
 * encounters (`docs/balance/BASELINE-T-1603a.md` §4).
 *
 * CONSUMES ONE RNG DRAW, and callers must take it ONLY after the hit check has
 * already succeeded — the miss stream stays byte-identical that way, which is what
 * keeps every existing golden that turns on a missed pressure roll unmoved.
 */
export function damageComponentForHit(rng: SeededRng): ShipComponentId {
  const total =
    HULL_DAMAGE_WEIGHT + SYSTEM_DAMAGE_WEIGHT * Math.max(0, DAMAGE_COMPONENTS.length - 1);
  let roll = rng.next() * total;
  for (const id of DAMAGE_COMPONENTS) {
    roll -= id === 'hull' ? HULL_DAMAGE_WEIGHT : SYSTEM_DAMAGE_WEIGHT;
    if (roll < 0) return id;
  }
  return 'hull';
}

/**
 * N3 · The DC an interceptor's pressure roll is made against — `10 + the
 * defender's GRIT`. One definition, because the player's `applyEnemyPressure` and
 * the NPC's dusk encounter must be shot at on the same terms; a second copy of
 * `10 + …` is exactly the drift R2c warns about.
 */
export function interceptorPressureDc(defenderStats: StatBlock): number {
  return 10 + defenderStats[Stat.GRIT];
}

/** What a landed interceptor hit did to the defender's ship. */
export interface InterceptorHitOutcome {
  component: ShipComponentId;
  previousCondition: number;
  newCondition: number;
  /** Condition actually removed, after shields. */
  amount: number;
  /** How much of the raw hit the defender's shields soaked — 0 for a junker. */
  mitigated: number;
  /** The hull reached condition 0: this defender has lost their ship. */
  shipLost: boolean;
}

/**
 * N3 · APPLY ONE LANDED INTERCEPTOR HIT to a defender's ship. The single
 * definition of the damage rule; both the player's encounter and an NPC's call it.
 *
 * The three scaling terms, each with its own history — none of them is to be
 * re-derived at a call site:
 *
 * 1. **MARGIN (T-1202, PRD §6 "the margin decides how well it goes").** A natural
 *    20 removes 3 condition, a big-margin (>= `BIG_HIT_MARGIN`) hit 2, an ordinary
 *    hit 1. FOUNDATION DIVERGENCE — foundation (f2f95fa9) resolved enemy damage as
 *    a flat vandalism roll with no d20 margin. `BIG_HIT_MARGIN` is deliberately
 *    out of reach for the low-GUNS rank-and-file, so ordinary interceptors chip the
 *    base amount and only strong guns or a nat-20 land the deeper hit.
 *
 * 2. **TIER GAP (T-1603c).** An interceptor that OUTRANKS the defender adds
 *    `TIER_GAP_DAMAGE_BONUS` per tier of gap. Added BEFORE mitigation is
 *    subtracted ON PURPOSE: the extra is exactly what upgraded shields eat, so
 *    preparation pays off most when the defender is outgunned (memo §11, Flag 3).
 *    Consumes no rng.
 *
 * 3. **SHIELDS (T-1205).** `shieldMitigation(ship)` is subtracted, capped by the
 *    raw hit, so a nat-20 (raw 3) still penetrates strong shields for at least
 *    (3 - mitigation) and the hull stays killable. This line is the named READER
 *    of `shields`.
 *
 * MUTATES `ship`: the struck component's condition drops. Callers own the events —
 * the player emits `ComponentDamaged`/`ShipLost` against `state`, an NPC emits its
 * own — because the two actors narrate differently even though the rule is one.
 *
 * CONSUMES ONE RNG DRAW (the component pick). Call only after the hit landed.
 */
export function applyInterceptorHit(
  ship: ShipState,
  defenderTier: number,
  interceptorTier: number,
  result: CheckResult,
  rng: SeededRng,
): InterceptorHitOutcome {
  const component = damageComponentForHit(rng);
  const target = ship[component];
  const previousCondition = target.condition;
  const tierGap = Math.max(0, interceptorTier - defenderTier);
  const raw =
    (result.nat20 ? 3 : result.margin >= BIG_HIT_MARGIN ? 2 : 1) + TIER_GAP_DAMAGE_BONUS * tierGap;
  const mitigated = Math.min(raw, shieldMitigation(ship));
  target.condition = Math.max(0, target.condition - (raw - mitigated));
  return {
    component,
    previousCondition,
    newCondition: target.condition,
    amount: previousCondition - target.condition,
    mitigated,
    shipLost: component === 'hull' && target.condition === 0,
  };
}

/**
 * T-1207 · The demanded tribute for a round, scaled by the interceptor's CLASS.
 *
 * MOVED HERE by N3 from `actions/combat.ts` (which re-exports it, so every existing
 * importer — including the engine barrel and the UI's tribute preview — keeps
 * resolving the same symbol). It moved because the cast now pays tribute too, and
 * `actions/combat.ts` cannot be imported from `npc.ts` without closing a cycle.
 *
 * The base round schedule (min(round·base, max)) is multiplied by the class modifier
 * (TRIBUTE_CLASS_MULTIPLIER — Brigand ÷2, Reptiloid ×2, everyone else ×1) and
 * re-capped at TRIBUTE_MAX. Anonymous interceptors carry a `kind`; named
 * interceptors do not, so they take the unmodified ×1 schedule.
 *
 * T-1603c `tierGap` — how many TIERS the interceptor outranks the flier by (0 or
 * negative when the flier outranks, which costs nothing extra): TRIBUTE_TIER_GAP_STEP
 * per tier of gap, applied alongside the class modifier and re-capped. Tribute is
 * ~95% of an unprepared encounter's credit cost, so this is the lever that actually
 * moves the parity axis of the balance table. Defaults to 0 so every existing caller
 * keeps its exact schedule. Consumes no rng.
 */
export function tributeForRound(
  round: number,
  kind?: AnonymousInterceptorKind,
  tierGap = 0,
): number {
  const base = Math.min(round * TRIBUTE_BASE_MULTIPLIER, TRIBUTE_MAX);
  const mult = kind ? TRIBUTE_CLASS_MULTIPLIER[kind] : 1;
  const gapMult = 1 + TRIBUTE_TIER_GAP_STEP * Math.max(0, tierGap);
  return Math.min(TRIBUTE_MAX, Math.floor(base * mult * gapMult));
}

/**
 * Does this interceptor's FLAW slam the tribute door?
 *
 * MOVED HERE by N3 (it was private to `actions/combat.ts`) and re-shaped to take the
 * interceptor rather than the whole encounter, because an NPC's dusk interdiction has
 * no `EncounterState` to hand it. A flaw that `refusesTribute` gets a d20 vs the
 * character's own `flawDc`; failing to resist means "this is personal" and no amount
 * of money ends the fight. PRD §7.4's Rattlesnake beat, and it now closes the same
 * door on a captain that it closes on the player.
 *
 * CONSUMES ONE RNG DRAW, and only when the interceptor actually carries a
 * tribute-refusing flaw — so an interceptor without one perturbs no stream.
 */
export function interceptorRefusesTribute(
  interceptor: EncounterInterceptorState,
  rng: SeededRng,
  events: GameEvent[],
): boolean {
  const flaw = interceptor.flaw;
  if (!flaw) return false;

  const flawDef = FLAWS[flaw];
  if (!flawDef || !flawDef.refusesTribute) return false;

  const dc = interceptor.flawDc ?? 10;
  const die = rng.d20();
  const resisted = die >= dc;
  events.push({ type: 'FlawCheck', npcId: interceptor.id, flaw, die, dc, resisted });
  return !resisted;
}
