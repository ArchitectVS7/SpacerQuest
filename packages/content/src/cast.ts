import { StatBlock } from './stats.js';
import { BondHook } from './disposition.js';
import { defineNpcProfiles, defineQuestProfiles } from './castValidation.js';

export type PowerTier = 1 | 2 | 3 | 4 | 5;

export type AnonymousInterceptorKind = 'PIRATE' | 'PATROL' | 'RIM_PIRATE' | 'BRIGAND' | 'REPTILOID';

export interface AnonymousInterceptorProfile {
  id: string;
  kind: AnonymousInterceptorKind;
  rosterIndex: number;
  name: string;
  shipName: string;
  shipClass: string;
  homeSystem: string;
  stats: StatBlock;
  tier: PowerTier;
}

export type NpcArchetype = 'trader' | 'fighter' | 'explorer' | 'smuggler' | 'gambler' | 'veteran';

/**
 * T-205 · What a named captain says entering, fighting, winning and losing an
 * encounter. Barks, not paragraphs — 1-3 lines per slot, and all four slots are
 * authored TOGETHER (`castValidation.ts` refuses a partial set, because a captain
 * who enters a fight silently and then quips on the win reads as a bug rather
 * than as unfinished content).
 *
 * Deliberately NOT on {@link AnonymousInterceptorProfile}: the 65 anonymous
 * pirates and patrols are noise with a name, and T-207's combat readout branches
 * on exactly that absence.
 */
export interface BattleCatchphrases {
  /** On the encounter opening. */
  readonly enter: readonly string[];
  /** Mid-fight, drawn occasionally rather than every round. */
  readonly duringBattle: readonly string[];
  /** The captain beat the player. */
  readonly win: readonly string[];
  /** The player beat the captain. */
  readonly loss: readonly string[];
}

export interface NpcProfile {
  id: string;
  name: string;
  shipName: string;
  stats: StatBlock;
  ideal: string;
  bond: string;
  flaw: string;
  /** Resist the flaw on d20 >= flawDc (disciplined = low, volatile = high). */
  flawDc: number;
  /** Power tier: 1 = mudlark, 5 = legend (PRD §6). */
  tier: PowerTier;
  /** N4 · The captain's playstyle. It does not REPLACE {@link ideal} — it biases
   *  it, through `ARCHETYPE_INTENT_MULTIPLIERS` in ideals.ts. See the curation
   *  note above {@link NPC_PROFILES} for how the 30 were assigned. */
  archetype: NpcArchetype;
  /** T-1204: the dusk Bond intervention this NPC performs when the player has
   *  earned their standing. Present only on the handful of profiles whose Bond
   *  implies a player-facing obligation; the beat (drive-off / fuel-gift) is the
   *  one their Bond fictionally supports. Engine reader: the bond hook in
   *  `day.ts` endDay. */
  bondHook?: BondHook;
  /**
   * T-205 · 2-4 lines drawn from when this captain DEALS a Liar's Dice hand as a
   * roaming seat. Mirrors `LiarsDiceOpponent.lines.tableTalk`
   * (`liarsDice.ts`) in purpose; PLURAL here because a named captain is met
   * repeatedly across a career, where a fixed roster seat is met once per port.
   *
   * MUST NOT NAME A DICE COUNT — the count moves with the unlock ladder
   * (`LIARS_DICE_UNLOCK_GAMES`), so "four dice apiece" is a lie at tier 2. That is
   * the same mechanical trap `liarsDiceValidation.ts` enforces on the roster, and
   * `castValidation.ts` enforces it here for the same reason.
   *
   * OPTIONAL, AND THAT IS A DECISION (T-205), not laxity — the same shape as
   * `bondHook` above. On the 30 `NPC_PROFILES` it is REQUIRED, unconditionally and
   * with no exceptions, since T-206 authored the last of them and deleted the
   * `VOICE_AUTHORING_PENDING` worklist that had carried the unauthored rows. On the 11
   * `QUEST_PROFILES`, which reuse this interface, it is ABSENT BY DESIGN and is
   * never given a placeholder or an empty array: a quest captain takes no
   * simulated turn ({@link isSimulatedCaptain}), is never dealt a roaming Liar's
   * Dice seat and is excluded from the named-interceptor pool by construction, so
   * there is no surface that could draw a line from them. Absent therefore MEANS
   * "this record has no voiced surface", where `[]` would be a stub that reads as
   * authored content and is not. If a later task (T-208 parks them at Cantinas)
   * earns a quest captain a voice, adding one is a deliberate, visible change: the
   * validator checks quest rows for well-formedness IF PRESENT and never for
   * presence, and a test pins the current state of all eleven.
   *
   * NOTHING READS THIS YET — T-207 is the reader. Shipping content one task ahead
   * of its reader is the `LIARS_DICE_UNLOCK_GAMES` precedent (`liarsDice.ts`).
   */
  tableTalk?: readonly string[];
  /**
   * T-205 · Combat barks. A captain the player has insulted can turn up as a NAMED
   * INTERCEPTOR through the grudge weighting in
   * `packages/engine/src/actions/travel.ts` (`chooseWeighted`), so a captain needs
   * something to say entering a fight, during it, on a win and on a loss.
   * Optional/absent on `QUEST_PROFILES` for the reason recorded on
   * {@link NpcProfile.tableTalk} above. Reader: T-207's combat readout.
   */
  catchphrases?: BattleCatchphrases;
  /**
   * T-208 · The CORE PORT this captain sits at for an entire career.
   *
   * OPTIONAL ON THE INTERFACE, REQUIRED ON EVERY `QUEST_PROFILES` ROW AND ABSENT
   * FROM EVERY `NPC_PROFILES` ROW — the exact INVERSE of {@link NpcProfile.tableTalk}'s
   * asymmetry, and for the same structural reason read the other way round. The 30
   * simulated captains are mortal and take a turn every dusk, so their position is
   * EARNED STATE that `resolveNpcDay` writes (`npc.ts` `executeTrade` /
   * `executeTravel` are the only two writers of `NpcState.currentSystemId` in the
   * repo). The 11 quest captains take no turn at all ({@link isSimulatedCaptain}
   * gates the dusk loop at `day.ts`), so their position is a FROZEN CONSTANT OF
   * CONTENT — which is precisely why it can be authored here, and why authoring it
   * on a simulated captain would be a lie the first time they jumped.
   *
   * MUST NAME A PORT WITH A CANTINA (`STAR_SYSTEMS[id].hasHangout === true`).
   * `castValidation.ts` enforces that at IMPORT, against `hasHangout` rather than
   * `id <= 14`, because the Cantina is the REASON the constraint exists: a quest
   * captain the player can never meet at a bar is a record parked where nothing can
   * reach it, which is exactly the state T-208 found (six of the eleven were frozen
   * at rim systems that have no bar at all).
   *
   * ENGINE READERS: `packages/engine/src/state.ts` — `createInitialState` (birth)
   * and `deserializeState` (the carried-save backfill), plus `save.ts`
   * `MIGRATIONS[16]`, which reads this same field rather than restating a table.
   */
  homePortSystemId?: number;
}

/**
 * N4 · THE ARCHETYPE ASSIGNMENT IS HAND-CURATED, and that is a ruling, not a
 * preference (docs/NPC_REDESIGN.md, N4 RULING 2: *"archetypes are hand-curated
 * from each captain's stats / ideal / bond, with a floor guaranteeing every
 * archetype has enough members for its branch to be live and measurable"*).
 *
 * WHY THE RULING EXISTS — the first attempt generated the field with a one-off
 * regex script whose first-match branch chain starved the last two archetypes,
 * leaving **0 veterans and 1 smuggler** across these 30. A branch with no
 * members is not a design decision, it is dead code that reads as one, and no
 * sweep can measure it. The floor is what makes each branch gradeable.
 *
 * THE DISTRIBUTION, pinned by `cast.test.ts` so it cannot quietly starve again:
 * trader 6 · fighter 6 · explorer 5 · veteran 5 · gambler 4 · smuggler 4 = 30.
 *
 * HOW A CAPTAIN WAS PLACED — read in this order, and the ORDER is not a
 * precedence chain (that is what went wrong the first time), it is what each
 * archetype means:
 *   · **trader**   — TRADE 4+ under a commerce Ideal (Wealth / Profit / Opulence
 *                    / Industry). The manifest board is the whole day.
 *   · **fighter**  — GUNS at or near the top of the line under a martial Ideal
 *                    (Dominance / Glory / Power / Excellence), TRADE 0–1.
 *   · **explorer** — PILOT top of the line with a Travel-heavy Ideal (Discovery /
 *                    Truth / Freedom / Mystery) and a bond pointed outward
 *                    ("loyal to the cosmos", "the open stars", "the next horizon").
 *   · **smuggler** — a bond outside the lawful factions (the rim, the shadows, a
 *                    faction they hate) plus the means to work it: TRADE to move
 *                    the cargo or PILOT to outrun what objects.
 *   · **gambler**  — GUILE 4+, or a volatile flaw (Reckless / Impulsive /
 *                    Arrogant / Treacherous) on a line with no dominant stat.
 *   · **veteran**  — a career rather than a specialism: tier 3+, no stat above 4,
 *                    at least three stats filled, and a disciplined flawDc. These
 *                    are the captains who play the whole loop.
 * Where a captain's assignment is not obvious from their line, the reason is
 * written at their own entry below rather than left to be re-derived.
 *
 * Three assignments are FIXED by the owner's ruling, which worked their
 * arithmetic out by hand: **Iron Vex fighter**, **Cargo King trader**, **Zero
 * Risk trader**. Changing one of those three silently invalidates a recorded
 * worked example; change the ruling first.
 */
