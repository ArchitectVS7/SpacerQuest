/**
 * SpacerQuest v4.0 - Worker → Socket Bridge
 *
 * Subscribes to Redis pub/sub channels published by background jobs
 * and forwards them as Socket.IO events to connected clients.
 */

import { Server as SocketIOServer } from 'socket.io';
import { FastifyInstance } from 'fastify';

/**
 * Subscribe to worker events via Redis pub/sub and relay to Socket.IO rooms.
 */
export function subscribeToWorkerEvents(io: SocketIOServer, fastify: FastifyInstance): void {
  // Only subscribe if Redis is configured
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    fastify.log.info('No REDIS_URL configured — worker event bridge disabled');
    return;
  }

  import('ioredis').then(({ default: Redis }) => {
    const sub = new Redis(redisUrl);

    sub.subscribe('game:daily-tick', 'game:world-event', (err, count) => {
      if (err) {
        fastify.log.error(err, 'Failed to subscribe to worker channels');
        return;
      }
      fastify.log.info(`Worker bridge subscribed to ${count} Redis channels`);
    });

    sub.on('message', (channel: string, message: string) => {
      try {
        const payload = JSON.parse(message);

        if (channel === 'game:daily-tick') {
          // Broadcast daily tick summary to all connected clients
          io.emit('daily:tick', payload);
        } else if (channel === 'game:world-event') {
          // Targeted event — send to specific character room if characterId present
          if (payload.characterId) {
            io.to(`character:${payload.characterId}`).emit('encounter', payload);
          } else {
            io.emit('encounter', payload);
          }
        }
      } catch (parseErr) {
        fastify.log.error(parseErr, 'Failed to parse worker event');
      }
    });

    // Clean up on server close
    fastify.addHook('onClose', async () => {
      await sub.unsubscribe();
      await sub.quit();
    });
  }).catch((err) => {
    fastify.log.warn(err, 'ioredis not available — worker bridge disabled');
  });
}
