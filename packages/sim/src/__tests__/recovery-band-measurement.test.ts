import {
  EXPLORATION_FUEL_COST,
  EXPLORATION_NAV_DC,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  POI_DISCOVERY_TABLE,
  POI_KINDS,
  Stat,
  type ExploreOutcomeDefinition,
  type PoiType,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  check,
  createInitialState,
  endDay,
  navBonus,
  SeededRng,
  startDay,
  type GameEvent,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';
import { DARE_MAX_MOVES_PER_HAND, explorerPolicy, planDareMove, type SimPolicy } from '../index.js';

type BandId = 0 | 1 | 2 | 3 | 4;
type RecoveryReason = 'departed' | 'succession' | 'unknown-outcome';

interface BandMeasurement {
  drawn: number;
  sameDayCollected: number;
  recoveryStarted: number;
  recoveryPaidOut: number;
  forfeited: number;
  abandoned: Record<RecoveryReason, number>;
  openAtHorizon: number;
}

interface RecoveryMeasurement {
  policyDays: number;
  exploreActions: number;
  successfulBoards: number;
  byBand: Record<BandId, BandMeasurement>;
}

const SEEDS = 120;
const DAYS = 120;

const OUTCOMES_BY_ID = new Map(EXPLORE_OUTCOMES.map((row) => [row.id, row]));

function zeroBandMeasurement(): BandMeasurement {
  return {
    drawn: 0,
    sameDayCollected: 0,
    recoveryStarted: 0,
    recoveryPaidOut: 0,
    forfeited: 0,
    abandoned: { departed: 0, succession: 0, 'unknown-outcome': 0 },
    openAtHorizon: 0,
  };
}

function zeroMeasurement(): RecoveryMeasurement {
  return {
    policyDays: SEEDS * DAYS,
    exploreActions: 0,
    successfulBoards: 0,
    byBand: {
      0: zeroBandMeasurement(),
      1: zeroBandMeasurement(),
      2: zeroBandMeasurement(),
      3: zeroBandMeasurement(),
      4: zeroBandMeasurement(),
    },
  };
}

function bandForValuePoints(valuePoints: number): BandId {
  let band = EXPLORE_VALUE_BANDS[0];
  for (const candidate of EXPLORE_VALUE_BANDS) {
    if (valuePoints >= candidate.minValuePoints) band = candidate;
  }
  return band.band as BandId;
}

function drawPoiTypeForMeasurement(rng: SeededRng): PoiType {
  const roll = rng.next();
  let cumulative = 0;
  let chosen = POI_DISCOVERY_TABLE[POI_DISCOVERY_TABLE.length - 1]?.type ?? 'beacon';
  for (const entry of POI_DISCOVERY_TABLE) {
    cumulative += entry.chance;
    if (roll < cumulative) {
      chosen = entry.type;
      break;
    }
  }
  const names = POI_KINDS[chosen].names;
  Math.floor(rng.next() * names.length);
  return chosen;
}

function drawOutcomeForMeasurement(
  poiType: PoiType,
  rng: SeededRng,
): ExploreOutcomeDefinition | null {
  const byBand = EXPLORE_VALUE_BANDS.map((band) => ({
    band,
    rows: EXPLORE_OUTCOMES.filter(
      (row) => row.pools.includes(poiType) && bandForValuePoints(row.valuePoints) === band.band,
    ),
  })).filter((entry) => entry.rows.length > 0);
  if (byBand.length === 0) return null;

  const totalWeight = byBand.reduce((sum, entry) => sum + entry.band.weight, 0);
  const roll = rng.next() * totalWeight;
  let cumulative = 0;
  let chosen = byBand[byBand.length - 1];
  for (const entry of byBand) {
    cumulative += entry.band.weight;
    if (roll < cumulative) {
      chosen = entry;
      break;
    }
  }

  const index = Math.floor(rng.next() * chosen.rows.length);
  return chosen.rows[index] ?? chosen.rows[0] ?? null;
}

function predictedExploreOutcome(
  state: GameState,
  action: Extract<PlayerAction, { type: 'Explore' }>,
): ExploreOutcomeDefinition | null {
  if (state.encounter || state.dareHand) return null;
  if (state.player.recovery !== null) return null;
  if (action.spendDie === undefined) return null;

  const hand = state.player.dawnHand;
  if (!hand || action.spendDie < 0 || action.spendDie >= hand.dice.length) return null;
  if (hand.spent[action.spendDie]) return null;
  if (state.player.ship.fuel < EXPLORATION_FUEL_COST) return null;

  const result = check(
    hand.dice[action.spendDie],
    state.player.stats[Stat.PILOT] + navBonus(state.player.ship),
    EXPLORATION_NAV_DC,
  );
  if (!result.success) return null;

  const rng = new SeededRng(state.rngState).fork(`action-explore-${state.dayEventCount}`);
  const poiType = drawPoiTypeForMeasurement(rng);
  return drawOutcomeForMeasurement(poiType, rng);
}

function recordRecoveryEvents(
  events: readonly GameEvent[],
  measurement: RecoveryMeasurement,
): void {
  for (const event of events) {
    if (event.type === 'RecoveryStarted') {
      const row = OUTCOMES_BY_ID.get(event.outcomeId);
      if (!row) continue;
      measurement.byBand[bandForValuePoints(row.valuePoints)].recoveryStarted += 1;
    } else if (event.type === 'RecoveryPaidOut') {
      measurement.byBand[bandForValuePoints(event.valuePoints)].recoveryPaidOut += 1;
    } else if (event.type === 'RecoveryAbandoned') {
      const row = OUTCOMES_BY_ID.get(event.outcomeId);
      if (!row) continue;
      measurement.byBand[bandForValuePoints(row.valuePoints)].abandoned[event.reason] += 1;
    }
  }
}

function recordExploreResolution(
  predicted: ExploreOutcomeDefinition | null,
  events: readonly GameEvent[],
  measurement: RecoveryMeasurement,
): void {
  if (!predicted) return;

  const band = bandForValuePoints(predicted.valuePoints);
  measurement.successfulBoards += 1;
  measurement.byBand[band].drawn += 1;

  const started = events.find((event) => event.type === 'RecoveryStarted');
  if (started?.type === 'RecoveryStarted') {
    expect(started.outcomeId).toBe(predicted.id);
    return;
  }

  const failed = events.find(
    (event) => event.type === 'ExplorationFailed' && event.reason === 'insufficient-dice',
  );
  if (failed) {
    measurement.byBand[band].forfeited += 1;
    return;
  }

  measurement.byBand[band].sameDayCollected += 1;
}

function policyRng(seed: number, day: number, dayIndex: number): SeededRng {
  return new SeededRng(seed).fork('policy').fork(`day-${day}`).fork(`index-${dayIndex}`);
}

function measureRecovery(policy: SimPolicy): RecoveryMeasurement {
  const measurement = zeroMeasurement();

  for (let seed = 1; seed <= SEEDS; seed += 1) {
    let state = createInitialState(seed);
    for (let dayIndex = 0; dayIndex < DAYS; dayIndex += 1) {
      const dawn = startDay(state);
      let dayState = dawn.state;
      const actions = policy({
        state: dayState,
        dayIndex,
        rng: policyRng(seed, dayState.day, dayIndex),
      });

      for (const action of actions) {
        if (action.type === 'Combat' && !dayState.encounter) continue;
        if (action.type === 'Dare' && !dayState.dareHand) continue;

        const predicted =
          action.type === 'Explore' ? predictedExploreOutcome(dayState, action) : null;
        if (action.type === 'Explore') measurement.exploreActions += 1;

        const stepped = applyPlayerAction(dayState, action);
        dayState = stepped.state;
        recordExploreResolution(predicted, stepped.events, measurement);
        recordRecoveryEvents(stepped.events, measurement);

        let dareGuard = 0;
        while (dayState.dareHand && dareGuard < DARE_MAX_MOVES_PER_HAND) {
          dareGuard += 1;
          const move = planDareMove(dayState);
          if (!move) break;
          const played = applyPlayerAction(dayState, move);
          dayState = played.state;
          recordRecoveryEvents(played.events, measurement);
        }
      }

      const dusk = endDay(dayState);
      state = dusk.state;
      recordRecoveryEvents(dusk.events, measurement);
    }

    const open = state.player.recovery;
    if (open) {
      const row = OUTCOMES_BY_ID.get(open.outcomeId);
      if (row) measurement.byBand[bandForValuePoints(row.valuePoints)].openAtHorizon += 1;
    }
  }

  return measurement;
}

describe('T-172 · recovery collection and forfeiture by band after T-131', () => {
  it('measures explorer seeds 1..120 × 120 days and proves band 4 pays same-day', () => {
    const measured = measureRecovery(explorerPolicy);

    expect(measured.policyDays).toBe(14_400);
    expect(measured.byBand[4].drawn).toBeGreaterThan(0);
    expect(measured.byBand[4].sameDayCollected).toBeGreaterThan(0);
    expect(measured.byBand[4].recoveryStarted).toBe(0);
    expect(measured.byBand[4].recoveryPaidOut).toBe(0);

    expect(measured).toMatchInlineSnapshot(`
      {
        "byBand": {
          "0": {
            "abandoned": {
              "departed": 0,
              "succession": 0,
              "unknown-outcome": 0,
            },
            "drawn": 1821,
            "forfeited": 0,
            "openAtHorizon": 0,
            "recoveryPaidOut": 0,
            "recoveryStarted": 0,
            "sameDayCollected": 1821,
          },
          "1": {
            "abandoned": {
              "departed": 0,
              "succession": 0,
              "unknown-outcome": 0,
            },
            "drawn": 2399,
            "forfeited": 0,
            "openAtHorizon": 0,
            "recoveryPaidOut": 0,
            "recoveryStarted": 0,
            "sameDayCollected": 2399,
          },
          "2": {
            "abandoned": {
              "departed": 1114,
              "succession": 0,
              "unknown-outcome": 0,
            },
            "drawn": 1812,
            "forfeited": 0,
            "openAtHorizon": 12,
            "recoveryPaidOut": 686,
            "recoveryStarted": 1812,
            "sameDayCollected": 0,
          },
          "3": {
            "abandoned": {
              "departed": 0,
              "succession": 0,
              "unknown-outcome": 0,
            },
            "drawn": 1068,
            "forfeited": 121,
            "openAtHorizon": 0,
            "recoveryPaidOut": 0,
            "recoveryStarted": 0,
            "sameDayCollected": 947,
          },
          "4": {
            "abandoned": {
              "departed": 0,
              "succession": 0,
              "unknown-outcome": 0,
            },
            "drawn": 259,
            "forfeited": 54,
            "openAtHorizon": 0,
            "recoveryPaidOut": 0,
            "recoveryStarted": 0,
            "sameDayCollected": 205,
          },
        },
        "exploreActions": 24757,
        "policyDays": 14400,
        "successfulBoards": 7359,
      }
    `);
  }, 180000);
});