export const NPC_PROFILES: NpcProfile[] = defineNpcProfiles([
  // The Original 20 (minus 8 extracted) = 12
  {
    id: 'npc-iron-vex',
    name: 'Iron Vex',
    shipName: 'Hammerfall',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 3, GUILE: 0 },
    ideal: 'Dominance',
    bond: 'Loyal to the Warlord Confed',
    flaw: 'Bloodthirsty',
    flawDc: 14,
    tier: 3,
    archetype: 'fighter',
    /** T-205 WORKED EXAMPLE 1 of 3 — the FIGHTER voice, read off this captain's own
     *  line: Dominance, sworn to the Warlord Confed, Bloodthirsty at flawDc 14.
     *  Note the loss slot especially: a bloodthirsty fighter loses ANGRY, which is
     *  what makes it un-swappable with Cargo King's below. */
    tableTalk: [
      'I play the way I fight. Straight up the middle.',
      'The Confed taught me to bid loud and mean it.',
      'Sit. I would rather take your money than your hull.',
    ],
    catchphrases: {
      enter: [
        'Hammerfall, closing. Do not make this quick.',
        'Good. I was getting bored out here.',
      ],
      duringBattle: ['Hold still. You are ruining my aim.', 'That one was for the Confed.'],
      win: ['Strip the guns. Leave the rest for the rocks.'],
      loss: ['Not finished. Just out of hull.'],
    },
  },
  {
    id: 'npc-cargo-king',
    name: 'Cargo King',
    shipName: 'Fat Profit',
    stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 2 },
    ideal: 'Wealth',
    bond: 'Loyal to the Astro League',
    flaw: 'Cowardly',
    flawDc: 13,
    tier: 3,
    archetype: 'trader',
    /** T-205 WORKED EXAMPLE 2 of 3 — the TRADER voice: Wealth, an Astro League
     *  contract man, GUNS 0 and Cowardly. Everything he says is a price, and the
     *  fight slots are a negotiation he is losing. */
    tableTalk: [
      'Everything in this hall has a price, including the seat you are in.',
      'I bid what the manifest says. The manifest has never lied to me.',
      'League rates, League rules. I do not haggle after the deal is struck.',
    ],
    catchphrases: {
      enter: [
        'Whatever this is about, I can pay you more than the salvage is worth.',
        'Careful. The Fat Profit is insured. I am not.',
      ],
      duringBattle: [
        'Take the cargo! Take all of it!',
        "This is coming out of somebody's margin, and it will not be mine.",
      ],
      win: ['I will invoice the League for the paintwork.'],
      loss: ['Fine. Fine! Take the hold. Just leave me the ship.'],
    },
  },
  {
    id: 'npc-admiral-stern',
    name: 'Admiral Stern',
    shipName: 'Iron Curtain',
    stats: { PILOT: 3, GUNS: 3, TRADE: 2, GRIT: 4, GUILE: 0 },
    ideal: 'Order',
    bond: 'Protects the Astro League',
    flaw: 'Overcautious',
    flawDc: 10,
    tier: 5,
    /** N4 · tier 5, no stat above 4 and four of five filled, flawDc 10 (the most disciplined
     *  captain on the roster): the broad, seasoned game the archetype names */
    archetype: 'veteran',
    bondHook: { beat: 'drive-off', activateAt: 3, dc: 12 },
    /** T-206 · VETERAN, Order, sworn to the Astro League, Overcautious at flawDc 10 — the
     *  most disciplined line on the roster. He speaks in doctrine and procedure, and a
     *  loss is a fault in the procedure rather than a run of bad luck. */
    tableTalk: [
      'A hand is a formation. Hold the line and the line holds you.',
      'I raise when the numbers permit it. Not one moment before.',
      'Sit up. This table keeps standards, even out here.',
    ],
    catchphrases: {
      enter: [
        'Iron Curtain on station. Identify yourself and stand down.',
        'This lane is League-protected. You are trespassing in it.',
      ],
      duringBattle: [
        'Steady. Doctrine wins engagements. Temper loses them.',
        'Correcting. Hold fire until I call it.',
      ],
      win: ['Logged, filed, closed. Move along.'],
      loss: ['A procedural failure. Mine. It will be reviewed.'],
    },
  },
  {
    id: 'npc-nova-blitz',
    name: 'Nova Blitz',
    shipName: 'Supernova',
    stats: { PILOT: 4, GUNS: 3, TRADE: 0, GRIT: 2, GUILE: 1 },
    ideal: 'Glory',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Reckless',
    flawDc: 15,
    tier: 3,
    archetype: 'fighter',
    /** T-206 · FIGHTER, Glory, Rebel Alliance, Reckless at flawDc 15 — the young one, still
     *  CHASING a name. Compare Crimson Hawk below, who already has one and defends it:
     *  same ideal, same faction, same flaw, opposite position in a career. */
    tableTalk: [
      'I never fold. Folding is how nobody learns your name.',
      'Push it. Bored captains lose more than broke ones.',
      'Someday they sing about this hand. Make it worth singing.',
    ],
    catchphrases: {
      enter: ['Supernova, burning in! Try to keep up.', 'Finally. Somebody worth the fuel.'],
      duringBattle: ['Faster! Always faster!', 'Did you see that? Tell me you saw that.'],
      win: ['Write the name down. Nova Blitz. Spell it right.'],
      loss: ['Again. Right now, again!'],
    },
  },
  {
    id: 'npc-black-tide',
    name: 'Black Tide',
    shipName: 'Undertow',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 2 },
    ideal: 'Power',
    bond: 'Rules the Space Dragons',
    flaw: 'Cruel',
    flawDc: 12,
    tier: 5,
    /** N4 · tier 5 and rules a faction — a career, not a specialism; GUNS 4 + GRIT 4 + GUILE 2
     *  fights, endures and negotiates, which is the veteran stance exactly */
    archetype: 'veteran',
    /** T-206 · VETERAN, Power, RULES the Space Dragons, Cruel at flawDc 12. Quiet, unhurried,
     *  and more interested in the other captain's discomfort than in the pot. */
    tableTalk: [
      'Sit. I enjoy watching a captain work out what they can afford to lose.',
      'The Dragons do not bluff. We wait, and you spend.',
      'Keep talking. It tells me more than your bid ever will.',
    ],
    catchphrases: {
      enter: ['Undertow. You never feel it pulling until it is far too late.'],
      duringBattle: [
        'Slower. I want to watch this part.',
        'Shout if it helps. Nobody out here is listening.',
      ],
      win: ['Leave them adrift. Adrift teaches better than dead.'],
      loss: ['Enjoy it. I remember every face I am shown.'],
    },
  },
  {
    id: 'npc-frost-helm',
    name: 'Frost Helm',
    shipName: 'Glacier',
    stats: { PILOT: 3, GUNS: 2, TRADE: 3, GRIT: 3, GUILE: 0 },
    ideal: 'Logic',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Rigid',
    flawDc: 10,
    tier: 3,
    /** N4 · the flattest stat line in the cast (3/2/3/3/0) under a Logic ideal and flawDc 10 —
     *  a methodical all-rounder, not a specialist trader */
    archetype: 'veteran',
    /** T-206 · VETERAN, Logic, Rebel Alliance, Rigid at flawDc 10. Probability and procedure
     *  end to end; nothing he says carries a temperature, including the loss. */
    tableTalk: [
      'Every bid is a probability wearing a costume.',
      'I do not read faces. A face is noise with eyebrows.',
      'The correct play is rarely the entertaining one. I make it regardless.',
    ],
    catchphrases: {
      enter: ['Glacier, engaging. Your approach vector was predictable.'],
      duringBattle: [
        'Your pattern repeats on the third pass. Adjusting.',
        'Emotion is a targeting error.',
      ],
      win: ['Outcome consistent with the estimate.'],
      loss: ['My variance estimate was wrong. Noted and corrected.'],
    },
  },
  {
    id: 'npc-atlas-prime',
    name: 'Atlas Prime',
    shipName: 'Titan Haul',
    stats: { PILOT: 1, GUNS: 2, TRADE: 4, GRIT: 3, GUILE: 0 },
    ideal: 'Industry',
    bond: 'Loyal to the Warlord Confed',
    flaw: 'Slothful',
    flawDc: 12,
    tier: 3,
    archetype: 'trader',
    /** T-206 · TRADER, Industry, Warlord Confed, Slothful at flawDc 12. Everything is tonnage
     *  and schedule, and he would rather be doing none of it. */
    tableTalk: [
      'Deal slowly. I am in no hurry and neither is my freight.',
      'A full hold pays whether I am awake for it or not.',
      'The Confed likes tonnage. I like naps.',
    ],
    catchphrases: {
      enter: ['Titan Haul, laden and slow. Must we really do this?'],
      duringBattle: [
        "This is a great deal of effort for somebody else's tonnage.",
        'Wake me when the shooting part is over.',
      ],
      win: ['Salvage it later. It is not going anywhere.'],
      loss: ['Take the hold. Just do not make me file the report.'],
    },
  },
  {
    id: 'npc-crimson-ace',
    name: 'Crimson Ace',
    shipName: 'Red Baron',
    stats: { PILOT: 5, GUNS: 4, TRADE: 0, GRIT: 2, GUILE: 1 },
    ideal: 'Excellence',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Prideful',
    flawDc: 13,
    tier: 4,
    archetype: 'fighter',
    /** T-206 · FIGHTER, Excellence, Rebel Alliance, Prideful at flawDc 13. Duelist's courtesy
     *  stretched over a superiority complex — he compliments you as an inferior, and a
     *  loss is an error to be corrected rather than a defeat. */
    tableTalk: [
      'You play well. For someone at your level.',
      'Excellence is a habit. I practise it even in here.',
      'I will tell you when you make a good bid. It should be quiet tonight.',
    ],
    catchphrases: {
      enter: [
        'Red Baron. I am told you fly. Show me.',
        'A duel, then. Do try to make it memorable.',
      ],
      duringBattle: [
        'Better. Still not good.',
        'You fly to survive. That is precisely why you will not.',
      ],
      win: ['A clean pass. Salute them — they earned the ending.'],
      loss: ['An error. Mine. It will not survive to a second meeting.'],
    },
  },
  {
    id: 'npc-zero-risk',
    name: 'Zero Risk',
    shipName: 'Safe Haven',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 1, GUILE: 2 },
    ideal: 'Survival',
    bond: 'Loyal to the Astro League',
    flaw: 'Cowardly',
    flawDc: 15,
    tier: 2,
    archetype: 'trader',
    /** T-206 · TRADER, Survival, Astro League, Cowardly at flawDc 15. Hedged everything; talks
     *  in insurance and exits, and opens a fight by negotiating his withdrawal from it. */
    tableTalk: [
      'I hedge. It is not glamorous, but I am still here.',
      'Small bets, long life. Ask the loud ones how they are getting on.',
      'Before we start — where are the exits?',
    ],
    catchphrases: {
      enter: ['Safe Haven here. Fully insured, and entirely willing to leave.'],
      duringBattle: [
        'Withdrawing! Note for the record that I withdrew politely.',
        'Can we talk about this? I have League forms that say we can.',
      ],
      win: ['I survived. That was the entire plan.'],
      loss: ['Take it. Take all of it, and let me go.'],
    },
  },
  {
    id: 'npc-neon-fox',
    name: 'Neon Fox',
    shipName: 'Trickster',
    stats: { PILOT: 3, GUNS: 1, TRADE: 3, GRIT: 1, GUILE: 5 },
    ideal: 'Advantage',
    bond: 'Loyal to no one',
    flaw: 'Treacherous',
    flawDc: 14,
    tier: 4,
    archetype: 'gambler',
    /** T-206 · GAMBLER, Advantage, loyal to NO ONE, Treacherous at flawDc 14 on GUILE 5. Every
     *  friendly line has a hook in it, and betrayal is framed as sound commerce. */
    tableTalk: [
      'Friends at the table, strangers at the payout. Everyone gets something.',
      'I would never cheat you. I would simply be better informed.',
      'Trust me exactly as far as this stays profitable for both of us.',
    ],
    catchphrases: {
      enter: ['Trickster, and no hard feelings. This is only business.'],
      duringBattle: [
        'I sold your route to three people. One of them paid extra.',
        'Do not take it badly. You were merely the smaller offer.',
      ],
      win: ['Pleasure doing business. Do not look me up.'],
      loss: ['Ah. Then I back you. I have always backed you.'],
    },
  },
  {
    id: 'npc-warp-hound',
    name: 'Warp Hound',
    shipName: 'Lightchaser',
    stats: { PILOT: 5, GUNS: 0, TRADE: 1, GRIT: 3, GUILE: 1 },
    ideal: 'Discovery',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Wanderlust',
    flawDc: 14,
    tier: 3,
    archetype: 'explorer',
    /** T-206 · EXPLORER, Discovery, Rebel Alliance, Wanderlust at flawDc 14 on GUNS 0 — he
     *  fights only in order to leave, and is already thinking about the next jump. */
    tableTalk: [
      'One hand, then I am gone. There is a system out there nobody has named.',
      'I play fast. Sitting still gives me a rash.',
      'Bid, call, whatever you like. My engines are already warm.',
    ],
    catchphrases: {
      enter: ['Lightchaser. I carry no guns and no interest. Let me past.'],
      duringBattle: [
        'I am not fighting you, I am leaving you.',
        'Plotting out. Enjoy the empty sky.',
      ],
      win: ['You chased. That was the mistake.'],
      loss: ['Fine, strip it. Somewhere out there is a sky I have not seen.'],
    },
  },
  {
    id: 'npc-gold-rush',
    name: 'Gold Rush',
    shipName: 'Vault Breaker',
    stats: { PILOT: 1, GUNS: 2, TRADE: 5, GRIT: 2, GUILE: 2 },
    ideal: 'Opulence',
    bond: 'Loyal to the Warlord Confed',
    flaw: 'Greedy',
    flawDc: 15,
    tier: 4,
    archetype: 'trader',
    /** T-206 · TRADER, Opulence, Warlord Confed, Greedy at flawDc 15 — greed as APPETITE. Dust
     *  Devil below is greedy too, out of thinness; this one wants the whole pot and says so. */
    tableTalk: [
      'I want the pot. All of it. Do not make this awkward.',
      'Half a fortune is just a fortune somebody gave up on.',
      'Bet it all. Then bet the thing you were saving.',
    ],
    catchphrases: {
      enter: ['Vault Breaker. Open your holds and we can skip the shouting.'],
      duringBattle: [
        'More. There is always more in there.',
        'I can hear the clamps. Do not lie to me.',
      ],
      win: ['Everything. I did say everything.'],
      loss: ['You took my share. I take that personally.'],
    },
  },
  // The 10 New Cast Members (minus 3 extracted) = 7
  {
    id: 'npc-star-gazer',
    name: 'Star Gazer',
    shipName: 'Observatory',
    stats: { PILOT: 4, GUNS: 0, TRADE: 1, GRIT: 2, GUILE: 1 },
    ideal: 'Truth',
    bond: 'Loyal to the cosmos',
    flaw: 'Distracted',
    flawDc: 15,
    tier: 1,
    archetype: 'explorer',
    /** T-206 · EXPLORER, Truth, loyal to the cosmos, Distracted at flawDc 15 — tier 1, GUNS 0.
     *  The sky is more interesting than the table or the fight, and she loses the thread
     *  mid-line. Star Chaser below is distracted too, but FORWARD — impatient, not dreamy. */
    tableTalk: [
      'Sorry, did you bid? There is a variable star doing something remarkable.',
      'Truth lives in the spectrum. In here it is mostly lying.',
      'I lose a great deal. I am not really present.',
    ],
    catchphrases: {
      enter: ['Observatory. Please do not shoot, my instruments are irreplaceable.'],
      duringBattle: ['You are occluding my view!', 'Hold on, I have to save this reading.'],
      win: ['Oh. Did I do that? I was somewhere else entirely.'],
      loss: ['That is quite all right. The sky was better anyway.'],
    },
  },
  {
    id: 'npc-the-warden',
    name: 'The Warden',
    shipName: 'Lockdown',
    stats: { PILOT: 3, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 0 },
    ideal: 'Justice',
    bond: 'Hunts for the Astro League',
    flaw: 'Relentless',
    flawDc: 13,
    tier: 4,
    /** N4 · a tier-4 bounty hunter who hunts FOR an institution: the roster's natural
     *  deed-chaser, which is what the sim's veteran policy is. Justice vetoes Trade outright,
     *  so the blend leaves them on Combat and Patrol without an archetype needing to say so */
    archetype: 'veteran',
    /** T-206 · VETERAN, Justice, HUNTS for the Astro League, Relentless at flawDc 13. Procedural
     *  bounty work: he reads charges rather than banter, and a loss only resets a pursuit. */
    tableTalk: [
      'I am not here to socialise. I am here because you are.',
      'Bid. I have read your file, so very little you do will surprise me.',
      'Justice is patient. So is the seat I am in.',
    ],
    catchphrases: {
      enter: [
        'Lockdown. Cut your engines and present your registry.',
        'You carry outstanding charges. I am the collection.',
      ],
      duringBattle: ['Resisting adds a count to the list.', 'Nobody has ever outrun a warrant.'],
      win: ['Cuffed and logged. The League will see you shortly.'],
      loss: ['The pursuit resumes tomorrow. It always does.'],
    },
  },
  {
    id: 'npc-nebula-rose',
    name: 'Nebula Rose',
    shipName: 'Stardust',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 1, GUILE: 4 },
    ideal: 'Beauty',
    bond: 'Loves high society',
    flaw: 'Vain',
    flawDc: 12,
    tier: 3,
    /** N4 · TRADE 4 beside GUILE 4, a Beauty ideal weighted on Socialize, and a bond that
     *  literally reads "loves high society" — the Hangout is her venue, not the manifest board */
    archetype: 'gambler',
    /** T-206 · GAMBLER, Beauty, loves high society, Vain at flawDc 12. Salon manners at the
     *  table: she cares how the hand LOOKED, and losing badly offends her more than losing. */
    tableTalk: [
      'Darling, a bid ought to have some elegance. Yours has none.',
      'I play for the story. The credits are a lovely accessory.',
      'Do sit where the light is kinder. Consider it a gift.',
    ],
    catchphrases: {
      enter: ['Stardust — and really, must we? I have only just had the hull redone.'],
      duringBattle: [
        'You have scratched the paint. That is unforgivable.',
        'Do try to lose gracefully, at least.',
      ],
      win: ['Beautifully done, if I say so. And I do.'],
      loss: ['Ugly. Not the losing — the manner of it.'],
    },
  },
  {
    id: 'npc-the-phantom',
    name: 'The Phantom',
    shipName: 'Ectoplasm',
    stats: { PILOT: 5, GUNS: 2, TRADE: 0, GRIT: 3, GUILE: 4 },
    ideal: 'Mystery',
    bond: 'Loyal to the unknown',
    flaw: 'Enigmatic',
    flawDc: 10,
    tier: 5,
    /** N4 · tier 5, PILOT 5, TRADE 0, and a Mystery ideal already weighted Travel 5 — nothing
     *  about this captain trades, and "loyal to the unknown" is the explorer's remit */
    archetype: 'explorer',
    /** T-206 · EXPLORER, Mystery, loyal to the unknown, Enigmatic at flawDc 10 — the FEWEST
     *  words on the roster, answering nothing directly. Neon Shade shares the Mystery ideal
     *  and is the opposite temperament: nervy and watching the door, where this is serene. */
    tableTalk: [
      'You may call. You will not know.',
      'Ask the hall about me. The hall will invent something.',
      'I was not here. Neither, I think, were you.',
    ],
    catchphrases: {
      enter: ['You saw nothing.'],
      duringBattle: ['Still nothing.'],
      win: ['As expected. By me.'],
      loss: ['Ah. So you were real after all.'],
    },
  },
  {
    id: 'npc-crash-override',
    name: 'Crash Override',
    shipName: 'Syntax Error',
    stats: { PILOT: 3, GUNS: 1, TRADE: 2, GRIT: 1, GUILE: 5 },
    ideal: 'Control',
    bond: 'Loyal to the datastream',
    flaw: 'Arrogant',
    flawDc: 13,
    tier: 3,
    archetype: 'gambler',
    /** T-206 · GAMBLER, Control, loyal to the datastream, Arrogant at flawDc 13. The arrogance
     *  is TECHNICAL — machine metaphor throughout — where Solar Flare's is pure swagger. */
    tableTalk: [
      'Your tell compiles cleanly. Mine does not exist.',
      'I have already run this hand. You lose in most branches.',
      'Control is knowing the output before the input has finished.',
    ],
    catchphrases: {
      enter: ['Syntax Error. Your fire control is running a patch I wrote.'],
      duringBattle: [
        'Rerouting. You are three cycles behind me.',
        'That was not luck. That was a subroutine.',
      ],
      win: ['Process terminated. Rather cleanly, I thought.'],
      loss: ['An exception. Unhandled. I will patch it.'],
    },
  },
  {
    id: 'npc-the-chef',
    name: 'The Chef',
    shipName: 'Bistro',
    stats: { PILOT: 2, GUNS: 1, TRADE: 4, GRIT: 3, GUILE: 2 },
    ideal: 'Flavor',
    bond: 'Feeds the rim',
    flaw: 'Perfectionist',
    flawDc: 12,
    tier: 2,
    /** N4 · TRADE 4 with a bond that reads "feeds the rim" — the rim run IS the smuggler's
     *  mechanical signature (`executeTrade`'s rim preference), and this is the captain it was
     *  authored for */
    archetype: 'smuggler',
    /** T-206 · SMUGGLER, Flavor, feeds the rim, Perfectionist at flawDc 12. Kitchen vocabulary
     *  end to end: a fight is a badly-run service and a loss is a dish sent back. */
    tableTalk: [
      'Sit, eat, then bid. In that order or not at all.',
      'A hand is a sauce. Rush it and everyone tastes the panic.',
      'The rim eats what I carry. That is worth more than any pot.',
    ],
    catchphrases: {
      enter: ['Bistro, inbound. My service is running and you are late for it.'],
      duringBattle: ['You are burning my galley!', 'Out of my kitchen.'],
      win: ['Plated. Send it back and I will do worse.'],
      loss: ['Sent back, then. I will remake it better.'],
    },
  },
  {
    id: 'npc-junk-lord',
    name: 'Junk Lord',
    shipName: 'Scrap Iron',
    stats: { PILOT: 1, GUNS: 3, TRADE: 3, GRIT: 4, GUILE: 1 },
    ideal: 'Possession',
    bond: 'Ruler of the scrap yards',
    flaw: 'Possessive',
    flawDc: 13,
    tier: 3,
    /** N4 · GUNS 3, TRADE 3, GRIT 4 under a Possession ideal — a scrapyard baron who fights,
     *  hauls and holds ground rather than doing one of the three */
    archetype: 'veteran',
    /** T-206 · VETERAN, Possession, ruler of the scrap yards, Possessive at flawDc 13. Everything
     *  in view is already his, including the player's hull; he values wrecks over credits. */
    tableTalk: [
      'That pot is mine. It has been mine since you sat down.',
      'I do not collect credits. I collect things.',
      'Everything ends up in my yard. You will, eventually.',
    ],
    catchphrases: {
      enter: ['Scrap Iron. That hull of yours has a shelf waiting for it.'],
      duringBattle: ['Careful with the plating! I want that intact!', 'Mine. All of it, mine.'],
      win: ['Tow it in whole. I hate cutting.'],
      loss: ['You have taken something of mine. I never forget inventory.'],
    },
  },
  // 11 Newly Generated Simulation Characters
  {
    id: 'npc-iron-clad',
    name: 'Iron Clad',
    shipName: 'Dreadnought',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 0 },
    ideal: 'Dominance',
    bond: 'Loyal to the Warlord Confed',
    flaw: 'Stubborn',
    flawDc: 14,
    tier: 4,
    archetype: 'fighter',
    /** T-206 · FIGHTER, Dominance, Warlord Confed, Stubborn at flawDc 14 — and the DELIBERATE
     *  contrast with Iron Vex above, who shares the ideal, the faction and the archetype.
     *  Vex is eager and bloodthirsty and comes at you; this captain does not chase anything.
     *  He occupies ground and absorbs, and his loss slot concedes the hull but not the spot. */
    tableTalk: [
      'I do not chase a pot. I sit on it until everyone else tires.',
      'Raise if you like. It changes nothing about where I am sitting.',
      'The Confed pays me to hold ground. The habit carries over.',
    ],
    catchphrases: {
      enter: ['Dreadnought. I am in your way, and I intend to stay there.'],
      duringBattle: [
        'Keep hitting. I have all afternoon.',
        'Is that the whole of it? Then we are nearly done.',
      ],
      win: ['You moved first. That was your mistake.'],
      loss: ['Hull gone. Position unchanged.'],
    },
  },
  {
    id: 'npc-stellar-drift',
    name: 'Stellar Drift',
    shipName: 'Wanderer',
    stats: { PILOT: 4, GUNS: 0, TRADE: 3, GRIT: 1, GUILE: 2 },
    ideal: 'Freedom',
    bond: 'Loyal to the open stars',
    flaw: 'Flighty',
    flawDc: 12,
    tier: 2,
    archetype: 'explorer',
    /** T-206 · EXPLORER, Freedom, loyal to the open stars, Flighty at flawDc 12. Non-committal,
     *  drifts off the topic, and stays in neither a hand nor a fight past the mood. */
    tableTalk: [
      'I might play. I might wander off mid-hand. Both have happened.',
      'Nothing owns me. Not a route, not a flag, not this chair.',
      'What were we betting on again?',
    ],
    catchphrases: {
      enter: ['Wanderer. I had no plan to be here and no plan to stay.'],
      duringBattle: [
        'Losing interest. Losing altitude, come to that.',
        'This was fun for about a minute.',
      ],
      win: ['Right. Off I go.'],
      loss: ['Easy come. The stars are still free.'],
    },
  },
  {
    id: 'npc-void-runner',
    name: 'Void Runner',
    shipName: 'Slipstream',
    stats: { PILOT: 5, GUNS: 1, TRADE: 1, GRIT: 2, GUILE: 1 },
    ideal: 'Thrill',
    bond: 'Hunts the fastest routes',
    flaw: 'Impulsive',
    flawDc: 15,
    tier: 3,
    /** N4 · PILOT 5 and "hunts the fastest routes" on a Thrill ideal: the blockade runner.
     *  TRADE 1 means thin margins, which is the point — the archetype is not a promise of
     *  profit */
    archetype: 'smuggler',
    /** T-206 · SMUGGLER, Thrill, hunts the fastest routes, Impulsive at flawDc 15 on PILOT 5.
     *  Speed is the identity; deliberation bores him and he bids before he has thought. */
    tableTalk: [
      'Bid already. I can hear my engines cooling.',
      'I do not think about it. Thinking is how captains get caught.',
      'Quick hands. Slow tables are what kill me.',
    ],
    catchphrases: {
      enter: ['Slipstream, wide open. Blink and you miss the entire thing.'],
      duringBattle: [
        'Too slow. Everything you do is too slow.',
        'Threading the rocks. Follow if you dare.',
      ],
      win: ['Gone before your sensors caught up.'],
      loss: ['Should have run sooner. I never do.'],
    },
  },
  {
    id: 'npc-crimson-hawk',
    name: 'Crimson Hawk',
    shipName: 'Bloodwing',
    stats: { PILOT: 3, GUNS: 4, TRADE: 0, GRIT: 3, GUILE: 0 },
    ideal: 'Glory',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Reckless',
    flawDc: 13,
    tier: 4,
    archetype: 'fighter',
    /** T-206 · FIGHTER, Glory, Rebel Alliance, Reckless at flawDc 13 — the OTHER half of the
     *  Nova Blitz pair above. Blitz is chasing a name; this captain already has one and
     *  every line is spent maintaining the legend rather than earning it. */
    tableTalk: [
      'You know who I am. Bid accordingly.',
      'I have a reputation to feed. It eats every hand I play.',
      'They tell the Bloodwing story wrong. I let them.',
    ],
    catchphrases: {
      enter: ['Bloodwing. You have heard the stories. Most of them are true.'],
      duringBattle: [
        'This is the part they tell in the halls.',
        'You are fighting a legend. Act like it.',
      ],
      win: ['One more for the song. They know the words by now.'],
      loss: ['Say it was close. They will believe you.'],
    },
  },
  {
    id: 'npc-neon-shade',
    name: 'Neon Shade',
    shipName: 'Nightfall',
    stats: { PILOT: 2, GUNS: 2, TRADE: 2, GRIT: 1, GUILE: 3 },
    ideal: 'Mystery',
    bond: 'Loyal to the shadows',
    flaw: 'Paranoid',
    flawDc: 14,
    tier: 2,
    archetype: 'smuggler',
    /** T-206 · SMUGGLER, Mystery, loyal to the shadows, Paranoid at flawDc 14. Shares the Mystery
     *  ideal with The Phantom and lands nowhere near it: Shade suspects the deal, the deck
     *  and the room, and watches the exits while the Phantom simply is not there. */
    tableTalk: [
      'Who told you I would be here? No, seriously. Who.',
      'I sit facing the door. Always the door.',
      'Somebody at this table works for somebody. It is not me.',
    ],
    catchphrases: {
      enter: ['Nightfall. I saw you three jumps back. You are not subtle.'],
      duringBattle: ['I knew it. I knew this was a setup.', 'Who paid you? Somebody paid you.'],
      win: ['Now I have to change ports again.'],
      loss: ['This was arranged. I will find out by whom.'],
    },
  },
  {
    id: 'npc-dust-devil',
    name: 'Dust Devil',
    shipName: 'Sandstorm',
    stats: { PILOT: 3, GUNS: 1, TRADE: 4, GRIT: 2, GUILE: 0 },
    ideal: 'Profit',
    bond: 'Loyal to the frontier',
    flaw: 'Greedy',
    flawDc: 12,
    tier: 2,
    /** N4 · frontier-loyal, but GUILE 0 — a captain who cannot keep a secret is not a smuggler,
     *  whatever their bond says */
    archetype: 'trader',
    /** T-206 · TRADER, Profit, loyal to the frontier, Greedy at flawDc 12 — frontier greed, the
     *  hardscrabble kind. Gold Rush above wants the whole pot; this captain is scraping. */
    tableTalk: [
      'Out here you take the small pots. There are no big ones.',
      'I have eaten grit for a living. I am not leaving your credits behind.',
      'Ante up. Every scrap counts when the frontier is your only market.',
    ],
    catchphrases: {
      enter: ['Sandstorm. I need what is in your hold rather more than you do.'],
      duringBattle: [
        'Every round you fire is a round you paid for.',
        'Drop something and we can both go home.',
      ],
      win: ['Thin pickings. I will take them anyway.'],
      loss: ['Cleaned out again. Frontier luck.'],
    },
  },
  {
    id: 'npc-star-chaser',
    name: 'Star Chaser',
    shipName: 'Comet',
    stats: { PILOT: 4, GUNS: 1, TRADE: 3, GRIT: 1, GUILE: 1 },
    ideal: 'Discovery',
    bond: 'Loyal to the next horizon',
    flaw: 'Distracted',
    flawDc: 11,
    tier: 3,
    archetype: 'explorer',
    /** T-206 · EXPLORER, Discovery, loyal to the next horizon, Distracted at flawDc 11. Shares
     *  Discovery with Warp Hound and the flaw with Star Gazer, and is neither: not restless
     *  for its own sake, not dreamy — impatient, leaning at the NEXT thing. */
    tableTalk: [
      'Quick hand, then I am away. There is a horizon with my name on it.',
      'I never finish a drink in the port I bought it in.',
      'Deal. Sorry. Deal faster.',
    ],
    catchphrases: {
      enter: ['Comet, passing through. Whatever this is, be quick about it.'],
      duringBattle: [
        'You are costing me a departure window.',
        'Not now! I am half a day from somewhere new!',
      ],
      win: ['Good. Now let me go and see it.'],
      loss: ['Whatever. There is a better system past this one.'],
    },
  },
  {
    id: 'npc-rogue-star',
    name: 'Rogue Star',
    shipName: 'Rebellion',
    stats: { PILOT: 3, GUNS: 3, TRADE: 1, GRIT: 2, GUILE: 1 },
    ideal: 'Chaos',
    bond: 'Hates the Astro League',
    flaw: 'Defiant',
    flawDc: 14,
    tier: 3,
    /** N4 · a Chaos ideal, a Defiant flaw and a bond that HATES the Astro League: runs cargo
     *  past the patrols of the faction they hate. GUNS 3 keeps them dangerous when the run goes
     *  wrong */
    archetype: 'smuggler',
    /** T-206 · SMUGGLER, Chaos, HATES the Astro League, Defiant at flawDc 14. The grudge flavours
     *  everything, and a loss is converted into a principle on the way out. */
    tableTalk: [
      'Every credit I take off a League man tastes better than the rest.',
      "Rules are only somebody else's bid.",
      'I do not play to win. I play to make the table nervous.',
    ],
    catchphrases: {
      enter: ['Rebellion. Fly the wrong flag near me and find out what that costs.'],
      duringBattle: [
        'That one is for every checkpoint I have sat through.',
        'Burn the paperwork. Burn all of it.',
      ],
      win: ['One fewer badge in the lane.'],
      loss: ['Take the ship. You will not make me sign anything.'],
    },
  },
  {
    id: 'npc-plasma-burn',
    name: 'Plasma Burn',
    shipName: 'Scorcher',
    stats: { PILOT: 2, GUNS: 4, TRADE: 0, GRIT: 3, GUILE: 1 },
    ideal: 'Power',
    bond: 'Loyal to chaos',
    flaw: 'Destructive',
    flawDc: 16,
    tier: 3,
    archetype: 'fighter',
    /** T-206 · FIGHTER, Power, loyal to CHAOS, Destructive at flawDc 16 — the highest flawDc on
     *  the roster, i.e. barely governed. He enjoys the damage itself and is indifferent to
     *  whether he wins, which is what separates him from the other Power captains. */
    tableTalk: [
      'I like the moment it all goes wrong. Best part of any hand.',
      'Win, lose, whichever. Did you see how big that pile got?',
      'Shove it all in. Watch what it does to their faces.',
    ],
    catchphrases: {
      enter: ['Scorcher. I am not here to board you. I am here to watch you come apart.'],
      duringBattle: ['Look at it come apart!', 'More heat. Give me more heat.'],
      win: ['Leave nothing that floats.'],
      loss: ['Ha! Did you see the size of that? Worth every bit.'],
    },
  },
  {
    id: 'npc-comet-tail',
    name: 'Comet Tail',
    shipName: 'Icebreaker',
    stats: { PILOT: 3, GUNS: 1, TRADE: 4, GRIT: 2, GUILE: 0 },
    ideal: 'Wealth',
    bond: 'Loyal to the trade routes',
    flaw: 'Miserly',
    flawDc: 12,
    tier: 2,
    archetype: 'trader',
    /** T-206 · TRADER, Wealth, loyal to the trade routes, Miserly at flawDc 12. Shares the Wealth
     *  ideal with Cargo King and spends it in the opposite direction: the King buys his way
     *  out of trouble, where this captain counts the ante and resents it. */
    tableTalk: [
      'The ante is already too high. It is always too high.',
      'I have never spent a credit I could not see again.',
      'You bought a round? Then you are behind before we start.',
    ],
    catchphrases: {
      enter: ['Icebreaker. Whatever this costs me, I will be counting it afterwards.'],
      duringBattle: [
        'Do you know what a hull plate costs? Do you?',
        'Stop shooting. Every shot is money.',
      ],
      win: ['I keep the salvage. And the fuel. And the crates.'],
      loss: ['My credits. Mine. I counted them twice this morning.'],
    },
  },
  {
    id: 'npc-solar-flare',
    name: 'Solar Flare',
    shipName: 'Sunspot',
    stats: { PILOT: 4, GUNS: 3, TRADE: 0, GRIT: 2, GUILE: 1 },
    ideal: 'Power',
    bond: 'Loyal to the Rebel Alliance',
    flaw: 'Arrogant',
    flawDc: 13,
    tier: 3,
    /** N4 · the roster's third Glory/Power hotshot with a PILOT 4 / GUNS 3 line; Arrogant, and
     *  the one of the three whose day is a bet rather than a discipline. Keeping all three as
     *  fighters made near-duplicate captains */
    archetype: 'gambler',
    /** T-205 WORKED EXAMPLE 3 of 3 — the GAMBLER voice: Power, Rebel Alliance,
     *  Arrogant at flawDc 13. Where Iron Vex threatens and Cargo King bargains,
     *  this captain EXPLAINS, and keeps explaining after losing. */
    tableTalk: [
      'Look at my face all you like. It has never given anything away.',
      'I only sit at tables I intend to leave richer than I arrived.',
      'The Alliance calls this a gamble. I call it arithmetic.',
    ],
    catchphrases: {
      enter: ['Sunspot, closing. This will take one pass.'],
      duringBattle: ['Told you. One pass.', 'You fly like somebody who wants to be famous.'],
      win: ['Never in doubt. Not for a moment.'],
      loss: ['Luck. Nothing else. Say otherwise and I will come find you.'],
    },
  },
]);

