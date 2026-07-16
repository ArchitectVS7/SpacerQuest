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
