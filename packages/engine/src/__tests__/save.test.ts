import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createSave,
  loadSave,
  migrate,
  SaveError,
  CURRENT_SAVE_VERSION,
  type SaveEnvelope,
  type MigrationFn,
} from '../save.js';
import {
  FLAWS,
  NEMESIS_SYSTEM_ID,
  ALL_NPC_PROFILES,
  RENOWN_DEED_THRESHOLDS,
  SIGNAL_FRAGMENTS,
  type RenownRankId,
} from '@spacerquest/content';
import { validateGameState } from '../schema.js';
import { createInitialState, deserializeState, serializeState, starterShip } from '../state.js';
import { advanceDay } from '../day.js';
import { careerEnded } from '../nemesis.js';
import { RENOWN_RANK_ORDER, emptyDeedRegistry, rankForDeedCount } from '../deeds.js';
import { computePlayerTier } from '../tier.js';
import { JOB_POOL_BOARD_SIZE, JOB_POOL_MAX_CLAIMS, jobPoolDepth } from '../economy.js';
import { npcShipForProfile } from '../npc.js';
import { hasExploreModule } from '../components.js';
import { DeedRegistryState, GameState, PlayerAction } from '../types.js';

/**
 * Drive a real, evolving GameState by running ~50 days through advanceDay with a
 * tiny deterministic policy (talk down encounters, otherwise top up fuel and
 * push to the next system). Produces a fully-populated state that exercises the
 * market, npc sim, travel, and event log — a realistic round-trip subject.
 */
function drive50Days(seed: number): GameState {
  let state = createInitialState(seed);
  for (let day = 0; day < 50; day += 1) {
    const actions: PlayerAction[] = [];
    if (state.encounter) {
      actions.push({
        type: 'Combat',
        stance: 'talk',
        targetId: state.encounter.interceptor.id,
        spendDie: 0,
      });
    } else {
      actions.push({ type: 'Trade', action: 'buy-fuel', fuelAmount: 50 });
      const destination = (state.player.currentSystemId % 20) + 1;
      actions.push({ type: 'Travel', destinationId: destination, spendDie: 1 });
    }
    state = advanceDay(state, actions).state;
  }
  return state;
}

describe('save envelope — migrations', () => {
  it('upgrades a v1 fixture through a dummy v1→v2 migration and still validates', () => {
    const fixtureState = drive50Days(1);
    const envelope: SaveEnvelope = { version: 1, state: fixtureState };

    // Literal acceptance shape: the spread migration proves the loop applied.
    const spreadRegistry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as object), migrated: true }),
    };
    const spread = migrate(envelope, { registry: spreadRegistry, targetVersion: 2 }) as {
      migrated?: boolean;
    };
    expect(spread.migrated).toBe(true);

    // A migration that touches a REAL field: the upgraded state still validates
    // as a GameState (proving migrate → validateGameState compose).
    const realRegistry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as GameState), day: 999 }),
    };
    const migrated = migrate(envelope, { registry: realRegistry, targetVersion: 2 });
    expect(() => validateGameState(migrated)).not.toThrow();
    expect(validateGameState(migrated).day).toBe(999);
  });

  it('applies migrations sequentially across multiple versions', () => {
    const registry: Record<number, MigrationFn> = {
      1: (s) => ({ ...(s as Record<string, unknown>), steps: ['a'] }),
      2: (s) => {
        const prev = s as { steps: string[] };
        return { ...prev, steps: [...prev.steps, 'b'] };
      },
    };
    const result = migrate({ version: 1, state: {} }, { registry, targetVersion: 3 }) as {
      steps: string[];
    };
    expect(result.steps).toEqual(['a', 'b']);
  });
});

describe('save envelope — wrong-version typed errors', () => {
  it('throws future-version when the save is newer than CURRENT_SAVE_VERSION and no migration exists', () => {
    const json = createSaveAtVersion(drive50Days(2), CURRENT_SAVE_VERSION + 1);
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('future-version');
  });

  it('throws no-migration when a gap has no registered migration', () => {
    // A version-0 save needs a 0→1 migration to start climbing toward
    // CURRENT_SAVE_VERSION, but production MIGRATIONS only registers 1→2 — there
    // is no 0→1 step, so the walk fails loudly.
    const json = createSaveAtVersion(drive50Days(3), 0);
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('no-migration');
  });

  it('migrate() throws future-version directly for a newer envelope', () => {
    const error = expectSaveError(() => migrate({ version: 2, state: {} }, { targetVersion: 1 }));
    expect(error.code).toBe('future-version');
  });
});

describe('save envelope — corrupt / malformed input', () => {
  it('throws corrupt-json on non-JSON input', () => {
    const error = expectSaveError(() => loadSave('{ this is not json'));
    expect(error.code).toBe('corrupt-json');
  });

  it('throws bad-envelope when the version envelope is missing', () => {
    const error = expectSaveError(() => loadSave(JSON.stringify({ notAnEnvelope: true })));
    expect(error.code).toBe('bad-envelope');
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });

  it('throws invalid-state carrying a ZodError cause when the state is structurally invalid', () => {
    const json = JSON.stringify({ version: CURRENT_SAVE_VERSION, state: { day: 'not-a-number' } });
    const error = expectSaveError(() => loadSave(json));
    expect(error.code).toBe('invalid-state');
    expect(error.cause).toBeInstanceOf(z.ZodError);
  });
});

describe('save envelope — round-trip property test', () => {
  for (const seed of [1, 7, 42, 1337]) {
    it(`createSave → loadSave is exact for a 50-day state (seed ${seed})`, () => {
      const state = drive50Days(seed);
      const restored = loadSave(createSave(state, seed));
      expect(restored.state).toEqual(state);
      // T-1002: the seed rides the envelope and comes back on load.
      expect(restored.seed).toBe(seed);
    });
  }
});

describe('fuel-capacity migration (T-1102)', () => {
  it('recomputes a legacy maxFuel: 10000 to the hull-derived ceiling on load', () => {
    // A pre-T-1102 save carried a flat maxFuel of 10,000. On load, deserialize
    // re-derives it from the hull (junker: strength 1, condition 9 → 300) and
    // clamps the current fuel to the new ceiling.
    const legacy = createInitialState(123);
    legacy.player.ship.maxFuel = 10000;
    legacy.player.ship.fuel = 9000; // above the new ceiling — must clamp
    legacy.player.ship.hull = { strength: 1, condition: 9 };

    const restored = deserializeState(serializeState(legacy));

    expect(restored.player.ship.maxFuel).toBe(300);
    expect(restored.player.ship.fuel).toBe(300);
  });

  it('is an exact round-trip for a fresh (already-derived) state', () => {
    const fresh = createInitialState(7);
    expect(fresh.player.ship.maxFuel).toBe(starterShip().maxFuel);
    const restored = deserializeState(serializeState(fresh));
    expect(restored).toEqual(fresh);
  });
});

describe('save envelope — malformed-Explore reasons survive save/load (T-1003)', () => {
  // Malformed Explore inputs resolve to typed ExplorationFailed events carrying
  // the three T-1003 reasons, which land in state.eventLog. A save taken after a
  // player triggers one of these paths must createSave → loadSave cleanly — a
  // schema.ts that omits the reason throws SaveError('invalid-state') here (the
  // exact crash T-1003 exists to eliminate, moved to the persistence boundary).
  const cases: Array<{ reason: string; actions: PlayerAction[] }> = [
    { reason: 'no-die', actions: [{ type: 'Explore' }] },
    { reason: 'invalid-die-index', actions: [{ type: 'Explore', spendDie: 99 }] },
    {
      reason: 'die-already-spent',
      actions: [
        // T-196a: `buy-fuel` used to be the die burner here; M17 made it a FREE
        // ACTION, so it can no longer spend die 0. `haggle` is the trade desk's
        // one surviving Main Action and spends the die it is handed, which is
        // exactly what this case needs to reach 'die-already-spent'.
        { type: 'Trade', action: 'haggle', contractIndex: 0, spendDie: 0 },
        { type: 'Explore', spendDie: 0 },
      ],
    },
  ];

  for (const { reason, actions } of cases) {
    it(`createSave → loadSave is exact after an ExplorationFailed '${reason}'`, () => {
      const state = advanceDay(createInitialState(7), actions).state;

      // Sanity: the resolver actually logged the reason under test.
      const failure = state.eventLog.find(
        (e) => e.type === 'ExplorationFailed' && e.reason === reason,
      );
      expect(failure, `expected an ExplorationFailed '${reason}' in the event log`).toBeDefined();

      const restored = loadSave(createSave(state, 7));
      expect(restored.state).toEqual(state);
    });
  }
});

