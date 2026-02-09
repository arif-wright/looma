import type { DerivedMoodKey } from '$lib/companions/effectiveState';

export type MuseAnimationName = 'Celebrate' | 'Curious' | 'Happy' | 'Idle' | 'PetReact' | 'Sleep';

const hashString = (value: string) => {
  // Simple stable hash for deterministic variation; not crypto.
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

type PickOpts = {
  nowMs?: number;
  seed?: string;
};

// Mood -> animation mapping for the Muse GLB (`static/models/muse.glb`).
// We keep it deterministic (seed + time bucket) so it feels alive without flicker.
export const pickMuseAnimationForMood = (
  moodKey: DerivedMoodKey | null | undefined,
  opts: PickOpts = {}
): MuseAnimationName => {
  const nowMs = typeof opts.nowMs === 'number' ? opts.nowMs : Date.now();
  const seed = typeof opts.seed === 'string' ? opts.seed : '';
  const jitter = hashString(seed) % 90_000;
  const bucket = Math.floor((nowMs + jitter) / 90_000); // ~1.5 min

  const mood = (moodKey ?? 'calm') as DerivedMoodKey;

  if (mood === 'resting') return 'Sleep';

  if (mood === 'distant') {
    // Mostly asleep; sometimes a still idle pose.
    return bucket % 3 === 0 ? 'Idle' : 'Sleep';
  }

  if (mood === 'waiting') {
    // Feels present and looking for you.
    return bucket % 5 === 0 ? 'PetReact' : 'Curious';
  }

  if (mood === 'quiet') {
    // Subtle shifts.
    if (bucket % 7 === 0) return 'PetReact';
    return bucket % 2 === 0 ? 'Idle' : 'Curious';
  }

  if (mood === 'radiant') {
    // Bright energy, with an occasional celebration.
    return bucket % 6 === 0 ? 'Celebrate' : 'Happy';
  }

  // calm
  return bucket % 9 === 0 ? 'Curious' : 'Idle';
};

