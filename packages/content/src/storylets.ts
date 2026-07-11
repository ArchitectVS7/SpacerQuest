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

  // --- Day-30 Wise One of Polaris-1 hook (T-113a) ---
  // The decisive Day-30 beat (PRD §5.1): at Polaris-1 (system 17) the Wise One
  // sells the captain the first fragment of the Nemesis Signal — the hook that
  // opens the veteran game. There is no dedicated Wise One NPC in the cast
  // (only the trader "Penny Wise"), so this gates on day + Polaris-1, not npc.
  //
  // T-111b: this now grants a REAL fragment (`grantFragment`) into the
  // nemesisFile — the knowledge item the Sage of Mizar-9 later decodes. The flag
  // `signal.fragment.wise-one-01` is kept alongside it as the hook-completion
  // marker other content/UI may branch on. Resolution of the debt (cleared vs
  // unpaid) and the veteran-unlock flag are T-113b, not authored here.
  {
    id: 'wise-one.polaris.signal-hook',
    title: 'The Wise One of Polaris-1',
    prose:
      'The Wise One keeps a cold cabin at the edge of Polaris-1 and a longer memory than the Guild. When you dock, the old spacer is already waiting with a data sliver held between two fingers. "A signal," they say, "from the wrong side of the black hole. You will want to hear the rest of it. That costs."',
    repeat: 'never',
    trigger: {
      eras: ['TOUR_ONE'],
      systemIds: [17],
      day: { equals: 30 },
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
] as const);
