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

import type { RenownRankId } from './deeds.js';
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

// ===========================================================================
// T-1505b · THE CROSSING — the arc's terminus (PRD-REIMAGINED §8.1: "the arc
// ends at the event horizon, with everything you own on the table"; §5 "the
// game's ultimate gamble — a one-way crossing to Andromeda, attempted only when
// you're willing to bet everything you've built").
//
// Everything below is DATA. The engine owns the rules: `quoteCrossingStake` runs
// the refusal ladder over these numbers, `commitCrossingStake` signs the stake
// over and sets `nemesis.crossing.unlocked`, and `resolveTravel` flies the jump.
//
// DIVERGENCE: foundation (git ref f2f95fa9) has no Nemesis arc, no crossing, and
// no stake — grep 'nemesis' over foundation returns a map location and nothing
// else. There is no foundation number to diverge FROM, so every constant here is
// authored Rimward content, and each carries its own INTERIM note where T-1603
// owns the eventual tuning.
// ===========================================================================

/**
 * The renown rank the crossing demands (PRD §5.2/§9 name Conqueror the CAREER
 * CAPSTONE). This is T-1308's intended reader (b) — the "Nemesis-crossing stake
 * gate" that block documents as a contract and deliberately left unstubbed so no
 * fake reader could game the reader-consumption signal. It is DISCHARGED here.
 *
 * READER: engine `quoteCrossingStake` (nemesis.ts), whose refusal ladder emits
 * `NemesisCrossing{kind:'stake-refused', reason:'not-conqueror'}` below this rank.
 * Asserted BOTH WAYS (GIGA_HERO refuses / CONQUEROR passes, everything else held
 * equal) in `packages/engine/src/__tests__/crossing.test.ts`.
 */
export const CROSSING_REQUIRED_RANK: RenownRankId = 'CONQUEROR';

/**
 * How many fragments must be held AND DECODED before the crossing is offered —
 * the arc's "full decoded set" clause. DERIVED from the authored fragment table,
 * never a literal 12: authoring a thirteenth fragment moves this gate with it.
 *
 * READERS: the `nemesis.crossing.the-stake` storylet's `trigger.nemesis.minDecoded`
 * (so the beat does not even appear early) and engine `quoteCrossingStake`
 * (`reason:'fragments-undecoded'`, so a hand-built state cannot skip the arc).
 */
export const CROSSING_DECODED_REQUIREMENT = ALL_FRAGMENT_IDS.length;

/**
 * The credit floor the stake demands before the whole balance is signed over.
 *
 * INTERIM — T-1603 owns the canonical number (standing constraint: earlier tasks
 * must not enshrine values the balance pass will move). Set to the Guild debt a
 * career OPENS under (`state.ts` seeds `debt: 25000`) so the stake is legible as
 * a mirror of the run's first obligation: you start owing 25,000 and you finish
 * by putting at least that much back on the table. It is a FLOOR, not a price —
 * `commitCrossingStake` signs over the entire balance, whatever it is.
 *
 * READER: engine `quoteCrossingStake` (`reason:'insufficient-stake'`), surfaced
 * to the player by the UI's `crossingStatus` lock line.
 */
export const CROSSING_STAKE_MIN_CREDITS = 25000;

/**
 * The PILOT DC of the crossing jump itself.
 *
 * DESIGN CALL (T-1505b D3): the crossing does NOT use the distance DC. The
 * general travel rule is `travelDc(d) = 8 + floor(d/2)`, and Mizar-9 (the Sage's
 * bench, where the stake is signed) sits ~125.7 units from NEMESIS — a DC of ~70,
 * which no die plus modifier can ever reach. A lifted gate onto an unrollable
 * check is a gate to nowhere. The fiction already supplies the fix: fragments 04
 * and 12 decode to "a crossing solution: exactly how much a ship must carry, and
 * spend, to reach the far side intact", and fragment 09 to "the one line through
 * the Nemesis gravity shear a hull can hold". The DECODED SOLUTION *is* the nav
 * solution — so a captain who has the whole set flies a hard but real check
 * instead of an impossible one.
 *
 * INTERIM at 20 — T-1603 owns the number. 20 sits inside the band ordinary travel
 * already reaches (core hops run DC 8–15; the longest charted core/rim traverse,
 * Capella-4 ↔ Achernar-5 at ~44 units, is DC 30), so the crossing is a hard jump
 * rather than a new kind of wall: a fully fitted navigation suite adds +8
 * (`navBonus`), which puts it inside one good die. The crossing's real price is
 * the stake and the burn, not the roll.
 *
 * READER: engine `travelDc(distance, destinationId)` — consumed by BOTH
 * `travelPreview` (the starmap's previewed DC) and `resolveTravel` (the rolled
 * DC), so the number shown is the number checked.
 */
