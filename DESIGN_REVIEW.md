# Design Review: Out-of-Scope Features & NPC Simulation Audit

**Date:** March 17, 2026
**Scope:** Review of five features listed as "Not Required" in PROJECT_STATUS.md, plus audit of NPC simulation system.

---

## Critical Finding: No NPC System Exists

Before addressing individual features, a core requirement must be flagged: **the codebase has no persistent NPC characters.**

The game has meaningful **simulation infrastructure** that creates a "living world" feel:
- **Procedural enemy generation** — `combat.ts` generates pirates (SPX/SPY/SPZ scaled to player power), Space Patrol (for smugglers), Rim Pirates, Brigands, and Reptiloids on-demand during combat
- **Bot-vs-bot combat** — `encounter-generation.ts` runs every 5 minutes, picks 1-5 random pairs of existing characters and simulates combat between them (updating scores, win/loss stats, logging to GameLog)
- **Alliance territorial wars** — same job runs automated takeover attempts (1% daily chance per system, DEFCON defense, 7-day cooldown)
- **Economic simulation** — fuel prices fluctuate ±2 credits every 5 minutes, missions generated every 6 hours, alliance tension bulletins
- **Daily tick** — promotions, port income, inactive owner eviction

**The critical gap:** All of this simulation operates on **real player characters**. The bot-vs-bot combat picks from existing `Character` records. In a single-player scenario, there is nobody to simulate. The seed creates 28 star systems but **zero characters**. There is no `isNpc` flag, no NPC creation, no NPC behavior AI.

The project goal states we would "use scripted NPCs to simulate the multiplayer experience." What's needed is a set of **persistent NPC Character records** (seeded on startup, flagged as NPCs) that the existing simulation infrastructure can operate on. The background jobs would then generate meaningful events — NPC-vs-NPC combat, NPC alliance activity — that populate the GameLog and make the world feel alive even for a solo player.

**Recommendation:** NPC character creation is a prerequisite for most features below and should be treated as Priority 0. The simulation engine already exists; it just needs characters to simulate.

---

## 1. Jail / Brig / Crime System

### How It Worked in the Original

The jail system was **not** a manual sysop feature. It was **game-mechanic driven** with automated triggers:

| Crime | Trigger | Fine | Code Reference |
|-------|---------|------|----------------|
| Smuggling contraband | Caught by Space Patrol during smuggling run | 1,000 cr | SP.FIGHT1.txt:247-253 |
| Modem disconnect in battle | Carrier loss during active combat | 10,000 cr | SP.END.txt:250-251, SP.MAL.txt:32-33 |
| Conduct against game spirit | Sysop-triggered catch-all | 20,000 cr | SP.END.txt:253-254 |

**Mechanics:**
- Jailed players had their name prefixed with `J%` (persistent marker)
- On login, `J%` prefix redirected to jail screen (`SP.START.txt:132`)
- Players could pay fines to Admiral Juris P. Magnus for release
- Other players could visit the Brig at The Spacers Hangout (Sun-3) and **bail out imprisoned spacers** for double the fine
- Modem disconnect penalty also **damaged the ship**: weapons -2, shields -2, hull destroyed, ship renamed to "Junk" (`SP.MAL.txt:456-457`)

### Current Implementation

**Nothing implemented.** Smuggling mechanics exist in `systems/economy.ts` and `systems/combat.ts` (patrol encounter generation), but there is no consequence for being caught beyond losing the combat encounter. No jail state, no fine system, no brig screen.

### Recommendation: IMPLEMENT

The jail system is deeply integrated into the smuggling gameplay loop. Smuggling is already partially implemented (pay multiplier, patrol encounters). Without jail, getting caught smuggling has no unique consequence vs. losing any other combat. The risk/reward dynamic that made smuggling interesting is broken.

**Implementation scope:**
- Add `jailStatus` field to Character model (crime type + fine amount)
- Redirect jailed players to a Brig screen on login
- Wire smuggling patrol defeat to jail assignment
- Implement fine payment release mechanism
- Add Brig viewing to the Spacers Hangout screen (see Alliance section below)
- NPCs should be able to bail the player out, and the player should be able to bail NPCs
- **Skip** the sysop-only "conduct against spirit" crime (crime type 3) since there is no sysop

---

