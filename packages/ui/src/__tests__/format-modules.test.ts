import { describe, expect, it } from 'vitest';
import { createInitialState } from '@spacerquest/engine';
import type { GameEvent, GameState } from '@spacerquest/engine';
import { CREW_ROLES, MAX_DAWN_HAND_SIZE } from '@spacerquest/content';
import {
  crewBenefitLabel,
  dawnHandModifiers,
  diceBenefitLabel,
  explorationOutcome,
  fittedModuleRows,
} from '../format';

// ---------------------------------------------------------------------------
// T-112 · THE COCKPIT'S VIEW OF AN EXPLORE-GRANTED MODULE
// (docs/EXPLORE_REDESIGN.md §4.4).
//
// The rule this file guards: a Class-B effect must not be a silent buff. There
// are three places it has to show — the ship pane's fitted list, the HandDock
// badges, and the wire line on the day it was recovered — and all three read the
// SAME content table the engine's dawn aggregation reads, so the pane and the
// dealt hand cannot disagree.
// ---------------------------------------------------------------------------

function stateWithModules(...ids: string[]): GameState {
  const state = createInitialState(1);
  state.player.ship.exploreModules = ids as never;
  return state;
}

describe('T-112 · fittedModuleRows', () => {
  it('is empty on a fresh ship — nothing is rendered until something is fitted', () => {
    expect(fittedModuleRows(createInitialState(1))).toEqual([]);
  });

  it('names the fitted module and labels its benefit from content', () => {
    const rows = fittedModuleRows(stateWithModules('module-tally-slate'));
    expect(rows).toEqual([
      { id: 'module-tally-slate', name: 'Gunnery Tally-Slate', benefitLabel: 'floor 3' },
    ]);
  });

  it('lists every fitted module in the shipped table order, not recovery order', () => {
    const rows = fittedModuleRows(stateWithModules('module-berth-couch', 'module-tally-slate'));
    expect(rows.map((r) => r.id)).toEqual(['module-tally-slate', 'module-berth-couch']);
    expect(rows.map((r) => r.benefitLabel)).toEqual(['floor 3', '+1 die']);
  });
});

describe('T-112 · the badges the player reads come from the engine aggregator', () => {
  it("reports the tally-slate's floor on the HandDock", () => {
    // Same aggregator `startDay` deals from — no re-derived rule in the UI.
    expect(dawnHandModifiers(stateWithModules('module-tally-slate')).floor).toBe(3);
    expect(dawnHandModifiers(createInitialState(1)).floor).toBe(0);
  });

  it('reports the ephemeris re-roll grant', () => {
    expect(dawnHandModifiers(stateWithModules('module-marked-ephemeris')).rerolls).toBe(1);
  });

  it('THE HAND CAP BINDS IN THE COCKPIT TOO — a Second plus the berth-couch is 7', () => {
    const state = stateWithModules('module-berth-couch');
    state.player.crew = [{ roleId: 'crew-second', hiredDay: 1 }];
    expect(dawnHandModifiers(state).handSize).toBe(MAX_DAWN_HAND_SIZE);
  });
});

describe('T-112 · the moment of acquisition', () => {
  const poi: GameEvent = {
    type: 'PoiDiscovered',
    day: 3,
    poiId: 'poi-1-d3-e0-derelict',
    poiType: 'derelict',
    name: 'a gutted freighter hulk',
    systemId: 1,
  };

  it('names the recovered item alongside the charted POI', () => {
    const line = explorationOutcome([
      poi,
      {
        type: 'UniqueItemAcquired',
        day: 3,
        itemId: 'item-berth-couch',
        poiId: 'poi-1-d3-e0-derelict',
        systemId: 1,
      },
    ]);
    expect(line).toBe("Charted a gutted freighter hulk · Staff Pilot's Berth-Couch recovered.");
  });

  it('falls back honestly when the item id no longer resolves', () => {
    const line = explorationOutcome([
      poi,
      {
        type: 'UniqueItemAcquired',
        day: 3,
        itemId: 'item-retired',
        poiId: 'poi-1-d3-e0-derelict',
        systemId: 1,
      },
    ]);
    expect(line).toBe('Charted a gutted freighter hulk · an unlogged fitting recovered.');
  });

  // T-114 · the two band-2 kinds that had no clause before this pass. Both read
  // an emitted event and look a NAME up; neither re-derives an effect.
  it('names the captain an NPC introduction moved', () => {
    const line = explorationOutcome([
      poi,
      {
        type: 'DispositionChanged',
        day: 3,
        npcId: 'npc-doc-salvage',
        delta: 2,
        disposition: 2,
        reason: 'storylet',
      },
    ]);
    expect(line).toBe('Charted a gutted freighter hulk · Doc Salvage owes you a word.');
  });

  it('names the episode a questline hook scheduled', () => {
    const line = explorationOutcome([
      poi,
      {
        type: 'StoryletScheduled',
        day: 3,
        storyletId: 'explore-quest-cold-berth',
        choiceId: 'explore',
        scheduledStoryletId: 'explore.cold-berth.survivor',
        dueDay: 5,
      },
    ]);
    expect(line).toBe('Charted a gutted freighter hulk · a lead opened: The Berth That Was Warm.');
  });

  it('falls back honestly when the scheduled storylet id no longer resolves', () => {
    const line = explorationOutcome([
      poi,
      {
        type: 'StoryletScheduled',
        day: 3,
        storyletId: 'explore-quest-retired',
        choiceId: 'explore',
        scheduledStoryletId: 'explore.retired.beat',
        dueDay: 5,
      },
    ]);
    expect(line).toBe('Charted a gutted freighter hulk · a lead opened.');
  });
});

describe('T-112 · the diceBenefitLabel extraction is inert', () => {
  it('crewBenefitLabel still returns the three legacy strings verbatim', () => {
    const byId = Object.fromEntries(CREW_ROLES.map((r) => [r.id, r]));
    expect(crewBenefitLabel(byId['crew-second'])).toBe('+1 die');
    expect(crewBenefitLabel(byId['crew-navigator'])).toBe('one re-roll/day');
    expect(crewBenefitLabel(byId['crew-quartermaster'])).toBe('floor 5');
  });

  it('labels a bare DiceBenefit identically — one vocabulary, one label', () => {
    expect(diceBenefitLabel({ kind: 'extra-die' })).toBe('+1 die');
    expect(diceBenefitLabel({ kind: 'reroll' })).toBe('one re-roll/day');
    expect(diceBenefitLabel({ kind: 'floor', floor: 5 })).toBe('floor 5');
  });
});
