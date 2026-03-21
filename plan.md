# SpacerQuest v4.0 — Open Items

**Updated:** March 19, 2026

---


## 50-Turn Strategic Playtest (E2E Test 09)

**Priority: High** — The original testing goal from the dev notes.

Test 09 (`tests/e2e/09-browser-game-agent.spec.ts`) currently has 25 serial feature tests. The plan calls for restructuring it into a strategic agent that plays 50 full turns, exercising as many game features as possible per turn.

**Prerequisites:** Items 1 (gambling wired) and 2 (bots tested) must be complete. The player needs to be able to end their turn and have bots run so they can take another turn.

**Work:**
- Restructure test 09 as a phase-driven decision engine:
  - **Phase 1 (Turns 1-5):** Cheap actions — pub drink, gossip, buy Cloaker (500 cr, before hull upgrade), accept cargo, deliver
  - **Phase 2 (Turns 6-15):** Earn credits — cargo runs, gambling (Wheel + Dare), fuel arbitrage at cheap systems (Sun-3, Mira-9)
  - **Phase 3 (Turns 16-30):** Upgrades — systematic component upgrades, Auto-Repair purchase, combat encounters
  - **Phase 4 (Turns 31-50):** Advanced — alliance join/invest, bulletin board, visit Sage (sys 18) and Wise One (sys 17), special equipment
- End-turn flow between turns: press `D` → `Y` → wait for bot summary → back to main menu
- Internal scorecard tracking ~40 game features (checked/unchecked)
- Single long-running test with 30-minute timeout
- Strategic decisions based on current state (credits, fuel, location, ship condition)

**Coverage target:** 100+ of 163 game actions (up from current 56)

**Untested areas to specifically target:**
- Wheel of Fortune & Spacer's Dare
- All 5 special equipment purchases (Cloaker, Auto-Repair, Star-Buster, Arch-Angel, Astraxial if possible)
- Surrender in combat
- Sage & Wise One visits
- Port ownership (if credits allow)
- Alliance bulletin board
- Travel hazards & course changes
- Jail bail mechanic (via smuggling → arrest → pay fine)
- Bank transfer

**Files:** `tests/e2e/09-browser-game-agent.spec.ts`, `tests/e2e/helpers/`

---

## NPC Encounter Roster Alliance Tuning **POST LAUNCH - DO NOT IMPLEMENT**

**Priority: Low** — Polish work, not blocking anything.

The 65 original NPC encounter opponents (NpcRoster table) have alliance distributions preserved from the 1991 data files. A future pass could rebalance to create regional faction character — more Warlord NPCs in rim systems, more Patrol in core.

This is about the **NpcRoster** (combat enemies), NOT the 20 simulated players (bot Characters). These are distinct systems:
- **NpcRoster** (65): Lightweight combat opponents from original Apple II data files (PIRATES, SP.PAT, SP.RIMPIR, SP.BRIGAND, SP.REPTILE). Commander names like `"][-Lt.Savage"`, `"RP-Black Bart"`.
- **Simulated Players** (20): Full User+Character+Ship records (`isBot: true`) that take turns like a real 1991 BBS player. Names like `"Iron Vex"`, display as `"[BOT] Iron Vex"`.

**Files:** `prisma/seed.ts`, NPC roster data

---


