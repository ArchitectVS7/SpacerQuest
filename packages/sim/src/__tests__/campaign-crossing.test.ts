import {
  CROSSING_BANK_STAKE,
  CROSSING_BURN_FUEL,
  CROSSING_COMMIT_SYSTEM_ID,
  CROSSING_MIN_DECODED,
  EXPLORATION_FUEL_COST,
  NEMESIS_SYSTEM_ID,
  distance as systemDistance,
} from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  fragmentsDecodedCount,
  hasFragment,
  hasUndecodedFragment,
  jumpFuelCost,
  startDay,
  type GameState,
  type PlayerAction,
} from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// T-1505 · The Nemesis Signal arc is COMPLETABLE end-to-end through the real action
// API. Every ARC step — buying frag-01 from the Wise One, exploring derelicts/beacons
// for the pool fragments, recovering the derelict-log/beacon-echo pieces, taking the
// NPC-held pieces, decoding at the Sage, the final-line reconstruction, committing the
// staked crossing, and the Travel into NEMESIS — goes through `applyPlayerAction`.
// Nothing pokes the nemesisFile, the flags, or the crossing.
//
// SETUP-ONLY construction (not an arc poke, and no rule faked): the ship starts as a
// CONQUEROR-ranked, well-equipped veteran — the crossing's RANK stake and a hull/tank
// big enough to make its jumps and win the interdictions that would otherwise stall a
// hand-scripted voyage. CONQUEROR reachability THROUGH PLAY is proven separately by
// conqueror.test.ts (the same setup/act split the e2e nemesis-arc spec uses); driving
// the 250-day grind here too would only re-prove that at a quadratic eventLog cost.
// The ARC ITSELF is never constructed — the file starts empty and every fragment,
// decode, and the crossing are earned through actions below.
// ---------------------------------------------------------------------------

/** A CONQUEROR veteran poised at Mizar-9 with a god-tier hull: overwhelming combat
 *  stats so an interdiction is won in one volley (navigation never stalls), a huge
 *  tank/fortune for the long rim hops and the crossing stake, and 30 earned deeds so
 *  the derived rank stays CONQUEROR when the arc earns an incidental deed. */
function conquerorVeteran(seed: number): GameState {
  const state = createInitialState(seed);
  // A veteran career: past the day-25 Wise One window and into the VETERAN era.
  state.day = 40;
  state.era = 'VETERAN';
  state.player.registry.renownRank = 'CONQUEROR';
  state.player.registry.earned = Array.from({ length: 30 }, (_v, i) => ({
    id: `deed-${i}`,
    title: `Deed ${i}`,
    citation: `Filler ${i}.`,
    day: 1,
    eventIndex: i,
  }));
  state.player.credits = 500_000;
  state.player.stats = { PILOT: 40, GUNS: 40, TRADE: 20, GRIT: 20, GUILE: 20 };
  state.player.ship.hull = { strength: 60, condition: 9 }; // maxFuel = (9+1)*60*30 = 18000
  state.player.ship.drives = { strength: 21, condition: 9 }; // per-unit fuel = 1
  state.player.ship.weapons = { strength: 199, condition: 9 }; // one-volley kills
  state.player.ship.fuel = 18_000;
  state.player.ship.maxFuel = 18_000;
  state.player.currentSystemId = 18; // Mizar-9 — the Sage's workshop
  return state;
}

class CrossingDriver {
  state: GameState;
  day = 0;

  constructor(seed: number) {
    this.state = conquerorVeteran(seed);
  }

  /** Run one day: startDay → apply the planned actions → endDay. */
  tick(plan: (dayState: GameState) => PlayerAction[]): void {
    let dayState = startDay(this.state).state;
    for (const action of plan(dayState)) {
      try {
        dayState = applyPlayerAction(dayState, action).state;
      } catch {
        /* a planned action can be invalidated by a mid-batch state change */
      }
    }
    this.state = endDay(dayState).state;
    this.day += 1;
  }

  file(): GameState['player']['nemesisFile'] {
    return this.state.player.nemesisFile;
  }
}

function firstDie(s: GameState): number | undefined {
  const hand = s.player.dawnHand;
  if (!hand) return undefined;
  for (let i = 0; i < hand.dice.length; i += 1) if (!hand.spent[i]) return i;
  return undefined;
}

function nextDie(s: GameState, after: number): number | undefined {
  const hand = s.player.dawnHand!;
  for (let i = 0; i < hand.dice.length; i += 1) if (i !== after && !hand.spent[i]) return i;
  return undefined;
}

function jumpCost(s: GameState, target: number): number {
  return jumpFuelCost(
    s.player.ship.drives,
    systemDistance(s.player.currentSystemId, target),
    s.player.ship.hasTransWarpDrive ?? false,
  );
}

