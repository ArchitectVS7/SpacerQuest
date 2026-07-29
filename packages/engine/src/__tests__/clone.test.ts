import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone.js';
import { advanceDay, applyPlayerAction, startDay } from '../day.js';
import { createInitialState } from '../state.js';
import { EncounterState, GameEvent, GameState, PlayerAction } from '../types.js';

/** A state with a non-trivial event log and mutated nested containers. */
function playedState(days: number): GameState {
  let state = createInitialState(1);
  for (let day = 0; day < days; day += 1) {
    state = advanceDay(state, [{ type: 'Wait' }]).state;
  }
  return state;
}

// ---------------------------------------------------------------------------
// cloneState is the copy-on-write snapshot behind day.ts, storylets.ts,
// actions/combat.ts and actions/shipyard.ts. It has two obligations, and both
// are asserted here because breaking either is silent at the type level:
//   1. PURITY — nothing the resolvers do to the snapshot may reach the input.
//   2. COST — the append-only eventLog must be pointer-copied, not deep-copied.
//      It was a `JSON.parse(JSON.stringify(state))` before, which made every
//      simulated day cost O(days-so-far): a 300-day sim reached ~27,000 events /
//      ~3.4 MB (against ~12 KB for every other field combined) and spent ~99% of
//      its runtime in the round-trip, pushing `npm test` past ten minutes.
// ---------------------------------------------------------------------------
describe('cloneState (copy-on-write snapshot)', () => {
  it('produces a value-equal snapshot', () => {
    const state = playedState(12);
    expect(cloneState(state)).toEqual(state);
  });

  it('keeps the eventLog entries shared rather than deep-copied (the O(1)-per-event contract)', () => {
    const state = playedState(12);
    expect(state.eventLog.length).toBeGreaterThan(0);

    const clone = cloneState(state);

    // Same entries, by identity — this is what makes a clone cost one pointer
    // copy per event instead of a full serialize+parse of the whole log.
    expect(clone.eventLog).not.toBe(state.eventLog);
    for (let i = 0; i < state.eventLog.length; i += 1) {
      expect(clone.eventLog[i]).toBe(state.eventLog[i]);
    }
  });

  it('does not deep-copy the log yet still isolates appends to it', () => {
    const state = playedState(6);
    const before = state.eventLog.length;

    const clone = cloneState(state);
    const appended: GameEvent = {
      type: 'WireEntry',
      day: 999,
      message: 'clone-test entry',
      kind: 'plain',
    };
    clone.eventLog.push(appended);

    expect(clone.eventLog.length).toBe(before + 1);
    expect(state.eventLog.length).toBe(before);
  });

  it('deep-copies every non-log, non-npc field, so nested writes never reach the source', () => {
    const state = playedState(6);
    const credits = state.player.credits;

    const clone = cloneState(state);
    clone.player.credits = credits + 5_000;
    clone.flags['clone-test-flag'] = true;

    expect(state.player.credits).toBe(credits);
    expect(state.flags['clone-test-flag']).toBeUndefined();
  });

  it('SHARES npc records but not the npc ARRAY, so a swap cannot reach the source', () => {
    // The contract `mutableNpc` depends on. The array must be fresh (so assigning
    // into it is safe) while the records are shared (so a player action does not
    // deep-copy thirty captains it will never touch).
    const state = playedState(6);
    const clone = cloneState(state);

    expect(clone.npcs).not.toBe(state.npcs);
    expect(clone.npcs[0]).toBe(state.npcs[0]);

    const replacement = { ...state.npcs[0], disposition: state.npcs[0].disposition + 7 };
    clone.npcs[0] = replacement;
    expect(state.npcs[0]).not.toBe(replacement);
  });

  it('routes every cross-boundary NPC write through mutableNpc', () => {
    // THE STRUCTURAL GUARD, and it exists because this exact bug shipped once
    // already: `storylets.ts` computed a clamped disposition delta by reading its
    // own handle AFTER applyDisposition swapped the entry, and reported 0 for
    // every clamped change. A source scan is the only thing that catches the next
    // one, since a stale read is silent — it produces a plausible wrong number.
    //
    // The rule: outside `resolveNpcDay` (which opens by copying its own subject),
    // no engine file may assign to a field of a record pulled out of `state.npcs`.
    // Go through `mutableNpc`, which swaps in a private copy first.
    const engineDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = [
      'day.ts',
      'storylets.ts',
      ...readdirSync(join(engineDir, 'actions'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => join('actions', f)),
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const source = readFileSync(join(engineDir, rel), 'utf8');
      // A write anywhere down a member path rooted at something that reads like
      // an NPC handle. N1 · the path form is load-bearing: the record grew a
      // `ship`, so the writes to watch are now NESTED (`rescuer.ship.fuel -= n`)
      // and a pattern that only matched `handle.field =` would have gone quiet on
      // exactly the field this step added. The N0 lesson, again: grep the FIELD,
      // not the variable — so `ship` is in the field list below and the path may
      // continue past it.
      //
      // Assignment operators only (`=` not followed by `=`, or a compound `+=` /
      // `-=` / `*=` / `/=`). Comparisons must not match: `rescuer.ship.fuel >=
      // hook.minRescuerFuel` is a READ and is legal on a shared record.
      const pattern =
        /\b(dealerNpc|dealer|rescuer|npc|named|lender|targetNpc|dealerPurse)\.(credits|fuel|disposition|currentSystemId|lastAction|ship)(?:\.\w+)*\s*(?:[-+*/]=|=[^=])/g;
      for (const match of source.matchAll(pattern)) {
        const line = source.slice(0, match.index).split('\n').length;
        // The handle is legitimate if it was BOUND from `mutableNpc` anywhere in
        // the file — that call is what swapped a private copy into the roster, so
        // writing to what it returned is exactly the sanctioned path. Checked by
        // binding rather than by proximity: the rescuer's writes sit ~50 lines
        // below its binding, and a character-window heuristic flagged them.
        const handle = match[1];
        const bound = new RegExp(`(?:const|let)\\s+${handle}\\s*=[^;]*mutableNpc\\(`, 's');
        if (bound.test(source)) continue;
        offenders.push(`${rel}:${line} ${match[0].trim()}`);
      }
    }
    expect(offenders, `cross-boundary NPC writes must go through mutableNpc`).toEqual([]);
  });

  it('leaves the input state untouched when the real day loop runs on it', () => {
    const state = playedState(6);
    const snapshot = JSON.stringify(state);

    advanceDay(state, [{ type: 'Wait' }]);

    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// T-1605c · THE RESOLVER-SIDE HALF OF THE SAME CONTRACT.
//
// The suite above proves `cloneState` is O(1)-per-event. It does NOT prove the
// resolvers actually call it — and that is exactly how six of them silently
// drifted back to a full `JSON.parse(JSON.stringify(state))` after `clone.ts`
// landed: `resolveTrade`, `resolveTravel`, `resolveCrew`, `resolveReroll`,
// `resolveExploration`, `resolveVisitHangout` and `resolvePortPurchase` each
// deep-copied the whole event log on every player action. Measured BOTH WAYS on
// a 1,000-day `veteran` career (Windows 10 / Node 22.16): 206.7 ms per day at
// day 1,000 and 107.2 s for the career, against 8.6 ms/day and 4.7 s once every
// site went through `cloneState` — a 23x career-level regression. Both runs
// produced the identical 94,054-event log, so this is pure cost, not behaviour.
//
// Two guards, both DETERMINISTIC (no wall clock, so neither can flake):
//   A. An identity table through the real `applyPlayerAction` entry point: after
//      any verb, every pre-existing log entry must still be the SAME OBJECT.
//      That is only possible if the whole clone chain pointer-copies the log, so
//      it proves per-action cost is O(1) in log length without timing anything.
//   B. A source scan, so a NEWLY ADDED resolver the table does not know about
//      still cannot reintroduce the deep copy. Precedent for reading engine
//      sources from a test: npc.test.ts and reputation.test.ts both do it.
//
// The wall-clock statement of the same claim lives in
// packages/sim/src/__tests__/long-career-perf.test.ts; this pair is its
// deterministic backstop, so a flake there is never the only thing protecting
// the fix.
// ---------------------------------------------------------------------------

/** A DAY-phase state with a non-trivial log and a live dawn hand — the shape
 *  `applyPlayerAction` actually runs against. */
function dayState(days: number): GameState {
  return startDay(playedState(days)).state;
}

function fixtureEncounter(): EncounterState {
  return {
    id: 'enc-clone-perf',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-clone',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

interface ResolverRow {
  /** Row label — one per member of the PlayerAction union, plus refusal paths. */
  readonly name: string;
  /** Minimal in-place setup on an already-built DAY-phase state. */
  readonly setup?: (state: GameState) => void;
  readonly action: PlayerAction;
}

/**
 * One row per `PlayerAction` member. Refusal paths are covered deliberately: a
 * typed fail (an unknown crew role, a Reroll with no charges, an unavailable
 * storylet) still returns a CLONED state, so it owes exactly the same contract
 * as a commit — and a refusal is the cheapest thing a player can do, so it is
 * the last place that should cost O(log length).
 */
const RESOLVER_ROWS: readonly ResolverRow[] = [
  {
    name: 'Trade (buy-fuel, commits)',
    setup: (state) => {
      state.player.credits = 50_000;
      state.market.localFuelPrice = 5;
    },
    action: { type: 'Trade', action: 'buy-fuel', fuelAmount: 1, spendDie: 0 },
  },
  {
    name: 'Travel (jump to an adjacent system)',
    setup: (state) => {
      state.player.ship.fuel = state.player.ship.maxFuel;
    },
    action: { type: 'Travel', destinationId: 2, spendDie: 0 },
  },
  {
    name: 'Crew (hire)',
    setup: (state) => {
      state.player.credits = 50_000;
    },
    action: { type: 'Crew', action: 'hire', roleId: 'crew-navigator', spendDie: 0 },
  },
  {
    name: 'Crew (REFUSAL — unknown role, nothing spent)',
    action: { type: 'Crew', action: 'hire', roleId: 'crew-does-not-exist', spendDie: 0 },
  },
  {
    name: 'Reroll (REFUSAL — no charges left)',
    action: { type: 'Reroll', dieIndex: 0 },
  },
  {
    name: 'Explore',
    setup: (state) => {
      state.player.ship.fuel = state.player.ship.maxFuel;
    },
    action: { type: 'Explore', spendDie: 0 },
  },
  {
    name: 'VisitHangout (rumor at Sun-3)',
    setup: (state) => {
      state.player.currentSystemId = 1;
    },
    action: { type: 'VisitHangout', venue: 'rumor', spendDie: 0 },
  },
  {
    name: 'Port (buy the local stake)',
    setup: (state) => {
      state.player.currentSystemId = 1;
      state.player.credits = 500_000;
    },
    action: { type: 'Port', action: 'buy', systemId: 1, spendDie: 0 },
  },
  {
    name: 'Combat (talk down an active interceptor)',
    setup: (state) => {
      state.encounter = fixtureEncounter();
    },
    action: { type: 'Combat', stance: 'talk', targetId: 'anon-pirate-clone', spendDie: 0 },
  },
  {
    name: 'Shipyard (repair)',
    setup: (state) => {
      state.player.credits = 50_000;
      state.player.ship.hull.condition = 4;
    },
    action: { type: 'Shipyard', action: 'repair', repairMode: 'all', spendDie: 0 },
  },
  {
    name: 'Storylet (REFUSAL — not on offer)',
    action: { type: 'Storylet', storyletId: 'no-such-storylet', choiceId: 'no-such-choice' },
  },
  { name: 'Wait', action: { type: 'Wait' } },
];

describe('T-1605c · every copy-on-write resolver shares the event log', () => {
  it.each(RESOLVER_ROWS.map((row) => [row.name, row] as const))(
    '%s preserves every pre-existing log entry by identity',
    (_name, row) => {
      const state = dayState(12);
      row.setup?.(state);

      const before = state.eventLog.slice();
      expect(before.length).toBeGreaterThan(50);

      const result = applyPlayerAction(state, row.action);

      // The log is append-only, so the action may only ADD entries...
      expect(result.state.eventLog.length).toBeGreaterThanOrEqual(before.length);
      // ...and every entry that was already there must be the SAME OBJECT. A
      // deep copy anywhere in the clone chain fails here, which is the whole
      // point: this asserts per-action cost is O(1) in log length with no timer.
      for (let i = 0; i < before.length; i += 1) {
        expect(result.state.eventLog[i]).toBe(before[i]);
      }
      // The input state is still untouched (purity, unchanged by the perf work).
      expect(state.eventLog.length).toBe(before.length);
    },
  );

  it('names every PlayerAction member, so a new verb cannot slip past the table', () => {
    const covered = [...new Set(RESOLVER_ROWS.map((row) => row.action.type))].sort();
    // Kept in lockstep with the PlayerAction union in types.ts by hand — the
    // union is a type, not a value, so there is nothing to enumerate at runtime.
    expect(covered).toEqual(
      [
        'Combat',
        'Crew',
        'Explore',
        'Port',
        'Reroll',
        'Shipyard',
        'Storylet',
        'Trade',
        'Travel',
        'VisitHangout',
        'Wait',
      ].sort(),
    );
  });

  // -------------------------------------------------------------------------
  // GUARD B — the source scan. The identity table above only covers resolvers
  // it already knows about; this catches a brand-new one on the day it is
  // written, which is the failure mode that produced this task.
  // -------------------------------------------------------------------------
  it('no copy-on-write resolver deep-copies the whole state (source scan)', () => {
    const srcDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const actionFiles = readdirSync(join(srcDir, 'actions'))
      .filter((name) => name.endsWith('.ts'))
      .map((name) => join('actions', name));
    // day.ts and storylets.ts host resolvers too (the day loop's own snapshot
    // and resolveStoryletChoice). npc.ts is DELIBERATELY outside the scanned
    // set: its `JSON.parse(JSON.stringify(npc))` clones a single NpcState, which
    // carries no event log and is not a GameState snapshot. N1 grew that record
    // ~10x (it owns a ShipState now) and the round trip is still the cheapest
    // deep copy of it measured — `structuredClone` costs ~12% MORE per ambient
    // game day (0.355 -> 0.399 ms over 10 seeds x 120 days, re-measured
    // 2026-07-29 under OI-1; see the note at npc.ts `resolveNpcDay`). The scan's
    // exclusion is about the event log, and that reasoning is unchanged.
    const files = [...actionFiles, 'day.ts', 'storylets.ts'];
    expect(actionFiles.length).toBeGreaterThan(5);

    const offenders = files.filter((relative) =>
      readFileSync(join(srcDir, relative), 'utf8').includes('JSON.parse(JSON.stringify(state))'),
    );

    expect(
      offenders,
      'these files deep-copy the whole GameState (and with it the unbounded ' +
        'eventLog) — use cloneState from clone.ts instead',
    ).toEqual([]);
  });
});
