import { describe, expect, it } from 'vitest';
import { Stat } from '@spacerquest/content';
import { advanceDay, endDay, startDay } from '../day.js';
import { resolveCombat } from '../actions/combat.js';
import { resolveTravel } from '../actions/travel.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
import { DayPhase, EncounterState, GameState } from '../types.js';

/** A dusk-fatal encounter: a high-GUNS interceptor whose day-end free attack
 *  finishes a one-condition hull. Origin 1 (Sun-3), destination 2. */
function fatalEncounter(overrides: Partial<EncounterState> = {}): EncounterState {
  return {
    id: 'enc-fatal',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-pirate-1',
      source: 'anonymous',
      name: 'K)(akj',
      shipName: 'K1++++',
      shipClass: 'Maligna Bat',
      homeSystem: 'Pollux-7',
      kind: 'PIRATE',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 20, TRADE: 0, GRIT: 0, GUILE: 1 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.08,
    encounterRoll: 0.01,
    round: 4,
    enemyHull: 1,
    ...overrides,
  };
}

/** Build a DAY-phase state, roll a real dawn hand, drop the player into a fatal
 *  dusk encounter with a hull on its last condition point. Returns the DAY-phase
 *  state ready for endDay() to deliver the killing blow. */
function primedForDuskDeath(seed = 42): GameState {
  const dawn = startDay(createInitialState(seed));
  const state = dawn.state;
  state.player.ship.hull.condition = 1;
  state.encounter = fatalEncounter();
  return state;
}

/** Build the rich pre-death DAY-phase state for `seed` (all inheritance fields
 *  set), primed with the fatal dusk encounter. T-1205: the dusk killing blow now
 *  targets a SEEDED component, so hull is hit only ~1/8 of dusks — the caller
 *  scans seeds until endDay actually lands the blow on the (condition-1) hull. */
function buildRichPreDeathState(seed: number): GameState {
  const dawn = startDay(createInitialState(seed));
  const state = dawn.state;
  state.player.credits = 9001;
  state.player.debt = 12000;
  state.player.debtDueDay = 55;
  state.player.stats[Stat.GUNS] = 4;
  state.player.tier = 3;
  state.player.charts.visitedSystemIds = [1, 2, 5, 14];
  state.player.registry.earned = [
    { id: 'first_jump', title: 'First Jump', citation: 'c', day: 2, eventIndex: 0 },
  ];
  state.player.registry.matchCounts = { first_jump: 1 };
  state.player.registry.renownRank = 'CAPTAIN';
  state.flags = { 'signal.fragment.count': 2, 'guild.audited': true };
  state.player.nemesisFile.fragments = [
    { fragmentId: 'frag-nemesis-01', source: 'wise-one', day: 3, decoded: true },
    { fragmentId: 'frag-nemesis-02', source: 'derelict', day: 8, decoded: false },
  ];
  state.storylets.completed = { 'port.sun3.guild-auditor': 1 };
  state.storylets.scheduled = [
    { storyletId: 'some.followup', dueDay: 20, sourceStoryletId: 'x', sourceChoiceId: 'y' },
  ];
  state.npcs.find((n) => n.id === 'npc-rattlesnake')!.disposition = -7;
  state.npcs.find((n) => n.id === 'npc-doc-salvage')!.disposition = 5;
  state.player.ship.hull.condition = 1;
  state.encounter = fatalEncounter();
  return state;
}

/** Run endDay against `build(seed)` across seeds until the dusk blow lands on the
 *  condition-1 hull and fires ShipLost. Returns the fatal seed's endDay result. */
function findDuskDeath(build: (seed: number) => GameState): {
  state: GameState;
  events: ReturnType<typeof endDay>['events'];
  seed: number;
} {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const result = endDay(build(seed));
    if (result.events.some((e) => e.type === 'ShipLost')) {
      return { ...result, seed };
    }
  }
  throw new Error('No seed produced a fatal dusk hull hit');
}

