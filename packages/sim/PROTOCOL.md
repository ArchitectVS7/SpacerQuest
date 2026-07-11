# SpacerQuest UGT Adapter — Message Protocol (T-202)

A thin, transport-agnostic protocol that exposes the SpacerQuest engine's day
loop to an external harness (the sibling UGT repo) as plain JSON messages:
**state-summary**, **legal-actions**, and **apply-action**, plus the day-loop
lifecycle transitions needed to drive a full campaign.

- **Pure core** — `packages/sim/src/protocol.ts`. `handleMessage(session, request)
  → { session, response }` is a deterministic pure function: no I/O, no clock, no
  `Math.random`. All randomness rides on the engine's seeded rng, which is
  serialized inside the `GameState` (`state.rngState`).
- **Transport shell** — `packages/sim/src/protocol-stdio.ts`. The only place real
  I/O happens. Reads line-delimited JSON requests, writes line-delimited JSON
  responses. WebSocket is the same reducer (`makeSessionHandler`) behind a socket.

Everything on the wire is plain-JSON-serializable — messages round-trip through
`JSON.stringify`/`JSON.parse` unchanged.

---

## Session

```ts
interface ProtocolSession {
  seed: number;      // the seed the game was created from
  state: GameState;  // the live engine state (carries the seeded rng)
}
```

A session is a complete snapshot. `serializeSession` / `deserializeSession` reuse
the engine's `serializeState` / `deserializeState`, so a session round-trips
exactly. This is the backbone of **deterministic replay** (see below).

---

## Requests

Discriminated on `type`:

| `type`          | Fields            | Effect                                                             |
| --------------- | ----------------- | ----------------------------------------------------------------- |
| `new-game`      | `seed: number`    | Create a fresh session at day 1 (DAWN). Returns `state-summary`.   |
| `reset`         | `seed: number`    | Alias of `new-game` — discards the current session and re-seeds.  |
| `state-summary` | —                 | Return the current `state-summary`. Read-only.                    |
| `legal-actions` | —                 | Return the `legal-actions` available right now. Read-only.        |
| `start-day`     | —                 | DAWN → DAY: roll the manifest board + dawn hand. `state-summary`. |
| `apply-action`  | `action: PlayerAction` | Apply one player action (DAY only). `action-result` or `error`. |
| `end-day`       | —                 | DAY → next DAWN: run dusk + advance the day. `state-summary`.     |

## Responses

Discriminated on `type`:

| `type`          | Fields                          |
| --------------- | ------------------------------- |
| `state-summary` | `summary: StateSummary`         |
| `legal-actions` | `legalActions: LegalActions`    |
| `action-result` | `summary: StateSummary`, `events: GameEvent[]` |
| `error`         | `code: ProtocolErrorCode`, `message: string` |

`ProtocolErrorCode`: `no-session` (a request other than new-game/reset arrived
before a game existed), `wrong-phase` (lifecycle/action issued in the wrong day
phase), `action-blocked` (a legal-shape action the engine refused — an active
encounter blocks trade/travel/shipyard/explore), `apply-failed` (a malformed
action a resolver rejected, e.g. a missing required die), `unknown-request` (an
unrecognized or non-JSON request line).

**The core never throws for a well-formed request.** Phase violations, blocked
actions, and malformed actions all come back as typed `error` responses, and on
every error path the session is left **untouched** — the adapter never enters a
broken state.

---

## The turn / day loop

The harness drives one day like this:

```
new-game(seed)                 -> state-summary        (day N, DAWN)
start-day                      -> state-summary        (day N, DAY, dice rolled)
loop:
  legal-actions                -> legal-actions
  apply-action(a)              -> action-result | error (spends a die / credits)
  ...until dice exhausted or the agent chooses to stop
end-day                        -> state-summary        (day N+1, DAWN)
```

Then repeat `start-day … end-day` for each subsequent day. Phase rules:

- `start-day` requires **DAWN**; `apply-action` and `end-day` require **DAY**.
- An action that requires a die spends one from the dawn hand. When
  `diceRemaining` is empty, no die-spending action is legal — the only remaining
  move is `end-day`.
