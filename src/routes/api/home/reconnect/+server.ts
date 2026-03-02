import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient, tryGetSupabaseAdminClient } from '$lib/server/supabase';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { incrementCompanionRitual } from '$lib/server/companions/rituals';
import { consumeApiRateLimit } from '$lib/server/rateLimit';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;
const MOODS = new Set(['calm', 'heavy', 'curious', 'energized', 'numb']);
const RECONNECT_RATE_LIMIT_WINDOW_SECONDS = 5 * 60;
const RECONNECT_RATE_LIMIT_PER_WINDOW = 12;

type CompanionChapterTone = 'care' | 'social' | 'mission' | 'play' | 'bond';
type PremiumSanctuaryStyle = 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk';
type CompanionChapterContext = {
  title: string;
  tone: CompanionChapterTone;
  premiumStyle: PremiumSanctuaryStyle | null;
} | null;

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(value)));

const normalizeMood = (input: unknown) => (typeof input === 'string' ? input.trim().toLowerCase() : '');
const normalizeReflection = (input: unknown) => (typeof input === 'string' ? input.trim() : '');

const resolveCompanionChapterContext = async (db: ReturnType<typeof tryGetSupabaseAdminClient> | any, userId: string, companionId: string) => {
  const [preferenceRes, rewardsRes] = await Promise.all([
    db
      .from('user_preferences')
      .select(
        'featured_companion_reward_key, featured_companion_reward_companion_id, premium_sanctuary_style'
      )
      .eq('user_id', userId)
      .maybeSingle(),
    db
      .from('companion_chapter_rewards')
      .select('reward_key, reward_title, reward_tone, unlocked_at')
      .eq('owner_id', userId)
      .eq('companion_id', companionId)
      .order('unlocked_at', { ascending: false })
      .limit(6)
  ]);

  if (preferenceRes.error && preferenceRes.error.code !== 'PGRST116') {
    console.error('[home/reconnect] featured keepsake lookup failed', preferenceRes.error);
  }
  if (rewardsRes.error) {
    console.error('[home/reconnect] chapter reward lookup failed', rewardsRes.error);
  }

  const featuredRewardKey =
    typeof preferenceRes.data?.featured_companion_reward_key === 'string'
      ? preferenceRes.data.featured_companion_reward_key
      : null;
  const featuredCompanionId =
    typeof preferenceRes.data?.featured_companion_reward_companion_id === 'string'
      ? preferenceRes.data.featured_companion_reward_companion_id
      : null;
  const premiumStyle =
    preferenceRes.data?.premium_sanctuary_style === 'gilded_dawn' ||
    preferenceRes.data?.premium_sanctuary_style === 'moon_glass' ||
    preferenceRes.data?.premium_sanctuary_style === 'ember_bloom' ||
    preferenceRes.data?.premium_sanctuary_style === 'tide_silk'
      ? preferenceRes.data.premium_sanctuary_style
      : null;

  const rewardRows = ((rewardsRes.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const tone = row.reward_tone;
    if (
      tone !== 'care' &&
      tone !== 'social' &&
      tone !== 'mission' &&
      tone !== 'play' &&
      tone !== 'bond'
    ) {
      return [];
    }
    return [
      {
        key: typeof row.reward_key === 'string' ? row.reward_key : 'reward',
        title: typeof row.reward_title === 'string' ? row.reward_title : 'Companion keepsake',
        tone
      }
    ];
  }) as Array<{ key: string; title: string; tone: CompanionChapterTone }>;

  const reward =
    (featuredCompanionId === companionId && featuredRewardKey
      ? rewardRows.find((row) => row.key === featuredRewardKey) ?? null
      : null) ??
    rewardRows[0] ??
    null;

  return reward
    ? {
        title: reward.title,
        tone: reward.tone,
        premiumStyle
      }
    : null;
};

