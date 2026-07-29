# Versioning standard

**Status:** ratified 2026-07-28. Supersedes the version note in `RELEASE-CHECKLIST.md`
§A, which described the Museum-Edition-era `1.0.0-rc1` scheme.

This repo carries **four** independent version numbers. They are independent on purpose —
each answers a different question, and collapsing them would make one of the answers a
lie. This file is the one place that says which is which.

---

## 1. Product version — `0.MINOR.PATCH`

**Answers: how mature is the game?**

- **One source of truth: the root `package.json`.** Exactly one other manifest repeats
  it — `packages/desktop`, because electron-builder needs it for the installer — and
  `packages/ui/src/__tests__/version.test.ts` asserts the agreement rather than trusting
  it. The four library workspaces carry no version at all. Vite compiles it into the bundle as `__SQ_VERSION__`, and the
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
| **MINOR** `0.5.0 → 0.6.0` | a release after a whole TRACK lands | all of N0–N8 done, i.e. NPCs at player parity |
| **MAJOR** `0.x → 1.0.0` | public release, once | not yet |

**"Track" means a named series of related steps in the balance worklists — `BALANCE-REDESIGN-WORKLIST.md` (R-series) and `NPC_REDESIGN.md` (N-series),** and
"lands" means the whole series is finished — not one step of it. There are two today: the
**R-series** (the balance redesign: R0a, R0b, R1, R2, R2c, R2d, R2.5, R4, R5…) and the
**N-series** (N0–N8, bringing the 30 NPCs to player parity). Finishing N1 alone does not
move the version; finishing N0 through N8 does.

A worked example from the day this standard was written: **ten commits landed — an
economy bug fix, a combat payout, a port re-pricing, two UI features, an engine
refactor — and the version correctly did not move once**, because no build went to
anyone. It moved exactly once, from `1.0.0` to `0.5.0`, and that was a re-versioning
decision rather than a release.

Under `0.y.z` semver also grants explicit licence for the public surface to change
without ceremony, so none of this needs agonising over while the redesign is in flight.

### Changing it — one command

**Bump it with one command — do not hand-edit:**

```sh
npm version <x.y.z> --no-git-tag-version \
  --workspace=@spacerquest/desktop --include-workspace-root
```

That writes the two manifests that have readers (root and `packages/desktop`) and
regenerates `package-lock.json`, and it leaves the four unversioned library workspaces
alone rather than re-growing versions in them. `--no-git-tag-version` is deliberate: the
tag is the STAGE marker and is cut separately, by the ceremony, not as a side effect of a
manifest edit.

**The lockfile is GENERATED, never authored.** It records the version in three places and
you type it into none of them — npm derives all three from the manifests. Verified by
corrupting it to `6.6.6` and watching `npm install --package-lock-only` restore it
untouched by hand. It is listed here only because it must be regenerated and committed;
skipping that is what left it reading `1.0.0` through a bump, which `version.test.ts` now
catches.

**No action needed** for the bundle: Vite reads the root manifest at config time and
substitutes `__SQ_VERSION__`, so a rebuild picks it up. `scripts/tag-rc.mjs` likewise
derives its tag from the root and needs no edit.

### Prerelease stage — and we are at ALPHA

`0.5.0` says how mature the code is. It does **not** say how validated it is. That is the
stage, it lives in the git tag, and it must not be inflated.

| stage | tag | means | entry criteria |
| --- | --- | --- | --- |
| **pre-alpha** | *(no tag)* | nobody has played this build end to end | — **we are here** |
| **alpha** | `v0.5.0-alpha.N` | internal only; systems still in flux | **the owner's own UAT passes** — played start to finish, holds together |
| **beta** | `v0.5.0-beta.N` | feature-complete for the release scope; external testers | no known-red tests; balance graded against a CURRENT baseline; N-series complete |
| **rc** | `v0.5.0-rc.N` | we would ship this if nothing new appears | beta feedback triaged; only blocker fixes since; `RELEASE-CHECKLIST.md` fully green incl. §G sign-off |
| **release** | `v1.0.0` | public | the above, plus the decision to ship |

**WHY THIS SECTION EXISTS.** `scripts/tag-rc.mjs` derives `v${version}-rc1` and
`RELEASE-CHECKLIST.md` is titled for that tag, which reads as though an RC were the next
step. It is not. A release *candidate* is a claim that the build is shippable pending
final validation, and making that claim while the balance model is mid-rebuild would be
false — the kind of false that gets a build handed to someone with the wrong expectation.