## 2. Player-to-Player Messaging

### How It Worked in the Original

There was **no private 1:1 messaging**. Instead, the game had **alliance-specific bulletin boards** (SP.TOP.S), restricted to alliance members only. Each alliance had its own board stored in a separate file (`astro`, `dragon`, `warlord`, `rebel`).

**Bulletin board operations:**
- `(R)eread` — view existing messages
- `(W)rite msg` — post a message (79 char max, auto-prepended with date + player name)
- `(K)ill msgs` — wipe all messages (board reset)
- `(Q)uit` — exit

**Access control:** Players could only read/write their own alliance's board. The header read "Confidential Bulletins For Alliance Members Only." Sysops could read any alliance's board.

**PRD-Original.md requirements (still on record):**

| ID | Requirement | Priority |
|----|-------------|----------|
| AL-201 | System shall provide alliance bulletin boards | Must Have |
| AL-202 | System shall restrict bulletins to alliance members | Must Have |
| AL-203 | System shall support raid planning against rival alliances | Should Have |

Source: SP.TOP.S (bulletin board code), USERS-MANUAL.md Section 7.3

### Current Implementation

**Nothing implemented.** The `GameLog` model exists and records events (rescues, duels, alliance takeovers), but there is no player-facing way to read these logs in-game, nor any way for players to post messages.

### Recommendation: IMPLEMENT (with LLM stub)

The alliance bulletin board is the social heart of the game and was explicitly a **Must Have** in the original PRD. In a single-player-with-NPCs context:

1. **Phase 1 (now):** Implement alliance bulletin boards with the original operations (Read/Write/Quit). Populate with auto-generated entries from GameLog events (takeovers, raids, member joins). NPC "posts" can be templated initially (e.g., "Commander Zark: Raided System 5 today. DEFCON was laughable. —Z").

2. **Phase 1 (now):** Implement a public "Spacers Hangout News Board" (non-alliance) that displays recent GameLog entries formatted as BBS posts. This gives the player a sense of a living world even before joining an alliance.

3. **Phase 2 (LLM integration):** Replace templated NPC posts with LLM-generated contextual messages: threats before attacking, trade tips, alliance recruitment pitches, taunts after winning duels. Allow player posts to trigger NPC "responses," simulating multi-player conversation.

**Implementation scope (Phase 1):**
- Create a Spacers Hangout screen (SP.BAR equivalent) at Sun-3
- Add alliance bulletin board model (or use GameLog with alliance filter)
- Implement Read/Write/Kill operations per the original SP.TOP.S flow
- Restrict board access to alliance members (original AL-202)
- Display public news board with recent GameLog entries

---

## 3. Alliances & Alliance Bulletin Boards

### How Alliances Worked in the Original

Alliances were a **major strategic system**, not a minor feature:

**The Four Alliances:**

| Alliance | Symbol | Character |
|----------|--------|-----------|
| The Astro League | `+` | Ancient, provincial |
| The Space Dragons | `@` | Crafty conspirators |
| The Warlord Confederation | `&` | Most dangerous, warlike |
| The Rebel Alliance | `^` | Revolted from Astro League |

**Joining (SP.BAR.S):**
- Available at The Spacers Hangout, Sun-3 only
- Minimum rank: Lieutenant
- Max 1/3 of total players per alliance (prevents domination)
- Ship name appended with alliance symbol (e.g., `MILLENNIA-^`)
- Switching alliances cost **all credits** and any owned ports

**Alliance Investments (SP.VEST.S):**
- Players could invest in and control star systems (1-14)
- 10,000 cr startup cost to acquire a system; player becomes CEO
- DEFCON system (1-20) for defense; costs 100,000-200,000 cr per level
- Rival alliances could execute hostile takeovers by spending more than DEFCON
- Shared alliance treasury with deposit/withdrawal
- Alliance raids on enemy systems

**Alliance Bulletin Boards (SP.TOP.S):**
- Recorded takeovers, investments, member changes
- Alliance-specific news visible to members

### Current Implementation: MODERATELY IMPLEMENTED

