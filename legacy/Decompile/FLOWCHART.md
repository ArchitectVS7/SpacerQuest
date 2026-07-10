# SpacerQuest v3.4 - Program Flow Flowchart

## Main Entry Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    BBS SYSTEM ENTRY                             │
    │                    (a:logoff.seg)                               │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                      SP.START.S                                 │
    │                  Main Entry Point                               │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ • Display title banner                                    │  │
    │  │ • Validate user (nocar check)                             │  │
    │  │ • Load volume specifiers (vj$, ma$, dr$)                  │  │
    │  │ • Read configuration (sp.conf)                            │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    PLAYER VALIDATION                            │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ Is player already registered?                             │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                    │                               │
                   YES                              NO
                    │                               │
                    ▼                               ▼
    ┌──────────────────────────┐    ┌──────────────────────────────────┐
    │   VAL.START              │    │   NEW.START                      │
    │   Validate existing      │    │   Create new spacer record       │
    │   • Check for jail flag  │    │   • Find empty slot              │
    │   • Check lost ships     │    │   • Initialize variables         │
    │   • Process rescue       │    │   • Call SP.SYSOP for creation   │
    └──────────────────────────┘    └──────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    HAILSTART                                    │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ • Welcome player by name                                  │  │
    │  │ • Display ship status                                     │  │
    │  │ • Show lost ship messages (if applicable)                 │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    MAIN1 - Space Port Menu                      │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ [ Command Menu ]                                          │  │
    │  │  B - Alliance Bulletins  → SP.TOP.S (bull)               │  │
    │  │  K - Battle Log          → SP.TOP.S (filer)              │  │
    │  │  V - Visitor Log         → Display sp.log                │  │
    │  │  G - Space News          → Display sp.great              │  │
    │  │  H - Help                → Display sp.help               │  │
    │  │  M - Map                 → Display sp.map                │  │
    │  │  N - New Character       → Create new spacer             │  │
    │  │  P - Port Fuel Prices    → Display port prices           │  │
    │  │  S - Space Heroes        → Display sp.hero               │  │
    │  │  ? - Menu                → Redisplay menu                │  │
    │  │  [Other] → SP.LINK (exit)                                │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
```

## Space Port Operations Flow

```
                              MAIN1 Menu
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌──────────────────┐       ┌─────────────────┐
│  SP.LIFT.S      │    │  SP.SPEED.S      │       │  SP.DAMAGE.S    │
│  Launch Control │    │  Ship Upgrades   │       │  Repairs        │
└─────────────────┘    └──────────────────┘       └─────────────────┘
         │                         │                         │
         ▼                         ▼                         ▼
┌─────────────────┐    ┌──────────────────┐       ┌─────────────────┐
│ • Launch Fee    │    │ • Hull Enhance   │       │ • Damage Check  │
│ • Fuel Purchase │    │ • Drive Upgrade  │       │ • Component Fix │
│ • Fuel Sale     │    │ • Weapon Install │       │ • Replace Parts │
│ • Mission Check │    │ • Shield Install │       │ • Hull Repair   │
│ • Course Valid. │    │ • Special Items  │       │ • Auto-Repair   │
└─────────────────┘    └──────────────────┘       └─────────────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────┐
                        │   SP.REG.S       │
                        │   Space Registry │
                        └──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
              ▼                    ▼                    ▼
     ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
     │   LIBRARY       │ │   RESCUE        │ │   PATROL HQ     │
     │ • Ship Directory│ │ • Find Lost     │ │ • Join S.P.     │
     │ • Alliance List │ │ • Pay Rescue    │ │ • Get Mission   │
     │ • Top Gun       │ │ • Register      │ │ • Launch        │
     │ • Help Files    │ │   Lost Ship     │ │ • Dock          │
     └─────────────────┘ └─────────────────┘ └─────────────────┘
