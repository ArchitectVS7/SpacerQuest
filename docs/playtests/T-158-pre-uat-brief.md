# T-158 · PRE-UAT BRIEF — read this before you play

*Written 2026-08-02 by the pre-UAT half of `TASKS.md` **T-158**. Every measured figure below is
transcribed from the source document named beside it and pinned by
`packages/sim/src/__tests__/uat-brief-figures.test.ts`, which re-resolves each one against the
live document on every `npm test`. If a source document is re-measured, that test goes red and
this brief is re-quoted from it — the brief is never edited to make the test pass.*

---

## 1 · What this is, and what closes it

This is the **automated half** of T-158. The build is green, T-140/T-141 are verified at their
call sites (§7), and this brief is the "what's known-uncovered going in" that `docs/TESTING-STRATEGY.md`
Part G asked for. **The task now sits `BLOCKED(Human UAT)`, and nothing in this repository can
close it.** It closes only once you have played a UAT pass and recorded **two rulings** — Combat's
chosen branch (R1) and F-150-1 (R2) — in §9 below. *Fix*, *defer* and *accept-as-is* all count.

Sequenced behind this halt: **T-155** (the first real run of the native LLM pilot) and **T-162**
(the browser/DOM-level tier). `TASKS.md`'s "Deliberately deferred" manifest-version bullet also
parks the first `alpha` stage tag on this UAT pass, per `docs/VERSIONING.md`'s stage table.

**One ask that was pending when the T-158 block was written is already closed.** The third ruling
— the PARITY LEDGER's `| VisitHangout |` row — was taken by the owner on 2026-08-02 (commit
`75004d33`, T-157 option **B**): the row **stays Deferred**, and N8 is unblocked-but-unscheduled.
The queue at this checkpoint is therefore **two rulings, not three**.

---

## 2 · The runbook — do this before you start playing

**Launch.** Two ways, and the first is recommended:

| | command | why |
| --- | --- | --- |
| **Electron (recommended)** | `npm run dev -w @spacerquest/desktop` | The main process appends every log line to **disk as it happens** (`packages/desktop/src/main.ts:574`), so a crash costs you nothing. |
| Browser | `npm run dev -w @spacerquest/ui` | Fine for a short look. The log lives in the page until you export it. |

