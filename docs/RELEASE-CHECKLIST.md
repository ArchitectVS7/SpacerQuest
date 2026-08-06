# Release checklist — Rimward

> ## ⛔ NOT YET APPLICABLE — the build is PRE-ALPHA
>
> This is the **release-candidate ceremony**. It is correct, and it is several stages
> away. An RC asserts *"we would ship this if nothing new appears"*. The Rimward redesign
> has the 30-NPC field eight passes from player parity, two known-red balance targets,
> and — the plain one — **no start-to-finish career pass has been played yet**. The next
> milestone is not a tag; it is the owner's own UAT.
>
> **Corrected 2026-08-06.** This paragraph read "nobody has played this build end to end yet"
> until today, which stopped being true on 2026-08-03: T-158's UAT closed with the owner playing
> **two live sessions** and recording both required rulings (R1 — Combat's chosen `executeCombat`
> branch; R2 — F-150-1), filed as M14/M15 feedback. What has *not* happened is a **start-to-finish
> career** pass, which is the specific thing `docs/VERSIONING.md` names as the entry criterion for
> alpha. **The stage is unchanged and still correct — only the stated reason was wrong.** Advancing
> it is not a documentation change: see `TASKS.md` T-234 (schedule the start-to-finish pass, or
> record an explicit ruling that the two sessions discharge the criterion) and T-233.
>
> **That UAT had a brief: `docs/playtests/T-158-pre-uat-brief.md`** (T-158, 2026-08-02) — the
> runbook, what was known-uncovered going in, and the two rulings the pass had to record. T-158 is
> now DONE and its block was pruned by the 2026-08-06 harvest; see the Completed ledger in
> `TASKS.md`.
>
> **Do not run `npm run release:rc`.** See `docs/VERSIONING.md` for the stage ladder and
> the criteria for leaving pre-alpha.
>
> **This document names no version number, deliberately.** The version lives in the root
> `package.json` and nowhere else; a number copied into prose here is a number that goes
> stale silently. Historical transcripts below DO carry the versions they were taken at —
> those are records of past runs and are left exactly as they were recorded.

**T-1704.** The final sweep before a release candidate: version stamping,
credits and licences, the store-page asset export list, the partner-site
configuration, the build gate, the README and the press one-pager.

> **Current state — this checklist is NOT signed off, and T-1704 is not done.**
> Run `npm run release:signoff` for the live count of open items; it is the
> authority and this document is only its input. Every open item is a question
> addressed to **you**: a decision, an account, an artist, a certificate or a
> push. Nothing in this repository can answer one — see "The coder does not
> self-waive" below — which is why T-1704 is **blocked awaiting sign-off**
> rather than work still in progress. Two steps close it, in this order:
>
> 1. **Answer every row of §G.** Any non-empty text counts, including a refusal
>    or a deferral ("not for rc1", "ship unsigned").
> 2. **Run `npm run release:rc`.** It refuses to tag while §G has a blank and it
>    has no override flag. **There is no release tag in this repository
>    today, and that is the correct state rather than an oversight.**

## How to read this file

Every row below has a **Status** cell, and it is exactly one of two markers.
There is no third state — no `TODO`, no `WIP`, no blank — and
`packages/ui/src/__tests__/release-checklist.test.ts` parses this file and fails
if one appears. "Complete" is therefore machine-checked, not eyeballed.

| Marker | Meaning |
| --- | --- |
| ✅ DONE | Closed inside this repository, with evidence: a file path, a test name, or a command that was run. |
| ⏸ WAIVER REQUESTED | **Cannot** be closed by code in this repository — it needs a decision, an account, an artist or a push from the user. The Evidence cell carries the exact question, and §G records the answer verbatim. |

**The coder does not self-waive.** Every ⏸ row is a question addressed to the
user and is repeated in §G with an empty answer until the user fills it in. A
release is not signed off while §G has blanks.

**And that last sentence is a gate, not a hope.** It used to be prose and nothing
else — no command reported the blanks, nothing refused to proceed while they were
there — which is how a checklist full of unanswered questions could sit inside a
suite whose whole purpose was to make "complete" machine-checked. Two scripts
close it:

