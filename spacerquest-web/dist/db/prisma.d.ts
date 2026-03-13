/**
 * SpacerQuest v4.0 - Prisma Client Singleton
 *
 * Single shared Prisma client instance for the application
 * Prevents connection exhaustion from creating clients per-request
 */
import { PrismaClient } from '@prisma/client';
declare global {
    var prisma: PrismaClient | undefined;
}
export declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export default prisma;
//# sourceMappingURL=prisma.d.ts.map