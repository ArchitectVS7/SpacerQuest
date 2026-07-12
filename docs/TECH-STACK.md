# Rimward — Tech Stack Decisions

**Date:** 2026-07-10 · **Status:** Approved
Companion to `PRD-REIMAGINED.md`. Records what is decided, what is deliberately
deferred, and why.

## Decided

### 1. TypeScript end-to-end
All game code is TypeScript. Rationale: `foundation/rules/` is already TS
(formulas reuse directly, no transliteration); the UGT playtest harness drives
web interfaces (points at Rimward with minimal work); it is the developer's
proven stack from the Museum Edition. Considered alternative: Godot 4 —
better engine tooling, but Rimward's cockpit is ~90% dense text/panel UI,
which is web tech's home turf and Godot's weak spot, and Godot would forfeit
both the TS rules reuse and the existing UGT integration.

### 2. Headless rules engine, UI as a client
The game logic is a pure TS package with **no UI imports and seeded,
deterministic RNG**: `engine.advanceDay(actions) → events`. The cockpit UI is
one client of it; UGT and balance simulators are others. This is the direct
lesson of the Museum Edition, where rules woven through 54 screens made every
change and every test hard.

Non-negotiable engine properties:
- **Deterministic:** same seed + same actions = same galaxy, always. (Every
  d20 roll flows from the seed — this is what makes 10,000-day overnight
  balance simulation and reproducible bug reports possible.)
- **Serializable:** full game state round-trips through JSON (saves, UGT
  snapshots, and eventually Steam Cloud come free).
- **Event-sourced output:** the engine emits typed events (the news wire is
  literally the event log, rendered in-fiction).

### 3. Distribution: Steam-first, commercial
Per the PRD: $15–20 premium, demo-first marketing. Implications planned in
from the start: a desktop shell build target, Steamworks integration
(achievements mirror the Registry of Deeds; Steam Cloud for saves), and the
demo (Tour One) as a first-class build configuration, not an afterthought.
Browser builds remain the dev/playtest loop.

### 4. Repository shape: monorepo packages
```
packages/
  engine/     pure rules — no DOM, no I/O, seeded RNG
  ui/         the cockpit (web) — renders engine state, submits actions
  content/    NPC sheets, storylets, systems, balance tables (data, not code)
  sim/        headless harnesses: balance runs, UGT adapter
```
`content/` is data (JSON/typed TS data modules) so expansion Seasons and the
d20 cast stay authorable without touching engine code.

## Deferred (with current lean)

| Decision | Decide when | Current lean |
|---|---|---|
| Renderer: DOM/React vs. PixiJS canvas | After first visual prototype of the cockpit | DOM for iteration speed + WebGL/CSS CRT post-process layer; go canvas only if the aesthetic demands it |
| Desktop shell: Electron vs. Tauri | Before first Steam build | Electron — uniform Chromium protects the CRT aesthetic; Tauri's per-machine webviews risk it |
| State/UI framework details | With renderer choice | React + a thin store; engine state is the source of truth |
| Save format versioning / migration scheme | Before first public demo | Versioned JSON with explicit migrations |

## Constraints carried over from project rules
- No feature exists only in the UI: if the engine can't do it headlessly, it
  isn't done (UGT must be able to reach everything a player can).
- Playtests exercise the real UI (per global testing rules); the engine-direct
  path is for balance simulation, not UX validation.
