export const CONTEXT_BUNDLE_VERSION = '1.0';

export type ContextBundleVersion = typeof CONTEXT_BUNDLE_VERSION;

export type PlayerStateBundle = {
  id: string;
  level: number | null;
  xp: number | null;
  xpNext: number | null;
  energy: number | null;
  energyMax: number | null;
  currency: number;
  walletUpdatedAt: string | null;
};

export type CompanionStateBundle = {
  activeCompanionId: string | null;
  name: string | null;
  bondLevel: number | null;
  bondScore: number | null;
  xpMultiplier: number | null;
  state: string | null;
  mood: string | null;
};

export type CompanionActiveBundle = {
  id: string;
  name: string;
  archetype: string;
  unlocked: boolean;
  cosmetics: Record<string, string | number | boolean | null>;
  stats: {
    bond: number;
    level: number;
  };
};

export type CompanionBundle = {
  active: CompanionActiveBundle | null;
  roster: CompanionActiveBundle[];
};

export type WorldStateBundle = {
  serverTime: string;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  themeAccent: 'amber' | 'neonMagenta' | 'neonCyan';
  lastSessionStart: string | null;
  lastSessionEnd: string | null;
  streakDays: number | null;
  previousStreakDays: number | null;
  lastWhisperAt: string | null;
  lastWhisperStreak: number | null;
  companionMood: 'steady' | 'bright' | 'low';
  companionMoodValue: number;
};

export type PortableStateBundle = {
  tone?: string | null;
  reactionsEnabled?: boolean | null;
  lastContext: {
    context: string | null;
    trigger: string | null;
  };
  lastContextPayload: Record<string, string | number | boolean | null>;
};

export type ContextBundle = {
  version: ContextBundleVersion;
  generatedAt: string;
  playerState: PlayerStateBundle;
  companionState: CompanionStateBundle;
  companion: CompanionBundle;
  worldState: WorldStateBundle;
  portableState: PortableStateBundle;
};
