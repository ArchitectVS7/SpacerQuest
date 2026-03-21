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
  fuelPrice       Int       @default(5)   // Owner-set price; original SP.REAL.txt line 97: m5=5
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
  fuelPrice       Int       @default(5)   // Owner-set price; original SP.REAL.txt line 97: m5=5
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
// Rename ship (SP.REG.S shipname subroutine, lines 98-129)
// Validation rules (original):
//   - 3-15 characters
//   - Cannot start with "THE " (instr check on first 4 chars)
//   - Cannot end with an alliance symbol (+/@/&/^) unless already a member of that alliance
//     ("Seek out the Spacers Hangout before using that symbol in your ship's name.")
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

#### SP.LIFT.S Launch Bay — Pre-Flight Checks (lines 56-74)

All checks are **blocking errors** (original: `goto start`). Each check is on component **strength only** (not condition), except hull condition (h2) and drive condition (d2) which are separate checks:

| Check | Variable | Error Message |
|-------|----------|---------------|
| Trip limit | `z1>2` | "Only 2 trips allowed per turn" |
| Drive strength | `d1<1` | "No Drives" |
| Cabin strength | `c1<1` | "No cabin" |
| Life support strength | `l1<1` | "No life support system" |
| Navigation strength | `n1<1` | "No navigation system" |
| Robotics strength | `r1<1` | "No computer/robotic system" |
| Hull condition | `h2<1` | "Ship too badly damaged to lift off!" |
| Drive condition | `d2<1` | "Drives inoperable!" |

No contract required check (q1<1 / bribe system) is implemented in the modern version — the original BBS concept of launch clearance contracts has been removed as a non-essential BBS-era mechanic.

#### SP.LIFT.S Fuel Depot — Buy Prices (fueler/buyer section)

Space Authority buy prices per unit (fh, SP.LIFT.S lines 255-257):
- **Default (all other systems):** 5 cr/unit (`fh=5`)
- **System 8 (Mira-9):** 4 cr/unit (`if sp=8 fh=4`)
- **System 14 (Vega-6):** 6 cr/unit (`if sp=14 fh=6`)
- **System 1 (Sun-3):** 8 cr/unit (`if sp=1 fh=8`)
- **Max per transaction:** 2900 units (`if i>2900 print "Too Much!"`)
- **Capacity enforced:** Cannot buy beyond `(h2+1)*h1*10` maximum tank capacity

#### SP.LIFT.S Fuel Depot — Sell Prices (seller section)

Space Authority sell prices per unit (hf, SP.LIFT.S lines 308-311):
- **Default (all other systems):** 2 cr/unit (`hf=2`)
- **System 1 (Sun-3):** 1 cr/unit (`if sp=1 hf=1`)
- **System 8 (Mira-9):** 3 cr/unit (`if sp=8 hf=3`)
- **System 13 (Spica-3):** 5 cr/unit (`if sp=13 hf=5`)
- **System 14 (Vega-6):** 4 cr/unit (`if sp=14 hf=4`)
- **Max per transaction:** 2900 units (`if i>2900 print "Too Much!"`)

Note: buy and sell prices are completely independent in the original — they do **not** follow a fixed percentage relationship.

#### SP.LIFT.S Fuel Capacity Formula (fcap)

`maxCapacity = (hullCondition + 1) * hullStrength * 10`

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

#### SP.WARP.S Course Change Mechanics (nman section, lines 219-230)

A course change deducts **two separate fuel costs**:

1. **Primary cost** (shown to player): `x = h1 * 5` (hull strength × 5)
2. **Secondary cost** (penalty): `ry*2` where `ry = courseChangesUsed * 2` (accumulates per change)

Original source (lines 220, 228-230):
```
x=(h1*5):yr=yr-1:if yr<1 yr=0
f1=f1-x
...
q4=i:dk=0:ry=ry+2
if tt>=ry tt=(tt+ry):else tt=ry
if f1>(ry*2) f1=(f1-(ry*2)):else f1=0
```

- `yr` (course change limit) starts at 3 per trip; decrements on each change; clamped at 0
- `ry` (penalty accumulator) starts at 0; increments by 2 on each change; `ry*2` is the secondary fuel burn
- Block check: `if f1<=x` (primary cost) → "Not enough fuel to change course"

#### SP.WARP.S Hazard Trigger Points (getime subroutine, lines 328-338)

Hazards (`hh=1`) trigger at these travel progress points:

| Progress Mark | Normal Trip (mx=0) | Mission Trip (mx>0) |
|---|---|---|
| `ty/4` | Hazard | Hazard |
| `ty/3` | **Encounter only** (`tp=1`) — NOT a hazard | Hazard |
| `ty/2` | Hazard | Hazard |
| `ty/5` through `ty/9` | No event | Hazard |

**Important:** At `ty/3` on normal trips, `tp=1` (encounter flag) is set — not `hh=1`. The encounter fires at that point. On missions, `ty/3` is a hazard event.

#### SP.WARP.S Travel Hazard Shield Logic (haza/haz0 subroutines, lines 347-358)

- **With shields** (`p2>0`): `r=10:gosub rand:if x<>5` → **90% "All Clear"**, 10% shields drain −1 condition
- **Without shields** (haz0): Pick random component (1–5 = drives/robotics/navigation/weapons/hull). If that component's condition > 0, it takes −1 damage. If condition already = 0, "All Clear!!!"

The 4 hazard event types (SP.WARP.S hazl subroutine, lines 361-364): X-Rad Shower, Plasma-Ion Cloud, Proton Radiation, Micro-Asteroid.

### 5.2 Combat System

