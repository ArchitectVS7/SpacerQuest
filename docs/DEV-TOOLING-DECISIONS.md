# Dev Tooling & Telemetry — standing rulings

**Status:** Standing decisions for the instrument-side tooling — NPC decision telemetry,
playtest telemetry, the balance report generator and the dev control panel — harvested
2026-08-02 from the 0.5.2/0.5.3 task log. Design records:
`docs/BALANCE-TELEMETRY_SPEC.md`, `docs/PLAYTEST-TELEMETRY_SPEC.md`,
`docs/TELEMETRY-REPORT_SPEC.md`, `docs/DEV-CONTROL-PANEL_SPEC.md`.

The common thread: **none of this ships to a player, and none of it may change what it
measures.** Fingerprint classification for these files is ruled in
`docs/BALANCE-RIG-DECISIONS.md` BR-5/BR-6.

---

## 1. NPC decision telemetry

**DT-1 — §4's open design question is settled as design (a): CALLBACK INJECTION.** (T-140)
`pickIntent` / `pickContract` take an optional trailing `NpcDecisionTraceSink` rather than
always returning the distribution. The alternative — an optional committed aggregate — is
DECLINED (`docs/BALANCE-TELEMETRY_SPEC.md` §7.2): the report generator already computes the
statistic over the JSONL, and computing it twice would make one copy stale.

**DT-2 — Three structurally cheaper routes were rejected on correctness, not convenience:**
engine-level ambient state set from the un-hashed `sweep.ts`; routing the sink through the
deliberately un-hashed UGT adapter; and narrowing `SIM_INSTRUMENT_DIRECTORIES`. See BR-6 —
**code structure may never be chosen to control a fingerprint.** (T-140)

**DT-3 — An instrument-only seam added to shared engine code must be provably ABSENT from
every shipped root, by a test.** The carrier identifiers are forbidden under `packages/ui`
and `packages/desktop` by a source-scan test, not by a grep someone has to remember to run.
(T-140)

---

## 2. Playtest telemetry

**DT-4 — Submission is a PLAYER-TRIGGERED EXPORT only. No network transport exists anywhere
in the feature.** (T-141, `docs/PLAYTEST-TELEMETRY_SPEC.md` §5) There is no server in this
repository, and standing one up is a distinct feature owing its own disclosure and retention
policy. "Nothing leaves the player's machine until they take an action to send it" is the
property the whole consent story rests on; export (JSON/CSV) is the only egress.

**DT-5 — The append-only session log lives in a `logs/` directory kept as a SIBLING of
`saves/`** (overridable by `SQ_LOG_DIR`, else `join(app.getPath('userData'), 'logs')`), never
inside `saves/`, so save enumeration can never pick up a log file. (T-141)

**DT-6 — The toggle persists through `KeyValueStore`, never the save file.** Telemetry state
sits deliberately outside the save contract, so enabling or disabling logging owes no
`CURRENT_SAVE_VERSION` bump and no migration. (T-141)

**DT-7 — The `sq-playtest:append` IPC channel is sender- and payload-validated and SILENTLY
DROPS rather than throws on failure**, matching the pre-existing swallow-on-write contract
for non-career data. **A diagnostic must never be able to break the game it is observing.**
(T-141)

**DT-8 — Crash entries are message-only and redacted — no stack, no payload.** Crash capture
is a telemetry entry kind, not an error reporter. (T-141)

**DT-9 — An absence guarantee is proved by TWO tests, not one.** (T-141) A runtime test
installs throwing spies on every transport and runs a real export through them (covering the
paths the suite exercises); a source scan looks for a transport by name (covering the paths
it does not). **A runtime spy cannot see a branch nobody took, and a source scan cannot see
an alias.** The scan lives in `packages/ui` but covers `packages/desktop` too — on the
`npc-trace-absent.test.ts` precedent — so one scan owns the whole surface and cannot be half
deleted.

---

## 3. The balance report generator

**DT-10 — Never attach the current tree's fingerprint to an input artefact.** (T-142) See
BR-28. Sidecar stamps render attributed as declared by the sidecar file, never by the
aggregate; `compareRulesets` is three-state and `unknown` may never render as `same`.

**DT-11 — A generator reports an input-shape gap rather than closing it by quietly adding a
field to `aggregate.ts`.** (T-142 §6) The mitigation ships on the generator side (a
`--provenance` sidecar); the real fix is assigned to the artefact's writer.

