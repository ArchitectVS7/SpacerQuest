# Save Format & Persistence — standing rulings

**Status:** Standing decisions for the Rimward codebase, harvested 2026-08-02 from the
0.5.2/0.5.3 task log. Companion to `docs/ENGINEERING-POLICY.md` standing constraint 3
("any change that adds a `GameState` field ships a save migration and a round-trip test
*in the same commit*") and to `docs/VERSIONING.md` §3, which owns `CURRENT_SAVE_VERSION`
as one of the repo's four independent version numbers.

The recurring question these rulings answer is **"does this owe a `CURRENT_SAVE_VERSION`
bump?"** — because the wrong answer in either direction is expensive: a missed bump is a
corrupt load, and an unnecessary one is a migration, a round-trip test and a fixture
regeneration bought for nothing.

---

## 1. When a bump IS owed

**SF-1 — Adding a persisted field means the FULL save package, in one task.** (T-111) The
package is: a `.strict()` schema entry, the `CURRENT_SAVE_VERSION` bump, a `MIGRATIONS[n]`
backfill for old saves, **and** the same backfill inside `deserializeState`. Both paths are
mandatory, and the strict schema is why — it makes a missed backfill a hard load failure,
not a silent default. T-111's instance: `PlayerState.recovery`, v12 → v13, with
`RecoveryStateSchema` and `MIGRATIONS[12]` backfilling `recovery: null`.

**SF-2 — A track takes ONE bump, claimed by one named task.** (T-102, T-144) The 0.5.2
Explore/Hangout track took exactly v12 → v13, claimed by T-111, with Explore (M2) landing
before Hangout (M3) so the second could not invalidate the first's migration. M4e likewise
took exactly v14 → v15, claimed by T-145, carrying `player.liarsDiceBeaten`,
`player.liarsDiceGamesPlayed` and the per-opponent purse balances together. **The reason is
concurrency, not tidiness:** siblings that only read and increment those fields (T-146,
T-147) can then run in parallel with no race on `CURRENT_SAVE_VERSION`. Recorded as
blockers, not advice, in `docs/LIARS-DICE-PROGRESSION_SPEC.md` §5.6 Rulings A–D.

**SF-3 — New module flags ride the existing schema as OPTIONAL booleans with `??= false`
backfills.** (T-102) Mirroring `schema.ts`'s and `state.ts`'s existing pattern. If a
*non-optional* field is ever needed, that is a second save-shape change owing its own bump
— escalate; never widen an already-claimed migration.

---

## 2. When a bump is NOT owed

**SF-4 — Optional, absent-means-none/zero fields owe no bump, and deliberately get no
default and no backfill.** (T-112, the `NpcState.dead?` precedent) `exploreModules` and
`bonusMaxFuel` get no `starterShip` default and no `deserializeState` backfill, with the
reason stated in a comment at `packages/engine/src/state.ts`. Doing *neither* is what keeps
`serializeState` byte-identical for every career without the field, which is in turn what
leaves the four `day-loop-golden.ts` hashes, both `replay-golden.ts` pins and
`campaign-degraded`'s `PINNED_FINGERPRINTS` unmoved.

**SF-5 — Adding content rows is not save surface.** (T-115) `EXPLORE_OUTCOMES` went to 100
rows with no migration and no bump.

**SF-6 — Deleting a content id is not save surface, PROVIDED the stale id degrades
cleanly.** (T-114, T-117) A live save can hold a deleted id in `player.recovery.outcomeId`;
the retirement is safe only because the stored id resolves to
`RecoveryAbandoned{reason:'unknown-outcome'}`, clears the slot and mutates nothing. That
degrade path is proved by a load-path test *before* the delete. Throwing, and fabricating a
payout, were both rejected. Without that proof it is a migration, not a content edit.

**SF-7 — Reach flags and content constants that never enter `serializeState` owe no bump.**
(T-101, T-131) Taking `hasHangout` from 1-of-28 ports to 14-of-28 moved goldens, sim
policies and `legalActions` — not the save format. `apCost` is a content constant, not
per-save state, so the T-131 band rework moved no version either.

**SF-8 — Client-presentation state is not `GameState`.** (T-132, T-141) `socialOutcome`
lives in the UI store and is cleared alongside `dareOutcome` on selection, travel, new day
and a fresh Dare; the playtest-telemetry toggle persists through
`packages/ui/src/storage.ts`'s `KeyValueStore` and never the save file. A presentation slot
never justifies a save version bump, and telemetry state sits deliberately outside the save
contract.

**SF-9 — Sim-policy-only fixes move no save shape — and the absence of a migration is
stated as a CLAIM, not left as an omission.** (T-150)

**SF-11 — An ENGINE RULE change that moves `rulesFingerprint` but changes no persisted shape
owes no migration either — and says so.** (T-160) T-160 shipped
`minOpeningQuantity(own) = own + 1` in `packages/engine/src/liarsDiceRules.ts` and
`CURRENT_SAVE_VERSION` stayed at 15. This extends SF-9 from sim-policy-only fixes to engine
legality rules: a moved rules fingerprint is evidence about *behaviour*, never about *shape*,
and the two are decided separately. The claim is written down, because "no bump" and "nobody
thought about the bump" look identical in a diff.

---

## 3. Schema drift protection

**SF-10 — STATE schemas are `.strict()`; EVENT schemas are not, so events rely on
compile-time guards.** (T-134) `GameEventSchema`'s variants are deliberately non-strict,
which makes the `AssertEventKeys` guards in `packages/engine/src/schema.ts` the *only*
drift protection an event variant has. Every new `GameEvent` variant owes one.

**SF-12 — A helper that returns a "new" persisted record returns a COMPLETE copy of its
input.** (T-182, closing F-156-1) `spendDie` (`packages/engine/src/dice.ts`) spreads the input
`DawnHand` and overrides, never a field-by-field `{ dice, spent }` literal — which is precisely
how `rerollsRemaining` came to be dropped the moment a later task added it. Two details are
load-bearing and are contracted at the definition site: `rerollsRemaining` is carried across
**preserving TRUE ABSENCE** rather than coerced to `0`, per SF-4's absent-means-none rule, and it
is spread **LAST** so key order matches `rollDawnHand` and the serialized-hand golden hashes do
not move. Any future field added to `DawnHand` inherits this contract for free; reintroducing the
explicit literal reintroduces F-156-1.
