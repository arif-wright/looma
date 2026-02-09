// @ts-nocheck
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const usingVitest = Boolean(process.env.VITEST);
const alias = {
  $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
  ...(usingVitest
    ? {
        '$app/environment': fileURLToPath(new URL('./tests/mocks/app-environment.ts', import.meta.url))
      }
    : {})
};

export default defineConfig({
  plugins: usingVitest ? [] : [sveltekit()],
  server: { port: 3000, strictPort: true },
  resolve: {
    alias
  },
  test: {
    globals: true,
    environment: 'node',
    // Only run Vitest-native suites here. Playwright suites live under `tests/`
    // but should be executed via `npm run test:e2e`.
    include: [
      'src/lib/__tests__/**/*.spec.ts',
      'tests/api/companion-bond*.spec.ts',
      'tests/api/companion-rituals.spec.ts'
    ]
  }
});