describe('NPC StatCheck events survive save/load (T-1201)', () => {
  // T-1201 widened StatCheck.actionContext with five `npc-*` tags and now emits
  // an NPC StatCheck (nested CheckResult) into eventLog every day. No GameState
  // FIELD changed, so no migration is required — but the widened event must
  // JSON round-trip byte-for-byte through the save envelope, including its
  // actionContext and the nested result.
  it('createSave → loadSave preserves an npc-* StatCheck in the event log exactly', () => {
    const state = drive50Days(11);

    // A real drive produces NPC checks in the log (the same events the wire
    // renders). Grab one to prove the fixture is genuine, not hand-built.
    const npcCheck = state.eventLog.find(
      (e) =>
        e.type === 'StatCheck' &&
        typeof e.actionContext === 'string' &&
        e.actionContext.startsWith('npc-'),
    );
    expect(npcCheck, 'expected an npc-* StatCheck in the 50-day event log').toBeDefined();

    const restored = loadSave(createSave(state, 11));
    // Whole-state exactness covers the nested CheckResult + actionContext.
    expect(restored.state).toEqual(state);
    // And, explicitly, the same NPC check comes back identical.
    const restoredCheck = restored.state.eventLog.find(
      (e) =>
        e.type === 'StatCheck' &&
        typeof e.actionContext === 'string' &&
        e.actionContext.startsWith('npc-'),
    );
    expect(restoredCheck).toEqual(npcCheck);
  });
});

describe('save envelope — seed reproducibility (T-1002)', () => {
  it('the seed survives save → load → save byte-identically and lives in the envelope', () => {
    const state = drive50Days(9);
    // A first load reaches the serialization fixpoint (Zod reorders keys to the
    // schema order), so compare from an already-loaded state.
    const s1 = createSave(state, 1337);
    const l1 = loadSave(s1);
    const s2 = createSave(l1.state, requireSeed(l1.seed));
    const l2 = loadSave(s2);
    const s3 = createSave(l2.state, requireSeed(l2.seed));

    expect(s3).toBe(s2); // byte-identical fixpoint
    expect(l2.seed).toBe(1337); // the seed is preserved verbatim
    // And it genuinely rides the envelope, not the game state.
    const envelope = JSON.parse(s2) as SaveEnvelope;
    expect(envelope.seed).toBe(1337);
  });

  it('an explicit seed of 0 is preserved AND distinct from a seedless legacy load', () => {
    // Regression: seed 0 used to collide with a numeric UNKNOWN_LEGACY_SEED
    // sentinel, making a genuine seed-0 career indistinguishable from a pre-v2
    // (seedless) save. The absence is now `null`, so the two cases differ.
    const state = drive50Days(4);
    const explicitZero = loadSave(createSave(state, 0));
    expect(explicitZero.seed).toBe(0);

    const seedless = loadSave(JSON.stringify({ version: 1, state }));
    expect(seedless.seed).toBeNull();
    expect(explicitZero.seed).not.toBe(seedless.seed); // 0 !== null — no collision
  });
});

describe('save envelope — v1 → v2 migration (T-1002)', () => {
  it('loads a seedless v1 envelope green through production MIGRATIONS with seed: null', () => {
    // A REAL pre-v2 envelope: version 1, no `seed` field at all.
    const v1 = JSON.stringify({ version: 1, state: drive50Days(9) });

    const loaded = loadSave(v1); // walks 1→2 (identity state migration), validates
    expect(loaded.state.day).toBeGreaterThan(0); // validated, not thrown
    // Absence stays absence: no numeric backfill (that would collide with a
    // legitimate explicit seed). Callers key legacy fallbacks off null.
    expect(loaded.seed).toBeNull();
  });

  it('a current-version envelope with an explicit seed is preserved (no migration needed)', () => {
    const current = createSave(drive50Days(9), 4242);
    // createSave always stamps CURRENT_SAVE_VERSION; loading it needs no
    // migration and preserves the seed exactly.
    expect((JSON.parse(current) as SaveEnvelope).version).toBe(CURRENT_SAVE_VERSION);
    expect(loadSave(current).seed).toBe(4242);
  });
});

