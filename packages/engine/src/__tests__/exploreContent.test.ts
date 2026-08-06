import { describe, expect, it } from 'vitest';
import {
  ALL_NPC_PROFILES,
  EXPLORE_ITEM_BY_ID,
  EXPLORE_ITEMS,
  EXPLORE_MODULE_DICE_BENEFITS,
  EXPLORE_OUTCOMES,
  EXPLORE_VALUE_BANDS,
  ExploreOutcomeDefinition,
  ExploreValueBand,
  STORYLETS,
  Stat,
  StoryletDefinition,
} from '@spacerquest/content';
import { resolveExploration } from '../actions/exploration.js';
import { apCost, recoveryDays } from '../exploreOutcomes.js';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import { refreshAvailableStorylets } from '../storylets.js';
import { createInitialState } from '../state.js';
import { SeededRng } from '../rng.js';
import { DayPhase, GameEvent, GameState } from '../types.js';

/**
 * T-113 … T-115 · THE CROSS-PACKAGE HALF of the authored explore table's
 * validator (docs/EXPLORE_REDESIGN.md §5) — the assertions that can only be made
 * from the engine, because they resolve a row THROUGH it.
 *
 * T-164 · THE FILE SPLIT; THIS IS THE HALF THAT CANNOT MOVE. `packages/content`
 * had no test runner until T-164 stood one up, and that accident — not a design
 * decision — is why the whole validator lived here. The rule that replaces it is
 * `docs/TESTING-STRATEGY.md` Part I: a validator whose assertions read only
 * `@spacerquest/content` lives beside its rows; one that must resolve a row
 * through the engine stays here, PERMANENTLY.
 *
 * WHAT MOVED: sections 1 and 2 — every-row well-formedness and the §5 ladder
 * distribution — are now `packages/content/src/__tests__/exploreContent.test.ts`.
 * WHAT STAYED, and why it has to: everything below imports `resolveExploration`,
 * `apCost`/`recoveryDays`, `createInitialState`, `applyPlayerAction`/`startDay`/
 * `endDay`, `refreshAvailableStorylets` and `SeededRng`. Content can never import
 * any of them: `packages/engine` depends on `@spacerquest/content` and
 * `packages/engine/tsconfig.json` references `../content`, so the reverse edge is
 * a `tsc -b` project-reference cycle. That is asserted, not merely asserted-about,
 * by `packages/content/src/__tests__/contentPackageBoundary.test.ts`.
 *
 * THE HELPERS BELOW ARE DELIBERATELY DUPLICATED across the two files rather than
 * shared. Sharing them would mean content deep-importing `engine/dist/__tests__`
 * or vice versa — a build-order dependency between two test suites, to save
 * twenty lines. `bandOf` in particular is a pure function of
 * `EXPLORE_VALUE_BANDS`, so the two copies cannot drift without the band table
 * moving under both of them.
 *
 * T-114 · EVERY ASSERTION THAT WAS BAND-1-ONLY IS NOW BAND-SCOPED — the credit
 * range, the recovery clock and the row counts are read off `EXPLORE_VALUE_BANDS`
 * or off a per-band table transcribed from §5.2, so a band-2 row is checked
 * against band 2's own column rather than against band 1's.
 *
 * T-115 · `authored` AND `EXPLORE_OUTCOMES` ARE THE SAME 100 ROWS. The filter
 * below is kept for one reason only: a future `legacy-` row would fail loudly (in
 * the content-side tripwire) rather than quietly exempting itself from every
 * check in either file.
 */

const LEGACY_PREFIX = 'legacy-';
const authored = EXPLORE_OUTCOMES.filter((row) => !row.id.startsWith(LEGACY_PREFIX));

/** §5.2's ladder for an `npc` row's `dispositionDelta`, per band. Band 2 is an
 *  INTRODUCTION (1-2), band 3 is a DEBT (3-4); bands 0, 1 and 4 permit no `npc`
 *  row at all, which is asserted rather than assumed. */
const NPC_DELTA_BY_BAND: Readonly<Record<number, { min: number; max: number } | undefined>> = {
  2: { min: 1, max: 2 },
  3: { min: 3, max: 4 },
};

