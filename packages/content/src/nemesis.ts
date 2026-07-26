/**
 * The Nemesis Signal — Signal Fragment lore & the decoded-lore index (T-111b).
 *
 * The career-long main arc (PRD §8.1): fragments of a transmission from the far
 * side of the Nemesis black hole, "found in derelicts, bought from the Wise One,
 * decoded by the Sage." Each fragment is a KNOWLEDGE ITEM — the one currency
 * death never takes — kept on the player's `nemesisFile`.
 *
 * This file is PURE DATA: the fragment ids, their raw (undecoded) transmission
 * text, and the decoded lore the Sage of Mizar-9 reveals. The engine owns the
 * nemesisFile mutation (grant/decode), the seeded derelict loot rolls, and the
 * decoded-lore index derivation (nemesis.ts in @spacerquest/engine).
 *
 * A fragment id maps 1:1 to an entry here; the engine's lore index is the list
 * of these entries for the fragments a spacer actually holds.
 */

import { defineSignalFragments } from './nemesisValidation.js';

export interface SignalFragmentLore {
  /** Stable id — the dedupe key on the nemesisFile and the loot-table pool key. */
  id: string;
  /** Position in the decoded arc (ascending); the lore index sorts by this. */
  order: number;
  /** Period-voice title shown in the terminal's Nemesis file. */
  title: string;
  /** The raw, undecoded transmission as first recovered — noise with a shape. */
  signal: string;
  /** What the Sage's decode reveals — added to the index once decoded. */
  decoded: string;
}

