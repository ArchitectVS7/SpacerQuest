import { z } from 'zod';
import { FLAWS } from '@spacerquest/content';
import { GameState, ShipState } from './types.js';
import { validateGameState } from './schema.js';
import { emptyDeedRegistry, rankForDeedCount } from './deeds.js';
import { computePlayerTier } from './tier.js';
import { seedNpcShip } from './npc.js';
import { JOB_POOL_MAX_CLAIMS } from './economy.js';

// T-1401 · The v5→v6 WireEntry.kind migration's ONE legitimate, retro-only use of
// the flaw-detail suffix heuristic. A v5 save's WireEntry events predate the typed
// `kind` field, so their provenance can only be RE-DERIVED — and the only signal a
// historical line carries is exactly what the old UI read: a line ending with a
// content `FLAWS[*].detail` is a flaw override. This reproduces the pre-change UI
// classification (format.ts `isFlawOverrideMessage`) so a loaded v5 save renders
// identically; every fresh v6 emission is stamped at its engine site instead
// (day.ts et al.). Never use this heuristic anywhere but this migration.
const FLAW_DETAIL_SUFFIXES: readonly string[] = Object.values(FLAWS).map((f) => f.detail);

function reDeriveWireKind(message: string): 'flaw-override' | 'npc' {
  return FLAW_DETAIL_SUFFIXES.some((detail) => message.endsWith(detail)) ? 'flaw-override' : 'npc';
}

// Base envelope that Steam Cloud and localStorage will read.
//
// T-1002: the RNG `seed` now rides the envelope (v2+). TECH-STACK's "reproducible
// bug reports" non-negotiable requires a `.sav` blob ALONE to reproduce a run;
// the seed used to be UI-only (localStorage `sq.save.seed`), so a save handed to
// a developer could not be replayed. It lives on the ENVELOPE, not in GameState:
// `GameState.rngState` mutates on every roll, so the original seed is
// reproducibility metadata the versioned+migrated envelope is the right home for
// — this keeps the engine's GameState pure and its JSON round-trip unaffected.
export const SaveEnvelopeSchema = z.object({
  version: z.number(),
  state: z.unknown(), // The raw state, validated by version-specific schemas during migration
  seed: z.number().optional(), // v2+. Absent in v1 envelopes (loads as seed: null).
});

export type SaveEnvelope = z.infer<typeof SaveEnvelopeSchema>;

export type MigrationFn = (oldState: unknown) => unknown;

