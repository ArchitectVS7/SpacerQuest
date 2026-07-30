import { describe, expect, it } from 'vitest';
import {
  CONTRABAND_FENCE_REP_SCAN_PENALTY,
  ERA_EVENTS,
  FENCE_REP_FLAG,
  STORYLETS,
  Stat,
  defineStorylets,
  type StoryletDefinition,
} from '@spacerquest/content';
import { applyPatrolContrabandScan } from '../actions/patrol.js';
import { applyPlayerAction, endDay, startDay } from '../day.js';
import { CORE_SYSTEM_IDS, RIM_SYSTEM_IDS } from '../era.js';
import { CURRENT_SAVE_VERSION, SaveEnvelopeSchema, createSave, loadSave } from '../save.js';
import {
  eligibleStorylets,
  quoteStoryletChoice,
  refreshAvailableStorylets,
  resolveAbandonedChains,
  resolveStoryletChoice,
  triggerMatches,
} from '../storylets.js';
import { evaluateDeeds } from '../deeds.js';
import { SeededRng } from '../rng.js';
import { createInitialState, deserializeState, serializeState } from '../state.js';
import { DayPhase, EncounterState, GameEvent, GameState } from '../types.js';

function readyState(): GameState {
  const state = createInitialState(110);
  state.dayPhase = DayPhase.DAY;
  state.player.dawnHand = { dice: [20, 12, 6, 3, 1], spent: [false, false, false, false, false] };
  return state;
}

// The 12 storylets that predate the T-401 cargo/passenger batch, in content
// order. New batches append after these — this stays their canonical prefix.
const ORIGINAL_STORYLET_IDS = [
  'cargo.medicinals.quarantine-seal',
  'port.sun3.guild-auditor',
  'chain.doc-salvage.distress-ping',
  'chain.doc-salvage.follow-up',
  'guild.pressure.tour-one.day10',
  'guild.pressure.tour-one.day20',
  'guild.pressure.tour-one.day25',
  'wise-one.polaris.signal-hook',
  'sage.mizar.decode-first',
  'derelict.sealed-pod',
  'resolution.tour-one.cleared',
  'resolution.tour-one.unpaid',
] as const;

// T-401 · the 25 cargo & passenger storylets, in content order.
const T401_STORYLET_IDS = [
  'cargo.dry-goods.short-count',
  'cargo.nutri-goods.spoilage-scare',
  'cargo.spices.customs-sniff',
  'cargo.medicinals.plague-relief',
  'cargo.electronics.gray-market-buyer',
  'cargo.precious-metals.escort-shakedown',
  'cargo.rare-elements.assay-dispute',
  'cargo.photonic.calibration-drift',
  'cargo.ticking-crate.discovered',
  'cargo.ticking-crate.aftermath',
  'passenger.false-name.board',
  'passenger.false-name.arrival',
  'passenger.pilgrim.board',
  'passenger.pilgrim.arrival',
  'passenger.fugitive.board',
  'passenger.fugitive.arrival',
  'passenger.orphan.board',
  'passenger.orphan.arrival',
  'passenger.medic.board',
  'passenger.medic.arrival',
  'passenger.courier.sealed-orders',
  'passenger.gambler.debt',
  'passenger.deadhead.empty-berth',
  'passenger.stowaway.discovered',
  'passenger.envoy.sealed-writ',
] as const;

// T-1301 · the veteran-era opener, appended after the T-401 batch. The first
// `eras:['VETERAN']` content — proof the era gate admits veteran storylets once
// the Day-30 resolution flips the campaign era.
const T1301_STORYLET_IDS = ['veteran.first-lane'] as const;

// T-1302 · the renown-gated veteran beat, appended after the T-1301 opener. The
// first storylet delivered by renown rank rather than day/system/cargo.
const T1302_STORYLET_IDS = ['veteran.guild-recognition'] as const;

// T-1305 · the Smuggler Ray fence storylets — PRD §7.5's "third out" for a
// sealed pod / Contraband contract, appended after the T-1302 beat.
const T1305_STORYLET_IDS = ['fence.ray.sealed-pod', 'fence.ray.contraband-cargo'] as const;

// T-1310 · Nemesis-arc reachability batch (appended last): the rimward wire rumor
// that leads a player to the Wise One, and the four Sage decode storylets for
// fragments 02–05 (the missing decode paths).
const T1310_STORYLET_IDS = [
  'wire.rimward.polaris-signal',
  'sage.mizar.decode-02',
  'sage.mizar.decode-03',
  'sage.mizar.decode-04',
  'sage.mizar.decode-05',
] as const;

// T-1501 · Ports & rumors batch (20), appended after the T-1310 batch: the nine
// mandatory per-system port beats (systemIds-only, giving every core+rim system
// a reachable storylet), six richer rim-character beats, four Wise One / Sage
// audience scenes, and one extra core Fomalhaut vignette — in content order.
const T1501_STORYLET_IDS = [
  'port.aldebaran.grain-exchange',
  'port.fomalhaut.dust-market',
  'port.vega6.homecoming-gantry',
  'port.antares.gateway-watch',
  'port.capella.drive-yard',
  'port.polaris.frontier-berth',
  'port.mizar.robotics-row',
  'port.achernar.nav-beacon',
  'port.algol.no-repair',
  'port.antares.andromeda-operations',
  'port.capella.herbal-run',
  'port.achernar.gem-cutters',
  'port.algol.frontier-justice',
  'port.mizar.liquor-hall',
  'port.polaris.ice-harvest',
  'wise-one.polaris.counsel',
  'wise-one.polaris.parable',
  'sage.mizar.constellation-quiz',
  'sage.mizar.star-lore',
  'port.fomalhaut.deep-dark',
] as const;

// T-1502 · NPC personal chains (appended last): Doc Salvage's episode 3, plus
// five new 3-episode arcs (Silk Dagger, Wild Card, Rattlesnake, Stellar Monk,
// The Broker). Doc's ep1/ep2 remain in the ORIGINAL prefix — only ep3 is new.
const T1502_STORYLET_IDS = [
  'chain.doc-salvage.impound',
  'chain.silk-dagger.marker',
  'chain.silk-dagger.collector',
  'chain.silk-dagger.reckoning',
  'chain.wild-card.pitch',
  'chain.wild-card.co-sign',
  'chain.wild-card.fallout',
  'chain.rattlesnake.insult',
  'chain.rattlesnake.escalation',
  'chain.rattlesnake.duel',
  'chain.stellar-monk.empty-hold',
  'chain.stellar-monk.confession',
  'chain.stellar-monk.ballast',
  'chain.the-broker.ledger',
  'chain.the-broker.favor',
  'chain.the-broker.leverage',
] as const;

// T-1503 · Alliance arcs (appended last): four 3-step questlines, one per galactic
// power, gating their later episodes on faction reputation.
const T1503_STORYLET_IDS = [
  'alliance.league.writ',
  'alliance.league.sweep',
  'alliance.league.commission',
  'alliance.dragons.challenge',
  'alliance.dragons.circuit',
  'alliance.dragons.crown',
  'alliance.confederation.stake',
  'alliance.confederation.holdings',
  'alliance.confederation.charter',
  'alliance.rebels.run',
  'alliance.rebels.lane',
  'alliance.rebels.compact',
] as const;

// T-1504b · Era-event tie-in batch (appended last): at least one storylet per
// authored era event, so every economic upheaval now delivers a beat to play.
// The per-defId coverage (every ERA_EVENTS id has a tie-in) and the seeded
// "it actually fires" sweep live in
// `packages/sim/src/__tests__/era-storylet-coverage.test.ts` (owned by T-1504d).
// The unit-level proofs — offering, dead-end freedom, flag readers, round-trip —
// are the `T-1504b era-event storylet tie-ins` block below.
const T1504_STORYLET_IDS = [
  'era.blockade.tariff-clerk',
  'era.blockade.cordon-run',
  'era.plague.quarantine-line',
  'era.dilithium.boomtown-berth',
  'era.dilithium.claim-jumper',
  'era.crackdown.checkpoint',
  'era.famine.ration-queue',
  'era.fuel-crisis.dry-depot',
] as const;

// T-1505a · Nemesis fragments & decode paths (appended last): the two NPC-held
// fragment grants, the two Sage-archive grants, and a decode path for each of the
// seven net-new fragments (06–12). The "every fragment has a decode path" guard is
// derived from content in `nemesis.test.ts`; this list is the batch-membership
// proof (the ids loaded and validated — defineStorylets throws otherwise).
const T1505_STORYLET_IDS = [
  'npc.rust-bucket.scrap-sliver',
  'npc.void-whisper.psalm-shard',
  'sage.mizar.archive',
  'sage.mizar.final-line',
  'sage.mizar.decode-06',
  'sage.mizar.decode-07',
  'sage.mizar.decode-08',
  'sage.mizar.decode-09',
  'sage.mizar.decode-10',
  'sage.mizar.decode-11',
  'sage.mizar.decode-12',
] as const;

// T-1505b · The crossing & the stake (appended after the T-1505a batch): the one
// beat that signs the stake and lifts the NEMESIS destination gate. It is its own
// batch line rather than an addition to T1505_STORYLET_IDS because it belongs to a
// different task, and because it is the only `repeat:'daily'` entry in the Nemesis
// arc (re-attemptability after a decline or a refused stake).
const T1505B_STORYLET_IDS = ['nemesis.crossing.the-stake'] as const;