- An **unresolved encounter carries across `end-day`** into the next day (with a
  dusk pressure roll); it does not block `end-day`.

---

## `state-summary`

A compact, agent-facing view — deliberately **not** the raw `GameState`. Fields:

| Field                | Meaning                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `day`                | Current day number.                                                 |
| `phase`              | `DAWN` \| `DAY` (WIRE/DUSK are transient, never observed here).      |
| `era`                | Campaign phase — `TOUR_ONE` \| `VETERAN`.                            |
| `credits`            | Spendable credits.                                                  |
| `debt`, `debtDueDay` | Outstanding Merchant Guild marker (a ledger, never negative credits) and the day it is called. |
| `fuel`, `maxFuel`    | Tank state.                                                         |
| `systemId`, `systemName` | Current location.                                               |
| `dawnHand`           | `{ dice: number[], spent: boolean[] }` — the day's rolled hand, or `null` before the first `start-day`. |
| `diceRemaining`      | **Indices** into `dawnHand.dice` that are still unspent — the legal values for any action's `spendDie`. |
| `activeContract`     | The contract in the hold (`{ destination, destinationName, cargoType, payment, pods }`) or `null`. |
| `encounter`          | Active interceptor (`{ id, interceptorId, interceptorName, tier, round, enemyHull, routeDangerLevel }`) or `null`. Blocks trade/travel/shipyard/explore. |
| `manifestBoard`      | Signable contracts: `{ index, destination, destinationName, cargoType, payment, pods, haggled }[]`. |
| `localFuelPrice`     | Price per unit of fuel at this port.                                |
| `eligibleStorylets`  | `{ storyletId, title, choices: { id, label, requiresDie }[] }[]`.   |
| `eraEvent`           | Active world economic event (`{ defId, startedDay, endsDay, affectedSystemIds }`) or `null`. |
| `renownRank`, `deedCount` | Registry standing.                                             |
| `fragmentCount`, `poiCount`, `successionCount` | Nemesis-file / charts / legacy counters. |
| `flags`              | Story flags currently set (small; storylet triggers read them).     |

---

## `legal-actions`

The `PlayerAction`s legal **right now**, honoring the engine's own gating.

```ts
interface LegalActions {
  phase: DayPhase;
  inEncounter: boolean;
  diceRemaining: number[];      // unspent die indices — the die-index domain
  actions: LegalActionSpec[];   // the meaningful actions available now
  canWait: boolean;             // whether a bare { type: 'Wait' } is legal
  lifecycle: ('start-day' | 'end-day')[];
}
```

- **DAWN** (or any non-DAY phase): `actions` is empty; `lifecycle` is
  `['start-day']`. No `PlayerAction` is legal until the day starts.
- **DAY, no encounter**: trade (buy-fuel / sign-contract / haggle / pay-debt),
  travel, explore, shipyard, and each eligible storylet choice — gated by dice,
  fuel, and board state. `lifecycle` is `['end-day']`.
- **DAY, active encounter**: **only** `Combat` (trade/travel/shipyard/explore are
  omitted — the engine would return `action-blocked`). `lifecycle` is
  `['end-day']`.
- **Dice exhausted** (no unspent dice, nothing die-free to do): `actions` is
  empty; the only move is `end-day`.

### `LegalActionSpec` and parameterization

```ts
interface LegalActionSpec {
  type: PlayerAction['type'];       // discriminant
  action?: string;                  // sub-action for Trade / Shipyard
  storyletId?: string;              // fixed discriminants for Storylet
  choiceId?: string;
  params: Record<string, ParamSpec>; // remaining fields, with their legal domains
  note?: string;                    // caveats (affordability, unbounded outcomes)
}

type ParamSpec =
  | { kind: 'die-index';       choices: number[] }
  | { kind: 'system-id';       choices: number[] }
  | { kind: 'contract-index';  choices: number[] }
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum';            choices: (string | number)[] }
  | { kind: 'fixed';           value: string | number };
```

The harness forms a `PlayerAction` by taking a spec's fixed discriminants
(`type` / `action` / `storyletId` / `choiceId`) and choosing one value per entry
in `params`.

