# Spacer Quest: Rimward

A single-player space trading game with a fully committed retro-terminal
aesthetic, built on the bones of the 1991 Apple II GBBS game *Spacer Quest* — its
star systems, factions, characters and economy — but redesigned from first
principles for how people actually play in 2026.

> **FTL × Taipan × Citizen Sleeper, set in a galaxy full of D&D characters who
> play the game whether you're watching or not.** — `docs/PRD-REIMAGINED.md` §1

**Status:** pre-alpha. The version lives only in the root `package.json` —
see `docs/VERSIONING.md` for the stage ladder and what it takes to leave
pre-alpha. No release candidate has been tagged. Windows and macOS desktop
builds plus a browser build; the demo is Tour One, shipped as its own build
configuration.

## Repository map

| Path | What it is |
| --- | --- |
| `packages/engine/` | The rules. Pure: no DOM, no I/O, no `Math.random`, no `Date` — all randomness goes through a seeded RNG. Everything a player can do is reachable headlessly. |
| `packages/content/` | Game data: NPC sheets, storylets, systems, ports, deeds, balance tables. Data, never logic. |
| `packages/ui/` | The cockpit — one screen, amber-phosphor CRT, React over a thin store. A client of the rules, never their owner. |
| `packages/sim/` | Headless harnesses: balance sweeps, Monte-Carlo campaigns, the UGT playtest adapter (`PROTOCOL.md`). |
| `packages/desktop/` | The Electron shell: window management, the OS app-data save directory, packaging, the inert updater stub, and the Steamworks achievement / Cloud / rich-presence pipes. Zero game rules, zero workspace dependencies. |
| `docs/` | Live design and release documents — start with `PRD-REIMAGINED.md`. |
| `scripts/` | Repository-level tooling. Today: `verify-clean-clone.mjs`, the release gate that runs the build in a fresh clone. |
| `.github/` | CI: build/lint/test, web e2e, the Electron dev-shell e2e, and a mac/win packaging matrix that drives the real packaged binary. |

**The 1991 inheritance is a git ref, not a directory.** The rules of record and
the lore/voice guide were quarantined out of the tree and live at
**`f2f95fa9`** — read them with
`git show f2f95fa9:foundation/rules/<file>` (e.g. `travel.ts`, `combat.ts`,
`constants.ts`) and `git show f2f95fa9:foundation/lore/User-Manual.md`. The
`legacy/` quarantine (the original Apple II source, its decompilation and the
faithful "Museum Edition" web port) is at the same ref.

## Quickstart

```
npm ci                              # install the workspace
npm run dev -w @spacerquest/ui      # the cockpit at http://localhost:5173
npm run sim -- --help               # the headless harness
npm run package:win                 # a packaged Windows build (release/)
npm run package:mac                 # a packaged macOS build   (release/)
npm run package:win:demo            # the demo build, size-budgeted
```

## The gate

Every change has to leave all of these green, at the repository root:

```
npx tsc -b
npm run lint
npm run format:check
npm test
npm run test:e2e -w @spacerquest/ui
```

Before a release candidate, the same gate is run from a **fresh clone** — a real
transport clone with a new `node_modules`, so nothing from a developed-in tree
can make it pass:

```
npm run release:verify              # the clean-clone gate against any ref
npm run release:signoff             # is docs/RELEASE-CHECKLIST.md §G answered?
npm run release:rc                  # the whole ceremony, in order
```

`release:rc` is sign-off → clean working tree → annotated tag → clean clone. It
**refuses to tag while §G has a blank** and has no override flag, it never
pushes (it prints the command), and if the clean clone goes red it deletes the
tag it just created — a tag pointing at a tree that does not build is a claim,
not a marker.

## Documents

| Document | What it settles |
| --- | --- |
| [`docs/PRD-REIMAGINED.md`](docs/PRD-REIMAGINED.md) | The design. It wins over every other source in this repository. |
| [`docs/TECH-STACK.md`](docs/TECH-STACK.md) | Stack decisions and the reasoning that closed each alternative. |
| [`docs/ENGINEERING-POLICY.md`](docs/ENGINEERING-POLICY.md) | The standing constraints every change is reviewed against. |
| [`docs/VERSIONING.md`](docs/VERSIONING.md) | The four version axes (product, save schema, rules fingerprint, work IDs) and the pre-alpha → release ladder. |
| [`docs/BALANCE-POLICY.md`](docs/BALANCE-POLICY.md) | How balance numbers are set, measured and disclosed, plus the archetype reference and measured baseline. |
| [`docs/RELEASE-CHECKLIST.md`](docs/RELEASE-CHECKLIST.md) | The release sweep: version stamping, store assets, partner-site setup, open decisions. |
| [`docs/CREDITS.md`](docs/CREDITS.md) | Fonts, audio and dependency licences — also shown in-game at Settings → Credits. |
| [`docs/PRESS-ONE-PAGER.md`](docs/PRESS-ONE-PAGER.md) | The press sheet. |
| [`docs/STEAM-ACHIEVEMENTS.md`](docs/STEAM-ACHIEVEMENTS.md) | The achievement table to paste into Steamworks, generated from the code. |

## The short history

1. **1991** — *Spacer Quest* v3.4 by Firefox runs on Apple II GBBS boards.
2. **2026 (spring)** — the original source is located, decompiled and faithfully
   reimplemented as a web app, including simulated BBS players and an LLM-driven
   playtest harness that validated the 1991 rules to ~1,500 actions with zero
   crashes.
3. **2026 (summer)** — conclusion: the 1991 *design* (menu ceremony, point grind)
   is not fun in 2026, but its *systems* (scarce turns, fuel logistics, a living
   cast of rival spacers) are worth building a real game on. The Museum Edition is
   quarantined; *Rimward* begins.
