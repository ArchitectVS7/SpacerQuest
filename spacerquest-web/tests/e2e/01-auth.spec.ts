/**
 * SpacerQuest v4.0 - Authentication E2E Tests (strict)
 */

import { test, expect } from '@playwright/test';

const API = 'http://localhost:3000';

function extractToken(location: string): string {
  const url = new URL(location, API);
  const token = url.searchParams.get('token');
  if (!token) throw new Error('No token in redirect URL');
  return token;
}

test.describe('Authentication', () => {
  test('GET /health returns 200 with status ok and version 4.0.0', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('4.0.0');
  });

  test('GET /auth/dev-login returns 302 with token in Location', async ({ request }) => {
    const res = await request.get(`${API}/auth/dev-login`, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    const location = res.headers()['location'];
    expect(location).toBeTruthy();
    expect(location).toContain('token=');
  });

  test('token from dev-login is a 3-segment JWT', async ({ request }) => {
    const res = await request.get(`${API}/auth/dev-login`, { maxRedirects: 0 });
    const token = extractToken(res.headers()['location']);
    // JWT format: header.payload.signature
    const parts = token.split('.');
    expect(parts.length).toBe(3);
    for (const part of parts) {
      expect(part.length).toBeGreaterThan(0);
    }
  });

  test('GET /auth/status with valid token returns 200 with hasCharacter boolean', async ({ request }) => {
    const loginRes = await request.get(`${API}/auth/dev-login`, { maxRedirects: 0 });
    const token = extractToken(loginRes.headers()['location']);

    const res = await request.get(`${API}/auth/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.hasCharacter).toBe('boolean');
  });

  test('GET /auth/status without token returns 401', async ({ request }) => {
    const res = await request.get(`${API}/auth/status`);
    expect(res.status()).toBe(401);
  });

  test('GET /auth/sessions without token returns 401', async ({ request }) => {
    const res = await request.get(`${API}/auth/sessions`);
    expect(res.status()).toBe(401);
  });

  test('GET /auth/sessions with valid token returns 200 with sessions array', async ({ request }) => {
    const loginRes = await request.get(`${API}/auth/dev-login`, { maxRedirects: 0 });
    const token = extractToken(loginRes.headers()['location']);

    const res = await request.get(`${API}/auth/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test('POST /auth/logout with valid token returns 200 success', async ({ request }) => {
    const loginRes = await request.get(`${API}/auth/dev-login`, { maxRedirects: 0 });
    const token = extractToken(loginRes.headers()['location']);

    const res = await request.post(`${API}/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  test('POST /auth/logout without token returns 401', async ({ request }) => {
    const res = await request.post(`${API}/auth/logout`);
    expect(res.status()).toBe(401);
  });
});
