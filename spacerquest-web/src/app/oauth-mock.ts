/**
 * SpacerQuest v4.0 - OAuth Mock Service
 * 
 * Mock OAuth provider for development and testing
 * Simulates BBS Portal OAuth flow
 */

import { FastifyInstance } from 'fastify';

export async function registerOAuthMock(fastify: FastifyInstance) {
  // Mock OAuth authorization endpoint
  fastify.get('/auth/mock/authorize', async (request, reply) => {
    const { redirect_uri, client_id, state } = request.query as {
      redirect_uri: string;
      client_id: string;
      state?: string;
    };

    fastify.log.info(`[OAuth Mock] Authorize request from ${client_id}`);

    // Redirect back with mock authorization code
    const mockCode = `mock-auth-code-${Date.now()}`;
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set('code', mockCode);
    if (state) {
      redirectUrl.searchParams.set('state', state);
    }

    return reply.redirect(redirectUrl.toString());
  });

  // Mock OAuth token endpoint
  fastify.post('/auth/mock/token', async (request, reply) => {
    const body = request.body as any;
    
    fastify.log.info('[OAuth Mock] Token exchange request');

    // Return mock access token
    return reply.send({
      access_token: `mock-access-token-${Date.now()}`,
      token_type: 'Bearer',
      expires_in: 2592000, // 30 days
      refresh_token: `mock-refresh-token-${Date.now()}`,
      scope: 'profile email',
    });
  });

  // Mock OAuth userinfo endpoint
  fastify.get('/auth/mock/userinfo', async (request, reply) => {
    // Return mock user info
    return reply.send({
      id: 'mock-user-id',
      email: 'test@bbs-portal.example.com',
      displayName: 'Test Spacer',
      verified: true,
    });
  });

  fastify.log.info('[OAuth Mock] Mock OAuth service registered');
}
