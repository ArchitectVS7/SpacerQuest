/**
 * SpacerQuest v4.0 - Social API E2E Tests (strict)
 *
 * PRD values asserted:
 *   - Top Gun has exactly 12 categories
 *   - Category names match the 12 original categories
 *   - Each category has name, leader, value
 *   - Leaderboard entries have rank, name, score, characterRank
 *   - Directory entries have id, name, shipName, rank, alliance, score
 *   - Battles endpoint requires authentication
 */

import { test, expect } from '@playwright/test';
import { API, getAuthToken, ensureCharacter } from './helpers';

// Expected category name substrings (actual names are longer, e.g. 'Fastest Drives')
const EXPECTED_CATEGORY_KEYWORDS = [
  'Drives', 'Weapons', 'Shields', 'Hull', 'Cabin',
  'Life Support', 'Navigation', 'Robotics', 'Cargo',
  'Rescuer', 'Battle', 'Promotions',
];

test.describe('Top Gun Rankings', () => {
  test('GET /api/social/topgun returns 200 with categories array', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);
  });

  test('Top Gun has exactly 12 categories', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    const body = await res.json();
    expect(body.categories.length).toBe(12);
  });

  test('all 12 expected category keywords are present in category names', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    const body = await res.json();
    const categoryNames: string[] = body.categories.map((c: any) => c.name);

    for (const keyword of EXPECTED_CATEGORY_KEYWORDS) {
      const found = categoryNames.some(name =>
        name.toLowerCase().includes(keyword.toLowerCase())
      );
      expect(found, `Missing category containing "${keyword}"`).toBe(true);
    }
  });

  test('each category has name (string), leader (string), value (number)', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    const body = await res.json();
    for (const cat of body.categories) {
      expect(typeof cat.name).toBe('string');
      expect(cat.name.length).toBeGreaterThan(0);
      // leader is 'N/A' when no holder, otherwise a ship/character name
      expect(typeof cat.leader).toBe('string');
      expect(typeof cat.value).toBe('number');
    }
  });

  test('Top Gun is publicly accessible (no auth required)', async ({ request }) => {
    const res = await request.get(`${API}/api/social/topgun`);
    expect(res.status()).toBe(200);
  });
});

test.describe('Leaderboard', () => {
  test('GET /api/social/leaderboard returns 200 with scores array', async ({ request }) => {
    const res = await request.get(`${API}/api/social/leaderboard`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.scores)).toBe(true);
  });

  test('leaderboard entries have rank, name, score, characterRank', async ({ request }) => {
    const res = await request.get(`${API}/api/social/leaderboard`);
    const body = await res.json();
    for (const entry of body.scores) {
      expect(typeof entry.rank).toBe('number');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.score).toBe('number');
      expect(typeof entry.characterRank).toBe('string');
    }
  });

  test('leaderboard ranks are sequential starting at 1', async ({ request }) => {
    const res = await request.get(`${API}/api/social/leaderboard`);
    const body = await res.json();
    body.scores.forEach((entry: any, idx: number) => {
      expect(entry.rank).toBe(idx + 1);
    });
  });
});

test.describe('Spacer Directory', () => {
  test('GET /api/social/directory returns 200 with spacers array', async ({ request }) => {
    const res = await request.get(`${API}/api/social/directory`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.spacers)).toBe(true);
  });

  test('directory entries have id, name, shipName, rank, alliance, score', async ({ request }) => {
    const res = await request.get(`${API}/api/social/directory`);
    const body = await res.json();
    for (const spacer of body.spacers) {
      expect(spacer.id).toBeDefined();
      expect(typeof spacer.name).toBe('string');
      expect(typeof spacer.shipName).toBe('string');
      expect(typeof spacer.rank).toBe('string');
      // alliance may be null/empty for unaffiliated characters
      expect(spacer).toHaveProperty('alliance');
      expect(typeof spacer.score).toBe('number');
    }
  });
});

test.describe('Battle Log', () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await getAuthToken(request);
    await ensureCharacter(request, token);
  });

  test('GET /api/social/battles without token returns 401', async ({ request }) => {
    const res = await request.get(`${API}/api/social/battles`);
    expect(res.status()).toBe(401);
  });

  test('GET /api/social/battles with token returns 200 with battles array', async ({ request }) => {
    const res = await request.get(`${API}/api/social/battles`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.battles)).toBe(true);
  });
});