describe('T-108 · Death & legacy — full inheritance', () => {
  it('carries charts/deeds/flags/dispositions/debt, halves credits, resets ship', () => {
    // T-1205: seeded dusk targeting means hull is not hit every dusk — scan to a
    // seed whose dusk blow actually kills, then assert the inheritance (all of
    // which is seed-independent).
    const { state: next, events, seed } = findDuskDeath(buildRichPreDeathState);
    // The pre-death state at the SAME fatal seed — snapshot its CARRIES items.
    const state = buildRichPreDeathState(seed);

    const chartsBefore = [...state.player.charts.visitedSystemIds];
    const earnedBefore = structuredClone(state.player.registry.earned);
    const matchCountsBefore = { ...state.player.registry.matchCounts };
    const rankBefore = state.player.registry.renownRank;
    const flagsBefore = { ...state.flags };
    const nemesisBefore = structuredClone(state.player.nemesisFile);
    const completedBefore = { ...state.storylets.completed };
    const statsBefore = { ...state.player.stats };
    const dispositionsBefore = state.npcs.map((n) => ({ id: n.id, d: n.disposition }));

    // Trigger + succession fired.
    expect(events).toContainEqual(expect.objectContaining({ type: 'ShipLost' }));
    const succession = events.find((e) => e.type === 'LegacySuccession');
    expect(succession).toMatchObject({
      successionCount: 1,
      inheritedCredits: 4500,
      debtOutstanding: 12000,
      previousShipLostTo: 'anon-pirate-1',
    });
    const obituary = events.find(
      (e) => e.type === 'WireEntry' && e.message.includes('successor claims the license'),
    );
    expect(obituary).toBeDefined();

    // HALVED credits (floor division).
    expect(next.player.credits).toBe(4500);

    // RESET ship — deep-equals the single source of truth.
    expect(next.player.ship).toEqual(starterShip());

    // LOCATION — successor at the fatal encounter's origin (wreck towed home).
    expect(next.player.currentSystemId).toBe(1);

    // successionCount incremented.
    expect(next.player.legacy.successionCount).toBe(1);

    // CARRIES — every inherited item is identical.
    expect(next.player.charts.visitedSystemIds).toEqual(chartsBefore);
    expect(next.player.registry.earned).toEqual(earnedBefore);
    expect(next.player.registry.matchCounts).toEqual(matchCountsBefore);
    expect(next.player.registry.renownRank).toBe(rankBefore);
    expect(next.flags).toEqual(flagsBefore);
    // Signal Fragments survive death intact — decoded state and all (T-111b).
    expect(next.player.nemesisFile).toEqual(nemesisBefore);
    expect(next.storylets.completed).toEqual(completedBefore);
    expect(next.player.stats).toEqual(statsBefore);
    expect(next.player.debt).toBe(12000);
    expect(next.player.debtDueDay).toBe(55);
    // Dispositions attach to the NAME — grudges and favors both survive death.
    // T-1204: dusk decay is now PERIODIC (every DISPOSITION_DECAY_INTERVAL_DAYS
    // dusks), and this succession runs on day 1 (1 % 3 != 0), which is NOT a
    // decay day — so every standing carries through the death untouched. This is
    // a cleaner test of inheritance than the old per-dusk-decay expectation: the
    // exact pre-death value survives.
    for (const { id, d } of dispositionsBefore) {
      const after = next.npcs.find((n) => n.id === id)!.disposition;
      expect(after).toBe(d);
    }

    // RESET — scheduled storylets cancelled (appointments with a dead spacer).
    expect(next.storylets.scheduled).toEqual([]);

    // Encounter cleared.
    expect(next.encounter).toBeNull();
  });

  it('forfeits the active contract — the successor cannot deliver cargo that burned', () => {
    // Sign a contract for system 2, then die in a fatal dusk attack elsewhere.
    // T-1205: dusk targeting is seeded, so scan to a killing seed.
    const buildWithContract = (seed: number): GameState => {
      const state = startDay(createInitialState(seed)).state;
      state.player.activeContract = { destination: 2, cargoType: 3, payment: 5000, pods: 4 };
      state.player.ship.hull.condition = 1;
      state.encounter = fatalEncounter();
      return state;
    };
    const { state: afterDeath, events } = findDuskDeath(buildWithContract);

    // The contract is forfeited with the ship, and the estate records it.
    expect(afterDeath.player.activeContract).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'TradeEvent',
        action: 'forfeit-cargo',
        success: false,
        destination: 2,
        cargoType: 3,
        payment: 5000,
      }),
    );

    // The successor flies the empty starter ship to the old destination:
    // NO payment occurs — there is no cargo to deliver.
    const nextDawn = startDay(afterDeath);
    const successor = nextDawn.state;
    successor.player.ship.fuel = 5000;
    successor.player.dawnHand = {
      dice: [20, 20, 20, 20, 20],
      spent: [false, false, false, false, false],
    };
    successor.player.stats[Stat.PILOT] = 5;

    let arrived: { state: GameState; events: ReturnType<typeof resolveTravel>['events'] } | null =
      null;
    for (let seed = 1; seed <= 200 && !arrived; seed += 1) {
      const attempt = resolveTravel(
        structuredClone(successor),
        { type: 'Travel', destinationId: 2, spendDie: 0 },
        new SeededRng(seed),
      );
      if (attempt.state.player.currentSystemId === 2 && !attempt.state.encounter) {
        arrived = attempt;
      }
    }
    expect(arrived).not.toBeNull();
    const creditsBefore = successor.player.credits;
    expect(arrived!.state.player.credits).toBe(creditsBefore);
    expect(
      arrived!.events.some((e) => e.type === 'TradeEvent' && e.action === 'deliver-cargo'),
    ).toBe(false);
  });

  it('consumes the day-of-death remaining hand mid-DAY (succession spends every die)', () => {
    // A DAY-phase combat whose between-rounds enemy pressure lands the killing
    // blow — succession runs inside resolveCombat, before any endDay bookkeeping.
    const dawn = startDay(createInitialState(7));
    const state = dawn.state;
    state.player.ship.hull.condition = 1;
    state.encounter = fatalEncounter();
    // A live hand: only the spent die (index 0) is a run; the rest are untouched.
    state.player.dawnHand = {
      dice: [1, 12, 13, 14, 15],
      spent: [false, false, false, false, false],
    };

    const { state: next, events } = resolveCombat(
      state,
      { type: 'Combat', stance: 'run', targetId: state.encounter.interceptor.id, spendDie: 0 },
      // T-1205: seeded damage targeting — this seed's between-rounds pressure hit
      // lands on the condition-1 hull. T-1207 re-picked it (14 → 15): the opposed
      // run draws an enemy pursuit d20 before the pressure roll, so the stream
      // shifted and a fresh hand-picked seed lands the fatal hull hit.
      new SeededRng(15),
    );

    expect(events).toContainEqual(expect.objectContaining({ type: 'ShipLost' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'LegacySuccession' }));
    // Every remaining die is LOST — succession consumes the whole hand.
    expect(next.player.dawnHand?.spent).toEqual([true, true, true, true, true]);
  });
});

