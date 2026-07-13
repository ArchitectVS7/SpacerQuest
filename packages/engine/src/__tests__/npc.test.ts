import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import {
  IDEAL_WEIGHTS,
  INTENT_STAT_AFFINITY,
  NPC_CHECK_DCS,
  NPC_PROFILES,
  NpcIntentType,
  distance,
} from '@spacerquest/content';
import { applyDisposition, npcDrives, resolveNpcDay } from '../npc.js';
import { jumpFuelCost } from '../economy.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { GameEvent, NpcState } from '../types.js';

/** The five verb action-types and their StatCheck actionContext tags — the
 *  contract T-1201 asserts: a resolved verb ⟺ exactly one StatCheck with the
 *  matching context. */
const VERB_CONTEXT: Record<string, string> = {
  Trade: 'npc-trade',
  Travel: 'npc-travel',
  Combat: 'npc-combat',
  Patrol: 'npc-patrol',
  Socialize: 'npc-socialize',
};

function npcFor(profileId: string, overrides: Partial<NpcState> = {}): NpcState {
  const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
  return {
    id: profile.id,
    name: profile.name,
    profileId: profile.id,
    currentSystemId: 1,
    credits: 5000,
    fuel: 1000,
    disposition: 0,
    ...overrides,
  };
}

const NO_BOARD = { day: 1, claimableBoard: null, eraEvent: null };

describe('NPC Resolution', () => {
  it('resolves an NPC day deterministically and handles Flaw overrides', () => {
    const first = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);
    const second = resolveNpcDay(npcFor('npc-iron-vex'), new SeededRng(42), NO_BOARD);

    expect(second.npc).toEqual(first.npc);
    expect(second.events).toEqual(first.events);

    expect(first.npc.id).toBe('npc-iron-vex');
    expect(first.events.length).toBeGreaterThan(0);
    expect(first.events.find((e) => e.type === 'NpcAction')).toBeDefined();
    expect(first.npc.lastAction).toBeDefined();
  });

  it('has an intent weight entry for every distinct Ideal in the cast', () => {
    for (const profile of NPC_PROFILES) {
      expect(
        IDEAL_WEIGHTS[profile.ideal],
        `missing weights for Ideal "${profile.ideal}"`,
      ).toBeDefined();
    }
  });

  it('never lets an NPC spend credits or fuel it does not have', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { npc } = resolveNpcDay(
        npcFor('npc-lucky-seven', { credits: 30, fuel: 5 }),
        new SeededRng(seed),
        NO_BOARD,
      );
      expect(npc.credits).toBeGreaterThanOrEqual(0);
      expect(npc.fuel).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Intent weights steer behavior (property, 300 seeds)', () => {
  function actionRates(profileId: string): Record<string, number> {
    const counts: Record<string, number> = {};
    const seeds = 300;
    for (let seed = 1; seed <= seeds; seed++) {
      const { npc } = resolveNpcDay(npcFor(profileId), new SeededRng(seed), NO_BOARD);
      const type = npc.lastAction!.type;
      counts[type] = (counts[type] ?? 0) + 1;
    }
    const rates: Record<string, number> = {};
    for (const [type, count] of Object.entries(counts)) {
      rates[type] = count / seeds;
    }
    return rates;
  }

  it('Cargo King (Wealth, TRADE 5) trades far more often than he fights', () => {
    const rates = actionRates('npc-cargo-king');
    expect(rates['Trade'] ?? 0).toBeGreaterThan(rates['Combat'] ?? 0);
    expect(rates['Trade'] ?? 0).toBeGreaterThan(0.5);
  });

  it('Iron Vex (Dominance, GUNS 4) fights far more often than he trades', () => {
    // Bloodthirsty (dc 14) overrides many combat days outright, so the
    // resolved Combat rate is deflated — the property still holds by a wide
    // margin: fighting dwarfs trading.
    const rates = actionRates('npc-iron-vex');
    expect(rates['Combat'] ?? 0).toBeGreaterThan(2 * (rates['Trade'] ?? 0));
    expect(rates['Combat'] ?? 0).toBeGreaterThan(0.15);
  });
});

