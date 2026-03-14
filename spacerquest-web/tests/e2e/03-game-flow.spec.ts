/**
 * SpacerQuest v4.0 - Game Flow E2E Tests (sequential, strict)
 *
 * Tests the core game loop with a fresh character.
 * Runs in strict sequence; each test builds on the previous state.
 *
 * PRD values asserted:
 *   - Fuel price at system 1: 8 cr/unit
 *   - Fuel sell rate: 50% of buy price = 4 cr/unit at system 1
 *   - New character: 1000 credits, 0 fuel, system 1
 *   - Launch requires functional drives, life support, navigation
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

test.describe('Game Flow (sequential)', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('buy 100 fuel at system 1: cost=800, fuelPrice=8', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 100 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.units).toBe(100);
    expect(body.cost).toBe(800);   // 100 * 8 = 800
    expect(body.fuelPrice).toBe(8);
  });

  test('ship fuel increased to 100 after buying', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fuel).toBe(100);
  });

  test('credits reduced to 200 after buying 100 fuel at 8 cr', async ({ request }) => {
    const res = await request.get(`${API}/api/character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Started with 1000, spent 800: 200 remaining (creditsHigh=0, creditsLow=200)
    const totalCredits = body.character.creditsHigh * 10000 + body.character.creditsLow;
    expect(totalCredits).toBe(200);
  });

  test('sell 50 fuel at system 1: proceeds=200 (50% of 8 = 4 cr/unit)', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/sell`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 50 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.units).toBe(50);
    expect(body.proceeds).toBe(200); // 50 * 8 * 0.5 = 200
  });

  test('ship fuel reduced to 50 after selling', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fuel).toBe(50);
  });

  test('cargo accept fails with 400 for new character with 0 pods', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/cargo/accept`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // New ship has 0 cargo pods
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('GET /api/navigation/travel-status returns inTransit: false when not traveling', async ({ request }) => {
    const res = await request.get(`${API}/api/navigation/travel-status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.inTransit).toBe(false);
  });

  test('launch fails 400 for new character with no drives/life support/navigation', async ({ request }) => {
    const res = await request.post(`${API}/api/navigation/launch`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { destinationSystemId: 2 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    // Details array should list specific errors
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  test('combat engage returns encounter boolean and player battle factor', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/engage`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { attack: true },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.encounter).toBe('boolean');
    if (body.encounter) {
      expect(typeof body.playerBattleFactor).toBe('number');
      expect(body.enemy).toBeDefined();
      expect(typeof body.enemy.battleFactor).toBe('number');
    }
  });

  test('combat action RETREAT returns retreated boolean and message', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/action`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'RETREAT' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.retreated).toBe('boolean');
    expect(typeof body.message).toBe('string');
  });
});
