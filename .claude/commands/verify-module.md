# verify-module

Perform a line-by-line fidelity audit of one original ACOS-BASIC source module against the modern TypeScript implementation, then fix all discrepancies until the original source, modern code, tests, and PRD are in full alignment.

## Invocation

`/project:verify-module <MODULE_NAME>`

Example: `/project:verify-module SP.CARGO`

---

## Allowed Deviations (do NOT flag these as bugs)

1. BBS-only features removed (GBBS file structure, carrier dropout penalty, idle timer nudge)
2. Bot/NPC player system added (not in original)
3. Trip limit: original = 2 trips/day → modern = 2 trips/turn
4. Named variables used instead of single-letter originals (functionally equivalent)
5. Math adjusted for 32-bit precision where original was 8-bit limited — **the formula must be functionally equivalent, not literally identical**
6. Cargo payment formula simplified: modern uses `pods × rate` (linear) instead of original `(v2*d6)/3 + (f2*5) + 1000`. Intentionally approved — result is comparable.
7. Auto-Repair Module grants +10 BF combat bonus instead of per-round +1 condition repair. Intentionally approved.

Everything else must match the original exactly: menus, flow, checks, formulas, side effects, error messages.

---

## Module-to-File Mapping

Use this table to identify which modern files correspond to the module being verified. Do not guess — consult this first.

| Original Module | Modern File(s) |
|---|---|
| SP.ARENA1 + SP.ARENA2 | screens/arena.ts, systems/arena.ts |
| SP.BAR | screens/spacers-hangout.ts, screens/raid.ts |
| SP.BLACK | systems/black-hole.ts, screens/shipyard-special.ts, screens/black-hole-hub.ts |
| SP.CARGO | screens/traders-cargo.ts, systems/economy.ts |
| SP.DAMAGE | systems/repairs.ts, screens/shipyard.ts |
| SP.DOCK1 + SP.DOCK2 | systems/docking.ts, screens/sage.ts |
| SP.END | systems/end-turn.ts, screens/end-turn.ts |
| SP.FIGHT1 + SP.FIGHT2 | systems/combat.ts, screens/combat.ts |
| SP.GAME | systems/gambling.ts, screens/pub.ts |
| SP.LIFT | screens/navigate.ts, systems/travel.ts |
| SP.LINK | screens/main-menu.ts |
| SP.MAL | systems/combat.ts (Maligna/Nemesis missions) |
| SP.REAL | screens/traders-*.ts, systems/economy.ts |
| SP.REG | systems/registry.ts, screens/registry.ts |
| SP.SAVE | screens/bank*.ts |
| SP.SPEED | systems/upgrades.ts, screens/shipyard-upgrade.ts |
| SP.START | screens/main-menu.ts |
| SP.TOP | systems/topgun.ts, screens/bulletin-board.ts |
| SP.VEST | screens/alliance-invest.ts, systems/alliance.ts |
| SP.WARP | systems/travel.ts, systems/hazards.ts |
| SP.YARD | screens/shipyard.ts, screens/shipyard-upgrade.ts |
| SP.EDIT1 | screens/admin-players.ts, screens/admin-menu.ts — sysop player list/view/edit (L/S/V/W/E/D/I); writer/default/inact are BBS file I/O; modern equiv is app/routes/admin.ts |
| SP.EDIT2 | screens/admin-npcs.ts, screens/admin-systems.ts — pirate/patrol/port/alliance file editor; NPC stat tables in game/constants.ts; port data via app/routes/admin.ts |
| SP.EDIT3 | screens/admin-config.ts, systems/game-config.ts — configure (battle difficulty ff, rounds qq, attack thresholds jw/jx, min/max ju/jv); reset and file-manager subroutines are BBS-only deviations |
| SP.PATPIR | jobs/encounter-generation.ts, systems/hazards.ts — encounter activator (K1-K9 pirate stats, SP1-SPZ patrol stats); `black` subroutine (transit damage + alien weapon find) in systems/hazards.ts and systems/black-hole.ts |
| SP.SYSOP | screens/admin-menu.ts, screens/admin-logs.ts, app/routes/auth.ts, systems/registry.ts — sysop menu (V/G/F/K/N/B/P/A/T/1/2/3); `newspcr` new-player init in auth.ts + registry.ts registerCharacter; port eviction in systems/economy.ts checkPortEviction; topgun update in systems/topgun.ts |

