/**
 * SpacerQuest v4.0 - WebSocket Game Handler
 * 
 * Real-time game events via Socket.io
 */

import { FastifyInstance } from 'fastify';
import { Socket } from 'socket.io';
import { prisma } from '../db/prisma.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  characterId?: string;
  isAdmin?: boolean;
}

export function registerWebSocketHandler(io: import('socket.io').Server, fastify: FastifyInstance) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    fastify.log.info('WebSocket client connected');
    
    // Handle authentication
    socket.on('authenticate', async (data: { token: string }) => {
      try {
        const decoded = fastify.jwt.verify(data.token) as { userId: string };
        socket.userId = decoded.userId;

        // Look up user admin status
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { isAdmin: true },
        });
        socket.isAdmin = user?.isAdmin ?? false;

        // Get character ID
        const character = await prisma.character.findFirst({
          where: { userId: decoded.userId },
        });
        
        if (character) {
          socket.characterId = character.id;
          socket.join(`character:${character.id}`);
        }
        
        socket.emit('authenticated', { success: true });
        fastify.log.info(`WebSocket authenticated for user ${decoded.userId}`);

        // Automatically send the main menu after successful auth
        if (character) {
          const { handleScreenRequest } = await import('./screen-router.js');
          try {
            const menuResponse = await handleScreenRequest(character.id, 'main-menu');
            socket.emit('screen:render', menuResponse);
          } catch (err) {
            fastify.log.error(err, 'Failed to send initial main menu');
          }
        }
      } catch (err) {
        socket.emit('authenticated', { success: false, error: 'Invalid token' });
      }
    });
    
    // Request travel progress
    socket.on('request:travel-progress', async () => {
      if (!socket.characterId) return;
      
      const travelState = await prisma.travelState.findUnique({
        where: { characterId: socket.characterId },
      });
      
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
    // Enemy data is a partial snapshot sent by the client; cast to Enemy at call sites
    socket.on('combat:action', async (data: { action: 'FIRE' | 'RETREAT' | 'SURRENDER', round?: number, enemy?: Partial<import('../game/systems/combat.js').Enemy> }) => {
      if (!socket.characterId || !socket.userId) return;
      
      const { processCombatRound, calculateBattleFactor, attemptRetreat } = 
        await import('../game/systems/combat.js');
        
      const character = await prisma.character.findFirst({
        where: { id: socket.characterId },
        include: { ship: true },
      });
      
      if (!character || !character.ship) {
        socket.emit('combat:error', { error: 'No ship found' });
        return;
      }
      
      if (data.action === 'RETREAT') {
        const retreat = attemptRetreat(
          (character.ship.driveStrength + (character.ship.hasTransWarpDrive ? 10 : 0)) * character.ship.driveCondition,
          (data.enemy?.driveStrength ?? 10) * (data.enemy?.driveCondition ?? 7) || 100,
          character.ship.hasCloaker
        );
        
        socket.emit('combat:round', {
          success: retreat.success,
          message: retreat.message,
          retreated: retreat.success,
        });
        return;
      }
      
      const playerBF = calculateBattleFactor(
        {
          weaponStrength: character.ship.weaponStrength,
          weaponCondition: character.ship.weaponCondition,
          shieldStrength: character.ship.shieldStrength,
          shieldCondition: character.ship.shieldCondition,
          cabinStrength: character.ship.cabinStrength,
          cabinCondition: character.ship.cabinCondition,
          roboticsStrength: character.ship.roboticsStrength,
          roboticsCondition: character.ship.roboticsCondition,
          lifeSupportStrength: character.ship.lifeSupportStrength,
          lifeSupportCondition: character.ship.lifeSupportCondition,
          navigationStrength: character.ship.navigationStrength,
          navigationCondition: character.ship.navigationCondition,
          driveStrength: character.ship.driveStrength,
          driveCondition: character.ship.driveCondition,
          hasAutoRepair: character.ship.hasAutoRepair,
        },
        character.rank,
        character.battlesWon
      );
      
      const combatRound = processCombatRound(
        playerBF,
        character.ship.weaponStrength,
        character.ship.weaponCondition,
        character.ship.shieldStrength,
        character.ship.shieldCondition,
        character.ship.hasAutoRepair,
        (data.enemy || {
          weaponStrength: 20,
          weaponCondition: 7,
          shieldStrength: 15,
          shieldCondition: 7,
          battleFactor: 200,
        }) as import('../game/systems/combat.js').Enemy,
        data.round || 1
      );
      
      socket.emit('combat:round', combatRound);
    });
    
    // Handle screen request
    socket.on('screen:request', async (data: { screen: string }) => {
      if (!socket.characterId) return;
      const { handleScreenRequest } = await import('./screen-router.js');
      try {
        const response = await handleScreenRequest(socket.characterId, data.screen);
        socket.emit('screen:render', response);
      } catch (err) {
        fastify.log.error(err);
        socket.emit('screen:render', { output: '\x1b[31mScreen error.\x1b[0m\r\n' });
      }
    });

    // Handle screen input
    socket.on('screen:input', async (data: { screen: string, input: string }) => {
      if (!socket.characterId) return;
      const { handleScreenInput } = await import('./screen-router.js');
      try {
        const response = await handleScreenInput(socket.characterId, data.screen, data.input);
        
        // Let the frontend handle the nextScreen transition logic by requesting the screen via useEffect
        socket.emit('screen:render', response);
        
      } catch (err) {
        fastify.log.error(err);
        socket.emit('screen:render', { output: '\x1b[31mInput error.\x1b[0m\r\n' });
      }
    });
    
    // Handle disconnect — resolve active combat sessions
    socket.on('disconnect', async () => {
      fastify.log.info('WebSocket client disconnected');

      if (!socket.characterId) return;

      try {
        // Check for active combat session
        const combatSession = await prisma.combatSession.findFirst({
          where: { characterId: socket.characterId, active: true },
        });

        if (combatSession) {
          const { resolveCombatOnDisconnect, createCombatState } =
            await import('../game/systems/combat-state.js');

          // Build combat state from session record
          const state = createCombatState(
            combatSession.characterId,
            {
              weaponPower: combatSession.playerWeaponPower,
              shieldPower: combatSession.playerShieldPower,
              drivePower: combatSession.playerDrivePower,
              battleFactor: combatSession.playerBattleFactor,
            },
            {
              weaponPower: combatSession.enemyWeaponPower,
              shieldPower: combatSession.enemyShieldPower,
              drivePower: combatSession.enemyDrivePower,
              battleFactor: combatSession.enemyBattleFactor,
              hullCondition: combatSession.enemyHullCondition,
            },
            combatSession.currentRound
          );

          // Resolve combat server-side
          const resolution = resolveCombatOnDisconnect(state);

          // Persist resolution
          await prisma.combatSession.update({
            where: { id: combatSession.id },
            data: {
              active: false,
              result: resolution.outcome,
              currentRound: resolution.roundsPlayed,
            },
          });

          // Apply combat outcome to character
          if (resolution.outcome === 'DEFEAT') {
            await prisma.character.update({
              where: { id: socket.characterId },
              data: { battlesLost: { increment: 1 } },
            });
          } else if (resolution.outcome === 'VICTORY') {
            await prisma.character.update({
              where: { id: socket.characterId },
              data: { battlesWon: { increment: 1 } },
            });
          }

          fastify.log.info(`Combat resolved on disconnect for ${socket.characterId}: ${resolution.outcome}`);
        }
      } catch (err) {
        fastify.log.error(err, 'Error resolving combat on disconnect');
      }
    });
    
    // Send initial greeting
    socket.emit('welcome', {
      message: 'Welcome to SpacerQuest v4.0',
      version: '4.0.0',
    });
  });
}
