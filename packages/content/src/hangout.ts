/**
 * Spacers Hangout tuning — DATA, consumed by the engine (T-1303 "Spacers Hangout:
 * the place + Spacer's Dare", PRD §7 "Visit the Hangout", §7.3 / §7.5 sample
 * turns, §8.3 rumor table).
 *
 * The Hangout is a core PRD verb the player could never reach — only NPCs
 * `Socialize` there. T-1303 turns it into a real, die-costed player venue: a
 * wagered opposed-GUILE **Spacer's Dare** against an NPC actually present
 * in-system, plus social beats (meet / befriend / insult) that move that NPC's
 * disposition (feeding T-1204's now-live interception + tribute-DC readers) and a
 * rumor-table host slot. These numbers are the balance knobs for all of that.
 *
 * FOUNDATION (f2f95fa9): foundation has NO Hangout-as-place / Spacer's-Dare
 * PLAYER mechanic — its NPCs merely "Socialize" as an ambient verb, and
 * per-NPC player-disposition is itself engine-original (T-106 invented it). So
 * these constants carry no foundation citation: they are engine-original tuning,
 * sanctioned to live here per the TECH-STACK "balance numbers are data"
 * constraint — the same justification `disposition.ts` uses. They are sized to
 * the same scale as `DISPOSITION_DELTAS` there so a Hangout beat and an encounter
 * beat move standing comparably.
 *
 * READERS: the Dare/social resolver (`packages/engine/src/actions/hangout.ts`),
 * which the day loop dispatches (`day.ts`) and the UGT protocol advertises
 * (`packages/sim/src/protocol.ts` legalActions). Surfaced to the player by T-1404
 * (the Hangout pane / the named surfacing task per Standing-constraint 6).
 */

/** Minimum / maximum credits a player may put on a single Dare hand. The engine
 *  clamps the requested wager into this band AND down to what both the player and
 *  the dealer can actually cover, so a wager a broke dealer can't match is capped,
 *  never a crash. */
export const DARE_MIN_WAGER = 25;
export const DARE_MAX_WAGER = 500;

/**
 * Disposition the DEALER moves by after a Dare (T-1303). Both outcomes shift it —
 * a Dare is a memorable social event either way:
 *   - DARE_WIN_DISPOSITION (player WON, dealer LOST money): the dealer just lost
 *     credits to the spacer — a small sore-loser grudge (negative).
 *   - DARE_LOSS_DISPOSITION (player LOST money to the dealer): the dealer just
 *     won the spacer's stake and remembers them fondly (positive).
 * Sized below |DISPOSITION_DELTAS.defeat| (−5): a friendly game of chance is a far
 * milder mark than shooting someone's ship out from under them.
 */
export const DARE_WIN_DISPOSITION = -2;
export const DARE_LOSS_DISPOSITION = 2;

/** A successful `befriend` GUILE check warms the NPC (positive). On the tribute
 *  scale (+3): buying goodwill at the tables is worth about as much as paying an
 *  interceptor off. */
export const BEFRIEND_DISPOSITION = 3;

/** GUILE DC for the `befriend` check — a real roll (charm can fall flat), sized
 *  like the NPC socialize DC band. */
export const BEFRIEND_DC = 12;

/** An `insult` always lands — no check — and sours the NPC hard (negative). This
 *  is the literal PRD §7.4 seed ("Three weeks ago, at the Hangout, you laughed at
 *  his hand … Flaw — 'I never let an insult go'"). Sized to MATTER against the
 *  rebalanced T-1204 decay (DISPOSITION_DECAY_INTERVAL_DAYS): −4 survives several
 *  dusks, long enough to reach the interception grudge-weighting and the raised
 *  tribute/talk DC — the "now-real consequences" this task feeds. */
export const INSULT_DISPOSITION = -4;

/** A `meet` (introduction) nudges the NPC a single friendly step — a first
 *  handshake, not yet a bond. */
export const MEET_DISPOSITION = 1;

