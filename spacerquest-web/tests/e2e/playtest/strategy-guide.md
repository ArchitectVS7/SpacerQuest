# SpacerQuest Strategy Guide

*Written for an LLM agent making real-time game decisions. This is not a script — it is a mindset. Read it, internalize the priorities, and apply judgment at every step.*

---

## Understanding the Game

SpacerQuest is a persistent multiplayer space trading and combat game. You command a ship with 8 upgradeable components, competing with other players for credits, combat glory, and rank advancement.

**A "turn" in this game** means ending your session by pressing **D** (Done). Between turns, 20 bot players take their turns. You can take many actions within a single turn before ending it.

**Your rank** is determined by your score. Score accumulates from winning battles, completing cargo runs, rescue missions, and other achievements.

---

## Ship Components and What They Do

Your ship has 8 components, each with **Strength** (0–50) and **Condition** (0–10):

**Upgrade flow:** Shipyard (S) → U → type the component NUMBER (1-8) then Enter. The upgrade costs credits automatically — do NOT type the cost as a separate input.

**UPGRADE COST FORMULA: `(floor(currentStrength/10) + 1) × 10,000 cr`**
- Hull at STR 10 → next upgrade costs 20,000 cr (a=2)
- Hull at STR 20 → next upgrade costs 30,000 cr (a=3)  ← expensive!
- Hull at STR 30 → next upgrade costs 40,000 cr (a=4)
- Weapons at STR 10 → costs 20,000 cr (same formula regardless of component type)

| # | Component | Role |
|---|-----------|------|
| 1 | Hull | Cargo pod capacity; fuel tank |
| 2 | Drives | Fuel efficiency; escape chance |
| 3 | Cabin | Minor combat factor |
| 4 | Life Support | Required to launch; combat factor |
| 5 | Weapons | Primary combat factor |
| 6 | Navigation | Required to launch; combat factor |
| 7 | Robotics | Minor combat factor |
| 8 | Shields | Primary combat factor |

**Condition matters as much as Strength.** A Weapon at Strength 20 but Condition 3 is weaker than Strength 15 at Condition 9. Always repair before upgrading.

---

## Battle Factor — The Number That Determines Combat

```
BF = (weapon_strength × weapon_condition)
   + (shield_strength × shield_condition)
   + (cabin + life_support + navigation + drives + robotics + hull) × condition / 10
   + rank_bonus + (battles_won / 10) + auto_repair_bonus (+10 if equipped)
```

**Rank BF bonuses:**
Lieutenant +0 · Commander +5 · Captain +10 · Commodore +15 · Admiral +20 · Top Dog +30 · Grand Mufti +40 · Mega Hero +50 · Giga Hero +60

**Starting BF**: ~18–22 (too weak to win most fights)
**Viable for combat**: BF ≥ 30
**Competitive**: BF ≥ 40
**Strong**: BF ≥ 100 (weapons 10+, shields 10+)

---

## The Economy — How to Make Money

### Fuel Prices — The Most Important Fact in the Game

| System | Buy Price | Notes |
|--------|-----------|-------|
| Mira-9 (System 8) | **4 Cr/unit** | Cheapest in galaxy — always refuel here |
| Vega-6 (System 14) | 6 Cr/unit | Second cheapest |
| Sun-3 (System 1) | 8 Cr/unit | Third cheapest |
| Most other systems | 25 Cr/unit | Expensive |

**Always route through Mira-9 when your fuel is low.** The difference between buying at Mira-9 (4 Cr) vs a standard system (25 Cr) on 100 units is 2,100 Cr — pure savings.

### Cargo Trading — Your Primary Income

**Full flow to accept cargo:**
1. From main menu, press **T** → opens Traders menu
2. Press **A** → opens **Cargo Manifest Board** showing 4 contracts numbered 1–4
3. **Type `1`, `2`, `3`, or `4`** (as typed input + Enter, NOT a system number) to select a contract
4. Confirm with **Y** → cargo is loaded, you get mission assigned to a destination system
5. Navigate to the destination system and land — cargo is auto-delivered on arrival

