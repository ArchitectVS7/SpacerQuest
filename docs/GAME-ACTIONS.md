# SpacerQuest v4.0 — Complete Game Actions Reference

Every action a player can take, organized by game screen/context.

---

## Onboarding

| Action | How | Details |
|--------|-----|---------|
| Login via OAuth | Click login button | Redirects to BBS Portal, returns with JWT |
| Dev Login | Press `D` on login screen | Creates/reuses first user, issues JWT (museum/dev mode) |
| Create Character | Fill name + ship name, press `C` | Name 3-15 chars; starts at System 1 (Sun-3), 1,000 cr, 50 fuel |

---

## Main Menu

Available from the main menu screen. Key bindings:

| Key | Action | Destination |
|-----|--------|-------------|
| `B` | First Galactic Bank | Banking screen |
| `S` | Galactic Shipyard | Shipyard screen |
| `P` | Lonely Asteroid Pub | Pub screen |
| `T` | Intergalactic Traders | Traders screen |
| `N` | Navigate | Navigation screen |
| `R` | Space Registry | Registry screen |
| `I` | Alliance Investment Center | Investment screen (alliance members only) |
| `Q` | Quit / Logout | Ends session |

---

## Navigation & Travel

### Launch to Destination

- **Screen**: Navigate — type destination system number, press Enter
- **Requirements**:
  - Drives functional (strength >= 1, condition >= 1)
  - Life support functional (strength >= 1, condition >= 1)
  - Navigation functional (strength >= 1, condition >= 1)
  - Hull condition >= 1
  - Sufficient fuel
  - Max 3 trips per day (resets at UTC midnight)
- **Fuel cost**: `base = (21 - drive_strength) + (10 - drive_condition)`, then `fuel = base * distance`, capped at 50
- **Travel time**: `distance * 3` seconds
- **Max fuel capacity**: `(hull_condition + 1) * hull_strength * 10`

### During Travel

| Event | Chance | Details |
|-------|--------|---------|
| **Encounter** | 30% per trip (40% in Rim Stars 15-20) | Combat begins — see Combat section |
| **Travel hazard** | Triggers at 25% and 50% of travel time | X-Rad Shower, Plasma-Ion Cloud, Proton Radiation, or Micro-Asteroid |
| **Course change** | Player-initiated | Costs `hull_strength * 5` fuel; limited to 5 base + 2 per trip |

### Hazard Outcomes

- **With functional shields**: 50% chance to evade; otherwise shields take -1 condition
- **Without shields**: Random component (drives, robotics, navigation, weapons, or hull) takes -1 condition

### Arrival & Docking

- **Landing fee** (if port is owned): `hull_strength * 10 + (15 - systemId) * 10` cr, paid to port owner
- **Cargo delivery**: If carrying cargo to correct destination — auto-delivers on arrival

### Special Destinations

| System | Name | Requirement |
|--------|------|-------------|
| 21-26 | Andromeda systems | Astraxial hull required; black hole transit |
| 27 | Maligna's Lair | Conqueror status + Astraxial hull |
| 28 | Nemesis Coordinates | weapon_strength + shield_strength >= 50 |

### Black Hole Transit (to Andromeda)

- **Requirement**: Astraxial hull, hull condition >= 1, functional drives
- **Fuel cost**: `max(50, 200 - (drive_strength_capped_at_21 + drive_condition) * 5)`

---

## Combat

### How Encounters Start

- 30% chance during any trip (40% in Rim Stars 15-20)
- Enemy type depends on context:

| NPC Type | Where | Bounty |
|----------|-------|--------|
| Pirate (SPX) | Core systems | 500 cr |
| Pirate (SPY) | Core systems | 1,000 cr |
| Pirate (SPZ) | Core systems | 2,000 cr |
| Rim Pirate | Rim Stars (15-20) | 3,000 cr |
| Patrol | Space Patrol missions | Varies |
| Brigand | Smuggling routes | Varies |
| Reptiloid | Andromeda (21-26) | High |

### Friendly NPC

If the NPC shares your alliance, they hail a friendly greeting — no combat occurs.

