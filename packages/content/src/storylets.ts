import type { RenownRankId } from './deeds.js';
import type { FragmentSource } from './nemesis.js';
import { Stat } from './stats.js';
import { defineStorylets } from './storyletValidation.js';

export type EraId = 'TOUR_ONE' | 'VETERAN';
export type FlagValue = string | number | boolean;

export interface NumberMatcher {
  equals?: number;
  gte?: number;
  lte?: number;
}

export interface FlagMatcher {
  name: string;
  equals?: FlagValue;
  notEquals?: FlagValue;
  exists?: boolean;
  gte?: number;
  lte?: number;
}

export type FlagEffect =
  | { name: string; value: FlagValue }
  | { name: string; delta: number }
  | { name: string; clear: true };

export interface CargoContract {
  destination: number;
  cargoType: number;
  payment: number;
  pods: number;
  haggled?: boolean;
}

export interface StoryletTrigger {
  systemIds?: readonly number[];
  cargo?: {
    activeContractCargoType?: number;
    activeContractDestination?: number;
  };
  npc?: {
    id: string;
    inCurrentSystem?: boolean;
    disposition?: NumberMatcher;
  };
  eras?: readonly EraId[];
  day?: NumberMatcher;
  flags?: readonly FlagMatcher[];
  scheduledOnly?: boolean;
  /** T-111b: gate on the player's Nemesis file (Signal Fragments). Lets the
   *  Sage of Mizar-9 surface only when there is something to decode. */
  nemesis?: {
    /** Offered only when the file holds at least this many fragments. */
    minFragments?: number;
    /** Offered only when the file holds >=1 undecoded fragment. */
    hasUndecoded?: boolean;
    /** Offered only when the file holds THIS fragment id, still undecoded. */
    hasUndecodedFragmentId?: string;
  };
  /** T-1302: gate on the LIVE world era EVENT (`state.eraEvent`), NOT the
   *  campaign `EraId`. This is what lets a storylet be "delivered by the
   *  economy" (PRD §8.3) — a plague, a blockade, a price spike — rather than
   *  faked onto an ordinary contract. Reader: engine `triggerMatches`. */
  eraEvent?: {
    /** Active era event must have this defId (one of ERA_EVENTS). */
    defId?: string;
    /** Player's current system must be inside the event's affectedSystemIds. */
    inAffectedSystem?: boolean;
  };
  /** T-1302: gate on renown rank — offered only when the player's rank is at or
   *  above `minRank` in the RENOWN_RANK_ORDER. Reader: engine `triggerMatches`. */
  renown?: { minRank: RenownRankId };
  /** T-1302: gate on possessing an EARNED deed (registry.earned). Lets a
   *  storylet fire off a specific accomplishment. Reader: engine
   *  `triggerMatches`. */
  deed?: { id: string };
}

export interface StoryletEffects {
  credits?: number;
  fuel?: number;
  cargo?: {
    clearActiveContract?: true;
    addManifestContract?: CargoContract;
  };
  flags?: readonly FlagEffect[];
  disposition?: readonly { npcId: string; delta: number }[];
  deedProgress?: readonly { deedId: string; amount: number }[];
  schedule?: readonly { storyletId: string; delayDays: number }[];
  /** T-111b: grant a Signal Fragment into the nemesisFile (Wise One / a broker
   *  who does not know what they have). Dedupes by id — monotonic. */
  grantFragment?: string;
  /** T-1302: source recorded for the granted fragment (the `grantFragment`
   *  above). Defaults to 'wise-one' (the broker) when omitted, preserving the
   *  T-111b Day-30 hook's behavior. Reader: engine `applyEffects` grantFragment,
   *  which stamps it onto the SignalFragmentRecord and the FragmentAcquired
   *  event's `source`. */
  fragmentSource?: FragmentSource;
  /** T-111b: the Sage of Mizar-9 decodes a held fragment into lore. No-op if
   *  the fragment is absent or already decoded. */
  decodeFragment?: string;
}

export interface StoryletChoiceDefinition {
  id: string;
  label: string;
  prose: string;
  requirements?: {
    credits?: NumberMatcher;
    spendDie?: true;
    statCheck?: { stat: Stat; dc: number };
  };
  effects?: StoryletEffects;
  successEffects?: StoryletEffects;
  failureEffects?: StoryletEffects;
}

export interface StoryletDefinition {
  id: string;
  title: string;
  prose: string;
  repeat?: 'never' | 'daily';
  trigger: StoryletTrigger;
  choices: readonly StoryletChoiceDefinition[];
}