// T-114 · The three explore questline hooks (docs/EXPLORE_REDESIGN.md §2.2/§2.5).
// Its own batch line for the established reason: it belongs to a different task.
// What is NEW about these three is only WHO schedules them — an explore
// `questline` outcome row rather than another storylet's choice — which is why
// `defineStorylets` now takes `EXPLORE_SCHEDULED_STORYLET_IDS` as a second
// argument. Every other property is an ordinary `scheduledOnly` chain episode's.
const T114_STORYLET_IDS = [
  'explore.cold-berth.survivor',
  'explore.signal-debt.claim',
  'explore.black-ledger.courier',
] as const;

describe('storylet content validation', () => {
  it('accepts exported STORYLETS with the originals as a prefix and the later batches appended', () => {
    const ids = STORYLETS.map((storylet) => storylet.id);
    // The 12 originals are still present, in order, as the leading prefix.
    expect(ids.slice(0, ORIGINAL_STORYLET_IDS.length)).toEqual([...ORIGINAL_STORYLET_IDS]);
    // All 25 T-401 storylets loaded and validated (defineStorylets throws on any
    // malformed entry, so reaching here at all proves they validate).
    for (const id of T401_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1301 veteran opener loaded and validated.
    for (const id of T1301_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1302 renown-gated veteran beat loaded and validated.
    for (const id of T1302_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1305 Smuggler Ray fence storylets loaded and validated.
    for (const id of T1305_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1310 Nemesis-arc reachability batch loaded and validated.
    for (const id of T1310_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1501 ports & rumors batch loaded and validated.
    for (const id of T1501_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1502 NPC personal chains batch loaded and validated.
    for (const id of T1502_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1503 alliance arcs batch loaded and validated.
    for (const id of T1503_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1504 era-event tie-in batch loaded and validated.
    for (const id of T1504_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1505a Nemesis fragment / decode-path batch loaded and validated.
    for (const id of T1505_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1505b crossing beat loaded and validated.
    for (const id of T1505B_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-114 explore questline hooks loaded and validated. Reaching here at all
    // proves the external-scheduler seam works: each is `scheduledOnly` with a
    // `wireResolution`, and NO storylet schedules them — `defineStorylets` would
    // throw on both counts if the explore rows were not supplying the ids.
    for (const id of T114_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    expect(ids).toHaveLength(
      ORIGINAL_STORYLET_IDS.length +
        T401_STORYLET_IDS.length +
        T1301_STORYLET_IDS.length +
        T1302_STORYLET_IDS.length +
        T1305_STORYLET_IDS.length +
        T1310_STORYLET_IDS.length +
        T1501_STORYLET_IDS.length +
        T1502_STORYLET_IDS.length +
        T1503_STORYLET_IDS.length +
        T1504_STORYLET_IDS.length +
        T1505_STORYLET_IDS.length +
        T1505B_STORYLET_IDS.length +
        T114_STORYLET_IDS.length,
    );
    // No duplicate ids across the whole set.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('T-401: every storylet offers at least one requirement-free choice (never dead-ends the day)', () => {
    // The day must always be resolvable: each storylet carries a choice with no
    // credits / spendDie / statCheck gate, so a broke, die-spent captain can
    // always close it out.
    for (const storylet of STORYLETS as readonly StoryletDefinition[]) {
      const hasFreeChoice = storylet.choices.some((choice) => !choice.requirements);
      expect(hasFreeChoice, `${storylet.id} has no requirement-free choice`).toBe(true);
    }
  });

  it('T-401: every held-state flag (aboard / riding) has a reachable clearer', () => {
    // A flag a head sets to mean "carrying / aboard" must be cleared by some
    // storylet, or the fare/crate strands forever (a soft dead-end).
    const setHeld = new Set<string>();
    const cleared = new Set<string>();
    for (const storylet of STORYLETS as readonly StoryletDefinition[]) {
      for (const choice of storylet.choices) {
        for (const effects of [choice.effects, choice.successEffects, choice.failureEffects]) {
          for (const flag of effects?.flags ?? []) {
            const isHeld = flag.name.endsWith('.aboard') || flag.name.endsWith('.riding');
            if (!isHeld) continue;
            if ('clear' in flag) cleared.add(flag.name);
            else setHeld.add(flag.name);
          }
        }
      }
    }
    for (const name of setHeld) {
      expect(cleared.has(name), `${name} is set but never cleared`).toBe(true);
    }
  });

  it('throws loudly for malformed data', () => {
    expect(() =>
      defineStorylets([
        {
          id: 'bad.storylet',
          title: 'Bad',
          prose: 'Bad data.',
          trigger: { systemIds: [999] },
          choices: [{ id: 'only', label: 'Only', prose: 'One choice.' }],
        },
        {
          id: 'bad.storylet',
          title: 'Duplicate',
          prose: 'Bad data.',
          trigger: { scheduledOnly: true },
          choices: [
            { id: 'a', label: 'A', prose: 'A.' },
            { id: 'a', label: 'A again', prose: 'A again.' },
          ],
        },
      ]),
    ).toThrow(/Invalid storylet content:\n - .*duplicated/s);
  });

  it('T-1502: rejects a wireResolution with a bad graceDays', () => {
    expect(() =>
      defineStorylets([
        {
          id: 'wr.head',
          title: 'Head',
          prose: 'p',
          trigger: { systemIds: [1] },
          choices: [
            {
              id: 'go',
              label: 'Go',
              prose: 'p',
              effects: { schedule: [{ storyletId: 'wr.tail', delayDays: 1 }] },
            },
            { id: 'no', label: 'No', prose: 'p' },
          ],
        },
        {
          id: 'wr.tail',
          title: 'Tail',
          prose: 'p',
          trigger: { scheduledOnly: true },
          wireResolution: { graceDays: -1, wireMessage: 'the wire resolves it' },
          choices: [
            { id: 'x', label: 'X', prose: 'p' },
            { id: 'y', label: 'Y', prose: 'p' },
          ],
        },
      ]),
    ).toThrow(/graceDays must be non-negative/);
  });

  it('T-1502: rejects a wireResolution on a storylet nothing schedules', () => {
    expect(() =>
      defineStorylets([
        {
          id: 'wr.orphan',
          title: 'Orphan',
          prose: 'p',
          trigger: { systemIds: [1] },
          wireResolution: { graceDays: 3, wireMessage: 'the wire resolves it' },
          choices: [
            { id: 'a', label: 'A', prose: 'p' },
            { id: 'b', label: 'B', prose: 'p' },
          ],
        },
      ]),
    ).toThrow(/has a wireResolution but no storylet schedules it/);
  });
});

describe('resolveAbandonedChains (T-1502 wire-resolution sweep)', () => {
  // Arm a real chain the honest way: play Silk Dagger's ep1 at Altair-3, which
  // grants +3 and schedules ep2 (`chain.silk-dagger.collector`, graceDays 4) for
  // the next day. No hand-poking of scheduled/disposition — the chain arms itself.
  function armSilkChain(): GameState {
    let state = readyState();
    state.player.currentSystemId = 3;
    state = refreshAvailableStorylets(state).state;
    const played = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'chain.silk-dagger.marker',
      choiceId: 'carry-the-marker',
    });
    return played.state;
  }

  const EP2 = 'chain.silk-dagger.collector';
  const NPC = 'npc-silk-dagger';

  it('resolves an abandoned episode past dueDay + graceDays: wire line, disposition penalty, completed + cleared', () => {
    const armed = armSilkChain();
    const entry = armed.storylets.scheduled.find((s) => s.storyletId === EP2);
    expect(entry).toBeDefined();
    const dispoBefore = armed.npcs.find((n) => n.id === NPC)!.disposition;
    expect(dispoBefore).toBe(3); // ep1 granted +3, nothing has decayed it

    // Past the grace window: graceDays is 4, so the sweep fires when day > dueDay+4.
    armed.day = entry!.dueDay + 5;
    const { state: after, events } = resolveAbandonedChains(armed);

    // The authored Galactic-Wire line is filed (kind 'npc' → UI wire ticker).
    const wireMsg = STORYLETS.find((s) => s.id === EP2)!.wireResolution.wireMessage;
    expect(wireMsg).toContain('Silk Dagger');
    expect(events).toContainEqual({
      type: 'WireEntry',
      day: armed.day,
      kind: 'npc',
      message: wireMsg,
    });
    // The abandonment disposition penalty (−3) lands through the shared mover.
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: NPC,
        delta: -3,
        reason: 'storylet',
      }),
    );
    expect(after.npcs.find((n) => n.id === NPC)!.disposition).toBe(dispoBefore - 3);
    // The chain is stamped resolved, completed, and unscheduled — it can't re-offer.
    expect(after.flags['chain.silk-dagger.resolved']).toBe('wire');
    expect(after.storylets.completed[EP2]).toBe(armed.day);
    expect(after.storylets.scheduled.some((s) => s.storyletId === EP2)).toBe(false);
  });

  it('does not fire before the deadline', () => {
    const armed = armSilkChain();
    const entry = armed.storylets.scheduled.find((s) => s.storyletId === EP2)!;
    // Exactly at dueDay + graceDays (4) — NOT strictly past it, so it holds.
    armed.day = entry.dueDay + 4;
    const { events } = resolveAbandonedChains(armed);
    expect(events).toEqual([]);
  });

  it('does not fire once the episode is already completed (played)', () => {
    const armed = armSilkChain();
    const entry = armed.storylets.scheduled.find((s) => s.storyletId === EP2)!;
    armed.day = entry.dueDay + 5;
    armed.storylets.completed[EP2] = entry.dueDay; // player already played it
    const { events } = resolveAbandonedChains(armed);
    expect(events).toEqual([]);
  });

  it('is pure and deterministic across a JSON round-trip', () => {
    const armed = armSilkChain();
    const entry = armed.storylets.scheduled.find((s) => s.storyletId === EP2)!;
    armed.day = entry.dueDay + 5;

    const before = JSON.stringify(armed);
    const a = resolveAbandonedChains(armed);
    // Input untouched (the sweep clones internally).
    expect(JSON.stringify(armed)).toBe(before);

    const clone = deserializeState(serializeState(armed));
    const b = resolveAbandonedChains(clone);
    expect(b.events).toEqual(a.events);
  });
});

describe('storylet engine', () => {
  it('finds and resolves the cargo demo headlessly', () => {
    const state = readyState();
    state.player.currentSystemId = 2;
    // A Medicinals (type 4) contract. The plague-relief storylet needs a live
    // `plague` era event (state.eraEvent is null here), so a plain Medicinals run
    // no longer arms it. quarantine-seal is the sole CARGO match; T-1501 added the
    // Aldebaran-1 (system 2) port beat and T-1502 added Rattlesnake's chain opener
    // there — both systemIds-only (Rattlesnake's ep1 also gates on its
    // `chain.rattlesnake.resolved exists:false`, which is unset here) — so all
    // three surface, in content order after the cargo match. (T-1503's Space Dragons
    // alliance opener is also at Aldebaran-1, but it is `eras:['VETERAN']`-gated and
    // readyState is TOUR_ONE, so it stays dormant here.)
    state.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };

    const refreshed = refreshAvailableStorylets(state);

    expect(refreshed.state.storylets.available.map((offer) => offer.storyletId)).toEqual([
      'cargo.medicinals.quarantine-seal',
      'port.aldebaran.grain-exchange',
      'chain.rattlesnake.insult',
    ]);
    const offer = refreshed.state.storylets.available[0];
    expect(offer?.title).toBe('Quarantine Seal');
    expect(offer?.prose).toContain('quarantine seal');
    expect(offer?.choices).toEqual([
      expect.objectContaining({
        id: 'inspect',
        label: 'Inspect the seal',
        requirements: { statCheck: { stat: Stat.GRIT, dc: 11 } },
      }),
      expect.objectContaining({ id: 'leave', label: 'Leave it alone' }),
    ]);
    expect(refreshed.events).toEqual([
      {
        type: 'StoryletOffered',
        day: 1,
        storyletId: 'cargo.medicinals.quarantine-seal',
        scheduled: false,
      },
      {
        type: 'StoryletOffered',
        day: 1,
        storyletId: 'port.aldebaran.grain-exchange',
        scheduled: false,
      },
      {
        type: 'StoryletOffered',
        day: 1,
        storyletId: 'chain.rattlesnake.insult',
        scheduled: false,
      },
    ]);

    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'cargo.medicinals.quarantine-seal',
        choiceId: 'inspect',
        spendDie: 0,
      },
      new SeededRng(1),
    );

    expect(resolved.state.player.credits).toBe(1250);
    expect(resolved.state.flags['cargo.medicinals.seal_verified']).toBe(true);
    expect(resolved.state.player.dawnHand?.spent[0]).toBe(true);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StatCheck',
        stat: Stat.GRIT,
        actionContext: 'storylet',
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletChoiceResolved',
        storyletId: 'cargo.medicinals.quarantine-seal',
        choiceId: 'inspect',
        success: true,
      }),
    );
  });

  it('offers the Sun-3 port storylet and applies credits, flags, and checks', () => {
    const state = readyState();
    const dawn = startDay(createInitialState(110));

    expect(dawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'port.sun3.guild-auditor',
    );

    state.player.currentSystemId = 1;
    const refreshed = refreshAvailableStorylets(state);
    const result = applyPlayerAction(refreshed.state, {
      type: 'Storylet',
      storyletId: 'port.sun3.guild-auditor',
      choiceId: 'argue',
      spendDie: 0,
    });

    expect(result.state.player.credits).toBe(1050);
    expect(result.state.flags['port.sun3.audit_outargued']).toBe(true);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'StatCheck',
        stat: Stat.GUILE,
        actionContext: 'storylet',
      }),
    );
  });

  it('schedules a chained follow-up due the next day and resolves its effects', () => {
    let state = readyState();
    state.player.currentSystemId = 1;
    state = refreshAvailableStorylets(state).state;

    const initial = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
    });

    expect(initial.events).toContainEqual({
      type: 'StoryletScheduled',
      day: 1,
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
      scheduledStoryletId: 'chain.doc-salvage.follow-up',
      dueDay: 2,
    });

    const dusk = endDay(initial.state);
    const nextDawn = startDay(dusk.state);

    expect(nextDawn.state.storylets.available.map((offer) => offer.storyletId)).toContain(
      'chain.doc-salvage.follow-up',
    );

    const resolved = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
    });

    const doc = resolved.state.npcs.find((npc) => npc.id === 'npc-doc-salvage');
    expect(resolved.state.player.credits).toBe(1125);
    expect(doc?.disposition).toBe(2);
    expect(resolved.events).toContainEqual({
      type: 'StoryletDeedProgress',
      day: 2,
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
      deedId: 'beacon_keeper',
      amount: 1,
    });
    // The deedProgress wire is real: the count deed advances and earns.
    expect(resolved.state.player.registry.matchCounts['beacon_keeper']).toBe(1);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'DeedEarned', deedId: 'beacon_keeper' }),
    );
    expect(resolved.state.player.registry.earned.map((deed) => deed.id)).toContain('beacon_keeper');
  });

  it('reports the ACTUAL clamped disposition delta, not the requested one', () => {
    let state = readyState();
    state.player.currentSystemId = 1;
    state = refreshAvailableStorylets(state).state;

    const initial = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.distress-ping',
      choiceId: 'answer',
    });
    const nextDawn = startDay(endDay(initial.state).state);

    // Doc already adores the player: +9, one step below the clamp ceiling.
    // The follow-up's +2 effect can only land 1 of it.
    nextDawn.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')!.disposition = 9;

    const resolved = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'chain.doc-salvage.follow-up',
      choiceId: 'accept-thanks',
    });

    const doc = resolved.state.npcs.find((npc) => npc.id === 'npc-doc-salvage');
    expect(doc?.disposition).toBe(10);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletEffectApplied',
        effect: 'disposition',
        npcId: 'npc-doc-salvage',
        amount: 1,
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-doc-salvage',
        delta: 1,
        disposition: 10,
        reason: 'storylet',
      }),
    );
  });

  it('keeps deterministic eligibility in content order', () => {
    const state = readyState();
    state.player.currentSystemId = 1;
    // A Medicinals (type 4) run with no live era event: the T-1302 plague-relief
    // storylet stays dormant (no state.eraEvent), so the three original eligibility
    // matches remain exactly as before. (T-1503's Astro League opener anchors at
    // Deneb-4/system 5 — a League port off the start — deliberately NOT Sun-3, so
    // it never perturbs the day-1 Sun-3 board or the early-game encounter timing.)
    state.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };

    expect(eligibleStorylets(state).map((offer) => offer.storyletId)).toEqual([
      'cargo.medicinals.quarantine-seal',
      'port.sun3.guild-auditor',
      'chain.doc-salvage.distress-ping',
    ]);
  });

  it('blocks insufficient credits without spending a die', () => {
    const state = readyState();
    state.player.currentSystemId = 1;
    state.player.credits = 50;
    const refreshed = refreshAvailableStorylets(state);

    const result = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'port.sun3.guild-auditor',
        choiceId: 'pay',
        spendDie: 0,
      },
      new SeededRng(1),
    );

    expect(result.events).toEqual([
      {
        type: 'StoryletChoiceBlocked',
        day: 1,
        storyletId: 'port.sun3.guild-auditor',
        choiceId: 'pay',
        reason: 'insufficient-credits',
      },
    ]);
    expect(result.state.player.dawnHand?.spent[0]).toBe(false);
    expect(result.state.player.credits).toBe(50);
  });

  // -------------------------------------------------------------------------
  // T-1604b · F1 — a storylet credit penalty can never drive credits negative.
  //
  // UGT campaign finding F1 (docs/playtests/T-1604a-ugt-campaign.md §7): the
  // `credits` branch of `applyEffects` was a bare `+=`, so an authored fine larger
  // than the purse pushed `player.credits` below zero. Measured twice, in two
  // independent legs, both landing on −40 — and once negative the state persisted
  // for dozens of subsequent steps. That violates the PRD design law that debt is
  // a LEDGER and credits are never a hole (PRD-REIMAGINED §"Scarcity of choices,
  // never a poverty trap").
  //
  // MUTATION EVIDENCE: the first test below was run against the pre-fix engine and
  // failed RED (credits −40, amount −40) before the one-line clamp in
  // `storylets.ts` `applyEffects` turned it GREEN.
  // -------------------------------------------------------------------------
  describe('T-1604b · F1 storylet credit floor', () => {
    /** Put a real content storylet on the offer list directly. The eligibility
     *  triggers are not what is under test here — the effect application is — and
     *  the two witnessed storylets are gated on cargo/system state that would
     *  otherwise have to be faked anyway. */
    function offerOf(state: GameState, storyletId: string): void {
      const def = (STORYLETS as readonly StoryletDefinition[]).find((s) => s.id === storyletId);
      if (!def) throw new Error(`no such storylet: ${storyletId}`);
      state.storylets.available.push({
        storyletId: def.id,
        title: def.title,
        prose: def.prose,
        choices: def.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          prose: choice.prose,
          requirements: choice.requirements,
        })),
        day: state.day,
        scheduled: false,
      });
    }

    /** A DAY state whose hand is [20, 1]: die 0 is a natural 20 (auto-success)
     *  and die 1 a natural 1 (auto-fail), so either branch of a statCheck choice
     *  can be forced deterministically without touching the rng. */
    function forcedState(credits: number): GameState {
      const state = createInitialState(110);
      state.dayPhase = DayPhase.DAY;
      state.player.dawnHand = { dice: [20, 1], spent: [false, false] };
      state.player.credits = credits;
      return state;
    }

    function creditEffects(
      events: GameEvent[],
    ): Extract<GameEvent, { type: 'StoryletEffectApplied' }>[] {
      return events.filter(
        (e): e is Extract<GameEvent, { type: 'StoryletEffectApplied' }> =>
          e.type === 'StoryletEffectApplied' && e.effect === 'credits',
      );
    }

    it('the audited −40 case: eat-the-loss at 0 credits floors at 0 and reports a 0 delta', () => {
      // Leg 3, ep 6, step 73 (day 6, Aldebaran-1) of the T-1604a campaign.
      const state = forcedState(0);
      offerOf(state, 'cargo.nutri-goods.spoilage-scare');

      const result = resolveStoryletChoice(
        state,
        {
          type: 'Storylet',
          storyletId: 'cargo.nutri-goods.spoilage-scare',
          choiceId: 'eat-the-loss',
        },
        new SeededRng(1),
      );

      expect(result.state.player.credits).toBe(0);
      // The APPLIED delta, not the authored −40 — the semantic this fix pins.
      expect(creditEffects(result.events)).toEqual([
        expect.objectContaining({
          type: 'StoryletEffectApplied',
          storyletId: 'cargo.nutri-goods.spoilage-scare',
          choiceId: 'eat-the-loss',
          effect: 'credits',
          amount: 0,
        }),
      ]);
    });

    it('the roll-outcome twin: broker-it FAILING at 0 credits floors at 0', () => {
      // Leg 4, ep 0, step 312 (day 23, Aldebaran-1). The −40 here is the failure
      // branch of a TRADE check the captain could not decline, which is exactly
      // why the floor belongs in the engine and not in a content requirement.
      const state = forcedState(0);
      offerOf(state, 'port.aldebaran.grain-exchange');

      const result = resolveStoryletChoice(
        state,
        {
          type: 'Storylet',
          storyletId: 'port.aldebaran.grain-exchange',
          choiceId: 'broker-it',
          spendDie: 1, // face 1 → natural 1 → the check auto-fails
        },
        new SeededRng(1),
      );

      const roll = result.events.find((e) => e.type === 'StatCheck');
      expect(roll && roll.type === 'StatCheck' && roll.result.success).toBe(false);
      expect(result.state.player.credits).toBe(0);
      expect(creditEffects(result.events)).toEqual([
        expect.objectContaining({ effect: 'credits', amount: 0 }),
      ]);
    });

    it('a PARTIAL floor reports the applied delta, not the authored one', () => {
      // 10 credits against a −40 fine: the purse empties, and the event says −10.
      const state = forcedState(10);
      offerOf(state, 'cargo.nutri-goods.spoilage-scare');

      const result = resolveStoryletChoice(
        state,
        {
          type: 'Storylet',
          storyletId: 'cargo.nutri-goods.spoilage-scare',
          choiceId: 'eat-the-loss',
        },
        new SeededRng(1),
      );

      expect(result.state.player.credits).toBe(0);
      expect(creditEffects(result.events)).toEqual([
        expect.objectContaining({ effect: 'credits', amount: -10 }),
      ]);
    });

    it('EVERY authored credit penalty in content is unpayable-safe (the finding class, not the two witnesses)', () => {
      // The regression that actually closes F1: sweep every storylet × choice ×
      // effect bundle that debits credits, drive it from the LOWEST balance the
      // choice's own requirements permit, and assert (a) the purse never goes
      // negative and (b) the emitted credit deltas sum to the real movement, so a
      // clamped fine can never overstate itself in the log. A future content author
      // writing an unguarded fine is safe by construction.
      let swept = 0;
      for (const storylet of STORYLETS as readonly StoryletDefinition[]) {
        for (const choice of storylet.choices) {
          const bundles: [string, number | undefined][] = [
            ['effects', choice.effects?.credits],
            ['successEffects', choice.successEffects?.credits],
            ['failureEffects', choice.failureEffects?.credits],
          ];
          for (const [bundle, authored] of bundles) {
            if (authored === undefined || authored >= 0) continue;
            // Start at the poorest legal balance for this choice.
            const gate = choice.requirements?.credits;
            const startCredits = gate?.equals ?? gate?.gte ?? 0;
            const state = forcedState(startCredits);
            offerOf(state, storylet.id);
            const needsDie = Boolean(
              choice.requirements?.spendDie || choice.requirements?.statCheck,
            );
            // die 0 (nat 20) forces the success branch, die 1 (nat 1) the failure
            // branch; an unconditional `effects` bundle takes whichever is legal.
            const spendDie = needsDie ? (bundle === 'failureEffects' ? 1 : 0) : undefined;

            const result = resolveStoryletChoice(
              state,
              {
                type: 'Storylet',
                storyletId: storylet.id,
                choiceId: choice.id,
                ...(spendDie === undefined ? {} : { spendDie }),
              },
              new SeededRng(1),
            );

            const label = `${storylet.id}/${choice.id}/${bundle}`;
            expect(
              result.events.some((e) => e.type === 'StoryletChoiceBlocked'),
              `${label} was blocked — the sweep must actually resolve it`,
            ).toBe(false);
            expect(
              result.state.player.credits,
              `${label} drove credits negative`,
            ).toBeGreaterThanOrEqual(0);
            const reported = creditEffects(result.events).reduce(
              (sum, e) => sum + (e.amount ?? 0),
              0,
            );
            expect(reported, `${label} misreported its applied delta`).toBe(
              result.state.player.credits - startCredits,
            );
            swept += 1;
          }
        }
      }
      // Non-vacuity: the sweep must actually have found penalties to test.
      expect(swept).toBeGreaterThan(10);
    });
  });

  it('preserves flags, schedules, completion, and NPC disposition through serialization', () => {
    const state = createInitialState(110);
    state.flags['test.flag'] = true;
    state.storylets.completed['port.sun3.guild-auditor'] = 1;
    state.storylets.scheduled.push({
      storyletId: 'chain.doc-salvage.follow-up',
      dueDay: 2,
      sourceStoryletId: 'chain.doc-salvage.distress-ping',
      sourceChoiceId: 'answer',
    });
    state.npcs[0].disposition = -2;

    const restored = deserializeState(serializeState(state));

    expect(restored.flags).toEqual(state.flags);
    expect(restored.storylets).toEqual(state.storylets);
    expect(restored.npcs[0].disposition).toBe(-2);
  });
});

