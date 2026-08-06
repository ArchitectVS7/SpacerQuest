# T-198 · PACING BRIEF — the post-M17 economy, read this before you play

*Written 2026-08-05 by the automated half of `TASKS.md` **T-198**. Every measured figure below is
transcribed from the source document named beside it — never from a summary of it — and pinned by
`packages/sim/src/__tests__/pacing-brief-figures.test.ts`, which re-resolves each one against the
live document on every `npm test`. If a source document is re-measured, that test goes red and this
brief is re-quoted from it — **the brief is never edited to make the test pass.***

---

## 1 · What this is, and what closes it

This is the **automated half** of T-198, built to the T-158 checkpoint pattern. The build is green,
the M17 arc is measured, and this brief is the "assembled from work already done, no new sweeps"
that the task block asked for. **The task now sits `BLOCKED(Human ruling)`, and nothing in this
repository can close it.**

It closes once you have played one session at feel level and recorded **three rulings** in §10.
*Fix now*, *defer* and *accept-as-is* all count for each.

**Three, not two — and the third is the correction that matters most.** T-198's block asks for two
rulings. But `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]` shipped in T-197 marked
`PROPOSED — awaiting owner confirmation` in three separate places, and T-198's own text already
names "the §4b rounds table" inside its first ask. T-197's Delivered note in `TASKS.md` says those
numbers "were confirmed with the owner"; **the code and all three documents say otherwise** — the
question was *surfaced*, not answered, and surfacing is not confirming. Rather than let it ride
inside R1 where a "pacing is fine" answer would silently bless it, it is promoted to its own slot,
**R3** (§7).

Gated behind this halt: **T-194** (the dawn-hand tutorial pass — it must not bake the new economy
into tutorial copy before you have judged the new economy) and roughly a dozen backlog tasks whose
`after:` field names T-198. They un-gate when you rule, not when this brief was written.

---

## 2 · The runbook — and what is new since T-158

**Do not re-derive the runbook.** `docs/playtests/T-158-pre-uat-brief.md` **§2** is still current
and is the runbook for this session: how to launch (Electron is still the recommendation, for the
disk-backed log), how to switch playtest logging on (**it is OFF by default and it is not in your
save**), how to flag a moment, where the log lands on macOS, how to export, and how to turn the
export into a report. Read it there; it is not duplicated here.

**What changed under you since that brief was written — the M17 deltas to watch:**

| what moved | where to see it while playing |
| --- | --- |
| **All nine administrative verbs are FREE** — sign-contract, buy-fuel, abandon-contract, the four Shipyard kinds, Crew hire/dismiss, the Port buy. They no longer compete with jumps for dice. | The cockpit buttons no longer require an armed die. `haggle` is the exception and still costs one — its die IS the TRADE check. |
| **All seven Hangout venue sub-actions are FREE** — Dare-open, Meet, Befriend, Insult, Rumor, Borrow, Repay. | The Hangout panel. Visiting the bar now costs nothing from the hand. |
| **`Dare{move:'peek'}` is the ONLY die spend left in the Hangout family.** | `packages/engine/src/actions/dare.ts` — still a Guile check against the port's DC, byte-identical through M17. |
| **The social pool** replaced the die on Meet/Befriend/Insult: `SOCIAL_PLAYS_PER_DAY = 3`, spent on RESOLUTION whatever the outcome (a failed Befriend d20 still spends one). | The live count is rendered as `data-testid="social-plays-left"` (`packages/ui/src/App.tsx:2454`). Spent out, the action returns a typed **`social-limit-reached`** rather than a dead button. |
| **The rounds cap** replaced the die on Dare-open, counted AT OPEN and indexed by `liarsDiceTier`. | The live count is `data-testid="dare-rounds-left"` (`packages/ui/src/App.tsx:2407`). Past the cap, opening returns a typed **`daily-round-limit`**. An open-and-fold still burns the round. |
| **Both caps reset at dawn through one rule** and both live on the save (`CURRENT_SAVE_VERSION` is **16**), so a mid-day reload cannot refill a spent allowance. | Try it: spend the pool, save, reload, check the counter still reads 0. |