**What it takes to leave PRE-ALPHA: the owner's one-man UAT.** Sit down and play the
build through — not a scripted driver, not a sim policy, the actual cockpit. It is a real
gate rather than ceremony, and the day this ladder was written supplies the argument: the
yard had been selling component tiers 1-7 for **zero credits** (a 12,000cr fit free on
day 1, a permanent ~92% cut to the game's primary constraint). No sweep caught it, because
a policy never thinks *"wait, that should cost something"*. A human opening the shipyard
screen once would have.

**What it takes to leave ALPHA**, concretely, so the gate is checkable rather than a
feeling:

1. The **N-series** lands — the 30 NPCs reach player parity (`NPC_REDESIGN.md`).
2. **N8** re-pins the baseline against that living field, and the R-series conclusions are
   re-read against it.
3. The **two known-red tests** are resolved, not carried: `balance-targets` (trader clears
   day 21 against a [22, 30] band) and `balance-combat-survival` (Auto-Repair).

**Until then: cut no tags.** `npm run release:rc` would produce an `-rc1` tag that lies
about the build, and the script only knows how to make RC tags — generalise it to take a
stage before the first real tag is cut.

### Why the current number is `0.5.0`

A judgement call, recorded so it can be argued with. The Rimward redesign is playable
end to end, demo-gated and packaged — so it is well past an 0.1. It is **not** near
release: the balance model is mid-rebuild and the 30-NPC field is eight passes from
player parity (`NPC_REDESIGN.md`, N-series). `0.5.0` says "the shape is
real, the systems are moving." Move it as those tracks land; do not move it to `1.x`
until the game actually ships.

### GitHub Releases — adopt at BETA, not before

**The repo is public** (`github.com/ArchitectVS7/SpacerQuest`), so a Release is not a
neutral filing action: it lands in the Releases tab, notifies watchers, and reads to a
passerby as *"the game is out."* There is a press one-pager and a Steam achievements slate
in `docs/`; a trail of pre-alpha releases would be the public face of a launch that has
not happened.

Tags already answer the only question we have today — *which code was that?* A Release
adds **distribution**: a durable URL and an attached installer. That is worth exactly
nothing while the only user is the person who compiled it.

**Adopt at the beta boundary** — the first build handed to someone who is not you. Then a
Release earns its keep, and the rules are: tick **"Set as a pre-release"** so it cannot be
mistaken for a launch, attach the `electron-builder` artefacts, and let the notes be the
changelog for that stage.

## 2. Save schema version — a plain integer, currently `10`

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

**It hashes their CODE, not their bytes** (N7-FP, 2026-07-29). Comments are stripped
before hashing — via the TypeScript parser, not a regex, because `//` and `/* */` appear
inside string literals in this codebase — so rewriting a comment no longer invalidates a
measurement. It previously did, and that was a false positive with a real cost: a
documentation audit correcting two wrong figures in `content/ports.ts` was provably inert
(an 8-shard capstone against clean HEAD diffed to "NOTHING MOVED") and still forced a full
re-stamp. Content here is deliberately comment-dense, so the byte hash taxed precisely the
work that keeps that commentary true — which is how the two wrong figures survived.
Any change to code — a constant, an operator, an import, a rename — still moves the
fingerprint, and `balance-rig.test.ts` pins **both** directions so the property cannot rot.

The raw-byte hash survives as **`docsFingerprint`**, recorded in fixture provenance and
reported when it moves. It is deliberately **informational and never fails a test**: it
dates a commentary change without claiming the game changed. Promoting it to a failing
check would reinstate the false positive it replaced.

One accepted cost, stated plainly: the printer's output can shift across TypeScript
**major** versions, which would move every fingerprint at once on a dependency bump. That
is loud, one-time and obviously attributable, and the remedy is the same re-stamp — a
deliberate trade of a rare loud false positive for a frequent quiet one.

The rule for consumers: **a stale fingerprint fails loudly, it is never silently used.**
A smoke test run against checkpoints from a different ruleset is not a weak test, it is a
misleading one. (Precedent for the technique: the report fingerprints in
`packages/sim/src/__tests__/campaign-degraded.test.ts`.)

## 4. Content/task IDs — `T-####`, `R#`, `N#`, `F#`

**Answers: which piece of work is this?**

Not versions, and they do not sort against each other. `T-####` are engineering tasks,
`R#` are steps in `BALANCE-REDESIGN-WORKLIST.md`, `N#` steps in `NPC_REDESIGN.md`, `F#` are protocol findings. They
appear in code comments so a rule can be traced to the decision that produced it; keep
using them that way.

---

## The rule that matters most

**Never bump a version to make something pass.** Each of these numbers is an assertion
about the world: how mature the game is, what a save file contains, which ruleset a
measurement describes. Moving one to silence a failure converts a true statement into a
false one, and the failure it was hiding surfaces later somewhere less convenient.
