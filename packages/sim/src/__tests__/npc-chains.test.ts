import { describe, expect, it } from 'vitest';
import { STORYLETS, type StoryletDefinition } from '@spacerquest/content';
import {
  applyPlayerAction,
  createInitialState,
  endDay,
  startDay,
  type GameEvent,
  type GameState,
} from '@spacerquest/engine';

// ---------------------------------------------------------------------------
// T-1502 · NPC personal-chain reachability + abandonment (PRD §8.1).
//
// Two runs per chain, both driven through LEGAL engine actions only
// (startDay / applyPlayerAction / endDay). The driver NEVER pokes state.flags,
// state.day, disposition, or position — the same honesty bar the project's
// global rules set for playtests:
//
//   1. COMPLETION: travel to episode 1's port, play the engage choice, then each
//      dawn play the scheduled episode as it surfaces, through the terminal one.
//      The ep2/ep3 disposition gates are therefore hit ORGANICALLY — the only way
//      ep3 is ever OFFERED is that its `npc.disposition >= 3` gate matched, and the
//      only thing that raised the NPC's disposition is the earlier episodes' grants.
//
//   2. ABANDONMENT: play episode 1 to arm the chain, then let the clock run past
//      the scheduled ep2's grace window WITHOUT playing it. The engine's dusk sweep
//      (resolveAbandonedChains) resolves the chain on the wire — the authored
//      WireEntry + the disposition penalty — proving the chain resolves without you.
// ---------------------------------------------------------------------------

const BY_ID = new Map<string, StoryletDefinition>(STORYLETS.map((s) => [s.id, s]));

interface Chain {
  name: string;
  npcId: string;
  port: number;
  /** [ep1, ep2, ep3] storylet ids, in play order. */
  episodes: readonly [string, string, string];
  resolvedFlag: string;
  /** The ep3 disposition gate — the peak the driver must reach organically. */
  ep3Gate: number;
}

const CHAINS: readonly Chain[] = [
  {
    name: 'Doc Salvage',
    npcId: 'npc-doc-salvage',
    port: 1,
    episodes: [
      'chain.doc-salvage.distress-ping',
      'chain.doc-salvage.follow-up',
      'chain.doc-salvage.impound',
    ],
    resolvedFlag: 'chain.doc-salvage.resolved',
    ep3Gate: 2,
  },
  {
    name: 'Silk Dagger',
    npcId: 'npc-silk-dagger',
    port: 3,
    episodes: [
      'chain.silk-dagger.marker',
      'chain.silk-dagger.collector',
      'chain.silk-dagger.reckoning',
    ],
    resolvedFlag: 'chain.silk-dagger.resolved',
    ep3Gate: 3,
  },
  {
    name: 'Wild Card',
    npcId: 'npc-wild-card',
    port: 6,
    episodes: ['chain.wild-card.pitch', 'chain.wild-card.co-sign', 'chain.wild-card.fallout'],
    resolvedFlag: 'chain.wild-card.resolved',
    ep3Gate: 3,
  },
  {
    name: 'Rattlesnake',
    npcId: 'npc-rattlesnake',
    port: 2,
    episodes: [
      'chain.rattlesnake.insult',
      'chain.rattlesnake.escalation',
      'chain.rattlesnake.duel',
    ],
    resolvedFlag: 'chain.rattlesnake.resolved',
    ep3Gate: 3,
  },
  {
    name: 'Stellar Monk',
    npcId: 'npc-stellar-monk',
    port: 5,
    episodes: [
      'chain.stellar-monk.empty-hold',
      'chain.stellar-monk.confession',
      'chain.stellar-monk.ballast',
    ],
    resolvedFlag: 'chain.stellar-monk.resolved',
    ep3Gate: 3,
  },
  {
    name: 'The Broker',
    npcId: 'npc-the-broker',
    port: 4,
    episodes: ['chain.the-broker.ledger', 'chain.the-broker.favor', 'chain.the-broker.leverage'],
    resolvedFlag: 'chain.the-broker.resolved',
    ep3Gate: 3,
  },
];

type Offer = GameState['storylets']['available'][number];
type Choice = Offer['choices'][number];

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

/** Clear any active encounter so Storylet/Travel actions unblock (Storylet is NOT
 *  encounter-exempt — the engine blocks it during a fight). Talk completes an
 *  interrupted jump; run only aborts, so prefer talk, fall back to run. */
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

/** Fly toward `dest`, completing the jump through any encounter. No-op when there
 *  already or out of dice/fuel (retried the next dawn). */
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

/** A requirement-free choice for a chain episode, PREFERRING one that schedules
 *  the next episode (so ep1/ep2 always advance the chain). Every chain episode
 *  carries at least one requirement-free choice (engine test enforces it). */
function pickChoice(storylet: StoryletDefinition): Choice | undefined {
  const free = storylet.choices.filter((c) => !c.requirements);
  const scheduling = free.find((c) =>
    [c.effects, c.successEffects, c.failureEffects].some((e) => (e?.schedule?.length ?? 0) > 0),
  );
  return scheduling ?? free[0];
}

/** Play any currently-available episode of `chain` with a requirement-free choice.
 *  Returns the new state, whether an episode was played, and the events. */
function playChainEpisode(
  state: GameState,
  chain: Chain,
): { state: GameState; played: boolean; events: GameEvent[] } {
  const offer = state.storylets.available.find((o) => chain.episodes.includes(o.storyletId));
  if (!offer) return { state, played: false, events: [] };
  const def = BY_ID.get(offer.storyletId);
  const choice = def ? pickChoice(def) : undefined;
  if (!def || !choice) return { state, played: false, events: [] };
  const result = applyPlayerAction(state, {
    type: 'Storylet',
    storyletId: offer.storyletId,
    choiceId: choice.id,
  });
  return { state: result.state, played: true, events: result.events };
}

