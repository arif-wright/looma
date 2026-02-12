import type { DerivedMoodKey } from '$lib/companions/effectiveState';

export type MuseVisualMood = 'calm' | 'bright' | 'low';

export type WorldMood = 'steady' | 'bright' | 'low';

export type MuseVisualVariables = {
  auraIntensityScale: number;
  hoverAmplitudePx: number;
  auraPalette: 'cyan' | 'mint' | 'amber';
};

export const MUSE_VISUAL_BY_MOOD: Record<MuseVisualMood, MuseVisualVariables> = {
  calm: {
    auraIntensityScale: 0.9,
    hoverAmplitudePx: 4,
    auraPalette: 'cyan'
  },
  bright: {
    auraIntensityScale: 1.2,
    hoverAmplitudePx: 7,
    auraPalette: 'mint'
  },
  low: {
    auraIntensityScale: 0.62,
    hoverAmplitudePx: 2,
    auraPalette: 'amber'
  }
};

const fromCompanionMood = (moodKey: DerivedMoodKey | null | undefined): MuseVisualMood | null => {
  if (!moodKey) return null;
  if (moodKey === 'radiant') return 'bright';
  if (moodKey === 'resting' || moodKey === 'distant') return 'low';
  return 'calm';
};

const fromWorldMood = (worldMood: WorldMood | null | undefined): MuseVisualMood => {
  if (worldMood === 'bright') return 'bright';
  if (worldMood === 'low') return 'low';
  return 'calm';
};

export const resolveMuseVisualMood = (args: {
  companionMoodKey: DerivedMoodKey | null | undefined;
  worldMood: WorldMood | null | undefined;
}): MuseVisualMood => {
  return fromCompanionMood(args.companionMoodKey) ?? fromWorldMood(args.worldMood);
};
