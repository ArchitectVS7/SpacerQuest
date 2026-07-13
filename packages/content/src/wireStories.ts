// ---------------------------------------------------------------------------
// Galactic News Wire — nat-20 / nat-1 story templates (T-1202, PRD §6).
//
// "A natural 20 or natural 1 always generates a story, and stories go out on the
//  Galactic News Wire." These are the AUTHORED lines the engine's wire scanner
//  (packages/engine/src/wire.ts) fills and emits as `WireEntry` events whenever
//  ANY check() — player or NPC — comes up a natural 20 or natural 1.
//
// Charter: this file is pure DATA. No logic, no state access. Placeholders are
// filled by the engine scanner:
//   {actor}     — the spacer whose check natted (an NPC name, or literal "Player")
//   {loser}     — a rival (gamble only): who lost the ship / cleaned-out mark
//   {loserShip} — that rival's ship name (gamble nat-20 only)
//
// The `gamble` nat-20[0] line is the verbatim PRD §6 sample and MUST stay exact:
//   "Lucky Seven wins the Fat Profit off Cargo King in a Spacer's Dare at the
//    Hangout. Cargo King unavailable for comment."
// (produced with actor=Lucky Seven, loserShip=Fat Profit, loser=Cargo King).
// ---------------------------------------------------------------------------

/** Which flavor bucket a natted check draws its story from. The engine scanner
 *  maps a StatCheck's actionContext (or, for context-less player/interceptor
 *  checks, its actor+stat) onto one of these. */
export type WireStoryCategory =
  'gamble' | 'trade' | 'travel' | 'combat' | 'patrol' | 'haggle' | 'storylet' | 'nav' | 'talk';

/** Authored nat-20 / nat-1 lines per category. Every category carries at least
 *  one of each so the "always generates a story" guarantee never hits an empty
 *  bucket. The scanner picks within a bucket with its seeded rng. */
export const NAT_WIRE_TEMPLATES: Record<
  WireStoryCategory,
  { nat20: readonly string[]; nat1: readonly string[] }
> = {
  gamble: {
    nat20: [
      // VERBATIM PRD §6 sample — do not reword. Index 0 by contract.
      "{actor} wins the {loserShip} off {loser} in a Spacer's Dare at the Hangout. {loser} unavailable for comment.",
      '{actor} cleaned out the whole table at the Hangout tonight — {loser} walked home broke.',
    ],
    nat1: [
      '{actor} bet the ship at the Hangout and lost the whole pot to {loser}. Ouch.',
      "{actor} gambled away a season's earnings to {loser} on one disastrous hand.",
    ],
  },
  trade: {
    nat20: ['{actor} turned a legendary profit on a single haul — the whole rim is talking.'],
    nat1: ['{actor} botched a delivery so badly the cargo is still floating out there somewhere.'],
  },
  travel: {
    nat20: ['{actor} threaded an impossible jump and shaved a full day off the lane.'],
    nat1: ['{actor} fumbled a jump and limped in on fumes, blaming the nav computer.'],
  },
  combat: {
    nat20: ['{actor} pulled off a flawless kill — one clean shot, no return fire.'],
    nat1: ['{actor} whiffed every shot and had to run for it, guns gone cold.'],
  },
  patrol: {
    nat20: ['{actor} ran a textbook sweep and hauled in a fat bounty for the trouble.'],
    nat1: ['{actor} patrolled empty lanes all day and came back with nothing but a fuel bill.'],
  },
  haggle: {
    nat20: [
      '{actor} talked a broker into the deal of the decade — the numbers barely fit the slate.',
    ],
    nat1: ['{actor} insulted a broker so thoroughly the whole exchange went quiet.'],
  },
  storylet: {
    nat20: ['{actor} came out of a tight spot smelling like a legend.'],
    nat1: ['{actor} made a call that will be told as a cautionary tale for years.'],
  },
  nav: {
    nat20: ['{actor} charted a flawless course through the dark — not a wasted drop of fuel.'],
    nat1: [
      '{actor} got badly turned around past the lanes and burned half a tank finding the way home.',
    ],
  },
  talk: {
    nat20: ['{actor} talked clean out of a shakedown without spending a single credit.'],
    nat1: ['{actor} said exactly the wrong thing to exactly the wrong spacer and made it worse.'],
  },
};
