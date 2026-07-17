import type { RenownRankId } from './deeds.js';
import type { FactionId } from './factions.js';
import { FACTION_JOIN_CROSS_PENALTY, FACTION_JOIN_OWN_BONUS } from './factions.js';
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
  /** T-1503: gate on the player's standing with one of the four galactic powers
   *  (`player.reputation[faction]`). This is the NAMED READER of the reputation
   *  state — the `alliance.*` questlines gate their ep2/ep3 on the rep their
   *  earlier episodes granted (the organic progression gate, mirroring how the
   *  T-1502 chains gate on `npc.disposition`). Reader: engine `triggerMatches`. */
  reputation?: { faction: FactionId } & NumberMatcher;
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
  /** T-1503: move the player's standing with one or more galactic powers. The
   *  `alliance.*` questlines grant own-faction rep per episode (which crosses the
   *  next episode's `reputation` gate) and, on the terminal "join" choice, apply
   *  the cross-faction shift (own +large, the other three −FACTION_JOIN_CROSS_PENALTY).
   *  Applied through engine `applyEffects` → `reputation.ts` `applyReputation`,
   *  emitting a ReputationChanged event + a StoryletEffectApplied{effect:'reputation'}. */
  reputation?: readonly { faction: FactionId; delta: number }[];
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

/**
 * T-1502 · The "wire resolves it without you" abandonment path (PRD §8.1: an NPC
 * personal chain "can resolve without you"). Present ONLY on a scheduled chain
 * episode (a `scheduledOnly` target): if that episode sits unplayed past its
 * `dueDay + graceDays`, the engine's dusk sweep (engine `resolveAbandonedChains`,
 * called in `day.ts` endDay) resolves the chain FOR the player — files the wire
 * line and applies the disposition consequence.
 *
 * This field lives on the DEFINITION only. It is never serialized into GameState
 * (only the `StoryletOffer` projection is stored), so it needs NO schema/save
 * change: the deadline is computed from the already-persisted scheduled entry's
 * `dueDay` plus this content `graceDays`.
 */
export interface StoryletWireResolution {
  /** Days the scheduled episode may sit past its `dueDay`, unplayed, before the
   *  wire resolves the chain without the player. Reader: engine
   *  `resolveAbandonedChains` (the day.ts dusk sweep). */
  graceDays: number;
  /** The Galactic News Wire line reporting how the chain ended without you.
   *  Reader: the WireEntry it becomes → the UI wire ticker (format.ts wireLines). */
  wireMessage: string;
  /** State consequence of abandonment (a disposition drop + the terminal
   *  `chain.*.resolved` flag). Applied through the SAME `applyEffects` path a
   *  played choice uses, so it emits the identical DispositionChanged /
   *  StoryletEffectApplied events. */
  effects?: StoryletEffects;
}

export interface StoryletDefinition {
  id: string;
  title: string;
  prose: string;
  repeat?: 'never' | 'daily';
  trigger: StoryletTrigger;
  choices: readonly StoryletChoiceDefinition[];
  /** T-1502 · abandonment path (PRD §8.1). Only meaningful on a `scheduledOnly`
   *  target — validated in storyletValidation. */
  wireResolution?: StoryletWireResolution;
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
    // T-1502 · Doc Salvage EPISODE 2 (of 3). Both choices now SCHEDULE episode 3
    // (`chain.doc-salvage.impound`) — the +2/+3 disposition they grant is what
    // clears that episode's `npc.disposition >= 2` gate organically. Carries a
    // `wireResolution` (PRD §8.1): answer the ping but never play this beat, and
    // after the grace window the wire reports Doc handled the rescue alone
    // (disposition −2). graceDays is set generously (7) so no short golden replay
    // ever lapses it.
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
    wireResolution: {
      graceDays: 7,
      wireMessage:
        'Doc Salvage worked the beacon net alone while your channel stayed dark — the skiff got its patient, no thanks to you.',
      effects: {
        disposition: [{ npcId: 'npc-doc-salvage', delta: -2 }],
        flags: [{ name: 'chain.doc-salvage.resolved', value: 'wire' }],
      },
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
          schedule: [{ storyletId: 'chain.doc-salvage.impound', delayDays: 1 }],
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
          schedule: [{ storyletId: 'chain.doc-salvage.impound', delayDays: 1 }],
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

  // ==========================================================================
  // T-1501 · Storylet batch — ports & rumors (20) (appended per the batch
  //   convention: batches append after every prior batch, so the originals stay
  //   the leading content-order prefix the engine test asserts).
  //
  //   PURPOSE: give the map its per-system character now that RIM systems receive
  //   real traffic (T-1101/T-1102 made rim jumps reachable, T-1104 routes cargo
  //   there). The audit found only ~3 system-keyed port/rumor storylets existed;
  //   the mandatory 9 below give every core+rim system that lacked one a plain,
  //   reliably-reachable port beat (systemIds-only, no era/day/cargo/flag gate,
  //   repeat:'never'), which is the "every core+rim system has ≥1 storylet
  //   reachable in a 500-day sweep" acceptance (sim/system-storylet-coverage.test).
  //   Six richer rim beats + four Wise One / Sage audience scenes give the rim its
  //   authored voice.
  //
  //   VOICE / DIVERGENCE: rim flavor is drawn from foundation
  //   (f2f95fa9:foundation/lore/User-Manual.md §"Rim Star Worlds") — Antares-5's
  //   sealed Andromeda Operations Room, Capella-4 drive repair, Polaris-1's cold
  //   cabin + the Wise One, Mizar-9's robotics row + the Sage's constellation
  //   quiz, Achernar-5 navigation, and Algol-2's "no repair facilities — the
  //   frontier". Foundation carries no storylet constants, so the credit/fuel
  //   deltas are authored in the existing storylet band (~40–350cr), not lifted.
  //
  //   AUTHORING (enforced by engine/storylets.test.ts): 2–4 choices, ≥1
  //   requirement-free choice per storylet (so a broke, die-spent captain never
  //   dead-ends the day), and NO held-state (.aboard/.riding) flags in this batch
  //   (nothing to strand). Per Standing-constraint 7 — and matching the T-1310
  //   precedent (bb030913) — this batch sets NO receipt/"outcome" flags at all:
  //   a set-only flag nothing reads is not a feature. Choice outcomes are carried
  //   entirely by prose + real credit/fuel deltas; a choice whose only distinction
  //   was its receipt flag is written effect-free, and each storylet's own
  //   repeat:'never' completion record (not a parallel flag) is what stops a
  //   re-offer. If a later gate ever needs to read one of these outcomes, add the
  //   flag back TOGETHER with its named reader and a consumption assertion.
  // ==========================================================================

  // --- Mandatory 9: the plain per-system port beats (reachability-critical) ---
  {
    id: 'port.aldebaran.grain-exchange',
    title: 'The Grain Exchange',
    prose:
      'Aldebaran-1 runs on grain futures, and the exchange floor is mid-argument when you dock: two brokers, one disputed lot, and a docked hull that neither of them owns looking like a convenient tiebreaker.',
    repeat: 'never',
    trigger: {
      systemIds: [2],
    },
    choices: [
      {
        id: 'broker-it',
        label: 'Broker the dispute',
        prose: 'Read the lot slips, find the honest split, and name it before either broker can.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 11 } },
        successEffects: {
          credits: 90,
        },
        failureEffects: {
          credits: -40,
        },
      },
      {
        id: 'stay-out',
        label: 'Stay out of it',
        prose: 'Their grain, their fight. Sign your gantry slip and leave the exchange to itself.',
      },
    ],
  },
  {
    id: 'port.fomalhaut.dust-market',
    title: 'The Dust Market',
    prose:
      "Fomalhaut-2's dust market never quite closes — a low sprawl of stalls under the gantry lights where a trader waves you over with a haggle already half-formed on her lips.",
    repeat: 'never',
    trigger: {
      systemIds: [7],
    },
    choices: [
      {
        id: 'haggle',
        label: 'Haggle her down',
        prose: 'Meet the opening price with a flat refusal and see where the number lands.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          credits: 110,
        },
        failureEffects: {
          credits: -50,
        },
      },
      {
        id: 'browse',
        label: 'Browse and move on',
        prose: 'Nod at the stalls, buy nothing, and keep the coin for a market you know better.',
      },
    ],
  },
  {
    id: 'port.vega6.homecoming-gantry',
    title: 'The Homecoming Gantry',
    prose:
      'Vega-6 keeps one gantry lit for the ships that come back from the deep runs — the Maligna returners, the long-hauls, the ones the wire had stopped counting on. Tonight the gantry crew mistake you for one of them and stand a round anyway.',
    repeat: 'never',
    trigger: {
      systemIds: [14],
    },
    choices: [
      {
        id: 'take-the-round',
        label: 'Take the round, tell a story',
        prose:
          'Let them believe the deep-run story a while, and trade a tall tale for a warm dock.',
      },
      {
        id: 'set-them-straight',
        label: 'Set them straight',
        prose:
          'Wave the credit off — you have not earned that gantry yet. Buy your own round instead.',
        effects: {
          credits: -30,
        },
      },
    ],
  },
  {
    id: 'port.antares.gateway-watch',
    title: 'The Gateway Watch',
    prose:
      "Antares-5 sits at the black hole's edge — the gateway to Andromeda, if the stories are true. A watch officer eyes your transponder as you dock, and past her shoulder a sealed blast door reads OPERATIONS in letters older than the Confederation.",
    repeat: 'never',
    trigger: {
      systemIds: [15],
    },
    choices: [
      {
        id: 'ask-the-door',
        label: 'Ask about the sealed door',
        prose:
          'Nod at the OPERATIONS door and ask, idly, what it takes to get it opened. The officer almost answers.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
      },
      {
        id: 'keep-moving',
        label: 'Keep your eyes down and dock',
        prose: 'Some doors it is safer not to be seen looking at. Clear the gantry and move on.',
      },
    ],
  },
  {
    id: 'port.capella.drive-yard',
    title: 'The Drive Yard',
    prose:
      'Capella-4 is a drive port — the yards out here rebuild burners half the core would scrap. A yard tout jogs alongside your hull before the clamps are cold, quoting a tune-up price and a story about the last captain who skipped one.',
    repeat: 'never',
    trigger: {
      systemIds: [16],
    },
    choices: [
      {
        id: 'take-the-tuneup',
        label: 'Pay for the tune-up',
        prose:
          'Let the yard crew balance the burner. It costs, but a clean drive out here is life.',
        requirements: { credits: { gte: 60 } },
        effects: {
          credits: -60,
          fuel: 15,
        },
      },
      {
        id: 'wave-off',
        label: 'Wave the tout off',
        prose:
          'The burner will hold. Wave the tout back to the next hull and see to your own drives.',
      },
    ],
  },
  {
    id: 'port.polaris.frontier-berth',
    title: 'A Cold Berth',
    prose:
      "Polaris-1 keeps its berths cold and its welcome colder — a cabin-repair port at the frontier's edge where the dockmaster charges by the hour for heat and does not haggle. Still, a warm bunk is a warm bunk this far out.",
    repeat: 'never',
    trigger: {
      systemIds: [17],
    },
    choices: [
      {
        id: 'pay-for-heat',
        label: 'Pay for a warm berth',
        prose:
          'Buy the heat and a night out of the pilot chair. The frontier will still be there at dawn.',
        requirements: { credits: { gte: 40 } },
        effects: {
          credits: -40,
        },
      },
      {
        id: 'rough-it',
        label: 'Rough it in the cockpit',
        prose:
          'Keep the coin, pull a blanket over the console, and sleep the way spacers always have.',
      },
    ],
  },
  {
    id: 'port.mizar.robotics-row',
    title: 'Robotics Row',
    prose:
      "Mizar-9's robotics row is a canyon of parts stalls and half-built drones, the best repair for a fried battle computer anywhere on the rim. A fixer with oil to the elbows offers to look your systems over — cheap, he says, because business is slow.",
    repeat: 'never',
    trigger: {
      systemIds: [18],
    },
    choices: [
      {
        id: 'let-him-look',
        label: 'Let the fixer look',
        prose:
          'Pop the panels and let him run a diagnostic. A rim fixer sees things a core yard misses.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 11 } },
        successEffects: {
          credits: 70,
        },
        failureEffects: {
          credits: -40,
        },
      },
      {
        id: 'browse-the-row',
        label: 'Just browse the row',
        prose: 'Walk the stalls, price a few parts, and buy nothing you did not come for.',
      },
    ],
  },
  {
    id: 'port.achernar.nav-beacon',
    title: 'A Beacon Off True',
    prose:
      'Achernar-5 lives and dies by its navigation beacons, and one of them is reading a hair off true. The port navigator is short-handed and asks — half-order, half-favor — whether a docked captain would ride out and recalibrate it.',
    repeat: 'never',
    trigger: {
      systemIds: [19],
    },
    choices: [
      {
        id: 'ride-out',
        label: 'Ride out and calibrate it',
        prose: 'Take the calibration rig out to the drifting beacon and bring it back onto true.',
        requirements: { spendDie: true },
        effects: {
          credits: 100,
        },
      },
      {
        id: 'beg-off',
        label: 'Beg off the favor',
        prose: 'Tell the navigator your heading is set. She frowns, but finds another hull to ask.',
      },
    ],
  },
  {
    id: 'port.algol.no-repair',
    title: 'No Repair Facilities',
    prose:
      'Algol-2 is the end of the charts — no repair facilities, no yard, no guarantee anyone here is who they say. A spacer with a dead drive flags you down at the gantry, cap in hand: he needs one part, and Algol-2 is the wrong place to be stranded with a cold burner.',
    repeat: 'never',
    trigger: {
      systemIds: [20],
    },
    choices: [
      {
        id: 'give-the-part',
        label: 'Give him the part',
        prose:
          'Pull a spare coupling from your own stores and hand it over. Out here, that is the whole law.',
        effects: {
          credits: -30,
        },
      },
      {
        id: 'sell-the-part',
        label: 'Sell him the part',
        prose:
          'The frontier prices its mercy. Name a fair number for the coupling and take his coin.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 11 } },
        successEffects: {
          credits: 80,
        },
      },
      {
        id: 'walk-past',
        label: 'Walk past him',
        prose: 'You have troubles of your own out here. Keep your stores and keep walking.',
      },
    ],
  },