```typescript
// Battle Factor calculation — SP.FIGHT1.S ranfix routine (lines 471-491)
// Total player power for battle advantage: hx = x8 + x9 + r9
//
// Original ranfix formula:
//   x8 = weapon_condition * weapon_strength    (weapon power, direct)
//   x9 = shield_condition * shield_strength    (shield power, direct)
//   r9 = BF bonus from support components:
//     For each [cabin, lss, nav, drives, robotics]:
//       sum += floor((condition+1) * strength / 10)
//     sum += battlesWon   (e1 added directly via rfox — NOT divided by 10)
//     r9 = floor(sum/5) if sum > 4, else r9 = 10
//
// DEVIATIONS from original:
//   - Rank bonus (v4.0 addition — not in original ranfix)
//   - Auto-repair does NOT give a BF bonus (corrected); original only repairs post-battle
//   - Hull not included in r9 calculation (simplified vs original which includes it)
function calculateBattleFactor(
  ship: Ship,
  rank: Rank,
  battlesWon: number
): number {
  // Weapon power (x8) and shield power (x9) — direct, no scaling
  const weaponPower = ship.weaponStrength * ship.weaponCondition;
  const shieldPower = ship.shieldStrength * ship.shieldCondition;

  // Support component contributions: (condition+1)*strength/10
  // Note: condition+1 ensures even fully-damaged components contribute something
  const cabinContrib    = Math.floor((ship.cabinCondition + 1)       * ship.cabinStrength / 10);
  const lssContrib      = Math.floor((ship.lifeSupportCondition + 1) * ship.lifeSupportStrength / 10);
  const navContrib      = Math.floor((ship.navigationCondition + 1)  * ship.navigationStrength / 10);
  const driveContrib    = Math.floor((ship.driveCondition + 1)       * ship.driveStrength / 10);
  const roboticsContrib = Math.floor((ship.roboticsCondition + 1)    * ship.roboticsStrength / 10);

  // Experience: e1 added directly (not /10) — original: x=e1:gosub rfox
  const expContrib = battlesWon;

  const supportSum = cabinContrib + lssContrib + navContrib + driveContrib + roboticsContrib + expContrib;
  const r9 = supportSum > 4 ? Math.floor(supportSum / 5) : 10;

  // Rank bonus (v4.0 deviation — not in original ranfix)
  const rankBonus = getRankBonus(rank);

  return weaponPower + shieldPower + r9 + rankBonus;
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

**NPC Credit Value Formula (SP.PATPIR.S line 84/108):**

The original `ckpir` and `ckpat` subroutines compute `p6 = p7 * 5`, where `p6` is the credit bounty and `p7` is the weapon strength. Pirates also set `p5 = 500` (fuel capacity); patrol ships set `p5 = 1000`.

| Class | Weapon Strength (p7) | Credit Value (p6 = p7×5) | Fuel Capacity (p5) |
|-------|----------------------|--------------------------|---------------------|
| Pirates (K1-K9) | 14-32 | 70-160 | 500 |
| Patrol (SP1-SPZ) | 16-65 | 80-325 | 1000 |

**Original source:** SP.PATPIR.S lines 84 (`ckpir`) and 108 (`ckpat`)

```typescript
// Encounter system — SP.FIGHT1.S:62-88 + SP.WARP.S encounter trigger
// Original: encounters are DETERMINISTIC. At 1/3 of travel time (tt=ty/3), tp=1 is set
// unconditionally — every trip has an encounter opportunity. There is no probability roll.
//
// Encounter type is determined by mission type (kk) and current system region:
function generateEncounter(
  currentSystem: number,
  missionType: number,
): Encounter | null {
  // No random probability check — encounter happens deterministically on every trip

  // Determine enemy type based on mission (mirrors SP.FIGHT1.S:62-68)
  if (missionType === 2) {  // kk=2: Space Patrol mission — fight pirates
    return generatePirateEncounter();
  }

  if (missionType === 5) {  // kk=5: Smuggling — fight patrol
    return generatePatrolEncounter();
  }

  if (missionType === 10 || currentSystem > 20) {  // kk=10 or Andromeda
    return generateReptiloidEncounter();
  }

  if (currentSystem > 14) {  // Rim Stars (15-20)
    return generateRimPirateEncounter();
  }

  // Standard cargo run (kk=1) — pirates
  return generatePirateEncounter();
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

#### SP.REAL.S — Space Port Accounts & Fuel Depot

Port ownership is tracked in the `PortOwnership` table. Key facts from original SP.REAL.txt:

**Port Purchase (SP.REAL.txt lines 81-98):**
- Price: `PORT_BASE_PRICE = 100,000 cr` (stored as `m6=10` in 10,000-cr units)
- Check: player's `creditsHigh < m6` → insufficient credits
- On purchase: `fuelPrice = 5` (`m5=5`), `fuelStored = 3000` (`m9=3000`)
- Only core systems 1–14 are purchasable

**Port Sale (SP.REAL.txt lines 100-124):**
- Resale value: `floor(PORT_BASE_PRICE × 0.5) = 50,000 cr` (original: `m6/2`)
- **Bank balance refund**: the port's bank account balance (`bankCreditsHigh`/`bankCreditsLow`) is returned to the player on sale (original: `g1=g1+m7:g2=g2+m8`)
- After sale: port ownership record is deleted; fuel price/stored reset (record gone)

**Fuel Depot (SP.REAL.txt lines 168-230):**
- Fuel price range: `0–50 cr/unit` (owner-set via `P` command)
- Fuel depot capacity: max 20,000 units
- Buying fuel for depot: 10 cr/unit from "main port storage" (`B` command)
- Fuel transfer from ship to depot: max `min(f1, 2900)` units per transfer (`T` command)
- Fuel stored defaults to 3,000 on purchase

**Port Bank Account (SP.REAL.txt lines 126-166):**
- Port owners can deposit/withdraw from their port's bank account (`D`/`W` commands)
- Bank balance tracked as `bankCreditsHigh`/`bankCreditsLow` in PortOwnership

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
  
  return standardPrices[systemId] || 5;  // Space Authority default (original: fh=5)
}

// Cargo type names — original carname subroutine (SP.CARGO.txt lines 313-323)
// Types 1-9 only. Type 10 (Contraband) is a modern addition for smuggling.
const CARGO_TYPES = {
  1: 'Dry Goods',        // v1=1, v2=3
  2: 'Nutri Goods',      // v1=2, v2=6
  3: 'Spices',           // v1=3, v2=9
  4: 'Medicinals',       // v1=4, v2=12
  5: 'Electronics',      // v1=5, v2=15
  6: 'Precious Metals',  // v1=6, v2=18
  7: 'Rare Elements',    // v1=7, v2=21
  8: 'Photonic Components', // v1=8, v2=24
  9: 'Dilithium Crystal', // v1=9, v2=27
  10: 'Contraband',      // modern addition
};

// Core star system names — original desname subroutine (SP.CARGO.txt lines 325-340)
const CORE_SYSTEM_NAMES = {
  1: 'Sun-3',       2: 'Aldebaran-1', 3: 'Altair-3',   4: 'Arcturus-6',
  5: 'Deneb-4',     6: 'Denebola-5',  7: 'Fomalhaut-2', 8: 'Mira-9',
  9: 'Pollux-7',   10: 'Procyon-5',  11: 'Regulus-6',  12: 'Rigel-8',
  13: 'Spica-3',   14: 'Vega-6',
};