describe('T-113a Tour One guild pressure and Wise One hook', () => {
  it('surfaces each guild beat only on its exact target day', () => {
    // Guild wires follow the captain anywhere, so location is irrelevant for the
    // three pressure beats. (The Wise One hook is NOT day-exact since T-1310 — it
    // is a window; see the dedicated windowed test below.)
    const beats: Array<{ day: number; systemId: number; id: string }> = [
      { day: 10, systemId: 2, id: 'guild.pressure.tour-one.day10' },
      { day: 20, systemId: 2, id: 'guild.pressure.tour-one.day20' },
      { day: 25, systemId: 2, id: 'guild.pressure.tour-one.day25' },
    ];

    for (const beat of beats) {
      const state = readyState();
      state.day = beat.day;
      state.player.currentSystemId = beat.systemId;

      const eligible = eligibleStorylets(state).map((offer) => offer.storyletId);
      expect(eligible).toContain(beat.id);

      // Not eligible the day before or the day after — day-triggered, deterministic.
      const early = readyState();
      early.day = beat.day - 1;
      early.player.currentSystemId = beat.systemId;
      expect(eligibleStorylets(early).map((o) => o.storyletId)).not.toContain(beat.id);

      const late = readyState();
      late.day = beat.day + 1;
      late.player.currentSystemId = beat.systemId;
      expect(eligibleStorylets(late).map((o) => o.storyletId)).not.toContain(beat.id);
    }
  });

  it('gates the Wise One hook to Polaris-1', () => {
    const away = readyState();
    away.day = 30;
    away.player.currentSystemId = 1; // Sun-3, not Polaris-1
    expect(eligibleStorylets(away).map((o) => o.storyletId)).not.toContain(
      'wise-one.polaris.signal-hook',
    );
  });

  it('T-1310: the Wise One hook is a window (day >= 25), not a day-30 knife-edge', () => {
    // Before day 25 it is dormant even at Polaris-1; from day 25 on it stays
    // eligible on ANY visit (it never expires), so a captain who arrives late is
    // not locked out of the arc's only source of frag-nemesis-01.
    const before = readyState();
    before.day = 24;
    before.player.currentSystemId = 17;
    expect(eligibleStorylets(before).map((o) => o.storyletId)).not.toContain(
      'wise-one.polaris.signal-hook',
    );

    for (const day of [25, 30, 31, 60, 200]) {
      const at = readyState();
      at.day = day;
      at.player.currentSystemId = 17;
      expect(eligibleStorylets(at).map((o) => o.storyletId)).toContain(
        'wise-one.polaris.signal-hook',
      );
    }
  });

  it('grants the first Signal fragment flag when the hook is bought at Polaris-1', () => {
    const state = readyState();
    state.day = 30;
    state.player.currentSystemId = 17;
    state.player.credits = 5000;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'wise-one.polaris.signal-hook',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'wise-one.polaris.signal-hook',
        choiceId: 'buy-fragment',
      },
      new SeededRng(1),
    );

    expect(resolved.state.flags['signal.fragment.wise-one-01']).toBe(true);
    expect(resolved.state.player.credits).toBe(4500);
    // T-111b: the hook now grants a REAL fragment into the Nemesis file.
    expect(resolved.state.player.nemesisFile.fragments.map((f) => f.fragmentId)).toEqual([
      'frag-nemesis-01',
    ]);
    expect(resolved.state.player.nemesisFile.fragments[0].decoded).toBe(false);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-01',
        source: 'wise-one',
        fragmentCount: 1,
      }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletChoiceResolved',
        storyletId: 'wise-one.polaris.signal-hook',
        choiceId: 'buy-fragment',
      }),
    );
  });
});

