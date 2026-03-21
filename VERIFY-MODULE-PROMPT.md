# Copy-paste prompt: verify-module

Use this if `/project:verify-module` is not available in the session.
Paste this block followed by the module name on the next line.

---

Perform a line-by-line fidelity audit of the original ACOS-BASIC source module **[MODULE_NAME]** (e.g. SP.CARGO) against the modern TypeScript implementation, then fix all discrepancies until original source, modern code, tests, and PRD are in full alignment.

**Allowed deviations — do NOT flag these:**
1. BBS/Sysop-only features removed
2. Bot/NPC player system added (not in original)
3. Trip limit: original 2/day → modern 2/turn
4. Named variables instead of single-letter originals
5. Math adjusted for 32-bit precision — must be functionally equivalent, not literally identical

**Workflow:**

**Step 1 — Read in parallel:**
- `Decompile/Source-Text/[MODULE].txt`
- All modern files for this module (`src/game/systems/` and `src/game/screens/`)
- `PRD.md` (project root)
- Existing tests in `spacerquest-web/tests/` for this module

**Step 2 — Line-by-line comparison. For each section/subroutine verify:**
- Every menu key/command the original accepts
- Every validation guard (rank, credit, stat checks) with equivalent values
- Every formula — functionally equivalent results
- Every side effect (stat changes, credits, cargo state, mission flags)
- Every screen transition / goto equivalent
- Key error messages and flavor text (meaning, not exact wording)

Keep a running list of discrepancies before making any changes.

**Step 3 — Fix code.** For each discrepancy: fix `systems/` and/or `screens/` as needed. Cite original line numbers. Run `npm run build` and fix all TypeScript errors before continuing.

**Step 4 — Fix or write tests.** For each fix: verify an existing test covers it, or write one. Run `npm test`. All tests must pass before marking complete. Do not delete tests.

**Step 5 — Update PRD.md.** Surgical edits only: add missing requirements, correct wrong ones, remove anything that contradicts the original and isn't an approved deviation.

**Step 6 — Report:**
```
## verify-module: [MODULE] — COMPLETE

### Discrepancies Fixed
### Tests Added/Modified
### PRD Changes
### Verified Correct (no changes)
### Blocked — Needs Discussion
```

Do not mark complete if any test is failing.
