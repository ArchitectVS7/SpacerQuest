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
are: starmap = SVG star field in square 1px `--hair` pane chrome (`.pane.starmap`) — since T-215
(T-188's ruling) that field is a **rotatable 3D lat/long globe**, not the flat 2D projection this
line originally described, and the flat `starmapProjection` path is deleted rather than kept as a
fallback; ship =
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
  **These are the ONLY two selectors that differ from D's own reference build**, and both were taken
  byte-for-byte from `docs/design/T218-reference/chassis-rvrule.html:239,270` and marked
  DO-NOT-REVERT in source — `.slot.ready` at `packages/ui/src/theme.css:1912-1928` (an outlined
  `--well` fill with `--ember` border, text and inset glow, not a solid ember fill) and `.die.sel` at
  `theme.css:2457-2481` (the dark steel body kept, with an `--ember` inset ring, glow and text).
  `.die.sel`'s `translateY(-8px)` lift STAYS: it is an app affordance, not part of the reverse-video
  question.
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

**UI-32 — Candidates A and B of the T-186 palette bake-off are CLOSED, and the REASONS are the
ruling.** (T-186.) UI-2 already records that A is closed; what stops it being re-proposed is why.
**A — per-instrument diegetic accent hues** (combat vs. trade vs. Cantina as different "instruments")
is closed on two independent grounds: it is a CSS-architecture trap, because custom properties do not
cascade the way the proposal assumed — every derived token needs re-declaring at every scope or it
silently stays amber — and it is a MEASURED accessibility regression, since under deuteranopia
simulation the four instruments collapse into two indistinguishable pairs. **B — a harder break from
monochrome** is closed because it would force rewriting `docs/PRD-REIMAGINED.md` §4 and would
invalidate the stated Electron/DOM-over-Tauri/canvas rationale at `docs/TECH-STACK.md`:164 and
:247-248. Neither is deferred; reopening either is a new owner ruling against those two grounds.

**UI-33 — "Everything blends together" is a CONTRAST/STRUCTURE defect until measured otherwise,
never a hue shortage.** (T-186.) Three independent reviewers converged 3/3 on the same root cause —
panel-to-background contrast at 1.04:1 and pane borders at 1.36:1, both under the 3:1 perceivability
floor — and all three landed on "add zero hues, fix through structure". A legibility complaint that
NAMES a hue fix gets measured before the named fix is priced.

**UI-34 — `--accent` and `--line` were DELETED, not defined and not promoted.** (T-216.) The Accept
clause offered both branches — give them amber-family values, or adopt them as real documented
second/third-hue tokens — and promotion was rejected, because T-218's whole subject is making "one
phosphor" TRUE. Neither token was ever declared anywhere in the repo, so their `#4fd1c5` / `#2b3a44`
fallbacks were what actually painted (see `docs/LESSONS.md` L-067). Every site is now routed by
UI-2's material rule instead: `.ship-honor`'s frame is chassis (`theme.css:5375-5382`, `5395-5397`),
the `you` and held-rank markers are LIT `--ember-hi` (`theme.css:5413-5417`, `5424-5428`), and
`.comp-effect-next`, which carried the same teal, is lit too (`theme.css:5437-5440`).

**UI-35 — A semantic distinction inside the one-phosphor palette may NOT be carried by hue alone.**
(T-216.) Viénot-matrix simulation of the two live attitude colours (`#e0562a` hostile vs `#c0781a`
neutral `--amber`) put both at hue ~52° within 3 units on every channel under deuteranopia, and the
same collapse under protanopia: a deuteranope or protanope could not tell a hostile captain from a
neutral one. Moving `.as-hostile` to an amber-family value is therefore explicitly INSUFFICIENT on
its own. The shipped fix (`theme.css:3625-3670`) adds TWO channels that do not depend on hue — a
luminance inversion (`background: var(--ember)` with `color: var(--well)`, which survives greyscale)
and a `!` glyph via `::before`, which depends on no colour channel at all. That inversion is
PERMITTED under UI-2b rather than in tension with it — a hostile captain is real urgency, the exact
category the rule reserves inversion for — and the reasoning is written into the CSS beside the rule
so a future reader does not "fix" it back.

**UI-36 — A MATERIAL or skin change must cost no MEASURED geometry.** (T-218.) The board's 2px
stock, `overflow: visible`, the −0.45deg hang, the chamfer `clipPath` and the rail span were all kept
because T-190 and T-191 MEASURE them (UI-5, UI-27); `.pane`'s body keeps the pre-T-218 12px content
inset exactly (5px well margin + 7px padding) so content width is unchanged; and `.hand` took the
reference build's `.tray` recess WITHOUT being renamed, because 68 `App.tsx` call sites plus e2e
depend on the name. A re-material is additive to the shape languages UI-1 reserves, never a re-layout
smuggled in beside them.

**UI-37 — The Galactic Wire band reserves the cap's space through NORMAL FLOW, not a measured
offset.** (T-217.) `.wire` is a flex row; `.cap` is a normal-flow item that reserves exactly its own
width whatever it contains; a new `.wire-track` (`flex: 1; min-width: 0; overflow: hidden`,
`theme.css:2085-2135`) takes the remainder and clips the scroll, and `.ticker`'s
`padding: 9px 0 9px 138px` became `padding: 9px 0 9px 6px` (`theme.css:2153-2161`). The single
`App.tsx:5531-5541` change is the wrapper element. A `ResizeObserver` / `getBoundingClientRect`
re-measure was explicitly REJECTED as a correct-but-fragile answer to a layout question CSS can
answer outright — the magic number was deleted, not re-measured. **`min-width: 0` on the track is
load-bearing**: without it the nowrap ticker sets the flex item's min-content width and shoves the
cap back off the left edge.

**UI-38 — No pixel constant may encode `.cap`'s width, because that width is DATA-DEPENDENT.**
(T-217.) T-1406 renders BULLETIN storylet chips inside `.cap`, so the correct constant differs
between two boots of the same build — there is no number that is right. Any guard on this geometry
therefore plays FORWARD to the widest data case rather than measuring a virgin boot:
`packages/ui/e2e/visual-identity.spec.ts` asserts `cap.right <= track.left` and then ends up to six
days until the wire actually carries a BULLETIN chip before re-measuring.

**UI-39 — Active label-collision suppression is a REQUIRED part of the 3D globe starmap, and
"rotate to a clean angle" is not a fallback.** (T-188, measured at the 2026-08-05 ruling pass by
sampling 90 rotations — every 20° yaw × 5 pitches, using the same bounding-box method as
`packages/ui/src/__tests__/starmap-label-overlap.test.ts`.) 97.8% of rotations carry at least one
collision, averaging 4 per frame, with `Arcturus-6`/`Fomalhaut-2` colliding in 22 of 90 samples: the
20 charted systems are too tightly clustered near Sol for rotation to help. Suppression priority is
current system → set-course target → nearest-to-camera; losers keep their dot and get their label
back on hover or selection.

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

**UI-28 — A DC shown BEFORE a die is armed is a PLANNING read; a DC shown WITH one armed is a
LIVE read, and the two must not look alike.** (T-194.) The planning read is dim etch with no
verdict and says out loud that arming a die is what turns it into a roll; the live read is ember
with the armed face, its total and a pass/fail badge. One component,
`packages/ui/src/CheckPreviewRow.tsx`, discriminated by `data-kind="plan"|"live"|"opposed"`, and
the discrimination is decided in `format.ts` (`CheckPreview`), never in JSX. Both arms open with
the SAME `{STAT} DC {n}` phrase, deliberately: that is what keeps one machine-checkable home for
the DC (`route-dc`, `explore-cost`) across the transition, and what makes the row read as one
line gaining detail rather than two lines swapping places. The owner's finding this closes: "I
have no feedback if the die does anything."

**UI-29 — A live check read is the ENGINE's own `check()` output, never a UI-recomputed
comparison.** (T-194.) `format.ts`'s `dcPreview` calls the same `check(die, modifier, dc)` every
resolver calls, so nat-20 auto-success, nat-1 auto-fail and `margin` are INHERITED rather than
re-implemented — a `total >= dc` in the UI passes the ordinary cases and is wrong on exactly the
two the player remembers. Where a resolver keeps its DC as an un-exported literal (exporting it
would move `rulesFingerprint` and owe an 8,000-run capstone for a readout change), the mirror
lives in `format.ts` under a source-reading drift alarm —
`packages/ui/src/__tests__/engine-dc-pins.test.ts` — and the promotion is FILED, not assumed.

**UI-30 — An OPPOSED roll gets no pass/fail read, because the number it would be judged against
does not exist yet.** (T-194.) Combat RUN is `check(die, playerPilot, enemyPursuitDie +
enemyPilot)` with the enemy d20 drawn at resolve time, so its row prints the player's total and
states that the other side still rolls. Inventing a DC there would be T-193's bug — a cockpit
advertising a check the resolver never runs — reproduced in a new pane.

**UI-40 — The cockpit NEVER displays a DC for a branch the resolver will not roll.** (T-193, closing
the dead `PILOT DC` readout T-1605 left behind; UI-30 already cites this bug by name.)
`routeCheckReadout(game, dest, armedDieIndex)` in `packages/ui/src/format.ts` returns `{kind:'dc'}`
ONLY for `NEMESIS_SYSTEM_ID`, and reads that DC *through* `travelPreview` rather than recomputing it,
so panel and resolver cannot drift. Ordinary jumps get `{kind:'die-effect'}` — fuel and evasion
percentages computed from the engine's own `navDieFuelDiscount` / `navDieEvasionFactor`, with no
15/20 literal anywhere in the UI — or `{kind:'no-check'}` when no die is armed. A nat 1 reads
"−0% / −0%" and is deliberately NOT special-cased back to "no check": that is its real live effect,
and the absence of a DC must read as a STATED FACT rather than as a missing feature.

**UI-22 — Ordering for the dawn-roll work: T-194 (dawn-hand illegibility) lands FIRST.** (T-201.)
T-194 teaches what a die BUYS at the action; T-201 teaches what a die IS at the deal, and they do
not overlap in pixels, so the ceremony needs somewhere to point. The beat does NOT inherit a
palette-ruling block while it stays amber-on-black inside the committed CRT frame; it would
inherit one only if the roll is asked to introduce a second hue.

---

## 4. Motion

**UI-23 — Every new animation is railed behind `prefers-reduced-motion` and the reduced-motion
path is INSTANT, never "animated then skipped".** (T-190, T-191; amended by T-252.) Motions live
inside `@media not (prefers-reduced-motion: reduce)` or carry an explicit reduced-motion
`transition: none`, the house rule `theme.css` already keeps. This is what keeps the e2e honest,
since the whole suite runs under `page.emulateMedia({ reducedMotion: 'reduce' })`. The claim is
asserted in BOTH directions off computed `animation-name`, never inferred from the CSS source —
and any such assertion must toggle `emulateMedia` **and** `page.reload()`, because the cockpit
reads the OS preference once per render and stamps `data-motion` on `<html>`.
**T-252 amendment: `data-motion` is no longer a binary.** Its vocabulary is
`cinematic | snappy | instant` (`full` / `reduced` are retired and asserted absent), the blanket
`animation: none !important` kill-switch is scoped to `instant` alone, and "railed behind
`prefers-reduced-motion`" now means "carries a `--dur-*` token" — see UI-31, which is the rule a
new beat has to satisfy. Everything above about asserting in both directions with a reload stands
unchanged.

**UI-31 — Motion intensity is a THREE-TIER player setting driven by ONE knob, and completeness is
a scan, not an inspection.** (T-252, ruling Q4 of `docs/design/T-201-dawn-hand-roll.md` §3.6.)

*The rule and why it is not negotiable.* `tabletop-ui` §8 (owner correction, 2026-07-18) makes
**Cinematic / Snappy / Instant** a standing rule and says verbatim "Never ship cinematic-only."
SpacerQuest shipped a binary until T-252. The divergence was **not** ruled deliberate: §8 is an
owner rule already set, and §8's own corrections log records four times that offering a diluted
alternative to a rule the owner has set is the wrong move.

*The knob.* `--motion-scale` — `1` / `0.4` / `0`, declared once per `data-motion` value in
`theme.css`, mirrored by `MOTION_SCALE` in `packages/ui/src/motion.ts`. Every beat duration is
`calc(<cinematic-ms> * var(--motion-scale))` behind a `--dur-*` / `--del-*` token, and the token
block is the ONLY place a beat's cinematic length is written. JS timers take the same knob through
`scaleMs(ms, tier)`; the Liar's Dice GSAP timeline takes it as
`tl.timeScale(1 / MOTION_SCALE[tier])`, so not one of its duration literals is a tier decision.
§8's own words: "the tiers are one knob, not three implementations." **A per-beat tier table, or a
per-beat perceptual floor, would be a second knob** — see the measurement note below.

*What does NOT scale, and why that is a decision rather than an omission.* Three categories:
**BEAT** (finite, event-triggered, dramatises a game event) scales; **AMBIENT** (the five
`infinite` loops — `flicker`, `ring-pulse`, `pulse`, `tick`, `wt-pulse`) does not, because speeding
ambience up is a bug and a 0.4× 40s news marquee is unreadable; **RESPONSE** (three sub-250 ms
hover/state transitions) does not, because that is interface responsiveness, not cinema. Both
non-scaling categories are killed outright at Instant by the `:root[data-motion='instant'] *`
switch — which is why that switch survives the introduction of the knob.

*A JS timer that holds a STATE MARK is not a beat, and must not take the knob.* Found the hard way
during T-252's own gate: scaling the ship-diagram's `.comp-row.focused` window collapsed it to zero
at Instant, and that class carries a plain `border-color` marking WHICH bench row a hull click
landed on as well as the `comp-focus` bloom. `e2e/ship-diagram.spec.ts` (which runs on the Instant
rail) caught it. The bloom inside the window is tokenised and trims; the window itself is 700 ms at
every tier. The general form: **before scaling a timer, ask whether anything it gates is
information rather than motion** — if so, scale the animation and leave the window alone.

*Instant is the synchronous rail and loses no information.* Sound is deliberately untouched (§8:
"Instant… sound still plays"; `sound.ts` / `music.ts` have never had motion gating). A 0 s beat
with `forwards`/`both` still applies its END state, and no beat's base rule sets `opacity: 0`, so
suppression cannot hide content — asserted on the live onboarding card at every tier.

*The OS query outranks the setting.* `prefers-reduced-motion: reduce` forces Instant whatever the
player chose (WCAG 2.3.3), which is also exactly the pre-T-252 `setting || media` semantics. The
stored setting is untouched by the override, so clearing the OS preference restores the tier.

*Completeness is mechanical.* `src/__tests__/motion-tiers.test.ts` brace-walks `theme.css` and
requires every animation/transition declaration to be `none`, a `--dur-*`/`--del-*` beat, or an
explicitly allowlisted AMBIENT/RESPONSE exception carrying a written justification — so **a new
beat that hard-codes a duration fails the suite** rather than shipping as a cinematic-only beat.
`e2e/motion-tiers.spec.ts` then resolves every token through the live browser at each tier (chosen
by clicking the Settings segment, never by writing localStorage) and asserts Snappy is strictly
shorter than Cinematic — the negative control against a relabelled Cinematic.

*Storage, not saves.* The tier persists at `sq.motion-tier` via the `KeyValueStore` seam, exactly
like `sq.fx` and `sq.text-size`. It is never in the save envelope: **`CURRENT_SAVE_VERSION` does
not move and no migration is owed.** The retired `sq.reduced-motion` binary is honoured read-only
(`'on'` → Instant, so an opted-out player is never promoted back to cinematic by an upgrade) and
deleted the first time a tier is chosen.

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
