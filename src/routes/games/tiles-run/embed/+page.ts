import type { PageLoad } from './$types';

// Retain the legacy URL as a notice without bootstrapping an engine or bridge.
// Keep runtime rendering so build-time prerendering does not invoke auth hooks.
export const prerender = false;

export const load: PageLoad = () => ({ slug: 'tiles-run' });