describe('T-111b Nemesis Signal — fragment brokers', () => {
  it('the Sage of Mizar-9 decodes the Wise One fragment into lore', () => {
    // Hold the Wise One fragment (undecoded); dock at Mizar-9 (system 18).
    const state = readyState();
    state.player.currentSystemId = 18;
    state.player.nemesisFile.fragments.push({
      fragmentId: 'frag-nemesis-01',
      source: 'wise-one',
      day: 1,
      decoded: false,
    });

    const refreshed = refreshAvailableStorylets(state);
    // The Sage surfaces only because there is an undecoded fragment to decode.
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'sage.mizar.decode-first',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'sage.mizar.decode-first', choiceId: 'decode' },
      new SeededRng(1),
    );

    const fragment = resolved.state.player.nemesisFile.fragments.find(
      (f) => f.fragmentId === 'frag-nemesis-01',
    );
    expect(fragment?.decoded).toBe(true);
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'FragmentDecoded', fragmentId: 'frag-nemesis-01' }),
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ effect: 'fragment-decoded', fragmentId: 'frag-nemesis-01' }),
    );
    // Fragment count is unchanged by decoding — it upgrades, never adds.
    expect(resolved.state.player.nemesisFile.fragments).toHaveLength(1);
  });

  it('the Sage does not surface without an undecoded fragment to decode', () => {
    const away = readyState();
    away.player.currentSystemId = 18; // at Mizar-9, but nemesisFile is empty
    expect(eligibleStorylets(away).map((o) => o.storyletId)).not.toContain(
      'sage.mizar.decode-first',
    );

    // Already decoded → no longer eligible either.
    const decoded = readyState();
    decoded.player.currentSystemId = 18;
    decoded.player.nemesisFile.fragments.push({
      fragmentId: 'frag-nemesis-01',
      source: 'wise-one',
      day: 1,
      decoded: true,
    });
    expect(eligibleStorylets(decoded).map((o) => o.storyletId)).not.toContain(
      'sage.mizar.decode-first',
    );
  });

  it('the derelict sealed-pod storylet is playable headless and grants loot', () => {
    // The Explore loot roll arms the storylet by setting the pending flag.
    const state = readyState();
    state.flags['signal.contraband.pending'] = true;
    state.player.credits = 1000;

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'derelict.sealed-pod',
    );

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'derelict.sealed-pod', choiceId: 'take' },
      new SeededRng(1),
    );

    // Loot: real credits, the carrying flag, and the pending flag cleared.
    expect(resolved.state.player.credits).toBe(1300);
    expect(resolved.state.flags['signal.contraband.carrying']).toBe(true);
    expect(resolved.state.flags['signal.contraband.pending']).toBeUndefined();
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'StoryletEffectApplied', effect: 'credits', amount: 300 }),
    );
  });
});