// Cargo payment formula — original pay1-pay4 subroutines (SP.CARGO.txt lines 249-284)
// v2 = cargoType * 3  (value per pod, 3–27 cr)
// upodX = floor(max(s1 * (h2+1), 10) / 10)  where s1=pods, h2=hullCondition
// fcost (SP.LIFT.S / cargo trips) = floor(min((21-min(d1,21))+(10-d2))*dist+10, 100) / 2)
//   where d1=driveStrength, d2=driveCondition
// NOTE: SP.REG.S patrol fcost has NO cap at 100 — formula is ty/2 without min(ty,100)
//   patrol fcost = floor(((21-min(d1,21))+(10-d2))*dist+10) / 2)
//   Implemented in calculatePatrolFuelCost() in src/game/systems/travel.ts
// payment = (v2 * distance / 3) * upodX + (fcost * 5) + 1000, cap 15000
// payment = floor(payment / s1) * s1  (normalize to pod multiple)
// Delivery: correct destination → full stated payment. Wrong → × 0.5 penalty.
// NOTE: No delivery bonus. The "ie bonus" (up to 10,000 cr for premium routes)
//       is added at contract SIGNING, not delivery.
function calculateCargoPayment(
  contractPayment: number,
  currentSystem: number,
  contractDestination: number
): number {
  if (currentSystem === contractDestination) {
    return contractPayment;  // full payment
  }
  return Math.floor(contractPayment * 0.5);  // wrong destination: 50% penalty
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

### 5.5b Component Enhancement Prices (SP.SPEED.S main menu, options 1–8)

The main Speede Shoppe menu offers Titanium-class enhancements (+10 strength, sets condition to 9, appends `+*` to component name). Prices are flat per-purchase values from SP.SPEED.S lines 31–32 and 43–50:

| Option | Component    | Price  | Source variable |
|--------|-------------|--------|-----------------|
| 1      | Hull        | 10,000 cr | x1=10000 |
| 2      | Drives      |  9,000 cr | x2=9000  |
| 3      | Cabin       |  3,000 cr | x8=3000  |
| 4      | Life Support|  5,000 cr | x6=5000  |
| 5      | Weapons     |  8,000 cr | x3=8000  |
| 6      | Navigation  |  6,000 cr | x5=6000  |
| 7      | Robotics    |  4,000 cr | x7=4000  |
| 8      | Shields     |  7,000 cr | x4=7000  |

**Validation (choose subroutine):** Enhancement fails if component has no name (""), is "Junk", already has `+*` suffix, already has `++` suffix, or the Titanium code (`*`) alone. The `+!` (Auto-Repair) suffix is stripped when a new Titanium enhancement is applied. Hull enhancement (`i=1`) adds 50 cargo pods (`s1=s1+50`).

**Maximum component strength:** `if x>198 x=199` — hard cap at 199 (SP.SPEED.S line 159).

### 5.5c Shipyard Main Office (SP.YARD.S)

The Shipyard Main Office is where players purchase new ship components (tiers 1–9) for the first time or replace existing ones. It is a separate facility from Roscoe's Speede Shoppe. The original module is `sp.yard.s`.

#### Main Menu Options

| Key | Action |
|-----|--------|
| 1   | Hull |
| 2   | Drive |
| 3   | Cabin |
| 4   | Life Support |
| 5   | Weapon |
| 6   | Navigation |
| 7   | Robotics |
| 8   | Shielding |
| 9/P | Cargo Pods (depot) |
| X   | View ship stats |
| Q   | Quit to SP.LINK |

**Hull prerequisite:** Options 2–8 are blocked with "You must have a spaceship hull first!" when `h1 = 0` (SP.YARD.S line 44).

#### Component Tiers and Purchase Prices (cost.data)

SP.YARD.S lines 27–28 define 9 purchase price tiers:

| Tier | Price  |
|------|--------|
| 1    |    50 cr |
| 2    |   100 cr |
| 3    |   200 cr |
| 4    |   400 cr |
| 5    |   800 cr |
| 6    | 1,500 cr |
| 7    | 3,000 cr |
| 8    | 5,000 cr |
| 9    | 10,000 cr |

#### Component Names Per Tier

| Tier | Hull | Drive | Cabin | Life Support | Weapon | Navigation | Robotics | Shield |
|------|------|-------|-------|--------------|--------|------------|----------|--------|
| 1 | Reliable | Pulse Engines | Simple Accomodations | LSS Model 1A | Atomic Missiles | Solar Nav Aid System | Basic Auto-Pilot | Power |
| 2 | Flyer | Reaction Mass Engines | Basic Comforts | LSS Model 2A | Phasor Guns | Galactic Nav Device | SW Auto Robotic Sys | Hi-Energy |
| 3 | Racer | Hydrogen Ram Scoop | Comfortable Habitat | LSS Model 3A | Laser Guns | Astral Plane Hardware | Ultra Robotic Control | Atomic |
| 4 | Viper | Plasma Ion Drive | Deluxe Staterooms | LSS Model 4A | Plasma Flamer | Harmonic Void Marks | COMPU-TRAK XM | Protector |
| 5 | Tiger | Anti-Matter Drive | Luxury Accomodations | LSS Model 5A | Photon Torpedoes | Ethereal Seeker | Spiffy Controller | Guardian |
| 6 | Mark IV | Ultra-Grav System | Pent-House | LSS Model 6A | Ion Disruptor | Super Astro-Guide | Auto-Battler Console | Guardian-II |
| 7 | Dreadnought | Supra-Grav System | Estate Digs | LSS Model 7A | Particle Ray Generator | LOGRUS NAV | Robo-Mentor | Guardian-][  |
| 8 | Invincible | Photonic LS Drive | Athenia Pad | LSS Model 8A | Neutron Beam Projector | Pathfinder:][ | Psion-O-Tac | Carapace-XM |
| 9 | Battle Star | Harmonic FTL Drive | Plaza Suite | LSS Model 9A | Astral ASDRS | Astrolabe MK-VI | Colossus A:I | ION-MAG Shield |

#### Trade-In Value (swap subroutine)

When replacing a component, the old component's trade-in value is credited back (SP.YARD.S lines 335–349). If the old component has a Titanium Enhancement (`+*` suffix), its strength is reduced by 10 before the lookup:

| Tier | Trade-In |
|------|----------|
| 1    |    25 cr |
| 2    |    50 cr |
| 3    |   100 cr |
| 4    |   200 cr |
| 5    |   400 cr |
| 6    |   700 cr |
| 7    | 1,000 cr |
| 8    | 2,000 cr |
| 9    | 3,000 cr |

Trade-in credits are added back after purchase (not as a discount). No trade-in for components with name "Junk".

#### Hull Replacement (scrap subroutine)

When buying a new hull (SP.YARD.S lines 260–305):

1. Player receives trade-in for old hull (`xs` cr credited to `g2`).
2. Player is offered optional component transfer to the new hull for **500 cr**:
   - Transfer: cargo pods salvaged at **2 cr each** (`s1=0`), all other components kept.
   - No transfer: all installed components are salvaged at their trade-in values (`xe = sum of all component swap values`), all components cleared.
3. All cargo contract/mission state is wiped (`q1=q6=0`).
4. Hull condition, fuel, cloaking flag are reset on new hull purchase.
5. When buying a new hull (`b=1`), the player is prompted for a ship name (see shipname subroutine).

**Special: Life Support "LSS Chry" block** (SP.YARD.S lines 107–110): If the player has "LSS Chry" life support (8-char prefix = "LSS Chry"), purchasing a replacement is blocked with a warning.

#### Ship Name Flow (shipname subroutine, lines 379–413)

Triggered whenever a new hull is purchased. Rules:
- Length must be 4–15 characters.
- Names beginning with "THE " are rejected.
- Alliance suffixes (`-+`, `-@`, `-&`, `-^`) cannot be typed by the player — they must be earned at the Spacers Hangout. However, if the player already had one of these suffixes, it is re-appended after the name is confirmed.
- A default name is assigned if no input: `Stock #00-<spacerId>`.

#### Cargo Pod Depot (depot/store subroutines, lines 197–231)

- Price: **10 cr per pod** (SP.YARD.S line 217).
- Hull required: option blocked without a hull.
- Capacity ceiling formula (SP.YARD.S lines 213–215):
  - `hx = hullStrength`; if `hullStrength > 9`: `hx = hullStrength - 10` (strip Titanium strength bonus)
  - If hull has Titanium enhancement (`right$(h1$,1)="*"`): `hx = hx + 5`
  - `maxPods = (hullCondition + 1) * hx`
- Player can only buy up to `maxPods - currentPods` pods per visit.
- If hull is already at max pods: "has max # of pods" message shown.

**Note:** The Titanium Hull Reinforcement (SP.SPEED.S line 251: `s1=s1+50`) directly adds 50 pods to `s1` — this is a one-time pod addition separate from the capacity formula above.

#### Blocked Features (schema not yet supported)

- **Component name fields missing** — the Ship schema does not store component names (`hullName`, `driveName`, etc.). This means the full SP.YARD purchase flow (named tiers, trade-in by name, hull replacement with component transfer, life support block, `+*` suffix detection, ship naming on hull purchase) cannot be implemented until `hullName` through `shieldName` fields are added to the Ship model.
- **Ship naming on hull purchase** — requires component names to detect alliance suffix preservation.

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

#### MALIGNA Quest Completion Rewards (SP.DOCK1.S:103-110)

When a player arrives at system 27 (MALIGNA) after completing the ablation mission:
- **+100 score points** (`s2 = s2 + 100`)
- **+100,000 credits** (`g1 = g1 + 10`, meaning 10 × 10,000 cr)
- **Ship transported to Vega-6** (system 14) — cargo and mission state cleared
- The MALIGNA mission quest state is reset

**Original source:** SP.DOCK1.S:103-110

#### Exotic Weapon/Shield Systems (Maligna Equipment)

- Available when `sc > 0` (Commander rank or higher).
- **STAR-BUSTER Weapon:** Requires existing weapon system with `+*` suffix (Speedo-enhanced). Replaces weapon with STAR-BUSTER++; strength +1, condition 9. Cost: 10,000 cr.
- **ARCH-ANGEL Shield:** Same requirement for shield. Replaces with ARCH-ANGEL++; strength +1, condition 9. Cloaker is lost if present.

#### Component Upgrade Service (s2 >= 20 required)

- Available for Weapon, Shield, Drive, Navigation, Robotics, Life Support (NOT hull or cabin).
- Adds **+1 strength** per purchase (SP.SPEED.S line 168: `x=x+1`).
- Cost formula (SP.SPEED.S lines 173–174): `a = 1` if `strength <= 9`, else `a = floor(strength/10) + 1`. Cost = `a * 10,000 cr`.
- Special discount days when `ej = sp` (the "special prices" flag).
- This is distinct from the SP.YARD tier purchase prices (50–10,000) and the SP.SPEED Titanium Enhancement flat prices (3,000–10,000).
- Life Support capped at strength 50 if ship is "LSS Class" or strength already < 51.
- Cannot upgrade alien-modified components (`left$(component,1)="?"`).

### 5.7 Repair System (Ron the Recka's — SP.DAMAGE.S)

Ship repairs are performed at the shipyard. Original shop name: "RON THE RECKA's - Space Ship Repairs and Maintenance".

#### Inspection Fee

- Every repair session costs **100 cr** just to "put your old tub up on the rack" (charged even if ship needs no repairs).
- If the player cannot afford the 100 cr inspection fee, repairs are refused.

#### Repair Cost Formula

For each damaged component (condition < 9):

```
repairCost = (9 - condition) * strength + rebuildFee
rebuildFee = 2000 cr  if condition === 0  (component fully destroyed)
rebuildFee = 0        if condition > 0
```

Total cost = inspection fee (100 cr) + sum of all component repair costs.

Original source (SP.DAMAGE.S):
- `spfix` assessment: `k=0: if x=9 k=2000: tj=tj+k` (where x = 9-condition)
- `repauto` actual repair: `k=0: if x<1 k=2000` (where x = condition)

#### Repair Options

- **Repair All** (`POST /api/ship/repair` with no `component`): repairs all 8 components to condition 9 in one transaction. Charges 100 cr inspection fee + sum of all repair costs.
- **Repair Single Component** (`POST /api/ship/repair` with `component` + optional `mode`):
  - `mode=all` (default): repairs all damage on the chosen component — `(9-condition)*strength + rebuildFee`
  - `mode=single`: repairs 1 DX unit — `1*strength + rebuildFee` (original: `(S)ingle DX`)
  - No inspection fee for single component repairs.

#### Blocked Features (schema not yet supported)

- **Junk component handling** — original marks components as "Junk" (in component name string). Junk components cannot be repaired ("99% Damaged! Replace it!"). Requires `hullName`/`driveName`/... fields in Ship schema.
- **Enhancement stripping on rebuild** — when a component with `+*` (Titanium) enhancement has condition=0, the enhancement is stripped and strength reduced by 10 upon repair. Requires component name fields.

---

### 5.8 Main Terminal Hub (SP.LINK.S)

The main terminal (main-menu screen) is the hub that routes players to all game areas.

#### Always-Available Keys (SP.LINK.txt lines 37-41)

These keys work at all times, even when the player is lost in space:

| Key | Action |
|-----|--------|
| `Q` | Quit — save game and logout (triggers vandalism check) |
| `X` | Ship's Stats — inline display of all ship component strengths and conditions |
| `Z` | Your Statz — inline display of all player statistics |
| `0` | Rescue Service — access self-rescue when lost in space |

#### Ship Stats Display (SP.LINK.txt lines 163-185)

`X` displays all 10 ship components inline:
- Hull, Drive, Cabin, Life Support, Weapons, Navigation, Robotics, Shields, Fuel Units, Cargo Pods
- Each row shows: component name, strength, condition

#### Player Statz Display (SP.LINK.txt lines 114-136)

`Z` displays the full player stat sheet inline:
- Name, Ship Name, Rank, Credits, Cargo to Deliver, Origin, Destination
- Trips Completed, Battles Won/Lost, Astrecs Travelled, Cargo Delivered, Rescues Performed
- Total Score, Rating (`sc = floor(score/150)`), Space Port Owned, Trips Today

#### Conqueror Detection (SP.START.S val.start, lines 121-128)

On every login (main-menu render), before showing the normal terminal:
- If `score >= 10000` AND `isConqueror = false`:
  - Display "Hail Conqueror of Spacer Quest!...can you do it again?"
  - Set `isConqueror = true` in the database
  - Character reset (new role creation with Conqueror bonus) is handled separately via character creation flow
- If `isConqueror = true` already: skip this check (show normal menu)

Original: `if s2<10000 goto vlst` / `na$="":sq=1` / `goto new.start`

#### Financial Section Rank Gate (SP.LINK.S finan, lines 89-98)

Access to the Bank screen (`B` key) requires Commander rank or higher.

- If player rank is `LIEUTENANT` (original: `pp$=""` or `left$(pp$,4)="Lieu"`):
  - Show: "Space Patrol rank of Commander or higher"
  - Show: "Required for admittance into the Financial Section"
  - Return to main menu immediately
- Commander+ rank: full bank access granted

#### Lost in Space Guard (SP.LINK.txt line 45)

When `isLost = true`:
- The main menu shows a red warning: `*** YOUR SHIP IS LOST IN SPACE! ***`
- Navigation options (Bank, Shipyard, Pub, Traders, Navigate, etc.) are hidden and blocked
- Only Q, X, Z, and `0` (self-rescue) are available

#### Self-Rescue Service (SP.LINK.txt lines 59-87)

`0` key routes to the rescue-self screen (`src/game/screens/rescue-self.ts`):

- If player is **not** lost: display "You have no need for Rescue Service!" and return to main menu
- If player **is** lost:
  - Show cost and ask `[Y]/(N)`
  - Cost formula (SP.LINK.txt line 61): `cost = sc < 20 ? sc * 1000 : 20000` where `sc = floor(score/150)`
  - `Y`: deduct credits, set `isLost = false`, `lostLocation = null`, return to main menu
  - `N`: return to main menu
  - If insufficient credits: show "Not enough credits" and return to main menu

---

### 5.8.1 Space Registry (SP.REG.S)

Accessible from the main terminal hub via key `R`. Routes to `src/game/screens/registry.ts`.

#### Top-Level Registry Menu (SP.REG.S lines 36-45)

| Key | Action | Requires |
|-----|--------|---------|
| `L` | Library | None |
| `R` | Rescue Service | Functional ship (hullCond≥1 AND driveCond≥1) + ship has a name |
| `S` | Space Patrol HQ | Functional ship + ship has a name |
| `Q` | Quit — return to main menu | None |
| `?` | Show menu | None |

**Note**: `[A]lliance Directory` is NOT a top-level key. It is Library option `9`.

#### Library Submenu (SP.REG.S lines 47-66)

| Key | Content |
|-----|---------|
| `H` | Help (sp.help) |
| `P` | Past Greats (pastgreat file) |
| `1` | Star System Layout |
| `2` | Game Log |
| `3` | Help |
| `4` | Directory of Spacers |
| `5` | Game Formulae |
| `6` | Ship Naming |
| `7` | Game Rules/Documentation |
| `8` | Top Gun List |
| `9` | Alliance Directories |
| `Q` | Quit back to Registry |

#### Rescue Service (SP.REG.S lines 368-415)

- Lists all spacers with `isLost = true` with format: `[#]. [name] Lost near system [n]`
- Requires: rescuer has `fuel >= 50`; if `fuel < 50`: "50 units of fuel needed to complete rescue!"
- If no lost ships: "No ships are lost in space at this time" → return to registry
- Player selects a number, then confirms with `[Y]/(N)` (Y is default)
- On success: +1000 cr, -50 fuel, +1 rescuesPerformed, +1 tripsCompleted, +11 score
- Returns to registry (`start` label) after rescue, not to main menu

#### Ship Naming (SP.REG.S shipname subroutine, lines 98-129)

Accessible via Library option `6`:
- 3-15 characters
- Cannot start with "THE " (checked as `left$(name, 4)`)
- Cannot end with an alliance symbol (`+`, `@`, `&`, `^`) unless the player is already a member of that alliance
  - If they use an alliance symbol without membership: "Seek out the Spacers Hangout before using that symbol in your ship's name."
- Returns to Library menu after naming

#### Space Patrol HQ (SP.REG.S patrol subroutine, lines 177-267) — Partially Implemented

**Blocked features (require schema additions):**
- Join/Oath (`J` key): sets cs=1 (patrol oath), initializes q1=1, q2=10, q5=500, q2$="Secret Battle Codes"
- Choose system to patrol (`C` key, 1-14): prompts for system number, sets q4/q4$
- View orders (`O` key): displays patrol orders screen with cargo, destination, fuel required, pay
- Launch (`L` key): adds fuel requirement (patrol fcost, NO cap at 100), sets kk=2, initiates combat mission
- Key legend (`K` key): shows system legend (sp.legend)
- Trip limit: max 3 completed patrol trips (z1 > 2 rejects)
- Patrol pay formula: base 500 cr + 1000 cr per battle won

**Patrol fuel cost (SP.REG.S fcost, lines 250-256):**
```
af = min(d1, 21)
f2 = (21-af) + (10-d2); if f2<1 f2=1
f2 = f2 * distance
ty = f2 + 10
fuelCost = floor(ty / 2)   ← NO cap at 100 (differs from SP.LIFT.S fcost)
```
Implemented in `calculatePatrolFuelCost()` in `src/game/systems/travel.ts`.

---

### 5.8.5 Top Gun Rankings (SP.TOP.S)

The Top Gun Honor List ranks ships by **strength × condition** for each component (not raw strength alone).

#### Per-Category Formula — `tgfx` subroutine (SP.TOP.S lines 106-109)

```
score = strength × condition
Guard: skip if strength < 1 OR condition < 1   (component not installed)
Guard: skip if strength > 199 OR condition > 9  (invalid values)
```

#### Original Categories (SP.TOP.S lines 79-102, in display order)

| Category | Formula | Variables |
|----------|---------|-----------|
| Fastest Drives | `driveStrength × driveCondition` | `d1*d2` |
| Fanciest Cabin | `cabinStrength × cabinCondition` | `c1*c2` |
| Best Life Support | `lifeSupportStrength × lifeSupportCondition` | `l1*l2` |
| Strongest Weapons | `weaponStrength × weaponCondition` | `w1*w2` |
| Best Navigation | `navigationStrength × navigationCondition` | `n1*n2` |
| Best Robotics | `roboticsStrength × roboticsCondition` | `r1*r2` |
| Strongest Shields | `shieldStrength × shieldCondition` | `p1*p2` |
| Best All-Around Ship | sum of all 8 component scores | lines 69-73 |

The **Best All-Around Ship** (`a$`) is computed by the `tgfx` subroutine summing all 8 components: hull + drives + cabin + life support + weapons + navigation + robotics + shields.

#### Modern Additions (not in original)

Strongest Hull, Most Cargo, Top Rescuer, Battle Champion, Most Promotions — added for web play visibility, do not affect gameplay.

---

### 5.9 Special Mission Battle Engine (SP.MAL.S)

Three special missions use an automated battle simulation run on docking at the mission destination.

#### Mission Type Numbering (SP.MAL.S `kk` variable)

| kk | missionType | Destination | Mission |
|----|-------------|-------------|---------|
| 3  | 3           | System 27   | Maligna (red star ablation) |
| 4  | 4           | varies      | Star System Raid (alliance conquest) |
| 9  | 9           | System 28   | Nemesis battle |

#### Enemy Parameters by Mission (SP.MAL.S lines 57-79)

| Mission | p7 (weaponStr) | p8 (weaponCond) | s7 (shieldStr) | s8 (shieldCond) | p9 (inner1) | s9 (inner2) | p6 (fuel) |
|---------|---------------|-----------------|---------------|-----------------|------------|------------|-----------|
| Maligna | 10            | 60              | 10            | 15              | 12         | 12         | 2000      |
| Nemesis | 25            | 10              | 25            | 10              | 30         | 40         | 2000      |
| Raid    | 10*o7         | 10              | 10*o7         | 10              | 9          | 9          | o7*100    |

Where `o7` = DEFCON level of the target star system.

#### Player Weapon/Shield Effectiveness (SP.MAL.S lines 82-88)

- `k8 = w1 + 18` if STAR-BUSTER equipped; else `k8 = w1`
- `x8 = k8 * w2` if both > 0, else `x8 = k8`
- `k9 = p1 + 18` if ARCH-ANGEL equipped; else `k9 = p1`
- `x9 = k9 * p2` if both > 0, else `x9 = k9`

#### Battle Round Loop (SP.MAL.S `armvar` lines 91-98)

Each round:
1. Penetration: `wj = max(0, x8 - y9)` (player), `wk = max(0, y8 - x9)` (enemy)
2. **Player attack**: fuel cost `wf = w1/2`; direct hit if `wj>0`, else random `r=12`, hit if `r>3`
   - Damage sequence: outer shield (y9) → inner shield 1 (p9) → weapon (y8) → inner shield 2 (s9)
3. **Enemy attack**: fuel cost `wg = p7/2`; direct hit if `wk>0`, else random `r=6`, hit if `r>3`
   - Damage sequence: player shield (x9) → cargo (s1) → drive (d2) → cabin (c2) → nav (n2) → robotics (r2) → hull (h2) → weapon (x8) → life support (l2)
4. **Win** when `s9 ≤ 0`; **Lose** when `l2 ≤ 0`

#### Post-battle Condition Recalculation (SP.MAL.S `mc5` lines 288-293)

```
w2 = 0; if (w1>0 and x8>w1) w2 = x8/w1; if w2>9 w2=9; if w2<1 w2=0
p2 = 0; if (p1>0 and x9>p1) p2 = x9/p1; if p2>9 p2=9; if p2<1 p2=0
```

#### Victory Rewards — `mallosex` (SP.MAL.S lines 312-319)

- Minimum survivals: `l2 ≥ 1`, `h2 ≥ 1`, `d2 ≥ 1`
- `score += q6 + 5` where `q6` is the mission bonus:
  - Maligna (kk=3): `q6=0` → score += 5
  - Nemesis (kk=9): `q6=20` (set at SP.TOP.S:148 and SP.MAL.S:403) → score += **25**
  - Raids (kk=4): `q6=0` → score += 5
- `promotions += 1` (`sc+1`)
- `tripsCompleted += 1`, `tripCount = 0`, `astrecsTraveled += 10`
- `battlesWon += 1` (kk=4 and kk=9 only)
- **Maligna-specific bonus** (DOCK1.S): `score += 100`, `credits += 100,000`, port to Vega-6 (system 14)

#### Nemesis Gems Reward — `gems` (SP.TOP.S lines 152-173)

After beating the Nemesian Forces and returning with the Star Jewels, upon arrival at Sun-3 (linked from SP.MAL.S:411):

- `credits += 150,000` (`g1=g1+15`)
- `lifeSupportStrength += 50`, `lifeSupportCondition = 9` (`l1=l1+50:l2=9`)
- `shieldStrength = 25`, `shieldCondition = 9` (`p1=25:p2=9`)
- `weaponStrength = 25`, `weaponCondition = 2` (`w1=25:w2=2`)
- Weapon upgraded to **STAR-BUSTER++** (`hasStarBuster = true`)
- Shield upgraded to **ARCH-ANGEL++** (`hasArchAngel = true`)
- Life support named **LSS Chrysalis+\*** (flavor text only)
- All mission state cleared (`missionType=0`, `cargoManifest=null`, mission flags zeroed)

#### Defeat Consequences — `malwin` (SP.MAL.S lines 337-343)

- All ship component strengths and conditions zeroed
- `battlesLost += 1`, `score -= 10` (floor 0)
- `rank` reset to COMMODORE (`pp=3`)
- All cargo and mission state cleared

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

A ship guard can be hired from the Extra-Curricular menu (`G`) for 10,000 cr (`g1=g1-1`). Without a guard, quitting risks random vandalism.

**Vandalism roll (SP.END.txt lines 122-134):** Roll `x = random 1-10`:

| `x` | Condition | Damage |
|-----|-----------|--------|
| 1 | `cargoPods > 10` | `cargoPods -= 10` |
| 2 | `cargoPods > 20` | `cargoPods -= 20` |
| 3 | `cargoPods > 30` | `cargoPods -= 30` |
| 4 | `hullCondition > 3` | `hullCondition -= 4` |
| 5 | `cabinCondition > 4` | `cabinCondition -= 5` |
| 6 | `driveStrength > 0` | `driveStrength -= 1` |
| 7 | `lifeSupportCondition > 6` | `lifeSupportStrength -= 7` |
| 8–10 | — | No damage |

If the condition is not met for the rolled `x`, no damage occurs.

---

## 9.4.7 Dueling Arena — Full System (SP.ARENA1.S / SP.ARENA2.S)

Accessible from the Extra-Curricular Menu via `W`. Entry awards a "Carrier-Loss Penalty" warning.

### Menu Commands

| Key | Action |
|-----|--------|
| `1` | Contender — post yourself to the dueling roster |
| `2` | Challenger — accept a pending duel from the roster |
| `3` | Remove self from the dueling roster |
| `R` | View the dueling roster (pending challenges) |
| `B` | View the battle log (completed duels) |
| `V` | View a duel battle file |
| `L` | List all spacers |
| `X` | View ship stat screen |
| `?` | Redisplay arena menu |
| `Q` | Quit (with confirmation if currently a Contender) |

### Handicap (HCP) Calculation

`HCP = floor((h1*h2 + d1*d2 + c1*c2 + l1*l2 + w1*w2 + n1*n2 + r1*r2 + p1*p2) / 500)`

If the total < 500, HCP = 0 and the ship is **Inadequate for dueling**.

### Stakes Types (Contender Setup)

| Type | Key | Stakes Amount | Requirement |
|------|-----|--------------|-------------|
| Total Points | `1` | `floor(score / HCP / 10)` | Score ≥ 150 |
| Ship Component Strength | `2` | `HCP` | None |
| Credits | `3` | `HCP` (deducted immediately on posting) | Credits ≥ HCP |

### Arena Types and Requirements

| Arena | Key | Requirement | Handicap Formula |
|-------|-----|-------------|-----------------|
| Ion Cloud | `1` | ≥ 50 trips completed | `floor(trips / 50)` |
| Proton Storm | `2` | ≥ 100 astrecs travelled | `floor(astrecs / 100)` |
| Cosmic Radiation | `3` | ≥ 100 cargo delivered | `floor(cargo / 100)` |
| Black Hole Proximity | `4` | ≥ 1 rescue | `rescues * 10` |
| Super-Nova Flare | `5` | None | `(battlesWon + 1000) - battlesLost` |
| Deep Space | `6` | None | `0` |

### Battle Simulation (9-Salvo System)

Each duel runs **9 salvos**. For each salvo:

- **Poster salvo (bx):** `bx = (rand1 + 1) * 10 + posterArenaHandicap`  (rand1 = 1–9, poster gets +1 advantage)
- **Accepter salvo (cx):** `cx = rand2 * 10 + accepterArenaHandicap`  (rand2 = 1–9)
- `bx > cx` → poster scores a hit; `cx > bx` → accepter scores a hit; equal → shields deflect

Winner = player with more hits. **Draw** (equal hits) cancels all stakes.

### Stakes Transfer Formula

```
t = posterHandicap + accepterHandicap
if accepterHandicap > posterHandicap:
  s = posterHandicap * 10 / t
  u = posterStakes * s
else:
  s = accepterHandicap * 10 / t
  u = accepterStakes * s
v = max(1, floor(u / 10))
```

For Credits: `v * 10,000 credits` transferred from loser to winner.
For Points: `v` score points transferred.
For Components: `v` random ship components of loser degraded (str-1), winner improved (str+1).

### Winner Bonus

Winner always receives **+10 score points** regardless of stakes type.

### Challenger Validation (Accept Endpoint)

Before accepting a duel, the accepter must:
- Have HCP ≥ 1 (Inadequate check)
- Meet the arena's entry requirement
- Have score ≥ 150 if stakes type is Points
- Have credits ≥ their HCP if stakes type is Credits
- Not be accepting their own posted duel

---

## 9.5 Rim Star Port Arrival (SP.DOCK2.S)

### 9.5.0 Rim Port Docking Effects

Upon arrival at any Rim Star system (systems 15-20), three arrival penalties may apply:

**Fuel consumption on docking (SP.DOCK2.S:47-51):**
- If `navigationStrength <= 60`: consume `(61 - navigationStrength)` fuel units on docking
- If `navigationStrength > 60`: no fuel penalty (efficient docking)

**Hull damage from excessive docking (SP.DOCK2.S:53-59):**
- If `tripCount >= 4`: `hullCondition -= (tripCount - 3)`
- If hull condition reaches 0: `hullStrength = 0` (hull destroyed)

**Airlock damage (SP.DOCK2.S:61-67):**
- If `(weaponStrength + shieldStrength) < 60` and life support not already destroyed:
  - Damage `x = 1`; if `tripCount > 2`: `x = tripCount - 2`
  - `lifeSupportCondition -= x`; if reaches 0: `lifeSupportStrength = 0`

**Rim port docking fee (SP.DOCK2.S:31-36):**
- Base formula: `fee = (systemId % 14) × zh` where `zh = 1000`
- Full alliance member discount: `zh -= 100` (−100 per unit)
- LSS Corps member discount: `zh -= 400` (−400 per unit)
- Example: system 15 → fee = 1×1000 = 1,000 cr (base)

**Rim port fuel sell price (SP.DOCK2.S:229-231):**
- `sellPrice = 25 - systemId` per unit
- Exception: system 15 (Antares-5) → sell price = 5 cr/unit
- Example: system 16 → 9 cr/unit, system 17 → 8 cr/unit, system 20 → 5 cr/unit

**Rim port component repair (SP.DOCK2.S rmfx:284-298):**
- Cost = `componentStrength × 100` per visit (strength capped at 199)
- Repairs exactly **1 condition unit** per visit (unlike main shop which can repair all)
- No rebuild fee for destroyed components
- Each rim port specializes: system 15 = shields, 16 = drives, 17 = cabin, 18 = robotics, 19 = navigation, 20 = no repairs

### 9.5.1 The Wise One (Polaris-1, System #17)

Available via `(W)ise One Visit` in the Polaris-1 docking menu. Displays atmospheric text about alien weapon enhancements found on derelicts in The Great Void, then generates a random **Number Key** (1-9) shown to the player. The Number Key (`kn`) is **persisted** to the character record and used to unlock The Great Void weapon enhancement on Andromeda arrival.

**Original source:** SP.DOCK2.S:332-334, text file SP.WISE

### 9.5.1a The Black Hole Exit Event (SP.PATPIR.S "black" section, lines 142-198)

Triggered on Andromeda arrival (`kk=10`) via `link "sp.black","dock"` in SP.WARP.S line 87. Implemented as the `black-hole-event` screen.

**Flow:**

1. **Component damage** (blkx subroutine, lines 147-158): On exit, one of 7 ship components is selected at random (drives, cabin, life-support, weapons, navigation, robotics, hull). A random damage amount (1-7) is applied if the component strength > 5. If strength ≤ 5, no damage is applied (`i=i+1:return`).

2. **The Great Void** (blk2, lines 160-165): Player is prompted to input their Number Key. If the entered key matches the persisted `kn` value, the alien weapon enhancement discovery triggers. If not, "Only empty space rewards your diligent scanning" and the event ends.

3. **Weapon Enhancement Install** (blk3-blk5, lines 176-190): If the correct key is entered, player finds an exotic device and is asked `Install [Y]/(N)`. Both the first and second Y/N answers are recorded (`a$` and `i$`). The device is installed only when both confirm Y. If first=Y, second=N → re-ask. If first=N, second=Y → jettison. Installation sets `hasWeaponMark = true` on the ship record (equivalent to original `w1$="?"+w1$` prefix).

4. **Return**: After the event (success, failure, or jettison), the player proceeds to the `navigate` screen.

**Database fields added:**
- `Character.numberKey` (Int?, nullable) — stores `kn` set by Wise One visit
- `Ship.hasWeaponMark` (Boolean, default false) — flag for alien weapon enhancement installed

**Original source:** SP.PATPIR.S lines 142-198

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

Original SP.BAR.S hangout menu:

```
[Spacers Hangout]:  (G)amble  (D)rinks  (I)nfo  [Q]uit
```

The `(B)rig` option was originally a Sun-3 top-level menu before entering the hangout. In v4.0 it is accessible from inside the hangout menu.

### 9.7.2 Hangout Features

- **(G)amble** - Links to gambling games (Wheel of Fortune, Dare)
- **(D)rinks** - Increments drink counter (dz). After 4+ drinks: info broker reveals first hint row; after 8+ drinks: second hint row. Counter resets to 0 when entering info.
- **(I)nfo** - Interactive text-input information broker. Player types a keyword (up to 3 chars). Responds using `instr(KEYWORD, input)` substring matching. After 4 unknown queries, suggests "have another drink". Keywords (in match order): RAI, WIS, SAG, CHR, ALL, MAL, GIR, WIN, WEA, SHI, PIR, DRI, ROB, NAV, LIF, HUL, FIR, COO, CLO, RAN, BAT, SPA, STA, RIM, SMU, GEM.
  - `ALL` → Alliance joining sub-menu (requires Lieutenant+ rank). Choose `+/@/&/^` to pick alliance, then confirm with Y/N.
  - `RAI` → Alliance raid planning screen
  - `SMU` → Smuggling info (full contract system blocked pending schema migration for `nj` field)
- **(B)rig** - View jailed spacers. Sub-menu: (L)ook again, (B)ail out convict, (Q)uit. Bail requires two confirmations: "Bail out this miscreant?" and "Bail is set at X cr...pay it?". Bail costs double the fine.
- **[Q]uit** - Return to main menu

### 9.7.3 Smuggling Completion (Gain Section)

When a player with missionType=5 (smuggling) and cargoType=0 (delivered) enters the hangout:
- If cargoManifest="Contraband" and cargoPayment>0: award payment, show success message
- Otherwise: show failure message
- Both cases: reset all mission state (missionType=0, cargoType=0, cargoPods=0, etc.)

Original: SP.BAR.S:45-46, 247-264

### 9.7.4 Smuggling Contract Pickup

**Blocked — Needs Discussion**: Full smuggling contract system requires a `nj` field (smuggling attempts this session) to be added to the Character schema. Without it, the `nj>2` guard that prevents repeated runs cannot be implemented. The `SMU` keyword currently shows the info message only.

### 9.7.5 Brig Viewing

Players can visit the Brig (B key from hangout) to see jailed spacers. Sub-menu offers Look, Bail, Quit. Bail requires two Y/N confirmations before credits are deducted and prisoner released. Bail costs double the fine amount.

## 9.7b Gambling (SP.GAME.S)

Accessed from The Spacers Hangout via (G)amble. Two games of chance are available.

### 9.7b.1 Gambling Menu

```
There are Two Games of Chance in operation
------------------------------------------
   (1)   Digital Wheel of Fortune
   (2)   IRON BROW's Spacers Dare
   [Q]   Leave this Den of Inequity
------------------------------------------
```

### 9.7b.2 Digital Wheel of Fortune

- Player picks a number (1–20)
- Player picks number of rolls (3–7)
- Payout odds: `floor(20 / rolls) - 1` (minimum 1)
- Maximum bet: 1,000 credits
- If ANY roll matches the bet number → WIN: credits += bet × odds
- If no roll matches → LOSE: credits -= bet
- Original daily win limit: `uh` wins tracked against `ui=12` daily cap. Closed for renovations if `uh > ui`. **Blocked — requires `wofWinsToday` field on Character schema.**

### 9.7b.3 IRON BROW's Spacer's Dare

Pig-style dice game. Minimum 750 credits required to play.

- Player picks rounds (3–10) and score multiplier (1–3)
- **Each round (player and computer take turns):**
  1. Roll two dice → reference total (not scored)
  2. Keep rolling: if any roll matches the reference total → **BUST** (0 points this round)
  3. Otherwise accumulate each roll's total into round score
  4. Player can stop anytime (original: interactive "Roll again? [Y]/(N)")
- Computer uses AI strategy table indexed by its reference total:
  - Rare totals (2,3,11,12) → threshold 19 (keep rolling; bust unlikely)
  - Medium totals (4,5,9,10) → threshold 10
  - Common totals (6,7,8) → threshold 7 (stop early; bust likely)
- Winner of each game = highest cumulative score after all rounds
- Winnings: `(playerTotal - computerTotal) × multiplier` added to credits
- Losses: `(computerTotal - playerTotal) × multiplier` deducted (capped at current credits)
- **Note:** Original game has interactive per-roll decisions. Current automated version uses the computer AI table as a player strategy proxy. Full interactive flow is a known deviation.

Original source: SP.GAME.S (dare / strat / foolish / comp.turn labels)

## 9.7b Alliance Banking and Trust (SP.SAVE.S)

Each of the four alliances has a single shared treasury account (not per-member). Key mechanics from the original:

### 9.7b.1 Shared Treasury Model

- One bank account per alliance (stored as `o3` high / `o4` low in 10,000-cr units).
- Any alliance member may deposit into the shared account.
- Withdrawals require the correct password (set by the banker/CEO).

### 9.7b.2 Banker / CEO Role

- The first member to establish the bank (by spending 10,000 cr startup cost: `g1=g1-1`) becomes CEO/banker (`o5$`).
- Only the banker can set or change the account password (`o7$`, 4–8 characters).
- Password is required for all withdrawals and deposits.
- If the bank goes bankrupt (`o3<1 and o4<1`), the banker record is cleared and a new CEO may be elected.

### 9.7b.3 Credit Formula

- Bank assets use the same 10,000-unit split as player credits: `o3` (ten-thousands), `o4` (units).
- Withdraw: `o4=o4-ia:o3=o3-ib`. If `ia>o4`, borrow from `o3` via `invinc`: `o4=o4+10000:o3=o3-1`.
- Deposit: `o4=o4+ia:o3=o3+ib`, then normalize via `invfix`.

**Original source:** SP.SAVE.S (Alliance Banking and Trust)

**Implementation status:** Modern code tracks investments per-member rather than in a shared treasury. Banker/CEO role, password protection, and 10,000-cr startup cost are not yet implemented. The credit split math was corrected to use the 10,000-unit boundary (was incorrectly using 100,000).

## 9.7c Alliance Investments Ltd (SP.VEST.S)

Star system DEFCON investment and hostile takeover mechanics. Only the 14 core star systems (1–14) are eligible.

### 9.7c.1 DEFCON Fortification

- Only systems 1–14 are investable (SP.VEST.S line 219: `if (xo<1) or (xo>14) print "Outta range!"`).
- Maximum DEFCON level is **20** (SP.VEST.S line 82: `if o7>19 print "Maximum DEFCON achieved"`).
- Cost per DEFCON level is **tier-based** (SP.VEST.S lines 83, 85):
  - Tier 1 (current DEFCON ≤ 9): `j=1` → **100,000 cr** per level.
  - Tier 2 (current DEFCON > 9): `j=2` → **200,000 cr** per level.
- Cost is deducted from the player's personal credits (the modern equivalent of the original's `g1=g1-j` deduction).

