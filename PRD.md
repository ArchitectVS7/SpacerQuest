# SpacerQuest v4.0 - Product Requirements Document

**Document Type:** Modern Rewrite PRD  
**Product:** SpacerQuest  
**Version:** 4.0 (Web Modernization)  
**Original Version:** 3.4 (1991, Apple II GBBS)  


---

## 1. Executive Summary

### 1.1 Product Vision

SpacerQuest is a persistent multi-player space simulation game, modernized for web browsers while preserving the authentic BBS terminal experience. The game provides players with an immersive spacefaring experience where they can own spaceships, engage in trade, join alliances, participate in combat, and compete for prestige in a shared galaxy—all through an authentic ASCII terminal interface.

### 1.2 Product Positioning

SpacerQuest will be hosted as part of a **BBS Game Museum**, a web application featuring multiple classic BBS door games accessible through a unified authentication system. The game maintains the look, feel, and gameplay of the original 1991 Apple II GBBS version while leveraging modern web technologies for accessibility, persistence, and multiplayer functionality.

### 1.3 Key Principles

| Principle | Description |
|-----------|-------------|
| **Authenticity First** | Preserve original menus, commands, and gameplay exactly |
| **Modern Foundation** | Use modern tech stack for reliability and maintainability |
| **Multi-Player Native** | Built for concurrent players (unlike original's file-locking) |
| **Museum Quality** | Documented, preserved, and accessible for future generations |
| **OAuth Integration** | Seamless authentication via parent BBS portal |

### 1.4 Key Differentiators

- ✅ Authentic BBS terminal experience in modern browsers
- ✅ Persistent character and ship progression across sessions
- ✅ Complex economic system with player-owned space ports
- ✅ Alliance system with territorial control
- ✅ Multiple gameplay paths (trader, pirate, patrol, explorer)
- ✅ Special endgame missions (Nemesis, Maligna)
- ✅ Player-vs-player dueling system
- ✅ Daily turn limits encouraging strategic play
- ✅ Real-time multiplayer (vs original's turn-based async)

---

## 2. Product Overview

### 2.1 Game World

The SpacerQuest universe consists of:

| Region | Systems | Description |
|--------|---------|-------------|
| **Milky Way Galaxy** | 14 systems (Sun-3 through Vega-6) | Core gameplay area |
| **Rim Stars** | 6 systems (Antares-5 through Algol-2) | Advanced gameplay |
| **Andromeda Galaxy** | 6 NGC systems | Endgame content |
| **Special Locations** | Maligna, Nemesis | Mission destinations |

### 2.2 Player Journey

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLAYER JOURNEY                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. AUTHENTICATION                                              │
│     BBS Portal OAuth → SpacerQuest Character                    │
│                                                                 │
│  2. ONBOARDING                                                  │
│     • Create spacer character (or link existing)                │
│     • Receive starting credits (10,000 cr via Lieutenant honorarium on first session)   │
│     • Tutorial prompts (optional, can skip)                     │
│                                                                 │
│  3. INITIAL GOALS                                               │
│     • Earn credits through cargo delivery                       │
│     • Purchase first ship components                            │
│     • Learn navigation and combat                               │
│                                                                 │
│  4. PROGRESSION                                                 │
│     • Upgrade ship components                                   │
│     • Complete missions                                         │
│     • Gain rank and promotions                                  │
│                                                                 │
│  5. MID-GAME                                                    │
│     • Join alliance                                             │
│     • Purchase space port                                       │
│     • Specialize role (trader, pirate, patrol)                  │
│                                                                 │
│  6. END-GAME                                                    │
│     • Nemesis Mission (500+ wins)                               │
│     • Maligna Mission (conqueror status)                        │
│     • Top Gun rankings                                          │
│     • Dueling arena mastery                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

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

### 2.4 Authenticity Commitments

The following elements **MUST** match the original exactly:

| Element | Commitment |
|---------|------------|
| **All menu text** | Verbatim from original |
| **All commands** | Same single-key shortcuts |
| **All formulas** | Combat, travel, economy unchanged |
| **All prices** | Same credits values |
| **All thresholds** | Rank requirements, mission requirements |
| **All system names** | Identical to original |
| **Screen layouts** | ASCII art preserved exactly |

---

## 3. Technical Architecture

### 3.1 Technology Stack

```yaml
Frontend:
  Framework: React 18+ with TypeScript
  Terminal Emulator: xterm.js (configured for 80x24)
  State Management: Zustand (lightweight, persistent)
  Styling: Tailwind CSS (for non-terminal UI)
  Build Tool: Vite

Backend:
  Runtime: Node.js 20+ LTS
  Framework: Fastify (high performance, low overhead)
  Language: TypeScript
  Authentication: Passport.js with OAuth 2.0
  Real-time: Socket.io (for multiplayer events)
  Job Queue: Bull (for daily ticks, events)

Database:
  Primary: PostgreSQL 15+
  ORM: Prisma (type-safe, migrations)
  Cache: Redis (sessions, real-time state)
  Migrations: Prisma Migrate

DevOps:
  Container: Docker + Docker Compose
  CI/CD: GitHub Actions
  Hosting: Docker-compatible (Railway, Fly.io, self-host)
  Monitoring: Prometheus + Grafana (optional)
  Logging: Pino (structured JSON logs)

Testing:
  Unit: Vitest
  Integration: Supertest + Jest
  E2E: Playwright
```

### 3.2 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│  │   Browser   │      │   Browser   │      │   Browser   │     │
│  │   (Player)  │      │   (Player)  │      │   (Player)  │     │
│  └──────┬──────┘      └──────┬──────┘      └──────┬──────┘     │
│         │                    │                    │             │
│         └────────────────────┼────────────────────┘             │
│                              │                                  │
│                    ┌─────────▼─────────┐                        │
│                    │   Load Balancer   │                        │
│                    │   (nginx/traefik) │                        │
│                    └─────────┬─────────┘                        │
│                              │                                  │
│         ┌────────────────────┼────────────────────┐             │
│         │                    │                    │             │
│  ┌──────▼──────┐    ┌───────▼───────┐   ┌───────▼──────┐       │
│  │   Fastify   │    │   Fastify     │   │   Fastify    │       │
│  │   Server    │    │   Server      │   │   Server     │       │
│  │   (Game)    │    │   (Game)      │   │   (Game)     │       │
│  └──────┬──────┘    └───────┬───────┘   └───────┬──────┘       │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│              ┌──────────────┼──────────────┐                    │
│              │              │              │                    │
│     ┌────────▼────┐  ┌─────▼──────┐  ┌───▼────────┐            │
│     │  PostgreSQL │  │   Redis    │  │  Bull MQ   │            │
│     │  (Primary)  │  │  (Cache)   │  │  (Jobs)    │            │
│     └─────────────┘  └────────────┘  └────────────┘            │
│                                                                 │
│     ┌─────────────────────────────────────────────────────┐    │
│     │              BBS Portal (OAuth Provider)            │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Database Schema

```prisma
// Core User/Character Models
model User {
  id            String    @id @default(uuid())
  bbsUserId     String    @unique  // OAuth provider user ID
  email         String    @unique
  displayName   String
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
  
  characters    Character[]
  sessions      Session[]
  
  @@index([bbsUserId])
}

model Character {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  
  // Identity
  spacerId        Int       @unique @default(autoincrement())
  name            String    // Player name
  shipName        String?   // Ship name (nz$)
  allianceSymbol  String?   // +, @, &, ^ or null
  
  // Credits (split like original: g1=high, g2=low)
  creditsHigh     Int       @default(0)  // g1 - 10,000s
  creditsLow      Int       @default(0)  // g2 - units (10,000 cr awarded as Lieutenant honorarium on first session)
  
  // Rank & Progression
  rank            Rank      @default(LIEUTENANT)
  score           Int       @default(0)  // s2 - total points
  promotions      Int       @default(0)  // sc - promotion count
  
  // Vital Stats
  tripsCompleted  Int       @default(0)  // u1
  astrecsTraveled Int       @default(0)  // j1
  cargoDelivered  Int       @default(0)  // k1
  battlesWon      Int       @default(0)  // e1
  battlesLost     Int       @default(0)  // m1
  rescuesPerformed Int      @default(0)  // b1
  
  // Current State
  currentSystem   Int       @default(1)  // sp - current system ID
  tripCount       Int       @default(0)  // z1 - trips today
  lastTripDate    DateTime? @default(now())  // t$ - last trip date
  
  // Mission State
  missionType     Int       @default(0)  // kk - current mission
  cargoPods       Int       @default(0)  // q1
  cargoType       Int       @default(0)  // q2
  cargoPayment    Int       @default(0)  // q5
  destination     Int       @default(0)  // q4
  cargoManifest   String?   // q2$ - cargo description
  
  // Special Flags
  isConqueror     Boolean   @default(false)
  isLost          Boolean   @default(false)
  lostLocation    Int?
  patrolSector    Int?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  // Relations
  ship            Ship?
  portOwnership   PortOwnership?
  allianceMembership AllianceMembership?
  duelEntries     DuelEntry[]
  battleRecords   BattleRecord[]
  
  @@index([userId])
  @@index([spacerId])
  @@index([allianceSymbol])
}

model Ship {
  id              String    @id @default(uuid())
  characterId     String    @unique
  character       Character @relation(fields: [characterId], references: [id])
  
  // Components (strength/condition pairs like original)
  hullStrength    Int       @default(0)
  hullCondition   Int       @default(0)
  driveStrength   Int       @default(0)
  driveCondition  Int       @default(0)
  cabinStrength   Int       @default(0)
  cabinCondition  Int       @default(0)
  lifeSupportStrength Int   @default(0)
  lifeSupportCondition Int  @default(0)
  weaponStrength  Int       @default(0)
  weaponCondition Int       @default(0)
  navigationStrength Int    @default(0)
  navigationCondition Int   @default(0)
  roboticsStrength Int      @default(0)
  roboticsCondition Int     @default(0)
  shieldStrength  Int       @default(0)
  shieldCondition Int       @default(0)
  
  // Resources
  fuel            Int       @default(0)
  cargoPods       Int       @default(0)
  maxCargoPods    Int       @default(0)
  
  // Special Equipment
  hasCloaker      Boolean   @default(false)
  hasAutoRepair   Boolean   @default(false)
  hasStarBuster   Boolean   @default(false)
  hasArchAngel    Boolean   @default(false)
  isAstraxialHull Boolean   @default(false)
  
  // Damage Tracking (for repair system)
  damageFlags     Json      @default("[]")
  
  updatedAt       DateTime  @updatedAt
  
  @@index([characterId])
}

model PortOwnership {
  id              String    @id @default(uuid())
  characterId     String    @unique
  character       Character @relation(fields: [characterId], references: [id])
  
  systemId        Int       @unique  // Which system owned
  purchaseDate    DateTime  @default(now())
  lastActiveDate  DateTime  @default(now())
  
  // Financials
  fuelPrice       Int       @default(25)  // Owner-set price
  fuelStored      Int       @default(3000)
  fuelCapacity    Int       @default(20000)
  bankCreditsHigh Int       @default(0)
  bankCreditsLow  Int       @default(0)
  
  // DEFCON (alliance systems)
  defconLevel     Int       @default(0)
  
  updatedAt       DateTime  @updatedAt
  
  @@index([systemId])
  @@index([characterId])
}

// Alliance System
enum AllianceType {
  NONE
  ASTRO_LEAGUE      // +
  SPACE_DRAGONS     // @
  WARLORD_CONFED    // &
  REBEL_ALLIANCE    // ^
}

model AllianceMembership {
  id              String    @id @default(uuid())
  characterId     String    @unique
  character       Character @relation(fields: [characterId], references: [id])
  
  alliance        AllianceType
  joinedAt        DateTime  @default(now())
  
  // Investment account
  creditsHigh     Int       @default(0)
  creditsLow      Int       @default(0)
  
  updatedAt       DateTime  @updatedAt
  
  @@index([alliance])
  @@index([characterId])
}

model AllianceSystem {
  id              String    @id @default(uuid())
  systemId        Int       @unique
  alliance        AllianceType
  ownerCharacterId String?
  defconLevel     Int       @default(1)
  lastTakeoverAttempt DateTime?
  
  updatedAt       DateTime  @updatedAt
  
  @@index([alliance])
  @@index([systemId])
}

// Combat & Encounters
model BattleRecord {
  id              String    @id @default(uuid())
  characterId     String
  character       Character @relation(fields: [characterId], references: [id])
  
  enemyType       String    // pirate, patrol, rim_pirate, etc.
  enemyName       String
  systemId        Int
  
  result          BattleResult
  rounds          Int
  battleFactor    Int
  
  lootCredits     Int       @default(0)
  damageTaken     Json      // Component damage
  
  createdAt       DateTime  @default(now())
  
  @@index([characterId])
  @@index([createdAt])
}

enum BattleResult {
  VICTORY
  DEFEAT
  RETREAT
  SURRENDER
}

model DuelEntry {
  id              String    @id @default(uuid())
  challengerId    String
  challenger      Character @relation(fields: [challengerId], references: [id])
  
  contenderId     String?
  stakesType      String    // points, components, credits
  stakesAmount    Int
  arenaType       Int
  handicap        Int
  
  status          DuelStatus @default(PENDING)
  result          BattleResult?
  
  createdAt       DateTime  @default(now())
  completedAt     DateTime?
  
  @@index([challengerId])
  @@index([status])
}

enum DuelStatus {
  PENDING
  ACCEPTED
  COMPLETED
  CANCELLED
}

// Game World State
model StarSystem {
  id              Int       @id
  name            String    @unique
  coordinates     Json      // { x, y, z } or just index
  type            SystemType
  features        Json      // Special features
  
  // Dynamic state
  portOwner       String?
  fuelPrice       Int       @default(25)
  fuelStored      Int       @default(3000)
  allianceControl AllianceType @default(NONE)
  defconLevel     Int       @default(1)
  
  visitCount      Int       @default(0)
  lastActivity    DateTime  @default(now())
  
  @@index([type])
}

enum SystemType {
  CORE      // 1-14
  RIM       // 15-20
  ANDROMEDA // NGC systems
  SPECIAL   // Maligna, Nemesis
}

model GameLog {
  id              String    @id @default(uuid())
  type            LogType
  characterId     String?
  systemId        Int?
  message         String
  metadata        Json?
  
  createdAt       DateTime  @default(now())
  
  @@index([type])
  @@index([createdAt])
  @@index([characterId])
}

enum LogType {
  VISITOR
  BATTLE
  TRADE
  PORT_FEE
  PROMOTION
  ACHIEVEMENT
  ALLIANCE
  DUEL
  MISSION
}

model Session {
  id              String    @id @default(uuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  
  token           String    @unique
  expiresAt       DateTime
  ipAddress       String?
  userAgent       String?
  
  createdAt       DateTime  @default(now())
  
  @@index([userId])
  @@index([token])
}

enum Rank {
  LIEUTENANT
  COMMANDER
  CAPTAIN
  COMMODORE
  ADMIRAL
  TOP_DOG
  GRAND_MUFTI
  MEGA_HERO
  GIGA_HERO
}
```

### 3.4 API Design

#### Authentication Endpoints

```typescript
// POST /api/auth/login
// Exchange BBS OAuth token for SpacerQuest session
interface LoginRequest {
  oauthToken: string;
  bbsUserId: string;
}

interface LoginResponse {
  sessionToken: string;
  character: Character | null;  // null = new player
  requiresCharacterCreation: boolean;
}

// POST /api/auth/logout
// Invalidate session
```

#### Character Endpoints

```typescript
// POST /api/character
// Create new character
interface CreateCharacterRequest {
  name: string;      // 3-15 chars, validated
  shipName: string;  // 3-15 chars, validated
}

// GET /api/character
// Get current character state
interface CharacterResponse {
  character: Character;
  ship: Ship;
  currentSystem: StarSystem;
  dailyTripsRemaining: number;
}

// PUT /api/character/ship-name
// Rename ship
interface RenameShipRequest {
  shipName: string;
}

// PUT /api/character/alliance
// Join/leave alliance
interface AllianceRequest {
  alliance: AllianceType | 'NONE';
}
```

#### Navigation Endpoints

```typescript
// POST /api/navigation/launch
// Launch from current system
interface LaunchRequest {
  destinationSystemId: number;
  cargoContract?: {
    pods: number;
    type: number;
    payment: number;
  };
}

interface LaunchResponse {
  success: boolean;
  fuelRequired: number;
  travelTime: number;
  feeCharged: number;
  error?: string;
}

// POST /api/navigation/course-change
// Manual course change during travel
interface CourseChangeRequest {
  newSystemId: number;
}

// GET /api/navigation/travel-status
// Poll travel status (for real-time feel)
interface TravelStatusResponse {
  inTransit: boolean;
  progress: number;  // 0-100
  timeRemaining: number;
  fuelRemaining: number;
  encounter?: Encounter;
}
```

#### Combat Endpoints

```typescript
// POST /api/combat/engage
// Enter combat (player choice)
interface EngageRequest {
  attack: boolean;  // true = attack, false = attempt retreat
}

// POST /api/combat/action
// Combat round action
interface CombatActionRequest {
  action: 'FIRE' | 'RETREAT' | 'SURRENDER';
  tributeOffer?: number;  // If surrendering
}

interface CombatRoundResponse {
  round: number;
  playerDamage: number;
  enemyDamage: number;
  playerShields: number;
  enemyShields: number;
  battleAdvantage: 'PLAYER' | 'ENEMY' | 'EVEN';
  combatLog: string[];
  combatOver: boolean;
  result?: BattleResult;
}
```

#### Economic Endpoints

```typescript
// POST /api/economy/fuel/buy
interface BuyFuelRequest {
  units: number;
}

// POST /api/economy/fuel/sell
interface SellFuelRequest {
  units: number;
}

// POST /api/economy/cargo/accept
interface AcceptCargoRequest {
  pods: number;
  destination: number;
}

// POST /api/economy/cargo/deliver
// Called automatically on dock with cargo
interface DeliverCargoResponse {
  payment: number;
  bonus: number;
  total: number;
}

// POST /api/economy/port/buy
interface BuyPortRequest {
  systemId: number;
}

// PUT /api/economy/port/fuel-price
interface SetFuelPriceRequest {
  price: number;  // 0-50
}
```

#### Ship Endpoints

```typescript
// GET /api/ship/status
// Full ship status (for X command)
interface ShipStatusResponse {
  components: ComponentStatus[];
  fuel: number;
  cargoPods: number;
  specialEquipment: string[];
}

// POST /api/ship/upgrade
interface UpgradeRequest {
  component: ComponentType;
  upgradeType: 'STRENGTH' | 'CONDITION';
}

interface UpgradeResponse {
  success: boolean;
  cost: number;
  newStrength?: number;
  newCondition?: number;
  error?: string;
}

// POST /api/ship/repair
interface RepairRequest {
  component?: ComponentType;  // undefined = all
}

// POST /api/ship/special
interface SpecialEquipmentRequest {
  equipment: 'CLOAKER' | 'AUTO_REPAIR' | 'STAR_BUSTER' | 'ARCH_ANGEL';
}
```

#### Social Endpoints

```typescript
// GET /api/social/directory
// List all spacers
interface DirectoryResponse {
  spacers: {
    id: number;
    name: string;
    shipName: string;
    rank: Rank;
    alliance?: AllianceType;
  }[];
}

// GET /api/social/topgun
// Top Gun rankings
interface TopGunResponse {
  categories: {
    name: string;
    leader: string;
    value: number;
  }[];
}

// GET /api/social/leaderboard
// High scores
interface LeaderboardResponse {
  scores: {
    rank: number;
    name: string;
    score: number;
  }[];
}

// POST /api/duel/challenge
interface DuelChallengeRequest {
  targetId?: number;  // undefined = anyone
  stakesType: 'POINTS' | 'COMPONENTS' | 'CREDITS';
  stakesAmount: number;
  arenaType: number;
}

// POST /api/duel/accept/:duelId
interface DuelAcceptRequest {
  accept: boolean;
}
```

### 3.5 Real-Time Events (Socket.io)

```typescript
// Server → Client Events

interface TravelCompleteEvent {
  type: 'TRAVEL_COMPLETE';
  systemId: number;
  systemName: string;
}

interface EncounterEvent {
  type: 'ENCOUNTER';
  enemyType: string;
  enemyName: string;
  enemyClass: string;
}

interface CombatRoundEvent {
  type: 'COMBAT_ROUND';
  round: number;
  log: string;
}

interface CombatEndEvent {
  type: 'COMBAT_END';
  result: BattleResult;
  loot: number;
  damage: ComponentDamage[];
}

interface WorldEvent {
  type: 'WORLD_EVENT';
  category: 'PORT_TAKEOVER' | 'ALLIANCE_WAR' | 'MISSION_AVAILABLE';
  message: string;
}

interface DailyTickEvent {
  type: 'DAILY_TICK';
  date: string;
  portIncome?: number;
  tripCountReset: boolean;
}

// Client → Server Events

interface TravelProgressRequest {
  type: 'REQUEST_TRAVEL_PROGRESS';
}

interface CombatActionEvent {
  type: 'COMBAT_ACTION';
  action: string;
}
```

### 3.6 Background Jobs (Bull)

```typescript
// Daily tick job (runs at midnight UTC)
const dailyTickJob = {
  name: 'daily-tick',
  schedule: '0 0 * * *',  // Cron: midnight daily
  
  async process() {
    // Reset daily trip counters
    await prisma.character.updateMany({
      where: { tripCount: { gt: 0 } },
      data: { tripCount: 0 }
    });
    
    // Process port income
    const ports = await prisma.portOwnership.findMany();
    for (const port of ports) {
      const income = calculateDailyIncome(port);
      await addPortIncome(port.characterId, income);
      await logDailyFee(port.systemId, income);
    }
    
    // Check for inactive port evictions
    await checkInactivePorts();
    
    // Generate daily news
    await generateDailyNews();
  }
};

// Encounter generation (runs periodically)
const encounterJob = {
  name: 'encounter-generation',
  schedule: '*/5 * * * *',  // Every 5 minutes
  
  async process() {
    // Generate bot-vs-bot combats
    await generateBotCombats();
    
    // Update port ownership (hostile takeovers)
    await processTakeoverAttempts();
    
    // Update economy (supply/demand)
    await updateFuelPrices();
  }
};

// Mission generation
const missionJob = {
  name: 'mission-generation',
  schedule: '0 */6 * * *',  // Every 6 hours
  
  async process() {
    // Generate patrol missions
    await generatePatrolMissions();
    
    // Check Nemesis/Maligna eligibility
    await checkEndgameMissions();
  }
};
```

---

## 4. Frontend Implementation

### 4.1 Terminal Interface

```typescript
// Terminal configuration (xterm.js)
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

const terminal = new Terminal({
  cols: 80,
  rows: 24,
  fontFamily: '"Courier New", monospace',
  fontSize: 14,
  theme: {
    background: '#000000',
    foreground: '#00FF00',  // Classic green phosphor
    cursor: '#00FF00',
  },
  convertEol: true,
  scrollback: 1000,
});

// Force 80x24, centered in viewport
const fitAddon = new FitAddon();
terminal.loadAddon(fitAddon);

// Custom fit to maintain 80x24
function fitTerminal() {
  terminal.resize(80, 24);
  // Center in container with CSS
}
```

### 4.2 Screen Components

```typescript
// Screen rendering system
interface Screen {
  id: string;
  render(): string;  // Returns ANSI/ASCII string
  handleInput(key: string): void;
}

// Example: Main Menu Screen
class MainMenuScreen implements Screen {
  id = 'main-menu';
  
  render(): string {
    return `
 ___________________________________
|                                   |
|      S P A C E R  Q U E S T       |
|      ----------------------       |
|                                   |
| Version 4.0 - Web Museum Edition  |
|___________________________________|
|                                   |
|            sp.start               |
|___________________________________|

[::${this.currentSystem} Port Accounts:]:(?=Menu): Command: 

  [B] Alliance Bulletins    [K] Battles Fought Log
  [V] Who Was Here Today    [G] Space News
  [H] Help!                 [M] Map
  [N] New Spacer Role       [P] Port Fuel Prices
  [S] Space Heroes          [?] Menu
  
  Type command or [Q]uit to Terminal
`;
  }
  
  handleInput(key: string): void {
    const actions: Record<string, () => void> = {
      'B': () => this.navigate('bulletins'),
      'K': () => this.navigate('battle-log'),
      'V': () => this.navigate('visitor-log'),
      'G': () => this.navigate('space-news'),
      'H': () => this.navigate('help'),
      'M': () => this.navigate('map'),
      'N': () => this.navigate('new-character'),
      'P': () => this.navigate('fuel-prices'),
      'S': () => this.navigate('space-heroes'),
      '?': () => this.showMenu(),
      'Q': () => this.quit(),
    };
    
    actions[key]?.();
  }
}
```

### 4.3 State Management (Zustand)

```typescript
import create from 'zustand';
import { persist } from 'zustand/middleware';

interface GameState {
  // Character State
  character: Character | null;
  ship: Ship | null;
  currentSystem: StarSystem | null;
  
  // Session State
  screen: string;
  inCombat: boolean;
  inTransit: boolean;
  travelProgress: number;
  
  // UI State
  terminalBuffer: string[];
  inputMode: 'COMMAND' | 'CONFIRM' | 'INPUT';
  
  // Actions
  setCharacter: (char: Character) => void;
  setShip: (ship: Ship) => void;
  setSystem: (sys: StarSystem) => void;
  setScreen: (screen: string) => void;
  appendToTerminal: (text: string) => void;
  clearTerminal: () => void;
  startCombat: () => void;
  endCombat: () => void;
  startTravel: (progress: number) => void;
  endTravel: () => void;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      // Initial State
      character: null,
      ship: null,
      currentSystem: null,
      screen: 'main-menu',
      inCombat: false,
      inTransit: false,
      travelProgress: 0,
      terminalBuffer: [],
      inputMode: 'COMMAND',
      
      // Actions
      setCharacter: (char) => set({ character: char }),
      setShip: (ship) => set({ ship }),
      setSystem: (sys) => set({ currentSystem: sys }),
      setScreen: (screen) => set({ screen }),
      
      appendToTerminal: (text) => set((state) => ({
        terminalBuffer: [...state.terminalBuffer, ...text.split('\n')]
      })),
      
      clearTerminal: () => set({ terminalBuffer: [] }),
      
      startCombat: () => set({ inCombat: true }),
      endCombat: () => set({ inCombat: false }),
      
      startTravel: (progress) => set({ 
        inTransit: true, 
        travelProgress: progress 
      }),
      endTravel: () => set({ inTransit: false, travelProgress: 0 }),
    }),
    {
      name: 'spacerquest-storage',
      partialize: (state) => ({ 
        character: state.character,
        ship: state.ship,
      }),
    }
  )
);
```

### 4.4 Input Handling

```typescript
// Global keyboard handler
function useGameInput() {
  const { screen, inputMode } = useGameStore();
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Single-key commands (original behavior)
      if (inputMode === 'COMMAND') {
        const key = e.key.toUpperCase();
        
        // Prevent default for game keys
        if (key.length === 1 || key === 'ENTER' || key === 'BACKSPACE') {
          e.preventDefault();
        }
        
        // Route to current screen handler
        const currentScreen = getScreen(screen);
        currentScreen?.handleInput(key);
      }
      
      // Text input mode
      if (inputMode === 'INPUT') {
        // Handle text input differently
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [screen, inputMode]);
}
```

---

## 5. Game Logic Implementation

### 5.1 Travel System

```typescript
// Travel calculation (matches original formula exactly)
function calculateTravelCost(
  driveStrength: number,
  driveCondition: number,
  distance: number
): number {
  // Original formula from SP.WARP.S / SP.LIFT.S
  const af = Math.min(driveStrength, 21);  // Cap at 21
  let fuelCost = (21 - af) + (10 - driveCondition);
  
  if (fuelCost < 1) fuelCost = 1;
  
  fuelCost = fuelCost * distance;
  
  const ty = fuelCost + 10;
  const finalCost = Math.min(ty, 100) / 2;
  
  return Math.floor(finalCost);
}

function calculateTravelTime(distance: number): number {
  // Travel time in "chronos" units
  return distance * 3;  // Approximate from original
}

function calculateCourseChangeFuel(hullStrength: number): number {
  return hullStrength * 5;
}
```

### 5.2 Combat System

```typescript
// Battle Factor calculation (from SP.FIGHT1.S)
function calculateBattleFactor(
  ship: Ship,
  rank: Rank,
  battlesWon: number
): number {
  // Component contributions
  const weaponBF = ship.weaponStrength * ship.weaponCondition;
  const shieldBF = ship.shieldStrength * ship.shieldCondition;
  
  // Computer contributions
  const cabinBF = Math.floor((ship.cabinStrength * ship.cabinCondition) / 10);
  const roboticsBF = Math.floor((ship.roboticsStrength * ship.roboticsCondition) / 10);
  const lifeBF = Math.floor((ship.lifeSupportStrength * ship.lifeSupportCondition) / 10);
  
  // Rank bonus
  const rankBonus = getRankBonus(rank);
  
  // Experience bonus
  const experienceBonus = Math.floor(battlesWon / 10);
  
  // Auto-repair module bonus
  const autoRepairBonus = ship.hasAutoRepair ? 10 : 0;
  
  return weaponBF + shieldBF + cabinBF + roboticsBF + lifeBF + 
         rankBonus + experienceBonus + autoRepairBonus;
}

function getRankBonus(rank: Rank): number {
  const bonuses: Record<Rank, number> = {
    LIEUTENANT: 0,
    COMMANDER: 5,
    CAPTAIN: 10,
    COMMODORE: 15,
    ADMIRAL: 20,
    TOP_DOG: 30,
    GRAND_MUFTI: 40,
    MEGA_HERO: 50,
    GIGA_HERO: 60,
  };
  return bonuses[rank];
}

// Damage calculation (per round)
function calculateDamage(
  weaponStrength: number,
  weaponCondition: number,
  targetShields: number,
  targetShieldCondition: number
): { shieldDamage: number; systemDamage: number } {
  const attackPower = weaponStrength * weaponCondition;
  const shieldPower = targetShields * targetShieldCondition;
  
  if (attackPower <= shieldPower) {
    // Shields absorb all damage
    return { shieldDamage: 0, systemDamage: 0 };
  }
  
  const excessDamage = attackPower - shieldPower;
  const shieldDamage = Math.floor(excessDamage / 10);
  const systemDamage = excessDamage % 10;
  
  return { shieldDamage, systemDamage };
}
```

### 5.3 Encounter Generation

```typescript
// Encounter system (from SP.FIGHT1.S)
function generateEncounter(
  currentSystem: number,
  missionType: number,
  playerPower: number
): Encounter | null {
  // Base encounter chance by system type
  const baseChance = currentSystem > 14 ? 0.4 : 0.3;  // Higher in Rim
  
  // Roll for encounter
  if (Math.random() > baseChance) {
    return null;  // No encounter
  }
  
  // Determine enemy type based on mission
  if (missionType === 2) {  // Space Patrol
    return generatePirateEncounter(playerPower);
  }
  
  if (missionType === 5) {  // Smuggling
    return generatePatrolEncounter(playerPower);
  }
  
  if (currentSystem > 14) {  // Rim Stars
    return generateRimPirateEncounter(playerPower);
  }
  
  // Standard cargo run - pirate encounter
  return generatePirateEncounter(playerPower);
}

function generatePirateEncounter(playerPower: number): Encounter {
  const pirateClasses = [
    { name: 'SPX', minPower: 0, maxPower: 100 },
    { name: 'SPY', minPower: 100, maxPower: 200 },
    { name: 'SPZ', minPower: 200, maxPower: 500 },
  ];
  
  // Match pirate class to player power
  const suitableClass = pirateClasses.find(
    c => playerPower >= c.minPower && playerPower <= c.maxPower
  ) || pirateClasses[2];
  
  return {
    type: 'PIRATE',
    class: suitableClass.name,
    name: generatePirateName(),
    commander: generateCommanderName(),
    system: randomSystem(),
    power: calculatePiratePower(suitableClass),
    lootTable: 'STANDARD',
  };
}
```

### 5.4 Economy System

```typescript
// Port ownership income (daily)
function calculateDailyIncome(port: PortOwnership): number {
  // Base fee from ship landings (tracked separately)
  const baseFee = port.dailyLandingFees || 0;
  
  // Fuel sales profit
  const fuelProfit = port.dailyFuelSales || 0;
  
  return baseFee + fuelProfit;
}

// Fuel pricing
function getFuelPrice(systemId: number): number {
  const standardPrices: Record<number, number> = {
    1: 8,   // Sun-3
    8: 4,   // Mira-9 (cheap)
    14: 6,  // Vega-6
  };
  
  // Check if port has owner-set price
  const port = await prisma.portOwnership.findUnique({
    where: { systemId }
  });
  
  if (port && port.fuelPrice > 0) {
    return port.fuelPrice;
  }
  
  return standardPrices[systemId] || 25;  // Space Authority default
}

// Cargo payment calculation
function calculateCargoPayment(
  pods: number,
  cargoType: number,
  destination: number
): number {
  // Base rates by cargo type
  const baseRates: Record<number, number> = {
    1: 1000,  // Titanium Ore
    2: 2000,  // Capellan Herbals
    3: 3000,  // Raw Dilithium
    4: 4000,  // Mizarian Liquor
    5: 5000,  // Achernarian Gems
    6: 6000,  // Algolian RDNA
  };
  
  const baseRate = baseRates[cargoType] || 1000;
  
  // Destination bonus (correct destination = full pay)
  const destinationBonus = isCorrectDestination(cargoType, destination) ? 1.0 : 0.5;
  
  return Math.floor(pods * baseRate * destinationBonus);
}
```

### 5.5 Progression System

```typescript
// Rank calculation (exact formula from SP.END.S `promo` routine)
// sc = floor(score / 150); rank determined by sc tier
// NOTE: sc=14 (score 2100-2249) is a gap in original code — no promotion fires
function calculateRank(score: number): Rank {
  const sc = Math.floor(score / 150);
  if (sc > 17) return Rank.GIGA_HERO;           // score >= 2700
  if (sc > 14 && sc < 18) return Rank.MEGA_HERO; // score >= 2250 (sc 15-17)
  if (sc > 10 && sc < 14) return Rank.GRAND_MUFTI; // score >= 1650 (sc 11-13)
  if (sc > 7 && sc < 11) return Rank.TOP_DOG;   // score >= 1200 (sc 8-10)
  if (sc > 4 && sc < 8) return Rank.ADMIRAL;    // score >= 750 (sc 5-7)
  if (sc === 3 || sc === 4) return Rank.COMMODORE; // score >= 450
  if (sc === 2) return Rank.CAPTAIN;             // score >= 300
  if (sc === 1) return Rank.COMMANDER;           // score >= 150
  return Rank.LIEUTENANT;                        // score 0-149
}

// Promotion check and processing
async function checkPromotion(characterId: string): Promise<PromotionResult | null> {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { ship: true }
  });
  
  if (!character) return null;
  
  const newRank = calculateRank(character.score);
  const rankIndex = Object.values(Rank).indexOf(newRank);
  const currentRankIndex = Object.values(Rank).indexOf(character.rank);
  
  if (rankIndex > currentRankIndex) {
    // Promotion!
    const honorarium = getHonorarium(newRank);
    
    await prisma.character.update({
      where: { id: characterId },
      data: {
        rank: newRank,
        promotions: character.promotions + 1,
        creditsHigh: character.creditsHigh + Math.floor(honorarium / 10000),
        creditsLow: character.creditsLow + (honorarium % 10000),
      }
    });
    
    await logAchievement(characterId, 'PROMOTION', {
      fromRank: character.rank,
      toRank: newRank,
      honorarium
    });
    
    return {
      newRank,
      honorarium,
      message: `Congratulations! Promoted to ${newRank}! Received ${honorarium} cr honorarium!`
    };
  }
  
  return null;
}

function getHonorarium(rank: Rank): number {
  // Exact values from SP.END.S: `g1=g1+a` where text says "honorarium of [a]0,000 cr"
  // LIEUTENANT honorarium (a=1, 10,000 cr) fires on first session for new characters
  const honoraria: Record<Rank, number> = {
    LIEUTENANT: 10000,
    COMMANDER: 20000,
    CAPTAIN: 30000,
    COMMODORE: 40000,
    ADMIRAL: 50000,
    TOP_DOG: 80000,
    GRAND_MUFTI: 100000,
    MEGA_HERO: 120000,
    GIGA_HERO: 150000,
  };
  return honoraria[rank];
}
```

### 5.6 Special Equipment Rules (Roscoe's Speede Shoppe)

From SP.SPEED.S (`special` / `cloak` / `autorep` routines):

#### Morton's Cloaking Device

- **Hull restriction:** Only available when `hullStrength < 5` (hulls 1–4). The menu option is hidden at hull 5+. Source check: `if h1<5 print "(C)loaking Device"` / `if h1>4 print "We can't help you here!"`.
- **Shield prerequisite:** Player must have a functioning shield system installed (`p1 >= 1`).
- **Incompatibility:** Cloaker cannot be installed on shields already enhanced with Titanium (`+*`) or Speedo upgrade (`++`). Check: `if right$(p1$,2)="+*" or right$(p1$,2)="++" → "Cloaker won't fit"`.
- **Cost:** 500 cr.
- **Effect:** Appends `=` suffix to shield name string (`p1$=p1$+"="`); condition reset to 9.
- **Permanence:** Upgrading hull to tier 5+ permanently loses cloaker eligibility. Installing ARCH-ANGEL or STAR-BUSTER will remove the cloaker.

#### Auto-Repair Module

- Requires hull installed (`h1 >= 1`).
- Cannot be installed if hull already has the module (`right$(h1$,1)="!"`).
- Cost: `hull_strength * 1,000 cr` (max 20,000 cr for hulls 20+).
- Titanium Enhancement (`*`) is removed if present when installing A-R module.
- Effect: appends `+!` to hull name; repairs all components +1 per combat round.

#### Exotic Weapon/Shield Systems (Maligna Equipment)

- Available when `sc > 0` (Commander rank or higher).
- **STAR-BUSTER Weapon:** Requires existing weapon system with `+*` suffix (Speedo-enhanced). Replaces weapon with STAR-BUSTER++; strength +1, condition 9. Cost: 10,000 cr.
- **ARCH-ANGEL Shield:** Same requirement for shield. Replaces with ARCH-ANGEL++; strength +1, condition 9. Cloaker is lost if present.

#### Component Upgrade Service (s2 >= 20 required)

- Available for Weapon, Shield, Drive, Navigation, Robotics, Life Support.
- Cost formula: `a = floor(strength/10) + 1` (in 10,000 cr units). Special discount days when `ej=sp`.
- Life Support capped at strength 50 if ship is "LSS Class" or strength already < 51.
- Cannot upgrade alien-modified components (`left$(component,1)="?"`).

---

## 6. OAuth Integration

### 6.1 BBS Portal Integration

```typescript
// Passport.js OAuth strategy
import { Strategy as OAuth2Strategy } from 'passport-oauth2';

passport.use('bbs-portal', new OAuth2Strategy({
  authorizationURL: process.env.BBS_PORTAL_AUTH_URL!,
  tokenURL: process.env.BBS_PORTAL_TOKEN_URL!,
  clientID: process.env.BBS_PORTAL_CLIENT_ID!,
  clientSecret: process.env.BBS_PORTAL_CLIENT_SECRET!,
  callbackURL: process.env.BBS_PORTAL_CALLBACK_URL!,
}, async (accessToken, refreshToken, profile, done) => {
  // Fetch user info from BBS portal
  const userInfo = await fetchUserInfo(accessToken);
  
  // Find or create user in SpacerQuest
  let user = await prisma.user.findUnique({
    where: { bbsUserId: userInfo.id }
  });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        bbsUserId: userInfo.id,
        email: userInfo.email,
        displayName: userInfo.displayName,
      }
    });
  }
  
  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  
  return done(null, user);
}));

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.redirect('/auth/login');
  }
  next();
}
```

### 6.2 Session Management

```typescript
// Session creation on login
async function createSession(user: User): Promise<Session> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);  // 30 days
  
  return prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
      ipAddress: user.lastIpAddress,
      userAgent: user.lastUserAgent,
    }
  });
}

// Session validation middleware
async function validateSession(token: string): Promise<User | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true }
  });
  
  if (!session || session.expiresAt < new Date()) {
    return null;
  }
  
  return session.user;
}
```

---

## 7. Deployment & Operations

### 7.1 Docker Configuration

```dockerfile
# Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build application
COPY . .
RUN pnpm build

# Production image
FROM node:20-alpine

WORKDIR /app

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["node", "dist/server.js"]
```

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/spacerquest
      - REDIS_URL=redis://redis:6379
      - BBS_PORTAL_CLIENT_ID=${BBS_PORTAL_CLIENT_ID}
      - BBS_PORTAL_CLIENT_SECRET=${BBS_PORTAL_CLIENT_SECRET}
    depends_on:
      - db
      - redis
    restart: unless-stopped

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=spacerquest
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

  worker:
    build: .
    command: node dist/worker.js
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/spacerquest
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### 7.2 Environment Variables

```bash
# .env.example

# Application
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/spacerquest

# Redis
REDIS_URL=redis://localhost:6379

# OAuth (BBS Portal)
BBS_PORTAL_CLIENT_ID=your-client-id
BBS_PORTAL_CLIENT_SECRET=your-client-secret
BBS_PORTAL_AUTH_URL=https://bbs-portal.example.com/oauth/authorize
BBS_PORTAL_TOKEN_URL=https://bbs-portal.example.com/oauth/token
BBS_PORTAL_CALLBACK_URL=https://spacerquest.example.com/auth/callback

# Session
SESSION_SECRET=your-session-secret-min-32-chars
SESSION_MAX_AGE=2592000000

# Game Configuration
DAILY_TRIP_LIMIT=3
ENCOUNTER_CHANCE=0.3
PORT_EVICTION_DAYS=30
```

### 7.3 Database Migrations

```bash
# Prisma migration commands
pnpm prisma migrate dev --name init
pnpm prisma migrate deploy  # Production
pnpm prisma generate        # Generate client
pnpm prisma db seed         # Seed initial data
```

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed star systems
  const systems = [
    { id: 1, name: 'Sun-3', type: 'CORE', coordinates: { x: 0, y: 0, z: 0 } },
    { id: 2, name: 'Aldebaran-1', type: 'CORE', coordinates: { x: 1, y: 0, z: 0 } },
    // ... all 20 systems
  ];
  
  for (const system of systems) {
    await prisma.starSystem.upsert({
      where: { id: system.id },
      update: {},
      create: system,
    });
  }
  
  console.log('Seeding complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```typescript
// tests/unit/travel.test.ts
import { describe, it, expect } from 'vitest';
import { calculateTravelCost, calculateTravelTime } from '../../src/game/travel';

describe('Travel System', () => {
  describe('calculateTravelCost', () => {
    it('should calculate correct fuel cost for drives-10 condition-9', () => {
      const cost = calculateTravelCost(10, 9, 5);
      expect(cost).toBe(25);  // Verified against original
    });
    
    it('should cap drive strength at 21', () => {
      const cost = calculateTravelCost(50, 9, 5);
      expect(cost).toBe(calculateTravelCost(21, 9, 5));
    });
    
    it('should have minimum cost of 1 per astrec', () => {
      const cost = calculateTravelCost(21, 9, 5);
      expect(cost).toBeGreaterThanOrEqual(5);
    });
  });
  
  describe('calculateTravelTime', () => {
    it('should calculate travel time based on distance', () => {
      expect(calculateTravelTime(5)).toBe(15);
      expect(calculateTravelTime(10)).toBe(30);
    });
  });
});
```

### 8.2 Integration Tests

```typescript
// tests/integration/character.test.ts
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/db';

describe('Character API', () => {
  beforeEach(async () => {
    await prisma.character.deleteMany();
  });
  
  describe('POST /api/character', () => {
    it('should create a new character with valid data', async () => {
      const response = await request(app)
        .post('/api/character')
        .set('Authorization', 'Bearer valid-token')
        .send({
          name: 'TestPlayer',
          shipName: 'Millennia',
        });
      
      expect(response.status).toBe(201);
      expect(response.body.character.name).toBe('TestPlayer');
      expect(response.body.character.creditsLow).toBe(0);  // starts at 0; 10,000 granted on first session via Lieutenant honorarium
    });
    
    it('should reject names shorter than 3 characters', async () => {
      const response = await request(app)
        .post('/api/character')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'AB', shipName: 'Ship' });
      
      expect(response.status).toBe(400);
    });
    
    it('should reject names with reserved prefixes', async () => {
      const response = await request(app)
        .post('/api/character')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'THE Player', shipName: 'Ship' });
      
      expect(response.status).toBe(400);
    });
  });
});
```

### 8.3 E2E Tests

```typescript
// tests/e2e/gameflow.test.ts
import { test, expect } from '@playwright/test';

