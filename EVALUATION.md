# SpacerQuest Web — Intake & Evaluation

**Date:** 2026-06-30
**Scope:** Faithfulness of the 1:1 web remake, frontend↔backend wiring, playthrough readiness, and design opportunities.
**Method:** Live boot of the stack (Postgres :5454 + Redis :6380 + server :3000), unit-test run, live rendering of 26 screens against seeded data, plus three cross-checked code audits (faithfulness, wiring/reachability, playtest coverage).

---

## Verdict

**This is a genuinely high-fidelity, working remake — far past "mostly complete."** The server boots cleanly, 1860/1863 unit tests pass, 48 of 52 game screens are reachable and render against real data, and the signature single-player twist (the computer plays the other 20 spacers' turns) is fully implemented against the live game systems, not stubbed. The code is unusually disciplined: nearly every function cites the originating 1991 Applesoft BASIC subroutine and line numbers.

You can play this today. The gaps are about **completeness of access** (a few features are implemented but not reachable through the UI) and **modern UX**, not about a broken core.

---

## 1. Health — does it run?

| Check | Result |
|---|---|
| Postgres + Redis (docker compose) | ✅ Up; DB seeded (28 systems, 65 NPCs, 12 users incl. bots) |
| Server boot (`npm run dev:server`) | ✅ Clean — listening :3000, WS + worker bridge up |
| Health endpoint | ✅ 200 |
| Dev login (`/auth/dev-login`) | ✅ 302 + JWT |
| Unit tests (`npm test`) | ⚠️ **1860/1863 pass** — see below |
| Live screen render (26 screens) | ✅ All render without error against seeded data |

**The 3 failing unit tests are not code bugs:**
1–2. `functional-requirements.test.ts` — two assertions hardcode the **old** travel-time multiplier (`×3`); the code was deliberately changed to `×1` for playtest speed (`constants.ts:167`). The tests were not updated. **Fix:** have the test read `TRAVEL_TIME_MULTIPLIER` instead of a literal, or decide the final value (see Design §6).
3. `tier1-integration.test.ts` — an unhandled rejection because it needs Postgres on :5454. With the DB up (as now), it resolves. **Fix:** mark DB-dependent tests as integration-only, or ensure the test DB is started in CI.

> Per project rules these should not be left red. They are ~10-minute fixes; I held off because fix #1 depends on the open travel-time design decision below.

---

## 2. Faithfulness to the 1991 original

No subsystem is missing or majorly divergent. Classification:

| Subsystem | Verdict | Note |
|---|---|---|
| Economy (cargo, fuel, credit hi/lo math) | ✅ Faithful | Original `pay1-4`, `upod`, `fcost`, fuel tables, 2900/20000 caps reproduced |
| Navigation & travel | ✅ Faithful + 1 modern add | Fuel/hazard/course-change/3-trip-cap intact; **travel is now real-time wall-clock** (was instant) |
| Combat | ✅ Faithful + 1 modern add | Roster-driven encounters, retreat, 5 tribute/surrender paths; **adds a rank battle-factor bonus** the original lacked (flagged in-code) |
| Ranks & scoring | ✅ Faithful | `sc=floor(score/150)`, even preserves the original `sc=14` gap bug; 10,000 Conqueror reset |
| Special equipment (Cloaker, Auto-Repair, Star-Buster, Arch-Angel, Astraxial) | ✅ Faithful logic | All five exist and have functional effects + mutual-exclusion rules — **but Cloaker has no UI to activate it (see §3)** |
| Gambling (Wheel of Fortune, Spacer's Dare) | ✅ Faithful | Lives in `pub.ts`, reachable via `[P]` |
| Alliances (join/invest/bulletin/ports) | ✅ Faithful | DEFCON tiers, takeover cost, per-alliance boards |
| Rescue / Lost-in-Space | ✅ Faithful | Self-rescue cost scaled & capped; player-to-player salvage |
| Special locations (Wise One, Sage, jail/bail, black hole, Andromeda) | ✅ Faithful | Constellation quiz, bail = 2× fine, NGC cargo tables transcribed |

**The deliberate departures from 1991 (all flagged in code):**
1. **Real-time travel** — `distance × 1s` wall-clock wait. Biggest behavioral change; a multiplayer-era design choice. (Design §6.) *(Since resolved to a fixed ~3s wait — §6.1.)*
2. ~~**Rank combat bonus**~~ **RESOLVED 2026-07-01 (removed).** `RANK_BF_BONUS` was dropped from `calculateBattleFactor` — the original `ranfix` has no rank term, and because rank is derived from ever-growing score, the bonus made PvE *compound-easier* the longer you played (rank power stacked on top of ship upgrades, flattening the difficulty curve). Combat power is now tied to **ship investment** as the original intended. The constant is kept `@deprecated` for reversibility; not used in arena duels (those use arena handicap).
3. ~~**Single-contract cargo bonus is approximated**~~ **RESOLVED 2026-07-01.** The player manifest board (`generateManifestBoard` via `traders-cargo`) now implements the faithful SP.CARGO.S "stat delivery" bonus: one random "port X needs cargo Y" demand attaches to whichever of the 4 manifests matches (`ie = |dest−origin|×1000`, cap 10000), advertised on the board and added to `cargoPayment` only when the player signs that specific manifest. The unfaithful ~25% random stand-in was removed from the single-contract path (`generateCargoContract`) — the bonus is a board-only mechanic, so a lone contract/bot pick correctly gets none. The two code paths no longer disagree. Tests: `functional-requirements` (bonus invariants + no-bonus on the single path) and `playtest-coverage` (`cargo.delivery_bonus` — signing the advertised manifest pays payment+bonus via keystrokes).

> **§2.2 — Rank combat bonus: RESOLVED (removed 2026-07-01).** Decision made to remove it. Rationale: rank is derived from ever-growing score, so a rank-based combat bump compounds with ship upgrades and makes PvE progressively *easier* — the opposite of a rising difficulty curve. Combat power is now tied to ship investment (credits spent, with opportunity cost), faithful to the original `ranfix`. `calculateBattleFactor` no longer applies `RANK_BF_BONUS` (kept `@deprecated` for reversibility). All 1916 tests pass; the `core.test.ts` "rank bonus" test now asserts rank does **not** change the battle factor.

> **§3/§4 — Player-side port ownership (assessed 2026-07-01):** largely a non-issue. The player screens (`port-accounts`, `fuel-depot*`) call the same `economy.ts` functions (`purchasePort`/`sellPort`/price/bank) that bots use; `systems/port-ownership.ts` is only a thin bot-facing re-export of those plus a `collectPortDividends` stub. Player port management (buy / set fuel price / deposit-withdraw bank / sell) is covered by keystroke tests (`port.buy`, `port.set_fuel_price`, `port.sell`). The only genuinely thin piece is the unimplemented dividend stub, which neither side depends on.

---

## 3. Wiring audit — is every action reachable from the UI?

**Architecture:** the React frontend is a thin xterm terminal. Keystrokes → socket `screen:input` → `screen-router.ts` → server screen module → `{output, nextScreen}` back. A second channel (REST `/api/navigation/arrive` → `screenOverride`) enters arrival screens. **48 of 52 screens are player-reachable.**

### ❌ Dead screens — implemented but unreachable through any channel
1. ~~**`cloaker-toggle`**~~ **RESOLVED 2026-06-30.** The Cloaker is now wired end-to-end: a cargo/smuggling hostile encounter with `hasCloaker` routes to the `cloaker-toggle` screen; the ON path calls `/api/navigation/cloaker-resolve` (cloak → fight skipped; malfunction → combat); OFF → combat. Backend was already complete — only the three frontend hooks (`App.tsx` travel-complete routing + `cloaker-resolve` interception, `Terminal.tsx` echo suppression) were missing. Verified live: cargo cloaks, smuggling malfunctions on a weak cabin.
2. **`spacers-hangout`** + **`raid`** — **RESOLVED 2026-06-30 (this was the biggest hidden gap).** Both port SP.BAR.S; `pub.ts` is a *partial* (gambling/gossip) version that became `[P]`, while the fuller `spacers-hangout.ts` (825 lines: info broker, **alliance joining**, brig/bail, smuggling completion, alliance `raid`) was orphaned. Critically, **the Hangout is the *only* screen where a player can JOIN an alliance** — so the entire alliance system (join → invest → bulletin → DEFCON → raid) was locked out of the terminal, which is why the old playtest had to join via an API cheat. Fixed by adding a conditional `[H]angout` main-menu option at Sun-3 (System 1), matching the Wise One/Sage pattern (the screen already self-gates to Sun-3). Verified live: enter Hangout → Info → `ALL` → join Astro League → `[U]pdate Board` and `[I]nvest` then unlock. `raid` is reachable via Info → `RAI`.
3. ~~**`black-hole-event`**~~ **RESOLVED 2026-06-30.** The Great Void weapon-enhancement event (SP.PATPIR.S "black") is now reachable. On the Andromeda black-hole crossing the arrive handler routes the player into the event (`screenOverride='black-hole-event'`) and suppresses any coincident encounter so this one-shot moment can't be preempted by combat. The original's undocumented spacebar trigger is replaced with a **discoverability nudge** ("Investigate the derelict craft? [Y]/(N)") — see the full design analysis in §7. Investigating still costs the authentic exit-stress damage and the reward stays gated on the Wise One's Number Key; all paths continue to `andromeda-dock`. Verified live: decline → clean exit; investigate → `Navigation damaged -2`; wrong key → empty space; correct key → install → `hasWeaponMark` set (the +150 Maligna-battle weapon).

### 🪦 Dead code
- ~~**`systems/combat-display.ts`**~~ **DELETED 2026-06-30.** Confirmed zero importers (a parallel combat renderer the live `combat` screen never used — it renders inline). Removed the module and its 27-test file; suite stays green (1836 tests, exit 0). Recoverable from git history if a combat-UI refactor ever wants it.

### ℹ️ Not orphans, but easy to mistake for them
- `andromeda-dock`, `nemesis-lattice`, `black-hole-hub` are reachable **only** via the REST arrival `screenOverride` (`routes/navigation.ts:552-579`), never via `nextScreen`. Fine — just invisible to a naïve graph trace.

### ℹ️ Backend surface not used by the player UI
- 7 of 10 REST route groups (`combat, economy, ship, social, missions, alliance, admin`) have **no frontend caller** — the live game is socket/screen-driven; these exist for bots/tests. Not a bug, but dead surface area to be aware of.
- `systems/port-ownership.ts` is imported **only by bots** — player port screens don't use it. Player-side port ownership management is thin (see §4).

**Main menu itself is clean:** all 20 advertised keys have handlers; no dead keys.

---

## 4. What works / what doesn't / what's weak

**Works well**
- Full trade→travel→combat→upgrade loop, end-to-end, through the terminal.
- The bot world: 20 profiled simulated players (aggression/greed/caution/etc.) run 3 real trips each on end-turn — trading, traveling, fighting the real combat engine, joining alliances, bailing *real* jailed players, and (enhanced mode) buying ports, posting duels, rescuing stranded humans.
- Special-equipment effects, alliances/DEFCON, gambling, rescue, jail, Sage/Wise One — all implemented faithfully.

**Doesn't work / unreachable**
- **Cloaker activation** (dead screen — bought but unusable).
- **`spacers-hangout` / `raid` / `black-hole-event`** screens (unreachable).
- Most recent recorded *scripted* playtest failed stuck at the auth screen — a **frontend timing flake** (dev-login works server-side), but the browser playtest harness is currently not green.

**Weak / approximated**
- Player-side **port ownership** management is thinner than the bot side (no system import from player screens).
- Single-contract cargo bonus approximation (§2.3) makes two code paths disagree.
- Rank combat bonus unbalances PvE in the player's favor vs. the original.

---

## 5. What's needed for a full playthrough touching every feature

Automated player-facing coverage today is **~45–55 of ~163 actions (≈30–34%)** — matching the project's own `plan.md` baseline of 56/163. The strategic test (`09-browser-game-agent.spec.ts`) is rule-based (not the LLM player in `tests/e2e/playtest/`), runs 50 turns, and passes if just 20 of 38 tracked actions fire — many gated on random encounters, so coverage is non-deterministic.

**To reach a full feature-touching playthrough, these high-value actions are currently never exercised by a player path:**
1. **Cloaker** — first needs a reachable activation UI (§3.1), then a smuggling-with-cloaker run.
2. All **5 special-equipment purchases** (test only *views* the menu) and **condition** (vs strength) upgrades.
3. **Jail loop** as a player: accept contraband → arrest → pay fine / post bail.
4. **Alliance Investment Center** actions: invest / withdraw / DEFCON funding / Alliance Raid (only the screen is viewed).
5. **Port ownership** as a player: buy / set fuel price / landing fees / sell (only bots do this).
6. **Missions:** Space Patrol, Smuggling run, **Nemesis (sys 28)**, **Maligna (sys 27)** boss battles, black-hole transit to **Andromeda** — none exercised.
7. **Bulletin board** read/write, **Arena dueling** post/accept, **Rescue Service** as a player (only bots touch these).
8. **Combat surrender** as a resolved outcome, and **travel hazards / course changes** — make these deterministic in tests instead of leaving them to RNG.

**Recommended path to "100/163":** (a) fix the Cloaker UI and the 2 dead-screen entries so those features are reachable at all; (b) convert the gated/RNG playtest steps to deterministic forced scenarios; (c) add player-path tests for jail, ports, investment, and the two boss missions.

### Progress — headless coverage playtest (2026-06-30)
Added **`tests/playtest-coverage.test.ts`**: a deterministic playthrough that drives a single character through the game via the exact **keystroke path** (`handleScreenInput`/`handleScreenRequest` on the screen-router — the same code the socket handler runs for every keypress). No REST shortcuts; every action goes through the screens and asserts a **real effect** (credits/fuel/DB state changed, membership persisted, flags set), honoring the project's "test the UX, never the API" rule. It runs in the normal `npm test` suite (needs Postgres, like the tier1/tier2 tests).

**32 high-value actions now covered deterministically** (was RNG-gated or never reached), including everything wired this session:
- Economy: buy/sell fuel, **accept + sign a cargo contract**, check contract
- Bank: deposit, withdraw, **transfer** (member), Commander gate
- Shipyard: upgrade, repair, **special-equipment purchase** (Auto-Repair)
- **Spacers Hangout → Info broker → JOIN ALLIANCE** (persisted) → menu unlock
- Alliance: investment center, bulletin board (both reachable only after join)
- Wise One (**Number Key** persisted), Sage (constellation challenge)
- **Great Void**: decline / correct-key reward (`hasWeaponMark`) / wrong-key
- **Cloaker toggle** (space → ON → engage)
- **Jail**: pay fine → released
- **Extra-curricular**: pirate mode (+ lurk sector), star patrol
- **Port ownership**: buy the docked port
- Registry (Patrol HQ, Library), Pub (drink, Wheel, Dare)

The suite asserts a **regression floor of 30 actions** and hard-fails if any session-wired feature (alliance join, Void reward, Cloaker, invest) regresses. `npm test` = **1869 passing, exit 0**.

### Update — RNG seams + boss/endgame coverage (2026-06-30, this session)
Extended the headless playtest from **32 → 50 deterministic actions** and raised the regression floor to **45**, closing every gap this section listed. `npm test` = **1887 passing, 48 files, exit 0.**

**Forced-RNG seam (no default-gameplay change).** Added an injectable `rng` (defaults to `Math.random`) to `generateHazard` (`systems/hazards.ts`), and extracted the arrival hazard resolution out of the `POST /api/navigation/arrive` route into a reusable, testable `resolveArrivalHazards(characterId, rng?)` in `systems/travel.ts` (the route now delegates to it — behavior-preserving; the source-wiring tests were updated to the new location). This makes travel hazards deterministically testable through the real arrival mechanism. Combat **surrender & retreat** turned out to need no seam — `attemptRetreat` always succeeds and `calculateTribute` is pure — so they are driven directly through the `combat` screen keystrokes against a fixtured `CombatSession`.

**Newly covered, all through the keystroke path (or the exact server mechanism the client triggers), asserting real effects:**
- **Combat outcomes:** `[R]`etreat → RETREAT, `[S]`urrender credit-tribute → credits deducted + SURRENDER, smuggling surrender → criminal record + cargo confiscated, `[C]`loak escape, and a deterministic **DEFEAT** via an overwhelming enemy.
- **Travel hazards (forced roll):** unshielded component damage (→ Drives) after a real Navigation-screen launch; shielded shield-drain via the 10% branch.
- **Course changes:** the involuntary nav misfire (precision-0 nav → guaranteed off-course arrival) through the Navigation screen; the manual mid-transit reroute via `processCourseChange` (fuel spent + destination changed).
- **Boss missions end-to-end:** **Nemesis** (sys 28) win → the crystal-lattice puzzle (`INFINITY`) grants +25 score, 150,000 cr, STAR-BUSTER++/ARCH-ANGEL++; **Maligna** (sys 27) win with the Great-Void weapon mark (+150) → +105 score, +100,000 cr, teleport to Vega-6. Overwhelming-ship fixture makes the SP.MAL fight a deterministic win (no fight seam needed).
- **Andromeda transit:** `black-hole-hub` `[L]`aunch to an NGC system (missionType 10 → sys 21-26); `andromeda-dock` cargo load (manifest `X`).
- **Arena:** roster view + duel cancel via keystrokes (challenge/accept/**resolve are REST-only** in this build — the arena screen prints `Use: POST /api/duel/...` — so the lifecycle is exercised at the screen's real keystroke actions against seeded duel data, not faked over HTTP).
- **DEFCON funding:** `alliance-invest` `F`ortify flow raises `AllianceSystem.defconLevel` and draws from system assets.
- **Rank progression:** a Space Patrol payoff (`space-patrol` render) recalculates rank from the new score.

### Update — Single-player Arena: async PvP with bots (2026-07-01)
**RESOLVED — the arena is now a working async PvP loop, no longer REST-only.** The 1991 mechanic (a Contender posts a challenge and *logs off*; whoever arrives next fights the stored ship) is mapped onto our turn structure: the player posts and ends their turn, and during `runAllBotTurns` the bots decide — strategically or foolishly, by personality — whether to accept it, and post their own for the player to answer next turn.

- **Shared duel module** `systems/duel.ts` (`createDuelChallenge`/`acceptDuelChallenge`/`resolveDuel`/`cancelDuel`/`expireStaleDuels`, rng-injectable); the three REST endpoints are now thin wrappers over it; `simulateDuelCombat` gained an rng seam.
- **Bots** `bots/bot-arena.ts` — `botArenaPhase` (accept + post) in `executeBotTurn`; a personality decision model (`perceivedWinProb = truth + aggression-bias + misjudgement-noise`) makes brave bots take bad duels and cautious bots hold back; stale postings are expired+refunded.
- **Human keystrokes** `screens/arena.ts` — the *"use the API"* stubs are gone: **(1) Contender** posts via stakes→arena→confirm (with credit escrow), **(2) Challenger** lists open postings and accepts+resolves one (9-salvo log + result).
- **Economics fix** — credit stakes escrow/transfer coherently in ×10,000-cr units (`DUEL_CREDIT_UNIT`); a resolved credit duel is now a conservative symmetric ±v transfer (previously escrows were mis-scaled and never returned — a permanent double-loss bug).
- **Tests** `tests/arena-pvp.test.ts` (8): human post (POINTS + CREDITS escrow), withdraw+refund, human accept+fight, deterministic bot accept (aggressive) vs decline (cautious), credit conservation, expiry+refund. Full design in `ARENA_DESIGN.md`.

### Update — §5 player-path coverage push complete (2026-07-01)
Extended the headless playtest from **50 → 69 deterministic actions** (regression floor 45 → 60); `npm test` = **1913 passing, 49 files, exit 0.** Every §5 item that lacked a keystroke test now has one, each asserting a real DB effect:

- **Special equipment** — all five installs (Star-Buster, Arch-Angel, Morton's Cloaker, Trans-Warp, Astraxial) via `shipyard-special`, plus a **condition-repair vs strength-upgrade** distinction (repair restores condition to 9 without touching strength).
- **Jail post-bail** — bail another spacer out of the Hangout brig (target released, payer charged 2× fine).
- **Alliance** — **withdraw** from the treasury (member credits up, treasury down) and the full **Alliance Raid** arc: accept via the `raid` screen → win the SP.MAL kk=4 battle (`processDocking`) → activate the conquest at the Investment Center (`AllianceSystem` transfers to the raider's alliance).
- **Port ownership** — owner **sets the fuel price** at the depot and **sells** the port (ownership removed, credits returned). *(Landing fees have no owner-facing screen — auto-computed at lift-off; noted, not a gap.)*
- **Smuggling run** — take a Syndicate contraband contract (Info → SMU) and collect the payout on delivery at the Hangout.
- **Space Patrol** — the full commission arc Join → pick sector → confirm → Launch (hands off to `combat` as a patrol).
- **Bulletin write** — a member posts to the alliance board (`BulletinPost` persisted).
- **Rescue Service** — rescue a stranded spacer (target recovered; rescuer charged fuel + gains points) and self-rescue.

One small screen fix landed with this: `alliance-invest` `render` now clears transient multi-step flow state (the DEFCON fortify loop previously leaked `pendingDefcon` across a re-entry).

> **⚠ This paragraph was superseded — see the 2026-07-01 status reconciliation below.** It was written mid-session and listed items that later commits in the same day resolved. Kept for history; the current status is the reconciliation entry that follows.

**Now genuinely remaining** (faithfulness follow-ups, not coverage): the single-contract cargo-bonus approximation — two code paths disagree (§2.3); the rank-combat-bonus balance decision (§2.2); thin player-side port ownership vs the bot side (§4); and the flaky browser test 09 / LLM-playtest harness (§4). The design "big wins" in §6 (onboarding, the full "while you were away" digest, economic-goal surfacing, rank-curve tuning) remain open by design. The headless test is the reliable regression net.

### Status reconciliation — head-of-branch as of 2026-07-01
The "Now genuinely remaining" list above is **stale**: it was written before the day's final commits, several of which closed items it names. Reconciled against the actual source at `HEAD`, and re-verified with a full `npm test` = **1940 passing, 51 files, exit 0** (the headless playtest now covers **70** deterministic actions; regression floor 60 → **66**, plus the newly-added end-turn/Galactic-News-Wire keystroke test).

**Resolved since that paragraph was written (verified in code):**
- **Cargo-bonus disagreement (§2.3)** — RESOLVED (`a07608e2`). Board bonus `ie = min(|dest−origin|×1000, 10000)` (`economy.ts:103`); single-contract path sets `deliveryBonus = 0` (`economy.ts:239`). The two paths no longer disagree.
- **Rank-combat-bonus decision (§2.2)** — RESOLVED (`bebce707`). `calculateBattleFactor` returns `weaponPower + shieldPower + r9` with no rank term (`combat.ts:324`); `RANK_BF_BONUS` kept `@deprecated`.
- **"While you were away" digest (§6.3)** — DONE (`9586d124`). `bots/galactic-digest.ts` → `end-turn.ts:79`.
- **Economic-goal surfacing (§6.4)** — DONE (`7620ba17`). `player-goals.ts selectObjective` + dashboard on `main-menu.ts`; risk/reward Rim contracts (`RIM_PAY_PREMIUM=1.4`, Commander+armed gate).
- **Rank-curve tuning (§6.5)** — RESOLVED (bonus removed; rewards are prestige/access/Rim-unlock).

**Genuinely still open — a short, mostly by-design tail:**
- *Deferred by design:* scripted guided first-turn tutorial (§6.2 — the "what do I do now?" `Objective:` driver is done; the scripted tutorial is not); fuel-arbitrage best-buy/sell advisor on `port-fuel-prices` (§6.4 nicety, confirmed absent); Great Void quest expansion (§7 — explicitly "do not expand now"); the `collectPortDividends` stub (§4 — nothing depends on it).
- *One real loose end (not by design):* the flaky **browser test 09 / LLM-playtest harness** (§4). No `.skip` markers, but it's separate from the green vitest suite and not confirmed passing. This is the only outstanding non-deferred item.

---

## 6. Bonus — biggest design "big wins" (highest payoff first)

This game predates ~30 years of design refinement. The most impactful modernizations:

1. ~~**Decide the real-time travel question — this is the #1 UX risk.**~~ **RESOLVED 2026-06-30.** Travel is now a **fixed ~3s wall-clock wait for any distance** (accepted deviation from the 1991 real-time-per-distance model). Encounters and hazards are unaffected — both are rolled at arrival from distance-derived game units, not from how long the player waits. Implemented via a new `TRAVEL_WALLCLOCK_SECONDS` constant; `TRAVEL_TIME_MULTIPLIER` (=3) is now game-units only (hazard spacing + flavor). All unit tests pass.

2. ~~**Onboarding / "what do I do now?"**~~ **DONE 2026-07-01 (the main lever).** The main menu now carries a **dashboard + a single priority-picked `Objective:` line** — the *next sensible action*, surfaced organically. `systems/player-goals.ts` (`selectObjective`, pure/tested) picks one nudge: refuel when low → sign a contract when empty → deliver to `<named destination>` when carrying → (final stretch) the Conqueror win → afford an upgrade → "N pts to <next rank>" → a rotating tip. The dashboard also shows Fuel / Score / **next-rank progress**. (A scripted guided first-turn tutorial is still open, but the "what do I do now?" driver — the highest-value part — is covered.)

3. ~~**Make the bot world legible.**~~ **DONE 2026-07-01.** The end-turn screen now prints a **Galactic News Wire** — a curated "while you were away" digest, not a full action log. `bots/galactic-digest.ts` (`buildGalacticDigest`, rng-injectable) selects the highlights from the bot turns: the bloodiest run (top fighter), the biggest haul and a notable bust (net-credit superlatives), the two highest-drama intrigue beats (arena wins > raids/bail/rescues > kills, low-drama trades filtered out), any promotion, and the current leaderboard #1 — wrapped in varied flavour openers/sign-offs so it reads fresh each turn. Bot turns now also surface rescues/port-takeovers; `runAllBotTurns` gathers per-bot results + promotions + the leader and returns `summary.digest`. Tested deterministically (`tests/galactic-digest.test.ts`). Example:
> ```
> While you were away, 4 spacers worked the space lanes. 6 shots were traded in anger.
> ⚔  Iron Vex left a trail of wreckage — 3 kills this cycle.
> 💰 Cargo King's holds runneth over — banked 48,000 cr.
> 📉 Lucky Seven bled 13,000 cr into the dark — a rough run.
> 🏟  Iron Vex accepted Cargo King's Deep Space duel and WON (5-3)
> 🔓  Posted 4000 cr bail for Doomed Dan
> 📈 Iron Vex earned a promotion to Commodore!
> 🏆 Cargo King holds the top spot — 1,450 pts, Top Dog.
> ```

4. ~~**Economic feedback / goals.**~~ **DONE 2026-07-01.** Visible mid-term goals (next-rank progress on the dashboard; the `Objective:` line) plus a **real risk/reward trade decision**: the cargo board now offers **capability-gated Rim contracts** (systems 15-20) — a ~40% pay premium + the stat-delivery bonus, clearly tagged `RIM ⚠` vs `core`, with a last-chance danger cue on the Navigation screen. Weak/early players see a safe **core-only** board; Commander-and-armed players get 1 (Captain+: 2) lucrative-but-dangerous options while always keeping ≥1 safe run. The grind now has a target *and* a choice. Also fixed a latent rim-delivery **score-overwrite bug** (`docking.ts`) the feature would have exposed, and taught `getSystemName` the Rim names. *(A dedicated fuel-arbitrage "best buy/sell" advisor on `port-fuel-prices` is a small remaining nicety.)*

5. ~~**Smooth the rank curve & the inherited-quirk decisions.**~~ **RESOLVED across this + prior sessions.** The **rank combat bonus was removed** (§2.2) so advancement can't power-creep the game into a cakewalk — combat power is tied to ship investment only, and the anti-creep design is bounded (rising upgrade costs + the 199 cap). Rank's rewards are now **prestige + access + opportunity** (honoraria unchanged/modest; the new **Rim-contract unlock** is the tangible reward for reaching Commander). The `sc=14` gap is kept as charm (faithful) and is surfaced correctly by the next-rank progress line.

6. **Reachability cleanup as a quick credibility win.** Wire the Cloaker, delete or revive `spacers-hangout`/`raid`/`black-hole-event`/`combat-display`. Small effort, removes "bought-but-broken" feel.

---

## Suggested immediate next steps
1. ~~Fix the 3 red tests~~ **DONE** — all 1863 unit tests pass (the 3 stale ×3 travel-time assertions were updated for the new fixed-wall-clock model).
2. ~~Decide travel-time model~~ **DONE** (§6.1) — fixed ~3s wait, encounters/hazards preserved.
3. ~~Wire the Cloaker UI~~ **DONE** (§3.1) — dead purchase is now a working feature, verified live.
4. ~~Triage the 3 dead screens + 1 dead module~~ **DONE** (§3): Cloaker wired; **Spacers Hangout + Raid revived (unlocks the whole alliance system)**; **`black-hole-event` (Great Void) wired with a discoverability nudge** (§7); `combat-display.ts` deleted. All four dead items resolved. **All 52 registered screens are now reachable.**
5. Then proceed to the playthrough-coverage push (§5).

> Test-infra note: **RESOLVED.** The full `npm test` run previously exited 139 (SIGSEGV) on *teardown* — Prisma's native library-engine crashing on vitest worker-*thread* teardown after all tests passed. Fixed by switching the vitest pool to `forks` (child processes exit cleanly) plus a `tests/vitest.setup.ts` that `prisma.$disconnect()`s after each file. `npm test` now exits 0 with all 1863 tests green.

---

## 7. Deep-dive: the Black Hole "Great Void" discovery (original design analysis)

Following the `black-hole-event` breadcrumbs into the 1991 source (`SP.WARP.S`, `SP.PATPIR.S`, `SP.DOCK2.S`, `SP.MAL.S`) surfaced one of the most interesting — and most completely hidden — mechanics in the game. Documenting it here because it informs both the wiring decision and a future content opportunity.

### What actually happens (the mechanic)

The chain spans three distant parts of the game, wired together by one hidden thread:

1. **Trigger — a hidden reaction gate** (`SP.WARP.S`, `snap`). Fires only on the Andromeda endgame route, when the ship is *"Entering Black Hole."* The screen flashes a burst of 15 `!` alert lines while polling the keyboard; if the player hits **SPACEBAR** in that window, `r=1` → `link "sp.patpir","black"` (into the Void). No press → normal transit, and the player never learns anything happened. The game never says to press space.
2. **The toll** (`black`, exit-stress). *"Badly stressed by precipitous 90-degree exit from Black Hole!"* — one of seven components at random permanently loses 1–7 strength (if above 5). Entering costs real, irreversible ship integrity.
3. **The knowledge gate** — *"Input your NUMBER KEY."* Compared to `kn`, which only exists if the player visited the **Wise One** (`SP.DOCK2.S owise`), who sets `kn = random(1–9)` and shows it once — **re-randomized every visit**. Never visited → `kn = 10`, which no 1–9 input can match → *"Only empty space."*
4. **The reward** — the correct key reveals a derelict alien craft holding a *"weapon enhancement"* (`w1$ = "?" + w1$`). Payoff: in the Maligna boss fight, `k8 = k8 + 150` (`SP.MAL.S:83`) — a decisive endgame weapon-power spike against the Maligna-class enemies.

Full intended arc: **visit the Wise One → remember the number → survive the transit → react in time → gamble a component → answer the riddle → win a decisive endgame weapon.**

### Purpose / designer intent
A **secret mastery reward** layered onto the game's most epic moment. Three gates stack: *knowledge* (seek out the Wise One and grasp the number key), *reflex* (undocumented spacebar), *risk* (accept component damage). Not stumbled into — earned by understanding the game. It's also **breadcrumb design across distance** (the Wise One's cryptic number pays off hours later — the "*oh, THAT's what it was for*" moment) and, in BBS context, **social/lore design**: a secret meant to spread by word of mouth on the board. Its opacity was a feature of that ecosystem.

### Effect on gameplay
A risk/reward power spike positioned right before the hardest fights; soft-gates true endgame strength behind optional exploration; adds a real decision to the endgame run (known damage for a contingent reward); and retroactively gives the Wise One subsystem a concrete purpose.

### Effect on player experience
Wonder (the Void, the derelict alien craft), tension/agency (reflex gate + guaranteed damage), and the flattery of competence (remembering the key). **Modern downside:** it is effectively *undiscoverable* — no prompt to press space, and the number-key link is obscure — so in a single-player remake with no BBS grapevine, ~all players would transit the black hole for the entire endgame and never know the Void exists. Intentional in 1991; reads as non-existent content today.

### Decision (implemented)
Wired **modern-friendly with one discoverability nudge**: on the Andromeda black-hole transit the player is *offered* the investigation (a Y/N prompt) rather than needing a secret keypress, and the Wise One's number key remains the gate on the reward. This preserves the mystery, the toll, and the knowledge-gate payoff while ensuring the moment is actually reachable in single-player. The faithful hidden-spacebar behavior is preserved in spirit (it's still opt-in and still gated on the number key), just discoverable.

### ⭐ Future opportunity — expand into a real quest
The Great Void is currently a single beat (transit → riddle → weapon). It is an ideal seed for a **larger optional endgame quest** later: e.g. a multi-step Wise One → Void arc (collect fragments across visits, a rotating/escalating number-key puzzle, multiple derelict discoveries with branching rewards, or a "cartography of the Void" that ties into the Andromeda systems and the Nemesis/Maligna endgame). Flagging so we can revisit and give this genuinely evocative moment the room it deserves rather than leaving it a one-shot. **Do not expand now — note for a later content pass.**
