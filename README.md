# Spacer Quest

A 1991 Apple II GBBS space trading game, rediscovered after 30 years — now being
reimagined as a modern single-player game: **Spacer Quest: Rimward**.

This repository is in its **redesign era**. The faithful BBS port ("Museum
Edition") is complete, playtested, and retired; the project's future is the
ground-up redesign described in [`docs/PRD-REIMAGINED.md`](docs/PRD-REIMAGINED.md).

## Repository map

| Directory | What it is |
|---|---|
| **`docs/`** | Live design documents for the new game. Start with `PRD-REIMAGINED.md`. |
| **`foundation/`** | The curated inheritance: balance formulas, the character roster, and the lore bible extracted from the original and the Museum Edition. This is the *specification* the new game is built from. See `foundation/README.md` for the inventory. |
| **`legacy/`** | Quarantine. The original Apple II source (`SQ/`), its decompilation, the complete Museum Edition web port, and all playtest/process records. Frozen, unmaintained, and a candidate for deletion. Nothing outside `legacy/` may depend on anything inside it. See `legacy/README.md`. |

## The short history

1. **1991** — "Spacer Quest" v3.4 by Firefox runs on Apple II GBBS boards.
2. **2026 (spring)** — the original source is located, decompiled, and faithfully
   reimplemented as a web app (Node/Fastify + xterm.js), including simulated
   BBS players and an LLM-driven playtest harness (UGT) that validated the
   1991 rules to ~1,500 actions with zero crashes.
3. **2026 (summer)** — conclusion: the 1991 *design* (menu ceremony, point
   grind) is not fun in 2026, but its *systems* (scarce turns, fuel logistics,
   a living cast of rival spacers) are worth building a real game on. The
   Museum Edition is quarantined; *Rimward* begins.
