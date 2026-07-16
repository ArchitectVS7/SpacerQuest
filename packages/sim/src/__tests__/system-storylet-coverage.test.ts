import { describe, expect, it } from 'vitest';
import { STORYLETS, distance, type StoryletDefinition } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  eligibleStorylets,
  endDay,
  startDay,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-1501 · Per-system storylet reachability sweep.
//
// Acceptance: "every core+rim system has ≥1 storylet reachable in a 500-day sim
// sweep (rim reachability is now real)". A system is COVERED when, while the ship
// is docked there during honest headless play, `eligibleStorylets(state)` offers
// at least one storylet whose trigger is keyed to that system (`trigger.systemIds`
// includes it). The T-1501 batch's nine mandatory port beats are systemIds-only
// with no era/day/cargo/flag gate, so they land the instant the hunter docks; the
// only work is getting the ship to each of the twenty systems.
//
// HONESTY (per the project's global playtest rules, mirrored from
// storylet-coverage.test.ts): the hunter reaches every system through LEGAL engine
// actions only — Travel / Trade (sign-contract, buy-fuel) / Shipyard
// (buy-component-tier) / Combat. It NEVER pokes state.flags, state.day,
// currentSystemId, activeContract, cargo, or eraEvent to force eligibility. It
// plays like a real captain would: it hauls cargo for income, and — the veteran
// move the frontier demands — it buys a drive upgrade so the rim stops being a
// fuel trap (starter drives burn ~13 fuel/unit, so a distance-20 rim jump costs
// ~260 fuel ≈ a full tank; a tier-3 drive, ~150cr after trade-in, cuts that to
// ~2/unit, which is exactly how the rim becomes routinely reachable). If a system
// were unreachable, the fix would be to re-author a storylet trigger or the map,
// not to poke state.
// ---------------------------------------------------------------------------

const CORE_SYSTEMS = Array.from({ length: 14 }, (_, i) => i + 1); // 1..14
const RIM_SYSTEMS = [15, 16, 17, 18, 19, 20];
const ALL_SYSTEMS = [...CORE_SYSTEMS, ...RIM_SYSTEMS];
const TARGET_SET = new Set(ALL_SYSTEMS);
const CORE_SET = new Set(CORE_SYSTEMS);

const BY_ID = new Map<string, StoryletDefinition>(STORYLETS.map((s) => [s.id, s]));

// Each rim system's nearest CORE stepping stone — the cheap short hop the hunter
// stages a rim visit through, rather than a ruinous direct jump from wherever it
// happens to be (the same Vega-6 → Antares-5 pattern storylet-coverage.test uses).
const RIM_STEPPING_STONE: Record<number, number> = {
  15: 14, // Antares-5  ← Vega-6
  16: 12, // Capella-4  ← Rigel-8
  17: 13, // Polaris-1  ← Spica-3
  18: 8, // Mizar-9    ← Mira-9
  19: 11, // Achernar-5 ← Regulus-6
  20: 13, // Algol-2    ← Spica-3
};

const DRIVES_PER_UNIT_STARTER = 13; // fuel/unit at the junker's starter drives

/** First unspent die index in the dawn hand, or undefined if spent/absent. */
function freeDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i]) return i;
  }
  return undefined;
}

/** Highest-value unspent die — jumps spend this so the hunter clears longer hops
 *  (the rim jumps especially) as reliably as the hand allows. */
function bestDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  let bestIndex: number | undefined;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      bestIndex = i;
    }
  }
  return bestIndex;
}

/** Nearest system in `pool` to `here` by real 2D route distance. */
function nearest(here: number, pool: readonly number[]): number {
  let best = pool[0];
  let bestDist = Infinity;
  for (const sys of pool) {
    const d = distance(here, sys);
    if (d < bestDist) {
      bestDist = d;
      best = sys;
    }
  }
  return best;
}

/** Clear any active encounter so Travel/Trade unblock. Talk completes the
 *  interrupted jump; run only aborts to origin, so prefer talk, falling back to
 *  run when the fuel is there. */
