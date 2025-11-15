export type CompanionRitualDefinition = {
  key: CompanionRitualKey;
  title: string;
  description: string;
  progressMax: number;
  xpReward: number;
  shardReward: number;
  affectionReward: number;
  trustReward: number;
};

export type CompanionRitualKey = 'care_once' | 'play_game_with_companion' | 'post_with_companion';

export type CompanionRitual = CompanionRitualDefinition & {
  progress: number;
  status: 'pending' | 'in_progress' | 'completed';
  completedAt: string | null;
};

export type CompanionRitualUpdate = {
  list: CompanionRitual[];
  completed: CompanionRitual[];
};

export const COMPANION_RITUALS: CompanionRitualDefinition[] = [
  {
    key: 'care_once',
    title: 'Check in together',
    description: 'Perform any care action with your active companion.',
    progressMax: 1,
    xpReward: 15,
    shardReward: 2,
    affectionReward: 1,
    trustReward: 1
  },
  {
    key: 'play_game_with_companion',
    title: 'Play a round',
    description: 'Complete one game session while bonded.',
    progressMax: 1,
    xpReward: 20,
    shardReward: 3,
    affectionReward: 1,
    trustReward: 1
  },
  {
    key: 'post_with_companion',
    title: 'Share the vibe',
    description: 'Post or share a moment while your companion is active.',
    progressMax: 1,
    xpReward: 10,
    shardReward: 2,
    affectionReward: 1,
    trustReward: 1
  }
];

export const ritualDefinitionMap = new Map(COMPANION_RITUALS.map((entry) => [entry.key, entry]));

export const mapRitualRow = (row: Record<string, any>): CompanionRitual => {
  const def = ritualDefinitionMap.get(row.ritual_key as CompanionRitualKey);
  const progress = Math.min(row.progress ?? 0, row.progress_goal ?? def?.progressMax ?? 1);
  const status: CompanionRitual['status'] = row.completed
    ? 'completed'
    : progress > 0
      ? 'in_progress'
      : 'pending';
  return {
    ...(def ?? {
      key: row.ritual_key as CompanionRitualKey,
      title: row.ritual_key,
      description: row.ritual_key,
      progressMax: row.progress_goal ?? 1,
      xpReward: row.xp_reward ?? 0,
      shardReward: row.shard_reward ?? 0,
      affectionReward: row.affection_reward ?? 0,
      trustReward: row.trust_reward ?? 0
    }),
    progress,
    status,
    completedAt: row.completed_at ?? null
  } satisfies CompanionRitual;
};

export const describeRitualCompletion = (ritual: CompanionRitual, companionName: string | null) => {
  const name = companionName?.trim()?.length ? companionName : 'your companion';
  return `${name} completed “${ritual.title}”. +${ritual.xpReward} XP, +${ritual.shardReward} shards.`;
};