/**
 * The 11 QUEST captains. They take no simulated turn ({@link isSimulatedCaptain}
 * excludes them from the dusk loop) and are excluded from the named-interceptor
 * pool by construction (`actions/travel.ts` `buildNamedCandidates` resolves against
 * `NPC_PROFILES`, not `ALL_NPC_PROFILES`).
 *
 * T-208 · EVERY ROW CARRIES A `homePortSystemId`, and the field is REQUIRED here by
 * the `QuestProfile` type `defineQuestProfiles` takes. Each one names a CORE PORT
 * (1-14, all of which carry `hasHangout`), chosen by reading that captain's own
 * content: where a storylet or hangout line already puts them somewhere, that is the
 * port; where nothing does, the comment says "no location implied" in the open
 * rather than inventing geography. Before T-208 these eleven took an arbitrary
 * `(index % 20) + 1` seed in `createInitialState`, which parked six of them at rim
 * systems that have no Cantina — frozen forever somewhere the player cannot meet
 * them at a bar.
 */
export const QUEST_PROFILES: NpcProfile[] = defineQuestProfiles([
  {
    id: 'npc-silk-dagger',
    name: 'Silk Dagger',
    shipName: 'Whisper',
    stats: { PILOT: 3, GUNS: 3, TRADE: 1, GRIT: 1, GUILE: 4 },
    ideal: 'Perfection',
    bond: 'Loyal to the Space Dragons',
    flaw: 'Vengeful',
    flawDc: 12,
    tier: 4,
    archetype: 'gambler',
    // T-208 · Altair-3 — her chain's opener `chain.silk-dagger.marker` triggers on
    // `systemIds: [3]` (storylets.ts), so this is where the questline starts.
    homePortSystemId: 3,
  },
  {
    id: 'npc-lucky-seven',
    name: 'Lucky Seven',
    shipName: 'Jackpot',
    stats: { PILOT: 2, GUNS: 1, TRADE: 2, GRIT: 0, GUILE: 4 },
    ideal: 'Thrill',
    bond: 'No loyalties, only the next hand',
    flaw: 'Compulsive Gambler',
    flawDc: 16,
    tier: 2,
    archetype: 'gambler',
    // T-208 · Mira-9 — `passenger.gambler.debt` (storylets.ts, `systemIds: [8]`) says
    // in so many words that Seven "wants off Mira-9 before a card debt catches up":
    // his one located line puts him at that port, waiting on a ride out.
    homePortSystemId: 8,
  },
  {
    id: 'npc-rattlesnake',
    name: 'Rattlesnake',
    shipName: 'Fang',
    stats: { PILOT: 2, GUNS: 3, TRADE: 3, GRIT: 2, GUILE: 1 },
    ideal: 'Profit',
    bond: 'Loyal to the Warlord Confed',
    flaw: 'Vengeful',
    flawDc: 14,
    tier: 3,
    archetype: 'trader',
    // T-208 · Aldebaran-1 — his chain's opener `chain.rattlesnake.insult` triggers on
    // `systemIds: [2]` (storylets.ts).
    homePortSystemId: 2,
  },
  {
    id: 'npc-penny-wise',
    name: 'Penny Wise',
    shipName: 'Thrift Star',
    stats: { PILOT: 1, GUNS: 0, TRADE: 4, GRIT: 2, GUILE: 2 },
    ideal: 'Efficiency',
    bond: 'Loyal to their credits',
    flaw: 'Miserly',
    flawDc: 12,
    tier: 2,
    archetype: 'trader',
    // T-208 · Sol-3 — the Long Table's `borrow` flavour names her desk there:
    // 'Penny Wise keeps a corner desk here…' (portHangouts.ts `SUN_3_HANGOUT`), the
    // only port in the game that names her.
    homePortSystemId: 1,
  },
  {
    id: 'npc-doc-salvage',
    name: 'Doc Salvage',
    shipName: 'Patchwork',
    stats: { PILOT: 3, GUNS: 0, TRADE: 2, GRIT: 4, GUILE: 1 },
    ideal: 'Preservation',
    bond: 'Loyal to the Astro League',
    flaw: 'Savior Complex',
    flawDc: 15,
    tier: 2,
    archetype: 'trader',
    // T-208 · Sol-3 — `chain.doc-salvage.distress-ping` triggers on `systemIds: [1]`
    // (storylets.ts). Sharing the port with Penny Wise is fine: nothing requires a
    // captain to have a Cantina to themselves, and both reasons are independent.
    homePortSystemId: 1,
    bondHook: {
      beat: 'fuel-gift',
      activateAt: 2,
      dc: 8,
      fuelAmount: 50,
      lowFuelThreshold: 150,
      minRescuerFuel: 100,
    },
  },
  {
    id: 'npc-wild-card',
    name: 'Wild Card',
    shipName: 'Chaos Theory',
    stats: { PILOT: 3, GUNS: 2, TRADE: 2, GRIT: 1, GUILE: 3 },
    ideal: 'Chaos',
    bond: 'Hates the Astro League',
    flaw: 'Chaotic',
    flawDc: 17,
    tier: 3,
    archetype: 'gambler',
    // T-208 · Denebola-5 — `chain.wild-card.pitch` triggers on `systemIds: [6]`
    // (storylets.ts) and its prose has him corner the player at Denebola-5.
    homePortSystemId: 6,
  },
  {
    id: 'npc-smuggler-ray',
    name: 'Smuggler Ray',
    shipName: 'Ghost Runner',
    stats: { PILOT: 4, GUNS: 1, TRADE: 3, GRIT: 0, GUILE: 4 },
    ideal: 'Freedom',
    bond: 'Loyal to the Space Dragons',
    flaw: 'Paranoid',
    flawDc: 13,
    tier: 3,
    archetype: 'gambler',
    // T-208 · NO LOCATION IMPLIED by any content — his fence storylets
    // (`fence.ray.sealed-pod`, `fence.ray.contraband-cargo`) trigger on CARGO, not on
    // a system, and `explore-npc-smuggler-ray` is a mark cut into a derelict's frame,
    // a remote contact rather than a place. Placed at Rigel-8, the Underhold, whose
    // `clientele.archetypes` is ['smuggler','gambler'] (portHangouts.ts).
    homePortSystemId: 12,
  },
  {
    id: 'npc-stellar-monk',
    name: 'Stellar Monk',
    shipName: 'Zen Drifter',
    stats: { PILOT: 3, GUNS: 0, TRADE: 3, GRIT: 4, GUILE: 2 },
    ideal: 'Balance',
    bond: 'Loyal to the Space Dragons',
    flaw: 'Pacifist',
    flawDc: 8,
    tier: 3,
    archetype: 'smuggler',
    // T-208 · Deneb-4 — his chain's opener `chain.stellar-monk.empty-hold` triggers on
    // `systemIds: [5]` (storylets.ts).
    homePortSystemId: 5,
  },
  {
    id: 'npc-void-whisper',
    name: 'Void Whisper',
    shipName: 'Dark Psalm',
    stats: { PILOT: 2, GUNS: 2, TRADE: 0, GRIT: 5, GUILE: 3 },
    ideal: 'Ascension',
    bond: 'Loyal to the Nemesis Signal',
    flaw: 'Zealous',
    flawDc: 14,
    tier: 4,
    archetype: 'veteran',
    // T-208 · Mira-9 — `npc.void-whisper.psalm-shard` triggers on `systemIds: [8]`
    // (storylets.ts).
    homePortSystemId: 8,
  },
  {
    id: 'npc-the-broker',
    name: 'The Broker',
    shipName: 'Information Age',
    stats: { PILOT: 1, GUNS: 0, TRADE: 5, GRIT: 1, GUILE: 5 },
    ideal: 'Knowledge',
    bond: "Owns everyone's secrets",
    flaw: 'Manipulative',
    flawDc: 12,
    tier: 4,
    archetype: 'trader',
    // T-208 · Arcturus-6 — his chain's opener `chain.the-broker.ledger` triggers on
    // `systemIds: [4]` (storylets.ts).
    homePortSystemId: 4,
  },
  {
    id: 'npc-rust-bucket',
    name: 'Rust Bucket',
    shipName: 'Junk Heap',
    stats: { PILOT: 2, GUNS: 1, TRADE: 3, GRIT: 4, GUILE: 1 },
    ideal: 'Utility',
    bond: 'Protects their stash',
    flaw: 'Hoarder',
    flawDc: 13,
    tier: 1,
    archetype: 'trader',
    // T-208 · Fomalhaut-2 — `npc.rust-bucket.scrap-sliver` triggers on `systemIds: [7]`
    // (storylets.ts) and its prose puts his pile at Fomalhaut-2.
    homePortSystemId: 7,
  },
]);

