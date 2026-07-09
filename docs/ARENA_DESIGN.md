# Single-Player Arena — Design (Bots as async PvP opponents)

**Date:** 2026-06-30
**Sources read:** `SQ/SP.ARENA1.S`, `SQ/SP.ARENA2.S` (+ `Decompile/Source-Text/*`), `spacerquest-web/src/game/systems/arena.ts`, `src/game/screens/arena.ts`, `src/app/routes/social.ts`, `src/bots/*`, `src/game/screens/end-turn.ts`, `src/bots/bot-runner.ts`.

---

## 1. What the original actually did (evidence-based)

The 1991 Arena (`SP.ARENA1.S` = Contender/post side, `SP.ARENA2.S` = Challenger/fight side) is **inherently asynchronous PvP**, and the source is explicit about it:

- **Post as Contender, then log off.** Writing your ship to the roster sets `pp=8` (contender) and persists your ship + stakes + arena + handicap to the shared `sp.duel`/`spacers1`/`spacers2` files (`ARENA1.S:149-166`). Credit stakes are **escrowed at post time** — `if x4=3 g1=g1-h` (`ARENA1.S:152`). The *only* way to stay posted is to **quit the game**: `qurt` → *"Leaving with your ship as Contender will exit you from Spacer Quest"* → `itlink` → *"`<ship>` awaiting challenge….leaving Spacer Quest!"* (`ARENA1.S:267-274, 356-358`).
- **Other players fight your stored ship while you're gone.** A Challenger who logs in later browses the roster and picks your ID; the game loads *your stored stats* and fights them — you are not present (`ARENA2.S:44-73`). Result is written to a `duel.<id>` battle file you read on next login (`ARENA2.S:86-89`; `ARENA1.S:188-207 view`).
- **Handicap matchmaking.** `h = Σ(strength×condition)/500` per ship (`ARENA1.S:344-347`). Each **arena type** adds a playstyle-specific handicap `a` (`ARENA2.S:154-161`): Ion Cloud = trips/50, Proton Storm = astrecs/100, Cosmic Radiation = cargo/100, Black Hole = rescues×10, Super-Nova = (battlesWon+1000)−battlesLost, Deep Space = 0 (open to all). Each arena gates entry on that same stat (`ARENA2.S:146-152`).
- **Resolution.** 9 salvos: contender `bx=((j+1)*10)+x5` (note the **+1 contender edge**) vs challenger `cx=(k*10)+a`, `j,k ∈ 1..9`; more hits wins (`ARENA2.S:74-83`). Stakes transfer **proportionally**, weighted by the *weaker* ship's handicap so a mismatch can't wipe you out (`ARENA2.S:92-96`). Winner +10 points +1 win; loser +1 loss. Three stakes types: Points (`(score/h)/10`), Component Strength (`h`), Credits (`h×10,000`).
- **Targeting & etiquette.** A posting is open to *Anyone* (`xn=0`) or a *specific* spacer (`xn>0`); one challenger locks a posting (`x5$`); you can't duel your own ship; one challenge per visit (`ARENA1.S:72`, `ARENA2.S:51-53`).

## 2. Inferred designer intent

A **competitive, social, asynchronous** layer for a BBS where players were almost never online at the same time. It let you:
- **Wager hard-won progress** (points/credits/components) against rivals — real stakes, real loss.
- **Compete in your own lane.** Six arenas keyed to six playstyles mean a pure trader (Cosmic Radiation), an explorer (Proton Storm), a rescuer (Black Hole), and a warfighter (Super-Nova) each have an arena where *their* grind is the advantage — you don't have to be a combat build to win.
- **Leave your ship to be tested while you sleep.** The core tension: you post, escrow your stake, log off, and come back to find out whether the galaxy beat you. Word-of-mouth bragging on the board did the rest.
- **Fair-ish matchmaking.** The handicap + proportional-stakes math keeps a whale from farming minnows for their whole bankroll.

## 3. Current web state — the engine is ported, but the loop is dead

**Faithfully ported (works):** `systems/arena.ts` has `calculateDuelHandicap`, `calculateArenaHandicap`, `simulateDuelCombat` (9-salvo, +1 edge), `calculateProportionalStakes`, roster/battle-log/stat renderers. REST endpoints exist in `social.ts` (`/api/duel/challenge|accept/:id|resolve/:id`) and operate on **stored DB stats** — i.e. already correct for an absent opponent. `DuelEntry` model: `challengerId`(poster), `contenderId`(accepter), `stakesType`, `stakesAmount`, `arenaType`, `handicap`, `status`, `result`.