function clearEncounter(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.encounter && guard < 8) {
    guard += 1;
    const die = freeDie(s);
    if (die === undefined) break;
    const targetId = s.encounter.interceptor.id;
    const stance: 'talk' | 'run' = guard <= 3 ? 'talk' : s.player.ship.fuel >= 100 ? 'run' : 'talk';
    s = applyPlayerAction(s, { type: 'Combat', stance, targetId, spendDie: die }).state;
  }
  return s;
}

/** Buy just enough fuel to cover the hop to `dest` (plus a small margin), clamped
 *  to the tank and the purse. Sized to the jump — not filled to the brim — so the
 *  hunter never over-spends a delivery's profit on fuel it will not burn. */
function ensureFuelFor(state: GameState, dest: number): GameState {
  const roughCost = Math.ceil(distance(state.player.currentSystemId, dest) * perUnit(state));
  const need = Math.min(state.player.ship.maxFuel, roughCost + 30);
  if (state.player.ship.fuel >= need) return state;
  const price = state.market.localFuelPrice || 5;
  const want = need - state.player.ship.fuel;
  const affordable = Math.floor(state.player.credits / price);
  const units = Math.max(0, Math.min(want, affordable));
  if (units < 1) return state;
  const die = freeDie(state);
  if (die === undefined) return state;
  return applyPlayerAction(state, {
    type: 'Trade',
    action: 'buy-fuel',
    fuelAmount: units,
    spendDie: die,
  }).state;
}

/** Fuel burned per distance-unit at the ship's current drives — the engine's
 *  jumpFuelCost math (21 − min(strength,21) + (10 − condition)), floored at 1.
 *  Read only, to size fuel purchases; the engine remains the authority on the
 *  real deduction. */
function perUnit(state: GameState): number {
  const drives = state.player.ship.drives;
  const af = Math.min(drives.strength, 21);
  return Math.max(1, 21 - af + (10 - drives.condition));
}

/** Fly to `dest`, completing the jump through any encounter. A no-op when already
 *  there or out of dice/fuel (retried the next dawn). */
function travelTo(state: GameState, dest: number): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);
  if (s.player.currentSystemId === dest) return s;
  s = ensureFuelFor(s, dest);
  const die = bestDie(s);
  if (die === undefined) return s;
  s = applyPlayerAction(s, { type: 'Travel', destinationId: dest, spendDie: die }).state;
  if (s.encounter) s = clearEncounter(s); // complete the jump the same day if intercepted
  return s;
}

/** Sign an affordable contract bound for a CORE destination — a short,
 *  profitable, deliverable-now run (never a rim/contraband haul whose fuel the
 *  hunter cannot yet fund). Returns unchanged state when the board has none. */
function signCoreContract(state: GameState): GameState {
  const die = freeDie(state);
  if (die === undefined || state.player.activeContract) return state;
  const here = state.player.currentSystemId;
  const price = state.market.localFuelPrice || 5;
  let bestIdx = -1;
  let bestDist = Infinity;
  state.market.manifestBoard.forEach((c, i) => {
    if (!CORE_SET.has(c.destination)) return;
    const roughFuel = distance(here, c.destination) * DRIVES_PER_UNIT_STARTER;
    if (roughFuel * price > state.player.credits + 200) return; // must be affordable
    const d = distance(here, c.destination);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  });
  if (bestIdx < 0) return state;
  return applyPlayerAction(state, {
    type: 'Trade',
    action: 'sign-contract',
    contractIndex: bestIdx,
    spendDie: die,
  }).state;
}

/** Earn: sign a core-bound contract and deliver it (income + covers its
 *  destination). If no affordable contract is on this board, hop to the nearest
 *  other core system to reroll a fresh board. */
function earn(state: GameState): GameState {
  const signed = signCoreContract(state);
  if (signed.player.activeContract) {
    return travelTo(signed, signed.player.activeContract.destination);
  }
  const here = signed.player.currentSystemId;
  return travelTo(
    signed,
    nearest(
      here,
      CORE_SYSTEMS.filter((x) => x !== here),
    ),
  );
}

