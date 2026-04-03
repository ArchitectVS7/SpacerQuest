# SpacerQuest Playtest Design — v4.0

## Purpose

The scripted playtest agent exercises every player-accessible feature in SpacerQuest through the browser terminal UI exactly as a real player would. No API shortcuts. Every action is a keypress or typed input through xterm.js. The API is used only to read state for verification.

Output is a structured QA report: per-feature PASS / FAIL / SKIP / NOT REACHED with before/after state deltas.

---

## Architecture: Turn-Planner Model

### Why the old polling loop failed

The original engine ran a single loop of 800 steps. Every 400ms it read game state and ran a priority queue to decide what to do. The result:

- 700 of 800 steps in turn 1 were wasted (stale LOST IN SPACE text loop, then "registry untested → visiting" re-firing every step)
- Only 1 of 50 turns was ever started
- The engine had no concept of "I am currently doing X, wait until X finishes"
- Screen transitions used 300ms waits instead of `waitForScreen()`, causing false detections
- Priority queue re-evaluated from scratch every step — zero commitment to a plan

### The new model: Per-turn task list

```
for turn = 1..50:
  state = readState()              # one API call at turn start
  tasks = buildTurnPlan(state)     # decide ONCE what to do this turn
  for task in tasks:
    await executeTask(task)         # each task owns full flow start→finish
  await pressAndWait('D', 'main-menu')  # advance to next day
```

**Key invariants:**
1. Every task starts at the main-menu screen and ends at the main-menu screen
2. Each task uses `waitForScreen()` to confirm arrival — never 300ms hope
3. Once a task starts, it runs to completion or throws an exception
4. On exception, a `returnToMainMenu()` recovery helper handles escape
5. The turn planner decides the task list once per turn, never mid-task

---

## Turn Planning Algorithm

```typescript
function buildTurnPlan(state: GameSnapshot): TaskName[] {
  const plan: TaskName[] = [];

  // EMERGENCY: fix broken state first
  if (state.hullCondition < 3 && state.credits > 1000)
    plan.push('repair');

  if (state.fuel < 20 && state.credits > 500)
    plan.push('buy-fuel');

  // ACTIVE CARGO: deliver before doing anything else
  if (state.cargoPods > 0 && state.destination > 0 && state.fuel >= 10)
    plan.push('deliver-cargo');

  // UNTESTED FEATURES: cover in priority order
  if (!tested('pub.visit'))           plan.push('visit-pub');
  if (!tested('traders.buy_fuel'))    plan.push('buy-fuel');
  if (!tested('traders.sell_fuel') && state.fuel > 200)
                                      plan.push('sell-fuel');
  if (!tested('shipyard.view'))       plan.push('visit-shipyard');
  if (!tested('registry.visit'))      plan.push('visit-registry');
  if (!tested('bank.visit') && state.rank !== 'LIEUTENANT')
                                      plan.push('visit-bank');
  if (!tested('traders.accept_cargo') && state.cargoPods === 0)
                                      plan.push('get-cargo');
  if (state.cargoPods > 0 && state.fuel >= 10)
    plan.push('deliver-cargo');

  // FILL REMAINING TURN: keep playing toward untested features
  if (plan.length === 0) {
    if (state.fuel < 300)             plan.push('buy-fuel');
    if (state.cargoPods === 0)        plan.push('get-cargo');
    else                              plan.push('deliver-cargo');
  }

  return deduplicated(plan);
}
```

### NPC visit logic (system-specific)

The Wise One lives in system 17 and the Sage in system 18. The planner handles these as cargo-delivery side effects: when accepting a cargo contract, prefer destinations near 17/18. When delivering, if the ship arrives at 17 or 18, the task checks for and visits the NPC before returning to main menu.

---

## Task Specifications

### Task: `visit-pub`

```
1. pressKey('P') → waitForScreen('pub')
2. record pub.visit PASS
3. snap before → pressKey('B') → wait 600ms → snap after
   → credits decreased? PASS pub.drink; else FAIL
4. if credits > 200:
   pressKey('W') → waitForText(/How many rolls/)
   typeAndEnter('3') → waitForText(/Bet amount/)
   snap before → typeAndEnter('50') → wait 1500ms → snap after
   → credits changed? PASS pub.gamble; else FAIL
5. pressKey('M') → waitForScreen('main-menu')
```

### Task: `buy-fuel`

