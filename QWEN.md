# SpacerQuest v4.0 - Project Context

## Project Overview

**SpacerQuest v4.0 - BBS Museum Edition** is a modern web-based remake of the classic space trading and combat game *SpacerQuest v3.4* (1991) by Firefox. Originally written for the Apple II GBBS system, this preservation project brings the authentic BBS terminal experience to modern browsers while maintaining exact gameplay fidelity.

### Key Features

- 🎮 **Authentic Gameplay** - All original formulas, prices, menus, and mechanics preserved
- 📟 **Terminal Interface** - 80x24 ASCII display via xterm.js
- 🌌 **28 Star Systems** - 14 Core (Milky Way), 6 Rim Stars, 6 Andromeda (NGC), 2 Special locations
- ⚔️ **Turn-Based Combat** - Battle Factor calculations, retreat, surrender, ram options
- 💰 **Economic System** - Cargo trading, fuel arbitrage, player-owned space ports
- 🏆 **Rank Progression** - 9 ranks from Lieutenant to Giga Hero (0-2700+ score)
- 🤝 **Alliance System** - 4 factions (+, @, &, ^) with DEFCON territory control
- 🎲 **Mini-Games** - Wheel of Fortune and Spacer's Dare gambling
- 🤖 **Bot Players** - 20 simulated players that take turns like the original BBS

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + TailwindCSS + xterm.js |
| **State** | Zustand (client), Socket.IO (real-time) |
| **Backend** | Node.js 20 + Fastify + TypeScript |
| **Database** | PostgreSQL 15 + Prisma ORM |
| **Cache/Queue** | Redis 7 + Bull (background jobs) |
| **Real-time** | Socket.IO (WebSocket) |
| **Auth** | OAuth 2.0 (BBS Portal integration) |
| **Build** | Vite 5 (frontend), TypeScript (backend) |
| **Testing** | Vitest (unit), Playwright (E2E) |
| **Deployment** | Docker + Railway |

---

## Repository Structure

```
SpacerQuest/                    # Project root (documentation + original source)
├── README.txt                  # Project overview and credits
├── PRD.md                      # Product Requirements Document (2997 lines)
├── User-Manual.md              # Reverse-engineered original game manual
├── GAME-ACTIONS.md             # Complete game actions reference
├── Alignment.md                # 1991 vs 2026 fidelity audit
├── Traceability.md             # Original file → Modern module mapping
├── CLAUDE.md                   # Claude Code instructions
├── plan.md                     # Development roadmap
├── OPEN_ITEMS.md               # Current open tasks
├── railway.json                # Railway deployment config
│
└── spacerquest-web/            # All runnable code (working directory for dev)
    ├── src/
    │   ├── app/                # Fastify HTTP server + API routes
    │   │   ├── index.ts        # Server entry point
    │   │   └── routes/         # REST endpoints (auth, combat, economy, etc.)
    │   ├── frontend/           # React 18 SPA
    │   │   ├── components/     # UI components (Terminal, screens)
    │   │   ├── store/          # Zustand state management
    │   │   └── sockets/        # WebSocket client
    │   ├── game/               # Core game logic (stateless, pure functions)
    │   │   ├── constants.ts    # All balance values (ranks, prices, formulas)
    │   │   ├── systems/        # Game mechanics (travel, combat, economy, etc.)
    │   │   └── screens/        # Server-side terminal screen renderers
    │   ├── sockets/            # WebSocket handlers + screen router
    │   ├── jobs/               # Bull queue workers (daily tick, encounters)
    │   ├── bots/               # NPC/bot AI logic
    │   └── db/                 # Prisma client singleton
    ├── prisma/
    │   ├── schema.prisma       # DB schema (User, Character, Ship, StarSystem, etc.)
    │   └── seed.ts             # Star system + NPC roster seed
    ├── tests/
    │   ├── core.test.ts        # Vitest unit tests
    │   └── e2e/                # Playwright specs (numbered 01-xx flow order)
    ├── public/                 # Static frontend files
    ├── docker-compose.yml      # Local dev: app, worker, postgres, redis
    ├── Dockerfile              # Production build
    └── package.json            # Dependencies and scripts
```

### Original Source Files

The `SQ/` directory contains the original 1991 Apple II source code files (SP.*.S, etc.). The `Decompile/` directory contains decompiled output for reference. These are preserved for fidelity verification.

---

## Building and Running

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL 15+
- Redis 7+
- pnpm or npm

### Quick Start

```bash
# Navigate to the web application directory
cd spacerquest-web

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
npm run db:generate

# Push schema to database (development)
npm run db:push

# Seed initial data (28 star systems, 65+ NPCs)
npm run db:seed

# Start development server (backend + frontend)
npm run dev
```

### Development Commands

```bash
# Start both server (port 3000) and client (port 5173)
npm run dev

# Start server only
npm run dev:server

# Start client only
npm run dev:client

# Build for production
npm run build

# Run unit tests
npm run test

# Run E2E tests
npm run test:e2e

# Lint codebase
npm run lint
```

