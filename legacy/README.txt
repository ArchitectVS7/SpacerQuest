____________________________________________
|                                            |
|                                            |
|         |                 S                |
|         ^                   P              |
|        /|\                    A            |
|       <|||>                     C          |
|        [_]                Q       E        |
|        |-|                  U       R      |
|        |_|                    E            |
|       /|||\                     S          |
|      / ||| \                      T        |
|     /  |||  \                              |
|    /   |||   \          Presented by       |
|   /____[|]____\                            |
|        ]^[         The Den of The Firefox  |
|                                            |
| Version 3.4 - Written by Firefox 05/25/91  |
| Modified by Computist BBS (Dave Goforth)   |
| Version 4.0 - Converted by VS7 and Claude  |
|____________________________________________|

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

---

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
- **BBS**: The Den of The Firefox 

## License

This is a preservation project. Original game copyright belongs to Firefox (1991).

## Credits

- Original game by Firefox
- Modern rewrite for BBS Museum
- Preserving classic BBS gaming history

