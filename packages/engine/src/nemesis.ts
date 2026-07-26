/**
 * The Nemesis file — Signal Fragment mechanics (T-111b, PRD §7.2/§8.1).
 *
 * PURE helpers over a player's {@link NemesisFileState}. Fragments are knowledge
 * items keyed by a content fragment id; the file is:
 *   - MONOTONIC — a grant dedupes by id and never removes, so the fragment count
 *     only ever grows (a duplicate grant is a no-op).
 *   - DECODABLE — the Sage of Mizar-9 flips a held fragment's `decoded` bit,
 *     upgrading its lore-index entry from raw signal to decoded meaning.
 *
 * The DECODED-LORE INDEX is derived here: {@link nemesisLoreIndex} joins the
 * held fragments against the content lore table and returns one entry per held
 * fragment (sorted by the fragment's arc order). Its length is exactly the
 * fragment count, so acquiring a fragment grows the index by one and a duplicate
 * grows it by none.
 */

import {
  CROSSING_DECODED_REQUIREMENT,
  CROSSING_REQUIRED_RANK,
  CROSSING_STAKE_MIN_CREDITS,
  CROSSING_WIRE,
  NEMESIS_SYSTEM_ID,
  SIGNAL_FRAGMENTS,
  distance as systemDistance,
} from '@spacerquest/content';
import { jumpFuelCost } from './economy.js';
import {
  CrossingRefusal,
  GameEvent,
  GameState,
  NemesisFileState,
  SignalFragmentRecord,
} from './types.js';

/** How many fragments the file holds — equal to the decoded-lore index length. */
export function fragmentCount(file: NemesisFileState): number {
  return file.fragments.length;
}

/** True if the file already holds a fragment with this id. */
export function hasFragment(file: NemesisFileState, fragmentId: string): boolean {
  return file.fragments.some((fragment) => fragment.fragmentId === fragmentId);
}

/** True if the file holds this fragment and it has NOT yet been decoded. */
export function hasUndecodedFragment(file: NemesisFileState, fragmentId: string): boolean {
  return file.fragments.some((fragment) => fragment.fragmentId === fragmentId && !fragment.decoded);
}

/** True if the file holds any fragment that has not yet been decoded. */
export function hasAnyUndecoded(file: NemesisFileState): boolean {
  return file.fragments.some((fragment) => !fragment.decoded);
}

/**
 * Grant a fragment into the file. Dedupes by id (monotonic): returns `true` iff
 * the fragment was NEW and appended, `false` if it was already held. Mutates the
 * file in place. Unknown fragment ids are rejected (returns `false`) so a bad id
 * can never bloat the count.
 */
export function grantFragment(
  file: NemesisFileState,
  fragmentId: string,
  source: SignalFragmentRecord['source'],
  day: number,
): boolean {
  if (!SIGNAL_FRAGMENTS[fragmentId]) {
    return false;
  }
  if (hasFragment(file, fragmentId)) {
    return false;
  }
  file.fragments.push({ fragmentId, source, day, decoded: false });
  return true;
}

/**
 * Decode a held fragment (the Sage). Returns `true` iff a held, still-undecoded
 * fragment was flipped to decoded; `false` if the fragment is absent or already
 * decoded. Mutates the file in place.
 */
export function decodeFragment(file: NemesisFileState, fragmentId: string): boolean {
  const fragment = file.fragments.find((candidate) => candidate.fragmentId === fragmentId);
  if (!fragment || fragment.decoded) {
    return false;
  }
  fragment.decoded = true;
  return true;
}

/** One row of the decoded-lore index. */
export interface NemesisLoreEntry {
  fragmentId: string;
  order: number;
  title: string;
  /** The decoded lore if the fragment is decoded, else the raw signal text. */
  text: string;
  decoded: boolean;
  source: SignalFragmentRecord['source'];
  day: number;
}

/**
 * T-1505b · How many held fragments have been DECODED. Holding a sliver is not
 * understanding it, and only the crossing cares about the difference.
 *
 * READERS: the `trigger.nemesis.minDecoded` gate (storylets.ts `triggerMatches`),
 * which keeps the crossing beat off the board until the set is complete, and
 * {@link quoteCrossingStake}'s `fragments-undecoded` clause.
 */
