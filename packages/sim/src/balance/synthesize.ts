/**
 * N7 · SYNTHESIZED MID-GAME STATES — and the caveat that governs them.
 *
 * ------------------------------------------------------------------------
 * READ THIS BEFORE USING ANYTHING HERE.
 *
 * A career cannot *start* at day 21; reaching day 21 means playing days 1–20. A
 * state built by this module was NOT played into — it is a world assembled to
 * look like day 21. That is legitimate for a breakage detector and it is
 * **never** a balance measurement.
 *
 * The rule is not left to a reader's discipline. `runCampaign` stamps
 * `syntheticStart` on any report begun from one of these states, `summarizeReport`
 * carries the stamp onto the row, and `aggregate.ts` THROWS rather than fold a
 * stamped row into a `BaselineAggregate` — the artefact every balance number in
 * `docs/NPC_REDESIGN.md` and `docs/BALANCE-REDESIGN-WORKLIST.md` comes from. There is no flag to disable
 * that and no filter that quietly drops the row.
 *
 * This is the same line `poverty-invariant.test.ts` holds ("the fix would be to
 * re-author a storylet trigger or the map, not to poke state"). State-poking is
 * allowed here, and only here, because the question is "does this still run and
 * produce sane numbers", not "is this balanced".
 * ------------------------------------------------------------------------
 *
 * WHAT A SYNTHESIS DOES AND DOES NOT RESTORE — stated so no reader over-trusts it:
 *
 *   RESTORED: the day number; the player's purse, debt, four component strengths,
 *     cargo pods and fuel; every NPC's purse, hull strength and fuel. All written
 *     through the engine's own recompute chokepoints (`syncMaxFuel`,
 *     `syncPlayerTier`), never by restating a formula — R2c's lesson.
 *
 *   NOT RESTORED, and each one is a real hole in what a mid-game tier can catch:
 *     - **The deed registry and renown rank.** A synthesized captain is a
 *       LIEUTENANT with zero deeds on day 41. Deed-gated storylets, rank-driven
 *       tier and the whole progression spine are therefore NOT exercised by a
 *       mid-game tier. Fabricating deed entries would be authoring content inside
 *       a test fixture, which is worse than the gap.
 *     - **Crew, ports, faction reputation, charts, the nemesis file, storylet
 *       history and the event log.** All start empty. A tier is a fresh-world
 *       captain wearing a mid-game ship and purse.
 *     - **Joint structure.** The spread is built from MARGINAL quantiles, so a
 *       slot takes every field at the same rank (see {@link TierSpread}).
 *
 * READERS (constraint 7): `./smoke.ts` and `../__tests__/balance-rig.test.ts`.
 */

import {
  createInitialState,
  syncMaxFuel,
  syncPlayerTier,
  type GameState,
} from '@spacerquest/engine';

/** One captain's worth of progression. Every field is a value the synthesizer
 *  writes; nothing here is decorative. */
export interface PlayerSlot {
  credits: number;
  debt: number;
  weaponsStrength: number;
  hullStrength: number;
  shieldsStrength: number;
  drivesStrength: number;
  cargoPods: number;
  /** Fraction of `maxFuel` the tank holds, in [0, 1]. Stored as a SHARE rather
   *  than a unit count because `maxFuel` is derived from the hull written above,
   *  so a stored absolute would silently over- or under-fill a different hull. */
  fuelShare: number;
}

export interface NpcSlot {
  credits: number;
  hullStrength: number;
  fuelShare: number;
}

/**
 * The progression SPREAD a tier lays across the 31 captains.
 *
 * `source` is load-bearing and is printed by the smoke suite:
 *   - `'harvested'` — every number came from a capstone's milestone samples.
 *   - `'estimated'` — the fixture predates a milestone-carrying capstone and the
 *     numbers are the extractor's documented guesses. Fixtures start here and
 *     must not stay here; `--milestone-days` on the next capstone replaces them.
 *
 * WHAT A SLOT IS, precisely, because the construction matters: each slot takes
 * every field at the SAME quantile of its own marginal distribution. That is a
 * rank-coupling assumption — real captains do not have p90 credits *and* p90
 * guns — not an observed joint sample. It is chosen because a capstone aggregate
 * stores marginals, and because the alternative (independent draws per field)
 * would manufacture captains that no career could produce, e.g. a p90 purse on a
 * p10 hull.
 */
