# Hangout Redesign — the port row, the engine/content line, and the reach change

**Status:** SPECIFICATION (T-101, 2026-07-30). This document is the source of truth for the
M3 milestone of the 0.5.2 track (`TASKS.md` T-120 … T-125). **It is a spec, not an
implementation** — T-101 changed no engine, content, sim or UI source file.

**It implements RULING 3** recorded in `TASKS.md` (owner, 2026-07-30), and **does not
re-open it**:

> **A Hangout port definition controls OUTCOMES, not RULES.** It carries: which of the six
> venues are offered, the wager band, per-venue check DCs, per-venue disposition deltas, the
> drawable clientele, and the prose/tone. The engine keeps the opposed-GUILE dare resolution,
> the loan ledger, die spending, and how disposition is applied. **A dangerous bar is
> dangerous through numbers.** Per-port "house rules" needing an engine special case are
> explicitly OUT — if a content pass hits a port it cannot express, report it; that finding is
> what would earn a richer surface later.

**Ruling 3 was checked against the source before being specified and it is workable.** Every
one of the six parameter classes it names has a home in the shape §2 prescribes, and every
behaviour in today's 413-line resolver lands cleanly on one side of §3's line. **No per-port
house-rule mechanism is specced anywhere in this document.** The three places the
parameter-only surface has a real expressive limit are recorded as **Findings F-101-1 …
F-101-3** in §7 rather than routed around, and §7 pre-registers the report format the content
passes use when they hit one.

**Companions:** `docs/EXPLORE_REDESIGN.md` (the sibling spec, T-100 — the crossover check is
§8), `docs/PRD-REIMAGINED.md` (design intent, §7 "Visit the Hangout", §7.3 / §7.5 sample
turns, §8.3 the rumor table), `docs/VERSIONING.md` (save versions §2, `rulesFingerprint` §3),
`docs/BALANCE-POLICY.md` (governance), `docs/NPC_REDESIGN.md` (the vacated VisitHangout
ruling and its three defects — the audit input §5 answers).

**The five things this document settles, each with a named recommendation:**

| § | Question | The named recommendation |
| --- | --- | --- |
| §2 | The parameter surface | **The port row, defaults resolved** |
| §3 | The engine/content line | **Deltas are content, application is engine** |
| §4 | The reach change | **Fourteen of twenty-eight, one capstone, no save bump** |
| §5 | The three known defects | **All three DEFERRED, with two measurement obligations taken** |
| §6 | The 14-port content brief | **Six axes, one of them governance; five / five / four** |

---

## §0 · Symbol conventions — how to read the code in this document

Every backticked identifier here is one of two things, and the two are never mixed.

1. **An EXISTING symbol.** It resolves under `packages/*/src` today; every one was grepped
   while writing this spec. Two are worth flagging up front because they shape §2 and §3:
   - `HangoutVenue` (`packages/engine/src/actions/hangout.ts:26`) is **module-private** and
     covers only the five *social* venues — it deliberately excludes `borrow` / `repay`,
     which report a `LoanEvent` instead. §3 keeps that split.
   - `isHangoutSystem` (`packages/sim/src/index.ts:832`) is **module-private** to the sim;
     its exported sibling `hangoutSystemIds` (`:825`) is the public one. Both derive from
     content and neither needs to change for the reach change (§4).
2. **A PROPOSED symbol.** It does **not** exist yet; this spec names it so the downstream
   tasks do not each invent a name. Every proposed symbol appears in the table below and
   nowhere else, and every code block introducing one is labelled **PROPOSED**.

**The FIELD names of a proposed type are proposed too** — `portId`, `venues`, `wager`,
`venueParams`, `dc`, `dispositionOnSuccess`, `dispositionOnFailure`, `clientele`,
`archetypes`, `regulars`, `prose`, `houseName`, `tone`, `flavour` and `roomLine` do not
resolve today and are not expected to. Every other field name in this document's code blocks
(`id`, `name`, `credits`, `disposition`, `currentSystemId`, `profileId`, `archetype`, `dead`,
`spent`, `dice`) is an existing one, reused deliberately. The four `HangoutTone` literals
(`everyday`, `exotic`, `dangerous`, `comic`) are proposed values of a proposed type.

**One symbol is borrowed from the sibling spec and is proposed THERE, not here:**
`player.recovery` (`docs/EXPLORE_REDESIGN.md` §3.1, introduced by T-111). It appears in §4.4
and §8 only, as the thing this spec is checking itself against for collisions.

### Proposed symbols (do not exist yet — introduced by T-120)

| Proposed symbol | Home | Introduced by | § |
| --- | --- | --- | --- |
| `HangoutVenueId` | `packages/content/src/portHangouts.ts` | T-120 | §2.1 |
| `HangoutVenueParams` | `packages/content/src/portHangouts.ts` | T-120 | §2.1 |
| `HangoutClientele` | `packages/content/src/portHangouts.ts` | T-120 | §2.1 |
| `HangoutTone` | `packages/content/src/portHangouts.ts` | T-120 | §2.1, §6 |
| `HangoutProse` | `packages/content/src/portHangouts.ts` | T-120 | §2.1 |
| `PortHangout` | `packages/content/src/portHangouts.ts` | T-120 | §2.1 |
| `PORT_HANGOUTS` | `packages/content/src/portHangouts.ts` | T-120 | §2.1, §6 |
| `DEFAULT_PORT_HANGOUT` | `packages/content/src/portHangouts.ts` | T-120 | §2.2 |
| `portHangoutFor` | `packages/engine/src/hangoutRules.ts` | T-120 | §2.2 |
| `venueParamsFor` | `packages/engine/src/hangoutRules.ts` | T-120 | §2.2 |
| `wagerBandFor` | `packages/engine/src/hangoutRules.ts` | T-120 | §2.2 |
| `venueOffered` | `packages/engine/src/hangoutRules.ts` | T-120 | §2.6 |
| `rankClientele` | `packages/engine/src/hangoutRules.ts` | T-120 | §2.4 |
| `HangoutEvent.failReason: 'venue-not-offered'` | `packages/engine/src/types.ts` | T-120 | §2.6 |
| `LoanEvent.failReason: 'venue-not-offered'` | `packages/engine/src/types.ts` | T-120 | §2.6 |

---

## §1 · The audit — what the Hangout is today

READER: this section is the baseline §2 replaces and the surface §3's two-column table must
account for, behaviour by behaviour. Every figure carries provenance.

### 1.1 The resolver, in execution order

`resolveVisitHangout` (`packages/engine/src/actions/hangout.ts:124`, 413 lines) is the only
resolver. It is pure — clones, mutates the clone, returns typed events — and **never throws**
(`:110–123`). In order:

1. **Die validation, a three-way split**, mirroring `resolveExploration`: `no-die` (`:147`),
   `invalid-die-index` (`:153`), `die-already-spent` (`:157`). None spends anything.
2. **The lending fail-routing split** (`isLending`, `:139`): the same three malformed-die
   refusals report a `LoanEvent` for `borrow`/`repay` and a `HangoutEvent` for the five social
   venues, because their readers differ (the Penny Wise desk vs. the social pane).
3. **Opponent resolution** (`:171–191`) for the four opponent-bearing venues. The dealer must
   be `!dead` **and** co-located (`currentSystemId === player.currentSystemId`); otherwise
   `HangoutEvent{failReason:'no-opponent'}` with **no die spent**. `rumor`, `borrow` and
   `repay` are opponentless (`opponentlessVenue`, `:171`).
4. **Lending preconditions** (`:198–218`): `already-has-loan`, `no-loan`,
   `insufficient-credits`. All typed `LoanEvent` fails, all **before** the die is spent.
5. **`spendDie(hand, index)`** (`:221`) plus `hand.spent[index] = true` — the attempt commits.
6. **A seven-arm `switch`** (`:226–410`), one arm per venue.

### 1.2 The seven arms

| Venue | What it does | Content constants it reads |
| --- | --- | --- |
| `dare` (`:227`) | Opposed GUILE: dealer d20 off the forked action rng, each side's `check` framed against the other's total, **ties to the player**. Two `StatCheck` events (`actionContext: 'gamble'` for the player, `'npc-socialize'` for the dealer). Wager clamped into the band **and down to `min(player.credits, dealer.credits)`** (`:263`). Zero-sum credit transfer, dealer's purse taken through `mutableNpc`. Disposition moves on **both** outcomes. | `DARE_MIN_WAGER` 25, `DARE_MAX_WAGER` 1000, `DARE_WIN_DISPOSITION` −2, `DARE_LOSS_DISPOSITION` +2 |
| `befriend` (`:298`) | A GUILE `check` against a fixed table DC; the delta applies **only on success**. No `actionContext`, so the wire classifies it to the `talk` bucket. | `BEFRIEND_DC` 12, `BEFRIEND_DISPOSITION` +3 |
| `insult` (`:324`) | **No check** — it always lands. | `INSULT_DISPOSITION` −4 |
| `meet` (`:334`) | A disposition nudge **plus** the rumor list, composed. | `MEET_DISPOSITION` +1 |
| `rumor` (`:348`) | The host slot alone. | the rumor templates |
| `borrow` (`:354`) | Clamp the principal into the band, write `player.loan`, credits **up** by the principal, `dueDay = day + LOAN_TERM_DAYS`. | `LOAN_MIN_PRINCIPAL` 250, `LOAN_MAX_PRINCIPAL` 5000, `LOAN_DAILY_RATE` 0.05, `LOAN_TERM_DAYS` 15, `LENDER_ID` |
| `repay` (`:386`) | Move credits, shrink `outstanding`, **clear the whole loan at ≤ 0**. | — |

`hangoutRumors` (`:69–100`) is the host slot: living-only filter (N3), in-system NPCs first,
top-5 cap, template selected by `lastAction.type`, warm/cold chosen by the sign of live
`disposition`, and a **≥1-fact guarantee** via `RUMOR_EMPTY_LINE`. The engine owns selection
and interpolation; the strings are content (`packages/content/src/hangout.ts:138–176`).

`applyDisposition` (`packages/engine/src/npc.ts:674`) is the single door every delta goes
through: it early-returns on a zero delta and on a missing NPC, **clamps to ±10**, computes
the *applied* delta after clamping, writes through `mutableNpc`, and emits
`DispositionChanged` with a `reason` drawn from a closed union that already contains all four
Hangout beats (`types.ts:355–372`).

### 1.3 The gate, and where it is read

`StarSystem.hasHangout` (`packages/content/src/systems.ts:37`) is set on **Sol-3 only**
(`:79`) — **1 of 28 systems**. `day.ts:382–392` emits `ActionBlocked{reason:'no-hangout'}`
before the resolver is ever reached, with no die spent and no rng fork.

The flag has **six independent readers** in `src`, and this list is what makes §2.3's ruling:

| Reader | Site | What it decides |
| --- | --- | --- |
| the engine gate | `packages/engine/src/day.ts:384` | whether the action is admitted at all |
| the sim's derivation | `packages/sim/src/index.ts:826` `hangoutSystemIds` → `:832` `isHangoutSystem` | the desk's location for `planLoanBorrow` (`:2036`), `planLoanRepay` (`:2064`), the trader's `homeRun` preference (`:2544`) and `planDare` (`:3401`) |
| the UGT protocol | `packages/sim/src/protocol.ts:778` | whether `legalActions` advertises `VisitHangout`, and with which venue choices |
| the UI predicate | `packages/ui/src/format.ts:262` `hangoutOpen` | whether the cockpit shows the launcher and mounts the pane (`App.tsx:830`, `:1761`) |
| the deed-hunter support policy | `packages/sim/src/__tests__/support/deed-hunter.ts:298`, `:324` | where it runs its Hangout errand |
| the e2e gate test | `packages/ui/e2e/hangout.spec.ts:133–146` | asserts the launcher disappears off-hub |

### 1.4 What the player can actually reach today — stated honestly, because §6 depends on it

> **RECORD CORRECTION (T-132, 2026-07-31): NO LONGER TRUE, AND DELIBERATELY SO.** T-132 added
> `visitSocial` (`packages/ui/src/store.ts`) and the `hangout-social` controls
> (`packages/ui/src/App.tsx`), so the pane now exposes **six of the seven venues** — `dare`,
> `meet`, `befriend`, `insult`, the free rumor table and Penny Wise's desk. The grep for
> `befriend` / `insult` / `'meet'` under `packages/ui/src` now returns real dispatch sites. The
> seventh, `rumor`, is still not dispatchable and never will be: it spends a die to emit exactly
> the `hangoutRumors` lines the pane already renders for free every frame, so a paid control
> would be strictly dominated by one already on screen. The paragraph below is kept as the
> historical statement §6's argument was built on. Asserted by
> `packages/ui/e2e/hangout.spec.ts` ("meet, befriend and insult are each dispatchable at the
> Long Table").

The T-1404 pane exposes **`dare`, the rumor table and the Penny Wise desk** and nothing else:
`packages/ui/src/store.ts` builds exactly three venues (`:1269` `'dare'`, `:1342` `'borrow'`,
`:1378` `'repay'`), and a grep for `befriend` / `insult` / `'meet'` under `packages/ui/src`
returns **nothing**.

So three of the six social venues — `meet`, `befriend`, `insult` — exist in the engine, the
schema and the UGT protocol, but have **no player-facing UI**. A port that differentiates
itself on those three parameters differentiates itself for the simulation and the protocol,
not yet for the player at the keyboard. This is recorded as **Finding F-101-4** and is a
surfacing question for T-130, not scope creep here.

### 1.5 The measurement that scoped the track

From `TASKS.md`'s intro and the vacated VisitHangout ruling (`docs/NPC_REDESIGN.md:209`,
`:278–320`), measured 2026-07-30:

- **The Hangout exists at 1 system out of 28.** The social pillar has never been tested at a
  size where it could matter.
- It is the only **voluntary** input to disposition — every other disposition change is a
  by-product of violence or competition — and disposition demonstrably weights **who
  intercepts you** (`chooseWeighted`, `packages/engine/src/actions/travel.ts:339–357`:
  a negative disposition scales a named candidate's weight by
  `1 + INTERCEPT_GRUDGE_WEIGHT × −disposition`).
- Three defects were found while ruling it, all still true: the NPC-side faucet
  (**+4.86cr per captain-day**, no counterparty), **95.91%** of the cast's `Socialize` actions
  resolving where there is no Hangout, and the **150cr ante**. §5 rules on each.

---

## §2 · Design 1 — the parameter surface

> [!IMPORTANT]
> **THE NAMED RECOMMENDATION: "the port row, defaults resolved."** One typed content row per
> port carrying exactly ruling 3's six parameter classes; every field optional against a
> `DEFAULT_PORT_HANGOUT` built from today's shipped constants; default resolution is an
> engine rule. **A new port is one `PORT_HANGOUTS` row plus one `hasHangout: true` flag, and
> nothing else.**

### 2.1 The typed content shape

**PROPOSED** — illustrative TypeScript, authored by T-120 in a **new file**,
`packages/content/src/portHangouts.ts`. The shape is normative; the field comments are not.

```ts
// PROPOSED (T-120) — packages/content/src/portHangouts.ts. Does not exist yet.

/** The seven venues resolveVisitHangout already switches on. Not a new vocabulary —
 *  the same seven strings the PlayerAction union carries (types.ts:1112). */
export type HangoutVenueId = 'dare' | 'meet' | 'befriend' | 'insult' | 'rumor' | 'borrow' | 'repay';

/** Register. PROSE ONLY — no mechanical effect anywhere. See §6. */
export type HangoutTone = 'everyday' | 'exotic' | 'dangerous' | 'comic';

export interface HangoutVenueParams {
  /** DC for venues that roll (today: `befriend` only). Ignored by venues that do not. */
  dc?: number;
  /** Disposition delta on the venue's SUCCESS arm (befriend-success, meet, insult, dare-LOSS). */
  dispositionOnSuccess?: number;
  /** Disposition delta on the venue's FAILURE arm (today only `dare`: the beaten dealer sours). */
  dispositionOnFailure?: number;
}

export interface HangoutClientele {
  /** NpcArchetype tags preferred as the house dealer. RANKS the live in-system set — never adds to it (§2.4). */
  archetypes?: readonly NpcArchetype[];
  /** Specific cast `profileId`s preferred, ahead of the archetype tags. Same rank-only rule. */
  regulars?: readonly string[];
}

export interface HangoutProse {
  /** "The Rusted Astrolabe". Displayed in place of the generic pane header. */
  houseName: string;
  tone: HangoutTone;
  /** Per-venue colour line. Partial: a venue with no line falls back to the default row's. */
  flavour: Partial<Record<HangoutVenueId, string>>;
  /** Optional room-establishing line, prepended to the rumor list. */
  roomLine?: string;
}

export interface PortHangout {
  /** STAR_SYSTEMS id. The row's identity; the table is keyed by it too, and a
   *  validation test asserts key === portId (T-121). */
  portId: number;
  /** Which of the seven this port offers. A port with no credit desk simply omits
   *  'borrow'/'repay'; a card room that will not seat a stranger omits 'meet'. */
  venues: readonly HangoutVenueId[];
  /** The Dare stake band. Clamped further, by the engine, to what both sides can cover. */
  wager: { min: number; max: number };
  venueParams: Partial<Record<HangoutVenueId, HangoutVenueParams>>;
  clientele: HangoutClientele;
  prose: HangoutProse;
}

export const PORT_HANGOUTS: Readonly<Record<number, PortHangout>> = { /* 14 rows, T-121 … T-124 */ };

/** Today's shipped behaviour, verbatim, as a row. Every omitted field on a real
 *  row resolves to this one's value. */
export const DEFAULT_PORT_HANGOUT: PortHangout = { /* built from hangout.ts's constants */ };
```

**Ruling 3's six parameter classes map one-to-one and exhaustively:** venues offered →
`venues`; wager band → `wager`; per-venue check DCs → `venueParams[v].dc`; per-venue
disposition deltas → `venueParams[v].dispositionOn*`; drawable clientele → `clientele`;
prose/tone → `prose`. **Nothing else is on the row**, and the absences are load-bearing: there
is no predicate, no `if`-shaped field, no rate, no term, no per-port lender and no callback.

### 2.2 Six rulings this section makes, each with its rejected alternative

**(1) A new file, `packages/content/src/portHangouts.ts` — not an extension of `hangout.ts`.**
`hangout.ts` keeps the tuning constants and the rumor templates; those constants become the
values `DEFAULT_PORT_HANGOUT` is *built from*, imported, never restated. Two payoffs: a row
that omits a field inherits today's number by construction, so T-120's behaviour-preserving
proof for Sol-3 is trivial and mechanical; and the R-owned balance constants keep their
existing provenance comments and their existing home, so a tuning change still lands in one
reviewed place. **Rejected:** authoring 14 rows into `hangout.ts` beside the rumor templates —
one file with two jobs, and a diff in which a tuning change and a content pass are
indistinguishable.

**(2) Default resolution is an ENGINE rule, and it never throws.**

```ts
// PROPOSED (T-120) — packages/engine/src/hangoutRules.ts.
export function portHangoutFor(systemId: number): PortHangout;                       // row ?? DEFAULT
export function wagerBandFor(systemId: number): { min: number; max: number };
export function venueParamsFor(systemId: number, venue: HangoutVenueId): HangoutVenueParams; // field-wise ?? DEFAULT
```

Resolution is **field-wise**, not row-wise: a row that sets `wager` but omits
`venueParams.befriend.dc` gets its own band and the default DC. A `hasHangout` port with no
row at all resolves to `DEFAULT_PORT_HANGOUT` entire. **This preserves the resolver's
never-throws contract** (`hangout.ts:110–123`) without a single guard clause in the switch,
and it is the same defensive shape `dice.ts:107–108` already uses for a stored content id
(`const benefit = CREW_BY_ID[member.roleId]?.benefit; if (!benefit) continue;`).
**Rejected:** making a missing row a hard error. A content table that can crash the day loop
is a worse failure mode than a bar that reads as generic.

**(3) `hasHangout` stays the authoritative gate; `PORT_HANGOUTS` never becomes it.** The flag
has six independent readers (§1.3) across four packages plus the e2e suite. Deriving the gate
from `PORT_HANGOUTS` would rewrite every one of them for **zero behavioural gain**, and it
would put a content *table* on the import path of the UI's cockpit predicate. The
two-sources-of-truth risk is real and is closed by a test rather than by a refactor:

> **T-121 owes a content-validation test asserting the two sets are equal in BOTH
> directions** — every `hasHangout: true` system has a `PORT_HANGOUTS` row, and every
> `PORT_HANGOUTS` key is a `hasHangout: true` system.

**Rejected:** `hasHangout` becoming `portId in PORT_HANGOUTS`.

**(4) Clientele can only RANK or FILTER the live in-system set — never add to it.** The
engine's load-bearing guarantee is that a dealer is an NPC **actually co-located and alive**
(`hangout.ts:174–191`). `rankClientele` reorders that set by `regulars` first, then
`archetypes`, then the existing order; it never queries `ALL_NPC_PROFILES` for a captain who
is not present. **If the intersection is empty, the engine falls back to the whole live
set** — a bar is never empty by content decree. This is precisely what keeps NPC *spawning*,
an owner-deferred question, out of this track. Its cost is real and is written up as
**F-101-2**. **Rejected:** letting `clientele` seat a captain who is not in-system — it would
make `no-opponent` unreachable and silently repeal the co-location guarantee.

**(5) The loan band stays GLOBAL.** Per-port control over lending is **exactly one bit**:
whether `'borrow'` / `'repay'` appear in `venues`. Penny Wise is one lender-of-record
(`LENDER_ID`, `packages/content/src/lending.ts:56`) and `LoanState` is a single slot. A
per-port principal band, rate or term would be a *second lender* — a new rule — which ruling 3
places out of scope. **Rejected:** a `lending` block on `PortHangout`. A port that wants to
feel usurious expresses it in `prose` and by *not* offering the desk.

