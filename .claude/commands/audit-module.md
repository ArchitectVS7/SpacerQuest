# audit-module

Perform a line-by-line fidelity audit of one original ACOS-BASIC source module against the modern TypeScript implementation, then document all discrepancies. This is strictly an auditing task — no coding authorized.

## Invocation

`/project:audit-module <MODULE_NAME>`

Example: `/project:audit-module SP.CARGO`

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

Use this table to identify which modern files correspond to the module being audited. Do not guess — consult this first.

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

Work through the original source top to bottom. For each labeled section or subroutine, verify:

1. **Menu options** — every key/command the original accepts must exist in the modern handler
2. **Validation logic** — every `if` guard in the original (rank checks, credit checks, stat checks) must be present and use equivalent values
3. **Formulas** — every calculation must be functionally equivalent (see deviations #5–7 above)
4. **Side effects** — every variable mutation the original performs (stat changes, credit changes, cargo state, mission flags) must be replicated
5. **Flow** — entry points, goto targets, subroutine calls must map to equivalent screen transitions and function calls
6. **Messages** — key flavor text and error messages should match the original's intent; exact wording is not required but the meaning must be preserved

---

## Step 3 — Report

Output a summary in this format:

```
## audit-module: <MODULE_NAME> — COMPLETE

### Discrepancies Found
- [description of each discrepancy with original line reference and suggested fix]

### Verified Correct (no changes needed)
- [list of sections that were already correct]
```

If the module is fully correct with no discrepancies, output:

```
### Discrepancies Found
- None
```

If a discrepancy requires a schema migration or major architectural change:

(1) List it under:

```
### Blocked — Needs Discussion
- [description and why it's blocked]
```

(2) Append `OPEN_ITEMS_COMPLETE.md` by adding the item under an appropriate section with a BLOCKED label.

---

## Additional Consideration

- Cross-reference `USERS-MANUAL.md` and `GAME-ACTIONS.md` (project root) if the original source is ambiguous
