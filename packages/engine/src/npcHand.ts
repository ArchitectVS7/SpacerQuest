/**
 * N13 · THE NPC VIRTUAL HAND — dawn-hand parity for the 30 captains.
 *
 * OWNER RULING (docs/NPC_REDESIGN.md, N13, design ruled 2026-07-31): design
 * **(b), the algorithmic equivalent**. The captain keeps the coarse one-verb day;
 * the day's QUALITY comes from a virtual hand drawn under the same RNG discipline
 * the player's hand uses, and N5's proficiency lever will express itself as
 * allocation noise on that hand.
 *
 * ── WHAT IS SHARED, LITERALLY ────────────────────────────────────────────────
 * "The same RNG discipline the player's hand uses" is satisfied by CALLING THE
 * PLAYER'S OWN FUNCTIONS, not by re-implementing them:
 *   · the deal — `dice.ts` {@link rollDawnHand}, at `DAWN_BASE_HAND_SIZE` dice,
 *     off the captain's own day rng, descending-sorted exactly as `rng.rollHand`
 *     leaves it
 *   · the spend — `dice.ts` {@link spendDie}, including its already-spent and
 *     out-of-range guards
 *   · the check the die then feeds — the shared `check()`, unchanged at both
 *     call sites in `npc.ts`
 * Nothing about a captain's hand is a private parallel model of the player's.
 *
 * ── THE ONE SANCTIONED ABSTRACTION, NAMED AT ITS DEFINITION SITE ─────────────
 * WHICH DIE THE CAPTAIN PICKS IS A **MODEL** OF THE DECISION, NOT THE DECISION.
 * A player LOOKS at five visible dice and allocates them across a whole day's
 * plan — the game's central decision, and the thing this file does not reproduce.
 * {@link allocateVirtualDie} instead draws ONE rng value and maps the captain's
 * affinity stat onto a three-way reach: sharpest / middle / dullest. That is a
 * skill-sensitive distribution over die quality, and it is deliberately no more
 * than that. **It must never be described as parity**, and a later reader must
 * not mistake this file for the closing of the dawn-hand gap in general: it is
 * the one place in the NPC parity design where a player's judgment is replaced by
 * an arithmetic stand-in, and it is flagged here so it stays visible.
 *
 * The model has exactly TWO boundaries, and both are named rather than hidden:
 *
 *   1. **The pick is modelled.** See above. The captain never "sees" the hand.
 *   2. **Exhaustion falls back to a raw d20.** Five dice cover one verb check
 *      plus a few interdiction rounds; a long fight can outrun them. When the
 *      hand is empty the next check draws `rng.d20()` — which is EXACTLY the
 *      pre-N13 behaviour, so the fallback can never be worse than the state this
 *      module replaces. Its incidence is measured in N13's capstone rather than
 *      assumed small.
 *
 * ── `Crew` AND `Reroll` ARE RULED EXCLUSIONS, AND `Reroll`'s IS STRUCTURAL ────
 * The hand is dealt with `rerolls: 0`, so `rerollsRemaining` is 0 on every
 * captain's hand by CONSTRUCTION — the exclusion lives in the data, not in a
 * branch that could be flipped. `Crew` has no NPC decision to attach to at all
 * under design (b), which keeps the one-verb day. Both rows are recorded as
 * EXCLUDED-by-ruling in THE PARITY LEDGER (`docs/NPC_REDESIGN.md`) and
 * transcribed as `'excluded'` in `packages/sim/src/balance/coverage.ts`.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * The deal is LAZY — five d20s are drawn on the FIRST allocation, never at the
 * top of the day. `npc.ts`'s `rollNpcCheck` records the invariant this protects:
 * *"Every broke / underfunded fallback returns Idle/FlawOverride and rolls
 * NOTHING"*. An eager deal would burn five rng values on an Idle day, move every
 * seeded career, and break the wire's trade-failure denominator. Lazy also keeps
 * Idle / FlawOverride / broke days free against the ~40 ms/day envelope N0 bought.
 *
 * NO SAVE-SHAPE CHANGE. The hand is per-captain-day and is never persisted;
 * `NpcState` gains no field and `CURRENT_SAVE_VERSION` stays 12.
 */

import {
  DAWN_BASE_HAND_SIZE,
  NPC_ALLOCATION_PIVOT_STAT,
  NPC_ALLOCATION_SHARPNESS_PER_STAT,
} from '@spacerquest/content';
import { rollDawnHand, spendDie } from './dice.js';
import type { SeededRng } from './rng.js';
import type { DawnHand } from './types.js';

/**
 * The parameters a captain's hand is dealt under, stated once. `handSize` is the
 * player's base hand; `floor: 0` and `rerolls: 0` are the two crew/equipment
 * benefits a captain cannot hold — the second of which IS the `Reroll` ruled
 * exclusion, expressed as data (see the header).
 */
