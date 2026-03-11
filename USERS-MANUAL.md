# SpacerQuest v3.4 - User's Manual

**Version:** 3.4  
**Platform:** Apple II GBBS  
**Original Release:** May 25, 1991  
**Author:** Firefox  
**BBS:** The Den of The Firefox (209-526-1771)

---

## Table of Contents

1. [Welcome to SpacerQuest](#1-welcome-to-spacerquest)
2. [Getting Started](#2-getting-started)
3. [Your First Ship](#3-your-first-ship)
4. [Space Travel](#4-space-travel)
5. [Combat](#5-combat)
6. [Trading & Economy](#6-trading--economy)
7. [Alliances](#7-alliances)
8. [Missions](#8-missions)
9. [Ship Upgrades](#9-ship-upgrades)
10. [Special Features](#10-special-features)
11. [Commands Reference](#11-commands-reference)
12. [Tips for Success](#12-tips-for-success)

---

## 1. Welcome to SpacerQuest

### 1.1 What is SpacerQuest?

SpacerQuest is a space exploration, trading, and combat simulation game. You are a spacer in a galaxy of 20+ star systems, where you can:

- Own and upgrade your spaceship
- Trade cargo between star systems
- Join an alliance with other players
- Engage in space combat
- Own space ports and earn income
- Take on dangerous missions
- Compete for top rankings

### 1.2 The Galaxy

The SpacerQuest universe includes:

**Milky Way (Systems 1-14):**
- Sun-3, Aldebaran-1, Altair-3, Arcturus-6
- Deneb-4, Denebola-5, Fomalhaut-2, Mira-9
- Pollux-7, Procyon-5, Regulus-6, Rigel-8
- Spica-3, Vega-6

**Rim Stars (Systems 15-20):**
- Antares-5, Capella-4, Polaris-1
- Mizar-9, Achernar-5, Algol-2

**Special Locations:**
- Maligna (rogue star)
- Nemesis (hidden system)
- Andromeda Galaxy (6 NGC systems)

### 1.3 Daily Limits

To ensure fair play, the game limits you to **3 completed space trips per day**. Plan your journeys wisely!

---

## 2. Getting Started

### 2.1 Creating Your Character

When you first enter SpacerQuest:

1. The system will check if you have an existing character
2. If not, a new spacer record will be created automatically
3. You start with **10,000 credits** if you're a returning conqueror
4. New players start with **1 credit**

### 2.2 Your First Steps

```
┌─────────────────────────────────────────────────────────────┐
│  STARTER RECOMMENDATIONS                                    │
├─────────────────────────────────────────────────────────────┤
│  1. Visit SP.SPEED to purchase your first ship hull         │
│  2. Buy essential components (drives, life support)         │
│  3. Name your ship                                          │
│  4. Visit SP.LIFT to purchase fuel                          │
│  5. Take a short trip to a nearby system                    │
│  6. Deliver cargo for easy credits                          │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Understanding Credits

Credits are displayed as: `[Cr:XXXX]`

- Large amounts are shown with comma notation (e.g., `1,234`)
- The system tracks credits in two parts internally
- You can have unlimited credits, but carry limits apply to transactions

---

## 3. Your First Ship

### 3.1 Ship Components

Your ship has 8 essential systems:

| Component | Purpose | Minimum Recommended |
|-----------|---------|---------------------|
| **Hull** | Ship structure, fuel capacity | 10+ strength |
| **Drives** | Movement, fuel efficiency | 10+ strength |
| **Cabin** | Crew quarters, battle computer | 10+ strength |
| **Life Support** | Survival, battle factor | 10+ strength |
| **Weapons** | Combat effectiveness | 10+ strength |
| **Navigation** | Course accuracy | 10+ strength |
| **Robotics** | Battle computer, targeting | 10+ strength |
| **Shields** | Damage protection | 10+ strength |

Each component has:
- **Strength** (0-209): Power level
- **Condition** (0-9): Operational status (9 = perfect)

### 3.2 Purchasing Components

Visit **SP.SPEED** (Ship Upgrades):

```
Spacer [Your Name] - [Cr:10000]: Command: ?

Menu shows:
1. Titanium Hull Reinforcement    - 10,000 cr
2. Trans-Warp Accelerator          - 9,000 cr
3. Kool Rad Pad (Cabin)            - 8,000 cr
4. The Good Life (Life Support)    - 6,000 cr
5. Speedo Multi-Fire (Weapons)     - 8,000 cr
6. Darkover Navigation Aid         - 5,000 cr
7. Robbie The Robot                - 4,000 cr
8. Force Field Enhanced Shields    - 7,000 cr
```

### 3.3 Naming Your Ship

Visit **SP.REG** → Library → Ship Name:

```
Enter the new name of your ship: MILLENNIA
Henceforth your spaceship will be named: MILLENNIA
......is this correct? [Y]/(N): Y
```

**Naming Rules:**
- 3-15 characters
- Cannot start with "THE "
- Cannot include alliance symbols (+, @, &, ^) unless you're a member

### 3.4 Fuel Capacity

Fuel capacity is calculated as:
```
Capacity = (Hull Strength × (Condition + 1)) × 10
```

Example: Hull-10, Condition-9 = 10 × 10 × 10 = **1,000 fuel units**

---

## 4. Space Travel

### 4.1 Preparing for Launch

Before launching, ensure:

1. ✅ Ship has all essential components
2. ✅ All components are in good condition (not damaged)
3. ✅ Sufficient fuel for the journey
4. ✅ Valid cargo contract (if traveling for delivery)
5. ✅ Destination selected

### 4.2 Launch Sequence

Visit **SP.LIFT** (Launch Control):

```
[Cr:5000]=[F:500]=[Launch Pad Bays] Command: L

Mission Control Officer:
  Space Trip #           : 1
  Trip Originates From   : Sun-3
  Trip Destination To    : Vega-6
  Estimated Travel Time  : 15
  Estimated Fuel Required: 150 units
  Fuel On-Board          : 500 units

Will you pay the fee? [Y]/(N): Y

Thank you. Your ship and papers are in order.
You are cleared for Lift-Off from Sun-3 on 05/25/91

Initiating Launch Sequence: T MINUS [9] and counting......
[8]...[7]...[6]...[5]...[4]...[3]...[2]...[1]...GO!

You have Lift-Off!..Lookin' Good!...Bon Voyage!
```

### 4.3 On the Bridge

During travel, you're on the **Ship Bridge** (SP.WARP):

```
Trip #1--------Vega-6: ETA: 015--------: MILLENNIA

[:Ship Bridge:][Fuel:     ][Chronos:  [0000]]

Command: ?

Menu (sp.menu5a):
D - Ship's Data Banks
N - Navigation System
W - Ship's Armament
? - Menu
Q - Quit (return to port)
```

### 4.4 Navigation

**Automatic Navigation:**
- Set your destination before launch
- Ship follows optimal course
- No manual input needed

**Manual Navigation:**
```
Command: N

Navigation Console
Go to Manual Navigation? (M)anual/(C)ancel: M

Enter Destination Manually
Which Star System ID#? (0-20)  [Q]uits: 6

The Navigation Computer...Changes course for Denebola-5
Course change fuel consumption = 50
```

**Course Change Limits:**
- Limited changes per trip (based on navigation system)
- Each change consumes extra fuel
- Plan your route before launch!

### 4.5 Hazards

During travel, random hazards may occur:

```
⚠️ Warning! Hazard Alert
X-Rad Shower... Shields Hit!...*25*
```

Hazards can damage:
- Shields
- Drives
- Navigation
- Weapons
- Hull

Maintain your components to minimize risk!

### 4.6 Arrival

When you arrive:

```
[[[[[[[[[[[[[[: Destination Arrived:]]]]]]]]]]]]]]

....Grind...Crunch...Bump...Scrape...Clank...Swoosh... Click!

......Docking Completed....the MILLENNIA is secured.

Entering [:Cargo Receiving:] on Vega-6
```

---

## 5. Combat

### 5.1 Encounters

During travel, you may encounter:

| Enemy Type | When | Behavior |
|------------|------|----------|
| **Pirates** | Cargo runs | Attack for loot |
| **Space Patrol** | Patrol missions | Friendly (if allied) |
| **Rim Pirates** | Rim Stars | Aggressive |
| **Brigands** | Smuggling runs | Hostile |
| **Reptiloids** | Andromeda | Alien enemies |

### 5.2 Battle Start

```
⚠️ Intruder Alert.....

Sensors Detect a SPX-class ship!
Data Bank Search reveals it to be the..... BLACK STAR
Commanded by the Space Pirate Captain Vex

Attack?  (Y)/[N]: Y

Aye! Aye! Sir!

  MILLENNIA commencing attack on BLACK STAR
```

### 5.3 Battle Interface

```
───────────────────────────────────────────────────────────────
Round # 1......Battle Advantage: BLACK STAR
                         Speed  Advantage: Even

[F:450]=[W:120]=[S:80]: Continue Attack? (Y)/(N): Y

───────────────────────────────────────────────────────────────
...No response from BLACK STAR on hailing channel

The Battle Computer : [+]:Battle Stations:[+]

───────────────────────────────────────────────────────────────
BLACK STAR Shields_______[ DOWN ]
STAR-BUSTER Auto-Track/Fire_______[ ON ]

MILLENNIA    [F:450]___Weaponry:[ 120]__Shields:[ 80]__B/F:[ 25]
BLACK STAR   [F:???]___Weaponry:[  95]__Shields:[ 65]__B/F:[ 18]
```

### 5.4 Battle Mechanics

**Battle Factor (B/F):**
```
B/F = (Weapon × Condition) + (Shield × Condition) + 
      (Component bonuses) + (Rank bonus) + (Experience)
```

**Combat Flow:**
1. Player fires weapons
2. Enemy shields absorb damage
3. Enemy systems take damage
4. Enemy returns fire
5. Player shields absorb damage
6. Player systems may take damage
7. Repeat until victory, defeat, or retreat

### 5.5 Surrender & Tribute

Enemies may demand tribute:

```
[Cr:5000][F:450] BLACK STAR demands 2500 cr tribute: Pay? (Y)/(N): Y

MILLENNIA pays 2500 cr tribute to BLACK STAR
```

**Options:**
- Pay credits
- Surrender cargo
- Fight to the death
- Attempt retreat

### 5.6 Victory & Defeat

**Victory:**
```
Job Well-Done! Lieutenant Your Name
Never Have So Many Owed So Much To So Few!

You receive 1,500 cr (500 base + 1000 × battles won)
```

**Defeat:**
```
Your MILLENNIA is now a wasted derelict!

You are Lost In Space!
```

When lost, you can:
- Wait for rescue (Rescue Service)
- Pay 500 cr salvage fee
- Register lost ship for future recovery

---

## 6. Trading & Economy

### 6.1 Cargo Contracts

**Getting a Contract:**

1. Visit a space port with empty cargo pods
2. Select cargo type and destination
3. Receive payment on delivery

**Cargo Types by System:**

| System | Cargo | Base Pay/Pod |
|--------|-------|--------------|
| Sun-3 | Titanium Ore | 1,000 cr |
| Capella-4 | Capellan Herbals | 2,000 cr |
| Altair-3 | Raw Dilithium | 3,000 cr |
| Mizar-9 | Mizarian Liquor | 4,000 cr |
| Achernar-5 | Achernarian Gems | 5,000 cr |
| Algol-2 | Algolian RDNA | 6,000 cr |

### 6.2 Space Port Ownership

**Purchasing a Port:**

Visit **SP.REAL** (Port Accounts):

```
[: Space Port Accounts & Fuel Depot Ltd :]

System Space Port Investment Prospectus

1. Sun-3..........Value: 100,000...Owner:..........Date:......
2. Aldebaran-1....Value: 100,000...Owner:..........Date:......
...

[Cr:150000]][:Port Realty:]: (B)uy  [Q]uit: B

Choice: (1-14) (Q)uits: 1

Is Sun-3 your choice? [Y]/(N): Y

Sun-3 requires a total payment of 100,000 cr to purchase
...Buy it? [Y]/(N): Y

You got a deal!
```

**Port Benefits:**
- Daily income from fees
- Fuel sales profit
- Control over fuel prices
- Alliance prestige

### 6.3 Fuel Trading

**Buying Fuel:**

```
[Cr:5000]=[F:100]=[Fuel Depot]

Space Authority Prices In Effect
Fuel Price: 25 cr

Buy how much fuel for your ship? (0-900): 200

Cost for 200 units = 5000 cr
```

**Selling Fuel:**

```
We pay 12 cr per unit for second-hand fuel.

Sell how much? (0-300): 100

Credits Paid for 100 units = 1200 cr
```

### 6.4 Banking

**Space Port Bank Account:**

Port owners have separate bank accounts:

```
[:Cr:5000:][:Port Acct:25000]

Withdraw?  (<C-R> Quits): 5000
Deposit?  (<C-R> Quits): 10000
```

**Alliance Investment:**

Visit **SP.VEST** for alliance banking:
- Deposit/withdraw funds
- Invest in star systems
- Hostile takeovers
- Fortify defenses

---

## 7. Alliances

### 7.1 Available Alliances

| Alliance | Symbol | Description |
|----------|--------|-------------|
| **The Astro League** | + | Scientific exploration |
| **The Space Dragons** | @ | Elite warriors |
| **The Warlord Confed** | & | Territorial control |
| **The Rebel Alliance** | ^ | Freedom fighters |

### 7.2 Joining an Alliance

Visit **SP.BAR** (Spacers Hangout):

```
Interested in joining an alliance? [Y]/(N): Y

Which of these are you interested in joining? [Q]uits: ^

You're now a member of The Rebel Alliance
Your MILLENNIA-^ is now part of the alliance
```

**Requirements:**
- Lieutenant rank or higher
- Alliance must have open slots (max 1/3 of players)

### 7.3 Alliance Benefits

- Access to alliance bulletin boards
- Protected fuel discounts at allied ports
- Support in combat
- Shared intelligence
- Alliance investment opportunities

### 7.4 Alliance Investment

Visit **SP.VEST** (Alliance Investments):

```
Welcome Admiral Your Name to Alliance Investments Ltd

[Cr:50000][Invest]: Command: ?

Menu:
F - Fortifications
S - Holdings
W - Withdraw Funds
D - Deposit Funds
I - Invest (acquire system)
T - Hostile Take-Over
```

**DEFCON System:**
- DEFCON 1-20
- Higher DEFCON = harder to takeover
- Costs 100,000-2,000,000 cr per level

---

## 8. Missions

### 8.1 Space Patrol

**Joining:**

Visit **SP.REG** → Space Patrol HQ:

```
Welcome to The Space Patrol

Joining up? [Y]/(N): Y

Patrol which system? (1-14): 6

You've chosen Denebola-5...Are you sure? [Y]/(N): Y

Space Patrol Orders:
   Space Patrol Admiral Your Name
   Cargo : Secret Battle Codes
   Value : 0 cr per pod
   Loaded Pods : 10
   Destination : Denebola-5
   Pay : 500 cr
```

**Patrol Duties:**
- Defend assigned sector
- Fight pirates and raiders
- Earn 500 cr base + 1,000 cr per battle won

### 8.2 Nemesis Mission (Endgame)

**Qualifications:**
- 500+ battles won
- Ship in perfect condition
- Giga Hero rank recommended

**The Mission:**

```
Spacer Your Name, you have done well!

The Space Patrol offers you the most dangerous assignment:
Find the Nemesian Star Jewels at coordinates 00,00,00

Your mission: Travel to NEMESIS and retrieve the jewels
Reward: 150,000 cr + ship enhancements
```

**Rewards:**
- 150,000 credits
- STAR-BUSTER++ weapons
- ARCH-ANGEL++ shields
- Enhanced life support
- Galaxy-wide recognition

### 8.3 Maligna Mission

**Qualifications:**
- Conqueror status (10,000+ points)
- Astraxial hull (100,000 cr upgrade)
- Coordinates: 13,33,99

**The Mission:**
- Travel to Maligna rogue star
- Perform ablation procedure
- Save the galaxy from destruction

### 8.4 Smuggling

**Getting a Contract:**

Visit **SP.BAR** → Smuggling:

```
Interested in smuggling contraband? [Y]/(N): Y

Destination: Algol-2
Distance: 6 Astrecs
Fuel Required: 180 units
Pays: 18,000 cr

Risk: Space Patrol interception
```

**Risks:**
- Patrol encounters
- Cargo confiscation
- Jail time if caught
- Modem disconnect penalties

---

## 9. Ship Upgrades

### 9.1 Standard Upgrades

Visit **SP.SPEED**:

```
Ship Upgrade Prices:
Component                  Cost      +Strength
─────────────────────────────────────────────
Hull Reinforcement        10,000 cr    +10
Trans-Warp Drives          9,000 cr    +10
Cabin Enhancement          8,000 cr    +10
Life Support               6,000 cr    +10
Weapons System             8,000 cr    +10
Navigation                 5,000 cr    +10
Robotics                   4,000 cr    +10
Shields                    7,000 cr    +10
```

### 9.2 Special Equipment

**Morton's Cloaking Device:**
- Price: 500 cr
- Requirement: Hull strength < 50
- Effect: Escape from superior enemies

**Auto-Repair Module:**
- Price: Hull strength × 1,000 cr
- Effect: +1 condition to all components per battle

**STAR-BUSTER++ Weapon:**
- Price: 10,000 cr
- Requirement: Conqueror, Maligna mission
- Effect: +18 weapon strength

**ARCH-ANGEL++ Shields:**
- Price: 10,000 cr
- Requirement: Conqueror, Maligna mission
- Effect: +18 shield strength

### 9.3 Astraxial Hull

**The Ultimate Upgrade:**

```
RON THE RECKA's - Special Section

Astraxial-*! Hull Installation
Cost: 100,000 cr
Includes: 190 cargo pods, full fuel tanks

Requirements:
- Conqueror of Maligna or Nemesis
- Drives > 24 strength
```

**Benefits:**
- 29 hull strength
- 2,900 fuel capacity
- 190 cargo pods
- Black hole transit capability
- Access to Andromeda galaxy

### 9.4 Repairs

Visit **SP.DAMAGE**:

```
RON THE RECKA's - Space Ship Repairs

MILLENNIA Damage Assessment
────────────────────────────────────────
1) Hull________________[099]___0% Damaged!
2) Drives______________[085]__30% Damaged!___Repair Cost 255 cr
3) Cabin_______________[090]__20% Damaged!___Repair Cost 180 cr
...

Repair All Damage? [Y]/(N): Y

All Damage Repaired for 1,250 cr
```

---

## 10. Special Features

### 10.1 Dueling Arena

**Entering the Arena:**

Visit **SP.ARENA1**:

```
═══════════════════════════════════════════════════════════
║     Sun-3 Space Port Gladiatorial Dueling Arena         ║
═══════════════════════════════════════════════════════════

[Cr:50000]: Command: ?

1 - Become Contender
2 - Challenge
3 - Remove from Roster
V - View Roster
B - Battle Log
L - Spacer List
X - Ship Stats
Q - Quit
```

**Setting Up a Duel:**

```
Duel Set-Up

Set stakes:
1. Total Points
2. Ship Component Strength
3. Credits

Choose Arena:
1. Ion Cloud (50+ trips required)
2. Proton Storm (100+ astrecs)
3. Cosmic Radiation (100+ cargo)
4. Black Hole (1+ rescue)
5. Super-Nova Flare
6. Deep Space
```

### 10.2 Gambling

**Digital Wheel of Fortune:**

```
Play [Astral Digital Wheel of Fortune]? [Y]/(N): Y

Bet which number? (1-20): 7
Choose how many rolls? (3-7): 5
Odds: 3 to 1

Bet? (0-1000): 500

[1][2][3][4][5][6][7]<-=$$]$[$$=->[8][9]...

[7] <-=$$]$[$$=-> Winning Number!
You win...1500 credits!!!
```

**Spacer's Dare (Dice Game):**

```
Play how many rounds? (3-10): 5
Score multiplier? (1-3): 2

Round #1
Roll #1____[ 70 ]....Roll again? [Y]/(N): Y
Roll #2____( 50 )....Roll again? [Y]/(N): N
You stay on 120 cr.

Computer stays on 95 cr.

End of Round 1____Score: Human: 120 cr____Computer: 95 cr
```

### 10.3 Top Gun Rankings

The game tracks top performers in:

- Fastest Drives
- Fanciest Cabin
- Best Life Support
- Strongest Weapons
- Best Navigation
- Best Robotics
- Strongest Shields
- Best All-Around Ship

### 10.4 Rescue Service

**Requesting Rescue:**

```
Rescue Service

Ships Lost in Space:
1. Your Name's ship Lost near Vega-6
2. Other Player's ship Lost near Algol-2

Enter # to rescue: 1

You scan for the lost spaceship near Vega-6...
You find it and tow it into port!

Salvage fee of 1,000 cr paid by Rescue Service
```

**Being Rescued:**
- Pay 500 cr fee
- Or wait for another player
- Rescue helps their score

---

## 11. Commands Reference

### 11.1 Space Port Commands (SP.START)

| Command | Action |
|---------|--------|
| B | View Alliance Bulletins |
| K | View Battle Log |
| V | View Visitor Log |
| G | View Space News |
| H | View Help |
| M | View Map |
| N | Create New Character |
| P | View Port Fuel Prices |
| S | View Space Heroes |
| ? | Display Menu |

### 11.2 Launch Control (SP.LIFT)

| Command | Action |
|---------|--------|
| L | Launch to Destination |
| F | Fuel Depot |
| D | Damage Assessment |
| M | View Map |
| X | Ship Stats |
| H | Help |
| ? | Menu |
| Q | Quit |

### 11.3 Ship Bridge (SP.WARP)

| Command | Action |
|---------|--------|
| D | Data Banks |
| N | Navigation |
| W | Weapons Status |
| ? | Menu |
| Q | Quit to Port |

### 11.4 Space Registry (SP.REG)

| Command | Action |
|---------|--------|
| L | Library |
| R | Rescue Service |
| S | Space Patrol HQ |
| ? | Menu |
| Q | Quit |

### 11.5 Ship Upgrades (SP.SPEED)

| Command | Action |
|---------|--------|
| 1-9 | Purchase Component |
| A | Assess Ship Value |
| X | Ship Stats |
| ? | Menu |
| Q | Quit |

### 11.6 Repairs (SP.DAMAGE)

| Command | Action |
|---------|--------|
| 1-8 | Repair Specific Component |
| 9 | Repair Cargo Pods (free) |
| R | Repair All Damage |
| D | Damage Assessment |
| X | Ship Stats |
| ? | Menu |
| Q | Quit |

---

## 12. Tips for Success

### 12.1 Early Game

1. **Start Small:** Take short trips to nearby systems
2. **Build Credits:** Focus on cargo delivery (safe income)
3. **Upgrade Gradually:** Improve one component at a time
4. **Avoid Combat:** Until you have decent weapons/shields
5. **Join Alliance:** Protection and support from experienced players

### 12.2 Mid Game

1. **Buy a Port:** Steady income from fees and fuel
2. **Specialize:** Choose trader, patrol, or combat focus
3. **Complete Trips:** Build score for promotions
4. **Maintain Ship:** Regular repairs prevent disasters
5. **Help Others:** Rescues build reputation and points

### 12.3 Late Game

1. **Aim for Nemesis:** Prepare for the ultimate mission
2. **Max Components:** Get all systems to 199 strength
3. **Special Equipment:** STAR-BUSTER, ARCH-ANGEL
4. **Top Rankings:** Compete for Top Gun honors
5. **Mentor Others:** Help new spacers learn the game

### 12.4 Combat Tips

1. **Know Your B/F:** Battle Factor determines outcomes
2. **Maintain Shields:** Keep condition at 8-9
3. **Upgrade Weapons:** Higher strength = more damage
4. **Retreat When Needed:** Live to fight another day
5. **Cloaking Device:** Essential for small ships

### 12.5 Economic Tips

1. **Fuel Management:** Buy cheap, sell dear
2. **Port Selection:** High-traffic systems earn more
3. **Alliance Investment:** Pool resources for takeovers
4. **Diversify:** Don't put all credits in one port
5. **Daily Limits:** Use all 3 trips efficiently

### 12.6 Common Mistakes to Avoid

1. ❌ Running out of fuel mid-journey
2. ❌ Fighting enemies too strong for your ship
3. ❌ Forgetting to repair damage
4. ❌ Spending all credits on upgrades (keep reserve)
5. ❌ Ignoring alliance opportunities
6. ❌ Taking contracts without checking destination
7. ❌ Modem disconnect during combat (jail penalty!)

---

## Appendix A: Rank Progression

| Rank | Points | Honorarium |
|------|--------|------------|
| Lieutenant | 0-149 | None |
| Commander | 150-299 | 20,000 cr |
| Captain | 300-449 | 30,000 cr |
| Commodore | 450-599 | 40,000 cr |
| Admiral | 600-899 | 50,000 cr |
| Top Dog | 900-1099 | 80,000 cr |
| Grand Mufti | 1100-1399 | 100,000 cr |
| Mega Hero | 1400-1699 | 120,000 cr |
| Giga Hero | 1700+ | 150,000 cr |

---

## Appendix B: Quick Reference Card

```
╔═══════════════════════════════════════════════════════════╗
║              SPACERQUEST QUICK REFERENCE                  ║
╠═══════════════════════════════════════════════════════════╣
║  MAIN MENU:  B=Bulletins  K=Battles  V=Visitors          ║
║              G=News  H=Help  M=Map  P=Prices  S=Heroes   ║
╠═══════════════════════════════════════════════════════════╣
║  LAUNCH: L=Launch  F=Fuel  D=Damage  X=Stats  Q=Quit    ║
╠═══════════════════════════════════════════════════════════╣
║  BRIDGE: D=Data  N=Nav  W=Weapons  ?=Menu  Q=Quit       ║
╠═══════════════════════════════════════════════════════════╣
║  REGISTRY: L=Library  R=Rescue  S=Patrol  Q=Quit        ║
╠═══════════════════════════════════════════════════════════╣
║  UPGRADES: 1-8=Components  9=Special  X=Assess          ║
╠═══════════════════════════════════════════════════════════╣
║  COMBAT: Y=Attack  N=Retreat  Pay Tribute  Surrender    ║
╚═══════════════════════════════════════════════════════════╝
```

---

*This manual was reverse engineered from decompiled ACOS BASIC source code - SpacerQuest v3.4*

*Original game by Firefox for The Den of The Firefox BBS - 05/25/91*

*Long Live The Rebel Alliance!*