### Combat Actions

| Action | Key | Details |
|--------|-----|---------|
| **Attack** | `A` | Standard combat round — both sides deal damage |
| **Retreat** | `R` | 50% success if your drive power > enemy's; Cloaker gives 70% success |
| **Surrender** | `S` | Pay tribute: `combat_rounds * 1,000` cr (max 10,000, capped at your credits) |

### Battle Factor (BF)

```
BF = (weapon * condition) + (shield * condition)
   + (cabin * condition / 10) + (robotics * condition / 10)
   + (life_support * condition / 10)
   + rank_bonus + experience_bonus + auto_repair_bonus
```

**Rank BF bonuses**: Lieutenant=0, Commander=5, Captain=10, Commodore=15, Admiral=20, Top Dog=30, Grand Mufti=40, Mega Hero=50, Giga Hero=60

**Experience bonus**: `battles_won / 10`

**Auto-repair bonus**: +10 if equipped

### Damage Calculation

Each round:
- Your weapon power vs enemy shield power — excess damages enemy
- Enemy weapon power vs your shield power — excess damages you
- Damage: `shield_damage = floor(excess / 10)`, `system_damage = excess % 10`
- Random component hit: Cabin, Navigation, Drives, Robotics, Weapons, or Hull — takes -1 condition

### Combat Outcomes

| Outcome | Result |
|---------|--------|
| **Victory** | Credits awarded (bounty), +1 battles won, score increase |
| **Defeat** | Credits lost (tribute), +1 battles lost |
| **Retreat success** | Combat ends, travel continues |
| **Retreat failure** | Enemy prevents escape, combat continues |
| **Surrender** | Pay tribute, combat ends |
| **Draw** | Stalemate, combat ends |

---

## Ship — Galactic Shipyard

### View Ship Status

Press `S` from main menu. Shows all 8 components with strength/condition, fuel, cargo pods, and special equipment.

### Upgrade Component

Press `U`, then select component number, then choose strength or condition upgrade.

| # | Component | Upgrade Price (per +10 STR) |
|---|-----------|----------------------------|
| 1 | Hull | 10,000 cr |
| 2 | Drives | 9,000 cr |
| 3 | Cabin | 8,000 cr |
| 4 | Weapons | 8,000 cr |
| 5 | Shields | 7,000 cr |
| 6 | Life Support | 6,000 cr |
| 7 | Navigation | 5,000 cr |
| 8 | Robotics | 4,000 cr |

- **Strength upgrade**: +10 per purchase (no cap except 209)
- **Condition upgrade**: +1 per purchase (max 9)

### Repair All Components

Press `R`. Restores all components to condition 9. Cost = sum of `(9 - current_condition) * strength` for each component.

### Special Equipment

| Equipment | Price | Requirement | Effect |
|-----------|-------|-------------|--------|
| Morton's Cloaker | 500 cr | Hull strength <= 4 | 70% escape chance on retreat |
| Auto-Repair Module | `hull_strength * 1,000` cr | None | +10 BF bonus in combat |
| Star-Buster++ | — | Awarded directly on Nemesis completion | Special weapon (weapon STR set to 25) |
| Arch-Angel++ | — | Awarded directly on Nemesis completion | Enhanced shields (shield STR set to 25) |
| LSS Chrysalis+* | — | Awarded directly on Nemesis completion | Life support upgrade; required for Astraxial Hull |
| Astraxial Hull | 100,000 cr | Conqueror rank + LSS Chrysalis | +29 hull STR, +190 cargo pods, +2,900 fuel capacity, unlocks Andromeda |

### Component Effects

| Component | Gameplay Effect |
|-----------|----------------|
| **Hull** | Fuel capacity: `(condition+1) * strength * 10`; cargo pods (hull >= 50 grants +50 pods) |
| **Drives** | Fuel consumption; retreat success; black hole transit cost |
| **Weapons** | Combat weapon power: `strength * condition` |
| **Shields** | Combat defense: `strength * condition`; hazard evasion (50% with functional shields) |
| **Life Support** | Required for launch; BF contribution |
| **Navigation** | Required for launch; enables course changes |
| **Robotics** | BF contribution; warning if broken |
| **Cabin** | BF contribution; comfort warning if broken |

