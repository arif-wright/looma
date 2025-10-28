import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const usingVitest = Boolean(process.env.VITEST);

export default defineConfig({
  plugins: usingVitest ? [] : [sveltekit()],
  server: { port: 3000, strictPort: true },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/lib/__tests__/**/*.spec.ts']
  }
});
