# Balance smoke checkpoints

Fast regression fixtures extracted from a full capstone sweep. **These catch breakage;
they do not grade balance.** See `BALANCE-REDESIGN-WORKLIST.md` N7 for the loop this
serves and `docs/VERSIONING.md` §3 for the versioning contract.

## The loop

```
full capstone sweep (1,000 seeds x 120 days, ~80 min)
        |
        +--> diff against the previous capstone -> what moved, and by how much
        |
        +--> extract checkpoint markers ---------> the fixtures in this folder
                                                          |
                              every change runs the fast staged smoke tests
                                                          |
                          all green, and a change warrants it -> next capstone
```

A capstone is the **only** authority on balance numbers. A smoke run answers one
question — "did something obviously break?" — and answers it in seconds.

## What a fixture must carry

Every file records the world it was measured in, or it is not usable later:

| field | why |
| --- | --- |
| `productVersion` | which build produced it (`docs/VERSIONING.md` §1) |
| `saveSchemaVersion` | which persisted shape it assumes (§2) |
| `rulesFingerprint` | **which ruleset it describes** (§3) — the load-bearing one |
| `provenance` | sweep label, seed count, horizon, date, git commit |
| `checkpoints` | the measured markers themselves |

## The rule that makes this safe

**A fixture whose `rulesFingerprint` does not match the current tree is STALE and must
fail loudly.** It is never silently used and never auto-refreshed.

That is the whole design. A smoke test run against checkpoints from a different ruleset
is not a weak test — it is a *misleading* one, reporting green about a game that no
longer exists. The fingerprint is derived from the content and engine rule sources
rather than declared by hand, precisely because a hand-maintained number would be
forgotten in exactly the commit that changed a tribute constant.

When the fingerprint moves, that is not a problem to route around: it means the rules
changed, the checkpoints describe the old rules, and the honest fix is a new capstone.

## The synthesized-state caveat — read before trusting a mid-game tier

A career cannot *start* at day 21; reaching it means simulating days 1-20. Mid-game
tiers therefore run against **synthesized** states — a spread of NPC and player
progression built to look like day 21, not played into.

That is fine for a breakage detector and **must never be used to grade balance.** This
repo's own tests already hold that line (`poverty-invariant.test.ts`: "the fix would be
to re-author a storylet trigger or the map, not to poke state"). Synthesized states are
allowed here, and only here, because the question is "does this still run and produce
sane numbers", not "is this balanced".
