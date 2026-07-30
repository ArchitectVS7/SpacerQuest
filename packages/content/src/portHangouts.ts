/**
 * T-120 · THE PER-PORT HANGOUT VENUE DEFINITION — the content half of ruling 3
 * (`docs/HANGOUT_REDESIGN.md` §2.1, §2.2, §2.3).
 *
 * Ruling 3: **a Hangout port definition controls OUTCOMES, not RULES.** A row here
 * carries exactly six parameter classes — which venues are offered, the wager band,
 * the per-venue check DCs, the per-venue disposition deltas, the drawable clientele
 * and the prose/tone — and nothing else. There is no predicate field, no rate, no
 * term, no per-port lender and no callback. The opposed-GUILE dare resolution, the
 * loan ledger, die spending and how a disposition delta is APPLIED all stay in the
 * engine (`packages/engine/src/actions/hangout.ts`), at every port, forever. A
 * dangerous bar is dangerous through numbers.
 *
 * WHY A NEW FILE RATHER THAN AN EXTENSION OF `hangout.ts` (§2.2 ruling 1).
 * `hangout.ts` keeps the R-owned tuning constants and the rumor templates with
 * their existing provenance comments; those constants are the values
 * `DEFAULT_PORT_HANGOUT` is BUILT FROM — imported, never restated. That import is
 * what makes T-120's behaviour-preserving proof mechanical rather than a diff
 * review: a row that omits a field inherits today's shipped number by construction.
 *
 * THIS FILE IS DATA (§2.5). It carries no predicate and no branch — every
 * conditional in the Hangout (which venue, which arm, whether the check passed,
 * whether the dealer is present, whether the loan clears) lives in the engine and
 * stays there. A `grep` for `if (` here must find nothing that decides an outcome.
 *
 * READER: `packages/engine/src/hangoutRules.ts`, whose accessors (`portHangoutFor`,
 * `wagerBandFor`, `venueParamsFor`, `venueOffered`, `rankClientele`) resolve a row
 * FIELD-WISE against `DEFAULT_PORT_HANGOUT` and never throw. The resolver, the UGT
 * protocol (`packages/sim/src/protocol.ts`) and the Hangout pane
 * (`packages/ui/src/format.ts`) read only through those accessors.
 *
 * NAMING (`docs/0.5.2-SPEC-REVIEW.md` D7): the row's id field is `systemId`, not
 * the port-prefixed name `HANGOUT_REDESIGN.md` §2.1's code block wrote. It names a
 * `STAR_SYSTEMS` id, and `systemId` is the repo's settled name for that
 * (`PortStake.systemId`, `RecoveryState.systemId`, `types.ts:1147`) — and the
 * spec's own accessor signatures already said `systemId`. The old spelling has
 * zero hits anywhere in the workspace sources.
 */

import type { NpcArchetype } from './cast.js';
import {
  BEFRIEND_DC,
  BEFRIEND_DISPOSITION,
  DARE_LOSS_DISPOSITION,
  DARE_MAX_WAGER,
  DARE_MIN_WAGER,
  DARE_WIN_DISPOSITION,
  INSULT_DISPOSITION,
  MEET_DISPOSITION,
} from './hangout.js';
import { STAR_SYSTEMS } from './systems.js';

/** The seven venues `resolveVisitHangout` already switches on. NOT a new
 *  vocabulary — the same seven strings the `PlayerAction` `VisitHangout` union
 *  carries (`packages/engine/src/types.ts:1191`). `hangoutRules.ts` pins the two
 *  unions together at compile time, so a venue can never be added on one side
 *  only. */
export type HangoutVenueId = 'dare' | 'meet' | 'befriend' | 'insult' | 'rumor' | 'borrow' | 'repay';

/** Register. PROSE ONLY — no mechanical effect anywhere (§6). A port tagged
 *  `dangerous` is dangerous through its NUMBERS; the tone only tells the author
 *  and the pane which voice to use. */
export type HangoutTone = 'everyday' | 'exotic' | 'dangerous' | 'comic';

/**
 * The per-venue outcome parameters. Every field is optional on a real row and
 * resolves FIELD-WISE against `DEFAULT_PORT_HANGOUT` (§2.2 ruling 2), so a port
 * that sets its band but omits a DC gets its own band and the default DC.
 *
 * WHICH FIELDS EACH VENUE ACTUALLY READS — taken literally from today's resolver.
 * T-122 … T-124 author against this table, and the `dare` row is the one
 * non-obvious cell: SUCCESS is the arm where the HOUSE prevails.
 *
 * | venue      | `dc`                        | `dispositionOnSuccess`        | `dispositionOnFailure`       |
 * | ---------- | --------------------------- | ----------------------------- | ---------------------------- |
 * | `dare`     | ignored — a Dare is OPPOSED, the dealer's live GUILE total IS the DC | player LOST the hand, dealer warms (`DARE_LOSS_DISPOSITION`) | player WON, the beaten dealer sours (`DARE_WIN_DISPOSITION`) |
 * | `befriend` | the GUILE charm DC          | applied on a passed check     | ignored — a flat charm does not sour |
 * | `insult`   | ignored — an insult never rolls | always applied            | ignored                      |
 * | `meet`     | ignored — an introduction never rolls | always applied      | ignored                      |
 * | `rumor`    | ignored                     | ignored                       | ignored                      |
 * | `borrow`   | ignored — the loan band is GLOBAL (§2.2 ruling 5) | ignored    | ignored                      |
 * | `repay`    | ignored                     | ignored                       | ignored                      |
 *
 * A field a venue does not read is carried as `0` on the default row so the engine
 * accessor can return plain numbers rather than `number | undefined` — which is
 * what keeps the resolver from ever restating a constant as a `??` fallback.
 */