```
1. pressKey('T') → waitForScreen('traders')
2. pressKey('B') → waitForScreen('traders-buy-fuel')
3. snap before → typeAndEnter('200') → wait 800ms → snap after
   → fuel increased? PASS traders.buy_fuel; else FAIL
4. pressKey('Escape') → waitForScreen('traders')
5. pressKey('M') → waitForScreen('main-menu')
```

### Task: `sell-fuel`

```
1. pressKey('T') → waitForScreen('traders')
2. pressKey('S') → waitForScreen('traders-sell-fuel')
3. snap before → typeAndEnter('50') → wait 800ms → snap after
   → fuel decreased + credits increased? PASS; else FAIL
4. pressKey('Escape') → waitForScreen('traders')
5. pressKey('M') → waitForScreen('main-menu')
```

### Task: `get-cargo`

```
1. pressKey('T') → waitForScreen('traders')
2. pressKey('A') → waitForScreen('traders-cargo')
3. if Commandant prompt: typeAndEnter('N') → re-read screen
4. waitForText(/Manifest Board/)
5. typeAndEnter('1') → waitForText(/Are you sure/)
6. snap before → typeAndEnter('Y') → wait 600ms → snap after
   → cargoPods > 0? PASS traders.accept_cargo; else FAIL
7. pressKey('M') → waitForScreen('main-menu') [auto-redirect from traders]
```

### Task: `deliver-cargo`

```
1. record system before
2. pressKey('N') → waitForScreen('navigate')
3. typeAndEnter(destination) → handle fee/bribe prompts
4. waitForTravelComplete() — polls until screen = main-menu or combat
5. snap after
6. system changed? PASS nav.launch; else FAIL
7. cargoPods went 0? PASS nav.cargo_delivery
8. rank changed? PASS score.rank_advance
9. if arrived at system 17/18: check for NPC, visit if present
```

### Task: `visit-shipyard`

```
1. pressKey('S') → waitForScreen('shipyard')
2. record shipyard.view PASS
3. pressKey('R') → wait 800ms → snap after
   → condition improved OR already full? PASS shipyard.repair; else FAIL
4. if credits > 5000 + upgrade untested:
   pressKey('U') → waitForScreen('shipyard-upgrade')
   typeAndEnter(pickBestUpgrade()) → wait 800ms → snap after
   → component strength increased? PASS shipyard.upgrade; else FAIL
   pressKey('M') → waitForScreen('shipyard')
5. pressKey('M') → waitForScreen('main-menu')
```

### Task: `visit-registry`

```
1. pressKey('R') → waitForScreen('registry')
2. record registry.visit PASS
3. pressKey('S') → waitForScreen('space-patrol')
4. pressKey('A') → wait 600ms → read terminal
   → "patrol commission" or "orders" in text? PASS registry.patrol
   → else SKIP with reason
5. pressKey('Q') → waitForScreen('registry')
6. pressKey('Q') → waitForScreen('main-menu')
```

### Task: `visit-bank`

```
Precondition: rank !== 'LIEUTENANT'

1. pressKey('B') → waitForScreen('bank')
2. record bank.visit PASS
3. pressKey('D') → waitForScreen('bank-deposit')
   snap before → typeAndEnter(amount) → wait 600ms → snap after
   → credits decreased? PASS bank.deposit; else FAIL
   pressKey('Escape') → waitForScreen('bank')
4. pressKey('W') → waitForScreen('bank-withdraw')
   snap before → typeAndEnter('1000') → wait 600ms → snap after
   → credits increased? PASS bank.withdraw; else FAIL
   pressKey('Escape') → waitForScreen('bank')
5. pressKey('R') → waitForScreen('main-menu')
```

### Task: `repair`

```
1. pressKey('S') → waitForScreen('shipyard')
2. pressKey('R') → wait 800ms
3. pressKey('M') → waitForScreen('main-menu')
```

---

## Screen Transition Model

All navigation uses `waitForScreen(page, screenName, timeoutMs)` from `helpers/terminal.ts`.

| Action | From | Key | Wait for |
|--------|------|-----|---------|
| Open Traders | main-menu | T | traders |
| Buy Fuel | traders | B | traders-buy-fuel |
| Sell Fuel | traders | S | traders-sell-fuel |
| Cargo | traders | A | traders-cargo |
| Return | any | M or Q | main-menu |
| Open Shipyard | main-menu | S | shipyard |
| Upgrade | shipyard | U | shipyard-upgrade |
| Open Registry | main-menu | R | registry |
| Space Patrol | registry | S | space-patrol |
| Open Pub | main-menu | P | pub |
| WOF | pub | W | pub-wof (via text) |
| Navigate | main-menu | N | navigate |
| End Turn | main-menu | D | main-menu |