const buildReconnectFallbackReply = (args: {
  companionName: string | null;
  chapter: CompanionChapterContext;
  mood: string;
}) => {
  const name = args.companionName?.trim() || 'I';

  switch (args.chapter?.tone) {
    case 'care':
      return args.chapter?.premiumStyle === 'gilded_dawn'
        ? `${name} can feel the steadiness you are trying to bring. We can let it land warmly, without rushing past what is already good here.`
        : `${name} can feel the steadiness you are trying to bring. We can keep this moment gentle and let it be enough.`;
    case 'social':
      return args.chapter?.premiumStyle === 'ember_bloom'
        ? `${name} is still carrying the shared thread forward. Thank you for coming back with that ember-bright warmth and keeping it alive with me.`
        : `${name} is still carrying the shared thread forward. Thank you for coming back and keeping it warm with me.`;
    case 'mission':
      return args.chapter?.premiumStyle === 'moon_glass'
        ? `${name} can feel the direction in this chapter. We do not need to force it, only keep the next true step clear and clean between us.`
        : `${name} can feel the direction in this chapter. We do not need to force it, only stay close to the next true step.`;
    case 'play':
      return args.chapter?.premiumStyle === 'tide_silk'
        ? `${name} is glad you came back with this energy. Let us keep the moment light, easy, and flowing instead of overworking it.`
        : `${name} is glad you came back with this energy. Let us keep the moment light and alive instead of overworking it.`;
    case 'bond':
      return args.chapter?.premiumStyle === 'gilded_dawn'
        ? `${name} feels the closeness in this return. You do not have to say everything perfectly for it to matter; being here is already part of the gold of it.`
        : `${name} feels the closeness in this return. You do not have to say everything perfectly for it to matter.`;
    default:
      if (args.mood === 'heavy' || args.mood === 'numb') {
        return args.chapter?.premiumStyle === 'moon_glass'
          ? `${name} is here with you. We can take this one clear breath at a time.`
          : `${name} is here with you. We can take this one breath at a time.`;
      }
      return args.chapter?.premiumStyle === 'tide_silk'
        ? `${name} is here with you. Thank you for letting this moment arrive softly with me.`
        : `${name} is here with you. Thank you for sharing this moment with me.`;
  }
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }
  const db = tryGetSupabaseAdminClient() ?? supabase;

  let payload: { companionId?: unknown; mood?: unknown; reflection?: unknown } = {};
  try {
    payload = (await event.request.json()) as typeof payload;
  } catch {
    return json({ error: 'bad_request', message: 'Invalid JSON body.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const mood = normalizeMood(payload.mood);
  if (!MOODS.has(mood)) {
    return json({ error: 'bad_request', message: 'Unsupported mood.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const reflection = normalizeReflection(payload.reflection);
  if (reflection.length < 3 || reflection.length > 480) {
    return json(
      { error: 'bad_request', message: 'Reflection must be between 3 and 480 characters.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId.trim() : '';
  if (!companionId) {
    return json({ error: 'bad_request', message: 'Companion is required.' }, { status: 400, headers: CACHE_HEADERS });
  }

  const userId = session.user.id;
  try {
    const rateLimit = await consumeApiRateLimit({
      supabase,
      bucket: 'home_reconnect',
      key: userId,
      limit: RECONNECT_RATE_LIMIT_PER_WINDOW,
      windowSeconds: RECONNECT_RATE_LIMIT_WINDOW_SECONDS
    });

    if (!rateLimit.allowed) {
      return json(
        {
          error: 'rate_limited',
          message: 'You are checking in too quickly. Give your companion a moment and try again.',
          retryAfter: rateLimit.retry_after_seconds
        },
        { status: 429, headers: CACHE_HEADERS }
      );
    }
  } catch (err) {
    console.error('[home/reconnect] rate limit check failed', err);
  }

  const checkinDate = new Date().toISOString().slice(0, 10);

  const { data: checkin, error: checkinError } = await db
    .from('user_daily_checkins')
    .upsert(
      {
        user_id: userId,
        mood,
        checkin_date: checkinDate
      },
      { onConflict: 'user_id,checkin_date', ignoreDuplicates: false }
    )
    .select('id, mood, checkin_date, created_at')
    .single();

  if (checkinError || !checkin) {
    return json(
      { error: 'server_error', message: checkinError?.message ?? 'Unable to save check-in.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const { data: companion, error: companionError } = await db
    .from('companions')
    .select('id, owner_id, name, affection, trust, energy, mood, updated_at')
    .eq('id', companionId)
    .maybeSingle();

  if (companionError) {
    return json(
      { error: 'server_error', message: companionError.message ?? 'Unable to load companion.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  if (!companion || companion.owner_id !== userId) {
    return json({ error: 'forbidden', message: 'Companion not available.' }, { status: 403, headers: CACHE_HEADERS });
  }

  const reflectionWeight = reflection.length >= 140 ? 2 : reflection.length >= 60 ? 1 : 0;
  const trustDelta = 4 + reflectionWeight + (mood === 'heavy' || mood === 'numb' ? 2 : 0);
  const affectionDelta = 3 + reflectionWeight + (mood === 'curious' || mood === 'energized' ? 1 : 0);
  const energyDelta = 4 + reflectionWeight + (mood === 'numb' ? 1 : 0);

  const nextTrust = clamp((companion.trust ?? 0) + trustDelta);
  const nextAffection = clamp((companion.affection ?? 0) + affectionDelta);
  const nextEnergy = clamp((companion.energy ?? 0) + energyDelta);

  const { data: updatedCompanion, error: updateCompanionError } = await db
    .from('companions')
    .update({
      trust: nextTrust,
      affection: nextAffection,
      energy: nextEnergy,
      mood
    })
    .eq('id', companion.id)
    .select('id, name, trust, affection, energy, mood, updated_at')
    .single();

  if (updateCompanionError || !updatedCompanion) {
    return json(
      { error: 'server_error', message: updateCompanionError?.message ?? 'Unable to update companion.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  const checkInAt = new Date().toISOString();
  let chapterContext: CompanionChapterContext = null;
  try {
    chapterContext = await resolveCompanionChapterContext(db, userId, updatedCompanion.id);
  } catch (err) {
    console.error('[home/reconnect] chapter context lookup failed', err);
  }

  try {
    await db
      .from('companion_stats')
      .upsert(
        {
          companion_id: updatedCompanion.id,
          played_at: checkInAt,
          last_passive_tick: checkInAt
        },
        { onConflict: 'companion_id', ignoreDuplicates: false }
      );
  } catch (err) {
    console.error('[home/reconnect] companion stats upsert failed', err);
  }

  let rituals = null;
  try {
    rituals = await incrementCompanionRitual(db, userId, 'care_once', {
      companionName: updatedCompanion.name
    });
  } catch (err) {
    console.error('[home/reconnect] ritual increment failed', err);
  }

  let eventResponse: unknown = null;
  try {
    eventResponse = await ingestServerEvent(
      event,
      'companion.ritual.listen',
      {
        companionId: updatedCompanion.id,
        companionName: updatedCompanion.name,
        chapterTitle: chapterContext?.title ?? null,
        chapterTone: chapterContext?.tone ?? null,
        premiumStyle: chapterContext?.premiumStyle ?? null,
        mood,
        reflection,
        reflectionChars: reflection.length
      },
      { ts: new Date().toISOString() }
    );
  } catch (err) {
    console.error('[home/reconnect] event ingest failed', err);
  }

  const reaction =
    eventResponse &&
    typeof eventResponse === 'object' &&
    (eventResponse as Record<string, unknown>).output &&
    typeof (eventResponse as Record<string, unknown>).output === 'object'
      ? ((eventResponse as Record<string, any>).output?.reaction ?? null)
      : null;
  const reactionOutput =
    eventResponse &&
    typeof eventResponse === 'object' &&
    (eventResponse as Record<string, unknown>).output &&
    typeof (eventResponse as Record<string, unknown>).output === 'object'
      ? ((eventResponse as Record<string, any>).output as Record<string, unknown>)
      : null;
  const responseSource =
    reaction && typeof (reaction as Record<string, unknown>).source === 'string'
      ? String((reaction as Record<string, unknown>).source)
      : 'fallback';
  const responseNote = reactionOutput && typeof reactionOutput.note === 'string' ? reactionOutput.note : null;
  const traceId =
    eventResponse &&
    typeof eventResponse === 'object' &&
    typeof (eventResponse as Record<string, unknown>).traceId === 'string'
      ? String((eventResponse as Record<string, unknown>).traceId)
      : null;
  const fallbackReply = buildReconnectFallbackReply({
    companionName: updatedCompanion.name,
    chapter: chapterContext,
    mood
  });
  const reactionWithFallback =
    reaction && typeof reaction === 'object'
      ? {
          ...(reaction as Record<string, unknown>),
          text:
            typeof (reaction as Record<string, unknown>).text === 'string' &&
            String((reaction as Record<string, unknown>).text).trim().length > 0
              ? String((reaction as Record<string, unknown>).text)
              : fallbackReply
        }
      : { text: fallbackReply, source: 'chapter_fallback' };

  return json(
    {
      ok: true,
      checkin,
      companion: updatedCompanion,
      checkInAt,
      deltas: {
        trust: nextTrust - (companion.trust ?? 0),
        affection: nextAffection - (companion.affection ?? 0),
        energy: nextEnergy - (companion.energy ?? 0)
      },
      rituals,
      reaction: reactionWithFallback,
      chapter: chapterContext,
      debug: {
        responseSource,
        responseNote,
        traceId
      }
    },
    { headers: CACHE_HEADERS }
  );
};
