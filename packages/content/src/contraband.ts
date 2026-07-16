// T-1305 · Contraband & smuggling tuning data (content-as-data).
//
// FOUNDATION DIVERGENCE (rules of record f2f95fa9): the foundation ruleset has
// NO contraband-scan / smuggling-consequence rule at all — carrying illicit
// cargo through a patrol was a pure upside. Every constant here is therefore
// T-1305-original, authored to PRD §7.2 ("patrol captains roll GUILE checks
// against smugglers") and §7.5 (Smuggler Ray as the fence "third out"). There
// is no foundation number to diverge FROM; these are new-rule tunables, not an
// override of an existing figure.
//
// These live as data (never logic) so the engine scan in
// packages/engine/src/actions/patrol.ts reads them and content/engine cannot
// drift on the shared fence-rep flag string.

/**
 * Flat credit fine levied when a patrol GUILE scan catches the player carrying
 * illicit cargo. Sized ABOVE the derelict sealed pod's +300cr reward
 * (storylets.ts `derelict.sealed-pod`) so a realized catch can net-negative the
 * "take it" choice — this is what dismantles the strictly-dominant pod grab.
 * Reader: `applyPatrolContrabandScan` (engine actions/patrol.ts) caught path.
 */
export const CONTRABAND_FINE = 500;

/**
 * Points subtracted from the player's concealment (effective GUILE) once the
 * fence-rep flag `fence.ray.dealt` is set. PRD §7.5: dealing with Ray leaves "a
 * reputation flag that never fully washes out" — a known smuggler draws harder
 * scans. Lowering concealment lowers the scan DC, so patrols catch a fence-rep
 * player measurably more often (the A/B acceptance). Sized to move the catch
 * rate visibly at typical GUILE values.
 * Reader: `applyPatrolContrabandScan` DC computation.
 */
export const CONTRABAND_FENCE_REP_SCAN_PENALTY = 4;

/**
 * Grudge (disposition delta) applied to a NAMED patrol interceptor that catches
 * the player. Anonymous patrols have no persistent NPC to attach to — faction /
 * patrol-standing rep is explicitly deferred to T-1503, so no unread faction
 * flag is invented here.
 * Reader: existing per-NPC disposition readers (encounter weighting + talk DC)
 * via `applyDisposition` in engine actions/patrol.ts.
 */
export const CONTRABAND_CAUGHT_DISPOSITION = -3;

/**
 * The shared fence-rep flag string. Set by the Smuggler Ray fence storylets
 * (storylets.ts) and READ by the patrol scan DC (engine actions/patrol.ts,
 * T-1305) AND by T-1503's Rebel reputation (PRD §117 "Sell out Smuggler Ray…").
 * Imported by the engine scan so the two sides can't drift; the storylet DATA
 * literals reference the literal 'fence.ray.dealt' (data can't reference a
 * const) with a comment pointing here.
 */
export const FENCE_REP_FLAG = 'fence.ray.dealt';

/**
 * What Smuggler Ray pays to fence the sealed derelict pod. Set ABOVE the +300cr
 * "take it" value so fencing is a genuine alternative out (PRD §7.5 third out),
 * not a strictly-worse one.
 * Reader: the `fence.ray.sealed-pod` storylet credits effect (storylets.ts).
 */
export const CONTRABAND_POD_FENCE_PRICE = 350;