**Method, from the standing test-intent rules: play through the UI for everything.** Press the keys,
open the panels, read the counters. Do not reach for the protocol seam, a dev command or an API call
to skip a screen — a shortcut hides exactly the bug a player would hit, which is the one thing this
pass exists to find. If a keypress does not take you where you expect, that is a bug: stop, file it,
fix it, then resume.

---

## 3 · A suggested pass — not a script

The question this session exists to answer is **pacing**, not coverage. One Tour One career to at
least day 30 is the minimum useful shape. While you play it, hold these four:

1. **Does a day now feel *too* roomy?** M17 roughly doubled a trading day's useful actions. Five
   dice used to be rationed across sign + fuel + jump; now the first two are free. Is the day still
   a choice, or has it become a checklist you clear?
2. **Is day 30 still a deadline, or has it become a formality?** The marker was tuned against the
   OLD action economy (§5). At the fleet level 75.8% of runs clear the debt, with a median clear on
   **day 22** — eight days early. Does that match what it feels like from inside a run?
3. **Is 3 social plays enough to feel like a social system?** Or so few that the Hangout is
   decorative — you walk in, spend the pool in thirty seconds, and there is nothing left to do but
   the Dare?
4. **Do the rounds at your Liar's Dice rank feel like a reward for playing well, or like a lockout?**
   That is R3's real question; the table is `[1, 2, 2, 3, 3, 4]` across tiers 0-5, so at tier 0 you
   get **one** hand a day.

---

## 4 · The cumulative arc, as measured

Reproduced from `docs/DAWN-HAND-REDESIGN.md` §0. Every row is 1,000 seeds × 120 days × 8 policies =
**8,000 runs**, read straight off the six committed aggregates in `docs/balance/` — the figure test
re-derives all four columns from those JSONs rather than trusting this transcription.

| baseline | clear rate | median credits | ships lost | encounters/run |
| --- | ---: | ---: | ---: | ---: |
| `t182-reroll-fix` (origin) | 0.5689 | 36,947 | 573 | 23.7580 |
| `t195-dawn-dice` | 0.6310 | 50,813 | 411 | 21.6256 |
| **`t199-pacifist`** | 0.6320 | 49,729 | 436 | 21.7868 |
| `t196a-free-actions` | 0.6305 | 49,517 | 465 | 21.7913 |
| `t196b-instruments` | 0.6342 | 49,839 | 487 | 22.2404 |
| `t197-hangout-caps` | 0.6329 | 49,839 | 492 | 22.2482 |

`t199-pacifist` is called out because it is **not part of this arc** — it is the
`smugglerPolicy`/`planPacifistCombat` income-stall fix (F-150-2) that happens to sit between T-195
and T-196a in baseline order. Folding it in would credit M17 with a repair it did not make.

**What the arc actually shows.** Nearly the whole easing is T-195's: the travel-die bake-off moved
clear rate `0.5689 → 0.6310 (+6.2 pp)` and median credits `36,947 → 50,813` (+37.5%) **in one step**.
Everything after it, T-197 included, is `within ±0.4 pp of clear rate` and `±2.6% of median credits`
— freeing the administrative and Hangout actions did **not** ease the game measurably at the fleet
level. The freeing was a *legibility* change, and the numbers say it was paid for in legibility
rather than in difficulty. Ships lost drift back up across the arc (411 → 492) while encounters/run
also rises `(21.63 → 22.25)`, so the deaths track exposure rather than a weakened captain; both
remain far under T-182's 573.

**TWO ORIGINS, BOTH CORRECT — read this before you compare numbers.** T-198's task block (and
T-195's) quote `fleet.tourOneClearRate` **0.5605 → 0.6310** for T-195. The table above starts at
**0.5689**. Both are true and they are different "before"s: `0.5605` is
`docs/balance/baseline-t188-orbital-3d.json`, T-195's *immediate* predecessor, while `0.5689` is
`docs/balance/baseline-t182-reroll-fix.json`, the last **pre-T-195** baseline the T-197 capstone was
required to span. Nothing moved between them that this arc owns.

---

## 5 · The pacing clamps — and a correction to the task's own framing

