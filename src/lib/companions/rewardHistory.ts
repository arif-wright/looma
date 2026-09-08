/** Describe acquisition without inferring how long or how strong the bond was. */
export const recordedRewardBody = (title: unknown): string => {
  const name = typeof title === 'string' && title.trim() ? title.trim() : 'A keepsake';
  return `${name} was added to your shared collection. Its place in your story can grow through what you do together.`;
};

/** Presentation only: never rewrite the saved record or personal reflections. */
export const presentRewardHistory = <T extends { body?: string | null; source_type?: unknown; meta_json?: Record<string, unknown> | null }>(row: T): T => {
  if (row.source_type !== 'system' || row.meta_json?.generatedBy !== 'chapter_reward_reveal') return row;
  return { ...row, body: recordedRewardBody(row.meta_json.rewardTitle) };
};
