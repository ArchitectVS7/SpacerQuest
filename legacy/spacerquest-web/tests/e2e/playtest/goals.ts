/**
 * SpacerQuest LLM Playtest — Goal Definitions
 *
 * Goals are OUTCOMES a real player would care about, not API call counts.
 * A goal is complete when the game state proves the player achieved something meaningful.
 *
 * Runtime: PLAYTEST_GOAL=<type>:<value>
 * Examples:
 *   PLAYTEST_GOAL=turns:50
 *   PLAYTEST_GOAL=credits:50000
 *   PLAYTEST_GOAL=battles:3
 *   PLAYTEST_GOAL=cargo:5
 *   PLAYTEST_GOAL=alliance:1
 *   PLAYTEST_GOAL=arena:1
 *   PLAYTEST_GOAL=rank:Commander
 */

export type GoalType =
  | 'turns'       // Complete N turns (end-turn cycles, not just actions)
  | 'credits'     // Accumulate N credits
  | 'battles'     // Win N battles
  | 'cargo'       // Complete N cargo deliveries
  | 'alliance'    // Join any alliance (value: 1)
  | 'arena'       // Fight in the arena (value: 1)
  | 'rank'        // Reach a specific rank by name
  | 'upgrade'     // Upgrade any ship component N times total
  | 'mission'     // Complete the main mission (value: 1)
  | 'coverage';   // Achieve N% game-actions coverage (value: percent as number e.g. 70)

export interface Goal {
  type: GoalType;
  value: number | string;
  description: string;
}

export interface GoalProgress {
  goal: Goal;
  current: number | string;
  achieved: boolean;
  summary: string;
}

const RANK_ORDER = [
  'Lieutenant', 'Commander', 'Captain', 'Commodore',
  'Admiral', 'Top Dog', 'Grand Mufti', 'Mega Hero', 'Giga Hero',
];

/**
 * Parse PLAYTEST_GOAL env var into a Goal object.
 * Defaults to coverage:70 if unset.
 */
export function parseGoal(raw?: string): Goal {
  const str = raw ?? 'coverage:70';
  const colonIdx = str.indexOf(':');
  if (colonIdx === -1) {
    return { type: 'coverage', value: 70, description: 'Exercise 70% of game features' };
  }

  const type = str.slice(0, colonIdx) as GoalType;
  const rawValue = str.slice(colonIdx + 1);

  switch (type) {
    case 'turns': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Complete ${n} turns` };
    }
    case 'credits': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Accumulate ${n.toLocaleString()} credits` };
    }
    case 'battles': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Win ${n} battle${n === 1 ? '' : 's'}` };
    }
    case 'cargo': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Complete ${n} cargo deliverie${n === 1 ? '' : 's'}` };
    }
    case 'alliance':
      return { type, value: 1, description: 'Join an alliance' };
    case 'arena':
      return { type, value: 1, description: 'Fight in the arena' };
    case 'rank':
      return { type, value: rawValue, description: `Reach rank: ${rawValue}` };
    case 'upgrade': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Upgrade ship components ${n} times` };
    }
    case 'mission':
      return { type, value: 1, description: 'Complete the main mission' };
    case 'coverage': {
      const n = parseInt(rawValue, 10);
      return { type, value: n, description: `Exercise ${n}% of game features` };
    }
    default:
      return { type: 'coverage', value: 70, description: 'Exercise 70% of game features' };
  }
}

/**
 * Check whether the current session state satisfies the goal.
 */
export function checkGoal(goal: Goal, session: SessionStats): GoalProgress {
  switch (goal.type) {
    case 'turns': {
      const target = goal.value as number;
      const achieved = session.turnsCompleted >= target;
      return {
        goal,
        current: session.turnsCompleted,
        achieved,
        summary: `Turns: ${session.turnsCompleted}/${target}`,
      };
    }
    case 'credits': {
      const target = goal.value as number;
      const achieved = session.peakCredits >= target;
      return {
        goal,
        current: session.peakCredits,
        achieved,
        summary: `Peak credits: ${session.peakCredits.toLocaleString()}/${target.toLocaleString()}`,
      };
    }
    case 'battles': {
      const target = goal.value as number;
      const achieved = session.battlesWon >= target;
      return {
        goal,
        current: session.battlesWon,
        achieved,
        summary: `Battles won: ${session.battlesWon}/${target}`,
      };
    }
    case 'cargo': {
      const target = goal.value as number;
      const achieved = session.cargoDeliveries >= target;
      return {
        goal,
        current: session.cargoDeliveries,
        achieved,
        summary: `Cargo deliveries: ${session.cargoDeliveries}/${target}`,
      };
    }
    case 'alliance': {
      const achieved = session.allianceJoined;
      return {
        goal,
        current: achieved ? 1 : 0,
        achieved,
        summary: achieved ? 'Alliance joined' : 'No alliance yet',
      };
    }
    case 'arena': {
      const achieved = session.arenaFought;
      return {
        goal,
        current: achieved ? 1 : 0,
        achieved,
        summary: achieved ? 'Arena fought' : 'Arena not yet visited',
      };
    }
    case 'rank': {
      const target = goal.value as string;
      const currentIdx = RANK_ORDER.indexOf(session.currentRank);
      const targetIdx = RANK_ORDER.indexOf(target);
      const achieved = currentIdx >= targetIdx && currentIdx >= 0 && targetIdx >= 0;
      return {
        goal,
        current: session.currentRank,
        achieved,
        summary: `Rank: ${session.currentRank} (need: ${target})`,
      };
    }
    case 'upgrade': {
      const target = goal.value as number;
      const achieved = session.upgradesDone >= target;
      return {
        goal,
        current: session.upgradesDone,
        achieved,
        summary: `Upgrades done: ${session.upgradesDone}/${target}`,
      };
    }
    case 'mission': {
      const achieved = session.missionCompleted;
      return {
        goal,
        current: achieved ? 1 : 0,
        achieved,
        summary: achieved ? 'Mission completed' : 'Mission not completed',
      };
    }
    case 'coverage': {
      const target = goal.value as number;
      const current = session.coveragePercent;
      return {
        goal,
        current,
        achieved: current >= target,
        summary: `Coverage: ${current}%/${target}%`,
      };
    }
    default:
      return { goal, current: 0, achieved: false, summary: 'Unknown goal' };
  }
}

/**
 * Accumulated stats tracked across the session.
 * Updated by the game loop after each significant event.
 */
export interface SessionStats {
  turnsCompleted: number;
  peakCredits: number;
  battlesWon: number;
  battlesLost: number;
  cargoDeliveries: number;
  upgradesDone: number;
  allianceJoined: boolean;
  arenaFought: boolean;
  currentRank: string;
  missionCompleted: boolean;
  actionsThisTurn: number;
  totalActions: number;
  errors: Array<{ action: string; error: string; recovered: boolean }>;
  restarts: number;
  coveragePercent: number;
}

export function initialStats(): SessionStats {
  return {
    turnsCompleted: 0,
    peakCredits: 0,
    battlesWon: 0,
    battlesLost: 0,
    cargoDeliveries: 0,
    upgradesDone: 0,
    allianceJoined: false,
    arenaFought: false,
    currentRank: 'Lieutenant',
    missionCompleted: false,
    actionsThisTurn: 0,
    totalActions: 0,
    errors: [],
    restarts: 0,
    coveragePercent: 0,
  };
}
