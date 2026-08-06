# The cockpit — standing presentation rulings

**Status:** Standing decisions for everything the player sees and hears — the cockpit's visual
language, the dawn-hand and first-turn ceremonies, the audio bed, animation, and the boundary
between UI state and game state. Harvested 2026-08-06 from the T-185 … T-208 task log. The design
records are `docs/DAWN-HAND-REDESIGN.md`, the `tabletop-ui` house style, and the per-feature
redesign docs; this file carries the rulings that bind future work.

Where a presentation ruling has a measurement or fingerprint consequence it is stated there and
in `docs/BALANCE-RIG-DECISIONS.md` Part H; where it has a persistence consequence it is stated
in `docs/SAVE-FORMAT-DECISIONS.md`. Liar's-Dice-table presentation lives in
`docs/LIARS-DICE-DECISIONS.md` (LD-31 … LD-34), not here.

---

## 1. The visual language

**UI-1 — Each cockpit quadrant owns an EXCLUSIVE shape language, and a new treatment is chosen
by ELIMINATION, not by taste.** (T-191, building on T-189 and T-190.) The four claimed languages
are: starmap = SVG star plane in square 1px `--hair` pane chrome (`.pane.starmap`); ship =
T-189's annotated hull outline with callouts and yard bench (`.pane.ship`); manifest = T-190's
ROUNDED 2px clipboard with bulldog clip, punched paper, torn edge and a −0.45deg hang
(`.pane.manifest-board`); Port Ledger = T-191's bolted SERVICE RACK (chamfered plates, riveted
mounting rail, bolt heads). Any future quadrant treatment must pick a language none of these
already owns. *(T-218 note: the four SHAPE languages are unchanged, but their MATERIAL moved —
the pane's square 1px chrome is now `var(--edge)` + `--bevel` machined steel rather than a 1px
`--hair` amber line, and the manifest board's 2px stock and the rack's rail are neutral metal.
Shape, not material, is what UI-1 reserves.)*

**UI-2 — Quadrant differentiation is carried by SHAPE, ICON and MOTION — never by a second
hue.** (T-190, T-191.) Every treatment stays inside the committed CRT-amber tokens (`--ember`,
`--ember-hi`, `--amber`, `--amber-dim`, `--hair`, `--panel`, `--tube`, `--glow`), one phosphor
with emphasis by reverse video. T-186 has since ruled against candidate A (per-instrument accent
hues), so the per-quadrant-hue option is **closed, not deferred**. While a palette ruling is
still open, a new treatment additionally: introduces no second hue, touches no shared rule
(`.pane`, `.pane > header`, `.col`, `.contract`, `.flag`, the onboarding/walkthrough anchors),
and is written additively under ONE scoped block so the whole treatment is revertible in a single
block. Local overrides that ARE required are named explicitly — T-190 needed `.pane`'s
`overflow: hidden` → `visible` on its section, with `.pane .body` keeping its own
`overflow: auto`; T-191 deliberately did NOT relax `.pane.trade`'s `overflow: hidden`.

