# Tier 2 Implementation Plan + Integration Test Expansion

## Context & Principles

**Architecture recap:** Player presses key → socket `screen:input` → screen-router → `screen.handleInput()` → returns `{ output, nextScreen?, data? }` → socket `screen:render` back to client. State lives in Prisma, not ephemeral objects. Combat uses a hybrid of screen UI + socket events + REST routes.

**"Done" definition for this session:** A feature is complete when:
1. A player can trigger it through normal terminal gameplay (screen navigation or docking menu)
2. The route/screen calls the existing game system logic
3. State changes persist to the database
4. Integration tests verify the wiring (not just pure logic)

---

## Part A: Tier 2 Feature Implementation

### Feature 4: Combat Disconnect Mitigation (Medium)

**What exists:** `combat-state.ts` has `createCombatState()`, `isCombatActive()`, `resolveCombatOnDisconnect()`. `CombatSession` Prisma model is complete. Combat routes exist at `/api/combat/engage` and `/api/combat/action`.

**What's missing:**
1. Combat engage route doesn't create a CombatSession record
2. Socket `disconnect` handler (game.ts:184) is empty — doesn't resolve combat
3. No reconnect flow to show the player what happened

**Implementation steps:**

1. **Wire CombatSession creation into `POST /api/combat/engage`** (routes/combat.ts)
   - After generating enemy encounter, call `createCombatState()` and persist via `prisma.combatSession.create()`
   - Store player stats + enemy stats + `active: true`

2. **Wire disconnect handler in `game.ts`**
   - On socket `disconnect`: look up active CombatSession for the character
   - If found: call `resolveCombatOnDisconnect()`, update CombatSession with result, apply outcome to character/ship via Prisma
   - Mark session `active: false`

3. **Wire reconnect check into screen flow**
   - At the start of `main-menu` render: check for any `CombatSession` where `active: false` and `result` is set but not yet displayed
   - If found: show combat resolution summary before normal menu, then clear the session
   - This mirrors the original: "on next login, show what happened"

4. **Wire combat completion into `POST /api/combat/action`**
   - When combat ends (victory/defeat/retreat), mark CombatSession `active: false` with result
   - This ensures normal combat endings also clean up the session

**Files to modify:** `src/app/routes/combat.ts`, `src/sockets/game.ts`, `src/game/screens/main-menu.ts`

---

### Feature 5: Jail System Wiring (Medium)

**What exists:** `jail.ts` has `isJailed()`, `jailPlayer()`, `releasePlayer()`, `canPayFine()`, `payFine()`, `calculateBailCost()`. Character model has `crimeType` field. Spacers Hangout shows brig roster (read-only).

**What's missing:**
1. No jail screen (where jailed players land)
2. No fine payment route
3. No bail route
4. Smuggling patrol interception (wired in Tier 1) doesn't set crimeType or jail the player
5. Main menu doesn't redirect jailed players

**Implementation steps:**

1. **Create jail screen** (`src/game/screens/jail.ts`)
   - Renders: "BRIG OF ADMIRAL JURIS P. MAGNUS" header
   - Shows crime type and fine amount (from `CRIME_FINES[crimeType]`)
   - Options: `(P)ay Fine` — calls payFine logic inline, deducts credits, clears crimeType, removes J% prefix; `(W)ait` — redisplay
   - Register in screen-router

2. **Add fine payment route** (`POST /api/character/jail/pay-fine`)
   - Validate character is jailed (crimeType != null)
   - Call `canPayFine()` to check credits
   - Call `payFine()` to deduct, then clear crimeType and remove J% prefix
   - Add to `src/app/routes/character.ts`

3. **Add bail route** (`POST /api/character/jail/bail/:targetId`)
   - Validate caller has 2x fine credits
   - Call `calculateBailCost()`, deduct from caller, clear target's crimeType
   - Add to `src/app/routes/character.ts`

4. **Wire smuggling defeat → jail** in `src/app/routes/economy.ts`
   - In the existing smuggling patrol interception block (cargoType === 10): when patrol intercepts, also set `crimeType: 5` (SMUGGLING) and prepend J% to name via `jailPlayer()`
   - This is a 3-line addition to the existing interception code

5. **Wire login redirect** in `src/game/screens/main-menu.ts`
   - At the top of `render()`: check `character.crimeType != null`
   - If jailed: return `{ nextScreen: 'jail' }` instead of showing menu

6. **Wire bail option into Spacers Hangout brig display**
   - After showing jailed players, add `(B)ail #[spacer-id]` option
   - handleInput for 'B' prompts for spacer ID, calls bail route

**Files to modify:** `src/app/routes/economy.ts` (3 lines), `src/app/routes/character.ts` (2 new routes), `src/game/screens/main-menu.ts` (jail redirect), `src/game/screens/spacers-hangout.ts` (bail option), `src/sockets/screen-router.ts` (register jail)
**Files to create:** `src/game/screens/jail.ts`

---

