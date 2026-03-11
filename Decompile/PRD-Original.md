# SpacerQuest v3.4 - Product Requirements Document (PRD)

**Document Type:** Reverse Engineered PRD  
**Product:** SpacerQuest  
**Version:** 3.4  
**Original Release:** May 25, 1991  
**Platform:** Apple II GBBS (Golden BBS)  
**Author:** Firefox  
**BBS:** The Den of The Firefox (209-526-1771)

---

## 1. Executive Summary

### 1.1 Product Vision
SpacerQuest is a persistent multi-user space simulation game designed for bulletin board systems (BBS). The game provides players with an immersive spacefaring experience where they can own spaceships, engage in trade, join alliances, participate in combat, and compete for prestige in a shared galaxy.

### 1.2 Target Audience
- BBS users with Apple II computers
- Fans of space exploration and trading games
- Players seeking persistent character progression
- Competitive players interested in rankings and achievements
- Social players who enjoy alliance membership and cooperation

### 1.3 Key Differentiators
- Persistent character and ship progression across sessions
- Complex economic system with player-owned space ports
- Alliance system with territorial control
- Multiple gameplay paths (trader, pirate, patrol, explorer)
- Special endgame missions (Nemesis, Maligna)
- Player-vs-player dueling system
- Daily turn limits encouraging strategic play

---

## 2. Product Overview

### 2.1 Game World
The SpacerQuest universe consists of:
- **Milky Way Galaxy:** 14 star systems (Sun-3 through Vega-6)
- **Rim Stars:** 6 additional systems (Antares-5 through Algol-2)
- **Andromeda Galaxy:** 6 NGC systems accessible via black hole
- **Special Locations:** Maligna (rogue star), Nemesis (hidden system)

### 2.2 Player Journey
1. **Onboarding:** New players create a spacer character
2. **Initial Goals:** Earn credits, purchase a ship, learn mechanics
3. **Progression:** Upgrade ship components, complete missions
4. **Mid-Game:** Join alliance, own space port, specialize role
5. **End-Game:** Special missions (Nemesis, Maligna), achieve top rankings

### 2.3 Core Loops

#### Primary Loop (Space Travel)
```
Space Port → Launch → Travel → Encounter? → Combat/Event → Dock → Repeat
```

#### Economic Loop
```
Earn Credits → Upgrade Ship → Take Better Contracts → Earn More Credits
```

#### Progression Loop
```
Complete Trips → Gain Points → Promotion → Better Opportunities → More Points
```

---

## 3. Functional Requirements

### 3.1 Character System

#### 3.1.1 Character Creation
| ID | Requirement | Priority |
|----|-------------|----------|
| CH-001 | System shall allow users to create a new spacer character | Must Have |
| CH-002 | System shall assign unique spacer ID number | Must Have |
| CH-003 | System shall initialize character with starting credits (10,000 cr for conquerors) | Must Have |
| CH-004 | System shall allow character naming with 3-15 character limit | Must Have |
| CH-005 | System shall prevent reserved prefixes in names (THE, *, J%, etc.) | Should Have |

#### 3.1.2 Character Progression
| ID | Requirement | Priority |
|----|-------------|----------|
| CH-101 | System shall track completed space trips (u1) | Must Have |
| CH-102 | System shall track astrecs traveled (j1) | Must Have |
| CH-103 | System shall track cargo delivered (k1) | Must Have |
| CH-104 | System shall track battles won/lost (e1, m1) | Must Have |
| CH-105 | System shall track rescues performed (b1) | Must Have |
| CH-106 | System shall calculate total score points (s2) | Must Have |
| CH-107 | System shall promote players based on score thresholds | Must Have |

#### 3.1.3 Rank System
| Rank | Points Required | Bonus |
|------|-----------------|-------|
| Lieutenant | 0 | None |
| Commander | 1 | 20,000 cr |
| Captain | 2 | 30,000 cr |
| Commodore | 3-4 | 40,000 cr |
| Admiral | 5-7 | 50,000 cr |
| Top Dog | 8-10 | 80,000 cr |
| Grand Mufti | 11-13 | 100,000 cr |
| Mega Hero | 14-17 | 120,000 cr |
| Giga Hero | 18+ | 150,000 cr |

### 3.2 Ship System

