import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { enforceRateLimit } from '$lib/server/safety';
import { sanitizeShareText, generateShareSlug } from '$lib/server/social/share-utils';
import { logGameAudit } from '$lib/server/games/audit';
import { createNotification } from '$lib/server/notifications';
import { canonicalPostPath } from '$lib/threads/permalink';
import { logEvent } from '$lib/server/analytics/log';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type ShareAchievementPayload = {
  key?: unknown;
  text?: unknown;
};

const normalizeRarity = (value: string | null | undefined) => {
  if (!value) return 'Common';
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;

  const authorization = event.request.headers.get('authorization');
  const bearer = authorization && authorization.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;

  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser(bearer && bearer.length > 0 ? bearer : undefined);

  if (authError) {
    console.error('[social/share/achievement] auth error', authError);
    return json(
      { code: 'server_error', message: 'Unable to verify session.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  if (!user) {
    return json(
      { code: 'unauthorized', message: 'You must be signed in to share an achievement.' },
      { status: 401, headers: CACHE_HEADERS }
    );
  }

  let payload: ShareAchievementPayload;

  try {
    payload = (await event.request.json()) as ShareAchievementPayload;
  } catch (cause) {
    console.error('[social/share/achievement] invalid json', cause);
    return json(
      { code: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const keyRaw = payload.key;
  const key = typeof keyRaw === 'string' ? keyRaw.trim() : '';

  const reject = async (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    try {
      await logGameAudit({
        userId: user.id,
        sessionId: null,
        event: 'share_reject',
        ip: clientIp,
        details: {
          code,
          ...details
        }
      });
    } catch (err) {
      console.warn('[social/share/achievement] failed to log audit', err);
    }
    return json({ code, message }, { status, headers: CACHE_HEADERS });
  };

  if (!key) {
    return reject(400, 'invalid_key', 'Achievement key is required.', { key: keyRaw });
  }

  const textResult = sanitizeShareText(payload.text);
  if (!textResult.ok) {
    return reject(400, 'invalid_text', textResult.message, { text: payload.text });
  }

  const rate = enforceRateLimit('social_share', user.id);
  if (!rate.ok) {
    return reject(429, 'rate_limited', 'You are sharing too quickly. Please try again later.');
  }

  const { data: unlockRow, error: unlockError } = await supabase
    .from('user_achievements')
    .select(
      `
        id,
        unlocked_at,
        meta,
        achievement:achievements(id, key, name, points, icon, rarity)
      `
    )
    .eq('user_id', user.id)
    .eq('achievement.key', key)
    .maybeSingle();

  if (unlockError) {
    console.error('[social/share/achievement] unlock lookup failed', unlockError);
    return reject(500, 'server_error', 'Unable to verify achievement.');
  }

  if (!unlockRow || !unlockRow.achievement) {
    return reject(400, 'achievement_not_found', 'Achievement not found for this user.', { key });
  }

  const achievement = unlockRow.achievement;
  const displayRarity = normalizeRarity(achievement.rarity ?? 'common');
  const deepLink = `/app/achievements?highlight=${encodeURIComponent(achievement.key)}`;

  const meta = {
    achievement: {
      key: achievement.key,
      name: achievement.name,
      points: achievement.points,
      icon: achievement.icon,
      rarity: achievement.rarity ?? 'common'
    },
    deepLink,
    preview: {
      kind: 'achievement' as const,
      title: achievement.name,
      subtitle: `${achievement.points ?? 0} pts • ${displayRarity}`,
      icon: achievement.icon
    }
  } satisfies Record<string, unknown>;

  const text = textResult.value ?? '';

  let inserted: { id: string; slug: string | null } | null = null;
  let attempts = 0;

  while (!inserted && attempts < 3) {
    const postSlug = generateShareSlug('achievement', [achievement.key]);
    attempts += 1;

    const { data: dataRow, error: insertError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        kind: 'achievement',
        text,
        body: text,
        slug: postSlug,
        meta,
        deep_link_target: { href: deepLink, kind: 'achievement', key: achievement.key },
        is_public: true
      })
      .select('id, slug')
      .single();

    if (insertError) {
      if (insertError.code === '23505' && attempts < 3) {
        continue;
      }
      console.error('[social/share/achievement] insert failed', insertError);
      return reject(500, 'server_error', 'Unable to create post.');
    }

    inserted = dataRow as { id: string; slug: string | null };
  }

  if (!inserted) {
    return reject(500, 'server_error', 'Unable to create post.');
  }

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.warn('[social/share/achievement] profile lookup failed', profileError);
  }

  const permalink = canonicalPostPath(profileRow?.handle ?? null, inserted.slug ?? null, inserted.id);

  try {
    await createNotification(
      supabase,
      {
        actorId: user.id,
        userId: user.id,
        kind: 'share',
        targetId: inserted.id,
        targetKind: 'post',
        metadata: {
          message: 'Your post is live',
          postId: inserted.id,
          link: permalink,
          kind: 'achievement'
        }
      },
      { allowSelf: true }
    );
  } catch (err) {
    console.warn('[social/share/achievement] notification insert failed', err);
  }

  await logEvent(event, 'share_post', {
    userId: user.id,
    meta: {
      kind: 'achievement',
      key: achievement.key,
      points: achievement.points
    }
  });

  return json({ postId: inserted.id }, { headers: CACHE_HEADERS });
};
