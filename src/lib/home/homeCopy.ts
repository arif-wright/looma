import type { CompanionEffectiveState } from '$lib/companions/effectiveState';

type HeroInputs = {
  companionName: string | null;
  effective: CompanionEffectiveState | null;
  circleUnreadCount: number;
  msSinceLastWhisper: number | null;
};

export type HomeHeroCopy = {
  headline: string;
  subhead: string;
  body: string;
};

const daysFromMs = (ms: number | null) => (typeof ms === 'number' ? ms / 86_400_000 : null);

export const getHomeHeroCopy = (input: HeroInputs): HomeHeroCopy => {
  const name = input.companionName ?? 'your companion';
  const effective = input.effective;
  const daysSinceCheckIn = daysFromMs(effective?.msSinceCheckIn ?? null);
  const energy = effective?.energy ?? null;
  const moodKey = effective?.moodKey ?? null;

  let headline = 'Your bond pulses brighter today.';
  let subhead = 'Let the field settle before you move.';
  let body = `Start with a moment with ${name}, then send a whisper and check your circle.`;

  if (typeof daysSinceCheckIn === 'number' && daysSinceCheckIn > 7) {
    headline = 'Your bond has been quiet for a while.';
    subhead = 'A quick check-in brings the field back to you.';
    body = `${name} is still here. Start with a moment together, then send a whisper.`;
  } else if (typeof energy === 'number' && energy < 30) {
    headline = 'Your bond needs a softer pace today.';
    subhead = 'Start small. Let the rest follow.';
    body = `Check in with ${name} to steady energy, then choose your next thread.`;
  } else if (moodKey === 'radiant' && (effective?.msSinceCheckIn ?? Infinity) < 86_400_000) {
    headline = 'Your bond pulses brighter today.';
    subhead = 'Carry that resonance forward.';
    body = `Check in, send a whisper, then see what your circle is saying.`;
  } else if (moodKey === 'distant' || moodKey === 'waiting') {
    headline = 'Your bond is asking for you.';
    subhead = 'A gentle check-in goes a long way.';
    body = `Start with ${name}, then return to your circle.`;
  }

  if (input.circleUnreadCount > 0) {
    body = `${body} Your circle left a signal while you were away.`;
  }

  if (typeof input.msSinceLastWhisper === 'number' && input.msSinceLastWhisper > 3 * 86_400_000) {
    // Keep it gentle: a nudge, not guilt.
    body = `${body} A short whisper can warm the thread.`;
  }

  return { headline, subhead, body };
};

