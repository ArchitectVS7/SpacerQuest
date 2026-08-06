/**
 * T-145 · THE FIXED LIAR'S DICE ROSTER — pool A
 * (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §2).
 *
 * FORTY-TWO AUTHORED OPPONENTS, exactly three per `hasHangout` port. They are
 * **not** `NpcState`s (§1 rule 1): they have no `currentSystemId`, take no part in
 * the dusk roam simulation, cannot die, carry no disposition and no relationship.
 * They are always seatable at their authored port unless broke. They are the
 * gauntlet, and `player.liarsDiceBeaten` records them AND ONLY THEM.
 *
 * THIS FILE IS DATA. The archetype *label* is content; the POLICY that reads the
 * label is `packages/engine/src/liarsDiceRules.ts` (`archetypeMove`). There is no
 * `if (` here deciding an outcome — the file exports no functions at all, and the
 * validator in `liarsDiceValidation.ts` decides nothing: it only throws on
 * malformed content, the `defineDeeds` / `defineSignalFragments` precedent.
 *
 * NOTHING HERE IS FREEHAND EXCEPT THE NAMES AND THE LINES. Seat, archetype and
 * bankroll are FULLY DETERMINED by the port (§2.4):
 *
 *   | seat | role           | archetype                              | bankroll        |
 *   | 1    | the journeyman | 'bad' at ports 1-7, 'random' at 8-14   | 3 x wager.max   |
 *   | 2    | the regular    | 'mixed', mix keyed by the port's TONE   | 5 x wager.max   |
 *   | 3    | the house      | 'optimal'                               | 8 x wager.max   |
 *
 * so every port offers one easy seat, one unpredictable seat and one hard seat,
 * difficulty rises monotonically with the purse, and the label census is
 * bad x7 / random x7 / mixed x14 / optimal x14.
 *
 * TOTAL ROSTER CAPITAL: 280,800 cr (= 16 x the sum of the fourteen `wager.max`).
 * That is the BOUNDED, ONE-TIME MAXIMUM the whole gauntlet can ever transfer to a
 * captain for the life of a save, because the roster is zero-sum and never
 * regenerates (§7.5). Every credit taken off a roster opponent came out of the
 * authored bankroll below.
 *
 * THE INVARIANT THIS TABLE BUYS, asserted by the validator so a later content pass
 * cannot quietly break it: at all 42 rows `bankroll >= wagerBandFor(systemId).min`,
 * because the smallest bankroll is `3 x max` and `3 x max >= min` holds at every
 * port (tightest is port 11: 9000 >= 500). That is the precondition of §7.5's
 * no-lockout theorem.
 */

import { defineLiarsDiceOpponents } from './liarsDiceValidation.js';

/** The three CONCRETE policies plus the meta-archetype that samples among them. */
export type LiarsDiceArchetypeId = 'optimal' | 'bad' | 'random' | 'mixed';

/**
 * A percentage split across the three CONCRETE archetypes. Non-negative integers
 * summing to EXACTLY 100. `'mixed'` is deliberately not a member of this shape, so
 * a mix can never recurse into another mix.
 */
export interface LiarsDiceMix {
  optimal: number;
  bad: number;
  random: number;
}

export interface LiarsDiceOpponent {
  /** `ld-<systemId>-<seat>`. Provably disjoint from every `NpcState` id (which are
   *  `NPC_PROFILES` / `QUEST_PROFILES` ids) — asserted by the content validator. */
  id: string;
  /** The `STAR_SYSTEMS` id of the port this opponent is fixed at. Matches the
   *  record key; the validator asserts key === row.systemId, the `portHangouts.ts`
   *  precedent. */
  systemId: number;
  name: string;
  seat: 1 | 2 | 3;
  archetype: LiarsDiceArchetypeId;
  /** REQUIRED iff `archetype === 'mixed'`, ABSENT otherwise. Asserted BOTH ways. */
  mix?: Readonly<LiarsDiceMix>;
  /** The AUTHORED STARTING PURSE, in credits. Seeded onto the save at new-game and
   *  by the v14->v15 migration; the live balance thereafter is save state (§7). */
  bankroll: number;
  /** Three authored lines, voiced to the port's `prose.tone`.
   *  `tableTalk` MUST NOT reference a dice count — the count moves with the unlock
   *  ladder (§4), so "four dice apiece" would be a lie at tier 2. That is a
   *  mechanical trap, which is why the validator enforces it rather than taste. */
  lines: { tableTalk: string; win: string; lose: string };
}

