# SpacerQuest v4.0 - Web Museum Edition

A classic BBS space trading and combat game, modernized for the web.

## Overview

SpacerQuest is a persistent multi-player space simulation game originally written in 1991 by Firefox for the Apple II GBBS system. This modern rewrite preserves the authentic gameplay while running on modern web technology.

## Features

- 🚀 **Authentic Gameplay** - All original formulas, prices, and mechanics preserved
- 🎮 **Terminal Interface** - Classic 80x24 ASCII display via xterm.js
- 🌌 **20+ Star Systems** - Milky Way, Rim Stars, and Andromeda galaxies
- ⚔️ **Space Combat** - Turn-based battles with battle factor calculations
- 💰 **Economic System** - Trade cargo, own space ports, set fuel prices
- 🏆 **Rank Progression** - 9 ranks from Lieutenant to Giga Hero
- 🤝 **Alliances** - Join one of 4 factions
- 🎲 **Mini-Games** - Wheel of Fortune and Spacer's Dare gambling

## Tech Stack

- **Backend**: Node.js 20 + Fastify + TypeScript
- **Frontend**: React 18 + xterm.js (terminal emulator)
- **Database**: PostgreSQL 15 + Prisma ORM
- **Cache**: Redis
- **Real-time**: Socket.io
- **Auth**: OAuth 2.0 (BBS Portal integration)

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- pnpm (recommended) or npm

### Installation

```bash
# Clone and install
cd spacerquest-web
pnpm install

# Copy environment
cp .env.example .env
# Edit .env with your database credentials

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed initial data
pnpm db:seed

# Start development server
pnpm dev
```

### Docker

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down
```

## Game Commands

### Space Port (Main Menu)

| Key | Action |
|-----|--------|
| B | Alliance Bulletins |
| K | Battles Fought Log |
| V | Visitor Log |
| G | Space News |
| H | Help |
| M | Map |
| N | New Character |
| P | Port Fuel Prices |
| S | Space Heroes |
| L | Launch Control |
| X | Ship Stats |
| Q | Quit |

### Ship Bridge (During Travel)

| Key | Action |
|-----|--------|
| D | Data Banks |
| N | Navigation |
| W | Weapons Status |
| ? | Menu |
| Q | Quit to Port |

## API Endpoints

### Authentication
- `GET /auth/callback` - OAuth callback
- `GET /auth/status` - Check character status
- `POST /auth/character` - Create character
- `POST /auth/logout` - Logout

### Character
- `GET /api/character` - Get character data
- `PUT /api/character/ship-name` - Rename ship
- `PUT /api/character/alliance` - Join alliance

### Navigation
- `POST /api/navigation/launch` - Launch to destination
- `GET /api/navigation/travel-status` - Get travel progress
- `POST /api/navigation/course-change` - Change course
- `POST /api/navigation/arrive` - Complete travel

### Combat
- `POST /api/combat/engage` - Start combat
- `POST /api/combat/action` - Combat action

### Economy
- `POST /api/economy/fuel/buy` - Buy fuel
- `POST /api/economy/fuel/sell` - Sell fuel
- `POST /api/economy/cargo/accept` - Accept cargo contract
- `POST /api/economy/cargo/deliver` - Deliver cargo

### Ship
- `GET /api/ship/status` - Get ship status
- `POST /api/ship/upgrade` - Upgrade component
- `POST /api/ship/repair` - Repair damage

### Social
- `GET /api/social/directory` - Spacer directory
- `GET /api/social/topgun` - Top Gun rankings
- `GET /api/social/leaderboard` - High scores
- `POST /api/duel/challenge` - Challenge to duel

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test:watch
```

## Game Balance

All game values are preserved from the original:

- **Starting Credits**: 1,000 cr (new), 10,000 cr (conqueror)
- **Component Prices**: 4,000-10,000 cr per +10 strength
- **Fuel Prices**: 4-25 cr/unit based on system
- **Rank Thresholds**: 0, 1, 2, 3, 5, 8, 11, 14, 18+ promotions
- **Daily Trip Limit**: 3 trips per day

## Project Structure

```
spacerquest-web/
├── prisma/
│   ├── schema.prisma      # Database schema
│   └── seed.ts            # Seed data
├── src/
│   ├── app/
│   │   ├── index.ts       # Fastify server
│   │   └── routes/        # API routes
│   ├── game/
│   │   ├── constants.ts   # Game balance values
│   │   ├── utils.ts       # Utility functions
│   │   └── systems/       # Game logic
│   │       ├── travel.ts
│   │       ├── combat.ts
│   │       └── economy.ts
│   └── sockets/
│       └── game.ts        # WebSocket handler
├── tests/
│   └── core.test.ts       # Unit tests
└── public/                # Static frontend files
```

## Original Game

- **Author**: Firefox
- **Original Release**: May 25, 1991
- **Platform**: Apple II GBBS
- **BBS**: The Den of The Firefox (209-526-1771)

## License

This is a preservation project. Original game copyright belongs to Firefox (1991).

## Credits

- Original game by Firefox
- Modern rewrite for BBS Museum
- Preserving classic BBS gaming history
