# Changelog

## 0.5.2
- Explore and Socialize redesign arc
- Rebuilt Explore: outcome framework extracted behaviour-preserving, ~100 authored
  outcomes across three content passes, a real time cost for recovery, and a
  unique-item effect surface
- Rebuilt the Hangout: engine split from content and parameterised per port, a bar
  at all 14 spaceports (the reach change), and the dark half of the bar surfaced
- Added the Liar's Dice Dare — spec, engine and UI — with a capstone measurement pass
- Added a fixed 42-opponent roster, an unlock ladder, and achievement hooks
- Owner rulings D1–D7 closed the mid-arc checkpoint: bands 3–4 now pay in dice
  rather than days, plus a per-port loan band and a rumor mill that knows where the
  bars aren't
- Telemetry and dev tooling: NPC decision tracing, opt-in playtest logging, a Tier 1
  telemetry report generator, and a Tier 1.5 dev control panel
- Folded the balance sweep's invariants into a pass/fail CI gate; on its first run it
  caught a real fighter-archetype stall (32 idle days against a limit of 5), now fixed,
  and the "one prime focus, never a single-verb monoculture" property is a stated norm
- Specced player-modifying trinkets off a simulated bakeoff
- Versioning: patch now marks the work track, with the phase ladder recorded
- Still open in this arc — the gate's own regression suite, the coverage matrix, N13
  dawn-hand parity, the native LLM pilot, and a first human UAT pass; see TASKS.md

## 0.5.1
- Split the NPC redesign into its own task
- Completed bulk of the NPC base work, discovered two major gaps (Explore, Socialize)

## 0.5.0
- Started the NPC parity track (N-series); N0, N1, N2, N6, N7 and N9 shipped.
  N3–N5, N8 and N10–N14 remain open — see docs/NPC_REDESIGN.md for the status board.
- NPCs now play by the player's rules, owning real ships and upgrading them
- Established versioning standard and lockfile generation
- Added copy-on-write discipline for player and NPC turns
- Updated the Honor List to a real 31-way board
- Extensive balance policy and baseline auditing

## 0.4.0
- Rimward Redesign phase: modernized UI, Starmap, and Combat panes
- Full Storylet engine integration and interactive day lifecycle
- Fuel scarcity overhaul and economy/pacing tuning
- Prepared release checklist and demo builds

## 0.3.0
- Established headless engine core and monorepo scaffold
- Automated balance runner and CI integration
- Extracted the Rimward foundation from the original ruleset

## 0.2.0
- Terminal-only interactive playtest agent and UGT adaptations
- Introduced salvage system, full tribute paths, and early game alignment

## 0.1.0
- Faithful 1:1 recreation of the original 1991 BBS game
- Museum Edition quarantined as the historical reference baseline
