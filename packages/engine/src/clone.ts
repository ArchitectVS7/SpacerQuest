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
 */
export function cloneState(state: GameState): GameState {
  const stub: GameState = { ...state, eventLog: [] };
  const cloned = JSON.parse(JSON.stringify(stub)) as GameState;
  cloned.eventLog = state.eventLog.slice();
  return cloned;
}
