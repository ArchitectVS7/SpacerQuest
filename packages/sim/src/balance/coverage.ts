/**
 * T-157 · THE COVERAGE MATRIX — is archetype balance actually TESTED?
 *
 * `docs/TESTING-STRATEGY.md` Part G, in its own words: *"Part C's verb-parity table
 * is prose today — a human has to remember to cross-check it against which
 * archetypes the sweep actually runs. Recommend a small script/test that
 * cross-references the 8 sweep archetypes against their defining verb's parity
 * status and fails/warns if an archetype's headline verb isn't marked Shipped."*
 * This file is that cross-reference, so the question stops being re-derived by
 * reading two documents side by side and becomes something CI asserts.
 *
 * THE TWO NAMED SOURCES, and neither is restated from memory:
 *
 *   1. **Verb parity** — `docs/NPC_REDESIGN.md` · "THE PARITY LEDGER — which player
 *      verbs the cast must play". Every {@link VerbParityRow} carries the exact
 *      ledger row it was transcribed from in `ledgerRow`, the tabular mirror in
 *      `mirror` (`docs/TESTING-STRATEGY.md` Part C), and the date of the ruling it
 *      reflects in `asOf`. `../__tests__/archetype-coverage.test.ts` PARSES BOTH
 *      DOCUMENTS and fails when either drifts from this table in either direction,
 *      which is what "the parity-status source is named so it can be kept current"
 *      actually costs. **A ledger row's STATUS and its MAGNITUDES are not the same
 *      currency** (T-157 fix round 2, finding F-157-2): a row can hold a settled
 *      status while its prose still carries figures a companion document has since
 *      re-measured, which is exactly what `| VisitHangout |` does. Every measured
 *      figure quoted in {@link ACKNOWLEDGED_COVERAGE_GAPS} therefore carries a
 *      {@link QuotedFigure} pin resolved against the live document, so the evidence
 *      half is machine-checked like the status half instead of being trusted prose.
 *   2. **Archetype → defining verb** — `docs/BALANCE-POLICY.md` D.2a, "The
 *      one-prime-focus property", the committed archetype/prime-focus table
 *      (re-derived against source 2026-08-01). Every {@link ArchetypeCoverageRow}
 *      quotes its `primeFocus` VERBATIM from that table, and the suite asserts the
 *      quote still appears there.
 *
 * THE PURE HALF, and deliberately so — the same contract `./gate.ts` and
 * `./aggregate.ts` state for themselves and for the same reason: no `fs`, no
 * `process`, no clock, no rng, so CI and a local re-run cannot reach different
 * verdicts. `./sweep.ts` is the only caller that touches argv, the filesystem or
 * `process.exitCode`. (The doc-drift PARSING lives in the test, not here, for
 * exactly that reason.)
 *
 * WARN VERSUS FAIL — the documented answer to the task's "fails or warns":
 *
 *   - `covered`  — the defining verb is **Shipped**. A silent pass.
 *   - `exempt`   — the archetype has no headline verb (`greedy`, the naive control,
 *                  whose prime focus D.2a records as "none, on purpose"). Reported
 *                  on its OWN line, never conflated with a pass — the same
 *                  three-value discipline `checkExpectedEventRates` applies to
 *                  SKIPPED. Never fails.
 *   - `uncovered` **and acknowledged** — a named **WARNING**. It prints its own
 *                  `[gate] coverage …: UNCOVERED (warn)` line and is carried in
 *                  `gate-*.json`, but it does NOT set a non-zero exit.
 *                  *Why warn:* these are recorded, owner-gated deferrals whose
 *                  closure is not in any build task's gift (see
 *                  {@link ACKNOWLEDGED_COVERAGE_GAPS} — two of the three are
 *                  explicitly "Unruled: owner's call"). A gate that is permanently
 *                  red for a documented deferral trains people to ignore it, which
 *                  is the "green but hollow" failure one level up. This is the same
 *                  disposition `./gate.ts` already takes for its three
 *                  `not-observable` UGT predicates: declared honestly with an owner
 *                  named, never faked green, never allowed to fail the run.
 *   - `uncovered` **and NOT acknowledged**, or `unclassified` (the sweep ran a
 *                  policy this matrix has no row for) — **FAILS**. This is the
 *                  regression half: `trader`'s verb slipping off Shipped, a new
 *                  archetype joining the fleet, or an acknowledgement being deleted
 *                  all go red.
 *
 * THERE IS NO OPT-OUT. No `--no-coverage`, no environment escape hatch, no
 * "expected warnings" constant to edit down. The house rule stated at the top of
 * `./gate.ts` and `./rules-fingerprint.ts` applies here verbatim: the only honest
 * way to clear a warning is for the LEDGER to be ruled and this table re-transcribed
 * from it — never by re-mapping an archetype onto a verb that happens to be green.
 *
 * READERS (constraint 7): `./sweep.ts` (calls {@link checkArchetypeCoverage} from
 * `reportGate`, so every shard and every `--merge` leg evaluates it) and
 * `../__tests__/archetype-coverage.test.ts` (proves the verdicts, the warn/fail
 * split, the live wiring, the drift check against both source documents, and —
 * since fix round 2 — the figure pins against `docs/HANGOUT_REDESIGN.md` §11.4).
 */