/**
 * Explicit STATE migration registry (v1 -> v2 -> ...). A key `n` upgrades the
 * migrated STATE from version `n` to version `n + 1`.
 *
 * T-1002 bumped {@link CURRENT_SAVE_VERSION} to 2. The v1->v2 change is
 * ENVELOPE-level (the new `seed` field), NOT a GameState shape change, so the
 * state migration is the IDENTITY — the state that came out of a v1 envelope is
 * already a valid v2 state. {@link loadSave} reports a seedless v1 envelope as
 * `seed: null` (absence stays absence — no numeric backfill, which would collide
 * with a legitimate explicit seed). This entry is honest, not a stub: it records
 * that v1 and v2 states are structurally identical.
 *
 * T-1304 bumped {@link CURRENT_SAVE_VERSION} to 3. The v2->v3 change IS a
 * GameState shape change: `PlayerState.loan` (the Penny Wise loan ledger, or
 * null) is a new persistent field. The v2->v3 migration backfills `loan: null`
 * on the player so a pre-lending save validates against the v3 schema (whose
 * `loan` key is non-optional). This is the explicit versioned migration the
 * T-1002 registry was built for.
 *
 * T-1306 bumped {@link CURRENT_SAVE_VERSION} to 4. The v3->v4 change IS a
 * GameState shape change: `PlayerState.crew` (the hired-crew dice-progression
 * source, T-1306) is a new persistent field. The v3->v4 migration backfills
 * `crew: []` on the player so a pre-crew save validates against the v4 schema
 * (whose `crew` key is non-optional). `DawnHand.rerollsRemaining` is OPTIONAL, so
 * it needs no migration step (a v3 hand simply banks no charge until it re-rolls
 * at the next dawn).
 *
 * T-1307 bumped {@link CURRENT_SAVE_VERSION} to 5. The v4->v5 change IS a
 * GameState shape change: `PlayerState.ports` (owned port stakes — purchasable
 * property, PRD §9) is a new persistent field. The v4->v5 migration backfills
 * `ports: []` on the player so a pre-ports save validates against the v5 schema
 * (whose `ports` key is non-optional).
 *
 * T-1401 bumped {@link CURRENT_SAVE_VERSION} to 6. The v5->v6 change IS a
 * GameState shape change: every `WireEntry` event in `eventLog` now carries a
 * required `kind` discriminator (types.ts WireEntryKind). A v5 save's WireEntry
 * events have no `kind`, so the v5->v6 migration walks `eventLog` and backfills it
 * by re-deriving the pre-change UI classification (flaw-detail suffix ⇒
 * 'flaw-override', else 'npc') — see {@link reDeriveWireKind} — so a loaded v5
 * save validates against the v6 schema (whose WireEntry `kind` is required) AND
 * renders exactly as it did before. Non-WireEntry events are untouched.
 *
 * T-1503 bumped {@link CURRENT_SAVE_VERSION} to 7. The v6->v7 change IS a
 * GameState shape change: `PlayerState.reputation` (the four-faction standing —
 * a NESTED container, `{ league, dragons, confederation, rebels }`) is a new
 * persistent field. The v6->v7 migration backfills the whole neutral container
 * (and each faction key) on the player so a pre-reputation save validates against
 * the v7 schema (whose `reputation` key is a non-optional, strict four-key shape).
 * This is exactly the nested-field migration the T-1002 drift-protection (which
 * named `player.reputation` by name) was built to make safe.
 *
 * T-1603b bumped {@link CURRENT_SAVE_VERSION} to 8, and the v7->v8 change is a
 * DIFFERENT KIND from all six above: it adds NO field. It repairs the MEANING of
 * two fields already present, because the canonical `RENOWN_DEED_THRESHOLDS`
 * rescale (content deeds.ts) changed what a stored `registry.renownRank` — a
 * DERIVED value that happens to be persisted — is supposed to say for a given
 * deed count, and `player.tier` is derived from that rank in turn. Recorded here
 * as precedent: a save migration is owed whenever the RULE behind a persisted
 * derived value moves, not only when a key appears or disappears. The migration's
 * own comment carries the reasoning and why the `deserializeState` recompute was
 * not sufficient.
 *
 * T-1703 bumped {@link CURRENT_SAVE_VERSION} to 9. The v8->v9 change IS a
 * GameState shape change, and a ROOT-level one — the first since the original
 * schema: `GameState.edition` (types.ts `Edition`, the demo gate's one persisted
 * scalar) is a new required field. The v8->v9 migration backfills `edition:
 * 'full'`, which is a STATEMENT OF FACT rather than a default: every save that
 * exists was written before a demo build existed, so every one of them is a
 * full-game career. Getting this wrong in the other direction would be the
 * serious failure — a save wrongly marked 'demo' would lose a real player their
 * ports, their crew and their capstone rank.
 *
 * N1 bumped {@link CURRENT_SAVE_VERSION} to 10, and the v9->v10 change is a
 * GameState shape change of a kind none of the nine above were: it MOVES a field
 * rather than adding one. Every `NpcState` gains a required `ship` (the real
 * {@link ShipState} the captain owns, replacing the tier-derived phantom `npc.ts`
 * used to synthesize per action) and LOSES its top-level `fuel`, whose value
 * becomes `ship.fuel`. Because the roster is 30 records and `NpcStateSchema` is
 * `.strict()`, a half-done migration fails loudly: leaving `fuel` behind is
 * rejected as an unknown key, and omitting `ship` is rejected as a missing one.
 * The mapping is `npc.ts` `seedNpcShip` — the SAME function `deserializeState`
 * and (via `npcShipForProfile`) `createInitialState` use, so a migrated roster and
 * a freshly created one land on identical fits.
 *
 * N2 re-seeded that mapping (the component ramp and the hull) and added NO entry
 * here, deliberately. NOTHING IN THE SAVE'S SHAPE MOVED — only the values
 * `npcShipForProfile` returns — and an existing v10 roster must NOT be re-seeded:
 * post-N1 an NPC's ship is state the captain OWNS, and post-N2 they buy it, so a
 * migration could not distinguish an issued fit from a purchased one and would
 * confiscate the difference. The full reasoning is at `npcShipForProfile`'s
 * definition site. Note the consequence for THIS entry, which is correct and
 * intended: because it calls `seedNpcShip` rather than restating a table, a v9
 * save migrating today receives the CURRENT ramp — the only honest answer for a
 * roster that never carried ships at all.
 *
 * N10 bumped {@link CURRENT_SAVE_VERSION} to 11, and the v10->v11 change is the
 * SECOND field MOVE here: `market.npcClaims` (one scalar, claims against the
 * player's system, reset every dawn) becomes `market.jobPoolClaims` (a sparse
 * `systemId -> claims` record that persists and regenerates). The old value is
 * credited to `player.currentSystemId`, which is a statement of fact — the
 * co-located snipe was the only writer and that dawn's board the only reader, so
 * the player's system is the only system the scalar could have been about. Note
 * the contrast with the N2 entry directly above: N2 changed VALUES and correctly
 * added nothing here; N10 changes the SHAPE, which is what obliges an entry.
 *
 * N11 bumped {@link CURRENT_SAVE_VERSION} to 12, and the v11->v12 change is an
 * ADDITION, not a move: every `NpcState` gains a `registry` (the captain's own deed
 * ledger and Renown rank). The migration walks the roster and backfills an EMPTY one
 * through `deeds.ts` `emptyDeedRegistry` — the SAME function `createInitialState` and
 * `deserializeState` call, per the MIGRATIONS[9] precedent that a migration CALLS a
 * rule and never restates one. EMPTY IS A STATEMENT OF FACT, not a convenience
 * default: no save that exists can contain an NPC deed, because until N11 no NPC
 * could earn one.
 *
 * AND IT MUST NOT BE A SYNTHETIC RANK. The obvious "helpful" version of this entry
 * would seed each captain a rank from their profile tier so the field looks lived-in
 * on load. N11's ruling forbids exactly that: the fast-forward allowance applies to
 * the SOURCE (coarse verbs standing in for played days), never to unearned rank, and
 * a tier-5 captain holding a rank they never earned is the "constant recomputed from
 * profile" phantom N1 existed to kill. So a migrated roster loads at zero deeds and
 * LIEUTENANT, and earns from there.
 *
 * T-111 bumped {@link CURRENT_SAVE_VERSION} to 13. The v12->v13 change IS a
 * GameState shape change, and an ADDITIVE one-key backfill of exactly the shape
 * {@link MIGRATIONS}[2] (`loan` -> null) and [3] (`crew` -> []) already are:
 * `PlayerState.recovery` (the open multi-day salvage op — types.ts
 * `RecoveryState`, docs/EXPLORE_REDESIGN.md §3) is a new persistent field. The
 * v12->v13 migration backfills `recovery: null` on the player so a pre-recovery
 * save validates against the v13 schema (whose `recovery` key is non-optional).
 *
 * NULL IS A STATEMENT OF FACT, NOT A CONVENIENCE DEFAULT — the same phrase the
 * v8->v9 `edition` entry uses, for the same reason: no save that exists can
 * contain a recovery, because until T-111 no recovery could exist.
 *
 * AND ON "A MIGRATION CALLS A RULE RATHER THAN RESTATING ONE" (the MIGRATIONS[9]
 * / MIGRATIONS[11] precedent): here the backfilled value is a literal `null`, so
 * THERE IS NO RULE TO CALL — stated explicitly rather than left for a reviewer to
 * wonder about. The moment this backfill becomes anything other than `null`, the
 * `emptyDeedRegistry` pattern applies without exception: call the engine's own
 * constructor, never an inline literal.
 *
 * SEAM: the migration machinery is also exercised WITHOUT relying on this
 * production entry. {@link migrate} takes an injectable `registry` +
 * `targetVersion`, so a test can drive a dummy
 * `{ 1: (s) => ({ ...s, migrated: true }) }` at targetVersion 2 to prove the
 * sequential upgrade loop works independently of production MIGRATIONS.
 */