describe('T-401 cargo & passenger storylets — exemplars', () => {
  it('plague-relief: offered when a live plague event afflicts the port you carry Medicinals into; "run it in" keeps the contract, "sell" clears it', () => {
    const state = readyState();
    state.player.currentSystemId = 2;
    // T-1302: a live `plague` era event whose epicentre is the player's system,
    // carried into on a Medicinals (type 4) contract — the storylet's REAL
    // trigger. The contract destination no longer matters.
    state.eraEvent = { defId: 'plague', startedDay: 1, endsDay: 10, affectedSystemIds: [2] };
    state.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };

    const refreshed = refreshAvailableStorylets(state);
    expect(refreshed.state.storylets.available.map((o) => o.storyletId)).toContain(
      'cargo.medicinals.plague-relief',
    );

    // "Run it in" burns fuel, notes the medic community, and KEEPS the contract —
    // so the honest delivery still earns the runtime mercy_runner Deed on arrival.
    const ran = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'cargo.medicinals.plague-relief', choiceId: 'run-it-in' },
      new SeededRng(1),
    );
    expect(ran.state.player.activeContract).not.toBeNull();
    expect(ran.state.flags['cargo.medicinals.plague-relief.running']).toBe(true);
    expect(ran.events).toContainEqual(
      expect.objectContaining({ type: 'StoryletEffectApplied', effect: 'fuel' }),
    );

    // "Sell to the profiteer" pays raw coin and CLEARS the contract (no delivery,
    // no Deed) — the two-priced values choice.
    const sold = resolveStoryletChoice(
      refreshed.state,
      {
        type: 'Storylet',
        storyletId: 'cargo.medicinals.plague-relief',
        choiceId: 'sell-to-profiteer',
      },
      new SeededRng(1),
    );
    expect(sold.state.player.activeContract).toBeNull();
    expect(sold.state.player.credits).toBe(refreshed.state.player.credits + 300);
    expect(sold.state.flags['cargo.medicinals.plague-relief.sold']).toBe(true);
  });

  it('plague-relief is gated on a live plague event in the afflicted system, not any Medicinals run', () => {
    // Same Medicinals run, but no live era event → dormant.
    const noEvent = readyState();
    noEvent.player.currentSystemId = 2;
    noEvent.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };
    expect(eligibleStorylets(noEvent).map((o) => o.storyletId)).not.toContain(
      'cargo.medicinals.plague-relief',
    );

    // Plague live, but the ship is OUTSIDE its afflicted region → still dormant.
    const outOfRegion = readyState();
    outOfRegion.player.currentSystemId = 2;
    outOfRegion.eraEvent = { defId: 'plague', startedDay: 1, endsDay: 10, affectedSystemIds: [5] };
    outOfRegion.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };
    expect(eligibleStorylets(outOfRegion).map((o) => o.storyletId)).not.toContain(
      'cargo.medicinals.plague-relief',
    );
  });

  it('ticking-crate: "ride it out" schedules the aftermath for the next dawn, which resolves cleanly', () => {
    let state = readyState();
    state.player.currentSystemId = 3;
    // T-1302: a Contraband (type 10) run — the crate is wedged among the sealed
    // contraband. (The type-10 contract itself is signed at a rim allowsContraband
    // port; here we set it directly to exercise the storylet head.)
    state.player.activeContract = { destination: 5, cargoType: 10, payment: 3000, pods: 10 };
    state = refreshAvailableStorylets(state).state;
    expect(state.storylets.available.map((o) => o.storyletId)).toContain(
      'cargo.ticking-crate.discovered',
    );

    const ridden = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'cargo.ticking-crate.discovered',
      choiceId: 'ride-it-out',
    });
    expect(ridden.state.flags['cargo.ticking-crate.riding']).toBe(true);
    expect(ridden.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletScheduled',
        scheduledStoryletId: 'cargo.ticking-crate.aftermath',
        dueDay: 2,
      }),
    );

    const nextDawn = startDay(endDay(ridden.state).state);
    expect(nextDawn.state.storylets.available.map((o) => o.storyletId)).toContain(
      'cargo.ticking-crate.aftermath',
    );

    const resolved = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'cargo.ticking-crate.aftermath',
      choiceId: 'open-it',
    });
    // The aftermath clears the held-state flag on resolution — no soft dead-end.
    expect(resolved.state.flags['cargo.ticking-crate.riding']).toBeUndefined();
    expect(resolved.state.flags['cargo.ticking-crate.claimed']).toBe(true);
  });

  it('false-name passenger: board at origin arms the scheduled arrival, which pays and clears the aboard flag', () => {
    let state = readyState();
    state.player.currentSystemId = 3; // Altair-3, the boarding port
    state = refreshAvailableStorylets(state).state;
    expect(state.storylets.available.map((o) => o.storyletId)).toContain(
      'passenger.false-name.board',
    );

    const boarded = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'passenger.false-name.board',
      choiceId: 'take-aboard',
    });
    expect(boarded.state.flags['passenger.false-name.aboard']).toBe(true);
    expect(boarded.events).toContainEqual(
      expect.objectContaining({
        type: 'StoryletScheduled',
        scheduledStoryletId: 'passenger.false-name.arrival',
        dueDay: 2,
      }),
    );

    // The arrival is a scheduledOnly fare that resolves the next day regardless
    // of where the ship is — she pays her fare in coordinates (PRD §7.2).
    const creditsBefore = boarded.state.player.credits;
    const nextDawn = startDay(endDay(boarded.state).state);
    expect(nextDawn.state.storylets.available.map((o) => o.storyletId)).toContain(
      'passenger.false-name.arrival',
    );

    const paid = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'passenger.false-name.arrival',
      choiceId: 'take-the-coordinates',
    });
    expect(paid.state.player.credits).toBe(creditsBefore + 150);
    expect(paid.state.flags['passenger.false-name.coordinates']).toBe(true);
    // The aboard flag is cleared — the fare is resolved, nothing strands.
    expect(paid.state.flags['passenger.false-name.aboard']).toBeUndefined();
  });
});

