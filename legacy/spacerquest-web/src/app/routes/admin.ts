/**
 * SpacerQuest v4.0 - Admin Routes (SP.EDIT1, SP.EDIT2, SP.EDIT3, SP.SYSOP)
 *
 * Sysop management endpoints: player editing, NPC configuration,
 * battle difficulty tuning, port eviction, and Top Gun rankings.
 */

import { FastifyInstance } from 'fastify';
import { prisma } from '../../db/prisma.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  adminUpdateCharacterBody,
  adminUpdateShipBody,
  adminUpdateNpcBody,
  adminCreateNpcBody,
  adminGameConfigBody,
} from '../schemas.js';
import { getGameConfig, updateGameConfig } from '../../game/systems/game-config.js';
import { getTopGunRankings } from '../../game/systems/topgun.js';

export async function registerAdminRoutes(fastify: FastifyInstance) {
  // ── SP.EDIT1 — Player Editor ──────────────────────────────────────────────

  // List characters (paginated)
  fastify.get('/api/admin/players', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request) => {
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const [characters, total] = await Promise.all([
      prisma.character.findMany({
        select: {
          id: true,
          spacerId: true,
          name: true,
          rank: true,
          creditsHigh: true,
          creditsLow: true,
          currentSystem: true,
          score: true,
          isBot: true,
        },
        orderBy: { spacerId: 'asc' },
        skip,
        take,
      }),
      prisma.character.count(),
    ]);

    return { characters, total, page: Number(page), limit: take };
  });

  // Full character + ship detail
  fastify.get('/api/admin/players/:id', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const character = await prisma.character.findUnique({
      where: { id },
      include: { ship: true, portOwnership: true, allianceMembership: true },
    });

    if (!character) {
      return reply.code(404).send({ error: 'Character not found' });
    }

    return { character };
  });

  // Update character fields
  fastify.put('/api/admin/players/:id', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = adminUpdateCharacterBody.parse(request.body);

    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Character not found' });
    }

    const character = await prisma.character.update({
      where: { id },
      data: body,
    });

    return { character };
  });

  // Update ship fields
  fastify.put('/api/admin/players/:id/ship', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = adminUpdateShipBody.parse(request.body);

    const ship = await prisma.ship.findUnique({ where: { characterId: id } });
    if (!ship) {
      return reply.code(404).send({ error: 'Ship not found for character' });
    }

    const updated = await prisma.ship.update({
      where: { characterId: id },
      data: body,
    });

    return { ship: updated };
  });

  // Reset player to defaults (SP.EDIT1 'D' command)
  fastify.post('/api/admin/players/:id/reset', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.character.findUnique({ where: { id }, include: { ship: true } });
    if (!existing) {
      return reply.code(404).send({ error: 'Character not found' });
    }

    await prisma.character.update({
      where: { id },
      data: {
        creditsHigh: 0, creditsLow: 0,
        bankHigh: 0, bankLow: 0,
        score: 0, currentSystem: 1,
        tripsCompleted: 0, battlesWon: 0, battlesLost: 0,
        rescuesPerformed: 0, astrecsTraveled: 0, cargoDelivered: 0,
        tripCount: 0, rank: 'LIEUTENANT',
        cargoPods: 0, cargoType: 0, cargoPayment: 0, destination: 0,
        cargoManifest: null, missionType: 0,
        isConqueror: false, isLost: false, lostLocation: null,
        extraCurricularMode: null, crimeType: null,
      },
    });

    if (existing.ship) {
      await prisma.ship.update({
        where: { characterId: id },
        data: {
          hullStrength: 10, hullCondition: 5,
          driveStrength: 10, driveCondition: 5,
          cabinStrength: 5, cabinCondition: 5,
          lifeSupportStrength: 5, lifeSupportCondition: 5,
          weaponStrength: 5, weaponCondition: 5,
          navigationStrength: 5, navigationCondition: 5,
          roboticsStrength: 5, roboticsCondition: 5,
          shieldStrength: 5, shieldCondition: 5,
          fuel: 100, cargoPods: 0, maxCargoPods: 0,
          hasCloaker: false, hasAutoRepair: false,
          hasStarBuster: false, hasArchAngel: false,
          isAstraxialHull: false, hasTitaniumHull: false,
          hasTransWarpDrive: false, hasShipGuard: false,
        },
      });
    }

    return { success: true, message: 'Player reset to defaults' };
  });

  // Delete/inactivate player (SP.EDIT1 'I' command)
  fastify.delete('/api/admin/players/:id', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.character.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'Character not found' });
    }

    await prisma.$transaction([
      prisma.combatSession.deleteMany({ where: { characterId: id } }),
      prisma.battleRecord.deleteMany({ where: { characterId: id } }),
      prisma.duelEntry.deleteMany({ where: { challengerId: id } }),
      prisma.duelEntry.deleteMany({ where: { contenderId: id } }),
      prisma.travelState.deleteMany({ where: { characterId: id } }),
      prisma.gameLog.deleteMany({ where: { characterId: id } }),
      prisma.portOwnership.deleteMany({ where: { characterId: id } }),
      prisma.allianceMembership.deleteMany({ where: { characterId: id } }),
      prisma.ship.deleteMany({ where: { characterId: id } }),
      prisma.character.delete({ where: { id } }),
    ]);

    return { success: true, message: 'Player deleted' };
  });

  // ── SP.EDIT2 — NPC Editor ────────────────────────────────────────────────

  // List NPC roster (filter by type)
  fastify.get('/api/admin/npcs', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request) => {
    const { type } = request.query as { type?: string };
    const where = type ? { type: type.toUpperCase() as any } : {};

    const npcs = await prisma.npcRoster.findMany({
      where,
      orderBy: { rosterIndex: 'asc' },
    });

    return { npcs };
  });

  // Update NPC stats
  fastify.put('/api/admin/npcs/:id', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = adminUpdateNpcBody.parse(request.body);

    const existing = await prisma.npcRoster.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'NPC not found' });
    }

    const npc = await prisma.npcRoster.update({
      where: { id },
      data: body,
    });

    return { npc };
  });

  // Create new NPC (SP.EDIT2 auto-create)
  fastify.post('/api/admin/npcs', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request) => {
    const body = adminCreateNpcBody.parse(request.body);

    // Assign next roster index
    const maxIndex = await prisma.npcRoster.aggregate({ _max: { rosterIndex: true } });
    const nextIndex = (maxIndex._max.rosterIndex ?? 0) + 1;

    const npc = await prisma.npcRoster.create({
      data: {
        type: body.type,
        shipClass: body.shipClass,
        commander: body.commander,
        shipName: body.shipName,
        homeSystem: body.homeSystem,
        alliance: body.alliance,
        creditValue: body.creditValue,
        fuelCapacity: body.fuelCapacity,
        weaponStrength: body.weaponStrength,
        weaponCondition: body.weaponCondition,
        shieldStrength: body.shieldStrength,
        shieldCondition: body.shieldCondition,
        hullCondition: body.hullCondition,
        hullStrength: body.hullStrength,
        lifeSupportCond: body.lifeSupportCond,
        driveStrength: body.driveStrength,
        driveCondition: body.driveCondition,
        rosterIndex: nextIndex,
        battlesWon: 0,
        battlesLost: 0,
        isOriginal: false,
      },
    });

    return { npc };
  });

  // Delete NPC
  fastify.delete('/api/admin/npcs/:id', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.npcRoster.findUnique({ where: { id } });
    if (!existing) {
      return reply.code(404).send({ error: 'NPC not found' });
    }

    await prisma.npcRoster.delete({ where: { id } });

    return { success: true, message: `NPC ${existing.commander} deleted` };
  });

  // ── Ports ─────────────────────────────────────────────────────────────────

  // List port ownerships
  fastify.get('/api/admin/ports', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async () => {
    const ports = await prisma.portOwnership.findMany({
      include: {
        character: { select: { name: true, spacerId: true } },
      },
      orderBy: { systemId: 'asc' },
    });

    return { ports };
  });

  // Evict port owner (SP.SYSOP)
  fastify.post('/api/admin/ports/:systemId/evict', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { systemId } = request.params as { systemId: string };
    const sysId = parseInt(systemId, 10);

    const port = await prisma.portOwnership.findUnique({ where: { systemId: sysId } });
    if (!port) {
      return reply.code(404).send({ error: 'No port ownership found for this system' });
    }

    await prisma.portOwnership.delete({ where: { systemId: sysId } });

    // Clear portOwner on StarSystem
    await prisma.starSystem.update({
      where: { id: sysId },
      data: { portOwner: null },
    });

    return { success: true, systemId: sysId };
  });

  // ── SP.EDIT3 — Battle Config ──────────────────────────────────────────────

  // Get GameConfig
  fastify.get('/api/admin/config', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async () => {
    const config = await getGameConfig();
    return { config };
  });

  // Update GameConfig
  fastify.put('/api/admin/config', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request) => {
    const body = adminGameConfigBody.parse(request.body);

    // Ensure singleton exists
    await getGameConfig();

    const config = await updateGameConfig(body);
    return { config };
  });

  // Game reset (requires confirm: "RESET")
  fastify.post('/api/admin/reset', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async (request, reply) => {
    const { confirm } = request.body as { confirm?: string };

    if (confirm !== 'RESET') {
      return reply.code(400).send({ error: 'Must send { confirm: "RESET" } to confirm game reset' });
    }

    // Delete all game state (preserves users and star systems)
    await prisma.$transaction([
      prisma.combatSession.deleteMany(),
      prisma.battleRecord.deleteMany(),
      prisma.duelEntry.deleteMany(),
      prisma.travelState.deleteMany(),
      prisma.gameLog.deleteMany(),
      prisma.bulletinPost.deleteMany(),
      prisma.portOwnership.deleteMany(),
      prisma.allianceMembership.deleteMany(),
      prisma.ship.deleteMany(),
      prisma.character.deleteMany(),
    ]);

    // Reset GameConfig to defaults
    await prisma.gameConfig.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {
        battleDifficulty: 5,
        maxCombatRounds: 12,
        pirateAttackThreshold: 20,
        patrolAttackThreshold: 25,
        attackRandomMin: 3,
        attackRandomMax: 5,
      },
    });

    // Reset star system dynamic state
    await prisma.starSystem.updateMany({
      data: {
        portOwner: null,
        allianceControl: 'NONE',
        defconLevel: 1,
        visitCount: 0,
      },
    });

    return { success: true, message: 'Game has been reset. All characters and game state cleared.' };
  });

  // ── SP.SYSOP — Top Gun Rankings ───────────────────────────────────────────

  fastify.get('/api/admin/topgun', {
    preValidation: [requireAdmin],
    schema: { tags: ['admin'] },
  }, async () => {
    return getTopGunRankings();
  });
}