/** Buy the tier-3 drive (strength 30 → ~1–2 fuel/unit). Cheap (~150cr after
 *  trade-in) and the single biggest lever on rim reachability. */
function upgradeDrives(state: GameState): GameState {
  const die = freeDie(state);
  if (die === undefined) return state;
  return applyPlayerAction(state, {
    type: 'Shipyard',
    action: 'buy-component-tier',
    component: 'drives',
    tier: 3,
    spendDie: die,
  }).state;
}

/** True when a storylet keyed to the ship's current system is eligible RIGHT NOW
 *  — the definition of "this system is covered". */
function systemCoveredNow(s: GameState): boolean {
  const here = s.player.currentSystemId;
  return eligibleStorylets(s).some((offer) =>
    (BY_ID.get(offer.storyletId)?.trigger.systemIds ?? []).includes(here),
  );
}

/** One day of the coverage hunter, in priority order:
 *   1. Deliver a held contract (income + covers its destination).
 *   2. Buy the tier-3 drive once affordable (makes the rim cheap to reach).
 *   3. Tour uncovered CORE systems (funded side-trips when solvent, else earn).
 *   4. Tour uncovered RIM systems via their core stepping stone (earn when low).
 * Every branch uses only legal engine actions. */
function planDay(state: GameState, covered: ReadonlySet<number>): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);

  if (s.player.activeContract) return travelTo(s, s.player.activeContract.destination);

  if (s.player.ship.drives.strength < 30 && s.player.credits >= 300) {
    const upgraded = upgradeDrives(s);
    if (upgraded.player.ship.drives.strength >= 30) s = upgraded;
  }

  const here = s.player.currentSystemId;
  const uncoveredCore = CORE_SYSTEMS.filter((x) => !covered.has(x));
  const uncoveredRim = RIM_SYSTEMS.filter((x) => !covered.has(x));

  if (uncoveredCore.length > 0) {
    if (s.player.credits >= 800) return travelTo(s, nearest(here, uncoveredCore));
    return earn(s);
  }

  if (uncoveredRim.length > 0) {
    if (s.player.credits < 1200) return earn(s);
    const target = nearest(here, uncoveredRim);
    const stone = RIM_STEPPING_STONE[target];
    if (here !== stone && here !== target) return travelTo(s, stone);
    return travelTo(s, target);
  }

  return s;
}

/** Drive one seed for up to `maxDays`, accumulating covered system ids. Stops
 *  early once every system is covered. */
function runSeed(seed: number, maxDays: number, covered: Set<number>): void {
  let state = createInitialState(seed);
  for (let day = 0; day < maxDays; day += 1) {
    let s = startDay(state).state;
    if (s.encounter) s = clearEncounter(s);

    // Record coverage for wherever the ship woke up (system 1 on day 1 is covered
    // here, still in Tour One, by the guild-auditor beat).
    if (systemCoveredNow(s)) covered.add(s.player.currentSystemId);

    if (covered.size < TARGET_SET.size) {
      s = planDay(s, covered);
      if (systemCoveredNow(s)) covered.add(s.player.currentSystemId);
    }

    state = endDay(s).state;
    if (covered.size === TARGET_SET.size) break;
  }
}

describe('T-1501 per-system storylet reachability (500-day seed sweep)', () => {
  it('reaches ≥1 storylet at every core+rim system through legal headless play', () => {
    const covered = new Set<number>();
    // A seed sweep with early stop: a single well-played seed covers all twenty
    // (the drive-upgraded hunter tours core then rim within ~40 days), so the loop
    // returns almost immediately; the extra seed ceiling is only insurance against
    // an unlucky dice run on the first seed.
    for (let seed = 1; seed <= 20 && covered.size < TARGET_SET.size; seed += 1) {
      runSeed(seed, 500, covered);
    }

    const missing = ALL_SYSTEMS.filter((sys) => !covered.has(sys));
    expect(missing, `uncovered systems: ${missing.join(', ')}`).toEqual([]);
  }, 180000);
});
