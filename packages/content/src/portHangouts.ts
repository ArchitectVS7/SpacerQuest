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
 * T-121 · A BASELINE ROW — a real venue definition that is not yet an authored
 * one. It carries `systemId` and `prose` and omits `venues`, `wager`,
 * `venueParams` and `clientele` entirely, so every number the resolver reads at
 * that port resolves field-wise through `DEFAULT_PORT_HANGOUT` to the same
 * imported constant Sun-3 reads. Thirteen ports get one here, and they are
 * mechanically IDENTICAL to each other and to Sun-3.
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
 * FOURTEEN ROWS, ONE AUTHORED (T-121, §4.5). Sun-3 carries its own voice; ids 2–14
 * carry a baseline row apiece and are therefore mechanically indistinguishable
 * from it. Written out key by key rather than generated from a range so the table
 * stays greppable and T-122 … T-124 can replace exactly one line at a time. The
 * rim (15–20), Andromeda (21–26), MALIGNA (27) and NEMESIS (28) are absent by
 * design — see the `hasHangout` note in `./systems.ts`.
 */
export const PORT_HANGOUTS: Readonly<Record<number, PortHangout>> = {
  1: SUN_3_HANGOUT,
  2: baselineHangout(2),
  3: baselineHangout(3),
  4: baselineHangout(4),
  5: baselineHangout(5),
  6: baselineHangout(6),
  7: baselineHangout(7),
  8: baselineHangout(8),
  9: baselineHangout(9),
  10: baselineHangout(10),
  11: baselineHangout(11),
  12: baselineHangout(12),
  13: baselineHangout(13),
  14: baselineHangout(14),
};
