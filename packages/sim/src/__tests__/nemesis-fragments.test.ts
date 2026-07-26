import { describe, expect, it } from 'vitest';
import { BEACON_FRAGMENT_POOL, DERELICT_FRAGMENT_POOL } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  startDay,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-1505a · The Nemesis arc's THREE ACQUISITION MODES each yield a fragment in
// real, legal play (PRD §8.1: "found in derelicts, bought from the Wise One,
// decoded by the Sage" — the collectible layer must not be one funnel).
//
//   1. DERELICT LOGS — an off-lane sweep boards a wreck and its seeded loot roll
//      yields a fragment (source 'derelict').
//   2. NPC-HELD PIECES — Rust Bucket is sitting on one and does not know what it
//      is; taking it off his hands grants with source 'npc'.
//   3. SAGE DECODINGS — the Sage of Mizar-9 trades a piece out of their own
//      drawer once you bring them arc material (source 'sage').
//
// Every run is driven through LEGAL ENGINE ACTIONS ONLY (startDay /
// applyPlayerAction / endDay). The driver NEVER pokes state.flags, state.day,
// position, the dawn hand, or the nemesisFile — the same honesty bar
// `npc-chains.test.ts` sets. The helpers below are copied from that file rather
// than lifted into `support/campaign-drivers.ts`, whose byte-identity backs
// pinned seeds in the campaign specs.
//
// SEEDS ARE PINNED, never hunted at test time (TASKS.md v1.2 sizing rule 1). The
// sweep provenance for each is recorded at its constant.
//
// Split into its own file so vitest's fork pool runs it in parallel with the
// other sim specs, matching the campaign-split rationale.
// ---------------------------------------------------------------------------

/** Mode 1 · Sweep provenance: seeds 1..60, 25-day horizon, sweeping every dawn
 *  die at the starting system. Seed 17 is the first that boards a derelict whose
 *  loot roll draws one of the T-1505a pool additions; measured on day 1. */
const DERELICT_SEED = 17;
/** The id the FIRST derelict-sourced grant of that day yields — a NET-NEW pool
 *  entry, so this asserts the T-1505a pool growth is reachable, not merely that
 *  derelicts drop fragments. (Seed 17's day-1 hand boards more than one wreck; a
 *  later sweep the same day draws frag-nemesis-07.) */
const DERELICT_EXPECT_ID = 'frag-nemesis-06';

/** Mode 2 · Sweep provenance: seeds 1..40, 25-day horizon, flying Sol → Fomalhaut-2
 *  (system 7) and taking the requirement-free grant. Seed 1 lands it on day 2 (the
 *  first dawn after the jump); every seed in the sweep landed it by day 2. */
const NPC_SEED = 1;

/** Mode 3 · Sweep provenance: seeds 1..40, 45-day horizon, buying tier-3 drives,
 *  hopping Sol → Mira-9 → Mizar-9, sweeping at the rim until a fragment lands,
 *  then playing the Sage's archive scene. Seed 2 lands it on day 5. */
const SAGE_SEED = 2;

type FragmentAcquired = Extract<GameEvent, { type: 'FragmentAcquired' }>;

const fragmentEvents = (events: readonly GameEvent[]): FragmentAcquired[] =>
  events.filter((e): e is FragmentAcquired => e.type === 'FragmentAcquired');

// --- legal-play helpers (shape copied from npc-chains.test.ts) --------------

function freeDie(state: GameState): number | undefined {
  const hand = state.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) if (!hand.spent[i]) return i;
  return undefined;
}

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

/** Clear any active encounter so Storylet/Travel/Explore actions unblock. Talk
 *  completes an interrupted jump; run only aborts, so prefer talk. */
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

