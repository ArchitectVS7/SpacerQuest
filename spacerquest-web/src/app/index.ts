/**
 * SpacerQuest v4.0 - Main Application Server
 *
 * Fastify-based API server with WebSocket support
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { join } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { Server as SocketIOServer } from 'socket.io';

// Import routes
import { registerAuthRoutes } from './routes/auth.js';
import { registerCharacterRoutes } from './routes/character.js';
import { registerNavigationRoutes } from './routes/navigation.js';
import { registerCombatRoutes } from './routes/combat.js';
import { registerEconomyRoutes } from './routes/economy.js';
import { registerShipRoutes } from './routes/ship.js';
import { registerSocialRoutes } from './routes/social.js';
import { registerMissionsRoutes } from './routes/missions.js';

// Import WebSocket handler
import { registerWebSocketHandler } from '../sockets/game.js';

// Load environment
import dotenv from 'dotenv';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// ============================================================================
// SERVER CONFIGURATION
// ============================================================================

const fastify = Fastify({
  logger: pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    } : undefined,
  }),
});

// ============================================================================
// PLUGINS
// ============================================================================

async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: process.env.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  // JWT
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
    sign: {
      expiresIn: '30d',
    },
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  // (WebSocket via Socket.IO is initialized elsewhere)

  // Static files (for frontend) - only in production
  if (process.env.NODE_ENV === 'production') {
    const fastifyStatic = await import('@fastify/static');
    await fastify.register(fastifyStatic.default, {
      root: join(__dirname, '../../public'),
      prefix: '/',
    });
  }
}

await registerPlugins();

// ============================================================================
// HEALTH CHECK
// ============================================================================

fastify.get('/health', async () => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '4.0.0',
  };
});

// ============================================================================
// ROUTES
// ============================================================================

// Authentication
await registerAuthRoutes(fastify);

// Character management
await registerCharacterRoutes(fastify);

// Navigation & Travel
await registerNavigationRoutes(fastify);

// Combat
await registerCombatRoutes(fastify);

// Economy (trading, ports, fuel)
await registerEconomyRoutes(fastify);

// Ship management (upgrades, repairs)
await registerShipRoutes(fastify);

// Social (directory, rankings, duels)
await registerSocialRoutes(fastify);

// Missions (Endgame)
await registerMissionsRoutes(fastify);

// ============================================================================
// WEBSOCKET
// ============================================================================

// We initialize websockets in the start() function.

// ============================================================================
// ERROR HANDLING
// ============================================================================

fastify.setErrorHandler((error, _request, reply) => {
  fastify.log.error(error);

  reply.status(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
    statusCode: error.statusCode || 500,
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const start = async () => {
  const host = process.env.HOST || '0.0.0.0';
  const port = parseInt(process.env.PORT || '3000');

  try {
    const io = new SocketIOServer(fastify.server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' ? false : true,
        credentials: true,
      },
    });
    registerWebSocketHandler(io, fastify);

    await fastify.listen({ port, host });
    fastify.log.info(`🚀 SpacerQuest v4.0 server running at http://${host}:${port}`);
    fastify.log.info(`📡 WebSocket endpoint: ws://${host}:${port}/ws`);
    fastify.log.info(`🏥 Health check: http://${host}:${port}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

export default fastify;