#### 3.2.1 Ship Components
| ID | Component | Strength Range | Condition Range | Purpose |
|----|-----------|----------------|-----------------|---------|
| SH-001 | Hull (h1/h2) | 0-209 | 0-9 | Ship integrity, fuel capacity |
| SH-002 | Drives (d1/d2) | 0-209 | 0-9 | Travel speed, fuel efficiency |
| SH-003 | Cabin (c1/c2) | 0-209 | 0-9 | Battle computer contribution |
| SH-004 | Life Support (l1/l2) | 0-209 | 0-9 | Survival, battle contribution |
| SH-005 | Weapons (w1/w2) | 0-209 | 0-9 | Combat effectiveness |
| SH-006 | Navigation (n1/n2) | 0-209 | 0-9 | Course accuracy, precision |
| SH-007 | Robotics (r1/r2) | 0-209 | 0-9 | Battle computer, accuracy |
| SH-008 | Shields (p1/p2) | 0-209 | 0-9 | Damage protection |

#### 3.2.2 Ship Upgrades
| ID | Requirement | Priority |
|----|-------------|----------|
| SS-001 | System shall allow component strength upgrades | Must Have |
| SS-002 | System shall allow component condition repairs | Must Have |
| SS-003 | System shall offer Titanium Hull Reinforcement (+10 str, +50 pods) | Must Have |
| SS-004 | System shall offer Trans-Warp Accelerator | Should Have |
| SS-005 | System shall offer Morton's Cloaking Device (small ships only) | Should Have |
| SS-006 | System shall offer Auto-Repair Module | Should Have |
| SS-007 | System shall offer STAR-BUSTER++ weapon (endgame) | Should Have |
| SS-008 | System shall offer ARCH-ANGEL++ shields (endgame) | Should Have |
| SS-009 | System shall prevent incompatible upgrades | Must Have |

#### 3.2.3 Ship Naming
| ID | Requirement | Priority |
|----|-------------|----------|
| SN-001 | System shall allow ship naming (3-15 characters) | Must Have |
| SN-002 | System shall allow ship renaming | Should Have |
| SN-003 | System shall append alliance symbols to ship names | Must Have |
| SN-004 | System shall prevent reserved name patterns | Should Have |

### 3.3 Navigation System

#### 3.3.1 Travel Mechanics
| ID | Requirement | Priority |
|----|-------------|----------|
| NV-001 | System shall calculate fuel cost based on distance and drive strength | Must Have |
| NV-002 | System shall calculate travel time based on distance | Must Have |
| NV-003 | System shall allow manual course changes (limited per trip) | Must Have |
| NV-004 | System shall consume fuel during travel | Must Have |
| NV-005 | System shall register "Lost in Space" when fuel depleted | Must Have |
| NV-006 | System shall generate random hazards during travel | Should Have |
| NV-007 | System shall allow black hole transit (special hulls only) | Should Have |

#### 3.3.2 Star Systems
| ID | System Name | ID | Type | Features |
|----|-------------|----|----|----|
| NV-101 | Sun-3 | 1 | Core | Standard port |
| NV-102 | Aldebaran-1 | 2 | Core | Standard port |
| NV-103 | Altair-3 | 3 | Core | Standard port |
| NV-104 | Arcturus-6 | 4 | Core | Standard port |
| NV-105 | Deneb-4 | 5 | Core | Standard port |
| NV-106 | Denebola-5 | 6 | Core | Standard port |
| NV-107 | Fomalhaut-2 | 7 | Core | Standard port |
| NV-108 | Mira-9 | 8 | Core | Cheap fuel |
| NV-109 | Pollux-7 | 9 | Core | Standard port |
| NV-110 | Procyon-5 | 10 | Core | Standard port |
| NV-111 | Regulus-6 | 11 | Core | Standard port |
| NV-112 | Rigel-8 | 12 | Core | Standard port |
| NV-113 | Spica-3 | 13 | Core | Standard port |
| NV-114 | Vega-6 | 14 | Core | Maligna access |
| NV-115 | Antares-5 | 15 | Rim | Shield repair |
| NV-116 | Capella-4 | 16 | Rim | Gem bonus |
| NV-117 | Polaris-1 | 17 | Rim | Wise One |
| NV-118 | Mizar-9 | 18 | Rim | Sage |
| NV-119 | Achernar-5 | 19 | Rim | Navigation repair |
| NV-120 | Algol-2 | 20 | Rim | No repairs |