describe('T-1302 storylet triggers — era-event, renown, deed, fragment source', () => {
  // --- era-event trigger: A/B on the SAME seed, varying only state.eraEvent /
  //     position (the acceptance's "fires only during the active event in the
  //     afflicted region"). Exercised through the real plague-relief storylet. ---
  it('era-event: plague-relief fires only while the plague is live AND the ship is in the afflicted system (same-seed A/B)', () => {
    const base = readyState();
    base.player.currentSystemId = 2;
    // Carrying Medicinals (type 4) — necessary but NOT sufficient on its own.
    base.player.activeContract = { destination: 8, cargoType: 4, payment: 3000, pods: 10 };

    // A: plague live, epicentre = the ship's system → eligible.
    const live = deserializeState(serializeState(base));
    live.eraEvent = { defId: 'plague', startedDay: 1, endsDay: 10, affectedSystemIds: [2] };
    expect(eligibleStorylets(live).map((o) => o.storyletId)).toContain(
      'cargo.medicinals.plague-relief',
    );

    // B (same seed, only eraEvent nulled): no live event → NOT eligible.
    const noEvent = deserializeState(serializeState(base));
    noEvent.eraEvent = null;
    expect(eligibleStorylets(noEvent).map((o) => o.storyletId)).not.toContain(
      'cargo.medicinals.plague-relief',
    );

    // B' (same seed, event live but ship OUTSIDE the afflicted region) → NOT eligible.
    const outOfRegion = deserializeState(serializeState(base));
    outOfRegion.eraEvent = { defId: 'plague', startedDay: 1, endsDay: 10, affectedSystemIds: [7] };
    expect(eligibleStorylets(outOfRegion).map((o) => o.storyletId)).not.toContain(
      'cargo.medicinals.plague-relief',
    );

    // Wrong event kind (blockade, not plague) over the same system → NOT eligible.
    const wrongEvent = deserializeState(serializeState(base));
    wrongEvent.eraEvent = { defId: 'blockade', startedDay: 1, endsDay: 10, affectedSystemIds: [2] };
    expect(eligibleStorylets(wrongEvent).map((o) => o.storyletId)).not.toContain(
      'cargo.medicinals.plague-relief',
    );
  });

  // --- renown trigger: the fixture fires on a real rank-up driven through the
  //     deed registry (LIEUTENANT → COMMANDER on the first earned deed). ---
  it('renown: the veteran Guild-recognition beat surfaces only once the registry ranks up to Commander', () => {
    const state = readyState();
    state.era = 'VETERAN';
    // Fresh veteran: still a Lieutenant → the Commander-gated beat is dormant.
    expect(state.player.registry.renownRank).toBe('LIEUTENANT');
    expect(eligibleStorylets(state).map((o) => o.storyletId)).not.toContain(
      'veteran.guild-recognition',
    );

    // Drive a REAL rank-up: earn one deed (first_jump) through the registry
    // machinery; deedCount 1 promotes LIEUTENANT → COMMANDER.
    const rankUpEvents = evaluateDeeds(state, [
      {
        type: 'TravelEvent',
        characterId: 'player',
        origin: 1,
        destination: 2,
        fuelUsed: 10,
        success: true,
      },
    ]);
    expect(rankUpEvents).toContainEqual(
      expect.objectContaining({ type: 'RenownRankUp', newRank: 'COMMANDER' }),
    );
    expect(state.player.registry.renownRank).toBe('COMMANDER');

    // Now the renown-gated beat is eligible.
    expect(eligibleStorylets(state).map((o) => o.storyletId)).toContain(
      'veteran.guild-recognition',
    );
  });

  // --- pure-mechanism coverage via the exported triggerMatches against synthetic
  //     fixtures (fast, content-independent). ---
  it('triggerMatches: renown gate is an inclusive >= on the rank order', () => {
    const [fixture] = defineStorylets([
      {
        id: 'test.renown-gate',
        title: 'Renown Gate',
        prose: 'x',
        trigger: { renown: { minRank: 'CAPTAIN' } },
        choices: [
          { id: 'a', label: 'A', prose: 'a' },
          { id: 'b', label: 'B', prose: 'b' },
        ],
      },
    ]);
    const state = readyState();

    state.player.registry.renownRank = 'COMMANDER'; // below CAPTAIN
    expect(triggerMatches(state, fixture)).toBe(false);
    state.player.registry.renownRank = 'CAPTAIN'; // exactly at the gate
    expect(triggerMatches(state, fixture)).toBe(true);
    state.player.registry.renownRank = 'ADMIRAL'; // above the gate
    expect(triggerMatches(state, fixture)).toBe(true);
  });

  it('triggerMatches: eraEvent.defId must match the live event; deed gate reads registry.earned', () => {
    const [eraFixture, deedFixture] = defineStorylets([
      {
        id: 'test.era-gate',
        title: 'Era Gate',
        prose: 'x',
        trigger: { eraEvent: { defId: 'plague' } },
        choices: [
          { id: 'a', label: 'A', prose: 'a' },
          { id: 'b', label: 'B', prose: 'b' },
        ],
      },
      {
        id: 'test.deed-gate',
        title: 'Deed Gate',
        prose: 'x',
        trigger: { deed: { id: 'first_jump' } },
        choices: [
          { id: 'a', label: 'A', prose: 'a' },
          { id: 'b', label: 'B', prose: 'b' },
        ],
      },
    ]);
    const state = readyState();

    // eraEvent.defId: a different live event does NOT match; the pinned one does.
    state.eraEvent = { defId: 'famine', startedDay: 1, endsDay: 5, affectedSystemIds: [1] };
    expect(triggerMatches(state, eraFixture)).toBe(false);
    state.eraEvent = { defId: 'plague', startedDay: 1, endsDay: 5, affectedSystemIds: [1] };
    expect(triggerMatches(state, eraFixture)).toBe(true);
    state.eraEvent = null;
    expect(triggerMatches(state, eraFixture)).toBe(false);

    // deed gate: false until the deed is in registry.earned.
    expect(triggerMatches(state, deedFixture)).toBe(false);
    state.player.registry.earned.push({
      id: 'first_jump',
      title: 'First Jump',
      citation: 'x',
      day: 1,
      eventIndex: 0,
    });
    expect(triggerMatches(state, deedFixture)).toBe(true);
  });

  // --- fragment source: a grant records its TRUE source (acceptance). ---
  it('fragment source: the ticking-crate courier drop records source "derelict", not the Wise One default', () => {
    let state = readyState();
    state.player.currentSystemId = 3;
    // A Contraband (type 10) run arms the ticking-crate head; ride it out to the
    // aftermath, whose "open it" recovers a real fragment from the courier drop.
    state.player.activeContract = { destination: 5, cargoType: 10, payment: 3000, pods: 10 };
    state = refreshAvailableStorylets(state).state;

    const ridden = applyPlayerAction(state, {
      type: 'Storylet',
      storyletId: 'cargo.ticking-crate.discovered',
      choiceId: 'ride-it-out',
    });
    const nextDawn = startDay(endDay(ridden.state).state);
    const opened = applyPlayerAction(nextDawn.state, {
      type: 'Storylet',
      storyletId: 'cargo.ticking-crate.aftermath',
      choiceId: 'open-it',
    });

    // The FragmentAcquired event carries the storylet-parameterized source.
    expect(opened.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-02',
        source: 'derelict',
      }),
    );
    // And the persisted nemesisFile record records the same true source.
    const record = opened.state.player.nemesisFile.fragments.find(
      (f) => f.fragmentId === 'frag-nemesis-02',
    );
    expect(record?.source).toBe('derelict');
  });

  it('fragment source: an omitted fragmentSource still records the Wise One default', () => {
    // The Day-30 Wise One hook grants without a fragmentSource → 'wise-one'.
    const state = readyState();
    state.day = 30;
    state.player.currentSystemId = 17;
    state.player.credits = 5000;
    const refreshed = refreshAvailableStorylets(state);

    const resolved = resolveStoryletChoice(
      refreshed.state,
      { type: 'Storylet', storyletId: 'wise-one.polaris.signal-hook', choiceId: 'buy-fragment' },
      new SeededRng(1),
    );

    expect(resolved.events).toContainEqual(
      expect.objectContaining({
        type: 'FragmentAcquired',
        fragmentId: 'frag-nemesis-01',
        source: 'wise-one',
      }),
    );
    expect(
      resolved.state.player.nemesisFile.fragments.find((f) => f.fragmentId === 'frag-nemesis-01')
        ?.source,
    ).toBe('wise-one');
  });
});

// ---------------------------------------------------------------------------
// T-1504b · Era-event storylet tie-ins.
//
// T-1302 made `trigger.eraEvent` real; this batch hangs STORY on it. These are
// the unit/integration proofs — each era event offers a tie-in when the event is
// fired DIRECTLY onto the state, no tie-in can wedge the day, and every flag the
// batch writes is consumed by a named reader. Sweep-level reachability (the
// engine's own scheduler rolling each event during honest play) is T-1504d's, in
// `packages/sim/src/__tests__/era-storylet-coverage.test.ts`.
// ---------------------------------------------------------------------------

/**
 * Fire an era event DIRECTLY onto the state, scoping `affectedSystemIds` the way
 * engine `era.ts` would at onset: a single-system event strikes where the ship
 * stands, a region event covers a whole starmap band (honouring a def's pinned
 * `scope.region`, else the band the ship is actually in — both are legal rolls).
 * This keeps the `inAffectedSystem` tie-ins testable without poking the scheduler.
 */
function fireEraEvent(state: GameState, defId: string): void {
  const def = ERA_EVENTS.find((candidate) => candidate.id === defId);
  if (!def) throw new Error(`unknown era event: ${defId}`);
  const inCore = CORE_SYSTEM_IDS.includes(state.player.currentSystemId);
  const band =
    def.scope.region === 'rim'
      ? RIM_SYSTEM_IDS
      : def.scope.region === 'core'
        ? CORE_SYSTEM_IDS
        : inCore
          ? CORE_SYSTEM_IDS
          : RIM_SYSTEM_IDS;
  state.eraEvent = {
    defId: def.id,
    startedDay: state.day,
    endsDay: state.day + 10,
    affectedSystemIds:
      def.scope.kind === 'single-system' ? [state.player.currentSystemId] : [...band],
  };
}