import type { SimPolicyName } from '../index.js';

// ---------------------------------------------------------------------------
// 1 · Verb parity — transcribed from `docs/NPC_REDESIGN.md`'s PARITY LEDGER
// ---------------------------------------------------------------------------

/**
 * The five states a ledger row can be in. The names are the ones Part C's mirror
 * table prints in bold, lowercased — so the drift test can compare the two without
 * a translation layer that could itself be edited to agree.
 *
 * N13/T-156 ADDED `'excluded'`, and the distinction it draws from `'deferred'` is
 * the whole reason the ledger exists: a DEFERRED row is an open question nobody
 * has answered yet (Explore, VisitHangout — both awaiting an owner ruling); an
 * EXCLUDED row has been RULED, and the answer is "the cast will never play this".
 * Neither counts as covered, so `COVERED_STATUS` is unaffected — an excluded verb
 * is still a verb a sweep is silent about. What changes is what a reader is being
 * told to do about it: nothing, in the excluded case.
 */
export type VerbParityStatus = 'shipped' | 'partial' | 'deferred' | 'undecided' | 'excluded';

/** One player verb's NPC-parity status, with its provenance attached. A status
 *  with no cited row is a guess with better manners. */
export interface VerbParityRow {
  /** The verb as both source documents spell it. */
  verb: string;
  status: VerbParityStatus;
  /**
   * THE NAMED SOURCE (task acceptance criterion 3): the exact row this was
   * transcribed from. `null` ONLY for `Renown`, which the ledger carries as prose
   * rather than a table row — see that entry's `why`.
   */
  ledgerRow: string | null;
  /** The tabular mirror the drift test parses alongside the ledger. */
  mirror: string;
  /** Which ruling this reflects, so a stale transcription is visible as a date. */
  asOf: string;
  /** One line, quoting the source cell. */
  why: string;
}

const LEDGER = 'docs/NPC_REDESIGN.md · THE PARITY LEDGER';
const PART_C = 'docs/TESTING-STRATEGY.md Part C';

/**
 * The ten verbs `docs/TESTING-STRATEGY.md` Part C's table carries, each at the
 * status `docs/NPC_REDESIGN.md`'s PARITY LEDGER records for it.
 *
 * `Port` and `Storylet` are DELIBERATELY ABSENT rather than silently missing: both
 * are ledger rows (Port "**N12**", Storylet "**EXCLUDED (owner 2026-07-30)**"), but
 * Part C's table does not carry them and no archetype's prime focus is either, so
 * they have no bearing on whether a sweep archetype is covered. Adding them would
 * make the Part C drift check fail against a table that never claimed to list them.
 *
 * NOTHING HERE MAY BE EDITED TO CLEAR A WARNING. The only legitimate reason to
 * change a `status` below is that the ledger row itself changed — and the suite
 * that reads both documents is what makes that the only reason that works.
 */