### 3.4 Combat System

#### 3.4.1 Encounter System
| ID | Requirement | Priority |
|----|-------------|----------|
| CB-001 | System shall generate random encounters during travel | Must Have |
| CB-002 | System shall scale encounter probability by system | Should Have |
| CB-003 | System shall support multiple enemy types (pirate, patrol, rim pirate, reptiloid, brigand) | Must Have |
| CB-004 | System shall allow attack or retreat decision | Must Have |
| CB-005 | System shall allow surrender/tribute option | Should Have |

#### 3.4.2 Battle Mechanics
| ID | Requirement | Priority |
|----|-------------|----------|
| CB-101 | System shall calculate battle advantage from components | Must Have |
| CB-102 | System shall process weapon fire (strength × condition) | Must Have |
| CB-103 | System shall process shield absorption | Must Have |
| CB-104 | System shall damage enemy systems based on hit location | Must Have |
| CB-105 | System shall track battles won/lost | Must Have |
| CB-106 | System shall allow retreat with potential penalties | Should Have |
| CB-107 | System shall support cloaking device (escape mechanism) | Should Have |

#### 3.4.3 Battle Factors
Battle Factor calculation:
```
BF = (component_strength × condition) + rank_bonus + experience_bonus
```

### 3.5 Economic System

#### 3.5.1 Currency
| ID | Requirement | Priority |
|----|-------------|----------|
| EC-001 | System shall use Credits (cr) as currency | Must Have |
| EC-002 | System shall support large numbers (10,000+ cr units) | Must Have |
| EC-003 | System shall track credits in two variables (g1=high, g2=low) | Must Have |

#### 3.5.2 Space Port Ownership
| ID | Requirement | Priority |
|----|-------------|----------|
| EC-101 | System shall allow purchase of space ports | Must Have |
| EC-102 | System shall set port prices (10,000+ cr based on system) | Must Have |
| EC-103 | System shall allow port resale (50% value) | Should Have |
| EC-104 | System shall track port ownership in sp.bank | Must Have |
| EC-105 | System shall generate daily income from ports | Must Have |
| EC-106 | System shall evict inactive port owners | Should Have |

#### 3.5.3 Fuel Economy
| ID | Requirement | Priority |
|----|-------------|----------|
| EC-201 | System shall allow fuel purchase (10-30 cr/unit) | Must Have |
| EC-202 | System shall allow fuel sale (2-5 cr/unit) | Must Have |
| EC-203 | System shall set fuel depot capacity (20,000 units max) | Must Have |
| EC-204 | System shall allow port owners to set fuel prices | Must Have |
| EC-205 | System shall support fuel transfer between ships and depots | Should Have |

#### 3.5.4 Cargo Trading
| ID | Requirement | Priority |
|----|-------------|----------|
| EC-301 | System shall support cargo contracts | Must Have |
| EC-302 | System shall pay on delivery based on pod count | Must Have |
| EC-303 | System shall validate cargo destination | Must Have |
| EC-304 | System shall support smuggling contracts (higher pay, risk) | Should Have |
| EC-305 | System shall confiscate contraband on capture | Should Have |

### 3.6 Alliance System

#### 3.6.1 Alliance Membership
| ID | Requirement | Priority |
|----|-------------|----------|
| AL-001 | System shall support 4 alliances: Astro League, Space Dragons, Warlord Confed, Rebel Alliance | Must Have |
| AL-002 | System shall limit alliance size (1/3 of players, min 4) | Should Have |
| AL-003 | System shall allow alliance switching (credit donation) | Should Have |
| AL-004 | System shall append alliance symbols to names (+, @, &, ^) | Must Have |

#### 3.6.2 Alliance Investment
| ID | Requirement | Priority |
|----|-------------|----------|
| AL-101 | System shall allow alliance star system ownership | Must Have |
| AL-102 | System shall require 10,000 cr startup investment | Must Have |
| AL-103 | System shall support hostile takeovers | Must Have |
| AL-104 | System shall support DEFCON fortification (1-20) | Must Have |
| AL-105 | System shall protect high-DEFCON systems | Should Have |
| AL-106 | System shall track alliance transactions | Must Have |

#### 3.6.3 Alliance Features
| ID | Requirement | Priority |
|----|-------------|----------|
| AL-201 | System shall provide alliance bulletin boards | Must Have |
| AL-202 | System shall restrict bulletins to alliance members | Must Have |
| AL-203 | System shall support raid planning against rival alliances | Should Have |

