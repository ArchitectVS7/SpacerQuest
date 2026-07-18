# Credits & licenses — Spacer Quest: Rimward

Ships-with-the-game attribution for third-party assets and runtime libraries. This is the
authoritative credits record referenced by the release checklist (`docs/release/checklist.md`).

## Game

- **Spacer Quest: Rimward** — © the Spacer Quest project. (Matches the `copyright:` field in
  `packages/desktop/electron-builder.yml` and `electron-builder.demo.yml`.)
- Built on the 1991 Apple II GBBS game **Spacer Quest** v3.4 by Firefox — its star systems,
  factions, characters, and economy. See `docs/PRD-REIMAGINED.md` and the repository history.

## Fonts

Both are loaded from the Google Fonts CDN (`packages/ui/index.html`) with a system-font
fallback when offline. Both are licensed under the **SIL Open Font License 1.1**, which
permits use, bundling, and self-hosting.

| Font              | Foundry / author       | License        |
| ----------------- | ---------------------- | -------------- |
| **Chakra Petch**  | Cadson Demak           | SIL OFL 1.1    |
| **IBM Plex Mono** | IBM / Bold Monday      | SIL OFL 1.1    |

SIL OFL 1.1: <https://openfontlicense.org/>. If the fonts are later bundled for offline
fidelity, include a copy of the OFL text alongside the font files (as the license requires).

## Audio

All sound in the cockpit is **original procedural WebAudio synthesis** by the Spacer Quest
project — oscillators, noise buffers, and gain/filter envelopes generated live. There are
**zero audio asset files**: no samples, no third-party recordings, no network fetches (see
`packages/ui/src/sound.ts`). Released **CC0** with the project.

## Runtime libraries (shipped in the app)

| Library              | Role                                   | License |
| -------------------- | -------------------------------------- | ------- |
| **React** / react-dom | Renderer UI framework                 | MIT     |
| **Electron**         | Desktop shell                          | MIT     |
| **electron-updater** | Auto-update client (ships dormant)     | MIT     |
| **steamworks.js**    | Steam achievements + Cloud saves       | MIT     |

## Build tooling (dev-only, not shipped)

Vite, TypeScript, electron-builder, esbuild, Vitest, and Playwright are development
dependencies used to build and test the game; they are not distributed in the packaged app.
