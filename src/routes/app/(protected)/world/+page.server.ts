import { env } from '$env/dynamic/public';
import type { PageServerLoad } from './$types';
import { isWorldEnabled } from '$lib/game/featureFlag';
import { selectWorldRenderer } from '$lib/game/rendererSelection';

export const load: PageServerLoad = async () => ({
  worldEnabled: isWorldEnabled(env.PUBLIC_WORLD_ENABLED),
  worldServerUrl: env.PUBLIC_WORLD_SERVER_URL?.trim() || null,
  worldRenderer: selectWorldRenderer(env.PUBLIC_WORLD_RENDERER)
});
