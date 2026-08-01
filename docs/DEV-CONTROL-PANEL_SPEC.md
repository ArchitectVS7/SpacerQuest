# Dev Control Panel — spec for the Tier 1.5 CLI-wrapping dashboard

**Spec only. No engine, content, sim, UI, or desktop source file is touched by this
document.** Written outside the 0.5.2 Explore/Hangout track. **Sequenced after
`docs/TELEMETRY-REPORT_SPEC.md`** (Tier 1) — a sweep run triggered from this panel hands off
to that report generator to visualize; building the panel first would give it nothing to
hand off to. Positioned as **Tier 1.5**, between the read-only report generator (Tier 1) and
the deferred sandboxed-levers dashboard (`docs/TELEMETRY-REPORT_SPEC.md` §7, Tier 2) — this
document is that middle tier.

## 0. What problem this solves, and what it deliberately is not

Every balance/dev-loop command today runs only through a prompt to Claude, because that's
the only interface that remembers the flags. The ask is a local dashboard that triggers the
**existing, already-trusted CLI commands** — nothing new gets built at the balance-logic
layer, and critically, **nothing here writes to source or config.** That's the load-bearing
difference from the deferred Tier 2 idea: this panel invokes `sweep.ts`/`aggregate.ts`/
`smoke-extract.ts`/`diff-cli.ts` exactly as a human would from a terminal, so every
provenance guarantee those scripts already produce (`rulesFingerprint`, `gitCommit`,
`productVersion` — `docs/balance/smoke/README.md`'s table) comes along for free, unchanged.
**The panel must never reimplement sweep/aggregate/extract/diff logic** — only invoke the
existing scripts as child processes and surface their stdout/exit code. Two implementations
of the same balance math drifting apart is a bug class this constraint exists to prevent
outright.

## 1. Command inventory — audited today, per `package.json`

| Command | Script | What it does |
| --- | --- | --- |
| `npm run balance:sweep -- <flags>` | `packages/sim/src/balance/sweep.ts` | The Monte Carlo sweep. Flags: `--label`, `--seeds`, `--seed-start`, `--days`, `--milestone-days`, `--policies`, `--shard i/N`, `--merge`, `--out`, `--aggregate-out` |
| `npm run balance:diff -- <flags>` | `packages/sim/src/balance/diff-cli.ts` | Diffs two aggregates. Flags: `--json`, `--fail-on-change`, `--epsilon` |
| `npm run balance:extract -- <flags>` | `packages/sim/src/balance/smoke-extract.ts` | Produces the committed smoke fixture. Flags: `--aggregate`, `--out`, `--date` |
| `npm run balance:smoke` | vitest | Fast regression check against the smoke fixture |
| `npm test` / `npx tsc -b` / `npm run lint` / `npm run format:check` | — | The standing gate every orchestrate task already runs |

These five rows are the panel's v1 surface. Packaging (`package:mac`/`package:win`/
`:demo`) and release (`release:verify`/`release:signoff`/`release:rc`) commands are
explicitly excluded — see §5.

## 2. Sharding, orchestrated

`balance:sweep`'s documented convention (`docs/balance/smoke/README.md`) is N shards run
**concurrently**, then `--merge` — "207s wall clock" for 8,000 runs sharded vs. a much
slower single-threaded run. The panel must reproduce this exactly: a "Run Sweep" action with
a shard-count field spawns N concurrent child processes (`--shard 1/N` … `N/N`), waits for
every one to exit 0, then runs the `--merge` invocation automatically. **Never falls back to
serial shards** — that would silently turn a 3-minute operation into a much longer one and
contradict the very convention doc that makes "re-measuring is cheap" true.

## 3. Output location and provenance

Ad hoc panel-triggered sweeps are **not committed** by default — they land in a gitignored,
timestamped run directory (e.g. `.scratch/balance/panel-runs/<label>-<timestamp>/`), same
"not a repo artifact" principle already applied to raw sweep rows. **Promoting a run to the
committed baseline of record is a separate, deliberate action** (a distinct panel button or,
more likely, a manual `git add`/commit the developer does themselves after reviewing the
result) — never automatic on sweep completion. This mirrors `docs/VERSIONING.md`'s own rule
that a version/baseline pointer move is "a deliberate act... as its own commit," not a side
effect of running a tool.

Every completed sweep in the panel offers a **"View Report"** action that opens the Tier 1
report generator against that run's output — the two specs are meant to be used together.

## 4. What the panel is, mechanically

A **dev-only local tool**, never bundled into the shipped Steam/desktop build or `dist-web`.
Given no server package exists anywhere in this repo (confirmed when scoping
`docs/PLAYTEST-TELEMETRY_SPEC.md`), this is new, small, local-only infrastructure: a Node
process (e.g. `npm run dev:panel`, analogous in spirit to how Vite's own dev server is
scoped) that spawns the child processes in §1 and serves a local-only UI
(`localhost`, no external network exposure) with:

- A command launcher — one form per row in §1's table, fields matching that command's real
  flags (no invented parameters).
- A live output stream for the running command (stdout/stderr as it happens, not just a
  final result — a 3-minute sweep needs visible progress).
- A run history — past invocations, their flags, exit code, output location, timestamp.

## 5. Non-goals

- **No config or source writes of any kind.** No lever, no constant, no game-balance value
  is editable from this panel — that is Tier 2, explicitly deferred
  (`docs/TELEMETRY-REPORT_SPEC.md` §7), and building it here would silently reintroduce the
  exact scope this document exists to avoid.
- **No packaging or release commands** (`package:*`, `release:*`) — those have real,
  externally-visible consequences (a built installer, a tagged release) and don't belong
  next to a "click to run a sweep" button where a misclick costs nothing on one row and
  something real on the next.
