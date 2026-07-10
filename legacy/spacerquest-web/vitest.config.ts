import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/vitest.setup.ts'],
    // Run each test file in a forked child process rather than a worker thread.
    // Prisma's native (library-engine) client segfaults on worker-thread teardown
    // (SIGSEGV / exit 139) even when every test passes; a forked process exits cleanly.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
  esbuild: {
    target: 'node20',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
});
