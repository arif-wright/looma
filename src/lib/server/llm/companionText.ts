import { env as privateEnv } from '$env/dynamic/private';
import type { AgentEvent } from '$lib/agents/types';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export type CompanionTextIntensity = 'light' | 'peak';

type GenerateCompanionTextArgs = {
  event: AgentEvent;
  context?: Record<string, unknown> | null;
  intensity: CompanionTextIntensity;
};

export type CompanionTextDebug = {
  status: 'ok' | 'skipped' | 'failed';
  reason: string;
  model?: string;
  httpStatus?: number;
  detail?: string;
};

export type CompanionTextResult = {
  text: string | null;
  debug: CompanionTextDebug;
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
    const parts: string[] = [];
    for (const part of outputText) {
      if (typeof part === 'string' && part.trim()) {
        parts.push(part.trim());
        continue;
      }
      if (!part || typeof part !== 'object') continue;
      const obj = part as Record<string, unknown>;
      if (typeof obj.text === 'string' && obj.text.trim()) {
        parts.push(obj.text.trim());
        continue;
      }
      if (obj.text && typeof obj.text === 'object' && typeof (obj.text as Record<string, unknown>).value === 'string') {
        const value = String((obj.text as Record<string, unknown>).value).trim();
        if (value) parts.push(value);
        continue;
      }
      if (typeof obj.value === 'string' && obj.value.trim()) {
        parts.push(obj.value.trim());
      }
    }
    const joined = parts.join(' ').trim();
    if (joined) return joined;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const itemRecord = item as Record<string, unknown>;

    // Some Responses payloads include non-message output blocks. If a summary exists, use it as a fallback.
    const summary = Array.isArray(itemRecord.summary)
      ? (itemRecord.summary as Array<Record<string, unknown>>)
      : [];
    for (const block of summary) {
      if (typeof block?.text === 'string' && block.text.trim()) {
        parts.push(block.text.trim());
        continue;
      }
      const blockText = block?.text;
      if (blockText && typeof blockText === 'object' && typeof (blockText as Record<string, unknown>).value === 'string') {
        const value = String((blockText as Record<string, unknown>).value).trim();
        if (value) parts.push(value);
      }
    }

    const content = Array.isArray(itemRecord.content) ? (itemRecord.content as Array<Record<string, unknown>>) : [];
    for (const block of content) {
      const text = block?.text;
      if (typeof text === 'string' && text.trim()) {
        parts.push(text.trim());
        continue;
      }
      if (text && typeof text === 'object' && typeof (text as Record<string, unknown>).value === 'string') {
        const value = String((text as Record<string, unknown>).value).trim();
        if (value) {
          parts.push(value);
          continue;
        }
      }
      if (typeof block?.value === 'string' && block.value.trim()) {
        parts.push(block.value.trim());
      }
    }
  }
  const merged = parts.join(' ').trim();
  return merged || null;
};

const describePayloadShape = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') return 'non_object_payload';
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record).slice(0, 6).join(',');
  const outputLen = Array.isArray(record.output) ? record.output.length : 0;
  const outputTextType = Array.isArray(record.output_text) ? 'array' : typeof record.output_text;
  const status = typeof record.status === 'string' ? record.status : typeof record.status;
  const first = Array.isArray(record.output) && record.output[0] && typeof record.output[0] === 'object'
    ? (record.output[0] as Record<string, unknown>)
    : null;
  const firstType = first && typeof first.type === 'string' ? first.type : typeof first?.type;
  const firstKeys = first ? Object.keys(first).slice(0, 6).join(',') : 'none';
  const contentLen = first && Array.isArray(first.content) ? first.content.length : 0;
  return `keys:${keys}|status:${status}|output_len:${outputLen}|output_text:${outputTextType}|output0_type:${firstType}|output0_keys:${firstKeys}|content_len:${contentLen}`;
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
  const payload = (args.event.payload ?? {}) as Record<string, unknown>;
  const world = (args.context?.worldState as Record<string, unknown> | undefined) ?? {};
  const portable = (args.context?.portableState as Record<string, unknown> | undefined) ?? {};
  const companion = ((args.context?.companion as Record<string, unknown> | undefined)?.active ??
    {}) as Record<string, unknown>;
  const reflectionRaw = readString(payload.reflection, '');
  const reflectionExcerpt = clampWords(clampText(reflectionRaw, 120), 24);
  const ritualMood = readString(payload.mood, '');

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
    preferredTone: readString(portable.tone, 'warm'),
    ritualMood: ritualMood || null,
    reflectionExcerpt: reflectionExcerpt || null
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
  if (type === 'companion.ritual.listen') return 'light';
  if (type === 'companion.ritual.focus' || type === 'companion.ritual.celebrate') return 'light';
  if (type === 'mission.complete') {
    const payload = (args.event.payload ?? {}) as Record<string, unknown>;
    const milestone = payload.dailyStreakMilestone;
    if (milestone && typeof milestone === 'object') return 'peak';
  }
  if (type === 'session.return' && daysSinceLastEnd >= 3) return 'peak'; // session.return_long_absence
  if (type === 'session.start' && streakDays >= 7 && streakDays > previousStreakDays) return 'peak'; // major_streak
  if (type === 'session.start' || type === 'session.end') return 'light';
  return null;
};

export const generateCompanionText = async (args: GenerateCompanionTextArgs): Promise<string | null> => {
  const result = await generateCompanionTextWithDebug(args);
  return result.text;
};

export const generateCompanionTextWithDebug = async (args: GenerateCompanionTextArgs): Promise<CompanionTextResult> => {
  if (!LLM_ENABLED) return { text: null, debug: { status: 'skipped', reason: 'llm_disabled' } };
  const apiKey = privateEnv.OPENAI_API_KEY;
  if (!apiKey) return { text: null, debug: { status: 'skipped', reason: 'missing_api_key' } };

  const userId = args.event.meta?.userId ?? null;
  let intensity: CompanionTextIntensity = args.intensity;
  let downgradedFromPeak = false;
  if (intensity === 'peak' && userId) {
    const allowed = await hasPeakBudget(userId);
    if (!allowed) {
      intensity = 'light';
      downgradedFromPeak = true;
    }
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
        reasoning: { effort: 'minimal' },
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

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).trim().slice(0, 180);
      return {
        text: null,
        debug: {
          status: 'failed',
          reason: `http_${res.status}`,
          model,
          httpStatus: res.status,
          detail
        }
      };
    }
    const payload = (await res.json().catch(() => null)) as unknown;
    if (!payload || typeof payload !== 'object') {
      return {
        text: null,
        debug: {
          status: 'failed',
          reason: 'invalid_json_payload',
          model
        }
      };
    }
    const text = extractResponseText(payload);
    if (!text) {
      return {
        text: null,
        debug: {
          status: 'failed',
          reason: 'parse_no_text',
          model,
          detail: describePayloadShape(payload)
        }
      };
    }

    const normalized = text.replace(/\s+/g, ' ');
    const cleaned = clampWords(clampText(normalized, caps.output), 18);
    if (!cleaned) {
      return {
        text: null,
        debug: {
          status: 'failed',
          reason: 'empty_after_cleanup',
          model
        }
      };
    }

    if (userId) {
      await logUsage({ userId, intensity, model, outputChars: cleaned.length });
    }
    return {
      text: cleaned,
      debug: {
        status: 'ok',
        reason: downgradedFromPeak ? 'ok_peak_budget_downgraded' : 'ok',
        model
      }
    };
  } catch (err) {
    return {
      text: null,
      debug: {
        status: 'failed',
        reason: 'network_error',
        model,
        detail: err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180)
      }
    };
  }
};
