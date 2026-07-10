/**
 * SpacerQuest v4.0 - Route Integration Tests
 *
 * Tests API route handlers using Fastify's inject() method.
 * These tests verify input validation, auth guards, and response shapes
 * without requiring a running database.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { requireAuth } from '../src/app/middleware/auth';

// ============================================================================
// HELPERS
// ============================================================================

async function buildTestApp() {
  const app = Fastify({ logger: false });
  await app.register(jwt, { secret: 'test-secret' });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  return app;
}

function signToken(app: any, payload: object) {
  return app.jwt.sign(payload);
}

// ============================================================================
// AUTH MIDDLEWARE TESTS
// ============================================================================

describe('requireAuth middleware', () => {
  let app: any;

  beforeAll(async () => {
    app = await buildTestApp();

    // Protected test route
    app.get('/test/protected', {
      preValidation: [requireAuth],
    }, async (request: any) => {
      const { userId } = request.user as { userId: string };
      return { userId };
    });

    await app.ready();
  });

  it('returns 401 without auth header', async () => {
    const res = await app.inject({ method: 'GET', url: '/test/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('Unauthorized');
  });

  it('returns 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: 'Bearer invalid-token' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with valid JWT', async () => {
    const token = signToken(app, { userId: 'user-123' });
    const res = await app.inject({
      method: 'GET',
      url: '/test/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe('user-123');
  });
});

// ============================================================================
// INPUT VALIDATION INTEGRATION TESTS
// ============================================================================

describe('Route input validation', () => {
  let app: any;
  let token: string;

  beforeAll(async () => {
    app = await buildTestApp();

    // Simulate a fuel/buy route with Zod validation
    const { fuelBody } = await import('../src/app/schemas');

    app.post('/test/fuel/buy', {
      preValidation: [requireAuth],
    }, async (request: any, reply: any) => {
      const body = fuelBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
      }
      return { success: true, units: body.data.units };
    });

    // Simulate a launch route with Zod validation
    const { launchBody } = await import('../src/app/schemas');

    app.post('/test/launch', {
      preValidation: [requireAuth],
    }, async (request: any, reply: any) => {
      const body = launchBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
      }
      return { success: true, destination: body.data.destinationSystemId };
    });

    // Simulate a combat action route
    const { combatActionBody } = await import('../src/app/schemas');

    app.post('/test/combat/action', {
      preValidation: [requireAuth],
    }, async (request: any, reply: any) => {
      const body = combatActionBody.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.issues[0]?.message || 'Invalid input' });
      }
      return { success: true, action: body.data.action };
    });

    await app.ready();
    token = signToken(app, { userId: 'user-123' });
  });

  describe('fuel/buy validation', () => {
    it('accepts valid fuel purchase', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        headers: { authorization: `Bearer ${token}` },
        payload: { units: 50 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().units).toBe(50);
    });

    it('rejects zero units', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        headers: { authorization: `Bearer ${token}` },
        payload: { units: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects negative units', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        headers: { authorization: `Bearer ${token}` },
        payload: { units: -10 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects missing body', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects non-numeric units', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        headers: { authorization: `Bearer ${token}` },
        payload: { units: 'lots' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/fuel/buy',
        payload: { units: 50 },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('launch validation', () => {
    it('accepts valid destination', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/launch',
        headers: { authorization: `Bearer ${token}` },
        payload: { destinationSystemId: 5 },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().destination).toBe(5);
    });

    it('rejects destination 0', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/launch',
        headers: { authorization: `Bearer ${token}` },
        payload: { destinationSystemId: 0 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects destination 29', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/launch',
        headers: { authorization: `Bearer ${token}` },
        payload: { destinationSystemId: 29 },
      });
      expect(res.statusCode).toBe(400);
    });

    it('accepts destination with cargo contract', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/launch',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          destinationSystemId: 10,
          cargoContract: { pods: 5, type: 1, payment: 5000 },
        },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('combat action validation', () => {
    it('accepts FIRE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/combat/action',
        headers: { authorization: `Bearer ${token}` },
        payload: { action: 'FIRE' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().action).toBe('FIRE');
    });

    it('accepts RETREAT', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/combat/action',
        headers: { authorization: `Bearer ${token}` },
        payload: { action: 'RETREAT' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('rejects invalid action', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/test/combat/action',
        headers: { authorization: `Bearer ${token}` },
        payload: { action: 'FLEE' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});

// ============================================================================
// RATE LIMITING TESTS
// ============================================================================

describe('Rate limiting', () => {
  it('enforces per-route rate limits', async () => {
    const app = await buildTestApp();

    app.get('/test/limited', {
      config: { rateLimit: { max: 2, timeWindow: '1 minute' } },
    }, async () => {
      return { ok: true };
    });

    await app.ready();

    // First two should succeed
    const r1 = await app.inject({ method: 'GET', url: '/test/limited' });
    expect(r1.statusCode).toBe(200);

    const r2 = await app.inject({ method: 'GET', url: '/test/limited' });
    expect(r2.statusCode).toBe(200);

    // Third should be rate limited
    const r3 = await app.inject({ method: 'GET', url: '/test/limited' });
    expect(r3.statusCode).toBe(429);
  });
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

describe('Health check endpoint', () => {
  it('returns status ok', async () => {
    const app = await buildTestApp();

    app.get('/health', async () => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '4.0.0',
    }));

    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('4.0.0');
    expect(body.timestamp).toBeDefined();
  });
});