### Docker

```bash
# Start all services (app, worker, postgres:15, redis:7)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

### Production

```bash
# Build and start
npm run build
npm start

# Run background worker (daily ticks, encounters, missions)
npm run worker
```

---

## Development Conventions

### Code Style

- **TypeScript**: `strict: false` (per project config), target ES2022
- **Naming**:
  - PascalCase: Components, classes, enums, types
  - camelCase: Variables, functions, methods
  - UPPER_SNAKE_CASE: Constants, environment variables
- **Comments**: Minimal; focus on *why* not *what*. Original variable names (e.g., `d1`, `g1`) are preserved with comments linking to original source lines.

### Architecture Patterns

- **Game Logic Purity**: `src/game/systems/` contains pure functions with no I/O. All balance formulas live here with original variable names.
- **Screen Renderers**: `src/game/screens/` produces 80x24 ANSI terminal output. Each maps to an original BBS screen.
- **Route Handlers**: `src/app/routes/` validates input, calls game systems, persists via Prisma.
- **WebSocket Flow**: Browser → xterm.js → Socket.IO → screen router → keypress handler → screen renderer → ANSI stream back.

### Testing Practices

- **Unit Tests** (`vitest`): Isolated logic in `src/game/systems/`
- **Integration Tests**: Route handlers + game systems together
- **E2E Tests** (`playwright`): Full user flows in `tests/e2e/`, numbered by game progression order (01-login, 02-character, etc.)

### Git & Commits

- Clear, concise commit messages focused on *why* over *what*
- Preserve original gameplay values without change (fidelity constraint)
- Document any deviations from original in `Alignment.md`

---

## Key Game Systems

### Travel System (`src/game/systems/travel.ts`)

```
Fuel Cost:    base = (21 - drive_strength) + (10 - drive_condition)
              fuel = base * distance, capped at 50

Travel Time:  distance * 3 seconds

Course Change: hull_strength * 5 fuel, max 3 per trip
```

### Combat System (`src/game/systems/combat.ts`)

```
Battle Factor (BF) = (weapon×condition) + (shield×condition)
                   + (cabin×condition/10) + (robotics×condition/10)
                   + (life_support×condition/10)
                   + rank_bonus + experience_bonus + auto_repair_bonus

Rank Bonuses: Lt=0, Cmd=5, Capt=10, Com=15, Adm=20, TD=30, GM=40, MH=50, GH=60
Experience: battles_won / 10
Auto-Repair: +10 BF
```

### Economy (`src/game/systems/economy.ts`)

| System | Fuel Price |
|--------|-----------|
| Sun-3 (1) | 8 cr/unit |
| Mira-9 (8) | 4 cr/unit |
| Vega-6 (14) | 6 cr/unit |
| Others | 25 cr/unit |
| Player-owned | Custom (0-50) |

**Cargo Payment**: `pods × base_rate + 10% bonus (correct destination)`

### Rank Progression

| Rank | Score Required | Promotion Bonus |
|------|---------------|-----------------|
| Lieutenant | 0 | — |
| Commander | 150 | 20,000 cr |
| Captain | 300 | 30,000 cr |
| Commodore | 450 | 40,000 cr |
| Admiral | 600 | 50,000 cr |
| Top Dog | 900 | 80,000 cr |
| Grand Mufti | 1100 | 100,000 cr |
| Mega Hero | 1350 | 120,000 cr |
| Giga Hero | 2700 | 150,000 cr |

### Alliances

| Symbol | Name |
|--------|------|
| `+` | Astro League |
| `@` | Space Dragons |
| `&` | Warlord Confederation |
| `^` | Rebel Alliance |

---

## Database Schema Highlights

Key models in `prisma/schema.prisma`:

- **User/Session**: OAuth authentication
- **Character**: Player state, stats, progression (maps to original `SP.REG.S` variables)
- **Ship**: 8 components (Hull, Drives, Cabin, Life Support, Weapons, Navigation, Robotics, Shields)
- **StarSystem**: 28 systems with dynamic ownership, fuel prices, alliance control
- **NpcRoster**: 65+ persistent NPCs from original data files
- **PortOwnership**: Player-owned space ports with income tracking
- **AllianceMembership/AllianceSystem**: Alliance mechanics, DEFCON levels
- **BattleRecord/DuelEntry**: Combat history and dueling challenges
- **GameLog**: Event logging (visitor, battle, trade, promotion, etc.)

---

## API Endpoints

Access OpenAPI/Swagger docs at `http://localhost:3000/docs` when running.

### Authentication
- `POST /api/auth/login` - OAuth token exchange
- `POST /api/auth/logout` - Invalidate session
- `GET /api/auth/dev-login` - Development mode login

### Character
- `GET /api/character` - Current character state
- `POST /api/character` - Create new character
- `PUT /api/character/ship-name` - Rename ship
- `PUT /api/character/alliance` - Join/leave alliance

