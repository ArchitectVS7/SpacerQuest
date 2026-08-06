import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createInitialState,
  startDay,
  type EncounterState,
  type GameState,
} from '@spacerquest/engine';
import { Stat } from '@spacerquest/content';
import { combatCheckPreview, haggleCheckPreview } from '../format';

// ---------------------------------------------------------------------------
// T-194 · THE DRIFT ALARM FOR THE TWO DCs THE UI IS FORCED TO MIRROR.
//
// WHY A MIRROR EXISTS AT ALL. Two DCs the cockpit now previews are un-exported
// literals inside their resolvers:
//
//     packages/engine/src/actions/trade.ts   `const haggleDc = 12;`
//     packages/engine/src/actions/combat.ts  `const dc = 10 + encounter.interceptor.tier;`
//
// Exporting either would move `rulesFingerprint` — `packages/sim`'s fingerprint
// hashes `packages/engine/src/**` + `packages/content/src` WHOLESALE, and T-193
// measured that ONE added line to `travel.ts` flips `balance-smoke.test.ts`'s
// "fixture is not stale" red. A readout change cannot be allowed to owe an
// 8,000-run capstone sweep, so T-194 mirrors both values in `format.ts` instead.
//
// WHY THAT IS SAFE, AND WHAT MAKES IT SO. This file. It reads the RESOLVERS' OWN
// SOURCE and asserts the literals are still what the UI mirrors — so the instant
// a balance pass retunes either DC in the engine, this test goes red and names
// the line to change, rather than the cockpit quietly advertising a stale number.
// (Reading another file as source in a UI vitest is this package's existing
// idiom: `free-actions.test.ts`, `visual-identity.test.ts`, `ci-workflow.test.ts`.)
//
// THE PROMOTION IS FILED, NOT FORGOTTEN: TASKS.md T-260 promotes both to exported
// content constants inside the next milestone's single batched content capstone,
// where one fingerprint move pays for all of them at once. When that lands, this
// file should be DELETED and the mirrors replaced by imports — not weakened.
// ---------------------------------------------------------------------------

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ENGINE_ACTIONS = join(REPO, 'packages', 'engine', 'src', 'actions');
const TRADE = readFileSync(join(ENGINE_ACTIONS, 'trade.ts'), 'utf8');
const COMBAT = readFileSync(join(ENGINE_ACTIONS, 'combat.ts'), 'utf8');

function career(seed = 1): GameState {
  return startDay(createInitialState(seed)).state;
}

function withEncounter(game: GameState, tier: number): GameState {
  const clone = JSON.parse(JSON.stringify(game)) as GameState;
  const interceptor: EncounterState['interceptor'] = {
    id: 'anon-pirate-1',
    source: 'anonymous',
    name: 'Capt.Brutus',
    shipName: 'Rustbucket',
    stats: { [Stat.PILOT]: 2, [Stat.GUNS]: 2, [Stat.TRADE]: 2, [Stat.GUILE]: 2, [Stat.GRIT]: 2 },
    tier: tier as EncounterState['interceptor']['tier'],
  };
  clone.encounter = {
    id: 'enc-1',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 2 },
    interceptor,
    routeDangerLevel: 3,
    routeDangerChance: 0.3,
    encounterRoll: 0.1,
    round: 1,
    enemyHull: 3,
  };
  return clone;
}

/** The `plan` DC the cockpit would show for a surface right now. */
function planDc(preview: ReturnType<typeof haggleCheckPreview>): number {
  expect(preview.kind).toBe('plan');
  if (preview.kind !== 'plan') throw new Error('unreachable');
  return preview.dc;
}

describe('T-194 · the haggle DC the cockpit previews is the one trade.ts rolls', () => {
  it('actions/trade.ts still declares the literal the mirror copies', () => {
    const match = TRADE.match(/const haggleDc = (\d+);/);
    expect(
      match,
      'actions/trade.ts no longer declares `const haggleDc = <n>;` — the UI mirror in format.ts (HAGGLE_DC) must be re-derived, or T-260 finally landed and this file should be deleted.',
    ).not.toBeNull();
    expect(Number(match![1])).toBe(planDc(haggleCheckPreview(career(), null)));
  });

  it('the resolver really checks TRADE against that same local', () => {
    // Guards against the alarm passing on a dead literal: the line the DC feeds is
    // asserted too, so deleting the check while keeping the constant fails here.
    expect(TRADE).toContain('check(die, nextState.player.stats[Stat.TRADE], haggleDc)');
  });
});

describe('T-194 · the combat stance DC the cockpit previews is the one combat.ts rolls', () => {
  it('actions/combat.ts still derives it as 10 + interceptor tier', () => {
    const match = COMBAT.match(/const dc = (\d+) \+ encounter\.interceptor\.tier;/);
    expect(
      match,
      'actions/combat.ts no longer derives the stance DC as `<base> + encounter.interceptor.tier` — the UI mirror in format.ts (combatStanceDc) must be re-derived, or T-260 finally landed and this file should be deleted.',
    ).not.toBeNull();
    const base = Number(match![1]);
    for (const tier of [1, 2, 3, 4, 5]) {
      const preview = combatCheckPreview(withEncounter(career(), tier), 'fight', null);
      expect(planDc(preview)).toBe(base + tier);
    }
  });

  it('the resolver really checks GUNS against that same local, and TALK shifts it', () => {
    expect(COMBAT).toContain('check(die, nextState.player.stats[Stat.GUNS], dc)');
    expect(COMBAT).toContain(
      'const talkDc = dc - TALK_DC_PER_DISPOSITION * interceptorDisposition',
    );
  });
});

describe('T-194 · the mirrors are the ONLY engine numbers this package restates', () => {
  it('format.ts declares exactly the two mirrors, each with its resolver named', () => {
    const FORMAT = readFileSync(join(REPO, 'packages', 'ui', 'src', 'format.ts'), 'utf8');
    expect(FORMAT).toContain('const HAGGLE_DC = 12;');
    expect(FORMAT).toContain('function combatStanceDc(interceptorTier: number)');
    // Each mirror must NAME the file it mirrors, or the next reader cannot find
    // the thing that would invalidate it.
    expect(FORMAT).toContain('actions/trade.ts');
    expect(FORMAT).toContain('actions/combat.ts');
    // The promotion task is named in the source, not only here.
    expect(FORMAT).toContain('T-260');
  });
});