**"Contract deadlines" are not a lever, because they do not exist in this game.** T-198's block
names them among the things tuned against the old action economy. `CargoContract`
(`packages/engine/src/types.ts:2142-2148`) is `{ destination, cargoType, payment, pods, haggled? }`
— **no deadline, no expiry, no due-day field** — and a grep for `deadline` / `expiresDay` /
`daysToDeliver` across `packages/engine/src` and `packages/content/src` returns nothing for
contracts. The manifest board rerolls (`generateManifestBoard`, `packages/engine/src/day.ts:145`),
but a *signed* contract has no clock on it. This is recorded as a correction rather than silently
substituted.

**So these four are the pacing clamps you can actually rule on:**

| clamp | value | pin |
| --- | --- | --- |
| The day-30 marker | a literal `30` in the resolution branch — **not a constant** | `packages/engine/src/day.ts:1284` (`nextState.day === 30`) |
| Tour One debt | `25000` | `packages/engine/src/state.ts:128` |
| Guild debt interest | `GUILD_DEBT_DAILY_RATE = 0.02` per dusk | `packages/content/src/guild.ts:80` |
| Loan term / rate | `LOAN_TERM_DAYS = 15` / `LOAN_DAILY_RATE = 0.05` | `packages/content/src/lending.ts:69,63` |

Plus the two magnitudes T-195 itself introduced, which the block names and which are real:
`NAV_DIE_FUEL_DISCOUNT_MAX = 0.15` and `NAV_DIE_EVASION_MAX = 0.2`
(`packages/engine/src/actions/travel.ts:128-129`).

**How the day-30 clamp reads at HEAD**, transcribed from `docs/balance/baseline-t197-hangout-caps.json`
(8,000 runs, `rulesFingerprint` `10e19c88e9a07856`):

| fleet figure | value | what it says about day 30 |
| --- | ---: | --- |
| `fleet.debtClearedRate` | **0.75825** | Three runs in four clear the 25,000cr marker. |
| `fleet.debtClearedDay.median` | **22** | The median clearing run is done **eight days early**. |
| `fleet.deedsByDay30.median` | **15** | Deeds banked by the marker day. |
| `fleet.tourOneClearRate` | **0.632875** | Runs that resolve Tour One as cleared. |

The gap between `debtClearedRate` 0.758 and `tourOneClearRate` 0.633 is the runs that clear the debt
but do not survive to resolve — which is the pacing read: the *money* clamp is looser than the
*survival* clamp. Whether that ordering is right is a feel question, which is why it is R1 and not a
sweep.

---

## 6 · R2's evidence — the Insult measurement is a NULL RESULT

*All figures from `docs/DAWN-HAND-REDESIGN.md` §0.*

