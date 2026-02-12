import { env as privateEnv } from '$env/dynamic/private';
import type { AgentEvent } from '$lib/agents/types';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export type CompanionTextIntensity = 'light' | 'peak';

type GenerateCompanionTextArgs = {
  event: AgentEvent;
  context?: Record<string, unknown> | null;
  intensity: CompanionTextIntensity;
};

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_LIGHT_MODEL = 'gpt-5-nano';
const DEFAULT_PEAK_MODEL = 'gpt-5-mini';
const LLM_ENABLED = (privateEnv.LOOMA_LLM_ENABLED ?? 'true').toLowerCase() !== 'false';
const PEAK_DAILY_CAP = Number.parseInt(privateEnv.LOOMA_LLM_PEAK_DAILY_CAP ?? '2', 10) || 2;
const LIGHT_INPUT_TOKENS = 1000;
const LIGHT_OUTPUT_TOKENS = 120;
const PEAK_INPUT_TOKENS = 1200;
const PEAK_OUTPUT_TOKENS = 150;

const toMaxChars = (tokens: number) => Math.max(0, Math.floor(tokens * 4));
const clampText = (value: string, maxTokens: number) => value.trim().slice(0, toMaxChars(maxTokens));
const clampWords = (value: string, maxWords: number) =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join(' ');

const readString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const readNumber = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const extractResponseText = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const outputText = record.output_text;
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim();
  if (Array.isArray(outputText)) {
    const joined = outputText.filter((part): part is string => typeof part === 'string').join(' ').trim();
    if (joined) return joined;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as Array<Record<string, unknown>>)
      : [];
    for (const block of content) {
      const text = block?.text;
      if (typeof text === 'string' && text.trim()) {
        parts.push(text.trim());
      }
    }
  }
  const merged = parts.join(' ').trim();
  return merged || null;
};

const getModelForIntensity = (intensity: CompanionTextIntensity) =>
  intensity === 'peak'
    ? privateEnv.LOOMA_LLM_PEAK_MODEL || DEFAULT_PEAK_MODEL
    : privateEnv.LOOMA_LLM_LIGHT_MODEL || DEFAULT_LIGHT_MODEL;

const getTokenCaps = (intensity: CompanionTextIntensity) =>
  intensity === 'peak'
    ? { input: PEAK_INPUT_TOKENS, output: PEAK_OUTPUT_TOKENS }
    : { input: LIGHT_INPUT_TOKENS, output: LIGHT_OUTPUT_TOKENS };

const getCompanionName = (context: Record<string, unknown> | null | undefined) => {
  const companion = (context?.companion as Record<string, unknown> | undefined)?.active as
    | Record<string, unknown>
    | undefined;
  const rawName = companion?.name;
  return typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Muse';
};

const buildContextSummary = (args: {
  event: AgentEvent;
  context: Record<string, unknown> | null | undefined;
  intensity: CompanionTextIntensity;
}) => {
  const world = (args.context?.worldState as Record<string, unknown> | undefined) ?? {};
  const portable = (args.context?.portableState as Record<string, unknown> | undefined) ?? {};
  const companion = ((args.context?.companion as Record<string, unknown> | undefined)?.active ??
    {}) as Record<string, unknown>;

  const summary = {
    eventType: args.event.type,
    timestamp: args.event.timestamp,
    intensity: args.intensity,
    companionName: readString(companion.name, 'Muse'),
    companionMood: readString(world.companionMood, 'steady'),
    streakDays: readNumber(world.streakDays, 0),
    previousStreakDays: readNumber(world.previousStreakDays, 0),
    daysSinceLastEnd:
      typeof world.lastSessionEnd === 'string' && world.lastSessionEnd
        ? Math.max(0, Math.floor((Date.parse(args.event.timestamp) - Date.parse(world.lastSessionEnd)) / (24 * 60 * 60 * 1000)))
        : 0,
    preferredTone: readString(portable.tone, 'warm')
  };

  return summary;
};

