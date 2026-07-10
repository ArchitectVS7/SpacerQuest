import { NpcState, GameEvent, NpcAction } from './types.js';
import { SeededRng } from './rng.js';
import { NPC_PROFILES, FLAWS } from '@spacerquest/content';

export function resolveNpcDay(
  npc: NpcState,
  rng: SeededRng,
  context: { day: number }
): { npc: NpcState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const updatedNpc = JSON.parse(JSON.stringify(npc)) as NpcState;

  const profile = NPC_PROFILES.find((p) => p.id === updatedNpc.profileId);
  if (!profile) {
    throw new Error(`Profile not found for NPC ${updatedNpc.id}`);
  }

  // 1. Calculate Intent
  // We use the RNG to pick a base action, weighted by their stats
  const actionRoll = rng.next();
  let intendedAction: NpcAction;

  if (profile.stats.PILOT > profile.stats.TRADE && profile.stats.PILOT > profile.stats.GUNS) {
    if (actionRoll > 0.5) {
      intendedAction = { type: 'Travel', details: 'jumped to a new system' };
      updatedNpc.fuel = Math.max(0, updatedNpc.fuel - 50);
    } else {
      intendedAction = { type: 'Trade', details: 'secured a new cargo contract' };
    }
  } else if (profile.stats.GUNS > profile.stats.TRADE) {
    if (actionRoll > 0.4) {
      intendedAction = { type: 'Combat', details: 'was seen engaging a local patrol' };
      updatedNpc.fuel = Math.max(0, updatedNpc.fuel - 100);
    } else {
      intendedAction = { type: 'Patrol', details: 'patrolled the sector' };
    }
  } else {
    if (actionRoll > 0.3) {
      intendedAction = { type: 'Trade', details: 'made a lucrative trade on the local market' };
      updatedNpc.credits += 500;
    } else {
      intendedAction = { type: 'Travel', details: 'moved to a better market' };
      updatedNpc.fuel = Math.max(0, updatedNpc.fuel - 50);
    }
  }

  // 2. The Flaw Check — only when the day's intent touches the flaw
  // (PRD §6: flaws override optimal play when a decision touches them,
  // not on a blanket daily roll). Resist on d20 >= the character's own
  // flawDc: disciplined characters resist easily, volatile ones rarely.
  const flawDef = FLAWS[profile.flaw];
  const touchesFlaw =
    flawDef !== undefined &&
    (flawDef.triggers as string[]).includes(intendedAction.type);

  if (touchesFlaw) {
    const die = rng.d20();
    const resisted = die >= profile.flawDc;

    events.push({
      type: 'FlawCheck',
      npcId: updatedNpc.id,
      flaw: profile.flaw,
      die,
      dc: profile.flawDc,
      resisted,
    });

    if (!resisted) {
      // Flaw Override! The flaw chooses the day.
      intendedAction = {
        type: 'FlawOverride',
        details: flawDef.detail,
      };
      if (flawDef.credits) {
        updatedNpc.credits += flawDef.credits;
      }
      if (flawDef.fuel === 'drain') {
        updatedNpc.fuel = 0;
      } else if (flawDef.fuel) {
        updatedNpc.fuel = Math.max(0, updatedNpc.fuel + flawDef.fuel);
      }
    }
  }

  updatedNpc.lastAction = intendedAction;

  events.push({
    type: 'NpcAction',
    npcId: updatedNpc.id,
    actionDetails: intendedAction.details,
  });

  return { npc: updatedNpc, events };
}