export interface HangoutVenueParams {
  /** DC for venues that roll (today: `befriend` only). Ignored by venues that do not. */
  dc?: number;
  /** Disposition delta on the venue's SUCCESS arm (befriend-success, meet, insult, dare-LOSS). */
  dispositionOnSuccess?: number;
  /** Disposition delta on the venue's FAILURE arm (today only `dare`: the beaten dealer sours). */
  dispositionOnFailure?: number;
}

/**
 * Who the house seats. RANK-ONLY (§2.2 ruling 4): the engine's `rankClientele`
 * REORDERS the live, in-system, non-dead set it is handed and never adds to it, so
 * the resolver's load-bearing "a dealer is an NPC actually co-located and alive"
 * guarantee is untouched. An empty intersection returns the whole set unchanged —
 * a bar is never empty by content decree.
 */
export interface HangoutClientele {
  /** `NpcArchetype` tags preferred as the house dealer. Ranks; never adds. */
  archetypes?: readonly NpcArchetype[];
  /** Specific cast `profileId`s preferred, ahead of the archetype tags. Same rank-only rule. */
  regulars?: readonly string[];
}

/** The authored voice of one house. Read by no engine assertion — prose is prose. */
export interface HangoutProse {
  /** "The Rusted Astrolabe". Displayed in place of the generic pane header. */
  houseName: string;
  tone: HangoutTone;
  /** Per-venue colour line. Partial: a venue with no line falls back to the default row's. */
  flavour: Partial<Record<HangoutVenueId, string>>;
  /** Optional room-establishing line, prepended to the rumor list. */
  roomLine?: string;
}

/**
 * One port's Hangout.
 *
 * OPTIONALITY (the §2.1 deviation, recorded rather than silently taken): the
 * spec's §2.1 code block types `venues` / `wager` / `venueParams` / `clientele` as
 * REQUIRED, while §2.2 ("every field optional against `DEFAULT_PORT_HANGOUT`") and
 * §2.3 ("Sun-3's row … leaves `wager` and `venueParams` omitted") both require them
 * to be omittable. The two cannot both hold. Resolved in favour of §2.2/§2.3 — the
 * four parameter fields are optional, `prose` stays required — because §2.3's
 * behaviour-preserving proof depends on omission inheriting today's constant BY
 * CONSTRUCTION.
 */
export interface PortHangout {
  /** `STAR_SYSTEMS` id. The row's identity; the table is keyed by it too, and the
   *  T-121 validation test asserts key === systemId across all fourteen rows. */
  systemId: number;
  /** Which of the seven this port offers. A port with no credit desk simply omits
   *  'borrow'/'repay'; a card room that will not seat a stranger omits 'meet'. */
  venues?: readonly HangoutVenueId[];
  /** The Dare stake band. Clamped FURTHER, by the engine, to what both sides can cover. */
  wager?: { min: number; max: number };
  venueParams?: Partial<Record<HangoutVenueId, HangoutVenueParams>>;
  clientele?: HangoutClientele;
  prose: HangoutProse;
}

/** All seven, in the resolver's own switch order. Reused by the default row and by
 *  Sun-3, so "offers everything" is written once. */
const ALL_HANGOUT_VENUES: readonly HangoutVenueId[] = [
  'dare',
  'meet',
  'befriend',
  'insult',
  'rumor',
  'borrow',
  'repay',
];

/**
 * TODAY'S SHIPPED BEHAVIOUR, VERBATIM, AS A ROW (§2.2 ruling 2, §2.3). Every
 * omitted field on a real row resolves to this one's value, field by field.
 *
 * It is FULLY RESOLVED — every venue has an entry and every entry has all three
 * fields — so `venueParamsFor` returns plain numbers and no caller anywhere needs a
 * fallback of its own. Fields a venue does not read carry `0`; see the table on
 * `HangoutVenueParams`.
 *
 * Every number here is IMPORTED from `hangout.ts`, never restated. That is the
 * whole behaviour-preserving argument: a port that omits a parameter reads exactly
 * the constant the resolver read before this extraction existed.
 */