test('complete game flow: create character, travel, fight', async ({ page }) => {
  // Navigate to game
  await page.goto('/');
  
  // Login via OAuth mock
  await page.click('[data-testid="login-button"]');
  
  // Create character
  await page.fill('[data-testid="character-name"]', 'TestPlayer');
  await page.fill('[data-testid="ship-name"]', 'Millennia');
  await page.click('[data-testid="create-character"]');
  
  // Should see main menu
  await expect(page.locator('.terminal')).toContainText('SPACER QUEST');
  
  // Navigate to launch control (L command)
  await page.keyboard.press('L');
  await expect(page.locator('.terminal')).toContainText('Launch Control');
  
  // Select destination
  await page.keyboard.press('6');  // Denebola-5
  await page.keyboard.press('Y');  // Confirm
  
  // Should enter travel
  await expect(page.locator('.terminal')).toContainText('T MINUS');
  
  // Wait for travel to complete (mocked time)
  await page.waitForTimeout(5000);
  
  // Should arrive at destination
  await expect(page.locator('.terminal')).toContainText('Denebola-5');
});
```

---

## 9. Success Metrics

### 9.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| API Response Time | < 100ms p95 | Prometheus |
| Database Query Time | < 50ms p95 | Prisma logs |
| WebSocket Latency | < 50ms | Socket.io stats |
| Uptime | 99.9% | Health checks |
| Error Rate | < 0.1% | Error tracking |

### 9.2 Game Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Daily Active Users | Track over time | Game logs |
| Session Length | 15-30 min avg | Session tracking |
| Trip Completion Rate | Track per user | Character stats |
| Combat Win Rate | ~50% (balanced) | Battle records |
| Promotion Rate | Track rank distribution | Character ranks |
| Port Ownership | Track distribution | PortOwnership table |
| Alliance Participation | Track membership | AllianceMembership |
| Mission Completion | Track Nemesis/Maligna | Mission logs |

### 9.3 Museum Goals

| Goal | Success Criteria |
|------|------------------|
| Authenticity | Original players confirm "feels the same" |
| Accessibility | Playable on modern browsers without plugins |
| Preservation | Full source code documented and archived |
| Education | Code comments explain original design decisions |
| Community | Active player base, forum discussions |

---

## 9.4 Extra-Curricular Menu

Accessible from the docking/exit screen (SP.END.S) before a player departs a system. Displayed via SP.MENU11. This is the menu that lets players enter pirate, patrol, or smuggler suppression mode, or challenge the dueling arena.

### 9.4.1 Menu Text (verbatim from SP.MENU11)

```
 ___________________________________
