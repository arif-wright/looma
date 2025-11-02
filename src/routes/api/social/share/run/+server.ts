import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { enforceRateLimit } from '$lib/server/safety';
import { ensureUuid } from '$lib/server/engagement';
import { sanitizeShareText, generateShareSlug, formatScore, toSeconds } from '$lib/server/social/share-utils';
import { logGameAudit } from '$lib/server/games/audit';
import { createNotification } from '$lib/server/notifications';
import { canonicalPostPath } from '$lib/threads/permalink';

type ShareRunPayload = {
  sessionId?: unknown;
  score?: unknown;
  durationMs?: unknown;
  slug?: unknown;
  text?: unknown;
};

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

const numberFrom = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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
    console.error('[social/share/run] auth error', authError);
    return json(
      { code: 'server_error', message: 'Unable to verify session.' },
      { status: 500, headers: CACHE_HEADERS }
    );
  }

  if (!user) {
    return json(
      { code: 'unauthorized', message: 'You must be signed in to share a run.' },
      { status: 401, headers: CACHE_HEADERS }
    );
  }

  let payload: ShareRunPayload;

  try {
    payload = (await event.request.json()) as ShareRunPayload;
  } catch (cause) {
    console.error('[social/share/run] invalid json', cause);
    return json(
      { code: 'bad_request', message: 'Invalid JSON body.' },
      { status: 400, headers: CACHE_HEADERS }
    );
  }

  const sessionIdRaw = payload.sessionId;
  const slugRaw = payload.slug;
  const scoreRaw = payload.score;
  const durationRaw = payload.durationMs;

  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw : String(sessionIdRaw ?? '');
  const slug = typeof slugRaw === 'string' ? slugRaw.trim().toLowerCase() : '';
  const scoreValue = numberFrom(scoreRaw);
  const durationValue = numberFrom(durationRaw);

  const reject = async (
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>
  ) => {
    try {
      await logGameAudit({
        userId: user.id,
        sessionId: ensureUuid(sessionId) ? sessionId : null,
        event: 'share_reject',
        ip: clientIp,
        details: {
          code,
          ...details
        }
      });
    } catch (err) {
      console.warn('[social/share/run] failed to log audit', err);
    }
    return json({ code, message }, { status, headers: CACHE_HEADERS });
  };

  if (!ensureUuid(sessionId)) {
    return reject(400, 'invalid_session', 'A valid sessionId is required.', { sessionId });
  }

  if (!slug || slug.length < 2) {
    return reject(400, 'invalid_slug', 'Game slug is required.', { slug });
  }

  if (scoreValue === null || scoreValue < 0) {
    return reject(400, 'invalid_score', 'Score must be a positive number.', { score: scoreRaw });
  }

  if (durationValue === null || durationValue < 0) {
    return reject(400, 'invalid_duration', 'Duration must be a positive number.', {
      duration: durationRaw
    });
  }

  const textResult = sanitizeShareText(payload.text);
  if (!textResult.ok) {
    return reject(400, 'invalid_text', textResult.message, { text: payload.text });
  }

  const rate = enforceRateLimit('social_share', user.id);
  if (!rate.ok) {
    return reject(429, 'rate_limited', 'You are sharing too quickly. Please try again in a bit.');
  }

  const { data: gameRow, error: gameError } = await supabase
    .from('game_titles')
    .select('id, slug, name, max_score')
    .eq('slug', slug)
    .maybeSingle();

  if (gameError) {
    console.error('[social/share/run] game lookup failed', gameError);
    return reject(500, 'server_error', 'Unable to verify game.');
  }

  if (!gameRow) {
    return reject(400, 'game_not_found', 'Game not found.', { slug });
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id, user_id, game_id, status, score, duration_ms')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) {
    console.error('[social/share/run] session lookup failed', sessionError);
    return reject(500, 'server_error', 'Unable to verify session.');
  }

  if (!sessionRow) {
    return reject(400, 'session_not_found', 'Session not found.', { sessionId });
  }

  if (sessionRow.user_id !== user.id) {
    return reject(400, 'forbidden', 'That session does not belong to you.', { sessionId });
  }

  if (sessionRow.game_id !== gameRow.id) {
    return reject(400, 'mismatch', 'Session does not match the requested game.', {
      sessionGameId: sessionRow.game_id,
      slug
    });
  }

  if (sessionRow.status !== 'completed') {
    return reject(400, 'not_completed', 'Only completed sessions can be shared.', {
      status: sessionRow.status
    });
  }

  const finalScore = Math.max(0, Math.floor(sessionRow.score ?? scoreValue ?? 0));
  const finalDuration = Math.max(0, Math.floor(sessionRow.duration_ms ?? durationValue ?? 0));

  const deepLink = `/app/games/${gameRow.slug}`;

  const meta = {
    game: {
      slug: gameRow.slug,
      name: gameRow.name
    },
    score: finalScore,
    durationMs: finalDuration,
    sessionId,
    deepLink,
    preview: {
      kind: 'run' as const,
      title: `${gameRow.name} — ${formatScore(finalScore)} pts`,
      subtitle: `${toSeconds(finalDuration)}s run`
    }
  } satisfies Record<string, unknown>;

  const text = textResult.value ?? '';

  let inserted: { id: string; slug: string | null } | null = null;
  let attempts = 0;

  while (!inserted && attempts < 3) {
    const postSlug = generateShareSlug('run', [gameRow.slug, sessionId]);
    attempts += 1;

    const { data: dataRow, error: insertError } = await supabase
      .from('posts')
      .insert({
        user_id: user.id,
        kind: 'run',
        text,
        body: text,
        slug: postSlug,
        meta,
        deep_link_target: { href: deepLink, kind: 'game' },
        is_public: true
      })
      .select('id, slug')
      .single();

    if (insertError) {
      if (insertError.code === '23505' && attempts < 3) {
        continue;
      }
      console.error('[social/share/run] insert failed', insertError);
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
    console.warn('[social/share/run] profile lookup failed', profileError);
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
          kind: 'run'
        }
      },
      { allowSelf: true }
    );
  } catch (err) {
    console.warn('[social/share/run] notification insert failed', err);
  }

  return json({ postId: inserted.id }, { headers: CACHE_HEADERS });
};
