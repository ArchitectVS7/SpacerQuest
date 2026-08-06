# T-201 · The dawn-hand roll — a design proposal for the day-transition beat

**Status:** proposal, awaiting the owner's pick. **This document changes no code.** Every path
touched by T-201 ends in `.md`; the implementation is a separate `code`-type task that is
deliberately **not filed yet** (T-201's own Accept forbids it).

**Written against:** `b8343150` (`Fix T-200: teach the Electron desktop e2e suite to sign the
opening marker`). Every `file:line` below was re-opened at write time against that commit — line
numbers in `App.tsx` in particular move with almost every UI task, so re-verify before quoting them
in a later task.

**The ask, verbatim (owner, 2026-08-05):** day transitions are currently close to invisible —
nothing marks the moment the dawn hand refills. Five dice roll in the centre of the board, a label
reads "DAWN HAND", the dice settle into their existing display area at the bottom of the screen.

---

## 1 · The day-transition code path, as it actually stands

There is exactly **one** function that turns a day over, and it is synchronous end to end.

| Step | Pin | What it does |
| --- | --- | --- |
| The button | `packages/ui/src/App.tsx:5773` | `<button className="btn" data-testid="end-day" onClick={endDay}>`; its label flips to `Begin next day` at `:5774` once `remaining === 0` |
| The only other entry | `packages/ui/src/store.ts:2366` | `standDown()` — the no-dice escape hatch out of an encounter. Its whole body is `endDay();` (`:2367`) |
| The store action | `packages/ui/src/store.ts:2371` | `export function endDay(): void` |
| Dusk | `store.ts:2373` | `const dusk = engineEndDay(state.game)` → `packages/engine/src/day.ts:554` |
| Dawn | `store.ts:2374` | `const dawn = startDay(dusk.state)` → `packages/engine/src/day.ts:116` |
| The hand is rolled | `packages/engine/src/day.ts:184–195` | `dawnDiceModifiers(crew, equipmentDiceBenefits(ship))` → `rollDawnHand(dayRng.fork('player-hand'), modifiers)` → `events.push({ type: 'DawnRoll', day, hand })` |
| The single state commit | `store.ts:2384–2400` | One `set({...})`: new `game`, and `selectedDie`, `bloomDie`, `notice`, `lastCheck`, `explorationOutcome`, `dareReveal`, `dareBeats`, `socialOutcome`, `patrolScan` all cleared |
| The existing animation hook | `store.ts:2389` | `bootKey: state.bootKey + 1` |
| The two dusk verdicts, set in the same frame | `store.ts:2382–2383`, committed at `:2391–2392` | `combatAftermathSummary(dusk.events)` and `successionSummary(dusk.events)` |
| The cues, after the commit | `store.ts:2403–2405` | `reactToEvents(dusk.events, false)`; `sound.play('dawn')`; `sound.setDriveHum(true)` |

**Where the dice live now.** `HandDock` — `App.tsx:5652`. The label at `:5691–5704` already reads
`Dawn Hand` with a `FLOOR n` badge (`:5694`), a `RE-ROLL ×n` badge (`:5699`) and `DAY {day}`
(`:5703`). The dice render at `:5706–5765`; the face itself is the first `<span>` at `:5744`.
CSS: `.dock` `theme.css:2096`, `.dlabel` `:2105`, `.hand` `:2119` (a 14px-gap flex row), `.die`
`:2124` — **56 × 56 px**, hexagon `clip-path`, `font-size: 21px`.

**The sound.** `sound.play('dawn')` is `packages/ui/src/sound.ts:563–569`: an ascending C–E–G sine
triad, voices 0.05 s apart, 0.5 s tails. It already *is* a settle chord; nothing currently stages it
against anything visual.

---

## 2 · The finding that should reframe the task

**A roll animation already exists, and the owner did not miss it — they could not see it.**

`useDiceRoll`, `App.tsx:5785–5811`:

- a `setInterval` at **55 ms** (`:5806`);
- per-die stagger `ticks < 8 + i * 3` (`:5801`) — dice freeze left-to-right about 165 ms apart;
- it stops at `ticks > 20` (`:5802`), so the whole scramble is **≈1 155 ms** — almost exactly the
  1 100 ms of the `.sweep` CRT boot wipe it runs underneath;
- keyed on `bootKey` **only** (`:5810`), with the reason written into the code: spending a die
  mid-day must not restart the scramble;
- reduced motion settles instantly (`:5789–5791`);
- it scrambles with a hand-rolled LCG (`:5795–5798`), not `Math.random` — the `tabletop-ui` §4.3
  determinism rule, already honoured.

So the sequence the owner asked for is half-built. What it lacks is a **stage**. It plays out inside
five 56 px tiles pinned to the bottom edge of a 5 800-line cockpit, in the same frame that a
full-screen amber `.sweep` (`theme.css:104–118`, `z-index: 95`, 1 100 ms) wipes down the tube and
every pane re-renders. The numbers change; nothing tells you to look.

**This reframes T-201.** The task is not "add a dice animation". It is *give the roll a stage and a
beat*. That makes the honest implementation diff smaller than the ask sounds — and it means the
worst outcome available here is adding a second, competing animation on top of the first without
retiring it.

---

## 3 · The constraints that actually bound the design

### 3.1 `bootKey` is not "a new day"

`bootKey` is bumped in four places:

| Line | Caller |
| --- | --- |
| `store.ts:1287` | `newGame(seed)` (`:1246`) |
| `store.ts:2389` | `endDay()` |
| `store.ts:2502` | `loadSlot(n)` (`:2456`) |
| `store.ts:2634` | the career **import** path |

A ceremony keyed on `bootKey` fires on **new game**, **load a save** and **import a career** as well
as on a day turning over. That is not automatically wrong — loading a save does drop you into a
morning whose hand is undealt — but it is a decision. It is also already the semantics of the
existing scramble and of the `.sweep`, both keyed on `bootKey` (`App.tsx:988`, `:1004`, `:1015`).
See open question **Q2**.

### 3.2 The collision that actually bites: dusk can hand you a death

`store.ts:2382–2383` computes `combatAftermath` and `succession` from the dusk events and commits
them in the **same `set`** that bumps `bootKey`. Two dusk paths kill a captain — the free attack's
killing blow and the life-support survival failure (`store.ts:2379–2381`'s own comment). So the
frame that wants to play "DAWN HAND" is sometimes the frame that must play the estate notice for a
captain who just died.

`SuccessionNotice` mounts at `App.tsx:1133`, outside the combat overlay on purpose (`:1128–1132`).
Note that `succession` is client-only meta-state a reload loses (it is set and cleared purely in the
store; `dismissSuccession` at `store.ts:2358`), so "queue the roll behind it" has a reload corner.

### 3.3 The overlay ladder is already crowded and already ordered

Mount order, `App.tsx:1089–1134`: storylet panel → hangout panel → **`HandDock` (`:1107`)** →
`OnboardingCallout` → `WalkthroughCard` → `OpeningMarker` (`:1125`) → `CombatOverlay` (`:1126`) →
`ResolutionCeremony` (`:1127`) → `SuccessionNotice` (`:1133`) → `RecordsOverlay`.

Verified `z-index` ladder in `theme.css`:

| z | Owner | Pin |
| --- | --- | --- |
| 78 | `.storylet-panel` | `theme.css:2879` |
| 80 | `.combat-overlay` | `theme.css:2651` |
| 82 | `.succession-notice` | `theme.css:3784` |
| 84 | `.resolution-ceremony` | `theme.css:3664` |
| 85 | `.records-overlay` | `theme.css:3034` |
| 86 | `.walkthrough` | `theme.css:3492` |
| 88 | `.opening-marker` | `theme.css:4949` |
| 90 | `.ending-screen`, `.fx` | `theme.css:3868`, `theme.css:62` |
| 95 | `.sweep` | `theme.css:110` |

The house already suppresses collisions at **render time, not in state**: `StoryletPanel` stands
down for `ceremony` (`App.tsx:1093`); `WalkthroughCard` returns `null` while the opening marker is
pending (`App.tsx:1236`); `railsSuspended` (`walkthrough.ts:302–310`) stands the whole tutorial down
for an encounter, a live Liar's Dice hand, an aftermath, a succession or a patrol scan. Any new beat
should join that pattern rather than invent a queue.

### 3.4 Panels survive the day boundary

`endDay`'s `set` clears nine pieces of transient state — but `hangoutPanelOpen` (`App.tsx:921`) and
`openStoryletId` (`:920`) are **component-local `useState` in `App`** and are untouched by the
store. A day can therefore turn over with the Hangout panel open on screen. (`hangoutAvailable`,
`App.tsx:958–959`, can flip it invisible if the new day's port has no hangout, but that is
incidental, not a decision.)

### 3.5 The e2e surface — measured, not guessed

`grep -rl "end-day" packages/ui/e2e` → **21 files** (18 specs + 3 shared helpers), **56 total
occurrences**, out of 42 specs in the directory.

But the load-bearing number is smaller than that, and it points somewhere specific:

- **18 of the 21** files already call `page.emulateMedia({ reducedMotion: 'reduce' })` — including
  `long-haul.spec.ts` itself (`packages/ui/e2e/long-haul.spec.ts:46`), the 30-in-game-day DOM sweep
  (`DAYS`, `:39`, floors at 30).
- Only **three** files that press `end-day` run at full motion: `smoke.spec.ts` (1 occurrence),
  `sound-audible.spec.ts` (1), `long-haul-invariants.spec.ts` (6). Eight presses, total.

**What this settles.** A ceremony correctly gated on the same `reduced` predicate the existing
scramble and `.sweep` already use (`App.tsx:931`, `:988`) costs the long-haul suite **nothing** —
it is already on the instant rail. The exposure is 8 presses in 3 specs, at whatever the ceremony's
duration is; `TEST_TIMEOUT_MS = 60_000` (`packages/ui/playwright.config.ts:47`) has ample headroom
for that. Conversely, a ceremony that is **blocking and not on the reduced rail** would add
`duration × 30` per long-haul seed and would need every one of the 21 files rewritten. The correct
design is therefore already the cheap one, and the cost only appears if the reduced rail is
skipped — which `tabletop-ui` §2 forbids anyway.

### 3.6 Motion tiers — SpacerQuest ships two, the house rule wants three

`tabletop-ui` §8 (owner correction, 2026-07-18) makes **Cinematic / Snappy / Instant** a standing
rule: *"Never ship cinematic-only."* SpacerQuest currently ships a **binary**: the `reducedMotion`
setting OR'd with the OS query at `App.tsx:931`, driving `data-motion` (`:933`), with two CSS rails
— the `@media (prefers-reduced-motion: reduce)` block at `theme.css:2567–2595` and the blanket
`:root[data-motion='reduced'] *` kill-switch at `theme.css:2601–2605`.

That divergence exists today and is not T-201's to fix silently. It is named as **Q4**.

### 3.7 "Five dice" is not a constant

The hand size is parameterised. `packages/engine/src/day.ts:170–187` spells it out: crew and fitted
equipment feed `dawnDiceModifiers`, so the hand is **5 base, up to 7** with a First Officer
(`App.tsx:5659–5660`), and a floor crew and re-roll charges ride alongside
(`dawnHandModifiers(state.game)`, `packages/ui/src/format.ts:973`, called at `App.tsx:5661`).

**The ceremony must render N, not 5.** Anything that hard-codes five dice, or lays out five
positions, is a bug the day the player hires a First Officer.

---

## 4 · Three treatments

All three share four non-negotiables, taken straight from `tabletop-ui` §2:

1. **Never blocking.** The cockpit stays live; no focus trap, no `inert`, no awaited promise.
2. **Skippable.** A click lands it — the repo's own idiom, `App.tsx:2950–2952`
   (`timelineRef.current?.progress(1)`).
3. **An instant rail that renders the settled DOM on the first frame** — the shape
   `LiarsDiceScene` already uses (`App.tsx:2906–2908`: *"Reduced: THE TIMELINE IS NEVER CREATED"*,
   with the reason written at `:2904–2905` — it is what keeps the e2e non-flaky).
4. **`useDiceRoll` is retired or absorbed, never left running underneath.** Two roll animations at
   once is the failure mode.

### Timing vocabulary — derived from the house, not invented

| Existing beat | Duration | Pin |
| --- | --- | --- |
| `.sweep` boot wipe | 1 100 ms | `theme.css:113` |
| `useDiceRoll` scramble | ≈1 155 ms (21 × 55 ms) | `App.tsx:5799–5806` |
| `ld-settle` cube tumble | 620 ms | `theme.css:4256` |
| Liar's Dice reveal timeline | dim 280 ms → cubes 420 ms, stagger 130 ms → verdict 400 ms → undim 500 ms (≈1.9 s) | `App.tsx:2913–2920` |
| `om-strike` / `om-bloom` | 620 ms / 900 ms | `theme.css:5121`, `:5124` |
| `om-read-in` stagger | 520 ms at 380 / 620 / 860 ms | `theme.css:5129–5135` |
| `.die.bloom` | 700 ms | `theme.css:2176` |

Every number below is drawn from that vocabulary. A beat with a foreign tempo reads as a foreign
beat.

---

### Option A — "The dock rises"

The `HandDock` itself becomes the stage. No overlay, no new mount point.

```
  t=0                        t=420ms                    t=1150ms
  ┌──────────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
  │                      │   │                      │   │                      │
  │   (cockpit panes)    │   │   (cockpit, dimmed   │   │   (cockpit panes)    │
  │                      │   │    to 0.55 via       │   │                      │
  │                      │   │    --dawn-dim)       │   │                      │
  │                      │   │  ╔════════════════╗  │   │                      │
  │                      │   │  ║ DAWN HAND      ║  │   │                      │
  │                      │   │  ║  DAY 12        ║  │   │                      │
  │                      │   │  ║ ⬡ ⬡ ⬡ ⬡ ⬡     ║  │   │                      │
  │                      │   │  ╚════════════════╝  │   │                      │
  ├──────────────────────┤   │   (dock lifted 90px, │   ├──────────────────────┤
  │ DAWN HAND ⬡⬡⬡⬡⬡ [ED] │   │    scaled 1.35)      │   │ DAWN HAND ⬡⬡⬡⬡⬡ [ED] │
  └──────────────────────┘   └──────────────────────┘   └──────────────────────┘
```

**Sequence (1 150 ms total, matching the scramble it replaces):**

| t | Stage |
| --- | --- |
| 0–260 ms | `--dawn-dim` ramps the cockpit behind the dock to ~0.55, `power2.out`. The dock lifts ~90 px and scales to ~1.35 on `power3.out`. The `.dlabel` brightens to `--ember-hi`. |
| 180–780 ms | Dice tumble in place — the existing numeric scramble, **restaged**: face-flip + a small Y-hop + hex-tile rotation, `stagger: 0.13` (the Liar's Dice figure), landing left-to-right. |
| 640–900 ms | Each die lands with a one-frame `.die.bloom`-style flare (`theme.css:2176`) and a foley tick; nat-20 / nat-1 gets the existing `.die.nat` treatment held a beat longer. |
| 780–1 150 ms | Dock settles back to its resting transform, dim releases `power2.inOut`. The `dawn` triad (`sound.ts:563`) lands on the settle, not before it. |

- **Mount:** none. `HandDock` (`App.tsx:1107`) grows a `useLayoutEffect` timeline exactly like
  `LiarsDiceScene`'s. The `.dock` gets `transform-origin: bottom center` and a raised `z-index`
  scoped to the animating window.
- **Instant rail:** timeline never created → the dock never moves, dice show final faces on frame 1.
  Identical to today's reduced behaviour.
- **Death collision (§3.2):** trivial. `SuccessionNotice` is z 82, mounted after; it simply covers a
  dock that is briefly larger. No suppression logic needed.
- **Open panel (§3.4):** the dim is scoped to the cockpit grid; an open Hangout panel dims with it
  and is never closed or blocked.
- **e2e cost:** zero. Dock keeps its `data-testid`s; `end-day` and `die` stay where they are.
- **Surface:** `App.tsx` `HandDock` + `useDiceRoll` (rewritten as a GSAP timeline), `theme.css`
  `.dock`/`.die`. No new file. No new state.
- **Weakness — and it is the decisive one:** the dice never reach the centre of the board. The owner
  asked for the centre. This is the conservative option, and `tabletop-ui` §8's meta-signal records
  the owner rejecting the conservative option **four times**.

---

### Option B — "The table"

A real centre-of-board ceremony. The dice are thrown in the middle of the tube, read there, and then
**fly home** to their dock slots.

```
  t=0             t=340ms              t=980ms              t=1700ms
  ┌────────────┐  ┌────────────┐       ┌────────────┐       ┌────────────┐
  │            │  │  (dimmed)  │       │  (dimmed)  │       │            │
  │  cockpit   │  │            │       │            │       │  cockpit   │
  │            │  │   ⬡  ⬡     │       │  DAWN HAND │       │  restored  │
  │            │  │  ⬡  ⬡  ⬡   │       │  ──DAY 12──│       │            │
  │            │  │  (tumbling)│       │ ⬡14 ⬡3 ⬡20 │       │      ↘ ↓ ↙ │
  │            │  │            │       │   ⬡8  ⬡11  │       │            │
  ├────────────┤  ├────────────┤       ├────────────┤       ├────────────┤
  │ DOCK ····· │  │ DOCK (empty│       │ DOCK (empty│       │ DOCK ⬡⬡⬡⬡⬡ │
  └────────────┘  └── slots) ──┘       └── slots) ──┘       └────────────┘
```

**Sequence (≈1 700 ms total, inside `tabletop-ui` §2's 1.5–2.5 s scene-moment band):**

| t | Stage |
| --- | --- |
| 0–280 ms | Scene focus: `--dawn-dim` 0→1 over the cockpit, `power2.out`. Dock slots go to empty outlines. Exactly the `LiarsDiceScene` opener (`App.tsx:2913`). |
| 180–340 ms | **Anticipation.** N hex dice enter from above the frame, small, fast, `power3.in`. |
| 340–980 ms | **The throw.** Dice tumble across a shallow arc, `stagger: 0.13`, landing left-to-right with `power3.out` overshoot. Faces resolve on landing, not in flight (fog discipline is trivially satisfied — the hand is public — but the *read* wants the face to arrive with the stop). |
| 860–1 200 ms | **The label struck.** `DAWN HAND · DAY n` written over the dice with the `om-strike` treatment (620 ms, `theme.css:5137`) — the same letterforms the opening marker and `rc-kicker` (`App.tsx:1426`) already use. |
| 1 200–1 620 ms | **The fly-home.** GSAP **Flip** measures each die from centre position to its dock slot and tweens it there, `power2.inOut`, tight stagger (~60 ms). Label fades on the first die's departure. |
| 1 620–1 700 ms | Dim releases. `dawn` triad lands as the last die seats. |

- **Mount:** a new `DawnRoll` overlay component. It belongs **below** every verdict overlay and
  above the panes — proposed `z-index: 76`, under `.storylet-panel` (78), so nothing that reports a
  consequence is ever occluded by decoration. Mount point: between `HandDock` (`App.tsx:1107`) and
  `OnboardingCallout` (`:1112`).
- **Instant rail:** the overlay renders `null` when `reduced`. Dock is populated on frame 1. Nothing
  else changes.
- **Death collision (§3.2):** must be resolved explicitly. **Proposed rule: the roll stands down
  when `succession` or `combatAftermath` is set** — the same render-time suppression idiom as
  `WalkthroughCard` (`App.tsx:1236`), not a queue. Rationale: the successor's hand is not a
  celebration, and a queue that a reload drops (§3.2) is a state machine nobody wants to own. It
  costs one line and it means the roll is silent on the ~1 day in N where somebody died. See **Q3**.
- **Open panel (§3.4):** the dim covers it; it is not closed. It *is* the thing that goes dark, which
  is arguably better than Option A — the panel visually recedes for the beat and comes back.
- **`.sweep` conflict:** real. Both fire on `bootKey`, both are ~1.1 s of full-screen amber, and the
  sweep is z 95 — *above* the ceremony. **Proposed: suppress `.sweep` on the day-turn path** and let
  the roll be the transition. That is a behaviour change to an existing beat and needs saying out
  loud (see **Q6**).
- **e2e cost:** 8 full-motion presses across 3 specs (§3.5). The dock's `data-testid="die"` nodes
  must remain mounted throughout — if the dice are *moved* rather than duplicated, Flip keeps the
  same DOM nodes, which is the right call for both fidelity and tests.
- **Surface:** new `App.tsx` component + a `theme.css` block + `gsap/Flip` import. **Flip is
  available**: `node_modules/gsap/Flip.js` exists and GSAP became free including all former Club
  plugins on 2025-04-30, which also retires `tabletop-ui` §4.4's licensing caveat.
- **Weakness:** repeat-decay. 1.7 s × 30+ days is the exact fatigue `tabletop-ui` §8 cites from the
  owner's own MTG Arena experience, and which Slay the Spire shipped a global "Fast Mode" to answer.

---

### Option C — "The beat that shrinks" *(recommended)*

**Option B's full form when the day earns it; Option A's form every other morning.** One predicate,
two presentations, sharing one timeline builder.

The full form (B) fires when **any** of:

1. **Day 1 of a career** — the first time you ever see it. Uses the armed-record pattern that
   already exists for exactly this: `armedOpeningMarker()` / `openingMarkerPending()` /
   `seenOpeningMarker()` (`packages/ui/src/opening.ts:111`, `:120`, `:116`), stored under an
   `sq.`-prefixed key (`opening.ts:50–52` — the prefix is load-bearing for the desktop shell's
   migration).
2. **The hand is notable** — a nat-20 or a nat-1 is in it. `.die.nat` already exists
   (`App.tsx:5713`, `theme.css:2173`) and the day the hand is a 20 is the day the beat should be
   loud.
3. **The floor fired** — a crew floor lifted a die (`mods.floor > 0`, `App.tsx:5693`). Dramatising
   the lift is a genuine opportunity, and a genuine scope risk. See **Q5**.
4. **The last day** — day 30 of Tour One, where `ResolutionCeremony` is about to land anyway.

Otherwise the short form (A) plays: ~700 ms, dock-local, no dim, no overlay mount.

```
  DAY 1 / nat-20 / floor fired        every other morning
  ┌──────────────────────────┐        ┌──────────────────────────┐
  │  centre-stage throw      │        │  cockpit undimmed        │
  │  DAWN HAND · DAY n       │        │                          │
  │  ⬡ ⬡ ⬡ ⬡ ⬡  → fly home   │        ├──────────────────────────┤
  ├──────────────────────────┤        │ DAWN HAND ⬡⬡⬡⬡⬡  (lift,  │
  │ DOCK                     │        │  tumble, land, settle)   │
  └──────────────────────────┘        └──────────────────────────┘
            ≈1700 ms                            ≈700 ms
```

- **Honest cost:** this is **two presentations behind one predicate**, not one animation with a
  parameter. Price it as B plus roughly a third — the timeline builder is shared, the staging is not.
- **Why it is not over-engineering:** it is the same shape `tabletop-ui` §2's tiers already demand
  (a routine 400–700 ms move vs. a 1.5–2.5 s scene moment) and the same shape the repo already
  ships for one-shot beats (`OpeningMarker`'s armed record). It answers the one question neither A
  nor B answers: *what does this look like on day 30?*

---

## 5 · Recommendation

**Option C, built as Option B first.**

Concretely, and this is a sequencing recommendation as much as a design one:

1. **Ship B's full form and A's short form in one task, with the predicate stubbed to "always full"
   behind a dev toggle**, so the owner reviews the loud version against the real cockpit with the
   screenshot loop (`tabletop-ui` §7) before the decay rule is tuned.
2. **Then set the predicate.** Day 1 + notable hand is the minimum; the floor beat is optional
   (**Q5**).

**Rationale, against the house direction:**

- `tabletop-ui` §8's meta-signal is recorded four times: offered a conservative option and a bolder
  immersive one, the owner chose bolder every time — full HUD dissolution over panel-restyle, rich
  card faces over blanks, the pure house font over a hybrid, in-person review over a shortcut. The
  log's own instruction is *"Calibrate future recommendations toward the more game-like/immersive
  end."* **Option A is the dilution.** Recommending it would be offering a dilution of a rule the
  owner has already set, which §8's Gate-1 entry names explicitly as a thing to stop doing.
- The same §8 entry that mandates boldness also mandates **Cinematic / Snappy / Instant**, from the
  owner's MTG Arena experience of turning repeat animations off. Option B alone honours the first
  half and ignores the second. **Option C is what those two corrections look like when both are
  obeyed at once.**
- `tabletop-ui` §5 says the board is centre-stage and stats live in diegetic edge furniture. Option
  B's throw puts the day's most important resource on the board for the moment it is dealt and then
  files it back into its edge plaque. That is the house layout rule playing out in time.
- The information-density proviso in §8 is satisfied: the dice end where they always were, with the
  same faces, same `data-testid`s, same badges. Nothing is hidden — §8's Gate-1 correction (3),
  *"never regress information"*, is the failure mode to watch, and the fly-home is what avoids it.

**What I am not recommending, and why it matters:** I am not recommending that the beat be blocking,
or that it skip the reduced rail, or that it duplicate the dice into throwaway DOM. §3.5's numbers
make the first two expensive for no gain, and the third would break the e2e's `die` locators and the
`long-haul` invariant sweep that reads them.

---

## 6 · Interactions — what else is on screen

| Situation | Proposed behaviour | Basis |
| --- | --- | --- |
| **Dusk killed the captain** (`succession` set in the same `set`) | Roll stands down entirely; the estate notice is the beat. Render-time suppression, no queue. | `store.ts:2382–2383`; `App.tsx:1133`; idiom from `App.tsx:1236` |
| **Dusk resolved an encounter** (`combatAftermath`) | Same — stand down. | `store.ts:2382`, `:2391` |
| **Hangout panel open** | Dims with the cockpit, is not closed, stays interactive after the dim releases. | `App.tsx:921`, `:1100`; `--ld-dim` precedent `App.tsx:2913` |
| **Storylet panel open** | Same. Note the panel already self-clears if its offer drains (`App.tsx:948–953`). | `App.tsx:920`, `:1089` |
| **Mid-animation player input** | Never blocked. A click anywhere lands the timeline instantly (`progress(1)`); dice are armable the moment their own face has settled, not only at the end. | `tabletop-ui` §2; `App.tsx:2948–2952` |
| **First-turn walkthrough running** (T-187) | The rails already own input constraint via React `inert` (`App.tsx:1205–1212`); the `hand` region is always open (`walkthrough.ts:325–327`). The roll must not add a second constraint mechanism. Day 1 with the walkthrough live is also when the opening marker is up — see below. |
| **Opening marker up** (day 1, T-200) | The marker is z 88 and `aria-modal` (`App.tsx:1299–1301`). **Proposed order on the birth of a career:** marker (the *why*) → dawn roll (the *what you have*) → walkthrough (the *how*). That means on day 1 the roll should wait for the marker to be signed, or the marker should sit above a roll the player will replay on day 2 anyway. **Unresolved — Q1.** |
| **Day-30 resolution ceremony** | `resolutionCeremony(s.game)` fires on dawn of day 31 (`App.tsx:939–943`) — i.e. exactly on an `endDay`. The certificate outranks the roll; stand down. |
| **Liar's Dice hand live** | `dareHand != null` forces the Hangout panel open and locks it (`App.tsx:961–967`). `endDay` folds the hand as a loss — the dock hint says so at `App.tsx:5680`. The roll should not celebrate over a forfeited pot; **Q3** covers whether "stand down" extends here. |
| **`.sweep` boot wipe** | Both fire on `bootKey`, both ~1.1 s, sweep is z 95 (above). Option B proposes suppressing the sweep on the day-turn path only — **Q6**. |
| **T-194** (dawn hand illegibility, `TASKS.md:2941`, `after: T-198`) | Its Accept part 2 — *"show the roll before it's committed, everywhere a die is read"* — teaches what a die **buys**. T-201 teaches what a die **is**. They compose; they do not overlap in pixels (T-194's read renders at the *action*, T-201's at the *deal*). **Recommend T-194 lands first** so the ceremony's payoff already has somewhere to point. |
| **T-186** (visual identity, `TASKS.md:2218`, `[BLOCKED BY = Owner ruling]`) | Everything above is amber-on-black inside the committed CRT frame, so **T-201 does not inherit T-186's block**. If the owner wants the dawn roll to introduce a second hue, it does, and should wait. |
| **T-200** (`TASKS.md:3902`, DONE) | The closest precedent for "an unmissable beat": pure-CSS staged ceremony, armed once per career, render-time suppression, no engine touch. Option C reuses its arming pattern wholesale. Its CI **CORRECTION** note is also a warning: `packages/desktop/e2e/support/cockpit.ts` is a **separate, duplicated** helper the local gate does not run. A blocking dawn beat would break it the same way; a non-blocking one will not. |

---

## 7 · Open questions — named, not decided

These are the author's to rule on. None of them is resolved above.

- **Q1 · Day-1 ordering.** Opening marker, dawn roll, walkthrough card and (soon) T-194's coach all
  want the first thirty seconds of a career. Marker → roll → walkthrough is proposed, not decided.
  A defensible alternative: suppress the roll entirely on day 1 and let day 2 be its debut, since
  day 1 already has three things to look at.
- **Q2 · Does the beat fire on save-load and career-import?** `bootKey` is bumped by all four paths
  (§3.1). "The day turned over" and "a hand was dealt" are both defensible readings and the existing
  scramble already takes the second.
- **Q3 · The stand-down set.** Proposed: `succession` or `combatAftermath`. Should a folded Liar's
  Dice hand, or a `patrolScan`, join it? And is stand-down right at all, versus letting the
  successor's first hand *be* the beat that says the career continues?
- **Q4 · Cinematic / Snappy / Instant.** SpacerQuest ships a binary (§3.6). Does the third tier land
  in T-201's implementation task, or as its own task that retrofits every existing beat
  (`.sweep`, `om-*`, `ld-settle`, the Liar's Dice timeline, `.die.bloom`)? Recommending the latter,
  but it is the owner's call and T-201 should not ship a cinematic-only beat while it is unanswered.
- **Q5 · Do the floor and the re-roll charges get their own beat?** A die visibly landing below the
  floor and being *lifted* is the best game-feel idea in this document and the biggest scope risk in
  it. `rollDawnHand` applies the floor inside the engine (`day.ts:188`), so the pre-floor face is
  **not currently observable by the UI** — dramatising it would mean surfacing it, which is engine
  work and a `DawnRoll` event-shape change. That crosses the "engine owns rules" line and should be
  a separate task if wanted at all.
- **Q6 · Does the `.sweep` boot wipe survive the day turn?** Option B proposes suppressing it on
  that one path. It is an existing shipped beat, so retiring it is a real change, not a detail.
- **Q7 · The label copy.** "DAWN HAND" is the owner's placeholder and explicitly TBD. The dock
  already says `Dawn Hand … DAY n` (`App.tsx:5691–5704`); the ceremony repeating it verbatim is
  reinforcement, and a distinct register (`DAWN · DAY 12 · FIVE DICE`, or a diegetic
  watch-change line) is the alternative. Register reference: `om-kicker` / `rc-kicker`, all-caps and
  letterspaced, e.g. `TOUR ONE · DAY 30` (`App.tsx:1426`). Also unresolved: whether the label
  carries the day number, and how long it holds after the dice settle.
- **Q8 · Sound.** In or out of the implementation task? `sound.play('dawn')` currently fires
  unstaged, after the state commit (`store.ts:2404`). The `tabletop-ui` §3 shape is per-die foley on
  each landing plus the triad on settle — which means restaging an existing cue, not just adding one.
- **Q9 · Do the hex tiles tumble in 3D?** `.d6` at the Liar's Dice table is a real CSS-3D cube with
  `perspective: 620px` and a six-face transform (`theme.css:4238–4322`). The dawn `.die` is a flat
  hexagon-clipped tile (`theme.css:2124–2145`) and is deliberately unclipped at the slot level so
  the re-roll button is clickable (`App.tsx:5718–5720`). A d20 has no honest six-face cube; making
  the dawn dice tumble in 3D means either a fake or a real icosahedron, and either is its own piece
  of work.

---

## 8 · Scope and policy notes

- **No fingerprint, no capstone, no sweep.** The implementation this proposes is pure UI
  presentation. It touches no engine rule, adds no `GameEvent` and no `GameState` field, so
  `rulesFingerprint` does not move — the identical claim T-200 recorded for the same class of
  change at `packages/ui/src/opening.ts:54–56`. No `balance:extract`, no Sweep, no milestone
  capstone is owed by T-201 **or** by its follow-up, *unless* Q5 is answered "yes", which would make
  it engine work and change this paragraph.
- **No save migration.** No persisted shape changes. If Option C's armed record is added, it is
  client meta-state under an `sq.`-prefixed key alongside `sq.opening.v1`, outside the save envelope
  — same reasoning as `opening.ts:49–52`, so `CURRENT_SAVE_VERSION` is untouched.
- **Engine/content boundary.** Nothing here proposes a new outcome kind or a content row. The one
  idea that would cross the line (Q5's pre-floor face) is flagged as such rather than smuggled in.
- **The screenshot loop is owed by the implementation task, not this one.** `tabletop-ui` §7
  requires build → screenshot → self-critique before visual iteration, and §7 also asks for 2–3 full
  variants of a screen at an aesthetic junction. A `.md`-only gate cannot run it; the ASCII
  storyboards in §4 are the substitute, and the follow-up task must run the real loop and halt for
  the owner's eyes (§7: *"never self-approve aesthetics"*).
- **Follow-up task: not filed.** Per T-201's Accept.

---

## 9 · Sources

**In-repo** (all re-verified at `b8343150`): `packages/ui/src/App.tsx`, `packages/ui/src/store.ts`,
`packages/ui/src/theme.css`, `packages/ui/src/sound.ts`, `packages/ui/src/opening.ts`,
`packages/ui/src/walkthrough.ts`, `packages/ui/src/format.ts`, `packages/engine/src/day.ts`,
`packages/ui/e2e/**`, `packages/ui/playwright.config.ts`, `docs/DAWN-HAND-REDESIGN.md`,
`docs/PRD-REIMAGINED.md` §4, `docs/LESSONS.md`, `TASKS.md` (T-186, T-194, T-200, T-201),
`~/.claude/skills/tabletop-ui/SKILL.md` §§2–5, 7, 8.

**External:**

- [GSAP is Now Completely Free, Even for Commercial Use — CSS-Tricks](https://css-tricks.com/gsap-is-now-completely-free-even-for-commercial-use/)
  and [Flip | GSAP Docs](https://gsap.com/docs/v3/Plugins/Flip/) — the whole library, all former
  Club plugins included, became free on 2025-04-30. This retires `tabletop-ui` §4.4's GSAP licensing
  caveat for commercial release and makes Flip usable for Option B's fly-home.
- [Fast Mode Introduced! — Slay the Spire forums](https://www.speedrun.com/slay_the_spire/forums/dg73b)
  and [QoL Request: Speed up Longer Sequences — Slay the Spire 2](https://steamcommunity.com/app/2868840/discussions/0/798966340582929693/)
  — direct precedent for the repeat-fatigue argument behind Option C and for `tabletop-ui` §8's
  three-tier rule: a roguelike whose animations repeat every run shipped a global speed toggle
  because players reported the repetition as tedium, not spectacle.
- [WCAG 2.3.3 Animation from Interactions — Deque University](https://dequeuniversity.com/resources/wcag2.1/2.3.3-animations-from-interactions)
  — motion animation triggered by interaction must be disableable unless essential; large-scale and
  spinning motion is the highest-risk category for vestibular disorders. Option B's centre-screen
  tumble is squarely in that category, which is why the reduced rail is a hard requirement rather
  than a nicety, and part of why Q4 (the third tier) matters.
