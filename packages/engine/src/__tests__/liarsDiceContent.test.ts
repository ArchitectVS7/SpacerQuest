import { describe, it, expect } from 'vitest';
import {
  ALL_NPC_PROFILES,
  LIARS_DICE_OPPONENTS,
  LIARS_DICE_RAISED_CEILING_MULT,
  LIARS_DICE_UNLOCK_GAMES,
  PORT_HANGOUTS,
  STAR_SYSTEMS,
  validateLiarsDiceOpponents,
  type LiarsDiceOpponent,
} from '@spacerquest/content';
import { wagerBandFor } from '../hangoutRules.js';

// ---------------------------------------------------------------------------
// T-145 · THE FIXED 42-OPPONENT ROSTER, as authored
// (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §2).
//
// This file lives in the ENGINE, not in `packages/content`, for one reason: the
// no-lockout precondition `bankroll >= wagerBandFor(systemId).min` has to be
// checked through the REAL engine accessor. The content-side validator resolves
// the band from the same authored rows (it cannot import the engine — content sits
// upstream), and this file closes that loop. `hangoutContent.test.ts` is the
// precedent for the split.
// ---------------------------------------------------------------------------

const ALL_ROWS: LiarsDiceOpponent[] = Object.values(LIARS_DICE_OPPONENTS).flat();
const HANGOUT_PORTS = Object.values(STAR_SYSTEMS)
  .filter((system) => system.hasHangout === true)
  .map((system) => system.id)
  .sort((a, b) => a - b);

describe('T-145 · obligation 1 — the shipped roster passes its own validator', () => {
  it('reports zero structural errors', () => {
    expect(validateLiarsDiceOpponents(LIARS_DICE_OPPONENTS)).toEqual([]);
  });

  it('the validator has TEETH — it rejects each rule it claims to enforce', () => {
    // A validator that never fires is decoration. One malformed clone per rule.
    const good = LIARS_DICE_OPPONENTS[1][0];
    const clone = (patch: Partial<LiarsDiceOpponent>) => ({
      1: [{ ...good, ...patch }, LIARS_DICE_OPPONENTS[1][1], LIARS_DICE_OPPONENTS[1][2]],
    });
    const fails = (patch: Partial<LiarsDiceOpponent>) =>
      expect(validateLiarsDiceOpponents(clone(patch)).length).toBeGreaterThan(0);

    fails({ id: 'npc-iron-vex' }); // outside the 'ld-' namespace AND a profile id
    fails({ name: 'Iron Vex' }); // collides with a roaming captain's name
    fails({ systemId: 2 }); // disagrees with its record key
    fails({ seat: 2 }); // duplicates seat 2 at this port
    fails({ bankroll: 0 }); // cannot sit even once — breaks §7.5's precondition
    fails({ mix: { optimal: 50, bad: 30, random: 20 } }); // mix on a non-'mixed' row
    fails({ archetype: 'mixed' }); // 'mixed' with no mix
    fails({ archetype: 'mixed', mix: { optimal: 50, bad: 30, random: 10 } }); // sums to 90
    fails({ lines: { ...good.lines, win: '' } }); // empty line
    fails({ lines: { ...good.lines, win: 'a {captain} thing' } }); // placeholder
    fails({ lines: { ...good.lines, tableTalk: 'Four dice apiece, captain.' } }); // dice count
    fails({ lines: { ...good.lines, lose: 'x'.repeat(121) } }); // over the cap
  });
});

