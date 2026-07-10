# Legacy — Quarantine

Everything in this directory is **frozen**. It is preserved for provenance and
reference during the *Rimward* redesign, and is a candidate for deletion once
the new game no longer needs to consult it.

**Rules of quarantine:**

- Nothing outside `legacy/` may import, build on, or link to anything in here.
- No fixes, no upkeep. Bugs found here stay here.
- Anything worth keeping has already been *copied out* to `foundation/`
  (code/data) or *moved out* to `foundation/lore/` (docs). If you find yourself
  reaching in here for something load-bearing, promote it to `foundation/`
  first and record it in `foundation/README.md`.

## Contents

| Item | What it is |
|---|---|
| `SQ/` | The original 1991 Apple II GBBS BASIC/ACOS source of Spacer Quest v3.4 by Firefox. Historical artifact — the most preservation-worthy thing in this directory. |
| `Decompile/` | The reverse-engineering working files (`Source-Text/` etc.) used to reconstruct the original's rules. |
| `spacerquest-web/` | The complete "Museum Edition": a faithful web port (Node 20/Fastify/Prisma/Postgres backend, React + xterm.js terminal frontend) with 20 simulated BBS players, 54 screens, and a 1,958-test suite. Left intact and theoretically runnable (`npm install && npm run dev` inside the directory; needs Postgres/Redis; see its own README/HANDOVER). |
| `docs/` | Process and verification records: `Traceability.md` (code ↔ 1991 source mapping), `PLAYTEST-DESIGN.md`, and `archive/` (the intake `EVALUATION.md` and `UGT-PLAYTEST-FINDINGS.md` — the LLM playtest results that shaped the redesign verdict). |
| `HANDOVER.md`, `plan.md`, `README.txt` | Museum Edition status/process docs, final state as of quarantine. |
| `railway.json`, `ci.yml`, `.env` | Deploy config, the GitHub Actions workflow (moved here to stop CI running against the frozen app), and local env for the web port. |

Known pre-existing quirk: `spacerquest-web/docker-compose.yml`'s `app` service
does not build — its Dockerfile expects Railway's repo-root build context, not
the compose-local one. This predates the quarantine and doesn't matter now;
`docker compose up -d db redis` is all the test suite needs, and the full
suite (51 files / 1,958 tests) was verified green from this location on the
day of quarantine (2026-07-10).

## Related but not in this repo

The **UGT (Universal Game Tester)** LLM playtest harness lives in a sibling
repository (`../_UGT Universal Game Tester`). It is *not* legacy — it is one of
the redesign's key assets and will be pointed at *Rimward*.