export const DEFAULT_PORT_HANGOUT: PortHangout = {
  // The default row is never keyed by id — `portHangoutFor` overwrites this with
  // the caller's system id, so a rowless port still reports where it is.
  systemId: -1,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: DARE_MIN_WAGER, max: DARE_MAX_WAGER },
  venueParams: {
    dare: {
      dc: 0, // ignored by this venue — a Dare is opposed
      dispositionOnSuccess: DARE_LOSS_DISPOSITION, // the house prevailed; the dealer warms
      dispositionOnFailure: DARE_WIN_DISPOSITION, // the player prevailed; the dealer sours
    },
    meet: {
      dc: 0, // ignored by this venue
      dispositionOnSuccess: MEET_DISPOSITION,
      dispositionOnFailure: 0, // ignored by this venue
    },
    befriend: {
      dc: BEFRIEND_DC,
      dispositionOnSuccess: BEFRIEND_DISPOSITION,
      dispositionOnFailure: 0, // ignored by this venue
    },
    insult: {
      dc: 0, // ignored by this venue — an insult never rolls
      dispositionOnSuccess: INSULT_DISPOSITION,
      dispositionOnFailure: 0, // ignored by this venue
    },
    rumor: {
      dc: 0, // ignored by this venue
      dispositionOnSuccess: 0, // ignored by this venue
      dispositionOnFailure: 0, // ignored by this venue
    },
    borrow: {
      dc: 0, // ignored by this venue — the loan band is global
      dispositionOnSuccess: 0, // ignored by this venue
      dispositionOnFailure: 0, // ignored by this venue
    },
    repay: {
      dc: 0, // ignored by this venue
      dispositionOnSuccess: 0, // ignored by this venue
      dispositionOnFailure: 0, // ignored by this venue
    },
  },
  // Empty: `rankClientele` is the IDENTITY under the default row. Nothing about
  // who is seated changes until a port authors a preference.
  clientele: {},
  // Generic house, so a `hasHangout` port with no row of its own still renders.
  prose: {
    houseName: 'the Spacers Hangout',
    tone: 'everyday',
    flavour: {},
  },
};

/**
 * Sun-3 — the home-port hall (§6.3, T-122's row 1).
 *
 * THE BEHAVIOUR-PRESERVING ROW. It offers all seven venues and OMITS `wager`,
 * `venueParams` and `clientele` entirely, so every number the resolver reads at
 * Sun-3 resolves through `DEFAULT_PORT_HANGOUT` to the same imported constant it
 * read before T-120. Only `prose` is new, and prose is read by no engine assertion.
 * Do not add a parameter here: doing so would make the goldens move.
 */
const SUN_3_HANGOUT: PortHangout = {
  systemId: 1,
  venues: ALL_HANGOUT_VENUES,
  prose: {
    houseName: 'the Long Table',
    tone: 'everyday',
    roomLine:
      'The Long Table is half full, the way it always is at Sun-3 — no one here is far from home.',
    flavour: {
      dare: 'Someone racks the dice and slides the cup down the boards toward you.',
      meet: 'You get a nod and half a bench; that is how introductions go here.',
      befriend: 'A round bought at the Long Table buys a hearing, if not yet a friend.',
      insult: 'The room goes quiet in the way a home port never quite forgets.',
      rumor: 'Two berths over, a fueller is telling the whole hall what she heard on the wire.',
      borrow: 'Penny Wise keeps a corner desk here, and a ledger that has never once been wrong.',
      repay: 'You count it out on the desk and the ledger line gets a stroke through it.',
    },
  },
};

/**
 * T-122 · Aldebaran-1 — the exchange-floor bar (§6.3, pass 1).
 *
 * AXIS VECTOR: stakes (a raised floor and a lowered ceiling), consequence
 * (`meet` doubled, `insult` softened), difficulty (`befriend` one easier),
 * clientele (`trader`). Venues: all seven.
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 50/750 — the floor does not deal 25cr hands and nobody here bets a
 *     hold; the band is narrowed at BOTH ends, which is what makes it an exchange
 *     rather than a casino.
 *   - `meet.dispositionOnSuccess` 2 (default 1) — introductions are the POINT of
 *     the room; this is the one venue Aldebaran-1 is built around.
 *   - `befriend.dc` 11 (default 12) — a trading floor shakes hands easily.
 *   - `insult.dispositionOnSuccess` −3 (default −4) — a slight here is business,
 *     priced and carried, not blood.
 *   - `dare` left at the default entirely: the tables are not this port's identity.
 */
const ALDEBARAN_1_HANGOUT: PortHangout = {
  systemId: 2,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 50, max: 750 },
  venueParams: {
    meet: { dispositionOnSuccess: 2 },
    befriend: { dc: 11 },
    insult: { dispositionOnSuccess: -3 },
  },
  clientele: { archetypes: ['trader'] },
  prose: {
    houseName: 'the Weighbridge',
    tone: 'everyday',
    roomLine:
      "The Weighbridge sits under the exchange floor at Aldebaran-1, and the day's closing prices are still chalked up behind the bar.",
    flavour: {
      dare: 'A broker clears a space among the manifests and sets the cup down like a contract.',
      meet: 'Introductions are the trade here; a name carries further across this bar than a drink does.',
      befriend: "Buy a round at the Weighbridge and half the floor will remember your ship's name.",
      insult: 'A slight here is business — noted, priced, and carried on the ledger.',
      rumor: 'Somebody at the far end is reading the wire aloud for anyone who will listen.',
      borrow:
        'The credit desk sits where the whole floor can see it, which is how the floor prefers it.',
      repay: 'You settle up in full view of the room, and the room notices.',
    },
  },
};

/**
 * T-122 · Altair-3 — the lane-side stopover (§6.3, pass 1).
 *
 * AXIS VECTOR: clientele (`smuggler` + `explorer`) and NOTHING ELSE. This port is
 * the deliberate NUMERIC MEAN — default band, default DCs, default deltas, all
 * seven venues — so it stays a clean measurement control against which the exotic
 * and dangerous rooms of T-123 read as exotic and dangerous.
 *
 * THE §6.3 / §6.4 TENSION, RESOLVED IN THE OPEN. §6.3 calls this port "fully
 * generic, deliberately", while §6.4 requires no two ports to share an axis vector
 * AND fixes Sun-3's vector to the default row — so "fully generic" and "distinct
 * from Sun-3" cannot both hold literally. §6.4's own closing sentence settles it:
 * Sun-3 is the one fixed tuple, "which means the other thirteen are the ones that
 * must move". Altair-3 therefore moves on `clientele` ALONE, which is the one axis
 * no sim policy reads (`rankClientele`'s only reader is the Hangout pane;
 * `planDare` picks the richest in-system dealer without consulting it), so the port
 * satisfies §6.4 while remaining numerically inert. §6.3's axis note is corrected
 * in place to say so.
 *
 * `wager` and `venueParams` are OMITTED rather than restated at their defaults —
 * omission is what makes the inertness true by construction, exactly as at Sun-3.
 */