### 3.7 Mission System

#### 3.7.1 Space Patrol Missions
| ID | Requirement | Priority |
|----|-------------|----------|
| MS-001 | System shall allow players to join Space Patrol | Must Have |
| MS-002 | System shall assign patrol sectors | Must Have |
| MS-003 | System shall pay 500 cr base + 1000 cr per battle won | Must Have |
| MS-004 | System shall limit to 3 trips per day | Must Have |
| MS-005 | System shall require oath commitment | Should Have |

#### 3.7.2 Nemesis Mission (Endgame)
| ID | Requirement | Priority |
|----|-------------|----------|
| MS-101 | System shall offer Nemesis mission to qualified players (500+ wins) | Must Have |
| MS-102 | System shall require perfect ship condition | Must Have |
| MS-103 | System shall provide coordinates (00,00,00) | Must Have |
| MS-104 | System shall reward 150,000 cr on completion | Must Have |
| MS-105 | System shall upgrade ship components on completion | Must Have |

#### 3.7.3 Maligna Mission (Endgame)
| ID | Requirement | Priority |
|----|-------------|----------|
| MS-201 | System shall offer Maligna mission to conquerors | Must Have |
| MS-202 | System shall require Astraxial hull (100,000 cr) | Must Have |
| MS-203 | System shall require coordinates (13,33,99) | Must Have |
| MS-204 | System shall reward hero status | Should Have |

#### 3.7.4 Andromeda Missions
| ID | Requirement | Priority |
|----|-------------|----------|
| MS-301 | System shall provide access to 6 NGC systems via black hole | Must Have |
| MS-302 | System shall offer exotic cargo types | Must Have |
| MS-303 | System shall require Astraxial hull for safe transit | Should Have |

### 3.8 Social Systems

#### 3.8.1 Dueling Arena
| ID | Requirement | Priority |
|----|-------------|----------|
| SO-001 | System shall support player-vs-player duels | Must Have |
| SO-002 | System shall allow stakes setting (points, components, credits) | Must Have |
| SO-003 | System shall provide arena types with requirements | Must Have |
| SO-004 | System shall maintain dueling roster | Must Have |
| SO-005 | System shall log duel results | Should Have |
| SO-006 | System shall support handicap system | Must Have |

#### 3.8.2 Information Systems
| ID | Requirement | Priority |
|----|-------------|----------|
| SO-101 | System shall provide ship directory | Must Have |
| SO-102 | System shall provide alliance member lists | Must Have |
| SO-103 | System shall maintain Top Gun rankings | Must Have |
| SO-104 | System shall maintain high score leaderboard | Must Have |
| SO-105 | System shall log daily visitors | Must Have |
| SO-106 | System shall log notable achievements | Should Have |

### 3.9 Mini-Games

#### 3.9.1 Digital Wheel of Fortune
| ID | Requirement | Priority |
|----|-------------|----------|
| MG-001 | Game shall allow betting on numbers 1-20 | Must Have |
| MG-002 | Game shall support 3-7 rolls per round | Must Have |
| MG-003 | Game shall pay odds based on roll count | Must Have |
| MG-004 | Game shall limit bets to 1000 cr | Must Have |

#### 3.9.2 Spacer's Dare (Dice Game)
| ID | Requirement | Priority |
|----|-------------|----------|
| MG-101 | Game shall support 3-10 rounds | Must Have |
| MG-102 | Game shall allow score multiplier selection (1-3) | Must Have |
| MG-103 | Game shall require minimum 750 cr to play | Must Have |
| MG-104 | Game shall implement human vs computer competition | Must Have |

---

## 4. Non-Functional Requirements

### 4.1 Performance
| ID | Requirement | Priority |
|----|-------------|----------|
| NF-001 | System shall support multiple concurrent users | Must Have |
| NF-002 | System shall complete transactions within 5 seconds | Should Have |
| NF-003 | System shall limit daily turns to prevent abuse | Must Have |

### 4.2 Data Persistence
| ID | Requirement | Priority |
|----|-------------|----------|
| NF-101 | System shall persist character data between sessions | Must Have |
| NF-102 | System shall persist game state (ports, alliances, etc.) | Must Have |
| NF-103 | System shall maintain data integrity with file locking | Must Have |

