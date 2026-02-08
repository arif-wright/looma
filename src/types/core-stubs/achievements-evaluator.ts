export type UnlockSummary = {
  achievementId?: string;
  key: string;
  name: string;
  points: number;
  icon: string;
  rarity?: string | null;
  shards?: number;
};

type CatalogEntry = { id: string; key: string };

export const createAchievementEvaluator = (_args: unknown) => ({
  evaluate: async (_input: unknown): Promise<{ unlocked: UnlockSummary[] }> => ({ unlocked: [] }),
  getCatalogForGame: async (): Promise<CatalogEntry[]> => [],
  userHas: async (_userId: string, _achievementId: string): Promise<boolean> => false,
  unlock: async (_userId: string, _achievement: CatalogEntry, _meta?: Record<string, unknown>): Promise<void> => {}
});
