# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SpacerQuest v4.0 is a modern web rewrite of a classic 1991 Apple II BBS space trading/combat game. The goal is to preserve original gameplay mechanics exactly while modernizing the delivery platform.

**Working directory for all commands:** `spacerquest-web/`

## Commands

```bash
# Development
npm run dev              # Start both server (port 3000) and client (port 5173)
npm run dev:server       # Fastify backend only
npm run dev:client       # Vite frontend only

# Build
npm run build            # Build both backend (tsc → dist/app/) and frontend (Vite → dist/public/)

# Database
npm run db:generate      # Generate Prisma client after schema changes
npm run db:push          # Sync schema to DB (dev only)
npm run db:migrate       # Create and apply migrations
npm run db:seed          # Seed star systems and initial game data

# Testing
npm run test             # Vitest unit tests
npm run test:watch       # Vitest in watch mode
npm run test:coverage    # Coverage report
npm run test:e2e         # Playwright end-to-end tests (Chromium only)
npm run test:e2e:ui      # E2E with interactive UI
npm run test:e2e:debug   # E2E with debugger

# Lint
npm run lint             # ESLint on src/

# Workers & Production
npm run worker           # Long-running Bull queue processor
npm run worker:once      # Process queued jobs once and exit
npm run start            # Production server

# Docker
npm run docker:up        # Start full stack (app, postgres:15, redis:7, worker)
npm run docker:down      # Stop services
```

## Architecture

### Repository Layout

```
SpacerQuest/           ← project root (docs, OG source files)
└── spacerquest-web/   ← all runnable code lives here
    ├── src/
    │   ├── app/           # Fastify HTTP server + API routes
    │   ├── frontend/      # React 18 SPA (xterm.js terminal UI)
    │   ├── game/          # Core game logic (stateless)
    │   │   ├── constants.ts   # All balance values (credits, ranks, prices)
    │   │   ├── systems/       # Game mechanics (travel, combat, economy, etc.)
    │   │   └── screens/       # Server-side terminal screen renderers
    │   ├── sockets/       # WebSocket handlers + screen router
    │   ├── jobs/          # Bull queue workers
    │   └── db/            # Prisma client singleton
    ├── prisma/
    │   ├── schema.prisma  # DB schema (User, Character, Ship, StarSystem, etc.)
    │   └── seed.ts        # Star system + initial data seed
    └── tests/
        ├── core.test.ts   # Vitest unit tests
        └── e2e/           # Playwright specs (numbered 01–xx flow order)
```

### Data Flow

The game runs as a **terminal emulator over WebSocket**:

1. Browser loads React SPA with an xterm.js terminal
2. On login, a WebSocket connects to `src/sockets/game.ts`
3. Player keypresses are sent to the server
4. The server runs the appropriate screen renderer (`src/game/screens/`) and streams ANSI output back
5. HTTP REST routes (`src/app/routes/`) handle mutations (navigation, combat, economy, ship upgrades)

### Key Architectural Boundaries

- **`src/game/systems/`** — Pure game logic, no I/O. All balance formulas from the original game are preserved here with original variable names (e.g., `d1` = drive strength). Do not change these without verifying against the original.
- **`src/game/screens/`** — Server-side renderers that produce 80×24 ANSI terminal output. These map directly to original BBS screens.
- **`src/sockets/screen-router.ts`** — Routes keypress events to the correct screen handler.
- **`src/app/routes/`** — REST API; validates input, calls game systems, persists via Prisma.

### Database (Prisma + PostgreSQL)

Key models: `User`, `Character`, `Ship` (8 components), `StarSystem` (28 systems: 14 core, 6 rim, 6 Andromeda, 2 special), `PortOwnership`, `AllianceMembership`, `AllianceSystem`, `TravelState`, `BattleRecord`, `DuelEntry`, `GameLog`.

Run `npm run db:generate` whenever `prisma/schema.prisma` changes.

### Frontend State

Zustand is used for global client state (`src/frontend/store/`). Socket.io handles real-time updates (travel progress, combat rounds).

### TypeScript Config

`strict: false` — do not enable strict mode without coordinating with the team. Target is ES2022.

## Game Preservation Constraint

Original gameplay values (fuel costs, combat formulas, distance calculations, credit amounts, rank thresholds) must not change without explicit intent. When in doubt, cross-reference `PRD.md` and `USERS-MANUAL.md` in the project root, or the original Apple II source in `og/sq/`.
