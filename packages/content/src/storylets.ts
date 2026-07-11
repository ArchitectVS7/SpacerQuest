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
] as const);