---

## Economy — Intergalactic Traders

### Buy Fuel

Press `B`, enter units. Cost = `units * fuel_price`.

| System | Fuel Price |
|--------|-----------|
| System 1 (Sun-3) | 8 cr/unit |
| System 8 (Mira-9) | 4 cr/unit |
| System 14 (Vega-6) | 6 cr/unit |
| All other core systems (2-14) | 5 cr/unit |
| Player-owned port | Custom price set by owner |

### Sell Fuel

Press `S`, enter units. Proceeds = `units * buy_price * 0.5` (50% sell multiplier).

### Accept Cargo Contract

Press `A`. Requires at least 1 cargo pod (hull strength >= 50).

**Core system cargo types** (Systems 1–14):

| Cargo Type | Notes |
|------------|-------|
| Dry Goods | Standard commodity |
| Nutri Goods | Standard commodity |
| Spices | Standard commodity |
| Medicinals | Standard commodity |
| Electronics | Standard commodity |
| Precious Metals | Standard commodity |
| Rare Elements | Standard commodity |
| Photonic Components | Standard commodity |
| Dilithium Crystal | Standard commodity |

**Rim Star cargo types** (Systems 15–20 as destination):

| Cargo Type | Base Payment per Pod |
|------------|---------------------|
| Titanium Ore | 1,000 cr |
| Capellan Herbals | 2,000 cr |
| Raw Dilithium | 3,000 cr |
| Mizarian Liquor | 4,000 cr |
| Achernarian Gems | 5,000 cr |
| Algolian RDNA | 6,000 cr |
| **Contraband** | 1,500 cr (smuggling risk!) |

### Deliver Cargo

Automatic on docking at destination, or press `D` at Traders.

| Delivery Outcome | Payment |
|------------------|---------|
| Correct destination | Full payment + 10% bonus |
| Wrong destination | -5 score points; cargo and fuel emptied; transported via Mark VIII transporter to the correct port at no credit charge |
| Contraband detected | Jailed + 1,000 cr fine |

### Check Contract

Press `C` to view current cargo manifest, destination, and payment.

---

## Banking — First Galactic Bank

**Requirement**: Commander rank or higher. Lieutenants are turned away.

| Action | Key | Details |
|--------|-----|---------|
| Deposit | `D` | Move credits from hand to bank. Enter amount. |
| Withdraw | `W` | Move credits from bank to hand. Enter amount. |
| Transfer to Alliance | `T` | Send credits to alliance investment pool (members only). Enter amount. |
| Return to Main Menu | `R` | Exit bank. |

No interest earned. No fees. Full balance available at all times.

---

## Pub — Lonely Asteroid Pub

| Action | Key | Details |
|--------|-----|---------|
| Gamble | `G` | Opens gambling sub-menu: 1 = Wheel of Fortune, 2 = Spacer's Dare, Q = Leave |
| Buy a Drink | `D` | -50 cr. Flavor text, no mechanical effect. |
| Info | `I` | Game information / help text |
| Quit | `Q` | Return to main menu |

### Wheel of Fortune (Astral Digital)

- Bet up to 1,000 cr
- Pick a number 1-20
- Choose 3-7 rolls
- Odds = `(20 / rolls) - 1`
- Any roll matches your number: win `bet * odds`
- No match: lose bet

### Spacer's Dare (Dice)

- Requires 750 cr minimum
- Choose 3-10 rounds and 1-3x multiplier
- Each round: both sides roll 2d6 (doubles = 0)
- Higher total wins each round
- Payout: `|player_total - computer_total| * multiplier`

---

## Alliance System

### Joining an Alliance

Available at Spacers' Hangout. Four alliances:

| Alliance | Symbol |
|----------|--------|
| Astro League | `+` |
| Space Dragons | `@` |
| Warlord Confederation | `&` |
| Rebel Alliance | `^` |