/**
 * THE FIVE UNLOCK THRESHOLDS, in `player.liarsDiceGamesPlayed` (§4.1). Tier n is
 * live at `gamesPlayed >= LIARS_DICE_UNLOCK_GAMES[n - 1]`.
 *
 * SHIPS HERE IN T-145 THOUGH NOTHING READS IT UNTIL T-146's `liarsDiceTier`. It is
 * inert data, and splitting one content file across two tasks would risk a merge
 * for no gain (`docs/LIARS-DICE-PROGRESSION_SPEC.md` §8 row 34).
 */
export const LIARS_DICE_UNLOCK_GAMES: readonly [5, 10, 20, 40, 80] = [5, 10, 20, 40, 80] as const;

/** Tier 4's ceiling multiplier over the port's authored `wager.max` (§4.4). Also
 *  inert until T-146 reads it. */
export const LIARS_DICE_RAISED_CEILING_MULT = 3;

/**
 * T-197 · ROUNDS PER DAY, BY UNLOCK TIER (`docs/DAWN-HAND-REDESIGN.md` §4b, owner
 * ruling: "clamp liars dice at X number of rounds, scaling with a player's rank in
 * liars dice (rewarding good play)"). Index = the tier `liarsDiceTier` returns
 * (0-5); the value is how many hands that captain may OPEN in one day.
 *
 * **CONFIRMED (owner, 2026-08-05) — T-198's R3 ruling, shipped by T-202.** The counts
 * are `[1, 2, 3, 4, 5, 6]`, a strict +1/tier climb, REVISED UP from the
 * `[1, 2, 2, 3, 3, 4]` suggestion T-197 shipped here marked
 * `PROPOSED — AWAITING OWNER CONFIRMATION OF THE EXACT COUNTS` (that history is kept,
 * not deleted: T-197 shipped §4b's own suggested table verbatim because no answer had
 * arrived at ship time). The owner's reasoning, in one sentence: a risky gambler
 * archetype buying its way into a scoundrel playstyle off a high-variance table is an
 * INTENTIONAL, ACCEPTED edge rather than an exploit to close — see `TASKS.md` T-198's
 * R3 ruling note for the full text and T-202 for the array edit plus its capstone,
 * `docs/balance/baseline-t202-liars-dice-ceiling.json`.
 *
 * The SHAPE (more rounds at a higher tier, monotone non-decreasing) was always the
 * ruled part; the exact counts are now ruled too. They stay cheap to change: this
 * array is the only place they exist, and it is CONTENT — a revision is a content edit
 * that owes a capstone, never an argument from a fingerprint. See
 * `docs/LIARS-DICE-DECISIONS.md` LD-23 for the standing ruling.
 *
 * **THE COMMITTED SWEEP CANNOT EXHIBIT TIERS ≥ 2 OF THIS TABLE (F-202-1).** The sim's
 * gambler plays `Math.min(GAMBLER_MAX_DARES_PER_DAY, liarsDiceRoundsRemaining(state))`
 * (`packages/sim/src/index.ts:4584`) with `GAMBLER_MAX_DARES_PER_DAY = 2` (`:4058`), and
 * it is the only policy that plans a Dare at all — so under both the old and the new
 * table the instrument plays `1,2,2,2,2,2` hands by tier, and T-202's capstone came back
 * byte-identical on all eight policy rows. That is an instrument-gap NULL RESULT, not a
 * verdict that this ceiling is safe; measuring it needs a gambler arm bounded by the
 * engine's own `liarsDiceRoundsRemaining`, which is a new instrument BEHAVIOUR and its
 * own task (filed as F-202-1 in `TASKS.md`'s T-202 block).
 *
 * A SIX-TUPLE, not a bare `number[]`, for the same reason `LIARS_DICE_UNLOCK_GAMES`
 * is a five-tuple: `liarsDiceTier` returns `0|1|2|3|4|5`, so a row per tier is a
 * compile-time obligation and a short table cannot silently read `undefined`.
 */