// BALANCE: foundation/rules/ carries no Nemesis-arc data (the 1991 game had the
// black hole as a location, not a fragment questline — grep 'nemesis' over
// foundation confirms). ALL TWELVE fragments below are therefore authored
// divergence, flagged deliberately: there is no foundation number to diverge FROM,
// so the arc's shape (twelve pieces, three-plus acquisition modes, one decoder) is
// PRD-REIMAGINED §8.1's "found in derelicts, bought from the Wise One, decoded by
// the Sage" rendered as content. Fragment 01 is the Wise One's Polaris-1 hook —
// WINDOWED since T-1310 (day >= 25, on visit, never expiring; storylets.ts
// `wise-one.polaris.signal-hook`), no longer the old day-30 knife-edge; 02-05 seed
// the derelict/beacon loot pools and each gets a Sage decode storylet (T-1310
// `sage.mizar.decode-02..05`).
//
// T-1505a · ACQUISITION-MODE TABLE (the definition-site home for the mode
// assignment the acceptance sweeps; every granting storylet must set an explicit
// `fragmentSource`, because engine `applyEffects` defaults it to 'wise-one'):
//
//   id  order  mode                     granting content
//   01    1    Wise One purchase        `wise-one.polaris.signal-hook`
//   02    2    derelict + beacon pool   POI_LOOT (exploration.ts)
//   03    3    derelict pool            POI_LOOT
//   04    4    derelict pool            POI_LOOT
//   05    5    beacon pool              POI_LOOT
//   06    6    derelict pool            POI_LOOT                     ← T-1505a
//   07    7    derelict pool            POI_LOOT                     ← T-1505a
//   08    8    beacon pool              POI_LOOT                     ← T-1505a
//   09    9    NPC-held (Rust Bucket)   `npc.rust-bucket.scrap-sliver`
//   10   10    NPC-held (Void Whisper)  `npc.void-whisper.psalm-shard`
//   11   11    Sage archive             `sage.mizar.archive`
//   12   12    Sage archive (terminal)  `sage.mizar.final-line`
//
// This is what makes the 'sage' and 'npc' literals in `FragmentSource` (below)
// LOAD-BEARING — before T-1505a no content produced either one.
//
// ARC BOUNDARY: 06-12 build TOWARD the crossing and stop at its threshold. The
// crossing itself (the run through Nemesis) is T-1505b and the ending is T-1505c;
// nothing here unlocks a destination, banks a stake, or ends a career. Fragment 12
// deliberately closes the loop 04's decoded text opens ("it is missing its final
// line") — that missing line is precisely what T-1505b consumes.
export const SIGNAL_FRAGMENTS: Record<string, SignalFragmentLore> = defineSignalFragments({
  'frag-nemesis-01': {
    id: 'frag-nemesis-01',
    order: 1,
    title: 'The First Carrier Wave',
    signal:
      'A looping seven-tone burst, wrapped in a carrier that predates Confederation code. It does not repeat cleanly — something underneath it is counting.',
    decoded:
      'The Sage reads the count as a countdown, not a clock: the signal marks time until something on the far side of Nemesis finishes waking.',
  },
  'frag-nemesis-02': {
    id: 'frag-nemesis-02',
    order: 2,
    title: 'The Drowned Manifest',
    signal:
      'Recovered from a gutted hulk: a cargo manifest for a ship that never filed a route, addressed to a port with no coordinates.',
    decoded:
      'The port is Andromeda-side. The manifest is a crossing list — names of spacers who went through and were never logged returning.',
  },
  'frag-nemesis-03': {
    id: 'frag-nemesis-03',
    order: 3,
    title: 'The Reptiloid Hymn',
    signal:
      'A choral pattern in a Reptiloid dialect, folded into the same carrier wave. It resolves to a single repeated phrase.',
    decoded:
      'The phrase is a warning older than the alliances: "the door answers when it is knocked upon." The Reptiloids heard the signal first.',
  },
  'frag-nemesis-04': {
    id: 'frag-nemesis-04',
    order: 4,
    title: 'The Event-Horizon Ledger',
    signal:
      'Numbers, only numbers — fuel figures, mass ratios, a burn schedule that ends at a coordinate inside the black hole.',
    decoded:
      'The burn schedule is a crossing solution: exactly how much a ship must carry, and spend, to reach the far side intact. It is missing its final line.',
  },
  'frag-nemesis-05': {
    id: 'frag-nemesis-05',
    order: 5,
    title: 'The Returning Voice',
    signal:
      'A human voice, badly degraded, transmitting on the pre-Confederation carrier. It says a name that the wire has no record of.',
    decoded:
      'The Sage matches the voice to a founding-era spacer lost at Nemesis a century ago — still broadcasting, from the wrong side, and getting closer.',
  },
  'frag-nemesis-06': {
    id: 'frag-nemesis-06',
    order: 6,
    title: 'The Turnaround Log',
    signal:
      "A wreck's own flight log, still cycling on a dead bus. The last forty entries are a burn toward Nemesis. The forty-first is the same burn, reversed, logged at three times the fuel.",
    decoded:
      'A crew that began the crossing and turned back. The reversal cost them everything they had left — and the log ends mid-word, in a hand that had stopped bothering to finish sentences.',
  },
  'frag-nemesis-07': {
    id: 'frag-nemesis-07',
    order: 7,
    title: 'Survey 11, Withdrawn',
    signal:
      'A Confederation survey file with its index page torn out and every page after it stamped WITHDRAWN. The stamp is older than the paper it sits on.',
    decoded:
      'Survey 11 charted the Nemesis approach and filed a recommendation. The Confederation withdrew the file, not the recommendation — someone read this, decided what it meant, and buried it rather than warn the lanes.',
  },
  'frag-nemesis-08': {
    id: 'frag-nemesis-08',
    order: 8,
    title: 'The Carrier Has a Sender',
    signal:
      'Beacon spill: the pre-Confederation carrier, cleaner than anyone has heard it, with a header block nobody has bothered to read because nobody expected one.',
    decoded:
      'The header is an addressee and a response code. The Signal is not a broadcast going out — it is a REPLY going back. Something out there was answered, and this is the answer, still arriving.',
  },
  'frag-nemesis-09': {
    id: 'frag-nemesis-09',
    order: 9,
    title: 'The Corridor in the Scrap',
    signal:
      "A sliver of hull plate out of a hoarder's pile, etched — not printed — with a run of six-figure coordinate triplets and one word: APPROACH.",
    decoded:
      'The triplets fix a corridor: the one line through the Nemesis gravity shear a hull can hold without being pulled apart. Somebody etched it by hand, in the dark, so it would survive whatever happened to their ship.',
  },
  'frag-nemesis-10': {
    id: 'frag-nemesis-10',
    order: 10,
    title: 'The Dark Psalm',
    signal:
      'Not a recovered fragment at all — a recitation, transcribed off a zealot who has been singing it for years and has never once been asked what the words mean.',
    decoded:
      'It is a toll, phrased as a liturgy. The crossing does not ask for fuel or nerve; it asks the crosser to give up the thing that would make them turn back. The psalm is very clear that everyone who reached the threshold found they had one.',
  },
  'frag-nemesis-11': {
    id: 'frag-nemesis-11',
    order: 11,
    title: "The Sage's Own Piece",
    signal:
      'A sliver the Sage has kept in a drawer for forty years, uncatalogued, produced only when you bring them something they have never seen: the far end of a conversation.',
    decoded:
      'The returning voice is not calling the Confederation, or the lanes, or anyone alive. It is answering the Sage — a transmission the Sage sent as a young cryptographer, decades before the voice could have received it.',
  },
  'frag-nemesis-12': {
    id: 'frag-nemesis-12',
    order: 12,
    title: 'The Final Line',
    signal:
      'One line of the Event-Horizon Ledger, on a strip cut from a larger sheet. It is a quantity, and it is not a quantity of fuel.',
    decoded:
      "The ledger's missing last line completes the crossing solution: what a ship must carry is known, and what it must SPEND at the threshold is this — and the Sage will not read the unit aloud. The solution is whole now. Nothing about it is theoretical any more.",
  },
});