### Feature 6: Bulletin Board Screens + API Routes (Medium)

**What exists:** `bulletin-board.ts` has `canAccessBoard()`, `validateMessage()`, `formatBulletinPost()`. `BulletinPost` Prisma model is complete with alliance + authorName + message + createdAt.

**What's missing:**
1. No API routes to read/write/delete posts
2. No terminal screen
3. Not linked from Spacers Hangout

**Implementation steps:**

1. **Create bulletin board API routes** (in `src/app/routes/character.ts` or new file)
   - `GET /api/alliance/board` — list posts for caller's alliance (uses `canAccessBoard()`)
   - `POST /api/alliance/board` — write a post (uses `validateMessage()`, `formatBulletinPost()`), persists via `prisma.bulletinPost.create()`
   - `DELETE /api/alliance/board` — kill all posts for caller's alliance (board wipe, original SP.TOP.S `(K)ill msgs`)

2. **Create bulletin board screen** (`src/game/screens/bulletin-board.ts`)
   - Renders alliance board header ("Confidential Bulletins For [Alliance] Members Only")
   - Shows recent posts (last 20, newest first)
   - Options per original SP.TOP.S: `(R)eread`, `(W)rite msg`, `(K)ill msgs`, `(Q)uit`
   - R: re-fetches and displays posts
   - W: switches to input mode, accepts 79-char message, calls POST route inline via Prisma
   - K: confirms then calls DELETE inline
   - Q: returns to spacers-hangout
   - Register in screen-router

3. **Add public news board to Spacers Hangout**
   - New option `(N)ews` in Hangout menu
   - Queries recent `GameLog` entries, formats as BBS-style posts
   - No alliance restriction — public board

4. **Link alliance bulletin from Spacers Hangout**
   - When player presses `(A)lliance` and is in an alliance, show sub-option `(B)ulletin Board`
   - Routes to bulletin-board screen with alliance context

**Files to create:** `src/game/screens/bulletin-board.ts`
**Files to modify:** `src/sockets/screen-router.ts`, `src/game/screens/spacers-hangout.ts`, `src/app/routes/character.ts` (or new `src/app/routes/alliance.ts`)

---

### Feature 7: Alliance UI + Rule Enforcement (Medium-Large)

**What exists:** `alliance-rules.ts` has `canJoinAlliance()`, `isAllianceFull()`, `calculateSwitchCost()`. `alliance.ts` has invest/withdraw/DEFCON logic. Routes exist for invest/withdraw. `PUT /api/character/alliance` exists but skips all validation.

**What's missing:**
1. Join route doesn't call `canJoinAlliance()` — no rank check, no cap, no switch cost
2. No interactive join UI in Spacers Hangout (currently says "Use PUT /api/character/alliance")
3. No investment screen for DEFCON/treasury management

**Implementation steps:**

1. **Enforce rules in `PUT /api/character/alliance`** (routes/character.ts)
   - Import and call `canJoinAlliance(character.rank, allianceType, totalPlayers, alliancePlayers)`
   - If switching: call `calculateSwitchCost()`, deduct all credits, remove port ownership
   - Reject if alliance is full (1/3 cap)
   - This is modifying ~20 lines in an existing route

2. **Make Spacers Hangout alliance join interactive**
   - Replace "Use PUT /api/character/alliance to join" with actual terminal flow
   - When player presses `(A)lliance`: show alliance list with symbols
   - Sub-menu: `(+)Astro League`, `(@)Space Dragons`, `(&)Warlords`, `(^)Rebels`
   - On selection: validate via `canJoinAlliance()`, show confirmation with cost if switching
   - On confirm: call the existing PUT route logic directly (Prisma update, create AllianceMembership)
   - Show result: "Welcome to the [Alliance Name]!" or rejection reason

3. **Create alliance investment screen** (`src/game/screens/alliance-invest.ts`)
   - Only accessible to alliance members
   - Shows: current alliance, invested credits, owned systems, DEFCON levels
   - Options per original SP.VEST.S:
     - `(I)nvest` — deposit credits into alliance treasury
     - `(W)ithdraw` — withdraw from treasury
     - `(D)EFCON` — increase defense level for a system (100K-200K per level)
     - `(S)ystems` — show alliance-controlled systems with DEFCON levels
     - `(Q)uit` — back to main menu
   - Calls existing `investInAlliance()`, `withdrawFromAlliance()`, `investInDefcon()` from alliance.ts
   - Register in screen-router, accessible from main menu when in an alliance

4. **Add same-alliance PvP protection**
   - In `POST /api/combat/engage`: check if target and attacker share an alliance
   - If same alliance: reject with "Cannot attack alliance members"
   - Small addition (~5 lines) to combat route

**Files to create:** `src/game/screens/alliance-invest.ts`
**Files to modify:** `src/app/routes/character.ts` (enforce rules), `src/game/screens/spacers-hangout.ts` (interactive join), `src/game/screens/main-menu.ts` (alliance-invest menu option), `src/sockets/screen-router.ts` (register), `src/app/routes/combat.ts` (PvP protection)