| Command | What it does |
| --- | --- |
| `npm run release:signoff` | Exits non-zero, naming every §G row still blank and every ⏸ row that never reached §G at all. Read-only — a tool that could fill §G in would be a tool that can self-waive. |
| `npm run release:rc` | The whole RC ceremony in order: **sign-off** → clean working tree → annotated tag → `verify-clean-clone.mjs --ref <tag>`. **It refuses to tag while §G has a blank, and it has no override flag.** It never pushes; it prints the push command. If it created the tag and the clean clone then failed, it deletes the tag again — a tag pointing at a tree that does not build is a claim, not a marker. |

So the two halves of this task's Accept are welded together: **there is no way to
get a release tag out of this repository without a complete §G.**

**And that is the honest reason T-1704 is not a task a coder can finish.** Both
halves of its Accept terminate in §G — the first *is* §G, and the second is
gated on §G by the paragraph above — and §G is yours. Everything up to that
point is built, tested and closed; what is left is the answers in §G and one
command.

---

## A. Version stamping

**The mechanism, and where it is defined:** `docs/VERSIONING.md` — one source of truth
(the root `package.json`), six manifests held to it by `version.test.ts`, prerelease stage
carried by the git tag rather than the manifests, and the exact list of files a bump has to
touch. Not restated here; a second copy is a second thing to keep in step.

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| A1 | Root `package.json` carries a version | ✅ DONE | `package.json`; it had no `version` field before this task, which is why nothing could be stamped |
| A2 | All six manifests agree on one version | ✅ DONE | `version.test.ts` → "one version, six manifests" reads root + the five `packages/*/package.json` off disk |
| A3 | The version is compiled into the web bundle | ✅ DONE | `packages/ui/vite.config.ts` `define.__SQ_VERSION__`; `packages/ui/src/version.ts` `BUILD_VERSION`, fail-safe `0.0.0-dev` |
| A4 | A player can read the version without dev tools | ✅ DONE | Settings → Build → Version; `data-version-source="bundle"` on web, `"shell"` under the shell. Asserted in `packages/ui/e2e/settings-saves.spec.ts` and `packages/desktop/e2e/packaged.spec.ts` |
| A5 | Both editions carry the same stamp | ✅ DONE | One `define` for both modes in `vite.config.ts` — the demo and the full game are cut from one commit |
| A6 | The RC tag ceremony is one command, and the tag name is derived | ✅ DONE | `scripts/tag-rc.mjs` (`npm run release:rc`): sign-off → clean tree → `git tag -a` → clean clone, with the tag derived as `v${root version}-rc1` rather than typed. Pinned by `release-checklist.test.ts` → "scripts/tag-rc.mjs is the RC ceremony, and it refuses things", and corroborated by the §E rehearsal. **This row closes the *ceremony*, not the tag** — the tag is E8, and it is open |
| A7 | Annotated release tag pushed to the remote | ⏸ WAIVER REQUESTED | **Q:** once `npm run release:rc` is green on the T-1704 commit, may the tag be pushed (`git push origin <tag>`)? Creating and verifying the tag is now mechanical; **pushing writes to your remote and no script in this repo does that unprompted.** Answer this before the run — the ceremony reads §G first, so a blank here is what stops the tag existing |

---

## B. Credits and licences