const ALTAIR_3_HANGOUT: PortHangout = {
  systemId: 3,
  venues: ALL_HANGOUT_VENUES,
  clientele: { archetypes: ['smuggler', 'explorer'] },
  prose: {
    houseName: 'the Waypost',
    tone: 'everyday',
    roomLine:
      'The Waypost stands where the lanes cross at Altair-3, and nobody in it means to stay.',
    flavour: {
      dare: 'The cup goes round between departures, and half the players leave mid-hand.',
      meet: 'Everyone here is passing through, which makes an introduction cheap and short.',
      befriend:
        'You can make a friend at the Waypost, but you will likely make them somewhere else.',
      insult: 'A hard word costs little in a room that empties by morning.',
      rumor: 'Crews inbound from four directions, and every one of them has heard something.',
      borrow: 'The desk keeps the same hours as the lanes, which is to say all of them.',
      repay: 'You clear the line before you clear the port; that is how it is done here.',
    },
  },
};

/**
 * T-122 · Mira-9 — the fuellers' canteen (§6.3, pass 1).
 *
 * AXIS VECTOR: stakes (§6.1's named dive shape), difficulty (the easiest room to
 * charm in pass 1 bar the guild), consequence (warm on every arm), clientele
 * (`trader` + `veteran` — working hands who never left). Venues: all seven.
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 5/200 — §6.1's dive: "min 5 and a ceiling far under the global
 *     1,000". Nobody at Mira-9 plays for more than they carry.
 *   - `befriend.dc` 10 / `dispositionOnSuccess` 4 (defaults 12 / 3) — a warm room,
 *     and the cheap-fuel port is where a captain short of a week's pay is welcome.
 *   - `meet.dispositionOnSuccess` 2 (default 1) — a bench is made without asking.
 *   - `insult.dispositionOnSuccess` −3 (default −4) — the hands have heard worse
 *     from better.
 *   - `dare.dispositionOnSuccess` 3 / `dispositionOnFailure` −1 (defaults 2 / −2) —
 *     nobody minds losing a small hand, and a captain who loses one gracefully is
 *     liked for it. This is the forgiving pole of §6.1's consequence axis.
 */
const MIRA_9_HANGOUT: PortHangout = {
  systemId: 8,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 5, max: 200 },
  venueParams: {
    dare: { dispositionOnSuccess: 3, dispositionOnFailure: -1 },
    meet: { dispositionOnSuccess: 2 },
    befriend: { dc: 10, dispositionOnSuccess: 4 },
    insult: { dispositionOnSuccess: -3 },
  },
  clientele: { archetypes: ['trader', 'veteran'] },
  prose: {
    houseName: 'the Dry Tank',
    tone: 'everyday',
    roomLine:
      'The Dry Tank smells of the fuel yards, and every hand at the bar has worked a hose today.',
    flavour: {
      dare: 'Small coins on a scratched table, and nobody at Mira-9 plays for more than they carry.',
      meet: 'You shift down the bench and somebody makes room without being asked.',
      befriend: 'A round here costs little and buys a great deal; the Dry Tank is a warm room.',
      insult:
        'The hands look up, then go back to their drinks — they have heard worse from better.',
      rumor: 'The yard crews talk over one another, and some of what they say is even true.',
      borrow:
        'The desk in the corner is a small one, and the clerk has seen every kind of short week.',
      repay: 'You put it down in coin and the clerk counts it twice, out of habit.',
    },
  },
};

/**
 * T-122 · Procyon-5 — the freight-guild room (§6.3, pass 1).
 *
 * AXIS VECTOR: stakes (a narrow, high-floored band), difficulty (§6.1's named easy
 * pole to charm), consequence (dear on insult, dear on beating the house),
 * clientele (`explorer` + `trader`). Venues: all seven.
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 100/500 — the narrowest band in pass 1: guild men bet in round
 *     numbers and the room has a floor beneath which it will not deal.
 *   - `befriend.dc` 9 (default 12) — §6.1's named easy pole. A captain who hauls
 *     honest is halfway to welcome before the first drink.
 *   - `insult.dispositionOnSuccess` −7 (default −4) — the guild keeps long books.
 *     −8 and below is deliberately LEFT to T-123's garrison, which §6.1/§6.2
 *     reserve for the clannish/strict pole; this is dear, not punitive.
 *   - `dare.dispositionOnFailure` −3 (default −2) — beating a guild man at his own
 *     table is remembered a little longer than elsewhere.
 */
