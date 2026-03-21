# verify-module

Perform a line-by-line fidelity audit of one original ACOS-BASIC source module against the modern TypeScript implementation, then fix all discrepancies until the original source, modern code, tests, and PRD are in full alignment.

## Invocation

`/project:verify-module <MODULE_NAME>`

Example: `/project:verify-module SP.CARGO`

---

## Allowed Deviations (do NOT flag these as bugs)

1. BBS-only features removed
2. Bot/NPC player system added (not in original)
3. Trip limit: original = 2 trips/day → modern = 2 trips/turn
4. Named variables used instead of single-letter originals (functionally equivalent)
5. Math adjusted for 32-bit precision where original was 8-bit limited — **the formula must be functionally equivalent, not literally identical**

Everything else must match the original exactly: menus, flow, checks, formulas, side effects, error messages.

---

## Step 1 — Read source files

Read these files in parallel before doing any analysis:
- `Decompile/Source-Text/<MODULE_NAME>.txt` — the original ACOS-BASIC source
- All modern files that correspond to this module (check `src/game/systems/` and `src/game/screens/`)
- `PRD.md` — the current requirements document (project root)
- Any existing test file(s) for this module in `spacerquest-web/tests/`

If you are unsure which modern files correspond to the module, read the first 30 lines of each candidate file to identify it.

---

## Step 2 — Line-by-line comparison

Work through the original source top to bottom. For each labeled section or subroutine, verify:

1. **Menu options** — every key/command the original accepts must exist in the modern handler
2. **Validation logic** — every `if` guard in the original (rank checks, credit checks, stat checks) must be present and use equivalent values
3. **Formulas** — every calculation must be functionally equivalent (see deviation #5 above)
4. **Side effects** — every variable mutation the original performs (stat changes, credit changes, cargo state, mission flags) must be replicated
5. **Flow** — entry points, goto targets, subroutine calls must map to equivalent screen transitions and function calls
6. **Messages** — key flavor text and error messages should match the original's intent; exact wording is not required but the meaning must be preserved

Keep a running list of discrepancies as you find them before making any changes.

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

If any discrepancy could not be fixed (e.g., requires a schema migration or major architectural change), list it under:

```
### Blocked — Needs Discussion
- [description and why it's blocked]
```

---

## Important constraints

- Never bypass a failing test with `--no-verify` or by deleting the test
- Never mark a module complete while tests are failing
- If a fix is too large to complete in one session, stop and report what was done and what remains
- Cross-reference `USERS-MANUAL.md` and `GAME-ACTIONS.md` (project root) if the original source is ambiguous
