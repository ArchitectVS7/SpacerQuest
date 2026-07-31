# Telemetry Report — spec for the Tier 1 visualization generator

**Spec only. No engine, content, sim, or UI source file is touched by this document.**
Written outside the 0.5.2 Explore/Hangout track (which owns `TASKS.md` while it runs).
**Sequenced AFTER both companion specs** — `docs/BALANCE-TELEMETRY_SPEC.md` (NPC decision
tracing) and `docs/PLAYTEST-TELEMETRY_SPEC.md` (human playtest logging) — because this
document has nothing to render until their implementation tasks ship the JSONL it consumes.
When scheduled in `TASKS.md`, this task's `after:` lists both.

## 0. What problem this solves

Balance and playtest results today arrive as markdown writeups and raw JSON — accurate, but
slow to scan for "which playstyle is thriving, which option nobody picks." This generator
turns existing/planned structured output into a small set of charts, so a UAT/Alpha-season
read of a run doesn't require reading a 60KB memo first. **It is a viewer, not a new data
source** — everything it renders already exists or is already specced elsewhere.

## 1. What it generates — the three views asked for

1. **Per-archetype leaderboard.** Bar charts across policies for the metrics that already
   exist in `PolicyAggregate` (`packages/sim/src/balance/aggregate.ts:371`) inside a
   committed `BaselineAggregate` (`aggregate.ts:581`, e.g. `docs/balance/baseline-n11-shipped.json`
   — top-level keys `label, policies, seeds, days, runs, fleet, byPolicy`): final credits,
   clear rate, clear-day, ships/routes lost, deed count. One chart per metric, one bar per
   archetype (`byPolicy`'s keys) — this is the "which playstyle thrives, suffers, is
   under/overpowered" view, read directly off data the sweep already produces today.
2. **Option-frequency chart.** Which option got picked most/least, at two grains: NPC
   decisions (`NpcDecisionTrace.candidates`/`chosen`, per `docs/BALANCE-TELEMETRY_SPEC.md`
   §3 — a bar per intent/contract candidate, chosen vs. available, per archetype) and human
   playtest actions (`PlaytestLogEntry` where `kind === 'action'`, per
   `docs/PLAYTEST-TELEMETRY_SPEC.md` §6 — a bar per `PlayerAction` type, counted across one
   or more exported logs). Same chart shape, two different input streams.
3. **Before/after diff.** Two named `BaselineAggregate` runs (or two NPC-trace/playtest-log
   sets) compared metric-by-metric, in the same spirit as the R2 bake-off's own comparison
   tables in `docs/BALANCE-REDESIGN-WORKLIST.md` Appendix A — a paired bar per metric, delta
   highlighted.

## 2. Inputs, precisely

- **Committed sweep aggregates**: `docs/balance/baseline-*.json` (`BaselineAggregate` shape,
  already exists today, zero new work needed to read it).
- **NPC decision traces**: the gitignored
  `.scratch/balance/traces-<label>-shard<i>of<N>.jsonl` from
  `docs/BALANCE-TELEMETRY_SPEC.md` §4(4) — **not committed**, so the report generator must
  accept an explicit path/glob, never assume a fixed committed location.
- **Human playtest logs**: the exported `PlaytestLogEntry` JSON/CSV from
  `docs/PLAYTEST-TELEMETRY_SPEC.md` §5 — arrives asynchronously (a tester attaches a file to
  a bug report), so likewise an explicit input path, not a pipeline the generator owns.

**Consequence:** this is a CLI/script tool taking explicit input paths
(`--aggregate <file>`, `--traces <glob>`, `--playtest-log <file>`), not a service that
discovers its own inputs — there is no fixed "the current run" for it to assume.

## 3. Output form and provenance

**Not committed to the repo** — a report is a derived, regenerable view over inputs that are
either already committed (aggregates) or already gitignored (traces, playtest exports); a
large embedded-data HTML file would just be a second, staler copy of data that already lives
somewhere canonical, the exact anti-pattern `docs/balance/smoke/README.md` warns against for
fixtures. Written to a gitignored path (e.g. `.scratch/balance/reports/`, added alongside the
existing `.scratch/` entry in `.gitignore`).

**Self-contained static HTML**, one file per report, inline CSS/JS (no CDN dependency —
same constraint this environment's own Artifact tooling uses, and the right call for a file
someone might open offline during a con-floor Alpha session with no network).

**Every report stamps its own provenance in the page header**, mirroring the fixture
convention already established (`docs/balance/smoke/README.md`'s provenance table):
which input file(s) it read, each input's own `rulesFingerprint`/`gitCommit` if present
(aggregates already carry this via the smoke/capstone convention), and the generation
timestamp. A report describing two aggregates with **different** `rulesFingerprint`s must
say so visibly on the page — comparing across a rules change is a legitimate before/after
use case (that's the whole point of a redesign-track diff), but the viewer must not be able
to mistake it for a same-ruleset comparison.

## 4. Chart design

Load the `dataviz` skill when implementing — palette, accessibility, and mark-type guidance
apply here same as any other chart work; do not hand-roll ad hoc colors.

- **Leaderboard**: sorted bar chart, one per metric, archetypes ordered by value.
- **Option-frequency**: bar chart (or small-multiple bars per decision kind) of chosen-count
  per option, with the *offered* count shown alongside so a rarely-chosen-but-rarely-offered
  option isn't visually indistinguishable from a rarely-chosen-but-often-offered one — the
  first is a reach problem, the second is a preference finding, and they should not look the
  same on the chart.
- **Before/after**: paired or diverging bars per metric. **Flag deltas that could be
  sample-size noise, don't just print the number** — this codebase already has a hard-won
  lesson on exactly this (`docs/BALANCE-REDESIGN-WORKLIST.md` Appendix A: a candidate passed
  at n=100 seeds and failed at n=1,000; the clear-day criterion has a real spread even at
  n=1,000). At minimum, show each input's seed count next to its numbers so a viewer is never
  reading a 100-seed delta as if it carries the same confidence as a 1,000-seed one.

## 5. Tooling

Recommend keeping this in the same language/package family as the rest of the balance
tooling — a script under `packages/sim/src/balance/` (sibling to `aggregate.ts`/`sweep.ts`),
generating the HTML directly (inline `<svg>` or a small bundled charting approach) rather
than introducing Python/matplotlib as a second toolchain for one feature. The implementation
task should confirm this is still the right call rather than take it as settled — audit
first, per this project's own convention, if a compelling reason to deviate turns up.

## 6. Non-goals

- **No live game triggering, no config writing, no in-page "run a sweep" button.** See §7 —
  that idea is deferred, not folded in here.
- Read-only over existing artifacts. Never generates, edits, or re-sweeps balance data
  itself — it visualizes what `sweep.ts`/`aggregate.ts` (or the two telemetry specs' own
  outputs) already produced.
- Does not change `aggregate.ts`'s or either telemetry spec's output shape unless an audit
  finds a genuine gap — report it as a finding rather than quietly adding a field.
- Does not implement anything. This document settles design; it modifies no source file.

## 7. Deferred — the levers / live balance-run dashboard

**Explicitly deferred, not rejected.** The idea discussed alongside this spec — a developer
dashboard where a lever (a quest-line odds constant, a unique item's `+x`) is adjusted in a
UI, written to the game's config, and a 1,000-seed sweep fires on demand with a live
before/after — is the right direction *methodologically*: it's the same isolated-variant-tree
approach the R2 bake-off already proved out (`docs/BALANCE-REDESIGN-WORKLIST.md` Appendix A —
variants patched at named anchors in a tree sourced from `git archive HEAD`, a no-change
control verified byte-identical to production, a sighted-oracle rig). The gap is not the
idea, it's everything the automation around it would require: a local server, sandboxed
variant-tree management, a UI for editing what are today plain TypeScript constants without
breaking their status as git-committed, fingerprinted, provenance-tracked source, and keeping
every dashboard-fired run as trustworthy as a hand-run capstone rather than a live poke with
no commit behind it (`docs/balance/smoke/README.md`'s "never edit a fingerprint... to make a
test pass" rule exists precisely to keep that distinction real).

That is a project-sized feature in its own right, layered on top of a track that already has
two telemetry specs queued ahead of this one. Building it now would be scope creep on the
current line of work. **Deferred to a future spec**, to be written once this report
generator (§1-6) is in production use during real UAT/Alpha and its limits — specifically,
whether static reports over committed runs are actually insufficient for the iterate-and-see
workflow the lever idea targets — are felt firsthand rather than assumed.