```

## Space Travel Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.LIFT.S - Launch                           │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ LAUNCH SEQUENCE:                                          │  │
    │  │ 1. Validate ship systems (drives, cabin, life support)    │  │
    │  │ 2. Check fuel requirements                                │  │
    │  │ 3. Validate cargo contract (if any)                       │  │
    │  │ 4. Calculate launch fee                                   │  │
    │  │ 5. Count down: T-MINUS [9]...[0] GO!                      │  │
    │  │ 6. Transfer to SP.WARP.S                                  │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.WARP.S - Ship Bridge                      │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ BRIDGE COMMANDS:                                          │  │
    │  │                                                           │  │
    │  │  [D]ata Banks  ─┬─→ [M]ap                               │  │
    │  │                 ├─→ [X] Ship Stats                      │  │
    │  │                 └─→ [H]elp                              │  │
    │  │                                                           │  │
    │  │  [N]avigation ──┬─→ Manual Course Change                 │  │
    │  │                 ├─→ Automatic (docked)                   │  │
    │  │                 └─→ Black Hole Transit                   │  │
    │  │                                                           │  │
    │  │  [W]eapons ───→ Display weapon/shield status             │  │
    │  │                                                           │  │
    │  │  [Q]uit ──────→ Return to space port                     │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
        ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
        │  COURSE CHANGE  │ │  HAZARDS    │ │  TIME ELAPSED   │
        │ • Fuel cost     │ │ • Radiation │ │ • tt++          │
        │ • Update q4$    │ │ • Asteroids │ │ • Check ty      │
        │ • Update q6     │ │ • Damage    │ │ • Arrival?      │
        │ • Increment ry  │ │ • Component │ │                 │
        └─────────────────┘ │   failure   │ └─────────────────┘
                    │       └─────────────┘         │
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │    ARRIVAL AT DESTINATION     │
                    │                               │
                    │  Is q4 < 15?                  │
                    └───────────────────────────────┘
                            │               │
                           YES             NO
                            │               │
                            ▼               ▼
                  ┌─────────────────┐ ┌─────────────────┐
                  │   SP.DOCK1.S    │ │   SP.DOCK2.S    │
                  │   Milky Way     │ │   Rim Stars     │
                  │   (Systems 1-14)│ │   (Systems 15-20)│
                  └─────────────────┘ └─────────────────┘
```

## Combat Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.FIGHT1.S - Battle Start                   │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ ENEMY DETECTION:                                          │  │
    │  │ • Scan for pirates/patrol/enemies                         │  │
    │  │ • Check encounter probability                             │  │
    │  │ • Identify enemy ship                                     │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    BATTLE INITIATION                            │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ ENEMY IDENTIFIED:                                         │  │
    │  │ • Display enemy ship class                                │  │
    │  │ • Display enemy commander                                 │  │
    │  │ • Ask: Attack? (Y)/(N)                                    │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                   YES                              NO
                    │                               │
                    ▼                               ▼
    ┌──────────────────────────┐    ┌──────────────────────────────────┐
    │   BEGIN ATTACK           │    │   ENEMY ESCAPES                  │
    │   • Initialize battle    │    │   • Continue scanning            │
    │   • Calculate advantage  │    │   • Next encounter               │
    │   • Display status       │    └──────────────────────────────────┘
    └──────────────────────────┘
                    │
                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    BATTLE ROUND                                 │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ ROUND #kg                                                 │  │
    │  │                                                           │  │
    │  │ [Player Phase]                                            │  │
    │  │ • Fire weapons (x8 = w1 × w2)                             │  │
    │  │ • Damage enemy shields (y9)                               │  │
    │  │ • Damage enemy systems                                    │  │
    │  │                                                           │  │
    │  │ [Enemy Phase]                                             │  │
    │  │ • Enemy fires (y8 = p7 × p8)                              │  │
    │  │ • Damage player shields (x9)                              │  │
    │  │ • Damage player systems                                   │  │
    │  │                                                           │  │
    │  │ [Status Display]                                          │  │
    │  │ • Both ships' weapon/shield status                        │  │
    │  │ • Battle factors (B/F)                                    │  │
    │  │ • Fuel remaining                                          │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    BATTLE DECISION                              │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ Continue Attack? (Y)/(N)                                  │  │
    │  │                                                           │  │
    │  │ If N: Retreat                                             │  │
    │  │ • Check if enemy lets you go                              │  │
    │  │ • May lose cargo/fuel                                     │  │
    │  │                                                           │  │
    │  │ Enemy may demand tribute:                                 │  │
    │  │ • Pay credits? (Y)/(N)                                    │  │
    │  │ • Surrender cargo?                                        │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
            BATTLE WON                     BATTLE LOST
                    │                               │
                    ▼                               ▼
    ┌──────────────────────────┐    ┌──────────────────────────────────┐
    │   VICTORY                │    │   DEFEAT                         │
    │   • wb++                 │    │   • lb++                         │
    │   • Loot enemy (p5)      │    │   • Ship damaged                 │
    │   • Update records       │    │   • May lose cargo               │
    │   • Continue scanning    │    │   • May register as lost         │
    └──────────────────────────┘    └──────────────────────────────────┘
                    │                               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.FIGHT2.S - Resolution                     │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ • Process battle outcomes                                 │  │
    │  │ • Update pirate/patrol records                            │  │
    │  │ • Return to SP.WARP or SP.DOCK                           │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