---

## Part B: Integration Test Expansion

### Philosophy

The current test suite has **475 tests across 24 files** — all unit tests or mocked-DB tests. Zero tests verify that a player can actually reach a feature through gameplay. The Tier 1 integration tests (tier1-integration.test.ts) were a good start but only verify source code wiring via file reads.

We need tests at three levels:

1. **Route integration tests** — verify routes call game systems, persist results, return correct responses
2. **Screen flow tests** — verify screen-router resolves screens, screens render for correct systems, input handlers transition correctly
3. **Socket wiring tests** — verify disconnect/reconnect handlers fire, combat events flow end-to-end

### Test files to create/expand:

#### 1. `tests/tier2-combat-disconnect.test.ts` (new)
- CombatSession created when combat engaged
- CombatSession resolved when socket disconnects during active combat
- Combat result displayed on reconnect (main-menu check)
- Normal combat end cleans up CombatSession
- Player not in combat → disconnect does nothing

#### 2. `tests/tier2-jail-integration.test.ts` (new)
- Smuggling patrol interception sets crimeType + J% prefix
- Jailed player redirected to jail screen on main-menu render
- Fine payment clears jail state (crimeType, J% prefix)
- Bail payment by another player clears target's jail
- Insufficient credits → fine payment rejected
- Spacers Hangout brig displays jailed players

#### 3. `tests/tier2-bulletin-board-integration.test.ts` (new)
- Board screen registered in screen-router
- Alliance member can read their board
- Non-member cannot access another alliance's board
- Post creation persists to BulletinPost table
- Message validation rejects > 79 chars
- Kill operation wipes board
- Board accessible from Spacers Hangout

#### 4. `tests/tier2-alliance-integration.test.ts` (new)
- Join route enforces rank requirement
- Join route enforces 1/3 cap
- Switch cost deducts all credits + removes ports
- Spacers Hangout shows interactive join menu
- Alliance invest screen registered and renders for members
- DEFCON investment calls existing investInDefcon()
- Same-alliance PvP blocked in combat engage

#### 5. `tests/screen-flow-integration.test.ts` (new — covers ALL existing screens)
- Every screen in screen-router has render() and handleInput() that are callable
- Main menu [B/S/P/T/N/R/Q] all resolve to correct nextScreen
- System-gated screens (Wise One @17, Sage @18, Hangout @1) reject wrong systems
- Combat screen renders with action menu
- Navigate screen accepts system ID input
- Bank deposit/withdraw flow transitions correctly

#### 6. `tests/route-wiring-integration.test.ts` (new — covers ALL existing routes)
- Every route file imports and calls its corresponding game system
- Navigation arrive calls hazard check (exists in tier1 but expand)
- Cargo deliver calls smuggling check (exists in tier1 but expand)
- Combat engage generates encounter from combat.ts
- Economy fuel buy calls getFuelPrice + calculateFuelBuyCost
- Shipyard upgrade calls upgradeShipComponent
- Alliance invest calls investInAlliance/investInDefcon

#### 7. Expand `tests/tier1-integration.test.ts`
- Add tests for the Wise One screen enforcing system 17 + rendering number key
- Add tests for the Sage screen enforcing system 18 + sageVisited + answer validation + reward persistence

---

## Implementation Order

The features have dependencies that dictate ordering:

```
Phase 1: Foundation wiring (no cross-feature dependencies)
  ├─ 7a. Alliance rule enforcement in join route (unblocks everything alliance-related)
  ├─ 5a. Jail screen + fine payment route (self-contained)
  └─ 6a. Bulletin board API routes (self-contained)

Phase 2: Screen creation (depends on Phase 1 routes)
  ├─ 7b. Spacers Hangout interactive join UI (needs 7a)
  ├─ 7c. Alliance investment screen (needs 7a)
  ├─ 6b. Bulletin board screen + Hangout link (needs 6a)
  └─ 5b. Smuggling → jail wiring + login redirect (needs 5a)

Phase 3: Combat disconnect (most complex, fewest dependencies)
  ├─ 4a. CombatSession creation in engage route
  ├─ 4b. Socket disconnect handler
  └─ 4c. Reconnect display in main-menu

Phase 4: Integration tests for all of the above
  ├─ Tier 2 feature tests (4 files)
  ├─ Screen flow tests (1 file, all screens)
  └─ Route wiring tests (1 file, all routes)

Phase 5: Verify
  └─ Run full test suite, lint, review against PRD/DESIGN_REVIEW
```

## Estimated Scope

- **New files:** 5 (jail screen, bulletin board screen, alliance invest screen, + test files)
- **Modified files:** ~10 (routes, screens, screen-router, game.ts)
- **New tests:** ~80-100 integration tests
- **Risk areas:** Combat disconnect is the most complex (socket lifecycle). Alliance join UI requires careful terminal input handling for multi-step flow.