export const ALL_NPC_PROFILES: NpcProfile[] = [...NPC_PROFILES, ...QUEST_PROFILES];

/**
 * THE ONE PREDICATE for "does this record take a turn in the daily simulation?"
 *
 * `state.npcs` carries **41** records — the 30 in {@link NPC_PROFILES} who are
 * fully simulated and mortal, plus the 11 in {@link QUEST_PROFILES} who are set
 * aside for STORYLINE ONLY (owner, 2026-07-29) and take no turn. They hold
 * `NpcState` records so storylet triggers and dispositions can look them up by
 * id, and they sit FROZEN at their day-1 credits, ship and system for an entire
 * career. That is the design, not an oversight: the split replaced an earlier
 * "eleven immortal captains" idea, which was dropped because a cast where a
 * third of the names cannot die made no thematic sense. Reading the eleven as
 * simulated captains is the mistake this predicate exists to prevent.
 *
 * That distinction has now caused FOUR live bugs by being spelled a different
 * way at each call site (or not at all): the Honor List silently became a 42-way
 * board ranking eleven day-1 captains; `balance-rig.test.ts` lost 52 tests to a
 * hardcoded 30; `campaign.test.ts`'s NPC wealth-spread invariant took its MEDIAN
 * over all 41, so eleven records pinned at 5,000cr set the median and the
 * assertion read a 344x spread where the simulated field's was 10.3x; and
 * `sampleMilestone` sampled all 41, quietly diluting **every NPC wealth, hull
 * and position percentile this project has measured** since the roster split.
 *
 * So it is one exported predicate over a Set, not a `.some()` at each site:
 * three numbers stay distinct (`NPC_PROFILES.length` = the simulated field,
 * `state.npcs.length` = the record count, 31 = the Honor List board), and the
 * next reader gets the right one by asking rather than by remembering. Note the
 * polarity: it asks whether a record IS simulated rather than whether it is a
 * quest character, so a record with an unrecognised profile is excluded rather
 * than fed to a turn resolver that would throw on it.
 */
