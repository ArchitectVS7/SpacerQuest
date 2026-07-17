/**
 * T-1503 · Alliance reputation tuning — DATA, consumed by the engine's reputation
 * movers, the questline storylet triggers/effects, and the UI standing readout
 * (PRD §8.1 "your reputation … good and bad"; §2 the four galactic powers).
 *
 * FOUNDATION (f2f95fa9): the foundation carries the four galactic powers as SETTING
 * (User-Manual lore — the Astro League, the Space Dragons, the Warlord Confederation,
 * the Rebel Alliance) but NO reputation MECHANIC — standing with a faction was never
 * a tracked number. So there is no foundation NUMBER to preserve or diverge from:
 * every constant here is Rimward-authored, ENGINE-ORIGINAL tuning, sanctioned to
 * live as data per the TECH-STACK "balance numbers are data" constraint. It carries
 * the same INTERIM header as ports.ts / lending.ts: OWNED BY the T-1603 balance pass,
 * do NOT enshrine as canonical — rep pacing is a tuning lever.
 *
 * READERS:
 *   - the organic movers (engine `reputation.ts` `applyReputation`, called from
 *     `actions/combat.ts` resolveEncounter, `actions/patrol.ts` the contraband
 *     scan, and `actions/port.ts` resolvePortPurchase);
 *   - the questline storylet triggers (engine `triggerMatches` `reputation` gate)
 *     and effects (engine `applyEffects` `reputation` effect), authored in
 *     `storylets.ts` as the four `alliance.*` chains;
 *   - the succession carry (engine `legacy.ts` — carried wholesale, like debt/ports);
 *   - the UI standing readout (`packages/ui/src/format.ts` `factionStanding`).
 */

/** The four galactic powers a spacer holds standing with. This is the SINGLE id
 *  source: `ports.ts` aliases its `PortAlliance` to this union so a port's
 *  `alliance` tag and a rep faction id can never drift. */
export const FACTION_IDS = ['league', 'dragons', 'confederation', 'rebels'] as const;

/** A galactic-power id — one of {@link FACTION_IDS}. */
export type FactionId = (typeof FACTION_IDS)[number];

/** Display labels for the UI standing readout (`factionStanding`). Data, not logic. */
export const FACTION_LABELS: Record<FactionId, string> = {
  league: 'Astro League',
  dragons: 'Space Dragons',
  confederation: 'Warlord Confederation',
  rebels: 'Rebel Alliance',
};

/**
 * Reputation clamp band. Wider than the disposition band ([-10,10]) on purpose: the
 * organic movers nudge by ±1..±5, and the questlines gate on small thresholds
 * (gte 3 / gte 6), so a [-100,100] band lets those nudges ACCUMULATE toward
 * meaningful standing without saturating in a handful of events. Reader: engine
 * `reputation.ts` `applyReputation` (the only clamp site). INTERIM (T-1603).
 */
export const REPUTATION_MIN = -100;
export const REPUTATION_MAX = 100;

/**
 * Organic-play reputation deltas. Each names its engine reader. The Astro League IS
 * the law/patrol power, so cooperating with a patrol checkpoint (paying its tribute)
 * warms the League while fighting or running from one cools it; getting caught
 * smuggling brands you with the law (League−) and burnishes you with the frontier
 * (Rebel+). INTERIM (T-1603 balance pass) — signs are the design call, magnitudes
 * are tuning.
 */
/** League warms when a PATROL interceptor's tribute is PAID (checkpoint complied
 *  with). Reader: `actions/combat.ts` resolveEncounter, a talked-down PATROL. */
export const PATROL_TRIBUTE_LEAGUE_DELTA = 2;
/** League cools when a PATROL interceptor is FOUGHT or FLED (the law defied).
 *  Reader: `actions/combat.ts` resolveEncounter, an escaped/defeated PATROL. This
 *  is the mover that makes League rep near-unavoidably nonzero for a travelling
 *  trader (patrol encounters resolve one way or the other). */
export const PATROL_EVADED_LEAGUE_DELTA = -1;
/** League cools when a patrol GUILE scan CATCHES the player smuggling. Reader:
 *  `actions/patrol.ts` `applyPatrolContrabandScan` caught path. */
export const SMUGGLING_CAUGHT_LEAGUE_DELTA = -3;
/** The frontier (Rebels) warms toward a spacer the law caught smuggling. Reader:
 *  `actions/patrol.ts` `applyPatrolContrabandScan` caught path. */
export const SMUGGLING_CAUGHT_REBEL_DELTA = 2;
/** Extra Rebel warmth when the caught smuggler already carries Smuggler Ray's fence
 *  reputation (the `fence.ray.dealt` flag — the deferral named at contraband.ts:37):
 *  a known fence-dealer the law caught is frontier folk hero. Reader:
 *  `actions/patrol.ts` caught path when `FENCE_REP_FLAG` is set. */
export const FENCE_REP_REBEL_DELTA = 2;
/** The aligned faction warms when the player buys a controlling stake in one of its
 *  ports (the `alliance` tag / Warlord-Confederation reader named at ports.ts).
 *  Reader: `actions/port.ts` resolvePortPurchase, via the bought port's `alliance`. */
export const PORT_PURCHASE_ALLIANCE_DELTA = 5;

/**
 * The cross-faction consequence of COMMITTING to an alliance (the terminal
 * questline episode's "join" choice). Own faction gains a large bump (authored on
 * the questline effect itself); each of the OTHER THREE drops by this magnitude —
 * you cannot swear to one power without cooling the rest. Applied as a negative
 * `reputation` storylet effect on the ep3 commit choice. Reader: engine
 * `applyEffects` `reputation` effect. INTERIM (T-1603).
 */
export const FACTION_JOIN_CROSS_PENALTY = 5;
/** Own-faction standing granted by the terminal "join" choice (the +large half of
 *  the cross-faction shift). Authored on the ep3 commit `reputation` effect. */
export const FACTION_JOIN_OWN_BONUS = 8;