export const VERB_PARITY: readonly VerbParityRow[] = [
  {
    verb: 'Trade',
    status: 'shipped',
    ledgerRow: `${LEDGER} · \`| Trade |\``,
    mirror: PART_C,
    asOf: 'shipped at N10 (2026-07-29)',
    why: 'Ledger: "shipped (N10)" — the cast draws the local board through the player\'s own `generateManifestBoard` and chooses off it by archetype.',
  },
  {
    verb: 'Travel',
    status: 'shipped',
    ledgerRow: `${LEDGER} · \`| Travel |\``,
    mirror: PART_C,
    asOf: 'shipped at N3 (2026-07-29)',
    why: 'Ledger: "shipped (N3)" — real fuel, real routes, real encounters, real permanent death.',
  },
  {
    verb: 'Shipyard',
    status: 'shipped',
    ledgerRow: `${LEDGER} · \`| Shipyard |\``,
    mirror: PART_C,
    asOf: 'shipped at N2, renown gate at N11 (2026-07-30)',
    why: 'Ledger: "shipped (N2) · gate shipped (N11)" — full price/gate parity via `ShipyardActor`. OI-9 (no die spent) is an open watch item, not a parity gap.',
  },
  {
    verb: 'Wait',
    status: 'shipped',
    ledgerRow: `${LEDGER} · \`| Wait |\``,
    mirror: PART_C,
    asOf: 'shipped',
    why: 'Ledger: "shipped" — Wait is Idle, and the cast idles on the same terms.',
  },
  {
    verb: 'Renown',
    status: 'shipped',
    // The one row with no table entry, and the exception is recorded rather than
    // papered over: N11 REMOVED the row. The drift test asserts the prose anchor
    // below instead of a `| Renown |` cell, so a parse failure sends a human back
    // to the ledger rather than quietly passing.
    ledgerRow: null,
    mirror: PART_C,
    asOf: 'removed as a gap by N11 (2026-07-30)',
    why: 'Ledger prose: "Renown is the verb-less twelfth row, and N11 removed it (2026-07-30)" — every captain carries a real `DeedRegistry` fed through the player\'s own `accrueDeeds` / `rankForDeedCount`.',
  },
  {
    verb: 'Combat',
    status: 'partial',
    ledgerRow: `${LEDGER} · \`| Combat |\``,
    mirror: PART_C,
    asOf: 'forced branch shipped at N3 (2026-07-29), die gap closed at N13 / T-156 (2026-08-02); chosen branch still owed',
    why: 'Ledger: "shipped (N3) · die gap CLOSED at N13 (T-156) · **`executeCombat` still owed**" — the FORCED interdiction branch is on the shared rules and, since N13, its stance checks spend from the captain\'s virtual hand (`npcHand.ts`) instead of drawing a bare d20; the branch a captain CHOOSES is still an abstract GUNS check with no interceptor, no damage and no ship loss (six fighters, 6.4 interdictions each, 0 deaths).',
  },
  {
    verb: 'Explore',
    status: 'deferred',
    ledgerRow: `${LEDGER} · \`| Explore |\``,
    mirror: PART_C,
    asOf: 'exclusion VACATED 2026-07-30; RE-ASKED at T-150 (2026-08-01) and still unruled as of 2026-08-02',
    why: 'Ledger: "RE-ASKED at T-150 (2026-08-01) — still DEFERRED pending owner ruling." The 0.5.2 Explore has shipped and the question is restated against it in `docs/EXPLORE_REDESIGN.md` §10.4. Unruled: owner\'s call.',
  },
  {
    verb: 'VisitHangout',
    status: 'deferred',
    ledgerRow: `${LEDGER} · \`| VisitHangout |\``,
    mirror: PART_C,
    asOf: 'exclusion VACATED 2026-07-30; RE-ASKED at T-150 (2026-08-01) and still unruled as of 2026-08-02',
    // THE STATUS IS THE LEDGER'S; THE MAGNITUDES ARE §11.4's. The ledger row's own
    // prose still carries the figures measured at RULING TIME and calls them "all
    // still true" — which is true of the defects being OPEN and stale about how big
    // two of them are. Quoting it verbatim propagated the stale halves (F-157-2), so
    // this row now cites the re-ask document the ledger itself points at.
    why: 'Ledger: "RE-ASKED at T-150 (2026-08-01) — still DEFERRED pending owner ruling." The cast plays a STUB (`executeSocialize`), and all three defects found while ruling it are still OPEN — but two are smaller than the ledger prose records, and `docs/HANGOUT_REDESIGN.md` §11.4 is where they were re-measured at HEAD: the faucet is +3.44cr / captain-day (ruling time: +4.86cr/captain-day), 37.97% of Socialize captain-days resolve where there is no Hangout (ruling time: 95.91%), and the ante locks 17.49% of live captain-days out of the verb.',
  },
  {
    verb: 'Crew',
    status: 'excluded',
    ledgerRow: `${LEDGER} · \`| Crew |\``,
    mirror: PART_C,
    asOf: 'EXCLUDED by owner ruling 2026-07-31, shipped at N13 / T-156 (2026-08-02)',
    why: 'Ledger: "**EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)**" — design (b) keeps the coarse one-verb day, so crew hiring has no NPC decision to attach to. A ruled exclusion, not a gap.',
  },
  {
    verb: 'Reroll',
    status: 'excluded',
    ledgerRow: `${LEDGER} · \`| Reroll |\``,
    mirror: PART_C,
    asOf: 'EXCLUDED by owner ruling 2026-07-31, shipped at N13 / T-156 (2026-08-02)',
    why: 'Ledger: "**EXCLUDED (owner ruling 2026-07-31, shipped at N13 / T-156)**" — and this one is STRUCTURAL rather than merely ruled: `npcHand.ts` deals every captain\'s virtual hand with `rerolls: 0`, so the exclusion lives in the data and not in a branch that could be flipped.',
  },
];

