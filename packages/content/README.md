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
