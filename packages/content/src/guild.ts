/**
 * Merchant Guild pressure & unpaid-marker tuning — DATA, consumed by the engine
 * (T-1309 "Guild pressure & unpaid-branch teeth", PRD-REIMAGINED §5.1: the 30-day
 * Tour One marker and the indebted branch that "flies on"). Three gaps this data
 * closes, all previously cosmetic:
 *   1. the unpaid branch's prose claimed "the interest keeps running" but the debt
 *      never accrued — GUILD_DEBT_DAILY_RATE gives it teeth (day.ts endDay);
 *   2. the prose claimed "your name now carries a flag every port clerk can see"
 *      but no flag existed or was read — the `guild.debt-flagged` flag (set in
 *      day.ts, magnitude = a guild-standing severity) is now read by TWO ports:
 *      worse manifest terms (GUILD_FLAG_MANIFEST_PENALTY, economy.ts rollContract)
 *      and heavier patrol/collection attention (GUILD_FLAG_ENCOUNTER_MULTIPLIER,
 *      actions/travel.ts generateEncounter);
 *   3. the six guild-pressure beat flags emitted zero consumers — the per-flag
 *      GUILD_PRESSURE_FLAG_WEIGHTS below are summed by `computeGuildStanding`
 *      (engine guild.ts) into the severity that scales BOTH consequences and picks
 *      the cleared-branch sign-off, so every surviving flag now feeds a reader.
 *
 * FOUNDATION (f2f95fa9): foundation has NO guild-debt-interest mechanic and no
 * port-clerk flag of any kind — the Merchant Guild exists only as flavor and the
 * day-30 marker is a bare number. So these constants carry no foundation citation:
 * they are engine-original tuning, sanctioned to live here per the TECH-STACK
 * "balance numbers are data" constraint — the same justification `lending.ts`
 * uses.
 *
 * CANONICAL (T-1603b, 2026-07-26) — RATIFIED UNCHANGED. The former INTERIM
 * (T-1603) marker named T-1603b as the canonical-values owner, and T-1603b set the
 * band exactly where it stood. Two independent bodies of evidence, one structural
 * and one measured:
 *
 * T-1601c STRUCTURAL ARGUMENT (2026-07-26): GUILD_DEBT_DAILY_RATE 0.02/dusk
 * compounds on a NON-BLOCKING ledger that never touches credits and never
 * soft-locks, so it is legible pressure and cannot strand a captain;
 * GUILD_FLAG_ENCOUNTER_MULTIPLIER 1.4 and GUILD_FLAG_MANIFEST_PENALTY 0.85 are
 * both quoted at severity 1 and scaled by the severity below, so the worst case is
 * bounded by the clamp band; and that band ([GUILD_SEVERITY_MIN 0.5,
 * GUILD_SEVERITY_MAX 2] around GUILD_STANDING_NEUTRAL 1 at GUILD_SEVERITY_STEP
 * 0.2/point) means the six pressure flags span score −3…+3 → 0.4 (clamped up to
 * 0.5) … 1.6, i.e. the reachable severity never touches MAX. Evidence:
 * `packages/engine/src/__tests__/guild-pressure.test.ts` (6 tests) pins all three
 * readers plus the standing→magnitude monotonicity, and
 * `tour-one-resolution.test.ts` covers the day-30 paid/unpaid branches.
 *
 * T-1603a/T-1603b FLEET EVIDENCE — the measurement T-1601c deferred, now taken.
 * Over 700 careers × 120 days the unpaid branch is demonstrably a slope and not a
 * wall: the fleet's debt-cleared rate rises from 37.1% at day 35 to 49.9% by day
 * 120, smuggler from 52.8% to 91.0%, gambler to 93.0%, and even `veteran` — a
 * policy built for the post-Tour-One game — finally clears 14% of its careers
 * (median day 89). `BASELINE-T-1603a.md` §1/§6; before/after in
 * `docs/balance/TUNING-T-1603.md` §3. Nothing in either arm asked for a move.
 *
 * READERS: the per-dusk accrual + port-clerk flag set (`packages/engine/src/day.ts`
 * endDay), the standing helper (`packages/engine/src/guild.ts` computeGuildStanding
 * / guildSeverity / guildEncounterMultiplier / guildManifestPenalty), the manifest
 * penalty (`economy.ts` rollContract via generateManifestBoard's optional param),
 * and the encounter reader (`actions/travel.ts` generateEncounter). Surfaced to the
 * player via WireEntry lines (interest accrual), lower manifest payments (Traders
 * screen), and more frequent travel interdictions.
 */