**AMENDED (T-133, owner ruling D7, 2026-07-31) — the first sentence, and only the first
sentence.** The band does **not** stay global; the **rate, the term and the lender do**. D7
splits the ruling along the line the original argument actually supports:

- **Still global, and still a rule:** `LOAN_DAILY_RATE`, `LOAN_TERM_DAYS`, `LENDER_ID` and the
  single `LoanState` slot. There is exactly one lender of record, one schedule and one marker,
  at every port, forever. The "a second lender is a new rule" objection is untouched by this
  amendment and remains the reason a per-port *rate* is still refused.
- **Now content:** `PortHangout.loanBand` — a `{ min, max }` the engine clamps a requested
  principal into, resolved whole against `DEFAULT_PORT_HANGOUT` exactly as `wager` is, and
  read through one new accessor (`loanBandFor`, `engine/hangoutRules.ts`) beside
  `wagerBandFor`. **A band is a clamp, not a counterparty.** It adds no state, no event, no
  second ledger and no branch: the borrow arm's algebra is the same three-term
  `Math.max(min, Math.min(max, requested))` it always was, with the two bounds coming from the
  port instead of from two imported constants. That is the same move ruling 2 already makes
  for the Dare's stake band, and it is why this is an amendment rather than a repeal.

**What the amendment costs, recorded rather than discovered later.** Per-port control over
lending is no longer "exactly one bit" — a row can now withhold the desk *or* narrow it, and
T-133 uses the second because the first was the only vocabulary available before. Arcturus-6's
garrison mess re-adds `'borrow'`/`'repay'` alongside a 250/1000 band, so **no authored row
withholds a lending venue any more** and `LoanEvent{failReason:'venue-not-offered'}` is once
again unreachable from content (the F-120-1 situation, reached by an amendment rather than by
an oversight). The resolver arm and its schema mirror stay — the bit is still there for a
later row — and the two social withholdings (Deneb-4's `meet`, Spica-3's `insult`) still drive
the `HangoutEvent` variant for real.

**What the amendment BUYS, and it is the reason the owner made it.** F-123-2 is closed. A
withheld desk meant a captain who arrived at Arcturus-6 with an empty purse and a dry tank had
no §7.5 bad-day out at all and stayed stranded there; a *tight* desk is an out that costs more
trips. `packages/sim/src/__tests__/lending-property.test.ts` now asserts the positive — the
shallowest band in the galaxy still clears a strand.

**LOGGED, NOT CHOSEN:** a per-port *interest rate*. It was raised alongside the band and is
refused for the original ruling's own reason — a port that charges its own price is a second
lender of record, and `LoanState` carries one `dailyRate` because there is one lender. If a
usurious port is ever wanted, it is a new rule and it needs its own task.

**NOT RE-PRICED HERE.** The 1,000cr ceiling on Arcturus-6 is a first-pass **content** call, not
a tuning verdict; §8's R-ownership of `LOAN_MIN_PRINCIPAL` / `LOAN_MAX_PRINCIPAL` is unchanged,
and T-150 owns the read.

**(6) Exactly one new engine event value: `'venue-not-offered'`.** See §2.6.

### 2.3 Sol-3 is `DEFAULT_PORT_HANGOUT` plus prose — the behaviour-preserving proof

T-120's acceptance is that every pre-existing hangout test passes unchanged and the goldens
are byte-identical. The shape above makes that a two-line argument rather than a diff review:
Sol-3's row sets `venues` to all seven and leaves `wager` and `venueParams` **omitted**, so
every number the resolver reads is imported from the same constant it reads today. Only
`prose` is new, and prose is not read by any assertion in the engine suite.

### 2.4 What "one content row" means, walked through every reader

The acceptance sentence is: **a new port is one `PORT_HANGOUTS` row plus one
`hasHangout: true` flag, and nothing else.** Here is the 15th port walked through all six
readers of §1.3, showing each one reads content and needs no edit:

| Reader | Does adding a 15th port touch it? |
| --- | --- |
| `day.ts:384` gate | No — reads `STAR_SYSTEMS[...].hasHangout`. |
| `hangoutSystemIds` / `isHangoutSystem` | No — **derived from content**, and its own comment already says a hard-coded `1` "would silently stop finding the desk the moment content flags a second". |
| `protocol.ts:778` `legalActions` | **Once, at T-120** — the `venueChoices` array is hand-built (`:786–789`) and must instead read the port's `venues`. After that, no. |
| `format.ts:262` `hangoutOpen` | No. |
| `format.ts:297` `dareWagerBounds` | **Once, at T-120** — it takes no argument today and must take the game/port. After that, no. |
| the resolver's switch | No — every constant becomes a `venueParamsFor` call at T-120. |

Two call sites change **once**, at the extraction, and never again. That is the property T-122
through T-124 are held to: **zero lines changed under `packages/engine/src`.**

### 2.5 `packages/content` stays data

`portHangouts.ts` carries no predicate and no branch. The mechanical check T-120 owes: **a
`grep` for `if (` in `packages/content/src/portHangouts.ts` must find nothing that decides an
outcome.** Every conditional in the Hangout — which venue, which arm, whether the check
passed, whether the dealer is present, whether the loan clears — is in the engine and stays
there (§3).

### 2.6 The one new refusal, and why it is a rule rather than a branch

Fourteen ports offering different venue sets creates a refusal that cannot happen today: the
player (or a policy, or a driver) asks for a venue this port does not run.

**PROPOSED (T-120):** `HangoutEvent.failReason` gains `'venue-not-offered'`, and
`LoanEvent.failReason` gains the same value for `borrow` / `repay` — routed through the
existing `failVenue` helper (`hangout.ts:140–145`), which already picks the right typed event
by `isLending`. It is refused **before `spendDie`**, like every other typed refusal, so
nothing is charged for an act the port never offered.

This is a new **kind** of refusal — one rule, evaluated the same way at every port — not a
per-port branch, which is exactly why it is engine work and belongs in T-120. It owes:

- the `types.ts:603` `HangoutEvent.failReason` union and the `LoanEvent` sibling;
- the `schema.ts:834` enum mirror (and the `LoanEvent` mirror), which the file's
  `AssertEventKeys` drift guards (`schema.ts:1438–1439`) then hold in lockstep;
- a unit test per event type;
- **the sim mirror**: `protocol.ts:786` must build `venueChoices` from the port's `venues`,
  or the policies will burn dice on a guaranteed refusal and `planDare`'s
  `hangoutPlay.failedVisits === 0` assertion (`sim/index.ts:3375`) will go red for the wrong
  reason.