const NEUTRAL_REPUTATION = { league: 0, dragons: 0, confederation: 0, rebels: 0 } as const;

export const MIGRATIONS: Record<number, MigrationFn> = {
  1: (v1State) => v1State,
  // v2->v3: T-1304 added PlayerState.loan. A v2 save has no `loan` key, so
  // backfill it to null (no active loan) before schema validation.
  2: (v2State) => {
    const s = v2State as { player?: Record<string, unknown> };
    return {
      ...(v2State as object),
      player: { ...(s.player ?? {}), loan: (s.player as { loan?: unknown })?.loan ?? null },
    };
  },
  // v3->v4: T-1306 added PlayerState.crew. A v3 save has no `crew` key, so backfill
  // it to an empty roster (no crew) before schema validation.
  3: (v3State) => {
    const s = v3State as { player?: Record<string, unknown> };
    return {
      ...(v3State as object),
      player: { ...(s.player ?? {}), crew: (s.player as { crew?: unknown })?.crew ?? [] },
    };
  },
  // v4->v5: T-1307 added PlayerState.ports. A v4 save has no `ports` key, so
  // backfill it to an empty roster (no owned ports) before schema validation.
  4: (v4State) => {
    const s = v4State as { player?: Record<string, unknown> };
    return {
      ...(v4State as object),
      player: { ...(s.player ?? {}), ports: (s.player as { ports?: unknown })?.ports ?? [] },
    };
  },
  // v5->v6: T-1401 made WireEntry.kind required. A v5 save's WireEntry events have
  // no `kind`, so backfill each by re-deriving the pre-change UI classification
  // (flaw-detail suffix ⇒ 'flaw-override', else 'npc') — the ONE retro-only use of
  // that heuristic (reDeriveWireKind). A WireEntry that somehow already carries a
  // `kind` is left as-is; non-WireEntry events pass through untouched.
  5: (v5State) => {
    const s = v5State as { eventLog?: unknown };
    if (!Array.isArray(s.eventLog)) return v5State;
    const log = s.eventLog as unknown[];
    const eventLog: unknown[] = log.map((event) => {
      const e = event as { type?: unknown; message?: unknown; kind?: unknown };
      if (e.type !== 'WireEntry' || e.kind !== undefined) return event;
      return { ...e, kind: reDeriveWireKind(typeof e.message === 'string' ? e.message : '') };
    });
    return { ...(v5State as object), eventLog };
  },
  // v6->v7: T-1503 added PlayerState.reputation (a nested four-faction container).
  // A v6 save has no `reputation` key, so backfill the whole neutral container
  // (merging any partial one already present, faction-key by faction-key) before
  // schema validation. This is the T-1002 nested-field migration by name.
  6: (v6State) => {
    const s = v6State as { player?: Record<string, unknown> };
    const existing = (s.player as { reputation?: Record<string, unknown> })?.reputation ?? {};
    return {
      ...(v6State as object),
      player: {
        ...(s.player ?? {}),
        reputation: { ...NEUTRAL_REPUTATION, ...existing },
      },
    };
  },
  // v7->v8: T-1603b RE-DERIVES `player.registry.renownRank` (and the
  // `player.tier` band that hangs off it). THE FIRST MIGRATION HERE THAT ADDS NO
  // FIELD — it repairs the MEANING of two it finds, which is why it exists at all.
  //
  // WHY IT IS NEEDED. T-1603b set the canonical `RENOWN_DEED_THRESHOLDS`
  // (content deeds.ts): CAPTAIN 2 -> 5, GIGA_HERO 15 -> 31, CONQUEROR 30 -> 38,
  // and so on. `renownRank` is a DERIVED value stored on the save, so every
  // existing save now carries a rank its deed count no longer buys — a v7 save
  // holding 15 deeds says GIGA_HERO where the canonical table says ADMIRAL.
  //
  // WHY IT COULD NOT BE LEFT TO THE LOADER. `deserializeState` (state.ts) already
  // recomputes the rank, but `loadSave` does NOT go through it — it runs
  // `migrate` -> `validateGameState`, and that is the path the shipped UI store
  // takes. Without this entry a real player's save would keep the stale rank, and
  // the next deed earned would drive `evaluateDeeds` from GIGA_HERO to ADMIRAL and
  // emit that DEMOTION as a `RenownRankUp` with a promotion citation on the wire.
  //
  // WHAT IT DOES. Recomputes the rank from `registry.earned.length` — the same
  // one-line rule `deserializeState` and `evaluateDeeds` use, imported from
  // `deeds.ts` so there is no second copy of the ladder — and then recomputes
  // `player.tier` from the healed rank + the carried ship through the engine's own
  // `computePlayerTier`, because the schema requires `tier` to be a present 1-5
  // literal and a stale band would send the encounter matchmaker after hunters the
  // captain no longer ranks with. A save with no readable registry or ship is
  // passed through untouched for the schema to reject or default: a migration must
  // never be the thing that throws.
  //
  // IT IS IDEMPOTENT AND FORWARD-SAFE: recomputing an already-correct rank and
  // tier is a no-op, so re-running it costs nothing and any FUTURE threshold
  // rescale needs no new migration entry — only a version bump routed through this
  // same step.
  7: (v7State) => {
    const s = v7State as { player?: Record<string, unknown> };
    const player = s.player;
    if (!player || typeof player !== 'object') return v7State;
    const registry = (player as { registry?: { earned?: unknown } }).registry;
    if (!registry || !Array.isArray(registry.earned)) return v7State;
    const renownRank = rankForDeedCount(registry.earned.length);
    const ship = (player as { ship?: ShipState }).ship;
    const healed: Record<string, unknown> = {
      ...player,
      registry: { ...registry, renownRank },
    };
    if (ship && typeof ship === 'object') healed.tier = computePlayerTier(renownRank, ship);
    return { ...(v7State as object), player: healed };
  },
  // v8->v9: T-1703 added the root-level `GameState.edition`. A v8 save has no
  // `edition` key, so backfill 'full'. See the registry header for why that is a
  // fact and not a default. An `edition` that is somehow already present is left
  // alone (idempotent, and forward-safe for a future promoted save re-migrating).
  8: (v8State) => {
    const s = v8State as { edition?: unknown };
    return { ...(v8State as object), edition: s.edition ?? 'full' };
  },
  // v9->v10: N1 gave every NPC a real `ship` and moved their tank onto it. Walk
  // the roster, seed each captain's ship from their profile tier through the
  // engine's own `seedNpcShip`, pour the saved `fuel` into it, and DROP the old
  // top-level key (strict schema — an orphan `fuel` is an unknown key and would
  // fail validation). Idempotent: a record that already carries a `ship` is left
  // alone apart from shedding a stray `fuel`. A state with no readable roster is
  // passed through untouched for the schema to reject — a migration must never be
  // the thing that throws.
  9: (v9State) => {
    const s = v9State as { npcs?: unknown };
    if (!Array.isArray(s.npcs)) return v9State;
    const npcs = (s.npcs as unknown[]).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const { fuel, ...rest } = entry as { fuel?: unknown; ship?: unknown; profileId?: unknown };
      const profileId = typeof rest.profileId === 'string' ? rest.profileId : '';
      return { ...rest, ship: rest.ship ?? seedNpcShip(profileId, fuel) };
    });
    return { ...(v9State as object), npcs };
  },
  // v10->v11: N10 made the job pool SHARED and PER-SYSTEM. `market.npcClaims` (a
  // single scalar, claims against the player's system only, reset every dawn)
  // becomes `market.jobPoolClaims` — a sparse `systemId -> claims` record. This is
  // a MOVE, the second one in this registry after v9->v10, so the same strict-schema
  // discipline applies: leaving `npcClaims` behind is rejected as an unknown key and
  // omitting `jobPoolClaims` as a missing one, and a half-done migration therefore
  // fails loudly instead of quietly.
  //
  // WHERE THE OLD VALUE GOES, and why that is a fact rather than a guess: the old
  // counter could only ever describe the system the player was standing in — it was
  // incremented solely by the co-located snipe and consumed solely by that dawn's
  // board — so it is credited to `player.currentSystemId` and nowhere else. Clamped
  // to `JOB_POOL_MAX_CLAIMS` through the engine's own constant rather than a literal,
  // per the MIGRATIONS[9] precedent: a migration CALLS a rule, it never restates one
  // (this is what keeps `save.ts` out of `rulesFingerprint` honest — see
  // `ENGINE_NON_RULE_SOURCES` in the sim's rules-fingerprint module).
  //
  // Idempotent: a state already carrying `jobPoolClaims` keeps it and only sheds a
  // stray `npcClaims`. A state with no readable market or player is passed through
  // untouched for the schema to reject — a migration must never be the thing that
  // throws.
  10: (v10State) => {
    const s = v10State as {
      market?: Record<string, unknown>;
      player?: { currentSystemId?: unknown };
    };
    const market = s.market;
    if (!market || typeof market !== 'object') return v10State;
    const { npcClaims, ...rest } = market as { npcClaims?: unknown };
    const existing = (rest as { jobPoolClaims?: unknown }).jobPoolClaims;
    if (existing && typeof existing === 'object') {
      return { ...(v10State as object), market: rest };
    }
    const jobPoolClaims: Record<string, number> = {};
    const systemId = s.player?.currentSystemId;
    if (typeof npcClaims === 'number' && npcClaims > 0 && typeof systemId === 'number') {
      jobPoolClaims[String(systemId)] = Math.min(JOB_POOL_MAX_CLAIMS, npcClaims);
    }
    return { ...(v10State as object), market: { ...rest, jobPoolClaims } };
  },
  // v11->v12: N11 gave every captain a deed registry. Walk the roster and backfill an
  // empty one through the engine's own `emptyDeedRegistry` — never an inline literal,
  // and never a rank derived from the profile (see the registry header above for both
  // reasons). Idempotent: a record that already carries a registry keeps it exactly,
  // earned deeds and all. A state with no readable roster is passed through untouched
  // for the schema to reject — a migration must never be the thing that throws.
  11: (v11State) => {
    const s = v11State as { npcs?: unknown };
    if (!Array.isArray(s.npcs)) return v11State;
    const npcs = (s.npcs as unknown[]).map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const record = entry as { registry?: unknown };
      return { ...record, registry: record.registry ?? emptyDeedRegistry() };
    });
    return { ...(v11State as object), npcs };
  },
  // v12->v13: T-111 added PlayerState.recovery (the open multi-day salvage op). A
  // v12 save has no `recovery` key, so backfill it to null before schema
  // validation — a statement of fact, not a default (see the registry header).
  // Idempotent: a state that already carries the key keeps it exactly.
  12: (v12State) => {
    const s = v12State as { player?: Record<string, unknown> };
    return {
      ...(v12State as object),
      player: {
        ...(s.player ?? {}),
        recovery: (s.player as { recovery?: unknown })?.recovery ?? null,
      },
    };
  },
};