|                                   |
|   [:  Extra-Curricular Menu  :]   |
|___________________________________|
|                                   |
|    (P)  Pirate Activity           |
|    (S)  Squadron Star Patrol      |
|    (C)  Control Smugglers         |
|    (W)  Dueling Arena             |
|                                   |
|    [R]  Return to Space Terminal  |
|                                   |
|    (Q)  Quit Game                 |
|___________________________________|
```

### 9.4.2 Command Behavior

| Key | Action | Requirement |
|-----|--------|-------------|
| `P` | Enter Pirate Activity mode (`pp=1`) | Functioning ship + drives + 50+ fuel |
| `S` | Join Squadron Star Patrol (`pp=4`) | Same + must be in alliance system |
| `C` | Control Smugglers patrol (`pp=4`, `xe=1`) | Same |
| `W` | Enter Dueling Arena | Links to `sp.arena1` |
| `R` | Return to Space Port (Main Terminal) | — |
| `Q` | Quit game (with optional ship guard prompt if ship value > 2,000) | — |

**Note:** `P`, `S`, `C`, `W` all require a ship with functioning hull, functioning drives (`h2>0 && d2>0`), and at least 50 fuel units. Active cargo contracts are voided when entering these modes.

### 9.4.3 Pirate Activity (P)

Player selects a system (1-14) to lurk in. The entry writes their pirate record to the `pirates` file (`pp=1`) and they lift off to the chosen system to intercept trade routes. Returning from pirate mode presents a Vicarious Activities Report showing battles won/lost, loot, and fuel consumed.

### 9.4.4 Squadron Star Patrol (S)

Player joins a system's alliance patrol (`pp=4`). Must be a member of the alliance that controls the target system (matched by `right$(nz$,2)` hull suffix). Lists current patrol roster for the system.

### 9.4.5 Control Smugglers (C)

Same as Squadron Star Patrol but sets the smuggler-suppression flag (`xe=1`). Mission text: "Space Patrol Search & Destroy Smuggling."

### 9.4.6 Quit with Ship Guard

If character has > 2,000 cr and quits, the game offers to hire 20 guards for the ship at 10,000 cr (`g1=g1-1`). Declining risks random component vandalism (1 of 5 components damaged).

---

## 9.5 Rim Star Special Encounters

### 9.5.1 The Wise One (Polaris-1, System #17)

Available via `(W)ise One Visit` in the Polaris-1 docking menu. Displays atmospheric text about alien weapon enhancements found on derelicts in The Great Void, then generates a random **Number Key** (1-9) shown to the player.

**Original source:** SP.DOCK2.S:332-334, text file SP.WISE

### 9.5.2 The Sage / Ancient One (Mizar-9, System #18)

Available via `(S)age Visit` in the Mizar-9 docking menu. Runs an interactive constellation knowledge quiz:

1. Display constellation chart (16 constellations A-P: Perseus, Auriga, Orion, Taurus, Cygnus, Aquila, Scorpius, Lyra, Virgo, Bootes, Leo, Gemini, Draco, Hercules, Sagittarius, Pegasus)
2. Select random star (ALGOL, CAPELLA, RIGEL, ALDEBARON, DENEB, ALTAIR, ANTARES, VEGA, SPICA, ARCTURUS, REGULUS, DENEBOLA, POLLUX)
3. Ask "In which constellation is [STAR] to be found?" with 9-second time limit
4. Correct answer reward: +1 Cabin strength, condition set to 9 (perfect)
5. Visitable once per session (flag `kj`)

**Original source:** SP.DOCK2.S:300-330, text files SP.SAGE and SP.CONS

### 9.5.3 Star-to-Constellation Mapping (from original)

| Star | Constellation |
|------|---------------|
| ALGOL | A (Perseus) |
| CAPELLA | B (Auriga) |
| RIGEL | C (Orion) |
| ALDEBARON | D (Taurus) |
| DENEB | E (Cygnus) |
| ALTAIR | F (Aquila) |
| ANTARES | G (Scorpius) |
| VEGA | H (Lyra) |
| SPICA | I (Virgo) |
| ARCTURUS | J (Bootes) |
| REGULUS | K (Leo) |
| DENEBOLA | K (Leo) |
| POLLUX | L (Gemini) |

## 9.6 Jail / Brig / Crime System

### 9.6.1 Crime Types and Fines

| Crime Code | Trigger | Fine |
|------------|---------|------|
| pp=5 | Caught smuggling contraband (patrol intercept + surrender) | 1,000 cr |
| pp=6 | Modem disconnect during battle (carrier loss) | 10,000 cr |
| pp=7 | Conduct against spirit of game (sysop-triggered) | 20,000 cr |

### 9.6.2 Jail Mechanics

- Jailed players have name prefixed with `J%` (persistent marker in character record)
- On login, `J%` prefix redirects player to jail screen (SP.START.S:132)
- Players can pay fines to Admiral Juris P. Magnus for release
- Other players can visit the Brig at The Spacers Hangout (Sun-3) and bail out imprisoned spacers for double the fine
- Crime pp=5 (smuggling): player name is prefixed with `J%` during combat surrender (SP.FIGHT1.S:252)

**Implementation note:** Only crime code pp=5 (smuggling) is implemented in the web version. Modem disconnect (pp=6) and sysop conduct (pp=7) are not applicable.

**Original source:** SP.END.S:233-271, SP.BAR.S:300-379, SP.FIGHT1.S:247-253

## 9.7 Spacers Hangout (Sun-3)

Central social hub accessible at Sun-3 (system #1). Original source: SP.BAR.S

### 9.7.1 Menu Structure

```
Spacers: [H]angout  (B)rig  (Q)uit
```

### 9.7.2 Hangout Features

- **(G)amble** - Links to gambling games (Wheel of Fortune, Dare)
- **(D)rinks** - Social flavor (incrementing drink counter, unlocks info hints after 4+ drinks)
- **(I)nfo** - Information broker system with keyword queries (ALL, MAL, GIR, WIN, WEA, SHI, PIR, FIR, RAI, STA, RIM, GEM, SAG, DRI, ROB, NAV, LIF, HUL, COO, CLO, RAN, BAT, SPA, SMU, CHR, WIS)
- Alliance joining UI (requires Lieutenant+ rank)
- Smuggling contract pickup
- Alliance raid planning

### 9.7.3 Brig Viewing

Players can visit the Brig to see jailed spacers and optionally bail them out. Bail costs double the fine amount.

## 9.8 Alliance Bulletin Boards

Alliance-specific bulletin boards (SP.TOP.S). Each alliance has its own board, restricted to members only.

### 9.8.1 Operations

- **(R)eread** - View existing messages
- **(W)rite msg** - Post a message (79 char max, auto-prepended with date + player name)
- **(K)ill msgs** - Wipe all messages (board reset)
- **(Q)uit** - Exit

### 9.8.2 Access Control

Players can only read/write their own alliance's board. Header reads "Confidential Bulletins For Alliance Members Only."

**Original source:** SP.TOP.S:175-239

## 9.9 Combat Disconnect Mitigation

When a player disconnects during combat (browser tab close, network loss), combat state must be resolved server-side rather than cancelled.

### 9.9.1 Implementation

- Store active combat state in database (CombatState model)
- If player disconnects mid-combat, resolve remaining rounds server-side using existing combat formulas
- On reconnection, show combat result
- No extra penalties beyond natural combat outcome

---

## 10. Appendix

### 10.1 Glossary

| Term | Definition |
|------|------------|
| **Spacer** | Player character |
| **Astrec** | Unit of distance between star systems |
| **B/F** | Battle Factor - combat effectiveness rating |
| **DEFCON** | Defense condition level for star systems (1-20) |
| **Conqueror** | Player with 10,000+ points |
| **Chronos** | Travel time unit |
| **Giga Hero** | Highest rank (18+ promotions) |

### 10.2 Original Source References

| Original File | Modern Equivalent |
|---------------|-------------------|
| SP.START.S | `src/game/screens/main-menu.ts` |
| SP.LIFT.S | `src/game/systems/launch.ts` |
| SP.WARP.S | `src/game/systems/navigation.ts` |
| SP.FIGHT1.S | `src/game/systems/combat.ts` |
| SP.DOCK1.S | `src/game/systems/docking.ts` |
| SP.SPEED.S | `src/game/systems/upgrades.ts` |
| SP.DAMAGE.S | `src/game/systems/repairs.ts` |
| SP.REAL.S | `src/game/systems/port-ownership.ts` |
| SP.VEST.S | `src/game/systems/alliance.ts` |
| SP.REG.S | `src/game/systems/registry.ts` |
| SP.END.S | `src/game/systems/save.ts` |
| SP.BAR.S | `src/game/screens/spacers-hangout.ts` |
| SP.GAME.S | `src/game/screens/gambling.ts` |
| SP.TOP.S | `src/game/systems/topgun.ts` |
| SP.SYSOP.S | _Removed (single-player/museum)_ |

### 10.3 Migration Notes

**Breaking Changes from Original:**

1. **No Sysop Features** - Removed as this is a museum installation
2. **OAuth Authentication** - Replaced BBS user authentication
3. **Real-time Multiplayer** - Original used file locking; we use WebSockets
4. **Database Storage** - Replaced flat files with PostgreSQL
5. **No Modem Disconnect Penalties** - Not applicable to web

**Preserved Exactly:**

1. All gameplay formulas
2. All prices and thresholds
3. All menu text and layouts
4. All commands and shortcuts
5. All rank requirements
6. All mission requirements
7. All combat mechanics
8. All economic systems

---

*SpacerQuest v4.0 PRD - Modern Web Museum Edition*

*Based on original SpacerQuest v3.4 by Firefox (1991)*

*Preserving BBS gaming history for future generations*