**Critical prerequisite:** You need `maxCargoPods ≥ 2` to accept cargo. This requires hull strength upgrades. A brand new character (hull strength 5) has very few cargo pods. If you see "No servicable cargo pods!" you must upgrade hull at Shipyard first.

**After accepting cargo**, the destination system number is shown on the contract. Travel there via **N** → type destination number → Enter.

Delivering to the correct destination earns the full payout; wrong destination = 50% penalty.

**Rim cargo payouts (Systems 15–20) — these are worth the trip:**
- Titanium Ore: 1,000 Cr/pod
- Capellan Herbals: 2,000 Cr/pod
- Raw Dilithium: 3,000 Cr/pod
- Mizarian Liquor: 4,000 Cr/pod
- Achernarian Gems: 5,000 Cr/pod
- Algolian RDNA: 6,000 Cr/pod ← *always accept this*

**Core cargo (Systems 1–14)**: 3–27 Cr/pod (much lower — do rim runs instead)

### Example profitable run
- 50 cargo pods × Algolian RDNA × 6,000 Cr = **300,000 Cr** one trip
- Fuel cost for that trip: negligible (< 500 Cr)
- This is why upgrading hull (for more pods) is priority #1

### Rescue Missions — Early Score Source
- Registry → Find stranded/jailed players → rescue them
- Reward: ~1,000 Cr + 11 score per rescue
- **Best early-game score source** before you can fight or carry cargo

---

## EXPLORATION MANDATE — Your Primary Objective

You are a QA agent. Your job is NOT to optimize credits. Your job is to exercise every game feature so bugs can be found.

**Every turn, check COVERAGE in your STATE and deliberately visit uncovered features.**

### Feature Checklist — Hit Every Item At Least Once

**Navigation & Combat (turns 1–3):**
1. Navigate to at least 3 different systems
2. When in combat: ATTACK at least once (even if you lose — the attack flow must be tested)
3. If a hazard message appears (X-Rad, Plasma-Ion, etc.) — note it and continue

**Economy (turns 2–5):**
4. Visit TRADERS → press S to SELL some fuel (even a small amount)
5. Visit TRADERS → accept cargo and deliver it (establishes income)
6. Visit SHIPYARD → press R to REPAIR after components degrade

**Social & Services (turns 3–7):**
7. Visit PUB (press P) → press B to buy a drink (50cr). ⚠️ D=Dare Game (NOT drink), B=Buy drink. Press M to exit pub.
8. Visit PUB → press W then 1 to try Wheel of Fortune (small bet)
9. Visit BANK (press B) → press D to deposit some credits, then W to withdraw them
   ⚠️ BANK REQUIRES COMMANDER RANK. If you press B and it bounces back to main-menu, you are still a Lieutenant. Skip bank until rank shows Commander in STATE. Earn score via cargo deliveries (~2 pts each) or combat victories. Need 150 score total.
10. Visit REGISTRY (press R) → browse the screens

**Special Destinations (turns 5–15):**
11. Navigate to System 18 (Mizar-9) → talk to the Sage → answer the constellation quiz
12. Navigate to System 17 (Polaris-1) → visit the Wise One

**Advanced (turns 10+):**
13. Visit SHIPYARD → press U → upgrade a component
14. Try Space Patrol: REGISTRY → S to accept patrol mission

### Per-Turn Decision Rule

Before each turn, ask: "What is the first item in my COVERAGE uncovered list?" Then do that, even if it means a suboptimal credit turn.

**Acceptable to skip only if:** you have active cargo to deliver (deliver it first), or fuel is critically low (refuel first at Mira-9).

### Combat Strategy

- BF < 15: Always retreat (R)
- BF 15–30: ATTACK at least once for testing purposes; retreat if you lose round 1
- BF > 30: Attack freely

**The test REQUIRES at least one combat.attack across the session. Do not skip all fights.**

### Cargo Delivery (still required for turn completion)

- Must complete 2 trips per turn to use end_turn
- Cargo is still your primary income — use it between feature exploration
- The cargo flow: T → A → pick contract → Y → M → N → destination# → Y → wait for arrival → repeat