export const LIARS_DICE_ROUNDS_PER_DAY: readonly [number, number, number, number, number, number] =
  [1, 2, 3, 4, 5, 6] as const;

/** The four tone mixes (§2.5). The port's authored `prose.tone` picks the row —
 *  the TONE, not the id, so a port re-toned in a later content pass moves with it
 *  and no engine code ever learns a port id. */
const EVERYDAY_MIX: Readonly<LiarsDiceMix> = { optimal: 40, bad: 40, random: 20 };
const EXOTIC_MIX: Readonly<LiarsDiceMix> = { optimal: 60, bad: 20, random: 20 };
const DANGEROUS_MIX: Readonly<LiarsDiceMix> = { optimal: 70, bad: 10, random: 20 };
const COMIC_MIX: Readonly<LiarsDiceMix> = { optimal: 20, bad: 40, random: 40 };

/**
 * The 42 rows, keyed by `STAR_SYSTEMS` id. Bankrolls are §2.6's table verbatim —
 * seat 1 is `3 x wager.max`, seat 2 `5 x`, seat 3 `8 x`.
 */
export const LIARS_DICE_OPPONENTS: Readonly<Record<number, readonly LiarsDiceOpponent[]>> =
  defineLiarsDiceOpponents({
    // --- 1 · Sol-3 · the Long Table · everyday · band 25-1000 ---------------
    1: [
      {
        id: 'ld-1-1',
        systemId: 1,
        name: 'Hob Trellis',
        seat: 1,
        archetype: 'bad',
        bankroll: 3000,
        lines: {
          tableTalk:
            "Pull up a bench, captain. I've held this seat since before the hall had a roof.",
          win: 'Told you. The bench remembers who sits well.',
          lose: 'Ah, well. The bench never did like me much.',
        },
      },
      {
        id: 'ld-1-2',
        systemId: 1,
        name: 'Marla Deane',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 5000,
        lines: {
          tableTalk:
            "You'll get an honest game here. Whether you get an honest answer is your problem.",
          win: 'Honest game, honest answer. You just asked the wrong one.',
          lose: "Fair enough. I'll be honest about that too.",
        },
      },
      {
        id: 'ld-1-3',
        systemId: 1,
        name: 'Quiet Odom',
        seat: 3,
        archetype: 'optimal',
        bankroll: 8000,
        lines: {
          tableTalk: "I don't talk much at the table. Saves me having to unsay things.",
          win: 'See? Nothing to unsay.',
          lose: 'Now that I will have to think about.',
        },
      },
    ],

    // --- 2 · Aldebaran-1 · the Weighbridge · everyday · band 50-750 ---------
    2: [
      {
        id: 'ld-2-1',
        systemId: 2,
        name: 'Tolliver Ash',
        seat: 1,
        archetype: 'bad',
        bankroll: 2250,
        lines: {
          tableTalk:
            'Everything on this station gets weighed. Might as well weigh you while you sit.',
          win: 'Light. I knew it the moment you sat down.',
          lose: 'Heavier than the manifest said. My mistake.',
        },
      },
      {
        id: 'ld-2-2',
        systemId: 2,
        name: 'Ren Kaskil',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 3750,
        lines: {
          tableTalk: 'Freight comes through, freight goes out. I stay. Deal me in.',
          win: 'Another one shipped out. Safe travels.',
          lose: "Signed for and sealed. You've earned it.",
        },
      },
      {
        id: 'ld-2-3',
        systemId: 2,
        name: 'Signet Vurr',
        seat: 3,
        archetype: 'optimal',
        bankroll: 6000,
        lines: {
          tableTalk: 'I stamp what balances. Nothing else crosses my bridge.',
          win: "Doesn't balance. Never did.",
          lose: 'Balanced, stamped. Take it and go.',
        },
      },
    ],

    // --- 3 · Altair-3 · the Waypost · everyday · band 25-1000 ---------------
    3: [
      {
        id: 'ld-3-1',
        systemId: 3,
        name: 'Perro Lange',
        seat: 1,
        archetype: 'bad',
        bankroll: 3000,
        lines: {
          tableTalk: 'Everybody stops here. Nobody stays. Sit while you are stopping.',
          win: 'You stopped a little longer than you meant to.',
          lose: 'Go on, then, before I talk you into another.',
        },
      },
      {
        id: 'ld-3-2',
        systemId: 3,
        name: 'Ivy Sallow',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 5000,
        lines: {
          tableTalk: 'The Waypost keeps no records. Say what you like at this table.',
          win: 'No records. Nobody has to know.',
          lose: 'No records, so nobody will believe you either.',
        },
      },
      {
        id: 'ld-3-3',
        systemId: 3,
        name: 'Cordell Muth',
        seat: 3,
        archetype: 'optimal',
        bankroll: 8000,
        lines: {
          tableTalk: "I've watched a thousand captains pass through. Most of them bid the same.",
          win: 'The same. Exactly the same.',
          lose: "Now that was new. I'll remember it.",
        },
      },
    ],

    // --- 4 · Arcturus-6 · the Garrison Mess · dangerous · band 100-400 ------
    4: [
      {
        id: 'ld-4-1',
        systemId: 4,
        name: 'Sergeant Kell Brune',
        seat: 1,
        archetype: 'bad',
        bankroll: 1200,
        lines: {
          tableTalk: "Mess rules: you sit, you play, you don't complain to the officer.",
          win: 'Dismissed, captain.',
          lose: "Noted. It won't go in the log.",
        },
      },
      {
        id: 'ld-4-2',
        systemId: 4,
        name: 'Corporal Anseth',
        seat: 2,
        archetype: 'mixed',
        mix: DANGEROUS_MIX,
        bankroll: 2000,
        lines: {
          tableTalk: 'Half this room has shot at somebody this month. Play nicely.',
          win: 'Good. I hate paperwork.',
          lose: 'Take it. Nobody was going to write it down anyway.',
        },
      },
      {
        id: 'ld-4-3',
        systemId: 4,
        name: 'Major Idris Vance',
        seat: 3,
        archetype: 'optimal',
        bankroll: 3200,
        lines: {
          tableTalk: 'I make decisions for a living, captain. This is just a smaller one.',
          win: 'Decision made.',
          lose: 'Then I made the wrong one. It happens twice a war.',
        },
      },
    ],

    // --- 5 · Deneb-4 · the Standing Hall · exotic · band 25-2000 ------------
    5: [
      {
        id: 'ld-5-1',
        systemId: 5,
        name: 'Neth of the Ninth Floor',
        seat: 1,
        archetype: 'bad',
        bankroll: 6000,
        lines: {
          tableTalk: 'In the Standing Hall nobody sits. The name is older than the custom.',
          win: 'You may sit now, if you like.',
          lose: 'Then I shall keep standing. It suits me.',
        },
      },
      {
        id: 'ld-5-2',
        systemId: 5,
        name: 'Ossuary Fen',
        seat: 2,
        archetype: 'mixed',
        mix: EXOTIC_MIX,
        bankroll: 10000,
        lines: {
          tableTalk: 'We play here for the shape of the thing, not for the credits.',
          win: 'A good shape. You should have seen it.',
          lose: 'A better shape than mine. I concede the form.',
        },
      },
      {
        id: 'ld-5-3',
        systemId: 5,
        name: 'Halcine Dro',
        seat: 3,
        archetype: 'optimal',
        bankroll: 16000,
        lines: {
          tableTalk: 'Speak your claim clearly. The Hall dislikes a mumbled lie.',
          win: 'It was mumbled. The Hall heard.',
          lose: 'Clearly said and clearly true. Rare, that.',
        },
      },
    ],

    // --- 6 · Denebola-5 · the Incident Book · comic · band 20-300 -----------
    6: [
      {
        id: 'ld-6-1',
        systemId: 6,
        name: 'Barnaby Squick',
        seat: 1,
        archetype: 'bad',
        bankroll: 900,
        lines: {
          tableTalk: "I'm in the book eleven times. Twice for things I did on purpose.",
          win: 'Twelve! Someone fetch the pen.',
          lose: "Don't write that one down. Please.",
        },
      },
      {
        id: 'ld-6-2',
        systemId: 6,
        name: 'Wendeline Crumb',
        seat: 2,
        archetype: 'mixed',
        mix: COMIC_MIX,
        bankroll: 1500,
        lines: {
          tableTalk: "Last week a man lost his boots at this table. He wasn't wearing any.",
          win: "Boots, captain. That's how it starts.",
          lose: 'Oh, marvellous. Now I am the entry.',
        },
      },
      {
        id: 'ld-6-3',
        systemId: 6,
        name: 'The Duty Clerk',
        seat: 3,
        archetype: 'optimal',
        bankroll: 2400,
        lines: {
          tableTalk: 'I write the incidents down. I am not required to be one.',
          win: 'Recorded. Section four, subsection unfortunate.',
          lose: 'I shall record this as a clerical error.',
        },
      },
    ],

    // --- 7 · Fomalhaut-2 · the Fittings · comic · band 15-1200 --------------
    7: [
      {
        id: 'ld-7-1',
        systemId: 7,
        name: 'Gasket Pell',
        seat: 1,
        archetype: 'bad',
        bankroll: 3600,
        lines: {
          tableTalk: "Name's Gasket. Not a nickname. My mother had a sense of humour.",
          win: 'Ha! Gasket holds!',
          lose: 'Gasket blows. Story of my life.',
        },
      },
      {
        id: 'ld-7-2',
        systemId: 7,
        name: 'Trude Bannerman',
        seat: 2,
        archetype: 'mixed',
        mix: COMIC_MIX,
        bankroll: 6000,
        lines: {
          tableTalk: "Everything in this room was bolted on by somebody who'd been drinking.",
          win: 'Held together. Barely. Like everything else here.',
          lose: 'Came apart in my hands. Again.',
        },
      },
      {
        id: 'ld-7-3',
        systemId: 7,
        name: 'Old Farrow',
        seat: 3,
        archetype: 'optimal',
        bankroll: 9600,
        lines: {
          tableTalk: 'Forty years fitting pipe. You learn where the pressure really is.',
          win: 'Right where I said it was.',
          lose: 'Pressure got behind me. Forty years, and it still does.',
        },
      },
    ],

    // --- 8 · Mira-9 · the Dry Tank · everyday · band 5-200 ------------------
    8: [
      {
        id: 'ld-8-1',
        systemId: 8,
        name: 'Slip Danner',
        seat: 1,
        archetype: 'random',
        bankroll: 600,
        lines: {
          tableTalk: "You've got money. That is already more than half this room.",
          win: "Now you've got what the rest of us have.",
          lose: 'Fine. It was never really mine.',
        },
      },
      {
        id: 'ld-8-2',
        systemId: 8,
        name: 'Ada Rook',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 1000,
        lines: {
          tableTalk: "The tank's been dry since before I got here. So has everyone in it.",
          win: 'Drier now.',
          lose: 'First wet night in a while. Enjoy it.',
        },
      },
      {
        id: 'ld-8-3',
        systemId: 8,
        name: 'Quillon Sarrs',
        seat: 3,
        archetype: 'optimal',
        bankroll: 1600,
        lines: {
          tableTalk: 'Small stakes teach the same lesson as big ones. Cheaper, too.',
          win: 'Cheap lesson. Take it with you.',
          lose: 'Expensive, for here. Well played.',
        },
      },
    ],

    // --- 9 · Pollux-7 · the Turnaround · everyday · band 75-900 -------------
    9: [
      {
        id: 'ld-9-1',
        systemId: 9,
        name: 'Bex Halloran',
        seat: 1,
        archetype: 'random',
        bankroll: 2700,
        lines: {
          tableTalk: "Ship's in dock six hours. I intend to spend all of them right here.",
          win: 'Five hours left. Plenty of time.',
          lose: "Right, that's my dock fees gone.",
        },
      },
      {
        id: 'ld-9-2',
        systemId: 9,
        name: 'Nils Tarrant',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 4500,
        lines: {
          tableTalk: "Fast turnaround, fast hands. That's the whole port, said quickly.",
          win: 'Faster than you, anyway.',
          lose: 'You turned that one around on me.',
        },
      },
      {
        id: 'ld-9-3',
        systemId: 9,
        name: 'Deckmaster Oye',
        seat: 3,
        archetype: 'optimal',
        bankroll: 7200,
        lines: {
          tableTalk: "I schedule forty berths a day. I'm rarely surprised.",
          win: 'On schedule.',
          lose: "Off schedule. I'll allow it once.",
        },
      },
    ],

    // --- 10 · Procyon-5 · the Bonded Room · everyday · band 100-500 ---------
    10: [
      {
        id: 'ld-10-1',
        systemId: 10,
        name: 'Clerk Emsley',
        seat: 1,
        archetype: 'random',
        bankroll: 1500,
        lines: {
          tableTalk: 'Everything in here is bonded, sealed and accounted for. Except us.',
          win: 'Accounted for.',
          lose: 'Write it off. I certainly will.',
        },
      },
      {
        id: 'ld-10-2',
        systemId: 10,
        name: 'Hesper Vane',
        seat: 2,
        archetype: 'mixed',
        mix: EVERYDAY_MIX,
        bankroll: 2500,
        lines: {
          tableTalk: 'The guild lets us play as long as nobody names a number out loud.',
          win: 'And nobody did. Lovely.',
          lose: 'Say nothing. To anyone.',
        },
      },
      {
        id: 'ld-10-3',
        systemId: 10,
        name: 'Factor Bram Ostley',
        seat: 3,
        archetype: 'optimal',
        bankroll: 4000,
        lines: {
          tableTalk: 'A bond is a promise with a price on it. So is a bid.',
          win: 'Your promise was overpriced.',
          lose: "Priced correctly. I'll honour it.",
        },
      },
    ],

    // --- 11 · Regulus-6 · the High Table · exotic · band 500-3000 -----------
    11: [
      {
        id: 'ld-11-1',
        systemId: 11,
        name: 'Vessel-of-Thirds',
        seat: 1,
        archetype: 'random',
        bankroll: 9000,
        lines: {
          tableTalk: 'I am seated by invitation. So, apparently, are you.',
          win: 'The invitation is withdrawn.',
          lose: 'Then you are invited again. How tiresome.',
        },
      },
      {
        id: 'ld-11-2',
        systemId: 11,
        name: 'Lady Ancasta Rhue',
        seat: 2,
        archetype: 'mixed',
        mix: EXOTIC_MIX,
        bankroll: 15000,
        lines: {
          tableTalk: 'At the High Table one does not ask what a thing costs.',
          win: 'One does not ask. One simply pays.',
          lose: 'Charming. Do come back and ruin another evening.',
        },
      },
      {
        id: 'ld-11-3',
        systemId: 11,
        name: 'The Seneschal',
        seat: 3,
        archetype: 'optimal',
        bankroll: 24000,
        lines: {
          tableTalk: "I keep the High Table's floor. Few captains are asked to stand on it.",
          win: 'The floor is kept.',
          lose: 'You may stand there as long as you like.',
        },
      },
    ],

    // --- 12 · Rigel-8 · the Underhold · dangerous · band 10-3000 ------------
    12: [
      {
        id: 'ld-12-1',
        systemId: 12,
        name: 'Grell Sixteen',
        seat: 1,
        archetype: 'random',
        bankroll: 9000,
        lines: {
          tableTalk: 'Down here we settle at the table. Upstairs they settle other ways.',
          win: 'Settled. Walk up slowly.',
          lose: 'Settled. Nobody has to hear about it.',
        },
      },
      {
        id: 'ld-12-2',
        systemId: 12,
        name: 'Auntie Sorrow',
        seat: 2,
        archetype: 'mixed',
        mix: DANGEROUS_MIX,
        bankroll: 15000,
        lines: {
          tableTalk: 'Everyone in the Underhold owes somebody. Play like you know which.',
          win: 'Now you owe me, dear.',
          lose: 'Consider us square. I dislike being owed.',
        },
      },
      {
        id: 'ld-12-3',
        systemId: 12,
        name: 'The Holdkeeper',
        seat: 3,
        archetype: 'optimal',
        bankroll: 24000,
        lines: {
          tableTalk: 'I have never been robbed and I have never been lied to twice.',
          win: 'Once was enough.',
          lose: 'Then you are the first. Enjoy it briefly.',
        },
      },
    ],

    // --- 13 · Spica-3 · the Second Watch · exotic · band 200-1800 -----------
    13: [
      {
        id: 'ld-13-1',
        systemId: 13,
        name: 'Thin Casimir',
        seat: 1,
        archetype: 'random',
        bankroll: 5400,
        lines: {
          tableTalk: 'Second watch is the honest watch. Everyone else is asleep.',
          win: 'Sleep on it.',
          lose: "Then I'll take the third watch as well.",
        },
      },
      {
        id: 'ld-13-2',
        systemId: 13,
        name: 'Orla Venn',
        seat: 2,
        archetype: 'mixed',
        mix: EXOTIC_MIX,
        bankroll: 9000,
        lines: {
          tableTalk: 'We keep the watch so the port can dream. Somebody has to stay awake.',
          win: 'Dream about that one.',
          lose: "I'm awake. I'm awake. Take it.",
        },
      },
      {
        id: 'ld-13-3',
        systemId: 13,
        name: 'Watchmaster Iselle',
        seat: 3,
        archetype: 'optimal',
        bankroll: 14400,
        lines: {
          tableTalk: 'I have stood this watch nine years. Nothing crosses it unseen.',
          win: 'Seen.',
          lose: 'Unseen. Nine years, and tonight of all nights.',
        },
      },
    ],

    // --- 14 · Vega-6 · the Long Room · exotic · band 250-1500 ---------------
    14: [
      {
        id: 'ld-14-1',
        systemId: 14,
        name: 'Piet Aumbry',
        seat: 1,
        archetype: 'random',
        bankroll: 4500,
        lines: {
          tableTalk: 'The Long Room is long because the arguments used to be longer.',
          win: 'Short argument. My favourite kind.',
          lose: "And now we'll be here all night.",
        },
      },
      {
        id: 'ld-14-2',
        systemId: 14,
        name: 'Serafine Doll',
        seat: 2,
        archetype: 'mixed',
        mix: EXOTIC_MIX,
        bankroll: 7500,
        lines: {
          tableTalk: 'Everything in the Long Room is for sale. The chairs included.',
          win: 'The chair stays. You go.',
          lose: 'Take the chair as well. I insist.',
        },
      },
      {
        id: 'ld-14-3',
        systemId: 14,
        name: 'Mr. Absolom',
        seat: 3,
        archetype: 'optimal',
        bankroll: 12000,
        lines: {
          tableTalk: 'I have sat at the far end of this room for thirty years.',
          win: 'And I shall sit here for thirty more.',
          lose: "Move down, then. You've earned the end of the table.",
        },
      },
    ],
  });
