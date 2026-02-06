import { CONTEXT_BUNDLE_VERSION, type ContextBundle } from '$lib/types/contextBundle';

export type ContextBundleArgs = {
  userId?: string | null;
  sessionId?: string | null;
};

export const getContextBundle = async (args: ContextBundleArgs): Promise<ContextBundle> => {
  const now = new Date();
  const month = now.getMonth();
  const season =
    month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 8 ? 'summer' : month >= 9 && month <= 10 ? 'autumn' : 'winter';
  const themeAccent = month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';

  return {
    version: CONTEXT_BUNDLE_VERSION,
    generatedAt: now.toISOString(),
    playerState: {
      id: args.userId ?? 'anonymous',
      level: null,
      xp: null,
      xpNext: null,
      energy: null,
      energyMax: null,
      currency: 0,
      walletUpdatedAt: null
    },
    companionState: {
      activeCompanionId: null,
      name: null,
      bondLevel: null,
      bondScore: null,
      xpMultiplier: null,
      state: null,
      mood: null
    },
    worldState: {
      serverTime: now.toISOString(),
      season,
      themeAccent
    },
    portableState: {
      lastContext: {
        context: null,
        trigger: null
      },
      lastContextPayload: {}
    }
  } satisfies ContextBundle;
};