const SIMULATED_PROFILE_IDS: ReadonlySet<string> = new Set(NPC_PROFILES.map((p) => p.id));

export function isSimulatedCaptain(profileId: string): boolean {
  return SIMULATED_PROFILE_IDS.has(profileId);
}

export const ANONYMOUS_INTERCEPTORS: AnonymousInterceptorProfile[] = [
  {
    id: 'anon-pirate-1',
    kind: 'PIRATE',
    rosterIndex: 1,
    name: 'K)(akj',
    shipName: 'K1++++',
    shipClass: 'Maligna Bat',
    homeSystem: 'Pollux-7',
    stats: { PILOT: 1, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-pirate-2',
    kind: 'PIRATE',
    rosterIndex: 2,
    name: 'K)(ych',
    shipName: 'K2@@@@',
    shipClass: 'Maligna Cat',
    homeSystem: 'Denebola-5',
    stats: { PILOT: 0, GUNS: 0, TRADE: 0, GRIT: 0, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-pirate-3',
    kind: 'PIRATE',
    rosterIndex: 3,
    name: 'K)(sfy',
    shipName: 'K3####',
    shipClass: 'Maligna Rat',
    homeSystem: 'Denebola-5',
    stats: { PILOT: 0, GUNS: 0, TRADE: 1, GRIT: 1, GUILE: 1 },
    tier: 2,
  },
  {
    id: 'anon-pirate-4',
    kind: 'PIRATE',
    rosterIndex: 4,
    name: 'K)(sdf',
    shipName: 'K4$$$$',
    shipClass: 'Maligna Tat',
    homeSystem: 'Aldebaran-1',
    stats: { PILOT: 0, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 2,
  },
  {
    id: 'anon-pirate-5',
    kind: 'PIRATE',
    rosterIndex: 5,
    name: 'K)(ssf',
    shipName: 'K5%%%%',
    shipClass: 'Maligna Vat',
    homeSystem: 'Altair-3',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 3,
  },
  {
    id: 'anon-pirate-6',
    kind: 'PIRATE',
    rosterIndex: 6,
    name: 'K)(dfy',
    shipName: 'K6^^^^',
    shipClass: 'Maligna Wat',
    homeSystem: 'Altair-3',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 2 },
    tier: 3,
  },
  {
    id: 'anon-pirate-7',
    kind: 'PIRATE',
    rosterIndex: 7,
    name: 'K)(dsh',
    shipName: 'K7&&&&',
    shipClass: 'Maligna Xat',
    homeSystem: 'Pollux-7',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 2 },
    tier: 4,
  },
  {
    id: 'anon-pirate-8',
    kind: 'PIRATE',
    rosterIndex: 8,
    name: 'K)(ech',
    shipName: 'K8****',
    shipClass: 'Maligna Yat',
    homeSystem: 'Aldebaran-1',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 2 },
    tier: 4,
  },
  {
    id: 'anon-pirate-9',
    kind: 'PIRATE',
    rosterIndex: 9,
    name: 'K)(chy',
    shipName: 'K9((((',
    shipClass: 'Maligna Zat',
    homeSystem: 'Denebola-5',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 2 },
    tier: 5,
  },
  {
    id: 'anon-patrol-1',
    kind: 'PATROL',
    rosterIndex: 1,
    name: 'Lt.Savage',
    shipName: 'SP1.Thor',
    shipClass: 'SLOOP',
    homeSystem: 'Procyon-5',
    stats: { PILOT: 1, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: 0 },
    tier: 1,
  },
  {
    id: 'anon-patrol-2',
    kind: 'PATROL',
    rosterIndex: 2,
    name: 'Cmdr.Strong',
    shipName: 'SP2.Hercules',
    shipClass: 'CUTTER',
    homeSystem: 'Mira-9',
    stats: { PILOT: 0, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: 0 },
    tier: 1,
  },
  {
    id: 'anon-patrol-3',
    kind: 'PATROL',
    rosterIndex: 3,
    name: 'Como.Brainerd',
    shipName: 'SP3.Fearless',
    shipClass: 'BARK',
    homeSystem: 'Fomalhaut-2',
    stats: { PILOT: 0, GUNS: 1, TRADE: 1, GRIT: 0, GUILE: 0 },
    tier: 2,
  },
  {
    id: 'anon-patrol-4',
    kind: 'PATROL',
    rosterIndex: 4,
    name: 'Capt.Brutus',
    shipName: 'SP4.Darkover',
    shipClass: 'BRIGANTINE',
    homeSystem: 'Procyon-5',
    stats: { PILOT: 0, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 2,
  },
  {
    id: 'anon-patrol-5',
    kind: 'PATROL',
    rosterIndex: 5,
    name: 'Capt.Armand',
    shipName: 'SP5.Courageous',
    shipClass: 'CORVETTE',
    homeSystem: 'Regulus-6',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 3,
  },
  {
    id: 'anon-patrol-6',
    kind: 'PATROL',
    rosterIndex: 6,
    name: 'Capt.Bouchet',
    shipName: 'SP6.Firedrake',
    shipClass: 'DESTROYER',
    homeSystem: 'Pollux-7',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 3,
  },
  {
    id: 'anon-patrol-7',
    kind: 'PATROL',
    rosterIndex: 7,
    name: 'Capt.Brax',
    shipName: 'SP7.Victorious',
    shipClass: 'CRUISER',
    homeSystem: 'Procyon-5',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 4,
  },
  {
    id: 'anon-patrol-8',
    kind: 'PATROL',
    rosterIndex: 8,
    name: 'Adm.Wong',
    shipName: 'SP8.Meritorious',
    shipClass: 'FRIGATE',
    homeSystem: 'Deneb-4',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 4,
  },
  {
    id: 'anon-patrol-9',
    kind: 'PATROL',
    rosterIndex: 9,
    name: 'Adm.Hutchins',
    shipName: 'SP9.Incredible',
    shipClass: 'BATTLESHIP',
    homeSystem: 'Aldebaran-1',
    stats: { PILOT: 1, GUNS: 2, TRADE: 1, GRIT: 1, GUILE: 0 },
    tier: 4,
  },
  {
    id: 'anon-patrol-10',
    kind: 'PATROL',
    rosterIndex: 10,
    name: 'Adm.Bruiser',
    shipName: 'SPX.Inferno',
    shipClass: 'DEATHSTAR',
    homeSystem: 'Arcturus-6',
    stats: { PILOT: 2, GUNS: 2, TRADE: 1, GRIT: 2, GUILE: 0 },
    tier: 5,
  },
  {
    id: 'anon-patrol-11',
    kind: 'PATROL',
    rosterIndex: 11,
    name: 'Adm.Borgia',
    shipName: 'SPZ.Infinity',
    shipClass: 'INFINITY',
    homeSystem: 'Altair-3',
    stats: { PILOT: 2, GUNS: 3, TRADE: 1, GRIT: 3, GUILE: 0 },
    tier: 5,
  },
  {
    id: 'anon-rim-pirate-1',
    kind: 'RIM_PIRATE',
    rosterIndex: 1,
    name: 'RP-Black Bart',
    shipName: 'Gypsy Lee',
    shipClass: 'Sailfish',
    homeSystem: 'Antares-5',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-rim-pirate-2',
    kind: 'RIM_PIRATE',
    rosterIndex: 2,
    name: 'RP-Blackbeard',
    shipName: 'Buccaneer',
    shipClass: 'Swordfish',
    homeSystem: 'Capella-4',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-rim-pirate-3',
    kind: 'RIM_PIRATE',
    rosterIndex: 3,
    name: 'RP-Anne Bonny',
    shipName: 'Red Witch',
    shipClass: 'Barracuda',
    homeSystem: 'Polaris-1',
    stats: { PILOT: 1, GUNS: 1, TRADE: 1, GRIT: 1, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-rim-pirate-4',
    kind: 'RIM_PIRATE',
    rosterIndex: 4,
    name: 'RP-Mary Read',
    shipName: 'Sea Witch',
    shipClass: 'Hammerhead',
    homeSystem: 'Mizar-9',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-rim-pirate-5',
    kind: 'RIM_PIRATE',
    rosterIndex: 5,
    name: 'RP-Long Ben',
    shipName: 'Marauder',
    shipClass: 'Moray',
    homeSystem: 'Achernar-5',
    stats: { PILOT: 1, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 1 },
    tier: 2,
  },
  {
    id: 'anon-rim-pirate-6',
    kind: 'RIM_PIRATE',
    rosterIndex: 6,
    name: 'RP-Henry Morgan',
    shipName: 'Rascal',
    shipClass: 'Moray',
    homeSystem: 'Algol-2',
    stats: { PILOT: 2, GUNS: 2, TRADE: 1, GRIT: 2, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-rim-pirate-7',
    kind: 'RIM_PIRATE',
    rosterIndex: 7,
    name: 'RP-Piet Nym',
    shipName: 'Golden Fleece',
    shipClass: 'Mako',
    homeSystem: 'Antares-5',
    stats: { PILOT: 2, GUNS: 2, TRADE: 0, GRIT: 2, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-rim-pirate-8',
    kind: 'RIM_PIRATE',
    rosterIndex: 8,
    name: 'RP-Long J.Silver',
    shipName: 'Golden Hiney',
    shipClass: 'Thresher',
    homeSystem: 'Capella-4',
    stats: { PILOT: 2, GUNS: 2, TRADE: 0, GRIT: 2, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-rim-pirate-9',
    kind: 'RIM_PIRATE',
    rosterIndex: 9,
    name: 'RP-Peg-Leg Smith',
    shipName: 'She Devil',
    shipClass: 'Marlin',
    homeSystem: 'Polaris-1',
    stats: { PILOT: 2, GUNS: 2, TRADE: 1, GRIT: 2, GUILE: 2 },
    tier: 3,
  },
  {
    id: 'anon-rim-pirate-10',
    kind: 'RIM_PIRATE',
    rosterIndex: 10,
    name: "RP-Cap'n Jack",
    shipName: 'Fancy Dancy',
    shipClass: 'Orca',
    homeSystem: 'Mizar-9',
    stats: { PILOT: 3, GUNS: 3, TRADE: 0, GRIT: 3, GUILE: 2 },
    tier: 3,
  },
  {
    id: 'anon-rim-pirate-11',
    kind: 'RIM_PIRATE',
    rosterIndex: 11,
    name: 'RP-Lord Tim',
    shipName: 'Fauntleroy',
    shipClass: 'Manta',
    homeSystem: 'Achernar-5',
    stats: { PILOT: 3, GUNS: 3, TRADE: 0, GRIT: 3, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-rim-pirate-12',
    kind: 'RIM_PIRATE',
    rosterIndex: 12,
    name: "RP-Cap'n Ahab",
    shipName: 'Moby Dick',
    shipClass: 'Giant Squid',
    homeSystem: 'Algol-2',
    stats: { PILOT: 3, GUNS: 3, TRADE: 1, GRIT: 3, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-rim-pirate-13',
    kind: 'RIM_PIRATE',
    rosterIndex: 13,
    name: 'RP-Dirty Jack',
    shipName: 'Brass Tack',
    shipClass: 'Halibut',
    homeSystem: 'Antares-5',
    stats: { PILOT: 3, GUNS: 3, TRADE: 0, GRIT: 3, GUILE: 3 },
    tier: 4,
  },
  {
    id: 'anon-rim-pirate-14',
    kind: 'RIM_PIRATE',
    rosterIndex: 14,
    name: 'RP-Good John',
    shipName: 'Coppersides',
    shipClass: 'Flounder',
    homeSystem: 'Capella-4',
    stats: { PILOT: 4, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 3 },
    tier: 4,
  },
  {
    id: 'anon-rim-pirate-15',
    kind: 'RIM_PIRATE',
    rosterIndex: 15,
    name: 'RP-Messy Frank',
    shipName: 'Silversides',
    shipClass: 'Sea Bass',
    homeSystem: 'Polaris-1',
    stats: { PILOT: 4, GUNS: 4, TRADE: 1, GRIT: 4, GUILE: 3 },
    tier: 4,
  },
  {
    id: 'anon-rim-pirate-16',
    kind: 'RIM_PIRATE',
    rosterIndex: 16,
    name: 'RP-Farragut',
    shipName: 'Lady Luck',
    shipClass: 'Lionfish',
    homeSystem: 'Mizar-9',
    stats: { PILOT: 4, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-rim-pirate-17',
    kind: 'RIM_PIRATE',
    rosterIndex: 17,
    name: 'RP-Van Mere',
    shipName: "Witch's Brew",
    shipClass: 'Tetrapod',
    homeSystem: 'Achernar-5',
    stats: { PILOT: 4, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-rim-pirate-18',
    kind: 'RIM_PIRATE',
    rosterIndex: 18,
    name: 'RP-Van Slab',
    shipName: "Devil's Spout",
    shipClass: 'Gastropod',
    homeSystem: 'Algol-2',
    stats: { PILOT: 5, GUNS: 5, TRADE: 1, GRIT: 5, GUILE: 4 },
    tier: 5,
  },
  {
    id: 'anon-rim-pirate-19',
    kind: 'RIM_PIRATE',
    rosterIndex: 19,
    name: 'RP-Innkeeper',
    shipName: 'Purple Smaze',
    shipClass: 'Euchuroidea',
    homeSystem: 'Antares-5',
    stats: { PILOT: 5, GUNS: 5, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 5,
  },
  {
    id: 'anon-rim-pirate-20',
    kind: 'RIM_PIRATE',
    rosterIndex: 20,
    name: 'RP-Polly Nyces',
    shipName: 'Moon Snail',
    shipClass: 'Starfish',
    homeSystem: 'Capella-4',
    stats: { PILOT: 5, GUNS: 5, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 5,
  },
  {
    id: 'anon-rim-pirate-21',
    kind: 'RIM_PIRATE',
    rosterIndex: 21,
    name: 'RP-Alienator',
    shipName: 'PREDATOR',
    shipClass: 'Symbiote',
    homeSystem: 'Algol-2',
    stats: { PILOT: 5, GUNS: 5, TRADE: 1, GRIT: 5, GUILE: 5 },
    tier: 5,
  },
  {
    id: 'anon-brigand-1',
    kind: 'BRIGAND',
    rosterIndex: 1,
    name: 'Cruncher',
    shipName: 'Big Mac',
    shipClass: 'N1.Sloop',
    homeSystem: 'Sol-3',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-brigand-2',
    kind: 'BRIGAND',
    rosterIndex: 2,
    name: 'Chomper',
    shipName: 'Nugget',
    shipClass: 'N1.Sloop',
    homeSystem: 'Aldebaran-1',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-brigand-3',
    kind: 'BRIGAND',
    rosterIndex: 3,
    name: 'Stomper',
    shipName: 'Fish Stix',
    shipClass: 'N1.Sloop',
    homeSystem: 'Altair-3',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 1 },
    tier: 1,
  },
  {
    id: 'anon-brigand-4',
    kind: 'BRIGAND',
    rosterIndex: 4,
    name: 'Bruiser',
    shipName: 'Fries',
    shipClass: 'N1.Sloop',
    homeSystem: 'Arcturus-6',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-brigand-5',
    kind: 'BRIGAND',
    rosterIndex: 5,
    name: 'Bonker',
    shipName: 'Pop Tart',
    shipClass: 'N1.Sloop',
    homeSystem: 'Deneb-4',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-brigand-6',
    kind: 'BRIGAND',
    rosterIndex: 6,
    name: 'Blaster',
    shipName: 'Twinkie',
    shipClass: 'N1.Sloop',
    homeSystem: 'Denebola-5',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-brigand-7',
    kind: 'BRIGAND',
    rosterIndex: 7,
    name: 'Bumper',
    shipName: 'Ho-Ho',
    shipClass: 'N1.Sloop',
    homeSystem: 'Fomalhaut-2',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-brigand-8',
    kind: 'BRIGAND',
    rosterIndex: 8,
    name: 'Buster',
    shipName: 'Jelly Bean',
    shipClass: 'N1.Sloop',
    homeSystem: 'Mira-9',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-brigand-9',
    kind: 'BRIGAND',
    rosterIndex: 9,
    name: 'Booster',
    shipName: 'Jube-Jube',
    shipClass: 'N1.Sloop',
    homeSystem: 'Pollux-7',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-brigand-10',
    kind: 'BRIGAND',
    rosterIndex: 10,
    name: 'Bugster',
    shipName: 'Taco',
    shipClass: 'N1.Sloop',
    homeSystem: 'Procyon-5',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-brigand-11',
    kind: 'BRIGAND',
    rosterIndex: 11,
    name: 'Bammer',
    shipName: 'Chips',
    shipClass: 'N1.Sloop',
    homeSystem: 'Regulus-6',
    stats: { PILOT: 0, GUNS: 0, TRADE: 2, GRIT: 0, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-brigand-12',
    kind: 'BRIGAND',
    rosterIndex: 12,
    name: 'Bummer',
    shipName: 'McDLT',
    shipClass: 'N1.Sloop',
    homeSystem: 'Rigel-8',
    stats: { PILOT: 1, GUNS: 1, TRADE: 2, GRIT: 1, GUILE: 5 },
    tier: 5,
  },
  {
    id: 'anon-reptiloid-1',
    kind: 'REPTILOID',
    rosterIndex: 1,
    name: 'Admiral Assss',
    shipName: 'SS Anaconda',
    shipClass: 'S1-Snake',
    homeSystem: 'NGC-44',
    stats: { PILOT: 5, GUNS: 0, TRADE: 0, GRIT: 1, GUILE: 2 },
    tier: 1,
  },
  {
    id: 'anon-reptiloid-2',
    kind: 'REPTILOID',
    rosterIndex: 2,
    name: 'Admiral Bssss',
    shipName: 'SS Bull',
    shipClass: 'S2-Snake',
    homeSystem: 'NGC-55',
    stats: { PILOT: 5, GUNS: 1, TRADE: 0, GRIT: 1, GUILE: 2 },
    tier: 1,
  },
  {
    id: 'anon-reptiloid-3',
    kind: 'REPTILOID',
    rosterIndex: 3,
    name: 'Admiral Cssss',
    shipName: 'SS Copperhead',
    shipClass: 'S3-Snake',
    homeSystem: 'NGC-66',
    stats: { PILOT: 5, GUNS: 1, TRADE: 0, GRIT: 2, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-reptiloid-4',
    kind: 'REPTILOID',
    rosterIndex: 4,
    name: 'Admiral Dssss',
    shipName: 'SS Fer-de-Lance',
    shipClass: 'S4-Snake',
    homeSystem: 'NGC-77',
    stats: { PILOT: 4, GUNS: 2, TRADE: 0, GRIT: 2, GUILE: 2 },
    tier: 2,
  },
  {
    id: 'anon-reptiloid-5',
    kind: 'REPTILOID',
    rosterIndex: 5,
    name: 'Admiral Essss',
    shipName: 'SS Garter',
    shipClass: 'S5-Snake',
    homeSystem: 'NGC-88',
    stats: { PILOT: 4, GUNS: 2, TRADE: 0, GRIT: 3, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-reptiloid-6',
    kind: 'REPTILOID',
    rosterIndex: 6,
    name: 'Admiral Fssss',
    shipName: 'SS Indigo',
    shipClass: 'S6-Snake',
    homeSystem: 'NGC-99',
    stats: { PILOT: 4, GUNS: 3, TRADE: 0, GRIT: 3, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-reptiloid-7',
    kind: 'REPTILOID',
    rosterIndex: 7,
    name: 'Admiral Gssss',
    shipName: 'SS Viper',
    shipClass: 'S7-Snake',
    homeSystem: 'NGC-44',
    stats: { PILOT: 4, GUNS: 3, TRADE: 0, GRIT: 4, GUILE: 3 },
    tier: 3,
  },
  {
    id: 'anon-reptiloid-8',
    kind: 'REPTILOID',
    rosterIndex: 8,
    name: 'Admiral Hssss',
    shipName: 'SS Coral',
    shipClass: 'S8-Snake',
    homeSystem: 'NGC-55',
    stats: { PILOT: 5, GUNS: 4, TRADE: 0, GRIT: 4, GUILE: 3 },
    tier: 4,
  },
  {
    id: 'anon-reptiloid-9',
    kind: 'REPTILOID',
    rosterIndex: 9,
    name: 'Admiral Issss',
    shipName: 'SS Rattler',
    shipClass: 'S9-Snake',
    homeSystem: 'NGC-66',
    stats: { PILOT: 5, GUNS: 4, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-reptiloid-10',
    kind: 'REPTILOID',
    rosterIndex: 10,
    name: 'Admiral Kssss',
    shipName: 'SS Asp',
    shipClass: 'SX-Snake',
    homeSystem: 'NGC-77',
    stats: { PILOT: 5, GUNS: 5, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 4,
  },
  {
    id: 'anon-reptiloid-11',
    kind: 'REPTILOID',
    rosterIndex: 11,
    name: 'Admiral Lssss',
    shipName: 'SS Adder',
    shipClass: 'SY-Snake',
    homeSystem: 'NGC-88',
    stats: { PILOT: 5, GUNS: 5, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 5,
  },
  {
    id: 'anon-reptiloid-12',
    kind: 'REPTILOID',
    rosterIndex: 12,
    name: 'Admiral Mssss',
    shipName: 'SS Cobra',
    shipClass: 'SZ-Snake',
    homeSystem: 'NGC-99',
    stats: { PILOT: 5, GUNS: 5, TRADE: 0, GRIT: 5, GUILE: 4 },
    tier: 5,
  },
];
