/**
 * SpacerQuest v4.0 - WebSocket Game Handler
 * 
 * Real-time game events via Socket.io
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { Socket } from 'socket.io';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  characterId?: string;
}

export async function registerWebSocketHandler(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, async (connection, req) => {
    const socket = connection as AuthenticatedSocket;
    
    fastify.log.info('WebSocket client connected');
    
    // Handle authentication
    socket.on('authenticate', async (data: { token: string }) => {
      try {
        const decoded = fastify.jwt.verify(data.token) as { userId: string };
        socket.userId = decoded.userId;
        
        // Get character ID
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();
        
        const character = await prisma.character.findFirst({
          where: { userId: decoded.userId },
        });
        
        if (character) {
          socket.characterId = character.id;
          socket.join(`character:${character.id}`);
        }
        
        await prisma.$disconnect();
        
        socket.emit('authenticated', { success: true });
        fastify.log.info(`WebSocket authenticated for user ${decoded.userId}`);
      } catch (err) {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    });
    
    // Request travel progress
    socket.on('request:travel-progress', async () => {
      if (!socket.characterId) return;
      
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      
      const travelState = await prisma.travelState.findUnique({
        where: { characterId: socket.characterId },
      });
      
      await prisma.$disconnect();
      
      if (travelState && travelState.inTransit) {
        const now = new Date();
        const totalDuration = travelState.expectedArrival.getTime() - travelState.departureTime.getTime();
        const elapsed = now.getTime() - travelState.departureTime.getTime();
        const progress = Math.min(100, Math.floor((elapsed / totalDuration) * 100));
        const timeRemaining = Math.max(0, Math.floor((travelState.expectedArrival.getTime() - now.getTime()) / 1000));
        
        socket.emit('travel:progress', {
          inTransit: true,
          progress,
          timeRemaining,
          origin: travelState.originSystem,
          destination: travelState.destinationSystem,
        });
      } else {
        socket.emit('travel:progress', { inTransit: false });
      }
    });
    
    // Combat action
    socket.on('combat:action', async (data: { action: string }) => {
      if (!socket.characterId) return;
      
      // Emit combat round result (actual logic in HTTP API)
      socket.emit('combat:round', {
        round: 1,
        combatLog: [`Action: ${data.action}`],
      });
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
      fastify.log.info('WebSocket client disconnected');
    });
    
    // Send initial greeting
    socket.emit('welcome', {
      message: 'Welcome to SpacerQuest v4.0',
      version: '4.0.0',
    });
  });
  
  // Broadcast function for game events
  fastify.decorate('broadcastGameEvent', async (
    characterId: string,
    eventType: string,
    data: any
  ) => {
    const io = fastify.io;
    io.to(`character:${characterId}`).emit(eventType, data);
  });
}
