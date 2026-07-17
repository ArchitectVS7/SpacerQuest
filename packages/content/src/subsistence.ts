/**
 * Subsistence floor — DATA for the PRD's poverty-trap safeguard, consumed by the
 * engine (day.ts endDay). PRD-REIMAGINED §"Scarcity of choices, never a poverty
 * trap": "no actor in the simulation, player or cast, gets permanently trapped at
 * zero with no move left. And the world provides floors: NPCs work odd jobs and
 * small income." This is DESIGN LAW — scarcity is allowed to bite, but never to
 * strand.
 *
 * The gap this closes (T-1604, surfaced by the seed-77 campaign sweep): a captain
 * could maroon itself at an isolated rim system with 0 credits AND a tank too low
 * to afford ANY jump out — the cheapest hop from a rim corner costs ~180 fuel, so
 * once credits hit 0 and the tank drains below that, there is no legal move that
 * changes the state. Every dusk the ship just Waits while the unpaid Guild marker
 * (GUILD_DEBT_DAILY_RATE) compounds unchecked. The debt-as-ledger law kept credits
 * non-negative, but the SHIP was still stranded — the exact "trapped at zero with
 * no move left" the design law forbids.
 *
 * The floor: when — and ONLY when — the captain is genuinely stranded (broke and
 * unable to fund even the cheapest jump out of the current system, engine
 * `isStranded`), the dockside provides a small odd-job wage each dusk. Over a
 * bounded run of dusks the captain accrues enough to buy the fuel for a jump and
 * fly on — a bad run makes a *slower, poorer* game (you feel every stranded day),
 * never a dead one. It is a FLOOR, not an income: the stranded predicate gates it,
 * so a solvent or mobile captain never sees a credit of it and no golden shifts.
 *
 * FOUNDATION (f2f95fa9): foundation has no subsistence/odd-job mechanic — it never
 * needed one because its capped fuel cost (a flat 50/jump ≥ distance 8) could not
 * strand a ship the way the T-1102 per-distance cost can. This constant is
 * engine-original tuning, sanctioned to live here per the TECH-STACK "balance
 * numbers are data" constraint (same justification as guild.ts / lending.ts).
 *
 * READER: the per-dusk subsistence grant in `packages/engine/src/day.ts` endDay
 * (guarded on `isStranded`). Surfaced to the player as a credit bump + a WireEntry
 * ("You work the docks…") on the Galactic News Wire (format.ts wireLines) — the
 * same wire-only surface the Guild interest accrual uses.
 */

/**
 * Odd-job wage credited each dusk the captain is stranded (broke + cannot fund the
 * cheapest jump out). Sized so recovery from a dry-tank rim-corner strand is a real
 * grind but strictly bounded: the cheapest rim jump is ~180 fuel and rim fuel runs
 * ~8/unit (~1,440 credits), so a stranded captain climbs back to a jump in roughly
 * a dozen dusks — scarcity biting hard without stranding. Deliberately far below
 * any contract payout, so working the docks is never a strategy, only a lifeline.
 */
export const SUBSISTENCE_STIPEND = 250;