// ---------------------------------------------------------------------------
// T-1304 · v2 → v3 loan migration + loan round-trip.
// ---------------------------------------------------------------------------
describe('save envelope — v2 → v3 loan migration (T-1304)', () => {
  it('backfills PlayerState.loan = null on a v2 envelope with no loan key', () => {
    // Build a REAL v2-shaped state: drive a state, then strip the loan key the
    // way a genuinely pre-T-1304 save would (it never had the field). The v2→v3
    // migration must re-add loan: null before schema validation, else the strict
    // schema (loan is non-optional) would reject it.
    const state = drive50Days(11);
    // Strip the loan key the way a genuinely pre-T-1304 (v2) save would — it
    // never had the field. `delete` via an index cast keeps `loan` off the object.
    delete (state.player as unknown as Record<string, unknown>).loan;
    const v2 = JSON.stringify({ version: 2, state, seed: 77 });

    const loaded = loadSave(v2); // walks 2→3 (loan backfill), then validates
    expect(loaded.state.player.loan).toBeNull();
    expect(loaded.seed).toBe(77);
  });

  it('round-trips an ACTIVE loan through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(12);
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 575,
      dailyRate: 0.05,
      borrowedDay: 3,
      dueDay: 18,
      status: 'active',
    };
    const loaded = loadSave(createSave(state, 5));
    expect(loaded.state.player.loan).toEqual(state.player.loan);
  });

  it('round-trips a DEFAULTED loan through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(13);
    state.player.loan = {
      lender: 'npc-penny-wise',
      principal: 1000,
      outstanding: 1600,
      dailyRate: 0.05,
      borrowedDay: 2,
      dueDay: 17,
      status: 'defaulted',
    };
    const loaded = loadSave(createSave(state, 6));
    expect(loaded.state.player.loan).toEqual(state.player.loan);
    expect(loaded.state.player.loan?.status).toBe('defaulted');
  });

  it('strict schema rejects an unknown key inside a loan', () => {
    const state = drive50Days(14);
    (state.player.loan as unknown) = {
      lender: 'npc-penny-wise',
      principal: 500,
      outstanding: 500,
      dailyRate: 0.05,
      borrowedDay: 1,
      dueDay: 16,
      status: 'active',
      collectorBribe: 999, // not part of LoanState — must fail .strict()
    };
    expect(() => loadSave(createSave(state, 7))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1306 · v3 → v4 crew migration + crew/reroll round-trip (acceptance #5).
// ---------------------------------------------------------------------------
describe('save envelope — v3 → v4 crew migration (T-1306)', () => {
  it('backfills PlayerState.crew = [] on a v3 envelope with no crew key', () => {
    // Build a REAL v3-shaped state, then strip the crew key the way a genuinely
    // pre-T-1306 save would (it never had the field). The v3→v4 migration must
    // re-add crew: [] before schema validation, else the strict schema (crew is
    // non-optional) would reject it.
    const state = drive50Days(21);
    delete (state.player as unknown as Record<string, unknown>).crew;
    const v3 = JSON.stringify({ version: 3, state, seed: 88 });

    const loaded = loadSave(v3); // walks 3→4 (crew backfill), then validates
    expect(loaded.state.player.crew).toEqual([]);
    expect(loaded.seed).toBe(88);
  });

  it('round-trips a hired crew + a mid-day reroll charge (deep-equal)', () => {
    const state = drive50Days(22);
    state.player.crew = [
      { roleId: 'crew-second', hiredDay: 3 },
      { roleId: 'crew-navigator', hiredDay: 5 },
    ];
    // A mid-day dawn hand carrying an unspent reroll charge must round-trip.
    state.player.dawnHand = {
      dice: [17, 12, 9, 4, 2],
      spent: [false, false, false, false, false],
      rerollsRemaining: 1,
    };
    const loaded = loadSave(createSave(state, 9));
    expect(loaded.state.player.crew).toEqual(state.player.crew);
    expect(loaded.state.player.dawnHand?.rerollsRemaining).toBe(1);
    expect(loaded.state.player.dawnHand).toEqual(state.player.dawnHand);
  });

  it('strict schema rejects an unknown key inside a crew member', () => {
    const state = drive50Days(23);
    (state.player.crew as unknown) = [
      { roleId: 'crew-second', hiredDay: 1, morale: 99 }, // not part of CrewMember
    ];
    expect(() => loadSave(createSave(state, 10))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1307 · v4 → v5 ports migration + owned-ports round-trip (acceptance #3a).
// ---------------------------------------------------------------------------
describe('save envelope — v4 → v5 ports migration (T-1307)', () => {
  it('backfills PlayerState.ports = [] on a v4 envelope with no ports key', () => {
    // Build a REAL v4-shaped state, then strip the ports key the way a genuinely
    // pre-T-1307 save would (it never had the field). The v4→v5 migration must
    // re-add ports: [] before schema validation, else the strict schema (ports is
    // non-optional) would reject it.
    const state = drive50Days(31);
    delete (state.player as unknown as Record<string, unknown>).ports;
    const v4 = JSON.stringify({ version: 4, state, seed: 99 });

    const loaded = loadSave(v4); // walks 4→5 (ports backfill), then validates
    expect(loaded.state.player.ports).toEqual([]);
    expect(loaded.seed).toBe(99);
  });

  it('round-trips owned port stakes through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(32);
    state.player.ports = [
      { systemId: 1, purchaseDay: 3 },
      { systemId: 7, purchaseDay: 12 },
    ];
    const loaded = loadSave(createSave(state, 13));
    expect(loaded.state.player.ports).toEqual(state.player.ports);
  });

  it('strict schema rejects an unknown key inside a port stake', () => {
    const state = drive50Days(33);
    (state.player.ports as unknown) = [
      { systemId: 1, purchaseDay: 1, alliance: 'league' }, // not part of PortStake
    ];
    expect(() => loadSave(createSave(state, 14))).toThrow(SaveError);
  });

  it('CURRENT_SAVE_VERSION is 14', () => {
    // T-1401 bumped 5 → 6 (WireEntry.kind); T-1503 bumped 6 → 7 for the required
    // nested PlayerState.reputation container; T-1603b bumped 7 → 8 to re-derive
    // `registry.renownRank` + `player.tier` after the canonical
    // RENOWN_DEED_THRESHOLDS rescale — the first migration that adds no field and
    // instead repairs the MEANING of two it finds; T-1703 bumped 8 → 9 for the new
    // ROOT-level `GameState.edition` (the demo gate's persisted scalar); N1 bumped
    // 9 → 10 for `NpcState.ship`, the first migration that MOVES a field (the
    // captain's `fuel` becomes `ship.fuel`); N10 bumped 10 → 11 for the SECOND
    // move, `market.npcClaims` → `market.jobPoolClaims` (one scalar counting
    // claims in the player's system becomes a sparse per-system pool ledger that
    // persists and regenerates). See save.ts.
    //
    // N11 bumped 11 → 12 for `NpcState.registry` — the captain's own deed ledger and
    // Renown rank, backfilled EMPTY (no save that exists can hold an NPC deed) and
    // deliberately NOT backfilled with a rank derived from the profile tier.
    //
    // T-111 bumped 12 → 13 for `PlayerState.recovery` — the open multi-day salvage
    // op (types.ts RecoveryState). An ADDITIVE one-key backfill of exactly the
    // shape MIGRATIONS[2] (`loan` → null) already is, and `null` here is a
    // statement of fact rather than a convenience default: until T-111 no recovery
    // could exist, so no save that exists can hold one. Because the backfilled
    // value is a literal null there is no rule to call — the moment it becomes
    // anything else, the `emptyDeedRegistry` "call the constructor" pattern
    // applies. These `CURRENT_SAVE_VERSION` pins move WITH an intended bump; they
    // are version pins, not thresholds, and none of them was touched to make a
    // measurement pass.
    //
    // T-135 bumped 13 → 14 for the ROOT-level `GameState.dareHand` — the open
    // Liar's Dice scene (owner ruling D2, docs/LIARS-DICE_REDESIGN.md §11), the
    // architectural twin of `encounter`. The same additive one-key `null` backfill,
    // and `null` is a statement of fact for the third time: until T-135 no hand
    // could exist, so no save that exists can hold one.
    //
    // T-145 bumped 14 → 15 for the whole fixed Liar's Dice roster's persisted
    // state at once — `player.liarsDiceBeaten`, `player.liarsDiceGamesPlayed`, the
    // root-level `GameState.liarsDicePurses` and five new `DareHandState` keys —
    // in ONE migration, deliberately, so that T-146 and T-147 stay parallelizable
    // without racing on this constant (docs/LIARS-DICE-PROGRESSION_SPEC.md §5).
    // The first four are the by-now familiar additive backfills; the purse map is
    // the first one in a while whose value is NOT a literal, so it CALLS a rule
    // (`seedLiarsDicePurses`) rather than restating one, the MIGRATIONS[11] /
    // `emptyDeedRegistry` pattern by name. This pin moved WITH an intended bump.
    expect(CURRENT_SAVE_VERSION).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Serialize a state into an envelope at an arbitrary version (for error tests). */
function createSaveAtVersion(state: GameState, version: number): string {
  return JSON.stringify({ version, state });
}

/** Narrow a LoadedSave seed for re-save: a v2 save always carries one. */
function requireSeed(seed: number | null): number {
  if (seed === null) throw new Error('expected the loaded save to carry a seed');
  return seed;
}

/** Assert the thunk throws a SaveError and return it (typed). */
function expectSaveError(fn: () => unknown): SaveError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(SaveError);
  return caught as SaveError;
}

// T-1401 · v5 → v6 WireEntry.kind migration + kinded-eventLog round-trip.
describe('save envelope — v5 → v6 WireEntry.kind migration (T-1401)', () => {
  const flawSuffixes = Object.values(FLAWS).map((f) => f.detail);
  const endsWithFlaw = (msg: string): boolean => flawSuffixes.some((s) => msg.endsWith(s));

  /** Strip the `kind` off every WireEntry, the way a genuinely pre-T-1401 (v5)
   *  save would look — it never had the field. */
  function stripWireKind(state: GameState): GameState {
    const clone = JSON.parse(JSON.stringify(state)) as GameState;
    for (const e of clone.eventLog) {
      if (e.type === 'WireEntry') {
        delete (e as unknown as Record<string, unknown>).kind;
      }
    }
    return clone;
  }

  it('backfills kind on a v5 envelope by re-deriving the pre-change classification', () => {
    // Seed 1 deterministically files both flaw-override lines and plain npc lines.
    const state = drive50Days(1);
    const wireEntries = state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(wireEntries.length).toBeGreaterThan(0);
    // The driven log must contain BOTH classes so the migration is exercised on each.
    const hasFlawLine = wireEntries.some((e) => e.type === 'WireEntry' && endsWithFlaw(e.message));
    const hasPlainLine = wireEntries.some(
      (e) => e.type === 'WireEntry' && !endsWithFlaw(e.message),
    );
    expect(hasFlawLine).toBe(true);
    expect(hasPlainLine).toBe(true);

    const v5 = createSaveAtVersion(stripWireKind(state), 5);
    const loaded = loadSave(v5); // walks 5→6 (kind backfill), then validates

    const migratedWire = loaded.state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(migratedWire.length).toBe(wireEntries.length);
    for (const e of migratedWire) {
      if (e.type !== 'WireEntry') continue;
      // Re-derivation: a flaw-detail suffix ⇒ 'flaw-override', everything else ⇒ 'npc'.
      expect(e.kind).toBe(endsWithFlaw(e.message) ? 'flaw-override' : 'npc');
    }
    // At least one of each landed (proves both branches ran, not just a default).
    expect(migratedWire.some((e) => e.type === 'WireEntry' && e.kind === 'flaw-override')).toBe(
      true,
    );
    expect(migratedWire.some((e) => e.type === 'WireEntry' && e.kind === 'npc')).toBe(true);
  });

  it('leaves an already-kinded WireEntry untouched during migration', () => {
    // A v5 save whose WireEntry somehow already carries a kind must not be re-derived.
    const state = createInitialState(3);
    state.eventLog.push({ type: 'WireEntry', day: 1, kind: 'plain', message: 'A world line.' });
    const v5 = createSaveAtVersion(state, 5);
    const loaded = loadSave(v5);
    const wire = loaded.state.eventLog.find((e) => e.type === 'WireEntry');
    expect(wire?.type === 'WireEntry' && wire.kind).toBe('plain');
  });

  it('round-trips a state whose eventLog carries kinded WireEntry events (deep-equal)', () => {
    const state = drive50Days(2);
    expect(state.eventLog.some((e) => e.type === 'WireEntry')).toBe(true);
    const restored = loadSave(createSave(state, 2));
    expect(restored.state).toEqual(state);
    // The kinds survive the round-trip byte-for-byte.
    const before = state.eventLog.filter((e) => e.type === 'WireEntry');
    const after = restored.state.eventLog.filter((e) => e.type === 'WireEntry');
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// T-1503 · v6 → v7 nested-reputation migration + NESTED round-trip regression.
//
// This is the exact bug class the T-1002 drift-protection was built to stop, BY
// NAME: `player.reputation` is the nested container the schema comment cites as the
// field Zod's default STRIP mode used to silently drop. These tests prove (a) a
// pre-reputation v6 save gets the neutral nested container back through the v6→v7
// migration, (b) non-zero nested rep values survive createSave → loadSave
// DEEP-EQUAL (the silent-nested-key-strip regression), and (c) an unknown nested
// key under `reputation` fails the `.strict()` load — drift protection covers it.
// ---------------------------------------------------------------------------
describe('save envelope — v6 → v7 reputation migration (T-1503, the T-1002 nested-key bug class)', () => {
  const NEUTRAL = { league: 0, dragons: 0, confederation: 0, rebels: 0 };

  it('backfills the neutral PlayerState.reputation container on a v6 envelope with no reputation key', () => {
    // Build a REAL v6-shaped state, then strip the reputation key the way a
    // genuinely pre-T-1503 save would (it never had the nested field). The v6→v7
    // migration must re-add the strict four-key container before validation, else
    // the strict schema (reputation is non-optional) rejects it.
    const state = drive50Days(41);
    delete (state.player as unknown as Record<string, unknown>).reputation;
    const v6 = JSON.stringify({ version: 6, state, seed: 71 });

    const loaded = loadSave(v6); // walks 6→7 (reputation backfill), then validates
    expect(loaded.state.player.reputation).toEqual(NEUTRAL);
    expect(loaded.seed).toBe(71);
  });

  it('merges a PARTIAL reputation container faction-key by faction-key on migration', () => {
    // A v6 save that carries only some faction keys (a hand-tampered or partially
    // written blob) must have the missing keys backfilled to 0, not the whole
    // container replaced — the T-1002 strict schema needs all four present.
    const state = drive50Days(42);
    (state.player as unknown as Record<string, unknown>).reputation = { league: 4 };
    const v6 = JSON.stringify({ version: 6, state, seed: 72 });

    const loaded = loadSave(v6);
    expect(loaded.state.player.reputation).toEqual({
      league: 4,
      dragons: 0,
      confederation: 0,
      rebels: 0,
    });
  });

  it('round-trips NON-ZERO nested reputation through createSave → loadSave (deep-equal — the silent-strip regression)', () => {
    // THE regression: set every faction key to a distinct non-zero value and prove
    // the nested `player.reputation` object survives serialize → migrate → validate
    // byte-for-byte. Under Zod's old default STRIP mode (pre-T-1002) an unknown or
    // unmodelled nested key here was silently dropped; the strict schema + this
    // deep-equal assertion is what makes that impossible for `player.reputation`.
    const state = drive50Days(43);
    state.player.reputation = { league: 7, dragons: -4, confederation: 12, rebels: -1 };
    const loaded = loadSave(createSave(state, 73));
    expect(loaded.state.player.reputation).toEqual(state.player.reputation);
    // The WHOLE state is deep-equal — the nested container did not perturb anything.
    expect(loaded.state).toEqual(state);
  });

  it('strict schema rejects an unknown nested key inside reputation (drift protection covers it)', () => {
    // Adding a fifth, unmodelled key under `reputation` must FAIL the load — the
    // `.strict()` FactionReputationSchema is what guarantees a nested drift is loud,
    // not silently stripped. This is the negative twin of the deep-equal test.
    const state = drive50Days(44);
    (state.player.reputation as unknown as Record<string, unknown>).syndicate = 5;
    expect(() => loadSave(createSave(state, 74))).toThrow(SaveError);
  });
});

describe('save envelope — v8 → v9 edition migration (T-1703)', () => {
  it('backfills edition: "full" on a v8 envelope with no edition key', () => {
    // Build a REAL v8-shaped state, then strip the root `edition` key the way a
    // genuinely pre-T-1703 save would (it never had the field). The v8→v9
    // migration must re-add it before validation, else the strict schema (edition
    // is non-optional) rejects it.
    //
    // THE DIRECTION MATTERS AND IS THE POINT: every save that exists was written
    // before a demo build existed, so 'full' is a statement of fact. Backfilling
    // 'demo' would silently take a real player's ports, crew and capstone rank.
    const state = drive50Days(81);
    delete (state as unknown as Record<string, unknown>).edition;
    const v8 = JSON.stringify({ version: 8, state, seed: 91 });

    const loaded = loadSave(v8);
    expect(loaded.state.edition).toBe('full');
    expect(loaded.seed).toBe(91);
  });

  it('leaves an edition already present alone (idempotent, forward-safe)', () => {
    const state = drive50Days(82);
    (state as unknown as Record<string, unknown>).edition = 'demo';
    const loaded = loadSave(JSON.stringify({ version: 8, state, seed: 92 }));
    expect(loaded.state.edition).toBe('demo');
  });

  it('round-trips a DEMO career exactly through createSave → loadSave', () => {
    // Constraint 3, in the same commit as the field: a demo autosave must come
    // back deep-equal, or a demo player loses their career on reload.
    const state = drive50Days(83);
    state.edition = 'demo';
    const loaded = loadSave(createSave(state, 93));
    expect(loaded.state.edition).toBe('demo');
    expect(loaded.state).toEqual(state);
  });

  it('strict schema rejects an edition the engine has no rules for', () => {
    // The negative twin: a hand-edited save cannot invent a third edition and get
    // whatever the gate does with an unknown value — it fails loudly on load.
    const state = drive50Days(84);
    (state as unknown as Record<string, unknown>).edition = 'deluxe';
    expect(() => loadSave(createSave(state, 94))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// N1 · v9 → v10 — the first migration here that MOVES a field rather than adding
// one. Every `NpcState` gains a required `ship` (the real ShipState the captain
// owns, replacing the tier-derived phantom npc.ts used to synthesize per action)
// and loses its top-level `fuel`, which becomes `ship.fuel`.
//
// Both halves are asserted, because `NpcStateSchema` is `.strict()` and a
// half-done migration fails in two different directions: an orphaned `fuel` is
// an unknown key, a missing `ship` is a missing one. And the fuel must CARRY —
// a legacy captain down to their last few units must not be handed a full tank
// by the upgrade.
// ---------------------------------------------------------------------------
describe('save envelope — v9 → v10 NPC ship migration (N1)', () => {
  /** A v9-shaped roster: strip `ship`, put the tank back at the top level, the
   *  way a genuinely pre-N1 save carried it. */
  function asV9(state: GameState): GameState {
    const legacy = JSON.parse(JSON.stringify(state)) as GameState;
    legacy.npcs.forEach((npc) => {
      const raw = npc as unknown as Record<string, unknown>;
      raw.fuel = npc.ship.fuel;
      delete raw.ship;
    });
    return legacy;
  }

  it('gives every captain a tier-seeded ship and pours the saved fuel into it', () => {
    const state = drive50Days(85);
    const expected = new Map(state.npcs.map((npc) => [npc.id, npc.ship.fuel]));
    const v9 = JSON.stringify({ version: 9, state: asV9(state), seed: 95 });

    const loaded = loadSave(v9);
    expect(loaded.seed).toBe(95);
    expect(loaded.state.npcs).toHaveLength(ALL_NPC_PROFILES.length);
    for (const npc of loaded.state.npcs) {
      const profile = ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)!;
      // The fit is the tier's — the same mapping createInitialState seeds with.
      const seeded = npcShipForProfile(profile);
      expect(npc.ship.cargoPods).toBe(seeded.cargoPods);
      expect(npc.ship.drives).toEqual(seeded.drives);
      expect(npc.ship.hull).toEqual(seeded.hull);
      expect(npc.ship.maxFuel).toBe(seeded.maxFuel);
      // ...but the TANK is the save's, not the seed's.
      expect(npc.ship.fuel).toBe(expected.get(npc.id));
      expect((npc as unknown as Record<string, unknown>).fuel).toBeUndefined();
    }
  });

  it('a migrated roster carries everything a v9 save actually held', () => {
    // N1 asserted the sharper property here: round-tripping a live v10 state DOWN
    // to the v9 shape and back up landed on EXACTLY the state it started from.
    // That held only while a captain's ship was a pure function of their tier.
    //
    // N2 MAKES IT FALSE ON PURPOSE, and the failure is the feature. A captain now
    // BUYS their fit (`npc.ts` `considerRefit`), so by day 50 the roster's ships
    // are earned state. The v9 shape has no `ship` key at all, so down-converting
    // DESTROYS every refit — and re-deriving them is not "migration", it is
    // recovering data the format never carried. The migration's real contract is
    // what a v9 save genuinely held, which is asserted below: identity, purse,
    // standing, position, last action, and the saved fuel poured into a
    // tier-seeded tank. Everything else is correctly the seed's.
    const state = drive50Days(86);
    const loaded = loadSave(JSON.stringify({ version: 9, state: asV9(state), seed: 96 }));
    expect(loaded.state.npcs).toHaveLength(state.npcs.length);
    for (const [index, npc] of loaded.state.npcs.entries()) {
      const live = state.npcs[index];
      expect(npc.id).toBe(live.id);
      expect(npc.name).toBe(live.name);
      expect(npc.profileId).toBe(live.profileId);
      expect(npc.credits).toBe(live.credits);
      expect(npc.disposition).toBe(live.disposition);
      expect(npc.currentSystemId).toBe(live.currentSystemId);
      expect(npc.lastAction).toEqual(live.lastAction);
      // The tank is the save's, clamped to the seeded hull it is being poured into.
      const seeded = npcShipForProfile(ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)!);
      expect(npc.ship.fuel).toBe(Math.min(seeded.maxFuel, live.ship.fuel));
      expect((npc as unknown as Record<string, unknown>).fuel).toBeUndefined();
    }
  });

  it('is idempotent — a record that already carries a ship is left alone', () => {
    const state = drive50Days(87);
    const loaded = loadSave(JSON.stringify({ version: 9, state, seed: 97 }));
    expect(loaded.state.npcs).toEqual(state.npcs);
  });

  it('does not throw on a roster it cannot read (a migration must never be the thrower)', () => {
    const state = drive50Days(88);
    (state as unknown as Record<string, unknown>).npcs = 'not-an-array';
    // The SCHEMA rejects it, as a typed SaveError — the migration itself passes
    // the unreadable roster through rather than blowing up mid-walk.
    expect(() => loadSave(JSON.stringify({ version: 9, state, seed: 98 }))).toThrow(SaveError);
  });

  it('strict schema rejects a v10 roster that still carries the old top-level fuel', () => {
    const state = drive50Days(89);
    (state.npcs[0] as unknown as Record<string, unknown>).fuel = 500;
    expect(() => loadSave(createSave(state, 99))).toThrow(SaveError);
  });

  it('round-trips the whole roster byte-identically, at a cost worth naming', () => {
    // Constraint 3 in the same commit as the field. The size claim is measured,
    // not asserted with a magic threshold: 30 ShipStates is the whole cost of N1
    // on disk, and the worklist asked for it to be watched.
    const state = drive50Days(90);
    const blob = createSave(state, 100);
    const loaded = loadSave(blob);
    expect(loaded.state).toEqual(state);
    // BYTE-IDENTICAL, stated as the fixed point it actually is: `loadSave` runs
    // the state through zod, which rebuilds every object in SCHEMA key order, so
    // a first round trip can re-order keys without changing a value. What must
    // hold — and what a mis-modelled `ship` would break — is that the SECOND trip
    // changes nothing at all, byte for byte, including all 30 ships.
    const once = createSave(loaded.state, 100);
    const twice = createSave(loadSave(once).state, 100);
    expect(twice).toBe(once);

    const rosterBytes = JSON.stringify(state.npcs).length;
    const shipBytes = state.npcs.reduce((sum, npc) => sum + JSON.stringify(npc.ship).length, 0);
    const registryBytes = state.npcs.reduce(
      (sum, npc) => sum + JSON.stringify(npc.registry).length,
      0,
    );
    // N11 · THE "~86% SHIPS" CLAIM ABOVE IS NO LONGER TRUE, and this is the same
    // measurement RE-TAKEN, not a bound relaxed to force a pass — N11 added a second
    // per-captain field, so the composition it described changed by construction.
    // Re-measured on this exact 50-day seed-90 state: roster 72,826 bytes, of which
    // ships 21,303 (29%) and REGISTRIES 42,714 (59%) — the registry overtakes the
    // ship because a deed row carries an authored citation string where a component
    // carries two small integers. Both bounds below stay non-vacuous and both are
    // facts about the shape rather than about a tuning number: the two owned
    // sub-objects are still ~88% of a captain's record, and the roster is still a
    // small fraction of the save (7.7% here — the eventLog dominates a real career).
    expect(shipBytes + registryBytes).toBeGreaterThan(rosterBytes * 0.8);
    expect(registryBytes).toBeGreaterThan(shipBytes);
    expect(rosterBytes).toBeLessThan(blob.length * 0.5);
  });
});

// ---------------------------------------------------------------------------
// N10 · v10 → v11 — the SECOND migration here that moves a field.
// `market.npcClaims` (one scalar: claims against the player's system, reset every
// dawn) becomes `market.jobPoolClaims` (a sparse `systemId -> claims` record that
// persists across days and restocks).
//
// The same two-directional strictness as v9 → v10 applies and is asserted here:
// `MarketStateSchema` is `.strict()`, so an orphaned `npcClaims` is an unknown key
// and a missing `jobPoolClaims` is a missing one. The value must LAND SOMEWHERE
// REAL — a drained port that migrates to a full board silently hands the loading
// player four offers the cast had already taken.
// ---------------------------------------------------------------------------
describe('save envelope — v10 → v11 shared job pool migration (N10)', () => {
  /** A v10-shaped market: the scalar back, the record gone. */
  function asV10(state: GameState, npcClaims: number): GameState {
    const legacy = JSON.parse(JSON.stringify(state)) as GameState;
    const market = legacy.market as unknown as Record<string, unknown>;
    delete market.jobPoolClaims;
    market.npcClaims = npcClaims;
    return legacy;
  }

  it('credits the old scalar to the system the player was standing in', () => {
    // Not a guess: the co-located snipe was the scalar's only writer and that
    // dawn's board its only reader, so the player's system is the only system it
    // could ever have described.
    const state = drive50Days(120);
    const system = state.player.currentSystemId;
    const loaded = loadSave(JSON.stringify({ version: 10, state: asV10(state, 2), seed: 120 }));

    expect(loaded.state.market.jobPoolClaims).toEqual({ [String(system)]: 2 });
    expect((loaded.state.market as unknown as Record<string, unknown>).npcClaims).toBeUndefined();
    // The drained port stays drained — the loading player does not get a free
    // board back.
    expect(jobPoolDepth(loaded.state.market.jobPoolClaims, system)).toBe(JOB_POOL_BOARD_SIZE - 2);
  });

  it('an undrained v10 market migrates to an EMPTY ledger, not to a zero per system', () => {
    const state = drive50Days(121);
    const loaded = loadSave(JSON.stringify({ version: 10, state: asV10(state, 0), seed: 121 }));
    expect(loaded.state.market.jobPoolClaims).toEqual({});
  });

  it('clamps a scalar deeper than a pool can legally be drained', () => {
    // Through the engine's own constant, not a literal: a migration CALLS a rule,
    // it never restates one (the MIGRATIONS[9] precedent that keeps save.ts out of
    // the rules fingerprint honest).
    const state = drive50Days(122);
    const loaded = loadSave(JSON.stringify({ version: 10, state: asV10(state, 99), seed: 122 }));
    const system = String(loaded.state.player.currentSystemId);
    expect(loaded.state.market.jobPoolClaims[system]).toBe(JOB_POOL_MAX_CLAIMS);
  });

  it('is idempotent — a market that already carries the record is left alone', () => {
    const state = drive50Days(123);
    state.market.jobPoolClaims = { '3': 1, '9': 2 };
    const loaded = loadSave(JSON.stringify({ version: 10, state, seed: 123 }));
    expect(loaded.state.market.jobPoolClaims).toEqual({ '3': 1, '9': 2 });
  });

  it('does not throw on a market it cannot read (a migration must never be the thrower)', () => {
    const state = drive50Days(124);
    (state as unknown as Record<string, unknown>).market = 'not-an-object';
    expect(() => loadSave(JSON.stringify({ version: 10, state, seed: 124 }))).toThrow(SaveError);
  });

  it('strict schema rejects a v11 market that still carries the old scalar', () => {
    const state = drive50Days(125);
    (state.market as unknown as Record<string, unknown>).npcClaims = 1;
    expect(() => loadSave(createSave(state, 125))).toThrow(SaveError);
  });

  it('round-trips a drained galaxy byte-identically', () => {
    // Constraint 3 in the same commit as the field. The pool is GALAXY state now,
    // so a save that loses it loses every port's memory of being worked.
    const state = drive50Days(126);
    state.market.jobPoolClaims = { '1': 1, '7': 2, '20': JOB_POOL_MAX_CLAIMS };
    const loaded = loadSave(createSave(state, 126));
    expect(loaded.state.market.jobPoolClaims).toEqual(state.market.jobPoolClaims);
    const once = createSave(loaded.state, 126);
    expect(createSave(loadSave(once).state, 126)).toBe(once);
  });

  it('deserializeState performs the SAME move as the migration', () => {
    // Two paths, one rule. `loadSave` runs the migration registry; the UI store's
    // `deserializeState` does its own save-compat backfill, and N1's `fuel` move
    // is the precedent for them being able to drift. Both must credit the same
    // system, or a save loaded through one door would describe a different galaxy
    // than the same save loaded through the other.
    const state = drive50Days(127);
    const system = state.player.currentSystemId;
    const viaLoader = loadSave(JSON.stringify({ version: 10, state: asV10(state, 2), seed: 127 }));
    const viaDeserialize = deserializeState(JSON.stringify(asV10(state, 2)));

    expect(viaDeserialize.market.jobPoolClaims).toEqual({ [String(system)]: 2 });
    expect(viaDeserialize.market.jobPoolClaims).toEqual(viaLoader.state.market.jobPoolClaims);
    expect((viaDeserialize.market as unknown as Record<string, unknown>).npcClaims).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// N11 · v11 → v12 — `NpcState.registry`, the captain's own deed ledger.
//
// An ADDITION, not a move (the two before it — v9→v10 and v10→v11 — were moves),
// so the discipline being asserted here is different: what matters is WHAT the
// backfill puts there. Two things, both pinned below:
//
//   1. EMPTY IS A STATEMENT OF FACT. No save that exists can carry an NPC deed,
//      because until N11 no NPC could earn one. There is nothing to reconstruct.
//   2. AND IT MUST NOT BE A SYNTHETIC RANK. The tempting version of this migration
//      seeds each captain a rank off their profile tier so a loaded field looks
//      lived-in. N11's ruling forbids it: the fast-forward allowance covers the
//      SOURCE, never unearned rank, and a tier-5 captain holding a rank they never
//      earned is the "constant recomputed from profile" phantom N1 killed. The
//      anti-backfill test below is the pin for that, and it is the whole reason this
//      block exists rather than one round-trip case.
// ---------------------------------------------------------------------------
describe('save envelope — v11 → v12 NPC deed registry (N11)', () => {
  /** A v11-shaped roster: every captain's registry gone. */
  function asV11(state: GameState): GameState {
    const legacy = JSON.parse(JSON.stringify(state)) as GameState;
    for (const npc of legacy.npcs) {
      delete (npc as unknown as Record<string, unknown>).registry;
    }
    return legacy;
  }

  it('backfills an EMPTY registry at LIEUTENANT for every captain', () => {
    const state = drive50Days(130);
    const loaded = loadSave(JSON.stringify({ version: 11, state: asV11(state), seed: 130 }));

    expect(loaded.state.npcs.length).toBeGreaterThan(0);
    for (const npc of loaded.state.npcs) {
      expect(npc.registry).toEqual(emptyDeedRegistry());
      expect(npc.registry.earned).toEqual([]);
      expect(npc.registry.matchCounts).toEqual({});
      // Through the ladder, not against a literal: `rankForDeedCount` is the ONLY
      // rank derivation on either side of the game.
      expect(npc.registry.renownRank).toBe(rankForDeedCount(0));
      expect(npc.registry.renownRank).toBe('LIEUTENANT');
    }
  });

  it('does NOT synthesise a rank from the profile tier — a tier-5 captain loads at LIEUTENANT', () => {
    // The explicit anti-backfill pin N11 demands. Nothing about `profileId` or its
    // tier may reach the registry, in the migration or anywhere else.
    const state = drive50Days(131);
    const loaded = loadSave(JSON.stringify({ version: 11, state: asV11(state), seed: 131 }));

    const topTier = loaded.state.npcs.filter(
      (npc) => (ALL_NPC_PROFILES.find((p) => p.id === npc.profileId)?.tier ?? 0) >= 5,
    );
    expect(topTier.length).toBeGreaterThan(0);
    for (const npc of topTier) {
      expect(npc.registry.earned).toHaveLength(0);
      expect(npc.registry.renownRank).toBe('LIEUTENANT');
    }
  });

  it('is idempotent — a roster that already carries earned deeds keeps them byte-for-byte', () => {
    const state = drive50Days(132);
    const earnedBefore = state.npcs.map((npc) => JSON.stringify(npc.registry));
    // The 50-day drive is what makes this non-vacuous: the cast has really accrued.
    expect(state.npcs.some((npc) => npc.registry.earned.length > 0)).toBe(true);

    const loaded = loadSave(JSON.stringify({ version: 11, state, seed: 132 }));
    expect(loaded.state.npcs.map((npc) => JSON.stringify(npc.registry))).toEqual(earnedBefore);
  });

  it('does not throw on a roster it cannot read (a migration must never be the thrower)', () => {
    const state = drive50Days(133);
    (state as unknown as Record<string, unknown>).npcs = 'not-an-array';
    // The SCHEMA rejects it as a typed SaveError; the migration passes the
    // unreadable roster through rather than blowing up mid-walk — the MIGRATIONS[9]
    // shape.
    expect(() => loadSave(JSON.stringify({ version: 11, state, seed: 133 }))).toThrow(SaveError);
  });

  it('round-trips a captain WITH earned deeds byte-identically, including a row with no eventIndex', () => {
    const state = drive50Days(134);
    const captain = state.npcs[0];
    // N11 · An NPC-earned row carries NO `eventIndex`: the accrual batch is local and
    // never enters `state.eventLog`, so there is no index to record (see the field's
    // doc comment). The schema has to accept its absence or the very first dusk a
    // captain earns a deed would make the autosave unloadable.
    expect(captain.registry.earned.every((deed) => deed.eventIndex === undefined)).toBe(true);
    expect(state.npcs.some((npc) => npc.registry.earned.length > 0)).toBe(true);

    const loaded = loadSave(createSave(state, 134));
    expect(loaded.state.npcs).toEqual(state.npcs);
    const once = createSave(loaded.state, 134);
    expect(createSave(loadSave(once).state, 134)).toBe(once);
  });

  it('deserializeState performs the SAME backfill as the migration', () => {
    // Two paths, one rule — the v10→v11 pattern. `loadSave` runs the migration
    // registry; the UI store's `deserializeState` does its own save-compat backfill,
    // and both call `emptyDeedRegistry()`, so they cannot drift into two different
    // starting standings for the same save.
    const state = drive50Days(135);
    const viaLoader = loadSave(JSON.stringify({ version: 11, state: asV11(state), seed: 135 }));
    const viaDeserialize = deserializeState(JSON.stringify(asV11(state)));

    const loaderRegistries: DeedRegistryState[] = viaLoader.state.npcs.map((npc) => npc.registry);
    const deserializeRegistries: DeedRegistryState[] = viaDeserialize.npcs.map(
      (npc) => npc.registry,
    );
    expect(deserializeRegistries).toEqual(loaderRegistries);
    expect(deserializeRegistries.every((registry) => registry.earned.length === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T-1505a · The twelve-fragment Nemesis file round-trips, including the two
// source literals the arc only started producing in this task.
//
// NO MIGRATION AND NO VERSION BUMP is required, and that is the point of these
// tests: T-1505a adds no GameState FIELD. `SignalFragmentRecordSchema` already
// types `fragmentId: z.string()` (any authored id passes) and its source enum
// already carries all five literals — 'sage' and 'npc' were simply never emitted
// by content before. These assert the shipped schema really does carry the whole
// arc through createSave → loadSave, so the "no migration needed" claim is
// proven rather than asserted in prose (the T-1504c/d precedent).
// ---------------------------------------------------------------------------
describe('save envelope — the full Nemesis file round-trips with no migration (T-1505a)', () => {
  it('all 12 fragments and all 5 source literals survive createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(51);
    const ids = Object.keys(SIGNAL_FRAGMENTS);
    expect(ids).toHaveLength(12);

    // Every source literal appears at least once, 'sage' and 'npc' included.
    const sources = ['derelict', 'beacon', 'wise-one', 'sage', 'npc'] as const;
    state.player.nemesisFile = {
      fragments: ids.map((fragmentId, i) => ({
        fragmentId,
        source: sources[i % sources.length],
        day: i + 1,
        decoded: i % 3 === 0,
      })),
    };
    const usedSources = new Set(state.player.nemesisFile.fragments.map((f) => f.source));
    for (const source of sources) expect(usedSources.has(source)).toBe(true);

    const loaded = loadSave(createSave(state, 75));
    expect(loaded.state.player.nemesisFile).toEqual(state.player.nemesisFile);
    // The WHOLE state is deep-equal — nothing about the fuller file perturbed it.
    expect(loaded.state).toEqual(state);
    // No version bump was needed for any of it. (T-1603b later bumped 7 → 8 for
    // an unrelated reason — the renown re-derivation — T-1703 8 → 9 for the new
    // `edition` field, N1 9 → 10 for `NpcState.ship` and N10 10 → 11 for the
    // per-system job pool, N11 11 → 12 for `NpcState.registry` and T-111 12 → 13
    // for `PlayerState.recovery` and T-135 13 → 14 for the root-level
    // `GameState.dareHand` and T-145 14 → 15 for the fixed Liar's Dice roster's
    // persisted state, so this pins the CURRENT version rather than
    // claiming the fragment file caused it.)
    expect(CURRENT_SAVE_VERSION).toBe(15);
  });

  it('strict schema still rejects an unknown fragment source (drift protection covers it)', () => {
    const state = drive50Days(52);
    (state.player.nemesisFile.fragments as unknown[]) = [
      { fragmentId: 'frag-nemesis-09', source: 'courier', day: 4, decoded: false },
    ];
    expect(() => loadSave(createSave(state, 76))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1505c · The ENDED career round-trips, with no migration.
//
// Again NO GameState FIELD ships (design call D7): the terminus is DERIVED from
// `player.currentSystemId`, which the save schema has round-tripped since v1, so
// there is nothing to migrate and no version bump. What IS new is a serialized
// literal — `ActionBlocked.reason: 'career-ended'` — and an ended career's
// autosave will contain it the first time the player pokes a dead control, so
// the schema has to accept it or a reload would be rejected outright.
// ---------------------------------------------------------------------------
describe('save envelope — an ended career round-trips with no migration (T-1505c)', () => {
  it("the far-side position and a logged 'career-ended' refusal survive the round trip", () => {
    const state = drive50Days(53);
    state.player.currentSystemId = NEMESIS_SYSTEM_ID;
    state.eventLog.push({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-ended',
    });

    const loaded = loadSave(createSave(state, 77));

    expect(loaded.state).toEqual(state);
    expect(careerEnded(loaded.state)).toBe(true);
    expect(loaded.state.eventLog).toContainEqual({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-ended',
    });
    // Nothing needed a bump for any of it. (T-1603b later bumped 7 → 8 for the
    // unrelated renown re-derivation, T-1703 8 → 9 for the new `edition` field,
    // N1 9 → 10 for `NpcState.ship`, N10 10 → 11 for the per-system job pool,
    // N11 11 → 12 for `NpcState.registry`, T-111 12 → 13 for
    // `PlayerState.recovery`, T-135 13 → 14 for `GameState.dareHand` and T-145
    // 14 → 15 for the fixed Liar's Dice roster's persisted state; this
    // pins the CURRENT version.)
    expect(CURRENT_SAVE_VERSION).toBe(15);
  });

  it('strict schema still rejects an unknown ActionBlocked reason (drift protection)', () => {
    const state = drive50Days(54);
    // A reason literal the union does not carry — cast through `unknown` (the
    // pattern the loan/fragment drift tests above use) so the strict schema, not
    // the type checker, is what rejects it.
    (state.eventLog as unknown[]).push({
      type: 'ActionBlocked',
      day: state.day,
      actionType: 'Explore',
      reason: 'career-abandoned',
    });
    expect(() => loadSave(createSave(state, 78))).toThrow(SaveError);
  });
});

// ---------------------------------------------------------------------------
// T-1603b · A THRESHOLD RESCALE NEEDS NO MIGRATION, and this is why.
//
// The canonical `RENOWN_DEED_THRESHOLDS` rescale (content deeds.ts) added and
// removed no `GameState` field, so `CURRENT_SAVE_VERSION` did not move and no
// migration was written. That is only safe because the rank is a DERIVED value:
// `deserializeState` (state.ts) recomputes
// `registry.renownRank = rankForDeedCount(earned.length)` on every load, so a
// save written under any earlier table self-heals to whatever the current table
// selects for the deeds it actually holds.
//
// This block asserts that behaviour end-to-end through the real save envelope
// (createSave -> loadSave), not just through deserializeState, because the
// envelope is what a player's browser actually holds. It is the standing proof
// that the next rescale is likewise migration-free — and the alarm if someone
// ever makes `renownRank` an independently stored fact.
// ---------------------------------------------------------------------------
describe('T-1603b renown rescale save compatibility (v7 -> v8)', () => {
  /** A state standing at `storedRank` with `deeds` earned deeds. When the two
   *  disagree it is exactly the shape a pre-rescale save has. */
  function stateAt(storedRank: RenownRankId, deeds: number, tier?: 1 | 2 | 3 | 4 | 5): GameState {
    const state = createInitialState(1603);
    state.player.registry.earned = Array.from({ length: deeds }, (_, i) => ({
      id: `synthetic-deed-${i}`,
      title: `Synthetic Deed ${i}`,
      citation: 'test',
      day: 1,
      eventIndex: i,
    }));
    state.player.registry.renownRank = storedRank;
    if (tier !== undefined) state.player.tier = tier;
    return state;
  }

  it('a v7 envelope is healed by the production migration, not only by the loader', () => {
    // THE FAILURE THIS GUARDS. `deserializeState` (state.ts) recomputes the rank,
    // but `loadSave` does NOT go through it — it runs `migrate` ->
    // `validateGameState`, and that is the path the shipped UI store takes
    // (`packages/ui/src/store.ts`). So the healing has to live in the v7->v8
    // MIGRATION, and this asserts it there. Without it, a real player's save would
    // keep a rank its deeds no longer buy, and the next deed earned would drive
    // `evaluateDeeds` from GIGA_HERO down to ADMIRAL and emit that DEMOTION as a
    // `RenownRankUp` carrying a promotion citation on the wire.
    //
    // 15 deeds bought GIGA_HERO under the pre-T-1603b table. The healed rank is
    // asserted DERIVED (`rankForDeedCount`), so this states the RULE — "rank
    // follows the count" — rather than pinning a rank that the next rescale moves.
    const v7Envelope = JSON.stringify({
      version: 7,
      state: stateAt('GIGA_HERO', 15, 5),
      seed: 1603,
    });

    const loaded = loadSave(v7Envelope);
    expect(loaded.state.player.registry.earned).toHaveLength(15);
    expect(loaded.state.player.registry.renownRank).toBe(rankForDeedCount(15));
    // The demotion is real, not a no-op: this is the deliberate consequence
    // recorded at the threshold table's definition site.
    expect(loaded.state.player.registry.renownRank).not.toBe('GIGA_HERO');

    // ...and `player.tier` — derived from rank, and the ONLY input to encounter
    // matchmaking — is resynced with it. A load that healed the rank but not the
    // band would send the matchmaker after hunters the captain no longer ranks
    // with, which is the quiet half of this bug.
    expect(loaded.state.player.tier).toBe(
      computePlayerTier(rankForDeedCount(15), loaded.state.player.ship),
    );
    expect(loaded.state.player.tier).not.toBe(5);

    // IDEMPOTENT: re-saving the healed state and loading it again changes nothing,
    // so a player who loads twice does not drift.
    const again = loadSave(createSave(loaded.state, 1603));
    expect(again.state.player.registry.renownRank).toBe(loaded.state.player.registry.renownRank);
    expect(again.state.player.tier).toBe(loaded.state.player.tier);
  });

  it('the migration passes an unreadable registry through instead of throwing', () => {
    // A migration must never be the thing that throws — the schema is what
    // rejects a malformed save, with a typed SaveError. Driven through `migrate`
    // directly so the assertion is about the migration step, not the loader.
    const noRegistry = { player: { credits: 1 } };
    expect(() => migrate({ version: 7, state: noRegistry })).not.toThrow();
    expect(() => migrate({ version: 7, state: { player: 'nonsense' } })).not.toThrow();
    expect(() => migrate({ version: 7, state: {} })).not.toThrow();
    // ...and the loader still refuses the malformed state, with the typed error.
    expect(() => loadSave(JSON.stringify({ version: 7, state: noRegistry, seed: 1 }))).toThrow(
      SaveError,
    );
  });

  it('every rank round-trips at its own threshold (no rank is lost in the envelope)', () => {
    // The schema carries a rank ENUM, so a rescale must not strand one. Each rank
    // is saved with the deed count that legitimately selects it, so the migration
    // is a no-op and what is under test is the envelope + schema. Driven from
    // content — never a hand-listed rank list.
    for (const rank of RENOWN_RANK_ORDER) {
      const loaded = loadSave(createSave(stateAt(rank, RENOWN_DEED_THRESHOLDS[rank]), 1603));
      expect(loaded.state.player.registry.renownRank, `${rank} did not survive the save`).toBe(
        rank,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// T-111 · v12 → v13 recovery migration + open-recovery round-trip.
// ---------------------------------------------------------------------------
describe('save envelope — v12 → v13 recovery migration (T-111)', () => {
  it('backfills PlayerState.recovery = null on a v12 envelope with no recovery key', () => {
    // Build a REAL v12-shaped state, then strip the key the way a genuinely
    // pre-T-111 save would (it never had the field). NULL IS A STATEMENT OF FACT:
    // no save that exists can carry a recovery, because until T-111 none could
    // exist. The migration must re-add it before schema validation, else the
    // strict schema (recovery is non-optional) rejects the save outright.
    const state = drive50Days(61);
    delete (state.player as unknown as Record<string, unknown>).recovery;
    const v12 = JSON.stringify({ version: 12, state, seed: 61 });

    const loaded = loadSave(v12); // walks 12→13 (recovery backfill), then validates
    expect(loaded.state.player.recovery).toBeNull();
    expect(loaded.seed).toBe(61);
  });

  it('is idempotent — a v12 state that somehow carries the key keeps it exactly', () => {
    const state = drive50Days(62);
    const live = {
      outcomeId: 'legacy-salvage-derelict',
      poiId: 'poi-1-d4-e2-derelict',
      systemId: 1,
      startedDay: 4,
      dueDay: 5,
    };
    state.player.recovery = live;
    const loaded = loadSave(JSON.stringify({ version: 12, state, seed: 62 }));
    expect(loaded.state.player.recovery).toEqual(live);
  });

  it('round-trips a LIVE open recovery through createSave → loadSave (deep-equal)', () => {
    const state = drive50Days(63);
    state.player.recovery = {
      outcomeId: 'legacy-salvage-derelict',
      poiId: 'poi-3-d12-e5-derelict',
      systemId: 3,
      startedDay: 12,
      dueDay: 18,
    };
    const loaded = loadSave(createSave(state, 63));
    expect(loaded.state.player.recovery).toEqual(state.player.recovery);
    // The WHOLE state survives — the new nested container perturbs nothing else.
    expect(loaded.state).toEqual(state);
  });

  it('strict schema rejects an unknown key inside a recovery', () => {
    // The T-1002 drift law applied to the new container: an unknown nested key
    // fails LOUDLY rather than being silently stripped on load. In particular a
    // cached `valuePoints` — the exact phantom `RecoveryState` refuses to store —
    // cannot sneak onto a save.
    const state = drive50Days(64);
    (state.player.recovery as unknown) = {
      outcomeId: 'legacy-salvage-derelict',
      poiId: 'poi-1-d1-e3-derelict',
      systemId: 1,
      startedDay: 1,
      dueDay: 2,
      valuePoints: 20, // not part of RecoveryState
    };
    expect(() => loadSave(createSave(state, 64))).toThrow(SaveError);
  });

  it('deserializeState performs the SAME backfill (the loader path is separate)', () => {
    // `loadSave` runs migrate → validateGameState and does NOT go through
    // `deserializeState`, so both halves of the backfill are owed. Its own test,
    // not folded into the migration ones above, because it is its own code path.
    const state = drive50Days(65);
    const parsed = JSON.parse(serializeState(state)) as { player: Record<string, unknown> };
    delete parsed.player.recovery;
    const restored = deserializeState(JSON.stringify(parsed));
    expect(restored.player.recovery).toBeNull();
  });

  it('deserializeState leaves a live recovery exactly as it found it', () => {
    const state = drive50Days(66);
    state.player.recovery = {
      outcomeId: 'legacy-contraband-derelict',
      poiId: 'poi-9-d30-e1-derelict',
      systemId: 9,
      startedDay: 30,
      dueDay: 31,
    };
    expect(deserializeState(serializeState(state)).player.recovery).toEqual(state.player.recovery);
  });
});

// ---------------------------------------------------------------------------
// T-112 · The unique-item effect surface adds two OPTIONAL ship fields and owes
// NO migration and NO version bump — the `NpcState.dead?` precedent, restated
// mechanically here rather than asserted in a comment. Both fields are
// absent-means-none/zero, every reader honours that, and `starterShip` is left
// deliberately untouched so a module-free career serializes byte-identically.
// ---------------------------------------------------------------------------
describe('save envelope — the explore-module fields round-trip with no migration (T-112)', () => {
  it('CURRENT_SAVE_VERSION is STILL the current one — a pure addition owes no bump', () => {
    // Moved 14 → 15 by T-145's roster migration, which is an intended bump owed by
    // a real save-shape change — not by this task's pure field addition.
    expect(CURRENT_SAVE_VERSION).toBe(15);
  });

  it('round-trips a fitted module and a bonus tank through createSave → loadSave', () => {
    const state = drive50Days(71);
    state.player.ship.exploreModules = ['module-berth-couch'];
    state.player.ship.bonusMaxFuel = 40;
    const loaded = loadSave(createSave(state, 71));
    expect(loaded.state.player.ship.exploreModules).toEqual(['module-berth-couch']);
    expect(loaded.state.player.ship.bonusMaxFuel).toBe(40);
    // The whole state survives — the two new keys perturb nothing else.
    expect(loaded.state).toEqual(state);
  });

  it('round-trips them through serializeState → deserializeState too', () => {
    const state = drive50Days(72);
    state.player.ship.exploreModules = ['module-tally-slate', 'module-marked-ephemeris'];
    state.player.ship.bonusMaxFuel = 80;
    const restored = deserializeState(serializeState(state));
    expect(restored.player.ship.exploreModules).toEqual([
      'module-tally-slate',
      'module-marked-ephemeris',
    ]);
    // The derived tank folds the bonus in through the loader's syncMaxFuel call.
    expect(restored.player.ship.bonusMaxFuel).toBe(80);
    expect(restored.player.ship.maxFuel).toBe(state.player.ship.maxFuel + 80);
  });

  it('a save written WITHOUT either field loads clean and reads as none', () => {
    // Which is every save that exists: no career could have recovered a module
    // before T-112. No backfill runs, so the keys stay absent — and that is what
    // "absent means none" has to mean for the goldens to stay put.
    const state = drive50Days(73);
    expect(state.player.ship.exploreModules).toBeUndefined();
    const loaded = loadSave(createSave(state, 73));
    expect(loaded.state.player.ship.exploreModules).toBeUndefined();
    expect(loaded.state.player.ship.bonusMaxFuel).toBeUndefined();
    expect(hasExploreModule(loaded.state.player.ship, 'module-berth-couch')).toBe(false);
  });

  it('strict schema still rejects an unknown key inside the ship', () => {
    const state = drive50Days(74);
    (state.player.ship as unknown as Record<string, unknown>).exploreModulez = ['typo'];
    expect(() => loadSave(createSave(state, 74))).toThrow(SaveError);
  });
});