export const NPC_HAND_MODIFIERS = Object.freeze({
  handSize: DAWN_BASE_HAND_SIZE,
  floor: 0,
  rerolls: 0,
});

/**
 * One captain's die ledger for one day. Built by {@link npcVirtualHand} in
 * `resolveNpcDay` and threaded to every site that rolls a check for that captain.
 */
export interface NpcVirtualHand {
  /**
   * Spend one die on a check whose modifier is `statValue`, and return its face.
   * THE MODELLED PICK — see this module's header.
   */
  allocateVirtualDie(statValue: number): number;
  /** The hand AS DEALT (all dice unspent), or `null` if this captain's day never
   *  rolled anything. Diagnostics and tests only; the day loop never reads it. */
  dealtHand(): DawnHand | null;
  /** Unspent dice left. `0` both before the lazy deal and after exhaustion — use
   *  {@link NpcVirtualHand.dealtHand} to tell those apart. Diagnostics only. */
  remaining(): number;
  /** How many allocations fell through to the raw-d20 exhaustion fallback.
   *  Diagnostics and tests only; N13's capstone reports its fleet-wide share. */
  exhaustedAllocations(): number;
}

/**
 * The reach, as a probability in [-1, 1]. Positive means "reach for the sharpest
 * die", negative "settle for the dullest", zero "take the middle". A pure
 * function of the check's affinity stat and the two content constants — exported
 * so the calibration is testable without driving a whole captain-day.
 */
export function npcAllocationBias(statValue: number): number {
  const raw = (statValue - NPC_ALLOCATION_PIVOT_STAT) * NPC_ALLOCATION_SHARPNESS_PER_STAT;
  return Math.max(-1, Math.min(1, raw));
}

/**
 * Build a captain's ledger for the day. Deals nothing until the first
 * allocation (see the header's COST note).
 *
 * @param rng The captain's own day rng — the same one every other roll in their
 *   day draws from, so the hand is part of one deterministic stream.
 * @param dullDieChance **N5's SEAM, and it is inert until N5 supplies it.** The
 *   field `PilotDegradationProfile.dullDieChance` (`packages/sim/src/index.ts`)
 *   will feed this: the chance, per allocation, that a captain who reached for
 *   the sharpest die takes a middling one instead — the same slip, guarded at the
 *   same three-remaining threshold, as the player-side `dieLedger.takeBest`.
 *   **When it is absent NOTHING is drawn and nothing is allocated differently**,
 *   which is what keeps every seeded career byte-identical until N5 lands (the
 *   injectable-table precedent set by `dice.ts` `equipmentDiceBenefits`).
 *   Deliberately NOT wired to a live supplier here — sourcing a per-captain
 *   proficiency profile is N5's task, not this one's.
 */
export function npcVirtualHand(rng: SeededRng, dullDieChance?: number): NpcVirtualHand {
  /** The pristine deal, kept for inspection. */
  let dealt: DawnHand | null = null;
  /** Indices into `dealt.dice`, unspent, ascending — and because the deal is
   *  sorted DESCENDING, that is sharpest-first. The same shape and the same
   *  reasoning as the sim's player-side `dieLedger`. */
  let available: number[] = [];
  /** Carries `spent` forward across allocations, through the player's `spendDie`. */
  let working: DawnHand | null = null;
  let exhausted = 0;

  return {
    allocateVirtualDie: (statValue: number): number => {
      if (dealt === null) {
        dealt = rollDawnHand(rng, NPC_HAND_MODIFIERS);
        working = dealt;
        available = dealt.dice.map((_, index) => index);
      }

      // BOUNDARY 2 — exhaustion. Exactly the pre-N13 draw, and counted.
      if (available.length === 0) {
        exhausted += 1;
        return rng.d20();
      }

      // BOUNDARY 1 — the modelled pick. ONE rng value, every allocation,
      // whatever the stat: a captain at the pivot still draws it, so the stream
      // does not fork on a stat comparison.
      const bias = npcAllocationBias(statValue);
      const roll = rng.next();
      let position: number;
      if (bias > 0 && roll < bias) {
        position = 0; // the sharpest die left
      } else if (bias < 0 && roll < -bias) {
        position = available.length - 1; // the dullest die left
      } else {
        position = Math.floor(available.length / 2); // the neutral middle
      }

      // N5's seam. Guarded at three remaining for the reason the player-side
      // ledger states: with two left the "middle" IS the dullest, so a slip there
      // would degrade the day's plan rather than the day's roll.
      if (dullDieChance !== undefined && position === 0 && available.length >= 3) {
        if (rng.next() < dullDieChance) position = Math.floor(available.length / 2);
      }

      const index = available.splice(position, 1)[0];
      const spend = spendDie(working!, index);
      working = spend.hand;
      return spend.die;
    },
    dealtHand: () => dealt,
    remaining: () => available.length,
    exhaustedAllocations: () => exhausted,
  };
}
