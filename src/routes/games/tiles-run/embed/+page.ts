import type { PageLoad } from './$types';

// This route is a runtime embed (canvas/game bootstrap). Prerendering it triggers
// server hooks during build, which can fail in CI when runtime env isn't injected.
export const prerender = false;

export const load: PageLoad = () => ({ slug: 'tiles-run' });
