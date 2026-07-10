/**
 * SpacerQuest v4.0 - Shared E2E Test Helpers
 */

import { APIRequestContext } from '@playwright/test';

export const API = 'http://localhost:3000';

/**
 * Create a fresh user via OAuth mock callback and return their JWT.
 * Each call produces a unique user (different bbsUserId), so test files
 * are fully isolated from one another.
 * Also creates a session record in the DB (unlike dev-login).
 */
export async function getAuthToken(request: APIRequestContext): Promise<string> {
  const code = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request.get(`${API}/auth/callback?code=${code}`, {
    maxRedirects: 0,
  });
  const location = res.headers()['location'];
  if (!location) {
    throw new Error(`No redirect from /auth/callback (status ${res.status()})`);
  }
  const url = new URL(location, API);
  const token = url.searchParams.get('token');
  if (!token) {
    throw new Error('No token parameter in redirect URL');
  }
  return token;
}

/**
 * Ensure the authenticated user has a character.
 * If not, creates one with a unique timestamp-based name.
 */
export async function ensureCharacter(
  request: APIRequestContext,
  token: string
): Promise<void> {
  const statusRes = await request.get(`${API}/auth/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const status = await statusRes.json();

  if (!status.hasCharacter) {
    const ts = Date.now().toString();
    // Names must be 3-15 chars
    const name = `T${ts}`.slice(0, 15);
    const shipName = `S${ts}`.slice(0, 15);
    await request.post(`${API}/auth/character`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: { name, shipName },
    });
  }
}
