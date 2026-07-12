# Spacer Quest Content

Content modules export pure data tables for the engine. Storylets are authored in
`src/storylets.ts` and exported as `STORYLETS` through `defineStorylets([...])`,
which validates the catalog at module load.

## Storylet Schema

- `EraId`: `'TOUR_ONE' | 'VETERAN'`
- `FlagValue`: `string | number | boolean`
- `NumberMatcher`: `{ equals?, gte?, lte? }`
- `StoryletDefinition`: `{ id, title, prose, repeat?, trigger, choices }`
- `repeat`: omitted or `'never'` for one-shot storylets, `'daily'` for storylets
  that can be offered again on later days.
- `StoryletTrigger`: gates eligibility by `systemIds`, active cargo contract,
  NPC location/disposition, `eras`, `day`, `flags`, and `scheduledOnly`.
- `StoryletChoiceDefinition`: `{ id, label, prose, requirements?, effects?,
  successEffects?, failureEffects? }`
- `requirements`: optional credit matcher, `spendDie: true`, or a stat check
  `{ stat, dc }`. Stat checks also spend the selected die when resolved.
- `StoryletEffects`: can mutate credits, fuel, active/manifest cargo, flags, NPC
  disposition, deed progress, and future schedules.

## Validation

`defineStorylets` throws:

```text
Invalid storylet content:
 - ...
```

Validation checks unique storylet IDs, unique choice IDs, 2-4 choices, valid
system/cargo/NPC/stat/deed references, finite integer numeric deltas/DCs/days,
flag names matching `/^[a-z][a-z0-9_.-]*$/`, valid scheduled targets, and rejects
scheduled-only storylets that no other storylet schedules.

Storylet content must remain data, not logic. Runtime eligibility and effect
application live in the engine.

## Cargo & Passenger batch conventions (T-401)

The cargo/passenger register (PRD §8.3 — short, one decision, delivered by the
economy) follows a few authoring rules that the engine test suite enforces:

- **Every storylet carries at least one requirement-free choice** (no `credits` /
  `spendDie` / `statCheck` gate), so a broke, die-spent captain can always resolve
  the day — no storylet ever dead-ends it.
- **Held-state flags use the `passenger.*.aboard` and `cargo.*.riding`
  namespaces**, and every one has a reachable clearer. A passenger fare is a
  system-gated **board** storylet that sets `passenger.<slug>.aboard` and
  `schedule`s a `scheduledOnly` **arrival** which pays out and clears the flag a
  day or two later (regardless of location) — matching PRD §7.2 (the false-name
  passenger "pays her fare in coordinates" the next day) and guaranteeing the fare
  always resolves. The ticking-crate cargo chain follows the same head → scheduled
  aftermath shape.
- **Reachability divergences** (documented inline in `storylets.ts`): passengers
  have no engine contract type, so they are modelled purely as flags; the
  plague-relief exemplar is delivered as a Medicinals→Fomalhaut-2 contract rather
  than a plague-era event (no era-event trigger exists); and the ticking-crate
  exemplar rides a board-reachable Dilithium (type 9) run because `rollContract`
  never issues a Contraband (type 10) contract.