export const STORYLETS = defineStorylets([
  {
    id: 'cargo.medicinals.quarantine-seal',
    title: 'Quarantine Seal',
    prose:
      'A quarantine seal on the medicinal crates is half peeled back. The chill-gauge still glows, but the Guild stamp has been disturbed.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 4 },
      eras: ['TOUR_ONE'],
    },
    choices: [
      {
        id: 'inspect',
        label: 'Inspect the seal',
        prose:
          'Hold the crate steady, verify the chain of custody, and reseal the medicine before the cargo spoils.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
        successEffects: {
          credits: 250,
          flags: [{ name: 'cargo.medicinals.seal_verified', value: true }],
        },
        failureEffects: {
          credits: -100,
          cargo: { clearActiveContract: true },
          flags: [{ name: 'cargo.medicinals.seal_broken', value: true }],
        },
      },
      {
        id: 'leave',
        label: 'Leave it alone',
        prose: 'Log the seal as found and keep the hold temperature low.',
        effects: {
          flags: [{ name: 'cargo.medicinals.left_seal', value: true }],
        },
      },
    ],
  },
  {
    id: 'port.sun3.guild-auditor',
    title: 'Guild Auditor',
    prose:
      'A Guild auditor catches you at the Sun-3 gantry with a debt slate in one hand and a bored expression in the other.',
    repeat: 'never',
    trigger: {
      systemIds: [1],
      eras: ['TOUR_ONE'],
    },
    choices: [
      {
        id: 'pay',
        label: 'Pay the fee',
        prose: 'Settle the docking irregularity before it becomes a file with your name on it.',
        requirements: { credits: { gte: 75 }, spendDie: true },
        effects: {
          credits: -75,
          flags: [{ name: 'port.sun3.audit_paid', value: true }],
        },
      },
      {
        id: 'argue',
        label: 'Argue the code',
        prose:
          'Quote the Guild charter back at the auditor until the fee starts sounding optional.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          credits: 50,
          flags: [{ name: 'port.sun3.audit_outargued', value: true }],
        },
        failureEffects: {
          credits: -50,
          flags: [{ name: 'port.sun3.audit_warning', value: true }],
        },
      },
      {
        id: 'ignore',
        label: 'Ignore them',
        prose: 'Keep walking and let the gantry crowd swallow the conversation.',
        effects: {
          flags: [{ name: 'port.sun3.audit_ignored', value: true }],
        },
      },
    ],
  },
  {
    id: 'chain.doc-salvage.distress-ping',
    title: 'Distress Ping',
    prose:
      'Doc Salvage forwards a clipped rescue ping from the outer beacon net. The signal is old, but the medical code is real.',
    repeat: 'never',
    trigger: {
      systemIds: [1],
      npc: { id: 'npc-doc-salvage' },
      eras: ['TOUR_ONE'],
      flags: [{ name: 'chain.doc-salvage.ping_answered', exists: false }],
    },
    choices: [
      {
        id: 'answer',
        label: 'Answer the ping',
        prose: 'Promise Doc you will keep a channel open and burn a reply through the beacon net.',
        effects: {
          flags: [{ name: 'chain.doc-salvage.ping_answered', value: true }],
          schedule: [{ storyletId: 'chain.doc-salvage.follow-up', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Decline the ping',
        prose: 'The route is too thin today; send regrets and keep the drives warm.',
        effects: {
          flags: [{ name: 'chain.doc-salvage.ping_declined', value: true }],
        },
      },
    ],
  },
  {
    id: 'chain.doc-salvage.follow-up',
    title: 'Doc Salvage Reports Back',
    prose:
      'Doc Salvage answers a day later: your relay packet reached a rescue skiff, and one more life is back on the manifest.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-doc-salvage' },
      eras: ['TOUR_ONE'],
    },
    choices: [
      {
        id: 'accept-thanks',
        label: 'Accept the thanks',
        prose: 'Take the credit chit and let Doc know the channel stays open.',
        effects: {
          credits: 125,
          disposition: [{ npcId: 'npc-doc-salvage', delta: 2 }],
          deedProgress: [{ deedId: 'beacon_keeper', amount: 1 }],
          flags: [{ name: 'chain.doc-salvage.rescue_logged', value: true }],
        },
      },
      {
        id: 'refuse-payment',
        label: 'Refuse payment',
        prose: 'Tell Doc to spend the chit on bandages and beacon batteries.',
        effects: {
          disposition: [{ npcId: 'npc-doc-salvage', delta: 3 }],
          deedProgress: [{ deedId: 'beacon_keeper', amount: 1 }],
          flags: [{ name: 'chain.doc-salvage.payment_refused', value: true }],
        },
      },
    ],
  },

  // --- Tour One guild-pressure beats (T-113a) ---
  // The 30-day debt arc (PRD §5.1) surfaces as three timed wire messages from
  // the Merchant Guild of Sun-3: a first reminder (day 10), the marker coming
  // due (day 20), and a final notice (day 25). These author the PRESSURE only;
  // the day-30 debt-cleared/unpaid resolution and veteran-unlock branching is
  // T-113b. Each beat is one decision that records the captain's stance in a
  // flag. Not system-gated: a Guild wire follows you wherever you dock.
  {
    id: 'guild.pressure.tour-one.day10',
    title: 'The Ledger Reminds You',
    prose:
      'A Guild wire blinks onto the bridge feed: a debt slate, your name, and a countdown. Twenty days left on the marker. The clerk who sent it did not sign it.',
    repeat: 'never',
    trigger: {
      eras: ['TOUR_ONE'],
      day: { equals: 10 },
    },
    choices: [
      {
        id: 'acknowledge',
        label: 'Acknowledge the notice',
        prose: 'Stamp the receipt so the ledger knows a spacer, not a deadbeat, is reading it.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day10.acknowledged', value: true }],
        },
      },
      {
        id: 'dismiss',
        label: 'Flick it off the feed',
        prose: 'Clear the wire and keep the drives warm. The countdown runs either way.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day10.dismissed', value: true }],
        },
      },
    ],
  },
  {
    id: 'guild.pressure.tour-one.day20',
    title: 'The Marker Comes Due',
    prose:
      'The Guild wire is no longer polite. Ten days on the marker, it reads, and the interest line has grown a second digit. A collector name is attached this time.',
    repeat: 'never',
    trigger: {
      eras: ['TOUR_ONE'],
      day: { equals: 20 },
    },
    choices: [
      {
        id: 'reassure',
        label: 'Wire back a promise',
        prose: 'Tell the collector the coin is coming and mean it enough to be believed.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day20.reassured', value: true }],
        },
      },
      {
        id: 'stonewall',
        label: 'Say nothing',
        prose: 'Let the wire sit unanswered. Silence is a kind of answer the Guild files anyway.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day20.stonewalled', value: true }],
        },
      },
    ],
  },
  {
    id: 'guild.pressure.tour-one.day25',
    title: 'Final Notice',
    prose:
      'Five days. The wire arrives stamped in Guild red, and the language has stopped pretending: pay the marker by day thirty, or the name comes off the manifest board for good.',
    repeat: 'never',
    trigger: {
      eras: ['TOUR_ONE'],
      day: { equals: 25 },
    },
    choices: [
      {
        id: 'brace',
        label: 'Log it and run the numbers',
        prose:
          'Read the figure twice, close the wire, and start counting what the hold can still earn.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day25.braced', value: true }],
        },
      },
      {
        id: 'defy',
        label: 'Tell them to wait',
        prose:
          'Fire back that the marker gets paid on your schedule. Bravado is cheap; the Guild is not.',
        effects: {
          flags: [{ name: 'guild.pressure.tour-one.day25.defied', value: true }],
        },
      },
    ],
  },

  // T-1310: the economy-delivered vector that LEADS a player here — the Galactic-
  // Wire rumor `wire.rimward.polaris-signal` — is appended with the rest of the
  // T-1310 batch at the end of this table (batches append; see the storylet-content
  // validation test's ORIGINAL-prefix invariant).

  // --- Wise One of Polaris-1 hook (T-113a; windowed by T-1310) ---
  // At Polaris-1 (system 17) the Wise One sells the captain the first fragment of
  // the Nemesis Signal (frag-nemesis-01) — the SOLE grantor of that fragment and
  // the only key into the decode arc (PRD §8.1/§8.3). There is no dedicated Wise
  // One NPC in the cast (only the trader "Penny Wise"), so this gates on system +
  // day, not npc.
  //
  // T-1310 · DIVERGENCE from the T-113a day-30 design (and from foundation
  // f2f95fa9, which has no arc at all): the trigger was `eras:['TOUR_ONE'] +
  // day:{equals:30}`, a one-dawn knife-edge at a rim system no contract routed to.
  // Miss that single dawn and frag-nemesis-01 was gone for good. It is now a WINDOW
  // — `day:{gte:25}`, `repeat:'never'` — so it fires on the FIRST visit after day
  // 25, whenever that lands. The `eras` gate is DELIBERATELY REMOVED: the era flips
  // TOUR_ONE→VETERAN at dusk of day 30 (engine day.ts), so a late arrival (day 60+,
  // VETERAN era) must still open the arc — an eras gate would silently close it.
  //
  // T-111b: grants a REAL fragment (`grantFragment`) into the nemesisFile — the
  // knowledge item the Sage of Mizar-9 later decodes. Source defaults to 'wise-one'
  // (see engine applyEffects). The flag `signal.fragment.wise-one-01` is the
  // hook-completion marker other content/UI may branch on.
  {
    id: 'wise-one.polaris.signal-hook',
    title: 'The Wise One of Polaris-1',
    prose:
      'The Wise One keeps a cold cabin at the edge of Polaris-1 and a longer memory than the Guild. When you dock, the old spacer is already waiting with a data sliver held between two fingers. "A signal," they say, "from the wrong side of the black hole. You will want to hear the rest of it. That costs."',
    repeat: 'never',
    trigger: {
      systemIds: [17],
      day: { gte: 25 },
    },
    choices: [
      {
        id: 'buy-fragment',
        label: 'Buy the fragment',
        prose:
          'Count out the coin and take the sliver. The first fragment of the Nemesis Signal is yours, and it does not leave your head easily.',
        requirements: { credits: { gte: 500 } },
        effects: {
          credits: -500,
          grantFragment: 'frag-nemesis-01',
          flags: [{ name: 'signal.fragment.wise-one-01', value: true }],
        },
      },
      {
        id: 'haggle',
        label: 'Talk the price down',
        prose:
          'Argue that a nobody with a fresh debt is no mark. The Wise One almost smiles and halves the figure — but only almost.',
        requirements: { credits: { gte: 250 }, statCheck: { stat: Stat.GUILE, dc: 13 } },
        successEffects: {
          credits: -250,
          grantFragment: 'frag-nemesis-01',
          flags: [{ name: 'signal.fragment.wise-one-01', value: true }],
        },
        failureEffects: {
          flags: [{ name: 'wise-one.polaris.hook_rebuffed', value: true }],
        },
      },
      {
        id: 'walk-away',
        label: 'Walk away',
        prose:
          'Tell the old spacer the debt comes first. The sliver goes back in a pocket. "It will keep," they say. "It has kept this long."',
        effects: {
          flags: [{ name: 'wise-one.polaris.hook_declined', value: true }],
        },
      },
    ],
  },

  // --- The Sage of Mizar-9 — fragment decode broker (T-111b) ---
  // PRD §8.1: fragments are "decoded by the Sage." The Sage keeps a workshop at
  // Mizar-9 (system 18) and, per §7.2, "always talks when you bring something
  // new" — so this surfaces only when the file holds the Wise One's first
  // fragment still undecoded. Decoding turns raw signal into lore (the decoded-
  // lore index). Not era-gated: the crossing arc runs from Tour One onward.
  {
    id: 'sage.mizar.decode-first',
    title: 'The Sage of Mizar-9',
    prose:
      'The Sage of Mizar-9 works in a room walled with dead screens, each still faintly lit. When you produce the Wise One\'s sliver, the old cryptographer goes very still. "Where did you—no. Sit. This one I decode for free. I have waited a long time to hear the rest of it."',
    repeat: 'never',
    trigger: {
      systemIds: [18],
      nemesis: { hasUndecodedFragmentId: 'frag-nemesis-01' },
    },
    choices: [
      {
        id: 'decode',
        label: 'Let the Sage decode it',
        prose:
          'Hand over the sliver and watch the dead screens wake. The carrier wave resolves — and what it is counting down to settles into your Nemesis file, decoded.',
        effects: {
          decodeFragment: 'frag-nemesis-01',
          flags: [{ name: 'sage.mizar.first_decoded', value: true }],
        },
      },
      {
        id: 'withhold',
        label: 'Keep the sliver for now',
        prose:
          'Pocket the fragment. Some knowledge you want to carry a while before you understand it. The Sage nods, unsurprised. "It will keep. It always has."',
        effects: {
          flags: [{ name: 'sage.mizar.first_withheld', value: true }],
        },
      },
    ],
  },

  // T-1310: the Sage decode storylets for fragments 02–05 (the missing decode
  // paths that leave everything found by exploring stuck raw) are appended with the
  // rest of the T-1310 batch at the end of this table.

  // --- Derelict sealed-pod — the Contraband carrying choice (T-111b) ---
  // PRD §7.2: a boarded derelict can hold a sealed Contraband pod, and "carrying
  // it is a choice." The Explore loot roll surfaces the pod by setting the flag
  // `signal.contraband.pending`; this storylet (T-110 engine) is the decision.
  // repeat 'daily' + a flag-clear on every choice makes it re-armable across
  // days without ever re-firing on a stale flag.
  {
    id: 'derelict.sealed-pod',
    title: 'The Sealed Pod',
    prose:
      "Bolted into the derelict's hold is a sealed cargo pod, Guild stamps ground off, mag-locks still live. No manifest. Whatever is inside, someone did not want it logged — and someone else will pay not to ask.",
    repeat: 'daily',
    trigger: {
      flags: [{ name: 'signal.contraband.pending', exists: true }],
    },
    choices: [
      {
        id: 'take',
        label: 'Cut it loose and stow it',
        prose:
          'Burn the mag-locks and wrestle the pod into your hold. It is worth real coin to the right buyer — and a patrol captain who scans your hold will roll against you for it.',
        effects: {
          credits: 300,
          flags: [
            { name: 'signal.contraband.pending', clear: true },
            { name: 'signal.contraband.carrying', value: true },
          ],
        },
      },
      {
        id: 'leave',
        label: 'Leave it bolted down',
        prose:
          'Some cargo is not worth the questions. Log the pod, seal the hatch, and burn for open lanes clean.',
        effects: {
          flags: [
            { name: 'signal.contraband.pending', clear: true },
            { name: 'signal.contraband.left', value: true },
          ],
        },
      },
    ],
  },

  // --- Day-30 Tour One resolution (T-113b) ---
  // The decisive Day-30 beat (PRD §5.1) resolves in the engine (day.ts): at the
  // dusk of day 30 it inspects the debt, emits TourOneResolved, and sets the
  // discriminator flag `tour-one.resolved` to 'cleared' or 'unpaid'. These two
  // storylets are the AUTHORED face of that outcome — forced deterministically
  // by triggering on that flag (never on their own), so exactly one surfaces at
  // the next dawn through the standard eligibility refresh. Not era-gated: they
  // are the transition itself, and stay offered until the captain acknowledges
  // them. They are pure acknowledgements — no debt/credit effects — so they can
  // never re-open or clobber the engine's resolution.
  {
    id: 'resolution.tour-one.cleared',
    title: 'The Marker Closes',
    prose:
      'The Guild slate blinks from red to clear and stays there. Thirty days ago you were a name attached to a number; now the number is gone and the name is the only thing left on the ledger. The veteran lanes do not send a welcome. They just open.',
    repeat: 'never',
    trigger: {
      flags: [{ name: 'tour-one.resolved', equals: 'cleared' }],
    },
    choices: [
      {
        id: 'log-it',
        label: 'Log the discharge and set a heading',
        prose:
          'Stamp the closed marker into the ship log, pour something bitter, and start reading the far lanes off the chart.',
        effects: {
          flags: [{ name: 'resolution.tour-one.cleared.logged', value: true }],
        },
      },
      {
        id: 'wire-the-guild',
        label: 'Wire the Guild a two-word reply',
        prose:
          'Send the collector the shortest message the protocol allows. Let them read into it whatever they like.',
        effects: {
          flags: [{ name: 'resolution.tour-one.cleared.signed-off', value: true }],
        },
      },
    ],
  },
  {
    id: 'resolution.tour-one.unpaid',
    title: 'The Marker Stands',
    prose:
      'Day thirty closes with the slate still red. The Guild does not seize the ship — a grounded spacer pays back nothing — but the shortfall is filed, the interest keeps running, and your name now carries a flag every port clerk can see. You fly on. Indebted, but flying.',
    repeat: 'never',
    trigger: {
      flags: [{ name: 'tour-one.resolved', equals: 'unpaid' }],
    },
    choices: [
      {
        id: 'keep-flying',
        label: 'Keep the drives warm and the hold working',
        prose:
          'The debt is a number that follows you, not a wall that stops you. Line up the next manifest and burn.',
        effects: {
          flags: [{ name: 'resolution.tour-one.unpaid.pressing-on', value: true }],
        },
      },
      {
        id: 'curse-the-guild',
        label: 'Log a grievance you will never send',
        prose:
          'Write the Guild the message they deserve, save it to the drafts you never transmit, and get back to work.',
        effects: {
          flags: [{ name: 'resolution.tour-one.unpaid.defiant', value: true }],
        },
      },
    ],
  },

  // ===========================================================================
  // T-401 · Storylet batch — cargo & passengers (25). PRD §8.3 register: short,
  // one decision, delivered by the ECONOMY (a signed contract, a berth, a wire),
  // never a quest marker. Includes the three PRD exemplars: the plague-relief
  // run, the passenger with the false name, and the crate that ticks.
  //
  // AUTHORING CONVENTIONS (enforced by tests in engine/storylets.test.ts):
  //  - Every storylet carries at least one REQUIREMENT-FREE choice, so a day can
  //    always be resolved and no storylet ever dead-ends the day.
  //  - "Held state" flags use the namespaces `passenger.*.aboard` and
  //    `cargo.*.riding`. Every one has a reachable CLEARER: a scheduled follow-up
  //    (a passenger arrival, the ticking-crate aftermath) that fires a day or two
  //    later regardless of location, so a fare you never "deliver" still resolves.
  //
  // REACHABILITY DIVERGENCES (the economy delivers the story within the existing
  // engine — no schema/engine change, per the T-401 plan):
  //  - PASSENGERS have no engine contract type. A fare is modelled purely as
  //    flags: a system-gated BOARD storylet sets `passenger.<slug>.aboard` and
  //    SCHEDULES a scheduledOnly ARRIVAL that pays out and clears the flag. This
  //    matches PRD §7.2 (the false-name passenger "pays her fare in coordinates"
  //    the NEXT day), and the scheduled arrival guarantees the fare always
  //    resolves — reachable by play, never a soft dead-end.
  //  - PASSENGER arrivals resolve a day later via a scheduledOnly follow-up.
  //
  // (T-1302 update — the two exemplars below are NO LONGER divergences: the
  //  storylet schema now carries real era-event / cargo-contract triggers, so
  //  both fire on their genuine PRD hooks rather than a faked stand-in.)
  //  - The PLAGUE-RELIEF exemplar (PRD §7.1, §8.3) is now delivered by the REAL
  //    `plague` era event: a Medicinals (type 4) contract carried while an
  //    Orbital Fever is live AND the ship is IN the afflicted system
  //    (`trigger.eraEvent = { defId: 'plague', inAffectedSystem: true }`). The
  //    plague epicentre is the scheduler's seeded core system, not a fixed port,
  //    so the destination gate is gone.
  //  - The TICKING-CRATE exemplar (PRD §8.3) now rides a REAL Contraband
  //    (type 10) contract — the smuggling cargo T-1104 issues from the
  //    ungoverned rim (`allowsContraband` ports). The unlabelled crate is wedged
  //    among sealed contraband, exactly the "crate that ticks" the PRD names.
  //
  // BALANCE: these are new content, not ported from foundation/rules/ (which
  // carries no storylet constants). Credit/fuel deltas sit in the band the
  // original 12 use (~50–500cr; the Medicinals verify pays 250).
  // ===========================================================================

  // --- Cargo-attached (gate on the active contract\'s cargo type) ---
  {
    id: 'cargo.dry-goods.short-count',
    title: 'A Generous Tally',
    prose:
      'A dockhand leans on your Dry Goods pallet and offers to adjust the tally on the way in — a few crates skimmed off the top, the manifest none the wiser, the difference split down the middle.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 1 },
    },
    choices: [
      {
        id: 'take-the-skim',
        label: 'Take the skim',
        prose: 'Nod once, pocket the difference, and let the count come up short.',
        effects: {
          credits: 120,
          flags: [{ name: 'cargo.dry-goods.skimmed', value: true }],
        },
      },
      {
        id: 'wave-him-off',
        label: 'Wave him off',
        prose: 'Every crate goes across as logged. He shrugs and finds another mark.',
        effects: {
          flags: [{ name: 'cargo.dry-goods.clean_count', value: true }],
        },
      },
      {
        id: 'report-him',
        label: 'Report the offer',
        prose: "Flag the dockhand to the depot master and see if honesty pays a finder's fee.",
        requirements: { statCheck: { stat: Stat.GUILE, dc: 11 } },
        successEffects: {
          credits: 80,
          flags: [{ name: 'cargo.dry-goods.reported', value: true }],
        },
        failureEffects: {
          flags: [{ name: 'cargo.dry-goods.report_ignored', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.nutri-goods.spoilage-scare',
    title: 'The Chill Fails',
    prose:
      'A coolant alarm shrills over the Nutri Goods hold. The load is warming, and the depot repair queue runs hours deep.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 2 },
    },
    choices: [
      {
        id: 'patch-the-coil',
        label: 'Patch the coolant coil',
        prose:
          'Get an arm into the coil housing and hold the chill together by hand and stubbornness.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
        successEffects: {
          credits: 100,
          flags: [{ name: 'cargo.nutri-goods.saved', value: true }],
        },
        failureEffects: {
          credits: -80,
          flags: [{ name: 'cargo.nutri-goods.spoiled', value: true }],
        },
      },
      {
        id: 'eat-the-loss',
        label: 'Vent the warm crates',
        prose: 'Dump what has turned before it sours the rest, and log the shrinkage.',
        effects: {
          credits: -40,
          flags: [{ name: 'cargo.nutri-goods.vented', value: true }],
        },
      },
      {
        id: 'sell-quick',
        label: 'Sell it warm and quick',
        prose: 'Offload the softening load to a bargain buyer who does not ask about the gauge.',
        effects: {
          credits: 60,
          flags: [{ name: 'cargo.nutri-goods.dumped', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.spices.customs-sniff',
    title: 'The Customs Dog',
    prose:
      'A customs hound sits down hard beside your Spices pallet and will not be moved. The inspector strolls over, unhurried, already reaching for a form.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 3 },
    },
    choices: [
      {
        id: 'bluff',
        label: 'Bluff it through',
        prose: "Meet the inspector's eye and talk about the weather until the dog looks foolish.",
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          flags: [{ name: 'cargo.spices.waved_through', value: true }],
        },
        failureEffects: {
          credits: -100,
          flags: [{ name: 'cargo.spices.fined', value: true }],
        },
      },
      {
        id: 'pay-the-fee',
        label: 'Pay the inspection fee',
        prose: 'Slide the "expedited handling" fee across before the paperwork multiplies.',
        requirements: { credits: { gte: 60 } },
        effects: {
          credits: -60,
          flags: [{ name: 'cargo.spices.fee_paid', value: true }],
        },
      },
      {
        id: 'open-up',
        label: 'Open the pallet',
        prose: 'Let them search. The load is clean; it only costs you an hour and your patience.',
        effects: {
          flags: [{ name: 'cargo.spices.inspected', value: true }],
        },
      },
    ],
  },
  {
    // PLAGUE-RELIEF EXEMPLAR (PRD §7.1, §8.3). T-1302: delivered by the REAL
    // `plague` era event (Orbital Fever) — surfaces when a Medicinals (type 4)
    // contract is carried INTO the afflicted system while the fever is live
    // (`eraEvent: { defId: 'plague', inAffectedSystem: true }`). The economy
    // itself delivers the story: the plague spikes medicine rates ×2.5 (era.ts),
    // and a profiteer circles the desperate. "Run it in" KEEPS the contract, so
    // the honest delivery earns its Deed naturally on arrival; "sell to the
    // profiteer" CLEARS it (no delivery) for raw coin — the two-priced values
    // choice the PRD describes.
    id: 'cargo.medicinals.plague-relief',
    title: 'The Fever Run',
    prose:
      'The port you have made is running a fever, and the Medicinals in your hold are the relief run. A profiteer wires an offer before you have even cleared the gantry: sell him the lot, here, now, no questions and no shortage of coin.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 4 },
      eraEvent: { defId: 'plague', inAffectedSystem: true },
    },
    choices: [
      {
        id: 'run-it-in',
        label: 'Run it in fast',
        prose:
          'Burn hard for the outbreak and let the profiteer keep his coin. The relief line is waiting, and word of who carried it travels.',
        effects: {
          fuel: -20,
          disposition: [{ npcId: 'npc-doc-salvage', delta: 1 }],
          flags: [{ name: 'cargo.medicinals.plague-relief.running', value: true }],
        },
      },
      {
        id: 'sell-to-profiteer',
        label: 'Sell to the profiteer',
        prose:
          "Take the man's coin and let the fever find its medicine elsewhere. The cargo leaves your hold clean, and a little of your name goes with it.",
        effects: {
          credits: 300,
          cargo: { clearActiveContract: true },
          flags: [{ name: 'cargo.medicinals.plague-relief.sold', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.electronics.gray-market-buyer',
    title: 'The Quiet Buyer',
    prose:
      'A fence sidles up at the dock: your Electronics would fetch double off the books, delivered quietly to no one who will ever ask where they came from.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 5 },
    },
    choices: [
      {
        id: 'sell-off-book',
        label: 'Sell off the books',
        prose: 'Divert the crates to the fence and let the manifest read whatever it needs to.',
        effects: {
          credits: 200,
          cargo: { clearActiveContract: true },
          flags: [{ name: 'cargo.electronics.gray_market', value: true }],
        },
      },
      {
        id: 'deliver-clean',
        label: 'Deliver them clean',
        prose: 'Wave the fence off. The load goes where the contract says it goes.',
        effects: {
          flags: [{ name: 'cargo.electronics.clean', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.precious-metals.escort-shakedown',
    title: 'A Security Escort',
    prose:
      'A "security escort" latches onto your Precious Metals run halfway out and names their fee for the safe passage you never asked them to provide.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 6 },
    },
    choices: [
      {
        id: 'pay-the-toll',
        label: 'Pay the toll',
        prose: 'Buy the trouble off before it decides to become the trouble.',
        requirements: { credits: { gte: 80 } },
        effects: {
          credits: -80,
          flags: [{ name: 'cargo.precious-metals.toll_paid', value: true }],
        },
      },
      {
        id: 'face-them-down',
        label: 'Face them down',
        prose: "Open the gun ports a hand's width and ask, evenly, whether they feel lucky.",
        requirements: { statCheck: { stat: Stat.GRIT, dc: 12 } },
        successEffects: {
          flags: [{ name: 'cargo.precious-metals.stared_down', value: true }],
        },
        failureEffects: {
          credits: -120,
          flags: [{ name: 'cargo.precious-metals.shaken_down', value: true }],
        },
      },
      {
        id: 'run-for-it',
        label: 'Gun it and lose them',
        prose: 'Burn a little extra and lose the escort in the traffic lanes.',
        effects: {
          fuel: -10,
          flags: [{ name: 'cargo.precious-metals.outran', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.rare-elements.assay-dispute',
    title: "The Assayer's Verdict",
    prose:
      'The receiving assayer squints at your Rare Elements, declares them under-grade, and offers a "corrected" price so low it is nearly an insult with a number attached.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 7 },
    },
    choices: [
      {
        id: 'argue-the-grade',
        label: 'Argue the grade',
        prose: 'Quote the assay standard back at them, line and clause, until the number moves.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          credits: 100,
          flags: [{ name: 'cargo.rare-elements.held_price', value: true }],
        },
        failureEffects: {
          credits: -90,
          flags: [{ name: 'cargo.rare-elements.marked_down', value: true }],
        },
      },
      {
        id: 'accept-the-cut',
        label: 'Accept the cut',
        prose: 'Take the lowball and log it. Some ports you do not fight twice.',
        effects: {
          credits: -60,
          flags: [{ name: 'cargo.rare-elements.accepted_cut', value: true }],
        },
      },
      {
        id: 'split-the-difference',
        label: 'Split the difference',
        prose: 'Meet the assayer in the middle and shake on a number you both can live with.',
        effects: {
          credits: 20,
          flags: [{ name: 'cargo.rare-elements.split', value: true }],
        },
      },
    ],
  },
  {
    id: 'cargo.photonic.calibration-drift',
    title: 'Out of Calibration',
    prose:
      'The Photonic Components read out of true halfway through the run. Deliverable as they are — but worth more to a buyer if you can retune them cold before you dock.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 8 },
    },
    choices: [
      {
        id: 'retune',
        label: 'Retune them cold',
        prose: 'Spend a steady stretch bringing the array back to spec by hand.',
        requirements: { spendDie: true },
        effects: {
          credits: 150,
          flags: [{ name: 'cargo.photonic.retuned', value: true }],
        },
      },
      {
        id: 'deliver-as-is',
        label: 'Deliver them as they are',
        prose: 'Hand them over uncalibrated and let the buyer sort the drift.',
        effects: {
          flags: [{ name: 'cargo.photonic.as_is', value: true }],
        },
      },
    ],
  },
  {
    // TICKING-CRATE EXEMPLAR head (PRD §8.3). T-1302: now rides a REAL Contraband
    // (type 10) contract — the smuggling cargo T-1104 issues from the ungoverned
    // rim (`allowsContraband` ports). "Ride it out" is the requirement-free
    // chaining choice: it schedules the aftermath for the next dawn.
    id: 'cargo.ticking-crate.discovered',
    title: 'The Crate That Ticks',
    prose:
      'Wedged among the sealed contraband is a crate that is not on your manifest — no manifest lists any of this. It is ticking, slow and even and deliberate, and it was not doing that when you took the run.',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 10 },
    },
    choices: [
      {
        id: 'jettison',
        label: 'Jettison it now',
        prose:
          "Blow the hold clamp and throw the ticking thing out into the black. Whatever it was, it is the black's problem now.",
        effects: {
          flags: [{ name: 'cargo.ticking-crate.jettisoned', value: true }],
        },
      },
      {
        id: 'crack-it-open',
        label: 'Crack it open',
        prose: 'Get a bar under the lid and find out what has been counting.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 13 } },
        successEffects: {
          credits: 180,
          flags: [{ name: 'cargo.ticking-crate.cracked', value: true }],
        },
        failureEffects: {
          fuel: -20,
          flags: [{ name: 'cargo.ticking-crate.misfired', value: true }],
        },
      },
      {
        id: 'ride-it-out',
        label: 'Ride it out',
        prose: 'Seal the hold, set a watch on it, and see what the ticking is counting down to.',
        effects: {
          flags: [{ name: 'cargo.ticking-crate.riding', value: true }],
          schedule: [{ storyletId: 'cargo.ticking-crate.aftermath', delayDays: 1 }],
        },
      },
    ],
  },
  {
    // TICKING-CRATE follow-up (scheduledOnly; scheduled by "ride it out" above).
    // Clears the `cargo.ticking-crate.riding` held-state flag on every path.
    id: 'cargo.ticking-crate.aftermath',
    title: 'The Ticking Stops',
    prose:
      'At dawn the crate goes quiet. Whatever it was counting down to has arrived, and the silence in the hold is somehow louder than the ticking was.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
    },
    choices: [
      {
        id: 'open-it',
        label: 'Open the silent crate',
        prose:
          'Crack the lid on the quiet. Inside: a dead-man courier drop, coin sealed against a rendezvous that never came — and, folded beneath it, a data sliver still faintly transmitting on a carrier that predates the Confederation.',
        // T-1302: the recovered courier sliver is a REAL Signal Fragment. Its
        // source is 'derelict' — a signal recovered from dead cargo, NOT the
        // Wise One broker — so this doubles as the "fragments record their true
        // source" proof (contrast the Day-30 Wise One hook's 'wise-one').
        effects: {
          credits: 200,
          grantFragment: 'frag-nemesis-02',
          fragmentSource: 'derelict',
          flags: [
            { name: 'cargo.ticking-crate.riding', clear: true },
            { name: 'cargo.ticking-crate.claimed', value: true },
          ],
        },
      },
      {
        id: 'space-it',
        label: 'Space it unopened',
        prose: 'You have had enough of it. Vent the crate to the dark and do not look back.',
        effects: {
          flags: [
            { name: 'cargo.ticking-crate.riding', clear: true },
            { name: 'cargo.ticking-crate.spaced', value: true },
          ],
        },
      },
    ],
  },

  // --- Passenger fares (modelled as flags: a system-gated board, a scheduled
  //     arrival that pays out and clears the aboard flag) ---
  {
    // FALSE-NAME EXEMPLAR head (PRD §7.2, §8.3). Boards at Altair-3 (system 3).
    id: 'passenger.false-name.board',
    title: 'The Woman With No Name',
    prose:
      'A woman books passage under a name the manifest plainly does not believe — "Jane Smith," paid in old coin, no baggage but a locked case she will not set down.',
    repeat: 'never',
    trigger: {
      systemIds: [3],
    },
    choices: [
      {
        id: 'take-aboard',
        label: 'Take her aboard',
        prose:
          'Log the false name without comment and clear a berth. Her business is her business.',
        effects: {
          flags: [{ name: 'passenger.false-name.aboard', value: true }],
          schedule: [{ storyletId: 'passenger.false-name.arrival', delayDays: 1 }],
        },
      },
      {
        id: 'refuse',
        label: 'Refuse the fare',
        prose:
          'Tell her the berth is spoken for. She does not argue; people who lie about their names rarely do.',
        effects: {
          flags: [{ name: 'passenger.false-name.refused', value: true }],
        },
      },
      {
        id: 'probe-her-story',
        label: 'Probe her story',
        prose: 'Ask an idle question or two and watch which ones land wrong.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 1 }],
          flags: [{ name: 'passenger.false-name.probed', value: true }],
        },
        failureEffects: {
          flags: [{ name: 'passenger.false-name.bolted', value: true }],
        },
      },
    ],
  },
  {
    // FALSE-NAME payoff (scheduledOnly; scheduled by "take her aboard"). Per PRD
    // §7.2 she "pays her fare in coordinates." The lead flag
    // `passenger.false-name.coordinates` is a narrative hook for future
    // exploration content (nothing consumes it yet) — set alongside the coin.
    id: 'passenger.false-name.arrival',
    title: 'Paid in Coordinates',
    prose:
      'A day out, "Jane Smith" settles her fare the way she said she would — not in coin alone, but in a string of numbers off every chart, pressed into your hand with a look that says do not ask.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      flags: [{ name: 'passenger.false-name.aboard', exists: true }],
    },
    choices: [
      {
        id: 'take-the-coordinates',
        label: 'Take the coordinates',
        prose:
          'Pocket the coin and log the numbers. Whatever waits out there, it is yours to find now.',
        effects: {
          credits: 150,
          flags: [
            { name: 'passenger.false-name.aboard', clear: true },
            { name: 'passenger.false-name.coordinates', value: true },
          ],
        },
      },
      {
        id: 'coin-only',
        label: 'Take only the coin',
        prose: 'Wave the numbers away. Some coordinates are worth more trouble than they pay.',
        effects: {
          credits: 100,
          flags: [
            { name: 'passenger.false-name.aboard', clear: true },
            { name: 'passenger.false-name.coin_only', value: true },
          ],
        },
      },
    ],
  },
  {
    id: 'passenger.pilgrim.board',
    title: "A Pilgrim's Passage",
    prose:
      'A pilgrim in threadbare robes asks passage toward the inner shrine worlds, offering what little coin they carry and a great deal of blessing they carry more freely.',
    repeat: 'never',
    trigger: {
      systemIds: [5],
    },
    choices: [
      {
        id: 'take-aboard',
        label: 'Clear a berth',
        prose: 'Wave the pilgrim aboard and stow their small bundle by the airlock.',
        effects: {
          flags: [{ name: 'passenger.pilgrim.aboard', value: true }],
          schedule: [{ storyletId: 'passenger.pilgrim.arrival', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Decline',
        prose: 'The route is wrong today. Send them on with a nod and no fare.',
        effects: {
          flags: [{ name: 'passenger.pilgrim.declined', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.pilgrim.arrival',
    title: "The Shrine Road's End",
    prose:
      "You set the pilgrim down at journey's end. They press their fare into your hand and, on top of it, a small carved icon for the dash — for luck on the lanes, they say.",
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      flags: [{ name: 'passenger.pilgrim.aboard', exists: true }],
    },
    choices: [
      {
        id: 'accept-fare',
        label: 'Accept the fare',
        prose: 'Take the coin and the icon both, and mean the thanks.',
        effects: {
          credits: 90,
          flags: [
            { name: 'passenger.pilgrim.aboard', clear: true },
            { name: 'passenger.pilgrim.carried', value: true },
          ],
        },
      },
      {
        id: 'take-only-blessing',
        label: 'Take only the blessing',
        prose: 'Fold their coin back into their hand. Keep the icon; leave them the fare.',
        effects: {
          flags: [
            { name: 'passenger.pilgrim.aboard', clear: true },
            { name: 'passenger.pilgrim.gifted', value: true },
          ],
        },
      },
    ],
  },
  {
    id: 'passenger.fugitive.board',
    title: 'No Logbook Entry',
    prose:
      'A hard-eyed spacer wants a berth and no logbook entry, and pays up front to guarantee both. Somewhere behind them, someone is asking the docks polite questions.',
    repeat: 'never',
    trigger: {
      systemIds: [9],
    },
    choices: [
      {
        id: 'take-aboard',
        label: 'Take the fare, keep the silence',
        prose: 'Pocket the up-front coin and leave the manifest blank where their name would go.',
        effects: {
          credits: 80,
          flags: [
            { name: 'passenger.fugitive.aboard', value: true },
            { name: 'passenger.fugitive.risky', value: true },
          ],
          schedule: [{ storyletId: 'passenger.fugitive.arrival', delayDays: 1 }],
        },
      },
      {
        id: 'refuse',
        label: 'Refuse the fare',
        prose: 'Whoever they are running from, you would rather not inherit. Send them on.',
        effects: {
          flags: [{ name: 'passenger.fugitive.refused', value: true }],
        },
      },
      {
        id: 'question-them',
        label: 'Ask who is hunting them',
        prose: 'Before you commit the berth, find out exactly what you would be carrying.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          flags: [{ name: 'passenger.fugitive.learned', value: true }],
        },
        failureEffects: {
          flags: [{ name: 'passenger.fugitive.walked', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.fugitive.arrival',
    title: 'A Clean Slip',
    prose:
      'Two jumps on, your passenger slips the berth clean. No patrol ever hailed you. They leave more coin than promised and a name to drop if you are ever cornered in the wrong port.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      flags: [{ name: 'passenger.fugitive.aboard', exists: true }],
    },
    choices: [
      {
        id: 'take-the-coin',
        label: 'Take the coin and the name',
        prose: 'Pocket the extra and file the name away where you keep such things.',
        effects: {
          credits: 150,
          flags: [
            { name: 'passenger.fugitive.aboard', clear: true },
            { name: 'passenger.fugitive.delivered', value: true },
          ],
        },
      },
      {
        id: 'refuse-extra',
        label: 'Refuse the extra',
        prose: 'The fare was the fare. Wave off the bonus and the debt it would imply.',
        effects: {
          flags: [
            { name: 'passenger.fugitive.aboard', clear: true },
            { name: 'passenger.fugitive.no_debt', value: true },
          ],
        },
      },
    ],
  },
  {
    id: 'passenger.orphan.board',
    title: 'A Thin Fare',
    prose:
      'A dock matron asks you to carry an orphaned child rimward to the only kin they have left. The fare she offers is thin; the look she gives you is not.',
    repeat: 'never',
    trigger: {
      systemIds: [11],
    },
    choices: [
      {
        id: 'take-aboard',
        label: 'Take the child aboard',
        prose: 'Clear the spare berth, promise the matron plainly, and mean it.',
        effects: {
          flags: [{ name: 'passenger.orphan.aboard', value: true }],
          schedule: [{ storyletId: 'passenger.orphan.arrival', delayDays: 2 }],
        },
      },
      {
        id: 'decline',
        label: 'Decline the fare',
        prose:
          'The rimward run is wrong for you this week. She nods, unsurprised, and does not push.',
        effects: {
          flags: [{ name: 'passenger.orphan.declined', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.orphan.arrival',
    title: 'Delivered to Kin',
    prose:
      "You deliver the child into an aunt's arms at the end of the line. The family has little, but they empty most of it into your hand before you can refuse.",
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      flags: [{ name: 'passenger.orphan.aboard', exists: true }],
    },
    choices: [
      {
        id: 'accept-fare',
        label: 'Accept the fare',
        prose: 'Take what they offer, because refusing would cost them more than the coin.',
        effects: {
          credits: 70,
          flags: [
            { name: 'passenger.orphan.aboard', clear: true },
            { name: 'passenger.orphan.delivered', value: true },
          ],
        },
      },
      {
        id: 'refuse-fare',
        label: 'Leave them the coin',
        prose:
          "Fold the fare back into the aunt's hand. They will need it more than the drives will.",
        effects: {
          flags: [
            { name: 'passenger.orphan.aboard', clear: true },
            { name: 'passenger.orphan.gifted', value: true },
          ],
        },
      },
    ],
  },
  {
    id: 'passenger.medic.board',
    title: 'A Lift for a Medic',
    prose:
      'A field medic needs a fast lift toward a fever station and will pay in kind — a hold scrub, a wound patched, a favour logged with the relief effort.',
    repeat: 'never',
    trigger: {
      systemIds: [6],
    },
    choices: [
      {
        id: 'take-aboard',
        label: 'Give them the lift',
        prose: 'Clear a berth and burn for the fever line. Someone out there is counting hours.',
        effects: {
          flags: [{ name: 'passenger.medic.aboard', value: true }],
          schedule: [{ storyletId: 'passenger.medic.arrival', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Decline',
        prose: 'Your route bends the other way today. Wish them a fast ship and move on.',
        effects: {
          flags: [{ name: 'passenger.medic.declined', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.medic.arrival',
    title: 'Logged With the Relief',
    prose:
      'You drop the medic at the outbreak line. Before they go, they log your name with the relief effort — the kind of note that travels farther than any fare.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      flags: [{ name: 'passenger.medic.aboard', exists: true }],
    },
    choices: [
      {
        id: 'accept-thanks',
        label: 'Take the fare',
        prose: 'Take the coin they scraped together, and the good word that comes with it.',
        effects: {
          credits: 80,
          disposition: [{ npcId: 'npc-doc-salvage', delta: 1 }],
          flags: [
            { name: 'passenger.medic.aboard', clear: true },
            { name: 'passenger.medic.delivered', value: true },
          ],
        },
      },
      {
        id: 'wave-off-fare',
        label: 'Wave off the fare',
        prose: 'Tell them to spend it on bandages. The good word is payment enough.',
        effects: {
          disposition: [{ npcId: 'npc-doc-salvage', delta: 1 }],
          flags: [
            { name: 'passenger.medic.aboard', clear: true },
            { name: 'passenger.medic.gifted', value: true },
          ],
        },
      },
    ],
  },

  // --- One-shot passenger vignettes (single decision, no chain) ---
  {
    id: 'passenger.courier.sealed-orders',
    title: 'Sealed Orders',
    prose:
      'A courier books a berth for a sealed case and a single instruction: deliver it unopened, and do not be curious about the difference between those two words.',
    repeat: 'never',
    trigger: {
      systemIds: [13],
    },
    choices: [
      {
        id: 'deliver-sealed',
        label: 'Deliver it sealed',
        prose: 'Take the fee, stow the case, and keep your curiosity where it belongs.',
        effects: {
          credits: 120,
          flags: [{ name: 'passenger.courier.clean', value: true }],
        },
      },
      {
        id: 'peek',
        label: 'Peek inside',
        prose: 'Work the seal open a hair and see what a stranger is paying you not to see.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 13 } },
        successEffects: {
          credits: 60,
          flags: [{ name: 'passenger.courier.peeked', value: true }],
        },
        failureEffects: {
          credits: -80,
          flags: [{ name: 'passenger.courier.tripped_seal', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.gambler.debt',
    title: 'One Jump Ahead',
    prose:
      'Lucky Seven wants off Mira-9 before a card debt catches up, and offers a cut of "the next sure thing" for the ride out.',
    repeat: 'never',
    trigger: {
      systemIds: [8],
    },
    choices: [
      {
        id: 'take-the-bet',
        label: 'Take the cut of the sure thing',
        prose:
          'Shake on the next sure thing and pretend, like Seven does, that there is such a thing.',
        effects: {
          credits: 100,
          disposition: [{ npcId: 'npc-lucky-seven', delta: 2 }],
          flags: [{ name: 'passenger.gambler.wagered', value: true }],
        },
      },
      {
        id: 'cash-only',
        label: 'Cash only, no favours',
        prose: 'Name a flat fare and take no share of anything Seven calls sure.',
        effects: {
          credits: 60,
          flags: [{ name: 'passenger.gambler.cash', value: true }],
        },
      },
      {
        id: 'refuse',
        label: 'Refuse the fare',
        prose: 'Whatever Seven owes, you would rather not be the ship it follows onto.',
        effects: {
          disposition: [{ npcId: 'npc-lucky-seven', delta: -1 }],
          flags: [{ name: 'passenger.gambler.refused', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.deadhead.empty-berth',
    title: 'An Empty Berth',
    prose:
      'Your cabin is empty and a dockside broker will fill the berth with a quiet deadhead fare — cheap, no questions, gone by morning.',
    repeat: 'never',
    trigger: {
      systemIds: [4],
    },
    choices: [
      {
        id: 'sell-berth',
        label: 'Sell the berth',
        prose: "Take the broker's coin and the anonymous passenger that comes with it.",
        effects: {
          credits: 50,
          flags: [{ name: 'passenger.deadhead.sold', value: true }],
        },
      },
      {
        id: 'keep-it-empty',
        label: 'Keep it empty',
        prose: 'Fly light. Some nights the quiet is worth more than fifty credits.',
        effects: {
          flags: [{ name: 'passenger.deadhead.empty', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.stowaway.discovered',
    title: 'The Stowaway',
    prose:
      'Three jumps out you find a stowaway asleep in the cargo netting — a dock kid from Procyon-5 who ran out of planet and climbed aboard the first hull that looked kind.',
    repeat: 'never',
    trigger: {
      systemIds: [10],
    },
    choices: [
      {
        id: 'put-to-work',
        label: 'Put them to work',
        prose: 'Hand the kid a mop and a berth and a chance to be crew instead of cargo.',
        effects: {
          flags: [{ name: 'passenger.stowaway.crew', value: true }],
        },
      },
      {
        id: 'turn-in',
        label: 'Turn them in at the next port',
        prose: 'Log the stowaway and collect the small bounty the port pays for the trouble.',
        effects: {
          credits: 40,
          flags: [{ name: 'passenger.stowaway.turned_in', value: true }],
        },
      },
      {
        id: 'let-them-off',
        label: 'Let them off quiet',
        prose: 'Set the kid down at the next dock with a warning and no paperwork.',
        effects: {
          flags: [{ name: 'passenger.stowaway.released', value: true }],
        },
      },
    ],
  },
  {
    id: 'passenger.envoy.sealed-writ',
    title: 'A Guild Writ',
    prose:
      'A minor Guild envoy needs discreet passage and carries a writ that makes port officials suddenly, remarkably polite. They tip well for a smooth crossing.',
    repeat: 'never',
    trigger: {
      systemIds: [12],
    },
    choices: [
      {
        id: 'smooth-passage',
        label: 'Give them a smooth crossing',
        prose: 'Keep the flight quiet, the dockings clean, and the envoy content.',
        effects: {
          credits: 140,
          flags: [{ name: 'passenger.envoy.smooth', value: true }],
        },
      },
      {
        id: 'overcharge',
        label: 'Squeeze a premium',
        prose: 'A writ that opens doors can afford to open its purse. Name a higher number.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          credits: 220,
          flags: [{ name: 'passenger.envoy.premium', value: true }],
        },
        failureEffects: {
          credits: -60,
          flags: [{ name: 'passenger.envoy.reported', value: true }],
        },
      },
    ],
  },

  // --- Veteran career opener (T-1301) ---
  // The first VETERAN-era beat (PRD §5.2). The Day-30 resolution (day.ts) now
  // OWNS the era transition and flips TOUR_ONE→VETERAN at the dusk of day 30 on
  // BOTH branches. This storylet is the authored face of "you are now a veteran"
  // and the proof that `eras:['VETERAN']` content is alive rather than dead on
  // arrival. Its trigger carries NO day/system gate, so it surfaces at the first
  // veteran dawn regardless of which day the transition landed on and whether the
  // marker closed clean or unpaid. The prose reads correctly for either — a clean
  // discharge or a spacer flying on indebted. Pure acknowledgement, no
  // debt/credit effects (mirroring the resolution storylets), and its id prefix
  // (`veteran.`) is distinct from `guild.` and `resolution.tour-one.` so the UI
  // renders it in the normal storylet list, not the letterhead/ceremony overlay.
  {
    id: 'veteran.first-lane',
    title: 'The Far Lanes Open',
    prose:
      'Tour One is behind you, one way or another, and the charts stop ending at the Guild board. The long veteran lanes read out to the rimward dark — colder, farther, and nobody left to tell you which way to burn.',
    repeat: 'never',
    trigger: {
      eras: ['VETERAN'],
    },
    choices: [
      {
        id: 'set-a-heading',
        label: 'Pick a far heading and commit',
        prose: 'Choose a lane off the far edge of the chart and lay the course in.',
        effects: {
          flags: [{ name: 'veteran.first-lane.committed', value: true }],
        },
      },
      {
        id: 'take-stock',
        label: 'Take stock before you burn',
        prose: 'Sit with the quiet a moment, check the hold and the fuel, then decide.',
        effects: {
          flags: [{ name: 'veteran.first-lane.took-stock', value: true }],
        },
      },
    ],
  },

  // --- Renown-gated veteran beat (T-1302) ---
  // The first storylet delivered by RENOWN rather than day/system/cargo: it
  // surfaces once a veteran captain's registry has ranked them to Commander or
  // above (`renown: { minRank: 'COMMANDER' }`, read by engine triggerMatches
  // against player.registry.renownRank). This is the acceptance fixture for
  // "a renown-gated storylet fires on rank-up" — a Guild-recognition beat that
  // could not exist before this task's renown trigger. Pure acknowledgement: the
  // choices carry NO effects at all, because a flag no rule reads is a receipt,
  // not a feature (Standing Constraint 7). The beat's whole job is to prove the
  // renown gate fires; both replies are flavour-only outs (effect-free choices
  // are a valid authoring form, see the requirement-free replies elsewhere).
  {
    id: 'veteran.guild-recognition',
    title: 'The Guild Takes Note',
    prose:
      'A wire arrives on Guild letterhead, and for once it is not a demand. Your registry has climbed past Lieutenant; a clerk you will never meet has stamped your name into the Commander rolls. The lanes do not change. The way the ports read your transponder does.',
    repeat: 'never',
    trigger: {
      eras: ['VETERAN'],
      renown: { minRank: 'COMMANDER' },
    },
    choices: [
      {
        id: 'log-the-rank',
        label: 'Log the recognition',
        prose:
          'Stamp the notice into the ship log and get back to the burn. Rank is a tool, not a rest.',
      },
      {
        id: 'shrug-it-off',
        label: 'Shrug it off',
        prose:
          'A title the Guild grants is a title the Guild can call in. Note it, and trust it less than the fuel gauge.',
      },
    ],
  },

  // --- Smuggler Ray fences the sealed pod (T-1305) ---
  // PRD §7.5's "third out": rather than run a sealed derelict pod past the
  // patrols (and risk a GUILE scan, engine actions/patrol.ts), sell it to
  // Smuggler Ray off the Ghost Runner. "No roll needed" (§7.5) — a plain choice,
  // no requirements. Triggers on the pod-carrying flag the `derelict.sealed-pod`
  // "take it" choice set. The sell choice CLEARS `signal.contraband.carrying`
  // (removes the scan liability) and sets `fence.ray.dealt`.
  //
  // Flag `fence.ray.dealt` READERS: (1) the patrol scan DC — a known fence draws
  // harder scans (engine actions/patrol.ts, this task), and (2) T-1503's Rebel
  // reputation (PRD §117 "Sell out Smuggler Ray…"). The DATA literal below uses
  // the string 'fence.ray.dealt' directly (a data literal can't reference the
  // FENCE_REP_FLAG const in contraband.ts, which the engine imports); the const
  // and this literal must stay identical.
  {
    id: 'fence.ray.sealed-pod',
    title: "Ray's Standing Offer",
    prose:
      "Smuggler Ray leans out of the Ghost Runner's airlock before you've even cut your engines. \"That pod in your hold — I don't need to see inside to know what it is. Name's good, price is fair, and no captain of mine ever answered a patrol's question about cargo I bought.\" His grin does not reach his eyes.",
    repeat: 'never',
    trigger: {
      flags: [{ name: 'signal.contraband.carrying', exists: true }],
    },
    choices: [
      {
        id: 'sell-the-pod',
        label: 'Sell the pod to Ray',
        prose:
          "Cut the mag-locks and float the pod across to the Ghost Runner. Ray's credits are clean by the time they hit your account, and the pod is somebody else's problem now.",
        effects: {
          // CONTRABAND_POD_FENCE_PRICE (contraband.ts) = 350 — set above the
          // pod's +300cr "take it" value so fencing is a real out, not a worse one.
          credits: 350,
          flags: [
            { name: 'signal.contraband.carrying', clear: true },
            // 'fence.ray.dealt' === FENCE_REP_FLAG (contraband.ts); read by the
            // patrol scan DC (T-1305) and T-1503 Rebel rep.
            { name: 'fence.ray.dealt', value: true },
          ],
          disposition: [{ npcId: 'npc-smuggler-ray', delta: 1 }],
        },
      },
      {
        id: 'keep-it-bolted',
        label: 'Keep it bolted down',
        prose:
          "Wave Ray off. The pod stays in your hold, and so does the risk — but you owe the Ghost Runner nothing, and your name stays off Ray's ledger.",
        // No effects: declining changes nothing but the prose. The storylet is
        // `repeat: 'never'`, so resolving ANY choice marks it completed
        // (engine storylets.ts isCompletedForNow) and it never re-offers — a
        // "declined" flag would gate nothing and nothing would read it.
      },
    ],
  },

  // --- Smuggler Ray fences a Contraband cargo run (T-1305) ---
  // The other face of §7.5's fence out: a live type-10 Contraband CONTRACT
  // (T-1104) can be dumped to Ray instead of run to its destination past the
  // patrols. "No roll needed" — plain choice. Selling clears the active contract
  // (no delivery payment) and sets the shared `fence.ray.dealt` rep flag (same
  // readers as above: patrol scan DC + T-1503).
  {
    id: 'fence.ray.contraband-cargo',
    title: 'The Ghost Runner Wants Your Load',
    prose:
      'Word travels: you\'re carrying the kind of cargo the manifest lies about. Smuggler Ray finds you at the dock. "Running it clean to the buyer?" he asks, amused. "Long way past a lot of patrol scanners. Or you sell it to me right here, and the only log entry is one I burn myself."',
    repeat: 'never',
    trigger: {
      cargo: { activeContractCargoType: 10 },
    },
    choices: [
      {
        id: 'fence-the-load',
        label: 'Fence the load to Ray',
        prose:
          "Sign the crates over to Ray at a fence's discount. Less than the buyer would pay — but the buyer would want you to survive the trip, and Ray does not care either way.",
        effects: {
          // A fence discount off a delivery payment, in the existing storylet
          // credit band (~250-400). Book value, no roll (PRD §7.5).
          credits: 300,
          cargo: { clearActiveContract: true },
          // 'fence.ray.dealt' === FENCE_REP_FLAG (contraband.ts); read by the
          // patrol scan DC (T-1305) and T-1503 Rebel rep.
          flags: [{ name: 'fence.ray.dealt', value: true }],
          disposition: [{ npcId: 'npc-smuggler-ray', delta: 1 }],
        },
      },
      {
        id: 'run-it-clean',
        label: 'Run it clean',
        prose:
          "Wave Ray off and keep the contract. The buyer pays full freight — if you make it there — and your name stays off the Ghost Runner's books.",
        // No effects: declining keeps the contract as-is. The storylet is
        // `repeat: 'never'`, so resolving ANY choice marks it completed
        // (engine storylets.ts isCompletedForNow) and it never re-offers — a
        // "declined" flag would gate nothing and nothing would read it.
      },
    ],
  },

  // ==========================================================================
  // T-1310 · Nemesis-arc reachability batch (appended per the batch convention).
  //   Two vectors that make the arc's opening reachable through the ECONOMY (PRD
  //   §8.3) rather than a knife-edge day-30 teleport, plus the missing Sage decode
  //   paths for fragments 02–05. Foundation (ref f2f95fa9) carries NO Nemesis arc,
  //   so this whole batch is authored content, a deliberate divergence.
  //   (The windowed Wise One hook itself is edited in place above at its T-113a
  //   definition site, where its divergence comment lives.)
  // ==========================================================================

  // Rimward wire rumor — the economy-delivered LEAD to the Wise One of Polaris-1.
  // A Galactic-Wire rumor reaches the captain anywhere (no system/era gate — the
  // same "a wire follows you" pattern as guild.pressure.*, eligible from day 25,
  // never expiring). "Chase the rumor" drops a Polaris-1 manifest contract onto
  // TODAY's board (addManifestContract → market.manifestBoard, wiped next dawn by
  // generateManifestBoard, so it is a SAME-DAY offer a human player can sign);
  // cargoType 17 (Raw Dilithium) and destination 17 are both valid (storyletValidation
  // checks both). The genuinely CONSUMED state this choice produces is that Polaris-1
  // manifest CONTRACT it drops on the board (read by the trade/sign flow → Travel →
  // arrival at system 17); the storylet's own repeat:'never' completion record is what
  // stops it re-offering, so NO parallel "heard" flag is set — per constraint 7 a
  // set-only receipt nothing reads is not a feature. "Note it and fly on" is the
  // required second choice (storylets need 2–4 choices) and is a pure-narrative
  // decline that changes no state. The T-1310 acceptance asserts the storylet is
  // OFFERED in a seed sweep; the sim does NOT depend on the ephemeral same-day
  // contract — its explorer upgrades drives and flies straight to Polaris-1 — so a
  // missed same-day sign never closes the arc.
  {
    id: 'wire.rimward.polaris-signal',
    title: 'A Rumor Off the Rim',
    prose:
      'A rimward rumor rides in on the Galactic Wire, passed hand to hand until it reached your feed: an old spacer at Polaris-1 — the Wise One — is selling pieces of a signal that came from the wrong side of the Nemesis black hole. Most captains file it under ghost stories. The ones who went looking did not come back to say so.',
    repeat: 'never',
    trigger: {
      day: { gte: 25 },
    },
    choices: [
      {
        id: 'chase',
        label: 'Chase the rumor',
        prose:
          'Log a Polaris-1 run against the rumor and warm the drives. A rim haul rides the same heading — dilithium for the yards out past the frontier — so the detour pays for itself if the black-hole talk is nothing.',
        effects: {
          cargo: {
            addManifestContract: { destination: 17, cargoType: 17, payment: 4000, pods: 1 },
          },
        },
      },
      {
        id: 'note',
        label: 'Note it and fly on',
        prose:
          'File the coordinates and the name, and keep the current run. Polaris-1 is not going anywhere, and neither, apparently, is whatever is broadcasting from it.',
      },
    ],
  },

  // Sage of Mizar-9 decode storylets for fragments 02–05. The Sage (Mizar-9,
  // system 18) is the game's ONLY decoder. Before T-1310 only `sage.mizar.decode-
  // first` existed (frag-nemesis-01), so every fragment pulled off a derelict /
  // beacon / courier-drop while exploring (frags 02–05 — see the loot pools in
  // nemesis.ts) was permanently stuck undecoded. These four author the missing
  // decode paths, one per fragment, modelled on decode-first: system-18-gated,
  // `nemesis.hasUndecodedFragmentId` so each surfaces only when its fragment is
  // held and still raw, `repeat:'never'`, NOT era-gated (the crossing arc runs from
  // Tour One into the veteran game). The lore each reveals is the fragment's
  // `decoded` text in nemesis.ts. The CONSUMED state is the fragment DECODE itself:
  // decodeFragment flips fragment.decoded, which hasUndecodedFragment reads (to stop
  // re-offering) and nemesisLoreIndex reads (swapping raw signal for decoded lore,
  // rendered by the terminal's Nemesis file panel via ui/format.ts) — so the decode
  // needs NO parallel "decoded" flag. Per constraint 7 a set-only receipt nothing
  // reads is not a feature; the grandfathered `sage.mizar.first_decoded` is exactly
  // such a receipt and is deliberately NOT copied here. "Keep the sliver for now" is
  // the required second choice (storylets need 2–4 choices) and is a pure-narrative
  // decline that changes no state — the fragment simply stays raw, which
  // hasUndecodedFragment already tracks. T-1310 D1 exercises each decode path end-to-end.
  {
    id: 'sage.mizar.decode-02',
    title: 'The Sage Reads the Drowned Manifest',
    prose:
      'You set the second sliver on the Sage\'s bench. The old cryptographer feeds it to the dead screens and frowns. "A manifest," they murmur, "for a ship that filed no route, bound for a port with no coordinates. Let me follow the names."',
    repeat: 'never',
    trigger: {
      systemIds: [18],
      nemesis: { hasUndecodedFragmentId: 'frag-nemesis-02' },
    },
    choices: [
      {
        id: 'decode',
        label: 'Let the Sage decode it',
        prose:
          'The names resolve one by one — a crossing list. Spacers who went through the black hole and were never logged returning. It settles into your Nemesis file, decoded.',
        effects: {
          decodeFragment: 'frag-nemesis-02',
        },
      },
      {
        id: 'withhold',
        label: 'Keep the sliver for now',
        prose:
          'Pocket the manifest before the last name resolves. Some crossings you would rather not read the end of yet. The Sage lets it go without argument.',
      },
    ],
  },
  {
    id: 'sage.mizar.decode-03',
    title: 'The Sage Unfolds the Reptiloid Hymn',
    prose:
      'The third fragment sings — a choral pattern in a Reptiloid dialect, folded into the same pre-Confederation carrier. The Sage goes very still. "I have heard the Reptiloids sing this," they say. "They heard the signal before any of us."',
    repeat: 'never',
    trigger: {
      systemIds: [18],
      nemesis: { hasUndecodedFragmentId: 'frag-nemesis-03' },
    },
    choices: [
      {
        id: 'decode',
        label: 'Let the Sage decode it',
        prose:
          'The hymn resolves to a single repeated phrase, a warning older than the alliances: "the door answers when it is knocked upon." Decoded, it joins your file.',
        effects: {
          decodeFragment: 'frag-nemesis-03',
        },
      },
      {
        id: 'withhold',
        label: 'Keep the sliver for now',
        prose:
          'Silence the playback and take the sliver back. A warning keeps whether or not you understand it. The Sage nods, unsurprised.',
      },
    ],
  },
  {
    id: 'sage.mizar.decode-04',
    title: 'The Sage Balances the Event-Horizon Ledger',
    prose:
      'The fourth sliver is only numbers — fuel figures, mass ratios, a burn schedule. The Sage runs it against a century of star charts and their hands slow. "This is a solution," they whisper. "A way across. It is only missing its last line."',
    repeat: 'never',
    trigger: {
      systemIds: [18],
      nemesis: { hasUndecodedFragmentId: 'frag-nemesis-04' },
    },
    choices: [
      {
        id: 'decode',
        label: 'Let the Sage decode it',
        prose:
          'The burn schedule resolves: exactly how much a ship must carry, and spend, to reach the far side of Nemesis intact. The decoded ledger settles into your file — final line still blank.',
        effects: {
          decodeFragment: 'frag-nemesis-04',
        },
      },
      {
        id: 'withhold',
        label: 'Keep the sliver for now',
        prose:
          'Close the ledger before the Sage finishes. A crossing solution is the kind of knowledge that changes what a captain does with a full tank. Not yet. The Sage lets it keep.',
      },
    ],
  },
  {
    id: 'sage.mizar.decode-05',
    title: 'The Sage Matches the Returning Voice',
    prose:
      'The last sliver carries a human voice, badly degraded, transmitting on the pre-Confederation carrier. It says a name the Wire has no record of. The Sage plays it three times, then reaches for a founding-era crew roster with a shaking hand.',
    repeat: 'never',
    trigger: {
      systemIds: [18],
      nemesis: { hasUndecodedFragmentId: 'frag-nemesis-05' },
    },
    choices: [
      {
        id: 'decode',
        label: 'Let the Sage decode it',
        prose:
          'The voice matches a founding-era spacer lost at Nemesis a century ago — still broadcasting, from the wrong side, and getting closer. The decoded truth settles into your file, and the room feels colder.',
        effects: {
          decodeFragment: 'frag-nemesis-05',
        },
      },
      {
        id: 'withhold',
        label: 'Keep the sliver for now',
        prose:
          'Stop the playback before the name resolves. Some voices you are not ready to put a face to. The Sage sets the roster down, and does not push.',
      },
    ],
  },
] as const);