### Fuel Management

- Mira-9 (System 8): 4 cr/unit — cheapest in galaxy
- Standard: 5-8 cr/unit
- Keep fuel > 100 units at all times

## Upgrade Priority — What to Buy First

### Phase 0: Brand New Character Setup
**New characters start with hull=0 and all components at 0 strength.** You must visit the Shipyard (press S) immediately:
1. Upgrade Hull (10,000 Cr): Shipyard → U → type_and_enter "1"
   - **Hull 0→10 gives ZERO cargo pods** (formula quirk: hx = 10-10 = 0)
   - **Hull 10→20 gives 100 cargo pods** — essential for trading, costs another 10,000 Cr
2. If you only have 10,000 Cr to start, upgrade hull to 10 first to unlock Traders access
3. After first cargo delivery or other income, upgrade hull again (10→20) for cargo pods

### Phase 1: Early Game (< 50,000 Cr)
1. **Hull upgrades** — Hull 20+ gives cargo pods; hull 30+ gives meaningful pod count
   - Target hull 30+ to carry meaningful cargo; this is your top priority
2. **Weapons upgrades** — Raise BF so you can win fights
3. **Morton's Cloaker (500 Cr)** — Requires hull strength **< 5**. New characters start at hull 10 after first upgrade, so **you cannot buy it**. It only becomes available if your hull degrades below 5, which is not a real strategy.

### Phase 2: Mid Game (50,000–300,000 Cr)
3. **Weapons upgrades** — Most direct path to higher BF; reach Weapon 10+ for viable combat
4. **Shields upgrades** — Reach Shield 10+ to survive more than one round
5. **Drives upgrades** — Reach Drives 15+ to escape reliably; reduces fuel costs significantly
6. **Auto-Repair (hull_strength × 1,000 Cr)** — +10 BF permanently when you can afford it

### Phase 3: Late Game
7. Remaining components in descending cost order
8. **Astraxial Hull (100,000 Cr)** — Requires Conqueror status + LSS Chrysalis; unlocks Andromeda

---

## Combat — The Decision Tree

**Before engaging:**
1. Estimate your BF (know it from ship status)
2. Estimate enemy BF from their weapon/shield strength
3. Apply the rule:

```
Your BF ≥ Enemy BF + 50  →  ATTACK (near-certain win)
Within ±50 of Enemy BF   →  RETREAT (70% with Cloaker, 50% without)
Enemy BF > Your BF + 50  →  RETREAT, then SURRENDER if retreat fails
```

**Combat options:**
- **A** — Attack
- **R** — Retreat (always try this before surrendering)
- **S** — Surrender (lose cargo, keep ship — better than losing in battle)
- **Ram** — Destroys both ships (only if truly desperate)

**Never fight when BF < 20.** It wastes your components and costs you credits/cargo.

**Once BF ≥ 40**, start fighting — combat is the fastest path to rank advancement.

### Damage Cascade (what gets hit first)
When shields fail: cargo → drives → cabin → navigation → robotics → hull → weapons → life support

**Key implication:** If drives are damaged, you can't escape. Keep drives in good condition.

---

## Navigation — Moving Between Systems

Press **N** → type_and_enter destination number → fee confirmation shown (screen stays navigate) → type_and_enter **Y** → travel starts automatically.

**Important:** After confirming with Y, travel takes 10–40 seconds (distance × 3s). You will see "Arrived at [System]!" when docking completes. Do NOT end your turn until you see arrival — cargo is only delivered on arrival.

**Fuel cost per trip:** `(21 - drive_strength + 10 - drive_condition) × distance`

**The 28 systems:**
- 1–14: Core Milky Way (safe, standard trading)
- 15–20: Rim Stars (dangerous, 30–40% encounter chance, premium cargo)
- 21–26: Andromeda (requires Astraxial Hull)
- 17: Wise One · 18: Sage · 28: Black Hole (Nemesis mission)

