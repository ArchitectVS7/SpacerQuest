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
// foundation confirms). The twelve fragments below are authored for the Nemesis
// Signal arc and flagged as a deliberate divergence.
//
// T-1505 · The arc grew from five fragments to the full TWELVE (PRD §8.1: "twelve
// fragments … found in derelicts, bought from the Wise One, decoded by the Sage").
// The decoded arc BUILDS to the crossing: frag-04 is the crossing burn-schedule
// "missing its final line", and frag-12 IS that final line — the crossing key the
// `nemesis.crossing.commit` endgame gates behind an assembled, decoded signal.
//
// ACQUISITION-MODE DISTRIBUTION (≥3 modes, realizing all five FRAGMENT_SOURCES):
//   01           — Wise One (bought at Polaris-1; storylets.ts signal-hook, source 'wise-one')
//   02,03,04,06,07 — DERELICT loot pool (source 'derelict')
//   02,05,08     — BEACON loot pool (source 'beacon')
//   09,10,11     — NPC-HELD (an NPC "who doesn't know what they have"; source 'npc')
//   12           — SAGE-reconstructed (granted+decoded once frag-04 is decoded; source 'sage')
// Fragment 01 is windowed since T-1310 (day >= 25, on visit; storylets.ts
// `wise-one.polaris.signal-hook`); 02-05 each get a Sage decode storylet (T-1310
// `sage.mizar.decode-02..05`) and 06-11 likewise (T-1505 `sage.mizar.decode-06..11`).
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
  'frag-nemesis-06': {
    id: 'frag-nemesis-06',
    order: 6,
    title: 'The Silent Fleet',
    signal:
      'Pulled from a derelict among a dozen more, all drifting the same dead heading, drives cold, hulls whole. Not one of them was shot.',
    decoded:
      'They are not wrecks. They are the ships that ran the crossing burn and lost their nerve at the horizon — turned back, and never made port again. The Signal is the sound of them still deciding.',
  },
  'frag-nemesis-07': {
    id: 'frag-nemesis-07',
    order: 7,
    title: "The Cartographer's Confession",
    signal:
      "A navigator's personal log, recovered from a gutted hulk. The last entries abandon the star charts entirely and begin drawing something the coordinates cannot hold.",
    decoded:
      'The far side is not Andromeda as the charts have it. The coordinate inside the black hole is a door, not a destination — and the navigator understood, at the end, that no map survives being carried through it.',
  },
  'frag-nemesis-08': {
    id: 'frag-nemesis-08',
    order: 8,
    title: 'The Beacon That Answers',
    signal:
      'A beacon on an empty rim channel, leaking the carrier wave — but the tones return in a different order than they left, as if something re-sorted them.',
    decoded:
      'The beacons are not relays. They are replies. Something on the far side has been answering the Signal fragment for fragment — and the moment you began collecting them, you became the half of the conversation it was waiting for.',
  },
  'frag-nemesis-09': {
    id: 'frag-nemesis-09',
    order: 9,
    title: 'A Debt in Old Coin',
    signal:
      'A data-sliver an old spacer took as payment a lifetime ago and never troubled to read. The carrier under it is the same one that predates the Confederation.',
    decoded:
      'It names the price of the crossing, and the price is not fuel. The far side takes only what death would take anyway — the hull under you, the fortune behind you, everything a captain cannot carry through the door.',
  },
  'frag-nemesis-10': {
    id: 'frag-nemesis-10',
    order: 10,
    title: 'The Passenger Manifest',
    signal:
      'A family heirloom, half a passenger list from a ship no registry admits sailed. A grandchild kept it for the names, not the route.',
    decoded:
      'The names cross-check against the drowned manifest — the crossing list. One line is marked differently: a passenger who came back. What the Sage will not say is what they carried back with them.',
  },
  'frag-nemesis-11': {
    id: 'frag-nemesis-11',
    order: 11,
    title: 'The Transmission Window',
    signal:
      'A timing sliver, salvaged and traded down the rim until nobody left remembers where it came from. It counts, and the count is nearly finished.',
    decoded:
      "It is the end of frag-01's countdown, read plainly at last. The crossing is survivable only inside the window the Signal has been counting toward — and the window is not a door that stays open.",
  },
  'frag-nemesis-12': {
    id: 'frag-nemesis-12',
    order: 12,
    title: 'The Final Line',
    signal:
      'The Sage reconstructs it from everything the rest of the Signal implies — the last line the Event-Horizon Ledger was always missing.',
    decoded:
      'The crossing solution, complete: a ship stripped to its hull and a fortune spent to the last credit, committed all at once, inside the window. You cross carrying nothing but yourself, or you do not cross at all. This is the key.',
  },
};

/** The Wise One of Polaris-1 sells this fragment as the Day-30 hook (PRD §5.1). */
export const WISE_ONE_FRAGMENT_ID = 'frag-nemesis-01';