### 9.7c.2 Hostile Takeover

- A system with assets > 1,999,999 (`o3 >= 200` in original units) is safe from takeover (SP.VEST.S line 173).
- A system with assets < 99,999 (`o3 < 10`) or between 100,000–1,999,999 (`o3 10-199`) is eligible.
- Takeover cost formula (SP.VEST.S lines 180–184):
  - If `o3 < 1` (bankrupt): `y = 1` → cost = 10,000 cr.
  - If `o3 > 0`: `y = o3 * 2` → cost = `o3 * 2 * 10,000 cr`.
- The attacker must pay the takeover cost from personal credits before ownership transfers.

### 9.7c.3 DEFCON Combat (Raid)

- When an alliance attacks an enemy-held system, DEFCON levels are spent as "shields" (SP.VEST.S invtak logic).
- If attacker DEFCON levels exceed defender DEFCON: takeover succeeds; remaining levels become the new owner's DEFCON.
- If attacker levels are insufficient: only weakens the defender's DEFCON by the number of attacking levels.

**Original source:** SP.VEST.S

**Implementation status:** System range (1–14) and DEFCON max cap (20) enforced. Tier-based DEFCON cost implemented. Hostile takeover via DEFCON combat implemented. Legacy direct takeover (T command with asset-based formula) and initial system acquisition (I command, CEO role) are not yet implemented as separate commands; currently routed through the DEFCON flow.

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
| SP.LINK.S | `src/game/screens/main-menu.ts` (main hub, X/Z/0 keys, lost-in-space guard) + `src/game/screens/rescue-self.ts` (self-rescue) |
| SP.LIFT.S | `src/game/systems/travel.ts` (launch validation, fuel cost) + `src/game/screens/navigate.ts` (navigate UI) + `src/game/screens/traders-buy-fuel.ts` + `src/game/screens/traders-sell-fuel.ts` |
| SP.WARP.S | `src/game/systems/travel.ts` (warp mechanics, course change) |
| SP.FIGHT1.S | `src/game/systems/combat.ts` |
| SP.DOCK1.S | `src/game/systems/docking.ts` |
| SP.DOCK2.S | `src/game/systems/docking.ts` + `src/game/systems/economy.ts` + `src/game/systems/repairs.ts` |
| SP.SPEED.S | `src/game/systems/upgrades.ts` |
| SP.DAMAGE.S | `src/game/systems/repairs.ts` |
| SP.REAL.S | `src/game/systems/port-ownership.ts` |
| SP.SAVE.S | `src/game/systems/alliance.ts` + `src/game/screens/alliance-invest.ts` (Alliance Banking and Trust — per-member investment ledger; shared-treasury banker/CEO/password mechanics not yet implemented) |
| SP.VEST.S | `src/game/systems/alliance.ts` + `src/game/screens/alliance-invest.ts` (Alliance Investments Ltd — star system DEFCON investment and hostile takeover) |
| SP.REG.S | `src/game/systems/registry.ts` + `src/game/screens/registry.ts` + `src/game/screens/rescue.ts` + `src/game/systems/rescue.ts` |
| SP.END.S | `src/game/systems/save.ts` |
| SP.BAR.S | `src/game/screens/spacers-hangout.ts` |
| SP.GAME.S | `src/game/systems/gambling.ts` + `src/game/screens/pub.ts` |
| SP.TOP.S | `src/game/systems/topgun.ts` |
| SP.MAL.S | `src/game/systems/maligna-battle.ts` (battle engine) + `src/game/systems/docking.ts` (battle integration on arrival) |
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
