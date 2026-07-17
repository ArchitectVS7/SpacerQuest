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
 * uses. T-1603 CANONICAL: ratified by the balance sweep. Note the compounding
 * GUILD_DEBT_DAILY_RATE bites ONLY on an already-unpaid marker (day.ts guards it on
 * the post-day-30 `guild.debt-flagged` flag), so it deliberately does NOT touch the
 * debt-clear pacing of captains who clear Tour One on time — it is a consequence for
 * the indebted branch, not a lever on the median. See docs/balance/tuning-memo.md.
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
 * 0.02 ≈ 2%/dusk: legible on the wire, never punishing. T-1603 canonical.
 */
export const GUILD_DEBT_DAILY_RATE = 0.02;

/**
 * Patrol/collection attention for a `guild.debt-flagged` captain: the realized
 * encounter chance is multiplied by `1 + (this − 1) × severity` (>1) — the "every
 * port clerk can see your flag, and the patrols hear about it" reader in
 * generateEncounter, the dangerous mirror of the CLOAKER damp and a sibling of the
 * loan-default COLLECTION_ENCOUNTER_MULTIPLIER. T-1603 canonical. */
export const GUILD_FLAG_ENCOUNTER_MULTIPLIER = 1.4;

/**
 * Worse manifest terms for a flagged captain: each contract's payment is scaled by
 * `1 − (1 − this) × severity` (<1) — a flagged name gets the leftover, lower-paying
 * runs. Applied in rollContract AFTER every rng draw (guarded so a clean captain's
 * board is byte-identical). T-1603 canonical. */
export const GUILD_FLAG_MANIFEST_PENALTY = 0.85;

/**
 * Per-flag guild-standing weights — the CONSUMER of the six otherwise-dead
 * guild-pressure beat flags (storylets.ts). Cooperative stances (acknowledge /
 * reassure / brace) LOWER the guild's hostility; hostile stances (dismiss /
 * stonewall / defy) RAISE it. `computeGuildStanding` (engine) sums the weights of
 * the set flags into a signed score (0 neutral, <0 cooperative, >0 hostile) that
 * `guildSeverity` maps to the consequence magnitude. A player who skipped a beat
 * leaves that flag unset → neutral contribution. T-1603 canonical. */
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
 *  band is kept strictly positive. T-1603 canonical. */
export const GUILD_STANDING_NEUTRAL = 1;

/** How far one standing point moves severity from neutral. score −3 → 0.4 (clamped
 *  to MIN), score +3 → 1.6. T-1603 canonical. */
export const GUILD_SEVERITY_STEP = 0.2;

/** Severity clamp band. MIN stays > 0 so a maximally-cooperative captain is still
 *  flagged (the marker went unpaid — the flag exists), just treated gentlest.
 *  T-1603 canonical. */
export const GUILD_SEVERITY_MIN = 0.5;
export const GUILD_SEVERITY_MAX = 2;
