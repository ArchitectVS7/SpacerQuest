/**
 * SpacerQuest v4.0 - Navigation Routes
 */
export async function registerNavigationRoutes(fastify) {
    const { PrismaClient } = await import('@prisma/client');
    // Launch to destination
    fastify.post('/api/navigation/launch', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const { destinationSystemId, cargoContract } = request.body;
        const prisma = new PrismaClient();
        const { validateLaunch, startTravel } = await import('../../game/systems/travel.js');
        const character = await prisma.character.findFirst({
            where: { userId },
            include: { ship: true },
        });
        if (!character || !character.ship) {
            await prisma.$disconnect();
            return reply.status(400).send({ error: 'No ship found' });
        }
        // Validate launch
        const validation = await validateLaunch(character.id, destinationSystemId);
        if (!validation.valid) {
            await prisma.$disconnect();
            return reply.status(400).send({
                error: 'Launch validation failed',
                details: validation.errors
            });
        }
        // Deduct fuel
        await prisma.ship.update({
            where: { id: character.ship.id },
            data: { fuel: character.ship.fuel - (validation.fuelRequired || 0) },
        });
        // Set cargo contract if provided
        if (cargoContract) {
            await prisma.character.update({
                where: { id: character.id },
                data: {
                    cargoPods: cargoContract.pods,
                    cargoType: cargoContract.type,
                    cargoPayment: cargoContract.payment,
                    destination: destinationSystemId,
                },
            });
        }
        // Start travel
        await startTravel(character.id, character.currentSystem, destinationSystemId, validation.fuelRequired || 0);
        await prisma.$disconnect();
        return {
            success: true,
            fuelRequired: validation.fuelRequired,
            travelTime: validation.travelTime,
            destination: destinationSystemId,
        };
    });
    // Get travel progress
    fastify.get('/api/navigation/travel-status', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const prisma = new PrismaClient();
        const character = await prisma.character.findFirst({ where: { userId } });
        if (!character) {
            await prisma.$disconnect();
            return reply.status(404).send({ error: 'Character not found' });
        }
        const { getTravelProgress } = await import('../../game/systems/travel.js');
        const progress = await getTravelProgress(character.id);
        await prisma.$disconnect();
        if (!progress) {
            return { inTransit: false };
        }
        return progress;
    });
    // Course change
    fastify.post('/api/navigation/course-change', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const { newSystemId } = request.body;
        const prisma = new PrismaClient();
        const { processCourseChange } = await import('../../game/systems/travel.js');
        const character = await prisma.character.findFirst({ where: { userId } });
        if (!character) {
            await prisma.$disconnect();
            return reply.status(404).send({ error: 'Character not found' });
        }
        // Get course changes remaining (simplified - would track per trip)
        const result = await processCourseChange(character.id, newSystemId, 5);
        await prisma.$disconnect();
        if (!result.success) {
            return reply.status(400).send({ error: result.error });
        }
        return {
            success: true,
            fuelUsed: result.fuelUsed,
            remainingChanges: result.remainingChanges,
        };
    });
    // Complete travel (called when travel time expires)
    fastify.post('/api/navigation/arrive', {
        preValidation: [async (request, reply) => {
                try {
                    await request.jwtVerify();
                }
                catch (err) {
                    reply.code(401).send({ error: 'Unauthorized' });
                }
            }],
    }, async (request, reply) => {
        const { userId } = request.user;
        const prisma = new PrismaClient();
        const character = await prisma.character.findFirst({ where: { userId } });
        if (!character) {
            await prisma.$disconnect();
            return reply.status(404).send({ error: 'Character not found' });
        }
        const { completeTravel } = await import('../../game/systems/travel.js');
        await completeTravel(character.id, character.destination || character.currentSystem);
        const { processDocking } = await import('../../game/systems/docking.js');
        await processDocking(character.id, character.destination || character.currentSystem);
        await prisma.$disconnect();
        return { success: true, system: character.destination };
    });
}
//# sourceMappingURL=navigation.js.map