/** Lookup by verb. Built once; the table is a constant. */
const PARITY_BY_VERB = new Map(VERB_PARITY.map((row) => [row.verb, row]));

/** The status a defining verb must hold for its archetype to count as covered.
 *  Part C's own words: treat sweep results "as authoritative for the verbs marked
 *  Shipped above, and as silent (not 'passing', *silent*) for everything else".
 *  N13/T-156: `'excluded'` deliberately does NOT join this — a ruled exclusion
 *  settles the QUESTION, it does not manufacture coverage. */
const COVERED_STATUS: VerbParityStatus = 'shipped';

// ---------------------------------------------------------------------------
// 2 · Archetype → defining verb, from `docs/BALANCE-POLICY.md` D.2a
// ---------------------------------------------------------------------------

/** One sweep archetype's headline verb, with the prime focus it was read off. */
export interface ArchetypeCoverageRow {
  /** VERBATIM from `docs/BALANCE-POLICY.md` D.2a's prime-focus column. The suite
   *  asserts this substring is still there, so the mapping cannot drift from its
   *  own named source either. */
  primeFocus: string;
  /** The {@link VERB_PARITY} verb that prime focus IS. `null` means exempt. */
  definingVerb: string | null;
  /** Where the prime focus is recorded, and where the policy lives. */
  anchor: string;
  /** Why that prime focus maps to that ledger verb — stated, because a mapping
   *  nobody can argue with concretely is a mapping nobody can catch being wrong. */
  why: string;
  /** Non-null exactly when `definingVerb` is null: the recorded reason. */
  exempt: string | null;
}

const D2A = 'docs/BALANCE-POLICY.md D.2a';

/**
 * Every `SimPolicyName`, mapped.
 *
 * `satisfies Record<SimPolicyName, …>` is load-bearing: a name added to
 * `SimPolicyName` and forgotten here is a COMPILE error, which is the same device
 * `../index.ts`'s `POLICY_NAMES` uses and the reason no runtime totality list has
 * to be maintained beside this one.
 */
