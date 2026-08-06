# Playtest Telemetry — spec for opt-in human playtest logging

**Spec only. No engine, content, sim, UI, or desktop source file is touched by this
document.** Written outside the 0.5.2 Explore/Hangout track (which owns `TASKS.md` while
it runs) so it is ready to schedule the moment that track's M4 checkpoint clears.
Companion: `docs/BALANCE-TELEMETRY_SPEC.md` (NPC decision tracing for simulated runs) — the
two share a trace-entry shape (§6) so one analysis pipeline can read both.

**Intended use, stated up front:** internal UAT and Alpha/Beta testing. OFF by default,
opt-in only, with explicit disclosure copy: **gameplay actions only — no personally
identifying information, no location.**

**INTERIM DEVIATION, CLOSED (T-250, 2026-08-06).** From `5b430136` (2026-08-03, "Playtest
logging defaults on for internal UAT" — an owner directive, so an internal UAT session
wasn't lost to a forgotten toggle) until T-250, the pre-public internal build shipped the
toggle defaulting **ON**, implemented as `!== 'off'` in `packages/ui/src/playtestLog.ts`'s
`isPlaytestLoggingEnabled`. **§3's OFF-by-default is live again as of 2026-08-06**: consent,
disclosure copy and opt-out were unchanged throughout, and only the virgin-profile default
ever moved. Internal UAT is unaffected — both tester briefs
(`docs/playtests/T-158-pre-uat-brief.md` §2 and `docs/playtests/T-198-pacing-brief.md` §2)
always instructed "turn logging ON — it is OFF by default", which the interim flip had been
silently contradicting. The restore is pinned by
`packages/ui/src/__tests__/playtest-log.test.ts` ("defaults OFF on a virgin profile"),
`packages/ui/e2e/playtest-logging.spec.ts` and `packages/desktop/e2e/shell.spec.ts`, each
asserting the default literally rather than reading it, so a future flip cannot land
silently.

## 0. Platform context

Steam-first, commercial, desktop shell (`docs/TECH-STACK.md` §3, Electron via
`packages/desktop`). Browser builds exist but are explicitly the dev/playtest loop, not the
shipped target. **No server or backend package exists anywhere in this repo today.** That
absence drives §5 below: this spec does not stand one up.

## 1. What gets captured

- **The action stream.** Every `PlayerAction` (`packages/engine/src/types.ts:1144`) passed
  to `applyPlayerAction` — the same public engine call `packages/sim/src/protocol.ts:1088`
  already wraps for its `apply-action` message, so this taps an existing, single, typed seam
  rather than inventing a second one. Each entry: day/turn number, the action's type and
  parameters, and the resulting `GameEvent[]` (`packages/engine/src/types.ts:249`) the engine
  already emits for it.
- **Manual annotations.** A "flag this moment" action (menu item and/or hotkey) that tags the
  current point in the stream with a player-typed free-text note. This is the bug-report /
  dead-end capture the ask names specifically.
- **Automatic error capture.** Anything `packages/ui/src/ErrorBoundary.tsx` catches is
  appended as its own entry kind, so a crash is in the exported log even if the player never
  thinks to flag it.

## 2. What is explicitly excluded

- No OS username, no hardware/device identifiers, no IP or location capture at the client.
- A **per-session random anonymous id**, generated fresh each session and never derived from
  Steam id, hardware id, or save data, and never written into the save file — lets multiple
  entries in one export be correlated with each other without identifying the player across
  sessions.
- Network upload is out of scope for this spec (§5) — if it is ever built later, the
  receiving server will unavoidably see the sender's IP at the transport layer regardless of
  what the client omits; that is a disclosure question for *that* future spec, not this one.

## 3. Consent and UX surface

- **OFF by default.** A settings/annotations menu toggle: "Enable Playtest Logging," with the
  disclosure copy stated above, verbatim or close to it.
- `packages/ui/src/` has no existing settings/menu component (checked — none found under that
  directory). **This is new UI surface**, not a hook into something that already exists.
- The toggle is a client preference, not game state — it must not round-trip through the save
  file or bump `CURRENT_SAVE_VERSION`. It belongs in the same local-preference layer
  `packages/ui/src/storage.ts`'s `KeyValueStore` (`storage.ts:78`) already provides for other
  non-save client state (that abstraction already spans the `browser`/`desktop`
  `StorageBackend` split — reuse it rather than add a third path).

## 4. Where it's stored

- **Desktop (the shipping target):** an append-only JSONL file under the existing
  `app.getPath('userData')` directory. `packages/desktop/src/main.ts:319` already resolves
  this for saves via `SQ_SAVE_DIR`; a sibling `SQ_LOG_DIR` (or a `logs/` subfolder of the
  same root) is the direct analog. Rotate per session so a long UAT campaign doesn't
  accumulate one unbounded file.
- **Browser (dev/playtest loop only):** no filesystem access, so the log accumulates
  in-memory or `IndexedDB` for the session's duration and is only ever materialized as a file
  at export time (§5).

**Desktop session JSONL under §3's OFF default (stated at T-250):** a session in which the
player never opts in writes **nothing at all** — no `logs/` directory and no session file.
`packages/desktop/src/playtestLog.ts` calls `mkdirSync` *inside* `append`, so both the log
directory (`main.ts`'s `resolveLogDir`: `SQ_LOG_DIR ?? app.getPath('userData')/logs`) and
`playtest-<sessionId>.jsonl` are created lazily by the first line the renderer sends. After
opt-in the file is appended line-by-line and unbuffered, one file per session, so the last
line before a crash is already on disk. Pinned by `packages/desktop/e2e/shell.spec.ts`'s
`expect(existsSync(logDir)).toBe(false)` after a real action taken before the toggle is
pressed.

## 5. Submission is explicit, never silent

Given §0's absence of any server anywhere in this repo, standing one up is a distinct,
larger feature (retention/deletion policy, its own disclosure, ongoing hosting) — **not**
part of this spec.

**Decision: a player-triggered export, not a background upload.** A menu action ("Export
Playtest Log") writes the session's captured stream to a JSON or CSV file, which the player
then attaches to a bug report or drops in a shared UAT intake location. This satisfies "bulk
processed for analysis" for internal UAT/Alpha/Beta without operating a collection service,
and it sidesteps every consent/PII question automatic upload would raise — nothing leaves the
player's machine until they take an action to send it.

Automatic background upload to a database remains a possible **future, separate** feature if
manual export proves insufficient once real UAT/Alpha/Beta use starts — it should get its own
spec (server design, retention policy, disclosure) rather than being folded in here.

## 6. Format

- **JSONL**, one entry per action/event/annotation/error. Schema-aligned with
  `docs/BALANCE-TELEMETRY_SPEC.md`'s trace entries where the underlying data overlaps
  (`PlayerAction` and `GameEvent` are shared engine types already) — a shared entry
  discriminant (`kind`) and a `day` field on both, so one downstream analysis pass can read
  simulated-NPC traces and human-playtest logs without a translation layer.
- **CSV** is a flattening of the same JSONL for anyone who wants a spreadsheet rather than a
  script — a converter over the settled JSONL shape, not a second capture path.

Suggested entry shape:

```
PlaytestLogEntry {
  sessionId: string        // random, per-session, never persisted to the save
  day: number
  kind: 'action' | 'annotation' | 'error'
  action?: PlayerAction    // when kind === 'action'
  events?: GameEvent[]     // the engine's own response to that action
  note?: string            // when kind === 'annotation'
  error?: string           // when kind === 'error' (message only, no stack trace with paths
                            //   that could leak the player's local username/filesystem)
}
```

Note on `error`: a raw stack trace can contain local file paths that embed an OS username —
strip or redact the path portion before writing, consistent with §2's PII exclusion.

## 7. Non-goals

- No save-shape change, no `CURRENT_SAVE_VERSION` bump.
- No engine change — every action/event this taps already flows through
  `applyPlayerAction`'s existing public surface. This is a UI/desktop-layer feature only.
  A `grep` for any new export from `packages/engine/src` should return nothing.
- No network, backend, or server component — deferred, explicitly, per §5.
- Does not implement anything. This document settles design; it modifies no source file.

## 8. Suggested acceptance shape for the implementation task

- The settings toggle defaults OFF and its state persists via `storage.ts`'s existing
  `KeyValueStore`, not the save file — asserted by a test that a save round-trip does not
  carry the toggle.
- With logging enabled, a test drives a sequence of real actions through
  `applyPlayerAction` and asserts the resulting JSONL contains one entry per action with the
  shape from §6.
- The manual "flag this moment" action and `ErrorBoundary` both produce their respective
  entry kinds, each asserted by a test.
- "Export Playtest Log" produces a file the player chooses the destination for (desktop) or
  downloads (browser) — no network call is made anywhere in the feature, asserted by a test
  or a static check over the diff.
- The disclosure copy shown at the toggle matches the wording settled here (gameplay actions
  only, no PII, no location) — a golden/snapshot test on the copy string.
- Gate green; no save version bump; no engine source file touched.