const PROCYON_5_HANGOUT: PortHangout = {
  systemId: 10,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 100, max: 500 },
  venueParams: {
    dare: { dispositionOnFailure: -3 },
    befriend: { dc: 9 },
    insult: { dispositionOnSuccess: -7 },
  },
  clientele: { archetypes: ['explorer', 'trader'] },
  prose: {
    houseName: 'the Bonded Room',
    tone: 'everyday',
    roomLine:
      "The Bonded Room takes up one end of the freight guild's hall at Procyon-5, and the guild pays for the lamps.",
    flavour: {
      dare: 'Guild men bet in round numbers and expect the same back across the table.',
      meet: 'You are introduced by trade and tonnage a while before anyone asks your name.',
      befriend: 'A captain who hauls honest is halfway to welcome here before the first drink.',
      insult: 'The guild keeps long books, and a word said badly goes into one of them.',
      rumor: 'Two clerks are arguing about a consignment that neither of them ever saw.',
      borrow: 'The desk here is guild business, and guild business is done quietly.',
      repay:
        'The clerk strikes the line, blots it, and files the sheet where the guild can find it.',
    },
  },
};

/**
 * T-123 · Arcturus-6 — the garrison mess (§6.3, pass 2). THE MEASURABLY HOSTILE
 * PORT, and the first port in the game to NARROW ITS VENUE SET.
 *
 * `content/ports.ts:223` gives Arcturus-6 to the `rebels`, so this is a garrison
 * of that allegiance rather than a neutral one: a room that already knows whose
 * side it is on before you walk in.
 *
 * AXIS VECTOR: venue set (no credit desk), stakes (a narrow, disciplined band),
 * difficulty (the hardest room in the galaxy to charm), consequence (punitive on
 * every arm), clientele (`veteran` + `fighter`). That is five of the six axes,
 * which is what §6.2's "strict garrison world" asks for — governance expressed
 * jointly through the mechanical four.
 *
 * IT IS THE UNIQUE PER-AXIS MAXIMUM ON EVERY HOSTILITY AXIS, deliberately: the
 * highest `befriend.dc`, the most negative `insult`, the most negative
 * dare-failure arm, the lowest `meet`, and the fewest venues of any authored
 * port. That is what lets `hangoutContent.test.ts` assert "measurably hostile"
 * WITHOUT a threshold — it compares this port against the others and against the
 * default row, and never against a restated number.
 *
 * Every deviation from the default, with its reason:
 *   - `venues` omits `borrow` AND `repay` — §6.2's strict garrison "no lending
 *     desk", and §2.2 ruling 5's exactly-one-bit of per-port lending control. The
 *     garrison does not run a credit desk; the loan BAND stays global, because a
 *     port may only decide whether the desk is there, never what it charges.
 *   - `wager` 100/400 — the narrowest band in the galaxy. Soldiers bet in fixed
 *     sums out of fixed pay, and the mess deals nothing below a hundred.
 *   - `befriend.dc` 16 (default 12) / `dispositionOnSuccess` 2 (default 3) — §6.1's
 *     hard pole, and even a passed check buys less warmth than it does anywhere
 *     else.
 *   - `insult.dispositionOnSuccess` −9 (default −4) — the clannish end of §6.1's
 *     consequence axis, and one worse than Procyon-5's −7, which T-122 explicitly
 *     left for this row.
 *   - `dare.dispositionOnSuccess` 1 (default 2) / `dispositionOnFailure` −7
 *     (default −2) — the asymmetry is the whole character of the room. Losing to
 *     the garrison's dealer earns you almost nothing; BEATING him is the worst
 *     thing a stranger can do at Arcturus-6.
 *   - `meet.dispositionOnSuccess` 0 (default 1) — an AUTHORED ZERO, not an
 *     omission: `venueParamsFor` resolves with `??`, so a written 0 is a real
 *     authored value. Nobody in this room makes space for a stranger.
 */
const ARCTURUS_6_HANGOUT: PortHangout = {
  systemId: 4,
  venues: ['dare', 'meet', 'befriend', 'insult', 'rumor'],
  wager: { min: 100, max: 400 },
  venueParams: {
    dare: { dispositionOnSuccess: 1, dispositionOnFailure: -7 },
    meet: { dispositionOnSuccess: 0 },
    befriend: { dc: 16, dispositionOnSuccess: 2 },
    insult: { dispositionOnSuccess: -9 },
  },
  clientele: { archetypes: ['veteran', 'fighter'] },
  prose: {
    houseName: 'the Garrison Mess',
    tone: 'dangerous',
    roomLine:
      "The Garrison Mess at Arcturus-6 is a soldiers' room with a civilian door, and the door is watched.",
    flavour: {
      dare: "The cup is the garrison's, the table is the garrison's, and the room would rather you lost.",
      meet: 'You give your name to a bench that does not move over, and that is the whole introduction.',
      befriend:
        "A stranger buying rounds in a soldiers' mess is a stranger buying rounds, and they know it.",
      insult: 'A hard word here is not forgotten by one man; it is remembered by a garrison.',
      rumor: 'Talk stops when you pass and starts again behind you, which is its own kind of news.',
    },
  },
};