describe('T-145 · the table shape — 42 rows, three per hasHangout port', () => {
  it('authors exactly the fourteen hasHangout ports and nothing else', () => {
    expect(HANGOUT_PORTS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(
      Object.keys(LIARS_DICE_OPPONENTS)
        .map(Number)
        .sort((a, b) => a - b),
    ).toEqual(HANGOUT_PORTS);
  });

  it('is exactly 42 rows, three per port, with seats 1/2/3 once each', () => {
    expect(ALL_ROWS).toHaveLength(42);
    for (const systemId of HANGOUT_PORTS) {
      const rows = LIARS_DICE_OPPONENTS[systemId];
      expect(rows, `port ${systemId}`).toHaveLength(3);
      // The record KEY is the handle the engine looks a port up by; `row.systemId`
      // is what the row claims. The `portHangouts.ts` precedent.
      expect(rows.map((r) => r.systemId)).toEqual([systemId, systemId, systemId]);
      expect([...rows.map((r) => r.seat)].sort()).toEqual([1, 2, 3]);
      expect(rows.map((r) => r.id)).toEqual([
        `ld-${systemId}-1`,
        `ld-${systemId}-2`,
        `ld-${systemId}-3`,
      ]);
    }
  });

  it('the archetype census is bad x7, random x7, mixed x14, optimal x14 (§2.4)', () => {
    const census: Record<string, number> = {};
    for (const row of ALL_ROWS) census[row.archetype] = (census[row.archetype] ?? 0) + 1;
    expect(census).toEqual({ bad: 7, random: 7, mixed: 14, optimal: 14 });
    // …and it falls out of the SEAT RULE rather than being a coincidence: seat 1
    // is 'bad' at ports 1-7 and 'random' at 8-14, seat 2 is always 'mixed', seat 3
    // is always 'optimal'.
    for (const systemId of HANGOUT_PORTS) {
      const [one, two, three] = LIARS_DICE_OPPONENTS[systemId];
      expect(one.archetype, `port ${systemId} seat 1`).toBe(systemId <= 7 ? 'bad' : 'random');
      expect(two.archetype).toBe('mixed');
      expect(three.archetype).toBe('optimal');
    }
  });

  it('bankrolls are 3x / 5x / 8x the port band ceiling, totalling 280,800 cr', () => {
    for (const systemId of HANGOUT_PORTS) {
      const max = wagerBandFor(systemId).max;
      const [one, two, three] = LIARS_DICE_OPPONENTS[systemId];
      expect(one.bankroll, `port ${systemId} seat 1`).toBe(3 * max);
      expect(two.bankroll).toBe(5 * max);
      expect(three.bankroll).toBe(8 * max);
      // Difficulty rises monotonically with the purse at every port.
      expect(one.bankroll).toBeLessThan(two.bankroll);
      expect(two.bankroll).toBeLessThan(three.bankroll);
    }
    // §2.6's total, stated as a number rather than re-derived: the BOUNDED,
    // ONE-TIME MAXIMUM the whole gauntlet can transfer to a captain for the life
    // of a save, because the roster is zero-sum and never regenerates.
    expect(ALL_ROWS.reduce((sum, row) => sum + row.bankroll, 0)).toBe(280_800);
  });

  it('a mix is present IFF the archetype is mixed, and sums to exactly 100', () => {
    for (const row of ALL_ROWS) {
      if (row.archetype === 'mixed') {
        expect(row.mix, row.id).toBeDefined();
        const mix = row.mix!;
        expect(mix.optimal + mix.bad + mix.random, row.id).toBe(100);
        for (const share of [mix.optimal, mix.bad, mix.random]) {
          expect(Number.isInteger(share) && share >= 0).toBe(true);
        }
      } else {
        expect(row.mix, row.id).toBeUndefined();
      }
    }
  });

  it("the mix is keyed on the port's authored TONE, not on its id (§2.5)", () => {
    const BY_TONE = {
      everyday: { optimal: 40, bad: 40, random: 20 },
      exotic: { optimal: 60, bad: 20, random: 20 },
      dangerous: { optimal: 70, bad: 10, random: 20 },
      comic: { optimal: 20, bad: 40, random: 40 },
    } as const;
    for (const systemId of HANGOUT_PORTS) {
      const tone = PORT_HANGOUTS[systemId].prose.tone;
      expect(LIARS_DICE_OPPONENTS[systemId][1].mix, `port ${systemId} (${tone})`).toEqual(
        BY_TONE[tone],
      );
    }
  });
});

describe('T-145 · obligation 2 — the roster is disjoint from the roaming cast', () => {
  it('every id is `ld-`-prefixed, unique, and not an NPC profile id', () => {
    const profileIds = new Set(ALL_NPC_PROFILES.map((p) => p.id));
    const seen = new Set<string>();
    for (const row of ALL_ROWS) {
      expect(row.id.startsWith('ld-'), row.id).toBe(true);
      // `NpcState.id === profile.id` (state.ts), so a collision here would make a
      // roster opponent and a captain indistinguishable to every money-routing
      // branch in the engine.
      expect(profileIds.has(row.id), row.id).toBe(false);
      expect(seen.has(row.id), row.id).toBe(false);
      seen.add(row.id);
    }
    expect(seen.size).toBe(42);
    // …and no profile id could ever be mistaken for one, from the other side.
    for (const profile of ALL_NPC_PROFILES) expect(profile.id.startsWith('ld-')).toBe(false);
  });

  it('every name is unique and not a roaming captain’s name', () => {
    const profileNames = new Set(ALL_NPC_PROFILES.map((p) => p.name));
    const seen = new Set<string>();
    for (const row of ALL_ROWS) {
      expect(profileNames.has(row.name), row.name).toBe(false);
      expect(seen.has(row.name), row.name).toBe(false);
      seen.add(row.name);
    }
    expect(seen.size).toBe(42);
  });
});

describe('T-145 · obligation 3 — §7.5’s no-lockout precondition, through the REAL accessor', () => {
  it('bankroll >= wagerBandFor(systemId).min at all 42 rows', () => {
    for (const row of ALL_ROWS) {
      const band = wagerBandFor(row.systemId);
      // The precondition of "broke implies beaten": an opponent who cannot cover
      // the port's own floor could never sit even once, and the theorem that rules
      // out an achievement lockout would be false.
      expect(row.bankroll, `${row.id} at port ${row.systemId}`).toBeGreaterThanOrEqual(band.min);
      // The far stronger property the 3x/5x/8x rule actually buys.
      expect(row.bankroll).toBeGreaterThanOrEqual(3 * band.max);
    }
    // The tightest row in the whole table, named so a later content pass can see
    // how much room it has: port 11 (Regulus-6), seat 1 — 9,000 against a 500 min.
    expect(LIARS_DICE_OPPONENTS[11][0].bankroll).toBe(9000);
    expect(wagerBandFor(11).min).toBe(500);
  });
});

describe('T-145 · the authored lines', () => {
  it('are non-empty, under 120 chars, placeholder-free and dice-count-free', () => {
    for (const row of ALL_ROWS) {
      for (const key of ['tableTalk', 'win', 'lose'] as const) {
        const line = row.lines[key];
        expect(line.length, `${row.id}.${key}`).toBeGreaterThan(0);
        expect(line.length, `${row.id}.${key}`).toBeLessThanOrEqual(120);
        // Printed VERBATIM — there is no interpolation step on their path.
        expect(line.includes('{'), `${row.id}.${key}`).toBe(false);
        // The count moves with the unlock ladder, so a line naming it is a lie at
        // tier 2. A mechanical trap, not a matter of taste.
        expect(/\b(?:\d+|one|two|three|four|five|six|a|an)\s+(?:dice|die)\b/i.test(line)).toBe(
          false,
        );
      }
      // All three differ — a house whose win and lose lines are the same says
      // nothing about how the hand went.
      expect(new Set(Object.values(row.lines)).size, row.id).toBe(3);
    }
  });
});

describe('T-145 · the two ladder constants ship with the table (inert until T-146)', () => {
  it('are the authored thresholds and multiplier', () => {
    expect(LIARS_DICE_UNLOCK_GAMES).toEqual([5, 10, 20, 40, 80]);
    expect(LIARS_DICE_RAISED_CEILING_MULT).toBe(3);
  });
});