**DT-12 — The report is built ON `diffAggregates`, read and reused, not reimplemented.**
(T-142) `formatAggregateDiff`'s "NO MEASURED VALUE MOVED" distinction and its
`shapeChanges` block are preserved in the rendered page.

**DT-13 — Chart colour follows the ENTITY, not the chart.** A policy/archetype is assigned a
palette slot once, from the sorted union of every name in the report, so a name keeps one hue
across the leaderboard and the trace charts. Past the eighth slot, names fold to a neutral
rather than generating a ninth hue. (T-142)

**DT-14 — The leaderboard scales to the BAR maximum;** the pooled fleet figure for
row-summed metrics is an off-scale caption. **Rejected:** folding the sum-of-all-bars into
the scale, which squashed all eight bars against the axis. (T-142)

**DT-15 — `sampleWarning` is a DISPLAY HEURISTIC and explicitly not one of
`docs/BALANCE-POLICY.md`'s governed bands.** The section copy quotes the
`BALANCE-REDESIGN-WORKLIST.md` Appendix A lesson — passed at n=100, failed at n=1,000.
(T-142)

**DT-16 — Contract options are BOARD INDICES.** (F-140-2) The axis is labelled "board index
— which offer on that day's board, never which cargo", and an index is never pretty-printed
as a good. (T-142)

---

## 4. The dev control panel

**DT-17 — The panel ships as a sixth workspace, `packages/devpanel/`.** (T-143) NOT under
`packages/sim/src`, which is a hashed root with a totality guard that throws on any
undeclared subdirectory *and* is the instrument root — a `devpanel/` there would either break
every fingerprint computation or fold a process-spawning dev tool into
`instrumentFingerprint`. NOT a repo-root `tools/` either, because neither the eslint config
(`packages/*/src/**`) nor `tsc -b` covers it without editing the two files that decide what
the gate checks. A workspace gets lint, typecheck and `npm test --workspaces` for free and is
invisible to packaging.

**DT-18 — The panel performs no action that modifies a source file outside its own code.**
(§6; settled §5 open question, T-143) `lint` and `format:check` are IN; **`lint:fix` and
`format` are EXCLUDED**, enforced by `assertNoWritingCommands`, which runs at module load and
throws on any `package:*` / `release:*` / `format` / `lint:fix` row. The repo-specific trap
is decisive: the standing constraints require `npm run format` BEFORE a batch capstone, and
`docsFingerprint` is a raw-byte hash, so **a one-click formatter beside a one-click sweep
manufactures the exact ordering mistake that constraint exists to prevent.**

**DT-19 — Zero runtime dependencies and zero workspace dependencies:** a `node:http` server,
no framework, no bundler, no client library, live output over SSE because the browser
implements `EventSource` natively. Root wiring is three lines. (T-143)

**DT-20 — Promotion to baseline NEVER runs git.** It requires the exact
`baseline-<label>.json` filename typed back, copies one file guarded by a pure
`assertPromotionTarget` allowlist, and returns the `git add`/`git commit` lines as TEXT —
because per `docs/VERSIONING.md` a baseline pointer move is its own deliberate commit.
(T-143)

**DT-21 — Security posture required of any local dev server that spawns processes:**
explicit `listen(port, '127.0.0.1')` (Node's default publishes to the LAN), a `Host`-header
allowlist (loopback binding alone does not stop DNS rebinding), a per-process random token on
every POST (the only verbs that spawn or copy), `shell: false` everywhere, and a
`resolve()`-then-`startsWith(root + sep)` traversal guard on the static route. (T-143)

**DT-22 — The panel injects exactly ONE flag and no others:** a blank `--out` /
`--aggregate-out` pointed at the run directory as an ABSOLUTE path, rendered in the UI before
the run and stored in `run.json`. Required because `sweep.ts`'s own `--aggregate-out` default
is `docs/balance` (a defaulted panel sweep would drop a committed-looking baseline into the
repo on every ad hoc click) and because `npm run … -w @spacerquest/sim` runs with cwd =
`packages/sim`, so a relative `--out` lands in `packages/sim/.scratch/`. (T-143)

**DT-23 — Byte-for-byte equivalence between panel-triggered and hand-typed runs is compared
UNMASKED on stdout and on artifacts** (raw `Buffer.equals`); only stderr is compared with
elapsed-time masking, because `sweep.ts` writes `… elapsed` and so its stderr is not
byte-stable against itself. **That is a property of the instrument and explicitly not licence
to widen the stdout/artifact comparisons.** (T-143)
