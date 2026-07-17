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

import { SIGNAL_FRAGMENTS } from '@spacerquest/content';
import { NemesisFileState, SignalFragmentRecord } from './types.js';

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

/** T-1505: how many held fragments have been DECODED. The named reader behind the
 *  crossing's `nemesis.minDecoded` trigger (engine `triggerMatches`) — the endgame
 *  demands the whole signal assembled AND decoded, not merely collected. */
export function fragmentsDecodedCount(file: NemesisFileState): number {
  return file.fragments.filter((fragment) => fragment.decoded).length;
}

/** T-1505: true if the file holds this fragment id AND it is already decoded. The
 *  reader behind the `nemesis.hasDecodedFragmentId` trigger — lets the Sage's
 *  final-line reconstruction gate on the crossing ledger (frag-04) being decoded. */
export function hasDecodedFragment(file: NemesisFileState, fragmentId: string): boolean {
  return file.fragments.some((fragment) => fragment.fragmentId === fragmentId && fragment.decoded);
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