// ===========================================================================
// T-1501 · The rumor-table's authored beats (PRD §8.3 rumor table; the host slot
// T-1303 built). Before this task the two rumor phrasings lived INLINE in the
// engine (`packages/engine/src/actions/hangout.ts` `hangoutRumors`) — authored
// prose as engine logic, which Standing-constraint 4 keeps out of the engine.
// They move here as DATA: one authored template per live NPC action-type, each
// with a warm phrasing and a grudge (cold) phrasing so a rumor carries the
// gossip's tone off the NPC's LIVE disposition sign. The engine stays the pure
// interpolator (it fills the placeholders from live NPC fields and picks the
// warm/cold variant by disposition); it owns no prose.
//
// FOUNDATION (f2f95fa9): foundation has no rumor table (see the Hangout note
// above — the Hangout-as-place is engine-original), so these strings carry no
// foundation citation; they are authored Rimward content in the same period
// voice as the storylets.
//
// PLACEHOLDERS (filled by the engine): `{name}` the NPC's name, `{details}` the
// NPC's live `lastAction.details` clause (already a full verb phrase, e.g.
// "hauled Medicinals to Fomalhaut-2"), `{system}` the NPC's current system name.
// The details clause is embedded verbatim so a rumor names the real, simulated
// thing the NPC just did — the "renders a fact from LIVE NPC state" acceptance.
//
// READER: `hangoutRumors` (engine `actions/hangout.ts`), which the `rumor` and
// `meet` venues attach to their HangoutEvent, surfaced by the T-1404 Hangout
// pane (`ui/format.ts hangoutRumorLines`). Keys are the engine `NpcActionType`
// string literals; a `Record<string, …>` (not the engine enum) keeps content
// upstream of the engine, matching every action type the NPC sim can log.
// ===========================================================================

export interface RumorTemplate {
  /** Phrasing when the gossiped NPC bears the captain no grudge (disposition >= 0). */
  warm: string;
  /** Phrasing when the NPC holds a grudge (disposition < 0) — the room gossips colder. */
  cold: string;
}

export const RUMOR_TEMPLATES: Record<string, RumorTemplate> = {
  Trade: {
    warm: 'Word at the tables is {name} {details} — good hauling, they say, last heard out of {system}.',
    cold: 'They say {name} {details}, and half of {system} reckons the tally was crooked.',
  },
  Travel: {
    warm: 'Somebody swears {name} {details} — burning hard, last plotted out of {system}.',
    cold: "Nobody's glad {name} {details}; {system} was quieter before that transponder pinged.",
  },
  Combat: {
    warm: 'The wire has it {name} {details} — a name to stand behind, out around {system}.',
    cold: 'Watch yourself: {name} {details}, and the mood out of {system} is not a friendly one.',
  },
  Patrol: {
    warm: '{name} {details}, they say — a steady hand keeping the {system} lanes honest.',
    cold: "{name} {details}, and every runner out of {system} curses the badge while they're at it.",
  },
  Socialize: {
    warm: 'Everyone at {system} is still laughing about how {name} {details}.',
    cold: '{name} {details}, and left a sour taste on the whole {system} table.',
  },
  Idle: {
    warm: 'Quiet word is {name} {details} — laying low around {system} for now.',
    cold: '{name} {details}, brooding somewhere around {system}, and nobody wants to be the one to ask why.',
  },
  FlawOverride: {
    warm: 'The tables cannot stop retelling it: {name} {details}, right there off {system}.',
    cold: '{name} {details} — the kind of story {system} tells to warn the new hands.',
  },
};

/** Line for an NPC with no logged action yet (no `lastAction`). Uses `{name}`
 *  and `{system}` only — there is no details clause to embed. */
export const RUMOR_QUIET_TEMPLATE =
  '{name} is keeping quiet around {system} these days — nobody at the tables has a word on them.';

/** The degenerate empty-roster line, preserving the host slot's "always >= 1
 *  fact" guarantee when there is no one to gossip about. */
export const RUMOR_EMPTY_LINE = 'The tables are quiet tonight — no one worth gossiping about.';