> **T-218 AMENDMENT (2026-08-06) — THE PALETTE RULING IS CLOSED.** T-186 ruled candidate D
> ("one phosphor, two materials"), and T-218 shipped it. Three consequences bind future work:
>
> 1. **The shared-rule freeze above is LIFTED FOR THAT RULING ONLY, and is now RE-IMPOSED.**
>    T-218 was the palette ruling, so it deliberately re-materialised `.pane`, `.pane > header`,
>    `.contract`, `.flag`, `.btn`, `.chip`, `.dock` and the overlay frames — the exact rules UI-2
>    froze. That licence is spent. From here the freeze reads as written again: a new quadrant
>    treatment touches no shared rule and stays revertible in one block.
> 2. **The token list in UI-1/UI-2 gains the STEEL family**, which is additive and is *not* a
>    second hue: `--steel-hi`, `--steel`, `--steel-lo`, `--steel-deep`, `--etch`, `--etch-dim`,
>    `--well`, `--edge`, plus the `--bevel` / `--recess` shadow pair. Steel is near-achromatic by
>    definition (max−min channel spread ≤ 12), so the hue-count is unchanged at one. The five
>    amber tokens keep their exact T-302 values — T-218 was additive, not a re-hue, and
>    `packages/ui/src/__tests__/visual-identity.test.ts` fails the build if any of them moves.
>    `--panel` and `--tube` were RETARGETED onto `--steel` / `--well`: they were never part of the
>    protected five, they were the amber-on-amber haze the ruling exists to remove.
> 3. **The material triage rule, which decides every future border and background:** *inside the
>    glass* (readouts, charts, SVG marks, dim labels sunk into a `--well`) keeps its amber token;
>    *outside the glass* (chassis, bezels, frames, header strips, button caps, rails, trays, chip
>    and input frames) is `1px solid var(--edge)` plus `--bevel` or `--recess`, with
>    `--etch`/`--etch-dim` legends. Separation comes from the bevel/recess shadow, never from a
>    coloured hairline.

**UI-2b — REVERSE VIDEO IS RESERVED TO REAL URGENCY.** (T-218, the single interaction rule the
owner folded into candidate D — approved as a two-selector diff against D's own source,
`docs/design/T218-reference/chassis-rvrule.html`.) A solid `--ember` fill with dark text is how
the product says *a consequence is landing on you*. It is **not** how "selected", "armed", "on",
"ready", "owned" or "available" is drawn — those read as **LIT** (an `--ember` outline, inset
ring, glow and `--ember` text on the surface's own dark body), never as **INVERTED**.

* The sanctioned sites are the four the ruling named — `.chip.rev` (the DEBT marker),
  `.flag.urgent`, `.due-soon b`, `.ship-region.critical` (a dead ship system) — plus the engine's
  own refusal/failure surfaces (`.notice`, `.result.fail`, `.ship-reason`, `.nat-juice.fumble`,
  `.wire-entry[data-wire-kind='flaw-override']`, `.sl-lock`/`.rc-lock`) and the hostile-attitude
  readout, which is the same category.
* The two states the ruling explicitly MOVED off reverse video are `.slot.ready` (the
  check-clearing badge) and `.die.sel` (the armed die). Both are pinned in both directions by
  `visual-identity.test.ts`; re-inverting either needs a new owner ruling, not a refactor.
* The button-body and locked-row treatments from the bake-off's legibility reviewer were
  **explicitly excluded** from the ruling. D's own button/lock treatment ships as built. Do not
  reach for that build for anything.

**UI-3 — A new bark/annotation style is a FACE-ONLY modifier on the existing class, never a new
sized or coloured rule.** (T-207.) `.co-enemy-bark` modifies `.co-enemy-hist` with italic +
opacity only, so size and colour stay in the single copy `.co-enemy-hist` owns;
`.co-aftermath-bark` sits beside `.co-aftermath-lines`. The dice table got **no** new rule at
all — the roaming bark reuses `.ld-tabletalk` verbatim, because it is the same KIND of thing as
the roster seat's line and must not grow spacing that could drift from it.

**UI-4 — Theming that costs the player information is worse than no theming, and chrome added to
a quadrant is laid out as NORMAL FLOW inside the pane's own scroll container.** (T-190, T-191.)
An absolutely-positioned rail inside `.pane .body` sizes to the VISIBLE box (`.body` is the
scroller) and scrolls away from what it holds, so T-191 made `.pane.trade > .body` a two-column
grid and let the rail span every module. Two details are load-bearing rather than stylistic:
`align-content: start` (the default `normal` stretches auto rows and inflates every module on a
short board), and the rail spanning `1 / span 30` rather than `1 / -1`, because these rows are
IMPLICIT and `-1` resolves against the one-line explicit grid.

**UI-5 — Hand-authored pane art is sized to the pane's MEASURED box, and along its LONG axis.**
(T-189.) The ship pane is 623 × 220 CSS px at the suite's 1280 × 720 viewport (`.col.left`'s ship
row is `minmax(220px, 1fr)`), so the shipped viewBox is 480 × 156. A first pass at a vertical
300 × 220 ship was rejected because it filled the pane and pushed every control below the fold.
Future pane art is measured against that box, not guessed. Corollary: percentage alignment of
HTML callouts holds only while the svg box matches the viewBox aspect, so a diagram is sized by
`max-width` on the wrapper and **never** by `max-height`.

