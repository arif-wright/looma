import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } }
  }
});
