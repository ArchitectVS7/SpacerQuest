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
// foundation confirms). The five fragments below are authored for T-111b and
// flagged as a deliberate divergence: fragment 01 is the Wise One's Day-30 hook
// (PRD §5.1); 02-05 seed the derelict/beacon loot pools.
export const SIGNAL_FRAGMENTS: Record<string, SignalFragmentLore> = {
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
};

/** The Wise One of Polaris-1 sells this fragment as the Day-30 hook (PRD §5.1). */
export const WISE_ONE_FRAGMENT_ID = 'frag-nemesis-01';

/** Fragment pool a boarded DERELICT can yield (seeded loot roll). */
export const DERELICT_FRAGMENT_POOL: readonly string[] = [
  'frag-nemesis-02',
  'frag-nemesis-03',
  'frag-nemesis-04',
];

/** Fragment pool a transmitting BEACON can yield — a signal source leaks signal. */
export const BEACON_FRAGMENT_POOL: readonly string[] = ['frag-nemesis-02', 'frag-nemesis-05'];

/** Every fragment id the content defines — the validation whitelist. */
export const ALL_FRAGMENT_IDS: readonly string[] = Object.keys(SIGNAL_FRAGMENTS);

/**
 * T-1302: how a granted fragment entered the Nemesis file. Authored on a
 * storylet's `grantFragment` effect (see `StoryletEffects.fragmentSource`) so a
 * grant records its TRUE source — a courier drop is 'derelict', the Wise One's
 * sale is 'wise-one', and so on.
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
