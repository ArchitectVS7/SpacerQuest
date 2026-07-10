/**
 * SpacerQuest v4.0 - Worker Event Publisher
 *
 * Publishes game events to Redis pub/sub so the main server
 * can forward them to connected clients via Socket.IO.
 */

import type Redis from 'ioredis';

let _pub: Redis | null = null;
let _initAttempted = false;

async function getPublisher(): Promise<Redis | null> {
  if (_pub) return _pub;
  if (_initAttempted) return null;
  _initAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    const { default: RedisClient } = await import('ioredis');
    _pub = new RedisClient(redisUrl);
    return _pub;
  } catch {
    return null;
  }
}

export async function publishDailyTick(summary: {
  tripsReset: number;
  portsProcessed: number;
  promotionsGranted: number;
  newsGenerated: string[];
}): Promise<void> {
  const pub = await getPublisher();
  if (!pub) return;
  await pub.publish('game:daily-tick', JSON.stringify(summary));
}

export async function publishWorldEvent(event: {
  type: string;
  message: string;
  characterId?: string;
}): Promise<void> {
  const pub = await getPublisher();
  if (!pub) return;
  await pub.publish('game:world-event', JSON.stringify(event));
}