/** Fragment pool a boarded DERELICT can yield (seeded loot roll).
 *  T-1505 · DELIBERATELY LEFT AT THE ORIGINAL THREE. The new derelict-log fragments
 *  06/07 are acquired through dedicated `nemesis.derelict-log.*` storylets (a wreck's
 *  recovered logs) rather than the loot pool: expanding the pool would change the
 *  seeded `pool[floor(rng*len)]` pick AND flip some grants between new/duplicate,
 *  which shifts the per-action event count and thus the rng-fork trajectory of the
 *  seed-pinned long sims (campaign-reach's astraxial/port sweeps). Keeping the pool
 *  byte-identical keeps 'derelict' a real acquisition mode for 06/07 without
 *  perturbing those unrelated acceptance seeds. */
export const DERELICT_FRAGMENT_POOL: readonly string[] = [
  'frag-nemesis-02',
  'frag-nemesis-03',
  'frag-nemesis-04',
];

/** Fragment pool a transmitting BEACON can yield — a signal source leaks signal.
 *  T-1505: LEFT AT THE ORIGINAL TWO for the same trajectory-neutrality reason above;
 *  the new beacon fragment 08 is acquired via a `nemesis.beacon-echo.*` storylet. */
export const BEACON_FRAGMENT_POOL: readonly string[] = ['frag-nemesis-02', 'frag-nemesis-05'];

/** Every fragment id the content defines — the validation whitelist. */
export const ALL_FRAGMENT_IDS: readonly string[] = Object.keys(SIGNAL_FRAGMENTS);

// ===========================================================================
// T-1505 · The crossing endgame — balance constants (the PRD's "stake").
//
// The Nemesis crossing (PRD §8.1) is the career's terminal act, gated three ways
// so it is a genuine, player-visible COMMITMENT and not a free door:
//   1. RANK  — CONQUEROR (the T-1308 reader: deeds.ts documents the crossing as
//      CONQUEROR's second reader; realized on `nemesis.crossing.commit`'s
//      `renown:{minRank:'CONQUEROR'}` trigger).
//   2. BANK  — a fortune committed to the burn (the commit choice's
//      `credits:{gte: CROSSING_BANK_STAKE}` requirement + `-CROSSING_BANK_STAKE`
//      effect: the bank is SPENT, not merely checked).
//   3. SHIP  — a hull that can carry, and a burn that spends, the crossing fuel:
//      the commit choice's `minFuel: CROSSING_BURN_FUEL` requirement. A fresh
//      junker's tank caps at 300 fuel (economy.ts calculateFuelCapacity: a
//      strength-1 hull holds (9+1)*1*30 = 300), so this REQUIRES a materially
//      upgraded hull (strength >= 6 → 1800-fuel tank) — the "ship" stake is a real,
//      asserted, visibly-locked gate. The crossing JUMP itself (17 → 28) then burns
//      the fuel through the ordinary travel cost, so the fuel is spent, not faked.
//
// BALANCE: no foundation numbers exist (foundation had the black hole as a
// location, never a staked crossing) — authored for T-1505 as a deliberate
// divergence. Values chosen so a CONQUEROR-era ship (upgraded hull + drives, a
// veteran fortune) meets them, and a mid-game ship provably cannot.
// ===========================================================================

/** The NEMESIS system id — the far-side black hole, the crossing destination. It
 *  is `isGatedDestination` (id >= 21), sealed behind `nemesis.crossing.unlocked`
 *  (engine day.ts). Named so the sim/UI never hardcode the literal 28. */
export const NEMESIS_SYSTEM_ID = 28;

/** Where the crossing is committed — Polaris-1, the Wise One who opened the arc
 *  (storylets.ts foreshadow: "the ones who answer too fast never make the
 *  crossing"). The `nemesis.crossing.commit` storylet triggers here. */
export const CROSSING_COMMIT_SYSTEM_ID = 17;

/** Decoded fragments the commit demands — the WHOLE assembled signal (all twelve).
 *  Reader: the commit storylet's `nemesis:{minDecoded: CROSSING_MIN_DECODED}`
 *  trigger (engine triggerMatches) and the sim/e2e stake assertions. */
export const CROSSING_MIN_DECODED = 12;

/** The bank commitment — a veteran fortune spent to the crossing. Reader: the
 *  commit choice's `credits` requirement + negative `credits` effect. */
export const CROSSING_BANK_STAKE = 50_000;

/** The fuel the ship must carry for the burn — above a junker's 300-fuel ceiling,
 *  so it can only be met by an upgraded hull (the "ship" stake). Reader: the
 *  commit choice's `minFuel` requirement (engine quote/resolveStoryletChoice). */
export const CROSSING_BURN_FUEL = 1_600;

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