**Turn logging ON — it is OFF by default and it is not in your save.** Click **Settings** in the
cockpit bezel (`App.tsx`'s `settings-toggle`), then the **Playtest** section, then
**`Enable Playtest Logging`**. Consent persists under the key `sq.playtest.logging` in
`storage.ts`'s `KeyValueStore` — **never the save file** — so it must be switched on **once per
browser profile / install**, and loading a save cannot switch it on for you. The flag field and
the export buttons only render **after** the toggle is on.

**Flag a moment.** With logging on, type into the Playtest panel's note field and press **Flag**
(or Enter). Use it for anything that *feels* wrong — pacing, a bad read on the dice, a screen that
made you hesitate. That is the entire point of a UAT; the sweep can measure everything except this.

**Where the log lands (Electron).** `SQ_LOG_DIR ?? app.getPath('userData')/logs`
(`main.ts:377-378`). `main.ts:753` calls `app.setName('Rimward')` before `whenReady`, so on macOS
the concrete path is:

```
~/Library/Application Support/Rimward/logs
```

**Export at the end.** Settings → Playtest → **Export Playtest Log** → **JSONL** or **CSV**.
No network transport exists anywhere in the feature — `packages/ui/src/__tests__/playtest-no-network.test.ts`
scans `store.ts` for every one of them by name.

**Then turn it into a report**, so the session is reviewable rather than a file nobody opens:

```
npm run balance:report -- --aggregate <baseline> --playtest-log <your-export.jsonl>
```

(`--playtest-log` is `packages/sim/src/balance/report-cli.ts:72,124`; it is repeatable and accepts
`.jsonl` / `.json` / `.csv`.)

**Method, from the standing test-intent rules: play through the UI for everything.** Do not reach
for the protocol seam, a dev command or an API call to skip a screen. A shortcut hides exactly the
bug a player would hit, which is the one thing this pass exists to find.

---

## 3 · A suggested pass — not a script

Minimum useful shape: **one Tour One career to at least day 30** (the marker's due day),
deliberately touching the three verbs the sweep is silent about:

1. **Chosen Combat** — pick a fight rather than only being interdicted.
2. **Explore** — enough attempts to form a feel for whether it is worth its price (§5).
3. **VisitHangout / Liar's Dice** — sit down at a table, play several hands, try a FOLD.

Those three are precisely the uncovered rows in §4. They are where a human read is worth the most,
because they are where the sweep can tell you nothing at all.

---

## 4 · What is known-uncovered going in

**(1) Combat's chosen branch — this is ruling ask R1.** `docs/NPC_REDESIGN.md`'s PARITY LEDGER,
`| Combat |` row: the verb a captain is *forced* into now shares the player's rules and (since N13)
the player's dice, but the one they *choose* — `executeCombat` — is still the pre-N3 abstract GUNS
check + flat `150 × tier`, with no interceptor, no damage and no ship loss, so the
six fighters take 6.4 interdictions each and **0 deaths**. A sweep cannot exercise chosen-combat
risk/reward at all, which is why the call is yours.

**(2) Explore and VisitHangout have zero fleet coverage.** Both PARITY LEDGER rows are **Deferred**;
`docs/TESTING-STRATEGY.md` Part C files them in the same row. Note Part G's own T-157 correction:
it is **three** silent archetypes, not two — `gambler`'s prime focus is the tables, i.e.
VisitHangout. The owner ruled option **(B)** on 2026-08-02: the VisitHangout row stays Deferred, and
real parity needs the cast playing through `resolveVisitHangout` (tracked as **N8** — unblocked,
unscheduled).

**(3) N13 shipped (T-156).** The cast now holds a five-die virtual hand dealt through the player's
own `rollDawnHand` and spent through `spendDie` at both of `npc.ts`'s check sites. The residual:
WHICH die is **modelled, not chosen** — flagged at `packages/engine/src/npcHand.ts`'s definition
site as the one sanctioned abstraction.

**(4) The bar you will play is the FIXED one (T-160).** `docs/LIARS-DICE_REDESIGN.md` §16.2 shipped
shape (b), the opening lattice (`minOpeningQuantity(own) = own + 1`). Post-fix, n = 101,616 hands:
**openers guaranteed true 100.00% → 0.00%**, player win rate **80.30% → 61.07%**, EV/hand
**+565.8 → +197.3 cr**. Three findings stay **open** on it — read the bar knowing them:

- **F-160-1** — the archetype ordering survives the fix; `optimal` is still the softest seat.
- **F-160-2** — the challenger-won split is still wide:
  dealer-as-challenger 40.73%, player-as-challenger 82.43% — 41.7 pp apart.
- **F-160-3** — FOLD is still never the better credit play. A design question, filed not redesigned.

---

## 5 · Item (a) — Explore is still a net credit loss

**The headline, from `docs/EXPLORE_REDESIGN.md` §9.1.** The paired sign count: on **85 of 120 seeds**
the `explorer` policy ends day 120 with MORE credits when Explore is filtered out of its plan, down
from **101 of 120** at T-010. The verdict **narrowed rather than closed**.

**The caveat, stated so this brief is not itself the stale-summary trap.** §9 carries a dated header
marking the whole T-116 appendix as a **pre-D1 measurement**, and **no post-D1 sign count exists**.
The current-at-HEAD read is §10.4's, taken on `baseline-t150-postfix.json` (1,000 seeds × 120 days):
`explorer` finishes at a median **60,638cr** with a `tourOneClearRate` of **0.795** and **26.53**
deeds — a solvent, competent career — while **7.69% of what the fixed policy queues is still refused**
by the within-day residual.

**The non-credit payoff, stated beside it.** The outcome table is now 100 authored rows across five
bands, several of them **unique** — questlines, NPC introductions, Signal fragments. That is also the
strongest argument in §10.4 for keeping the *cast* out of the verb: a captain who resolves a unique
row plays it instead of you, subtractive on Storylet's own ground.

**The pricing lever is open and unpulled.** `EXPLORATION_FUEL_COST` is still **80** and
`EXPLORATION_NAV_DC` is still **12** (§10.4, restated at §10.5). Re-pricing is an **R-series owner
call**, not something a content pass does.

**Why it is in this brief.** Owner ruling D1 chose **playtest-by-feel over sim pre-validation** for
this system. So the feel-read belongs in your session notes, and the question is blunt:

> **Did Explore feel worth 80 fuel and a DC-12 check?**

---

## 6 · Item (b) — F-150-1, disposition inertness

*All figures from `docs/HANGOUT_REDESIGN.md` §11.3.*

- The cast sits at exactly 0 disposition on **96.52%** of live captain-days.
- A nonzero standing survives a median of **3 days** — one decay interval — before it is gone.
- Decay outruns interaction **1.53 : 1**.
- **71.52%** of named-pool draws are inert (every candidate at 0). The named share itself is
  **25.07%** against an analytic 25.00%, so the gate does exactly what it says. Multiplying
  through: disposition alters the outcome of **roughly 7% of all interceptions**.
- Grudge weighting is **not** the broken part: lift over uniform is **2.358×** fleet-wide.
- **The counter-case, and it matters.** `gambler` reaches **41.46%** inertness and a **2.806×** lift,
  entirely through the Dare — the existence proof that the system *is* reachable by a player who
  actually interacts.

**T-125 ruled this a DESIGN QUESTION, not a tuning knob, and T-150 did not overturn it.** Neither
constant moved. §11.3's levers-not-pulled table, reproduced:

| lever | shipped value | the number that tempted it | why NOT pulled |
| --- | --- | --- | --- |
| the named-pool gate | `rng.next() < 0.25` (`engine/src/actions/travel.ts`) | disposition can reach only **25.07%** of interceptions | T-125's design-question ruling; raising it without touching decay buys mostly *inert* draws (**71.52%** of named draws are already inert) |
| `DISPOSITION_DECAY_INTERVAL_DAYS` | `3` (`content/src/disposition.ts`) | **96.52%** of live npc-days sit at exactly 0; a standing survives a median of 3 days | Same ruling, and the more load-bearing of the two — it decides whether the pool the gate draws from holds anything. Moves every disposition-reading system at once and owes its own capstone |
| `INTERCEPT_GRUDGE_WEIGHT` / `INTERCEPT_MIN_WEIGHT` | `1.5` / `0.1` | lift is only **2.358×** over uniform | The weighting is not the broken part — it delivers ~2.4× wherever the pool is non-inert. Raising it papers over a reach problem with a bigger multiplier on an empty pool |
| `DISPOSITION_DELTAS` (incl. `DARE_WIN_DISPOSITION` −2 / `DARE_LOSS_DISPOSITION` +2) | unchanged | peak \|disposition\| reaches 10, so the ceiling is not the binding constraint | Already large enough to outrun decay when a player interacts — the gambler proves it. Enlarging them is the wrong fix for a reach problem |

**The framing for R2.** The two constants are **one question, not two**. Widening the gate alone
mostly buys more *inert* draws; the decay interval is the load-bearing one, and moving it touches
every disposition-reading system at once, so it would owe its own capstone.

**Companion context, from §11.4** (already ruled — Deferred — but useful while you play the bar):
the cast's `executeSocialize` stub is still a counterparty-less faucet at **+3.44cr** / captain-day
(**0.22%** of terminal NPC wealth), **37.97%** of its captain-days still resolve where there is no
Hangout, and the 150cr ante locks **17.49%** of live captain-days out of the verb entirely.

---

## 7 · Instrumentation — what is actually running during your session

**T-141 (opt-in playtest logging) — ACTIVE. This is the one that instruments your session.**
Verified by grep at each named call site:

| limb | evidence |
| --- | --- |
| capture + serialisers | `packages/ui/src/playtestLog.ts` — `PLAYTEST_TOGGLE_LABEL` (:88), `PLAYTEST_DISCLOSURE` (:96), `recordAction` (:207), `recordAnnotation` (:219), `recordError` (:235), `toJsonl` (:307), `toCsv` (:345) |
| the panel | `packages/ui/src/App.tsx` — `PlaytestPanel` (:402), `set-playtest-logging` (:415), the always-rendered disclosure (:422-423), `playtest-flag-input` (:436) / `playtest-flag` (:445), `playtest-export-json` (:454) / `playtest-export-csv` (:461) |
| the actions | `packages/ui/src/store.ts` — `setPlaytestLogging` (:2453), `flagPlaytestMoment` (:2472), `exportPlaytestLog` (:2524) |
| disk-backed sink | `packages/desktop/src/main.ts` — `CHANNELS.playtestLog` (:179), the IPC handler (:574), `openPlaytestLog(resolveLogDir())` (:801), `resolveLogDir` (:377-378) |
| its suites | green in this task's gate run — `packages/ui/src/__tests__/playtest-log.test.ts`, `playtest-no-network.test.ts`, `packages/desktop/src/__tests__/playtest-log.test.ts` |

**T-140 (NPC decision tracing) — WIRED, but NOT running during your session, and that is its own
ruling rather than a defect.** It is live at `packages/engine/src/npc.ts:552-578,630,2110-2113` →
`packages/engine/src/day.ts:547,879` → `packages/sim/src/index.ts:797,5442` →
`packages/sim/src/balance/sweep.ts:204,299,307,529,539`, behind `--trace-npc-decisions` (off by
default; a hard error combined with `--merge`).

> **T-140 will not be running during your UAT session.** It instruments the *sweep's* cast, not the
> client's. T-140's own Accept criterion literally required that *"a `grep` for the trace-sink
> parameter under `packages/ui` and `packages/desktop` returns nothing"* — and it still does
> (the only hits are `packages/ui/src/__tests__/npc-trace-absent.test.ts`, the test that enforces the
> absence). The reviewable artifact your session produces is **T-141's export**.
> `docs/TESTING-STRATEGY.md` Part G item 5 named the two together; that is accurate about the
> *pair*, not about a single human session.

**Build state at the time of writing.** `npm test` — **111 files / 2,188 tests, 0 failing**;
`npx tsc -b`, `npm run lint`, `npm run format:check` all exit 0.

---

## 8 · Session notes — fill in as you go

### Pacing

### Dice tension (the day's five dice, not just the bar)

### The Explore feel-read — was it worth 80 fuel and a DC-12 check?

### The Liar's Dice bar (post-T-160)

### Flagged in-session (paste the flag notes from your export)

### Bugs found

> **Bug Discovery Policy.** A bug found during this pass is written into `TASKS.md` **immediately**,
> before testing continues — not held for the summary. A bug that exists only in a conversation does
> not survive a cleared session.

---

## 9 · THE TWO RULINGS — you fill these in

Same idiom as `docs/RELEASE-CHECKLIST.md` §G: the answer goes in **verbatim**.

| # | The ruling asked for | Owner's ruling (verbatim) | Date |
| --- | --- | --- | --- |
| **R1** | **Combat's chosen branch** — `executeCombat` is still an abstract GUNS check + flat `150 × tier`, no interceptor, no damage, no ship loss (§4 item 1). Fix now / defer / accept-as-is. | Defer. Prioritizing UI/visual-design iteration (T-186, T-188, T-189, T-190, T-191) first; revisit the combat model afterward. | 2026-08-03 |
| **R2** | **F-150-1** — the `0.25` named-pool gate and `DISPOSITION_DECAY_INTERVAL_DAYS = 3`, **read together** (§6). Fix / defer / accept-as-is. | Defer. Same reason as R1 — UI/visual-design iteration comes first. | 2026-08-03 |

**"Fix", "defer" and "accept-as-is" all count as a ruling. What does not count is silence.**
Nothing in this repository can fill a cell in — the coder does not self-waive. `TASKS.md`'s T-158
block carries a **TO CLOSE THIS TASK** checklist naming exactly where each ruling gets transcribed
once it is here.