export const CURRENT_SAVE_VERSION = 13;

export type SaveErrorCode =
  'corrupt-json' | 'bad-envelope' | 'no-migration' | 'future-version' | 'invalid-state';

/**
 * Typed error for every way a save can fail to load. `code` lets callers (the
 * UI later) branch without string-matching messages; `cause` carries the
 * underlying error (a {@link z.ZodError} for `bad-envelope` / `invalid-state`,
 * the raw parse error for `corrupt-json`).
 */
export class SaveError extends Error {
  readonly code: SaveErrorCode;

  constructor(code: SaveErrorCode, message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'SaveError';
    this.code = code;
  }
}

export interface MigrateOptions {
  /** Registry to migrate through. Defaults to the module {@link MIGRATIONS}. */
  registry?: Record<number, MigrationFn>;
  /** Version to migrate up to. Defaults to {@link CURRENT_SAVE_VERSION}. */
  targetVersion?: number;
}

/**
 * Pure, injectable migration loop. Walks `envelope.version` up to
 * `targetVersion`, applying one registered {@link MigrationFn} per step.
 *
 * - a version ABOVE the target (a save from a newer build) throws
 *   {@link SaveError} `future-version`;
 * - a gap with no registered migration throws `no-migration`.
 *
 * Returns the migrated (but not yet GameState-validated) state.
 */