const hasPeakBudget = async (userId: string): Promise<boolean> => {
  const admin = tryGetSupabaseAdminClient();
  if (!admin || !userId) return true;
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error } = await admin
      .from('llm_usage_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('intensity', 'peak')
      .gte('created_at', dayStart.toISOString());
    if (error) {
      const code = (error as { code?: string | null }).code ?? null;
      if (code !== '42P01' && code !== 'PGRST205') {
        console.error('[llm] peak budget check failed', error);
      }
      return true;
    }
    return (count ?? 0) < PEAK_DAILY_CAP;
  } catch (err) {
    console.error('[llm] peak budget check threw', err);
    return true;
  }
};

const logUsage = async (args: { userId: string; intensity: CompanionTextIntensity; model: string; outputChars: number }) => {
  const admin = tryGetSupabaseAdminClient();
  if (!admin || !args.userId) return;
  try {
    await admin.from('llm_usage_logs').insert({
      user_id: args.userId,
      intensity: args.intensity,
      model: args.model,
      output_chars: args.outputChars
    });
  } catch (err) {
    console.error('[llm] usage log insert failed', err);
  }
};

export const classifyCompanionLlmIntensity = (args: {
  event: AgentEvent;
  context?: Record<string, unknown> | null;
}): CompanionTextIntensity | null => {
  const type = args.event.type;
  const world = (args.context?.worldState as Record<string, unknown> | undefined) ?? {};
  const streakDays = readNumber(world.streakDays, 0);
  const previousStreakDays = readNumber(world.previousStreakDays, 0);
  const lastEnd = readString(world.lastSessionEnd, '');
  const daysSinceLastEnd =
    lastEnd && Number.isFinite(Date.parse(lastEnd)) && Number.isFinite(Date.parse(args.event.timestamp))
      ? Math.max(0, Math.floor((Date.parse(args.event.timestamp) - Date.parse(lastEnd)) / (24 * 60 * 60 * 1000)))
      : 0;

  if (type === 'companion.evolve' || type === 'bond.milestone') return 'peak';
  if (type === 'session.return' && daysSinceLastEnd >= 3) return 'peak'; // session.return_long_absence
  if (type === 'session.start' && streakDays >= 7 && streakDays > previousStreakDays) return 'peak'; // major_streak
  if (type === 'session.start' || type === 'session.end') return 'light';
  return null;
};

export const generateCompanionText = async (args: GenerateCompanionTextArgs): Promise<string | null> => {
  if (!LLM_ENABLED) return null;
  const apiKey = privateEnv.OPENAI_API_KEY;
  if (!apiKey) return null;

  const userId = args.event.meta?.userId ?? null;
  let intensity: CompanionTextIntensity = args.intensity;
  if (intensity === 'peak' && userId) {
    const allowed = await hasPeakBudget(userId);
    if (!allowed) intensity = 'light';
  }

  const caps = getTokenCaps(intensity);
  const model = getModelForIntensity(intensity);
  const contextSummary = buildContextSummary({
    event: args.event,
    context: args.context,
    intensity
  });
  const companionName = getCompanionName(args.context);

  const systemPrompt = [
    'You write one short Looma companion reaction.',
    'Constraints: one sentence, max 18 words, warm but concise, no emojis, no guilt language.',
    'No safety disclaimers, no markdown.'
  ].join(' ');

  const userPrompt = JSON.stringify(contextSummary);
  const input = clampText(`Context: ${userPrompt}`, caps.input);

  try {
    const res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_output_tokens: caps.output,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
          {
            role: 'user',
            content: `Companion name is ${companionName}. Return only the sentence text.`
          }
        ]
      })
    });

    if (!res.ok) return null;
    const payload = (await res.json().catch(() => null)) as unknown;
    const text = extractResponseText(payload);
    if (!text) return null;

    const normalized = text.replace(/\s+/g, ' ');
    const cleaned = clampWords(clampText(normalized, caps.output), 18);
    if (!cleaned) return null;

    if (userId) {
      await logUsage({ userId, intensity, model, outputChars: cleaned.length });
    }
    return cleaned;
  } catch {
    return null;
  }
};
