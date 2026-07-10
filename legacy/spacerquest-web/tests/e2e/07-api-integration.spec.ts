/**
 * SpacerQuest v4.0 - API Integration Edge Cases (strict)
 *
 * Tests error handling, authorization, and game-rule enforcement.
 *
 * PRD values asserted:
 *   - NEMESIS_REQUIREMENT_WINS = 500
 *   - ARENA_REQUIREMENTS.ION_CLOUD.trips = 50
 *   - Reserved prefix: 'THE '
 *   - Maligna requires isConqueror flag
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

const PROTECTED_ENDPOINTS = [
  { method: 'GET',  path: '/auth/status' },
  { method: 'GET',  path: '/auth/sessions' },
  { method: 'POST', path: '/auth/logout' },
  { method: 'GET',  path: '/api/character' },
  { method: 'GET',  path: '/api/ship/status' },
  { method: 'POST', path: '/api/ship/upgrade' },
  { method: 'POST', path: '/api/ship/repair' },
  { method: 'POST', path: '/api/economy/fuel/buy' },
  { method: 'POST', path: '/api/economy/fuel/sell' },
  { method: 'POST', path: '/api/economy/cargo/accept' },
  { method: 'POST', path: '/api/economy/cargo/deliver' },
  { method: 'POST', path: '/api/navigation/launch' },
  { method: 'GET',  path: '/api/navigation/travel-status' },
  { method: 'POST', path: '/api/combat/engage' },
  { method: 'POST', path: '/api/combat/action' },
  { method: 'GET',  path: '/api/social/battles' },
  { method: 'POST', path: '/api/missions/nemesis' },
  { method: 'POST', path: '/api/missions/maligna' },
  { method: 'POST', path: '/api/duel/challenge' },
  { method: 'POST', path: '/api/economy/alliance/invest' },
];

test.describe('Authorization — all protected endpoints return 401 without token', () => {
  for (const ep of PROTECTED_ENDPOINTS) {
    test(`${ep.method} ${ep.path} → 401`, async ({ request }) => {
      const res = ep.method === 'GET'
        ? await request.get(`${API}${ep.path}`)
        : await request.post(`${API}${ep.path}`);
      expect(res.status()).toBe(401);
    });
  }
});

test.describe('Character Name Validation', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    // NOTE: no ensureCharacter — we're testing creation behavior
  });

  test('name with reserved prefix "THE " returns 400', async ({ request }) => {
    const res = await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { name: 'THE Player', shipName: 'GoodShip' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('Mission Requirements', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('Nemesis mission with 0 battle wins returns 400 mentioning 500 wins', async ({ request }) => {
    const res = await request.post(`${API}/api/missions/nemesis`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500/);
  });

  test('Maligna mission for non-Conqueror returns 400 mentioning Conqueror', async ({ request }) => {
    const res = await request.post(`${API}/api/missions/maligna`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/[Cc]onqueror/);
  });
});

test.describe('Duel Arena Requirements', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('Ion Cloud arena (type=1) with 0 trips returns 400 mentioning 50 trips', async ({ request }) => {
    const res = await request.post(`${API}/api/duel/challenge`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        stakesType: 'credits',
        stakesAmount: 100,
        arenaType: 1,
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/50/);
  });
});

test.describe('Alliance Invest Requirements', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('invest in alliance without being a member returns 400', async ({ request }) => {
    const res = await request.post(`${API}/api/economy/alliance/invest`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { amount: 1000, type: 'ALLIANCE' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

test.describe('Session Management', () => {
  let token: string;
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    // OAuth callback creates a session record (unlike dev-login)
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('GET /auth/sessions returns sessions array with at least one session', async ({ request }) => {
    const res = await request.get(`${API}/auth/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body.sessions.length).toBeGreaterThan(0);
    sessionId = body.sessions[0].id;
  });

  test('DELETE /auth/sessions/:id revokes the session successfully', async ({ request }) => {
    if (!sessionId) return; // skip if previous test didn't get a session
    const res = await request.delete(`${API}/auth/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toMatch(/[Rr]evoked/);
  });

  test('DELETE /auth/sessions/:id for non-existent session returns success:false', async ({ request }) => {
    const res = await request.delete(`${API}/auth/sessions/nonexistent-id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
