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

`StarSystem.hasHangout` (`packages/content/src/systems.ts:37`) is set on **Sun-3 only**
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
proof for Sun-3 is trivial and mechanical; and the R-owned balance constants keep their
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

**(6) Exactly one new engine event value: `'venue-not-offered'`.** See §2.6.

### 2.3 Sun-3 is `DEFAULT_PORT_HANGOUT` plus prose — the behaviour-preserving proof

T-120's acceptance is that every pre-existing hangout test passes unchanged and the goldens
are byte-identical. The shape above makes that a two-line argument rather than a diff review:
Sun-3's row sets `venues` to all seven and leaves `wager` and `venueParams` **omitted**, so
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
| 34 | The global loan band, rate, term and `LENDER_ID` | `content/lending.ts:56–92` | | ● |
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
> engine.

The mechanical form of the constraint: after T-120, `packages/content/src/portHangouts.ts`
contains no `if (`, and `packages/engine/src/actions/hangout.ts` contains no port id — the
`grep` for `Sun-3` / `systemId === 1` that T-120's acceptance names.

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

1. **`planDare` (`sim/index.ts:3401`) becomes legal on most days instead of only at Sun-3.**
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
| `packages/sim/src/__tests__/support/deed-hunter.ts:110`, `:298`, `:324`, `:349` | **comments false; routing degrades** | `HANGOUT_SYSTEM = 1` and "Sun-3 is the ONLY `hasHangout` system" are load-bearing *prose* for the veteran deed hunter's errand. The logic still runs (Sun-3 keeps its bar) but the errand becomes redundant. Fix the comments; consider routing to the nearest Hangout instead of the constant. |
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
(Sun-3, Aldebaran-1, Altair-3, Arcturus-6, Deneb-4, Denebola-5, Fomalhaut-2, Mira-9, Pollux-7,
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
| 1 | Sun-3 | the home-port hall | **must reproduce today's behaviour exactly** — the default row plus prose (§2.3) |
| 2 | Aldebaran-1 | the exchange-floor bar | trader clientele; modest band; everything offered |
| 3 | Altair-3 | the lane-side stopover | **numerically the mean; distinct on clientele alone** — one port must be the mean *(corrected in place at T-122; see the note below the table)* |
| 8 | Mira-9 | the fuellers' canteen | the cheap-fuel working port; low `min`, low ceiling, warm deltas |
| 10 | Procyon-5 | the freight-guild room | explorer/trader clientele; easy `befriend`, dear `insult` |

> **T-122's in-place correction to the Altair-3 row.** As originally written, §6.3 asked for a
> port that is "fully generic, deliberately" while §6.4 requires cardinality 14 over the axis
> vectors **and** fixes Sun-3's vector to the default row. Both cannot hold literally: a fully
> generic port *is* Sun-3's vector. §6.4's own closing sentence settles it — "Sun-3 is the one
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
| 4 | Arcturus-6 | the garrison mess | the strict-governance port: high DCs, punitive insult, **no desk** |
| 5 | Deneb-4 | the partisan hall | `regulars` list, wide band, asymmetric dare consequence |
| 11 | Regulus-6 | the high table | the high-roller room: `wager.min` prices out a Tour One captain (see **F-101-1**) |
| 12 | Rigel-8 | the underbelly | low `min`, high ceiling, smuggler/gambler clientele |
| 14 | Vega-6 | the outfitters' long room | veteran clientele, hard to charm, long memories (large deltas both ways) |

**T-124 — the last four, including the comic register:**

| id | System | Concept label | Axis notes |
| --- | --- | --- | --- |
| 6 | Denebola-5 | — | one of the four; register spread is T-124's call |
| 7 | Fomalhaut-2 | — | |
| 9 | Pollux-7 | — | |
| 13 | Spica-3 | — | at least one of these four carries `tone: 'comic'`, period-voiced and dry (read the flaw-override and wire lines for the register before writing) |

### 6.4 The distinctness rule the passes are graded on

**No two ports may be identical on the axis vector** (T-122's acceptance). This is checkable
as a **set-cardinality assertion over the serialized parameter tuples** — `venues` (sorted),
`wager`, `venueParams`, `clientele` — not as prose review. Two ports may share a `tone`; they
may not share a mechanical fingerprint. The check T-124 runs at the close: the set of
serialized tuples has cardinality **14**.

Sun-3 is the one port whose tuple is fixed by §2.3, which means the other thirteen are the
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

`meet`, `befriend` and `insult` are reachable from the engine, the schema and the UGT protocol
but **not from the cockpit** (§1.4). A port that differentiates itself on those three venues'
DCs and deltas differentiates itself for the simulation and not for the player.

**Recommended resolution:** none in this track — this is a surfacing question, and the
standing constraint requires surfacing to be a *named* task rather than a side effect. Flagged
for T-130. It does bear on §6: content passes should not concentrate a port's whole identity
in `befriend` / `insult` parameters while this is true.

### Finding F-101-5 · The pane's NPC list does not filter the dead

`hangoutNpcs` (`packages/ui/src/format.ts:277–281`) filters only on `currentSystemId`, while
the engine's opponent resolution also requires `!n.dead` (`hangout.ts:176–178`). So the pane
can offer a dead captain as a Dare opponent, and the engine correctly answers
`HangoutEvent{failReason:'no-opponent'}` — no die spent, no crash, but a dead end in the UI.
Harmless at one port; visible at fourteen. **Recommended resolution:** a one-line filter,
folded into T-121's UI touch (it is the task that makes the pane reachable at scale), or
reported to T-130 if T-121 chooses to keep its diff to the reach change alone.

### Finding F-101-6 · `prose` has no reader — every authored house is invisible

**Found by T-122, reported and not fixed.** `HangoutProse.houseName`, `.roomLine` and
`.flavour` are authored by T-120 (Sun-3), by T-121 (thirteen baseline house names) and now by
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
(Sun-3 1,000, Aldebaran-1 750, Altair-3 1,000, Procyon-5 500) and at the nine unauthored ones.

This is a *correct* consequence of a dive bar and **is not a reason to inflate the band**;
inflating it would be tuning a number to reach an answer. It is recorded because per-port
bands make deed reachability port-dependent for the first time, and T-125's coverage
measurement should read a Mira-9 zero as expected rather than as a regression. T-123's bands
(Regulus-6's high table, Rigel-8's underbelly) will widen the same question in the other
direction.

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
  keeps them global; it does not re-price them.
- **The Dare's own balance.** `DARE_MIN_WAGER` / `DARE_MAX_WAGER` and the four disposition
  constants keep their T-1603b values as `DEFAULT_PORT_HANGOUT`. Per-port bands are content
  authoring, not a re-tune of the default.
- **Surfacing `meet` / `befriend` / `insult`** (F-101-4).
- **The manifest version bump to 0.5.2.** `docs/VERSIONING.md` is explicit that it is its own
  commit immediately before tagging. T-130 asks the owner.
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
| **T-120** | §2 (all), §3 (all), §2.6 | `portHangouts.ts` + `hangoutRules.ts` exist; Sun-3's row is `DEFAULT_PORT_HANGOUT` + prose and reproduces today's behaviour with every hangout test unchanged and **all four day-loop golden hashes byte-identical** (stated in the commit body); the resolver reads `venueParamsFor` / `wagerBandFor` and contains no port id; `'venue-not-offered'` lands in `types.ts` + `schema.ts` + a unit test + the `protocol.ts` mirror; `grep 'if ('` over `portHangouts.ts` finds nothing that decides an outcome; `balance-rig.test.ts` still classifies every engine source |
| **T-121** | §4 (all), §2.2 ruling 3 | ids 1–14 carry `hasHangout: true` and a placeholder row, asserted by an enumerating test; **the `hasHangout` ↔ `PORT_HANGOUTS` two-way equality test**; a `VisitHangout` driven successfully at a non-Sun-3 port; the six test/comment retargets in §4.2's table; replay goldens regenerated with the event-count diff and **both `rngState`s verified unchanged**; no rim or gated system flagged (§4.5); **no `npc.ts` edit** (§5.2's obligation) |
| **T-122** | §6.3 pass 1, §6.4 | five everyday ports authored; distinctness asserted as a cardinality check over the axis tuples; Sun-3's mechanical tuple still the default row; no placeholder strings; zero lines under `packages/engine/src` |
| **T-123** | §6.3 pass 2, §6.2 | five ports authored; at least one **measurably hostile** and one **measurably exotic** against §6.1's axes; the governance axis exercised without touching `isRim` / `allowsContraband`; **F-101-1's realized-vs-declared stake measurement reported** for the high-band port; any house rule wanted reported in F-101-3's format; zero engine changes |
| **T-124** | §6.3 pass 3, §6.4 | the last four, including `tone: 'comic'`; the full 14 enumerated and distinct (cardinality 14); tonal spread asserted against the axes; zero engine changes |
| **T-125** | §4.2, §5.1's and §5.2's obligations, §10 | `npm run format`, THEN the milestone's single capstone; 8,000 merged rows from 1-indexed shards through `--merge`; fixture re-extracted with `spreads harvested`; reports hangout usage per run, the before/after disposition spread, **the dealer-purse distribution** (§5.1), **the re-measured off-Hangout Socialize percentage** (§5.2), and a measured statement about disposition's effect on `chooseWeighted`'s interceptor draw; appends to §10; **tunes nothing to reach a result**, and escalates rather than adjusts if `balance-targets.test.ts:180` went red |

---

## §10 · Appendix: T-125 re-measurement

*(Reserved. T-125 appends the measured reach result — hangout usage per run, the before/after
disposition spread across the cast, the dealer-purse distribution, the re-measured
off-Hangout `Socialize` percentage, and the statement about disposition's effect on
interceptor selection — with provenance, here.)*