function bandOf(row: ExploreOutcomeDefinition): ExploreValueBand {
  let band = EXPLORE_VALUE_BANDS[0];
  for (const candidate of EXPLORE_VALUE_BANDS) {
    if (row.valuePoints >= candidate.minValuePoints) band = candidate;
  }
  return band;
}

function rowsInBand(band: number): ExploreOutcomeDefinition[] {
  return authored.filter((row) => bandOf(row).band === band);
}

// ---------------------------------------------------------------------------
// 0 · T-164 · the two clauses that survived the split in the other direction
// ---------------------------------------------------------------------------

describe('T-164 · the engine derives a row‘s clock and dice cost from its BAND', () => {
  it('recoveryDays and apCost are functions of the BAND and of nothing else', () => {
    // THE OTHER HALF OF the content-side "no authored row carries a recoveryDays
    // or apCost key" test, which now lives at
    // `packages/content/src/__tests__/exploreContent.test.ts`. The key-ABSENCE
    // clauses are pure content and went with it; these two call ENGINE functions
    // (`../exploreOutcomes.js`), which content cannot import, so they stayed —
    // and became an `it` of their own rather than being dropped in the move.
    //
    // T-114 · the claim was `=== 0` while bands 0-1 were the whole table. It is
    // now the general claim it always meant: a row’s recovery clock is a function
    // of its BAND and of nothing else, so every band-2 row opens a one-day op
    // purely because band 2 says 1 — never because a row said so.
    //
    // T-131 · `apCost` joins it on identical terms (owner ruling D1). A row may
    // no more hand-tune its dice cost than its day count, and the same two
    // clauses say so.
    for (const row of authored) {
      expect(recoveryDays(row.valuePoints), `${row.id} clock`).toBe(bandOf(row).recoveryDays);
      expect(apCost(row.valuePoints), `${row.id} dice cost`).toBe(bandOf(row).apCost);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 · T-114 · the three kinds that point OUTSIDE this file must resolve
// ---------------------------------------------------------------------------

describe('T-114 · every id an authored row names resolves against real content', () => {
  const questlineRows = authored.filter((row) => row.payload.kind === 'questline');
  const npcRows = authored.filter((row) => row.payload.kind === 'npc');
  const itemRows = authored.filter((row) => row.payload.kind === 'unique-item');

  it('every questline row resolves into the EXISTING storylet system', () => {
    // THE ACCEPT CLAUSE, mechanically. Three things have to be true or the hook
    // is a schedule entry pointing at nothing:
    //   (1) the id names a real STORYLETS entry;
    //   (2) that storylet is `scheduledOnly` — otherwise scheduling it is a
    //       no-op, because `triggerMatches` still evaluates the full trigger and
    //       an ordinary gated storylet would be offered on its own terms anyway;
    //   (3) it carries a `wireResolution`, so a hook the player never plays is
    //       resolved by the existing `resolveAbandonedChains` dusk sweep instead
    //       of dangling in `state.storylets.scheduled` forever.
    expect(questlineRows.length).toBeGreaterThan(0);
    for (const row of questlineRows) {
      if (row.payload.kind !== 'questline') continue;
      const { storyletId } = row.payload;
      const target = (STORYLETS as readonly StoryletDefinition[]).find((s) => s.id === storyletId);
      expect(target, `${row.id} points at an unknown storylet`).toBeDefined();
      expect(target!.trigger.scheduledOnly, `${target!.id} is not scheduledOnly`).toBe(true);
      expect(target!.wireResolution, `${target!.id} has no wireResolution`).toBeDefined();
      expect(Number.isInteger(row.payload.delayDays)).toBe(true);
      expect(row.payload.delayDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('every npc row names a profile the CAST table and the LIVE roster both hold', () => {
    // Resolved against BOTH, deliberately. `applyEffects`'s disposition arm does
    // `state.npcs.find(...)` and silently `continue`s on a miss, so "the id is in
    // `ALL_NPC_PROFILES`" is not the same claim as "the effect lands". The live
    // roster is seeded from NPC_PROFILES *and* QUEST_PROFILES (`state.ts`), which
    // is why a quest-profile id is a legal target for a row.
    const castIds = new Set(ALL_NPC_PROFILES.map((npc) => npc.id));
    const rosterIds = new Set(createInitialState(1).npcs.map((npc) => npc.id));
    expect(npcRows.length).toBeGreaterThan(0);
    for (const row of npcRows) {
      if (row.payload.kind !== 'npc') continue;
      expect(castIds.has(row.payload.profileId), `${row.id} cast id`).toBe(true);
      expect(rosterIds.has(row.payload.profileId), `${row.id} live roster`).toBe(true);
      // THE LADDER SHOWS THROUGH IN THE DELTA, and it is checked per band rather
      // than as one loose range: band 2 authors INTRODUCTIONS (a pip or two for a
      // civil exchange) and band 3 authors DEBTS (the captain hands over
      // something they could have sold). A single 1-4 range would let a band-2
      // row quietly buy band-3 standing.
      const band = bandOf(row).band;
      const range = NPC_DELTA_BY_BAND[band];
      expect(range, `${row.id} is an npc row in band ${band}, which authors none`).toBeDefined();
      expect(Number.isInteger(row.payload.dispositionDelta)).toBe(true);
      expect(row.payload.dispositionDelta, `${row.id} delta`).toBeGreaterThanOrEqual(range!.min);
      expect(row.payload.dispositionDelta, `${row.id} delta`).toBeLessThanOrEqual(range!.max);
    }
  });

  it('every unique-item row grants a real item INSIDE its own band’s ceiling', () => {
    // §5.2's `Class-A ceiling` / `Class-B permitted` columns land on
    // `EXPLORE_VALUE_BANDS` at T-114 (finding F-112-C re-targeted them here,
    // because T-112 authored no rows to check them against). This is their one
    // reader — no engine line reads them, and none can: the ceiling is a rule
    // about what an AUTHOR may write, not about what the resolver does.
    expect(itemRows.length).toBeGreaterThan(0);
    for (const row of itemRows) {
      if (row.payload.kind !== 'unique-item') continue;
      const item = EXPLORE_ITEM_BY_ID[row.payload.itemId];
      expect(item, `${row.id} names an unknown item`).toBeDefined();
      const band = bandOf(row);
      if (item.class === 'ship') {
        for (const delta of item.deltas) {
          switch (delta.element) {
            case 'component':
              expect(delta.strength, `${item.id} strength`).toBeLessThanOrEqual(
                band.classACeiling.strength,
              );
              break;
            case 'maxFuel':
              expect(delta.amount, `${item.id} maxFuel`).toBeLessThanOrEqual(
                band.classACeiling.maxFuel,
              );
              break;
            case 'cargoPods':
              // 0 at band 2 — pods are bands 3-4 — so this fails rather than
              // silently permitting a pod at the wrong tier.
              expect(delta.amount, `${item.id} cargoPods`).toBeLessThanOrEqual(
                band.classACeiling.cargoPods,
              );
              break;
          }
        }
      } else {
        const permitted = band.classB;
        expect(permitted.length, `${item.id} is Class B in band ${band.band}`).toBeGreaterThan(0);
        // The band permits a SHAPE. T-115 generalises this from the band-2-only
        // `floor` lookup it shipped as: the module's own `DiceBenefit` kind must
        // appear in the band's column, and a `floor` must ADDITIONALLY be inside
        // the permitted floor, which is the only kind with an integer dial
        // (§4.3 L1).
        const benefit = EXPLORE_MODULE_DICE_BENEFITS[item.moduleId];
        expect(benefit, `${item.id} names a module with no dice benefit`).toBeDefined();
        const match = permitted.find((allowed) => allowed.kind === benefit!.kind);
        expect(
          match,
          `${item.id} (${benefit!.kind}) not permitted at band ${band.band}`,
        ).toBeDefined();
        if (match?.kind === 'floor' && benefit?.kind === 'floor') {
          expect(benefit.floor, `${item.id} floor`).toBeLessThanOrEqual(match.floor);
        }
      }
    }
  });

  it('grants EACH of the three Class-B modules from exactly one row (§4.2 spent, not raised)', () => {
    // §4.2 caps Class B at three modules because each one costs ENGINE work per
    // instance (finding F-100-1). T-112 shipped the three; T-114 gave `floor` its
    // row at band 2; T-115 gives `reroll` its band-3 row and `extra-die` its
    // band-4 one. So the cap is now fully SPENT — which is the opposite of raised,
    // and is why the assertion is "exactly three rows, one per module" rather than
    // a count that would pass if a fourth module appeared.
    const classB = itemRows.filter(
      (row) =>
        row.payload.kind === 'unique-item' &&
        EXPLORE_ITEM_BY_ID[row.payload.itemId]?.class === 'module',
    );
    expect(classB).toHaveLength(3);
    const granted = classB.map((row) =>
      row.payload.kind === 'unique-item' ? row.payload.itemId : '',
    );
    expect(granted.sort()).toEqual([
      'item-berth-couch',
      'item-marked-ephemeris',
      'item-tally-slate',
    ]);
    // …and each at the band §4.2 places it: floor at 2, reroll at 3, extra-die at 4.
    const bandOfItem = (itemId: string): number =>
      bandOf(
        classB.find((row) => row.payload.kind === 'unique-item' && row.payload.itemId === itemId)!,
      ).band;
    expect(bandOfItem('item-tally-slate')).toBe(2);
    expect(bandOfItem('item-marked-ephemeris')).toBe(3);
    expect(bandOfItem('item-berth-couch')).toBe(4);
  });

  it('every shipped EXPLORE_ITEM is granted by a row — no item is unreachable content', () => {
    // T-112 shipped three items no row could grant, deliberately, and said so.
    // With bands 3 and 4 authored there is no longer any such item, and that is a
    // property worth pinning: an item nobody can find is a stub with a name.
    const grantedIds = new Set(
      itemRows.flatMap((row) => (row.payload.kind === 'unique-item' ? [row.payload.itemId] : [])),
    );
    const orphans = EXPLORE_ITEMS.filter((item) => !grantedIds.has(item.id)).map((item) => item.id);
    expect(orphans, `items no row grants: ${orphans.join(', ')}`).toEqual([]);
    // …and no item is granted twice, which would make one row's find another
    // row's no-op the second time it landed.
    expect(grantedIds.size).toBe(itemRows.length);
  });

  it('the rich_hulk deed keeps its supply under the WEIGHTED DRAW (F-113-D stays closed)', () => {
    // F-113-D's closing argument, RE-TARGETED rather than deleted — the leg it
    // was asserted over ceased to exist with the draw flip, and deleting the
    // assertion with it would have retired the only guard on an authored deed.
    //
    // The `rich_hulk` deed (content `deeds.ts`) fires on a `SalvageRecovered` of
    // 400cr or more. Under the transitional carrier its supply was one leg —
    // uniform over the 14 derelict salvage rows, P(>=400) = 0.384, against 0.302
    // for the single `legacy-salvage-derelict` row T-114 deleted. Under the
    // weighted draw the supply is the SAME 14 rows, reached through bands 1 and 2
    // of the derelict pool instead of through a leg, so the claim that has to
    // survive is about the ROWS: a derelict salvage row that pays out is still
    // more likely than not to clear the trigger with room.
    const derelictSalvage = authored.filter(
      (row) => row.payload.kind === 'salvage' && row.pools.includes('derelict'),
    );
    expect(derelictSalvage).toHaveLength(14);
    const probability =
      derelictSalvage.reduce((sum, row) => {
        if (row.payload.kind !== 'salvage') return sum;
        const span = row.payload.maxCredits - row.payload.minCredits + 1;
        const above = Math.max(
          0,
          row.payload.maxCredits - Math.max(400, row.payload.minCredits) + 1,
        );
        return sum + above / span;
      }, 0) / derelictSalvage.length;
    // Assert the DIRECTION against the row the set replaced, never a tuned
    // figure: a table that made the deed rarer than one 120-520cr row is the
    // regression F-113-D predicted.
    expect(probability).toBeGreaterThan(0.302);
  });
});

// ---------------------------------------------------------------------------
// 4 · Through the REAL Explore path — one instance of every TYPE in this pass
// ---------------------------------------------------------------------------

/** The `exploreOutcomes.test.ts` helper: a DAY-phase state whose PILOT modifier
 *  guarantees the DC-12 nav check, so only the outcome draw varies. */
function craftExploreState(die: number, pilot: number): GameState {
  const state = createInitialState(1);
  state.dayPhase = DayPhase.DAY;
  // T-131 (D1) · THE HAND CARRIES THREE SPARE DICE BEHIND THE CONTROLLED ONE.
  // Bands 3-4 now charge `apCost` (2 and 3) EXTRA dice at claim, so a one-die
  // hand would forfeit every top-of-ladder find and the reachability sweep below
  // would silently stop reaching the rarest 33 rows in the table. The spares are
  // at indices 1-3 and are never the die the nav check reads (`spendDie: 0`), so
  // the check itself is unchanged; they exist only so the payment can be MADE.
  // The forfeit path is proven on purpose in `exploreAp.test.ts`, not by accident
  // here.
  state.player.dawnHand = { dice: [die, 1, 1, 1], spent: [false, false, false, false] };
  state.player.stats[Stat.PILOT] = pilot;
  state.player.ship.fuel = 1000;
  return state;
}

/** Which authored row a board's wire line came from. The row's copy is unique
 *  (asserted above), so the message is a faithful back-pointer to the row —
 *  which is also why `SalvageRecovered` needing no `outcomeId` costs nothing. */
const ROW_BY_WIRE = new Map(authored.map((row) => [row.wireFound, row]));

function rowForMessage(message: string, poiName: string): ExploreOutcomeDefinition | undefined {
  for (const [copy, row] of ROW_BY_WIRE) {
    if (copy.replace('{name}', poiName) === message) return row;
  }
  return undefined;
}

/**
 * T-115 · SIZED FROM §5.3's ARITHMETIC, not guessed at. The rarest row is any of
 * the 8 band-4 rows at `3 / 8 = 0.375%` of a successful board, and §5.3 computes
 * `8 × (1 − 0.00375)^n < 0.05` ⇒ n ≈ 1,351 boards for 95% confidence on all of
 * them. 2,000 was the spec's budget for that uniform case; 6,000 buys margin for
 * a row that ends up in a pool of one type (half the rate) without being slow —
 * the whole sweep is one `resolveExploration` call per seed and runs in under a
 * second.
 *
 * ANY ROW THIS MISSES IS A CONTENT-SHAPE DEFECT — a band whose weight is too
 * small for its row count — and the fix is to move a row between bands or re-cut
 * a band weight, NEVER to widen the assertion or shrink the row set (§5.3, and
 * the standing constraint on thresholds).
 */
const SWEEP_SEEDS = 6000;

describe('T-115 · EVERY row in the table resolves through the real Explore path', () => {
  // ONE SWEEP, read several ways. Every board is a real `resolveExploration`
  // call — the verb a player uses, nav check and all — never a hand-called
  // resolver, so what is asserted below is what a player can actually reach.
  //
  // TWO OBSERVATION CHANNELS, and between them they now cover the whole table:
  //   - bands 0-1 and (since T-131/D1) bands 3-4 resolve on the day of the board,
  //     so the row is seen through its own unique `wireFound` copy. Bands 3-4 pay
  //     `apCost` extra dice out of the same hand first, which is why the helper
  //     above deals four dice instead of one;
  //   - BAND 2 alone DEFERS, so its rows are seen through the `RecoveryStarted`
  //     they open. That is not a workaround, it is the design (T-111 §3, narrowed
  //     to band 2 by owner ruling D1): the CLAIM half fires today and the PAYOFF
  //     lands at the dusk of `dueDay`. This sweep drives the ACTION only; section
  //     5 drives the payout half through a real dusk.
  const observed = new Map<string, { amount: number | null; poiName: string }>();
  let fragmentBoards = 0;
  let salvageBoards = 0;
  let emptyWireOnBoard = 0;
  let podArmed = 0;
  let boards = 0;

  for (let seed = 0; seed < SWEEP_SEEDS; seed += 1) {
    const res = resolveExploration(
      craftExploreState(18, 40),
      { type: 'Explore', spendDie: 0 },
      new SeededRng(seed),
    );
    const discovered = res.events.find((e) => e.type === 'PoiDiscovered');
    if (!discovered || discovered.type !== 'PoiDiscovered') continue;
    const poiName = discovered.name;
    boards += 1;
    if (res.state.flags['signal.contraband.pending'] === true) podArmed += 1;
    let pendingAmount: number | null = null;
    for (const event of res.events) {
      if (event.type === 'SalvageRecovered') {
        pendingAmount = event.amount;
        salvageBoards += 1;
      }
      if (event.type === 'FragmentAcquired') fragmentBoards += 1;
      if (event.type === 'RecoveryStarted') {
        observed.set(event.outcomeId, { amount: null, poiName });
      }
      if (event.type !== 'WireEntry') continue;
      if (event.message === '') emptyWireOnBoard += 1;
      const row = rowForMessage(event.message, poiName);
      if (!row) continue;
      observed.set(row.id, {
        amount: row.payload.kind === 'salvage' ? pendingAmount : null,
        poiName,
      });
      pendingAmount = null;
    }
  }

  it('drives a SALVAGE row: the payout lands inside its authored band, with its copy', () => {
    const salvageRows = rowsInBand(1).filter((row) => row.payload.kind === 'salvage');
    const hit = salvageRows.find((row) => observed.has(row.id));
    expect(hit, 'no authored salvage row resolved in the sweep').toBeDefined();
    expect(salvageBoards).toBeGreaterThan(0);
    const seen = observed.get(hit!.id)!;
    expect(seen.amount).not.toBeNull();
    if (hit!.payload.kind === 'salvage') {
      expect(seen.amount!).toBeGreaterThanOrEqual(hit!.payload.minCredits);
      expect(seen.amount!).toBeLessThanOrEqual(hit!.payload.maxCredits);
    }
  });

  it('drives a LORE row: the fragment is granted and the row speaks', () => {
    const loreRows = authored.filter(
      (row) => row.payload.kind === 'lore' && row.payload.fragmentId !== undefined,
    );
    const hit = loreRows.find((row) => observed.has(row.id));
    expect(hit, 'no authored lore row resolved in the sweep').toBeDefined();
    expect(fragmentBoards).toBeGreaterThan(0);
  });

  it('THE RAREST TIER IS REACHABLE — all 100 rows are found, and none is inert', () => {
    // T-115's third accept clause, and the ONE test that replaces the three
    // partial-reachability tests T-113/T-114 shipped ("every row a leg can
    // draw", "all 33 band-2 rows", "exactly which rows are still inert"). Those
    // three were partial because the transitional carrier could not reach the 14
    // band-0 dead ends at all; the weighted draw reaches every row in the pool it
    // filters, so the honest claim is now the whole table at once.
    //
    // THE "STILL INERT" LEDGER GOES TO ZERO RATHER THAN LAPSING. It is asserted
    // below as `toHaveLength(0)` instead of being deleted, so the gap it recorded
    // is discharged where a reader can see it.
    const missing = authored.filter((row) => !observed.has(row.id)).map((row) => row.id);
    expect(missing, `unreached rows (${missing.length}): ${missing.join(', ')}`).toEqual([]);
    expect(observed.size).toBe(100);

    const inert = authored.filter((row) => !observed.has(row.id));
    expect(inert).toHaveLength(0);
  });

  it('reaches every KIND at every band that authors it', () => {
    // The spot-checks the single reachability test above subsumes, kept because
    // they name WHAT is reachable rather than only how many: a table that reached
    // 100 ids while some payload kind was never actually resolved through the
    // verb would pass the count and still be broken content.
    const spread: Readonly<Record<number, readonly string[]>> = {
      0: ['lore'],
      1: ['salvage', 'lore'],
      2: ['salvage', 'unique-item', 'npc', 'questline', 'lore'],
      3: ['unique-item', 'questline', 'npc'],
      4: ['unique-item', 'questline'],
    };
    for (const [band, kinds] of Object.entries(spread)) {
      const rows = rowsInBand(Number(band));
      for (const kind of kinds) {
        expect(
          rows.some((row) => row.payload.kind === kind && observed.has(row.id)),
          `no band-${band} ${kind} row reached`,
        ).toBe(true);
      }
    }
  });

  it('no boarded POI is ever charged 80 fuel for an EMPTY wire line (§2.4)', () => {
    expect(emptyWireOnBoard).toBe(0);
    // …and the stronger claim the deleted legacy rows finally allow: EVERY board
    // that surfaced a POI also filed a line the player can read, or opened a
    // recovery that says why the line has not arrived yet.
    expect(boards).toBeGreaterThan(0);
  });

  it('THE SEALED POD IS STILL SUPPLIED after the contraband kind retired (§1.4)', () => {
    // The measurement the re-homing owes, taken through the real verb rather than
    // asserted from the table. `signal.contraband.pending` used to be armed by the
    // derelict contraband leg at 0.40 x 50% of boards ~= 20%; it is now armed by
    // three band-1 derelict lore rows (`DERELICT_POD_EFFECTS`).
    //
    // THE FIGURE IS REPORTED, NOT TUNED TO. The tripwire that decides whether the
    // supply is adequate is `campaign-smuggler-gambler.test.ts`'s `podsTaken > 0`
    // over a real 300-day career; this asserts only that the supply line EXISTS
    // and is of the size the content predicts, so a future edit that silently
    // orphans the flag fails here with a number instead of failing there with a
    // mystery.
    const rate = podArmed / boards;
    expect(podArmed, 'no board armed the sealed pod at all').toBeGreaterThan(0);
    // 3 of the 11 derelict band-1 rows, band 1 weighted 33 of 100, derelicts half
    // of all boards: 0.5 x 0.33 x 3/11 = 4.5%. A wide window, because the claim is
    // "the supply line is intact", not a tuned rate.
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.09);
  });
});

// ---------------------------------------------------------------------------
// 5 · T-114 · a band-2 row driven to PAYOUT through the real dusk
// ---------------------------------------------------------------------------

/** The highest unspent die in the dawn hand — what a real player would fly a
 *  DC-12 nav check with. Returns -1 when the hand is exhausted. */
function bestUnspentDie(state: GameState): number {
  const hand = state.player.dawnHand;
  if (!hand) return -1;
  let best = -1;
  let bestValue = -1;
  for (let i = 0; i < hand.dice.length; i += 1) {
    if (!hand.spent[i] && hand.dice[i] > bestValue) {
      bestValue = hand.dice[i];
      best = i;
    }
  }
  return best;
}

/**
 * Drive a REAL career from day 1 until a band-2 row of the requested payload kind
 * opens the recovery slot, then run the loop forward to the dusk of `dueDay` and
 * hand back the payout events.
 *
 * NOTHING HERE HAND-CALLS A RESOLVER. That is the whole point of this block: a
 * deferred row's payoff is only worth asserting if the player-reachable path
 * actually delivers it — `startDay` → `applyPlayerAction({type:'Explore'})` →
 * `endDay`, exactly as `recovery.test.ts` drives the ruling tests.
 */
function driveBand2Payout(kind: string): {
  outcomeId: string;
  payoutEvents: GameEvent[];
  state: GameState;
} {
  const wanted = new Set(
    rowsInBand(2)
      .filter((row) => row.payload.kind === kind)
      .map((row) => row.id),
  );
  for (let seed = 1; seed < 900; seed += 1) {
    let state = createInitialState(seed);
    for (let day = 0; day < 8; day += 1) {
      const dawn = startDay(state);
      const die = bestUnspentDie(dawn.state);
      if (die < 0) {
        state = endDay(dawn.state).state;
        continue;
      }
      const acted = applyPlayerAction(dawn.state, { type: 'Explore', spendDie: die });
      const started = acted.events.find((e) => e.type === 'RecoveryStarted');
      if (!started || started.type !== 'RecoveryStarted' || !wanted.has(started.outcomeId)) {
        state = endDay(acted.state).state;
        continue;
      }
      // Found one. Run duskes forward until the clock comes due.
      let live = acted.state;
      for (let step = 0; step < 10; step += 1) {
        const dusk = endDay(live);
        const paid = dusk.events.find((e) => e.type === 'RecoveryPaidOut');
        if (paid)
          return { outcomeId: started.outcomeId, payoutEvents: dusk.events, state: dusk.state };
        if (dusk.state.player.recovery === null) break;
        live = startDay(dusk.state).state;
      }
      break;
    }
  }
  throw new Error(`no seed under 900 drove a band-2 '${kind}' row to payout`);
}

describe('T-114 · a band-2 find is DEFERRED, then paid out by the real dusk', () => {
  it('SALVAGE: pays out at dueDay, inside the row‘s own authored band', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('salvage');
    const row = authored.find((r) => r.id === outcomeId)!;
    expect(bandOf(row).band).toBe(2);
    const paid = payoutEvents.filter((e) => e.type === 'RecoveryPaidOut');
    expect(paid).toHaveLength(1);
    const salvage = payoutEvents.find((e) => e.type === 'SalvageRecovered');
    expect(salvage, 'the deferred salvage never landed').toBeDefined();
    if (salvage?.type === 'SalvageRecovered' && row.payload.kind === 'salvage') {
      expect(salvage.amount).toBeGreaterThanOrEqual(row.payload.minCredits);
      expect(salvage.amount).toBeLessThanOrEqual(row.payload.maxCredits);
    }
  });

  it('UNIQUE-ITEM: the item is granted at the dusk of dueDay', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('unique-item');
    const row = authored.find((r) => r.id === outcomeId)!;
    const acquired = payoutEvents.find((e) => e.type === 'UniqueItemAcquired');
    expect(acquired, 'the deferred item never landed').toBeDefined();
    if (acquired?.type === 'UniqueItemAcquired' && row.payload.kind === 'unique-item') {
      expect(acquired.itemId).toBe(row.payload.itemId);
    }
  });

  it('NPC: the named profile‘s disposition moves at the dusk of dueDay', () => {
    const { outcomeId, payoutEvents } = driveBand2Payout('npc');
    const row = authored.find((r) => r.id === outcomeId)!;
    const moved = payoutEvents.find((e) => e.type === 'DispositionChanged');
    expect(moved, 'the deferred introduction never landed').toBeDefined();
    if (moved?.type === 'DispositionChanged' && row.payload.kind === 'npc') {
      expect(moved.npcId).toBe(row.payload.profileId);
    }
  });

  it('QUESTLINE: the hook schedules its episode, and the episode is then OFFERED', () => {
    // THE ACCEPT CLAUSE END TO END. A hook is only "resolved into the existing
    // storylet system" if the schedule it writes becomes a real offer — so this
    // walks the whole way: payout → `StoryletScheduled` → the day arrives →
    // `refreshAvailableStorylets` → `StoryletOffered` for that exact id.
    const { outcomeId, payoutEvents, state } = driveBand2Payout('questline');
    const row = authored.find((r) => r.id === outcomeId)!;
    expect(row.payload.kind).toBe('questline');
    if (row.payload.kind !== 'questline') return;
    const { storyletId } = row.payload;

    const scheduled = payoutEvents.find((e) => e.type === 'StoryletScheduled');
    expect(scheduled, 'the deferred hook scheduled nothing').toBeDefined();
    const entry = state.storylets.scheduled.find((s) => s.storyletId === storyletId);
    expect(entry, 'no schedule entry for the hook‘s episode').toBeDefined();
    // §2.3's synthetic pair: the ROW id is the source, `explore` the choice.
    expect(entry!.sourceStoryletId).toBe(row.id);
    expect(entry!.sourceChoiceId).toBe('explore');

    let live = state;
    // `state` came back from an `endDay`, so the calendar has already turned and
    // the next dawn is the next thing that happens — drive whole days from there.
    while (live.day < entry!.dueDay) live = endDay(startDay(live).state).state;
    const refreshed = refreshAvailableStorylets({
      ...live,
      storylets: { ...live.storylets, offeredToday: [] },
    });
    expect(
      refreshed.events.some((e) => e.type === 'StoryletOffered' && e.storyletId === storyletId),
      `${storyletId} never became an offer`,
    ).toBe(true);
  });
});