/**
 * T-123 · Deneb-4 — the partisan hall (§6.3, pass 2). THE FACTION ROOM.
 *
 * `content/ports.ts:232` gives Deneb-4 to the `league`, and this row makes that
 * allegiance mechanical rather than decorative: its `regulars` are the four Astro
 * League captains on the roster — Cargo King and Zero Risk are "Loyal to the Astro
 * League", Admiral Stern "Protects" it and The Warden "Hunts for" it — so on any
 * day the simulation has moved one of them here, the hall seats its own first.
 * THE FIRST ROW IN THE GAME WITH `regulars`.
 *
 * AXIS VECTOR: venue set (no `meet`), stakes (a very wide, high-ceilinged band),
 * difficulty (hard to get in), consequence (asymmetric on the dare arms, dear on
 * an insult), clientele (four named regulars + `veteran`).
 *
 * F-101-2 IS RESPECTED HERE RATHER THAN WISHED AWAY: `clientele` ranks and never
 * spawns, so this port's identity has to survive an empty or off-theme room. It
 * does — the omitted `meet`, the band and the dare asymmetry are true every day,
 * and the regulars only decide who deals on the days the cast has provided one.
 *
 * Every deviation from the default, with its reason:
 *   - `venues` omits `meet` — §6.1's named "a room that will not seat a stranger".
 *     The hall makes no introductions; you are already known here or you are not.
 *   - `wager` 25/2000 — the faction's people bet large among ONE ANOTHER, so the
 *     ceiling is twice the galaxy's while the floor stays where anyone can sit.
 *   - `dare.dispositionOnSuccess` 1 (default 2) / `dispositionOnFailure` −6
 *     (default −2) — §6.2's named asymmetric consequence: beating the house sours
 *     the room harder than losing to it warms it.
 *   - `befriend.dc` 14 (default 12) / `dispositionOnSuccess` 5 (default 3) — hard
 *     to get in; once in, you are theirs.
 *   - `insult.dispositionOnSuccess` −6 (default −4) — a slight to one of them is a
 *     slight to the League, and the League keeps the score.
 */
const DENEB_4_HANGOUT: PortHangout = {
  systemId: 5,
  venues: ['dare', 'befriend', 'insult', 'rumor', 'borrow', 'repay'],
  wager: { min: 25, max: 2000 },
  venueParams: {
    dare: { dispositionOnSuccess: 1, dispositionOnFailure: -6 },
    befriend: { dc: 14, dispositionOnSuccess: 5 },
    insult: { dispositionOnSuccess: -6 },
  },
  clientele: {
    regulars: ['npc-cargo-king', 'npc-admiral-stern', 'npc-zero-risk', 'npc-the-warden'],
    archetypes: ['veteran'],
  },
  prose: {
    houseName: 'the Standing Hall',
    tone: 'exotic',
    roomLine:
      'The Standing Hall keeps League colours over the bar at Deneb-4, and every face under them is a face the hall already knows.',
    flavour: {
      dare: 'They deal deep here, among themselves, and let you sit in if the coin is real.',
      befriend:
        'The hall takes a long look before it takes your hand — and then it does not let go.',
      insult: 'A slight to one of them is a slight to the League, and the League keeps the score.',
      rumor:
        'League business is discussed openly, which is how you know it is not the real business.',
      borrow: 'The desk is at the end of the hall, under the colours, and it lends to anyone.',
      repay: 'You clear the line where the whole hall can see the ledger close.',
    },
  },
};

/**
 * T-123 · Regulus-6 — the high table (§6.3, pass 2). THE MEASURABLY EXOTIC PORT,
 * and the F-101-1 measurement target.
 *
 * AXIS VECTOR: stakes and NOTHING ELSE structural — all seven venues, so the
 * port's identity rests on the one axis F-101-1 asks to be measured, and the
 * measurement is clean. Difficulty, consequence and clientele move too, but the
 * band is the port.
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 500/3000 — the FLOOR is half a Tour One captain's entire starting
 *     purse (`engine/state.ts:125`, credits 1,000) and the ceiling is three times
 *     the galaxy's. It is the only band in the game strictly outside the default
 *     envelope at BOTH ends, which is exactly §6.1's "a high-roller room whose
 *     `min` prices out a Tour One captain".
 *   - `befriend.dc` 15 (default 12) — the room is not unfriendly, it is simply not
 *     for everyone.
 *   - `insult.dispositionOnSuccess` −5 (default −4) — dearer than most, but the
 *     high table would rather ignore you than fight you.
 *   - `dare.dispositionOnSuccess` 1 (default 2) / `dispositionOnFailure` −3
 *     (default −2) — money lost at this table is not enough to buy warmth, and
 *     money won off it is remembered a little longer than elsewhere.
 *   - `clientele` `npc-nebula-rose` ("loves high society", the Hangout is her
 *     venue) and `npc-neon-fox` (GUILE 5, Treacherous), then `gambler` / `trader`.
 *
 * F-101-1 IS A LIVE FINDING AT THIS ROW, not an aspiration: the resolver caps
 * every stake at `min(band.max, player.credits, dealer.credits)`, so the 3,000
 * ceiling is only ever reached when both sides can cover it. The measurement of
 * realized-vs-declared stakes here is an explicit T-123 obligation and is written
 * up as the F-101-1 addendum in `docs/HANGOUT_REDESIGN.md` §7. The band is NOT
 * inflated to compensate for the gap; the gap is the finding.
 */
