import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const usingVitest = Boolean(process.env.VITEST);
const alias = {
  $lib: fileURLToPath(new URL('./src/lib', import.meta.url))
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
    include: ['src/lib/__tests__/**/*.spec.ts', 'tests/**/*.spec.ts']
  }
});
