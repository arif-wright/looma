import type { Agent, AgentRegistry } from './types';
import { dev } from '$app/environment';
import {
  deterministicDailyPick,
  resolveCompanionPersonaProfile,
  type PersonaTone
} from '$lib/companions/personaProfiles';
import { getLoomaTuningConfig } from '$lib/server/tuning/config';
import { classifyCompanionLlmIntensity, generateCompanionText } from '$lib/server/llm/companionText';

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

const shouldEmitPreRunLine = (event: Parameters<Agent['handle']>[0], chancePercent: number) => {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const gameId = String(payload.gameId ?? payload.gameSlug ?? payload.slug ?? '');
  const seed = `${event.timestamp}|${event.meta?.sessionId ?? ''}|${gameId}`;
  return simpleHash(seed) % 100 < Math.max(0, Math.min(100, Math.floor(chancePercent)));
};

const canEmitPreRunReaction = (event: Parameters<Agent['handle']>[0], cooldownMs: number, maxBuckets: number) => {
  const nowMs = parseTime(event.timestamp) ?? Date.now();
  const key = preRunThrottleKey(event);
  const lastMs = preRunReactionTimestamps.get(key) ?? null;
  if (lastMs && nowMs - lastMs < cooldownMs) {
    return false;
  }
  preRunReactionTimestamps.set(key, nowMs);
  if (preRunReactionTimestamps.size > maxBuckets) {
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
  handle: async (event) => {
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
  handle: async (event) => {
    const tuning = await getLoomaTuningConfig();
    if (
      ![
        'session.start',
        'session.return',
        'session.end',
        'game.session.start',
        'game.complete',
        'mission.start',
        'mission.complete',
        'companion.swap',
        'companion.ritual.listen',
        'companion.ritual.focus',
        'companion.ritual.celebrate'
      ].includes(event.type)
    ) {
      return { agentId: 'companion', handled: false };
    }

    const payload = (event.payload ?? {}) as Record<string, any>;
    const context = (event.context ?? {}) as Record<string, any>;
    const reactionsEnabled = context?.portableState?.reactionsEnabled !== false;
    const suppress = Boolean(!reactionsEnabled || payload?.suppressReactions === true || event.meta?.suppressReactions === true);

    if (suppress) {
      return {
        agentId: 'companion',
        handled: true,
        output: { suppressed: true, mood: 'steady', note: 'Muse acknowledges the event.' }
      };
    }

    const activeCompanion =
      (context?.companion?.active as { id?: unknown; archetype?: unknown; name?: unknown } | null | undefined) ?? null;
    const profile = resolveCompanionPersonaProfile(activeCompanion);
    const requestedTone = String(context?.portableState?.tone ?? '').toLowerCase();
    const tone: PersonaTone = requestedTone === 'direct' || requestedTone === 'warm' ? requestedTone : profile.toneDefault;
    const userId = String(event.meta?.userId ?? 'anonymous');
    const pick = <T>(values: readonly T[], namespace: string) =>
      deterministicDailyPick(values, {
        timestampIso: event.timestamp,
        userId,
        eventType: event.type,
        namespace
      });
    const greeting = pick(profile.vocabulary.greetings, 'vocab:greeting');
    const affirmation = pick(profile.vocabulary.affirmations, 'vocab:affirmation');
    const focusCue = pick(profile.vocabulary.focusCues, 'vocab:focus');
    const closer = pick(profile.vocabulary.closers, 'vocab:closer');
    const companionName =
      typeof activeCompanion?.name === 'string' && activeCompanion.name.trim()
        ? activeCompanion.name.trim()
        : 'your companion';

    const llmIntensity = classifyCompanionLlmIntensity({ event, context });
    if (llmIntensity) {
      const llmText = await generateCompanionText({
        event,
        context,
        intensity: llmIntensity
      });
      if (llmText) {
        const reaction = {
          text: llmText,
          kind: event.type,
          ttlMs: tuning.reactions.ttlMs
        };
        return {
          agentId: 'companion',
          handled: true,
          output: { reaction, mood: 'steady', note: 'Muse generated an LLM reaction.' }
        };
      }
    }

    let text = '';
    if (event.type === 'session.start') {
      const warm = [
        `${greeting}. ${closer}.`,
        `${greeting}. ${focusCue}.`,
        `${greeting}. Ready for your next step?`,
        `${greeting}. ${affirmation}.`
      ];
      const direct = [
        `${greeting}. Ready.`,
        `${focusCue}.`,
        `Back online. ${closer}.`,
        `Session live. ${focusCue}.`
      ];
      text = pick(tone === 'direct' ? direct : warm, 'session.start:text');
    } else if (event.type === 'session.end') {
      return {
        agentId: 'companion',
        handled: true,
        output: { mood: 'steady', note: 'Muse logged session end.' }
      };
    } else if (event.type === 'session.return') {
      const warm = [
        `${greeting}. Want to continue?`,
        `${greeting}. ${closer}.`,
        `${greeting}. Pick up where you left off.`,
        `${greeting}. ${focusCue}.`
      ];
      const direct = ['Welcome back.', 'Back again. Continue.', `${focusCue}.`, `Return confirmed. ${closer}.`];
      text = pick(tone === 'direct' ? direct : warm, 'session.return:text');
    } else if (event.type === 'game.session.start') {
      if (!canEmitPreRunReaction(event, tuning.reactions.preRunCooldownMs, tuning.reactions.maxPreRunBuckets)) {
        return {
          agentId: 'companion',
          handled: true,
          output: { mood: 'steady', note: 'Pre-run reaction cooldown active.' }
        };
      }
      if (!shouldEmitPreRunLine(event, tuning.reactions.preRunChancePercent)) {
        return {
          agentId: 'companion',
          handled: true,
          output: { mood: 'steady', note: 'Pre-run reaction skipped by optional gate.' }
        };
      }
      const warm = [
        `I am with you. ${focusCue}.`,
        `Strong run incoming. ${focusCue}.`,
        `${affirmation}. Make this run yours.`,
        `${companionName} is with you. ${focusCue}.`
      ];
      const direct = ['Focus up.', 'Make this run clean.', `${focusCue}.`, 'Run start. Stay sharp.'];
      text = pick(tone === 'direct' ? direct : warm, 'game.session.start:text');
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
      const warm = [
        `${affirmation}. You earned ${rewardSummary}.`,
        score !== null ? `Score ${score}. You earned ${rewardSummary}.` : `Run complete. You earned ${rewardSummary}.`,
        `Strong finish. ${rewardSummary}.`,
        `${companionName} says nice run. ${rewardSummary}.`
      ];
      const direct = [
        `Run complete. ${rewardSummary}.`,
        score !== null ? `Score ${score}. ${rewardSummary}.` : `${rewardSummary}.`,
        `Logged. ${rewardSummary}.`,
        `Clean finish. ${rewardSummary}.`
      ];
      text = pick(tone === 'direct' ? direct : warm, 'game.complete:text');
    } else if (event.type === 'mission.start') {
      const missionType =
        typeof payload?.missionType === 'string' && payload.missionType.trim() ? payload.missionType.trim() : 'mission';
      const warm = [
        `${greeting}. ${missionType} mission started.`,
        `${focusCue}. ${missionType} mission is live.`,
        `Mission on. ${closer}.`,
        `${companionName} is ready for this ${missionType} mission.`
      ];
      const direct = [
        `${missionType} mission started.`,
        `Mission live. ${focusCue}.`,
        `Start confirmed.`,
        `${focusCue}. Mission active.`
      ];
      text = pick(tone === 'direct' ? direct : warm, 'mission.start:text');
    } else if (event.type === 'mission.complete') {
      const rewards = (payload?.rewards as Record<string, unknown> | undefined) ?? {};
      const xpGranted = clampInteger(rewards.xpGranted, 0);
      const energyGranted = clampInteger(rewards.energyGranted, 0);
      const rewardSummary =
        xpGranted > 0 && energyGranted > 0
          ? `+${xpGranted} XP, +${energyGranted} energy`
          : xpGranted > 0
            ? `+${xpGranted} XP`
            : energyGranted > 0
              ? `+${energyGranted} energy`
              : 'mission complete';
      const warm = [
        `${affirmation}. ${rewardSummary}.`,
        `Mission complete. ${rewardSummary}.`,
        `${companionName} is proud. ${rewardSummary}.`,
        `You wrapped it well. ${rewardSummary}.`
      ];
      const direct = [
        `Mission complete. ${rewardSummary}.`,
        `Done. ${rewardSummary}.`,
        `Completion logged. ${rewardSummary}.`,
        `${rewardSummary}.`
      ];
      text = pick(tone === 'direct' ? direct : warm, 'mission.complete:text');
    } else if (event.type === 'companion.swap') {
      const warm = [
        `${greeting}. ${companionName} is now active.`,
        `${companionName} is with you now.`,
        `Swap complete. ${companionName} is ready.`,
        `${companionName} joined in. ${closer}.`
      ];
      const direct = [
        `${companionName} active.`,
        `Companion swapped. ${companionName} online.`,
        `Swap confirmed.`,
        `${companionName} selected.`
      ];
      text = pick(tone === 'direct' ? direct : warm, 'companion.swap:text');
    } else if (event.type === 'companion.ritual.listen') {
      const warm = [
        `I am listening. Take your time.`,
        `Quiet moment together.`,
        `${companionName} is here with you.`,
        `Breath in, breath out.`
      ];
      const direct = ['Listening.', 'I hear you.', 'Quiet check-in logged.', 'Steady and present.'];
      text = pick(tone === 'direct' ? direct : warm, 'companion.ritual.listen:text');
    } else if (event.type === 'companion.ritual.focus') {
      const warm = [
        `Focus set. We move one step at a time.`,
        `Focused mode is up. ${focusCue}.`,
        `${companionName} is locked in with you.`,
        `We can keep this clean and calm.`
      ];
      const direct = ['Focus set.', 'Focused mode active.', `${focusCue}.`, 'Hold form.'];
      text = pick(tone === 'direct' ? direct : warm, 'companion.ritual.focus:text');
    } else if (event.type === 'companion.ritual.celebrate') {
      const warm = [
        `Nice moment. Let it land.`,
        `Celebrate this one. ${affirmation}.`,
        `${companionName} is celebrating with you.`,
        `Good work. Keep this feeling.`
      ];
      const direct = ['Win logged. Nice.', 'Celebrate complete.', `${affirmation}.`, 'Solid result.'];
      text = pick(tone === 'direct' ? direct : warm, 'companion.ritual.celebrate:text');
    }

    if (!text) {
      return {
        agentId: 'companion',
        handled: true,
        output: { mood: 'steady', note: 'No reaction text generated.' }
      };
    }

    const reaction = {
      text,
      kind: event.type,
      ttlMs: tuning.reactions.ttlMs
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
  handle: async (event) => {
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

    const tuning = await getLoomaTuningConfig();
    const nowMs = parseTime(timestampIso) ?? Date.now();
    const lastWhisperMs = parseTime(lastWhisperAt);
    if (lastWhisperMs && nowMs - lastWhisperMs < tuning.whispers.cooldownMs) {
      return { agentId: 'world', handled: true, output: { note: 'Whisper cooldown active.' } };
    }

    const streakIncreased = streakDays > previousStreakDays && streakDays >= tuning.whispers.streakMinDays;
    const daysSinceLastEnd = daysSince(timestampIso, lastSessionEnd);
    const longBreakReturn = daysSinceLastEnd >= tuning.whispers.longBreakDays;
    if (!streakIncreased && !longBreakReturn) {
      return { agentId: 'world', handled: true, output: { note: 'No whisper trigger.' } };
    }

    const scenario: 'streak' | 'long_break' = longBreakReturn ? 'long_break' : 'streak';
    const text = pickWhisper({ mood, scenario, streakDays, daysSinceLastEnd, timestampIso });
    const whisper = { text, ttlMs: tuning.whispers.ttlMs };

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
