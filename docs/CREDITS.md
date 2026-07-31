# Credits and licences

**T-1704.** This is the human-readable copy of `packages/ui/src/credits.ts`'s
`CREDITS`, and it is pinned to that constant row-for-row by
`packages/ui/src/__tests__/credits.test.ts` — add a dependency that ships to a
player without a credit row and the unit suite goes red. That is the only thing
that keeps a hand-maintained attribution list from rotting, and it is the same
guard `docs/STEAM-ACHIEVEMENTS.md` gets from `steam.test.ts`.

**The copy a player receives is the one in the build, not this file.** The OFL
and the MIT licence both require their notice to travel with the distributed
work, so the same list is rendered in-game at **Settings → Credits** on every
build, web and desktop. This file is for whoever is filling in the Steam store
page and the legal box on it.

## What ships

| Component | Holder | License | Notes |
| --- | --- | --- | --- |
| Chakra Petch | Cadson Demak | SIL Open Font License 1.1 | Loaded from Google Fonts by the web build; a packaged offline launch falls back to system-ui. No font binary is bundled. |
| IBM Plex Mono | IBM Corp. | SIL Open Font License 1.1 | Loaded from Google Fonts by the web build; a packaged offline launch falls back to ui-monospace. No font binary is bundled. |
| All sound cues | The Spacer Quest project | CC0 1.0 Universal | Original procedural WebAudio synthesis. There are zero audio asset files and zero third-party samples — see packages/ui/src/sound.ts. |
| React and React-DOM 19 | Meta Platforms, Inc. and affiliates | MIT | Bundled into the cockpit on every build, web and desktop. |
| GSAP 3.15.0 | GreenSock, Inc. | Standard "No Charge" GSAP License | Bundled into the cockpit on every build, web and desktop. The npm package ships no LICENSE file — its README names the licence and points at the URL above, which permits commercial use in a sold product and prohibits only building competing visual-animation tooling. |
| Electron 43 | Electron contributors and the OpenJS Foundation | MIT | Desktop builds only. It carries Chromium (BSD-3-Clause) and Node.js (MIT) with it. |
| steamworks.js | ceifa and contributors | MIT | An optional dependency, present only in desktop builds. The Steamworks SDK it binds to is redistributed under Valve terms — see docs/RELEASE-CHECKLIST.md item B6. |
| Spacer Quest v3.4 (1991) | Firefox, on Apple II GBBS | Provenance, not a licence | The systems, roster, factions and lore this game is built from. The rules of record live at git ref f2f95fa9. |

## Licence texts

- SIL Open Font License 1.1 — https://openfontlicense.org
- CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/
- MIT — https://opensource.org/license/mit
- Standard "No Charge" GSAP License — https://gsap.com/standard-license
- Chromium's BSD-3-Clause and Node.js's MIT notices ship inside the Electron
  distribution itself (`LICENSES.chromium.html` beside the binary).

## Two claims, asserted rather than stated

Both of these are properties of the repository, so both are checked by a test
(`credits.test.ts`) rather than trusted:

- **Zero audio assets.** Every cue in the game is synthesized live in WebAudio
  (`packages/ui/src/sound.ts` documents the full cue → bus → synthesis map).
  There are no samples, no third-party recordings and no audio files of any
  extension anywhere under `packages/ui`.
- **Zero font binaries.** Chakra Petch and IBM Plex Mono are requested from
  Google Fonts by `packages/ui/index.html`; no `.woff`, `.woff2`, `.ttf` or
  `.otf` is committed. A packaged offline launch therefore falls back to the
  system stacks in `theme.css`. Self-hosting them is open decision **F1** in
  `docs/RELEASE-CHECKLIST.md`; if it is granted, the "not bundled" notes above
  and the assertion that pins them both change in the same commit.

## What is deliberately not listed

**Development-only tooling is not credited here**, and its absence is a decision
rather than an oversight: Vite, vitest, Playwright, TypeScript, ESLint and
Prettier never reach a player's machine, so listing them would dilute the
notices that a distributed build is actually required to carry. The workspace
packages (`@spacerquest/engine`, `content`, `ui`, `sim`, `desktop`) are this
project's own code and are covered by the project's own licence.