/**
 * The GUARANTEED tie-in for an era event, DERIVED from `STORYLETS` — a storylet
 * whose entire trigger is `eraEvent: { defId }`, with no position, flag, cargo,
 * system, renown, deed or schedule gate on top. This is the per-event promise the
 * batch makes; deriving it (rather than hand-listing ids) means a future era event
 * added with no tie-in, or an existing tie-in that someone over-gates, fails here
 * automatically.
 */
function guaranteedTieIn(defId: string): StoryletDefinition | undefined {
  const storylets: readonly StoryletDefinition[] = STORYLETS;
  return storylets.find((storylet) => {
    const triggerKeys = Object.keys(storylet.trigger);
    if (triggerKeys.length !== 1 || triggerKeys[0] !== 'eraEvent') return false;
    const era = storylet.trigger.eraEvent;
    if (!era) return false;
    const eraKeys = Object.keys(era);
    return eraKeys.length === 1 && eraKeys[0] === 'defId' && era.defId === defId;
  });
}

function byId(storyletId: string): StoryletDefinition {
  const storylets: readonly StoryletDefinition[] = STORYLETS;
  const found = storylets.find((storylet) => storylet.id === storyletId);
  if (!found) throw new Error(`unknown storylet: ${storyletId}`);
  return found;
}

/** A PATROL interceptor fixture — the second reader of `fence.ray.dealt`. */
function patrolFixture(): EncounterState {
  return {
    id: 'enc-patrol',
    pendingTravel: { origin: 1, destination: 2, fuelUsed: 5 },
    interceptor: {
      id: 'anon-patrol-1',
      source: 'anonymous',
      name: 'Lt.Savage',
      shipName: 'SP1.Thor',
      shipClass: 'SLOOP',
      homeSystem: 'Procyon-5',
      kind: 'PATROL',
      rosterIndex: 1,
      stats: { PILOT: 1, GUNS: 0, TRADE: 1, GRIT: 0, GUILE: 2 },
      tier: 1,
    },
    routeDangerLevel: 1,
    routeDangerChance: 0.3,
    encounterRoll: 0.01,
    round: 1,
    enemyHull: 1,
  };
}

describe('T-1504b era-event storylet tie-ins', () => {
  it('every authored era event has an UNGATED guaranteed tie-in (derived from STORYLETS)', () => {
    const untied = ERA_EVENTS.filter((def) => guaranteedTieIn(def.id) === undefined).map(
      (def) => def.id,
    );
    expect(
      untied,
      `era events with no defId-only tie-in (over-gated or missing): ${untied.join(', ')}`,
    ).toEqual([]);
    // ...and the tie-ins actually VALIDATE: `defineStorylets` throws on load, so
    // reaching this line at all proves the batch passed content validation.
    expect(ERA_EVENTS.length).toBe(6);
  });

  it('firing each era event directly offers its tie-in (with null / wrong-defId A/B negatives)', () => {
    for (const def of ERA_EVENTS) {
      const tieIn = guaranteedTieIn(def.id);
      if (!tieIn) throw new Error(`no guaranteed tie-in for ${def.id}`);
      const other = ERA_EVENTS.find((candidate) => candidate.id !== def.id);
      if (!other) throw new Error('need a second era event for the A/B');
      const base = readyState();

      // A: the event is LIVE (fired directly onto state.eraEvent) → offered.
      const live = deserializeState(serializeState(base));
      fireEraEvent(live, def.id);
      expect(
        eligibleStorylets(live).map((offer) => offer.storyletId),
        `${def.id} did not offer ${tieIn.id}`,
      ).toContain(tieIn.id);

      // B (same base, only eraEvent nulled): no live event → not offered.
      const noEvent = deserializeState(serializeState(base));
      noEvent.eraEvent = null;
      expect(eligibleStorylets(noEvent).map((offer) => offer.storyletId)).not.toContain(tieIn.id);

      // B' (same base, a DIFFERENT era event live) → not offered.
      const wrongEvent = deserializeState(serializeState(base));
      fireEraEvent(wrongEvent, other.id);
      expect(
        eligibleStorylets(wrongEvent).map((offer) => offer.storyletId),
        `${tieIn.id} leaked into the ${other.id} event`,
      ).not.toContain(tieIn.id);
    }
  });

  it('no era tie-in dead-ends the day: a broke, die-less captain can always close it and roll on', () => {
    for (const id of T1504_STORYLET_IDS) {
      const def = byId(id);
      const eraDefId = def.trigger.eraEvent?.defId;
      if (!eraDefId) throw new Error(`${id} is not era-triggered`);

      // Hostile day: zero credits and every dawn die already spent, so NOTHING
      // that needs a die or a purse is playable.
      const state = readyState();
      state.player.credits = 0;
      state.player.dawnHand = {
        dice: [20, 12, 6, 3, 1],
        spent: [true, true, true, true, true],
      };
      fireEraEvent(state, eraDefId);
      // Arm any flag prerequisite the trigger carries. Poked directly HERE only —
      // the honest played-through proof that the antecedent storylet sets these is
      // the flag-reader A/B tests below.
      for (const matcher of def.trigger.flags ?? []) {
        state.flags[matcher.name] = matcher.equals ?? 'armed';
      }

      const refreshed = refreshAvailableStorylets(state).state;
      expect(
        refreshed.storylets.available.map((offer) => offer.storyletId),
        `${id} was not offered on its own era event`,
      ).toContain(id);

      // The T-401 invariant, restated for this batch: a requirement-free exit.
      const free = def.choices.find((choice) => choice.requirements === undefined);
      expect(free, `${id} has no requirement-free choice — it can dead-end the day`).toBeDefined();
      if (!free) continue;

      const heldBefore = Object.keys(refreshed.flags).filter(
        (flag) => flag.endsWith('.aboard') || flag.endsWith('.riding'),
      );
      const resolved = applyPlayerAction(refreshed, {
        type: 'Storylet',
        storyletId: id,
        choiceId: free.id,
      });

      expect(resolved.events).toContainEqual(
        expect.objectContaining({
          type: 'StoryletChoiceResolved',
          storyletId: id,
          choiceId: free.id,
        }),
      );
      expect(resolved.state.storylets.completed[id]).toBe(resolved.state.day);
      expect(resolved.state.storylets.available.map((offer) => offer.storyletId)).not.toContain(id);
      // The engine clamps fuel; a tie-in can never strand the ship at negative range.
      expect(resolved.state.player.ship.fuel).toBeGreaterThanOrEqual(0);
      // And no tie-in silently loads the hold with something the player must carry.
      expect(
        Object.keys(resolved.state.flags).filter(
          (flag) => flag.endsWith('.aboard') || flag.endsWith('.riding'),
        ),
      ).toEqual(heldBefore);

      // The loop still turns: dusk resolves and a fresh dawn hand arrives.
      const dawn = startDay(endDay(resolved.state).state);
      expect(dawn.state.day, `${id} wedged the day loop`).toBe(resolved.state.day + 1);
      expect(dawn.state.player.dawnHand?.dice.length).toBeGreaterThan(0);
    }
  });

  it('era.blockade.papers: the picket beat opens ONLY after the tariff clerk is actually played', () => {
    const base = readyState();
    base.player.credits = 500;
    fireEraEvent(base, 'blockade');

    // A: no papers yet → the clerk is offered, the cordon-run picket is not.
    const before = refreshAvailableStorylets(base).state;
    expect(before.storylets.available.map((offer) => offer.storyletId)).toContain(
      'era.blockade.tariff-clerk',
    );
    expect(before.storylets.available.map((offer) => offer.storyletId)).not.toContain(
      'era.blockade.cordon-run',
    );

    // PLAY the clerk through the real action path (no flag poking).
    const played = applyPlayerAction(before, {
      type: 'Storylet',
      storyletId: 'era.blockade.tariff-clerk',
      choiceId: 'buy-the-stamp',
    });
    expect(played.state.flags['era.blockade.papers']).toBe('stamped');

    // B: same day, same live blockade — the flag alone opens the picket beat.
    const after = refreshAvailableStorylets(played.state).state;
    expect(after.storylets.available.map((offer) => offer.storyletId)).toContain(
      'era.blockade.cordon-run',
    );
  });

  it('era.dilithium.berth: the claim jumper finds you ONLY once the boomtown berth is played', () => {
    const base = readyState();
    base.player.credits = 500;
    fireEraEvent(base, 'dilithium_rush');

    const before = refreshAvailableStorylets(base).state;
    expect(before.storylets.available.map((offer) => offer.storyletId)).toContain(
      'era.dilithium.boomtown-berth',
    );
    expect(before.storylets.available.map((offer) => offer.storyletId)).not.toContain(
      'era.dilithium.claim-jumper',
    );

    // The BROKE path (sleep in the hold) still arms it — `exists`, not `equals`.
    const played = applyPlayerAction(before, {
      type: 'Storylet',
      storyletId: 'era.dilithium.boomtown-berth',
      choiceId: 'sleep-in-the-hold',
    });
    expect(played.state.flags['era.dilithium.berth']).toBe('slept_aboard');

    const after = refreshAvailableStorylets(played.state).state;
    expect(after.storylets.available.map((offer) => offer.storyletId)).toContain(
      'era.dilithium.claim-jumper',
    );
  });

  it('fence.ray.dealt: the checkpoint gates Ray’s name behind GUILE 12, and BOTH readers consume it', () => {
    const state = readyState();
    fireEraEvent(state, 'patrol_crackdown');
    const refreshed = refreshAvailableStorylets(state).state;
    expect(refreshed.storylets.available.map((offer) => offer.storyletId)).toContain(
      'era.crackdown.checkpoint',
    );

    // Die index 0 is the 20 — a natural 20 always clears the check.
    const played = applyPlayerAction(refreshed, {
      type: 'Storylet',
      storyletId: 'era.crackdown.checkpoint',
      choiceId: 'use-rays-name',
      spendDie: 0,
    });
    expect(played.events).toContainEqual(
      expect.objectContaining({
        type: 'StatCheck',
        actionContext: 'storylet',
        stat: Stat.GUILE,
        dc: 12,
      }),
    );
    expect(played.state.flags[FENCE_REP_FLAG]).toBe(true);

    const progress = played.events.find((event) => event.type === 'StoryletDeedProgress');
    expect(progress).toMatchObject({ deedId: 'ray_s_ledger', amount: 1 });
    if (!progress) throw new Error('no StoryletDeedProgress emitted');

    // READER (a) — engine `evaluateDeeds` credits the counted deed off that event.
    const deedState = played.state;
    evaluateDeeds(deedState, [progress]);
    expect(deedState.player.registry.earned.map((deed) => deed.id)).toContain('ray_s_ledger');

    // READER (b) — engine `actions/patrol.ts` subtracts the fence-rep penalty from
    // the player's concealment, so the scan DC drops by exactly that much. (The
    // behavioural 300-seed A/B on the same flag is T-1305's, in patrol.test.ts.)
    const scanDc = (flagged: boolean): number => {
      const scanState = createInitialState(7);
      scanState.dayPhase = DayPhase.DAY;
      scanState.flags['signal.contraband.carrying'] = true;
      if (flagged) scanState.flags[FENCE_REP_FLAG] = true;
      const events: GameEvent[] = [];
      applyPatrolContrabandScan(scanState, patrolFixture(), new SeededRng(11), events);
      const statCheck = events.find((event) => event.type === 'StatCheck');
      if (!statCheck || statCheck.type !== 'StatCheck') throw new Error('no scan StatCheck');
      return statCheck.dc;
    };
    expect(scanDc(false) - scanDc(true)).toBe(CONTRABAND_FENCE_REP_SCAN_PENALTY);

    // The gate is real: a failing die pays the League penalty and grants nothing.
    const failed = applyPlayerAction(refreshed, {
      type: 'Storylet',
      storyletId: 'era.crackdown.checkpoint',
      choiceId: 'use-rays-name',
      spendDie: 4, // the 1 — a natural 1 always fails
    });
    expect(failed.state.flags[FENCE_REP_FLAG]).toBeUndefined();
    expect(failed.events.some((event) => event.type === 'StoryletDeedProgress')).toBe(false);
    expect(failed.state.player.credits).toBeLessThan(refreshed.player.credits);
  });

  it('era choices move the SHARED reputation/disposition movers and report the actual clamped delta', () => {
    // ReputationChanged — the mover the `alliance.*` questline triggers read.
    const famine = readyState();
    fireEraEvent(famine, 'famine');
    const famineReady = refreshAvailableStorylets(famine).state;
    const beforeRep = famineReady.player.reputation.league;
    const goodwill = applyPlayerAction(famineReady, {
      type: 'Storylet',
      storyletId: 'era.famine.ration-queue',
      choiceId: 'take-goodwill',
    });
    const appliedRep = goodwill.state.player.reputation.league - beforeRep;
    expect(appliedRep).toBeGreaterThan(0);
    expect(goodwill.events).toContainEqual(
      expect.objectContaining({
        type: 'ReputationChanged',
        faction: 'league',
        delta: appliedRep,
        reputation: goodwill.state.player.reputation.league,
        reason: 'questline',
      }),
    );

    // DispositionChanged — clamped. Doc already adores the player at 9, so the
    // quarantine line's +2 can only land 1 of it, and the event must say 1.
    const plague = readyState();
    fireEraEvent(plague, 'plague');
    const plagueReady = refreshAvailableStorylets(plague).state;
    const doc = plagueReady.npcs.find((npc) => npc.id === 'npc-doc-salvage');
    expect(doc).toBeDefined();
    if (doc) doc.disposition = 9;

    const line = applyPlayerAction(plagueReady, {
      type: 'Storylet',
      storyletId: 'era.plague.quarantine-line',
      choiceId: 'work-the-line',
    });
    expect(line.state.npcs.find((npc) => npc.id === 'npc-doc-salvage')?.disposition).toBe(10);
    expect(line.events).toContainEqual(
      expect.objectContaining({
        type: 'DispositionChanged',
        npcId: 'npc-doc-salvage',
        delta: 1,
        disposition: 10,
        reason: 'storylet',
      }),
    );
  });

  it('JSON round-trip: the papers flag and the offer it unlocks survive, with NO save-version bump', () => {
    const base = readyState();
    base.player.credits = 500;
    fireEraEvent(base, 'blockade');
    const played = applyPlayerAction(refreshAvailableStorylets(base).state, {
      type: 'Storylet',
      storyletId: 'era.blockade.tariff-clerk',
      choiceId: 'buy-the-stamp',
    }).state;

    const restored = deserializeState(serializeState(played));
    // (a) the string-valued flag survives as a string, not a coerced boolean.
    expect(restored.flags['era.blockade.papers']).toBe('stamped');
    // (b) the completion stamp survives.
    expect(restored.storylets.completed['era.blockade.tariff-clerk']).toBe(played.day);
    // (c) the round-tripped state yields the SAME offer set, and specifically the
    //     same verdict on the flag-gated picket beat.
    const cordon = byId('era.blockade.cordon-run');
    expect(triggerMatches(restored, cordon)).toBe(true);
    expect(triggerMatches(restored, cordon)).toBe(triggerMatches(played, cordon));
    expect(eligibleStorylets(restored).map((offer) => offer.storyletId)).toEqual(
      eligibleStorylets(played).map((offer) => offer.storyletId),
    );

    // T-1504b adds NO GameState field — `flags` and `eraEvent` are both T-107
    // state that already persists — so there is no migration and no version bump:
    // the blob loads clean at the CURRENT save version.
    const blob = createSave(played, 110);
    expect(SaveEnvelopeSchema.parse(JSON.parse(blob)).version).toBe(CURRENT_SAVE_VERSION);
    expect(loadSave(blob).state.flags['era.blockade.papers']).toBe('stamped');
  });
});