### 4.3 Security
| ID | Requirement | Priority |
|----|-------------|----------|
| NF-201 | System shall prevent unauthorized sysop access | Must Have |
| NF-202 | System shall validate all user inputs | Must Have |
| NF-203 | System shall prevent save scumming (carrier-loss penalty) | Should Have |

### 4.4 Usability
| ID | Requirement | Priority |
|----|-------------|----------|
| NF-301 | System shall provide help files | Should Have |
| NF-302 | System shall display clear error messages | Should Have |
| NF-303 | System shall support single-key commands where possible | Should Have |

---

## 5. Technical Requirements

### 5.1 Platform
| ID | Requirement | Priority |
|----|-------------|----------|
| TR-001 | System shall run on Apple II hardware | Must Have |
| TR-002 | System shall use GBBS (Golden BBS) platform | Must Have |
| TR-003 | System shall use ACOS BASIC language | Must Have |

### 5.2 Data Storage
| ID | Requirement | Priority |
|----|-------------|----------|
| TR-101 | System shall use flat files for data persistence | Must Have |
| TR-102 | System shall support ProDOS volume specifiers | Must Have |
| TR-103 | System shall implement record-based file structures | Must Have |

### 5.3 Integration
| ID | Requirement | Priority |
|----|-------------|----------|
| TR-201 | System shall integrate with BBS user authentication | Must Have |
| TR-202 | System shall support sysop utilities | Must Have |
| TR-203 | System shall link to external text files for displays | Must Have |

---

## 6. Game Balance Specifications

### 6.1 Component Pricing
| Component | Base Price | Upgrade Cost |
|-----------|------------|--------------|
| Hull +10 | 10,000 cr | 10,000 cr |
| Drives +10 | 9,000 cr | 9,000 cr |
| Weapons +10 | 8,000 cr | 8,000 cr |
| Shields +10 | 7,000 cr | 7,000 cr |
| Navigation +10 | 5,000 cr | 5,000 cr |
| Robotics +10 | 4,000 cr | 4,000 cr |
| Life Support +10 | 6,000 cr | 6,000 cr |
| Cabin +10 | 8,000 cr | 8,000 cr |

### 6.2 Special Equipment
| Item | Price | Requirements |
|------|-------|--------------|
| Morton's Cloaker | 500 cr | Hull < 50 |
| Auto-Repair Module | Hull × 1000 cr | Any hull |
| STAR-BUSTER++ | 10,000 cr | Conqueror, Maligna |
| ARCH-ANGEL++ | 10,000 cr | Conqueror, Maligna |
| Astraxial Hull | 100,000 cr | Conqueror, Drives > 24 |

### 6.3 Fuel Pricing
| Location | Buy Price | Sell Price |
|----------|-----------|------------|
| Space Authority | 25 cr/unit | 2-5 cr/unit |
| Port Owner Set | 0-50 cr/unit | 50% of buy |
| Mira-9 | 4 cr/unit | N/A |
| Vega-6 | 6 cr/unit | N/A |
| Sun-3 | 8 cr/unit | N/A |

---

## 7. Success Metrics

### 7.1 Player Engagement
- Daily active users
- Average session length
- Trips completed per day
- Return player rate

### 7.2 Economic Health
- Total credits in circulation
- Space port ownership distribution
- Average player wealth
- Fuel market activity

### 7.3 Competition
- Top Gun participation
- Dueling arena activity
- Alliance membership distribution
- High score progression

### 7.4 Completion
- Nemesis mission completions
- Maligna mission completions
- Players achieving Giga Hero rank
- Total conquests (s2 > 9999)

---

## 8. Appendix

### 8.1 Glossary
| Term | Definition |
|------|------------|
| Spacer | Player character |
| Astrec | Unit of distance between star systems |
| B/F | Battle Factor - combat effectiveness rating |
| DEFCON | Defense condition level for star systems |
| Conqueror | Player with 10,000+ points |

### 8.2 References
- SP.START.S - Main entry point
- SP.WARP.S - Navigation system
- SP.FIGHT1.S - Combat engine
- SP.REAL.S - Port ownership
- SP.VEST.S - Alliance investment
- SP.END.S - Game exit/save

---

*This PRD was reverse engineered from decompiled ACOS BASIC source code - SpacerQuest v3.4*