const npcDispo = (state: GameState, npcId: string): number =>
  state.npcs.find((n) => n.id === npcId)?.disposition ?? 0;

describe('T-1502 NPC personal chains — completion (organic disposition gates)', () => {
  for (const chain of CHAINS) {
    it(`${chain.name}: completable end-to-end through legal play; ep3 gate hit organically`, () => {
      let state = createInitialState(7);
      const positiveDispoEvents: GameEvent[] = [];
      let peakDispo = 0;
      let resolved: unknown;

      for (let day = 0; day < 40; day += 1) {
        state = startDay(state).state;
        if (state.encounter) state = clearEncounter(state);

        // Play every chain episode that is live this dawn (ep1 arms ep2, etc.).
        let progressed = true;
        while (progressed) {
          if (state.encounter) state = clearEncounter(state);
          const step = playChainEpisode(state, chain);
          state = step.state;
          progressed = step.played;
          for (const e of step.events) {
            if (e.type === 'DispositionChanged' && e.npcId === chain.npcId && e.delta > 0) {
              positiveDispoEvents.push(e);
            }
          }
          peakDispo = Math.max(peakDispo, npcDispo(state, chain.npcId));
        }

        // Not yet at the port to open ep1 → travel there.
        const started = state.storylets.completed[chain.episodes[0]] !== undefined;
        if (!started && state.player.currentSystemId !== chain.port) {
          state = travelTo(state, chain.port);
        }

        resolved = state.flags[chain.resolvedFlag];
        if (resolved !== undefined) {
          state = endDay(state).state;
          break;
        }
        state = endDay(state).state;
      }

      // The chain reached a real terminal outcome (not the wire abandonment, not a
      // decline) through legal play.
      expect(resolved, `${chain.name} never resolved`).toBeDefined();
      expect(resolved).not.toBe('wire');
      expect(resolved).not.toBe('declined');
      // All three episodes were played.
      for (const ep of chain.episodes) {
        expect(state.storylets.completed[ep], `${ep} not completed`).toBeDefined();
      }
      // The ep3 disposition gate was crossed ORGANICALLY: ep3 could only be OFFERED
      // if the NPC's disposition was >= its gate, and the driver never touched
      // disposition — the only thing that raised it is the episodes' own grants.
      expect(peakDispo).toBeGreaterThanOrEqual(chain.ep3Gate);
      // The positive completion grants landed as DispositionChanged events.
      expect(positiveDispoEvents.length).toBeGreaterThan(0);
    });
  }
});

describe('T-1502 NPC personal chains — abandonment (the wire resolves it without you)', () => {
  for (const chain of CHAINS) {
    it(`${chain.name}: abandoning ep2 produces the wire resolution + disposition penalty`, () => {
      const ep2 = BY_ID.get(chain.episodes[1])!;
      const wire = ep2.wireResolution!;
      expect(wire, `${chain.episodes[1]} has no wireResolution`).toBeDefined();

      let state = createInitialState(7);

      // Phase 1: reach the port and play episode 1 (arms ep2), nothing more.
      let armed = false;
      for (let day = 0; day < 40 && !armed; day += 1) {
        state = startDay(state).state;
        if (state.encounter) state = clearEncounter(state);
        if (state.player.currentSystemId === chain.port) {
          const step = playChainEpisode(state, chain);
          state = step.state;
          if (state.storylets.completed[chain.episodes[0]] !== undefined) armed = true;
        } else {
          state = travelTo(state, chain.port);
        }
        state = endDay(state).state;
      }
      expect(armed, `${chain.name} ep1 never armed`).toBe(true);
      // ep2 is scheduled but NOT yet resolved.
      expect(state.storylets.scheduled.some((s) => s.storyletId === chain.episodes[1])).toBe(true);
      const dispoAtArm = npcDispo(state, chain.npcId);

      // Phase 2: let the grace window lapse WITHOUT playing ep2. Collect events.
      const abandonEvents: GameEvent[] = [];
      for (let day = 0; day < wire.graceDays + 4; day += 1) {
        state = startDay(state).state;
        if (state.encounter) state = clearEncounter(state);
        // deliberately DO NOT play the chain episode
        const dusk = endDay(state);
        state = dusk.state;
        abandonEvents.push(...dusk.events);
        if (state.flags[chain.resolvedFlag] === 'wire') break;
      }

      // The Galactic-Wire filed the authored abandonment line (kind 'npc').
      expect(
        abandonEvents.some(
          (e) => e.type === 'WireEntry' && e.kind === 'npc' && e.message === wire.wireMessage,
        ),
        `${chain.name} wire line never filed`,
      ).toBe(true);
      // The abandonment disposition penalty landed (a negative DispositionChanged).
      expect(
        abandonEvents.some(
          (e) => e.type === 'DispositionChanged' && e.npcId === chain.npcId && e.delta < 0,
        ),
        `${chain.name} abandonment penalty never applied`,
      ).toBe(true);
      // The chain is stamped wire-resolved and the episode completed — it won't re-offer.
      expect(state.flags[chain.resolvedFlag]).toBe('wire');
      expect(state.storylets.completed[chain.episodes[1]]).toBeDefined();
      // The penalty actually moved the NPC below where the arming left them.
      expect(npcDispo(state, chain.npcId)).toBeLessThan(dispoAtArm);
    });
  }
});