---

## 2. UI state, engine state, and the line between them

**UI-6 — Presentation may key off engine state through a DERIVED KEY, never through a new engine
field or rule.** (T-190, T-191.) `manifestSheet(game)` exposes `boardKey = ${systemId}:${day}`
(the engine regenerates the board per port at dawn), and `key={sheet.boardKey}` on `.mb-sheet`
makes a genuinely new board REMOUNT and visibly re-post while an ordinary re-render does not.
`ledgerFascia(game)` returns exactly four such fields (`portName`, `fuelKey`, `debtKey`,
`dispatchKey`) with zero `useState`, zero `useEffect`, zero timer and zero engine call. Two
sub-rules came with it: a set-derived key must be SORTED (`dispatchKey` joins live PORT-surface
storylet ids sorted) so an engine-side reordering of an unchanged offer set fires no spurious
re-post; and the keys are mirrored onto the DOM (`data-dispatch-key`, `data-fuel-key`,
`data-debt-key`) so e2e can prove the motion is wired to state rather than to a clock. The name
`ledgerFascia` was chosen because `portLedger` is already taken (T-1405, the port-ownership
income ledger).

**UI-7 — A changing React `key` may NEVER sit on an element that contains an input.** (T-191.)
Remounting the wrappers around `fuel-amount` / `debt-amount` would destroy a typed value and the
caret mid-entry — a functional behaviour change wearing a styling hat — and would break the
fill-then-buy flows in `manifest-trade.spec.ts` and `progression.spec.ts`. Only leaf display
nodes (`<b class="lb-tick">`) and decorative elements (`<i class="lb-sweep">`) may be keyed.
Related and ruled at the same time: the existing `debtDue <= 5` `due-soon` threshold was left
alone, because moving it is a rules change wearing the same hat.

**UI-8 — A collapse/stow affordance is COMPONENT state, never game state.** (T-190.) Not
persisted, no engine call, no save-shape change; `railsProps(state, 'manifest')` stays on the
outermost `<section>` so `inert` / `data-rails-off` semantics are byte-identical and the control
dies with the rails.

**UI-9 — The UI never fabricates engine state to gate on.** (T-190, T-192, owner ruling
2026-08-05.) The manifest's "available only in a port" half is NOT built: jumps resolve
synchronously (`travel.ts`), so there is no occupiable in-transit state, and a `player.docked`
field or a UI predicate pretending to be one would be faked engine state that becomes debt the
moment a real travel state lands beside it. **Jumps stay instant and the manifest's
always-available-at-port behaviour is FINAL.** A future transit-duration mechanic is a new design
decision with its own task, not a reopening of T-192.

**UI-10 — A UI reader must not change an engine or store signature to reach content it can look
up itself.** (T-207.) `combatAftermathSummary(events)` stayed ONE-argument by resolving the
captain from the event's own `interceptorId` in `NPC_PROFILES` — the lookup `shipLostToLabel`
already does off `ShipLost.interceptorId` — leaving both store call sites and every existing test
untouched. That lookup doubles as the named/anonymous test, since an anonymous id is `anon-*` and
is not in the cast.

