import { DEEDS } from '@spacerquest/content';
import { describe, expect, it } from 'vitest';
import { driveConquerorCampaign } from './support/conqueror-driver.js';

// ---------------------------------------------------------------------------
// T-1504 · No Deed unearnable (acceptance: "200-seed sweep earns every deed at
// least once"). The union of Deeds earned across a seed sweep of the all-verb
// driver must cover EVERY authored Deed — an unearnable Deed is a content bug
// (fix the trigger), never something to poke into the registry.
//
// The driver (support/conqueror-driver.ts) reaches every verb through LEGAL
// actions only: trade + marker clear, combat, rim runs, era storylets, gambling,
// lending, exploration, property, smuggling. It NEVER sets registry / flags /
// eraEvent / position by hand. The loop early-exits the instant the union is
// complete (in practice within the first handful of seeds), capped at 200.
// ---------------------------------------------------------------------------
describe('T-1504 every deed earnable in a seed sweep', () => {
  it('the union of earned deeds across a 200-seed sweep covers every authored deed', () => {
    const ALL_IDS = DEEDS.map((deed) => deed.id);
    const union = new Set<string>();

    for (let seed = 1; seed <= 200 && union.size < ALL_IDS.length; seed += 1) {
      const state = driveConquerorCampaign(seed, 250);
      for (const deed of state.player.registry.earned) union.add(deed.id);
    }

    const missing = ALL_IDS.filter((id) => !union.has(id));
    expect(missing, `unearned deeds: ${missing.join(', ')}`).toEqual([]);
  }, 300000);
});