const REGULUS_6_HANGOUT: PortHangout = {
  systemId: 11,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 500, max: 3000 },
  venueParams: {
    dare: { dispositionOnSuccess: 1, dispositionOnFailure: -3 },
    befriend: { dc: 15 },
    insult: { dispositionOnSuccess: -5 },
  },
  clientele: { regulars: ['npc-nebula-rose', 'npc-neon-fox'], archetypes: ['gambler', 'trader'] },
  prose: {
    houseName: 'the High Table',
    tone: 'exotic',
    roomLine:
      'The High Table sits above the concourse at Regulus-6, and the smallest hand it will deal you costs more than a week of fuel.',
    flavour: {
      dare: 'The float on this table would buy your ship, and nobody at it looks up when it moves.',
      meet: 'Introductions are made by the house, in its own time, and not on your account.',
      befriend: 'The room is not unfriendly. It is simply not for everyone, and it knows which.',
      insult:
        'A rudeness here is answered by being looked past, which is worse than being answered.',
      rumor: 'What is said at this table moves prices three systems away by morning.',
      borrow: 'The desk here will lend you the same as anywhere — which buys one hand.',
      repay: 'You settle the marker quietly, because that is the only way anything is done here.',
    },
  },
};

/**
 * T-123 · Rigel-8 — the underbelly (§6.3, pass 2). THE OPPOSITE POLE TO THE HIGH
 * TABLE: the room that will deal you in for pocket change and take your whole
 * hold in the same evening.
 *
 * AXIS VECTOR: stakes (the WIDEST SPAN in the galaxy), difficulty (the cheapest
 * room anywhere to charm), consequence (the most expensive place bar the garrison
 * to say the wrong thing), clientele (`smuggler` + `gambler`). All seven venues —
 * the underbelly refuses nobody, which is the point.
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 10/3000 — §6.2's "a low `wager.min`, a high ceiling", and the widest
 *     span of any authored port. THE CEILING DELIBERATELY MATCHES THE HIGH
 *     TABLE'S: the money in this room is the same money, it simply arrived by a
 *     different route. What makes it the underbelly is the 10cr floor UNDER it —
 *     the same table will deal a spacer with nothing. (Mira-9's 5 is still the
 *     lowest floor in the galaxy; that is a dive, and a dive has no ceiling worth
 *     the name. This is the span, not the floor.)
 *   - `befriend.dc` 8 (default 12) — the cheapest room in the galaxy to charm.
 *     Nobody here is asking where you have been.
 *   - `insult.dispositionOnSuccess` −8 (default −4) — and the most expensive place
 *     to say the wrong thing, one short of the garrison's −9. The two costs
 *     together ARE the character: easy in, hard to leave.
 *   - `dare.dispositionOnFailure` −4 (default −2) — beating this house is noticed
 *     by people who notice things for a living.
 */
const RIGEL_8_HANGOUT: PortHangout = {
  systemId: 12,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 10, max: 3000 },
  venueParams: {
    dare: { dispositionOnFailure: -4 },
    befriend: { dc: 8 },
    insult: { dispositionOnSuccess: -8 },
  },
  clientele: { archetypes: ['smuggler', 'gambler'] },
  prose: {
    houseName: 'the Underhold',
    tone: 'dangerous',
    roomLine:
      'The Underhold is two decks below the Rigel-8 concourse, and the lifts that go down to it do not go anywhere else.',
    flavour: {
      dare: 'They will take a ten-credit hand off you at one table and a hold off you at the next.',
      meet: 'Names are given cheaply here and none of them are the right ones.',
      befriend: 'Nobody in the Underhold asks where you have been. That is what the room is for.',
      insult: 'You will be forgiven a great deal here, and never that.',
      rumor: 'Half of what is traded down here is cargo and the other half is what people know.',
      borrow: 'The desk keeps to the lit end of the room, which tells you about the rest of it.',
      repay: 'You pay it off and step back into the dark, square with at least one ledger.',
    },
  },
};

/**
 * T-123 · Vega-6 — the outfitters' long room (§6.3, pass 2). THE RETURNERS' PORT.
 *
 * `content/storylets.ts:2186` ("The Homecoming Gantry") already establishes
 * Vega-6 as the port that keeps a gantry lit for the ships coming back from the
 * deep runs. This row is that gantry's bar: a room with LONG MEMORIES, which
 * §6.3's axis note asks for and which is expressed as LARGE DELTAS IN BOTH
 * DIRECTIONS — the biggest positive arms in the galaxy sitting beside some of
 * the dearest negative ones.
 *
 * AXIS VECTOR: stakes (a high-floored, high-ceilinged band — outfitting money),
 * difficulty (hard to charm), consequence (large both ways), clientele (two named
 * returners + `veteran` / `explorer`).
 *
 * Every deviation from the default, with its reason:
 *   - `wager` 250/1500 — the long room bets what an outfitting bill costs. The
 *     floor prices out a captain who has not yet been anywhere.
 *   - `befriend.dc` 15 (default 12) / `dispositionOnSuccess` 6 (default 3) — the
 *     purest statement of the axis: hard to earn, and worth double when earned.
 *   - `insult.dispositionOnSuccess` −8 (default −4) — the same memory, pointed the
 *     other way.
 *   - `dare.dispositionOnSuccess` 4 (default 2) / `dispositionOnFailure` −4
 *     (default −2) — they like a captain who loses well and mind one who wins.
 *   - `meet.dispositionOnSuccess` 2 (default 1) — a returner is introduced
 *     properly here or not at all.
 *   - `clientele` `npc-star-gazer` and `npc-stellar-drift`, the roster's two
 *     `explorer` captains, then `veteran` / `explorer` behind them.
 */