**Why parameters instead of full enumeration.** Some action spaces are unbounded
or large, so the enumerator exposes the action *shape* and each parameter's
*domain* rather than one entry per concrete value:

- **buy-fuel** — `fuelAmount` is an `int` in `[1, min(capacity, affordable)]`.
- **pay-debt** — `amount` is an `int` in `[1, min(credits, debt)]` (no die).
- **haggle** — `contractIndex` from the un-haggled board; the payoff is a TRADE
  roll (unbounded outcome), noted, not enumerated.
- **Travel** — `destinationId` is the `system-id` domain (every system but the
  current one); one spec, not one-per-destination.
- **Shipyard** — `component`/`tier`/`quantity` shapes (buy-component-tier, repair,
  buy-cargo-pods), plus **buy-special-equipment** whose `equipment` is an `enum`
  over the 7 special items (`CLOAKER`, `AUTO_REPAIR`, `STAR_BUSTER`, `ARCH_ANGEL`,
  `ASTRAXIAL_HULL`, `TITANIUM_HULL`, `TRANS_WARP`). **Affordability, renown, and
  mutual-exclusion are validated on `apply-action`** (the engine emits
  `ShipyardFail`), so they are not pre-checked here.
- **Combat** — `stance` is an `enum` gated by fuel (`talk` always; `run` needs
  `RUN_FUEL_COST`; `fight` needs `FIGHT_FUEL_COST`); `targetId` is `fixed` to the
  interceptor.

Concrete, cheap enumerations **are** listed exhaustively: die indices, contract
indices, and every eligible storylet choice.

---

## `apply-action`

Applies a single `PlayerAction` through the engine's **public** API
(`applyPlayerAction`) — the adapter never reaches into engine internals. Outcomes:

- **Success** → `action-result` with the new `state-summary` and the `events` the
  engine emitted. Actions the engine *accepts but that mechanically fail* (e.g. a
  failed pilot check, an unaffordable purchase, a missed haggle) are successful
  applications — their failure is reported inside `events`.
- **Blocked** (an active encounter refuses trade/travel/shipyard/explore) →
  `error` `action-blocked`; the session is not mutated.
- **Malformed** (a resolver rejects the action, e.g. a required `spendDie` is
  missing) → `error` `apply-failed`; the session is not mutated.
- **Wrong phase** (not DAY) → `error` `wrong-phase`.

---

## Deterministic replay contract

A **logged session** is an ordered list of request messages (starting with
`new-game`/`reset`). Replaying the same log from a fresh handler always yields:

1. a **byte-identical** final session — `serializeSession(a) === serializeSession(b)`; and
2. **byte-identical** responses at every step.

This holds because the core is pure and every source of randomness is the
engine's seeded rng carried inside the serialized `GameState`. There is no
hidden clock, no `Math.random`, and no ambient state in the adapter. A logged
session can therefore be captured from one run and re-executed byte-for-byte —
the basis of the replay test in `src/__tests__/protocol.test.ts`.

---

## Transports

### stdio (line-delimited JSON) — implemented

`runStdioAdapter(input?, output?)` reads one JSON request per line from `input`
(default `process.stdin`) and writes one JSON response per line to `output`
(default `process.stdout`). Blank lines are ignored; a non-JSON line yields an
`error` `unknown-request` response. Run it directly:

```
tsx packages/sim/src/protocol-stdio.ts
{"type":"new-game","seed":1}
{"type":"start-day"}
{"type":"legal-actions"}
{"type":"apply-action","action":{"type":"Travel","destinationId":2,"spendDie":0}}
{"type":"end-day"}
```

### WebSocket — adapter interface (stub)

No `ws` dependency is pulled in. A WebSocket server is a trivial wrapper around
the same transport-agnostic reducer:

```ts
import { makeSessionHandler } from '@spacerquest/sim';

const handler = makeSessionHandler(); // retains the session between messages
socket.on('message', (data) => {
  const request = JSON.parse(String(data));      // ProtocolRequest
  socket.send(JSON.stringify(handler(request))); // ProtocolResponse
});
```

`makeSessionHandler()` returns `(request) => response`, holding the session across
calls. All game logic and determinism live in the pure core; a socket server only
moves bytes — exactly like the stdio shell.
