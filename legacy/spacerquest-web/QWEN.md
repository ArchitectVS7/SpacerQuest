# SpacerQuest v4.0 - Project Context

## Project Overview

**SpacerQuest v4.0 - BBS Museum Edition** is a modern web-based remake of the classic space trading and combat game SpacerQuest v3.4 (1991). It's a full-stack TypeScript application featuring:

- **Frontend**: React 18 + TypeScript with TailwindCSS, using a retro terminal-style interface with xterm.js
- **Backend**: Fastify (Node.js) REST API with WebSocket support via Socket.IO
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Redis for pub/sub and job queue (Bull)
- **State Management**: Zustand for client-side state

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Fastify Server  │────▶│   PostgreSQL    │
│  (Vite 5, xterm)│◀────│  (Port 3000)     │◀────│   (Prisma ORM)  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │
        │ WebSocket             │ Redis (pub/sub, jobs)
        ▼                       ▼
┌─────────────────┐     ┌──────────────────┐
│  Socket.IO      │     │  Background Jobs │
│  Game Events    │     │  (Daily tick,    │
└─────────────────┘     │   encounters)    │
                        └──────────────────┘
```

### Project Structure

```
spacerquest-web/
├── src/
│   ├── app/              # Fastify API server & routes
│   │   ├── routes/       # REST API endpoints (auth, combat, economy, etc.)
│   │   ├── middleware/   # Auth, validation middleware
│   │   └── index.ts      # Server entry point
│   ├── frontend/         # React application
│   │   ├── components/   # UI components (Terminal, screens)
│   │   ├── store/        # Zustand state management
│   │   ├── sockets/      # WebSocket client
│   │   └── styles/       # TailwindCSS + custom styles
│   ├── game/             # Core game logic
│   │   ├── models/       # Game entities
│   │   ├── screens/      # Screen rendering logic
│   │   ├── systems/      # Game systems (combat, travel, economy)
│   │   └── constants.ts  # Game balance values
│   ├── jobs/             # Background job workers
│   ├── bots/             # NPC/bot AI logic
│   ├── db/               # Database utilities
│   └── sockets/          # WebSocket handlers
├── prisma/
│   ├── schema.prisma     # Database schema
│   ├── migrations/       # Prisma migrations
│   └── seed.ts           # Database seeding (28 systems, 65+ NPCs)
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # Playwright E2E tests
└── public/               # Static assets
```

## Building and Running

### Prerequisites

- Node.js >= 20.0.0
- PostgreSQL database
- Redis server

### Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables:
   ```
   DATABASE_URL=postgresql://user:pass@localhost:5432/spacerquest
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-secret-min-32-chars
   ```

### Development

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Seed the database (28 star systems, 65 NPCs)
npm run db:seed

# Start dev servers (backend + frontend concurrently)
npm run dev
# - Backend: http://localhost:3000
# - Frontend: http://localhost:5173
```

### Building for Production

```bash
# Build both frontend and backend
npm run build

# Or build separately
npm run build:server   # TypeScript compilation
npm run build:client   # Vite build → dist/public/
```

### Running in Production

```bash
# Start the server
npm start

# Run background worker (daily ticks, encounters, missions)
npm run worker

# Or run worker once (for testing)
npm run worker:once
```

### Docker Deployment

```bash
# Build Docker image
npm run docker:build

# Start all services (app, worker, postgres, redis)
npm run docker:up

# Stop services
npm run docker:down
```

## Testing

```bash
# Unit & integration tests (Vitest)
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage

# E2E tests (Playwright)
npm run test:e2e

# E2E with UI
npm run test:e2e:ui

# E2E debug mode
npm run test:e2e:debug
```

## Development Conventions

### Code Style

- **TypeScript**: Strict mode disabled (`strict: false`) but type-safe by design
- **ESLint**: Custom config with TypeScript plugin, ignores `dist/` and `node_modules/`
- **Formatting**: Standard TypeScript/React conventions
- **Naming**: 
  - PascalCase for components, classes, enums
  - camelCase for variables, functions
  - UPPER_SNAKE_CASE for constants

### Architecture Patterns

- **Backend**: Route handlers registered in `src/app/index.ts`, each route file exports a `register*Routes` function
- **Frontend**: Functional React components with hooks, Zustand for state
- **Game Logic**: Separated into `src/game/` with models, screens, and systems
- **WebSocket**: Socket.IO for real-time game events (travel, combat, encounters)

### Testing Practices

- **Unit Tests**: Vitest for isolated logic testing
- **Integration Tests**: Test route handlers and game systems together
- **E2E Tests**: Playwright for full user flow testing
- **Test Files**: `*.test.ts` in `tests/` directory

### Git & Commits

- Standard Git workflow
- Commit messages should be clear and focused on "why" over "what"

## Key Technologies

| Category | Technology |
|----------|------------|
| Frontend | React 18, TypeScript, TailwindCSS, xterm.js, Zustand |
| Backend | Fastify, TypeScript, Socket.IO |
| Database | PostgreSQL, Prisma ORM |
| Cache/Queue | Redis, Bull |
| Testing | Vitest, Playwright |
| Build | Vite 5, TypeScript |
| Deployment | Docker, Docker Compose |

## API Documentation

When running, access OpenAPI/Swagger docs at:
- **Local**: http://localhost:3000/docs
- **Production**: https://your-domain.com/docs

## Game Features

- **8 Star Systems**: 14 Core, 6 Rim, 6 Andromeda, 2 Special locations
- **Rank System**: 9 ranks from Lieutenant to Giga Hero
- **4 Alliances**: Astro League, Space Dragons, Warlord Confed, Rebel Alliance
- **Ship Components**: 8 upgradable systems (Hull, Drives, Weapons, Shields, etc.)
- **Special Equipment**: Cloaker, Auto-Repair, Star Buster, Arch Angel, Astraxial Hull
- **Economy**: Trading, fuel, port ownership, gambling
- **Combat**: Turn-based battles against NPCs and players
- **Missions**: Patrol, smuggling, nemesis, rescue operations
- **Dueling Arena**: Player vs player combat

## Database Schema

The Prisma schema defines:
- **User/Session**: OAuth authentication
- **Character**: Player progression, stats, state
- **Ship**: Components, equipment, resources
- **StarSystem**: 28 systems with dynamic ownership
- **NpcRoster**: 65+ persistent NPCs
- **Combat/Battle**: Battle records and live sessions
- **Alliance**: Membership, systems, bulletin boards
- **PortOwnership**: Player-owned space ports
- **GameLog**: Event logging

## Deployment

See `DEPLOY.md` for detailed Railway deployment instructions.

### Quick Deploy

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login and initialize
railway login
railway init

# Add services
railway add --plugin postgresql
railway add --plugin redis

# Deploy
railway up
```
