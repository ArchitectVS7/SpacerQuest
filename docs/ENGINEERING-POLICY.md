# Engineering Policy — the standing constraints

**Status:** Standing policy for the Rimward codebase. Companion to
`docs/PRD-REIMAGINED.md` (what the game is), `docs/TECH-STACK.md` (what it is
built on) and `docs/BALANCE-POLICY.md` (where its numbers come from).

These rules were the standing constraints of the master task list that drove the
Rimward build — enforced on every task, by review, before anything was allowed to
be called done. That task list has been retired: it was a work queue, and the
queue is empty. The rules outlived it, and several documents in this folder cite
them by number, which is why they live here now in a document that is about the
policy rather than about the work.

**Nothing here is historical.** Every rule below still governs a change made to
this repository today.

---

## 1. The standing constraints

Numbered, and the numbering is load-bearing — other documents cite these by
number (`docs/BALANCE-POLICY.md` Part B is constraint 5 in full).

1. **The engine stays pure.** No DOM, no I/O, no `Math.random` and no `Date` —
   all randomness flows through `SeededRng`. This is what makes the same seed and
   the same actions produce the same galaxy, and therefore what makes overnight
   balance simulation and reproducible bug reports possible.
2. **Every feature is reachable headlessly.** The UI is a client of the rules,
   never the owner of one. If the engine cannot do it without a browser, it is
   not done.
3. **All state changes emit typed `GameEvent`s, and state survives a JSON round
   trip.** Any change that adds a `GameState` field ships a save migration and a
   round-trip test *in the same commit*.
4. **Content is data.** It lives in `packages/content` and it is not logic.
5. **The PRD wins over foundation numbers.** `docs/PRD-REIMAGINED.md` is the
   design authority; the 1991 rules at git ref `f2f95fa9` are the reference of
   record, consulted *first*. Every divergence is commented at the definition
   site with the PRD rationale and the foundation figure it departs from. An
   undocumented divergence is a review failure — and so is a comment claiming a
   divergence that does not exist. `docs/BALANCE-POLICY.md` states this rule in
   full, along with the errata it has already caught.
6. **A feature is not done until a player can reach it through the UI.**
   Engine-only work must name the change that surfaces it, and that change
   inherits the obligation.
7. **Every state field, flag and event must name its reader**, and the change
   that adds it must assert the reader consumes it. If nothing reads it, it is
   not a feature — it is a receipt.

## 2. The gate

Every commit clears, at the repository root:

```
npx tsc -b          # including packages/*/e2e
npm run lint        # covering the e2e specs
npm run format:check
npm test
```

Changes touching the cockpit additionally require `npm run test:e2e -w
@spacerquest/ui` green locally, and changes touching the Electron shell require
`npm run test:e2e -w @spacerquest/desktop`.

Per the project's global rules, UX-facing verification goes through the real UI.
The engine-direct path is for balance simulation, never for proving that
something works for a player.

## 3. The CI-evidence rule

Review and the gate run on a local diff, so acceptance evidence must be locally
checkable — the local equivalent of what CI runs is what review accepts.

Where a claim names CI, a packaged artifact, or anything else that only exists
after a push, it is confirmed **after** the push and recorded then. Nothing can
observe a CI run on a commit that has not been pushed, and a claim about a run
that has not happened is a claim, not evidence.

The corollary is a rule about pace: CI must be green on the most recent pushed
commit before the next change starts. A batch of commits pushed together produces
one CI run for the tip and no evidence at all for the commits underneath it —
which is exactly how this repository once carried twelve un-verified commits and
a player-visible bug in the version row.

## 4. The rebalance fallout rule

A change that breaks an existing green test fixes that test **in the same
commit**. Leaving it for later is a review failure, and "pre-existing" is never a
reason to leave a test red.

Balance thresholds were staged deliberately during the build, and
`docs/BALANCE-POLICY.md` Part B rule 5 records which numbers are canonical and
which were interim.

## 5. The serialization rule

`packages/ui/src/App.tsx`, `packages/ui/src/store.ts` and
`packages/ui/src/format.ts` are wide files that many changes want at once. Work
touching them is serialized — commit one before starting the next. This is the
lesson of a v0.1 collision between two concurrent UI changes, and it is why the
cockpit build ran as a strict sequence rather than in parallel.

## 6. The foundation reference

The 1991 rules of record live at git ref **`f2f95fa9`**:

```
git show f2f95fa9:foundation/rules/<file>      # travel.ts, upgrades.ts, combat.ts, constants.ts
git show f2f95fa9:foundation/lore/User-Manual.md   # the writing voice guide
```

Read the foundation rule before diverging from it. A divergence introduced
because nobody checked is a bug, not a design decision — and about half the time
there is no divergence at all, only a misremembered rule. `docs/BALANCE-POLICY.md`
Part C records the ones that turned out that way.