/** A day plan that fuels-then-jumps to `target` (buying the shortfall first). */
function planTravel(s: GameState, target: number): PlayerAction[] {
  const d0 = firstDie(s);
  if (d0 === undefined) return [{ type: 'Wait' }];
  const cost = jumpCost(s, target);
  if (s.player.ship.fuel >= cost) return [{ type: 'Travel', destinationId: target, spendDie: d0 }];
  const buy: PlayerAction = {
    type: 'Trade',
    action: 'buy-fuel',
    fuelAmount: cost - s.player.ship.fuel + 200,
    spendDie: d0,
  };
  const d1 = nextDie(s, d0);
  return d1 === undefined ? [buy] : [buy, { type: 'Travel', destinationId: target, spendDie: d1 }];
}

/** Fight a live interdiction down (a one-volley god-ship win completes the jump). */
function clearEncounter(driver: CrossingDriver): void {
  let guard = 0;
  while (driver.state.encounter && guard < 20) {
    driver.tick((s) => {
      if (!s.encounter) return [{ type: 'Wait' }];
      const d = firstDie(s);
      return d === undefined
        ? [{ type: 'Wait' }]
        : [{ type: 'Combat', stance: 'fight', targetId: s.encounter.interceptor.id, spendDie: d }];
    });
    guard += 1;
  }
}

function goTo(driver: CrossingDriver, target: number, dayCap = 25): void {
  let guard = 0;
  while (driver.state.player.currentSystemId !== target && guard < dayCap) {
    if (driver.state.encounter) {
      clearEncounter(driver);
      guard += 1;
      continue;
    }
    driver.tick((s) => planTravel(s, target));
    guard += 1;
  }
}

/** Play a requirement-light storylet choice once it is offered. */
function playStorylet(
  driver: CrossingDriver,
  storyletId: string,
  choiceId: string,
  dayCap = 4,
): void {
  let guard = 0;
  while (!driver.state.storylets.completed[storyletId] && guard < dayCap) {
    if (driver.state.encounter) {
      clearEncounter(driver);
      guard += 1;
      continue;
    }
    driver.tick((s) =>
      s.storylets.available.some((o) => o.storyletId === storyletId)
        ? [{ type: 'Storylet', storyletId, choiceId }]
        : [{ type: 'Wait' }],
    );
    guard += 1;
  }
}

/** Explore off the current system until every listed fragment is held. */
function exploreUntilHeld(driver: CrossingDriver, fragmentIds: string[], dayCap = 60): void {
  let guard = 0;
  const held = () => fragmentIds.every((id) => hasFragment(driver.file(), id));
  while (!held() && guard < dayCap) {
    if (driver.state.encounter) {
      clearEncounter(driver);
      guard += 1;
      continue;
    }
    driver.tick((s) => {
      const hand = s.player.dawnHand;
      if (!hand) return [{ type: 'Wait' }];
      const free: number[] = [];
      for (let i = 0; i < hand.dice.length; i += 1) if (!hand.spent[i]) free.push(i);
      if (free.length === 0) return [{ type: 'Wait' }];
      const actions: PlayerAction[] = [];
      if (s.player.ship.fuel < EXPLORATION_FUEL_COST * free.length + 200) {
        actions.push({ type: 'Trade', action: 'buy-fuel', fuelAmount: 2000, spendDie: free[0] });
        free.shift();
      }
      for (const d of free) actions.push({ type: 'Explore', spendDie: d });
      return actions;
    });
    guard += 1;
  }
}

/** Travel to the NPC (it does not move until dusk) and take their held fragment. */
function takeFromNpc(
  driver: CrossingDriver,
  npcId: string,
  storyletId: string,
  choiceId: string,
  fragmentId: string,
  dayCap = 20,
): void {
  let guard = 0;
  while (!hasFragment(driver.file(), fragmentId) && guard < dayCap) {
    if (driver.state.encounter) {
      clearEncounter(driver);
      guard += 1;
      continue;
    }
    driver.tick((s) => {
      const npc = s.npcs.find((n) => n.id === npcId);
      if (!npc) return [{ type: 'Wait' }];
      const actions: PlayerAction[] = [];
      if (npc.currentSystemId !== s.player.currentSystemId) {
        actions.push(...planTravel(s, npc.currentSystemId));
      }
      actions.push({ type: 'Storylet', storyletId, choiceId }); // offered after same-day arrival
      return actions;
    });
    guard += 1;
  }
}

/** Decode every held-undecoded fragment at the Sage (Mizar-9) — all in one day
 *  (decodes need no dice), with a couple of passes for late refreshes. */
function decodeAllAtSage(driver: CrossingDriver, pairs: [string, string][]): void {
  goTo(driver, 18);
  const pending = () =>
    pairs.filter(([fragmentId]) => hasUndecodedFragment(driver.file(), fragmentId));
  let guard = 0;
  while (pending().length > 0 && guard < 4 && !driver.state.encounter) {
    driver.tick((s) => {
      const actions: PlayerAction[] = [];
      for (const [, storyletId] of pending()) {
        if (s.storylets.available.some((o) => o.storyletId === storyletId)) {
          actions.push({ type: 'Storylet', storyletId, choiceId: 'decode' });
        }
      }
      return actions.length > 0 ? actions : [{ type: 'Wait' }];
    });
    guard += 1;
  }
}