```

## Economic Systems Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SPACE PORT ECONOMY                           │
    └─────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  SP.REAL.S      │      │  SP.VEST.S      │      │  SP.BAR.S       │
│  Port Accounts  │      │  Alliance Inv.  │      │  Spacers Hangout│
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                          │                          │
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ • Buy Space Port        │ │ • Join Alliance         │ │ • Gambling Games        │
│   (10,000+ cr)          │ │ • Invest Credits        │ │   - Wheel of Fortune    │
│ • Sell Space Port       │ │ • Withdraw Funds        │ │   - Spacer's Dare       │
│ • Set Fuel Price        │ │ • Hostile Takeover      │ │ • Information Exchange  │
│ • Buy/Sell Fuel         │ │ • Fortify DEFCON        │ │ • Alliance Joining      │
│ • Transfer Fuel         │ │ • Star System Control   │ │ • Smuggling Contracts   │
│ • Port Fee Collection   │ │ • CEO Management        │ │ • Raid Planning         │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

## Special Missions Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SPECIAL MISSIONS                             │
    └─────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  SPACE PATROL   │      │  NEMESIS        │      │  MALIGNA        │
│  (SP.REG.S)     │      │  (SP.TOP.S)     │      │  (SP.BLACK.S)   │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ Requirements:           │ │ Requirements:           │ │ Requirements:           │
│ • Ship combat capable   │ │ • Win 500+ battles      │ │ • Conqueror status      │
│ • Take oath             │ │ • Perfect ship condition│ │ • Astraxial hull        │
│ • Choose sector         │ │ • Coordinates 00,00,00  │ │ • 100,000 credits       │
│                         │ │                         │ │                         │
│ Mission:                │ │ Mission:                │ │ Mission:                │
│ • Patrol assigned system│ │ • Travel to NEMESIS     │ │ • Travel to MALIGNA     │
│ • Fight pirates         │ │ • Retrieve Star Jewels  │ │ • Ablate rogue star     │
│ • Earn pay + bonus      │ │ • Return safely         │ │ • Save the galaxy       │
│                         │ │                         │ │                         │
│ Reward:                 │ │ Reward:                 │ │ Reward:                 │
│ • 500 cr + 1000/won     │ │ • 150,000 credits       │ │ • Hero status           │
│ • Promotion points      │ │ • Ship enhancements     │ │ • Special recognition   │
│ • Alliance standing     │ │ • Galaxy's gratitude    │ │                         │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘

                    ┌──────────────────────────┐
                    │  ANDROMEDA MISSIONS      │
                    │  (SP.BLACK.S)            │
                    └──────────────────────────┘
                              │
                              ▼
                    ┌─────────────────────────┐
                    │ Requirements:           │
                    │ • Astraxial hull        │
                    │ • Black hole transit    │
                    │                         │
                    │ Mission:                │
                    │ • Transit black hole    │
                    │ • Visit NGC systems     │
                    │ • Collect exotic cargo  │
                    │                         │
                    │ Cargo Types:            │
                    │ • Dragonium Ore         │
                    │ • Merusian Liquor       │
                    │ • Mystium Ore           │
                    │ • Oreganol Herbs        │
                    │ • Sonolide Crystal      │
                    │ • Infernum Spice        │
                    └─────────────────────────┘
```