/** The Wise One of Polaris-1 sells this fragment as the Day-30 hook (PRD §5.1). */
export const WISE_ONE_FRAGMENT_ID = 'frag-nemesis-01';

/**
 * Fragment pool a boarded DERELICT can yield (seeded loot roll).
 *
 * T-1505a grew this 3 → 5 (06, 07). READER: `POI_LOOT.derelict.fragment.pool`
 * (exploration.ts) → engine `resolveLoot`'s seeded `pool[floor(rng.next()*len)]`
 * pick. Growing the pool consumes the SAME number of rng draws, so no seeded
 * golden moves — only WHICH id a given seed draws changes.
 */
export const DERELICT_FRAGMENT_POOL: readonly string[] = [
  'frag-nemesis-02',
  'frag-nemesis-03',
  'frag-nemesis-04',
  'frag-nemesis-06',
  'frag-nemesis-07',
];

/** Fragment pool a transmitting BEACON can yield — a signal source leaks signal.
 *  T-1505a grew this 2 → 3 (08 — the fragment about the carrier itself, which is
 *  exactly what a beacon is leaking). Same reader as the derelict pool above. */
export const BEACON_FRAGMENT_POOL: readonly string[] = [
  'frag-nemesis-02',
  'frag-nemesis-05',
  'frag-nemesis-08',
];

/** Every fragment id the content defines — the validation whitelist. */
export const ALL_FRAGMENT_IDS: readonly string[] = Object.keys(SIGNAL_FRAGMENTS);

/**
 * T-1302: how a granted fragment entered the Nemesis file. Authored on a
 * storylet's `grantFragment` effect (see `StoryletEffects.fragmentSource`) so a
 * grant records its TRUE source — a courier drop is 'derelict', the Wise One's
 * sale is 'wise-one', and so on.
 *
 * T-1505a: 'sage' and 'npc' were DEAD LITERALS until this task — the enum carried
 * them (and the save schema accepted them) but no authored content produced either.
 * They are now load-bearing: `npc.rust-bucket.scrap-sliver` /
 * `npc.void-whisper.psalm-shard` grant with source 'npc', and `sage.mizar.archive` /
 * `sage.mizar.final-line` grant with source 'sage'. See the acquisition-mode table
 * above. READER of a stored source: `nemesisLoreIndex` (engine nemesis.ts) puts it
 * on every lore-index row, and the sim's acquisition-mode sweep asserts on it.
 *
 * NOTE: this MUST stay in lockstep with the engine's serialized authority,
 * `SignalFragmentRecord['source']` (@spacerquest/engine types.ts). That record
 * is what round-trips through the save; this literal set is the content-side
 * validation whitelist. If one changes, change both.
 */
export type FragmentSource = 'derelict' | 'beacon' | 'wise-one' | 'sage' | 'npc';

/** The valid fragment-source literals — the validation whitelist for
 *  `StoryletEffects.fragmentSource`. */
export const FRAGMENT_SOURCES: readonly FragmentSource[] = [
  'derelict',
  'beacon',
  'wise-one',
  'sage',
  'npc',
];