- **Startup cost**: 10,000 cr investment
- **Limit**: Each alliance capped at 1/3 of total players

### Alliance Investment Center (press `I` from main menu)

| Action | Details |
|--------|---------|
| Invest credits | Deposit personal credits into alliance pool |
| Withdraw credits | Retrieve your invested credits |
| Invest in DEFCON | Spend alliance funds to raise system defense level |
| Alliance Raid | Launch takeover of enemy-controlled system |

### DEFCON System Control

- **Levels**: 1-20
- **Cost per level**: 100,000 cr (levels 1–10) or 200,000 cr (levels 11–20) from alliance pool
- **Takeover**: Must invest more levels than enemy DEFCON to flip control
- **Defense**: Higher DEFCON makes system harder to take over
- Successful raid: enemy control removed, your alliance DEFCON set to 1, +5 score

### Alliance Bulletin Board

Members-only message board:

| Action | Key | Details |
|--------|-----|---------|
| Read posts | `R` | View all messages |
| Write post | `W` | Max 79 chars, auto-tagged with date + your name |
| Kill all posts | `K` | Reset the board |
| Exit | `Q` | Return to previous screen |

---

## Space Registry

Press `R` from main menu.

| Action | Key | Details |
|--------|-----|---------|
| Rescue Service | `R` | Rescue a lost spacer (see Rescue Service section) |
| Space Patrol HQ | `S` | Accept a Space Patrol mission (see Missions section) |
| Library | `L` | Game information and help; contains Alliance Directory as option 9 |
| Quit | `Q` | Return to main menu |

### Spacer Record Shows

- Name, ship name, rank, score, location
- All 8 ship components (strength + condition)
- Fuel, special equipment
- Vital stats: trips, astrecs traveled, cargo delivered, battles won/lost, rescues

---

## Combat Arena (Dueling)

### Arena Types

| Arena | Entry Requirement |
|-------|-------------------|
| Ion Cloud | 50 trips completed |
| Proton Storm | 100 astrecs traveled |
| Cosmic Radiation | 100 cargo pods delivered |
| Black Hole Proximity | 1 rescue performed |
| Super-Nova Flare | 50+ battles won |
| Deep Space | Open to all |

### Arena Actions

| Action | Details |
|--------|---------|
| Post challenge | Set stakes (score points, component strength, or credits) |
| Accept challenge | Fight a posted duel |
| View battle log | See completed duel results |
| List ships | Browse available opponents |

### Stakes

| Type | What Changes Hands |
|------|-------------------|
| Total Points | Winner gains score, loser loses score |
| Ship Component | Winner gains random component strength from loser |
| Credits | Direct credit wager |

---

## Jail & Crime

### How You Get Jailed

| Crime | Trigger | Fine |
|-------|---------|------|
| Smuggling | Caught delivering contraband cargo | 1,000 cr |
| Carrier Loss | Disconnect during battle | 10,000 cr |
| Conduct | Violation of game spirit | 20,000 cr |

### While in Jail

Your name is prefixed with `J%`. Jail screen appears instead of main menu.

| Action | Key | Details |
|--------|-----|---------|
| Pay fine | `P` | Pay the fine amount to Admiral Juris P. Magnus — released immediately |
| Wait for bail | — | Another player can bail you out (costs them double the fine) |

---

## Rescue Service

### Rescuing a Lost Spacer

- **Available**: When a player's ship is marked as lost (`isLost = true`)
- **Requirements**: You have >= 50 fuel and are not lost yourself
- **Cost**: 50 fuel consumed
- **Reward**: 1,000 cr + 11 score points + 1 rescue count
- **Result**: Lost spacer returns to their system

---

## NPC Interactions

### Sage (System 18 — Mizar-9)

- Constellation quiz: match a star name to its constellation
- 13 possible questions (e.g., ALGOL → Perseus, RIGEL → Orion, CAPELLA → Auriga)
- **Correct answer**: Cabin strength +1, cabin condition reset to 9
- **Limit**: Once per session (flag tracked)

### Wise One (System 17 — Polaris-1)