  // --- Rim-character richness (6): flavored beats. The mandatory 9 above already
  //     guarantee per-system reachability, so these may carry gates. ---
  {
    id: 'port.antares.andromeda-operations',
    title: 'The Operations Room',
    prose:
      'Word of your veteran registry reaches the Antares-5 watch before you clear the gantry, and this time the OPERATIONS door is not sealed. Inside, a briefing officer stands before a chart of the black hole and the long dark past it. "You are cleared to hear this much," she says. "No further. Not yet."',
    repeat: 'never',
    trigger: {
      systemIds: [15],
      eras: ['VETERAN'],
    },
    choices: [
      {
        id: 'hear-the-briefing',
        label: 'Hear the briefing',
        prose:
          'Stand at the chart and let her walk you to the edge of what the Confederation admits about the crossing — and no further.',
      },
      {
        id: 'not-ready',
        label: 'Tell her you are not ready',
        prose:
          'Some doors you would rather close yourself than be shown through. Thank the officer and step back out to the gantry.',
      },
    ],
  },
  {
    id: 'port.capella.herbal-run',
    title: 'The Capellan Herbals',
    prose:
      'A Capella-4 grower has a pallet of Capellan Herbals cut and cured and no hull to carry them coreward before they lose their potency. She offers the run cheap to any captain heading back in, and a taste of the cure to close the deal.',
    repeat: 'never',
    trigger: {
      systemIds: [16],
    },
    choices: [
      {
        id: 'take-the-run',
        label: 'Take the herbal run',
        prose:
          'Log the pallet against a coreward berth and warm the drives. Fresh Capellan Herbals pay well if you make the core before they turn.',
        effects: {
          cargo: {
            addManifestContract: { destination: 7, cargoType: 16, payment: 900, pods: 1 },
          },
        },
      },
      {
        id: 'pass',
        label: 'Pass on it',
        prose:
          'Your hold has other plans. Wish the grower a fast hull and keep your manifest as it is.',
      },
    ],
  },
  {
    id: 'port.achernar.gem-cutters',
    title: "The Gem Cutters' Row",
    prose:
      'Achernar-5 cuts the finest gems on the rim, and a cutter at the row leans close over a cloth of Achernarian stones. "Appraised low at the core, I would wager," he murmurs. "They never know what they are holding. Sell them here, to someone who does."',
    repeat: 'never',
    trigger: {
      systemIds: [19],
    },
    choices: [
      {
        id: 'sell-to-cutter',
        label: 'Deal with the cutter',
        prose:
          'Talk stones and value with a man who cuts them for a living, and hold out for his real price.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          credits: 160,
        },
        failureEffects: {
          credits: -40,
        },
      },
      {
        id: 'window-shop',
        label: 'Admire and leave',
        prose: 'Watch the wheel throw its light a while, buy nothing, sell nothing, and go.',
      },
    ],
  },
  {
    id: 'port.algol.frontier-justice',
    title: 'Frontier Justice',
    prose:
      'Algol-2 has no law but what the docked captains agree to, and tonight they are agreeing loudly. A runner caught skimming fuel from moored hulls is roped to a gantry post, and the gathered spacers want a vote from every ship at berth — yours included.',
    repeat: 'never',
    trigger: {
      systemIds: [20],
    },
    choices: [
      {
        id: 'argue-mercy',
        label: 'Argue for mercy',
        prose:
          'Stand up and talk the crowd down from the harder options. Out here a reputation for fairness is worth more than one for iron.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
      },
      {
        id: 'stay-silent',
        label: 'Cast no vote',
        prose:
          'Keep to your hull and let the frontier settle its own accounts. It is not your dock and not your call.',
      },
    ],
  },
  {
    id: 'port.mizar.liquor-hall',
    title: 'The Liquor Hall',
    prose:
      "Mizar-9's liquor hall pours the rim's strongest, and the strongest talk with it. A table of long-haul captains waves you into a bench, a bottle of Mizarian Liquor already open and a rumor already halfway told.",
    repeat: 'never',
    trigger: {
      systemIds: [18],
    },
    choices: [
      {
        id: 'drink-and-listen',
        label: 'Drink and listen',
        prose:
          'Take the offered cup and let the rim gossip wash over you. Some of it is even true, and the true parts are worth the hangover.',
      },
      {
        id: 'buy-the-round',
        label: 'Buy the next round',
        prose:
          'Stand the table a bottle and buy your way into the better rumors — the ones they do not tell for free.',
        requirements: { credits: { gte: 50 } },
        effects: {
          credits: -50,
        },
      },
    ],
  },
  {
    id: 'port.polaris.ice-harvest',
    title: 'The Ice Harvest',
    prose:
      'Polaris-1 harvests its fuel from cometary ice, and the harvest crew is a hand short on the line. The foreman offers a cut of the melt to any captain willing to work a shift on the frozen frontier — cold, hard, and honest.',
    repeat: 'never',
    trigger: {
      systemIds: [17],
    },
    choices: [
      {
        id: 'work-a-shift',
        label: 'Work a shift on the line',
        prose:
          'Suit up and haul ice with the harvest crew. The pay is a tank topped off and a foreman who remembers a working captain.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
        successEffects: {
          fuel: 25,
        },
      },
      {
        id: 'not-this-run',
        label: 'Not this run',
        prose:
          'The line is brutal and your heading is set. Wave the foreman off and see to your own tanks.',
      },
    ],
  },

  // --- Wise One / Sage audience scenes (4): the "guidance to advanced spacers"
  //     and the constellation quiz the foundation names, distinct from the
  //     T-113a/T-1310 fragment-broker hooks (which grant/decode the Nemesis
  //     Signal). These are pure counsel — no fragment mechanics — so they can
  //     surface without a fragment held. Renown/era gates give them their
  //     "advanced spacers" character; the mandatory 9 carry system reachability. ---
  {
    id: 'wise-one.polaris.counsel',
    title: 'Counsel of the Wise One',
    prose:
      'The Wise One of Polaris-1 receives you differently now — no data sliver, no price, only a long look and a gesture at the cold cabin\'s single chair. "You have made a name," the old spacer says. "Names are the heaviest cargo a hull carries. Sit. I will tell you how to fly with the weight."',
    repeat: 'never',
    trigger: {
      systemIds: [17],
      renown: { minRank: 'CAPTAIN' },
    },
    choices: [
      {
        id: 'hear-counsel',
        label: 'Hear the counsel',
        prose:
          'Take the chair and listen. What the Wise One gives an advanced spacer is not coin and not cargo, but the shape of the road ahead.',
      },
      {
        id: 'decline-counsel',
        label: 'Decline, respectfully',
        prose:
          'Tell the Wise One you fly better without a map of the weight. The old spacer nods, unoffended. "Then you already understand the first part."',
      },
    ],
  },
  {
    id: 'wise-one.polaris.parable',
    title: "The Wise One's Parable",
    prose:
      'On a later visit the Wise One is in a telling mood. "A spacer once tried to outrun their own wake," the old one begins, unprompted, watching the frost creep the cabin window. "They burned every drop of fuel they had. Do you know where they ended up?" The pause is the point.',
    repeat: 'never',
    trigger: {
      systemIds: [17],
      eras: ['VETERAN'],
    },
    choices: [
      {
        id: 'answer-the-parable',
        label: 'Guess the ending',
        prose:
          'Offer your own ending to the parable. The Wise One listens to it more closely than you expected, and does not tell you whether you were right.',
      },
      {
        id: 'sit-with-it',
        label: 'Sit with the silence',
        prose:
          'Say nothing and let the pause be the answer. The Wise One almost smiles. "Good," they say. "The ones who answer too fast never make the crossing."',
      },
    ],
  },
  {
    id: 'sage.mizar.constellation-quiz',
    title: "The Sage's Constellation Quiz",
    prose:
      'The Sage of Mizar-9 sets aside the dead screens and produces, of all things, a battered star-wheel. "Before I read any more signals for you," they say, eyes bright, "a small test. Sixteen constellations, coded A through P. Tell me — which one guides a lost hull home?" It is, you realize, both a game and a measure.',
    repeat: 'never',
    trigger: {
      systemIds: [18],
    },
    choices: [
      {
        id: 'take-the-quiz',
        label: 'Take the quiz',
        prose:
          'Study the wheel and name your constellation. The Sage weighs the answer, then the answerer, and seems satisfied with both.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 11 } },
      },
      {
        id: 'decline-the-quiz',
        label: 'Decline the game',
        prose:
          'Tell the Sage you did not come to be tested. They pocket the wheel without complaint. "Another visit, then. The sky keeps."',
      },
    ],
  },
  {
    id: 'sage.mizar.star-lore',
    title: 'The Sage Tells the Sky',
    prose:
      'The Sage is between decodings and, rare for them, unhurried. "You keep bringing me the wrong side of the black hole," they say. "Let me give you the right side for once." They dim the workshop and throw a century of star-lore across the dead screens — the old names, the old roads, the sky as it was charted before anyone thought to cross it.',
    repeat: 'never',
    trigger: {
      systemIds: [18],
    },
    choices: [
      {
        id: 'listen-to-lore',
        label: 'Listen to the star-lore',
        prose:
          'Sit in the dark and let the old sky roll past. None of it pays a docking fee, and all of it is worth knowing before the crossing.',
      },
      {
        id: 'cut-it-short',
        label: 'Cut it short',
        prose:
          'Tell the Sage the drives are warm and the lore will keep. They dim the screens back up. "It has kept this long," they agree.',
      },
    ],
  },

  // --- One more core beat (20 total): a second Fomalhaut-2 vignette, so a
  //     core trading hub carries more than one face across a long campaign. ---
  {
    id: 'port.fomalhaut.deep-dark',
    title: 'Talk of the Deep Dark',
    prose:
      'Late at the Fomalhaut-2 docks an old freighter hand corners you with the shakes and a story: something out past the rim, she swears, that pings back on an empty channel. Half the port calls her mad. The other half stopped flying the far lanes after they heard her.',
    repeat: 'never',
    trigger: {
      systemIds: [7],
    },
    choices: [
      {
        id: 'hear-her-out',
        label: 'Hear her out',
        prose:
          'Buy the old hand a drink and let her tell it. Rim ghost stories are mostly nerves — but the ones that spread are worth a captain knowing.',
        effects: {
          credits: -20,
        },
      },
      {
        id: 'wave-it-off',
        label: 'Wave the story off',
        prose:
          'Every port has its madwoman and her empty channel. Nod, excuse yourself, and get back to the manifest.',
      },
    ],
  },

  // ==========================================================================
  // T-1502 · NPC personal chains — six 3-episode arcs (appended per the batch
  //   convention: batches append after every prior batch, so the originals stay
  //   the leading content-order prefix the engine test asserts). Doc Salvage's
  //   episode 3 lives here too (its ep1/ep2 stay in the ORIGINAL prefix above,
  //   edited in place); the arc is LINKED by schedule ids, not content order.
  //
  //   PURPOSE (PRD §8.1): each NPC gets a personal arc keyed to their Bond/Flaw,
  //   gating on disposition that now has teeth (T-1204) — and every chain carries
  //   the "ignore-it-and-the-wire-resolves-it" path (`wireResolution`), so a chain
  //   can resolve WITHOUT the player.
  //
  //   SHARED SHAPE:
  //     - ep1 (the meeting): systemIds-gated at a CORE port (id 1–14, never the
  //       NPC's migrating spawn — the shipped Doc chain's [1] precedent, so the
  //       episode reaches the player at a fixed dock). `npc:{id}` + a
  //       `chain.X.resolved exists:false` gate. The "engage" choice grants an
  //       opening +3 disposition and SCHEDULES ep2 (delayDays 1); the "decline"
  //       out is requirement-free and sets `chain.X.resolved='declined'` — a clean
  //       opt-out (the chain never arms), distinct from abandonment.
  //     - ep2 (the ask/turn): `scheduledOnly`, `npc.disposition:{ gte:2 }` — the
  //       "getting close" gate the acceptance requires be hit ORGANICALLY (ep1's
  //       +3 crosses it; the driver never sets disposition). Grants more standing
  //       and schedules ep3. Carries a `wireResolution`.
  //     - ep3 (the payoff): `scheduledOnly`, `npc.disposition:{ gte:3 }`. Terminal
  //       — sets `chain.X.resolved='<outcome>'`, grants final standing/credits.
  //       Carries a `wireResolution`.
  //
  //   READERS / consumed state (Standing-constraint 7):
  //     - `chain.X.resolved`: READ by every episode's `exists:false` trigger gate
  //       (a resolved chain — completed, declined, or wire-abandoned — never
  //       re-offers), exactly as `tour-one.resolved` gates the resolution beats.
  //     - `npc.disposition`: READ by the ep2/ep3 `disposition` gates (the organic
  //       progression gate), plus the T-1204 interceptor grudge-weighting and bond
  //       hooks — so the grants and the abandonment penalties are all consumed.
  //     - `wireResolution`: READ by the engine dusk sweep (`resolveAbandonedChains`)
  //       → a WireEntry (UI wire ticker) + the disposition penalty.
  //
  //   DIVERGENCE: foundation (ref f2f95fa9) carries NO NPC-chain system and no
  //   storylet/disposition constants, so these arcs and their disposition budget
  //   (+3 / gte2 / +2 / gte3 / +2; abandonment −2..−3; clamp [-10,10], decay one
  //   step / 3 days) are engine-original content, tuned against the T-1204 decay.
  //   Credit/fuel deltas sit in the existing storylet band (~40–350cr). Voice per
  //   the User-Manual register the shipped storylets use.
  // ==========================================================================

  // --- Doc Salvage · EPISODE 3 of 3 (Savior Complex; "I was left once"). Doc's
  //     rescue skiff is impounded at a port over a salvage-rights dispute. His
  //     Bond (never leaves a mayday) makes him fight it whether you help or not —
  //     which is exactly why abandoning it stings. Scheduled by follow-up (ep2)
  //     above; gated on the +2/+3 that beat granted. ---
  {
    id: 'chain.doc-salvage.impound',
    title: "Doc Salvage's Skiff Is Impounded",
    prose:
      'Doc Salvage wires from a port lockup: his rescue skiff — the one he answers maydays in — is impounded over a salvage-rights dispute, and the bond to spring it is more coin than a man who gives medicine away for free has ever held.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-doc-salvage', disposition: { gte: 2 } },
      flags: [{ name: 'chain.doc-salvage.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 5,
      wireMessage:
        "Doc Salvage's skiff cleared impound on its own docket while your channel stayed dark — he fought the port alone and won, and he logged who wasn't there.",
      effects: {
        disposition: [{ npcId: 'npc-doc-salvage', delta: -2 }],
        flags: [{ name: 'chain.doc-salvage.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'post-the-bond',
        label: 'Post the bond',
        prose: 'Count out the coin and spring the skiff. A mayday answered is a mayday answered.',
        requirements: { credits: { gte: 100 } },
        effects: {
          credits: -100,
          disposition: [{ npcId: 'npc-doc-salvage', delta: 3 }],
          flags: [{ name: 'chain.doc-salvage.resolved', value: 'bonded' }],
        },
      },
      {
        id: 'stand-with-him',
        label: 'Fight the dispute at the counter',
        prose:
          'Skip the bond and take the salvage-rights fight to the port master, clause by clause, until the skiff comes free.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
        successEffects: {
          disposition: [{ npcId: 'npc-doc-salvage', delta: 3 }],
          flags: [{ name: 'chain.doc-salvage.resolved', value: 'freed' }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-doc-salvage', delta: 1 }],
          flags: [{ name: 'chain.doc-salvage.resolved', value: 'freed-hard' }],
        },
      },
      {
        id: 'let-him-fight',
        label: 'Let Doc fight it alone',
        prose:
          'Tell Doc he has the grit for it. He does — but a friend who watches from orbit is still a friend who watched.',
        effects: {
          disposition: [{ npcId: 'npc-doc-salvage', delta: 1 }],
          flags: [{ name: 'chain.doc-salvage.resolved', value: 'alone' }],
        },
      },
    ],
  },

  // --- Silk Dagger · "settle the debt behind her name" (Bond: Space Dragons;
  //     Flaw: Vengeful). Core port: Altair-3 (system 3). ---
  {
    id: 'chain.silk-dagger.marker',
    title: 'The Debt Behind Her Name',
    prose:
      'Silk Dagger finds you at Altair-3 with a debt-marker she cannot carry herself: a Space Dragon collector holds her true name against an old marker, and she needs a hull with no history to walk it in. "You," she says. "You are nobody yet. That is useful."',
    repeat: 'never',
    trigger: {
      systemIds: [3],
      npc: { id: 'npc-silk-dagger' },
      flags: [{ name: 'chain.silk-dagger.resolved', exists: false }],
    },
    choices: [
      {
        id: 'carry-the-marker',
        label: 'Carry the marker',
        prose:
          'Take the marker and the name written under it. Whatever Silk owes the Dragons, you are the one walking it to the door now.',
        effects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 3 }],
          flags: [{ name: 'chain.silk-dagger.marker_carried', value: true }],
          schedule: [{ storyletId: 'chain.silk-dagger.collector', delayDays: 1 }],
        },
      },
      {
        id: 'decline-the-marker',
        label: "Stay out of Silk's debts",
        prose:
          'Hand the marker back. A name you cannot read is a debt you cannot price. Silk takes it without a word — vengeful people rarely argue; they remember.',
        effects: {
          flags: [{ name: 'chain.silk-dagger.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'chain.silk-dagger.collector',
    title: 'The Collector Wants More',
    prose:
      "The Space Dragon collector reads the marker, then reads you, and names a figure twice what the marker says. Somewhere behind your ear, Silk's voice — vengeful and very calm — suggests the collector has made a mistake he can only make once.",
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-silk-dagger', disposition: { gte: 2 } },
      flags: [{ name: 'chain.silk-dagger.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'Word off the Dragon lanes: Silk Dagger stopped waiting on your relay and settled the collector her own way. A body, a burned ledger, and a marker nobody will call in again.',
      effects: {
        disposition: [{ npcId: 'npc-silk-dagger', delta: -3 }],
        flags: [{ name: 'chain.silk-dagger.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'hold-the-line',
        label: 'Hold to the marker',
        prose:
          'Tell the collector the marker reads what it reads and you will not pay a credit over it. Silk likes that you did not fold.',
        effects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 2 }],
          schedule: [{ storyletId: 'chain.silk-dagger.reckoning', delayDays: 1 }],
        },
      },
      {
        id: 'lean-on-him',
        label: 'Lean on him for Silk',
        prose:
          'Let the collector understand, quietly, whose name he is leaning on and how short the Dragons keep their patience. Do it well and he remembers his manners.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 3 }],
          schedule: [{ storyletId: 'chain.silk-dagger.reckoning', delayDays: 1 }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 1 }],
          schedule: [{ storyletId: 'chain.silk-dagger.reckoning', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'chain.silk-dagger.reckoning',
    title: "Silk's Reckoning",
    prose:
      'The marker comes due, and Silk Dagger meets you at the reckoning with a choice already burning behind her eyes: pay the name clean and be done, or help her make sure no collector ever writes it down again.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-silk-dagger', disposition: { gte: 3 } },
      flags: [{ name: 'chain.silk-dagger.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        "The debt behind Silk Dagger's name closed itself while you drifted — settled in the Dragon way, permanent and unwitnessed. She will remember you were elsewhere for it.",
      effects: {
        disposition: [{ npcId: 'npc-silk-dagger', delta: -3 }],
        flags: [{ name: 'chain.silk-dagger.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'pay-it-clean',
        label: 'Pay the name clean',
        prose:
          'Count out the marker in full and burn the record after. Silk watches her name come off the Dragon ledger and, for once, does not reach for the vengeful answer.',
        requirements: { credits: { gte: 150 } },
        effects: {
          credits: -150,
          disposition: [{ npcId: 'npc-silk-dagger', delta: 2 }],
          flags: [{ name: 'chain.silk-dagger.resolved', value: 'paid' }],
        },
      },
      {
        id: 'burn-the-collector',
        label: 'Burn the collector with her',
        prose:
          "Stand at Silk's shoulder while she closes the debt her way. It is ugly, and it is final, and the Dragons will know whose hull was parked outside.",
        requirements: { statCheck: { stat: Stat.GUILE, dc: 13 } },
        successEffects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 3 }],
          flags: [{ name: 'chain.silk-dagger.resolved', value: 'burned' }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: 1 }],
          flags: [{ name: 'chain.silk-dagger.resolved', value: 'burned-hard' }],
        },
      },
      {
        id: 'walk-away',
        label: 'Walk before the reckoning',
        prose:
          "Tell Silk this is hers to close, not yours. She lets you go. Whether that costs you later is a Dragon's arithmetic, and Dragons keep long books.",
        effects: {
          disposition: [{ npcId: 'npc-silk-dagger', delta: -1 }],
          flags: [{ name: 'chain.silk-dagger.resolved', value: 'walked' }],
        },
      },
    ],
  },

  // --- Wild Card · "is his big score worth co-signing" (Bond: Hates the Astro
  //     League; Flaw: Chaotic). Core port: Denebola-5 (system 6). ---
  {
    id: 'chain.wild-card.pitch',
    title: "Wild Card's Big Score",
    prose:
      'Wild Card corners you at Denebola-5 grinning like a man holding a lit fuse. "An arbitrage," he says, "against an Astro League clearing house. Beautiful. Illegal in four systems. All I need is a co-signer with a clean name — and here you are, clean as a whistle."',
    repeat: 'never',
    trigger: {
      systemIds: [6],
      npc: { id: 'npc-wild-card' },
      flags: [{ name: 'chain.wild-card.resolved', exists: false }],
    },
    choices: [
      {
        id: 'hear-the-pitch',
        label: 'Co-sign the pitch',
        prose:
          "Put your clean name next to Wild Card's dirty plan. The League has it coming, and the split — if it holds — is real money.",
        effects: {
          disposition: [{ npcId: 'npc-wild-card', delta: 3 }],
          flags: [{ name: 'chain.wild-card.co_signed', value: true }],
          schedule: [{ storyletId: 'chain.wild-card.co-sign', delayDays: 1 }],
        },
      },
      {
        id: 'wave-him-off',
        label: 'Want no part of it',
        prose:
          'Tell Wild Card to find another name. He shrugs, delighted, already three plans down the road. "Suit yourself. More for me."',
        effects: {
          flags: [{ name: 'chain.wild-card.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'chain.wild-card.co-sign',
    title: 'The Plan Has Changed',
    prose:
      'A day in, Wild Card\'s beautiful arbitrage has mutated into something with three more moving parts and a Warlord fence attached. "Improved it," he says. Chaotic to the bone, he cannot help himself — and your name is still on it.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-wild-card', disposition: { gte: 2 } },
      flags: [{ name: 'chain.wild-card.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'Wild Card ran his Astro League score without waiting on you — the wire cannot agree whether it was genius or a fireball, only that your name was nowhere near it.',
      effects: {
        disposition: [{ npcId: 'npc-wild-card', delta: -2 }],
        flags: [{ name: 'chain.wild-card.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'ride-the-chaos',
        label: 'Ride the chaos',
        prose:
          'Tell Wild Card the new parts are fine because arguing with him is like arguing with weather. He whoops. The plan gets worse and better at once.',
        effects: {
          disposition: [{ npcId: 'npc-wild-card', delta: 2 }],
          schedule: [{ storyletId: 'chain.wild-card.fallout', delayDays: 1 }],
        },
      },
      {
        id: 'rein-him-in',
        label: 'Rein the plan back in',
        prose:
          'Cut the three worst moving parts out before they cut you. Wild Card sulks for exactly one second, then admits the leaner plan might actually clear.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          disposition: [{ npcId: 'npc-wild-card', delta: 3 }],
          schedule: [{ storyletId: 'chain.wild-card.fallout', delayDays: 1 }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-wild-card', delta: 1 }],
          schedule: [{ storyletId: 'chain.wild-card.fallout', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'chain.wild-card.fallout',
    title: 'The Score Comes Down',
    prose:
      'The arbitrage lands, one way or another, and Wild Card turns to you with the split slip in his hand and that fuse-grin still lit. Co-sign the take and walk away rich and wanted, or bail now and let him carry the whole beautiful mess himself.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-wild-card', disposition: { gte: 3 } },
      flags: [{ name: 'chain.wild-card.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Wild Card score resolved without your signature on the take — he split it with the fence and kept your name off the paper, which is either mercy or a marker for later.',
      effects: {
        disposition: [{ npcId: 'npc-wild-card', delta: -2 }],
        flags: [{ name: 'chain.wild-card.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'take-the-split',
        label: 'Take the split',
        prose:
          'Sign the take and pocket your share of a fortune the Astro League will spend years failing to trace. Wild Card toasts you with something that should not be drinkable.',
        effects: {
          credits: 300,
          disposition: [{ npcId: 'npc-wild-card', delta: 2 }],
          flags: [{ name: 'chain.wild-card.resolved', value: 'cashed' }],
        },
      },
      {
        id: 'bail-out',
        label: 'Bail before the paper lands',
        prose:
          'Wave the split away and get your name off everything before the clearing house notices. Wild Card grins wider — a man who bails clean is a man he can pitch again.',
        effects: {
          disposition: [{ npcId: 'npc-wild-card', delta: 1 }],
          flags: [{ name: 'chain.wild-card.resolved', value: 'bailed' }],
        },
      },
    ],
  },

  // --- Rattlesnake · "never lets an insult go" (Bond: Warlord Confed; Flaw:
  //     Vengeful). Core port: Aldebaran-1 (system 2). This chain's disposition
  //     consequence pairs with the T-1204 grudge-weighted interceptor selection —
  //     a soured Rattlesnake hunts you. ---
  {
    id: 'chain.rattlesnake.insult',
    title: 'A Matter of Respect',
    prose:
      'Rattlesnake is nursing a grudge at the Aldebaran-1 bar and a Warlord rival\'s insult still hanging in the air. He wants a second — a witness with steady nerves — for the satisfaction he intends to collect. "You don\'t let a thing like that stand," he tells you. It is not really a question.',
    repeat: 'never',
    trigger: {
      systemIds: [2],
      npc: { id: 'npc-rattlesnake' },
      flags: [{ name: 'chain.rattlesnake.resolved', exists: false }],
    },
    choices: [
      {
        id: 'stand-second',
        label: 'Stand his second',
        prose:
          'Agree to witness. A Warlord takes his second seriously, and Rattlesnake will remember who stood at his shoulder when the insult had to be answered.',
        effects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 3 }],
          flags: [{ name: 'chain.rattlesnake.seconding', value: true }],
          schedule: [{ storyletId: 'chain.rattlesnake.escalation', delayDays: 1 }],
        },
      },
      {
        id: 'stay-out',
        label: 'Stay out of it',
        prose:
          'Tell Rattlesnake his quarrels are his own. He hisses something about fair-weather friends and turns back to the insult. A vengeful man files that too.',
        effects: {
          flags: [{ name: 'chain.rattlesnake.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'chain.rattlesnake.escalation',
    title: 'Past the Point of Reason',
    prose:
      "By the next dock Rattlesnake has stopped talking about satisfaction and started talking about the rival's whole crew. The insult has grown teeth in his head, the way they always do with him — vengeful past reason, and building toward something a bar cannot hold.",
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-rattlesnake', disposition: { gte: 2 } },
      flags: [{ name: 'chain.rattlesnake.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'Rattlesnake stopped waiting for his second and answered the insult alone — the wire has the whole ugly duel, and your name is not in the witness column.',
      effects: {
        disposition: [{ npcId: 'npc-rattlesnake', delta: -3 }],
        flags: [{ name: 'chain.rattlesnake.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'keep-him-focused',
        label: 'Keep it to the one man',
        prose:
          'Talk Rattlesnake down from the crew to the man who actually spoke — a duel he can win, not a war he cannot. He grudgingly narrows the target.',
        effects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 2 }],
          schedule: [{ storyletId: 'chain.rattlesnake.duel', delayDays: 1 }],
        },
      },
      {
        id: 'let-him-rage',
        label: 'Let him work up to it',
        prose:
          'Stand back and let Rattlesnake build the grudge as tall as he wants. It is his insult; he will carry it however he carries it, and he likes that you did not flinch.',
        effects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 2 }],
          schedule: [{ storyletId: 'chain.rattlesnake.duel', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'chain.rattlesnake.duel',
    title: "Rattlesnake's Duel",
    prose:
      'It comes to a duel, the way it was always going to. Rattlesnake stands ready at the line with the insult finally in reach, and turns to you: back his gun, talk him off it one last time, or leave him to answer for himself.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-rattlesnake', disposition: { gte: 3 } },
      flags: [{ name: 'chain.rattlesnake.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'Rattlesnake took his duel with no one at his back and made the wire headlines doing it — he lived, he collected, and he noted the empty space where a friend should have stood.',
      effects: {
        disposition: [{ npcId: 'npc-rattlesnake', delta: -3 }],
        flags: [{ name: 'chain.rattlesnake.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'back-his-gun',
        label: 'Back his gun',
        prose:
          'Stand at the line with Rattlesnake and see the insult answered. It is Warlord justice, blunt and final, and he will not forget you were there for it.',
        effects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 3 }],
          flags: [{ name: 'chain.rattlesnake.resolved', value: 'backed' }],
        },
      },
      {
        id: 'talk-him-down',
        label: 'Talk him off the line',
        prose:
          'One last try: put the whole cost of the grudge in front of Rattlesnake and let him choose to walk. A vengeful man almost never does — but almost is not never.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 13 } },
        successEffects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 2 }],
          flags: [{ name: 'chain.rattlesnake.resolved', value: 'talked-down' }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: 1 }],
          flags: [{ name: 'chain.rattlesnake.resolved', value: 'dueled' }],
        },
      },
      {
        id: 'leave-him-to-it',
        label: 'Leave him to answer alone',
        prose:
          'Step off the line. Rattlesnake meets the insult without you, and whatever he decides that costs, he decides it with your back turned.',
        effects: {
          disposition: [{ npcId: 'npc-rattlesnake', delta: -1 }],
          flags: [{ name: 'chain.rattlesnake.resolved', value: 'left' }],
        },
      },
    ],
  },

  // --- Stellar Monk · "why he flies empty" (Bond: Space Dragons; Flaw: Pacifist,
  //     flawDc 8). Core port: Deneb-4 (system 5). ---
  {
    id: 'chain.stellar-monk.empty-hold',
    title: 'The Empty Hold',
    prose:
      'You notice it at Deneb-4: the Stellar Monk\'s Zen Drifter runs its holds empty, jump after jump, a trader carrying nothing to trade. When you ask, he only says, "Wealth is ballast," and offers you tea, and does not explain the rest.',
    repeat: 'never',
    trigger: {
      systemIds: [5],
      npc: { id: 'npc-stellar-monk' },
      flags: [{ name: 'chain.stellar-monk.resolved', exists: false }],
    },
    choices: [
      {
        id: 'sit-with-him',
        label: 'Sit and take the tea',
        prose:
          'Accept the cup and the quiet with it. The Monk measures a captain by whether they can sit in silence, and you pass.',
        effects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 3 }],
          flags: [{ name: 'chain.stellar-monk.sat', value: true }],
          schedule: [{ storyletId: 'chain.stellar-monk.confession', delayDays: 1 }],
        },
      },
      {
        id: 'let-it-lie',
        label: 'Let the man keep his silence',
        prose:
          "Some holds are empty for reasons that are nobody's cargo. Thank the Monk for the tea and go. He inclines his head, and the question stays unasked.",
        effects: {
          flags: [{ name: 'chain.stellar-monk.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'chain.stellar-monk.confession',
    title: 'Wealth Is Ballast',
    prose:
      'The next quiet dock, the Monk finishes the sentence he started. There was a full hold once, and a debt of cargo he ran too hard to deliver, and a loss at the end of it that no manifest could carry. He has flown light ever since — a pacifist even against his own greed.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-stellar-monk', disposition: { gte: 2 } },
      flags: [{ name: 'chain.stellar-monk.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Stellar Monk kept his own counsel while your channel stayed empty — he flew on light and silent, the confession unfinished, and did not offer it twice.',
      effects: {
        disposition: [{ npcId: 'npc-stellar-monk', delta: -2 }],
        flags: [{ name: 'chain.stellar-monk.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'hear-him-out',
        label: 'Hear the whole of it',
        prose:
          'Let the Monk lay the loss down entire, without filling his pauses. When he finishes he looks lighter by exactly the weight he set down.',
        effects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 2 }],
          schedule: [{ storyletId: 'chain.stellar-monk.ballast', delayDays: 1 }],
        },
      },
      {
        id: 'offer-the-lanes',
        label: "Offer a spacer's comfort",
        prose:
          'Tell the Monk the lanes take something from everyone who flies them long enough, and that flying light is its own kind of prayer. He almost smiles at the theology.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
        successEffects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 3 }],
          schedule: [{ storyletId: 'chain.stellar-monk.ballast', delayDays: 1 }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 1 }],
          schedule: [{ storyletId: 'chain.stellar-monk.ballast', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'chain.stellar-monk.ballast',
    title: 'The Last Delivery',
    prose:
      'The Monk has one delivery he never made — a small thing, owed to the one he lost, that he has carried in his head instead of his hold for years. He asks, at last, whether you will fly the empty run with him and set it down, or leave him the silence he has learned to live in.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-stellar-monk', disposition: { gte: 3 } },
      flags: [{ name: 'chain.stellar-monk.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Stellar Monk made his last delivery alone on an empty hold while you were elsewhere — the debt of cargo set down at last, the ballast finally shed, with no witness but the dark.',
      effects: {
        disposition: [{ npcId: 'npc-stellar-monk', delta: -2 }],
        flags: [{ name: 'chain.stellar-monk.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'fly-the-run',
        label: 'Fly the empty run with him',
        prose:
          "Burn the quiet lane at the Monk's wing and watch him set the last delivery down. He carries nothing home afterward, and for the first time the empty hold looks like a choice instead of a wound.",
        effects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 2 }],
          flags: [{ name: 'chain.stellar-monk.resolved', value: 'delivered' }],
        },
      },
      {
        id: 'respect-the-silence',
        label: 'Leave him the silence',
        prose:
          'Tell the Monk some cargo is his alone to set down. He accepts it the way he accepts everything — a small bow, no argument — and flies the run without you.',
        effects: {
          disposition: [{ npcId: 'npc-stellar-monk', delta: 1 }],
          flags: [{ name: 'chain.stellar-monk.resolved', value: 'silence' }],
        },
      },
    ],
  },

  // --- The Broker · "owns everyone's secrets" (Bond: owns everyone's secrets;
  //     Flaw: Manipulative). Core port: Arcturus-6 (system 4). ---
  {
    id: 'chain.the-broker.ledger',
    title: "The Broker's Ledger",
    prose:
      'The Broker keeps no cargo aboard the Information Age, only a ledger of what everyone would rather you did not know. At Arcturus-6 he slides a single decrypted secret across the table — genuinely useful, genuinely damaging to a rival of yours — and asks nothing for it. "A gift," he says. "We can settle the favor later."',
    repeat: 'never',
    trigger: {
      systemIds: [4],
      npc: { id: 'npc-the-broker' },
      flags: [{ name: 'chain.the-broker.resolved', exists: false }],
    },
    choices: [
      {
        id: 'take-the-secret',
        label: 'Take the secret',
        prose:
          'Pocket the intel and the open-ended favor that comes bolted to it. The Broker smiles the way a man smiles when the ledger just gained a line in his favor.',
        effects: {
          disposition: [{ npcId: 'npc-the-broker', delta: 3 }],
          flags: [{ name: 'chain.the-broker.indebted', value: true }],
          schedule: [{ storyletId: 'chain.the-broker.favor', delayDays: 1 }],
        },
      },
      {
        id: 'refuse-the-gift',
        label: 'Refuse the gift',
        prose:
          'Slide the secret back unread. A gift from a man who trades in leverage is a debt with better manners. The Broker withdraws it, unoffended, and notes that too.',
        effects: {
          flags: [{ name: 'chain.the-broker.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'chain.the-broker.favor',
    title: 'The Favor Comes Due',
    prose:
      "It does not take long. The Broker calls the favor in and it is exactly what you feared: carry a second secret to a third party, one that ruins someone who never crossed you, so the Broker's ledger balances a debt of his own. Manipulative to the last decimal, he frames it as your idea.",
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-the-broker', disposition: { gte: 2 } },
      flags: [{ name: 'chain.the-broker.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Broker sold your unpaid favor onward while you sat on it — the wire carries the fallout of a secret you never chose to move, filed now under a debt that was always his.',
      effects: {
        disposition: [{ npcId: 'npc-the-broker', delta: -2 }],
        flags: [{ name: 'chain.the-broker.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'carry-the-secret',
        label: 'Carry the second secret',
        prose:
          "Run the Broker's errand and let the ledger balance. It buys his regard and a little of his ledger tilts your way — which is exactly what he wanted you to want.",
        effects: {
          disposition: [{ npcId: 'npc-the-broker', delta: 2 }],
          schedule: [{ storyletId: 'chain.the-broker.leverage', delayDays: 1 }],
        },
      },
      {
        id: 'read-the-play',
        label: 'Read the play first',
        prose:
          'Before you move anything, take the whole board apart and find where the Broker hid his own exposure inside your favor. He respects a captain who counts the cards.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          disposition: [{ npcId: 'npc-the-broker', delta: 3 }],
          schedule: [{ storyletId: 'chain.the-broker.leverage', delayDays: 1 }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-the-broker', delta: 1 }],
          schedule: [{ storyletId: 'chain.the-broker.leverage', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'chain.the-broker.leverage',
    title: 'Whose Leverage',
    prose:
      'The favor delivered, the Broker lays the last card down: the secret you moved for him cuts both ways, and now you hold a line of his ledger too. Pay the debt off clean, refuse him outright, or turn the whole arrangement back on the man who built it.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      npc: { id: 'npc-the-broker', disposition: { gte: 3 } },
      flags: [{ name: 'chain.the-broker.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Broker closed his own ledger while your line sat open — the leverage you might have held went back into his file, and the wire notes he never forgets an account left unsettled.',
      effects: {
        disposition: [{ npcId: 'npc-the-broker', delta: -2 }],
        flags: [{ name: 'chain.the-broker.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'settle-clean',
        label: 'Settle the debt clean',
        prose:
          'Pay the Broker off in coin and cut the leverage both ways. He prefers it messy, but he takes a clean settlement from a captain who insists on one.',
        requirements: { credits: { gte: 150 } },
        effects: {
          credits: -150,
          disposition: [{ npcId: 'npc-the-broker', delta: 2 }],
          flags: [{ name: 'chain.the-broker.resolved', value: 'settled' }],
        },
      },
      {
        id: 'turn-it-back',
        label: 'Turn the leverage back on him',
        prose:
          "Use the line you hold to pin the Broker to his own ledger. Do it right and, for once, the man who owns everyone's secrets owes one to you.",
        requirements: { statCheck: { stat: Stat.GUILE, dc: 13 } },
        successEffects: {
          credits: 200,
          disposition: [{ npcId: 'npc-the-broker', delta: 3 }],
          flags: [{ name: 'chain.the-broker.resolved', value: 'leveraged' }],
        },
        failureEffects: {
          disposition: [{ npcId: 'npc-the-broker', delta: 1 }],
          flags: [{ name: 'chain.the-broker.resolved', value: 'outplayed' }],
        },
      },
      {
        id: 'refuse-outright',
        label: 'Refuse him outright',
        prose:
          'Tell the Broker his ledger is his problem and walk. A manipulative man dislikes a flat no more than a knife — but he files it, and files you, and the account stays open.',
        effects: {
          disposition: [{ npcId: 'npc-the-broker', delta: -1 }],
          flags: [{ name: 'chain.the-broker.resolved', value: 'refused' }],
        },
      },
    ],
  },

  // ==========================================================================
  // T-1503 · ALLIANCE ARCS — one 3-step questline per galactic power (PRD §8.1 /
  //   §2). Each expresses its faction's playstyle and gates its later episodes on
  //   the REPUTATION its earlier episodes granted — the same organic-progression
  //   shape the T-1502 NPC chains use with `npc.disposition`, but on the new
  //   `player.reputation[faction]` state (the named reader of the reputation field).
  //
  //   ERA: every ep1 is gated `eras: ['VETERAN']` — alliance arcs are VETERAN-phase
  //   content (PRD §5.1 Tour One → veteran loop: you SWEAR to a galactic power as a
  //   proven veteran, not a day-1 rookie still under the Guild's opening loan). This
  //   is also what keeps the arcs from perturbing the Tour One early-game: a new
  //   dawn storylet offer at the player's system shifts that day's travel-encounter
  //   RNG fork (dayEventCount → the fork index), so anchoring these openers in the
  //   VETERAN phase leaves every Tour One seeded fixture's board + encounter timing
  //   untouched (see the T-1503 golden note in day-loop-golden.ts).
  //
  //   SHARED SHAPE (mirrors the NPC-chain template above):
  //     - ep1 (the offer): `eras:['VETERAN']` + systemIds-gated at that faction's
  //       CORE anchor (League → Deneb-4/5, Dragons → Aldebaran-1/2, Confederation →
  //       Altair-3/3, Rebels → a rim system/15) + an `alliance.X.resolved
  //       exists:false` gate. NO rep gate (a spacer reaching the veteran phase may
  //       still sit at 0 with a faction). The "engage" choice grants an opening +5
  //       own-faction rep and SCHEDULES ep2; the "decline" out is requirement-free
  //       and sets resolved='declined'.
  //     - ep2 (the proof): `scheduledOnly`, `reputation:{faction, gte:3}` — the
  //       gate ep1's +5 crosses organically. A playstyle stat check (League GRIT,
  //       Dragons GUNS, Confederation TRADE, Rebels GUILE) grants +3, plus a
  //       requirement-free +2 fallback so the chain always advances; both schedule
  //       ep3. Carries a `wireResolution`.
  //     - ep3 (the commitment): `scheduledOnly`, `reputation:{faction, gte:6}` (ep1
  //       +5 and ep2 +2/+3 both clear it). Terminal — the "join/commit" choice
  //       applies the CROSS-FACTION shift (own +FACTION_JOIN_OWN_BONUS, the other
  //       three −FACTION_JOIN_CROSS_PENALTY), sets resolved='joined', pays standing;
  //       a requirement-free "walk" alternative sets resolved='walked'. Carries a
  //       `wireResolution`.
  //
  //   READERS / consumed state (Standing-constraint 7):
  //     - `player.reputation[faction]`: READ by the ep2/ep3 `reputation` gates (the
  //       organic progression gate), the cross-faction shift, and the UI standing
  //       readout — so every grant and the join penalty is consumed.
  //     - `alliance.X.resolved`: READ by every episode's `exists:false` trigger gate
  //       (a resolved arc — joined, declined, or wire-abandoned — never re-offers).
  //     - `wireResolution`: READ by the engine dusk sweep (`resolveAbandonedChains`)
  //       → a WireEntry + the rep penalty.
  //
  //   DIVERGENCE: foundation (f2f95fa9) carries the four powers as SETTING but no
  //   reputation MECHANIC, so these arcs and their rep budget are engine-original
  //   content, tuned as data (factions.ts). Voice per the User-Manual register.
  // ==========================================================================

  // --- Astro League · the patrol writ (law / patrol contracts; GRIT). Anchor:
  //     Deneb-4 (system 5, a League port the veteran ranges to). The VETERAN era
  //     gate (see the SHARED SHAPE header) is what keeps this off the Tour One
  //     early-game seeds; the anchor is simply a League port, not Sun-3. ---
  {
    id: 'alliance.league.writ',
    title: 'A League Patrol Writ',
    prose:
      'A League patrol officer catches you at the Deneb-4 gantry with a deputation writ already half-signed. "We are short hulls and long on lanes," she says. "Ride with the patrol, keep the lanes clean, and the League remembers who stood a watch."',
    repeat: 'never',
    trigger: {
      systemIds: [5],
      eras: ['VETERAN'],
      flags: [{ name: 'alliance.league.resolved', exists: false }],
    },
    choices: [
      {
        id: 'engage',
        label: 'Take the writ',
        prose:
          'Sign the deputation and clip the League chit to your board. The lanes are the League’s, and now, for a while, so are you.',
        effects: {
          reputation: [{ faction: 'league', delta: 5 }],
          flags: [{ name: 'alliance.league.opened', value: true }],
          schedule: [{ storyletId: 'alliance.league.sweep', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Hand the writ back',
        prose:
          'Tell the officer your hull flies for itself. She shrugs — the League has long memories and short deputation lists, and you have just left yourself off one.',
        effects: {
          flags: [{ name: 'alliance.league.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'alliance.league.sweep',
    title: 'Stand the Watch',
    prose:
      'The writ comes due: a smuggler corridor needs a hull that will hold the line while the patrol closes it. Standing a League watch is grit, not glory — long hours, hard boardings, and a lane that stays clean only as long as you do.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'league', gte: 3 },
      flags: [{ name: 'alliance.league.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The League notes a deputized hull that never made its watch — the corridor was closed without you, and the patrol logs who did not stand the line.',
      effects: {
        reputation: [{ faction: 'league', delta: -3 }],
        flags: [{ name: 'alliance.league.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'hold-the-line',
        label: 'Hold the corridor (GRIT)',
        prose:
          'Anchor the lane and outlast the runners. Boarding after boarding, you hold until the corridor is the League’s again.',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 12 } },
        successEffects: {
          reputation: [{ faction: 'league', delta: 3 }],
          schedule: [{ storyletId: 'alliance.league.commission', delayDays: 1 }],
        },
        failureEffects: {
          reputation: [{ faction: 'league', delta: 2 }],
          schedule: [{ storyletId: 'alliance.league.commission', delayDays: 1 }],
        },
      },
      {
        id: 'work-the-desk',
        label: 'Run the writ by the book',
        prose:
          'Skip the heroics and work the deputation the quiet way — manifests, checkpoints, paperwork. It closes the corridor slower, but it closes.',
        effects: {
          reputation: [{ faction: 'league', delta: 2 }],
          schedule: [{ storyletId: 'alliance.league.commission', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'alliance.league.commission',
    title: 'A League Commission',
    prose:
      'You have stood enough watches that the League offers the writ made permanent: a standing commission, a lane of your own to keep — and an oath that the League’s enemies become yours. Swear it, and the Dragons, the Confederation, and the frontier all read the name that just went blue.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'league', gte: 6 },
      flags: [{ name: 'alliance.league.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The League withdrew a commission left unclaimed — the lane went to a hull that answered, and yours went back to flying for itself.',
      effects: {
        reputation: [{ faction: 'league', delta: -3 }],
        flags: [{ name: 'alliance.league.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'commit',
        label: 'Swear the commission',
        prose:
          'Take the oath and the lane both. You are League now, in the record and on the wire — and everyone the League counts an enemy just counted you one.',
        effects: {
          credits: 250,
          reputation: [
            { faction: 'league', delta: FACTION_JOIN_OWN_BONUS },
            { faction: 'dragons', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'confederation', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'rebels', delta: -FACTION_JOIN_CROSS_PENALTY },
          ],
          flags: [{ name: 'alliance.league.resolved', value: 'joined' }],
        },
      },
      {
        id: 'walk',
        label: 'Keep your hull your own',
        prose:
          'Thank the League and hand the lane back. A watch stood is a watch stood, but an oath sworn is a leash — and you were not built for one.',
        effects: {
          reputation: [{ faction: 'league', delta: -1 }],
          flags: [{ name: 'alliance.league.resolved', value: 'walked' }],
        },
      },
    ],
  },

  // --- Space Dragons · the duel circuit (honor / strength; GUNS). Anchor:
  //     Aldebaran-1 (system 2, a Dragons port). ---
  {
    id: 'alliance.dragons.challenge',
    title: 'The Dragons’ Challenge',
    prose:
      'A Space Dragon blocks your berth at Aldebaran-1, unhurried, reading your hull like a ledger of fights you have not had yet. "The circuit is open," she says. "Guns and honor, no ambushes, no debts. Fly it, and the Dragons learn your name the only way that matters."',
    repeat: 'never',
    trigger: {
      systemIds: [2],
      eras: ['VETERAN'],
      flags: [{ name: 'alliance.dragons.resolved', exists: false }],
    },
    choices: [
      {
        id: 'engage',
        label: 'Enter the circuit',
        prose:
          'Take the challenge chit. The Dragons keep score in duels won, and you have just put your name on the board.',
        effects: {
          reputation: [{ faction: 'dragons', delta: 5 }],
          flags: [{ name: 'alliance.dragons.opened', value: true }],
          schedule: [{ storyletId: 'alliance.dragons.circuit', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Refuse the challenge',
        prose:
          'Tell the Dragon you fly to arrive, not to duel. She smiles without warmth — a refused challenge is not a grudge to the Dragons, only a name they stop bothering to learn.',
        effects: {
          flags: [{ name: 'alliance.dragons.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'alliance.dragons.circuit',
    title: 'Fly the Circuit',
    prose:
      'The circuit names your first opponent — a Dragon who has never lost cleanly and does not intend to start. This is honor the Dragon way: guns up, no tricks, and the winner is the one still flying when the other calls it.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'dragons', gte: 3 },
      flags: [{ name: 'alliance.dragons.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Dragons struck a no-show from the circuit board — a name that entered and never flew. Among Dragons, that is worse than a loss.',
      effects: {
        reputation: [{ faction: 'dragons', delta: -3 }],
        flags: [{ name: 'alliance.dragons.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'duel',
        label: 'Fly the duel (GUNS)',
        prose:
          'Meet the Dragon gun to gun and hold nothing back. Honor is measured in the fight, not the outcome — but the Dragons measure a clean win highest.',
        requirements: { statCheck: { stat: Stat.GUNS, dc: 12 } },
        successEffects: {
          reputation: [{ faction: 'dragons', delta: 3 }],
          schedule: [{ storyletId: 'alliance.dragons.crown', delayDays: 1 }],
        },
        failureEffects: {
          reputation: [{ faction: 'dragons', delta: 2 }],
          schedule: [{ storyletId: 'alliance.dragons.crown', delayDays: 1 }],
        },
      },
      {
        id: 'fly-honest',
        label: 'Fly it honest and take the marks',
        prose:
          'Fly the circuit straight, win or lose, and let the Dragons see a hull that never once reached for a trick. They respect the honesty even when the guns come up short.',
        effects: {
          reputation: [{ faction: 'dragons', delta: 2 }],
          schedule: [{ storyletId: 'alliance.dragons.crown', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'alliance.dragons.crown',
    title: 'The Circuit’s Crown',
    prose:
      'You have flown enough of the circuit that the Dragons offer the crown of it: a place among them, wings that answer when you call and a name spoken in the honor-tongue. Take it, and the League, the Confederation, and the frontier all mark the hull that just went Dragon.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'dragons', gte: 6 },
      flags: [{ name: 'alliance.dragons.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Dragons closed the circuit’s crown to a hull that stopped flying it — the wings went to a name that answered, and yours flew on alone.',
      effects: {
        reputation: [{ faction: 'dragons', delta: -3 }],
        flags: [{ name: 'alliance.dragons.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'commit',
        label: 'Take the crown',
        prose:
          'Take the wings and the honor-name both. You are Dragon now — and every hull the Dragons have ever crossed guns with just learned yours.',
        effects: {
          credits: 250,
          reputation: [
            { faction: 'dragons', delta: FACTION_JOIN_OWN_BONUS },
            { faction: 'league', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'confederation', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'rebels', delta: -FACTION_JOIN_CROSS_PENALTY },
          ],
          flags: [{ name: 'alliance.dragons.resolved', value: 'joined' }],
        },
      },
      {
        id: 'walk',
        label: 'Fly out of the circuit',
        prose:
          'Salute the Dragons and fly on. The circuit was a good fight and a fair one, but wings that answer another’s call were never the wings you wanted.',
        effects: {
          reputation: [{ faction: 'dragons', delta: -1 }],
          flags: [{ name: 'alliance.dragons.resolved', value: 'walked' }],
        },
      },
    ],
  },

  // --- Warlord Confederation · the port stake (conquest / ports; TRADE). Anchor:
  //     Altair-3 (system 3, a Confederation port). ---
  {
    id: 'alliance.confederation.stake',
    title: 'A Confederation Stake',
    prose:
      'A Confederation factor finds you at Altair-3 with a proposition and no pretense. "The warlords hold their space by holding its ports," he says. "Buy in — a stake, a lane, a cut of the launch fees — and the Confederation counts you an owner, not a guest."',
    repeat: 'never',
    trigger: {
      systemIds: [3],
      eras: ['VETERAN'],
      flags: [{ name: 'alliance.confederation.resolved', exists: false }],
    },
    choices: [
      {
        id: 'engage',
        label: 'Buy into the stake',
        prose:
          'Put your name on the Confederation’s ledger. In warlord space, property is loyalty, and you have just declared a little of both.',
        effects: {
          reputation: [{ faction: 'confederation', delta: 5 }],
          flags: [{ name: 'alliance.confederation.opened', value: true }],
          schedule: [{ storyletId: 'alliance.confederation.holdings', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Keep out of warlord ledgers',
        prose:
          'Tell the factor your credits stay your own. He closes the slate without a flicker — the Confederation does not argue with a no, it simply stops offering.',
        effects: {
          flags: [{ name: 'alliance.confederation.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'alliance.confederation.holdings',
    title: 'Work the Holdings',
    prose:
      'The stake needs working: a contested launch-fee schedule, a rival owner, and a negotiation that decides whether your cut grows or gets quietly eaten. This is Confederation power the honest way — leverage, ledgers, and a harder bargain than any blockade.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'confederation', gte: 3 },
      flags: [{ name: 'alliance.confederation.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Confederation reassigned a stake its owner never worked — your cut of the launch fees went to a warlord who showed up to claim it.',
      effects: {
        reputation: [{ faction: 'confederation', delta: -3 }],
        flags: [{ name: 'alliance.confederation.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'drive-the-bargain',
        label: 'Drive the bargain (TRADE)',
        prose:
          'Sit the table and grind the schedule your way, clause by clause, until the rival owner signs the smaller cut and calls it generous.',
        requirements: { statCheck: { stat: Stat.TRADE, dc: 12 } },
        successEffects: {
          reputation: [{ faction: 'confederation', delta: 3 }],
          schedule: [{ storyletId: 'alliance.confederation.charter', delayDays: 1 }],
        },
        failureEffects: {
          reputation: [{ faction: 'confederation', delta: 2 }],
          schedule: [{ storyletId: 'alliance.confederation.charter', delayDays: 1 }],
        },
      },
      {
        id: 'hold-the-stake',
        label: 'Just hold the stake and collect',
        prose:
          'Skip the fight for a bigger cut and simply hold what you bought, collecting the fees as they come. The Confederation respects an owner who keeps what is theirs.',
        effects: {
          reputation: [{ faction: 'confederation', delta: 2 }],
          schedule: [{ storyletId: 'alliance.confederation.charter', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'alliance.confederation.charter',
    title: 'A Warlord’s Charter',
    prose:
      'Your holdings have grown enough that the Confederation offers a charter: a warlord’s seat, a share of the whole schedule, and a banner your ports fly under. Take it, and the League, the Dragons, and the frontier all read the flag your hulls just raised.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'confederation', gte: 6 },
      flags: [{ name: 'alliance.confederation.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The Confederation let a charter lapse unclaimed — the seat went to a warlord who wanted it, and your holdings stayed just holdings.',
      effects: {
        reputation: [{ faction: 'confederation', delta: -3 }],
        flags: [{ name: 'alliance.confederation.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'commit',
        label: 'Sign the charter',
        prose:
          'Raise the banner and take the seat. You are Confederation now — a warlord in your own small right — and the powers that are not just felt the map shift.',
        effects: {
          credits: 250,
          reputation: [
            { faction: 'confederation', delta: FACTION_JOIN_OWN_BONUS },
            { faction: 'league', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'dragons', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'rebels', delta: -FACTION_JOIN_CROSS_PENALTY },
          ],
          flags: [{ name: 'alliance.confederation.resolved', value: 'joined' }],
        },
      },
      {
        id: 'walk',
        label: 'Stay an owner, not a warlord',
        prose:
          'Keep the stake and hand back the banner. Property is one thing; a warlord’s seat is a debt paid in loyalty you would rather not owe.',
        effects: {
          reputation: [{ faction: 'confederation', delta: -1 }],
          flags: [{ name: 'alliance.confederation.resolved', value: 'walked' }],
        },
      },
    ],
  },

  // --- Rebel Alliance · the smuggling lane (free trade / frontier; GUILE).
  //     Anchor: a rim system (15, ungoverned frontier). ---
  {
    id: 'alliance.rebels.run',
    title: 'A Frontier Run',
    prose:
      'Out past the last League beacon, a rim runner flags you down with a cargo the core would call contraband and the frontier calls trade. "We move it ourselves out here," she says, "and we remember who runs a lane clean. Care to run one?"',
    repeat: 'never',
    trigger: {
      systemIds: [15],
      eras: ['VETERAN'],
      flags: [{ name: 'alliance.rebels.resolved', exists: false }],
    },
    choices: [
      {
        id: 'engage',
        label: 'Run the lane',
        prose:
          'Take the coordinates and the cargo. The frontier keeps no ledgers but the ones in its head, and you have just been written into one.',
        effects: {
          reputation: [{ faction: 'rebels', delta: 5 }],
          flags: [{ name: 'alliance.rebels.opened', value: true }],
          schedule: [{ storyletId: 'alliance.rebels.lane', delayDays: 1 }],
        },
      },
      {
        id: 'decline',
        label: 'Stay off the frontier lanes',
        prose:
          'Tell the runner your holds fly legal. She grins and lets you pass — the frontier holds no grudge, but it does not open its lanes to a hull that flies for the core.',
        effects: {
          flags: [{ name: 'alliance.rebels.resolved', value: 'declined' }],
        },
      },
    ],
  },
  {
    id: 'alliance.rebels.lane',
    title: 'Run It Quiet',
    prose:
      'The lane runs straight through a League checkpoint that has no business this far out. Running frontier cargo is guile, not guns — a quiet hold, a clean manifest, and a story the patrol believes just long enough to wave you through.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'rebels', gte: 3 },
      flags: [{ name: 'alliance.rebels.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'Word off the rim: a lane went unrun and a runner waited on a hull that never came. The frontier moved the cargo itself, and marked the name that left it holding.',
      effects: {
        reputation: [{ faction: 'rebels', delta: -3 }],
        flags: [{ name: 'alliance.rebels.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'run-it-quiet',
        label: 'Run it past the checkpoint (GUILE)',
        prose:
          'Dress the hold, cool the manifest, and talk the patrol into a lane they should have closed. The frontier loves a runner who makes the core look the other way.',
        requirements: { statCheck: { stat: Stat.GUILE, dc: 12 } },
        successEffects: {
          reputation: [{ faction: 'rebels', delta: 3 }],
          schedule: [{ storyletId: 'alliance.rebels.compact', delayDays: 1 }],
        },
        failureEffects: {
          reputation: [{ faction: 'rebels', delta: 2 }],
          schedule: [{ storyletId: 'alliance.rebels.compact', delayDays: 1 }],
        },
      },
      {
        id: 'go-the-long-way',
        label: 'Take the long dark way around',
        prose:
          'Skip the checkpoint entirely and burn the extra fuel around it. Slower, colder, and every credit yours — the frontier respects a runner who never gets seen at all.',
        effects: {
          reputation: [{ faction: 'rebels', delta: 2 }],
          schedule: [{ storyletId: 'alliance.rebels.compact', delayDays: 1 }],
        },
      },
    ],
  },
  {
    id: 'alliance.rebels.compact',
    title: 'The Frontier Compact',
    prose:
      'You have run enough lanes that the frontier offers the only thing it has to give: the compact — a name spoken as one of theirs, lanes opened on trust, and a stake in the free trade the core keeps trying to close. Take it, and the League, the Dragons, and the Confederation all read the hull that just went rebel.',
    repeat: 'never',
    trigger: {
      scheduledOnly: true,
      reputation: { faction: 'rebels', gte: 6 },
      flags: [{ name: 'alliance.rebels.resolved', exists: false }],
    },
    wireResolution: {
      graceDays: 4,
      wireMessage:
        'The frontier let a compact go unsworn — the lanes opened for a runner who kept coming, and your name stayed a stranger’s on the rim.',
      effects: {
        reputation: [{ faction: 'rebels', delta: -3 }],
        flags: [{ name: 'alliance.rebels.resolved', value: 'wire' }],
      },
    },
    choices: [
      {
        id: 'commit',
        label: 'Swear the compact',
        prose:
          'Take the name and the open lanes both. You are frontier now — free trade and no ledgers — and every power that keeps one just crossed you off it.',
        effects: {
          credits: 250,
          reputation: [
            { faction: 'rebels', delta: FACTION_JOIN_OWN_BONUS },
            { faction: 'league', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'dragons', delta: -FACTION_JOIN_CROSS_PENALTY },
            { faction: 'confederation', delta: -FACTION_JOIN_CROSS_PENALTY },
          ],
          flags: [{ name: 'alliance.rebels.resolved', value: 'joined' }],
        },
      },
      {
        id: 'walk',
        label: 'Run free of every flag',
        prose:
          'Thank the frontier and keep flying no one’s lanes but your own. Even a compact of free traders is a compact — and you came out here to owe nobody.',
        effects: {
          reputation: [{ faction: 'rebels', delta: -1 }],
          flags: [{ name: 'alliance.rebels.resolved', value: 'walked' }],
        },
      },
    ],
  },

  // ==========================================================================
  // T-1504 · Era-event storylet tie-ins. The 6 era EVENTS were already authored
  // (eraEvents.ts); this task supplies the STORYLET tie-ins the now-real era-event
  // trigger (T-1302, `trigger.eraEvent.defId`) was built for — one per era id, so
  // "every era fires >= 1 tied storylet" is reachable in a seed sweep. Each gates
  // on `eraEvent.defId` ONLY (never `inAffectedSystem`), so it is eligible wherever
  // the ship is the moment the era goes live — the wire bulletin reaches you
  // galaxy-wide (the reachability-robust choice the era-coverage sweep relies on).
  // The `wire.` id prefix routes them to the Galactic-Wire surface (ui format.ts
  // `storyletSurface`). Two blockade/famine/fuel-crisis storylets carry a
  // `deedProgress` first choice — the era->Deed reader that earns war_profiteer /
  // crisis_courier (content deeds.ts), mirroring beacon_keeper. No held
  // `.aboard`/`.riding` flags (keeps them clear of the held-flag-clearer sweep).
  //
  // READERS / consumed state (Standing-constraint 7): the ONLY state these
  // tie-ins write is `credits`, `fuel` (never, here) and `deedProgress` — all
  // genuinely consumed downstream (deedProgress is read by the deed-earning /
  // rank-up path in engine/deeds.ts and asserted in deed-coverage.test.ts /
  // conqueror.test.ts). These storylets deliberately set NO `flags`: a set-only
  // flag no requirement/UI/engine reads is a receipt, not a feature, so the
  // "engage vs sit out" fork is expressed purely through the consumed effects
  // (the engage choice pays credits and/or advances a deed; the sit-out choice
  // is a genuine no-op decline). The `repeat: 'never'` re-offer guard is driven
  // by `state.storylets.completed[id]` in engine/storylets.ts, not by any flag.
  {
    id: 'wire.blockade.premium-run',
    title: 'The Cordon Premium',
    prose:
      'A Confederation cordon has drawn tight, and the wire is thick with brokers begging for anything bound inside. Freight that clears the line fetches a warlord’s ransom — and the lanes have grown teeth to match.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'blockade' },
    },
    choices: [
      {
        id: 'run-the-cordon',
        label: 'Run the cordon for the premium',
        prose:
          'Burn for the line while the price is high. A hold that clears a blockade is worth three that don’t, and everyone on the wire knows your vector now.',
        effects: {
          credits: 200,
          deedProgress: [{ deedId: 'war_profiteer', amount: 1 }],
        },
      },
      {
        id: 'sit-it-out',
        label: 'Wait for the cordon to lift',
        prose: 'Let the desperate run the teeth. Keep the drives cold and the hold whole.',
      },
    ],
  },
  {
    id: 'wire.dilithium-rush.stake-claim',
    title: 'Strike Fever',
    prose:
      'The wire crackles with a strike: a dilithium seam has cracked wide, and the boomtown will pay named prices for crystal and rare elements hauled in before it plays out.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'dilithium_rush' },
    },
    choices: [
      {
        id: 'haul-crystal',
        label: 'Chase the rush',
        prose: 'Point the nose at the boom and name your rate while the seam still runs hot.',
        effects: {
          credits: 150,
        },
      },
      {
        id: 'let-it-pass',
        label: 'Let the rush pass',
        prose: 'Boomtowns empty as fast as they fill. Keep to the lanes you already know.',
      },
    ],
  },
  {
    id: 'wire.patrol-crackdown.checkpoint',
    title: 'League Checkpoint',
    prose:
      'Astro League patrols have flooded the lanes, and a checkpoint drone hails you for papers. Safer skies, tighter brokers — the crackdown cuts both ways, and the drone is waiting.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'patrol_crackdown' },
    },
    choices: [
      {
        id: 'show-papers',
        label: 'Show clean papers',
        prose: 'Hand the drone a manifest that reads exactly as it should and wave it on.',
      },
      {
        id: 'grease-the-checkpoint',
        label: 'Grease the checkpoint',
        prose: 'Slide a consideration across so the drone loses interest in your hold entirely.',
        requirements: { credits: { gte: 60 } },
        effects: {
          credits: -60,
        },
      },
    ],
  },
  {
    id: 'wire.famine.relief-run',
    title: 'A World Gone Hungry',
    prose:
      'Crop failure has a whole system by the throat, and the wire is one long plea for foodstuffs. Dry goods and nutri-cargo fetch double at the docks — and hungry eyes watch every approach.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'famine' },
    },
    choices: [
      {
        id: 'run-relief',
        label: 'Run the relief lane',
        prose:
          'Load what feeds people and push through the watching lanes. A courier the famine remembers is a courier every dock will.',
        effects: {
          credits: 150,
          deedProgress: [{ deedId: 'crisis_courier', amount: 1 }],
        },
      },
      {
        id: 'hold-cargo',
        label: 'Hold your cargo back',
        prose: 'Let someone else run the hungry lanes today. Keep the hold and the hull whole.',
      },
    ],
  },
  {
    id: 'wire.fuel-crisis.rationing',
    title: 'Every Jump Bleeds',
    prose:
      'Refinery sabotage has doubled fuel across the band, and the wire is full of ships stranded on empty tanks. Every jump bleeds credits now — but every haul that lands is worth the burn twice over.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'fuel_crisis' },
    },
    choices: [
      {
        id: 'ration-and-push',
        label: 'Ration hard and push through',
        prose:
          'Trim every wasted burn and run the lanes the crisis emptied. The cargo that gets through in a fuel drought is the cargo they never forget.',
        effects: {
          deedProgress: [{ deedId: 'crisis_courier', amount: 1 }],
        },
      },
      {
        id: 'wait-out-the-crisis',
        label: 'Wait the refineries back online',
        prose: 'Park the ship and let the price fall out of the sky before you burn another drop.',
      },
    ],
  },
  {
    // Plague already has the richer, cargo-gated `cargo.medicinals.plague-relief`
    // exemplar (kept as-is). This era-only tie-in gives the plague era a storylet
    // reachable on the era ALONE (no Medicinals contract required), so the
    // era-coverage sweep can confirm the plague era fires a tied storylet the same
    // way it confirms the other five.
    id: 'wire.plague.contagion-cordon',
    title: 'The Fever Wire',
    prose:
      'A fever outbreak has a port under cordon, and the wire is thick with a Governor’s appeal: medicine at any price, and the desperate circling the ships that carry it.',
    repeat: 'never',
    trigger: {
      eraEvent: { defId: 'plague' },
    },
    choices: [
      {
        id: 'answer-the-appeal',
        label: 'Answer the appeal',
        prose: 'Log the cordon and keep a lane open for anything the fever port needs run in.',
        effects: {
          credits: 100,
        },
      },
      {
        id: 'keep-clear',
        label: 'Keep clear of the cordon',
        prose: 'A fever port is a fever port. Note it on the wire and give it a wide berth.',
      },
    ],
  },
] as const);