**What exists:**
- **Database models:** `AllianceType` enum (4 alliances + NONE), `AllianceMembership` (with investment credits), `AllianceSystem` (with DEFCON), `StarSystem.allianceControl`
- **Alliance constants:** startup investment (10,000), DEFCON cost (100,000), max level (20), size divisor (1/3), min members (4), symbols — all defined in `constants.ts`
- **Investment system:** `systems/alliance.ts` — invest, withdraw, DEFCON increase, hostile takeover logic with attack/defend/weaken mechanics (201 lines, fully functional)
- **Join/leave API:** `PUT /api/character/alliance` in `routes/character.ts` — maps symbols to enums, creates/deletes `AllianceMembership`
- **Economy routes:** `POST /api/economy/alliance/invest` and `/withdraw` — routes to alliance system functions
- **Terminal screens:**
  - Bank Transfer screen shows alliance membership status and invested credits
  - Registry screen has `[A]lliance Directory` showing players grouped by alliance
  - Main Menu appends alliance symbol to player name
  - Pub screen includes alliance events in "Latest Gossip"
- **Background jobs (alliance-level simulation):**
  - `encounter-generation.ts:processTakeoverAttempts()` — runs every 5 minutes, 1% daily chance per system, random rival alliance attacks, DEFCON defense reduces success chance (30% base - 2% per level, min 5%), 7-day cooldown
  - `mission-generation.ts` — 20% chance per run to generate "Alliance War Bulletin" flavor messages between random alliances
- **Utility functions:** `getAllianceSymbol()`, `appendAllianceSymbol()`, `removeAllianceSymbol()` in `utils.ts`

**What's missing:**
- **No Spacers Hangout screen** — no terminal UI for joining an alliance (only raw API)
- **No alliance bulletin board screen** — no way to view alliance-specific news in-game
- **No rank check on join** — API accepts any player (original required Lieutenant+)
- **No cost to switch** — API allows free alliance switching (original cost all credits + ports)
- **No 1/3 cap enforcement** — constants defined but not checked in join logic
- **No alliance raids** — the original SP.BAR.S player-initiated raid mechanic is unimplemented (only automated background takeover attempts exist)
- **No alliance investment screen** — no SP.VEST equivalent terminal UI for investing in systems
- **No NPC alliance members** — no individual NPC spacers in alliances; the background jobs simulate alliance-level wars abstractly (no named NPC actors)
- **No same-alliance PvP protection** — no enforcement preventing allied players from attacking each other

### Recommendation: IMPLEMENT FULLY (critical for gameplay)

Alliances are not a "nice-to-have." They are a core strategic endgame system. The backend logic is solid — investment, DEFCON, takeovers all work. The background jobs already simulate alliance territorial wars. What's missing is the **player-facing UI** and **original rule enforcement** that makes the system accessible and fair, plus **NPC spacers** that give the player someone to compete against.

**Implementation scope:**
- Create Spacers Hangout screen (Sun-3) with alliance joining UI
- Enforce rank requirement (Lieutenant+) in join logic
- Enforce switching cost (all credits + port loss) in join logic
- Enforce 1/3 cap per alliance in join logic
- Create alliance investment screen (SP.VEST equivalent) — terminal UI for system acquisition, DEFCON investment, treasury management
- Create alliance bulletin board screen showing alliance-specific GameLog entries
- Add same-alliance PvP protection
- **NPC integration:** NPCs must join alliances as named characters visible in the directory, invest in systems, and provide visible rivals for the player

---

## 4. Wise One & Sage NPCs

### How They Worked in the Original

These were **not just flavor text**. They were two distinct NPCs at specific Rim Star locations with actual gameplay mechanics:

