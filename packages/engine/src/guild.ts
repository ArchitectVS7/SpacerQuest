import {
  FlagValue,
  GUILD_FLAG_ENCOUNTER_MULTIPLIER,
  GUILD_FLAG_MANIFEST_PENALTY,
  GUILD_PRESSURE_FLAG_WEIGHTS,
  GUILD_SEVERITY_MAX,
  GUILD_SEVERITY_MIN,
  GUILD_SEVERITY_STEP,
  GUILD_STANDING_NEUTRAL,
} from '@spacerquest/content';

/**
 * T-1309 · The named READER of the six Tour One guild-pressure beat flags
 * (storylets.ts) — before this, every one of them was set and consumed by nothing.
 * Sums the content weights (GUILD_PRESSURE_FLAG_WEIGHTS) of the set flags into a
 * signed guild-standing score: 0 = neutral (no beat resolved, or cooperative and
 * hostile cancel out), < 0 = cooperative (the captain kept the Guild informed),
 * > 0 = hostile (dismissed / stonewalled / defied). An absent flag contributes
 * nothing (a skipped beat is neutral). Pure — no rng, no I/O.
 *
 * CONSUMERS of the score:
 *   - the day-30 UNPAID branch (day.ts): `guildSeverity(score)` becomes the value
 *     of the `guild.debt-flagged` flag, so a hostile record yields harsher patrol
 *     attention and worse manifest terms than a cooperative one;
 *   - the day-30 CLEARED branch (day.ts): its SIGN picks the wire sign-off (a
 *     warmer close for a captain who kept the Guild informed, terser for one who
 *     stonewalled) — a real reader on the branch that never sets the flag.
 */
export function computeGuildStanding(flags: Record<string, FlagValue>): number {
  let score = 0;
  for (const [name, weight] of Object.entries(GUILD_PRESSURE_FLAG_WEIGHTS)) {
    if (flags[name] === true) score += weight;
  }
  return score;
}

/**
 * Map a guild-standing score to the consequence severity stored AS the
 * `guild.debt-flagged` flag value. Clamped to [MIN, MAX] with MIN > 0 so the flag
 * is always truthy on the unpaid branch (the marker went unpaid → the flag exists)
 * while a maximally-cooperative captain is treated gentlest. Pure.
 */
export function guildSeverity(score: number): number {
  return Math.min(
    GUILD_SEVERITY_MAX,
    Math.max(GUILD_SEVERITY_MIN, GUILD_STANDING_NEUTRAL + score * GUILD_SEVERITY_STEP),
  );
}

/** Realized-encounter multiplier for a flagged captain of the given severity
 *  (>1 for any positive severity). Read by generateEncounter (actions/travel.ts). */
export function guildEncounterMultiplier(severity: number): number {
  return 1 + (GUILD_FLAG_ENCOUNTER_MULTIPLIER - 1) * severity;
}

/** Manifest-payment multiplier for a flagged captain of the given severity
 *  (<1 for any positive severity). Threaded into rollContract via
 *  generateManifestBoard (economy.ts). */
export function guildManifestPenalty(severity: number): number {
  return 1 - (1 - GUILD_FLAG_MANIFEST_PENALTY) * severity;
}