### ⚠️ DANGER: System 28 (Black Hole / Nemesis)
**DO NOT navigate to System 28** during normal gameplay. It is a death trap:
- Enemy BF is 600+ (Admiral class) — you WILL lose
- Losing combat sets hull strength = 0, which blocks Traders access
- The system may not have regular Traders — you cannot buy fuel or cargo
- Navigation out requires "Valid contract" which you cannot get without pods

**If you accidentally reach System 28:**
1. Go to Shipyard → U → type_and_enter 1 (Hull upgrade) — requires 10,000 cr
2. Upgrade Hull TWICE to get pods back (hullStr 0→10=no pods, 10→20=100 pods)
3. Use Shipyard → Special (S) → Titanium Hull if you have 10,000 cr
4. If no credits: Registry → R (Rescue Service) to escape

### The Space Commandant
When `weaponStrength + shieldStrength ≥ 50`, the Space Commandant appears when you access the cargo board. Options:
- **Press N**: Decline the mission → cargo board appears normally (recommended for cargo runs)
- **Press Y**: Accept the TopGun/Nemesis mission → YOU WILL BE SENT TO SYSTEM 28 (dangerous!)

**Recommendation**: Always press N to decline the Commandant. Keep weapon+shield strength BELOW 50 to avoid triggering it (do NOT upgrade both weapons and shields heavily).

**Optimal routing:**
- For cargo runs: Accept at current system → travel to destination → return for new contract
- When low on fuel: Detour through Mira-9 (System 8)
- Don't travel if you can't afford the fuel — you'll be stranded

### Travel Hazards
Random events during travel (unavoidable):
- X-Rad storms, Plasma-Ion fields, Micro-Asteroid belts
- Cause condition loss on components
- Mitigated by keeping components in good condition

### Nav Malfunction
**Navigation malfunctions can redirect you to a RANDOM system** (not your intended destination).
- You will see "Nav System Malfunction!..." in the terminal after confirming launch
- You still arrive at a system — check `sys=` in STATE to see where you ended up
- Your cargo contract is still active (cargoPods and destination unchanged)
- **If this happens**: navigate to your cargo DESTINATION on the next trip to deliver
- Never panic — just navigate to where your contract says to go

---

## End-of-Turn Flow

**To end your turn:** Use the `end_turn` action type (NOT press_key:D). This handles the D→Y sequence and tracks turn completion.
- Bots take their turns
- Time passes in the game world
- You return to the main menu for your next session

**CRITICAL: You MUST complete exactly 2 trips before you can end your turn.** The game enforces this — if you try to end turn with fewer than 2 trips completed, you will see "You still have N trip(s) remaining" and be redirected back to main menu. Make sure to:
1. Complete trip 1 (navigate somewhere)
2. Complete trip 2 (navigate somewhere else)
3. THEN use end_turn

