/**
 * Vitest global setup — runs in every test worker.
 *
 * Registers an afterAll hook that disconnects the shared Prisma client at the end of
 * each test file. Without this, DB-touching tests leave the Prisma Rust query engine
 * connected, and Node tears it down abruptly on worker exit → SIGSEGV (exit code 139)
 * *after* all tests pass, which makes CI read the run as failed.
 *
 * Prisma reconnects lazily on the next query, so disconnecting between files is safe.
 */
import { afterAll } from 'vitest';
import { prisma } from '../src/db/prisma';

afterAll(async () => {
  await prisma.$disconnect();
});