`docs/CREDITS.md` is the human-readable copy; `packages/ui/src/credits.ts` is the
constant it is pinned to; **Settings → Credits** is the copy a player actually
receives — which is the copy the OFL and the MIT licence require.

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| B1 | Every shipped dependency, font and sound is credited | ✅ DONE | `packages/ui/src/credits.ts` (8 rows — the count was stale at 7 from T-136's GSAP row; corrected at T-185, which amended the audio row to cover the score too); dev-only tooling deliberately excluded, with the reason stated in `docs/CREDITS.md` |
| B2 | `docs/CREDITS.md` cannot drift from the constant | ✅ DONE | `credits.test.ts` → "docs/CREDITS.md is the constant, row for row" (the `STEAM-ACHIEVEMENTS.md` precedent) |
| B3 | The credits reach the player, not just the repo | ✅ DONE | `App.tsx`'s `CreditsPanel`; asserted in the web cockpit (`settings-saves.spec.ts`) and in a real packaged binary (`packaged.spec.ts`) |
| B4 | "Zero audio assets" is true of the tree, not just claimed | ✅ DONE | `credits.test.ts` walks `packages/ui` and asserts no `.mp3/.ogg/.wav/.m4a/.flac/.aac` exists |
| B5 | "No font binaries bundled" is true of the tree | ✅ DONE | Same walk asserts no `.woff/.woff2/.ttf/.otf/.eot`. This is the assertion that moves if F1 is granted |
| B6 | Steamworks SDK redistribution terms accepted | ⏸ WAIVER REQUESTED | **Q:** do you accept the Valve Steamworks SDK Access Agreement for the SDK that `steamworks.js` binds to, and is its licence text to appear on the store page's legal box? The agreement is between Valve and the publisher; no repository artifact can hold that acceptance |

---

## C. Store-page asset export list

The list an artist can work from. Nothing here exists in the repository yet —
this is an **export order**, and every row is a waiver because the assets are art
that no code can produce. Achievement names and descriptions are **not** repeated
here: they are `docs/STEAM-ACHIEVEMENTS.md`, generated from
`packages/ui/src/steam.ts`.

Achievement icons: **120 files (60 achievements × 2 states)**, 64×64 PNG each —
one achieved and one unachieved per row of the manifest. That count is derived
from `ACHIEVEMENT_MANIFEST.length` and asserted by
`release-checklist.test.ts`, so adding a Deed later reddens the art order instead
of quietly leaving it short.

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| C1 | The export list itself, with dimensions | ✅ DONE | This section; counts derived from the manifest rather than typed |
| C2 | Achievement icons — 90 × 64×64 PNG | ⏸ WAIVER REQUESTED | **Q:** who is drawing the 90 achievement icons, and by when? |
| C3 | Store capsules — header 460×215, small 231×87, main 616×353, vertical 374×448, page background 1438×810 | ⏸ WAIVER REQUESTED | **Q:** who is producing the five store capsules? |
| C4 | Library assets — capsule 600×900, header 460×215, hero 3840×1240, logo 1280×720 (transparent PNG) | ⏸ WAIVER REQUESTED | **Q:** who is producing the four library assets? |
| C5 | Client icon — 32×32 | ⏸ WAIVER REQUESTED | **Q:** who is producing the client icon? |
| C6 | Screenshots — at least 5 at 1920×1080 | ⏸ WAIVER REQUESTED | **Q:** may screenshots be captured from a scripted Playwright session of the real cockpit, or do you want them art-directed by hand? |
| C7 | Trailer — at least 1, 1920×1080, ≥30s | ⏸ WAIVER REQUESTED | **Q:** who is cutting the trailer, and against what music licence? |
| C8 | Application/installer icon — `.ico` (256×256) and `.icns` | ⏸ WAIVER REQUESTED | **Q:** who is producing the app icon? Until one exists, electron-builder ships the **default Electron icon** on both platforms (recorded in T-1701b's Delivered note); this is the most visible missing asset in the build |
| C9 | Demo store-page assets — the demo is its own Steam app | ⏸ WAIVER REQUESTED | **Q:** does the demo get its own capsule set, or a re-badged copy of the full game's? See `packages/desktop/steam/app_build_demo.vdf` |

---

## D. Partner-site configuration

Everything Steamworks needs that **no code can create**. All of it is carried
forward from `docs/STEAM-ACHIEVEMENTS.md`, which is the file a human pastes from.

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| D1 | Achievement table pasted into App Admin → Stats & Achievements | ⏸ WAIVER REQUESTED | **Q:** confirm the 45 rows in `docs/STEAM-ACHIEVEMENTS.md` are entered, all set to *not hidden*. Requires a partner account this repo does not have |
| D2 | Rich-presence token registered | ⏸ WAIVER REQUESTED | **Q:** confirm `#Status_InSystem = Day {#day} — {#system}` is registered for `english` (Community → Rich Presence). The shell sets `system`, `day` and `steam_display` at runtime; the sentence is partner-site data |
| D3 | Steam Cloud enabled: 128 MiB / 32 files, **Auto-Cloud off** | ⏸ WAIVER REQUESTED | **Q:** confirm the quota and that Auto-Cloud stays **off**. The game drives ISteamRemoteStorage itself; Auto-Cloud would write the same seven files twice — see `docs/TECH-STACK.md` §3 |
| D4 | Full-game app id compiled in | ⏸ WAIVER REQUESTED | **Q:** what is the full game's Steam app id? `COMPILED_STEAM_APP_ID` is `null` and a unit test pins it, so no dev build can talk to a live product until this is answered deliberately |
| D5 | Demo app id and depot id filled into the content-builder scripts | ⏸ WAIVER REQUESTED | **Q:** what are the demo app id and depot id? `packages/desktop/steam/{app,depot}_build_demo.vdf` carry placeholder `"0"`s pinned by `demo-package.test.ts` |

---

## E. Build and distribution

**Clean-clone gate.** `scripts/verify-clean-clone.mjs` clones the repository with
`git clone --no-local` into a throwaway directory — a real transport clone with a
new working tree and a new `node_modules`, so nothing from a developed-in
checkout can make the build pass — checks out a ref, and runs the gate:
`npm ci` → `npx tsc -b` → `npm run lint` → `npm run format:check` → `npm test`.

Playwright is deliberately **not** run there (browser downloads, an Electron
binary and a display server); the e2e, desktop and packaged evidence is the CI
matrix in `.github/workflows/ci.yml`, which runs all four jobs against the pushed
commit and therefore against the tagged commit.

**There is no release tag in this repository.** `git tag -l` returns
nothing. The ceremony refuses to reach `git tag` while §G has a blank, §G is
blank, and that refusal is the design rather than a bug — so the Accept's second
half, *"RC tag builds green from clean clone"*, is **open**, and it is tracked
below as **E8**. What unblocks it is the user's answers, not more code.

**What follows is a rehearsal, and it is evidence for the machinery only.** Two
earlier drafts of this section got that wrong in two different ways, and both are
recorded because the correction is the useful part. The first recorded a run
against `ff02a9e7` — the commit *preceding* T-1704 — which proves that the commit
before this work builds and says nothing whatever about the tree the tag will
point at. The second replaced it with the run below and marked **E8 ✅ DONE** on
its strength, which was the worse error: a rehearsal performed in a throwaway
clone, whose §G was filled with **fabricated** answers precisely so it could get
past the sign-off, is not "closed inside this repository" under this file's own
definition of ✅ DONE — it is a coder granting himself the waiver one section
earlier forbids. E8 is a ⏸ row, and this transcript now claims only what it can
carry: **the ceremony and the clean-clone gate work, end to end, including their
refusals.** It is evidence for **A6** and **E1**, and for nothing else.

> **HISTORICAL TRANSCRIPT — do not update the version numbers below.** This rehearsal was
> run in the Museum-Edition era, when the product line was `1.0.0`. The numbers in it are
> a record of what that run actually printed. Rewriting them to match today's version
> would turn a true record into a fabricated one; a transcript that never happened is
> worse than a stale one.

The rehearsal, win32: this task's exact working tree was committed into a
throwaway clone, that clone's §G filled with rehearsal answers *in the clone
only*, `scripts/tag-rc.mjs` run there, and the clean-clone gate run against the
tag it created. The machine-specific `source` and `clone` lines are elided;
nothing else is.

```
========================================================================
T-1704 · release candidate
  version  1.0.0
  tag      v1.0.0-rc1
========================================================================

  sign-off   OK (23 waivers, all answered)
  tree       clean at 3a8fe00c
  tag        v1.0.0-rc1 created (annotated, local only)

--- node scripts/verify-clean-clone.mjs --ref v1.0.0-rc1 ---

========================================================================
T-1704 · clean-clone verification
  ref      v1.0.0-rc1 -> 63f36d2b79cd5bccb1bae64b105a791941c82bff
  commit   3a8fe00c T-1704 rehearsal tree (throwaway clone)
  electron skipped (mirrors CI)
========================================================================
  PASS  git clone --no-local         2.6s
  PASS  git checkout 63f36d2b79…      0.1s
  PASS  npm ci                        6.3s
  PASS  npx tsc -b                   11.0s
  PASS  npm run lint                 21.4s
  PASS  npm run format:check          6.4s
  PASS  npm test                     40.5s
  total 88.2s
========================================================================
GREEN. Clone removed.

========================================================================
v1.0.0-rc1 is GREEN from a clean clone.

This script does not push. The remote is yours; run this when you agree:
  git push origin v1.0.0-rc1
========================================================================
```

`63f36d2b…` is the **annotated tag object** (`git cat-file -t v1.0.0-rc1` → `tag`),
not the commit — which is what proves `-a` rather than a lightweight ref.

**Three refusals were observed, not merely coded**, in the same rehearsal:

- With §G blank, the ceremony **stopped at the sign-off** and printed all 23 open
  ids without reaching `git tag` — the state this repository is in today, and the
  reason no `v1.0.0-rc1` exists in it.
- An **earlier rehearsal went red at `format:check`**, and the run deleted the tag
  it had just created (`v1.0.0-rc1 DELETED — it was created by this run and the
  clean clone failed`). The rollback is real, not aspirational; it was the
  formatting of two files added by this very task that tripped it.
- Re-running after a green run reported `v1.0.0-rc1 already at HEAD —
  re-verifying` instead of trying to re-tag, so the ceremony is idempotent.

The real run — **which has not happened** — is what closes E8, and it needs the
T-1704 commit to exist and **every** §G row answered, not only A7:

```
npm run release:rc          # sign-off → clean tree → git tag -a v1.0.0-rc1 → clean clone
git push origin v1.0.0-rc1  # the user's act; the script prints this and stops
```

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| E1 | A clean-clone gate exists and is reproducible | ✅ DONE | `scripts/verify-clean-clone.mjs` (`npm run release:verify`); transcript above |
| E2 | `npm run package:win` produces a launchable build | ✅ DONE | Run locally for this task → `packages/desktop/release/Rimward Setup 1.0.0.exe` (the version stamp reaches the installer filename), then `npm run test:e2e:packaged -w @spacerquest/desktop` green against that binary — including the Credits panel and `data-version-source="shell"`. CI's `Package (win)` job does the same on every push |
| E3 | `npm run package:mac` produces a launchable build | ✅ DONE | CI's `Package (mac)` job — same matrix, same packaged e2e. No macOS machine is available locally, and the matrix is the evidence by the CI-evidence rule |
| E4 | The demo installer is inside its size budget | ✅ DONE | 93,444,570 B (93.4 MB) against the 200 MB ceiling in `packages/desktop/src/size.ts`; `scripts/check-size.mjs` fails `package:*:demo` over budget |
| E5 | Code signing (Windows) and notarization (macOS) | ⏸ WAIVER REQUESTED | **Q:** do you hold a Windows code-signing certificate and an Apple Developer ID, and where should the secrets live? CI packages with `CSC_IDENTITY_AUTO_DISCOVERY: false` — every build this repo produces today is **unsigned**, and macOS will gatekeeper-block it |
| E6 | CI green on the tagged commit | ⏸ WAIVER REQUESTED | **Q:** confirm all four CI jobs (`ci`, `e2e`, `desktop`, `package` × 2) are green on the commit `v1.0.0-rc1` points at. Purely push-dependent — nothing can observe a CI run on a commit that has not been pushed — so it is confirmed after the push, under the CI-evidence rule in `docs/ENGINEERING-POLICY.md` §3. The clean-clone half that used to be bundled into this row is now E8, which is open for the same reason this row is |
| E7 | Steam overlay enabled | ⏸ WAIVER REQUESTED | **Q:** do you want the Steam overlay on? It needs `--in-process-gpu --disable-direct-composition`, which changes how the CRT tube composites — the aesthetic is the stated reason Electron was chosen at all, so this needs a visual pass before it is switched on. Deferred here by T-1702a and again by T-1702b |
| E8 | The RC tag itself exists and builds green from a clean clone | ⏸ WAIVER REQUESTED | **Q:** may `npm run release:rc` be run on the T-1704 commit, and its transcript — including the annotated tag object sha — recorded here? Answer it like A7, *before* the run: the ceremony reads §G first, so a blank in this very row is one of the things that stops it. **This is the Accept's second half, and no script here can close it** — the tag is the artifact the sign-off is about, and `git tag -l` in this repository is empty today. The machinery is closed and proven (E1, A6); only the act is open |

---

## F. Documentation and press

| ID | Item | Status | Evidence / open question |
| --- | --- | --- | --- |
| F1 | Self-host Chakra Petch and IBM Plex Mono | ⏸ WAIVER REQUESTED | **Q:** shall the two families be self-hosted? A packaged offline launch currently falls back to `system-ui`/`ui-monospace`. It is a deliverable of its own — font binaries, the OFL's redistribution requirements, an asset pipeline — so it was not bundled into this task |
| F2 | `README.md` describes the repository that exists | ✅ DONE | Rewritten. It previously mapped `foundation/` and `legacy/`, neither of which is in the tree, and never mentioned `packages/` |
| F3 | Press one-pager | ✅ DONE | `docs/PRESS-ONE-PAGER.md`; every factual claim quoted from `docs/PRD-REIMAGINED.md` |
| F4 | `docs/CREDITS.md` | ✅ DONE | Written and test-pinned — see §B |
| F5 | Developer / publisher name | ⏸ WAIVER REQUESTED | **Q:** what name ships as developer and as publisher? `[TO BE SUPPLIED]` in the one-pager. Nothing in this repo names a studio and inventing one would be a fabrication on a store page |
| F6 | Press contact email | ⏸ WAIVER REQUESTED | **Q:** what press-contact address should the one-pager carry? |
| F7 | Steam store URL, trailer URL, key-request link | ⏸ WAIVER REQUESTED | **Q:** supply the three URLs once the store page exists (they depend on D4) |
| F8 | Review-copy / key policy | ⏸ WAIVER REQUESTED | **Q:** what is the review-copy policy for press and creators (keys on request, embargo date, monetization permission)? |

---

## G. Sign-off

Every ⏸ row above, repeated so none can be lost. **The user's answer goes in
verbatim** — this table is the record that a waiver was granted rather than
assumed. A release is not signed off while an answer is blank.

**How to answer:** type into the third cell of the row. Any non-empty text counts
as an answer — including a refusal or a deferral ("not for rc1", "no cert yet,
ship unsigned"), because a recorded decision is what this table is for and a
deliberate *no* is as good a waiver as a *yes*. Then run
`npm run release:signoff`; it exits 0 only when every row here is filled, and
`npm run release:rc` will not create the tag until it does. Nothing in this
repository can fill a cell in — see "The coder does not self-waive" above.

**Status:** run `npm run release:signoff` for the live count. It is the authority;
this document is only its input.

| ID | Question (short form) | User's response (verbatim) |
| --- | --- | --- |
| A7 | Push the annotated tag `v1.0.0-rc1` once `npm run release:rc` is green? | |
| B6 | Accept the Valve Steamworks SDK agreement / legal-box text? | |
| C2 | Who draws the 90 achievement icons? | |
| C3 | Who produces the five store capsules? | |
| C4 | Who produces the four library assets? | |
| C5 | Who produces the 32×32 client icon? | |
| C6 | Scripted screenshots, or art-directed by hand? | |
| C7 | Who cuts the trailer, under what music licence? | |
| C8 | Who produces the `.ico`/`.icns` app icon? | |
| C9 | Does the demo get its own capsule set? | |
| D1 | Confirm the 60 achievements are entered, not hidden. | |
| D2 | Confirm the rich-presence token is registered. | |
| D3 | Confirm Cloud quota 128 MiB / 32 files, Auto-Cloud off. | |
| D4 | Full-game Steam app id? | |
| D5 | Demo app id and depot id? | |
| E5 | Code-signing certificate and Apple Developer ID? | |
| E6 | Confirm CI green on the tagged commit. | |
| E7 | Enable the Steam overlay? | |
| E8 | Run `npm run release:rc` on the T-1704 commit and record its transcript? | |
| F1 | Self-host the two font families? | |
| F5 | Developer / publisher name? | |
| F6 | Press contact email? | |
| F7 | Store URL, trailer URL, key-request link? | |
| F8 | Review-copy policy? | |
