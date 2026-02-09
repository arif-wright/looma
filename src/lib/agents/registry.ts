import type { Agent, AgentRegistry } from './types';
import { dev } from '$app/environment';

const WHISPER_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PRE_RUN_COOLDOWN_MS = 60 * 60 * 1000;
const MAX_PRE_RUN_BUCKETS = 5000;
const preRunReactionTimestamps = new Map<string, number>();
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

const clampInteger = (value: unknown, fallback = 0) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
};

const simpleHash = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
};

const preRunThrottleKey = (event: Parameters<Agent['handle']>[0]) =>
  String(event.meta?.userId ?? event.meta?.sessionId ?? 'anonymous');

const shouldEmitPreRunLine = (event: Parameters<Agent['handle']>[0]) => {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const gameId = String(payload.gameId ?? payload.gameSlug ?? payload.slug ?? '');
  const seed = `${event.timestamp}|${event.meta?.sessionId ?? ''}|${gameId}`;
  return simpleHash(seed) % 100 < 55;
};

const canEmitPreRunReaction = (event: Parameters<Agent['handle']>[0]) => {
  const nowMs = parseTime(event.timestamp) ?? Date.now();
  const key = preRunThrottleKey(event);
  const lastMs = preRunReactionTimestamps.get(key) ?? null;
  if (lastMs && nowMs - lastMs < PRE_RUN_COOLDOWN_MS) {
    return false;
  }
  preRunReactionTimestamps.set(key, nowMs);
  if (preRunReactionTimestamps.size > MAX_PRE_RUN_BUCKETS) {
    const entries = [...preRunReactionTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const pruneCount = Math.max(1, Math.floor(entries.length / 3));
    for (let i = 0; i < pruneCount; i += 1) {
      const entry = entries[i];
      if (!entry) continue;
      preRunReactionTimestamps.delete(entry[0]);
    }
  }
  return true;
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
    if (!['session.start', 'session.end', 'session.return', 'game.session.start', 'game.complete'].includes(event.type)) {
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
    } else if (event.type === 'game.session.start') {
      if (!canEmitPreRunReaction(event)) {
        return {
          agentId: 'companion',
          handled: true,
          output: { mood: 'steady', note: 'Pre-run reaction cooldown active.' }
        };
      }
      if (!shouldEmitPreRunLine(event)) {
        return {
          agentId: 'companion',
          handled: true,
          output: { mood: 'steady', note: 'Pre-run reaction skipped by optional gate.' }
        };
      }
      text = isDirect ? 'Focus up. Make this run clean.' : 'I am with you. Have a strong run.';
    } else if (event.type === 'game.complete') {
      const rewards = payload?.rewardsGranted as Record<string, unknown> | undefined;
      if (!rewards || typeof rewards !== 'object') {
        return {
          agentId: 'companion',
          handled: true,
          output: { mood: 'steady', note: 'Skipping non-canonical game.complete payload.' }
        };
      }

      const xpGained = clampInteger(rewards.xpGained, 0);
      const shardsGained = clampInteger(rewards.shardsGained, 0);
      const rewardSummary =
        xpGained > 0 && shardsGained > 0
          ? `+${xpGained} XP, +${shardsGained} shards`
          : xpGained > 0
            ? `+${xpGained} XP`
            : shardsGained > 0
              ? `+${shardsGained} shards`
              : 'no bonus rewards';

      const score = typeof payload?.score === 'number' ? Math.max(0, Math.floor(payload.score)) : null;
      if (isDirect) {
        const directOptions = [
          `Nice work. ${rewardSummary}.`,
          `Run complete. ${rewardSummary}.`,
          score !== null ? `Score ${score}. ${rewardSummary}.` : `Session logged. ${rewardSummary}.`
        ];
        const pick = simpleHash(`${event.timestamp}|direct|${score ?? 0}|${xpGained}|${shardsGained}`) % directOptions.length;
        text = directOptions[pick] ?? directOptions[0] ?? `Run complete. ${rewardSummary}.`;
      } else {
        const warmOptions = [
          `Nice work. You earned ${rewardSummary}.`,
          score !== null
            ? `Great run at ${score} score. You earned ${rewardSummary}.`
            : `Great run. You earned ${rewardSummary}.`,
          `Strong finish. ${rewardSummary}.`
        ];
        const pick = simpleHash(`${event.timestamp}|warm|${score ?? 0}|${xpGained}|${shardsGained}`) % warmOptions.length;
        text = warmOptions[pick] ?? warmOptions[0] ?? `Nice work. You earned ${rewardSummary}.`;
      }
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

export const __resetCompanionAgentRateLimits = () => {
  preRunReactionTimestamps.clear();
};