export function migrate(envelope: SaveEnvelope, options: MigrateOptions = {}): unknown {
  const registry = options.registry ?? MIGRATIONS;
  const targetVersion = options.targetVersion ?? CURRENT_SAVE_VERSION;

  let version = envelope.version;
  let state = envelope.state;

  if (version > targetVersion) {
    throw new SaveError(
      'future-version',
      `Save version ${version} is newer than the supported version ${targetVersion}`,
    );
  }

  while (version < targetVersion) {
    const step = registry[version];
    if (!step) {
      throw new SaveError('no-migration', `No migration registered for version ${version}`);
    }
    state = step(state);
    version += 1;
  }

  return state;
}

/** A loaded save: the validated GameState plus the seed that reproduces it. */
export interface LoadedSave {
  state: GameState;
  /** The RNG seed the run started from, or `null` for a pre-v2 (seedless) save
   *  whose seed was never recorded — such saves cannot be reproduced from the
   *  blob alone; the store may substitute a legacy fallback. `null` (not a
   *  numeric sentinel) so an explicit seed of 0 stays distinguishable. */
  seed: number | null;
}

/**
 * Validates and migrates a raw JSON save string into a {@link LoadedSave} —
 * the validated {@link GameState} plus the reproduction `seed`.
 *
 * Pipeline: JSON.parse (→ `corrupt-json`) → envelope safeParse
 * (→ `bad-envelope`) → {@link migrate} (→ `future-version` / `no-migration`) →
 * {@link validateGameState} (→ `invalid-state`, carrying the {@link z.ZodError}
 * as `cause`).
 *
 * COMPOSITION: {@link createSave} embeds the raw state object inside the
 * envelope, so `JSON.stringify` serializes it identically to `serializeState`.
 * On load, `JSON.parse` therefore yields exactly the serialized shape
 * `validateGameState` expects, and the returned GameState is deep-equal to the
 * one passed to `createSave` — the round-trip is exact. The `seed` rides
 * alongside (v2+) and round-trips byte-identically.
 */
export function loadSave(jsonString: string): LoadedSave {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonString);
  } catch (cause) {
    throw new SaveError('corrupt-json', 'Save data is not valid JSON', cause);
  }

  const parsed = SaveEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new SaveError(
      'bad-envelope',
      'Save data is missing a valid { version, state } envelope',
      parsed.error,
    );
  }

  const migratedState = migrate(parsed.data);

  let state: GameState;
  try {
    state = validateGameState(migratedState);
  } catch (cause) {
    throw new SaveError('invalid-state', 'Migrated save state failed GameState validation', cause);
  }

  // v1 envelopes have no `seed` — report the absence as null (never a numeric
  // sentinel, which would collide with a legitimate explicit seed).
  const seed = parsed.data.seed ?? null;
  return { state, seed };
}

export function createSave(state: GameState, seed: number): string {
  const envelope: SaveEnvelope = {
    version: CURRENT_SAVE_VERSION,
    state,
    seed,
  };
  return JSON.stringify(envelope);
}