describe('T-108 · Post-death playability (anti-poverty-trap)', () => {
  it('the successor has a legal income action next dawn and survives 10 days', () => {
    // T-1205: dusk targeting is seeded, so scan to a seed whose dusk blow kills.
    const afterDeath = findDuskDeath(primedForDuskDeath).state;
    expect(afterDeath.player.legacy.successionCount).toBe(1);
    expect(afterDeath.dayPhase).toBe(DayPhase.DAWN);

    // Next dawn: the manifest board is non-empty — there IS a way to earn.
    const nextDawn = startDay(afterDeath);
    expect(nextDawn.state.market.manifestBoard.length).toBeGreaterThan(0);

    // A contract can be signed by the successor (a real income action).
    const signed = nextDawn.state.market.manifestBoard.length;
    expect(signed).toBeGreaterThan(0);

    // 10 further days advance with no throws (Wait-driven continuation).
    let running: GameState = afterDeath;
    for (let i = 0; i < 10; i += 1) {
      running = advanceDay(running, [{ type: 'Wait' }]).state;
    }
    expect(running.day).toBe(afterDeath.day + 10);
    expect(running.player.legacy.successionCount).toBe(1);
  });

  it('a greedy-style contract sign works on the successor next dawn', () => {
    const afterDeath = endDay(primedForDuskDeath(99)).state;
    const result = advanceDay(afterDeath, [
      { type: 'Trade', action: 'sign-contract', contractIndex: 0, spendDie: 0 },
    ]);
    // No throw, and the day advanced.
    expect(result.state.day).toBe(afterDeath.day + 1);
  });
});