**UI-11 — A Free Action must neither REQUIRE, CONSUME, nor DISARM the die the player has armed
for their next Main Action, and the gate lives in the `packages/ui/src/store.ts` CREATOR, not in
a per-button `dieArmed` prop in `App.tsx`.** (T-196c.) The rejected shape is the pre-T-196c one
where every freed creator read `state.selectedDie`, refused on null and cleared it on commit —
buying fuel silently dropped the jump die you had queued. Freed creators also pass
`reactToEvents` a hard `false` for the commit cue, while the FAIL cue still fires unconditionally
on a refusal.

---

## 3. Ceremony: the first turn and the dawn hand

**UI-12 — Walkthrough step-completion signals are MONOTONE one-shot flags folded from events,
never live predicates over mutable game state.** (T-187.) `nextWalkthroughFlags` in
`packages/ui/src/walkthrough.ts` only ever advances; deriving "signed" from
`player.activeContract != null` regresses the pointer back to step 3 the instant delivery nulls
the contract.

**UI-13 — Walkthrough step 5 is ACK-ONLY: `delivered` is recorded but does not gate.** (T-187.)
A patrol confiscation or a forfeited hold means the jump landed and the delivery did not, so
gating on delivery would strand the player with no action that could ever complete the step.

**UI-14 — There is no state the rails can create that the player cannot leave.** (T-187.) `hand`
and `chrome` are open on EVERY walkthrough step, and `railsSuspended` makes the rails fully
transparent whenever the ENGINE has already constrained the player (`encounter`, `dareHand`,
aftermath, succession, patrol scan).

**UI-15 — An instructional overlay is CLICK-THROUGH except for its own controls, and is anchored
to the column OPPOSITE its target.** (T-187.) `.walkthrough { pointer-events: none }` in
`theme.css`; only its two `.wt-acts button` children take pointer events. There is deliberately
no backdrop and no focus trap — a trap would break UI-14's always-open hand/chrome escape. Rails
do the constraining; the popup only instructs.

**UI-16 — A collapse/stow affordance inside a scripted-rails region is FORCE-OPEN while the
rails are up.** (T-190.) `open = !stowed || walkthroughActive(state.walkthrough)` is load-bearing,
not defensive: the walkthrough's step 3 rails allow only the `manifest` region, so a stowed board
there is a tutorial blocking its own lesson.

**UI-17 — Walkthrough arming: `init()` arms only with no save AND a never-run record; `newGame`
arms only from `off`; a slot load or import RETIRES a running walkthrough.** (T-187.) Settings →
`set-replay-walkthrough` is the only way back. The opening marker's arming rule is deliberately
DIFFERENT — see UI-18.

**UI-18 — The opening marker arms ONCE PER CAREER, unlike the walkthrough's once-per-profile.**
(T-200.) The walkthrough teaches CONTROLS (re-teaching would be the tutorial wall T-311 avoids);
the marker establishes THIS career's stakes. So `init()` arms it only on a virgin boot,
`newGame()` arms it unconditionally, and `loadSlot`/import retire it — a mid-career save coming
back off disk is not a new run.

**UI-19 — The sequenced first-turn walkthrough did NOT replace T-311's contextual coach.**
(T-187.) It ships as a NEW module `packages/ui/src/walkthrough.ts` rather than an addition to
`format.ts`, specifically so the non-replacement is greppable. The two systems coexist, with the
scripted one scoped to turn one/two only.

**UI-20 — Any dawn-hand beat is bound by four non-negotiables from `tabletop-ui` §2.** (T-201.)
Never blocking (no focus trap, no `inert`, no awaited promise); skippable by a click that lands
the timeline (`timelineRef.current?.progress(1)`); an INSTANT rail that renders the settled DOM
on the first frame (the `LiarsDiceScene` shape — under reduced motion **the timeline is never
created**); and `useDiceRoll` retired or absorbed rather than left running underneath, because
two roll animations at once is the failure mode.