---

## Combat Handling (event-driven)

Combat occurs during travel — the engine doesn't initiate it. When `waitForTravelComplete()` detects screen=combat, control passes to `handleCombatRound()`:

```
each round:
  if hull < 2 → retreat (R) — PASS combat.retreat
  elif surrender untested + hull < 6 → surrender (S) — PASS combat.surrender
  else → attack (A) — PASS combat.attack

if VICTORY text → PASS combat.victory
loop until screen = main-menu
```

---

## Recovery Protocol

Any task that throws or ends up in an unexpected screen calls `returnToMainMenu()`:

```typescript
async returnToMainMenu(): Promise<void> {
  const attempts = ['M', 'Q', 'Escape', 'Q', 'Escape'];
  for (const key of attempts) {
    await pressKey(page, key);
    await page.waitForTimeout(500);
    const screen = await detectScreen(page);
    if (screen === 'main-menu') return;
  }
  // Last resort: reload page
  await page.reload({ waitUntil: 'load' });
  await waitForScreen(page, 'main-menu', 15000);
}
```

---

## Feature Coverage Map

| Feature | Task | How Triggered |
|---------|------|---------------|
| nav.launch | deliver-cargo | travel to destination |
| nav.cargo_delivery | deliver-cargo | cargoPods→0 on arrival |
| nav.hazard | deliver-cargo | text match post-travel |
| nav.encounter | deliver-cargo | screen=combat during travel |
| nav.malfunction | deliver-cargo | text match post-travel |
| combat.attack | deliver-cargo event | attack each round |
| combat.retreat | deliver-cargo event | hull < 2 |
| combat.surrender | deliver-cargo event | hull < 6, untested |
| combat.victory | deliver-cargo event | VICTORY text |
| shipyard.view | visit-shipyard | arrive at shipyard |
| shipyard.upgrade | visit-shipyard | credits > 5000 |
| shipyard.repair | visit-shipyard | press R |
| traders.buy_fuel | buy-fuel | fuel purchased |
| traders.sell_fuel | sell-fuel | fuel sold |
| traders.accept_cargo | get-cargo | contract signed |
| bank.visit | visit-bank | arrive at bank |
| bank.deposit | visit-bank | press D |
| bank.withdraw | visit-bank | press W |
| pub.visit | visit-pub | arrive at pub |
| pub.drink | visit-pub | press B |
| pub.gamble | visit-pub | play WOF |
| registry.visit | visit-registry | arrive at registry |
| registry.patrol | visit-registry | press S → patrol HQ |
| npc.sage | deliver-cargo | arrive at system 18 |
| npc.wise_one | deliver-cargo | arrive at system 17 |
| score.rank_advance | deliver-cargo | rank changed |

---

## Turn Budget

- 50 turns total
- 5-7 tasks per turn average
- Each task: 3-10 seconds
- Travel: up to 30 seconds
- Total expected time: 10-15 minutes

Turns 1-5: cover all core features (pub, fuel, shipyard, registry, cargo, delivery)
Turns 6-15: repeat cargo loops for score/rank advancement, bank unlock
Turns 16-30: bank features, NPC visits (need cargo to right systems)
Turns 31-50: combat coverage from travel encounters, rank advancement

---

## Definition of Done

A feature is **PASSED** when:
- The action was performed through the terminal UI
- API state changed as expected (verified with before/after snapshot)
- Result recorded in PlaytestReport

A feature is **FAILED** when:
- The action was performed through the terminal UI
- API state did NOT change as expected
- This indicates a likely game bug

A feature is **SKIPPED** when:
- The game legitimately prevents the action (e.g. bank requires Commander rank)
- Not a bug

A feature is **NOT REACHED** when:
- The turn budget ran out before this feature was attempted

---

## Invariants to Preserve

1. **Never call API endpoints to perform actions** — reading state is fine, mutating is not
2. **All `waitForTimeout` replaced by `waitForScreen` or `waitForText`** where possible
3. **Terminal text matching uses `.slice(-600)`** to avoid false positives from stale content
4. **State snapshots taken immediately before and after** each action (within same task)
5. **Turn ends by pressing D** — never by calling an API
