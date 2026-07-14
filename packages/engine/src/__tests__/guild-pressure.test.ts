import { describe, expect, it } from 'vitest';
import {
  GUILD_FLAG_ENCOUNTER_MULTIPLIER,
  GUILD_FLAG_MANIFEST_PENALTY,
  GUILD_PRESSURE_FLAG_WEIGHTS,
} from '@spacerquest/content';
import {
  computeGuildStanding,
  guildEncounterMultiplier,
  guildManifestPenalty,
  guildSeverity,
} from '../guild.js';
import { generateManifestBoard } from '../economy.js';
import { generateEncounter } from '../actions/travel.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { GameState } from '../types.js';

/**
 * T-1309 — Guild pressure & unpaid-branch teeth. Before this task the six Tour One
 * guild-pressure beat flags had ZERO consumers and the unpaid branch was cosmetic.
 * These tests pin the three surviving readers: `computeGuildStanding` (the named
 * reader of all six flags), the manifest penalty (worse port terms), and the
 * encounter multiplier (heavier patrol attention) — plus the standing → magnitude
 * chain that ties the pressure flags to how hard both consequences bite.
 */

/** The six pressure flags, split by the stance they record. */
const COOPERATIVE = [
  'guild.pressure.tour-one.day10.acknowledged',
  'guild.pressure.tour-one.day20.reassured',
  'guild.pressure.tour-one.day25.braced',
] as const;
const HOSTILE = [
  'guild.pressure.tour-one.day10.dismissed',
  'guild.pressure.tour-one.day20.stonewalled',
  'guild.pressure.tour-one.day25.defied',
] as const;

describe('T-1309 · computeGuildStanding is the named reader of all six pressure flags', () => {
  it('every surviving guild-pressure flag moves the standing in its authored direction', () => {
    const neutral = computeGuildStanding({});
    expect(neutral).toBe(0);

    // Every one of the six flags is asserted individually — the "named-reader test
    // per surviving guild flag" acceptance. Cooperative < neutral < hostile.
    for (const flag of COOPERATIVE) {
      expect(
        computeGuildStanding({ [flag]: true }),
        `${flag} should lower guild hostility`,
      ).toBeLessThan(neutral);
    }
    for (const flag of HOSTILE) {
      expect(
        computeGuildStanding({ [flag]: true }),
        `${flag} should raise guild hostility`,
      ).toBeGreaterThan(neutral);
    }

    // Sanity: the content weight table names exactly these six flags — no flag is
    // set-but-unread and no reader keys on a flag content never emits.
    expect(new Set(Object.keys(GUILD_PRESSURE_FLAG_WEIGHTS))).toEqual(
      new Set([...COOPERATIVE, ...HOSTILE]),
    );
  });

  it('a fully cooperative record is treated gentlest; a fully hostile record hardest', () => {
    const coop = guildSeverity(
      computeGuildStanding(Object.fromEntries(COOPERATIVE.map((f) => [f, true]))),
    );
    const hostile = guildSeverity(
      computeGuildStanding(Object.fromEntries(HOSTILE.map((f) => [f, true]))),
    );
    // Severity stays strictly positive on both (the marker went unpaid → the flag
    // exists) but the hostile captain carries a heavier one.
    expect(coop).toBeGreaterThan(0);
    expect(hostile).toBeGreaterThan(coop);
  });
});

/** Two identical fresh states; only the caller varies the guild penalty. */
function boardPayments(penalty: number): number[] {
  const state = createInitialState(77);
  // Same seed for both arms — the contract structure is identical; only `payment`
  // is scaled by the guild penalty (applied after every rng draw in rollContract).
  const rng = new SeededRng(4242);
  return generateManifestBoard(
    state.player.currentSystemId,
    rng,
    state.player.ship,
    4,
    null,
    penalty,
  ).map((contract) => contract.payment);
}

describe('T-1309 · flagged-vs-clean manifest A/B (same seed, different port treatment)', () => {
  it('a flagged captain is offered strictly leaner manifests', () => {
    const clean = boardPayments(1);
    const flagged = boardPayments(guildManifestPenalty(1));

    // Same-seed structure: same number of contracts.
    expect(flagged).toHaveLength(clean.length);
    // Every contract pays no more, and the board as a whole pays strictly less.
    for (let i = 0; i < clean.length; i += 1) {
      expect(flagged[i]).toBeLessThanOrEqual(clean[i]);
    }
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    // MUTATION NOTE: revert the guild penalty multiply in economy.ts rollContract
    // and the two boards equalize → red.
    expect(sum(flagged)).toBeLessThan(sum(clean));
    expect(GUILD_FLAG_MANIFEST_PENALTY).toBeLessThan(1);
  });

  it('a hostile record yields a leaner board than a cooperative one (standing → magnitude)', () => {
    const coopSeverity = guildSeverity(
      computeGuildStanding(Object.fromEntries(COOPERATIVE.map((f) => [f, true]))),
    );
    const hostileSeverity = guildSeverity(
      computeGuildStanding(Object.fromEntries(HOSTILE.map((f) => [f, true]))),
    );
    const coop = boardPayments(guildManifestPenalty(coopSeverity));
    const hostile = boardPayments(guildManifestPenalty(hostileSeverity));
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    // The pressure flags feed the consequence MAGNITUDE, not just a boolean gate.
    expect(sum(hostile)).toBeLessThan(sum(coop));
  });
});

describe('T-1309 · flagged-vs-clean encounter A/B (same seed, more interdictions)', () => {
  /** Count how often generateEncounter fires across a fixed seed sweep. Identical
   *  route and per-seed encounter draw across both arms — only `guild.debt-flagged`
   *  differs (mirrors the loan-default A/B in lending.test.ts). */
  function count(flagValue: number): number {
    const ORIGIN = 1;
    const DEST = 2;
    const SEEDS = 500;
    let n = 0;
    for (let s = 0; s < SEEDS; s += 1) {
      const state: GameState = createInitialState(s + 1);
      state.era = 'VETERAN'; // full encounter rate (no Tour One damp) for signal
      if (flagValue > 0) state.flags['guild.debt-flagged'] = flagValue;
      if (generateEncounter(state, ORIGIN, DEST, 50, new SeededRng(s + 1000))) n += 1;
    }
    return n;
  }

  it('generateEncounter fires measurably more often for a flagged captain', () => {
    const baseline = count(0);
    const flagged = count(1);

    expect(baseline).toBeGreaterThan(0); // the route is genuinely dangerous
    // MUTATION NOTE: revert the guild multiply in travel.ts generateEncounter and
    // the two counts become equal → red.
    expect(flagged).toBeGreaterThan(baseline);
    expect(flagged / baseline).toBeGreaterThan(1.15);
    expect(GUILD_FLAG_ENCOUNTER_MULTIPLIER).toBeGreaterThan(1);
    expect(guildEncounterMultiplier(1)).toBeGreaterThan(1);
  });

  it('a hostile record draws more interdictions than a cooperative one (standing → magnitude)', () => {
    const coopSeverity = guildSeverity(
      computeGuildStanding(Object.fromEntries(COOPERATIVE.map((f) => [f, true]))),
    );
    const hostileSeverity = guildSeverity(
      computeGuildStanding(Object.fromEntries(HOSTILE.map((f) => [f, true]))),
    );
    const coop = count(coopSeverity);
    const hostile = count(hostileSeverity);
    expect(hostile).toBeGreaterThan(coop);
  });
});