function ensureFuel(state: GameState, minFuel = 90): GameState {
  if (state.player.ship.fuel >= minFuel) return state;
  const price = state.market.localFuelPrice || 5;
  const want = 220 - state.player.ship.fuel;
  const capacity = state.player.ship.maxFuel - state.player.ship.fuel;
  const affordable = Math.floor(state.player.credits / price);
  const units = Math.max(0, Math.min(want, capacity, affordable));
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

/** Fly toward `dest`, completing the jump through any encounter. No-op when
 *  already there or out of dice/fuel — the caller retries the next dawn (the
 *  Sol → Mizar-9 leg is DC 16+, so it genuinely takes a few tries). */
function travelTo(state: GameState, dest: number): GameState {
  let s = state;
  if (s.encounter) s = clearEncounter(s);
  if (s.player.currentSystemId === dest) return s;
  s = ensureFuel(s);
  const die = bestDie(s);
  if (die === undefined) return s;
  s = applyPlayerAction(s, { type: 'Travel', destinationId: dest, spendDie: die }).state;
  if (s.encounter) s = clearEncounter(s);
  return s;
}

/** Burn the rest of the dawn hand on off-lane sweeps — the Explore verb, the only
 *  way a player reaches a derelict or a beacon. */
function sweepOffLane(state: GameState): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  for (let i = 0; i < 5; i += 1) {
    if (s.encounter) s = clearEncounter(s);
    s = ensureFuel(s, 60);
    const die = freeDie(s);
    if (die === undefined) break;
    const result = applyPlayerAction(s, { type: 'Explore', spendDie: die });
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Play an offered storylet by id + choice id, if it is on today's board. */
function playOffer(
  state: GameState,
  storyletId: string,
  choiceId: string,
): { state: GameState; events: GameEvent[]; played: boolean } {
  const offer = state.storylets.available.find((o) => o.storyletId === storyletId);
  if (!offer) return { state, events: [], played: false };
  const result = applyPlayerAction(state, { type: 'Storylet', storyletId, choiceId });
  return { state: result.state, events: result.events, played: true };
}

describe('T-1505a Nemesis fragments — every acquisition mode yields a fragment in legal play', () => {
  it("MODE 1 (derelict logs): an off-lane sweep boards a wreck and lands a fragment with source 'derelict'", () => {
    let state = createInitialState(DERELICT_SEED);
    const acquired: FragmentAcquired[] = [];

    for (let day = 0; day < 25 && acquired.length === 0; day += 1) {
      state = startDay(state).state;
      if (state.encounter) state = clearEncounter(state);
      const swept = sweepOffLane(state);
      state = swept.state;
      acquired.push(...fragmentEvents(swept.events).filter((e) => e.source === 'derelict'));
      state = endDay(state).state;
    }

    expect(acquired.length, 'no derelict-sourced fragment on the pinned seed').toBeGreaterThan(0);
    const first = acquired[0];
    // It came off a real boarded POI (resolveLoot stamps the poiId), not a grant.
    expect(first.poiId).toBeDefined();
    expect(DERELICT_FRAGMENT_POOL).toContain(first.fragmentId);
    // …and specifically one of the T-1505a pool additions, so the pool GROWTH is
    // what this seed proves reachable — not merely that derelicts drop fragments.
    expect(first.fragmentId).toBe(DERELICT_EXPECT_ID);
    expect(['frag-nemesis-06', 'frag-nemesis-07']).toContain(first.fragmentId);
    // The file actually holds it.
    expect(
      state.player.nemesisFile.fragments.some(
        (f) => f.fragmentId === first.fragmentId && f.source === 'derelict',
      ),
    ).toBe(true);
    // The beacon pool's T-1505a addition is authored on the same wire (fragment 08
    // is beacon-only), so name it here rather than leaving it unmentioned.
    expect(BEACON_FRAGMENT_POOL).toContain('frag-nemesis-08');
  });

  it("MODE 2 (NPC-held): Rust Bucket hands over the etched plate with source 'npc'", () => {
    let state = createInitialState(NPC_SEED);
    let acquired: FragmentAcquired | undefined;

    for (let day = 0; day < 25 && !acquired; day += 1) {
      state = startDay(state).state;
      if (state.encounter) state = clearEncounter(state);

      const step = playOffer(state, 'npc.rust-bucket.scrap-sliver', 'take-the-plate');
      state = step.state;
      if (step.played) {
        acquired = fragmentEvents(step.events).find((e) => e.source === 'npc');
      } else {
        // Not at Fomalhaut-2 yet (the scene is systemIds:[7]) — fly there.
        state = travelTo(state, 7);
      }
      state = endDay(state).state;
    }

    expect(acquired, 'Rust Bucket never handed over the plate').toBeDefined();
    expect(acquired?.fragmentId).toBe('frag-nemesis-09');
    expect(acquired?.source).toBe('npc');
    expect(
      state.player.nemesisFile.fragments.some(
        (f) => f.fragmentId === 'frag-nemesis-09' && f.source === 'npc',
      ),
    ).toBe(true);
    // The grant scene is `repeat:'never'` and completed — it will not re-offer.
    expect(state.storylets.completed['npc.rust-bucket.scrap-sliver']).toBeDefined();
  });

  it("MODE 3 (Sage decodings): the Sage of Mizar-9 opens their drawer, granting with source 'sage'", () => {
    let state = createInitialState(SAGE_SEED);
    let acquired: FragmentAcquired | undefined;

    for (let day = 0; day < 45 && !acquired; day += 1) {
      state = startDay(state).state;
      if (state.encounter) state = clearEncounter(state);

      // The explorer's defining upgrade: tier-3 drives drop per-unit jump fuel
      // from ~21 to ~1, which is how the rim becomes reachable at all
      // (sim/src/index.ts explorerPolicy does exactly this).
      if (state.player.ship.drives.strength < 30 && state.player.credits >= 400) {
        const die = freeDie(state);
        if (die !== undefined) {
          state = applyPlayerAction(state, {
            type: 'Shipyard',
            action: 'buy-component-tier',
            component: 'drives',
            tier: 3,
            spendDie: die,
          }).state;
        }
      }

      if (state.player.currentSystemId !== 18) {
        // Sol → Mizar-9 direct is DC 18; hop via Mira-9 (system 8) and retry
        // across dawns until a die clears the rim check.
        state = travelTo(state, state.player.currentSystemId === 1 ? 8 : 18);
      } else {
        // `sage.mizar.archive` is gated on `nemesis.minFragments: 1` — the Sage is
        // paid in NOVELTY, not credits — so bring them something first. Sweeping
        // the rim (mode 1) supplies it; the gate is therefore crossed organically.
        const step = playOffer(state, 'sage.mizar.archive', 'take-the-drawer-piece');
        state = step.state;
        if (step.played) {
          acquired = fragmentEvents(step.events).find((e) => e.source === 'sage');
        } else {
          state = sweepOffLane(state).state;
        }
      }
      state = endDay(state).state;
    }

    expect(acquired, "the Sage's archive scene never played").toBeDefined();
    expect(acquired?.fragmentId).toBe('frag-nemesis-11');
    expect(acquired?.source).toBe('sage');
    // The minFragments gate was crossed ORGANICALLY: the driver never granted a
    // fragment directly, so the only thing that opened the scene is the fragment
    // the off-lane sweeps found on the way.
    expect(state.player.nemesisFile.fragments.length).toBeGreaterThanOrEqual(2);
    expect(
      state.player.nemesisFile.fragments.some(
        (f) => f.fragmentId === 'frag-nemesis-11' && f.source === 'sage',
      ),
    ).toBe(true);
  }, 60000);
});