export interface TierSpread {
  source: 'harvested' | 'estimated';
  /** Player slots, ascending by progression. Seed *i* of a tier uses slot
   *  `i % player.length`, so a tier with more seeds than slots re-walks the
   *  ladder rather than collapsing onto one captain. */
  player: PlayerSlot[];
  /** Exactly one slot per NPC in roster order. Length must equal the roster's,
   *  and {@link synthesizeTierState} throws if it does not — a spread that
   *  silently covered 12 of 30 captains would be a "realistic field" in name. */
  npc: NpcSlot[];
}

function clampShare(share: number): number {
  if (!Number.isFinite(share)) return 0;
  return Math.min(1, Math.max(0, share));
}

/** Component strengths are integers in the engine's 1..199 band (`ComponentState`).
 *  Quantile arithmetic produces fractions; rounding here rather than at the call
 *  sites keeps every synthesized ship a ship the shipyard could have sold. */
function componentStrength(value: number): number {
  return Math.min(199, Math.max(1, Math.round(value)));
}

/**
 * Build the world a smoke tier starts from.
 *
 * `seedIndex` selects the player slot; `seed` still drives `createInitialState`,
 * so the map, the cast and the rng stream are a real seeded world — only the
 * progression is laid on top.
 */
export function synthesizeTierState(
  seed: number,
  seedIndex: number,
  day: number,
  spread: TierSpread,
): GameState {
  if (day < 1) throw new Error(`Milestone day must be >= 1 (got ${day})`);
  if (spread.player.length === 0) throw new Error('Tier spread has no player slots');
  const state = createInitialState(seed);
  if (spread.npc.length !== state.npcs.length) {
    throw new Error(
      `Tier spread covers ${spread.npc.length} NPCs but the roster has ${state.npcs.length}. ` +
        `A spread that covered only part of the field would exercise a smaller game than the ` +
        `one being tested.`,
    );
  }

  state.day = day;

  const slot = spread.player[seedIndex % spread.player.length];
  const player = state.player;
  player.credits = Math.max(0, Math.round(slot.credits));
  player.debt = Math.max(0, Math.round(slot.debt));
  player.ship.weapons.strength = componentStrength(slot.weaponsStrength);
  player.ship.hull.strength = componentStrength(slot.hullStrength);
  player.ship.shields.strength = componentStrength(slot.shieldsStrength);
  player.ship.drives.strength = componentStrength(slot.drivesStrength);
  player.ship.cargoPods = Math.max(1, Math.round(slot.cargoPods));
  // Through the engine's own chokepoints, in the engine's own order: the tank
  // capacity follows the hull, and the power tier follows the fit.
  syncMaxFuel(player.ship);
  player.ship.fuel = Math.round(clampShare(slot.fuelShare) * player.ship.maxFuel);
  syncPlayerTier(state);

  // COW-EXEMPT: these writes reach roster records raw, without `mutableNpc`, and
  // are legal ONLY because of the caller. `state` here is fresh from
  // `createInitialState`, so no snapshot, replay golden or rendered frame shares
  // these records yet — there is nothing behind them to corrupt. That is a
  // property of the CALLER, not of the write: hand this function a mid-career
  // `GameState` and every synthesized captain writes back through every earlier
  // snapshot. The copy-on-write scan in
  // `packages/engine/src/__tests__/clone.test.ts` pins this site in
  // `COW_EXEMPT_SITES` — it was named in advance by the 2026-07-29 audit as the
  // one known escapee, so it would not be discovered as a surprise.
  for (let index = 0; index < state.npcs.length; index += 1) {
    const npc = state.npcs[index];
    const npcSlot = spread.npc[index];
    npc.credits = Math.max(0, Math.round(npcSlot.credits));
    npc.ship.hull.strength = componentStrength(npcSlot.hullStrength);
    syncMaxFuel(npc.ship);
    npc.ship.fuel = Math.round(clampShare(npcSlot.fuelShare) * npc.ship.maxFuel);
  }

  return state;
}