export function decodedFragmentCount(file: NemesisFileState): number {
  return file.fragments.filter((fragment) => fragment.decoded).length;
}

/**
 * The decoded-lore index: one entry per held fragment, sorted by the fragment's
 * arc order. Length == {@link fragmentCount}. A held fragment with no content
 * lore entry is skipped defensively (should never happen — grant validates ids).
 */
export function nemesisLoreIndex(file: NemesisFileState): NemesisLoreEntry[] {
  return file.fragments
    .flatMap((fragment) => {
      const lore = SIGNAL_FRAGMENTS[fragment.fragmentId];
      if (!lore) {
        return [];
      }
      return [
        {
          fragmentId: fragment.fragmentId,
          order: lore.order,
          title: lore.title,
          text: fragment.decoded ? lore.decoded : lore.signal,
          decoded: fragment.decoded,
          source: fragment.source,
          day: fragment.day,
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
}

// ===========================================================================
// T-1505b · THE CROSSING & THE STAKE
//
// PRD-REIMAGINED §8.1: "the arc ends at the event horizon, with everything you
// own on the table"; §5: "the game's ultimate gamble — a one-way crossing to
// Andromeda, attempted only when you're willing to bet everything you've built."
//
// The stake is the ONE setter of `nemesis.crossing.unlocked`, the flag T-1101
// defined-and-consumed but never wrote. Everything below is pure: no rng (the
// stake is a ledger act, not a roll), no DOM, no Date — so a commit is
// byte-identical across a JSON round-trip and takes no rng fork.
//
// NO NEW GameState FIELD (design call D5): the crossing rides on the existing
// `flags` map, which the save schema already round-trips, so this task ships NO
// save migration — the same precedent as T-1504c/T-1504d. A round-trip test
// still ships (standing constraint 3) proving the flags and the lifted gate
// survive createSave → loadSave.
// ===========================================================================

/** T-1505b · A PURE, non-mutating preview of the crossing stake — the engine
 *  truth behind the UI's `crossingStatus` (format.ts) and the exact ladder
 *  {@link commitCrossingStake} runs, so the pane can never disagree with the
 *  resolver. Modelled on the blessed `quoteShipyard` / `quoteStoryletChoice`
 *  pattern. */
export interface CrossingStakeQuote {
  /** No refusal — the stake would be accepted right now. */
  ok: boolean;
  /** The first failing clause in the documented {@link CrossingRefusal} order,
   *  or null when `ok`. */
  reason: CrossingRefusal | null;
  /** Credits that WOULD be signed over (the whole balance) — 0 once committed. */
  stakeCredits: number;
  /** Fuel the jump to NEMESIS costs from the CURRENT system; the tank must
   *  already hold it (there is no port on the far side). */
  burnRequired: number;
  /** How many held fragments are decoded, against
   *  `CROSSING_DECODED_REQUIREMENT` — surfaced so the pane can say "11 of 12". */
  decoded: number;
  decodedRequired: number;
}

/**
 * T-1505b · Pure crossing-stake preview. Runs the EXACT read-only refusal ladder
 * {@link commitCrossingStake} runs, in the order documented on
 * {@link CrossingRefusal}, WITHOUT mutating state — so the UI lock line, the
 * headless caller and the resolver always agree on which clause is failing.
 *
 * The clauses, and why each is a clause:
 *  1. `already-committed` — idempotence. The gate is already open and the
 *     balance was already surrendered; a second signature must not re-zero a
 *     rebuilt account.
 *  2. `not-conqueror` — PRD §5.2/§9's career capstone. THIS IS T-1308's READER
 *     (b), the "Nemesis-crossing stake gate" that block documented as a contract
 *     and deliberately left unstubbed. The rank comes from content
 *     (`CROSSING_REQUIRED_RANK`), never a literal.
 *  3. `fragments-undecoded` — the full decoded set. The knowledge IS the
 *     crossing solution (fragments 04/09/12); without it there is nothing to fly.
 *  4. `debt-outstanding` — you cannot bet what you owe. A live Guild debt or
 *     Penny Wise loan means the balance on the table is not yours to stake.
 *  5. `insufficient-stake` — the credit floor (content, INTERIM).
 *  6. `ship-cannot-carry-the-burn` — the tank must ALREADY hold the jump's fuel.
 *     The ledger is explicit that a ship carries the burn across; there is no
 *     port on the far side to fill it, and the stake zeroes the account that
 *     would otherwise buy fuel at the last minute.
 *
 * ANTI-SOFTLOCK, stated deliberately: zeroing credits is not a trap. The manifest
 * board still pays, the flag never clears, and the burn is checked BEFORE the
 * money moves — so a captain who pays the stake and then burns the tank
 * elsewhere can trade their way back to a full tank and jump later. The crossing
 * is a one-way door, not a locked room.
 */
export function quoteCrossingStake(state: GameState): CrossingStakeQuote {
  const player = state.player;
  const decoded = decodedFragmentCount(player.nemesisFile);
  const burnRequired = jumpFuelCost(
    player.ship.drives,
    systemDistance(player.currentSystemId, NEMESIS_SYSTEM_ID),
    player.ship.hasTransWarpDrive ?? false,
  );
  const facts = {
    stakeCredits: player.credits,
    burnRequired,
    decoded,
    decodedRequired: CROSSING_DECODED_REQUIREMENT,
  };
  const refuse = (reason: CrossingRefusal): CrossingStakeQuote => ({ ok: false, reason, ...facts });

  if (state.flags['nemesis.crossing.unlocked'] === true) {
    return { ...refuse('already-committed'), stakeCredits: 0 };
  }
  if (player.registry.renownRank !== CROSSING_REQUIRED_RANK) {
    return refuse('not-conqueror');
  }
  if (decoded < CROSSING_DECODED_REQUIREMENT) {
    return refuse('fragments-undecoded');
  }
  if (player.debt > 0 || (player.loan !== null && player.loan.outstanding > 0)) {
    return refuse('debt-outstanding');
  }
  if (player.credits < CROSSING_STAKE_MIN_CREDITS) {
    return refuse('insufficient-stake');
  }
  if (player.ship.fuel < burnRequired) {
    return refuse('ship-cannot-carry-the-burn');
  }
  return { ok: true, reason: null, ...facts };
}

/**
 * T-1505b · Commit the crossing stake. The ONE writer of
 * `nemesis.crossing.unlocked`.
 *
 * On REFUSAL: pushes a single `NemesisCrossing{kind:'stake-refused', reason}` and
 * MUTATES NOTHING — no credits moved, no flag set, no die consumed here (the
 * storylet layer above spends dice, and the crossing choice requires none). That
 * is what makes the acceptance's "declining or failing the stake leaves state
 * consistent and re-attemptable" true: the state is byte-identical afterwards and
 * the `repeat:'daily'` storylet re-offers at the next dawn.
 *
 * On SUCCESS: sets the three flags, zeroes credits, and pushes the typed event
 * plus the authored `CROSSING_WIRE.stakeCommitted` line (content owns the prose;
 * the engine only files it).
 *
 * Returns whether the stake was taken. CALLER: `applyEffects` (storylets.ts), via
 * the `nemesis.crossing.the-stake` choice's `commitCrossingStake` effect.
 */
export function commitCrossingStake(state: GameState, events: GameEvent[]): boolean {
  const quote = quoteCrossingStake(state);
  if (!quote.ok) {
    events.push({
      type: 'NemesisCrossing',
      day: state.day,
      kind: 'stake-refused',
      reason: quote.reason ?? 'already-committed',
    });
    return false;
  }

  const stakeCredits = state.player.credits;
  state.player.credits = 0;
  state.flags['nemesis.crossing.unlocked'] = true;
  state.flags['nemesis.crossing.stake.credits'] = stakeCredits;
  state.flags['nemesis.crossing.stake.day'] = state.day;

  events.push({
    type: 'NemesisCrossing',
    day: state.day,
    kind: 'stake-committed',
    stakeCredits,
  });
  events.push({
    type: 'WireEntry',
    day: state.day,
    kind: 'plain',
    message: CROSSING_WIRE.stakeCommitted,
  });
  return true;
}