§4a of the spec predicted the social pool would hold the free-insult × **2.358×** wronged-interceptor
farming loop (that lift is `docs/HANGOUT_REDESIGN.md` §11.3's fleet-wide grudge lift over uniform),
and T-197's capstone was required to check it against the fighter's encounter/combat income. The
`fighter` row came back **BYTE-IDENTICAL** to T-196b — encounters/run `19.6460`, ships lost 11,
median credits `82,671`, clear rate `0.6030`.

**That is not evidence the pool works.** It cannot be, and the reason is structural:

> **No sim policy has ever planned a social venue.** The only `venue:` literals any policy emits in
> `packages/sim/src/index.ts` are `venue: 'borrow'` (`:2604`), `venue: 'repay'` (`:2637`) and
> `venue: 'dare'` (`:4225`). `meet` / `befriend` / `insult` appear at `:1399-1401` **only as a
> telemetry reader** (`hangoutPlay.socialBeats += 1`), and `socialBeats` is not even in the committed
> aggregate. `packages/sim/src/protocol.ts:914` enumerates the three for the protocol seam, but
> nothing plans them.

So the farming loop **cannot be exhibited by this instrument at all**. The fighter's stillness says
only that the freed dice and the rounds cap do not reach that row. `pacing-brief-figures.test.ts`
asserts this mechanically: if a policy ever gains a social venue, that test goes red and says this
null result is stale.

**X = 3 is therefore UNVERIFIED, not verified.** What can honestly be said is the analytic bound,
which is the actual thing R2 rules on:

- At `3 plays/day × −4` disposition (`INSULT_DISPOSITION = -4`, `packages/content/src/hangout.ts:96`),
  a captain can manufacture at most **`ONE grudge to the −10 floor`** per day — where before the cap
  it was three clicks and change, unbounded.
- At the −10 floor the hunt weight is **16×** (`packages/content/src/hangout.ts:118`, the constant's
  own arithmetic), and the measured grudge lift over uniform is **2.358×** fleet-wide.

Notably, `SOCIAL_PLAYS_PER_DAY` was **not** retuned on the strength of an unmeasurable — §4a
explicitly forbids that, and T-197 obeyed it. The instrument gap is what this brief hands you.

---

## 7 · R3's evidence — the rounds table is PROPOSED, not ruled

**POST-SESSION (2026-08-05): R3 is ruled — the table is now `[1, 2, 3, 4, 5, 6]`, shipped at T-202
with its capstone `docs/balance/baseline-t202-liars-dice-ceiling.json`. The evidence below is the
PRE-RULING record of what was put in front of the owner, and is deliberately not rewritten.**

`LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]`, indexed by `liarsDiceTier` 0-5, is how many hands a
captain may OPEN in a day. It shipped in T-197 marked `PROPOSED — awaiting owner confirmation` in
**three** places, and all three are still marked at HEAD:

| site | pin |
| --- | --- |
| the constant's docblock | `packages/content/src/liarsDice.ts:101` (the array itself at `:111-112`) |
| the spec's §5 last bullet, headed **STILL OPEN** | `docs/DAWN-HAND-REDESIGN.md:283-289` |
| the standing ruling LD-23 | `docs/LIARS-DICE-DECISIONS.md:219-228` |

**The SHAPE is ruled; the NUMBERS are not.** `**What IS ruled is the SHAPE**` — monotone
non-decreasing in tier, so playing well buys table time. The counts are described as
`PROPOSED, NOT RULED` and as "a starting suggestion, not a ruling".

Two things worth knowing before you answer:

- **Confirming as-is is a real ruling**, and a cheap one: flipping the three marker comments moves
  no fingerprint at all (`rulesFingerprint` is *semantic* and strips comments —
  `packages/sim/src/balance/rules-fingerprint.ts:448-496`; only `docsFingerprint` moves, and that is
  a NOTE, not a failure — `checkpoints.ts:467-490`).
- **Revising the array is a CONTENT edit and owes a capstone**, diffed against
  `docs/balance/baseline-t197-hangout-caps.json` — an 8,000-row run, not an argument from a
  fingerprint.

---

## 8 · Instrumentation — what is actually running during your session

Unchanged since T-158, and re-verified by grep at each named call site for this brief rather than
copied from that block:

| limb | evidence |
| --- | --- |
| capture + serialisers | `packages/ui/src/playtestLog.ts` — `PLAYTEST_TOGGLE_LABEL` (:91), `PLAYTEST_DISCLOSURE` (:99), `recordAction` (:212), `recordAnnotation` (:224), `recordError` (:240), `toJsonl` (:312), `toCsv` (:350) |
| the panel | `packages/ui/src/App.tsx` — `set-playtest-logging` (:470), `playtest-flag-input` (:491), `playtest-export-json` (:509), `playtest-export-csv` (:516) |
| the caps' readouts | `packages/ui/src/App.tsx` — `dare-rounds-left` (:2407), `social-plays-left` (:2454) |
| the typed refusals | `packages/engine/src/actions/hangout.ts` — `social-limit-reached` (:376), `daily-round-limit` (:439) |

The T-158 confirmations still stand for the rest, by pointer: **T-141 is ACTIVE** and produces the
reviewable export; **T-140 (NPC decision tracing) is WIRED but does NOT run during a human session**
— it instruments the *sweep's* cast, by its own Accept criterion. See T-158 §7. The artifact your
session produces is T-141's export.

---

## 9 · Session notes — fill in as you go

### Does a day feel too roomy now that sign/fuel/repair/hire are free?

### Day 30 — still a deadline, or a formality?

### The social pool — 3 plays: enough to be a system, or decorative?

### Liar's Dice rounds at your rank — reward, or lockout?

### Flagged in-session (paste the flag notes from your export)

### Bugs found

> **Bug Discovery Policy.** A bug found during this pass is written into `TASKS.md` **immediately**,
> before testing continues — not held for the summary. A bug that exists only in a conversation does
> not survive a cleared session.

---

## 10 · THE THREE RULINGS — you fill these in

**POST-SESSION (2026-08-05): all three rulings are recorded below, transcribed from the owner's
own words in `TASKS.md`'s T-198 block.** R3 revised the table to `[1, 2, 3, 4, 5, 6]` and shipped
at T-202 with its capstone. The ask cells are unchanged — they are the record of what was asked.

| # | The ruling asked for | Owner's ruling (verbatim) | Date |
| --- | --- | --- | --- |
| **R1** | **Is the post-M17 pacing acceptable?** If not, which lever gets a re-tuning task: the day-30 marker (`day.ts:1284`), the Tour One debt/interest (`state.ts:128`, `guild.ts:80`), the loan terms (`lending.ts:63,69`), or T-195's magnitudes `NAV_DIE_FUEL_DISCOUNT_MAX = 0.15` / `NAV_DIE_EVASION_MAX = 0.2` (`travel.ts:128-129`). Note: "contract deadlines" as the task block names them **is not a lever that exists** (§5). Fix now / defer / accept-as-is. | **Accept-as-is.** *"pacing is acceptable as-is."* No re-tuning task filed for the day-30 marker, Tour One debt, guild interest, or loan terms — the cumulative arc showed M17's freeing of admin/Hangout actions did not measurably ease the fleet economy (all within noise of T-196a), so the levers tuned against the old economy stand unchanged. | 2026-08-05 |
| **R2** | **Does `SOCIAL_PLAYS_PER_DAY = 3` need tightening?** The measurement is a **null result** (§6), so the three live options are: (a) accept X = 3 on the analytic bound; (b) tighten X — a content edit owing a capstone diffed against `baseline-t197-hangout-caps.json`; (c) file an insult-playing sim policy as its own instrument task and measure before ruling. Fix / defer / accept-as-is. | **Accept-as-is, option (a).** *"`SOCIAL_PLAYS_PER_DAY = 3` confirmed, no change."* Per the insult-farming investigation: the pool cap correctly blocks a 4th same-day insult; insult/disposition never touches faction reputation or any player-facing score (fully separate systems, verified against source); and the interception-reweighting mechanism it gates is real (measured 27%→72% wronged-share lift, matching the ~2.358× theoretical figure) but economically narrow — it only reorders WHICH same-tier rival shows up, never adds encounters or changes payout, so even the cap's own existence isn't load-bearing for balance. No re-tuning task filed. | 2026-08-05 |
| **R3** | **Confirm or revise `LIARS_DICE_ROUNDS_PER_DAY = [1, 2, 2, 3, 3, 4]`** (§7). "Confirm as-is" is a ruling and flips three `PROPOSED` markers for free; revising the array is a content edit that owes a capstone. Fix / defer / accept-as-is. | **REVISE.** *"`LIARS_DICE_ROUNDS_PER_DAY` = `[1, 2, 3, 4, 5, 6]`"* (tiers 0-5, a strict +1/tier climb, revised up from the shipped `[1, 2, 2, 3, 3, 4]` suggestion). Owner's reasoning, recorded rather than paraphrased: the simulated ceiling (an always-wins gambler playing every free round) is a rare, high-skill-adjacent, high-variance play — real play at these odds still loses ~40% of individual hands — and rewarding a risky gambler archetype with the credits to buy fast drives/cloaking and run a scoundrel playstyle (trade combat for evasion) is an ACCEPTED, intentional outcome, not an exploit to close. Implementation is content-only and owed its own capstone — filed and shipped as **T-202**. | 2026-08-05 |

**"Fix", "defer" and "accept-as-is" all count as a ruling. What does not count is silence.**
Nothing in this repository can fill a cell in — the coder does not self-waive, and
`pacing-brief-figures.test.ts` fails the suite if one of these six cells is non-empty. `TASKS.md`'s
T-198 block carries a **TO CLOSE THIS TASK** checklist naming exactly where each ruling gets
transcribed once it is here.