export const ARCHETYPE_COVERAGE = {
  trader: {
    primeFocus: 'richest net contract run',
    definingVerb: 'Trade',
    anchor: `${D2A} · packages/sim/src/index.ts:2515`,
    why: 'A contract run IS the Trade verb — sign off the shared board, haul, deliver.',
    exempt: null,
  },
  'trader-degraded': {
    // NOT a D.2a row: D.2a's table lists the seven ARCHETYPES, and this is the R1
    // measurement instrument run beside the `trader` row ("a human-plausible
    // pilot, not an eighth archetype", `docs/BALANCE-POLICY.md` §D.2 note at the
    // trader-degraded matrix line). It plays the trader's verb with degraded
    // proficiency, so it inherits the trader's defining verb by construction.
    primeFocus: 'richest net contract run, played through a degraded pilot (R1)',
    definingVerb: 'Trade',
    anchor:
      'packages/sim/src/index.ts `degradedTraderPolicy` · docs/BALANCE-POLICY.md §D.2 (the R1 instrument note)',
    why: "An instrument, not an archetype: it mirrors `trader` under `PilotDegradationProfile`, so its headline verb is the trader's.",
    exempt: null,
  },
  smuggler: {
    primeFocus: 'contraband',
    definingVerb: 'Trade',
    anchor: `${D2A} · packages/sim/src/index.ts:3010`,
    why: 'THE MAPPING, STATED RATHER THAN ASSUMED: the parity ledger has no separate Smuggle verb. A contraband run is a contract signed off the same shared board and flown on the same Travel rules; the illegality is cargo content and a patrol scan, not a different verb.',
    exempt: null,
  },
  fighter: {
    primeFocus: 'fight the ones it can drop',
    definingVerb: 'Combat',
    anchor: `${D2A} · packages/sim/src/index.ts:4100`,
    why: "Choosing a target it can drop is the CHOSEN Combat branch (`executeCombat`) — precisely the half of the ledger's Combat row that is still owed.",
    exempt: null,
  },
  explorer: {
    primeFocus: 'Explore sweeps',
    definingVerb: 'Explore',
    anchor: `${D2A} · packages/sim/src/index.ts:4396`,
    why: 'Named for the verb outright.',
    exempt: null,
  },
  gambler: {
    primeFocus: 'the tables',
    definingVerb: 'VisitHangout',
    anchor: `${D2A} · packages/sim/src/index.ts:3767`,
    why: 'THE MAPPING THAT PRODUCES THE THIRD WARNING, and it is read off D.2a rather than chosen: the gambler\'s prime focus is "the tables", which are reached by VisitHangout — D.2a even records its anti-idle move as an explicit *travel-toward-Hangout* (`index.ts:3899`). Its secondary spread is "a full trader working day planned FIRST", which is Trade — but D.2a\'s whole point is that the SECONDARY spread is not the archetype\'s name.',
    exempt: null,
  },
  veteran: {
    primeFocus: 'deed-registry steering',
    definingVerb: 'Renown',
    anchor: `${D2A} · packages/sim/src/index.ts:4817`,
    why: "Steering by the deed registry is the Renown row — deeds accrued through the player's own `accrueDeeds`, spent against rank-gated fits.",
    exempt: null,
  },
  greedy: {
    primeFocus: 'naive control',
    definingVerb: null,
    anchor: `${D2A} · packages/sim/src/index.ts:1579`,
    why: 'D.2a\'s secondary-spread cell reads "none, on purpose". A control with no headline verb cannot have an uncovered one.',
    exempt:
      'The naive CONTROL. D.2a: "none, on purpose — it accumulates nothing, and it is excluded from the gate for exactly that reason." It exists so the memo can say what playing badly costs, and it clears Tour One at 0.00.',
  },
  idle: {
    primeFocus: 'takes no action at all',
    definingVerb: null,
    anchor: 'packages/sim/src/index.ts `idlePolicy` · balance/gate.ts GATE_COMPETENT_POLICIES',
    why: 'A protocol/robustness instrument, not a balance archetype; it is not in `DEFAULT_POLICIES` and not a sweep archetype.',
    exempt:
      'Protocol/robustness instrument. `gate.ts` already records it out of scope: "idle / random — protocol/robustness instruments; `idle` takes no income action by construction."',
  },
  random: {
    primeFocus: 'uniform random legal action',
    definingVerb: null,
    anchor: 'packages/sim/src/index.ts `randomPolicy` · balance/gate.ts GATE_COMPETENT_POLICIES',
    why: 'A protocol/robustness instrument, not a balance archetype; it is not in `DEFAULT_POLICIES` and not a sweep archetype.',
    exempt:
      'Protocol/robustness instrument, deliberately out of `DEFAULT_POLICIES` because it "would drag every fleet distribution toward noise" (`balance/sweep.ts`).',
  },
} satisfies Record<SimPolicyName, ArchetypeCoverageRow>;

/**
 * The 8 policies the sweep is GRADED on, per `docs/TESTING-STRATEGY.md` Part G:
 * *"The sweep runs 8 scripted policies (trader, fighter, explorer, veteran,
 * smuggler, gambler, greedy, trader-degraded)."* That is `DEFAULT_POLICIES` (7)
 * plus the `trader-degraded` instrument, which the committed capstones run beside
 * the trader row.
 */
export const SWEEP_ARCHETYPES: readonly SimPolicyName[] = [
  'trader',
  'trader-degraded',
  'fighter',
  'explorer',
  'veteran',
  'smuggler',
  'gambler',
  'greedy',
];

