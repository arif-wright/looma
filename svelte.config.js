import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Ensure a stable, supported runtime for Vercel builds/SSR.
		// (Local environments may run newer Node versions than the adapter supports.)
		adapter: adapter({ runtime: 'nodejs20.x' })
	}
};

export default config;
