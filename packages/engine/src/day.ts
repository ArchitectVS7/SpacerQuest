import {
  CARGO_TYPES,
  CREW_BY_ID,
  DISPOSITION_DECAY_INTERVAL_DAYS,
  DISPOSITION_DELTAS,
  GUILD_DEBT_DAILY_RATE,
  LENDER_ID,
  LIFE_SUPPORT_SURVIVAL_DC,
  LOAN_DEFAULT_DISPOSITION,
  NPC_PROFILES,
  STAR_SYSTEMS,
  Stat,
  isGatedDestination,
} from '@spacerquest/content';
import { DayPhase, GameState, GameEvent, PlayerAction } from './types.js';
import { SeededRng } from './rng.js';
import { dawnDiceModifiers, rollDawnHand } from './dice.js';
import { autoRepairRegen, lifeSupportCritical } from './components.js';
import { applySuccession } from './legacy.js';
import { applyDisposition, resolveNpcDay } from './npc.js';
import { generateManifestBoard, localFuelPrice, syncMaxFuel } from './economy.js';
import { advanceEraSchedule } from './era.js';
import { resolveTrade } from './actions/trade.js';
import { resolveTravel } from './actions/travel.js';
import {
  applyEncounterDuskPressure,
  resolveCombat,
  resolveInterceptorFled,
} from './actions/combat.js';
import { resolveShipyard } from './actions/shipyard.js';
import { resolveExploration } from './actions/exploration.js';
import { resolveVisitHangout } from './actions/hangout.js';
import { resolveCrew, resolveReroll } from './actions/crew.js';
import { portDuskIncome, resolvePortPurchase } from './actions/port.js';
import { evaluateDeeds } from './deeds.js';
import { syncPlayerTier } from './tier.js';
import { refreshAvailableStorylets, resolveStoryletChoice } from './storylets.js';
import { computeGuildStanding, guildManifestPenalty, guildSeverity } from './guild.js';
import { natWireStories } from './wire.js';

function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

function appendEvents(state: GameState, events: GameEvent[]): void {
  state.eventLog.push(...events);
}