**Dead in single-player (the gap):**
1. **Nothing resolves duels.** No caller of `/api/duel/resolve` anywhere (frontend, bots, jobs). Accepted duels never fight.
2. **Bots only half-participate.** `botChallengeDuel` (`bot-actions.ts:450`) *posts* a duel but: gated hard on `aggression ≥ 0.7`, uses `stakesType:'Credits'` (wrong casing vs the resolver's `'CREDITS'`), and `handicap: 0`. Bots **never accept** and **never resolve** anyone's challenge.
3. **The screen is a stub.** `arena.ts` options (1) Contender and (2) Challenger literally print *"Use: POST /api/duel/…"* — the human can't post or accept via keystrokes.

Net: bots post challenges that sit `PENDING` forever; the human can't interact through the UI; nothing ever fights. The whole subsystem is inert.

## 4. The translation: our turn structure *is* the BBS day

The mapping is almost one-to-one, because we already have the async substrate:

> **Player ends turn** (`end-turn` screen → `runAllBotTurns`) = **"you log off; the other 20 spacers fall in and play their day."**

So the arena becomes **two async, turn-gated directions:**

- **A — Player posts, galaxy answers.** Player posts a Contender challenge, ends turn ("logs off"). During bot turns, some bots decide to challenge the player's *stored ship*; duels resolve; the player sees the outcomes in the **end-turn "while you were away" digest** and the battle log.
- **B — Bots post, player answers.** Bots post their own Contender challenges that persist on the roster. On the player's next turn they open the Arena, browse the roster, and challenge a bot's *stored ship* via keystrokes — resolving immediately.

Both directions fight stored stats — exactly the 1991 semantics — and both are naturally rate-limited by the turn clock.

## 5. The bot decision model — strategic **and** foolish (the heart)

The roster shows each posting's **handicap** (just as the original printed HCP), so a bot can *estimate* its odds — that's realistic, not cheating. The decision has three layers:

**(a) True win probability.** For a candidate duel, compute the bot's arena-specific handicap `a` and the posting's stored `x5`, then estimate `pWin` from the salvo model (a cheap Monte-Carlo of `simulateDuelCombat`, or a closed-form from the handicap gap since each salvo is `((1..9)+edge)`). The `+1` contender edge and the arena-stat gap dominate.

**(b) *Perceived* win probability = truth + personality bias.** This is where "strategic vs foolish" lives:

```
perceived = clamp01( pWin + bias + noise )
bias   = (aggression - 0.5) * OVERCONF_GAIN        // brave bots overestimate themselves
noise  ~ Uniform(-spread, +spread)
spread = lerp(SPREAD_MIN, SPREAD_MAX, aggression*(1-caution))   // reckless bots misjudge more
```

- **Berserker / Duelist** (Iron Vex 0.95, Crimson Ace 0.9): large positive bias + wide spread → they take **bad** duels and lose — the human-like bravado the design wants.
- **Cautious commanders** (Zero Risk, Admiral Stern, caution ≥ 0.9): negative bias, tight spread → they only take **clearly favorable** matchups — cold and strategic.
- **Gamblers** (Lucky Seven 0.95 gamblingLust) accept for the thrill regardless of odds.

**(c) Accept / decline.**

```
accept  if  perceived ≥ threshold
threshold = BASE_THRESHOLD  - aggression*AGG_W  - gamblingLust*GAMBLE_W  + caution*CAUT_W
```

…then gate by **appetite & eligibility** (same rules as the resolver): must meet the arena's stat requirement, afford credit stakes, `handicap ≥ 1`; greed raises willingness for **CREDITS** stakes, misers/cautious bots avoid **COMPONENTS** (permanent strength loss). Finally a **base engagement rate** so only *some* bots act each turn ("some percentage willingly enter") and a **1-duel-per-turn** cap (the original's 1/visit).

**Posting (bots as Contenders)** uses the same personality: duelists/berserkers/gamblers post; each picks the **arena that flatters its build** (fighter → Super-Nova, trader → Cosmic Radiation, explorer → Proton Storm, else Deep Space) and personality-scaled stakes. Cautious bots rarely post.

**Why this is "meaningful":** over many turns the emergent behavior is legible and characterful — aggressive bots bleed points/credits into reckless losses (and occasional glory), cautious bots quietly farm favorable matchups, gamblers swing wildly. The player learns the roster's personalities and can *exploit* them (post a stake that bait-hooks a berserker; avoid the ice-cold Zero Risk). That reads as a living competitive scene, not a dice roll.

