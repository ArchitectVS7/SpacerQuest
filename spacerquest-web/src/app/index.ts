/**
 * SpacerQuest v4.0 - Main Application Server
 * 
 * Fastify-based API server with WebSocket support
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import { join } from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';

// Import routes
import { registerAuthRoutes } from './app/routes/auth.js';
import { registerCharacterRoutes } from './app/routes/character.js';
import { registerNavigationRoutes } from './app/routes/navigation.js';
import { registerCombatRoutes } from './app/routes/combat.js';
import { registerEconomyRoutes } from './app/routes/economy.js';
import { registerShipRoutes } from './app/routes/ship.js';
import { registerSocialRoutes } from './app/routes/social.js';

// Import WebSocket handler
import { registerWebSocketHandler } from './sockets/game.js';

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

// WebSocket
await fastify.register(websocket);

// Static files (for frontend)
await fastify.register(import('@fastify/static'), {
  root: join(__dirname, '../../public'),
  prefix: '/',
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

fastify.get('/health', async (request, reply) => {
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

// ============================================================================
// WEBSOCKET
// ============================================================================

fastify.register(registerWebSocketHandler);

// ============================================================================
// ERROR HANDLING
// ============================================================================

fastify.setErrorHandler((error, request, reply) => {
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