// ---------------------------------------------------------------------------
// 3 · The acknowledged gaps — every warning has an owner, or it fails
// ---------------------------------------------------------------------------

/**
 * ONE MEASURED FIGURE an acknowledgement quotes, PINNED to the document row it was
 * read off (T-157 fix round 2, finding **F-157-2**).
 *
 * The status half of this file's transcription was machine-checked from the first
 * pass; the EVIDENCE half was prose, and prose went stale exactly the way the task
 * exists to stop: the gambler acknowledgement quoted the PARITY LEDGER's ruling-time
 * magnitudes as current, when the re-ask document the ledger itself points at had
 * already re-measured two of them. A quoted number with no parse behind it is a
 * transcription nobody can catch being wrong — the same defect class, one field over.
 *
 * `../__tests__/archetype-coverage.test.ts` resolves each of these against the live
 * document and fails if the row's value moved, AND asserts the value still appears in
 * the `evidence` prose, so the pin and the sentence cannot drift apart either.
 */
export interface QuotedFigure {
  /** Repo-relative path of the document the figure lives in. */
  doc: string;
  /** The exact heading line the table sits under — the parse's anchor. */
  section: string;
  /** The table row's FIRST cell, compared after trimming and stripping `**`. */
  row: string;
  /** What that row's LAST column holds, `**` stripped. The value at HEAD, because
   *  every table pinned here puts its most recent re-measurement in the last column. */
  value: string;
}

/**
 * A gap that is a RECORDED, owner-gated deferral rather than a surprise.
 *
 * An entry with no owner is an omission with better manners — the same rule
 * `./gate.ts` applies to its `not-observable` dispositions, which is why `owner`
 * and `evidence` are required and the suite asserts both name a `docs/` section.
 */
export interface AcknowledgedCoverageGap {
  policy: SimPolicyName;
  verb: string;
  /** WHO can close it. For all three of today's entries that is the owner, not a
   *  build task — which is exactly why these warn rather than fail. */
  owner: string;
  /** The measured, cited reason the row is where it is. */
  evidence: string;
  /** Every measured figure {@link evidence} quotes, pinned to its source row.
   *  EMPTY IS A CLAIM, NOT AN OMISSION: it asserts this acknowledgement quotes no
   *  magnitude that a companion document could re-measure behind it. */
  figures: readonly QuotedFigure[];
  since: string;
}

/**
 * THE THREE, as of 2026-08-02.
 *
 * The task's Accept clause named two (`fighter`, `explorer`). The check found a
 * THIRD by doing what it was built to do — reading the two source documents
 * instead of the summary sentence. See `TASKS.md` finding **F-157-1**: closing
 * `gambler` is an owner ruling on the ledger's VisitHangout row, not a re-mapping
 * of the archetype onto a verb that happens to be green.
 *
 * EVERY MAGNITUDE BELOW IS PINNED OR DECLARED ABSENT. `figures` is required, and an
 * empty list is a claim the suite holds this entry to, not a field left blank — see
 * {@link QuotedFigure} and `TASKS.md` finding **F-157-2** for why an unpinned quoted
 * number is the same defect class as an untranscribed status.
 */