## 6. Resolution & feedback

- **One shared resolver.** Extract `resolveDuel(duelId, rng?)` (reusing `simulateDuelCombat` + `calculateProportionalStakes` + the stakes-transfer block currently inlined in `social.ts`). The REST endpoint, the human keystroke path, and the bot pass all call it — no duplicated combat/transfer logic.
- **Arena resolution pass** inside `runAllBotTurns` (right where "the other spacers play their day" already runs): let bots consider open postings (player's + each other's), accept per §5, and resolve immediately.
- **"While you were away" digest.** Return arena outcomes in the end-turn summary: *"Iron Vex challenged your ship in the Deep Space Arena — and lost 3,000 cr to you."* This doubles as the long-requested "make the bot world legible" win.

## 7. Human keystroke UI (close the loop, kill the stubs)

- **(1) Contender** → post via keystrokes: pick stakes type → arena type → target (Anyone / specific) → confirm; create the `DuelEntry`; **escrow credit stakes at post** (faithful to `g1=g1-h`).
- **(2) Challenger** → list `PENDING` postings (bots') → pick one → `resolveDuel` → show the 9-salvo log + result. Replaces both *"Use: POST …"* stubs.

## 8. Balance knobs (all constants, tunable)

`ARENA_BOT_ENGAGE_RATE` (fraction acting/turn), `OVERCONF_GAIN`, `SPREAD_MIN/MAX`, threshold weights, stakes caps, **1 duel/turn** cooldown, and **stale-posting expiry**: a posting no one takes for N turns is withdrawn and its escrow **refunded** (faithful to the original `zerout` refund, `ARENA1.S:296-297`). Matchmaking fairness is already handled by handicap + proportional stakes.

## 9. Phased build plan

- **Phase 1 — core loop (mostly reuse, deterministically testable):** extract `resolveDuel`; add the bot accept+resolve pass to `runAllBotTurns`; fix `botChallengeDuel` (casing, real handicap, personality gate, arena lane); surface outcomes in the end-turn digest. *Result: bots fight the player's posted challenge and each other; a real PvP economy starts moving.*
- **Phase 2 — human keystrokes:** wire Contender/Challenger screen flows + escrow.
- **Phase 3 — polish:** tune the overconfidence model, targeted duels, expiry/refund, digest UX, and a couple of characterful log lines per personality.

Testing throughout follows the project rule: drive the human side through the keystroke path (`handleScreenInput`), assert real DB effects (stakes moved, `DuelEntry.status/result`, score/credits/components), and make the bot decisions deterministic via the injected `rng` the bot system already threads.

---

## 10. Implementation status (built 2026-07-01)

All three phases are implemented and tested (full suite: **1895 passing, exit 0**).

- **Shared duel module** `src/game/systems/duel.ts` — `createDuelChallenge` / `acceptDuelChallenge` / `resolveDuel` (rng-injectable) / `cancelDuel` / `expireStaleDuels`. The three REST endpoints in `routes/social.ts` are now thin wrappers over it. `simulateDuelCombat` gained an `rng` seam.
- **Bots** `src/bots/bot-arena.ts` — `botArenaPhase` (accept + post) hooked into `executeBotTurn`; the personality decision model (`estimateAccepterWinProb` → `perceivedWinProb` → `acceptThreshold`) makes brave bots take bad duels and cautious bots hold back. The old broken `botChallengeDuel` stub was removed; stale postings are expired+refunded at the end of `runAllBotTurns`.
- **Human keystrokes** `src/game/screens/arena.ts` — the *"use the API"* stubs are gone: **(1) Contender** posts via stakes→arena→confirm (with credit escrow); **(2) Challenger** lists open postings and accepts+resolves one, showing the 9-salvo log and result.
- **Economics fix** — credit stakes now escrow/transfer coherently in ×10,000-cr units (`DUEL_CREDIT_UNIT`), so a resolved credit duel is a conservative symmetric ±v transfer (previously escrows were mis-scaled and never returned — a permanent double-loss bug).
- **Tests** `tests/arena-pvp.test.ts` (8) — human post (POINTS + CREDITS escrow), withdraw+refund, human accept+fight, deterministic bot accept (aggressive) vs decline (cautious), credit conservation, and expiry+refund.

**Deliberately deferred:** time-based auto-expiry uses a generous ~3-day wall-clock threshold (bot postings self-regulate since each bot holds ≤1 posting and accepts others'); targeted duels are supported at the module/REST level but the human post UI defaults to open-to-anyone (as the original did) — a target-selection step is the obvious next polish.
