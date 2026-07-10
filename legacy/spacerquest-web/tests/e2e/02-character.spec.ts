/**
 * SpacerQuest v4.0 - Character Creation E2E Tests (strict)
 *
 * PRD values asserted:
 *   - Starting rank: LIEUTENANT
 *   - Starting system: 1 (Sun-3)
 *   - Starting credits: creditsLow=1000, creditsHigh=0
 *   - Ship has exactly 8 components
 *   - Name length: 3-15 chars
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken } from './helpers';

const EXPECTED_COMPONENTS = [
  'Hull', 'Drives', 'Cabin', 'Life Support',
  'Weapons', 'Navigation', 'Robotics', 'Shields',
];

test.describe('Character Creation', () => {
  let token: string;
  let createdName: string;
  let createdShipName: string;

  test.beforeAll(async ({ request }) => {
    // Fresh user with no character
    token = await getAuthToken(request);
    const ts = Date.now().toString();
    createdName = `T${ts}`.slice(0, 15);
    createdShipName = `S${ts}`.slice(0, 15);
  });

  test('fresh user has hasCharacter: false', async ({ request }) => {
    const res = await request.get(`${API}/auth/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.hasCharacter).toBe(false);
    expect(body.character).toBeNull();
  });

  test('create character with valid name returns 201 with id, name, shipName', async ({ request }) => {
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { name: createdName, shipName: createdShipName },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    expect(body.name).toBe(createdName);
    expect(body.shipName).toBe(createdShipName);
  });

  test('character has PRD starting values: LIEUTENANT, system 1, 1000 credits', async ({ request }) => {
    const res = await request.get(`${API}/api/character`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const char = body.character;
    expect(char.rank).toBe('LIEUTENANT');
    expect(char.currentSystem).toBe(1);
    expect(char.creditsHigh).toBe(0);
    expect(char.creditsLow).toBe(1000);
  });

  test('ship has exactly 8 components', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.components.length).toBe(8);
  });

  test('ship components have the correct names', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const names: string[] = body.components.map((c: any) => c.name);
    for (const expected of EXPECTED_COMPONENTS) {
      expect(names).toContain(expected);
    }
  });

  test('all component strength values are numbers >= 0', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const comp of body.components) {
      expect(typeof comp.strength).toBe('number');
      expect(comp.strength).toBeGreaterThanOrEqual(0);
    }
  });

  test('all component condition values are 0-9', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const comp of body.components) {
      expect(comp.condition).toBeGreaterThanOrEqual(0);
      expect(comp.condition).toBeLessThanOrEqual(9);
    }
  });

  test('create when character already exists returns 400', async ({ request }) => {
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { name: 'Another', shipName: 'Another' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('name too short (2 chars) returns 400', async ({ request }) => {
    const freshToken = await getAuthToken(request);
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${freshToken}`,
        'Content-Type': 'application/json',
      },
      data: { name: 'AB', shipName: 'GoodShip' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('name too long (16 chars) returns 400', async ({ request }) => {
    const freshToken = await getAuthToken(request);
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${freshToken}`,
        'Content-Type': 'application/json',
      },
      data: { name: 'A'.repeat(16), shipName: 'GoodShip' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});
