export const SYNTHETIC_DENSITIES = [0, 5, 10, 20, 32] as const;
export type SyntheticDensity = typeof SYNTHETIC_DENSITIES[number];
export type VisualQuality = 'full' | 'reduced' | 'minimum';

export const parseSyntheticDensity = (value: string | null): SyntheticDensity => {
  const parsed = Number(value);
  return SYNTHETIC_DENSITIES.includes(parsed as SyntheticDensity) ? parsed as SyntheticDensity : 0;
};

export const selectVisualQuality = (recentMinimumFps: number): VisualQuality =>
  recentMinimumFps < 24 ? 'minimum' : recentMinimumFps < 40 ? 'reduced' : 'full';

export const qualityDprCap = (quality: VisualQuality) => quality === 'minimum' ? 1 : quality === 'reduced' ? 1.35 : 1.75;