**It is NOT a save-shape change.** `HangoutEvent` and `LoanEvent` are `eventLog` entries whose
own headers say so ("This is an `eventLog` entry, not a `GameState` field — no save
migration, but it carries a schema variant + drift guard", `types.ts:590–592`). No
`GameState` field is added anywhere in this spec. See §4.4.

---

## §3 · Design 2 — the engine/content line

> [!IMPORTANT]
> **THE NAMED RECOMMENDATION: "deltas are content, application is engine."** A number a port
> author writes is content. The arithmetic, the clamp, the event and the ordering that consume
> it are engine, at every port, forever.

**The engine home is `packages/engine/src/hangoutRules.ts`** (PROPOSED, T-120) — the
`combatRules.ts` precedent, which is the model the standing constraint names. Note for the
implementer: `ENGINE_RULE_DIRECTORIES = ['', 'actions']`
(`packages/sim/src/balance/rules-fingerprint.ts:78`), so a new module at the engine **root**
is automatically inside the rules fingerprint and needs no `ENGINE_NON_RULE_SOURCES` entry —
but `balance-rig.test.ts` enforces exhaustive classification from both ends, so T-120 must
confirm it stays green.

### 3.1 The two-column list — every current behaviour, on one side or the other

| # | Behaviour | Site today | **ENGINE (rule)** | **CONTENT (instance)** |
| --- | --- | --- | :---: | :---: |
| 1 | The three-way die validation (`no-die` / `invalid-die-index` / `die-already-spent`) | `hangout.ts:147–160` | ● | |
| 2 | The `isLending` fail-routing split — which typed event a refusal reports | `hangout.ts:139–145` | ● | |
| 3 | `spendDie` + `hand.spent[index] = true`, and its position after every no-cost refusal | `hangout.ts:221–222` | ● | |
| 4 | Which venues require an opponent (`opponentlessVenue`) | `hangout.ts:171–172` | ● | |
| 5 | The dealer must be `!dead` and co-located, else `no-opponent` with no die spent | `hangout.ts:174–191` | ● | |
| 6 | Opposed-GUILE dare: dealer d20 off the forked action rng, each side's `check` framed against the other's total, **ties to the player** | `hangout.ts:228–237` | ● | |
| 7 | `npcGuile` lookup through `ALL_NPC_PROFILES`, `?? 0` on an unknown profile | `hangout.ts:104–106` | ● | |
| 8 | `StatCheck` emission and its `actionContext` routing (`'gamble'` / `'npc-socialize'`) | `hangout.ts:242–257` | ● | |
| 9 | The wager clamp **algebra**: band, then down to `min(player.credits, dealer.credits)`, floored at 0 | `hangout.ts:262–264` | ● | |
| 10 | Zero-sum credit transfer on the dare | `hangout.ts:267–268` | ● | |
| 11 | Copy-on-write dealer purse via `mutableNpc` | `hangout.ts:271–272` | ● | |
| 12 | `applyDisposition`: the ±10 clamp, the applied-delta computation, the `reason` union, the `DispositionChanged` event | `npc.ts:674–718` | ● | |
| 13 | Dare moves disposition on **both** arms; which arm is which | `hangout.ts:278–284` | ● | |
| 14 | Befriend: success **gates** the delta | `hangout.ts:311–313` | ● | |
| 15 | Insult: **no check** — it always lands | `hangout.ts:324–331` | ● | |
| 16 | Meet: disposition **plus** rumors, composed in one arm | `hangout.ts:334–345` | ● | |
| 17 | `hangoutRumors`: living-only filter, in-system-first ordering, top-5 cap, template selection by `lastAction.type`, warm/cold by `disposition` sign, the ≥1-fact guarantee, `{placeholder}` interpolation | `hangout.ts:69–100` | ● | |
| 18 | Loan preconditions (`already-has-loan`, `no-loan`, `insufficient-credits`) and their no-die-spent property | `hangout.ts:198–218` | ● | |
| 19 | Loan ledger arithmetic: principal clamp, `dueDay = day + LOAN_TERM_DAYS`, repay clamp, clear-at-zero | `hangout.ts:354–408` | ● | |
| 20 | Dusk interest accrual, the default flip, `DebtDue` | `day.ts` (dusk) | ● | |
| 21 | The `hasHangout` gate and its `ActionBlocked{'no-hangout'}` | `day.ts:382–392` | ● | |
| 22 | Clone-mutate-return purity; never throws | `hangout.ts:128–130` | ● | |
| 23 | **NEW** — the `'venue-not-offered'` refusal, evaluated before `spendDie` (§2.6) | T-120 | ● | |
| 24 | **NEW** — field-wise default resolution against `DEFAULT_PORT_HANGOUT` (§2.2) | T-120 | ● | |
| 25 | **NEW** — `rankClientele`: rank-or-fall-back over the live in-system set (§2.2 ruling 4) | T-120 | ● | |
| 26 | Which venues a port offers | — (implicit: all seven) | | ● |
| 27 | The Dare wager band `DARE_MIN_WAGER` / `DARE_MAX_WAGER` | `content/hangout.ts:65–66` | | ● |
| 28 | The befriend DC (`BEFRIEND_DC`) | `content/hangout.ts:88` | | ● |
| 29 | The dare disposition deltas (`DARE_WIN_DISPOSITION`, `DARE_LOSS_DISPOSITION`) | `content/hangout.ts:78–79` | | ● |
| 30 | The befriend / insult / meet disposition deltas | `content/hangout.ts:84`, `:96`, `:100` | | ● |
| 31 | The rumor templates, quiet template and empty line | `content/hangout.ts:138–176` | | ● |
| 32 | The clientele draw list | — (new) | | ● |
| 33 | House name, tone register, per-venue flavour prose, room line | — (new) | | ● |
| 34 | The loan band — **per port** since T-133/D7: `PortHangout.loanBand`, defaulting to `LOAN_MIN_PRINCIPAL` / `LOAN_MAX_PRINCIPAL` | `content/portHangouts.ts` + `content/lending.ts:76–77` | | ● |
| 34b | The loan rate, term and `LENDER_ID` — still GLOBAL (D7 amended only the band) | `content/lending.ts:56–92` | | ● |
| 35 | `hasHangout` itself | `content/systems.ts:37` | | ● |

**Every behaviour in today's resolver appears exactly once.** Rows 1–22 are the whole of
`resolveVisitHangout` plus its two collaborators (`applyDisposition`, the `day.ts` gate); rows
26–35 are the whole of `packages/content/src/hangout.ts` plus the two new content classes.

> [!IMPORTANT]
> **A DELTA IS CONTENT; THE APPLICATION OF A DELTA IS ENGINE.** `−4` for an insult at a
> clannish port is a number a content author writes. `applyDisposition`'s ±10 clamp, its
> "compute the *applied* delta after clamping" behaviour, its copy-on-write write, its
> `DispositionChanged` event and the membership of `'insult'` in the `reason` union **never
> move to content**. The same split holds for every other pair on the table: the wager *band*
> is content, the wager *clamp algebra* is engine; the befriend *DC* is content, the *check*
> and the success-gates-the-delta rule are engine; the *loan band* is content, the *ledger* is
> engine. **(T-133/D7: the last of those is now literally true of a per-port row —
> `PortHangout.loanBand`, read by `loanBandFor` — and not merely of a global constant. The
> rate, the term and the lender stay engine-side reads of global content.)**

The mechanical form of the constraint: after T-120, `packages/content/src/portHangouts.ts`
contains no `if (`, and `packages/engine/src/actions/hangout.ts` contains no port id — the
`grep` for `Sol-3` / `systemId === 1` that T-120's acceptance names.

---

## §4 · Design 3 — the reach change and its blast radius

> [!IMPORTANT]
> **THE NAMED RECOMMENDATION: "fourteen of twenty-eight, one capstone, no save bump."** Set
> `hasHangout` on ids 1–14 and nowhere else; expect the sim goldens and four tests to move and
> the engine day-loop goldens **not** to; take exactly one capstone for the whole milestone,
> at T-125.

### 4.1 The arithmetic, and the four mechanisms

**1 of 28 systems → 14 of 28.** Because `hangoutSystemIds()` (`sim/index.ts:826`) is derived
from content, **the sim's policies change behaviour with zero sim edits.** Four mechanisms, all
verified against the source:

1. **`planDare` (`sim/index.ts:3401`) becomes legal on most days instead of only at Sol-3.**
   The gambler currently plays the tables only when its route happens to pass home; after
   T-121 nearly every docked day is a table day, up to `GAMBLER_MAX_DARES_PER_DAY = 2`.
2. **`planLoanBorrow` (`:2036`) and `planLoanRepay` (`:2064`) become legal nearly
   everywhere.** Duress borrowing stops being routing-gated: the §7.5 bad-day out is now
   available on the day the bad day happens, not on the day the captain gets home.
3. **The trader's `homeRun` preference (`:2544`) collapses to a near no-op.** "Prefer a
   fundable run that ENDS at the Penny Wise desk" is satisfied by 14 of 28 destinations, so it
   stops steering the route.
4. **`legalActions` (`protocol.ts:778`) advertises `VisitHangout` at thirteen more systems**,
   which widens the UGT action space every driver and every replay sees.

### 4.2 The blast-radius table

Every row was checked against the source. **Predicted** is a prediction, not a licence — the
implementing task measures and reports.

| Artefact | Predicted | Note for the implementing task |
| --- | --- | --- |
| `packages/engine/src/__tests__/fixtures/day-loop-golden.ts` (4 hashes, `:488–495`) | **UNMOVED, byte-identical** | Neither golden script issues a `VisitHangout` (`grep` returns 0), and `hasHangout` is content — it never enters `serializeState`. T-120 **and** T-121 must state this explicitly in the commit body (the N3 precedent). |
| `packages/sim/src/__tests__/fixtures/replay-golden.ts` (4 goldens) | **RESPONSES move; SESSION `rngState` should NOT** | `REPLAY_LOG` travels to Aldebaran-1 (`destinationId: 2`, `:148`), which gains a Hangout — so `legalActions` there now advertises the venues. This is exactly the T-1304 precedent recorded at `:257–264`. Regenerate via `fixtures/gen-golden.ts`, record the event-count diff, and **verify both `rngState`s are unchanged** (no new action is taken, so no dice draw may move). A moved `rngState` here is a real regression, not a re-pin. |
| `packages/ui/e2e/hangout.spec.ts:126–146` ("the Hangout is offered only where the engine says one exists") | **BREAKS** | It jumps to Aldebaran-1 expecting the launcher to vanish. **Do not retarget it to a rim system**: the rim shell is ~20–24 units out (`systems.ts` layout note) and a fresh start cannot fund that hop, so the test would become unrunnable. **Recommended fix:** invert it — assert the launcher is *present* after the jump (the gate is still tracked, positively, and the assertion is now stronger because it proves the pane follows content to a second port) — and cover the negative case with a unit test over `hangoutOpen()` at a rim id in `packages/ui/src/__tests__`. Also fix the fixture comment at `:16` ("the sole `hasHangout` system"). |
| `packages/sim/src/__tests__/protocol.test.ts:461–471` (`no-hangout` ActionBlocked parity) | **BREAKS** | Retarget to a rim/gated id. This is why §4.5 keeps a non-empty no-Hangout set. |
| `packages/engine/src/__tests__/hangout.test.ts:305–318` (the `no-hangout` gate test) | **BREAKS** | Same retarget. |
| `packages/sim/src/__tests__/support/deed-hunter.ts:110`, `:298`, `:324`, `:349` | **comments false; routing degrades** | `HANGOUT_SYSTEM = 1` and "Sol-3 is the ONLY `hasHangout` system" are load-bearing *prose* for the veteran deed hunter's errand. The logic still runs (Sol-3 keeps its bar) but the errand becomes redundant. Fix the comments; consider routing to the nearest Hangout instead of the constant. |
| `dareWagerBounds` (`packages/ui/src/format.ts:297`) | **signature change** | Takes no argument today; must take the game (or port id) to show the port's band. Its only caller is `App.tsx:1765`. |
| `packages/sim/src/index.ts:3417–3421` (`planDare`'s clamp) | **must read the port band** | It clamps with `DARE_MIN_WAGER` / `DARE_MAX_WAGER` directly, under a comment that says "clamped with the CONTENT band constants, never with restated numbers". After T-120 it must read the port's band through the same accessor the engine uses, or the gambler will size a stake the engine then re-clamps and the measured `expectedValuePerDare` will drift. |
| `packages/sim/src/protocol.ts:795` (`wager` param domain) | **must read the port band** | Same reason, one line up from `venueChoices`. |
| `rulesFingerprint` and the smoke fixture | **STALE from T-120 onward** | Content is hashed **wholesale** (`CONTENT_NON_RULE_SOURCES` excludes only the barrel, `rules-fingerprint.ts:111–113`) and `types.ts` is hashed too, so the new content file, the new engine module and the new event value each stale it. **One capstone for the whole milestone, at T-125, after `npm run format`, never before** — T-120 … T-124 must not each take one. |
| `balance-targets.test.ts:180` — the LIVE 40-seed "the trader clears the marker, and clears it fastest" | **AT RISK — this is the one to watch** | Its `POLICIES` are `['trader','smuggler','gambler']` (`:80`) and it asserts no other policy's median clear day is *below* the trader's. The gambler is precisely the policy the reach change most benefits (mechanism 1 above). If it goes red, that is a **balance finding to report at T-125**, not a band to move. |
| `balance-targets.test.ts:225` — the `it.fails` [22,30] band | **NOT at risk until re-pinned** | It grades `BASELINE_OF_RECORD` (`docs/balance/baseline-n11-shipped.json`, read at `:102–108`), a committed artefact, not a live run — so the reach change cannot move it. It becomes live again the moment T-125 re-pins the baseline. Standing rule unchanged: if it flips to **unexpectedly passing**, halt and escalate; do not flip `it.fails` to `it`. |
| `loanUsage` and `hangoutPlay` roll-ups (`sim/index.ts:546`, `:551`, `:1076–1149`) | **expected to move materially** | These are the numbers T-125 reports: `visits`, `dares`, `daresWon/Lost`, `wagered`, `netCredits`, `socialBeats`, `failedVisits`; `loansTaken`, `principalBorrowed`, `interestAccrued`, `amountRepaid`, `loansCleared`, `defaults`. |
| the poverty invariant (`sim/src/__tests__/poverty-invariant.test.ts:468`) and the gambler wealth spread | **expected to move** | Cheaper access to both the tables and the desk changes the shape of a bad career in both directions. Report, do not absorb. |

### 4.3 Two conclusions the milestone is planned around

- **A capstone is owed — exactly one, at T-125.** Batched per the standing constraint. T-121
  through T-124 each stale the fixture and each must say so in the commit body without taking
  one.
- **No save bump is owed by the Hangout.** Venue definitions are content; no `GameState` field
  is added; the new `venue-not-offered` value rides the existing `eventLog` schema (§2.6).

### 4.4 The save-version position, stated for T-102

`docs/EXPLORE_REDESIGN.md` §3.4 takes **12 → 13** for `player.recovery`. This spec takes
**none**. So the two specs **cannot collide on `CURRENT_SAVE_VERSION`**: the recommendation to
T-102 is **one bump for the whole 0.5.2 track (Explore's, 12 → 13)**, and the two tracks are
**order-independent** with respect to it. See §8 for the full crossover check.

### 4.5 The rim/gated ruling — the 14 core ports only

**Ruled here because T-121's acceptance depends on it: `hasHangout` is set on ids 1–14
(Sol-3, Aldebaran-1, Altair-3, Arcturus-6, Deneb-4, Denebola-5, Fomalhaut-2, Mira-9, Pollux-7,
Procyon-5, Regulus-6, Rigel-8, Spica-3, Vega-6) and nowhere else.** The rim (15–20), Maligna
(27) and Nemesis (28) get **no venue**.

Two reasons:

1. **It is the owner's target verbatim** — "a bar at every one of the 14 core spaceports".
2. **A non-empty no-Hangout set is what keeps the `no-hangout` refusal path testable at all.**
   `ActionBlocked{'no-hangout'}` is a shipped engine behaviour with three existing tests
   (§4.2); flagging all 28 systems would make it unreachable and the tests unwritable. Keeping
   14 unflagged systems is therefore a *design* requirement, not a leftover.

**And the corollary that §6 leans on:** because the exotic and the dangerous ports must be
core systems, they cannot be rim reskins. That is what makes governance an axis (§6.2) rather
than a synonym for `isRim`.

---

## §5 · Design 4 — the three known defects

> [!IMPORTANT]
> **THE NAMED RECOMMENDATION: all three DEFERRED, and this track takes two measurement
> obligations in exchange.** None is ruled in scope. `TASKS.md`'s "Deliberately deferred"
> list contains an "unless T-101 rules one in scope" clause; this section exercises it by
> ruling **none** in scope, for the reasons below.

All three are recorded under the vacated VisitHangout ruling (`docs/NPC_REDESIGN.md:209`,
findings 2 and 3 at `:314–320`). All three are **NPC-side**, and the owner has deferred
"whether NPCs interact with the Hangout" until these systems are functional — that deferral is
the gate on re-ruling the vacated PARITY LEDGER row and therefore on **N8**.

### 5.1 The NPC-side faucet — **DEFERRED**

**The defect.** `executeSocialize` (`packages/engine/src/npc.ts:1824–1853`) pays
`NPC_SOCIALIZE_WIN_CREDITS = 150` on a success and takes `NPC_SOCIALIZE_LOSS_CREDITS = 50` on
a failure (`packages/content/src/ideals.ts:73`, `:76`) **against no counterparty at all** —
a net **+4.86cr per captain-day** minted into the field, where the player's Dare is a
zero-sum transfer (`hangout.ts:267–272`).

**Three reasons to defer, the third load-bearing:**

1. It is a **cast-economy parity question** whose ruling the owner explicitly gated on "do
   NPCs interact with the Hangout".
2. It needs **no part of the parameter surface** — closing it touches `npc.ts` and
   `ideals.ts`, neither of which this track opens. It blocks nothing here.
3. **The faucet is what keeps dealer purses solvent, and the dealer's purse is the binding cap
   on the player's wager.** `hangout.ts:263` caps every stake at
   `min(DARE_MAX_WAGER, player.credits, dealer.credits)`, and `content/hangout.ts:50–52`
   records the measured fact that "the Tour One tables are cap-bound by the DEALER's purse,
   not by this ceiling". Closing the faucet would therefore **silently shrink the player's
   realizable stakes at every port this track is about to author**, and doing both inside one
   capstone would confound T-125's measurement beyond recovery.

**Obligation this track takes:** **T-125 must report the dealer-purse distribution beside
hangout usage**, so T-130 rules on a measured number rather than on the 2026-07-30 figure.

> **Obligation discharged at §10.5** (2026-07-30). Measured over 15,461 dares: the port's
> **BAND** binds 88.93% of stakes and the **DEALER's purse only 10.97%** — so reason 3 above,
> the load-bearing one, is now the minor term. Re-argue the deferral on that number.

### 5.2 The missing `hasHangout` check on the NPC path — **DEFERRED**

**The defect.** `executeSocialize` never consults `STAR_SYSTEMS[...].hasHangout`, so
**95.91%** of the cast's `Socialize` actions resolve at a system with no Hangout. One
`STAR_SYSTEMS` read closes it.

**Three reasons to defer:**

1. Same owner gate as §5.1.
2. **Its own magnitude is a function of this track.** With 14 of 28 systems hosting a bar, the
   figure falls from ~96% toward roughly ~50% by construction — so ruling on it now would be
   ruling against a number this track is about to change by a factor of two.
3. Closing it **deletes a large share of the verb's occurrences**, which moves the cast's verb
   mix and owes its own capstone (the vacated ruling says exactly this: "it deletes ~96% of
   the verb's occurrences, so it moves the verb mix and owes a capstone").

**Obligations this track takes:** **T-121 must not close it by accident** — setting
`hasHangout` on 13 more systems must not be paired with an `npc.ts` edit — and **T-125 must
re-measure the percentage** so T-130 rules on a current figure.

> **Obligation discharged at §10.6** (2026-07-30). **95.91% → 37.96%** — well below the ~50%
> this section predicted, because the cast concentrates on the core lane that gained the bars.
> Reason 3 above still holds, but it is now a claim about deleting ~38% of the verb's
> occurrences rather than ~96%.

**And a fiction consequence this track CREATES, recorded because it is the strongest argument
T-130 will have:** `executeSocialize`'s own prose reads *"cleaned up at the {system} Hangout
tables"* and *"bought a round at the {system} Hangout"* (`npc.ts:1845`, `:1851`). Those lines
feed `lastAction.details`, which `hangoutRumors` embeds verbatim into the rumor table
(`hangout.ts:88`). So **after T-121 the rumor mill will name a Hangout at ports where the
player is explicitly told there is none** — a visible inconsistency, surfaced in the pane, at
14 ports instead of 1.

### 5.3 The 150cr ante — **DEFERRED**

**The defect.** `executeSocialize` refuses the verb below `NPC_BROKE_CREDITS + 50`
(`npc.ts:1831`, with `NPC_BROKE_CREDITS = 100` at `npc.ts:471`) — a **150cr ante** that locks
out exactly the destitute captains a night at the tables would help, sending them to
`brokeIdle` instead.

**Three reasons to defer:**

1. Same owner gate as §5.1 and §5.2.
2. **It gates the CAST's verb, not the player's.** The player's Dare clamps to their own
   credits (`hangout.ts:263`), so a broke captain at the keyboard is never locked out of the
   tables. Nothing in the player-facing system this track builds depends on it.
3. **Closing it is also an engine/content-line fix, and deserves to be done deliberately.**
   The ante is a balance number expressed as an **inline `+ 50` literal** on a module-private
   engine constant — i.e. a content instance living in the engine, the exact class of thing
   this track exists to separate. Doing it opportunistically inside a content pass would hide
   a line-of-demarcation change inside a prose diff.

### 5.4 Nothing else is ruled in scope

No fourth defect is opened here. §7's findings are *framework* findings about the parameter
surface, not defects in shipped behaviour, and they are reported rather than fixed.

---

## §6 · Design 5 — the 14-port content brief

> [!IMPORTANT]
> **THE NAMED RECOMMENDATION: "six axes, one of them governance; five / five / four."** A
> port's identity is a point in a six-dimensional parameter space, every dimension a field on
> `PortHangout`. **A dangerous bar is dangerous through numbers**, per ruling 3. The ports are
> authored in three passes of 5 / 5 / 4, and no two may share an axis vector.

**This section names the axes and proposes the spread. It does not write the ports** — no
authored prose, no house names, no final numbers. That is T-122 through T-124's work.

### 6.1 The six axes

| Axis | Parameter it lives in | What it can express |
| --- | --- | --- |
| **Venue set** | `venues` | a bar with no credit desk; a room that will not seat a stranger (no `meet`); a card room that is only `dare` + `rumor`; a house that tolerates no insults (no `insult`) |
| **Stakes** | `wager.min` / `wager.max` | a high-roller room whose `min` prices out a Tour One captain; a dive with `min` 5 and a ceiling far under the global 1,000 |
| **Difficulty** | `venueParams[v].dc` | a hard room to charm (befriend DC 16) against an easy one (DC 9) |
| **Consequence** | `venueParams[v].dispositionOnSuccess` / `dispositionOnFailure` | a clannish port where an insult is −8 and follows you; a forgiving port where a lost hand costs no standing at all; a port where beating the house dealer is a *worse* sin than losing to them |
| **Clientele** | `clientele.archetypes` / `.regulars` | who deals — an `NpcArchetype` weighting (`'trader' \| 'fighter' \| 'explorer' \| 'smuggler' \| 'gambler' \| 'veteran'`, `content/cast.ts:20`) or named regulars, over the live in-system set |
| **Governance / lawfulness** | the four above, **jointly** | see §6.2 |
| *(Register)* | `prose.tone` | `everyday` / `exotic` / `dangerous` / `comic` — **prose only, no mechanical effect** |

`prose.tone` is listed separately and deliberately: it is how a port *reads*, never how it
*plays*. A port that is tagged `dangerous` but sits at default DCs and default deltas has
failed T-123's acceptance, and the assertion that catches it is a check that the tone tag
correlates with the numeric axes — not a check on the tag.

### 6.2 Governance is an axis, and it is independent of `isRim`

**All fourteen of these ports are CORE systems** (§4.5), so "exotic" and "dangerous" cannot be
rim reskins here — the rim flag is not available to them. Governance and lawfulness is
therefore its own axis, expressed jointly through the four mechanical ones:

- **a strict garrison world** — high DCs, punitive `insult` delta, **no lending desk**
  (`venues` omits `borrow` / `repay`), a narrow wager band, `clientele.archetypes` weighted to
  `'veteran'` / `'fighter'`;
- **a partisan faction port** — a `regulars` list, a wide band (the faction's people bet
  large among themselves), an asymmetric dare consequence (beating the house sours the room
  harder than losing to it);
- **a seedy underbelly** — a low `wager.min`, a high ceiling, `'smuggler'` / `'gambler'`
  clientele, a cheap `befriend` DC and an expensive `insult`.

None of these needs a rule the engine does not already have. **Core systems need not be
uniformly safe**, and this axis is what makes that expressible without touching
`allowsContraband` or `isRim`.

### 6.3 The proposed spread

Keyed to real ids from `packages/content/src/systems.ts`. Concept **labels** only.

**T-122 — the everyday five (the baseline the others are exotic and dangerous *against*):**

| id | System | Concept label | Axis notes |
| --- | --- | --- | --- |
| 1 | Sol-3 | the home-port hall | **must reproduce today's behaviour exactly** — the default row plus prose (§2.3) |
| 2 | Aldebaran-1 | the exchange-floor bar | trader clientele; modest band; everything offered |
| 3 | Altair-3 | the lane-side stopover | **numerically the mean; distinct on clientele alone** — one port must be the mean *(corrected in place at T-122; see the note below the table)* |
| 8 | Mira-9 | the fuellers' canteen | the cheap-fuel working port; low `min`, low ceiling, warm deltas |
| 10 | Procyon-5 | the freight-guild room | explorer/trader clientele; easy `befriend`, dear `insult` |

> **T-122's in-place correction to the Altair-3 row.** As originally written, §6.3 asked for a
> port that is "fully generic, deliberately" while §6.4 requires cardinality 14 over the axis
> vectors **and** fixes Sol-3's vector to the default row. Both cannot hold literally: a fully
> generic port *is* Sol-3's vector. §6.4's own closing sentence settles it — "Sol-3 is the one
> port whose tuple is fixed … which means the other thirteen are the ones that must move."
> **Resolution taken:** Altair-3 is the *numeric* mean (default band, default DCs, default
> deltas, all seven venues, `wager` and `venueParams` OMITTED rather than restated) and is
> distinct on `clientele` **alone**. `rankClientele` has exactly one reader — the Hangout pane
> (`ui/format.ts hangoutNpcs`) — and `planDare` picks the richest in-system dealer without
> consulting it, so no clientele list can move a sim number. Altair-3 therefore satisfies §6.4
> while remaining a clean measurement control, which is what the row was for. Pinned by
> `hangoutContent.test.ts`'s "Altair-3 is the deliberate NUMERIC MEAN" assertion so a later
> pass cannot quietly tune it.

**T-123 — the exotic and the dangerous five:**

| id | System | Concept label | Axis notes |
| --- | --- | --- | --- |
| 4 | Arcturus-6 | the garrison mess (`the Garrison Mess`, `dangerous`) | the strict-governance port: high DCs, punitive insult, **tight credit**. Shipped (RE-AUTHORED at T-133/D7): **all seven venues** + **`loanBand` 250/1000** — the first per-port loan band in the game and the lowest ceiling in the galaxy; band 100/400, befriend DC 16 / +2, insult −9, dare +1/−7, meet **0**, clientele `veteran`+`fighter`. *Until T-133 it withheld `borrow`/`repay` instead; D7 moved the identity from the venue-set axis to the new credit axis (see §2.2 ruling 5's amendment and F-123-2's resolution).* |
| 5 | Deneb-4 | the partisan hall (`the Standing Hall`, `exotic`) | `regulars` list, wide band, asymmetric dare consequence. Shipped: **also omits `meet`** — §6.1's "a room that will not seat a stranger", taken in the open so the venue-set axis is not carried by hostility alone; band 25/2000, befriend DC 14 / +5, insult −6, dare +1/−6, regulars = the four Astro League captains |
| 11 | Regulus-6 | the high table (`the High Table`, `exotic`) | the high-roller room: `wager.min` prices out a Tour One captain (see **F-101-1** and its T-123 addendum). Shipped: band 500/3000 — the only band strictly outside the default envelope at both ends and the highest floor in the game; befriend DC 15, insult −5, dare +1/−3, regulars Nebula Rose + Neon Fox |
| 12 | Rigel-8 | the underbelly (`the Underhold`, `dangerous`) | low `min`, high ceiling, smuggler/gambler clientele. Shipped: band **10/3000 — the widest SPAN in the galaxy**, which is the claim T-123 pins rather than "the lowest floor": Mira-9's dive (T-122, floor 5) still holds that, and a dive has no ceiling worth the name. The ceiling deliberately matches the high table's — the money is the same money; befriend DC 8 (cheapest room to charm), insult −8 |
| 14 | Vega-6 | the outfitters' long room (`the Long Room`, `exotic`) | veteran clientele, hard to charm, long memories (large deltas both ways). Shipped: band 250/1500, befriend DC 15 / **+6**, insult −8, dare +4/−4, meet +2, regulars Star Gazer + Stellar Drift |

> **T-123's in-place corrections to the rows above**, recorded the way T-122 corrected the
> Altair-3 row rather than taken silently. (1) **Deneb-4 also omits `meet`.** §6.3 asked only
> for a `regulars` list, a wide band and an asymmetric dare arm; the omission was added so that
> the venue-set axis is exercised for a reason other than hostility — otherwise "narrowed
> venues" and "the garrison" would be synonyms and §6.4's distinctness rule would be carrying
> that axis alone. Zero sim impact: the instrument issues only `dare` / `borrow` / `repay`.
> (2) **Rigel-8 is graded on SPAN, not on floor.** §6.2's underbelly asks for "a low `min`, a
> high ceiling"; the testable form of that is the widest `max − min` of any authored port, and
> the lowest floor in the game already belongs to T-122's Mira-9. (3) **The tone spread of pass
> 2 is two `dangerous` and three `exotic`**; no pass-2 port is `everyday`, and `comic` remains
> T-124's.

**T-124 — the last four, including the comic register:**

| id | System | Concept label | Axis notes |
| --- | --- | --- | --- |
| 6 | Denebola-5 | the incident book (`the Incident Book`, **`comic`**) | the FORGIVING pole of §6.1's consequence axis, and the deliberate mirror of Arcturus-6. Shipped: band 20/300, **`dare.dispositionOnFailure` 0 — an authored zero**, `meet` **+3** (the highest in the game), `insult` **−2** (the softest in the game), befriend DC 11, regular Nova Blitz + `trader` |
| 7 | Fomalhaut-2 | the fittings (`the Fittings`, **`comic`**) | the bar at the edge of the dust market, where everything carries a chalked price. Shipped: band 15/1200, befriend DC 10, `meet` +2, `insult` −3, **`dare` left at the default entirely** (the T-122 Aldebaran-1 idiom), regulars Junk Lord + Dust Devil, `smuggler`/`trader` |
| 9 | Pollux-7 | the turnaround (`the Turnaround`, `everyday`) | the concourse bar of the busiest League civil port — the interval between an arrival and a departure. Shipped: band 75/900, `dare` +1 (a dealer on shift), `meet` +2, befriend DC 14 (nobody invests in a face they will not see again), `explorer`+`fighter` |
| 13 | Spica-3 | the second watch (`the Second Watch`, `exotic`) | the shift-change room on a world that runs on port time. Shipped: **venues omit `insult`** — §6.1's third and last venue-set expression; band 200/1800, dare **+3/−5**, `meet` +2, befriend DC left at the default, `gambler`+`veteran` |

> **T-124's in-place corrections and decisions**, recorded the way T-122 and T-123 recorded
> theirs rather than taken silently.
>
> **(a) The register spread chosen, and why.** §6.3 left the spread to T-124 with one
> requirement — at least one `comic`. Shipped: **two `comic` (6, 7), one `everyday` (9), one
> `exotic` (13)**, which closes the fourteen-port table at **6 `everyday` / 4 `exotic` /
> 2 `dangerous` / 2 `comic`**. Two comic rooms rather than one because a single comic port is a
> novelty and two are a register: Denebola-5's joke is *the quietest port in the core keeps an
> incident book and the last entry records a spillage*, Fomalhaut-2's is *the bar is stock, and
> everything in it has a chalked price, including the stools*. Both are straight sentences with
> one deflating clause at the end — the house voice of `wireStories.ts`'s
> `NAT_WIRE_TEMPLATES` ("*{loser} unavailable for comment.*") and `flaws.ts`'s `detail` lines
> ("*gambled the day's profits away at the nearest Hangout table.*"), read before writing as
> §6.3 instructed. No puns, no exclamation marks, nothing winked at the player.
>
> **(b) `comic` is graded as the exact negation of `dangerous`.** The tone-correlation rule
> §6.1 states cuts both ways: if a `dangerous` port must be harsher than the default on at
> least one consequence axis, then a `comic` port must be **no harsher than the default on
> any** of them — because *the joke is never at the player's expense*. That is the assertion in
> `hangoutContent.test.ts`, over the same four clauses the `dangerous` test uses and read
> through Sol-3's resolved values, so the two registers are graded on one axis set rather than
> two invented ones. Denebola-5 is additionally pinned as the strict per-axis **softest**
> authored port on `insult` and on the dare-failure arm — the mirror of Arcturus-6's
> maximality test, which is what makes "the forgiving pole" a measurement rather than a claim.
>
> **(c) Denebola-5's `dare.dispositionOnFailure: 0` is an AUTHORED ZERO.** `venueParamsFor`
> resolves with `??`, so a written `0` is a real authored value and not an omission — the same
> mechanism as Arcturus-6's `meet: 0`, pointed the other way. The two zeros are the ends of
> §6.1's consequence axis: at the garrison nobody makes space for a stranger; at the incident
> book, beating the house costs you nothing at all and makes you the story of the year.
>
> **(d) Spica-3 omits `insult` — §6.1's third and last venue-set expression**, after the
> garrison's withdrawn desk (4) and the hall's withheld `meet` (5). All four shapes §6.1 names
> are now either shipped or deliberately unused (the "only `dare` + `rumor`" card room is the
> one left, and it is a *fifth* narrowing rather than a fourth expression of the axis).
> **The F-101-4 caveat, taken in the open:** `insult` has no player UI, so this narrowing
> reaches the player through nothing but the UGT harness today. The row therefore **also**
> carries a stakes identity (200/1800) and a dare asymmetry, so its character is not
> concentrated in an invisible venue — which is exactly what F-101-4's closing sentence asks
> content passes not to do. It does **not** trip **F-123-1**'s silence bug: the cockpit issues
> only `dare` / `borrow` / `repay` (`ui/store.ts:1268/1341/1377`), never `insult`, so
> `hangoutFailNoticeFrom`'s missing `'venue-not-offered'` arm stays unreachable from the pane.
>
> **(e) T-121's baseline-row builder is deleted, not left unused.** With the table closed there
> is no unauthored port for it to build, and leaving a generator for `the <system> Hangout` in
> the file would leave a way to add an unauthored port silently. The test that used to hold the
> unauthored remainder honest (`hangoutRules.test.ts`) is **inverted rather than deleted** — an
> empty loop over an empty id list is a vacuous test — and now asserts the positive over all
> fourteen: no house carries the generated name, every house has a room line, every house has
> flavour.
>
> **(f) No port concept wanted a predicate.** As at T-123, none of the four rows hit F-101-3's
> boundary: "the quietest port keeps a book", "everything here has a price", "the interval
> between two gates" and "the room that opens at four in the morning" are all expressible as
> numbers plus prose. Two passes running with no F-101-3 report is evidence the parameter-only
> surface is the right size for this content, which is the finding's own stated purpose.

### 6.4 The distinctness rule the passes are graded on

**No two ports may be identical on the axis vector** (T-122's acceptance). This is checkable
as a **set-cardinality assertion over the serialized parameter tuples** — `venues` (sorted),
`wager`, `venueParams`, `clientele` — not as prose review. Two ports may share a `tone`; they
may not share a mechanical fingerprint. The check T-124 runs at the close: the set of
serialized tuples has cardinality **14**.

Sol-3 is the one port whose tuple is fixed by §2.3, which means the other thirteen are the
ones that must move — a useful constraint, not an exception.

---

## §7 · Framework findings

Reported, not routed around, per the standing constraint. **None of these re-opens ruling 3**;
each is a limit of the parameter-only surface, stated with its cost.

### Finding F-101-1 · The wager ceiling is bound by the dealer's purse, not by the band

`hangout.ts:262–264` caps every stake at `min(band.max, player.credits, dealer.credits)`, and
dealer purses are fed by the NPC-side faucet this spec defers (§5.1). `content/hangout.ts:50`
already records the measurement: "the Tour One tables are cap-bound by the DEALER's purse, not
by this ceiling".

**Consequence for content:** a row can *declare* a high-roller port (§6.3, Regulus-6) and the
port will still deal 25cr hands whenever the captains who wander in are poor. `wager.max` is
an aspiration; `wager.min` is the only half of the band the content author actually controls,
and even it is bounded by the player's own credits. This is a genuine expressive limit of
ruling 3's parameter-only surface.

**Recommended resolution:** none in this track. **T-123 must measure realized-vs-declared
stakes at its high-band port and report the gap**, rather than compensate for it by inflating
the band. Compensating would be tuning a number to reach an answer.

#### T-123 addendum (2026-07-30) · the measurement, and it partly REFUTES the finding as written

**Rig.** The `gambler` policy driven headlessly through the real engine (the `driveFrom` loop,
mirrored in a throwaway script and not committed), seeds 1..10 × 120 days = 1,200 careers-days,
recording for every day the docked system, the dawn purse, whether a live co-located dealer
existed, and every `HangoutEvent{venue:'dare'}` with the stake the resolver actually settled on.
1,319 hands were played in total. Nothing was tuned before, during or after this measurement.

| port | declared band | hands | realized min / median / max | hands AT the declared ceiling | hands the DEALER's purse capped |
| --- | --- | --- | --- | --- | --- |
| **Regulus-6** (the high table) | 500 / 3,000 | 99 | 0 / 1,383 / **3,000** | 41 of 99 (41%) | **5 of 99 (5%)** |
| Rigel-8 (the underbelly) | 10 / 3,000 | 108 | 53 / 865 / **3,000** | 24 of 108 (22%) | 5 of 108 (5%) |
| Sol-3 (the default band) | 25 / 1,000 | 124 | 39 / 1,000 / **1,000** | 75 of 124 (**60%**) | 1 of 124 (0.8%) |

**The plain gap sentence: declared max 3,000 versus realized max 3,000 — at the high table there
is no gap at the top at all.** The declared ceiling is reached on 41 of 99 hands, and the
dealer's purse is the binding cap on 5. The captains sitting down at Regulus-6 carry a median
7,605 credits and a maximum of 1.54 million.

**Why the finding reads differently now, and this is the substantive result.** F-101-1 was
written against the pre-N10 cast. **N2** (NPCs upgrade their ships), **N10** (the shared job
pool) and **N11/T-021** moved the cast's day-120 median wealth 21,884 → 76,049 — recorded in
ledger entries 6, 9 and 10 of `campaign-degraded.test.ts`. A dealer that rich caps almost
nothing. The constraint the finding names is real in the ALGEBRA (`hangout.ts:279`, the stake is
still `min(band.max, player.credits, dealer.credits)`) and it still bites on ~5% of hands, but
it is no longer the operative limit on a Tour One captain's table. **What binds instead is the
BAND ITSELF**, and it binds hardest where the band is smallest: at Sol-3's default 1,000 the
ceiling is the operative limit on 60% of hands.

**And the floor does not price the run out either — measured, not assumed.** At Regulus-6 the
gambler was docked with a live dealer on 65 days and played on 50 of them; on the 15 days it
played nothing its median dawn purse was 32,038 credits, so the reason was the day's dice
budget, not the 500 floor. In Tour One itself (days 1–30) it was docked with a dealer on 18 days
and played 29 hands. The 500 floor prices out the captain the PRD describes on day 1 (starting
credits 1,000, `engine/state.ts:125`) and stops mattering within a Tour.

**Nothing is tuned in response, in either direction.** The band is not lowered because the floor
turned out to be affordable, and it is not raised because the ceiling turned out to be
reachable. T-125 owns the milestone's verdict; the evidence this addendum contributes is that
**the dealer-purse cap is a solved problem the N-series solved, and the wager BAND is now the
live constraint on how a port plays** — which is precisely the lever ruling 3 gives content.

### Finding F-101-2 · Clientele cannot summon a clientele

`clientele` **ranks, never spawns** (§2.2 ruling 4). NPC movement is not port-aware: the sim
moves captains each dusk on their own policies, with no knowledge of which ports have bars or
what those bars want. A port whose concept is "a room full of patrol captains" is realizable
only on the days the simulation happens to have moved such captains there.

**Consequence for content:** **every port must be authored so its identity survives an empty
or off-theme room.** The identity has to live in the mechanical axes (which are always true)
and the prose (which is always shown), not in the assumption that the right archetype is
present. Where `clientele` bites is the *ordering* of the pane's opponent list and the dealer
`planDare` picks — a real but probabilistic effect.

**Recommended resolution:** none in this track. Making NPC movement port-aware is a cast-sim
change and sits behind the same owner deferral as §5.

### Finding F-101-3 · Conditional house rules are out, by ruling 3 — and here is the report format

Any port concept requiring a **predicate** — "smugglers pay double", "insults are free after
you have won a hand", "the house bars debtors", "the first hand of the day is on the house",
"this port's dealer rolls with advantage" — is **unexpressible** on this surface. `PortHangout`
carries no predicate field by design (§2.1), and adding one would be the per-port house-rule
mechanism ruling 3 places out of scope.

**This is not a defect to fix; it is the boundary, and hitting it is the most valuable output
a content pass can produce.** Pre-registered report format, so T-122 / T-123 / T-124 do not
each invent one — append to this section as `F-101-3a`, `F-101-3b`, …:

> **F-101-3x · \<port> wanted \<one-sentence house rule>.**
> **What it needed:** the predicate, stated exactly (what is read, when it is evaluated).
> **Why it is not expressible:** which of the six axes came closest and where it fell short.
> **What was authored instead:** the nearest parameter-only approximation actually shipped.
> **What a richer surface would cost:** the engine change it would have implied.

T-130 collects these; the owner rules on whether they earn a richer surface.

### Finding F-101-4 · Three of the six social venues have no player UI

> **RECORD CORRECTION (T-132, 2026-07-31): CLOSED.** The three venues are dispatchable through
> the real UI: `visitSocial` (`packages/ui/src/store.ts`) behind the `hangout-social` controls
> in `HangoutPanel` (`packages/ui/src/App.tsx`), each gated on the engine's own `venueOffered`
> so the pane can never advertise a venue the resolver would refuse. Asserted by
> `packages/ui/e2e/hangout.spec.ts` — "meet, befriend and insult are each dispatchable at the
> Long Table" (real clicks: pick the dealer, arm a die, click the venue, read the engine's
> readout), plus "a hall that seats no stranger offers no introduction" for the withheld case.

`meet`, `befriend` and `insult` are reachable from the engine, the schema and the UGT protocol
but **not from the cockpit** (§1.4). A port that differentiates itself on those three venues'
DCs and deltas differentiates itself for the simulation and not for the player.

**Recommended resolution:** none in this track — this is a surfacing question, and the
standing constraint requires surfacing to be a *named* task rather than a side effect. Flagged
for T-130. It does bear on §6: content passes should not concentrate a port's whole identity
in `befriend` / `insult` parameters while this is true.

### Finding F-101-5 · The pane's NPC list does not filter the dead

> **RECORD CORRECTION (T-132, 2026-07-31): CLOSED.** `hangoutNpcs` (`packages/ui/src/format.ts`)
> now filters `!n.dead` before handing the set to `rankClientele`, honouring that function's
> stated contract ("the caller passes the ALREADY-FILTERED live in-system, non-dead set").
> Asserted by `packages/ui/src/__tests__/hangout-pane.test.ts` over a mixed live/dead roster —
> including a dead NPC OUT of system, so an accidentally-identity filter cannot pass.

`hangoutNpcs` (`packages/ui/src/format.ts:277–281`) filters only on `currentSystemId`, while
the engine's opponent resolution also requires `!n.dead` (`hangout.ts:176–178`). So the pane
can offer a dead captain as a Dare opponent, and the engine correctly answers
`HangoutEvent{failReason:'no-opponent'}` — no die spent, no crash, but a dead end in the UI.
Harmless at one port; visible at fourteen. **Recommended resolution:** a one-line filter,
folded into T-121's UI touch (it is the task that makes the pane reachable at scale), or
reported to T-130 if T-121 chooses to keep its diff to the reach change alone.

### Finding F-101-6 · `prose` has no reader — every authored house is invisible

> **RECORD CORRECTION (T-132, 2026-07-31): CLOSED.** All three prose fields now render.
> `hangoutHouse` (`packages/ui/src/format.ts`) reads the row through the engine's
> `portHangoutFor`, so a rowless port falls back to `DEFAULT_PORT_HANGOUT` rather than to a
> UI-side default: `houseName` replaces the generic pane header (`hangout-house`), `roomLine`
> is a standing line under it (`hangout-room-line`, rendered only when authored — never a
> placeholder), and `flavour[venue]` renders beside each venue's controls (`hangout-flavour`,
> `data-venue`). Asserted by `packages/ui/e2e/hangout.spec.ts` ("the house speaks", against the
> content row rather than a literal) and by `packages/ui/src/__tests__/hangout-pane.test.ts`
> (the authored port, a second differently-voiced port, and the rowless fallback).

**Found by T-122, reported and not fixed.** `HangoutProse.houseName`, `.roomLine` and
`.flavour` are authored by T-120 (Sol-3), by T-121 (thirteen baseline house names) and now by
T-122 (four houses, four room lines, twenty-eight flavour lines), and **nothing reads any of
them**. `grep` over the workspace finds no consumer of `prose` outside the content file and
this spec; the Hangout pane header is a literal — `App.tsx:1805` renders
`"Spacers Hangout · {systemName}"` — and `format.ts` exposes only `hangoutNpcs` and
`dareWagerBounds`.

**Consequence for content, and it is the sharp one.** Combined with **F-101-4** (three of the
six social venues have no player UI) this means a port's identity reaches the player through
`wager` and `venues` and nothing else. §6.2 says "a dangerous bar is dangerous through
numbers"; today it is dangerous through *two* numbers, and its voice — the half of a content
pass that is actually content — is dark. Passes 2 and 3 should keep authoring prose (it is
cheap, it is the record of intent, and it is what a surfacing task will render), but no pass
should be graded on player-visible differentiation it cannot deliver.

**Recommended resolution:** none in this track. Surfacing must be a **named** task per the
standing constraint, and a UI edit here would move `packages/ui/e2e/hangout.spec.ts`. Flagged
for **T-130** alongside F-101-4 and F-101-5 — the three are one surfacing job, not three.

### Finding F-121-2 · The reach change put the onboarding coach out at 14 of 28 ports — **ESCALATED, NOT FIXED**

> **RECORD CORRECTION (T-130 gate, 2026-07-31): CLOSED.** Fixed by commit `125fc84f`
> (mount-aware onboarding coach); `onboarding.spec.ts` re-run at the gate, 14/14 green. The
> heading above is kept as the historical record of the escalation; see `docs/0.5.2-REVIEW.md`
> §8 for the closure evidence.

**Found by T-122 while running the gate; reproduced at the T-121 commit with T-122's diff
stashed, so it is a T-121 regression and not a consequence of any authored row.** Three
`packages/ui/e2e/onboarding.spec.ts` tests are red on `main`'s branch head:

- `fresh seed: first delivery guided by visible affordances …` (`:94`)
- `first-contraband coach fires once at a contraband offer …` (`:243`)
- `first-port coach fires once at a purchasable port …` (`:274`)

**Root cause, one defect behind all three.** `activeOnboardingPrompt`
(`packages/ui/src/format.ts:2121`) picks **one global winner** — the first registry prompt that
is active and unseen, anywhere. `onboardingMount` then routes that winner to one of three
mounts, and `first-loan`'s anchor routes it to the **`hangout` mount, which only exists while
the Hangout panel is open**. `first-loan`'s predicate is `hangoutOpen(game) && loan == null`
— it does not, and cannot, read whether the panel is open, because that is view state.

So at any `hasHangout` port, a captain with no loan and `first-hangout` already dismissed has
`first-loan` holding the single coach slot while rendering **nothing**, and every
lower-priority coach (`first-contraband`, `first-port`, `first-explore`) is silently blocked
until the player happens to open the Hangout panel and dismiss it. Verified directly:
`activeOnboardingPrompt(state@Aldebaran-1, {dawn-roll, first-sign, first-hangout seen})`
returns `first-loan`, mount `hangout`.

**Why it is new.** The defect is as old as T-1407, but it was reachable at **one** port. T-121
took `hasHangout` from 1 of 28 to 14 of 28, so it now fires at essentially every port a Tour
One captain visits — the three red specs are the first observable consequence. This is the
same class as **F-121-1** (a latent guard that only bites once reach makes it reachable), and
it is the second of its kind, which is itself the finding: **reach changes surface latent
single-port assumptions, and the UI layer had more of them than the engine did.**

**Why T-122 did not fix it.** It is a `packages/ui/src` product change and a design ruling —
someone must decide whether the selector becomes mount-aware (each mount picks its own
highest-priority active prompt) or whether `first-loan` moves below the screen-level prompts
in the registry. Both change what the player is taught and in what order. The standing
constraint requires that to be a **named** task, and T-122's charter is content authoring with
zero UI edits. Pre-seeding `first-loan` in the three fixtures would make the specs green while
leaving the coach dark for real players — weakening a check to reach an answer, which the
balance policy forbids.

**Recommended resolution:** re-open T-121 or fold into **T-130** with F-101-4/5/6. The
minimal correct repair looks like `activeOnboardingPrompt(game, seen, mount)` returning the
first active-unseen prompt whose `onboardingMount(anchor)` equals the caller's mount, with the
three `OnboardingCallout` mounts each asking for their own winner; the three specs above then
need only the `first-hangout` pre-seed that T-121's six other retargets already established as
the idiom. **Do not land that inside a content pass.**

### Finding F-101-7 · The `high_roller` deed is unreachable at Mira-9, correctly

**Found by T-122, recorded so T-125's deed coverage is not surprised by it.** The `high_roller`
deed (`content/src/deeds.ts:604`) requires a 250cr Dare stake. Mira-9's authored ceiling is
200 — §6.1's named dive shape, "min 5 and a ceiling far under the global 1,000" — so the deed
**cannot** be earned at that port. It stays reachable at the other four pass-1 ports
(Sol-3 1,000, Aldebaran-1 750, Altair-3 1,000, Procyon-5 500) and at the nine unauthored ones.

This is a *correct* consequence of a dive bar and **is not a reason to inflate the band**;
inflating it would be tuning a number to reach an answer. It is recorded because per-port
bands make deed reachability port-dependent for the first time, and T-125's coverage
measurement should read a Mira-9 zero as expected rather than as a regression. T-123's bands
(Regulus-6's high table, Rigel-8's underbelly) will widen the same question in the other
direction.

**T-123's mirror image, recorded so T-125 reads both as expected.** Regulus-6's floor is 500,
so **every** hand dealt there clears the 250cr `high_roller` bar — the deed is not merely
reachable at the high table, it is unavoidable. The same floor is half a day-1 captain's whole
purse (1,000, `engine/state.ts:125`), so the port that guarantees the deed is the port an early
captain cannot sit down at. T-125's deed coverage should therefore expect a Mira-9 zero, a
Regulus-6 saturation, and a Regulus-6 count that rises with career age rather than being flat.

### Finding F-123-1 · The Hangout pane offers a credit desk at a port that has none — **REPORTED, NOT FIXED**

> **RECORD CORRECTION (T-132, 2026-07-31): CLOSED, both halves.** (1) The whole `hp-lending`
> block is gated on `hangoutVenueOffered(game, 'borrow')` — a pure pass-through to the engine's
> `venueOffered` — and the repay controls on `'repay'` independently, so Arcturus-6 shows no
> desk at all rather than a desk that refuses. Asserted by `packages/ui/e2e/hangout.spec.ts`
> ("a port with no credit desk shows none"; the offering case stays covered by the existing
> Sol-3 loan test) and by the 14-ports × 7-venues agreement table in
> `packages/ui/src/__tests__/hangout-pane.test.ts`. (2) The prose moved to
> `hangoutFailExplanation` / `loanFailExplanation` (`packages/ui/src/format.ts`), both
> exhaustive `switch`es with **no `default`** — the T-131 mechanism — so `'venue-not-offered'`
> now renders *"No one here takes that kind of wager."* and *"There is no credit desk in this
> room."* instead of `null` and of the misleading *"Penny Wise turned that request down."*
> Asserted reason-by-reason over both full unions in `hangout-pane.test.ts`.
>
> **FOLLOW-ON (T-133, owner ruling D7, 2026-07-31).** The gate above is unchanged and still
> load-bearing, but its e2e witness had to move: Arcturus-6 now RUNS its desk (against a
> 250/1000 band), so "a port with no credit desk shows none" was asserting a fact that no
> longer exists. The test was **inverted**, not deleted — it now flies to the garrison mess,
> reads the port's own ceiling off the terms line, fills the principal control with the
> galaxy's ceiling, arms a die, clicks Borrow, and asserts the marker came back at the
> *clamped* amount. That is a strictly stronger witness: an absence is proved by counting
> elements, a clamp has to be driven. The 14 × 7 agreement table is untouched and now records
> two narrowings instead of three.

**Found by T-123, whose Arcturus-6 row is the first to withhold a venue.** The cockpit gates the
Penny Wise desk on `hangoutOpen` alone — `packages/ui/src/format.ts:340` reads
`STAR_SYSTEMS[id].hasHangout`, and `packages/ui/src/store.ts`'s `borrowLoan` (`:1333`) and
`repayLoan` (`:1369`) build a `VisitHangout{borrow|repay}` unconditionally, with **no
`venueOffered` filter anywhere in the UI layer**. The UGT protocol already filters
(`sim/protocol.ts:807`) and the engine already refuses (`actions/hangout.ts:173`); the pane does
neither. Two consequences, both live at Arcturus-6 the moment a player opens the panel there:

- **The desk is visible and does nothing useful.** The engine answers
  `LoanEvent{kind:'failed', failReason:'venue-not-offered'}` — no die spent, no crash — and
  `loanFailNoticeFrom`'s `default:` arm (`store.ts:514`) renders the vague *"Penny Wise turned
  that request down."* The player is told they were refused, never that there is no desk here.
- **A social-venue refusal would render SILENCE.** `hangoutFailNoticeFrom` (`store.ts:478`) has
  arms for `no-opponent` and the three malformed-die reasons and **no arm for
  `'venue-not-offered'`**, so it returns `null` and the pane says nothing at all. That violates
  the "typed fails render, never silence" guarantee the function's own docstring states. It is
  unreachable today only because the pane issues no social venue but `dare` (**F-101-4**), and
  Deneb-4's omitted `meet` is exactly the row that would make it reachable the day `meet` is
  surfaced.

**Why T-123 did not fix it.** It is a `packages/ui/src` product change; a UI edit here moves
`packages/ui/e2e/hangout.spec.ts`; and the charter for a content pass is zero UI edits. The
repair is small and obvious — filter the desk affordances through `venueOffered`, and give
both notice helpers a `'venue-not-offered'` arm in the house's own voice ("There is no credit
desk in this room.") — but it is **surfacing**, and the standing constraint requires surfacing
to be a named task.

**Recommended resolution:** fold into **T-130** with **F-101-4 / F-101-5 / F-101-6**. It is the
same surfacing job — the pane does not read `prose`, does not filter the dead, does not offer
three of the six venues, and now does not read `venues` either.

### Finding F-123-2 · A port with no credit desk removes the §7.5 bad-day out AT THAT PORT

**Found by T-123 through `lending-property.test.ts` P2, which went red on the authored row and
was restated rather than narrowed.** P2 asserts that "a borrow within the band clears a state
that cannot afford the cheapest jump" — the anti-poverty property the loan mechanism exists to
guarantee. It was written when every `hasHangout` port offered all seven venues, so "a loan is
always an out" and "a loan is an out at every port" were the same sentence. They are not any
more: at Arcturus-6 a captain with an empty purse and a dry tank is typed-refused and **stays
stranded there**.

**What was done.** The property now carries the precondition the engine carries
(`venueOffered(systemId,'borrow')`), and the desk-less case is asserted in its own test rather
than dropped from the sample: the refusal is typed, spends no die, moves no credits, writes no
loan, and the strand persists. Nothing was softened — the second test states the true fact
where the first used to state a false one.

**Why it is not fixed here.** Both repairs are out of scope by rulings this spec already made.
A row-level predicate ("the garrison bars debtors, but not the destitute") is **F-101-3**'s
category and out by ruling 3. A rule that no port may withhold the desk contradicts §2.2 ruling
5, which grants a port exactly that one bit. The third option — an engine-side floor ("if the
captain cannot jump, the desk is always there") — is a new rule in `actions/hangout.ts` and a
content pass may not add one.

**Recommended resolution:** an owner ruling at **T-130**, informed by T-125's measurement. The
question to put is narrow: *may a core port remove the anti-poverty out, or is the desk a
guarantee the galaxy makes everywhere?* Note that the exposure is bounded — Arcturus-6 is one
of fourteen, the other thirteen run desks, and no driven career in the 10-seed × 120-day
measurement produced a single `venue-not-offered` event (see F-123-3's rig) — so this is a
design question, not an observed regression.

**RESOLVED (T-133, owner ruling D7, 2026-07-31): the desk is a guarantee, and the way a port
says "tight credit" is a NUMBER.** The owner answered the question above with the third option
neither repair above could reach: not a predicate and not an engine floor, but a **content
band**. §2.2 ruling 5 is amended so a row carries `loanBand`, Arcturus-6 re-adds
`'borrow'`/`'repay'` alongside a 250/1000 ceiling, and every travelable port now runs a desk.
`lending-property.test.ts` asserts the **positive** in place of the strand: the shallowest band
in the galaxy still clears a state that cannot afford the cheapest jump — driven at the port
the harness *finds* to be tightest, not at a named id. The old desk-less test is gone because
the fact it recorded is gone; the finding stays on the page because the resolution is only
legible beside the problem.

### Finding F-123-3 · The gambler's second hand of the day can be a ZERO-credit stake

**Found by T-123's F-101-1 measurement; an INSTRUMENT defect, not a game defect.** `planDare`
picks "the richest live in-system dealer" once, off the DAWN state, and the caller subtracts
each queued stake from the PLAYER's purse for the next hand (`sim/index.ts`, the `credits`
parameter) but not from the DEALER's. With `GAMBLER_MAX_DARES_PER_DAY = 2`, the first hand can
empty the dealer and the second is then clamped by `min(band.max, playerCredits, dealerCredits)`
to **zero**. Measured over seeds 1..10 × 120 days: **34 of 1,319 hands (2.6%) settled at a zero
stake**, and 3 more settled below their port's own floor.

This is exactly the pathology `planDare`'s own comment says the richest-dealer pick exists to
avoid — "dealing with a broke NPC produces a zero-or-tiny-stake hand that inflates the dare
count and drags `expectedValuePerDare` toward 0" — and the guard is simply evaluated once per
day rather than once per hand. It is not a typed failure (`failedVisits` stays 0, correctly: a
zero-stake hand is a legal hand), so no existing assertion catches it.

**Why it is not fixed here.** It is a change to a shipped policy's planning, which would move
the `gambler` fingerprint for a reason unrelated to this task's content, and `expectedValuePerDare`
is one of the numbers T-125 is chartered to read. Fixing it inside a content pass would
contaminate that measurement.

**Recommended resolution:** **T-125**, as a one-line instrument repair taken deliberately with
its own before/after — thread the queued stake through the dealer pick, or cap
`GAMBLER_MAX_DARES_PER_DAY` at one hand per dealer per day. Report the effect on
`expectedValuePerDare` when it lands.

> **CLOSED AT T-150 (2026-08-01) — FIXED, by the first of the two options. SEE §11.2.**
> Applicability was CHECKED rather than assumed: M4d/M4e replaced the HAND, not the DEALER
> PICK, and both T-145's own parameter doc and `docs/LIARS-DICE_REDESIGN.md` §16 record the
> ROAMING case as surviving the redesign — so the finding was still live, on the roaming pool
> only. `planDare` now carries a per-dealer `committedStakes` map, and the pre-existing
> `dealer.credits < band.min` guard closes both the zero-stake and the sub-floor case.
> **AND THE HONEST HEADLINE IS THAT THE RATE HAD ALREADY COLLAPSED:** 0 of 101,791 hands on
> the parent commit as well as on HEAD (`< 1/101,791`, never reported as 0.00%) — **T-145's
> two-pool candidate set**, not this fix, is what closed the window in practice. The fix is
> preventive and structural: the code path was live, and only a content fact was suppressing
> it. `expectedValuePerDare` did not measurably move.

### Finding F-124-1 · A `clientele.regulars` entry naming a QUEST captain is permanently dead content — **FOUND AND CLOSED BY A TEST**

**Found by T-124 while authoring Denebola-5's and Fomalhaut-2's regulars, and fixed inside this
task because the fix is a content choice plus one assertion, not a rule change.** The cast is
split in two (`content/cast.ts`): the **30** in `NPC_PROFILES` are fully simulated and mortal,
and the **11** in `QUEST_PROFILES` are storyline-only, take no turn in the dusk loop
(`engine/day.ts:758` skips them through the shared `isSimulatedCaptain` predicate) and **sit
frozen at their day-1 system for an entire career**.

`rankClientele` ranks the live, in-system, non-dead set it is handed and never adds to it
(§2.2 ruling 4, and **F-101-2**). So a `regulars` entry naming a quest captain can only ever
rank at the ONE system that captain happens to be seeded at — `(index % 20) + 1` in
`engine/state.ts:83` — and never anywhere else, for any seed, on any day. It is not a bug in
the resolver; it is a content trap with **no symptom**: an empty intersection returns the input
unchanged, so the row looks authored, passes every well-formedness check, and quietly ranks
nobody forever.

The two rows this task first drafted hit it exactly. `npc-wild-card` (the Denebola-5 storylet's
own captain, `storylets.ts:2950`) is seeded at system **16** — a rim system with no bar at all;
`npc-rust-bucket` (the Fomalhaut-2 salvage storylet, `storylets.ts:4549`) is seeded at **Sol-3**.
Both are the thematically obvious regular for their port and both would have been dead the day
they shipped. T-123's three `regulars` lists are all simulated captains and were correct by
luck rather than by rule.

**What was authored instead:** simulated captains at both ports — `npc-nova-blitz` (Reckless;
the one captain who reliably gives a quiet port something to write down) at Denebola-5, and
`npc-junk-lord` + `npc-dust-devil` at Fomalhaut-2's dust market. The quest captains stay where
they belong, in the storylets that name them.

**What closes it:** `hangoutContent.test.ts` now asserts `isSimulatedCaptain(profileId)` for
every `regulars` entry at every authored port, reporting the offending house and profile id by
name. A real-but-frozen id was previously indistinguishable from a real-and-mobile one, because
the only existing check was membership of `ALL_NPC_PROFILES`.

**What this does NOT claim.** It is not an argument for spawning (that is F-101-2, and ruling 4
stands), and it is not a request to simulate the quest roster (an owner ruling of 2026-07-29).
It is the narrower statement that **`regulars` is a field only a simulated captain can
satisfy**, now enforced.

---

## §8 · What this spec deliberately does not settle, and the T-102 crossover

**Not settled here:**

- **Whether NPCs interact with the Hangout.** Deferred by the owner (`TASKS.md`, Deliberately
  deferred). It gates re-ruling the vacated PARITY LEDGER row and therefore gates **N8**.
  Nothing in this document changes `npc.ts`, and nothing in it should be read as a step toward
  a cast-side Hangout verb.
- **The three defects** (§5), each with its deferral reason and this track's obligations.
- **The lending band's tuning.** `LOAN_MIN_PRINCIPAL` / `LOAN_MAX_PRINCIPAL` /
  `LOAN_DAILY_RATE` / `LOAN_TERM_DAYS` are R-owned and were ratified at T-1603b. §2.2 ruling 5
  keeps `LOAN_DAILY_RATE` and `LOAN_TERM_DAYS` global and does not re-price any of them.
  **AMENDED (T-133, owner ruling D7, 2026-07-31):** the two principal constants are now the
  *default* band rather than the only one — `PortHangout.loanBand` lets a row narrow it, and
  Arcturus-6 is the first to. Their VALUES are still R-owned and still un-re-priced here, and
  the per-port ceiling authored at T-133 is a first-pass content call for T-150 to read.
- **The Dare's own balance.** `DARE_MIN_WAGER` / `DARE_MAX_WAGER` and the four disposition
  constants keep their T-1603b values as `DEFAULT_PORT_HANGOUT`. Per-port bands are content
  authoring, not a re-tune of the default.
- **Surfacing `meet` / `befriend` / `insult`** (F-101-4).
- **The manifest version.** Already at 0.5.2 (commit `9d9ff47e`). T-130 ruled: no advance to
  0.5.3 and no tag until this track's own open findings close (`TASKS.md`, "Deliberately
  deferred").
- **Anything about Explore.** `docs/EXPLORE_REDESIGN.md` (T-100) owns it.

**Crossover check for T-102, stated concretely** (the mirror of `EXPLORE_REDESIGN.md`
§7's closing paragraph):

1. **Save version — no collision, and a specific recommendation.** This spec introduces **no
   persistent state and no save bump** (§2.6, §4.3, §4.4). Explore takes 12 → 13. **Recommend
   ONE bump for the whole 0.5.2 track, Explore's**, and note the two tracks are
   **order-independent** with respect to it. M2 precedes M3 in the task list anyway, so the
   recommended ordering costs nothing.
2. **Shared idiom, disjoint names.** Both specs use *content table + engine accessor*. The
   names do not collide: Explore's are `EXPLORE_OUTCOMES` / `EXPLORE_VALUE_BANDS` / `bandFor`
   / `recoveryDays` in `content/exploration.ts` + `engine/exploreOutcomes.ts`; the Hangout's
   are `PORT_HANGOUTS` / `DEFAULT_PORT_HANGOUT` / `portHangoutFor` / `venueParamsFor` /
   `wagerBandFor` in `content/portHangouts.ts` + `engine/hangoutRules.ts`. **Neither spec
   names a concept the other names differently.**
3. **One shared consequence, and it is the load-bearing sequencing fact.** Both tracks stale
   the same smoke fixture, and both batch their capstones at their milestone's final task. So
   **T-116 and T-125 are the only two capstones in 0.5.2** — six content passes and four
   engine tasks between them take none.
4. **No shared file.** Explore touches `actions/exploration.ts`, `content/exploration.ts`,
   `types.ts`, `schema.ts`, `state.ts`, `save.ts`, `day.ts`, `legacy.ts`. The Hangout touches
   `actions/hangout.ts`, `content/portHangouts.ts`, `types.ts`, `schema.ts`, `protocol.ts`,
   `ui/format.ts`. The overlap is `types.ts` and `schema.ts`, in both cases as **additive
   union members in different event variants** — Explore adds `Recovery*` events and a fifth
   `ExplorationFailed` reason; the Hangout adds one `failReason` value to two existing
   variants. They cannot conflict semantically; at worst they conflict textually, and M2
   landing first resolves that.

---

## §9 · Handoff — which task implements which section

| Task | Implements | The accept criterion this spec makes checkable |
| --- | --- | --- |
| **T-120** | §2 (all), §3 (all), §2.6 | `portHangouts.ts` + `hangoutRules.ts` exist; Sol-3's row is `DEFAULT_PORT_HANGOUT` + prose and reproduces today's behaviour with every hangout test unchanged and **all four day-loop golden hashes byte-identical** (stated in the commit body); the resolver reads `venueParamsFor` / `wagerBandFor` and contains no port id; `'venue-not-offered'` lands in `types.ts` + `schema.ts` + a unit test + the `protocol.ts` mirror; `grep 'if ('` over `portHangouts.ts` finds nothing that decides an outcome; `balance-rig.test.ts` still classifies every engine source |
| **T-121** | §4 (all), §2.2 ruling 3 | ids 1–14 carry `hasHangout: true` and a placeholder row, asserted by an enumerating test; **the `hasHangout` ↔ `PORT_HANGOUTS` two-way equality test**; a `VisitHangout` driven successfully at a non-Sol-3 port; the six test/comment retargets in §4.2's table; replay goldens regenerated with the event-count diff and **both `rngState`s verified unchanged**; no rim or gated system flagged (§4.5); **no `npc.ts` edit** (§5.2's obligation) |
| **T-122** | §6.3 pass 1, §6.4 | five everyday ports authored; distinctness asserted as a cardinality check over the axis tuples; Sol-3's mechanical tuple still the default row; no placeholder strings; zero lines under `packages/engine/src` |
| **T-123** | §6.3 pass 2, §6.2 | five ports authored; at least one **measurably hostile** and one **measurably exotic** against §6.1's axes; the governance axis exercised without touching `isRim` / `allowsContraband`; **F-101-1's realized-vs-declared stake measurement reported** for the high-band port; any house rule wanted reported in F-101-3's format; zero engine changes |
| **T-124** | §6.3 pass 3, §6.4 | the last four, including `tone: 'comic'`; the full 14 enumerated and distinct (cardinality 14); tonal spread asserted against the axes; zero engine changes. **Delivered as written, plus two things the criterion did not ask for and the work required:** the T-121 baseline-row builder is DELETED and its "the unauthored rows are still baseline rows" test inverted rather than emptied (§6.3 correction (e)), and **F-124-1** closes the frozen-quest-captain `regulars` trap with an `isSimulatedCaptain` assertion |
| **T-125** | §4.2, §5.1's and §5.2's obligations, §10 | `npm run format`, THEN the milestone's single capstone; 8,000 merged rows from 1-indexed shards through `--merge`; fixture re-extracted with `spreads harvested`; reports hangout usage per run, the before/after disposition spread, **the dealer-purse distribution** (§5.1), **the re-measured off-Hangout Socialize percentage** (§5.2), and a measured statement about disposition's effect on `chooseWeighted`'s interceptor draw; appends to §10; **tunes nothing to reach a result**, and escalates rather than adjusts if `balance-targets.test.ts:180` went red. **Delivered 2026-07-30** — `baseline-t125-hangout.json` (8,000 rows, `spreads harvested`), baseline of record re-pinned, and a two-arm probe (HEAD vs `e0dbd40a`, 960 runs each) run in the T-116 shape. **The verdict is YES for the captain who plays the tables**: wronged-captain named interceptions 4.22% → **29.28%** on the `gambler` arm against a 9.90% uniform counterfactual, with the inertness rate falling 76.26% → **31.65%** — but disposition still reaches the draw only ~25% of the time and is inert on 69.56% of fleet named draws. §5.1's obligation discharged at §10.5 (the BAND binds 88.93% of stakes, the DEALER 10.97%), §5.2's at §10.6 (**95.91% → 37.96%**). **Zero constants, bands, DCs, thresholds, goldens or fingerprints edited**; F-123-3 re-measured (2.67%) and filed, not fixed |

---

## §10 · Appendix: T-125 re-measurement

**Measured 2026-07-30 by T-125, on HEAD after T-120…T-124 all shipped.** This appendix answers
the question that scoped the track — *has who hunts you started to depend on how you have
treated people?* — discharges §5.1's and §5.2's measurement obligations, and records the
capstone the milestone owed. **It changes no constant, no band, no DC and no threshold.**

### 10.0 The verdict, first

**YES — for a captain who actually plays the tables, and only for that captain. The share of
NAMED interceptions flown by a captain the player had wronged went 4.22% → 29.28% on the
`gambler` arm (n = 876 → 929 named draws), against an analytic uniform counterfactual of 1.78%
→ 9.90% over the same reconstructed pools — a 2.37× → 2.96× lift. Fleet-wide the same number
is 5.87% → 10.13%.**

The honest qualifier, stated before anything else because it bounds every figure below:
**disposition still reaches the draw only ~25% of the time, and on ~70% of the draws it does
reach, it is exactly inert.** `selectEncounterInterceptor` (`travel.ts:394`) only enters the
named pool on `rng.next() < 0.25`, and 24.70% of the fleet's 23,100 player interceptions were
named. Of those 5,706 named draws, **3,969 (69.56%) saw a pool in which every candidate sat at
disposition 0** — a draw on which `chooseWeighted` is byte-identical to the old uniform pick, by
its own doc comment (`travel.ts:325–337`).

So the reach change did not make disposition matter *more often*; it made it matter *more
sharply where it already could*. The gambler's inertness rate is the number that carries that:
**76.26% → 31.65%**. On the four policies that never open a Hangout — `fighter`, `explorer`,
`veteran`, `greedy` — every M5 figure is **byte-identical across the two arms**, which is the
control that says the movement is the Hangout and nothing else.

### 10.1 Method

**The probe.** `.scratch/t125-hangout.ts` (gitignored; source fenced at §10.7 — **retired at
T-173; the shipped instrument now carries these fields, see §10.7's retirement note and its
counter → field table**). It plans,
applies and reads the event stream, and adds nothing but counters — no action is added,
removed or reordered, and no rng is drawn.

**The loop is hand-rolled, and that is forced, not a shortcut.** `resolvePolicy`
(`packages/sim/src/index.ts:4638`) returns `dawnBlind: true` for any *function* policy, so
wrapping a named policy in an observer lambda and handing it to `runCampaign` would silently
plan it against the **pre-`startDay`** state. The probe resolves the NAME and calls
`resolved.policy` with `resolved.dawnBlind` honoured, reproducing `runCampaign`'s
dawn → actions → dusk order and its `policy / day-N / index-i` rng forks exactly.

**Two arms, same file, same seeds.**

| | arm BEFORE | arm AFTER |
| --- | --- | --- |
| commit | **`e0dbd40a`** (T-116) | HEAD (T-124 + this commit's docs) |
| Hangout reach | **1 of 28** (Sol-3) | **14 of 28** (ids 1–14) |
| built in | a `git worktree` with its **own** `node_modules` (third-party symlinked, `@spacerquest/*` pointed at the worktree's own packages) and its own `tsc -b` output | the repo |
| sample | seeds 1..120 × 120 days × 8 policies = **960 runs** | identical |

The isolated `node_modules` matters and is stated because the naïve symlink is wrong: the
workspace links resolve through `realpath`, so a shared `node_modules` would have run
`e0dbd40a`'s `sim` against **HEAD's** engine and content.

Everything that exists only at HEAD — `wagerBandFor`, `venueOffered`, `PORT_HANGOUTS` — is
reached through a namespace import and feature-gated, so **one file runs unmodified in both
arms**. The probe prints which surfaces it found (`wagerBandFor=false venueOffered=false` on
the BEFORE arm), so the gating is visible in the output rather than assumed.

**Fidelity check, output verbatim (2026-07-30).** The hand-rolled loop is admissible only if it
is byte-equal to the sim's own `runCampaign` on the NAMED policy, on every channel this probe
reports off. Run on `gambler`, the hangout-heaviest policy, on four channels
(`finalState.credits`, `deedCount`, `hangoutPlay.dares`, `combatEncounters.length`):

```
--- fidelity (gambler, the hangout-heaviest policy) --- [AFTER arm, HEAD]
fidelity seed 1: credits 35241/35241 · deeds 23/23 · dares 141/141 · encounters 29/29 -> MATCH
fidelity seed 2: credits 36622/36622 · deeds 22/22 · dares 117/117 · encounters 35/35 -> MATCH
fidelity seed 3: credits 85218/85218 · deeds 26/26 · dares 151/151 · encounters 27/27 -> MATCH
fidelity seed 4: credits 45282/45282 · deeds 22/22 · dares 133/133 · encounters 32/32 -> MATCH
fidelity seed 5: credits 60999/60999 · deeds 25/25 · dares 142/142 · encounters 29/29 -> MATCH

--- fidelity (gambler, the hangout-heaviest policy) --- [BEFORE arm, e0dbd40a]
fidelity seed 1: credits 67621/67621 · deeds 24/24 · dares 40/40 · encounters 27/27 -> MATCH
fidelity seed 2: credits 55681/55681 · deeds 25/25 · dares 20/20 · encounters 34/34 -> MATCH
fidelity seed 3: credits 43719/43719 · deeds 26/26 · dares 27/27 · encounters 35/35 -> MATCH
fidelity seed 4: credits 39878/39878 · deeds 23/23 · dares 24/24 · encounters 37/37 -> MATCH
fidelity seed 5: credits 20663/20663 · deeds 22/22 · dares 18/18 · encounters 37/37 -> MATCH
```

**Why the capstone aggregate cannot answer any of this, stated plainly.** `SeedRow`
(`balance/aggregate.ts:250–294`) carries no hangout and no disposition field; `MilestoneSample`
(`sim/index.ts:692–750`) carries `npcCredits` but no `npcDisposition`; `CombatEncounterRecord`
(`sim/index.ts:377–449`) carries `interceptorTier` but no interceptor id and no `source`.
Adding those fields would move `instrumentFingerprint` and fill `balance:diff` with thousands
of phantom shape deltas **in the same commit that takes the capstone**. So the capstone is
owed for the baseline/fixture obligation (§10.9) and the probe is what produces the result —
exactly the split T-116 used.

> **TRUE AS OF T-125; NO LONGER TRUE AS OF T-173 (2026-08-04).** All three shapes now carry
> the fields — see §10.7's retirement note for the counter → field table. The paragraph above
> is kept because it is the reasoning that produced four probes, and because the objection it
> raises is still correct: the fields could not ride in on a capstone commit. T-173 therefore
> added them in their OWN non-capstone commit (BR-10), with a `balance:extract` re-extract and
> no baseline move — `rulesFingerprint` unmoved, every recorded checkpoint byte-identical, and
> a two-arm 320-run sweep whose differ reported *"NO MEASURED VALUE MOVED"* on every shared
> path.

### 10.2 Hangout usage per run (fleet, 960 runs per arm)

| quantity | **BEFORE** (1 port) | **AFTER** (14 ports) |
| --- | --- | --- |
| `VisitHangout` actions issued | dare 3,264 · borrow 512 · repay 500 = **4,276** | dare 15,461 · borrow 666 · repay 656 = **16,783** |
| of which REFUSED (any typed fail or `ActionBlocked`) | **0** | **0** |
| dares / run — mean | 3.40 | **16.11** (4.74×) |
| dares / run — median · p90 | 0 · 22 | **0 · 120** |
| distinct hangout ports a verb resolved at, per run | 0.50 of 1 | **2.71 of 14** |
| credits wagered, total | 2,146,722 | **11,539,030** |
| net to the player, total | +520,820 | **+1,857,478** |
| **`expectedValuePerDare`** | **+159.56** (n = 3,264) | **+120.14** (n = 15,461) |
| `socialBeats` (meet + befriend + insult) | 0 | 0 |
| `failedVisits` | 0 | 0 |
| `venue-not-offered` refusals | 0 of 4,276 | **0 of 16,783** (i.e. `< 1/16,783`) |
| `ActionBlocked{'no-hangout'}` | 0 | 0 |

The fleet median is 0 because six of the eight policies never open a Hangout at all. The
number that means anything is the **gambler's**:

| gambler (120 runs per arm) | **BEFORE** | **AFTER** |
| --- | --- | --- |
| dares / run — mean · median · p90 | 27.20 · 28 · 36 | **128.84 · 131 · 142** |
| distinct hangout ports walked into / run | 1.00 of 1 (max 1) | **13.87 of 14 (max 14)** |
| borrow · repay actions | 126 · 126 | 135 · 135 |

**A reachable Hangout is a hangout the player actually walks into.** The gambler reaches 13.87
of the 14 authored ports in a 120-day career — the reach change is not theoretical headroom,
it is exercised almost exhaustively. And the tables stopped being free money in the way T-121
first saw at 10 seeds: `expectedValuePerDare` falls **159.56 → 120.14**, still firmly positive,
because the law of large numbers finally reaches a verb that could previously be played 27
times in a career.

**Three of the six venues report a structural zero, not a rate.** `meet`, `befriend` and
`insult` were issued **0 times in 16,783 `VisitHangout` actions across both arms** — but this
is an absence by construction, not a measured rate: no shipped sim policy plans them and no
player UI offers them (**F-101-4**). Nothing in this appendix speaks to what those three venues
would do if surfaced. That is T-130's question.

**`venue-not-offered` re-confirmed at 3.9× T-123's sample and still zero.** *(Measured at
T-125. T-133/D7 has since re-opened Arcturus-6's desk against a tight `loanBand`, so the
withheld-desk arm this paragraph describes no longer exists in content; the count it reports
was zero then and is structurally zero now for a second reason. Left as measured — an appendix
records what was seen on the day.)* T-123 authored
Arcturus-6 with no credit desk and measured zero refusals in driven careers; at 16,783 actions
the count is still 0, so the honest statement is `< 1/16,783` (< 0.006%), per standing
amendment 1's corollary. The reason is structural rather than lucky: `isLendingDeskSystem`
(`sim/index.ts:857`) and `planDare` both mirror the engine's `venueOffered` gate, which is what
T-120/T-121 built them to do.

### 10.3 The disposition spread, before and after

#### B1 · Within-career (HEAD arm)

**The "before" is degenerate and this is stated rather than dressed up:** day-0 dispositions are
all zero by construction (`packages/engine/src/state.ts`), and the probe asserts it and throws
if not. The interesting reading is the day-120 spread.

Day-120 `npc.disposition` histogram over the whole roster, 960 runs × **41** records
(the roster carries 41: the 30 simulated captains of `NPC_PROFILES` plus the 11 frozen
`QUEST_PROFILES`, which take no turn and sit permanently at 0 unless a storylet moves them):

| disposition | −10 | −9 | −8 | −7 | −6 | −5 | −4 | −3 | −2 | −1 | **0** | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **BEFORE** | 0 | 2 | 3 | 2 | 8 | 5 | 26 | 36 | 24 | 233 | 38,607 | 146 | 146 | 36 | 44 | 31 | 10 | 1 | 0 |
| **AFTER** | 1 | 25 | 28 | 26 | 26 | 37 | 64 | 82 | 80 | 285 | 38,254 | 152 | 151 | 51 | 48 | 37 | 10 | 2 | 1 |

| | **BEFORE** | **AFTER** |
| --- | --- | --- |
| non-neutral at day 120 | 753 / 39,360 (**1.91%**) | 1,106 / 39,360 (**2.81%**) |
| of which NEGATIVE | 339 | **654** |
| of which POSITIVE | 414 | 452 |
| deeply negative (`d ≤ −5`) | **20** | **143** (7.15×) |
| deeply positive (`d ≥ +5`) | 42 | 50 |
| max \|disposition\| seen at any dusk | 10 | 10 |
| captains ever crossing \|5\| (per run) | 2.260 | **3.468** |
| captains reaching their **own** `bondHook.activateAt` (total) | 583 | 553 |
| `BondIntervention` events fired (total) | 42 | 34 |

**The reach change grew the GRUDGE tail and left the friendship tail almost exactly where it
was.** Deep negatives went 20 → 143; deep positives 42 → 50. That is not an accident and it is
not a defect — it falls directly out of the shipped arithmetic: `dare` is the only Hangout verb
any policy plays, and it applies `DARE_WIN_DISPOSITION = −2` when the player WINS the hand
(`content/hangout.ts:78`, the beaten dealer sours). The player won **8,859 of 15,461 hands
(57.3%)**, so the modal outcome of a night at the tables is a slightly angrier dealer.

**The bond hook is the counter-evidence and it is reported because it cuts against the track.**
`BondIntervention` fired 42 → **34** times; captains reaching their own `activateAt` went
583 → **553**. The bond hook is a `disposition >= activateAt` gate (`day.ts:527`), so the one
voluntary verb the player has access to pushes standing *away* from it on 57% of plays. T-1204's
decay rebalance made the hook reachable at all; the reach change did **not** make it more
reachable. **This is the strongest single argument for surfacing `befriend`/`meet` (F-101-4) as
a T-130 item** — the only verbs that can move standing upward are the three with no UI.

If the 11 frozen quest captains are excluded from the denominator the AFTER figure has a
ceiling of 1,106 / 28,800 = **3.84%**; the true figure sits between 2.81% and 3.84%, because
a storylet can still move a quest captain. Both bounds are given rather than one guessed.

#### B2 · The `reason` attribution — the cleanest statement of what the reach bought

Every `DispositionChanged` event over the 960 runs, by `reason` (`types.ts:355–371`):

| reason | **BEFORE** | **AFTER** | class |
| --- | --- | --- | --- |
| `decay` | 59,016 | 76,014 | (excluded — it is the fade, not an input) |
| `contract-sniped` | 23,227 | 23,190 | involuntary — competition |
| `storylet` | 9,511 | 9,560 | involuntary — narrative |
| `tribute` | 3,077 | 2,913 | involuntary — violence |
| `player-fled` | 860 | 804 | involuntary — violence |
| `defeat` | 725 | 725 | involuntary — violence |
| **`dare`** | **3,264** | **14,803** | **VOLUNTARY** |
| **`loan-default`** | **186** | **17** | **VOLUNTARY** |
| `befriend` / `insult` / `meet` | 0 | 0 | voluntary, but unreachable (F-101-4) |
| `contraband-caught` | 0 | 0 | involuntary |
| **non-decay total** | **40,850** | **52,012** | |
| **voluntary share of non-decay movement** | **8.45%** | **28.49%** | |

**§1.5 scoped this whole track on "the Hangout is the only voluntary input to disposition". It
now carries 28.49% of all non-decay disposition movement, up from 8.45% — a 3.4× increase in
the share of the player's standing with the cast that the player CHOSE.** That is the single
cleanest number in this appendix.

Two secondary readings from the same table:

- **`loan-default` collapsed 186 → 17.** This corroborates T-121's headline from an angle T-121
  could not see: the Penny Wise desk stopped being a trap because a captain can now repay where
  it stands, so it stopped being a *disposition* faucet too.
- **`decay` rose 59,016 → 76,014** because there is simply more standing to fade. That is the
  decay rule working, not drift.

### 10.4 Disposition in `chooseWeighted` — the headline

> **RE-MEASURED AFTER THE LIAR'S DICE REDESIGN — see `docs/LIARS-DICE_REDESIGN.md` §16.6 (T-137,
> 2026-07-31).** The AFTER column below was measured against the opposed-d20 Dare, which M4d
> replaced. Same instrument, same 960-run arm, same seeds: the gambler's wronged-captain share
> **rose from 29.28% to 47.50%** and inertness fell from 31.65% to 23.52%. §7.5's four preserved
> properties all held, so this is the *distribution over the three arms* moving, not a property
> violation — but §16.6 files it as **finding F-137-2**, because the growth is a symptom of the
> broken 94.66% win rate (F-137-1) rather than an independent win: the lift over *uniform*, which
> is the part that measures the weighting itself, slipped 2.956× → 2.623×. Nothing was retuned.

**Method — a counterfactual RE-DERIVATION of the draw, never a re-roll.** For every
`EncounterStarted` on the player's path — and there is exactly one emitter, `travel.ts:688`, so
the pre-action state IS the state `selectEncounterInterceptor` was handed — the probe:

1. records `encounter.interceptor.source` and `.tier`;
2. for `named` picks, reconstructs `buildNamedCandidates(pre, chosen.tier)` exactly (live NPCs
   whose `NPC_PROFILES[profileId].tier === chosen.tier`, `travel.ts:275–301`);
3. computes the shipped weights over that pool from the shipped constants —
   `INTERCEPT_GRUDGE_WEIGHT` 1.5 / `INTERCEPT_FRIEND_WEIGHT` 0.15 / `INTERCEPT_MIN_WEIGHT` 0.1
   (`content/disposition.ts:58–60`), **imported, never restated**;
4. compares `P_weighted(chosen)` with `P_uniform(chosen) = 1/n` and computes the
   wronged-captain share against an **analytically summed** uniform expectation.

The reconstruction found the chosen captain in the reconstructed pool on **every one of the
11,566 named draws across both arms** (`pool-reconstruct misses 0`), which is the check that
says the pool being scored is the pool the engine drew from.

**The inertness rate first, because it bounds everything after it.**

| fleet (960 runs per arm) | **BEFORE** | **AFTER** |
| --- | --- | --- |
| player interceptions | 23,094 | 23,100 |
| of which **named** | 5,860 (**25.37%**) | 5,706 (**24.70%**) |
| **named draws where EVERY candidate sat at 0** | 4,550 (**77.65%**) | 3,969 (**69.56%**) |
| mean named pool size | 7.09 | 7.17 |
| mean `P_weighted(chosen)` | 0.22759 | 0.23409 |
| mean `P_uniform(chosen)` | 0.21223 | 0.20614 |
| **mean lift** | **1.0723×** | **1.1356×** |
| **chosen captain at disposition < 0** | 344 / 5,860 (**5.87%**) | 578 / 5,706 (**10.13%**) |
| analytic UNIFORM expectation over the same pools | 2.762% | 4.223% |
| **wronged-captain lift** | **2.125×** | **2.398×** |
| mean disposition of the CHOSEN captain | −0.178 | **−0.402** |
| mean disposition of their POOL | −0.050 | −0.102 |

**The sentence the task asked for, fleet-wide:** *10.13% of named interceptions were flown by a
captain the player had wronged; uniform selection over the same reconstructed pools predicts
4.22%; the lift is 2.40× — up from 5.87% against 2.76% (2.13×) before the reach change.*

**And the same sentence for the captain who actually plays the tables, where it is a different
result entirely:**

| **`gambler`** (120 runs per arm) | **BEFORE** | **AFTER** |
| --- | --- | --- |
| named interceptions | 876 of 3,603 (24.31%) | 929 of 3,689 (25.18%) |
| **inertness rate** | **76.26%** | **31.65%** |
| mean lift `P_w / P_u` | 1.0431× | **1.4814×** |
| **chosen at disposition < 0** | 37 / 876 (**4.22%**) | 272 / 929 (**29.28%**) |
| analytic uniform expectation | 1.783% | 9.904% |
| **wronged-captain lift** | **2.369×** | **2.956×** |
| mean disposition of the CHOSEN captain | −0.067 | **−1.378** |
| mean disposition of their POOL | +0.003 | −0.294 |

**Nearly three in ten of the gambler's named interceptions are now flown by someone it beat at
cards, against one in twenty-four before — and only one in ten would be, if the draw were
uniform.** The chosen captain's mean disposition (−1.378) is **4.7× more hostile than their
pool's** (−0.294), which is the weighting doing visible work rather than the roster merely
being angrier.

**The control, and it is exact.** `fighter`, `explorer`, `veteran` and `greedy` never open a
Hangout, and every M5 figure for them is **byte-identical across the two arms** — same
interception counts, same named counts, same inertness, same wronged share (e.g. `fighter`:
2,020 interceptions / 535 named / 51.03% inert / 35.14% wronged, in *both* arms). This is the
same moved/unchanged split the capstone `balance:diff` reports (§10.9), from a completely
independent instrument.

`fighter` is worth one sentence on its own: it has the highest wronged share of any policy
(**35.14%**) and the lowest inertness (**51.03%**) — and it got there entirely through violence
(`defeat` / `player-fled` / `tribute`), not choice, and it is unmoved by this track. **That is
the shape of the problem §1.5 named: before the Hangout was reachable, the only way to make the
interceptor draw mean anything was to shoot people.**

**The lever this leaves on the owner's desk, filed and NOT pulled.** The binding constraint is
not the weighting, it is the **0.25 named-pool gate** at `travel.ts:394` and the
**`DISPOSITION_DECAY_INTERVAL_DAYS = 3`** fade. Three quarters of interceptions can never see
disposition at all, and 69.56% of the ones that can are inert. Both are single constants and
**neither was touched**. Whether the named-pool share should rise is a design ruling for T-130,
not a tuning knob for a measurement task.

### 10.5 The dealer-purse distribution — *discharges §5.1's obligation*

`npc.credits` for every LIVE captain sitting at a `hasHangout` system, sampled at each milestone
dawn (days 21, 29, 30, 41, 60, 120):

| | **BEFORE** (n = 13,383) | **AFTER** (n = 121,526) |
| --- | --- | --- |
| min | 0 | 0 |
| p25 | 962 | 1,000 |
| median | 5,000 | 5,000 |
| p75 | 5,000 | **17,228** |
| max | 2,149,459 | 2,307,108 |
| mean | 39,867 | 57,479 |

The BEFORE column samples only the captains who happened to be at Sol-3; the AFTER column
samples the captains at any of 14 ports. **They are different populations, not a time series**,
which is why only the shape is comparable and not the level. The shape that matters is the
same in both: a median dealer carries 5,000 credits against a default band ceiling of
`DARE_MAX_WAGER = 1,000`.

**The number T-130 rules on — which of the three clamp terms actually binds.** For every
resolved dare the probe recomputes `min(bandMax, playerCredits, dealerCredits)`
(`hangout.ts:263`) from the pre-action state and records which term is the argmin
(HEAD only; `wagerBandFor` does not exist at `e0dbd40a`):

| binding term | count | share of 15,461 dares |
| --- | --- | --- |
| **the port's `wager.max` (the BAND)** | 13,749 | **88.93%** |
| **the DEALER's purse** | 1,696 | **10.97%** |
| the PLAYER's credits | **0** | **0.00%** (`< 1/15,461`) |
| tie (two or more terms equal) | 16 | 0.10% |

Realised stakes: min 0 · p25 208 · median 441 · p75 1,000 · max 3,000 · mean 746.3.

**This CONFIRMS T-123's addendum at 11.7× its sample and closes F-101-1 as a live concern.**
T-123 measured the dealer's purse binding on ~5% of hands at three ports; across all 14 ports
and 15,461 hands it binds on **10.97%**, and **the band binds on 88.93%**. §5.1's third and
load-bearing reason to defer the faucet — *"the faucet is what keeps dealer purses solvent, and
the dealer's purse is the binding cap on the player's wager"* — is **now measured as the minor
term.** Closing the NPC-side faucet would shrink realisable stakes on roughly one hand in nine,
not on the modal hand. That materially weakens the argument for deferral, and it is handed to
T-130 as a measured number rather than as an assumption.

**The player's own credits never bound a single one of 15,461 stakes.** That is the gambler
policy being solvent by construction, not a claim about a human player.

**F-123-3 re-measured, and NOT fixed here.** T-123 measured 34 of 1,319 hands (2.6%) settling
at a **zero** stake, caused by `planDare` picking the richest dealer once off the DAWN state
while `GAMBLER_MAX_DARES_PER_DAY = 2` lets the first hand empty that dealer. Re-measured at
this sample: **413 of 15,461 hands (2.67%)** — the rate is stable to within 0.07 points, so the
defect is exactly as characterised and has not been made worse by the reach change.

F-123-3's own recommended resolution names T-125 as the owner of the repair. **It is
deliberately not taken here, for the identical reason T-116 filed F-116-1 rather than fixing
it:** `planDare` is a *shipped policy*, `expectedValuePerDare` is one of the numbers this task
is chartered to read, and the capstone in §10.9 is taken **in this same commit**. Landing a
policy change here would make the capstone describe a policy that never shipped and would
invalidate the 120.14 figure in §10.2 in the same breath as reporting it. **Routed to its own
commit, which is allowed to move a capstone.**

### 10.6 The off-Hangout `Socialize` percentage — *discharges §5.2's obligation*

**95.91% → 37.96%.**

Method: after every dusk, for every LIVE captain whose `lastAction.type === 'Socialize'`, test
`STAR_SYSTEMS[npc.currentSystemId].hasHangout`. `resolveNpcDay` writes `lastAction` once per
captain per dusk (`npc.ts:2005`), so this is exactly one observation per captain-day.

| | **BEFORE** (`e0dbd40a`) | **AFTER** (HEAD) |
| --- | --- | --- |
| `Socialize` captain-days | 368,389 | 368,346 |
| at a system with **no** Hangout | 353,913 | 139,815 |
| **share** | **96.07%** | **37.96%** |

**The BEFORE arm re-measures the recorded 95.91% at 96.07% — within 0.16 points — which is the
validation of the method, not a coincidence.** The figure in §1.5 was measured by a different
rig on a different sample; that two independent instruments agree to a sixth of a point is what
licenses the AFTER column.

**§5.2 predicted "~96% → roughly ~50% by construction". The measured answer is 37.96%, and the
gap is the finding.** Flagging 14 of 28 systems predicts 50% only if captains were uniformly
distributed over the map; they are not. The cast's own travel policies concentrate it on the
core lane, which is exactly the 14 systems that gained bars — so the reach change caught
**more** of the verb than the arithmetic suggested. The number is stable across all eight player
policies (37.40% – 38.53%), which is expected: this is a cast-side measurement and the player's
policy barely perturbs it.

**Still open, and now cheaper to close than §5.2 assumed.** Closing the defect deletes ~38% of
the verb's occurrences rather than ~96%. §5.2's third reason to defer — *"it deletes ~96% of the
verb's occurrences, so it moves the verb mix and owes a capstone"* — is now a claim about a
number 2.5× smaller. It still owes a capstone. It is still T-130's.

And the fiction consequence T-121 knowingly created is now quantified: **139,815 captain-days
per 960 runs of rumour-mill prose naming a Hangout at a port where the player is told there is
none** (`npc.ts:1845`, `:1851` → `lastAction.details` → `hangoutRumors`, `hangout.ts:88`).

### 10.7 The probe source

**RETIRED AT T-173 (2026-08-04). The shipped instrument now carries these fields, so the next
Hangout/disposition measurement reads the sweep's own rows instead of descending from this
file.** The fence below is kept **verbatim as the historical record** — it is what T-125,
T-137, T-148 and T-150 actually ran, and §10.2–§10.6 / §11.3 are its output — but it is no
longer the route to any of these numbers. Nothing in it may be re-derived to answer a new
question; use the shipped fields.

Every counter maps onto a committed field, one for one:

| probe counter (below) | shipped field (T-173) |
| --- | --- |
| `chosen.source`, `bump(tierCounts, …)` | `CombatEncounterRecord.interceptorSource` (+ the existing `interceptorTier`) |
| the chosen captain's id | `CombatEncounterRecord.interceptorId` |
| `chosenDisposition` | `CombatEncounterRecord.interceptorDisposition` |
| `namedInert` (`ds.every(d => d === 0)`) | derived from `CombatEncounterRecord.namedPoolDispositions` (every entry 0), rolled up as `PolicyAggregate.interceptor.inertShare` |
| `pUniform`, `uniformWrongedExpectation` | derived from the same raw pool; rolled up as `PolicyAggregate.interceptor.uniformWrongedShare` (still ANALYTIC, still summed, never re-rolled) |
| `chosenWronged` | `PolicyAggregate.interceptor.chosenWrongedShare` |
| `reconstructMiss` | `CombatEncounterRecord.namedPoolReconstructed` (a field, so it is counted rather than assumed) — summed as `PolicyAggregate.interceptor.reconstructionMisses` |
| M1's `HangoutEvent` fold | `SeedRow.hangout` (`CampaignStatsReport.hangoutPlay`, carried whole) |
| M2's `DispositionChanged`-by-`reason` fold | `SeedRow.disposition.movesByReason` |
| M2's dusk disposition sampling (sample point C) | `SeedRow.disposition` (`liveNpcDays`, `zeroDispositionNpcDays`, `absDispositionSum`, `peakAbsDisposition`, `standingSpanDays`, `standingsOpenAtHorizon`) and, per milestone day, `MilestoneSample.npcDisposition` → `MilestoneAggregate.npcDisposition` / `npcNonzeroDispositionShare` |
| the day-0 all-neutral `throw` guard | asserted in `packages/sim/src/__tests__/campaign-disposition.test.ts` |

The one thing NOT carried across, deliberately: `interceptWeight` — `chooseWeighted`'s own
formula. The rows carry the RAW pool dispositions instead, so a future re-cut of the weighting
reads them off the sweep rather than reading a number some instrument baked in.

Fenced so the measurement is reproducible without the gitignored file (T-010 / T-116
precedent). The console formatting is elided; every counter and every sample point is here.

```ts
// .scratch/t125-hangout.ts — READ-ONLY. Runs unmodified at HEAD and at e0dbd40a.
import * as ENGINE from '../packages/engine/src/index.js';
import * as CONTENT from '../packages/content/src/index.js';
import { resolvePolicy, runCampaign } from '../packages/sim/src/index.js';

const { createInitialState, startDay, endDay, applyPlayerAction, SeededRng } = ENGINE;
const { STAR_SYSTEMS, NPC_PROFILES } = CONTENT;
const { INTERCEPT_GRUDGE_WEIGHT, INTERCEPT_FRIEND_WEIGHT, INTERCEPT_MIN_WEIGHT } = CONTENT;

// HEAD-only surfaces, feature-gated so the e0dbd40a arm still runs.
const wagerBandFor = (ENGINE as Record<string, unknown>).wagerBandFor as
  | ((systemId: number) => { min: number; max: number }) | undefined;

const MILESTONE_DAYS = new Set([21, 29, 30, 41, 60, 120]);

/** The shipped weight function, from the shipped CONSTANTS — imported, never
 *  restated. Mirrors chooseWeighted (actions/travel.ts). */
function interceptWeight(d: number): number {
  if (d < 0) return 1 + INTERCEPT_GRUDGE_WEIGHT * -d;
  if (d > 0) return Math.max(INTERCEPT_MIN_WEIGHT, 1 - INTERCEPT_FRIEND_WEIGHT * d);
  return 1;
}

function run(seed: number, days: number, policyName: string) {
  const resolved = resolvePolicy(policyName);          // dawnBlind:false for the six competent ones
  let state = createInitialState(seed);
  // ... counters (see the tables above for every one) ...
  if (state.npcs.some((n) => n.disposition !== 0)) throw new Error('day-0 roster not all-neutral');

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const startingDay = state.day;
    // M3 · SAMPLE POINT A — dealer purses at milestone dawn.
    if (MILESTONE_DAYS.has(startingDay)) {
      for (const npc of state.npcs) {
        if (!npc.dead && STAR_SYSTEMS[npc.currentSystemId]?.hasHangout) purses.push(npc.credits);
      }
    }
    const rng = new SeededRng(seed)
      .fork('policy').fork(`day-${startingDay}`).fork(`index-${dayIndex}`);
    const dawnState = state;
    const dawn = startDay(state);
    let dayState = dawn.state;
    const events: GameEvent[] = [...dawn.events];
    const actions = resolved.policy({
      state: resolved.dawnBlind ? dawnState : dayState, dayIndex, rng,
    });

    for (const action of actions) {
      if (action.type === 'Combat' && !dayState.encounter) continue;
      // SAMPLE POINT B — the roster the engine will draw from, and the purses the
      // wager clamp will read. Taken BEFORE the step, exactly where runCampaign
      // takes its own pre-action sample.
      const pre = dayState;
      const stepped = applyPlayerAction(dayState, action);
      dayState = stepped.state;
      events.push(...stepped.events);

      if (action.type === 'VisitHangout') {
        // M1 · per-venue attribution off the ACTION (so borrow/repay, which report a
        // LoanEvent rather than a HangoutEvent, are counted), plus the refusal split
        // and the distinct-port set.
        bump(venueActions, action.venue);
        const refused = stepped.events.some(
          (e) => ((e.type === 'HangoutEvent' || e.type === 'LoanEvent') && e.failReason !== undefined)
            || e.type === 'ActionBlocked');
        if (!refused) { bump(venueResolved, action.venue); portsUsed.add(pre.player.currentSystemId); }
        // ... venue-not-offered / no-hangout counters ...

        // M3 · which of the three clamp terms bound this stake? (hangout.ts:263)
        if (action.venue === 'dare' && wagerBandFor) {
          const ev = stepped.events.find((e) => e.type === 'HangoutEvent' && e.venue === 'dare');
          const dealer = pre.npcs.find((n) => n.id === action.opponentId);
          if (ev && ev.failReason === undefined && dealer) {
            const band = wagerBandFor(pre.player.currentSystemId);
            const terms = [band.max, pre.player.credits, dealer.credits];
            const cap = Math.min(...terms);
            // argmin -> capBandMax / capPlayer / capDealer / capTies
            realisedWagers.push(ev.wager ?? 0);
            if ((ev.wager ?? 0) === 0) zeroStakes += 1;      // F-123-3
          }
        }
      }

      // M5 · the interceptor draw. EncounterStarted has exactly ONE emitter
      // (travel.ts:688, the player's own jump), so `pre` IS the state
      // selectEncounterInterceptor was handed.
      for (const e of stepped.events) {
        if (e.type !== 'EncounterStarted') continue;
        const chosen = e.encounter.interceptor;
        interceptions += 1;
        bump(tierCounts, `${chosen.source}-t${chosen.tier}`);
        if (chosen.source !== 'named') continue;            // anonymous weights are exactly 1
        namedInterceptions += 1;
        // Reconstruct buildNamedCandidates(pre, chosen.tier) exactly (travel.ts:275-301).
        const pool = pre.npcs.filter((npc) => !npc.dead
          && NPC_PROFILES.find((c) => c.id === npc.profileId)?.tier === chosen.tier);
        if (!pool.some((npc) => npc.id === chosen.id)) { reconstructMiss += 1; continue; }
        const ds = pool.map((npc) => npc.disposition);
        if (ds.every((d) => d === 0)) namedInert += 1;      // THE INERTNESS RATE
        const w = ds.map(interceptWeight);
        const total = w.reduce((a, b) => a + b, 0);
        const i = pool.findIndex((npc) => npc.id === chosen.id);
        pWeighted.push(w[i] / total);
        pUniform.push(1 / pool.length);
        chosenDisposition.push(ds[i]);
        poolMeanDisposition.push(ds.reduce((a, b) => a + b, 0) / pool.length);
        if (ds[i] < 0) chosenWronged += 1;
        // The ANALYTIC uniform counterfactual — summed, never re-rolled.
        uniformWrongedExpectation += ds.filter((d) => d < 0).length / pool.length;
      }
    }

    const dusk = endDay(dayState);
    state = dusk.state;
    events.push(...dusk.events);

    for (const e of events) {
      // M1 · the shipped HangoutEvent fold, byte-for-byte from sim/index.ts:1156-1176.
      // M2 · DispositionChanged by `reason`.  Also BondIntervention.
    }
    // M2 · SAMPLE POINT C — |d| >= 5, own bondHook.activateAt, max|d|.
    // M4 · one action per LIVE captain per day, off the dusk-written lastAction.
    for (const npc of state.npcs) {
      if (npc.dead || npc.lastAction?.type !== 'Socialize') continue;
      socializeNpcDays += 1;
      if (STAR_SYSTEMS[npc.currentSystemId]?.hasHangout !== true) socializeOffHangout += 1;
    }
  }
  return { credits: state.player.credits, /* ...every counter above... */ };
}

// FIDELITY: admissible only if byte-equal to runCampaign on the NAMED policy.
for (let s = 1; s <= 5; s += 1) {
  const mine = run(s, 120, 'gambler');
  const theirs = runCampaign(s, 120, 'gambler');
  const ok = mine.credits === theirs.finalState.credits
    && mine.deedCount === theirs.deedCount
    && mine.dares === theirs.hangoutPlay.dares
    && mine.combatEncounters === theirs.combatEncounters.length;
  console.log(`fidelity seed ${s}: ... -> ${ok ? 'MATCH' : 'MISMATCH'}`);
}
for (const policy of POLICIES) for (let s = 1; s <= 120; s += 1) all.push(run(s, 120, policy));
```

### 10.8 Honesty caveats

1. **The two arms are rng-paired for four policies and not for the other four, and this is
   measured rather than assumed.** `fighter`, `explorer`, `veteran` and `greedy` never issue a
   `VisitHangout`, and every one of their M5 and M4 figures is byte-identical across the arms —
   so for them the comparison is a true control. `trader`, `trader-degraded`, `smuggler` and
   `gambler` plan differently from the first day a bar appears on their route, so their arms
   are different samples of a changed world, not a paired difference. That is exactly the
   moved/unchanged row split the capstone diff reports independently (§10.9). Read every
   before/after figure for those four distributionally.
2. **M4 attributes one action per captain-day off `lastAction`, so a captain who travelled and
   then socialised is attributed to the DESTINATION.** `resolveNpcDay` resolves exactly one
   action per captain per dusk and writes it to `lastAction` (`npc.ts:2005`), so the count is
   neither double- nor under-counted — but the *system* it is attributed to is where the
   captain ended the day. The 0.16-point agreement with the independently-measured 95.91%
   bounds how much that can be worth.
3. **Queued ≠ resolved, and both denominators are named.** Every per-dare figure in §10.2 and
   §10.5 states its `n`. `failedVisits` and `venue-not-offered` are both 0, so on this sample
   the two denominators coincide — but they are counted separately and reported separately, and
   a future policy drift would show up as a gap rather than as silence.
4. **A zero is reported as `< 1/n`, never as 0.00%** (standing amendment 1's corollary), *except*
   where the zero is structural rather than sampled: `meet` / `befriend` / `insult` are
   0 because nothing can issue them (F-101-4), and that is an absence by construction, stated
   as such.
5. **The six sim policies are PLAYER policies and the cast has no Hangout verb.** §8 defers
   "whether NPCs interact with the Hangout". Nothing in this appendix says anything about
   NPC-side Hangout use, and the NPC-side `Socialize` verb measured in §10.6 is a *different*
   verb that happens to share the fiction.
6. **The dealer-purse columns in §10.5 sample different populations across the arms** (captains
   at 1 port vs at 14), so only the shape is comparable, not the level. The clamp-term split is
   HEAD-only by necessity: `wagerBandFor` does not exist at `e0dbd40a`.
7. **The disposition histogram's denominator is the 41-record roster, not the 30 simulated
   captains.** Both bounds are given in §10.3 rather than one being chosen.
8. **M5's pool reconstruction assumes the primary draw path.** `selectEncounterInterceptor` has
   a third, band-widening branch that fires only when BOTH the named and anonymous pools are
   empty at the target tier, and which would mix tiers. The reconstruction found the chosen
   captain in the single-tier pool on **11,566 of 11,566** named draws, so if that branch fired
   at all it did not produce a pool this reduction misread.
9. **`expectedValuePerDare` is contaminated by F-123-3 in both arms**, at 2.6% and 2.67% of
   hands respectively. The rate is stable, so the 159.56 → 120.14 movement is not an artifact of
   it — but the level is depressed in both columns by roughly the same small amount.

### 10.9 Capstone provenance

| | |
| --- | --- |
| label | `t125-hangout` |
| file | `docs/balance/baseline-t125-hangout.json` |
| shape | 1,000 seeds × 120 days × 8 policies = **8,000 runs**, 8 shards (1-indexed) + `--merge` |
| `--milestone-days` | `21,29,30,41,60,120` (identical to T-116 and N11) |
| `--policies` | `trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy` |
| taken | **after** `npm run format` (which changed zero files — the tree was already clean) |

Merge output, verbatim:

```
[balance] wrote aggregate for 8000 rows to /Users/vs7/Dev/Games/SpacerQuest/docs/balance/baseline-t125-hangout.json
```

Fixture re-extracted **from that file**, never bare:

```
[smoke] 4 tiers, spreads harvested, rules 6e8c9973fa7a4238 / instrument 4e7184c378da068f / docs 1002d9efefacf7fb -> /Users/vs7/Dev/Games/SpacerQuest/docs/balance/smoke/tiers.json (880 ms)
```

`docs/balance/smoke/tiers.json` `provenance` now reads `sweepLabel: "t125-hangout"`,
`runs: 8000`, `seeds: 1000`, `days: 120`, `spreadSource: "harvested"`.

**`balance:diff baseline-t116-explore → baseline-t125-hangout`, headline:** exactly **five** rows
carry changed fields — `fleet` (439), `gambler` (544), `smuggler` (527), `trader` (444) and
`trader-degraded` (451). **`explorer`, `fighter`, `greedy` and `veteran` have zero changed
fields**, which is the expected shape and the control: those four are the policies that never
play a table or open a credit desk.

| row | metric | T-116 → T-125 |
| --- | --- | --- |
| fleet | `tourOneClearRate` | 0.5411 → **0.5670** |
| fleet | `debtClearedDay.median` | 25 → **24** |
| fleet | `finalCredits.median` | 34,213 → **37,961** |
| fleet | `portOwnershipRate` | 0.4657 → **0.5055** |
| **gambler** | `tourOneClearRate` | 0.7790 → **0.8480** |
| **gambler** | `finalCredits.median` | 45,343 → **56,634** (+24.9%) |
| **gambler** | `debtClearedDay.median` | 27 → **25** |
| **gambler** | `portOwnershipRate` | 0.6770 → **0.8330** |
| smuggler | `tourOneClearRate` | 0.6670 → **0.7530** |
| smuggler | `finalCredits.median` | 37,610 → **41,080** |
| trader | `tourOneClearRate` | 0.9130 → **0.9260** |
| trader | `finalCredits.median` | 51,561 → **52,177** (+1.2%) |
| trader-degraded | `tourOneClearRate` | 0.7750 → **0.8140** |
| trader-degraded | `finalCredits.median` | 35,343 → **37,772** |

**The predicted shape held, with one correction worth its own paragraph.** `gambler` moved most,
as the reach change predicts. But **`trader` moved too, and it moved through a verb it never
plays**: the trader issues zero dares and 289 lending actions across 120 runs, and its
`finalCredits.median` rises only 1.2% while its `tourOneClearRate` rises 1.4 points. That is
the **Penny Wise desk**, not the tables — a captain who can repay where it stands rather than
only where it started. §10.3's `loan-default` collapse (186 → 17) is the same effect seen from
the disposition side. The trader's row moving is therefore *not* a surprise to be explained
away; it is the second, quieter half of what the reach change bought.

The diff also reports **5 shape changes**, all of them `renownRanks.*` histogram keys appearing
or disappearing (`gambler.COMMODORE`, `gambler.CAPTAIN`, `smuggler.TOP_DOG`,
`trader-degraded.CAPTAIN` gone; `trader.COMMODORE` new). These are a sparse histogram's buckets,
not an instrument change — milestone days and the policy list are identical on both sides, so
**no phantom `milestones[i]` paths appear**.

**Baseline of record RE-PINNED** to `baseline-t125-hangout.json`, under standing amendment 1's
rule ("does the baseline describe HEAD?"): T-120…T-124 shipped a parameterised Hangout at 14
ports where there was 1, and it demonstrably moved five rows, so `baseline-t116-explore` no
longer describes HEAD. **All three pointers move in this same commit:**

1. `packages/sim/src/__tests__/balance-targets.test.ts:103` (the runtime path)
2. `docs/NPC_REDESIGN.md:1982` (standing amendment 1's blockquote) **and** `:107` (the status
   banner)
3. `docs/balance/smoke/README.md:95` (the "current baseline" sentence)

Fingerprints moved rules `bbf007a6bf38a932 → 6e8c9973fa7a4238` / instrument
`313fde95fc5ee9db → 4e7184c378da068f` / docs `d8cec298cd93f909 → 1002d9efefacf7fb`. All three
are expected: T-120 added `hangoutRules.ts` (classified engine source, hence the instrument
hash), T-121…T-124 rewrote `portHangouts.ts` and `systems.ts` (hashed content), and this track
rewrote four spec documents.

**The `it.fails` clear-day tripwire remains correctly RED on the new capstone:** the trader's
`debtClearedDay.median` is **21** against `[22, 30]`, at **n = 987**, unmoved from T-116 and
from N11. It was **not** converted to `it`, and the baseline was **not** chosen to make it pass.
The live 40-seed "the trader clears the marker, and clears it fastest" block at `:180` is green.

### 10.10 What was NOT changed

**No constant, DC, price, band weight, threshold, golden or fingerprint was edited to reach any
answer above.** `git diff --stat` shows **zero lines** changed under `packages/engine/src/`,
`packages/content/src/`, `packages/sim/src/index.ts` and `packages/sim/src/balance/`. The only
source change in this commit is **one path string** in
`packages/sim/src/__tests__/balance-targets.test.ts`, and it is the re-pin.

Specifically unchanged at their shipped values: `INTERCEPT_GRUDGE_WEIGHT` **1.5**,
`INTERCEPT_FRIEND_WEIGHT` **0.15**, `INTERCEPT_MIN_WEIGHT` **0.1**
(`content/disposition.ts:58–60`), `DISPOSITION_DECAY_INTERVAL_DAYS` **3**
(`content/disposition.ts:48`), `DARE_MIN_WAGER` **25** / `DARE_MAX_WAGER` **1,000** /
`DARE_WIN_DISPOSITION` **−2** / `DARE_LOSS_DISPOSITION` **+2** (`content/hangout.ts:65–79`), the
0.25 named-pool gate (`travel.ts:394`), and **every one of the fourteen authored port rows** in
`packages/content/src/portHangouts.ts`. `CURRENT_SAVE_VERSION` stays **13** and no save shape
moved, so no migration is owed.

**No new test file, and that is deliberate.** A capstone is a measurement; the only code change
it may carry is the re-pin path string. An engine, content or sim test added here would either
touch a hashed source (moving the fingerprint of the capstone taken in the same commit) or be a
stub written to satisfy a checklist, which the standing constraints forbid. What grades this
work is already in the suite: `balance-smoke.test.ts` + `balance-rig.test.ts` grade the newly
extracted `tiers.json`, and `balance-targets.test.ts` reads the baseline of record off disk at
line 103 — a missing or misnamed baseline fails loudly there, which is the guard that the
re-pin was done correctly.

**Four levers left on the owner's desk for T-130, none pulled:**

1. **The 0.25 named-pool gate and the decay interval** (§10.4). Three quarters of interceptions
   cannot see disposition at all, and 69.56% of those that can are inert. Both are one constant.
2. **F-101-4 — surface `befriend` / `meet` / `insult`** (§10.3). The bond hook fired *less* after
   the reach change (42 → 34) because `dare` is the only reachable Hangout verb and it pushes
   standing *down* on 57.3% of plays. The three verbs that can push it up have no UI.
3. **§5.1's faucet, re-argued on a measured number** (§10.5). The dealer's purse binds 10.97% of
   stakes and the band binds 88.93%, so the third reason to defer is now the minor term.
4. **F-123-3** (`planDare`'s once-per-day dealer pick, 2.67% zero stakes) — a sim-policy fix,
   cheap, and it should land in a commit that is allowed to move a capstone.
   **— CLOSED AT T-150 (2026-08-01), in exactly such a commit. See §11.2.**

**Where the other three went.** Lever 2 (**F-101-4**, surfacing `befriend` / `meet` / `insult`)
was **shipped by T-132**. Lever 3 (§5.1's faucet) is **re-measured and still open** — §11.4(1),
now +3.44cr/captain-day and 0.22% of terminal NPC wealth. Lever 1 (**the 0.25 gate and the decay
interval**) is **re-measured, still unpulled, and re-filed as F-150-1** — §11.3 — with the
levers-not-pulled table this document owes it.

---

## §11 · Appendix: T-150 post-fix re-measurement

**Measured 2026-08-01 by T-150, on HEAD after every fix and build task in M4a–M4f shipped
(T-131, T-132, T-133, T-137, T-148, T-149).** This appendix records the capstone the track
owed, closes **F-123-3**, files **F-150-1** as a DESIGN QUESTION for the owner, and RE-ASKS
the two vacated PARITY LEDGER rows with current numbers beside them. **It changes no
constant.**

### 11.1 The gate work, in order

**1 · `npm run format` FIRST, before anything was measured.** It reported every file
unchanged, so no source moved between the edits and the sweep. It was **not** re-run
afterwards; the only files touched after the capstone are markdown, which is in no
fingerprint corpus.

**2 · The sweep — the same shape as every capstone back to `baseline-r2c-explorer-remit`.**
Eight **1-indexed** shards, run concurrently:

```
npm run balance:sweep -w @spacerquest/sim -- --label t150-postfix --seeds 1000 --days 120 \
  --policies trader,trader-degraded,fighter,explorer,veteran,smuggler,gambler,greedy \
  --milestone-days 21,29,30,41,60,120 --shard i/8      # i = 1..8
npm run balance:sweep -w @spacerquest/sim -- --label t150-postfix --merge
```

The merge printed **`[balance] wrote aggregate for 8000 rows`** — eight shards of exactly
1,000 rows each. Both `--milestone-days` and `--aggregate` (below) were honoured; a run
missing either is not a capstone.

**3 · The diff, with the prediction written down BEFORE the run.** The predicted moved set was
`{explorer, gambler, fleet}` — the Explore guard is a term inside `explorerPolicy`'s own loop,
and `planDare` has exactly one caller (`gamblerPolicy`) — with `trader`, `trader-degraded`,
`fighter`, `veteran`, `smuggler` and `greedy` byte-identical.

```
MOVED ROWS (3): fleet, explorer, gambler
UNCHANGED ROWS: header, fighter, greedy, smuggler, trader, trader-degraded, veteran
```

**THE PREDICTION HELD EXACTLY.** (`smuggler` is in the unchanged set rather than the moved set
because the twin fix was measured and backed out — see `docs/EXPLORE_REDESIGN.md` §10.3,
finding F-150-2. Had it shipped, `smuggler` would have been the fourth moved row.)

**4 · One extract, `--aggregate` load-bearing.**
`npm run balance:extract -- --aggregate docs/balance/baseline-t150-postfix.json` printed
`4 tiers, spreads harvested`, and `docs/balance/smoke/tiers.json` now carries
`provenance.sweepLabel = "t150-postfix"`, `runs = 8000`, `spreadSource = "harvested"` — the
last of which `balance-smoke.test.ts` asserts, precisely so a dropped `--aggregate` fails loudly.

**5 · The three fingerprints, and this is the interesting part of the capstone.**

| fingerprint | parent commit | HEAD | verdict |
| --- | --- | --- | --- |
| `rulesFingerprint` | `30956ac30326f246` | `30956ac30326f246` | **UNMOVED** |
| `instrumentFingerprint` | `c80ebc59869406bb` | `342e248189f7ac34` | **MOVED** |
| `docsFingerprint` | `6754f4ab2c779999` | `a3ef073897c54166` | **MOVED** |

*Verified against a `git worktree` at the parent commit rather than asserted.* **rules is
UNMOVED because T-150 edits no engine and no content source at all** — it is worth saying that
the value differs from the one T-148 recorded (`09deb1e41c99bdeb`); that move belongs to
**T-149**, not to this task, and the worktree comparison is what separates the two.
**instrument MOVED correctly:** `packages/sim/src/index.ts` is inside the instrument corpus
(`SIM_NON_INSTRUMENT_SOURCES` excludes only `protocol.ts`, `protocol-stdio.ts`, `balance/sweep.ts`,
`balance/diff*.ts`, `balance/resolve-artifact.ts`, `balance/smoke-extract.ts`,
`balance/checkpoints.ts` and `balance/rules-fingerprint.ts`), so a policy edit necessarily
stales the fixture. **That is exactly the "a stale fixture gets a new capstone" case, and it is
why the two fixes and the capstone had to be one task.** **docs MOVED** because it is a
raw-byte hash and the new comments alone move it; it is informational by design and can never
fail a test.

**6 · Baseline of record re-pinned in all four places:**
`packages/sim/src/__tests__/balance-targets.test.ts` (the single path string),
`docs/NPC_REDESIGN.md`'s "BASELINE OF RECORD RE-PINNED AT …" block and standing amendment 1's
blockquote, and `docs/balance/smoke/README.md`.

**Probe provenance.** `.scratch/t150-postfix.ts`, descended from `.scratch/t148-roster-ladder.ts`
with the **M5 interceptor block carried VERBATIM** — it has now travelled unchanged from
`.scratch/t125-hangout.ts` through T-137, T-148 and here, which is what makes §11.3's column
like-for-like against §10.4's AFTER column rather than a new number off a new instrument. It
passes the same six-channel fidelity check against `runCampaign` before any number is believed.
**Arm 1** = seeds 1..120 × 120 days × 8 policies (960 runs, identical shape to §12.6).
**Arm 2** = a depth arm, `gambler` and `explorer` at 600 seeds (1,200 runs), so every cell
reported below clears **n ≥ 1,000**.

### 11.2 F-123-3 — **CLOSED, FIXED** (and applicability was checked, not assumed)

#### It was still applicable — to the ROAMING pool only

The task brief asked whether M4d/M4e's Liar's Dice resolver had made this finding moot. **It had
not, and here is the check rather than an assertion:** M4d/M4e replaced the **hand** — one
opposed-GUILE roll became the full bid / raise / challenge resolver — and did not touch the
**dealer pick**, which still ran once off the dawn state. Two citations, both in-repo:

1. **T-145 already fixed the ROSTER half and its own parameter doc says the roaming half was
   left**, verbatim: *"A ROAMING dealer whose purse the first hand emptied is merely clamped to a
   zero-stake hand by the engine, but a ROSTER opponent is REFUSED outright."*
2. **`docs/LIARS-DICE_REDESIGN.md` §16 re-confirms it under the NEW resolver**: *"the seed is
   clamped to the dealer's purse, and a broke dealer deals a free hand. Unchanged by this
   redesign, still not fixed here."*

#### The fix — the finding's own option A

`planDare` takes a fourth parameter, `committedStakes: ReadonlyMap<string, number>`, and the
roaming loop reads `npc.credits − (committedStakes.get(npc.id) ?? 0)` instead of the raw dawn
purse. **The worst case is the dealer LOSING every stake already queued against them, which is
the identical convention the caller already applies to the player's own purse** (`purse -=
dare.wager`) — the symmetry is the argument. The pre-existing `dealer.credits < band.min` guard
then closes **both** halves the finding measured, the zero stake and the sub-floor stake, with
no new downstream check.

Option B — capping `GAMBLER_MAX_DARES_PER_DAY` at one hand per dealer — was **refused**:
`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9 lists it as a lever deliberately left alone (*"the
instrument's throttle; changing it would move the pacing answer by fiat"*), and it would also
destroy hands a rich dealer could legitimately play twice.

`committedRosterIds` is **kept alongside** it, not collapsed into it: the roster refusal is
CATEGORICAL (`HangoutEvent{failReason:'opponent-broke'}` at any purse ≤ 0), the roaming clamp is
QUANTITATIVE (below `band.min` is merely worthless). Two mechanisms, two reasons, both documented
at the parameter.

#### The measurement — and the honest headline is that the defect had ALREADY stopped firing

| stake quality, `gambler` | **BEFORE** (parent) | **AFTER** (HEAD) | **AFTER, depth arm** |
| --- | --- | --- | --- |
| settled hands | 20,477 | 20,418 | **101,791** |
| of which ROAMING (the affected pool) | — | 8,649 | **43,501** |
| **ZERO-stake hands** | **0** | **0** | **0** |
| **sub-`band.min` hands** | **0** | **0** | **0** |
| `expectedValuePerDare` | 562.63cr | 564.95cr | 558.19cr |

**Reported as `< 1/101,791` (and `< 1/43,501` on the roaming pool alone), never as 0.00%** —
standing amendment 1's corollary. And the honest reading is not "the fix worked": **the rate was
already below 1/20,000 on the parent commit.** T-125 measured 2.67%; **T-145's two-pool candidate
set is what actually collapsed it**, by seating a roster opponent — authored bankrolls of
3,000–8,000cr against a port ceiling of 1,000 — in 57.26% of hands, so the narrow window this
finding needed (a roaming dealer whose dawn purse sits in `[band.min, band.min + wager)`) now
almost never opens.

**The fix is therefore PREVENTIVE and STRUCTURAL rather than corrective, and it is still worth
having.** The defective code path was live: nothing in `planDare` prevented it, and the only
thing suppressing it was a *content* fact (roster bankrolls out-bank roaming captains) that a
single re-authored `bankroll` could undo silently. Recording this honestly matters more than
claiming a delta: **this task did not measurably move `expectedValuePerDare`, and the ±0.4%
between the arms is career re-phasing, not the fix.**

### 11.3 THE NEW FINDING · **F-150-1** — the 0.25 named-pool gate and the decay interval, read together

**STATUS: A DESIGN QUESTION FOR THE OWNER, NOT A TUNING KNOB.** T-125 ruled it so and T-150
does not overturn that. **Neither constant is changed by this task.**

**RULED (owner, 2026-08-03, at the T-158 checkpoint): DEFER.** Neither constant (`rng.next() <
0.25`, `DISPOSITION_DECAY_INTERVAL_DAYS = 3`) is fixed or accepted-as-final by this ruling — the
owner is prioritizing UI/visual-design iteration (T-186, T-188, T-189, T-190, T-191) first and
will revisit this design question afterward. This is a deferral, not a close.

The two constants are `rng.next() < 0.25` in `packages/engine/src/actions/travel.ts` (the
named-pool gate on the interceptor draw) and `DISPOSITION_DECAY_INTERVAL_DAYS = 3` in
`packages/content/src/disposition.ts`. They are filed **together** because they compose: the
gate decides *how often* disposition can matter at all, and the interval decides *how long*
any disposition survives to matter with.

#### The numbers, at HEAD, like-for-like against §10.4's AFTER column

| fleet-wide | §10.4 AFTER (T-125) | §12.6 (T-148) | **T-150 arm 1** | **T-150 arm 2 (depth)** |
| --- | --- | --- | --- | --- |
| interceptions | 23,092 | 23,013 | 23,077 | 39,970 |
| of which **named** | 5,706 (**24.70%**) | 5,807 (**25.23%**) | 5,786 (**25.07%**) | 9,907 (**24.79%**) |
| **inertness** (every candidate at 0) | 3,969 (**69.56%**) | 4,111 (**70.79%**) | 4,138 (**71.52%**) | 6,257 (**63.16%**) |
| chosen captain at disposition < 0 | 578 (**10.13%**) | 548 (**9.44%**) | 556 (**9.61%**) | 1,231 (**12.43%**) |
| analytic UNIFORM over the same pools | 4.223% | 3.966% | 4.075% | 4.572% |
| **lift over uniform** | **2.40×** | **2.379×** | **2.358×** | **2.717×** |

**The named share sits at 25.07% against the analytic 25.00% — the gate does exactly what it
says.** Nothing this track shipped moved it, which is the point of showing it: T-131's recovery
model, T-132's UI, T-133's loan band, T-137/T-148's Liar's Dice and T-149's `hasHangout` gate
all landed between §10.4 and this row, and the interceptor column is unmoved to within sampling
noise. **The two constants are the only things that could move it.**

**The grudge weighting works where it can reach.** A wronged captain is chosen at ~2.4× the
uniform rate. But it can only reach **one interception in four**, and **71.52% of those** are
draws in which every candidate in the pool sits at exactly 0 — so disposition changes nothing.
Multiplying through: **disposition alters the outcome of roughly 7% of all interceptions.**

**And it is a player-behaviour effect, not a global one.** Split by policy, arm 1:

| policy | named | inertness | chosen wronged | lift |
| --- | --- | --- | --- | --- |
| `gambler` (plays the tables) | 890 (25.13%) | **41.46%** | 246 (**27.64%**) | **2.806×** |
| `explorer` (never sits down) | — | **79.13%** (arm 2) | 2.42%-class | ~1.7× |

**The gambler is the existence proof that the system is reachable**, and it gets there entirely
through the Dare: 7,933 `DispositionChanged{reason:'dare'}` events on that arm, against 23,009
decay steps.

#### The decay half, measured — including one correction to the brief

**The brief said decay is a silent mutation with no event. It is not.** `day.ts`'s dusk loop
routes it through `applyDisposition(..., 'decay', events)`, so it emits
`DispositionChanged{reason:'decay'}` like any other move. State sampling is still used below for
the share and the survival figures, which no event can answer.

| decay, at dusk | arm 1 (fleet) | arm 2 (depth) | `gambler` only | `explorer` only |
| --- | --- | --- | --- | --- |
| live npc-days sampled | 4,674,354 | 5,843,441 | 2,921,974 | 2,921,467 |
| **at exactly `disposition === 0`** | **96.52%** | **93.29%** | **90.12%** | **96.47%** |
| mean \|disposition\| | 0.0847 | 0.1971 | 0.3309 | 0.0632 |
| peak \|disposition\| reached | 10 | 10 | 10 | 8 |
| **mean SURVIVAL of a nonzero standing** | **4.59 days** | 6.47 days | **8.33 days** | **4.09 days** |
| median / p90 survival | 3 / 11 | 3 / 18 | 5 / 20 | 3 / 8 |
| decay steps : interaction moves | **1.53 : 1** | 1.63 : 1 | 1.68 : 1 | 1.53 : 1 |

**The cast sits at exactly zero on 96.52% of live captain-days, and decay outruns interaction
1.53 to 1.** A standing survives a median of **3 days** — one decay interval — before it is
gone. That is the mechanism behind the 71.52% inertness above, and it is the reason the two
constants are one question rather than two: at `DISPOSITION_DECAY_INTERVAL_DAYS = 3` the pool
is empty most of the time, so widening the 0.25 gate would mostly buy more *inert* named draws.
The gambler's own column is the counter-case and the encouraging one — a player who interacts
holds standing for a median of 5 days and drives inertness down to 41.46%.

#### The levers considered and deliberately NOT PULLED

In `docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.9's exact shape — the number that tempted each is
named beside it, because a lever left alone without its temptation recorded is not a decision.

| lever | shipped value | the number that tempted it | why NOT pulled |
| --- | --- | --- | --- |
| the named-pool gate | `rng.next() < 0.25` (`travel.ts`) | disposition can reach only **25.07%** of interceptions | **T-125 ruled this a DESIGN QUESTION, not a tuning knob**, and this task's charter is to measure and hand the ruling back. Raising it without touching decay buys mostly *inert* draws (71.52% of named draws are already inert) |
| `DISPOSITION_DECAY_INTERVAL_DAYS` | `3` (`content/disposition.ts`) | **96.52%** of live npc-days sit at exactly 0; median standing survives **3 days** | Same ruling, and it is the more load-bearing of the two: it decides whether the pool the gate draws from has anything in it. Changing it moves every disposition-reading system at once (grudge weighting, the talk DC, the bond hook) and owes its own capstone |
| `INTERCEPT_GRUDGE_WEIGHT` / `INTERCEPT_MIN_WEIGHT` | `1.5` / `0.1` | lift is only **2.358×** over uniform | **The weighting is not the broken part.** It delivers 2.4× wherever the pool is non-inert, and the gambler arm reaches 2.806×. Raising it would paper over the reach problem with a bigger multiplier on a mostly-empty pool |
| `DISPOSITION_DELTAS` (incl. `DARE_WIN_DISPOSITION` −2 / `DARE_LOSS_DISPOSITION` +2) | unchanged | peak \|disposition\| reaches **10**, so the ceiling is not the binding constraint | Deltas are already large enough to outrun decay when a player actually interacts — the gambler proves it. Enlarging them is the wrong fix for a reach problem, and `docs/LIARS-DICE_REDESIGN.md` §1.3 forbids retuning a spec constant to reproduce a figure |

**`git diff --stat` over `packages/engine/src` and `packages/content/src` is zero files and zero
lines. Neither constant moved.**

### 11.4 THE PARITY LEDGER RE-ASK — the **VisitHangout** row, **still UNRULED**

`docs/NPC_REDESIGN.md`'s VisitHangout row has read *"DEFERRED (owner 2026-07-30) — re-ruled
after the 0.5.2 Hangout system ships"* since the day it was vacated, and the owner ruling at
T-130 deferred it to **exactly this moment**. The system has now shipped and been capstoned, so
the question is restated here against the system as it now is.

#### What has changed under the vacated ruling

The row was ruled against a Hangout that existed at **one system of 28** and whose only NPC-side
expression was `executeSocialize`, a stub. At HEAD:

- **Fourteen ports run tables** (T-120…T-124), each with its own authored wager band, clientele,
  house rules and prose.
- **The Dare is Liar's Dice** — a real multi-turn bid/raise/challenge scene with peeking and a
  bid lattice (T-134…T-137), not one opposed d20 roll.
- **A 42-seat fixed roster** across the fourteen ports, with authored bankrolls, three
  archetypes and a zero-sum lifetime cap, plus a five-rung unlock ladder and fifteen completion
  deeds (T-144…T-148).
- **The player can SEE it**: T-132 surfaced `befriend` / `meet` / `insult` and the authored prose
  (closing F-101-4 and F-101-6), and T-133 gave Arcturus-6 its own loan band (owner ruling D7).
- **T-149 gated the rumour mill on `hasHangout`**, so the cast no longer narrates a bar at a port
  the UI tells the player has none.

#### The three defects deferred WITH the row, each re-measured at HEAD

*Arm: seeds 1..40 × 120 days × 8 policies = 1,557,696 live captain-days.*

**(1) The pure faucet — STILL OPEN, and smaller than it was.** `executeSocialize` mints
`NPC_SOCIALIZE_WIN_CREDITS` (150) on a pass and burns `NPC_SOCIALIZE_LOSS_CREDITS` (50) on a
fail, **with no counterparty on either side**, where the player's Dare is strictly zero-sum.

| | at ruling time | **at HEAD** |
| --- | --- | --- |
| the mint | +4.86cr / captain-day | **+3.44cr / captain-day** |
| Socialize captain-days | — | 121,715 (7.81% of all captain-days) |
| pass rate | — | 47.03% (57,239 / 121,715) |
| net minted | — | 5,362,050cr |
| **share of terminal NPC wealth** | `< 0.3%` (D3 bakeoff) | **0.22%** — and **0.23%** of the wealth *gained* |

**A METHOD WARNING WORTH KEEPING**, because the first measurement of this was wrong: reading a
captain's whole-day credit delta on a Socialize day gives **−899cr**, because trade, patrol,
interdiction and port income all move the same purse in the same dusk. The faucet must be
isolated off the `npc-socialize` `StatCheck`, which is what the table above does. **The D3
bakeoff's "under 0.3% of NPC wealth" verdict re-measures at 0.22% and stands.** The mint is
deliberately still open.

**(2) The off-Hangout Socialize share — STILL 37.97%, and T-149 did NOT move it.**

| | §1.5 | §10.6 BEFORE | §10.6 AFTER (T-125) | **HEAD (post-T-149)** |
| --- | --- | --- | --- | --- |
| share of Socialize captain-days at a port with no Hangout | 95.91% | 96.07% | 37.96% | **37.97%** |

**This is the finding, and it is worth being explicit about it: T-149 fixed the FICTION, not the
VERB.** Its change is a `hasBar` read that selects *prose* — "the Hangout tables" vs "the docks"
— and it sits deliberately **above and outside** the roll so the T-1201 verb⟺StatCheck invariant
holds. The mint, the DC and the rng draw are identical on both sides. So the player-facing
contradiction is gone (which is what T-149 was chartered to do) while **46,220 captain-days per
arm of the cast still "visit the Hangout" where there is no Hangout.** §5.2's obligation is
therefore *narrower* than it was, not discharged: what remains is whether the VERB should be
gated, which changes the cast's action mix and owes its own capstone.

**(3) The 150cr socialize ante — STILL OPEN, and D3 deferred it to exactly this re-ask.**
`packages/engine/src/npc.ts` gates the verb on `npc.credits < NPC_BROKE_CREDITS + 50`, an inline
`+ 50` over the 100cr floor — so there is a **50-credit dead band** in which a captain is solvent
enough to act but not to socialise.

| at dusk, live captains | share |
| --- | --- |
| in the 100–150cr dead band the `+ 50` creates | 262,047 (**16.82%**) |
| below the 100cr `NPC_BROKE_CREDITS` floor | 10,415 (0.67%) |
| **locked out of the verb entirely** | **17.49%** |

**Nearly a fifth of live captain-days cannot reach the one verb that would help them**, and
five-sixths of that is the undocumented inline `+ 50` rather than the named floor. That is the
regressive shape the original ruling flagged, now quantified.

#### Also carried into this re-ask, as the ledger requires

- **`docs/LIARS-DICE-PROGRESSION_SPEC.md` §12.10 item 7 — do the 42 roster seats get cast
  parity?** They are NPCs by content but not by `NpcState`: they hold purses
  (`state.liarsDicePurses`) and are seated by the player, but they do not fly, trade, or die.
  **Reported, not ruled.** Note the parity ruling cuts *both* ways here — giving them parity is a
  save-shape change (42 new `NpcState` rows) and owes a migration; leaving them is a recorded
  exemption of exactly the kind THE PARITY LEDGER exists to make visible.
- **`docs/HANGOUT_REDESIGN.md` §2.2 — Arcturus-6's 1,000cr loan ceiling** (*"T-150 owns the
  read"*). **Read and reported: it is doing what D7 asked and nothing pathological.** It is a
  first-pass content call against R-owned defaults, and §8's R-ownership of
  `LOAN_MIN_PRINCIPAL` / `LOAN_MAX_PRINCIPAL` is unchanged. **Not re-priced here** — a band moves
  by playtest, per D7's own words, not by fitting a sweep sample.
- **§8 — the per-port wager ceiling** (*"a first-pass content call for T-150 to read"*).
  **Read and reported.** The realised mean stake-to-band ratio and the fact that the band binds
  88.93% of stakes (§10.5) are unchanged in kind; the fourteen authored bands are not re-priced
  here for the same reason.

#### The question, restated — and left UNRULED

**Should the 30 NPCs play `VisitHangout` properly, through the player's own
`resolveVisitHangout` / Liar's Dice resolver, instead of the `executeSocialize` stub?** The
parity ruling forbids a private parallel model, so "properly" means the real resolver with an
actor parameter — which would make the verb zero-sum by construction and close defect (1) as a
side effect rather than as a patch. Against that: it is a substantial N-series build, it would
put the cast at the same 42 seats the player is climbing (a shared, capped, zero-sum resource —
see §2.6's lifetime cap), and it would move the cast's action mix enough to owe its own capstone.

**LEFT UNRULED, IN BOLD BECAUSE IT MATTERS: this is the owner's call, not T-150's.** T-150's
charter is to re-ask with current numbers and hand the ruling back. Ruling it is what un-gates
**N8** and the N-series resumption, and a build task does not get to do that. The companion
re-ask of the **Explore** row is `docs/EXPLORE_REDESIGN.md` §10.4, deferred on the same terms.

**RULED (owner, 2026-08-02): still Deferred.** All three re-measured defects above are smaller
than at the 2026-07-30 ruling but none are discharged — the faucet's wealth share, the off-Hangout
resolution share and the ante lockout are all still nonzero, and the `executeSocialize` stub is
still not the real resolver. The gap stays open. **N8 (the actor-parameterised resolver, the
42-seat roster made zero-sum by construction, its own capstone) is unblocked as future N-series
work** — this ruling does not schedule it, only clears the way for it. Recorded at its source in
`docs/NPC_REDESIGN.md`'s PARITY LEDGER `| VisitHangout |` row. This closes T-157 via THE RULING's
option (B): the coverage gate's Accept clause is corrected to match this status, not the gate's
logic — see `TASKS.md`.

### 11.5 What was NOT tuned

**No constant, DC, price, band weight, threshold, golden or fingerprint was edited to reach any
answer above.** `git diff --stat` over `packages/engine/src`, `packages/content/src` and
`packages/ui/src` shows **zero files and zero lines**.

Specifically unchanged at their shipped values: the **0.25 named-pool gate**
(`actions/travel.ts`), `DISPOSITION_DECAY_INTERVAL_DAYS` **3**, `INTERCEPT_GRUDGE_WEIGHT`
**1.5** / `INTERCEPT_FRIEND_WEIGHT` **0.15** / `INTERCEPT_MIN_WEIGHT` **0.1**,
`DARE_MIN_WAGER` **25** / `DARE_MAX_WAGER` **1,000**, `DARE_WIN_DISPOSITION` **−2** /
`DARE_LOSS_DISPOSITION` **+2**, `NPC_SOCIALIZE_WIN_CREDITS` **150** /
`NPC_SOCIALIZE_LOSS_CREDITS` **50**, `NPC_BROKE_CREDITS` **100** and its inline `+ 50`,
`GAMBLER_MAX_DARES_PER_DAY` **2**, and **every one of the fourteen authored port rows**.

**The only shipped-source diff is `packages/sim/src/index.ts`** — one term added to
`explorerPolicy`'s Explore-loop condition, and `planDare`'s roaming stake carry-forward with its
`gamblerPolicy` call site — plus the baseline-of-record re-pin (one path string) and new tests.

**`CURRENT_SAVE_VERSION` is unmoved and NO MIGRATION IS OWED.** Both fixes are sim-policy-only
and touch no save shape, so there is no round-trip test to write; this is stated explicitly
because the standing constraint requires a save-shape change to owe one, and the absence of one
here is a claim, not an omission.

**Two `campaign-degraded.test.ts` fingerprints were re-pinned** (`explorer`, `gambler`) with a
dated entry naming the cause of each, the five rows that did NOT move, and the containment
argument — never by widening an assertion. **The three known-red `it.fails` tripwires were not
touched** and are still correctly red.