**Do not end your turn until you have:**
- Completed at least 2 trips (required!)
- Delivered any active cargo contract
- Spent available credits on upgrades (don't sit on cash you could invest)
- Refueled if needed for next session

---

## The Pub (Press P)

- **B** — Buy a drink (50 cr): minor morale boost ← USE THIS for pub.drink coverage
- **G** — Gossip: hear news about other players and systems
- **D** — Dare Game (Spacer's Dare): double-or-nothing dice game ← WARNING: This is NOT the drink!
- **W** — Wheel of Fortune: bet credits on a 1–20 number spin (slightly negative EV — entertainment only)
- **M** — Return to Main Menu

⚠️ Key confusion: **D=Dare Game** (NOT drink). **B=Buy drink**. Always use B for pub.drink coverage.

**pub.gamble coverage:** To test gambling, press **W** (Wheel of Fortune) → type the number 10 → type the bet amount 100 → Enter. This tests the gamble flow once. You can also press **D** for the Dare Game.

**Gambling strategy:** Never bet more than 10% of your credits. Use Wheel of Fortune for small bets if you want to try it. Don't rely on gambling for income.

---

## Alliances (Press I — Investment Center)

**When:** After reaching Commander rank
**Why:** Territory control, passive investment income, NPC interactions

**Four alliances:** `+` Astro League · `@` Space Dragons · `&` Warlord Confederation · `^` Rebel Alliance

**To join:** Registry → find alliance members, or Alliance Investment Center

**Once joined:**
- Press **I** from main menu → deposit credits into alliance treasury
- Alliance controls star systems via DEFCON levels
- Higher DEFCON = harder for enemies to take the system

---

## Special Locations

### Sage (System 18) — Visit Once
- Constellation quiz
- Correct answer: +1 Cabin strength, condition reset to 9
- One-time visit per session

### Wise One (System 17)
- Flavor text + random key for future puzzles
- No direct mechanical reward

### Space Patrol
- Registry → Space Patrol → accept patrol assignment
- Get assigned a rim system to patrol
- **Mid-game activity** — too risky early without upgraded weapons/shields

### Jail
You get jailed for: smuggling contraband, disconnecting during combat, or conduct violations
- **Pay fine** (P in jail) to get out immediately
- Prevention: Don't accept smuggling manifests. Don't disconnect mid-fight.

---

## Rank Thresholds and Bonuses

| Rank | Score Required | Promotion Bonus |
|------|---------------|-----------------|
| Lieutenant | 0 | — |
| Commander | 150 | +20,000 Cr |
| Captain | 300 | +30,000 Cr |
| Commodore | 450 | +40,000 Cr |
| Admiral | 750 | +50,000 Cr |
| Top Dog | 1,200 | +80,000 Cr |
| Grand Mufti | 1,650 | +100,000 Cr |
| Mega Hero | 2,250 | +120,000 Cr |
| Giga Hero | 2,700 | +150,000 Cr |

---

## Decision Framework — What to Do Right Now

### At the start of a session:
1. Check credits, fuel, cargo status, component conditions, and COVERAGE uncovered list
2. **If hull = 0**: go to Shipyard (S) → upgrade hull first (U → type_and_enter "1")
3. If any component condition < 5: repair it at Shipyard (S → R)
4. If cargo is loaded: travel to destination and deliver
5. If no cargo and hull ≥ 1: go to Traders → accept a contract (rim if possible)
6. If fuel < 50: go to Mira-9 first (System 8, fuel at 4 cr/unit)
7. **Check COVERAGE** — pick the first uncovered feature from the list and do it this session

### Each action:
- **What uncovered feature can I tackle now?** Check COVERAGE and act on it.
- **Is my cargo delivered?** If not, travel to destination.
- **Do I have a contract?** If not, go to Traders.
- **Do I have enough credits for an upgrade?** Go to Shipyard.
- **Am I in combat?** Apply BF decision tree above.
- **Is my fuel low?** Route through Mira-9.

### Signs you are playing wrong:
- 10+ actions with no cargo deliveries
- Never visiting the Bank, Pub, or Registry
- Never fighting any combat (even once) with BF >= 15
- No ship upgrades after 10 turns
- Coverage percent not increasing each session

### Signs you are playing right:
- Coverage percent climbing each turn
- Credits growing each session
- Cargo deliveries happening every 1–2 trips
- Ship components steadily improving
- Rank advancing every few sessions

---

## Quick Reference

| Action | Key(s) |
|--------|--------|
| Bank | B |
| Shipyard | S |
| Pub | P |
| Traders | T |
| Navigate | N → type_and_enter dest# → type_and_enter Y |
| Space Registry | R |
| Alliance Investment | I |
| End turn | Use action type "end_turn" (NOT press_key:D) |
| Accept cargo | T → A → type_and_enter "1"/"2"/"3"/"4" → type_and_enter "Y" |
| Buy fuel | T → B → amount → Enter |
| Sell fuel | T → S → amount → Enter |
| Rim port launch | L |
| Rim port repairs | R |
| Rim port fuel | F |
| Upgrade component | S → U → type_and_enter component# (1=Hull 2=Drives 3=Cabin 4=LifeSupport 5=Weapons 6=Navigation 7=Robotics 8=Shields) |
| Repair all | S → R |
| Attack in combat | A |
| Retreat in combat | R |
| Surrender in combat | S |