**The Wise One (Polaris-1, System #17):**
- Accessible via `(W)ise One Visit` in the docking menu
- Displayed atmospheric flavor text about a "special weapon enhancement" found on alien ship derelicts in The Great Void
- Generated a random **Number Key** (1-9) displayed to the player
- The number key hints at hidden endgame content (alien weapon upgrades)
- Source: SP.DOCK2.txt:332-334, text file SP.WISE

**The Sage / Ancient One (Mizar-9, System #18):**
- Accessible via `(S)age Visit` in the docking menu
- Ran an interactive **constellation knowledge quiz**
- Displayed a constellation chart (16 constellations A-P: Perseus, Auriga, Orion, etc.)
- Asked "In which constellation is [STAR] to be found?" with 9-second time limit
- **Correct answer reward:** +1 Cabin strength, condition set to 9 (perfect)
- Visitable once per session (flag `kj`)
- Source: SP.DOCK2.txt:300-330, text files SP.SAGE and SP.CONS

### Current Implementation

**Nothing implemented.** No screens, no routes, no references.

### Recommendation: IMPLEMENT

The Sage is especially valuable — it provides a unique gameplay reward (+1 Cabin) gated behind knowledge of the game's star map. This encourages exploration and learning the universe. The Wise One provides atmosphere and a cryptic hint system that adds mystery.

**Implementation scope:**
- Add Wise One encounter to Polaris-1 docking menu
  - Display SP.WISE flavor text
  - Generate and display random Number Key (1-9)
- Add Sage encounter to Mizar-9 docking menu
  - Display constellation chart (SP.CONS)
  - Interactive quiz with 9-second timer
  - +1 Cabin strength reward for correct answer
  - Once-per-session visit limit
- Both are self-contained — no NPC system dependency

---

## 5. Carrier-Loss Penalty

### How It Worked in the Original

When a BBS user's modem disconnected during battle:
1. Player flagged with crime `pp=6`
2. Ship severely damaged: weapons -2, shields -2, hull destroyed, renamed "Junk"
3. On next login, sent to Brig with 10,000 cr fine
4. Other players could bail them out for 20,000 cr

The original documentation explicitly states: "Most serious crime to be convicted of is losing carrier (disconnecting your modem while on-line) during battle (sometimes thought of as an easy way to avoid being destroyed by superior opponents)."

This was purely an anti-exploit measure for the BBS context where disconnecting the modem was the equivalent of alt-F4 to avoid losing.

### Modern Web Equivalent

In a web environment, the equivalent exploit is:
- Closing the browser tab during combat
- Navigating away during an unfavorable battle
- Network disconnection (legitimate or intentional)

### Recommendation: DO NOT IMPLEMENT (but add mitigation)

The original penalty (ship destroyed, 10,000 cr fine, jail) is too harsh for a web context where disconnections are more common and less deliberate. However, **combat state must be persisted server-side** so that closing the browser doesn't cancel an in-progress battle.

**Mitigation approach:**
- Store combat state in the database, not just in-memory WebSocket state
- If a player disconnects mid-combat, **resolve the combat server-side** using the existing combat formulas (the player doesn't get to "dodge" the outcome)
- On reconnection, show the combat result
- No jail, no extra penalty — the natural combat outcome is sufficient punishment
- This is architecturally similar to how travel state already works (`TravelState` model persists in-progress travel)

---

## Summary of Recommendations

| Feature | Verdict | Priority | NPC Dependency |
|---------|---------|----------|----------------|
| **NPC Simulation System** | IMPLEMENT | P0 (prerequisite) | N/A |
| **Jail/Brig/Crime** | IMPLEMENT | P1 | Low (smuggling works solo, bail needs NPCs) |
| **Bulletin Board** | IMPLEMENT | P1 | Medium (NPC posts make it alive) |
| **Alliances (UI + rules)** | IMPLEMENT | P1 | Medium (backend works, UI/rules needed; NPCs enrich it) |
| **Alliance Bulletin Board** | IMPLEMENT | P1 | Medium (follows alliance implementation) |
| **Wise One & Sage** | IMPLEMENT | P2 | None (self-contained) |
| **Carrier-Loss Penalty** | DO NOT IMPLEMENT | N/A | N/A |
| **Combat disconnect mitigation** | IMPLEMENT | P1 | None |

### Recommended Implementation Order

1. **NPC Simulation Engine** — Character creation, alliance membership, movement, trading, combat behavior. This unblocks everything else.
2. **Spacers Hangout screen** — Central social hub at Sun-3. Contains alliance joining, brig viewing, bulletin board access.
3. **Alliance system completion** — Enforce original rules (rank, cost, cap). NPC alliance membership.
4. **Jail/Brig system** — Wire into smuggling patrol encounters.
5. **Bulletin Board** — Display GameLog as formatted posts, NPC-authored messages.
6. **Combat disconnect mitigation** — Persist combat state server-side.
7. **Wise One & Sage** — Self-contained encounters at Polaris-1 and Mizar-9.
8. **Phase 2: LLM Integration** — NPC conversations, contextual bulletin board posts, player-NPC messaging.
