import { ERA_EVENTS, STORYLETS } from '@spacerquest/content';
import { createInitialState, eligibleStorylets, endDay, startDay } from '@spacerquest/engine';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// T-1504 · Every era reachable and fires >= 1 tied storylet (acceptance). The 6
// era EVENTS were already authored; this task added one storylet per era gated on
// `trigger.eraEvent.defId` (the T-1302 era-event trigger). This sweep proves each
// era ACTUALLY goes live in seeded play and, while it is live, at least one tied
// storylet is eligible — the "delivered by the economy" hook firing end-to-end.
//
// HONESTY: nothing sets `state.eraEvent` by hand. The era schedule rolls its own
// seeded onset through the real dusk loop (endDay → advanceEraSchedule); the test
// only advances days and reads. The tied storylets gate on defId alone (no
// in-affected-system requirement), so eligibility needs only the live era — which
// is what makes them reachable galaxy-wide the moment the wire breaks.
// ---------------------------------------------------------------------------

// storyletId → the era defId it is tied to (only the era-tied storylets). The
// STORYLETS const tuple narrows each trigger to its literal shape (many lack an
// `eraEvent` key), so read it through a widening view of the optional field.
const ERA_STORYLET_DEF: ReadonlyMap<string, string> = new Map(
  STORYLETS.flatMap((s) => {
    const defId = (s.trigger as { eraEvent?: { defId?: string } }).eraEvent?.defId;
    return defId !== undefined ? ([[s.id, defId]] as [string, string][]) : [];
  }),
);

describe('T-1504 era reachability + tied storylets', () => {
  it('each of the 6 eras goes live and offers >= 1 tied storylet in a seed sweep', () => {
    // Every authored era id must be covered — each has a tie-in storylet.
    const targets = new Set(ERA_EVENTS.map((e) => e.id));
    // Sanity: every era id has at least one tied storylet to reach.
    for (const id of targets) {
      expect([...ERA_STORYLET_DEF.values()].includes(id), `era ${id} has no tied storylet`).toBe(
        true,
      );
    }

    const covered = new Set<string>();

    // A wide seed sweep at a long horizon: era onset is seeded (~10%/day after a
    // cooldown), so a given seed surfaces only a handful of eras — the union across
    // seeds reaches all 6. The loop advances days with no actions (the era schedule
    // rolls in the dusk loop regardless) and stops the instant all 6 are covered.
    for (let seed = 1; seed <= 80 && covered.size < targets.size; seed += 1) {
      let state = createInitialState(seed);
      for (let day = 0; day < 600 && covered.size < targets.size; day += 1) {
        state = endDay(startDay(state).state).state;
        const active = state.eraEvent?.defId;
        if (!active || covered.has(active)) continue;

        // While this era is live, at least one tied storylet must be eligible.
        const offers = eligibleStorylets(state);
        const firesTied = offers.some((o) => ERA_STORYLET_DEF.get(o.storyletId) === active);
        expect(
          firesTied,
          `era ${active} is live (seed ${seed}, day ${state.day}) but no tied storylet is eligible`,
        ).toBe(true);
        covered.add(active);
      }
    }

    const missing = [...targets].filter((id) => !covered.has(id));
    expect(missing, `eras never reached: ${missing.join(', ')}`).toEqual([]);
  }, 120000);
});