export const ACKNOWLEDGED_COVERAGE_GAPS: readonly AcknowledgedCoverageGap[] = [
  {
    policy: 'fighter',
    verb: 'Combat',
    owner:
      'OWNER SEQUENCING CALL, scheduled for a recorded ruling at T-158 (the pre-UAT checkpoint). `docs/0.5.2-REVIEW.md` states it directly: `executeCombat`\'s missing shared rules is "Still a real PARITY LEDGER gap; whether it lands as an N3 follow-up or at N13 is an owner sequencing call". `docs/TESTING-STRATEGY.md` Part G item 4 asks for the call to be made "even if the call is \'not fixing the model this pass\'".',
    evidence:
      'docs/NPC_REDESIGN.md · PARITY LEDGER `| Combat |`: the chosen branch is "still the pre-N3 abstract GUNS check + flat `150 × tier`, with no interceptor, no damage and no ship loss — so the six fighters take 6.4 interdictions each and **0 deaths**". A sweep therefore cannot exercise chosen-combat risk/reward at all.',
    // Empty by CHECKED CLAIM, not by omission: the N4 figures above live in the
    // ledger row the status drift test already parses, and no companion document
    // re-measures them (`grep -rn "6.4 interdictions" docs/` finds only restatements
    // of that same row). Unlike VisitHangout, there is no re-ask table behind them.
    figures: [],
    since: 'GAP FOUND AT N4 (2026-07-29); unchanged at 2026-08-02',
  },
  {
    policy: 'explorer',
    verb: 'Explore',
    owner:
      'OWNER RULING, unruled. `docs/NPC_REDESIGN.md`: "Unruled: owner\'s call, not T-150\'s." The re-ask, with fresh per-attempt economics against the shipped 0.5.2 system, is `docs/EXPLORE_REDESIGN.md` §10.4.',
    evidence:
      'docs/NPC_REDESIGN.md · PARITY LEDGER `| Explore |`: "never for the cast … **RE-ASKED at T-150 (2026-08-01) — still DEFERRED pending owner ruling.**" Part C: "Zero fleet coverage of these systems today."',
    // Empty by CHECKED CLAIM: this acknowledgement quotes STATUS only. The ledger's
    // own Explore magnitude (the 53.8cr/attempt sink) is deliberately not quoted
    // here — it is a fact about the PRE-0.5.2 verb and would be exactly the kind of
    // stale number F-157-2 is about.
    figures: [],
    since: 'EXCLUDED 2026-07-30, VACATED the same day, re-asked 2026-08-01',
  },
  {
    policy: 'gambler',
    verb: 'VisitHangout',
    owner:
      "OWNER RULING, unruled. `docs/NPC_REDESIGN.md`: \"Unruled: owner's call, not T-150's.\" The re-ask, with all three deferred defects re-measured against the shipped 14-port Liar's Dice system, is `docs/HANGOUT_REDESIGN.md` §11.4.",
    // STATUS FROM THE LEDGER, MAGNITUDES FROM THE RE-ASK — see F-157-2. The first
    // pass quoted the ledger row's ruling-time figures verbatim (+4.86cr/captain-day,
    // 95.91%) because the row calls its three defects "all still true"; that phrase
    // is true of them being OPEN and stale about how big two of them are, and
    // `docs/HANGOUT_REDESIGN.md` §11.4 — the document the ledger row itself points at
    // — had already re-measured them at HEAD before this task ran. All three
    // magnitudes below are now PINNED to that section by `figures`.
    evidence:
      "docs/NPC_REDESIGN.md · PARITY LEDGER `| VisitHangout |`: the cast plays a STUB (`executeSocialize`) and all three deferred defects are still open — re-measured at HEAD in docs/HANGOUT_REDESIGN.md §11.4: the counterparty-less faucet mints +3.44cr / captain-day against the player's zero-sum dare (ruling time: +4.86cr/captain-day; T-149 fixed the FICTION, not the verb), 37.97% of cast Socialize captain-days still resolve where there is no Hangout (ruling time: 95.91%), and the 150cr ante leaves 17.49% of live captain-days locked out of the one verb that would help them. Part C files it in the same **Deferred** row as Explore.",
    figures: [
      {
        doc: 'HANGOUT_REDESIGN.md',
        section: '### 11.4 THE PARITY LEDGER RE-ASK',
        row: 'the mint',
        value: '+3.44cr / captain-day',
      },
      {
        doc: 'HANGOUT_REDESIGN.md',
        section: '### 11.4 THE PARITY LEDGER RE-ASK',
        row: 'share of Socialize captain-days at a port with no Hangout',
        value: '37.97%',
      },
      {
        doc: 'HANGOUT_REDESIGN.md',
        section: '### 11.4 THE PARITY LEDGER RE-ASK',
        row: 'locked out of the verb entirely',
        value: '17.49%',
      },
    ],
    since: 'EXCLUDED 2026-07-30, VACATED the same day, re-asked 2026-08-01',
  },
];

const ACKNOWLEDGED_KEYS = new Set(
  ACKNOWLEDGED_COVERAGE_GAPS.map((gap) => `${gap.policy}::${gap.verb}`),
);

// ---------------------------------------------------------------------------
// 4 · The check
// ---------------------------------------------------------------------------