### Navigation
- `POST /api/navigation/launch` - Launch to destination
- `GET /api/navigation/travel-status` - Poll travel progress

### Combat
- `POST /api/combat/engage` - Enter combat
- `POST /api/combat/action` - Combat round action (FIRE, RETREAT, SURRENDER)

### Economy
- `POST /api/economy/fuel/buy` - Purchase fuel
- `POST /api/economy/fuel/sell` - Sell fuel
- `POST /api/economy/cargo/accept` - Accept cargo contract
- `POST /api/economy/port/buy` - Purchase space port

### Ship
- `GET /api/ship/status` - Full ship status
- `POST /api/ship/upgrade` - Upgrade component
- `POST /api/ship/repair` - Repair all components

---

## Testing

### Unit Tests
```bash
npm run test              # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
```

### E2E Tests
```bash
npm run test:e2e          # Run Playwright tests (Chromium)
npm run test:e2e:ui       # Interactive UI mode
npm run test:e2e:debug    # Debug mode with inspector
```

E2E tests are numbered by game flow order:
- `01-*.spec.ts` - Authentication
- `02-*.spec.ts` - Character creation
- `03-*.spec.ts` - Navigation
- `04-*.spec.ts` - Combat
- `05-*.spec.ts` - Economy
- ...
- `09-browser-game-agent.spec.ts` - 50-turn strategic playtest

---

## Deployment

### Railway (Recommended)

```bash
# Install CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
cd spacerquest-web
railway init

# Add services
railway add --plugin postgresql
railway add --plugin redis

# Deploy
railway up

# Seed database (first deploy only)
railway run npx prisma db seed

# Generate public domain
railway domain
```

See `DEPLOY.md` for detailed deployment instructions.

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/spacerquest
REDIS_URL=redis://host:6379
JWT_SECRET=minimum-32-character-secret

# OAuth (optional, falls back to dev mode)
BBS_PORTAL_CLIENT_ID=...
BBS_PORTAL_CLIENT_SECRET=...
BBS_PORTAL_AUTH_URL=...
BBS_PORTAL_TOKEN_URL=...
BBS_PORTAL_CALLBACK_URL=...
BBS_PORTAL_USERINFO_URL=...
```

---

## Game Fidelity

This project prioritizes **authenticity** over modernization. Key preservation commitments:

| Element | Commitment |
|---------|------------|
| All menu text | Verbatim from original |
| All commands | Same single-key shortcuts |
| All formulas | Combat, travel, economy unchanged |
| All prices | Same credit values |
| All thresholds | Rank requirements, mission requirements |
| All system names | Identical to original |
| Screen layouts | ASCII art preserved exactly |

See `Alignment.md` for the complete 1991 vs 2026 comparison audit.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `PRD.md` | Product Requirements Document (comprehensive spec) |
| `User-Manual.md` | Reverse-engineered original game manual |
| `GAME-ACTIONS.md` | Complete game actions reference table |
| `Alignment.md` | Fidelity audit: 1991 original vs 2026 implementation |
| `Traceability.md` | Original source file → Modern module mapping |
| `CLAUDE.md` | Claude Code workspace instructions |
| `OPEN_ITEMS.md` | Current open tasks and priorities |
| `spacerquest-web/QWEN.md` | Technical implementation guide |
| `spacerquest-web/DEPLOY.md` | Railway deployment runbook |

---

## Quick Reference

### Game Commands (Main Menu)

| Key | Action |
|-----|--------|
| B | First Galactic Bank |
| S | Galactic Shipyard |
| P | Lonely Asteroid Pub |
| T | Intergalactic Traders |
| N | Navigate |
| R | Space Registry |
| I | Alliance Investment (members only) |
| Q | Quit / Logout |

### Ship Components

| # | Component | Upgrade Price (+10 STR) |
|---|-----------|------------------------|
| 1 | Hull | 10,000 cr |
| 2 | Drives | 9,000 cr |
| 3 | Cabin | 8,000 cr |
| 4 | Weapons | 8,000 cr |
| 5 | Shields | 7,000 cr |
| 6 | Life Support | 6,000 cr |
| 7 | Navigation | 5,000 cr |
| 8 | Robotics | 4,000 cr |

### Special Equipment

| Equipment | Price | Requirement | Effect |
|-----------|-------|-------------|--------|
| Morton's Cloaker | 500 cr | Hull ≤ 49 | 70% retreat success |
| Auto-Repair | hull_str × 1000 cr | None | +10 BF |
| Star-Buster++ | 10,000 cr | Conqueror | Special weapon |
| Arch-Angel++ | 10,000 cr | Conqueror | Enhanced combat |
| Astraxial Hull | 100,000 cr | Conqueror + Drives ≥ 25 | Andromeda access |

---

## Support & Documentation

- **API Docs**: `/docs` endpoint when server is running
- **Original Source**: `SQ/` directory (Apple II source files)
- **Decompiled Reference**: `Decompile/` directory