export const NEMESIS_CROSSING_DC = 20;

/**
 * The two Galactic-Wire lines the crossing files. Content owns the prose; the
 * engine only files it as a `WireEntry{kind:'plain'}`.
 *
 * READER: the UI wire ticker / wire log (`format.ts` `wireLines` / `wireLog`),
 * asserted verbatim (imported, never re-typed) by the engine crossing tests and
 * the e2e spec.
 */
export const CROSSING_WIRE = {
  /** Filed the moment the stake is signed over and the gate lifts. */
  stakeCommitted:
    'THE WIRE — a captain has signed the whole of their account over to a Mizar-9 escrow and filed a flight plan with no return leg. The clerks logged it without comment. There is no form for this.',
  /** Filed on arrival at the far side of the event horizon. */
  crossed:
    'THE WIRE — last contact: a hull crossing the Nemesis shear on the etched corridor, under its own power, exactly as the ledger said it could be done. The carrier wave has stopped counting.',
} as const;

// ===========================================================================
// T-1505c · THE ENDING — the career's terminus, as prose.
//
// DIVERGENCE: foundation (git ref f2f95fa9) has no ending of any kind. The 1991
// game ran until the operator reset the board; the Nemesis black hole was a map
// location and Andromeda a place you could dock. There is therefore no
// foundation text to diverge FROM — every line below is authored Rimward
// content, written to PRD-REIMAGINED §8.1 ("the arc ends at the event horizon,
// with everything you own on the table") in the register of `CROSSING_WIRE` and
// the fragments' `decoded` texts.
//
// ARC BOUNDARY, deliberately held: the epilogue narrates the THRESHOLD and
// nothing past it. Andromeda (systems 21–26) and MALIGNA (27) stay sealed for
// the expansion (PRD §10), so the prose closes the Signal's own loops — the
// carrier wave that stopped counting (fragment 01), the returning voice
// (05/11), the toll fragment 10 named — and promises nothing about the far
// side. `signOff` is the tease; it is a door, not a trailer.
//
// READERS: engine `careerEpilogue` (nemesis.ts) folds these strings into the
// terminal view-model, and the UI's `EndingScreen` (App.tsx, via format.ts
// `endingScreen`) renders them. Both the engine tests and
// `ui/e2e/nemesis-ending.spec.ts` assert against these constants IMPORTED, never
// re-typed.
// ===========================================================================
export const CROSSING_ENDING = {
  /** The masthead above the title — where and what this screen is. */
  kicker: 'THE FAR SIDE · END OF CAREER',
  title: 'The Carrier Wave Stops Counting',
  /** The epilogue, one paragraph per entry, in reading order. */
  prose: [
    'The shear takes the ship the way the ledger said it would: not as violence but as arithmetic, every figure spent exactly where the etched corridor said to spend it. The last of the burn goes, and the hull holds, and the instruments — which have been counting down since the first sliver of carrier wave came off a gutted hulk — stop counting, all at once, the way a held breath stops.',
    'The toll comes due at the threshold, as the psalm promised. It is not fuel and it is not nerve. It is the lanes: the manifest board at Sol-3, the Guild clerk who filed your marker, the bench at Mizar-9 with your fragments pinned to the wall above it. You give them up because there is no version of the crossing where you keep them, and the giving is the only part of the solution nobody wrote down.',
    'Behind you the Confederation logs a hull that did not come back and files it, without comment, under a heading it has used a hundred times. Ahead, on a carrier older than any code the lanes can read, a voice that has been arriving for a century finishes what it was saying — and this time somebody is close enough to hear the end of the sentence.',
  ] as const,
  /** The line under the career summary. It promises nothing; it opens a door. */
  signOff:
    'What the voice says on the far side is not in this ledger. That crossing belongs to another career.',
  /** Copy on the ending screen's single control. */
  returnLabel: 'Begin a new career',
} as const;