export interface ArchetypeCoverageResult {
  policy: string;
  /** Null when the archetype is exempt, or when it has no matrix row at all. */
  definingVerb: string | null;
  /** Null when exempt, or when the verb has no {@link VERB_PARITY} row. */
  status: VerbParityStatus | null;
  verdict: 'covered' | 'uncovered' | 'exempt' | 'unclassified';
  /** True only for an `uncovered` verdict carried in {@link ACKNOWLEDGED_COVERAGE_GAPS}.
   *  An unacknowledged `uncovered` FAILS. */
  acknowledged: boolean;
  /** Names the verb, the status and the ledger row, so a gate line is actionable
   *  without a second hop into this file. */
  detail: string;
}

function hasRow(policy: string): policy is keyof typeof ARCHETYPE_COVERAGE {
  return policy in ARCHETYPE_COVERAGE;
}

/**
 * Cross-reference each policy against its defining verb's parity status.
 *
 * Deterministic in the input order's sort, not in argv order, so two shards that
 * ran the same fleet print the same table.
 */
export function checkArchetypeCoverage(policies: readonly string[]): ArchetypeCoverageResult[] {
  const unique = [...new Set(policies)].sort();
  return unique.map((policy): ArchetypeCoverageResult => {
    if (!hasRow(policy)) {
      return {
        policy,
        definingVerb: null,
        status: null,
        verdict: 'unclassified',
        acknowledged: false,
        detail:
          `no ARCHETYPE_COVERAGE row (balance/coverage.ts). Add one citing ` +
          `${D2A}'s prime focus before the sweep grades this policy.`,
      };
    }
    const row: ArchetypeCoverageRow = ARCHETYPE_COVERAGE[policy];
    if (row.definingVerb === null) {
      return {
        policy,
        definingVerb: null,
        status: null,
        verdict: 'exempt',
        acknowledged: false,
        detail: `no headline verb — ${row.exempt ?? 'no reason recorded'}`,
      };
    }
    const parity = PARITY_BY_VERB.get(row.definingVerb);
    if (parity === undefined) {
      return {
        policy,
        definingVerb: row.definingVerb,
        status: null,
        verdict: 'unclassified',
        acknowledged: false,
        detail:
          `defining verb ${row.definingVerb} has no VERB_PARITY row — transcribe it ` +
          `from ${LEDGER}.`,
      };
    }
    if (parity.status === COVERED_STATUS) {
      return {
        policy,
        definingVerb: row.definingVerb,
        status: parity.status,
        verdict: 'covered',
        acknowledged: false,
        detail:
          `${row.definingVerb} is ${parity.status} (${parity.ledgerRow ?? `${LEDGER} · prose`}) — ` +
          `prime focus "${row.primeFocus}"`,
      };
    }
    return {
      policy,
      definingVerb: row.definingVerb,
      status: parity.status,
      verdict: 'uncovered',
      acknowledged: ACKNOWLEDGED_KEYS.has(`${policy}::${row.definingVerb}`),
      detail:
        `${row.definingVerb} is ${parity.status}, not ${COVERED_STATUS} ` +
        `(${parity.ledgerRow ?? `${LEDGER} · prose`}) — prime focus "${row.primeFocus}"; ` +
        `sweep results for this archetype are SILENT, not passing`,
    };
  });
}

/** The results that must set a non-zero exit: an unclassified policy, or an
 *  uncovered one with no recorded, owner-named acknowledgement. */
export function coverageFailures(
  results: readonly ArchetypeCoverageResult[],
): ArchetypeCoverageResult[] {
  return results.filter(
    (result) =>
      result.verdict === 'unclassified' || (result.verdict === 'uncovered' && !result.acknowledged),
  );
}

/** The results that print a named warning and do NOT fail the run. */
export function coverageWarnings(
  results: readonly ArchetypeCoverageResult[],
): ArchetypeCoverageResult[] {
  return results.filter((result) => result.verdict === 'uncovered' && result.acknowledged);
}

/** One grep-able line per archetype, for `formatGateReport`. The verdict word is
 *  upper-cased and the warn/fail split is spelled out in the line itself, because
 *  a CI log reader has no access to this file's header. */
export function formatCoverageLines(results: readonly ArchetypeCoverageResult[]): string[] {
  return results.map((result) => {
    const verdict =
      result.verdict === 'uncovered'
        ? result.acknowledged
          ? 'UNCOVERED (warn)'
          : 'UNCOVERED (fail — no acknowledged gap)'
        : result.verdict.toUpperCase();
    return `[gate] coverage ${result.policy}: ${verdict} — ${result.detail}`;
  });
}