/**
 * Per-dusk interest on the OUTSTANDING unpaid marker (compounding on the current
 * balance, not simple-on-principal like the Penny Wise loan). Compounding is the
 * right shape here because the Guild debt is a non-blocking LEDGER — it never
 * touches player.credits and never soft-locks — so a gentle rate is flavor
 * pressure, and compounding on the balance avoids a new "original principal"
 * GameState field + migration (the 25,000 marker in state.ts is the only anchor).
 * 0.02 ≈ 2%/dusk: legible on the wire, never punishing. Canonical (T-1603b) —
 * ratified unchanged.
 *
 * THE ONE CONSEQUENCE WORTH WRITING DOWN, so nobody re-derives it in a panic:
 * compounding at 2%/dusk turns an untouched 25,000cr marker into roughly
 * 147,000cr by day 120 (25,000 × 1.02^90). That is why T-1603a's Flag 7 finds
 * `explorer` — the one policy that never pays a credit toward the marker —
 * permanently and unrecoverably underwater. It is INTENDED teeth on a ledger that
 * cannot soft-lock: the debt never touches `player.credits`, so the captain still
 * flies, still trades and still eats; what compounds is the size of the flag the
 * port clerks see. A captain who pays anything at all never sees this curve.
 */
export const GUILD_DEBT_DAILY_RATE = 0.02;

/**
 * Patrol/collection attention for a `guild.debt-flagged` captain: the realized
 * encounter chance is multiplied by `1 + (this − 1) × severity` (>1) — the "every
 * port clerk can see your flag, and the patrols hear about it" reader in
 * generateEncounter, the dangerous mirror of the CLOAKER damp and a sibling of the
 * loan-default COLLECTION_ENCOUNTER_MULTIPLIER. Canonical (T-1603b) — ratified
 * unchanged; the severity clamp bounds the realized worst case at 1.64x. */
export const GUILD_FLAG_ENCOUNTER_MULTIPLIER = 1.4;

/**
 * Worse manifest terms for a flagged captain: each contract's payment is scaled by
 * `1 − (1 − this) × severity` (<1) — a flagged name gets the leftover, lower-paying
 * runs. Applied in rollContract AFTER every rng draw (guarded so a clean captain's
 * board is byte-identical). Canonical (T-1603b) — ratified unchanged; at the worst
 * reachable severity (1.6) a flagged board still pays 76% of a clean one, which is
 * a penalty a captain can trade out of rather than a spiral. */
export const GUILD_FLAG_MANIFEST_PENALTY = 0.85;

/**
 * Per-flag guild-standing weights — the CONSUMER of the six otherwise-dead
 * guild-pressure beat flags (storylets.ts). Cooperative stances (acknowledge /
 * reassure / brace) LOWER the guild's hostility; hostile stances (dismiss /
 * stonewall / defy) RAISE it. `computeGuildStanding` (engine) sums the weights of
 * the set flags into a signed score (0 neutral, <0 cooperative, >0 hostile) that
 * `guildSeverity` maps to the consequence magnitude. A player who skipped a beat
 * leaves that flag unset → neutral contribution. Canonical (T-1603b) — ratified
 * unchanged; the ±1 symmetry is what keeps the reachable score band at −3…+3. */
export const GUILD_PRESSURE_FLAG_WEIGHTS: Readonly<Record<string, number>> = {
  'guild.pressure.tour-one.day10.acknowledged': -1,
  'guild.pressure.tour-one.day10.dismissed': 1,
  'guild.pressure.tour-one.day20.reassured': -1,
  'guild.pressure.tour-one.day20.stonewalled': 1,
  'guild.pressure.tour-one.day25.braced': -1,
  'guild.pressure.tour-one.day25.defied': 1,
};

/** Neutral severity (a captain who left every beat unset, or balanced cooperative
 *  vs hostile). The flag stores a severity, and `> 0` is its boolean gate, so the
 *  band is kept strictly positive. Canonical (T-1603b) — ratified unchanged. */
export const GUILD_STANDING_NEUTRAL = 1;

/** How far one standing point moves severity from neutral. score −3 → 0.4 (clamped
 *  to MIN), score +3 → 1.6. Canonical (T-1603b) — ratified unchanged. */
export const GUILD_SEVERITY_STEP = 0.2;

/** Severity clamp band. MIN stays > 0 so a maximally-cooperative captain is still
 *  flagged (the marker went unpaid — the flag exists), just treated gentlest. MAX
 *  is deliberately above the reachable 1.6 — it is a guard rail, not a target.
 *  Canonical (T-1603b) — ratified unchanged. */
export const GUILD_SEVERITY_MIN = 0.5;
export const GUILD_SEVERITY_MAX = 2;
