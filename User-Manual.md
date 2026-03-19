# Spacer Quest — Original User Manual

*Reverse-engineered from the ACOS source code (Version 3.4, 1991, Apple II BBS game by Firefox)*

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Onboarding — First Login Through First Turn](#2-onboarding)
   - [2.1 Creating Your Character](#21-creating-your-character)
   - [2.2 The Space Port Operations Screen](#22-the-space-port-operations-screen)
   - [2.3 The Main Terminal — Your Hub](#23-the-main-terminal--your-hub)
   - [2.4 Your First Ship Purchase](#24-your-first-ship-purchase)
   - [2.5 Your First Cargo Run](#25-your-first-cargo-run)
   - [2.6 In-Flight: The Ship Bridge](#26-in-flight-the-ship-bridge)
   - [2.7 Docking and Collecting Pay](#27-docking-and-collecting-pay)
   - [2.8 Daily Turn Limits](#28-daily-turn-limits)
3. [Game Screens](#3-game-screens)
   - [3.1 Space Port Operations](#31-space-port-operations)
   - [3.2 Space Port Terminal (Main Hub)](#32-space-port-terminal-main-hub)
   - [3.3 Shipyards](#33-shipyards)
   - [3.4 Roscoe's Ye Olde Speede Shoppe](#34-roscoes-ye-olde-speede-shoppe)
   - [3.5 Launch Bays](#35-launch-bays)
   - [3.6 Cargo Dispatch](#36-cargo-dispatch)
   - [3.7 Ship Bridge (Warp Screen)](#37-ship-bridge-warp-screen)
   - [3.8 Spacers Hangout (Bar)](#38-spacers-hangout-bar)
   - [3.9 Space Port Registry](#39-space-port-registry)
   - [3.10 Financial Section](#310-financial-section)
   - [3.11 Space Realty](#311-space-realty)
   - [3.12 Alliance Holdings](#312-alliance-holdings)
   - [3.13 Alliance Banking and Trust](#313-alliance-banking-and-trust)
   - [3.14 Dueling Arena](#314-dueling-arena)
   - [3.15 Extra-Curricular Menu](#315-extra-curricular-menu)
   - [3.16 The Space Brig (Phobos Brig)](#316-the-space-brig-phobos-brig)
   - [3.17 Damage Repairs](#317-damage-repairs)
4. [Game Features](#4-game-features)
   - [4.1 The Galaxy — Star Systems](#41-the-galaxy--star-systems)
   - [4.2 The Andromeda Galaxy](#42-the-andromeda-galaxy)
   - [4.3 Alliances](#43-alliances)
   - [4.4 Factions and NPC Ships](#44-factions-and-npc-ships)
   - [4.5 Special Encounters and NPCs](#45-special-encounters-and-npcs)
   - [4.6 Ship Components](#46-ship-components)
   - [4.7 Combat System](#47-combat-system)
   - [4.8 The Scoring System](#48-the-scoring-system)
   - [4.9 Gambling Games](#49-gambling-games)
   - [4.10 Win Conditions](#410-win-conditions)
5. [Strategy](#5-strategy)
   - [5.1 Getting Started — The First Week](#51-getting-started--the-first-week)
   - [5.2 Building a Dominant Ship](#52-building-a-dominant-ship)
   - [5.3 Maximizing Credits](#53-maximizing-credits)
   - [5.4 Combat — Beating Other Players and NPCs](#54-combat--beating-other-players-and-npcs)
   - [5.5 Alliance Play — Collective Power](#55-alliance-play--collective-power)
   - [5.6 Advanced Missions — The Endgame](#56-advanced-missions--the-endgame)
6. [Appendix A: Rank Progression](#appendix-a-rank-progression)
7. [Appendix B: NPC Ship Roster](#appendix-b-npc-ship-roster)
8. [Appendix C: Commands Quick Reference](#appendix-c-commands-quick-reference)

---

## 1. Introduction

Spacer Quest is a multi-player space trading and combat game originally written in 1991 by **Firefox** for operation on an Apple II BBS (Bulletin Board System). It was designed to be played over a modem, with multiple players logging in and out of the same shared game world — meaning your rivals could attack your alliance holdings, bail you out of jail, or scavenge your wreck while you slept.

The setting is the **Milky Way Galaxy**, centered on **Sun-3** (a thinly veiled future Earth). Fourteen civilized star systems form the core of known space, each with a Space Port, a market for cargo, and services ranging from shipyards to bars. Six recently-charted **Rim Star Worlds** lie at the galaxy's edge — wilder, more profitable, and far more dangerous. Beyond them, reachable only through a black hole, is the **Andromeda Galaxy** with six exotic alien star systems.

The game plays like a terminal window. Every screen is 80 columns of ASCII text. You navigate by pressing single-key commands. The world is live: other players see the same visitor logs, the same market prices, the same battle records you do. Your ship persists between sessions; get destroyed and you're left floating in space, hoping a fellow spacer pays for your rescue.

**What you do:**
- Buy and upgrade a space ship
- Haul cargo between star systems for credits
- Fight (or bribe) pirate ships that intercept your runs
- Join an alliance for protection, banking, and collective territory control
- Smuggle contraband, raid rival alliance holdings, go on Space Patrol
- Pursue legendary end-game missions: destroy the rogue star **Maligna**, recover the **Nemesian Star Gems**, and explore the **Andromeda Galaxy**
- Accumulate **10,001+ total points** to be inscribed in the Great Book of Heroes

---

## 2. Onboarding

### 2.1 Creating Your Character

When you first connect and your name is not found in the player database, the system creates a slot for you automatically:

```
Wait a sec' while we create one for you.
```

You are sent to the character creation module (`sp.sysop, newspcr`) where you enter:
- **Your spacer name** (your handle)
- **Your ship name** (displayed in battle logs and leaderboards; must be at least 4 characters)

You begin with **10,000 credits** (shown as `10,000 cr`) and no ship. Your score starts at 0.

### 2.2 The Space Port Operations Screen

After character creation, every login drops you at the **Space Port Operations** screen at Sun-3, which displays the current date, your credits, and a command prompt:

```
[: Sun-3 Operations :][: Cr: 10,000 :]: Command:
```

**Available commands:**

| Key | Action |
|-----|--------|
| `B` | Alliance Bulletins — news posted by alliance members |
| `K` | Battles Fought Log — complete battle history for the BBS |
| `V` | Visitor Log — who has logged in today |
| `G` | Space News / Great Heroes list |
| `H` | Help File — the complete in-game documentation |
| `M` | Spatial Map of the star systems |
| `N` | New Spacer Role — restart your character from scratch (costs all credits) |
| `P` | Port Fuel Prices — table of all 14 ports: owner, fuel buy/sell price |
| `S` | Space Heroes — Hall of Fame |
| `[Enter]` | Proceed to the Main Terminal (the game hub) |

> **Tip:** Press `M` and then `L` for the full star system legend before your first flight.

### 2.3 The Main Terminal — Your Hub

The **Space Port Terminal** is the central navigation screen from which all sections of the game are accessible. It displays a layout like this (from `SP.LAYOUT`):

```
Launch Pad — Fuel Depot — Launch Bays
Library — Repair Shop — Financial Section
Rescue Service — Registry — [TERMINAL] — Shipyards
Space Patrol — Bar (Spacers Hangout) — Operations — Speede Shoppe
Secret Pad — Games — Cargo — Dueling Arena
```

Press the appropriate letter to move to any section. All game activities flow through this hub.

### 2.4 Your First Ship Purchase

Navigate to the **Shipyards** from the Terminal. You must buy a hull before you can fly anywhere.

**Hull prices** (you start with 10,000 cr):

| # | Hull Name | Price |
|---|-----------|-------|
| 1 | Reliable | 50 cr |
| 2 | Flyer | 100 cr |
| 3 | Racer | 200 cr |
| 4 | Viper | 400 cr |
| 5 | Tiger | 800 cr |
| 6 | Mark IV | 1,500 cr |
| 7 | Dreadnought | 3,000 cr |
| 8 | Invincible | 5,000 cr |
| 9 | Battle Star | 10,000 cr |

After buying a hull, buy at least:
- A **Drive** (for propulsion — determines travel speed and fuel use)
- **Weapons** (to fight pirates)
- **Shields** (to survive combat)

Each component type has 9 tiers from 50 cr to 10,000 cr. All components start at full condition (10/10). Press `P` to view ASCII art of each hull class before buying.

**Recommended starter loadout (~2,000–3,000 cr total):**
- Hull: Racer (#3, 200 cr)
- Drive: Ram Scoop (#3, 200 cr) — better speed, less fuel
- Weapons: Laser Guns (#3, 200 cr)
- Shields: Atomic (#3, 200 cr)
- Cargo Pods: 10–20 pods at 10 cr each

> **Note:** Hulls 1–4 can accept **Morton's Cloaking Device** (available at the Speede Shoppe), which makes you invisible to pirates on legal cargo runs. Once you upgrade to Hull 5+, you permanently lose cloaker eligibility.

### 2.5 Your First Cargo Run

Navigate to **Cargo Dispatch** from the Terminal. The cargo office offers up to **4 daily manifests**. Choose one:

The system presents a contract showing:
- **Cargo type** (e.g., "Industrial Parts")
- **Destination** star system
- **Pay** (calculated from distance, cargo value, and your pod count)
- **Fuel required**

Accept the contract. It is **iron-clad** — you cannot abandon it except by replacing your entire hull or joining the Space Patrol. Delivering to the wrong port results in your ship being teleported (with cargo and fuel stripped) to the correct port.

Up to **3 cargo trips** may be completed per real-world day. After your third trip the cargo office closes for the day.

### 2.6 In-Flight: The Ship Bridge

After launching from the **Launch Bays**, you enter the animated **Ship Bridge** screen. A starfield fills the right side; your command panel is on the left.

**In-flight commands:**

| Key | Action |
|-----|--------|
| `D` | Data Banks — view ship stats, Space Map, help |
| `N` | Navigation — view/change course |
| `W` | Weaponry — view weapon and shield status |
| `?` | Show the in-flight command menu |
| `Q` | Quit / Emergency teleport (10% chance of getting Lost In Space) |

The bridge shows a live countdown:
```
[:Ship Bridge:][Fuel: 47 ][:Chronos:  [ 12 ]]
```
- **Fuel** counts down as you travel
- **Chronos** counts up toward your **ETA** (estimated time of arrival)
- When **Chronos = ETA**, `[Destination Arrived]` flashes and you dock automatically

**Hazards in flight:**
At various points in the trip, hazard events may fire: X-Rad Showers, Plasma-Ion Clouds, Proton Radiation, and Micro-Asteroids can damage random ship components. Shields (if installed) have a chance to absorb these.

**Pirate encounters:**
At random intervals, pirates intercept you. You'll see:
```
...Intruder Alert.....
Battle Computer: [+] Battle Stations [+]
```
The battle begins automatically (see Section 4.7).

### 2.7 Docking and Collecting Pay

On arrival, the docking sequence plays:
```
...Grind...Crunch...Bump...Scrape...Clank...Swoosh... Click!
......Docking Completed....the [ShipName] is secured.
```

If you carried a valid cargo contract to the correct destination, your pay is credited immediately. The system also asks if you require **Damage Repairs** before returning you to the Terminal.

### 2.8 Daily Turn Limits

Two separate daily limits are enforced simultaneously:

**Login sessions — hard limit of 2 per day.** The game tracks how many times you have logged in today (`t1` variable). After your second login session ends, re-connecting shows:

```
You have completed 2 turns through Spacer Quest today
.....The Wonders of Space Await You......
...........Please call again tomorrow........
```

This is the outer boundary. No matter how few cargo trips you've taken, a third login that same day is blocked. The Sysop can configure the wait duration before showing this message (the `ku` variable in `sp.conf`).

**Cargo trips — separate limit of 3 per day.** The Cargo Dispatch office tracks your completed deliveries today (`z1` variable). After your third completed cargo trip, the office closes for the day regardless of how many login sessions remain:

```
Cargo office closed — come back tomorrow
```

These two limits are independent. You could use both login sessions for non-cargo activities (raiding, patrol, arena) without burning your cargo quota, or complete all three cargo trips within a single session. Plan accordingly.

---

## 3. Game Screens

### 3.1 Space Port Operations

The first screen after login. Displays current BBS date and your credits balance. Acts as a daily news hub — check the **Alliance Bulletins** (`B`), **Battles Log** (`K`), and **Visitor Log** (`V`) to understand the current state of play before heading to the Terminal.

**Port Fuel Prices (`P`)** is particularly useful: it shows a real-time table of all 14 core ports including current owner, alliance affiliation, and both the buy and sell price for fuel at each port's depot. Use this to plan refueling stops.

---

### 3.2 Space Port Terminal (Main Hub)

The central navigation hub. Displayed as an ASCII floor plan. All major sections branch from here. There is no explicit menu displayed — you type the key for your destination.

---

### 3.3 Shipyards

The shipyard sells eight types of ship components (each in 9 strength tiers) plus cargo pods.

**Component types and their roles:**

| Component | Role in-game |
|-----------|-------------|
| **Hull** | Determines max cargo pods, speed cap, eligibility for Cloaker and Astraxial upgrade |
| **Drive** | Primary speed determinant; higher drive = faster travel, less fuel consumed |
| **Cabin** | Contributes to Battle Factor; quality of life |
| **Life Support** | Affects B/F; damaged life support is dangerous (Space Patrol tip: "Space Patrol knows about life support") |
| **Weaponry** | Combat attack power; required to engage pirates effectively |
| **Navigation** | Accuracy of manual course changes; damaged nav causes course errors |
| **Robotics** | Battle Computer — essential for combat; without it your shields/weapons won't fire properly |
| **Shields** | Combat defense; absorbs hits before hull takes damage |

**Cargo Pods:** 10 cr each. Both store cargo and act as insulating armour (more pods = slightly more hull effective condition in battle).

**Upgrade path:** You can return to the shipyard at any time to upgrade individual components. Your old component is replaced; there is no trade-in credit.

**Component tier names** (examples for reference):

| Tier | Drive | Weapon | Shield |
|------|-------|--------|--------|
| 1 | Pulse | Atomic Missile | Power |
| 2 | Reaction Mass | Phasor Guns | Hi-Energy |
| 3 | Ram Scoop | Laser Guns | Atomic |
| 4 | Plasma Ion | Plasma Flamer | Protector |
| 5 | Anti-Matter | Photon Torps | Guardian |
| 6 | Ultra-Grav | Ion Disrupts | Guardian-II |
| 7 | Supra-Grav | Particle Ray | Guardian-][  |
| 8 | Photonic | Neutron Beam | Carapace-XM |
| 9 | Harmonic | Astral ASDRS | ION-MAG Shield |

---

### 3.4 Roscoe's Ye Olde Speede Shoppe

An upgrade shop offering exotic enhancements and special weapons not available in the standard shipyard.

```
][*][:=-   Roscoe's Ye Olde Speede Shoppe   -=:][*][
```

**Standard inventory:**

| # | Item | Price | Effect |
|---|------|-------|--------|
| 1 | Titanium Hull Reinforcement | 10,000 cr | Strengthens hull class |
| 2 | Trans-Warp Accelerator Card | 9,000 cr | Increases drive strength |
| 3 | Kool Rad Pad | 3,000 cr | Cabin upgrade |
| 4 | The Good Life — Life Support | 5,000 cr | Life support upgrade |
| 5 | Speedo Multi-Fire | 8,000 cr | Weapon upgrade |
| 6 | Darkover Navigation Gem | 6,000 cr | Navigation upgrade |
| 7 | Robbie The Robot | 4,000 cr | Robotics upgrade |
| 8 | Force Field Enhanced Shields | 7,000 cr | Shield upgrade |
| 9 | Special Armament Section | varies | Special weapons (rank-gated) |
| A | Armament Assessment | free | Shows current weapon/shield ratings |
| X | Ship Stats | free | Full ship readout |
| Q | Leave Shoppe | — | Return to Terminal |

**Special Armament Section (`9`):** Access is gated by Space Patrol rank (`jw`/`jx` thresholds). The highest-tier weapons — including the **Star-Buster Siege Weapon** and **Archangel Shield System** needed for the Maligna mission — are only available here, and only to sufficiently ranked Patrol officers.

**Morton's Cloaking Device:** Available to hulls 1–4 only (ships with a shield name ending in `=`). When active, you can toggle cloaking on/off during flight with the spacebar. Cloaked ships are invisible to pirate detection. Note: the cloaker can malfunction (cabin condition check), and it is permanently stripped if you upgrade to hull 5+.

**Roscoe's upgrade service:** Roscoe can rebuild wasted (condition=0) components for a fee of **+2,000 cr**. Enhanced (Speede Shoppe) components that reach condition=0 lose their enhancement permanently and revert to a base component.

---

### 3.5 Launch Bays

The departure point for all space travel within the 14 core systems and beyond.

```
__L_A_U_N_C_H___B_A_Y_S__
(L) Launch Sequence
(F) Fuel Depot
(M) Space Map
(X) Space Ship Stats
(Q) Quit This Section
(H) Help File
(?) This Menu
```

**`L` — Launch Sequence:** Initiates a cargo run, patrol mission, or free flight. The Launch Control Officer inspects your documents. Launch fees are assessed based on your pod count and the prestige of the port. Allied alliance members receive a discount at ally-owned ports.

**`F` — Fuel Depot:** Buy fuel for your trip. The port owner sets the sell price (0–50 cr/unit). The displayed "Port Fuel Prices" screen (`P` from Operations) shows all 14 ports' prices so you can plan cheap refueling stops.

**`M` / `X`:** Quick access to the star map and your ship stats without going back to the Terminal.

> **Secret Launch Pad:** Pirates and those with forged papers can launch from a hidden pad in the forest, bypassing all launch fees and document checks. Access is through the Spacers Hangout smuggling route.

---

### 3.6 Cargo Dispatch

Up to **4 cargo manifests** are posted daily. You may accept one, launch, deliver, and repeat — but the office **closes after your 3rd completed trip** or if you re-enter the same day after trips are exhausted.

**Contract terms:**
- The contract specifies cargo type, destination, pod requirement, and pay
- Pay formula: `PAY = ((cargo_value × distance / 5) × serviceable_pods) + fuel_cost + 1,000`
- **Serviceable Pods** = `(pod_condition × number_of_pods) / 10`
- Contracts are iron-clad — if you deliver to the wrong port, you are teleported (with cargo and fuel stripped) to the correct destination

**Cargo types vary by region:**
- Core systems (1–14): Standard galactic commodities
- Rim Worlds (15–20): Triple pay, but higher fees
- Andromeda (NGC systems): Exotic goods — Dragonium Ore, Rarium Gems, Merusian Liquor, Mystium Ore, Clyrium Crystal, Oreganol Herbs, Infernum Spice, etc.

---

### 3.7 Ship Bridge (Warp Screen)

The in-flight interface. Seven animated ASCII starfield backgrounds cycle (SP.MENU5A–G) reflecting flight conditions:

| Background | Condition |
|-----------|-----------|
| 5A | Normal flight |
| 5B | Near Maligna approach zone |
| 5C | Near Maligna (closer) |
| 5D | Rim World run |
| 5E | Andromeda Galaxy (dense star field) |
| 5F | Andromeda, black hole transit imminent |
| 5G | Navigation system malfunctioning (garbled display) |

**In-flight commands:**

| Key | Action |
|-----|--------|
| `D` | Open Data Banks sub-menu (map, ship stats, help, rename ship) |
| `N` | Navigation — view current course; initiate manual override |
| `W` | Weaponry — view weapon/shield status, battles won/lost |
| `?` | Display command menu |
| `Q` | Emergency teleport to main level (10% chance of Lost In Space) |

**Manual Navigation (`N`):**
- Each trip allows **3 course changes** maximum
- Each course change costs extra fuel: `hull_strength × 5` fuel units
- Course changes also add time to your ETA
- Navigation accuracy depends on your navigation component; a damaged nav system may lock you to the wrong destination
- Special destinations require entering X-Y-Z coordinates: Maligna is `X:13 Y:33 Z:99`; Nemesis requires `X:00 Y:00 Z:00` (during the Nemesis mission)

**Black Hole Transit:**
When entering the black hole (to Andromeda), a dramatic screen sequence plays. You must press Space to attempt a controlled entry. Transit may damage a random ship component by subtracting from its strength — Astraxial hull owners fare much better.

---

### 3.8 Spacers Hangout (Bar)

Located on Sun-3 only. The social hub and gateway to several hidden game mechanics.

```
Welcome to The Spacers Hangout!
[: Credits :][Spacers Hangout]:  (G)amble  (D)rinks  (I)nfo  [Q]uit
```

**`G` — Gamble:** Links to the Games section (see Section 4.9).

**`D` — Drinks:** Each drink decreases your inhibitions (and unlocks more bartender hint codes after 4+ drinks).

**`I` — Information:** The bartender responds to keyword queries. After 4+ drinks, extra hints appear automatically:

| Keyword | Information Given |
|---------|-----------------|
| `ALL` | How to join an alliance |
| `MAL` | Info about Maligna (the rogue star) |
| `WIN` | "Have the best ship and the most wealth" |
| `WEA` | "Star Buster is the Big Gun" |
| `SHI` | "ARCH-ANGEL Shield is the best" |
| `PIR` | "Pirates attack Cargo Transports" |
| `DRI` | "Better Drives increase speed" |
| `ROB` | "Robotic/Computer needed in battle" |
| `NAV` | "Manual Navigation is tricky business" |
| `LIF` | "Space Patrol knows about life support" |
| `HUL` | "Titanium strengthened hulls best" |
| `COO` | "MALIGNA's coordinates are 13-33-99" |
| `CLO` | "Special armour for smaller ships" |
| `RAN` | "Access increases with rank" |
| `BAT` | "B/F = Hull/Rank/Drives/#Trips/Life/#Wins" |
| `SPA` | "Owning a Space Port generates income" |
| `STA` | "Treasure can be found in the Rim Stars" |
| `RIM` | "Rim Star Worlds found in flight" |
| `SMU` | Opens smuggling contract menu |
| `GEM` | "Gems contain an infinity of answers" |
| `SAG` | "Try Mizar-9" (find The Sage) |
| `WIS` | "Try Polaris-1" (find the Wise One) |
| `CHR` | "Chrysalis is best life support system" |
| `RAI` | Explains corporate raiding mechanics |
| `FIR` | "Firefox wrote this entire dad-blamed game" |

**Alliance Membership:** Type `ALLIANCE` (or just respond `Y` to the join prompt that appears after you ask `ALL`). You are shown the four alliances and press `+`, `@`, `&`, or `^` to join. You must be Lieutenant rank or higher. Joining is free; switching alliances costs all your credits and your space port (if you own one).

**Smuggling (`SMU`):** The Syndicate offers a contraband delivery run:
- You must have at least 10 cargo pods
- The destination is randomly chosen (not your home system)
- Pay: approximately `14,000 + (100 × distance) - (hull_strength × 500)` credits
- Risk: Space Patrol intercepts you mid-flight (`kk=5`). If caught, your cargo is confiscated and you are branded with the `J%` prefix (jailed status)
- Maximum **2 smuggling runs** before the Syndicate shuts down (Patrol awareness increases)

**Corporate Raiding (`RAI`):** Organize an armed raid on an enemy alliance's star system holding. You receive forged papers, load "Plans for Raid" as your cargo, and fly to the target system. On arrival (if you win the battle against the system's guards), you take ownership of the holding for your alliance. This uses your last trip for the day.

---

### 3.9 Space Port Registry

```
[_]__S_P_A_C_E__P_O_R_T__R_E_G_I_S_T_R_Y__[_]
(L) Library Data Banks
(R) Rescue Service
(S) Space Patrol
(?) This Menu
(Q) Quit Registry
```

**`L` — Library Data Banks:**

| # | Function |
|---|---------|
| 1 | Space Port Layout (ASCII floor plan) |
| 2 | Visitors' Log (who's been on today) |
| 3 | Detailed Help File |
| 4 | Directory of Ships (all registered ships) |
| 5 | Game Formulae (ETA, Fuel, Pay, B/F calculations) |
| 6 | Re-Name Your Ship |
| 7 | Documentation |
| 8 | Top Gun List |
| 9 | Directory of Alliances |

**`R` — Rescue Service:** If you are "Lost In Space" (ship destroyed in battle or `Q`-quit mid-flight with bad luck), your record is added to the lost ships log. Another player can visit the Rescue Service to retrieve you — they pay 500 cr, and you owe them nothing (but may wish to pay back in kind). If you have enough credits when rescued, the 500 cr fee is auto-deducted from your account.

**`S` — Space Patrol Headquarters:**

```
Space Patrol Headquarters
(K) System Key
(J) Join The Force
(C) Choose System
(L) Go on Patrol
(O) Orders
(?) Menu
(Q) Quit
```

The Space Patrol is a faction you join by meeting rank requirements. Once joined:
- You receive a **patrol assignment** (a star system to protect)
- Fuel is loaded for free (courtesy of The Space Patrol)
- Your ship receives Patrol insignia
- You fly to your assigned system and intercept pirate ships
- Rank determines access to advanced weapons in the Speede Shoppe

Patrol ranks include Lieutenant and above. Higher ranks unlock Special Armament Section access.

---

### 3.10 Financial Section

```
Financial Section
(P) Space Realty/Ports
(A) Alliance Holdings
(B) Alliance Banking
[Q] Return to Terminal
(?) This Menu
```

Three distinct financial sub-systems. See Sections 3.11–3.13.

---

### 3.11 Space Realty

```
_S_P_A_C_E__R_E_A_L_T_Y_
(B) Buy Space Port
(S) Sell Space Port
(W) Withdraw Funds
(D) Deposit Funds
(N) Port Fees Report
(P) Prospectus
(M) Port Activity
(F) Fuel Business
(?) This Menu
(Q) Quit This Section
```

**Buying a Space Port (`B`):** Purchase one of the 14 core system ports when it is listed for sale. Ports generate launch fee income whenever other spacers depart from that system.

**Launch fees** accumulate in a savings account. You withdraw them with `W`. The Prospectus (`P`) shows projected fee income based on traffic history.

**Fuel Business (`F`):** As port owner, you set the fuel sell price (0–50 cr/unit). Other spacers who buy fuel at your depot pay the price you set; you receive 50% of that amount deposited to your savings account. The other 50% is the cost of buying the fuel at 10 cr/unit.

**Owning a Port:**
- Your ship name appears in the port ownership column of all fuel price listings
- Your alliance symbol appears alongside your port (if you are a member)
- You can only own one port at a time
- Switching alliances costs you your port

---

### 3.12 Alliance Holdings

```
Alliance Investments Menu
(N) Alliance Activity
(S) List of Holdings
(I) Invest in Star
(W) Withdraw Funds
(D) Deposit Funds
(F) Fortify Holdings
(T) Take-Over
(P) Password Change
(H) Help!
(?) This Menu
[Q] Quit this section
```

This is the collective territory control mechanism. Any alliance member can invest credits into a star system "holding."

**`I` — Invest in Star:** Deposits credits into the chosen star system's holding account. All alliance members pool funds here. Holdings earn **daily interest** proportional to the DEFCON level.

**`F` — Fortify Holdings:** Once a holding exceeds 99,999 cr, you can raise its **DEFCON level** (1–9). Each DEFCON level costs 100,000 cr and provides 100 points each of additional Weapons and Shielding that raiders must defeat:

```
DEFCON 3 = 300 Weapons + 300 Shielding defending the system
```

**`T` — Take-Over:** Confirm control of a raided system after a successful armed raid (see Bar section, `RAI`).

**Win Condition:** If your alliance controls a majority of the 14 core star system holdings, the Sysop may declare an **Alliance Victory** and optionally reset the game.

---

### 3.13 Alliance Banking and Trust

```
Alliance Banking and Trust
(N) Bank Account Action
(W) Withdraw Funds
(D) Deposit Funds
(P) Password Change
(H) Help!
(?) This Menu
(Q) Quit this section
```

A shared alliance bank account. No interest. All alliance members can deposit or withdraw.

**Use cases:**
- Transfer credits to an ally who needs emergency funds
- Pool resources for a large ship upgrade
- Bail out a jailed alliance member

**Warning:** Anyone in your alliance can withdraw. Trust matters.

---

### 3.14 Dueling Arena

```
(R) Roster of Contenders      (1) Set-up to be Contender
(B) Battle Log                (2) Challenge Contender
(V) View Duel Combat          (3) Cancel Duel
         (O) Options Documentation
(L) List of Space Ships       (X) Ship Stats
(?) This Menu                 [Q] Leave Arena
```

The Dueling Arena allows PvP duels with agreed-upon stakes.

**Arena Types** (each requires a qualifier):

| Arena | Qualifier Required |
|-------|-------------------|
| Ion Cloud Arena | Completed trips / 50 |
| Proton Storm Arena | Astrecs travelled / 100 |
| Cosmic Radiation Arena | Cargo delivered / 100 |
| Black Hole Proximity Arena | Rescues × 10 |
| Super-Nova Flare Arena | (Battles won + 1000) − Battles lost |
| Deep Space Arena | No conditions — open to all |

**Stakes Options:**
- Portion of total points proportional to handicap
- Ship component strength proportional to handicap
- Credits on hand equal to (Handicap × 10,000)

To duel: set yourself up as a Contender (`1`), then wait for another spacer to challenge you (`2`). View combat logs with `V`.

---

### 3.15 Extra-Curricular Menu

```
[:  Extra-Curricular Menu  :]
(P)  Pirate Activity
(S)  Squadron Star Patrol
(C)  Control Smugglers
(W)  Dueling Arena
[R]  Return to Space Terminal
(Q)  Quit Game
```

This menu manages your active pirate or patrol career when you have enlisted in extracurricular activities.

**`P` — Pirate Activity:** Review your pirate operations summary: battles won, battles lost, looted credits, system assignment.

**`S` — Squadron Star Patrol:** Review your patrol assignment summary.

**`C` — Control Smugglers:** Manage smuggling contracts (Sysop tool).

---

### 3.16 The Space Brig (Phobos Brig)

```
_____________P_H_O_B_O_S___B_R_I_G______________
|     +    Juris P. Magnus, Magistrate   _\/_    |
```

Accessible from the Spacers Hangout via `B` (on Sun-3 only). Shows all currently jailed spacers with their cell number and ship name.

**How you end up here:**
- Caught smuggling contraband (your name is prefixed with `J%`)
- Carrier-loss (disconnecting during a battle — the most serious offense)

**Fines:**
- Smuggling: 2,000 cr
- Carrier-loss / serious offenses: 20,000 cr

**Bail:** Any spacer can pay your bail at **double the fine** to release you immediately. If you cannot pay, you must appeal to fellow spacers on the BBS bulletin board (per Admiral Juris P. Magnus).

---

### 3.17 Damage Repairs

Accessible from the Launch Bays, the Shipyards, or automatically offered upon docking after a trip.

Press `R` to **Repair All** components at once. Individual components can also be repaired selectively. Costs vary by location:
- Core system ports: standard rate
- Rim World ports: significantly more expensive

**Wasted components** (condition = 0): Can be rebuilt for **+2,000 cr** over the standard repair cost. Enhanced components (from the Speede Shoppe) that reach condition 0 lose their enhancement permanently upon rebuild.

**Auto-Repair Module:** An advanced robotics component repairs one damaged component automatically after each battle.

---

## 4. Game Features

### 4.1 The Galaxy — Star Systems

**Spatial Map:**
```
      -*-10            -*-7
                                     -*-13
               -*-5                         -*-6
      -*-2                                      -*-11
             -*-[1]
                                              -*-12
                -*-4            -*-3
                                    -*-9  -*-8
                                                 -*-14
```
*(System 1 = Sun-3, center of civilization)*

**The 14 Core Star Systems:**

| # | System | Role / Notes |
|---|--------|-------------|
| 1 | **Sun-3** | Hub of civilization; Spacers Hangout; Brig; all services available |
| 2 | **Aldebaran-1** | Core trading system |
| 3 | **Altair-3** | Core trading system |
| 4 | **Arcturus-6** | Core trading system |
| 5 | **Deneb-4** | Core trading system |
| 6 | **Denebola-5** | Core trading system |
| 7 | **Fomalhaut-2** | Core trading system |
| 8 | **Mira-9** | Core trading system |
| 9 | **Pollux-7** | Core trading system |
| 10 | **Procyon-5** | Core trading system |
| 11 | **Regulus-6** | Core trading system |
| 12 | **Rigel-8** | Core trading system |
| 13 | **Spica-3** | Core trading system |
| 14 | **Vega-6** | Core trading system; return point after Maligna mission |

**The 6 Rim Star Worlds:**

| # | System | Facilities |
|---|--------|-----------|
| 15 | **Antares-5** | Gateway to Andromeda (Operations Room for the Andromeda mission); Shields repair, Fuel |
| 16 | **Capella-4** | Drive repair, Fuel |
| 17 | **Polaris-1** | Cabin repair, The Wise One NPC, Fuel |
| 18 | **Mizar-9** | Robotics repair, The Sage NPC (constellation quiz), Fuel |
| 19 | **Achernar-5** | Navigation repair, Fuel |
| 20 | **Algol-2** | No repair facilities — the frontier |

**Rim World characteristics:**
- High launch fees
- Triple cargo pay
- Poor docking success unless navigation is excellent
- Cargo runs earn Rim classification (`kk=6`) with different pirate types (Rim Pirates)

---

### 4.2 The Andromeda Galaxy

Reachable via the **black hole** transit from Antares-5 (system #15). Prerequisites:
1. You must have defeated Maligna (rogue star)
2. You must have recovered the **Nemesian Star Gems**
3. You must be equipped with the **Astraxial Hull** (hull #19) — a special singularity-enhanced hull with 190 cargo pods and auto-repair, available only after fulfilling prerequisites

> **Warning:** Attempting Andromeda in any other hull is described as "fool-hardy and the Space Authority will not be held responsible."

**The 6 Andromeda Star Systems:**

| System | Exotic Cargo Available |
|--------|----------------------|
| NGC-44 | Dragonium Ore, Rarium Gems, Wondrous Brandy |
| NGC-55 | Merusian Liquor, Anti-Virion Serum |
| NGC-66 | Mystium Ore, Clyrium Crystal, Myusia Cognac |
| NGC-77 | Oreganol Herbs, Ferlian Elixir, Wondrous Brandy |
| NGC-88 | Sonolide Crystal, Arachnid Gems |
| NGC-99 | Infernum Spice, Grundgy Vaccine, Clyrium Crystal, Anti-XY Serum |

Enemies in Andromeda are **Reptiloids** — alien ships in squadrons of up to 12, extremely fast and powerful.

---

### 4.3 Alliances

There are four alliances, each identified by a symbol appended to your ship name:

| Alliance | Symbol | Character |
|----------|--------|-----------|
| **Astro League** | `[+]` | Ancient and provincial; the establishment |
| **Space Dragons** | `[@]` | Crafty group of conspirators |
| **Warlord Confed** | `[&]` | Most dangerous and war-like |
| **Rebel Alliance** | `[^]` | Revolted from the Astro League |

**Joining:** Visit the Spacers Hangout on Sun-3, type `ALLIANCE` or `I` for Info + `ALL`. You must be Lieutenant rank or higher. Alliance membership can hold up to roughly one-third of all active spacers.

**Alliance benefits:**
- Allied pirates won't attack you
- Discount launch fees at ports owned by your alliance
- Collective star system holdings earn daily interest
- Access to Alliance Banking (shared emergency funds)
- Alliance Bulletins (communication channel)
- Alliance symbol appears on your ship in all leaderboards and battle logs

**Switching alliances:** Costs all your credits and your space port. Your ship name loses its old suffix.

---

### 4.4 Factions and NPC Ships

**Brigands (12 NPCs):** The weakest enemy class. Local thugs who prey on new spacers with minimal weapons. Named after junk food:

| # | Name | | # | Name |
|---|------|-|---|------|
| 1 | Big Mac | | 7 | Ho-Ho |
| 2 | Nugget | | 8 | Jelly Bean |
| 3 | Fish Stix | | 9 | Jube-Jube |
| 4 | Fries | | 10 | Taco |
| 5 | Pop Tart | | 11 | Chips |
| 6 | Twinkie | | 12 | McDLT |

Brigands have escalating stats from weakest (Big Mac) to hardest (McDLT). Their battle logs are public — you can check `SP.1` through `SP.12` in the Library to see how other spacers have fared against each one.

**Malignite Pirates:** Vicious and well-armed pirates operating near the Maligna region. They accept tribute but it's costly.

**Rim Pirates (Rim Star World encounters):** Professional and organized, operating in squads of up to 4 ships. Ex-Space Patrol officers who went rogue. Better stats than Brigands.

**Reptiloids (Andromeda):** Alien beings in high-power ships, operating in squads of up to 12. The fastest enemies in the game.

**Spacer Pirates (Player Pirates):** Other players who have enrolled in pirate activity. They attack cargo transports just as NPC pirates do, but they're human — adaptive, strategic, and potentially waiting for you specifically.

**Space Patrol NPCs:** NPC patrol ships exist alongside player Patrol officers. They guard specific systems and will leave you alone unless you're flagged as a criminal. There are 11 named NPC Patrol vessels (from `SP.EDIT3.S`, `mpat` subroutine), ranked by strength tier 1–11:

| Ship Name | Commander | Tier |
|-----------|-----------|------|
| SP1.Thor | ][-Lt.Savage | 1 (weakest) |
| SP2.Hercules | ][-Cmdr.Strong | 2 |
| SP3.Fearless | ][-Como.Brainerd | 3 |
| SP4.Darkover | ][-Capt.Brutus | 4 |
| SP5.Courageous | ][-Capt.Armand | 5 |
| SP6.Firedrake | ][-Capt.Bouchet | 6 |
| SP7.Victorious | ][-Capt.Brax | 7 |
| SP8.Meritorious | ][-Adm.Wong | 8 |
| SP9.Incredible | ][-Adm.Hutchins | 9 |
| SPX.Inferno | ][-Adm.Bruiser | 10 |
| SPZ.Infinity | ][-Adm.Borgia | 11 (strongest) |

The `][` prefix in commander names denotes their Space Patrol affiliation. SPX and SPZ are the highest-threshold ships — the combat configuration (`jw`/`jx` values in `sp.conf`) determines the minimum player weapon strength required to trigger encounters with them.

---

### 4.5 Special Encounters and NPCs

**The Bartender (Sun-3):** Gives information in exchange for drinks (free). Use the keyword system (see Section 3.8).

**The Wise One (Polaris-1, System #17):** A wise sage figure found at this Rim World. Provides guidance to advanced spacers.

**The Sage (Mizar-9, System #18):** Poses a constellation quiz. Answers using the 16 Milky Way constellations coded A–P:

| Code | Constellation | | Code | Constellation |
|------|-------------|--|------|---------------|
| A | Perseus | | I | Virgo |
| B | Auriga | | J | Bootes |
| C | Orion | | K | Leo |
| D | Taurus | | L | Gemini |
| E | Cygnus | | M | Draco |
| F | Aquila | | N | Hercules |
| G | Scorpius | | O | Sagittarius |
| H | Lyra | | P | Pegasus |

**Maligna:** A rogue red dwarf star approaching the Milky Way Galaxy. Found by entering coordinates `X:13 Y:33 Z:99` during flight. It fills your viewscreen with a crimson bloated mass:

```
Completely filling your view screen, you see before you the
Crimson bloated substance of an ancient red dwarf star...
```

You must be equipped with the **Star-Buster Siege Weapon** and **Archangel Shield System** to destroy it. Defeating Maligna awards **+100 points to your score** and 100,000 cr; you are transported back to Vega-6.

**Nemesis:** An exotic star containing six radiant Nemesian Star Gems in a crystalline lattice. A Space Commandant contacts you when you're ready. The lattice requires the word `INFINITY` to unlock. Recovering the gems earns significant score and enables Andromeda access.

---

### 4.6 Ship Components

**Battle Factor (B/F)** is the master combat metric. Formula (from `SP.FORMULAE`):

```
For each component (Cabin, Life Support, Navigation, Drive, Robotics, Hull):
  component_score = (condition + 1) × strength / 10

bonus_trips = completed_trips / 50  (only if trips > 49)
bonus_wins  = number_of_battles_won

B/F = (sum_of_all_component_scores + bonus_trips + bonus_wins) / 5
```

Higher B/F gives you an advantage in combat. The enemy's B/F is calculated the same way.

**Travel calculations:**

```
ETA  = ((21 - drive_strength) + (10 - drive_condition)) × distance + 10
Fuel = ETA / 2
```

A Harmonic drive (strength 9) with full condition (10) flying 5 astrecs:
`ETA = ((21-9) + (10-10)) × 5 + 10 = 70`
`Fuel = 35 units`

Versus a Pulse drive (strength 1): `ETA = ((21-1) + (10-10)) × 5 + 10 = 110`, `Fuel = 55 units`

---

### 4.7 Combat System

Combat happens automatically when a pirate intercepts you. The combat loop:

1. **Speed check:** `speed = drive_strength × drive_condition` for each ship. The faster ship may retreat if overmatched.

2. **B/F calculation:** Your battle factor (`r9`) and the enemy's (`jg`) are computed from all component stats.

3. **Each round:**
   - Display: Battle Advantage (who leads in total firepower) and Speed Advantage
   - You are prompted: `Continue Attack? (Y)/(N)` — or the battle may proceed automatically depending on context
   - **Your attack:** Weapon power minus enemy shield power determines hit damage. Damage distributes to: enemy shields → enemy cabin → enemy nav → enemy command → enemy drives → enemy weapons → enemy hull
   - **Enemy attack:** Same process in reverse, hitting: your shields → your cabin → your navigation → your drives → your robotics → your weapons → your hull
   - Lucky shots can bypass shields

4. **Tribute:** If the enemy has the speed advantage, it may demand tribute instead of fighting:
   - Brigands/Pirates: demand credits (credits × difficulty factor)
   - If you can't pay: they take your cargo, or pods, or fuel — in that order
   - Malignite pirates in smuggling runs confiscate your contraband

5. **Battle ends when:** A ship is destroyed (hull condition reaches 0), one ship retreats, or the round counter exceeds the Sysop-configured maximum (`qq`).

6. **Aftermath:** Winner may scavenge ship enhancements (weapon/shield upgrades) from the loser's wreck. Your wins/losses update your B/F for future battles.

**Combat types (`kk` values):**
- `kk=1`: Standard cargo run (core systems); Brigands or Pirates intercept
- `kk=2`: Space Patrol patrol run; Patrol vs. Pirates
- `kk=3`: Maligna mission
- `kk=4`: Alliance raid; your ship vs. system guards
- `kk=5`: Smuggling run; Space Patrol may intercept
- `kk=6`: Rim World cargo run; Rim Pirates
- `kk=9`: Nemesis mission
- `kk=10`: Andromeda trip; Reptiloids

---

### 4.8 The Scoring System

**Score (`sc`) accumulates from:**
- Completing cargo trips (+1 per trip, with modifiers)
- Winning battles (+10 per win)
- Being rescued, rescuing others (+bonus)
- Completing Patrol missions
- Distance traveled (astrecs, `j1`)
- Cargo delivered (`k1`)
- Defeating Maligna (+100)

**Total points** (`s2`) is the master leaderboard value combining all activity.

**Win:** Reaching **10,001 total points** inscribes you in the **Great Heroes List** and offers you a fresh restart to attempt it again.

---

### 4.9 Gambling Games

**Digital Wheel of Fortune:**
- Choose a number (1–20)
- Choose how many rolls (3–7)
- Bet 1–1,000 cr
- Payoff odds: `(20 / number_of_rolls) - 1`
- Example: 5 rolls = 3:1 odds; 3 rolls = ~5.67:1 odds
- The wheel spins; if your number comes up within your roll limit, you win `bet × odds`
- Closed for players with fewer trips than the minimum threshold

**Spacers Dare (designed by Iron Brow, Mile High Apple BBS):**
- Choose 3–10 rounds; choose a multiplier (1–3×)
- Each round: roll 2 six-sided dice to establish a base number
- Keep rolling — accumulate a score round total — but if you roll your base number again, you bust and score nothing for that round
- Press `N` or `Z` to stay (bank your accumulated roll total)
- The computer opponent uses a strategy table to decide when to stay
- End score: (your total − computer total) × multiplier = winnings/losses
- Minimum 750 cr required to play

---

### 4.10 Win Conditions

**Individual victory:** Accumulate **10,001+ total points**. Your name is written into the *Magnificent Space Heroes* list. You are offered a restart.

**Alliance victory:** Your alliance controls the majority of the **14 core star system holdings** simultaneously. The Sysop reviews the state and may declare an Alliance Victory, optionally resetting the entire game.

---

## 5. Strategy

### 5.1 Getting Started — The First Week

You log in for the first time with 10,000 cr and no ship. Every credit matters. The game rewards efficiency above recklessness.

**Day 1:** Don't spend your starting credits all at once. Buy a Hull 3 (Racer, 200 cr) and a moderate drive — the **Ram Scoop** (200 cr) is the sweet spot. Cheap weapons and shields, 20 cargo pods (200 cr). You should have roughly 9,000 cr left after fitting out. Immediately go to Cargo Dispatch and accept the most profitable manifest — check distance and pods required. Your first run should net 3,000–6,000 cr.

**Why a small hull first?** Hulls 1–4 can accept **Morton's Cloaking Device** from the Speede Shoppe. A cloaked ship is invisible to pirate detection on legal cargo runs — no ambushes, no tribute payments, no combat damage. This dramatically accelerates early income. Save up ~15,000 cr, buy the Cloaker from Roscoe's, and run three cargo trips per day in perfect safety.

**Join an alliance early.** You need to be Lieutenant rank, which requires a few completed trips and some score. The moment you qualify, visit the Spacers Hangout and join. The Rebel Alliance and Warlord Confed are often the most active military alliances; the Astro League tends to be older and more stable. Choose based on who your friends are playing with — alliance strength is collective.

---

### 5.2 Building a Dominant Ship

Combat in Spacer Quest rewards patience. The Battle Factor formula means every component contributes. A ship with all Tier 9 components in perfect condition has a B/F an order of magnitude above a starter ship.

**The upgrade priority:**
1. **Drive first** — every credit spent on drive reduces your fuel cost, increases your trip count, and improves your speed advantage in combat. A Harmonic drive (Tier 9) pays for itself within days.
2. **Robotics second** — the Battle Computer is the gatekeeper of combat. Without Robotics, your shields and weapons won't fire reliably. Colossus A:I (Tier 9) is essential for serious combat.
3. **Weapons and Shields together** — Imbalanced builds lose. A ship with Tier 9 weapons but Tier 1 shields will destroy enemies but die in one lucky shot. Upgrade these in parallel.
4. **Hull last** — Hull strength matters for B/F, but upgrading hull means you lose your Cloaker eligibility permanently at Hull 5+. Stay at Hull 4 (Viper) as long as you're running cargo safely cloaked. When you're ready to transition into combat, jump straight to Hull 7 or higher.
5. **Speede Shoppe upgrades** after base components are maxed — these augment your existing strengths.

**The Andromeda Build:** For the Andromeda endgame, you need the **Astraxial Hull** (Tier 19). This requires having already defeated Maligna and recovered the Nemesian Gems. The Astraxial carries 190 pods and includes auto-repair — at that point you're optimizing for Andromeda cargo profits and Reptiloid combat.

---

### 5.3 Maximizing Credits

**Three cargo runs per day** is the hard ceiling. Your goal is to maximize each run's pay.

The pay formula is: `PAY = ((cargo_value × distance / 5) × serviceable_pods) + fuel_cost + 1,000`

**What this means:**
- **More pods = more pay.** Load up. 190 pods in the Astraxial hull earns vastly more per trip than 20 pods in a Racer.
- **Distance matters.** Long-distance runs pay more. Don't cherry-pick the closest system — take runs to distant systems.
- **Pod condition matters.** Keep your pods maintained. Damaged pods don't carry as efficiently.
- **Rim Worlds pay triple.** Once your nav is good enough to reach systems 15–20 reliably, the Rim is where the real money is. Higher fees eat into profits but the cargo pay more than compensates.
- **Andromeda cargo** is the apex. After the black hole transit, the exotic goods from NGC systems pay at rates that dwarf anything in the Milky Way.

**Smuggling** pays roughly 14,000+ cr per run but you lose cargo office access for the day if busted, and the Syndicate shuts down after 2 runs anyway. Use smuggling as a supplement, not a primary income source.

**Own a Space Port.** Buy a core system port (especially high-traffic ones near Sun-3). Set a reasonable fuel price. The passive income from launch fees compounds over time — especially as more players join and traffic increases. Your space port savings account is separate from your main credits; withdraw regularly.

---

### 5.4 Combat — Beating Other Players and NPCs

**Know your B/F.** Press `X` in flight for a full stats readout. The enemy's B/F is only revealed during battle (shown in brackets). If theirs is dramatically higher, retreat or pay tribute — there's no shame in surviving to fight another day.

**Speed is decisive.** Drive strength × drive condition is your speed value. If you're faster, you can retreat anytime. If the enemy is faster, they can force multiple rounds. The number one combat investment is your drive.

**The Battle Computer (Robotics)** determines whether your weapons and shields fire at all. A wasted Robotics component means all your firepower is dormant. Always keep Robotics at full condition — repair it first after any battle that damages it.

**Against Brigands:** Early in the game, many Brigand ships are stronger than you. Don't be too proud to pay tribute. Tally the Brigand battle logs in the Library to learn which ones you can beat and which to avoid. Big Mac (weakest) is fair game from the start; McDLT (strongest) will destroy most mid-game ships.

**Against Player Pirates:** Human pirates behave strategically. They're looking for spacers running cargo — you're the target. Your Cloaker is your best defense early. If you're without a Cloaker (Hull 5+), your shields and combat rating must be high enough to make attacking you not worth their time. Bribing alliance membership to get allied pirates to stand down is also a valid strategy.

**Raiding Alliance Holdings:** Plan raids carefully. The DEFCON system means a well-fortified holding (DEFCON 9 = 900 Weapons / 900 Shields defending) will destroy any underpowered raider. Scout the target's DEFCON level at the bar (`RAI` command shows it) before committing to a raid. Bring your strongest combat build, not your cargo hauler.

**The Patrol Advantage:** Space Patrol missions double your combat experience rate (battles against pirates count toward rank and B/F). High Patrol rank unlocks the Special Armament Section — if you ever want the Star-Buster or Archangel, you need to grind Patrol duty first.

---

### 5.5 Alliance Play — Collective Power

An alliance of five well-coordinated players will overwhelm any lone wolf, no matter how strong their ship. Here is how top alliances dominate the game:

**Invest collectively.** Pool credits into star system holdings as fast as possible. Every system your alliance controls earns interest — daily. The compounding effect of multiple holdings means your collective treasury grows while enemies are still saving for their next upgrade.

**Fortify aggressively.** Push priority systems to DEFCON 9 immediately. A DEFCON 9 system requires the attacker to defeat 900 points each of Weapons and Shielding — essentially impossible for anything below an end-game combat build. Your fortified core systems become anchors.

**Coordinate attack.** Raid enemy holdings when their best combat players are offline. The most powerful attacker in your alliance should hit on coordinated timing. A single successful raid at the right moment can cripple an enemy alliance's income for days.

**Use the Alliance Bank.** Keep a war chest in the bank for emergencies: bail out jailed members instantly (before the game logs them as jailed — the `J%` prefix is a visible mark of shame), fund a member who's been destroyed and needs to rebuild.

**The allegiance paradox.** The Rebel Alliance and Warlord Confed tend to be the most combative. The Astro League tends to control the most ports through steady accumulation. The Space Dragons favor stealth — smuggling income, targeted raids, strategic play. The best alliance for you depends on your playstyle and your real-life connections.

---

### 5.6 Advanced Missions — The Endgame

The game has three escalating late-game objectives that form a narrative arc:

**Stage 1 — The Maligna Mission:**
Get the bartender drunk (`D` four times) and ask `COO` — you'll learn the coordinates: `X:13 Y:33 Z:99`. You need:
- At minimum: Star-Buster Siege Weapon (Special Armament, requires Patrol rank)
- At minimum: Archangel Shield System (Special Armament, requires Patrol rank)
- A powerful ship — Maligna is a combat encounter, not just a destination

Once equipped, during any flight press `N` for Navigation, then choose manual override, enter MALIGNA as destination and supply the coordinates. You'll fly 22 astrecs. Surviving the encounter earns +100 score and 100,000 cr. The universe is saved — temporarily.

**Stage 2 — The Nemesian Star Gems:**
After defeating Maligna, the Space Commandant contacts you. The Nemesis mission uses special coordinates (`X:00 Y:00 Z:00`) during flight in `kk=9` mode. On arrival:

```
Your victorious ship lands on the Nemesis-3 planet...
Before you is a crystalline lattice containing
Six incredibly radiant jewels, each of different hue.
```

Type `INFINITY` to unlock the lattice. The gems are yours. This earns a major score bonus and unlocks the Andromeda mission.

**Stage 3 — The Andromeda Galaxy:**
Visit Antares-5 (System #15) — the Operations Room briefs you:

```
You have an opportunity to make an unprecedented exploration of the
recently discovered star systems in the Andromeda Galaxy...
A singularity-enhanced hull with 190 cargo pods, larger fuel tanks,
and auto-repair is available to those who have bested the rogue star
and recovered the Nemesian Star Gems.
```

Obtain the **Astraxial Hull**, transit the black hole, and run cargo through the 6 NGC systems. The exotic goods pay far more than anything in the Milky Way. The Reptiloid enemies are formidable but your Astraxial hull and end-game weapons can handle them.

At 10,001 total points, you are written into the Great Heroes list — and you can start again, harder and wiser.

---

---

## Appendix A: Rank Progression

Rank is stored in the `pp$` variable and is displayed alongside your name in battle logs, cargo manifests, and patrol orders. Rank gates access to the Special Armament Section in the Speede Shoppe (Lieutenant minimum to join an alliance; higher ranks unlock advanced weaponry).

The rank names below are confirmed from the source (they appear in `pp$` throughout the codebase). The point thresholds and credit honorariums come from the companion manual and are **not independently verified** against the sysop configuration files — treat them as approximate until confirmed against a live `SP.SYSOP.S` review.

| Rank | Approx. Points Required | Notes |
|------|------------------------|-------|
| Lieutenant | 0–149 | Minimum to join an alliance |
| Commander | 150–299 | |
| Captain | 300–449 | |
| Commodore | 450–599 | |
| Admiral | 600–899 | Patrol NPCs carry Admiral rank (Wong, Hutchins, Bruiser, Borgia) |
| Top Dog | 900–1,099 | |
| Grand Mufti | 1,100–1,399 | |
| Mega Hero | 1,400–1,699 | |
| Giga Hero | 1,700+ | Qualifies for all Special Armament; endgame-ready |

Patrol rank is referenced in `SP.BAR.S` (`mp$=right$(pp$,2)`) and `SP.WARP.S` to determine access to the Maligna/Nemesis missions. `][` as the right two characters of `pp$` identifies a Space Patrol officer — patrol ships carry this prefix in their commander names.

---

## Appendix B: NPC Ship Roster

### Brigands (12 ships — `sp.brigand`)

Escalating difficulty, Big Mac weakest to McDLT strongest. All start with condition 9; weapon/shield strength increases with each ship in the sequence. Battle logs are publicly accessible in the Library as files `SP.1` through `SP.12`.

| # | Ship Nickname | | # | Ship Nickname |
|---|---------------|-|---|---------------|
| 1 | Big Mac | | 7 | Ho-Ho |
| 2 | Nugget | | 8 | Jelly Bean |
| 3 | Fish Stix | | 9 | Jube-Jube |
| 4 | Fries | | 10 | Taco |
| 5 | Pop Tart | | 11 | Chips |
| 6 | Twinkie | | 12 | McDLT |

### Space Patrol NPCs (11 ships — `sp.pat`)

See Section 4.4 for the full table with commander names. Patrol ships are assigned to random core systems on activation and patrol those systems against pirate incursion.

### Pirates (9 ships — `pirates`)

NPC player-class pirate ships designated K1–K9. These are distinct from the named Brigands. They operate like player pirates: assigned to a star system, attack cargo transports, and accumulate wins/losses over time. Their ship names are obfuscated codes (`K1!!!!`, `K2@@@@`, etc.) and their owner codes are similarly scrambled — they are not meant to be player-readable.

### Rim Pirates (21 ships — `sp.rimpir`)

The largest NPC fleet. Encountered on Rim World cargo runs (`kk=6`). Can appear in squads (encounter group size up to 4). Stronger and more organized than core-system pirates.

### Reptiloids (12 ships — `sp.reptile`)

Andromeda-only encounters (`kk=10`). Squad size up to 12. The fastest and most powerful NPC faction.

---

## Appendix C: Commands Quick Reference

### Space Port Operations (entry screen)

| Key | Action |
|-----|--------|
| `B` | Alliance Bulletins |
| `K` | Battles Fought Log |
| `V` | Visitor Log (who's been here today) |
| `G` | Space News / Great Heroes |
| `H` | Help File |
| `M` | Spatial Map |
| `N` | Create new character (restart) |
| `P` | Port Fuel Prices — all 14 ports |
| `S` | Space Heroes Hall of Fame |
| `[Enter]` | Go to Main Terminal |

### Launch Bays

| Key | Action |
|-----|--------|
| `L` | Launch Sequence |
| `F` | Fuel Depot |
| `M` | Space Map |
| `X` | Ship Stats |
| `H` | Help File |
| `?` | This Menu |
| `Q` | Quit |

### Ship Bridge (in-flight)

| Key | Action |
|-----|--------|
| `D` | Data Banks (map, stats, help, ship rename) |
| `N` | Navigation System (view/change course) |
| `W` | Weaponry status |
| `?` | Command Menu |
| `Q` | Emergency exit (10% Lost In Space risk) |

### Spacers Hangout (Bar)

| Key | Action |
|-----|--------|
| `G` | Gamble (Wheel of Fortune / Spacers Dare) |
| `D` | Drink |
| `I` | Information (enter keyword) |
| `B` | Visit the Brig (Sun-3 only) |
| `Q` | Leave |

### Space Port Registry

| Key | Action |
|-----|--------|
| `L` | Library / Data Banks |
| `R` | Rescue Service |
| `S` | Space Patrol HQ |
| `?` | Menu |
| `Q` | Quit |

### Shipyards

| Key | Action |
|-----|--------|
| `1`–`9` | Buy component (tier 1–9) |
| `P` | View hull pictures |
| `X` | Ship Stats |
| `Q` | Quit |

### Speede Shoppe

| Key | Action |
|-----|--------|
| `1`–`8` | Purchase enhancement |
| `9` | Special Armament Section (rank-gated) |
| `A` | Armament Assessment (free) |
| `X` | Ship Stats |
| `Q` | Leave Shoppe |

### Space Realty

| Key | Action |
|-----|--------|
| `B` | Buy Space Port |
| `S` | Sell Space Port |
| `W` | Withdraw port savings |
| `D` | Deposit to port savings |
| `N` | Port Fees Report |
| `P` | Prospectus |
| `M` | Port Activity |
| `F` | Fuel Business (set sell price) |
| `?` | Menu |
| `Q` | Quit |

### Alliance Holdings

| Key | Action |
|-----|--------|
| `N` | Alliance Activity |
| `S` | List of Holdings |
| `I` | Invest in Star |
| `W` | Withdraw Funds |
| `D` | Deposit Funds |
| `F` | Fortify Holdings (raise DEFCON) |
| `T` | Take-Over (after successful raid) |
| `P` | Password Change |
| `H` | Help |
| `Q` | Quit |

### Dueling Arena

| Key | Action |
|-----|--------|
| `1` | Set up as Contender |
| `2` | Challenge a Contender |
| `3` | Cancel Duel |
| `R` | Roster of Contenders |
| `B` | Battle Log |
| `V` | View Duel Combat |
| `L` | List of Space Ships |
| `X` | Ship Stats |
| `O` | Options Documentation |
| `Q` | Leave Arena |

---

*Spacer Quest v3.4 — Written by Firefox for The Den of The Firefox, 05/25/91*
*"Long Live The Rebel Alliance!"*