export function startDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAWN) {
    throw new Error('startDay requires DAWN phase');
  }

  const dayRng = new SeededRng(nextState.rngState).fork(`day-${nextState.day}`);
  nextState.storylets.offeredToday = [];

  // Generate manifest board and price the local depot from canon tables.
  // T-106 contract competition: every job an NPC claimed off the board at the
  // previous dusk drains today's generation pool by one (floor of 1 — a port
  // never goes completely dark).
  const claimedJobs = nextState.market.npcClaims ?? 0;
  const boardSize = Math.max(1, 4 - claimedJobs);
  // T-1309 · Port-clerk flag reader (worse manifest terms). A `guild.debt-flagged`
  // captain (unpaid Tour One marker, day.ts endDay) gets the lower-paying runs: the
  // stored flag value is a guild-standing severity, and `guildManifestPenalty` maps
  // it to a <1 payment multiplier threaded into every contract on today's board.
  // Guarded on the flag → penalty is exactly 1 for a clean captain (every existing
  // golden), and rollContract applies it AFTER all rng draws, so a clean board is
  // byte-identical. READER of the flag: this call site (via economy.ts rollContract).
  const guildFlag = Number(nextState.flags['guild.debt-flagged'] ?? 0);
  const manifestPenalty = guildFlag > 0 ? guildManifestPenalty(guildFlag) : 1;
  const manifestBoard = generateManifestBoard(
    nextState.player.currentSystemId,
    dayRng.fork('market'),
    nextState.player.ship,
    boardSize,
    nextState.eraEvent,
    manifestPenalty,
  );
  nextState.market = {
    manifestBoard,
    localFuelPrice: localFuelPrice(nextState.player.currentSystemId, nextState.eraEvent),
    npcClaims: 0,
  };

  // Roll player hand. T-1306: the hand size / floor / re-roll charges are now
  // PARAMETERIZED off the player's crew (dice.ts dawnDiceModifiers) rather than a
  // hardcoded 5 — a die-granting crew rolls 6, a floor crew never rolls below its
  // floor, a reroll crew banks a charge. An empty crew yields
  // `{ handSize: 5, floor: 0, rerolls: 0 }`, so the `rng.rollHand(5)` draw is
  // byte-identical to before (only the added `rerollsRemaining: 0` key on the hand
  // moves the serialized-state golden hashes; the DawnRoll event is unchanged).
  const modifiers = dawnDiceModifiers(nextState.player.crew);
  const playerHand = rollDawnHand(dayRng.fork('player-hand'), modifiers);
  nextState.player.dawnHand = playerHand;

  events.push({
    type: 'DawnRoll',
    day: nextState.day,
    hand: [...playerHand.dice],
  });

  const refreshed = refreshAvailableStorylets(nextState);
  nextState = refreshed.state;
  events.push(...refreshed.events);
  events.push(...evaluateDeeds(nextState, events));
  // T-1203: a dawn deed can rank the player up; recompute the matchmaking band
  // AFTER evaluateDeeds so the day's first jump reads the fresh tier.
  syncPlayerTier(nextState);

  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAY;
  nextState.dayEventCount = events.length;
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function applyPlayerAction(
  state: GameState,
  action: PlayerAction,
): { state: GameState; events: GameEvent[] } {
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('applyPlayerAction requires DAY phase');
  }

  if (action.type === 'Wait') {
    const refreshed = refreshAvailableStorylets(nextState);
    const events = refreshed.events;
    refreshed.state.dayEventCount = nextState.dayEventCount + events.length;
    appendEvents(refreshed.state, events);
    return { state: refreshed.state, events };
  }

  // T-1306: Reroll and Crew are exempt from the encounter block. Re-rolling a die
  // or hiring/dismissing crew mid-encounter is harmless (it touches the dawn hand /
  // crew roster, never the encounter) and is never offered by the sim/UI during a
  // fight — exempting them here avoids widening the ActionBlocked.actionType enum
  // for actions that have no reason to be blocked.
  // T-1307: Port is exempt for the SAME reason — a port purchase touches only
  // `player.ports` and credits, never the encounter, and the sim/UI never offer it
  // mid-fight. Exempting it avoids widening the ActionBlocked.actionType enum for
  // an action that has no reason to be blocked.
  if (
    nextState.encounter &&
    action.type !== 'Combat' &&
    action.type !== 'Reroll' &&
    action.type !== 'Crew' &&
    action.type !== 'Port'
  ) {
    // Trade/Travel/Shipyard during an active encounter are player-possible acts,
    // not malformed input — surface a typed ActionBlocked event instead of
    // throwing. Refusals are logged (ShipyardFail precedent): the event is
    // appended to the event log, but no die is spent, dayEventCount is not
    // bumped, and no other state changes.
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: action.type,
      reason: 'active-encounter',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1101 · Destination gate. Andromeda (21–26) and the special systems (27–28)
  // are sealed in v1 (§10); the Nemesis crossing is the endgame, unlocked by the
  // 'nemesis.crossing.unlocked' flag T-1505 sets. Until then a Travel to a gated
  // destination is a player-possible act, not malformed input — surface a typed
  // ActionBlocked (mirrors the encounter block above: the refusal is logged, but
  // no die is spent, no RNG fork, dayEventCount is not bumped, and no throw).
  // READER of the flag: this branch (defines-and-consumes it here; T-1505 sets it).
  if (
    action.type === 'Travel' &&
    isGatedDestination(action.destinationId) &&
    nextState.flags['nemesis.crossing.unlocked'] !== true
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: 'Travel',
      reason: 'destination-locked',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  // T-1303 · Hangout gate. A VisitHangout is only legal at a system flagged
  // `hasHangout` (Sun-3 first, systems.ts). Elsewhere it is a player-possible act,
  // not malformed input — surface a typed ActionBlocked (mirrors the destination
  // gate above: refusal logged, no die spent, no RNG fork, dayEventCount not
  // bumped, no throw). READER of `hasHangout`: this branch (and the sim protocol's
  // legalActions, which won't advertise VisitHangout at an un-flagged system).
  if (
    action.type === 'VisitHangout' &&
    STAR_SYSTEMS[nextState.player.currentSystemId]?.hasHangout !== true
  ) {
    const blocked: GameEvent = {
      type: 'ActionBlocked',
      day: nextState.day,
      actionType: 'VisitHangout',
      reason: 'no-hangout',
    };
    appendEvents(nextState, [blocked]);
    return { state: nextState, events: [blocked] };
  }

  const dayRng = new SeededRng(nextState.rngState);
  const actionEventIndex = nextState.dayEventCount;

  let result: { state: GameState; events: GameEvent[] };
  if (action.type === 'Trade') {
    result = resolveTrade(nextState, action, dayRng.fork(`action-trade-${actionEventIndex}`));
  } else if (action.type === 'Travel') {
    result = resolveTravel(nextState, action, dayRng.fork(`action-travel-${actionEventIndex}`));
  } else if (action.type === 'Shipyard') {
    dayRng.fork(`action-shipyard-${actionEventIndex}`);
    result = resolveShipyard(nextState, action);
  } else if (action.type === 'Combat') {
    result = resolveCombat(nextState, action, dayRng.fork(`action-combat-${actionEventIndex}`));
  } else if (action.type === 'Explore') {
    result = resolveExploration(
      nextState,
      action,
      dayRng.fork(`action-explore-${actionEventIndex}`),
    );
  } else if (action.type === 'VisitHangout') {
    result = resolveVisitHangout(
      nextState,
      action,
      dayRng.fork(`action-hangout-${actionEventIndex}`),
    );
  } else if (action.type === 'Reroll') {
    result = resolveReroll(nextState, action, dayRng.fork(`action-reroll-${actionEventIndex}`));
  } else if (action.type === 'Crew') {
    // resolveCrew is pure (no rng), but fork+discard to keep the action rng stream
    // aligned with the other die-costed actions (mirrors the Shipyard branch).
    dayRng.fork(`action-crew-${actionEventIndex}`);
    result = resolveCrew(nextState, action);
  } else if (action.type === 'Port') {
    // resolvePortPurchase is pure (no rng), but fork+discard to keep the action rng
    // stream aligned with the other die-costed actions (mirrors the Crew/Shipyard
    // branches).
    dayRng.fork(`action-port-${actionEventIndex}`);
    result = resolvePortPurchase(nextState, action);
  } else {
    result = resolveStoryletChoice(
      nextState,
      action,
      dayRng.fork(`action-storylet-${actionEventIndex}`),
    );
  }

  let resolvedState = result.state;
  resolvedState.rngState = dayRng.getState();
  resolvedState.dayPhase = DayPhase.DAY;
  // T-1102 single recompute chokepoint: any action that changed the hull
  // (shipyard upgrade, astraxial/cloaker fit, repair, combat damage) re-derives
  // the fuel ceiling here rather than at each low-level site. Combat damage
  // shrinking the tank falls out naturally (on-PRD: a fragile ship holds less).
  syncMaxFuel(resolvedState.player.ship);
  const deedEvents = evaluateDeeds(resolvedState, result.events);
  // T-1203 tier chokepoint: the resolved action may have upgraded the ship
  // (resolveShipyard above) or earned a rank-up (evaluateDeeds just now), so
  // recompute the matchmaking band here — the live field the NEXT jump's
  // selectEncounterInterceptor reads. Placed after evaluateDeeds so a
  // same-action rank-up is reflected.
  syncPlayerTier(resolvedState);
  const refreshed = refreshAvailableStorylets(resolvedState);
  resolvedState = refreshed.state;
  const events = [...result.events, ...deedEvents, ...refreshed.events];
  // T-1202 (PRD §6): any player/interceptor check in this action that came up a
  // natural 20 or natural 1 always spins a Galactic Wire story. Seeded from the
  // STABLE pre-action rngState (never `dayRng`, whose state is already persisted
  // above) so scanning cannot perturb determinism or the golden fixtures.
  const natWire = natWireStories(
    events,
    resolvedState.day,
    new SeededRng(state.rngState).fork(`wire-nat-day-${actionEventIndex}`),
    resolvedState.npcs,
    // T-1303: a player Spacer's Dare nat names a co-located NPC as the loser.
    resolvedState.player.currentSystemId,
  );
  events.push(...natWire);
  resolvedState.dayEventCount = actionEventIndex + events.length;
  appendEvents(resolvedState, events);

  return { state: resolvedState, events };
}

export function endDay(state: GameState): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const nextState = cloneState(state);

  if (nextState.dayPhase !== DayPhase.DAY) {
    throw new Error('endDay requires DAY phase');
  }

  const dayRng = new SeededRng(nextState.rngState);

  // Set all dice to spent if player didn't use them (day is over)
  if (nextState.player.dawnHand) {
    for (let i = 0; i < nextState.player.dawnHand.spent.length; i++) {
      nextState.player.dawnHand.spent[i] = true;
    }
  }

  // Bond hook — ONE mechanical intervention per dusk (T-106, rebuilt T-1204).
  // The intervention is now a TYPED per-profile character hook (profile.bondHook)
  // keyed to the NPC's Bond, not the old bare inline `disposition >= 5` + hard-
  // coded DCs: an NPC does the beat THEIR bond implies (Doc Salvage answers a
  // mayday → fuel-gift; Admiral Stern protects → drive-off), activates at the
  // profile's own threshold, and rolls against the profile's own DC. Candidate
  // rescuers are same-system NPCs whose hook is live (disposition >= its
  // activateAt); the HIGHEST disposition acts (id as tiebreak). An intervention
  // IS the rescuer's dusk action — helping the player costs them their own day,
  // so they skip the NPC loop below.
  //
  // Reachability (the T-1204 acceptance): the old bare 5-threshold + dry-tank-
  // only (===0) fuel gate never co-occurred in organic play — the hook fired
  // zero times ever. The data-driven low activateAt + broadened lowFuelThreshold,
  // together with the rebalanced slower decay, let a storylet-bonded NPC (Doc)
  // hold their standing long enough for a low-fuel dusk to reach it.
  let intervenedNpcId: string | null = null;
  const rescuer = nextState.npcs
    .filter((npc) => {
      const hook = NPC_PROFILES.find((p) => p.id === npc.profileId)?.bondHook;
      return (
        hook !== undefined &&
        npc.disposition >= hook.activateAt &&
        npc.currentSystemId === nextState.player.currentSystemId
      );
    })
    .sort((a, b) => b.disposition - a.disposition || a.id.localeCompare(b.id))[0];
  if (rescuer) {
    const rescuerProfile = NPC_PROFILES.find((p) => p.id === rescuer.profileId);
    const hook = rescuerProfile?.bondHook;
    const grit = rescuerProfile?.stats[Stat.GRIT] ?? 0;
    if (hook?.beat === 'drive-off' && nextState.encounter) {
      const rescueRng = dayRng.fork(`bond-rescue-${rescuer.id}`);
      if (rescueRng.d20() + grit >= hook.dc) {
        const interceptorName = nextState.encounter.interceptor.name;
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'drive-off',
        });
        resolveInterceptorFled(nextState, events);
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${rescuer.name} drove ${interceptorName} off your tail.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Combat',
          details: `spent the day driving ${interceptorName} off a friend's tail`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    } else if (
      hook?.beat === 'fuel-gift' &&
      !nextState.encounter &&
      nextState.player.ship.fuel <= (hook.lowFuelThreshold ?? 0) &&
      rescuer.fuel >= (hook.minRescuerFuel ?? 100)
    ) {
      const giftRng = dayRng.fork(`bond-gift-${rescuer.id}`);
      if (giftRng.d20() + grit >= hook.dc) {
        const amount = hook.fuelAmount ?? 50;
        rescuer.fuel -= amount;
        nextState.player.ship.fuel = Math.min(
          nextState.player.ship.maxFuel,
          nextState.player.ship.fuel + amount,
        );
        events.push({
          type: 'BondIntervention',
          day: nextState.day,
          npcId: rescuer.id,
          kind: 'fuel-gift',
          amount,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${rescuer.name} answered your mayday and transferred ${amount} fuel.`,
        });
        intervenedNpcId = rescuer.id;
        rescuer.lastAction = {
          type: 'Trade',
          details: `spent the day answering a mayday at ${
            STAR_SYSTEMS[rescuer.currentSystemId]?.name ?? `system ${rescuer.currentSystemId}`
          }`,
        };
        events.push({
          type: 'NpcAction',
          npcId: rescuer.id,
          actionDetails: rescuer.lastAction.details,
        });
      }
    }
  }

  if (nextState.encounter) {
    events.push(
      ...applyEncounterDuskPressure(
        nextState,
        dayRng.fork(`encounter-dusk-${nextState.encounter.id}-${nextState.encounter.round}`),
      ),
    );
  }

  // T-1206 AUTO_REPAIR → dusk condition regen (the named reader for
  // `hasAutoRepair`, components.ts `autoRepairRegen`). PORTED FROM foundation
  // `applyAutoRepair`: the module patches each fitted system (hull excluded) up by
  // AUTO_REPAIR_REGEN overnight. Pure, no rng — so it consumes NO fork and cannot
  // perturb the dusk rng stream; every existing golden (all built on ships without
  // the module) is byte-identical.
  //
  // ORDERING: deliberately runs AFTER the encounter dusk pressure above (which may
  // have driven a component to 0 this very dusk — the module then heals that fresh
  // damage) and BEFORE the life-support survival gate below. Healing lifeSupport
  // 0→1 here lets the module rescue the ship from the dusk GRIT survival roll —
  // faithful to foundation, where Auto-Repair repairs life support, and a legible
  // module benefit. The deliberate consequence: when the module lifts lifeSupport
  // off 0, the `life-support-${day}` rng fork below is NOT taken (a fork advances
  // the parent rng), which only ever happens when `hasAutoRepair` is true — so no
  // existing golden (module absent) is affected.
  //
  // RATIFIED DESIGN CALL (T-1804): because this heals lifeSupport 0→1 BEFORE the
  // `lifeSupportCritical` dusk gate below, the life-support survival/succession
  // death path (the `LifeSupportCritical` → `ShipLost` succession) is UNREACHABLE
  // whenever Auto-Repair is fitted — the module always rescues a critical life
  // support at dusk. Kept faithful to foundation (Auto-Repair repairs life
  // support), but flagged as a balance lever for T-1603's tuning pass: an
  // always-rescue module may be too strong. Covered by `components.test.ts` (~549),
  // "a fitted Auto-Repair rescues critical life support from the dusk survival
  // gate", which asserts `lifeSupport.condition === 1` and that neither
  // `LifeSupportCritical` nor `ShipLost` fires when the module is fitted.
  if (nextState.player.ship.hasAutoRepair) {
    const { updates, repaired } = autoRepairRegen(nextState.player.ship);
    for (const id of repaired) {
      nextState.player.ship[id].condition = updates[id]!;
    }
    if (repaired.length > 0) {
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message: `Auto-Repair module restored condition to ${repaired.length} system${
          repaired.length === 1 ? '' : 's'
        } overnight.`,
      });
    }
  }

  // T-1205 lifeSupport → survival reader. Life support driven to condition 0 —
  // only reachable now that enemy fire seed-targets components — faces a dusk GRIT
  // survival check (content LIFE_SUPPORT_SURVIVAL_DC). Passing it is a scare (no
  // state change); failing it loses the ship to a life-support failure, reusing
  // the tested T-108 succession path (the "newly-possible sim deaths" T-1205
  // anticipates). Runs after the dusk combat pressure above (which may itself have
  // driven lifeSupport to 0, or on a hull kill reset the ship to the junker — in
  // which case lifeSupportCritical is false and this is skipped) and before the
  // day increment, so the LifeSupportCritical event carries the correct day.
  // This is the named reader for the `lifeSupport` component (components.ts).
  if (lifeSupportCritical(nextState.player.ship)) {
    const survivalRng = dayRng.fork(`life-support-${nextState.day}`);
    const survived =
      survivalRng.d20() + nextState.player.stats[Stat.GRIT] >= LIFE_SUPPORT_SURVIVAL_DC;
    events.push({
      type: 'LifeSupportCritical',
      day: nextState.day,
      component: 'lifeSupport',
      survived,
    });
    if (survived) {
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message:
          'Life support gave out on the edge of the dark — the spacer rode it out on emergency air and lived to refit.',
      });
    } else {
      events.push({
        type: 'ShipLost',
        day: nextState.day,
        encounterId: '',
        interceptorId: 'life-support-failure',
        reason: 'life-support-failure',
        component: 'lifeSupport',
      });
      events.push(
        ...applySuccession(nextState, {
          originSystem: nextState.player.currentSystemId,
          interceptorId: 'life-support-failure',
        }),
      );
      // The wreck (and any still-live interdiction) dies with the ship — the
      // successor starts clear, exactly as the combat-death path nulls the
      // encounter after applySuccession.
      nextState.encounter = null;
    }
  }

  // 3. DUSK (NPC Actions). NPCs sharing the player's system compete for the
  // player's manifest board — at most one job is claimed per dusk (texture
  // stays cheap; the loss is legible on the wire and in tomorrow's board).
  const npcOrder = dayRng.shuffle([...nextState.npcs]);
  let boardClaimSpent = false;
  let snipingNpcId: string | null = null;

  for (const npc of npcOrder) {
    // The bond-hook rescuer already spent their day intervening.
    if (npc.id === intervenedNpcId) continue;
    const npcRng = dayRng.fork(`npc-${npc.id}`);
    const canClaim =
      !boardClaimSpent &&
      npc.currentSystemId === nextState.player.currentSystemId &&
      nextState.market.manifestBoard.length > 0;
    const {
      npc: updatedNpc,
      events: npcEvents,
      claimedContractIndex,
    } = resolveNpcDay(npc, npcRng, {
      day: nextState.day,
      claimableBoard: canClaim ? nextState.market.manifestBoard : null,
      eraEvent: nextState.eraEvent,
    });

    let sniped = false;
    if (claimedContractIndex !== undefined) {
      boardClaimSpent = true;
      const [claimed] = nextState.market.manifestBoard.splice(claimedContractIndex, 1);
      if (claimed) {
        sniped = true;
        nextState.market.npcClaims = (nextState.market.npcClaims ?? 0) + 1;
        const cargoName = CARGO_TYPES[claimed.cargoType]?.name ?? 'cargo';
        const destinationName =
          STAR_SYSTEMS[claimed.destination]?.name ?? `system ${claimed.destination}`;
        events.push({
          type: 'ContractClaimed',
          day: nextState.day,
          npcId: updatedNpc.id,
          cargoType: claimed.cargoType,
          destination: claimed.destination,
          payment: claimed.payment,
        });
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${updatedNpc.name} undercut you on the ${cargoName} run to ${destinationName}.`,
        });
      }
    }

    const npcIndex = nextState.npcs.findIndex((n) => n.id === npc.id);
    if (npcIndex !== -1) {
      nextState.npcs[npcIndex] = updatedNpc;
    }
    if (sniped) snipingNpcId = updatedNpc.id;
    events.push(...npcEvents);
  }

  // Grudges and favors fade — but SLOWLY. T-1204 DECAY REBALANCE (the acceptance's
  // "decay divergence documented at its definition site"):
  //
  //   FOUNDATION (f2f95fa9) has NO per-NPC player-disposition decay to port —
  //   disposition itself is engine-original (T-106 invented it; T-106 also
  //   invented this decay). So this is not a foundation divergence but a T-1204
  //   RE-TUNING of an engine-original rule.
  //
  //   WHY the interval moved from every-dusk to every-Nth-dusk: the old
  //   unconditional −1/dusk erased every organic gain before it could matter —
  //   the tribute (+2) / defeat (−3) deltas were swamped within 2–3 days, so a
  //   300-day sim peaked at |disposition| = 1 and the bond hook (which needed +5)
  //   fired ZERO times ever. Stepping one point toward 0 only every
  //   DISPOSITION_DECAY_INTERVAL_DAYS dusks — combined with the larger deltas
  //   above — lets a paid-off / storylet-bonded NPC HOLD their standing across
  //   several days, so repeated interactions accumulate past the hook threshold
  //   and past |5|.
  //
  //   Keyed to `state.day % N` (a value already in GameState), so this needs NO
  //   new save field and no migration; it is fully deterministic across a JSON
  //   round-trip.
  //
  //   READER: this loop. CONSUMERS the slower decay unblocks — the bond hook
  //   above (§ reachability), the interception grudge-weighting (travel.ts
  //   chooseWeighted), and the talk DC term (combat.ts resolveTalk): all three
  //   read a disposition that now actually persists.
  if (nextState.day % DISPOSITION_DECAY_INTERVAL_DAYS === 0) {
    for (const npc of nextState.npcs) {
      if (npc.disposition !== 0) {
        applyDisposition(nextState, npc.id, npc.disposition > 0 ? -1 : 1, 'decay', events);
      }
    }
  }

  // An NPC that undercut the player on a board contract registers as a rival:
  // the competitive act ticks their disposition toward the player down (T-106,
  // delta from content DISPOSITION_DELTAS). Applied AFTER dusk decay so the fresh
  // grudge actually persists to the next day instead of being cancelled by the
  // same-dusk fade on a decay day.
  if (snipingNpcId) {
    applyDisposition(
      nextState,
      snipingNpcId,
      DISPOSITION_DELTAS.contractSniped,
      'contract-sniped',
      events,
    );
  }

  // Generate daily wire entries from notable events
  for (const npc of nextState.npcs) {
    if (npc.lastAction) {
      // Flaw overrides are ALWAYS notable. Other actions are semi-randomly notable.
      if (npc.lastAction.type === 'FlawOverride' || dayRng.next() > 0.7) {
        events.push({
          type: 'WireEntry',
          day: nextState.day,
          message: `${npc.name} ${npc.lastAction.details}`,
        });
      }
    }
  }

  // T-1304 · Penny Wise loan — per-dusk interest accrual + default flip. The
  // WHOLE block is guarded on a non-null loan, so the loan-null path (every
  // existing golden) is byte-identical: no accrual, no default, no new events,
  // and NO rng draw (accrual is pure arithmetic, default detection is a pure
  // `day >= dueDay` compare). Deterministic across a JSON round-trip.
  if (nextState.player.loan) {
    const loan = nextState.player.loan;
    // Simple interest on the ORIGINAL principal (never compounding), accruing to
    // the loan's `outstanding` — NEVER to player.credits (debt-as-ledger law).
    const interest = Math.ceil(loan.principal * loan.dailyRate);
    loan.outstanding += interest;
    events.push({
      type: 'LoanEvent',
      day: nextState.day,
      kind: 'accrued',
      lender: loan.lender,
      interest,
      outstanding: loan.outstanding,
    });

    // Default: crossing the due day still owing flips the collection flag ONCE
    // (active→defaulted guard). The flip applies the one-time Penny Wise
    // disposition hit (read by the interceptor grudge-weighting, travel.ts
    // chooseWeighted) and leaves the elevated encounter pressure standing (read
    // by generateEncounter, travel.ts) until the loan is repaid, which nulls it.
    if (loan.status === 'active' && nextState.day >= loan.dueDay) {
      loan.status = 'defaulted';
      applyDisposition(nextState, LENDER_ID, LOAN_DEFAULT_DISPOSITION, 'loan-default', events);
      events.push({
        type: 'LoanEvent',
        day: nextState.day,
        kind: 'defaulted',
        lender: loan.lender,
        outstanding: loan.outstanding,
      });
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message: `Penny Wise's marker on your name went unpaid — word is the Thrift Star's collectors are asking after you on the lanes.`,
      });
    }
  }

  // T-1306 · Crew wage upkeep (PRD §7 dice progression). The WHOLE block is guarded
  // on a non-empty crew, so the crew-free path (every existing golden) is
  // byte-identical: no wage event, no credit change, no crew mutation, and NO rng
  // draw (this is pure arithmetic). The day's total wage is the sum of each hired
  // role's dailyWage (content crew.ts). If the spacer can cover it, the credits are
  // deducted and a single CrewEvent{wage} is logged. If NOT, the crew WALK — every
  // member is dismissed (one CrewEvent{dismissed} per departure) and no credits are
  // charged, so credits never go negative and an unpayable crew can't be kept for
  // free. Deterministic across a JSON round-trip. This is the in-task upkeep
  // decision (the "hiring/upkeep as actions" the task calls for, resolved at dusk).
  if (nextState.player.crew.length > 0) {
    const wage = nextState.player.crew.reduce(
      (sum, member) => sum + (CREW_BY_ID[member.roleId]?.dailyWage ?? 0),
      0,
    );
    if (nextState.player.credits >= wage) {
      nextState.player.credits -= wage;
      events.push({
        type: 'CrewEvent',
        day: nextState.day,
        kind: 'wage',
        amount: wage,
        crewCount: nextState.player.crew.length,
      });
    } else {
      // Can't make payroll — the crew walk. Dismiss each (deterministic order) with
      // its own event; no credits change hands.
      for (const member of nextState.player.crew) {
        events.push({
          type: 'CrewEvent',
          day: nextState.day,
          kind: 'dismissed',
          roleId: member.roleId,
        });
      }
      nextState.player.crew = [];
    }
  }

  // T-1307 · Port launch-fee income (PRD §9 "ports as purchasable property"). The
  // WHOLE block is guarded on a non-empty port roster, so the port-free path (every
  // existing golden) is byte-identical: no income event, no credit change, and NO
  // rng draw (this is pure arithmetic — the sum of each owned port's era-modulated
  // base income, actions/port.ts `portDuskIncome`). While ≥1 stake is owned the
  // income is credited and a single PortEvent{income} + a WireEntry are logged
  // (the WireEntry is the wire reader for accrual). Deterministic across a JSON
  // round-trip. This is the named DUSK-ECONOMY reader the acceptance asserts.
  if (nextState.player.ports.length > 0) {
    const income = portDuskIncome(nextState);
    nextState.player.credits += income;
    const portCount = nextState.player.ports.length;
    events.push({
      type: 'PortEvent',
      day: nextState.day,
      kind: 'income',
      income,
      portCount,
    });
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `Launch fees from ${portCount} port stake${
        portCount === 1 ? '' : 's'
      } clear to your account: ${income} credits.`,
    });
  }

  // The Guild calls its marker (enforcement/consequences are story-layer work;
  // the engine's job is to surface the fact as an event).
  if (nextState.player.debt > 0 && nextState.day === nextState.player.debtDueDay) {
    events.push({
      type: 'DebtDue',
      day: nextState.day,
      outstanding: nextState.player.debt,
    });
  }

  // T-113b — Tour One resolution (PRD §5.1). The Merchant Guild marker is due on
  // day 30. TIMING: this fires at the DUSK of day 30, after the player has spent
  // the whole of day 30 (its DAY phase — including any final `pay-debt`), and
  // BEFORE the day rolls over. That is the correct "by day 30" boundary: the
  // spacer gets every one of the thirty days to clear the debt, mirroring the
  // sibling DebtDue check above. Forced regardless of the player's system or
  // normal storylet eligibility, and guarded to fire exactly once by the
  // `tour-one.resolved` flag it sets. It COEXISTS with the T-113a Day-30 Wise
  // One hook (a DAY-phase Polaris-1 storylet that opens the Signal) and the
  // guild-pressure beats: those are separate storylets keyed on their own days/
  // flags, so nothing double-fires or clobbers another beat's flags here.
  if (
    nextState.era === 'TOUR_ONE' &&
    nextState.day === 30 &&
    nextState.flags['tour-one.resolved'] === undefined
  ) {
    const cleared = nextState.player.debt <= 0;
    const outcome: 'cleared' | 'unpaid' = cleared ? 'cleared' : 'unpaid';
    const debtOutstanding = Math.max(0, nextState.player.debt);

    // The discriminator flag is the deterministic FORCE for the resolution
    // storylet: `resolution.tour-one.cleared` / `.unpaid` trigger on this flag's
    // value and surface at the very next dawn via the standard T-110 eligibility
    // refresh — no parallel offer path.
    nextState.flags['tour-one.resolved'] = outcome;

    events.push({
      type: 'TourOneResolved',
      day: nextState.day,
      outcome,
      debtOutstanding,
    });

    // T-1301 — the Day-30 resolution OWNS the campaign-era transition. On BOTH
    // branches the era flips TOUR_ONE→VETERAN here, at the dusk of day 30 after
    // the day phase has fully played out. This is the single owner nobody had
    // before: without it `state.era` was permanently 'TOUR_ONE', so TOUR_ONE-
    // gated content never expired (guild-pressure beats stayed eligible into a
    // day-400 career) and any `eras:['VETERAN']` content was dead on arrival.
    // TIMING is safe: the flip is at dusk, AFTER the DAY-phase T-113a Wise One
    // hook (`eras:['TOUR_ONE'] + day:30`) has had its chance to fire, so it is
    // not clobbered; from the day-31 dawn onward all TOUR_ONE-gated storylets
    // (guild-pressure, the Sun-3 auditor, etc.) go ineligible via the
    // `trigger.eras` gate. READERS already written against this flip: the
    // storylet eligibility gate (`storylets.ts` triggerMatches, `trigger.eras`)
    // that expires TOUR_ONE content and admits VETERAN content, and
    // `generateEncounter` (`actions/travel.ts`), which stops applying its 0.5×
    // TOUR_ONE damp so the veteran game runs at the full foundation encounter
    // rate. The unpaid branch below proceeds as VETERAN-with-debt: the era is
    // flipped for everyone, but `veteran.unlocked` (the CLEAN-veteran
    // discriminator) is set only on the cleared branch, and the debt survives
    // untouched.
    nextState.era = 'VETERAN';

    // T-1309 · READER of the six guild-pressure beat flags on BOTH branches
    // (computeGuildStanding). The signed standing (cooperative < 0 < hostile) is
    // consumed differently per branch below — the cleared branch reads its SIGN
    // for the sign-off text, the unpaid branch reads its magnitude for the
    // port-clerk flag severity — so every surviving pressure flag has a consumer
    // regardless of how day 30 resolves.
    const guildStanding = computeGuildStanding(nextState.flags);

    if (cleared) {
      // Debt cleared → the CLEAN veteran career opens (PRD §5.2). The era flip
      // above is shared with the unpaid branch; this flag is the additional
      // discriminator that says the marker closed without a shortfall.
      nextState.flags['veteran.unlocked'] = true;
      // T-1309 · the sign-off reads the guild standing: a captain who kept the
      // Guild informed (cooperative record, standing <= 0) gets the warm close;
      // one who stonewalled/defied its way to the finish (standing > 0) gets the
      // terse one. This is the cleared-branch consumer of the pressure flags.
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message:
          guildStanding > 0
            ? 'The Merchant Guild marker closes — barely. Your name comes off the debt slate onto the Registry, but the clerks logged how you fought them the whole way. The veteran lanes are open, cold welcome and all.'
            : 'The Merchant Guild marker closes clean. Your name comes off the debt slate and onto the Registry — the veteran lanes are open, and the clerks remember you kept them in the loop.',
      });
    } else {
      // Debt NOT cleared: the game continues indebted (PRD §5.1). The debt
      // SURVIVES untouched — no forgiveness, no soft-lock, no game-over. But the
      // consequence is no longer purely story-layer: T-1309 sets the port-clerk
      // flag the unpaid storylet's prose has always claimed ("your name now
      // carries a flag every port clerk can see"). Its VALUE is the guild-standing
      // severity (guildSeverity), so a hostile record bites harder. Two readers
      // consume it: worse manifest terms (day.ts startDay → economy.ts) and
      // heavier patrol/collection attention (actions/travel.ts generateEncounter).
      // The debt itself begins accruing interest from the NEXT dusk (the accrual
      // block below, gated on day > 30 so this day-30 pass leaves it untouched).
      const severity = guildSeverity(guildStanding);
      nextState.flags['guild.debt-flagged'] = severity;
      events.push({
        type: 'WireEntry',
        day: nextState.day,
        message: `The marker goes unpaid. The Guild files the shortfall — ${debtOutstanding} credits still owed, and the interest keeps running — and flags your name where every port clerk can read it: leaner manifests, keener patrols. You fly on indebted.`,
      });
    }
  }

  // T-1309 · Unpaid Tour One marker — per-dusk interest accrual. The unpaid
  // resolution storylet's prose has always claimed "the interest keeps running",
  // but the 25,000 marker (state.ts) never actually grew — this block gives that
  // prose teeth. The WHOLE block is guarded on the `guild.debt-flagged` flag
  // (set only by the day-30 UNPAID branch above) AND `day > 30`, so:
  //   - every non-flagged state (a cleared marker, or any pre-day-30 day, or every
  //     existing golden) is byte-identical: no accrual, no event, and NO rng draw
  //     (this is pure arithmetic — accrual detection is a flag+day compare);
  //   - the `day > 30` gate leaves the day-30 resolution pass itself untouched, so
  //     the marker still reports its exact 25,000 shortfall at resolution.
  // Interest compounds on the CURRENT balance (content GUILD_DEBT_DAILY_RATE) and
  // accrues to `player.debt` ONLY — never to player.credits (debt-as-ledger law),
  // so growing debt can never strand the ship or drive credits negative (the
  // no-soft-lock invariant). Deterministic across a JSON round-trip (day + a flag
  // already in GameState; no new field). READERS of the growth: the WireEntry
  // (UI wire, format.ts wireLines) and the sim's per-day `CampaignDayStats.debt`.
  if (
    nextState.player.debt > 0 &&
    Number(nextState.flags['guild.debt-flagged'] ?? 0) > 0 &&
    nextState.day > 30
  ) {
    const interest = Math.ceil(nextState.player.debt * GUILD_DEBT_DAILY_RATE);
    nextState.player.debt += interest;
    events.push({
      type: 'WireEntry',
      day: nextState.day,
      message: `The Guild marker keeps running: ${interest} credits in interest added — ${nextState.player.debt} now owed.`,
    });
  }

  events.push(...evaluateDeeds(nextState, events));
  // T-1203: dusk deeds (deliveries, debt clears) can rank the player up;
  // recompute the band so tomorrow's jumps read the fresh tier.
  syncPlayerTier(nextState);

  // T-107 era scheduler: the world's economic weather turns at dusk. One event
  // active at a time; seeded onset after a cooldown; natural expiry at the day
  // boundary. Runs before the day increment so the next dawn's board and fuel
  // prices already read the new modifiers.
  const eraResult = advanceEraSchedule(
    {
      eraEvent: nextState.eraEvent,
      lastEraEventEndedDay: nextState.lastEraEventEndedDay,
      currentDay: nextState.day,
    },
    dayRng.fork('era-schedule'),
  );
  nextState.eraEvent = eraResult.eraEvent;
  nextState.lastEraEventEndedDay = eraResult.lastEraEventEndedDay;
  events.push(...eraResult.events);

  // T-1202 (PRD §6): scan the dusk batch — every NPC verb check (T-1201) plus any
  // interceptor enemy-pressure check — for natural 20s / 1s and file a Wire story
  // for each. Runs while `nextState.day` still holds the current day (before the
  // increment below) so the entries carry the correct day, and rides along in the
  // single appendEvents at the end. Seeded from the STABLE pre-dusk rngState, not
  // the live `dayRng` (whose state is persisted below), to keep determinism.
  const natWire = natWireStories(
    events,
    nextState.day,
    new SeededRng(state.rngState).fork('wire-nat-dusk'),
    nextState.npcs,
    nextState.player.currentSystemId,
  );
  events.push(...natWire);

  // 4. NEXT DAY PREP
  const nextDay = nextState.day + 1;
  nextState.day = nextDay;
  nextState.rngState = dayRng.getState();
  nextState.dayPhase = DayPhase.DAWN;
  nextState.dayEventCount = 0;
  events.push({ type: 'DayAdvanced', day: nextDay });
  appendEvents(nextState, events);

  return { state: nextState, events };
}

export function advanceDay(
  state: GameState,
  playerActions: PlayerAction[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  const dawn = startDay(state);
  let nextState = dawn.state;
  events.push(...dawn.events);

  for (const action of playerActions) {
    const result = applyPlayerAction(nextState, action);
    nextState = result.state;
    events.push(...result.events);
  }

  const dusk = endDay(nextState);
  events.push(...dusk.events);

  return { state: dusk.state, events };
}
