/**
 * SpacerQuest v4.0 - Economy E2E Tests (strict PRD values)
 *
 * PRD values asserted:
 *   - Fuel price at system 1: 8 cr/unit  (FUEL_PRICES_BY_SYSTEM[1] = 8)
 *   - Fuel sell multiplier: 50%          (FUEL_SELL_MULTIPLIER = 0.5)
 *   - Starting credits: 1000
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

test.describe('Economy - Fuel', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('buy 1 unit of fuel at system 1: fuelPrice=8, cost=8', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 1 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.fuelPrice).toBe(8);
    expect(body.cost).toBe(8);
    expect(body.success).toBe(true);
  });

  test('buy 10 more units: cost=80', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 10 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.cost).toBe(80); // 10 * 8 = 80
  });

  test('sell 10 units at system 1: proceeds=40 (50% of 8 = 4 cr/unit)', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/sell`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 10 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.proceeds).toBe(40); // 10 * 8 * 0.5 = 40
    expect(body.success).toBe(true);
  });

  test('buying more fuel than credits allows returns 400 with credits error', async ({ request }) => {
    // After: bought 11 units (88 cr), sold 10 (+40 cr), net: 1000-88+40=952 credits
    // Buying 200 units = 1600 > 952: should fail
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 200 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/credit/i);
  });

  test('selling more fuel than in tank returns 400 with fuel error', async ({ request }) => {
    // After above: tank has 51 units (started 50, bought 11, sold 10)
    // Selling 100 should fail — more than the 51 in tank
    const res = await request.post(`${API}/api/economy/fuel/sell`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { units: 100 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/fuel/i);
  });
});

test.describe('Economy - Cargo', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('accept cargo with 0 pods returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/cargo/accept`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // New ship has 0 cargo pods
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('deliver cargo with no cargo loaded returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/cargo/deliver`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('buy fuel without token returns 401', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/buy`, {
      data: { units: 1 },
    });
    expect(res.status()).toBe(401);
  });

  test('sell fuel without token returns 401', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/fuel/sell`, {
      data: { units: 1 },
    });
    expect(res.status()).toBe(401);
  });
});