const VEGA_6_HANGOUT: PortHangout = {
  systemId: 14,
  venues: ALL_HANGOUT_VENUES,
  wager: { min: 250, max: 1500 },
  venueParams: {
    dare: { dispositionOnSuccess: 4, dispositionOnFailure: -4 },
    meet: { dispositionOnSuccess: 2 },
    befriend: { dc: 15, dispositionOnSuccess: 6 },
    insult: { dispositionOnSuccess: -8 },
  },
  clientele: {
    regulars: ['npc-star-gazer', 'npc-stellar-drift'],
    archetypes: ['veteran', 'explorer'],
  },
  prose: {
    houseName: 'the Long Room',
    tone: 'exotic',
    roomLine:
      "The Long Room runs the length of the Vega-6 outfitters' hall, under the gantry they keep lit for the ships that come back.",
    flavour: {
      dare: 'They play long hands here, for outfitting money, and they remember every one of them.',
      meet: 'You are walked down the room and introduced properly, or you are not introduced at all.',
      befriend:
        'It takes a season to be counted a friend of the Long Room, and then it takes a lifetime to stop being one.',
      insult: 'They will still be telling that story about you when your ship has another name.',
      rumor: 'Deep-run crews come back through here, and they bring the far news with them.',
      borrow:
        "The desk is a chandler's desk as much as a lender's, and it knows what a refit costs.",
      repay: 'You clear it before you leave, because Vega-6 is a port you intend to come back to.',
    },
  },
};

/**
 * T-121 · A BASELINE ROW — a real venue definition that is not yet an authored
 * one. It carries `systemId` and `prose` and omits `venues`, `wager`,
 * `venueParams` and `clientele` entirely, so every number the resolver reads at
 * that port resolves field-wise through `DEFAULT_PORT_HANGOUT` to the same
 * imported constant Sun-3 reads. Thirteen ports got one at T-121; T-122 authored
 * over four of them (ids 2, 3, 8, 10) and T-123 over five more (ids 4, 5, 11, 12,
 * 14), so FOUR remain (6, 7, 9, 13), and those four are mechanically IDENTICAL to
 * each other and to Sun-3.
 *
 * WHY IDENTICAL, DELIBERATELY. T-121 is the REACH change — fourteen of
 * twenty-eight ports gain a bar — and the reach change is meant to be measurable
 * on its own. Had these thirteen rows also carried thirteen invented parameter
 * vectors, no moved golden and no moved roll-up could be attributed to reach
 * rather than to tuning, and the two halves would stop being separately
 * reviewable. §6.4's rule that no two ports share a mechanical tuple is graded at
 * T-122 … T-124, which overwrite these rows one at a time; identical baselines are
 * the correct state until then.
 *
 * NO BRANCH (§2.5): this builder is a straight-line expression. It reads the port
 * name off `STAR_SYSTEMS` so a renamed system cannot leave a stale house name
 * behind. Importing `./systems.js` here is acyclic — `systems.ts` imports nothing
 * from this module.
 */
function baselineHangout(systemId: number): PortHangout {
  return {
    systemId,
    prose: {
      houseName: `the ${STAR_SYSTEMS[systemId].name} Hangout`,
      tone: 'everyday',
      flavour: {},
    },
  };
}

/**
 * The port table, keyed by `STAR_SYSTEMS` id. `hasHangout` remains the
 * AUTHORITATIVE gate (§2.2 ruling 3) — this table never becomes it; the two-way
 * equality test in `packages/engine/src/__tests__/hangoutRules.test.ts` keeps the
 * two sets from drifting apart in either direction.
 *
 * FOURTEEN ROWS, TEN AUTHORED (T-122 pass 1 + T-123 pass 2, §6.3). Sun-3 carries
 * its own voice and, by §2.3, the default row's mechanics; Aldebaran-1, Altair-3,
 * Mira-9 and Procyon-5 (pass 1) and Arcturus-6, Deneb-4, Regulus-6, Rigel-8 and
 * Vega-6 (pass 2) carry authored voice AND their own axis vectors. The remaining
 * FOUR (6, 7, 9, 13) still carry a baseline row apiece and are therefore
 * mechanically indistinguishable from Sun-3 — T-124 authors them and closes the
 * table at 14. Written out key by key rather than generated from a range so the
 * table stays greppable and one line can be replaced at a time. The
 * rim (15–20), Andromeda (21–26), MALIGNA (27) and NEMESIS (28) are absent by
 * design — see the `hasHangout` note in `./systems.ts`.
 *
 * T-123 · THE TABLE IS NO LONGER UNIFORM IN ITS VENUE SET. Arcturus-6 (4) omits
 * `borrow`/`repay` and Deneb-4 (5) omits `meet`, so `venueOffered` stops being the
 * identity for the first time and the engine's `'venue-not-offered'` refusal is
 * reachable end to end. Readers that enumerate venues — `protocol.ts`'s
 * `legalActions`, the sim's lending planners — must ask `venueOffered` rather than
 * assume all seven.
 */
export const PORT_HANGOUTS: Readonly<Record<number, PortHangout>> = {
  1: SUN_3_HANGOUT,
  2: ALDEBARAN_1_HANGOUT,
  3: ALTAIR_3_HANGOUT,
  4: ARCTURUS_6_HANGOUT,
  5: DENEB_4_HANGOUT,
  6: baselineHangout(6),
  7: baselineHangout(7),
  8: MIRA_9_HANGOUT,
  9: baselineHangout(9),
  10: PROCYON_5_HANGOUT,
  11: REGULUS_6_HANGOUT,
  12: RIGEL_8_HANGOUT,
  13: baselineHangout(13),
  14: VEGA_6_HANGOUT,
};