describe('T-1505 · the Nemesis crossing is completable through play', () => {
  it('a scripted career assembles the signal, commits the stake, and crosses', () => {
    const driver = new CrossingDriver(7);

    // --- Fragment 01: the Wise One's sale at Polaris-1 (source 'wise-one'). ---
    goTo(driver, 17);
    playStorylet(driver, 'wise-one.polaris.signal-hook', 'buy-fragment');
    expect(hasFragment(driver.file(), 'frag-nemesis-01')).toBe(true);

    // --- Fragments 02–05: derelict/beacon EXPLORE loot, then decode 01–05 (the
    //     minDecoded:5 chokepoint). Two acquisition modes exercised so far. ---
    exploreUntilHeld(driver, [
      'frag-nemesis-02',
      'frag-nemesis-03',
      'frag-nemesis-04',
      'frag-nemesis-05',
    ]);
    decodeAllAtSage(driver, [
      ['frag-nemesis-01', 'sage.mizar.decode-first'],
      ['frag-nemesis-02', 'sage.mizar.decode-02'],
      ['frag-nemesis-03', 'sage.mizar.decode-03'],
      ['frag-nemesis-04', 'sage.mizar.decode-04'],
      ['frag-nemesis-05', 'sage.mizar.decode-05'],
    ]);
    expect(fragmentsDecodedCount(driver.file())).toBeGreaterThanOrEqual(5);

    // --- Past the chokepoint: derelict-log/beacon-echo recoveries (06/07/08) and
    //     the NPC-held pieces (09/10/11) — the 'npc' acquisition mode. ---
    goTo(driver, 19);
    playStorylet(driver, 'nemesis.derelict-log.silent-fleet', 'pull-the-log');
    goTo(driver, 20);
    playStorylet(driver, 'nemesis.derelict-log.cartographer', 'take-the-log');
    goTo(driver, 16);
    playStorylet(driver, 'nemesis.beacon-echo.answer', 'record-the-echo');
    takeFromNpc(
      driver,
      'npc-rust-bucket',
      'nemesis.npc-held.rust-bucket',
      'take-the-sliver',
      'frag-nemesis-09',
    );
    takeFromNpc(
      driver,
      'npc-star-gazer',
      'nemesis.npc-held.star-gazer',
      'take-the-heirloom',
      'frag-nemesis-10',
    );
    takeFromNpc(
      driver,
      'npc-void-whisper',
      'nemesis.npc-held.void-whisper',
      'take-the-reliquary',
      'frag-nemesis-11',
    );
    for (const id of [
      'frag-nemesis-06',
      'frag-nemesis-07',
      'frag-nemesis-08',
      'frag-nemesis-09',
      'frag-nemesis-10',
      'frag-nemesis-11',
    ]) {
      expect(hasFragment(driver.file(), id), `missing ${id}`).toBe(true);
    }

    // --- Decode 06–11, then the Sage reconstructs the final line (frag-12). ---
    decodeAllAtSage(driver, [
      ['frag-nemesis-06', 'sage.mizar.decode-06'],
      ['frag-nemesis-07', 'sage.mizar.decode-07'],
      ['frag-nemesis-08', 'sage.mizar.decode-08'],
      ['frag-nemesis-09', 'sage.mizar.decode-09'],
      ['frag-nemesis-10', 'sage.mizar.decode-10'],
      ['frag-nemesis-11', 'sage.mizar.decode-11'],
    ]);
    playStorylet(driver, 'sage.mizar.reconstruct-final-line', 'reconstruct');
    expect(fragmentsDecodedCount(driver.file())).toBe(CROSSING_MIN_DECODED);

    // --- Commit the crossing at Polaris-1 (the stake — rank + bank + ship). ---
    goTo(driver, CROSSING_COMMIT_SYSTEM_ID);
    // Top the tank for the burn (the ship stake) BEFORE snapshotting credits, so the
    // post-commit assertion isolates the bank stake actually spent by the commit.
    if (driver.state.player.ship.fuel < CROSSING_BURN_FUEL) {
      driver.tick((s) => {
        const d = firstDie(s);
        return d === undefined
          ? [{ type: 'Wait' }]
          : [
              {
                type: 'Trade',
                action: 'buy-fuel',
                fuelAmount: CROSSING_BURN_FUEL + 1000,
                spendDie: d,
              },
            ];
      });
    }
    expect(driver.state.player.ship.fuel).toBeGreaterThanOrEqual(CROSSING_BURN_FUEL);
    const creditsBeforeCommit = driver.state.player.credits;
    expect(creditsBeforeCommit).toBeGreaterThanOrEqual(CROSSING_BANK_STAKE);

    playStorylet(driver, 'nemesis.crossing.commit', 'commit');
    expect(driver.state.flags['nemesis.crossing.unlocked']).toBe(true);
    // The bank stake was actually spent through the commit.
    expect(driver.state.player.credits).toBe(creditsBeforeCommit - CROSSING_BANK_STAKE);

    goTo(driver, NEMESIS_SYSTEM_ID);
    expect(driver.state.player.currentSystemId).toBe(NEMESIS_SYSTEM_ID);
    expect(driver.state.eventLog.some((e) => e.type === 'CrossingCompleted')).toBe(true);
  }, 120000);
});