**UI-21 — The dawn hand is 5 dice base and up to 7 with a First Officer, with a floor and
re-roll charges alongside.** (T-201; `packages/engine/src/day.ts:170–187`.) Any dawn-hand
ceremony renders N dice and lays out N positions — hard-coding five is a defect, not a
simplification.

**UI-22 — Ordering for the dawn-roll work: T-194 (dawn-hand illegibility) lands FIRST.** (T-201.)
T-194 teaches what a die BUYS at the action; T-201 teaches what a die IS at the deal, and they do
not overlap in pixels, so the ceremony needs somewhere to point. The beat does NOT inherit a
palette-ruling block while it stays amber-on-black inside the committed CRT frame; it would
inherit one only if the roll is asked to introduce a second hue.

---

## 4. Motion

**UI-23 — Every new animation is railed behind `prefers-reduced-motion` and the reduced-motion
path is INSTANT, never "animated then skipped".** (T-190, T-191.) Motions live inside
`@media not (prefers-reduced-motion: reduce)` or carry an explicit reduced-motion
`transition: none`, the house rule `theme.css` already keeps. This is what keeps the e2e honest,
since the whole suite runs under `page.emulateMedia({ reducedMotion: 'reduce' })`. The claim is
asserted in BOTH directions off computed `animation-name`, never inferred from the CSS source —
and any such assertion must toggle `emulateMedia` **and** `page.reload()`, because the cockpit
reads the OS preference once per render and stamps `data-motion` on `<html>` as a blanket
`animation: none !important` kill-switch.

---

## 5. Audio

**UI-24 — The score is SYNTHESIZED: zero asset files, CC0.** (T-185.) `packages/ui/src/music.ts`
is a CLIENT of `packages/ui/src/sound.ts` — it never constructs an `AudioContext` and never
reaches `destination`. No `if` about audio lives in `store.ts`; the entire wiring is
`music.syncScene(state)` at module scope and inside `set()`, the store's one state-update choke
point, on the same argument `steam.syncPresence` already carries there.

**UI-25 — Every music voice fundamental is constrained to 150 Hz – 4 kHz, asserted in the unit
suite.** (T-185, closing F-185-2.) This is a measurement turned into a design rule: the old bed
measured −39.9 dB across 20–100 Hz, −112.7 dB across 100–150 Hz and −132 dB above 150 Hz — 0.25
peak in the meter and silence in the room, because small speakers roll off hard below ~150 Hz.
Destination peak level is not audibility.

**UI-26 — Mix-level raises go INSIDE the code path, never into a mixer default.** (T-185, closing
F-185-3.) The fix was a single `CUE_GAIN = 2.2` (+6.8 dB) inside `pluck` — the one envelope every
cue passes through, so the by-ear balance is preserved — plus a `tanh` `WaveShaper` soft-clip
between `masterGain` and `destination`. Explicitly NOT `DEFAULT_MIXER.sfx`: that value is
persisted, so raising it does nothing for any player who has ever opened Settings.

---

## 6. Judging the work

**UI-27 — A visual-judgement screenshot pass requires more than one element-scoped shot.**
(T-190.) An element-scoped screenshot crops exactly the feature that proves the claim (T-190's
clip deliberately overhangs the frame), and "distinct from the thing next to it" is a comparison
— so the pass takes the element, the neighbouring column AND the full cockpit, and captures the
pre-change baseline by STASHING the diff rather than from memory. Shots land in the gitignored
`packages/ui/test-results/`; no raster art and no new binary is committed. Reachability below the
fold is asserted mechanically, never eyeballed: a restyle spec ends by CLICKING the bottom-most
control at the suite viewport, and where a control is legitimately disabled it is `hover()`ed —
both fail on an occluded or offscreen element. Where height parity is claimed, it is MEASURED
against a stashed baseline rather than asserted (T-191: `.pane.trade .body` scrollHeight
574 → 571, clientHeight 163 → 163, clientWidth 591 → 591, all five `.lb-head` heights 15px →
15px).