---

## Step 1 — Read source files

Read these files in parallel before doing any analysis:
- `Decompile/Source-Text/<MODULE_NAME>.txt` — the original ACOS-BASIC source
- All modern files that correspond to this module (use the mapping table above)
- `PRD.md` — the current requirements document (project root)
- `GAME-ACTIONS.md` — authoritative player behavior reference (project root); use for resolving intent when source is ambiguous
- Any existing test file(s) for this module in `spacerquest-web/tests/`
- The summary line of `OPEN_ITEMS_COMPLETE.md` (project root) — to know what is already ✅ DONE for this module. Do not re-flag items listed as ✅ DONE unless you can demonstrate a regression.

---

## Step 2 — Line-by-line comparison

⚠️ **Do NOT make any code changes during this step.** Produce the full discrepancy list first. Premature fixes cause missed comparisons and scope drift.

Work through the original source top to bottom. For each labeled section or subroutine, verify:

1. **Menu options** — every key/command the original accepts must exist in the modern handler
2. **Validation logic** — every `if` guard in the original (rank checks, credit checks, stat checks) must be present and use equivalent values
3. **Formulas** — every calculation must be functionally equivalent (see deviations #5–7 above)
4. **Side effects** — every variable mutation the original performs (stat changes, credit changes, cargo state, mission flags) must be replicated
5. **Flow** — entry points, goto targets, subroutine calls must map to equivalent screen transitions and function calls
6. **Messages** — key flavor text and error messages should match the original's intent; exact wording is not required but the meaning must be preserved

Keep a running list of discrepancies as you find them. When the full source has been read, output the discrepancy list before proceeding to Step 3.

---

## Step 3 — Fix code

For each discrepancy:

- Fix `src/game/systems/<file>.ts` and/or `src/game/screens/<file>.ts` as appropriate
- If a formula is wrong, cite the original line number and show the before/after
- If a feature is entirely missing, implement it
- Do not add features not present in the original
- Do not change things that are already correct

After all fixes, run:
```
cd spacerquest-web && npm run build
```
Fix any TypeScript compilation errors before proceeding.

---

## Step 4 — Fix or write tests

For each fix made in Step 3, verify there is a test that would catch a regression:

- If a test already exists and covers the fixed behavior: verify it now passes
- If no test covers it: write one in the appropriate test file under `spacerquest-web/tests/`
- Tests must test behavior, not implementation — test what the game does, not how the code is structured
- For formula fixes: test the formula with values from the original source (use the exact variable values from original examples where possible)

Run all tests:
```
cd spacerquest-web && npm test
```

All tests must pass. Do not mark complete if any test fails.

---

## Step 5 — Update PRD.md

Open `PRD.md` in the project root. For each system touched in Step 3:

- If the PRD accurately describes the now-correct behavior: no change needed
- If the PRD is missing a requirement: add it under the relevant section
- If the PRD describes something incorrectly: correct it
- If the PRD describes a feature that does not exist in the original and is not an approved deviation: flag it and remove it

Do not rewrite sections that are already accurate. Surgical edits only.

---

## Step 6 — Report and mark complete

Output a summary in this format:

```
## verify-module: <MODULE_NAME> — COMPLETE

### Discrepancies Fixed
- [description of each fix with original line reference]

### Tests Added/Modified
- [list of test names]

### PRD Changes
- [list of PRD edits, or "None"]

### Verified Correct (no changes needed)
- [list of sections that were already correct]
```

If any discrepancy could not be fixed (e.g., requires a schema migration or major architectural change):

(1) List it under:

```
### Blocked — Needs Discussion
- [description and why it's blocked]
```

(2) Append `OPEN_ITEMS_COMPLETE.md` by adding the item under an appropriate section with a BLOCKED label.

---

## Important constraints

- Never bypass a failing test with `--no-verify` or by deleting the test
- Never mark a module complete while tests are failing
- If a fix is too large to complete in one session, stop and report what was done and what remains
- Cross-reference `USERS-MANUAL.md` and `GAME-ACTIONS.md` (project root) if the original source is ambiguous
