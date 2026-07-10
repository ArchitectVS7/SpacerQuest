/**
 * SpacerQuest v4.0 - Ship and Combat E2E Tests (strict)
 *
 * PRD values asserted:
 *   - Ship has exactly 8 components: Hull, Drives, Weapons, Shields,
 *     Life Support, Navigation, Robotics, Cabin
 *   - HULL upgrade costs 10,000 cr — new character can't afford it
 *   - Combat engage returns consistent structure
 *   - RETREAT action returns retreated + message
 *   - FIRE action returns CombatRound with playerDamage, enemyDamage
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

const EXPECTED_COMPONENTS = [
  'Hull', 'Drives', 'Cabin', 'Life Support',
  'Weapons', 'Navigation', 'Robotics', 'Shields',
];

test.describe('Ship Status', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('GET /api/ship/status returns 200 with shipName, components, fuel, specialEquipment', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.shipName).toBe('string');
    expect(Array.isArray(body.components)).toBe(true);
    expect(typeof body.fuel).toBe('number');
    expect(Array.isArray(body.specialEquipment)).toBe(true);
  });

  test('ship has exactly 8 components', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.components.length).toBe(8);
  });

  test('each component has name, strength (number), condition (0-9)', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const comp of body.components) {
      expect(typeof comp.name).toBe('string');
      expect(comp.name.length).toBeGreaterThan(0);
      expect(typeof comp.strength).toBe('number');
      expect(comp.strength).toBeGreaterThanOrEqual(0);
      expect(typeof comp.condition).toBe('number');
      expect(comp.condition).toBeGreaterThanOrEqual(0);
      expect(comp.condition).toBeLessThanOrEqual(9);
    }
  });

  test('all 8 expected component names are present', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const names: string[] = body.components.map((c: any) => c.name);
    for (const expected of EXPECTED_COMPONENTS) {
      expect(names).toContain(expected);
    }
  });

  test('GET /api/ship/status without token returns 401', async ({ request }) => {
    const res = await request.get(`${API}/api/ship/status`);
    expect(res.status()).toBe(401);
  });
});

test.describe('Ship Upgrade', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('upgrading HULL (10,000 cr) with 1,000 starting credits returns 400 with error', async ({ request }) => {
    const res = await request.post(`${API}/api/ship/upgrade`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { component: 'HULL', upgradeType: 'STRENGTH' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('upgrading ROBOTICS (4,000 cr) with 1,000 starting credits returns 400 with error', async ({ request }) => {
    const res = await request.post(`${API}/api/ship/upgrade`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { component: 'ROBOTICS', upgradeType: 'STRENGTH' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  test('repair endpoint returns 200 or 400 (never 500)', async ({ request }) => {
    const res = await request.post(`${API}/api/ship/repair`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([200, 400]).toContain(res.status());
  });
});

test.describe('Combat', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('POST /api/combat/engage returns 200 with encounter boolean', async ({ request }) => {
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
  });

  test('when encounter=true, enemy and playerBattleFactor are present', async ({ request }) => {
    // Try a few times to get an encounter (30% base chance)
    for (let i = 0; i < 5; i++) {
      const res = await request.post(`${API}/api/combat/engage`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data: { attack: true },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      if (body.encounter) {
        expect(typeof body.playerBattleFactor).toBe('number');
        expect(body.playerBattleFactor).toBeGreaterThanOrEqual(0);
        expect(body.enemy).toBeDefined();
        expect(typeof body.enemy.type).toBe('string');
        expect(typeof body.enemy.battleFactor).toBe('number');
        break;
      }
    }
  });

  test('combat action FIRE returns combat round with playerDamage and enemyDamage', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/action`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { action: 'FIRE', round: 1 },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.playerDamage).toBe('number');
    expect(typeof body.enemyDamage).toBe('number');
    expect(typeof body.battleAdvantage).toBe('string');
    expect(Array.isArray(body.combatLog)).toBe(true);
  });

  test('combat action RETREAT returns retreated boolean and message string', async ({ request }) => {
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

  test('combat engage without token returns 401', async ({ request }) => {
    const res = await request.post(`${API}/api/combat/engage`, {
      data: { attack: true },
    });
    expect(res.status()).toBe(401);
  });
});
