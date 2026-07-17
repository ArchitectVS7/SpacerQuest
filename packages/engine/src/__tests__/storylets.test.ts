import { describe, expect, it } from 'vitest';
import { STORYLETS, Stat, defineStorylets, type StoryletDefinition } from '@spacerquest/content';
import { applyPlayerAction, endDay, startDay } from '../day.js';
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
import { DayPhase, GameState } from '../types.js';

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

// T-1504 · Era-event storylet tie-ins (appended last): one wire-surface storylet
// per era id, each gated on `eraEvent.defId`, delivering the era->storylet hook
// the T-1302 trigger was built for (and, for blockade/famine/fuel-crisis, the
// era->Deed progress for war_profiteer / crisis_courier).
const T1504_STORYLET_IDS = [
  'wire.blockade.premium-run',
  'wire.dilithium-rush.stake-claim',
  'wire.patrol-crackdown.checkpoint',
  'wire.famine.relief-run',
  'wire.fuel-crisis.rationing',
  'wire.plague.contagion-cordon',
] as const;

// T-1505 · The Nemesis Signal arc completion batch (appended last): the Sage
// decode paths for fragments 06-11, the final-line reconstruction that grants +
// decodes frag-12, three NPC-held fragment grants (09/10/11), and the crossing
// endgame that sets `nemesis.crossing.unlocked`.
const T1505_STORYLET_IDS = [
  'sage.mizar.decode-06',
  'sage.mizar.decode-07',
  'sage.mizar.decode-08',
  'sage.mizar.decode-09',
  'sage.mizar.decode-10',
  'sage.mizar.decode-11',
  'sage.mizar.reconstruct-final-line',
  'nemesis.derelict-log.silent-fleet',
  'nemesis.derelict-log.cartographer',
  'nemesis.beacon-echo.answer',
  'nemesis.npc-held.rust-bucket',
  'nemesis.npc-held.star-gazer',
  'nemesis.npc-held.void-whisper',
  'nemesis.crossing.commit',
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
    // T-1504 era-event storylet tie-ins loaded and validated.
    for (const id of T1504_STORYLET_IDS) {
      expect(ids).toContain(id);
    }
    // T-1505 Nemesis Signal arc completion batch loaded and validated.
    for (const id of T1505_STORYLET_IDS) {
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
        T1505_STORYLET_IDS.length,
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
