import { get, writable } from 'svelte/store';
import { cubicOut } from 'svelte/easing';
import { tweened } from 'svelte/motion';

export type AmbientMood = 'steady' | 'luminous' | 'dim';

export type AmbientState = {
  mood: AmbientMood;
  intensity: number;
  accentVariant: string;
  motionScale: number;
  glowScale: number;
};

type EmotionalInput = {
  mood?: string | null;
  bond?: number | null;
  streak_momentum?: number | null;
  volatility?: number | null;
};

type SummaryInput = {
  summary_text?: string | null;
  highlights_json?: unknown;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const baseState: AmbientState = {
  mood: 'steady',
  intensity: 0.2,
  accentVariant: 'steady',
  motionScale: 1,
  glowScale: 0.72
};

const durationForDelta = (from: number, to: number) => {
  const delta = Math.abs(to - from);
  return Math.round(clamp(600 + delta * 600, 600, 1200));
};

const resolveMood = (value: string | null | undefined): AmbientMood => {
  if (value === 'luminous') return 'luminous';
  if (value === 'dim') return 'dim';
  return 'steady';
};

const intensityTween = tweened(baseState.intensity, { duration: 800, easing: cubicOut });
const motionScaleTween = tweened(baseState.motionScale, { duration: 800, easing: cubicOut });
const glowScaleTween = tweened(baseState.glowScale, { duration: 800, easing: cubicOut });
const ambientStore = writable<AmbientState>({ ...baseState });

intensityTween.subscribe((intensity) => {
  ambientStore.update((state) => ({ ...state, intensity }));
});

motionScaleTween.subscribe((motionScale) => {
  ambientStore.update((state) => ({ ...state, motionScale }));
});

glowScaleTween.subscribe((glowScale) => {
  ambientStore.update((state) => ({ ...state, glowScale }));
});

const setTargets = (
  target: Pick<AmbientState, 'mood' | 'accentVariant' | 'intensity' | 'motionScale' | 'glowScale'>,
  options?: { instant?: boolean; reducedMotion?: boolean }
) => {
  const reducedMotion = options?.reducedMotion === true;
  const instant = options?.instant === true || reducedMotion;
  const current = get(ambientStore);
  const motionScale = reducedMotion ? 1 : target.motionScale;

  ambientStore.update((state) => ({
    ...state,
    mood: target.mood,
    accentVariant: target.accentVariant
  }));

  intensityTween.set(clamp(target.intensity, 0, 1), {
    duration: instant ? 0 : durationForDelta(current.intensity, target.intensity),
    easing: cubicOut
  });
  glowScaleTween.set(clamp(target.glowScale, 0.6, 1.2), {
    duration: instant ? 0 : durationForDelta(current.glowScale, target.glowScale),
    easing: cubicOut
  });
  motionScaleTween.set(clamp(motionScale, 0.7, 1.15), {
    duration: instant ? 0 : durationForDelta(current.motionScale, motionScale),
    easing: cubicOut
  });
};

const computeFromEmotionalState = (state: EmotionalInput) => {
  const mood = resolveMood(state.mood);
  const bond = clamp(typeof state.bond === 'number' ? state.bond : 0, 0, 1);
  const streak = clamp(typeof state.streak_momentum === 'number' ? state.streak_momentum : 0, 0, 1);
  const volatility = clamp(typeof state.volatility === 'number' ? state.volatility : 0, 0, 1);

  const moodBoost = mood === 'luminous' ? 0.12 : mood === 'dim' ? -0.08 : 0;
  const rawIntensity = 0.2 + bond * 0.34 + streak * 0.3 + volatility * 0.16 + moodBoost;
  const intensity = clamp(rawIntensity, 0, 1);

  return {
    mood,
    accentVariant: mood,
    intensity,
    glowScale: clamp(0.6 + intensity * 0.6, 0.6, 1.2),
    motionScale: clamp(0.7 + intensity * 0.45 - volatility * 0.08, 0.7, 1.15)
  };
};

export const ambient = {
  subscribe: ambientStore.subscribe,
  setFromEmotionalState: (state: EmotionalInput, options?: { instant?: boolean; reducedMotion?: boolean }) => {
    const mapped = computeFromEmotionalState(state);
    setTargets(mapped, options);
  },
  setFromSummary: (summary: SummaryInput | null | undefined, options?: { instant?: boolean; reducedMotion?: boolean }) => {
    if (!summary) return;
    const highlights = Array.isArray(summary.highlights_json)
      ? summary.highlights_json.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const hasStreak = highlights.some((entry) => entry.toLowerCase().includes('streak'));
    const hasMilestone = highlights.some((entry) => entry.toLowerCase().includes('milestone'));
    if (!hasStreak && !hasMilestone) return;

    const current = get(ambientStore);
    const bump = hasMilestone ? 0.08 : 0.04;
    setTargets(
      {
        mood: current.mood,
        accentVariant: current.accentVariant,
        intensity: clamp(current.intensity + bump, 0, 1),
        glowScale: clamp(current.glowScale + bump * 0.4, 0.6, 1.2),
        motionScale: current.motionScale
      },
      options
    );
  },
  reset: (options?: { instant?: boolean; reducedMotion?: boolean }) => {
    setTargets({ ...baseState }, options);
  }
};

export const mapEmotionalToAmbient = computeFromEmotionalState;
