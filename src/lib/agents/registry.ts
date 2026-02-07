import type { Agent, AgentRegistry } from './types';
import { dev } from '$app/environment';

const WHISPER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const WHISPER_LIBRARY = {
  bright: {
    streak: [
      'The world feels a little brighter today.',
      'Your rhythm is steady. Paths open quietly.',
      'Small steps are adding up. Keep the thread.'
    ],
    long_break: [
      'Welcome back. The world kept your place warm.',
      'Time moved softly. You are right on time.',
      'The path waited. It remembers your step.'
    ]
  },
  steady: {
    streak: [
      'A calm day. The world is in step with you.',
      'Steady progress leaves a long trail.',
      'Another quiet win for your timeline.'
    ],
    long_break: [
      'You are back. The world settles around you.',
      'Even after a pause, the thread holds.',
      'The world stayed patient. Continue when ready.'
    ]
  },
  low: {
    streak: [
      'You held the line today. That still counts.',
      'Quiet momentum is real momentum.',
      'Even soft progress reshapes the path.'
    ],
    long_break: [
      'No rush. The world meets you where you are.',
      'After distance, the first step matters most.',
      'The thread is still here. Start small.'
    ]
  }
} as const;

const parseTime = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const daysSince = (laterIso: string, earlierIso: string | null | undefined) => {
  const later = parseTime(laterIso);
  const earlier = parseTime(earlierIso);
  if (!later || !earlier) return 0;
  return Math.max(0, Math.floor((later - earlier) / (24 * 60 * 60 * 1000)));
};

const pickWhisper = (args: {
  mood: 'steady' | 'bright' | 'low';
  scenario: 'streak' | 'long_break';
  streakDays: number;
  daysSinceLastEnd: number;
  timestampIso: string;
}) => {
  const lines = WHISPER_LIBRARY[args.mood][args.scenario];
  const now = new Date(args.timestampIso);
  const seed =
    args.streakDays * 11 +
    args.daysSinceLastEnd * 7 +
    now.getUTCDate() +
    (now.getUTCMonth() + 1) * 13 +
    (args.mood === 'bright' ? 3 : args.mood === 'low' ? 5 : 2);
  return lines[Math.abs(seed) % lines.length];
};

const safetyAgent: Agent = {
  id: 'safety',
  label: 'Safety Agent',
  caps: {
    maxTokens: 256,
    minIntervalMs: 100,
    allowedScopes: ['app', 'companion', 'world', 'system']
  },
  handle: (event) => {
    if (event.type === 'unsafe_action') {
      return {
        agentId: 'safety',
        handled: true,
        veto: true,
        reason: 'Unsafe action blocked by Safety Agent.'
      };
    }

    return { agentId: 'safety', handled: true };
  }
};

const companionAgent: Agent = {
  id: 'companion',
  label: 'Companion Persona Agent (Muse)',
  caps: {
    maxTokens: 512,
    minIntervalMs: 250,
    allowedScopes: ['companion', 'app']
  },
  handle: (event) => {
    if (!['session.start', 'session.end', 'session.return', 'game.complete'].includes(event.type)) {
      return { agentId: 'companion', handled: false };
    }

    const payload = (event.payload ?? {}) as Record<string, any>;
    const suppress = Boolean(payload?.suppressReactions === true || event.meta?.suppressReactions === true);

    if (suppress) {
      return {
        agentId: 'companion',
        handled: true,
        output: { suppressed: true, mood: 'steady', note: 'Muse acknowledges the event.' }
      };
    }

    const tone = String((event.context as any)?.portableState?.tone ?? 'warm');
    const isDirect = tone === 'direct';

    let text = '';
    if (event.type === 'session.start') {
      text = isDirect ? 'You are back. Ready when you are.' : 'Welcome back. I am here if you need me.';
    } else if (event.type === 'session.end') {
      return {
        agentId: 'companion',
        handled: true,
        output: { mood: 'steady', note: 'Muse logged session end.' }
      };
    } else if (event.type === 'session.return') {
      text = isDirect ? 'Welcome back.' : 'Welcome back. Want to pick up where we left off?';
    } else if (event.type === 'game.complete') {
      const score = typeof payload?.score === 'number' ? payload.score : null;
      text = isDirect
        ? 'Nice work. Session logged.'
        : score !== null
          ? `Nice work. Score: ${score}.`
          : 'Nice work. I saw that run.';
    }

    const reaction = {
      text,
      kind: event.type,
      ttlMs: 3500
    };

    if (dev) {
      console.debug('[agent:companion] reaction', reaction);
    }

    return {
      agentId: 'companion',
      handled: true,
      output: { reaction, mood: 'steady', note: 'Muse acknowledges the event.' }
    };
  }
};

const worldAgent: Agent = {
  id: 'world',
  label: 'World State Agent',
  caps: {
    maxTokens: 384,
    minIntervalMs: 300,
    allowedScopes: ['world', 'app']
  },
  handle: (event) => {
    if (event.type !== 'session.start') {
      return { agentId: 'world', handled: false };
    }

    if (event.meta?.suppressReactions) {
      return { agentId: 'world', handled: true, output: { suppressed: true, note: 'Whispers suppressed.' } };
    }

    const world = ((event.context as any)?.worldState ?? {}) as Record<string, unknown>;
    const moodRaw = typeof world.companionMood === 'string' ? world.companionMood : 'steady';
    const mood: 'steady' | 'bright' | 'low' = moodRaw === 'bright' || moodRaw === 'low' ? moodRaw : 'steady';
    const streakDays =
      typeof world.streakDays === 'number' && Number.isFinite(world.streakDays) ? Math.max(0, Math.floor(world.streakDays)) : 0;
    const previousStreakDays =
      typeof world.previousStreakDays === 'number' && Number.isFinite(world.previousStreakDays)
        ? Math.max(0, Math.floor(world.previousStreakDays))
        : 0;
    const timestampIso = event.timestamp || new Date().toISOString();
    const lastSessionEnd = typeof world.lastSessionEnd === 'string' ? world.lastSessionEnd : null;
    const lastWhisperAt = typeof world.lastWhisperAt === 'string' ? world.lastWhisperAt : null;

    const nowMs = parseTime(timestampIso) ?? Date.now();
    const lastWhisperMs = parseTime(lastWhisperAt);
    if (lastWhisperMs && nowMs - lastWhisperMs < WHISPER_COOLDOWN_MS) {
      return { agentId: 'world', handled: true, output: { note: 'Whisper cooldown active.' } };
    }

    const streakIncreased = streakDays > previousStreakDays && streakDays >= 2;
    const daysSinceLastEnd = daysSince(timestampIso, lastSessionEnd);
    const longBreakReturn = daysSinceLastEnd >= 3;
    if (!streakIncreased && !longBreakReturn) {
      return { agentId: 'world', handled: true, output: { note: 'No whisper trigger.' } };
    }

    const scenario: 'streak' | 'long_break' = longBreakReturn ? 'long_break' : 'streak';
    const text = pickWhisper({ mood, scenario, streakDays, daysSinceLastEnd, timestampIso });
    const whisper = { text, ttlMs: 4800 };

    if (dev) {
      console.debug('[agent:world] whisper', { whisper, scenario, mood, streakDays, daysSinceLastEnd });
    }

    return {
      agentId: 'world',
      handled: true,
      output: {
        whisper,
        whisperMeta: {
          at: timestampIso,
          streakDays,
          scenario
        }
      }
    };
  }
};

export const agentRegistry: AgentRegistry = {
  safety: safetyAgent,
  companion: companionAgent,
  world: worldAgent
};
