# Balance smoke checkpoints

Fast regression fixtures extracted from a full capstone sweep. **These catch breakage;
they do not grade balance.** See `NPC_REDESIGN.md` N7 for the loop this
serves and `docs/VERSIONING.md` §3 for the versioning contract.

## The loop

```
full capstone sweep (1,000 seeds x 120 days x 8 policies = 8,000 runs)
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

**What a capstone actually costs, since the figure drives how freely you re-measure.**
Measured 2026-07-29 on a 10-core box: **207s wall clock** for the full 8,000 runs with
`--shard i/8` run concurrently, then `--merge`. It is strongly hardware- and
shard-dependent — `packages/sim/src/balance/sweep.ts`'s header records the much slower
single-threaded figures from the authoring machine, and the quadratic day-cost there is a
real baseline finding, not a rounding error. Sharded, this is a three-minute operation,
so **"a re-measure is too expensive" is not a reason to skip one.**

## What a fixture must carry

Every file records the world it was measured in, or it is not usable later:

| field | why |
| --- | --- |
| `productVersion` | which build produced it (`docs/VERSIONING.md` §1) |
| `saveSchemaVersion` | which persisted shape it assumes (§2) |
| `rulesFingerprint` | **which ruleset it describes** (§3) — the load-bearing one |
| `provenance` | sweep label, seed count, horizon, date, git commit |
| `checkpoints` | the measured markers themselves |

**N7 added one field beyond this table: `instrumentFingerprint`**, a second hash over
`packages/sim`'s measuring code. The sim is the thermometer, not the weather — folding it
into `rulesFingerprint` would make that field assert "the ruleset changed" every time a
policy was tuned. But a checkpoint is still *produced* by the instrument, so an instrument
change invalidates it just as thoroughly. Two hashes, two sentences, two responses. The
classification and its reasoning live in `packages/sim/src/balance/rules-fingerprint.ts`.

**N7-FP added a third: `docsFingerprint`** — raw bytes over every hashed source, comments
included. It is the odd one out and deliberately so: **it never fails anything.** The two
hashes above are semantic (see below), so they say nothing when only commentary moves;
this one dates that change, because "same game, rewritten explanation" is worth knowing
when a comment disagrees with a number. Report it, never gate on it. Fixtures extracted
before N7-FP simply lack the field, which is not a mismatch.

The fixture in this folder is `tiers.json`. Regenerate it with
`npm run balance:extract` (never by hand); check it with `npm run balance:smoke`.

## The rule that makes this safe

**A fixture whose `rulesFingerprint` does not match the current tree is STALE and must
fail loudly.** It is never silently used and never auto-refreshed.

That is the whole design. A smoke test run against checkpoints from a different ruleset
is not a weak test — it is a *misleading* one, reporting green about a game that no
longer exists. The fingerprint is derived from the content and engine rule sources
rather than declared by hand, precisely because a hand-maintained number would be
forgotten in exactly the commit that changed a tribute constant.

**It hashes CODE, not bytes** (N7-FP). Comments are stripped before hashing — with the
TypeScript parser, not a regex, since `//` and `/* */` live inside string literals in this
codebase. Rewriting a comment therefore does not invalidate a measurement, because a
comment decides no outcomes. It used to, and the false positive was expensive: a
documentation fix to `content/ports.ts` that a capstone proved inert ("NOTHING MOVED"
across 7,000 seeded rows) still forced a re-stamp. Content here is deliberately
comment-dense, so the old rule taxed the work that keeps this documentation true. Every
change to *code* — a constant, an operator, an import — still moves the hash.

When the fingerprint moves, that is not a problem to route around: it means the rules
changed, the checkpoints describe the old rules, and the honest fix is a new capstone.

**The one exception, and it is narrow.** If the hash *algorithm* changes, every fingerprint
moves at once while no rule has changed — re-extract from the unchanged baseline of record
rather than re-measuring, and say so explicitly in the commit. This has happened twice: at
N7-FP itself, and it is the expected consequence of a `typescript` **major** bump, since
the printer's output is what gets hashed. Treat any other simultaneous move of both hashes
as a real rules change until proven otherwise; the way to prove otherwise is a capstone and
a diff, never an assumption.

**Re-measuring? Match the outgoing capstone's shape.** Pass the same `--milestone-days` and
`--policies` the baseline of record was measured with — a different milestone set shifts
every `milestones[i]` index and fills the diff with thousands of phantom deltas that look
exactly like drift. The current baseline (`baseline-t148-roster-ladder.json`, re-pinned at T-148
2026-08-01; before that `baseline-t137-liars-dice.json` at T-137, and this line was left stale at
`baseline-t125-hangout.json` through T-131 and T-133 before being corrected at T-137) used
`--milestone-days 21,29,30,41,60,120` over all eight policies including
`trader-degraded` — the same shape every capstone back to `baseline-r2c-explorer-remit.json`.
Note also that `docs/balance/` keeps every historical capstone: **`baseline-n9-shipped.json`
is superseded**, and diffing against it reports ~2,000 already-accounted-for fields.

## The synthesized-state caveat — read before trusting a mid-game tier

A career cannot *start* at day 21; reaching it means simulating days 1-20. Mid-game
tiers therefore run against **synthesized** states — a spread of NPC and player
progression built to look like day 21, not played into.

That is fine for a breakage detector and **must never be used to grade balance.** This
repo's own tests already hold that line (`poverty-invariant.test.ts`: "the fix would be
to re-author a storylet trigger or the map, not to poke state"). Synthesized states are
allowed here, and only here, because the question is "does this still run and produce
sane numbers", not "is this balanced".
