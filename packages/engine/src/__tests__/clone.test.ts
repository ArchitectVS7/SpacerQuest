import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cloneState } from '../clone.js';
import { advanceDay, applyPlayerAction, startDay } from '../day.js';
import { createInitialState } from '../state.js';
import { EncounterState, GameEvent, GameState, PlayerAction } from '../types.js';

// ---------------------------------------------------------------------------
// THE COPY-ON-WRITE SCAN (N3 FIRST TASK · audit item OI-8).
//
// `cloneState` SHARES NPC records between snapshots, so assigning to a field of
// a record reached through `state.npcs` writes into every earlier snapshot too.
// The sanctioned door is `mutableNpc`, which swaps in a private copy first.
//
// This scan is PROVENANCE-BASED rather than name-based, because the name-based
// version was blind three separate times (see the long note at its call site).
// It taints handles by where they CAME FROM, so neither a new handle name nor a
// new field name can walk past it.
// ---------------------------------------------------------------------------

/** A binding whose right-hand side ran the record through a real copy is no
 *  longer shared with any snapshot, so writes to it are legal. `mutableNpc` is
 *  the door; `structuredClone` / `JSON.parse` / an object spread are the three
 *  copies the engine actually uses (`resolveNpcDay` opens with the JSON one). */
const NPC_COPY_FORMS = /mutableNpc\(|structuredClone\(|JSON\.parse\(|\{\s*\.\.\./;

/** The COMPLETE set of sites that write a roster record raw. Each is safe ONLY
 *  BECAUSE OF ITS CALLER — the state is fresh and no snapshot exists yet for the
 *  write to corrupt. That is a property of the caller and not of the write, so
 *  each one carries a `COW-EXEMPT:` marker in its own source (visible to a reader
 *  of that file) AND is pinned here.
 *
 *  Pinning is deliberate: an exemption costs two edits in two files, so marking a
 *  site can never be the quiet way to silence a failing guard. `synthesize.ts` is
 *  the escapee the 2026-07-29 audit named in advance so it would not be
 *  discovered as a surprise. */
const COW_EXEMPT_SITES: readonly string[] = [
  'packages/engine/src/state.ts', // deserializeState: backfills a freshly parsed save
  'packages/sim/src/balance/synthesize.ts', // seeds a state fresh from createInitialState
];

interface SharedNpcWrite {
  file: string;
  line: number;
  text: string;
  /** The write carries an argued `COW-EXEMPT:` marker in its own source. */
  exempt: boolean;
}

/** Identifiers in `source` that hold a record shared with a live snapshot. */
function tainted(source: string): Set<string> {
  const ids = new Set<string>();
  const consider = (name: string | undefined, rhs: string | undefined): void => {
    if (!name || !rhs) return;
    if (NPC_COPY_FORMS.test(rhs)) return;
    const fromRoster = /\.npcs\b/.test(rhs);
    const fromTainted = [...ids].some((id) => new RegExp(`\\b${id}\\b`).test(rhs));
    if (fromRoster || fromTainted) ids.add(name);
  };
  // Fix-point, because taint travels more than one hop: day.ts spreads the
  // roster into a new array, shuffles it, then binds a loop variable over that.
  for (let pass = 0; pass < 4; pass += 1) {
    const before = ids.size;
    for (const m of source.matchAll(/(?:const|let|var)\s+(\w+)\s*(?::[^=;]+)?=\s*([^;]*)/g)) {
      consider(m[1], m[2]);
    }
    for (const m of source.matchAll(/for\s*\(\s*(?:const|let)\s+(\w+)\s+of\s+([^)]*)\)/g)) {
      consider(m[1], m[2]);
    }
    // A callback parameter over a roster expression: `.npcs.forEach((npc) => …)`.
    for (const m of source.matchAll(
      /\.npcs\b[\s\S]{0,80}?\.(?:forEach|map|filter|flatMap|find|some|every|reduce)\(\s*\(?\s*(\w+)/g,
    )) {
      ids.add(m[1]);
    }
    if (ids.size === before) break;
  }
  return ids;
}

/** Every assignment down a member path rooted at a shared NPC record. */
export function sharedNpcWrites(source: string, file = '<source>'): SharedNpcWrite[] {
  const ids = tainted(source);
  if (ids.size === 0) return [];
  // `(?<![.\w$])` — the handle must be the ROOT of the path, not a property
  // segment inside someone else's: a tainted handle named `legacy` must not
  // match `parsed.player.legacy.successionCount ??= 0`.
  // Assignment operators only. A comparison (`>=`, `===`) is a legal read.
  const pattern = new RegExp(
    `(?<![.\\w$])(${[...ids].join('|')})((?:\\.\\w+|\\[[^\\]]*\\])+)\\s*(?:\\?\\?=|[-+*/|&]=|=(?!=))`,
    'g',
  );
  const ranges = exemptRanges(source);
  const found: SharedNpcWrite[] = [];
  for (const m of source.matchAll(pattern)) {
    const line = source.slice(0, m.index).split('\n').length;
    const exempt = ranges.some(([from, to]) => line >= from && line <= to);
    found.push({ file, line, text: m[0].trim(), exempt });
  }
  return found;
}

/** Line ranges covered by a `COW-EXEMPT:` marker — the marker's own line through
 *  the end of the block it introduces.
 *
 *  SCOPED BY BLOCK, NOT BY PROXIMITY, and the difference matters: a fixed
 *  "N lines below the comment" window either fails to reach the bottom of a real
 *  loop body or silently swallows the next unrelated write that drifts near it.
 *  Tying the exemption to the braces means the argument covers exactly the code
 *  it was written about, and a new write appended AFTER the block is an offender
 *  again — which is the behaviour a reader of the marker would expect. */
function exemptRanges(source: string): Array<[number, number]> {
  const lines = source.split('\n');
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes('COW-EXEMPT:')) continue;
    // Walk forward to the first brace that opens a block, then to its match.
    let depth = 0;
    let opened = false;
    let end = i + 1;
    for (let j = i; j < lines.length; j += 1) {
      for (const ch of lines[j]) {
        if (ch === '{') {
          depth += 1;
          opened = true;
        } else if (ch === '}') depth -= 1;
      }
      if (opened && depth <= 0) {
        end = j + 1;
        break;
      }
    }
    ranges.push([i + 1, end]);
  }
  return ranges;
}

/** Run {@link sharedNpcWrites} over every non-test source in engine and sim.
 *  `packages/sim` is in scope because it drives the same records through the
 *  same clone discipline, and it was entirely unscanned before N3. */
function scanRepoForSharedNpcWrites(): SharedNpcWrite[] {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const found: SharedNpcWrite[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['__tests__', 'node_modules', 'dist'].includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) continue;
      const rel = relative(repoRoot, full).split(sep).join('/');
      const source = readFileSync(full, 'utf8');
      if (!/\.npcs\b/.test(source)) continue;
      found.push(...sharedNpcWrites(source, rel));
    }
  };
  walk(join(repoRoot, 'packages', 'engine', 'src'));
  walk(join(repoRoot, 'packages', 'sim', 'src'));
  return found;
}

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
    // no file may assign to a field of a record pulled out of `state.npcs`.
    // Go through `mutableNpc`, which swaps in a private copy first.
    //
    // N3 FIRST TASK · WIDENED BY SHAPE, WHICH IS THE WHOLE POINT. This scan has
    // now been blind three times, and every previous fix added a name to a list:
    //   · N0 asserted ONE cross-boundary writer and there were FOUR — a grep keyed
    //     on VARIABLE names missed `dealerNpc.credits` and three `rescuer.*`.
    //   · N1 found it blind to NESTED paths — `rescuer.ship.fuel -= n` was
    //     structurally invisible to a `handle.field =` pattern.
    //   · The 2026-07-29 audit (OI-8) found the third: it scanned only `day.ts`,
    //     `storylets.ts` and `actions/*.ts`, and matched hard-coded allowlists of
    //     BOTH handle names and field names — so a writer named `captain`, or a
    //     write to `name` or `profileId`, walked straight past it, and `npc.ts`,
    //     `state.ts` and the whole of `packages/sim` were never read at all.
    //
    // So the pattern is no longer "names we thought of". It is PROVENANCE: taint
    // any handle bound from a `.npcs` read, propagate the taint through
    // re-bindings and aliases, and untaint only what demonstrably went through a
    // copy. A write down a member path rooted at a tainted handle is an offender
    // whatever it or its field is called. `sharedNpcWrites` is exported to the
    // sibling test below, which proves the scan has teeth by running it over
    // sources containing each of the three historical blind spots.
    const writes = scanRepoForSharedNpcWrites();
    expect(
      writes.filter((w) => !w.exempt).map((w) => `${w.file}:${w.line} ${w.text}`),
      'cross-boundary NPC writes must go through mutableNpc',
    ).toEqual([]);

    // And the argued exemptions are exactly the two on the pinned list — a NEW
    // raw writer cannot hide behind a `COW-EXEMPT:` comment without also being
    // added here, in a different file, on purpose.
    expect(
      [...new Set(writes.filter((w) => w.exempt).map((w) => w.file))].sort(),
      'a COW-EXEMPT marker requires a pinned entry in COW_EXEMPT_SITES',
    ).toEqual([...COW_EXEMPT_SITES].sort());
  });

  it('the copy-on-write scan catches all three of its historical blind spots', () => {
    // The scan above is only worth its runtime if it FAILS on a real violation.
    // Each case below is a shape that the pre-N3 name-based scan let through;
    // asserting them here means a future "simplification" of the pattern cannot
    // quietly re-open a hole that has already cost this track three findings.
    const cases: Array<{ why: string; source: string }> = [
      {
        why: 'a handle name nobody put on the allowlist',
        source: `
          const captain = state.npcs.find((n) => n.id === id);
          captain.credits += 500;
        `,
      },
      {
        why: 'a field name nobody put on the allowlist',
        source: `
          const rec = state.npcs.find((n) => n.id === id);
          rec.profileId = 'npc-someone-else';
        `,
      },
      {
        why: 'a nested write down a path (the N1 blind spot)',
        source: `
          const rescuer = nextState.npcs.find((n) => n.id === id);
          rescuer.ship.fuel -= amount;
        `,
      },
      {
        why: 'taint laundered through an alias cast',
        source: `
          const found = state.npcs[0];
          const alias = found as unknown as { dead?: boolean };
          alias.dead = true;
        `,
      },
      {
        why: 'taint carried through a spread-into-array and a loop',
        source: `
          const order = rng.shuffle([...nextState.npcs]);
          for (const member of order) {
            member.disposition = 0;
          }
        `,
      },
      {
        why: 'a forEach callback parameter over the roster',
        source: `
          state.npcs.forEach((entry) => {
            entry.currentSystemId = 3;
          });
        `,
      },
    ];
    for (const { why, source } of cases) {
      expect(sharedNpcWrites(source), `scan must catch: ${why}`).not.toEqual([]);
    }

    // …and must NOT fire on the sanctioned door, or on a read.
    const legal: Array<{ why: string; source: string }> = [
      {
        why: 'the mutableNpc door',
        source: `
          const target = mutableNpc(nextState, id);
          target.ship.fuel -= amount;
        `,
      },
      {
        why: 'a private copy taken by the subject-copying resolver',
        source: `
          const updatedNpc = JSON.parse(JSON.stringify(npc)) as NpcState;
          updatedNpc.credits += 100;
        `,
      },
      {
        why: 'a comparison, which is a legal read on a shared record',
        source: `
          const rescuer = nextState.npcs.find((n) => n.id === id);
          if (rescuer.ship.fuel >= hook.minRescuerFuel) return;
        `,
      },
      {
        why: 'a tainted name appearing as someone else’s property segment',
        source: `
          const legacy = state.npcs[0] as unknown as { fuel?: unknown };
          parsed.player.legacy.successionCount ??= 0;
        `,
      },
    ];
    for (const { why, source } of legal) {
      expect(sharedNpcWrites(source), `scan must NOT fire on: ${why}`).toEqual([]);
    }
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