## Dueling Arena Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.ARENA1.S - Dueling Arena                  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    ARENA MENU                                   │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ [Dueling Arena Commands]                                  │  │
    │  │  V - View Roster                                          │  │
    │  │  B - Battle Log (duel.log)                                │  │
    │  │  L - Spacer List                                          │  │
    │  │  O - Options/Help                                         │  │
    │  │  X - Ship Stats                                           │  │
    │  │  1 - Become Contender                                     │  │
    │  │  2 - Challenge                                            │  │
    │  │  3 - Remove from Roster                                   │  │
    │  │  Q - Quit Arena                                           │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    BECOME CONTENDER                             │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ SETUP DUEL:                                               │  │
    │  │ 1. Choose Stakes:                                         │  │
    │  │    • Points (s2/10 per handicap)                          │  │
    │  │    • Ship Component Strength                              │  │
    │  │    • Credits                                              │  │
    │  │                                                           │  │
    │  │ 2. Choose Arena:                                          │  │
    │  │    • Ion Cloud (requires 50+ trips)                       │  │
    │  │    • Proton Storm (requires 100+ astrecs)                 │  │
    │  │    • Cosmic Radiation (requires 100+ cargo)               │  │
    │  │    • Black Hole (requires 1+ rescue)                      │  │
    │  │    • Super-Nova Flare                                     │  │
    │  │    • Deep Space                                           │  │
    │  │                                                           │  │
    │  │ 3. Choose Opponent:                                       │  │
    │  │    • Specific player (#)                                  │  │
    │  │    • Anyone                                               │  │
    │  │                                                           │  │
    │  │ 4. Write to Dueling Roster                                │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    CHALLENGE                                    │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ CHALLENGER ACTIONS:                                       │  │
    │  │ • View roster                                             │  │
    │  │ • Select contender                                        │  │
    │  │ • Accept stakes                                           │  │
    │  │ • Transfer to SP.ARENA2.S for combat                      │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
```

## Game Exit Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.END.S - Game Exit                         │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    EXIT MENU                                    │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ [Exit Options]                                            │  │
    │  │  P - Pirating                                             │  │
    │  │  S - Space Patrol                                         │  │
    │  │  C - Smuggler Patrol                                      │  │
    │  │  W - Dueling Arena                                        │  │
    │  │  R - Return to Port                                       │  │
    │  │  Q - Quit to BBS                                          │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
            QUIT GAME                    SPECIAL ACTIVITIES
                    │                               │
                    ▼                               ▼
    ┌──────────────────────────┐    ┌──────────────────────────────────┐
    │   SAVE GAME              │    │   PIRATING                       │
    │   • Update spacer file   │    │   • Set pp=1                     │
    │   • Check top score      │    │   • Choose system                │
    │   • Check top gun        │    │   • Write pirate record          │
    │   • Log visit            │    │   • Link to SP.WARP              │
    │   • Process promotion    │    │                                  │
    │   • Return to BBS        │    │   SPACE PATROL                   │
    │                          │    │   • Set pp=4                     │
    │                          │    │   • Choose sector                │
    │                          │    │   • Write patrol record          │
    │                          │    │                                  │
    │                          │    │   DUELING                        │
    │                          │    │   • Set pp=8                     │
    │                          │    │   • Enter arena                  │
    └──────────────────────────┘    └──────────────────────────────────┘
```

## Sysop Functions Flow

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SP.SYSOP.S - System Operator                 │
    │                    (Requires Sysop Flag)                        │
    └─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────┐
    │                    SYSOP MENU                                   │
    │  ┌───────────────────────────────────────────────────────────┐  │
    │  │ [Sysop Commands]                                          │  │
    │  │  V - View Visitor Log                                     │  │
    │  │  G - View Great Heroes Log                                │  │
    │  │  F - View Fee Collection                                  │  │
    │  │  K - Battle Log                                           │  │
    │  │  N - Alliance News                                        │  │
    │  │  B - Banking Activity                                     │  │
    │  │  P - Port Owner Eviction                                  │  │
    │  │  A - Alliance Bulletins                                   │  │
    │  │  T - TopGun Generation                                    │  │
    │  │  1,2,3 - Edit Spacers                                     │  │
    │  │  S - Compile Segments                                     │  │
    │  │  C - Continue (return to game)                            │  │
    │  │  Q - Quit to BBS                                          │  │
    │  └───────────────────────────────────────────────────────────┘  │
    └─────────────────────────────────────────────────────────────────┘
```

## Data Persistence Architecture

```
    ┌─────────────────────────────────────────────────────────────────┐
    │                    DATA FILES                                   │
    └─────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  PLAYER DATA    │      │  GAME STATE     │      │  LOGS/RECORDS   │
└─────────────────┘      └─────────────────┘      └─────────────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│ spacers1        │      │ sp.num          │      │ sp.log          │
│ spacers2        │      │ sp.conf         │      │ sp.fee          │
│ topgun          │      │ rand            │      │ sp.great        │
│ topscore        │      │ sp.stk          │      │ sp.hero         │
│ sp.bank         │      │ sp.star         │      │ sp.news         │
│ sp.star         │      │ pirates         │      │ sp.batt         │
│                 │      │ sp.pat          │      │ sp.balance      │
│                 │      │ sp.lost         │      │                 │
│                 │      │ duel.*          │      │                 │
└─────────────────┘      └─────────────────┘      └─────────────────┘
```

---

*Flowchart generated from decompiled ACOS BASIC source code - SpacerQuest v3.4*