describe('NPC economics are real (T-106)', () => {
  it('pays the same jump fuel cost the player would for the same route', () => {
    // Warp Hound (Discovery/PILOT 5) travels most days — find a travel day.
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-warp-hound');
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Travel') continue;

      const profile = NPC_PROFILES.find((p) => p.id === 'npc-warp-hound')!;
      const expectedCost = jumpFuelCost(
        npcDrives(profile.tier),
        distance(before.currentSystemId, npc.currentSystemId),
      );
      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.fuel).toBe(before.fuel - expectedCost);
      return;
    }
    throw new Error('no travel day found in 100 seeds');
  });

  it('a trade day moves the NPC to the contract destination and pays real credits', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-cargo-king');
      const { npc } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type !== 'Trade') continue;

      expect(npc.currentSystemId).not.toBe(before.currentSystemId);
      expect(npc.credits).toBeGreaterThan(before.credits);
      expect(npc.fuel).toBeLessThan(before.fuel);
      return;
    }
    throw new Error('no trade day found in 100 seeds');
  });

  it('a broke, dry NPC idles on odd jobs instead of flying for free', () => {
    let sawBeggingWire = false;
    for (let seed = 1; seed <= 100; seed++) {
      const before = npcFor('npc-rust-bucket', { credits: 10, fuel: 0 });
      const { npc, events } = resolveNpcDay(before, new SeededRng(seed), NO_BOARD);
      if (npc.lastAction?.type === 'FlawOverride' || npc.lastAction?.type === 'Socialize') {
        continue;
      }

      // No free economics: he cannot jump (no fuel, no credits for fuel).
      expect(npc.currentSystemId).toBe(before.currentSystemId);
      expect(npc.lastAction?.type).toBe('Idle');
      expect(npc.credits).toBeGreaterThan(before.credits); // odd-job alms
      if (
        events.some((e) => e.type === 'WireEntry' && e.message.includes('begging for fuel money'))
      ) {
        sawBeggingWire = true;
      }
    }
    expect(sawBeggingWire).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1201 · NPCs roll real checks. Every NPC verb now resolves through the SAME
// shared check() the player uses (PRD §7: "one system — there is no separate
// AI"), emitting a StatCheck event. These tests pin the load-bearing invariant
// (verb ⟺ StatCheck) that T-1202 builds on, and prove the DCs are sourced from
// content, not from shadow literals in npc.ts.
// ---------------------------------------------------------------------------
describe('T-1201 NPCs roll real checks', () => {
  it('every resolved verb emits exactly one matching StatCheck; Idle/FlawOverride emit none', () => {
    const seenContexts = new Set<string>();
    let sawFlawOverride = false;
    let sawIdle = false;

    // Sweep the whole cast across two funding states so all five verbs AND the
    // broke fallbacks (Idle) AND flaw overrides actually fire.
    const fundings: Partial<NpcState>[] = [
      { credits: 5000, fuel: 1000 }, // flush: verbs execute
      { credits: 30, fuel: 5 }, // broke & dry: verb executors fall back to Idle
    ];

    for (const profile of NPC_PROFILES) {
      for (const funding of fundings) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const { npc, events } = resolveNpcDay(
            npcFor(profile.id, funding),
            new SeededRng(seed),
            NO_BOARD,
          );
          const type = npc.lastAction!.type;
          const statChecks = events.filter((e) => e.type === 'StatCheck');

          if (type in VERB_CONTEXT) {
            // A resolved verb ⟺ exactly one StatCheck with the matching context.
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} should emit exactly one StatCheck`,
            ).toHaveLength(1);
            const check = statChecks[0];
            expect(check.type === 'StatCheck' && check.actionContext).toBe(VERB_CONTEXT[type]);
            expect(check.type === 'StatCheck' && check.actor).toBe(npc.id);
            seenContexts.add(VERB_CONTEXT[type]);
          } else {
            // Idle / FlawOverride are NOT verb resolutions — they roll nothing
            // through check(), so no StatCheck may be emitted (keeps the sim's
            // trade-failure denominator honest).
            expect(
              statChecks,
              `${profile.id} ${type} seed ${seed} must emit no StatCheck`,
            ).toHaveLength(0);
            if (type === 'FlawOverride') sawFlawOverride = true;
            if (type === 'Idle') sawIdle = true;
          }
        }
      }
    }

    // Coverage: every verb's context was observed at least once (guards against
    // a verb silently skipping its roll and never entering the ⟺ branch above).
    expect([...seenContexts].sort()).toEqual([
      'npc-combat',
      'npc-patrol',
      'npc-socialize',
      'npc-trade',
      'npc-travel',
    ]);
    // ...and the contrapositive was genuinely exercised (not vacuously true).
    expect(sawFlawOverride).toBe(true);
    expect(sawIdle).toBe(true);
  });

  it('binds the emitted StatCheck DC and stat to content NPC_CHECK_DCS (no shadow literals)', () => {
    // Drive each verb to fire and read back the DC/stat off its StatCheck. If
    // the engine used a hardcoded DC instead of the content table, these would
    // diverge. Profiles picked to lean hard into each verb.
    const drivers: Record<NpcIntentType, string> = {
      Trade: 'npc-cargo-king', // Wealth / TRADE 5
      Travel: 'npc-warp-hound', // Discovery / PILOT 5
      Combat: 'npc-iron-vex', // Dominance / GUNS 4
      Patrol: 'npc-the-warden', // Justice / GRIT high
      Socialize: 'npc-silk-dagger', // GUILE-leaning
    };

    const verified = new Set<string>();
    for (const [intent, profileId] of Object.entries(drivers) as [NpcIntentType, string][]) {
      const context = VERB_CONTEXT[intent];
      for (let seed = 1; seed <= 400 && !verified.has(context); seed += 1) {
        const { events } = resolveNpcDay(npcFor(profileId), new SeededRng(seed), NO_BOARD);
        const check = events.find((e) => e.type === 'StatCheck' && e.actionContext === context);
        if (!check || check.type !== 'StatCheck') continue;
        expect(check.dc, `${intent} DC must come from content`).toBe(NPC_CHECK_DCS[intent]);
        expect(check.stat).toBe(INTENT_STAT_AFFINITY[intent]);
        // The recorded modifier is the profile's affinity stat, proving the roll
        // read profile.stats[stat] (not NpcState — stats live on the profile).
        const profile = NPC_PROFILES.find((p) => p.id === profileId)!;
        expect(check.result.modifier).toBe(profile.stats[INTENT_STAT_AFFINITY[intent]]);
        verified.add(context);
      }
    }
    expect([...verified].sort()).toEqual([
      'npc-combat',
      'npc-patrol',
      'npc-socialize',
      'npc-trade',
      'npc-travel',
    ]);
  });

  it('has no hardcoded DC literals in npc.ts source and sources them from content', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../npc.ts'),
      'utf8',
    );
    // The two removed inline thresholds (Combat >=12, Socialize >=14) must be
    // gone from the source entirely (code AND comments — the comments were
    // reworded so this guard cannot pass on prose alone).
    expect(source).not.toMatch(/>=\s*12/);
    expect(source).not.toMatch(/>=\s*14/);
    // ...and the DCs are pulled from the content table.
    expect(source).toMatch(/NPC_CHECK_DCS/);
    expect(source).toMatch(/from '@spacerquest\/content'/);
  });
});

describe('Disposition helper', () => {
  function stateWithNpc(disposition: number) {
    const state = createInitialState(1);
    state.npcs[0].disposition = disposition;
    return { state, npcId: state.npcs[0].id };
  }

  it('applies deltas and emits DispositionChanged', () => {
    const { state, npcId } = stateWithNpc(0);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 2, 'tribute', events);

    expect(state.npcs[0].disposition).toBe(2);
    expect(events).toContainEqual({
      type: 'DispositionChanged',
      day: state.day,
      npcId,
      delta: 2,
      disposition: 2,
      reason: 'tribute',
    });
  });

  it('clamps to [-10, +10] and reports the applied delta', () => {
    const { state, npcId } = stateWithNpc(9);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 5, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events[0]).toMatchObject({ type: 'DispositionChanged', delta: 1, disposition: 10 });

    state.npcs[0].disposition = -9;
    const negEvents: GameEvent[] = [];
    applyDisposition(state, npcId, -5, 'defeat', negEvents);
    expect(state.npcs[0].disposition).toBe(-10);
    expect(negEvents[0]).toMatchObject({ type: 'DispositionChanged', delta: -1, disposition: -10 });
  });

  it('emits nothing when already pinned at a clamp bound', () => {
    const { state, npcId } = stateWithNpc(10);
    const events: GameEvent[] = [];
    applyDisposition(state, npcId, 3, 'tribute', events);
    expect(state.npcs[0].disposition).toBe(10);
    expect(events).toHaveLength(0);
  });
});
