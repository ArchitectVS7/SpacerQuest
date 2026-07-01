/**
 * Galactic News Wire — the "while you were away" digest.
 * Verifies it CURATES highlights (superlatives + top intrigue + promotion +
 * leaderboard) rather than dumping the full bot action log, and stays deterministic
 * under a seeded rng.
 */

import { describe, it, expect } from 'vitest';
import { buildGalacticDigest } from '../src/bots/galactic-digest';
import { BotTurnResult } from '../src/bots/types';

const r = (over: Partial<BotTurnResult>): BotTurnResult => ({
  characterId: 'x', botName: 'Nobody', actions: [],
  creditsEarned: 0, creditsSpent: 0, battlesWon: 0, battlesLost: 0,
  tripsCompleted: 0, notableEvents: [], ...over,
});

const RESULTS: BotTurnResult[] = [
  r({ botName: 'Iron Vex', battlesWon: 3, battlesLost: 1, creditsEarned: 5000, creditsSpent: 2000, tripsCompleted: 3,
      notableEvents: ["Iron Vex accepted Cargo King's Deep Space duel and WON (5-3)", 'Iron Vex defeated Kron the Ruthless'] }),
  r({ botName: 'Cargo King', creditsEarned: 52000, creditsSpent: 4000, tripsCompleted: 3,
      notableEvents: ['Delivered 5 pods for 12000 cr', 'Cargo King posted a Cosmic Radiation Arena challenge (credits at stake)'] }),
  r({ botName: 'Lucky Seven', battlesLost: 2, creditsEarned: 1000, creditsSpent: 14000, tripsCompleted: 2,
      notableEvents: ['Posted 4000 cr bail for Doomed Dan'] }),
  r({ botName: 'Doc Salvage', creditsEarned: 1000, tripsCompleted: 3, notableEvents: ['Rescued Stranded Steve'] }),
];
const INPUT = {
  results: RESULTS,
  promotions: [{ name: 'Iron Vex', rank: 'COMMODORE' }],
  leader: { name: 'Cargo King', score: 1450, rank: 'TOP_DOG' },
};

describe('buildGalacticDigest', () => {
  it('curates highlights into a short, exciting wire', () => {
    const lines = buildGalacticDigest(INPUT, () => 0); // seed → first flavour template
    const wire = lines.join('\n');
    // eslint-disable-next-line no-console
    console.log('\n' + wire + '\n');

    // Opener names the spacer count and the battle tally
    expect(lines[0]).toMatch(/4 spacers/);
    expect(lines[0]).toMatch(/6 shot/);
    // Combat superlative → the top fighter, not everyone
    expect(wire).toMatch(/Iron Vex left a trail of wreckage — 3 kills/);
    // Fortune superlative (richest net) + a notable bust
    expect(wire).toMatch(/banked 48,000 cr/);
    expect(wire).toMatch(/Lucky Seven bled 13,000 cr/);
    // Intrigue: the arena win outranks a plain delivery
    expect(wire).toMatch(/WON \(5-3\)/);
    expect(wire).not.toMatch(/Delivered 5 pods/);      // low-drama trade is filtered out
    // Promotion + leaderboard beats
    expect(wire).toMatch(/promotion to Commodore/);
    expect(wire).toMatch(/top spot — 1,450 pts, Top Dog/);
    // Curated, not a dump: a handful of lines
    expect(lines.length).toBeLessThanOrEqual(9);
  });

  it('is deterministic under a fixed rng and varies with the seed', () => {
    const a = buildGalacticDigest(INPUT, () => 0).join('\n');
    const b = buildGalacticDigest(INPUT, () => 0).join('\n');
    const c = buildGalacticDigest(INPUT, () => 0.99).join('\n');
    expect(a).toBe(b);            // same seed → identical
    expect(a).not.toBe(c);        // different seed → different flavour
  });

  it('returns nothing when no spacers acted', () => {
    expect(buildGalacticDigest({ results: [] })).toEqual([]);
  });

  it('caps intrigue: at most two newsworthy events make the wire', () => {
    const lines = buildGalacticDigest(INPUT, () => 0);
    const intrigue = lines.filter(l => /🏟|🔓|🚀|💥|🚩/.test(l));
    expect(intrigue.length).toBeLessThanOrEqual(2);
  });
});