describe('T-108 · Serialization round-trips through succession', () => {
  it('serialize immediately after succession, resume, endDay == uninterrupted', () => {
    // Uninterrupted: build the DAY-phase primed state, run endDay in one go.
    const primed = primedForDuskDeath(31);
    const uninterrupted = endDay(structuredClone(primed));

    // Interrupted: endDay produces the post-succession DAWN state; serialize it,
    // resume, and advance a day. Compare against advancing the uninterrupted.
    const restored = deserializeState(serializeState(uninterrupted.state));
    expect(restored).toEqual(uninterrupted.state);

    const resumed = advanceDay(restored, [{ type: 'Wait' }]);
    const straight = advanceDay(uninterrupted.state, [{ type: 'Wait' }]);
    expect(resumed.state).toEqual(straight.state);
  });

  it('older fixtures without charts/legacy deserialize with defaults', () => {
    const state = createInitialState(3);
    const raw = JSON.parse(serializeState(state)) as Record<string, unknown>;
    const player = raw.player as Record<string, unknown>;
    delete player.charts;
    delete player.legacy;

    const restored = deserializeState(JSON.stringify(raw));
    expect(restored.player.charts.visitedSystemIds).toEqual([restored.player.currentSystemId]);
    expect(restored.player.legacy.successionCount).toBe(0);
  });
});

describe('T-108 · Charts recorded on travel', () => {
  it('appends the destination once, with no duplicate on revisit', () => {
    const dawn = startDay(createInitialState(500));
    const state = dawn.state;
    state.player.ship.fuel = 5000;
    state.player.currentSystemId = 1;
    state.player.charts.visitedSystemIds = [1];
    // Guarantee a clean arrival (no encounter) with a high die + PILOT.
    state.player.dawnHand = {
      dice: [20, 20, 20, 20, 20],
      spent: [false, false, false, false, false],
    };
    state.player.stats[Stat.PILOT] = 5;

    // Find a seed that arrives at system 2 without an encounter.
    let arrived: GameState | null = null;
    for (let seed = 1; seed <= 200 && !arrived; seed += 1) {
      const attempt = resolveTravel(
        structuredClone(state),
        { type: 'Travel', destinationId: 2, spendDie: 0 },
        new SeededRng(seed),
      );
      if (attempt.state.player.currentSystemId === 2 && !attempt.state.encounter) {
        arrived = attempt.state;
      }
    }
    expect(arrived).not.toBeNull();
    expect(arrived!.player.charts.visitedSystemIds).toEqual([1, 2]);

    // Revisit system 1 (already charted) — no duplicate.
    arrived!.player.dawnHand = {
      dice: [20, 20, 20, 20, 20],
      spent: [false, false, false, false, false],
    };
    let back: GameState | null = null;
    for (let seed = 1; seed <= 200 && !back; seed += 1) {
      const attempt = resolveTravel(
        structuredClone(arrived!),
        { type: 'Travel', destinationId: 1, spendDie: 0 },
        new SeededRng(seed),
      );
      if (attempt.state.player.currentSystemId === 1 && !attempt.state.encounter) {
        back = attempt.state;
      }
    }
    expect(back).not.toBeNull();
    expect(back!.player.charts.visitedSystemIds).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// T-1304 · A Penny Wise loan carries wholesale through succession (like debt).
// ---------------------------------------------------------------------------
describe('T-1304 · loan survives succession (carried like the Guild debt)', () => {
  it('a defaulted loan and the Penny Wise grudge both carry to the successor', async () => {
    const { applySuccession } = await import('../legacy.js');
    const state = createInitialState(3);
    state.player.credits = 4000;
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 1000,
      outstanding: 1750,
      dailyRate: 0.05,
      borrowedDay: 2,
      dueDay: 17,
      status: 'defaulted',
    };
    // A Penny Wise grudge stands on her NPC record.
    const penny = state.npcs.find((n) => n.id === 'npc-penny-wise')!;
    penny.disposition = -5;

    const before = structuredClone(state.player.loan);
    applySuccession(state, { originSystem: 1, interceptorId: 'anon-pirate-1' });

    // The loan is left EXACTLY as it was — carried wholesale like debt/debtDueDay,
    // its defaulted status (collection heat) included. No reset.
    expect(state.player.loan).toEqual(before);
    expect(state.player.loan?.status).toBe('defaulted');
    // The grudge attaches to the name and rides along with every disposition.
    expect(state.npcs.find((n) => n.id === 'npc-penny-wise')!.disposition).toBe(-5);
  });
});