- Gives a cryptic message about special weapons
- Provides a random number key (1-9)
- References Star-Buster++ and Arch-Angel++ found on alien derelicts
- No direct mechanical reward — narrative/flavor only

### Admiral Juris P. Magnus (Jail)

- NPC judge who processes your fine payment
- Releases you from jail on payment

### Friendly Alliance NPCs

- NPCs sharing your alliance symbol greet you as friendly — no combat occurs

---

## Missions

### Space Patrol Mission

- **Acceptance**: Via Registry screen
- **Requirement**: Any rank
- **Reward**: 500 cr base + 1,000 cr per battle won during mission
- **Completion**: Dock at assigned destination

### Smuggling Run

- **Acceptance**: Accept contraband cargo (type 10) at Traders
- **Reward**: 18,000 cr base * multiplier on delivery
- **Risk**: Police patrol interception = jailed + 1,000 cr fine

### Nemesis Mission (Endgame)

- **Requirement**: weapon_strength + shield_strength >= 50 (no battle count or condition requirement)
- **Destination**: System 28
- **Reward**: Conqueror status; Star-Buster++, Arch-Angel++, and LSS Chrysalis+* assigned directly to your ship; life support strength +50; enables Astraxial Hull purchase and Maligna mission

### Maligna Mission (Post-Conqueror)

- **Requirement**: Conqueror status + Astraxial hull
- **Destination**: System 27
- **Resolution**: On docking, mission resolves at Vega-6 (System 14)
- **Reward**: +100,000 cr + 100 score points
- **Significance**: Ultimate achievement in the game

### Alliance Raid

- **Acceptance**: Investment Center
- **Target**: Enemy-controlled system
- **Completion**: Dock at target system
- **Success**: Alliance takes over system, DEFCON set to 1, +5 score points

---

## Rank Progression

Rank advances automatically when your score reaches the threshold.

| Rank | Score Required | Promotion Bonus | Combat BF Bonus |
|------|---------------|-----------------|-----------------|
| Lieutenant | 0 | — | 0 |
| Commander | 150 | 20,000 cr | +5 |
| Captain | 300 | 30,000 cr | +10 |
| Commodore | 450 | 40,000 cr | +15 |
| Admiral | 750 | 50,000 cr | +20 |
| Top Dog | 1,200 | 80,000 cr | +30 |
| Grand Mufti | 1,650 | 100,000 cr | +40 |
| Mega Hero | 2,250 | 120,000 cr | +50 |
| Giga Hero | 2,700 | 150,000 cr | +60 |

### Score Sources

| Event | Points |
|-------|--------|
| Battle victory | Varies by enemy class |
| Cargo delivery | Varies by cargo type |
| Rescue performed | +11 |
| Alliance raid completion | +5 |
| Maligna mission completion | +100 |

---

## Port Ownership

| Action | Details |
|--------|---------|
| Purchase port | 100,000 cr at any system |
| Sell port | 50,000 cr (50% refund) |
| Set fuel price | Owner controls local fuel price |
| Collect landing fees | `hull_strength * 10 + (15 - systemId) * 10` cr per visitor |
| Station guards | 10,000 cr monthly for defense |
| Eviction | 30 days of inactivity = port lost |

---

## Daily Limits & Resets

| Mechanic | Limit | Reset |
|----------|-------|-------|
| Trips per day | 3 completed | UTC midnight |
| Sage visit | Once per session | New login |
| Patrol sector | Random assignment | Daily |

---

## Starting Values (New Character)

| Attribute | Value |
|-----------|-------|
| Credits | 1,000 |
| Fuel | 50 |
| System | 1 (Sun-3) |
| Rank | Lieutenant |
| Hull | STR 5 / COND 9 |
| Drives | STR 5 / COND 9 |
| Cabin | STR 1 / COND 9 |
| Life Support | STR 5 / COND 9 |
| Weapons | STR 1 / COND 9 |
| Navigation | STR 5 / COND 9 |
| Robotics | STR 1 / COND 9 |
| Shields | STR 1 / COND 9 |
| Cargo Pods | 0 (need hull >= 50) |
| Special Equipment | None |