describe('quoteStoryletChoice (T-1401 export pack)', () => {
  const STORYLET_ID = 'port.sun3.guild-auditor';

  /** A state at Sun-3 in Tour One with the guild-auditor storylet made available
   *  (its trigger is systemIds:[1] + eras:['TOUR_ONE'], live at the start). */
  function auditorState(credits = 1000): GameState {
    const base = readyState();
    base.player.credits = credits;
    const { state } = refreshAvailableStorylets(base);
    state.dayPhase = DayPhase.DAY;
    state.player.dawnHand = { dice: [20, 12, 6, 3, 1], spent: [false, false, false, false, false] };
    expect(state.storylets.available.some((o) => o.storyletId === STORYLET_ID)).toBe(true);
    return state;
  }

  it('reports ok with a valid armed die for a stat-check choice', () => {
    const state = auditorState();
    const quote = quoteStoryletChoice(state, STORYLET_ID, 'argue', 0);
    expect(quote.ok).toBe(true);
    expect(quote.reason).toBeNull();
    expect(quote.needsDie).toBe(true);
    expect(quote.statCheck).toEqual({ stat: Stat.GUILE, dc: 12 });
    expect(quote.requiredCredits).toBeNull();
  });

  it('surfaces the credit gate on the pay choice', () => {
    const quote = quoteStoryletChoice(auditorState(1000), STORYLET_ID, 'pay', 0);
    expect(quote.ok).toBe(true);
    expect(quote.requiredCredits).toBe(75);
    expect(quote.needsDie).toBe(true);
  });

  it('blocks insufficient-credits before missing-die (refusal order)', () => {
    // Credits below the 75 gate AND no die armed: the credit refusal wins, exactly
    // as resolveStoryletChoice checks credits before the die.
    const quote = quoteStoryletChoice(auditorState(10), STORYLET_ID, 'pay', undefined);
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe('insufficient-credits');
  });

  it('blocks missing-die when a die-requiring choice has no valid die armed', () => {
    const state = auditorState(1000);
    expect(quoteStoryletChoice(state, STORYLET_ID, 'pay', undefined).reason).toBe('missing-die');
    // an out-of-range index is also invalid
    expect(quoteStoryletChoice(state, STORYLET_ID, 'pay', 99).reason).toBe('missing-die');
    // an already-spent die is invalid
    state.player.dawnHand!.spent[0] = true;
    expect(quoteStoryletChoice(state, STORYLET_ID, 'pay', 0).reason).toBe('missing-die');
  });

  it('reports unknown-choice for a bad choice id on a real storylet', () => {
    const quote = quoteStoryletChoice(auditorState(), STORYLET_ID, 'no-such-choice', 0);
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe('unknown-choice');
  });

  it('reports not-available for a storylet with no live offer', () => {
    const quote = quoteStoryletChoice(auditorState(), 'no-such-storylet', 'pay', 0);
    expect(quote.ok).toBe(false);
    expect(quote.reason).toBe('not-available');
  });

  it('does not mutate the input state', () => {
    const state = auditorState(1000);
    const before = JSON.stringify(state);
    quoteStoryletChoice(state, STORYLET_ID, 'pay', 0);
    quoteStoryletChoice(state, STORYLET_ID, 'argue', 0);
    quoteStoryletChoice(state, 'no-such-storylet', 'pay', 0);
    expect(JSON.stringify(state)).toBe(before);
  });
});
