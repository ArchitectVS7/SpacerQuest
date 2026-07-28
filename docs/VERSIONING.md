# Versioning standard

**Status:** ratified 2026-07-28. Supersedes the version note in `RELEASE-CHECKLIST.md`
§A, which described the Museum-Edition-era `1.0.0-rc1` scheme.

This repo carries **four** independent version numbers. They are independent on purpose —
each answers a different question, and collapsing them would make one of the answers a
lie. This file is the one place that says which is which.

---

## 1. Product version — `0.MINOR.PATCH`

**Answers: how mature is the game?**

- **One source of truth: the root `package.json`.** All five workspace manifests carry
  the identical string; `packages/ui/src/__tests__/version.test.ts` asserts it rather
  than trusting it. Vite compiles it into the bundle as `__SQ_VERSION__`, and the
  cockpit shows it at Settings → Build → Version.
- **The leading zero is load-bearing.** Under semver, `0.y.z` means the public surface
  may change without ceremony — which is the literal truth while the balance model and
  the NPC architecture are being rebuilt. **`1.0.0` is reserved for public release** and
  must not be used before it.
- **Prerelease suffixes live in the git TAG, never in the manifests** — e.g. tag
  `v0.5.0-rc1` against manifests reading `0.5.0`. This is not stylistic: electron-builder
  derives the Windows/macOS binary version from `packages/desktop/package.json`, NSIS
  requires a bare `x.y.z` triple, and `packages/desktop/e2e/packaged.spec.ts` and
  `e2e/shell.spec.ts` both assert `/^\d+\.\d+\.\d+$/`. A suffix in the manifests breaks
  packaging and says nothing the tag does not.
- **Unstamped bundles report `0.0.0-dev`** (`version.ts` `DEV_VERSION`) and must never
  fall back to a plausible-looking release string — a bundle that guessed `1.0.0` would
  impersonate a release in a support ticket.

### When it changes — NOT every commit

**The product version stamps BUILDS PEOPLE RECEIVE, not commits.** A number that moved
with every commit would stop being able to answer the only question it exists for: *"I
hit a bug — which build were you running?"* You cannot say "0.5.0 has that bug" if
`0.5.0` was one commit out of forty.

**Nothing in this repo bumps it automatically, by design.** `scripts/tag-rc.mjs` only
READS the root manifest and derives the tag from it (`v0.5.0-rc1`), refusing outright if
the version is not a clean `x.y.z`. Bumping is a deliberate act, once per release cycle,
as its own commit immediately before tagging.

So the working tree between releases is *"0.5.0 plus commits"*, and the thing that
identifies an exact tree is the **git commit**, not the version field. That division of
labour is the point: the version answers "which release", the SHA answers "which code".

| | bump | example |
| --- | --- | --- |
| **PATCH** `0.5.0 → 0.5.1` | a release with fixes or content inside the current track | a balance re-pin cut for a playtester |
| **MINOR** `0.5.0 → 0.6.0` | a release after a track lands | the N-series reaching NPC parity |
| **MAJOR** `0.x → 1.0.0` | public release, once | not yet |

A worked example from the day this standard was written: **ten commits landed — an
economy bug fix, a combat payout, a port re-pricing, two UI features, an engine
refactor — and the version correctly did not move once**, because no build went to
anyone. It moved exactly once, from `1.0.0` to `0.5.0`, and that was a re-versioning
decision rather than a release.

Under `0.y.z` semver also grants explicit licence for the public surface to change
without ceremony, so none of this needs agonising over while the redesign is in flight.

### Why the current number is `0.5.0`

A judgement call, recorded so it can be argued with. The Rimward redesign is playable
end to end, demo-gated and packaged — so it is well past an 0.1. It is **not** near
release: the balance model is mid-rebuild and the 30-NPC field is eight passes from
player parity (`BALANCE-REDESIGN-WORKLIST.md`, N-series). `0.5.0` says "the shape is
real, the systems are moving." Move it as those tracks land; do not move it to `1.x`
until the game actually ships.

## 2. Save schema version — a plain integer, currently `9`

**Answers: can this build read that save file?**

`CURRENT_SAVE_VERSION` in `packages/engine/src/save.ts`, with a migration per bump in
`schema.ts`. **Deliberately decoupled from the product version**: most product releases
change no persisted shape, and some internal changes migrate state without being worth a
release. Bump it when `GameState`'s persisted shape changes, and add the migration and
its round-trip test in the same commit.

## 3. Rules fingerprint — a content hash, not a number

**Answers: is this measurement still about the game we are shipping?**

Balance artefacts — committed sweeps, and the smoke-test checkpoints under
`docs/balance/smoke/` — are only meaningful against the ruleset that produced them. A
hand-maintained "balance version" would be forgotten exactly when it mattered, so this is
**derived, not declared**: a hash over the files that decide outcomes (`packages/content/src`
plus the engine's rule modules). Change a tribute constant or a resolver and the
fingerprint moves on its own.

The rule for consumers: **a stale fingerprint fails loudly, it is never silently used.**
A smoke test run against checkpoints from a different ruleset is not a weak test, it is a
misleading one. (Precedent for the technique: the report fingerprints in
`packages/sim/src/__tests__/campaign-degraded.test.ts`.)

## 4. Content/task IDs — `T-####`, `R#`, `N#`, `F#`

**Answers: which piece of work is this?**

Not versions, and they do not sort against each other. `T-####` are engineering tasks,
`R#`/`N#` are steps in `BALANCE-REDESIGN-WORKLIST.md`, `F#` are protocol findings. They
appear in code comments so a rule can be traced to the decision that produced it; keep
using them that way.

---

## The rule that matters most

**Never bump a version to make something pass.** Each of these numbers is an assertion
about the world: how mature the game is, what a save file contains, which ruleset a
measurement describes. Moving one to silence a failure converts a true statement into a
false one, and the failure it was hiding surfaces later somewhere less convenient.
