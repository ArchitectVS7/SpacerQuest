import { GameState } from './types.js';

/**
 * Snapshot a GameState for EVERY copy-on-write resolver — day.ts, storylets.ts
 * and all of actions/. Pure: the input is never touched.
 *
 * T-1605c · This used to name four call sites by hand ("day.ts, storylets.ts,
 * actions/combat.ts, actions/shipyard.ts"), and that stale list is exactly why
 * six resolvers drifted: trade, travel, crew (x2), exploration, hangout and port
 * were still deep-copying the whole event log on every player action, costing
 * 206.7 ms/day at day 1,000 and 107.2 s for a 1,000-day career (vs 8.6 ms/day
 * and 4.7 s once they all came through here — measured both ways, same 94,054
 * events). So the list is no longer maintained by hand:
 * `__tests__/clone.test.ts` enforces it structurally, with an identity
 * table through `applyPlayerAction` (every pre-existing log entry must survive a
 * verb by object identity) plus a source scan that fails any file under
 * actions/ — or day.ts / storylets.ts — containing a raw
 * `JSON.parse(JSON.stringify(state))`. Add a resolver, and the scan holds it to
 * this function without anyone having to remember.
 *
 * PERF (why this is not a plain `JSON.parse(JSON.stringify(state))`): `eventLog`
 * is the only unbounded field on GameState — a 300-day career reaches ~27,000
 * events / ~3.4 MB, while every other field together stays around 12 KB. The
 * resolvers clone six-plus times per simulated day, so deep-copying the log made
 * a day cost O(days-so-far) and a career cost O(days^2): a 300-day sim spent
 * ~99% of its time in the JSON round-trip and burned minutes per test file.
 *
 * The log is append-only — `appendEvents` in day.ts is the sole writer and it
 * only ever `push`es freshly built events; nothing in the engine or the UI
 * mutates an event after it is logged. So a snapshot only has to protect against
 * the *array* being appended to, which `slice()` does for the cost of one
 * pointer copy per entry. The events themselves stay shared, immutable, and
 * cheap.
 *
 * The stub keeps `eventLog` in its original key position so the clone's key
 * order — and therefore `serializeState`'s output for the replay goldens —
 * matches what a full round-trip produced.
 *
 * ---------------------------------------------------------------------------
 * `npcs` GETS THE SAME TREATMENT, AND FOR A SHARPER REASON. The event log was
 * excluded because it is unbounded; the NPC roster is excluded because it is
 * about to get FAT. Making each of the 30 captains a real player — their own
 * ship, their own components — takes this state from 6.8 KB to 22.2 KB, and a
 * measured `cloneState` from 0.029 ms to 0.104 ms. Every player action pays that,
 * four or five times a day, to copy thirty captains it will not touch.
 *
 * THE RULE THIS RELIES ON, and it is narrow enough to enforce: an NPC record is
 * mutated in exactly two places. Its own turn (`resolveNpcDay`) already works on
 * a private copy and is handed back by assignment in day.ts, and
 * `applyDisposition` — the one cross-boundary writer — now REPLACES the array
 * entry with a fresh record instead of mutating it in place. Nothing else in the
 * engine writes to an NPC. `__tests__/clone.test.ts` holds that line by identity,
 * the same way it already holds the event log's.
 *
 * MEASURED: 0.0955 ms → 0.0082 ms per clone with fat NPC records, and — the part
 * that matters for scaling — FLAT in NPC count instead of linear, which is what
 * stops "thirty captains each acting" from being quadratic.
 * ---------------------------------------------------------------------------
 */
export function cloneState(state: GameState): GameState {
  const stub: GameState = { ...state, eventLog: [], npcs: [] };
  const cloned = JSON.parse(JSON.stringify(stub)) as GameState;
  cloned.eventLog = state.eventLog.slice();
  // A fresh ARRAY (so an assignment into it cannot reach the previous snapshot)
  // holding the SAME record objects (so no captain is deep-copied for nothing).
  cloned.npcs = state.npcs.slice();
  return cloned;
}