- **Never shipped in the production build.** A `grep` for the panel's entry point under
  `packages/desktop`'s packaging config and `packages/ui`'s `dist`/`dist-web` output should
  return nothing.
- **Does not replace the orchestrator's own gate.** `/orchestrate`'s per-task gate step
  keeps calling `npm test`/`tsc -b`/`npm run lint` directly, exactly as it does today — this
  panel is for ad hoc, human-triggered runs, not a dependency the deterministic task loop
  should couple to.
- Whether `lint:fix`/`format` (the one pair of commands in this ecosystem that write to
  source) belong in the panel is an **open design question for the implementation task**,
  not settled here — they're a different risk class than a lever (a routine, git-diff-visible
  mechanical change, never a silent balance edit), but the task should decide deliberately
  rather than include them by default.
- Does not implement anything. This document settles design; it modifies no source file.

## 6. Suggested acceptance shape for the implementation task

- Every command in §1's table is triggerable from the panel with real, validated flags (no
  flag invented that the underlying script doesn't accept — asserted by a test that the
  panel's flag set is a subset of each script's parsed argument list).
- A sweep run launches N shards concurrently (asserted by process-count/timing, not just
  reading the code) and only runs `--merge` after every shard exits 0.
- Panel output for a given run is byte-for-byte what the underlying CLI command would have
  produced run by hand — asserted by comparing panel-triggered output against a direct CLI
  invocation with identical flags/seed.
- A `grep` for the panel's server/entry point under `packages/desktop`'s electron-builder
  configs and any production build output returns nothing.
- No source file outside the panel's own new code is modified by running any panel action.
- Gate green.

---

## 7. §5's open question, SETTLED (T-143, 2026-08-01)

§5 left one question open for the implementation task: whether `lint:fix`/`format` — the one
pair of commands in this ecosystem that write to source — belong in the panel.

**Ruling: `lint:fix` and `format` are EXCLUDED. `lint` and `format:check` are INCLUDED**, as
part of §1 row 5's read-only gate row. Four reasons, in order of force:

1. **§6's acceptance criterion forbids them outright.** It requires that "no source file
   outside the panel's own new code is modified by running any panel action". `format` and
   `lint:fix` modify source by definition. There is no reading of that criterion under which
   they can ship.
2. **§5's own misclick argument applies unchanged.** The stated reason `package:*` and
   `release:*` are out is that a misclick "costs nothing on one row and something real on the
   next". A button that rewrites every file in the repo sitting beside a button that runs a
   read-only sweep is the same hazard with a smaller blast radius, not a different one.
3. **A repo-specific trap this document does not name.** `TASKS.md`'s standing constraints
   require `npm run format` to run **BEFORE** a batch capstone, never after, and
   `docsFingerprint` is a raw-byte hash over the hashed sources — so a formatter run reorders
   the capstone sequence and moves a recorded stamp. A one-click formatter next to a one-click
   sweep *manufactures* exactly the ordering mistake that constraint exists to prevent. The
   panel would create the hazard rather than mediate it.
4. §5's own counter-argument (`lint:fix`/`format` are "a routine, git-diff-visible mechanical
   change, never a silent balance edit") is accepted as true and is still insufficient:
   git-diff-visibility is a **recovery** property, not a **prevention** one, and (3) is
   invisible in a git diff.

The ruling is enforced in code, not only in prose: `assertNoWritingCommands` in
`packages/devpanel/src/commands.ts` runs at module load and throws if any row's npm script
matches `package:*`, `release:*`, `format` or `lint:fix`, and
`packages/devpanel/src/__tests__/commands.test.ts` asserts both the registry and the guard.

### 7.1 Corrections to §1's table (F-143-1)

§1's inventory was audited before two later changes landed, and the panel follows the **real
parsers** where the two disagree — §6's criterion is a property of the code, not of this prose:

- **`balance:sweep` also accepts `--trace-npc-decisions`** (T-140). It is offered by the panel
  and is refused for a sharded run, because `parseSweepArgs` throws when it is combined with
  the `--merge` the panel runs afterwards.
- **`balance:diff` takes two required POSITIONAL paths**, not flags alone: `parseDiffArgs`
  errors with "Expected exactly two aggregate paths". §1's row lists only `--json`,
  `--fail-on-change`, `--epsilon`.
- **`balance:report` (T-142) is a sixth row**, not in §1's five-row table because that table
  predates the Tier 1 generator. §3's "View Report" action is unimplementable without it.
- **`balance:sweep` had no root-level npm script** despite §1 quoting the root form
  (F-143-2). T-143 adds `"balance:sweep": "npm run balance:sweep -w @spacerquest/sim --"` to
  the root `package.json`, matching the precedent T-142 set for `balance:report`.

### 7.2 Two behaviours §3 implies and the implementation makes explicit

- **The panel points a blank `--out`/`--aggregate-out` at the run directory.** `sweep.ts`'s own
  default for `--aggregate-out` is `docs/balance`, so a panel sweep left on defaults would drop
  a committed-looking baseline into the repo on every ad hoc click — the opposite of §3. The
  injection is the only place the panel adds a flag, and it is rendered in the UI *before* the
  run starts and stored in `run.json`, so it is never invisible.
- **Promotion requires the exact `baseline-<label>.json` filename typed back**, is guarded by a
  pure allowlist (source inside the panel-runs root, destination inside `docs/balance`, basename
  matching `baseline-<slug>.json`), and **never runs git** — it returns the `git add`/`git commit`
  lines as text, per `docs/VERSIONING.md`'s rule that a baseline pointer move is its own
  deliberate commit.
