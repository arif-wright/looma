import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ensureAuth, getActiveGameBySlug, getConfigForGame, hasAbuseFlag } from '$lib/server/games/guard';
import { limit } from '$lib/server/games/rate';
import { logGameAudit } from '$lib/server/games/audit';
import { getDeviceHash } from '$lib/server/utils/device';
import { logEvent } from '$lib/server/analytics/log';

const rateLimitPerMinute = Number.parseInt(env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;

const buildCaps = (config: any, fallback: { max_score: number | null }) => ({
  maxDurationMs: config?.max_duration_ms ?? 600000,
  minDurationMs: config?.min_duration_ms ?? 10000,
  maxScorePerMin: config?.max_score_per_min ?? 8000,
  minClientVer: config?.min_client_ver ?? '1.0.0',
  maxScore: fallback.max_score ?? 100000
});

export const POST: RequestHandler = async (event) => {
  let body: { slug?: unknown; clientVersion?: unknown };

  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400 });
  }

  const { user, supabase } = await ensureAuth(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;

  limit(`games:start:user:${user.id}`, rateLimitPerMinute);
  if (clientIp) {
    limit(`games:start:ip:${clientIp}`, rateLimitPerMinute);
  }

  if (await hasAbuseFlag(user.id)) {
    throw error(403, { code: 'restricted', message: 'Account is temporarily restricted.' });
  }

  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  const clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion.trim() : null;

  if (!slug) {
    throw error(400, { code: 'bad_request', message: 'Game slug is required.' });
  }

  const game = await getActiveGameBySlug(supabase, slug);
  if (!game) {
    throw error(404, { code: 'not_found', message: 'Game not available.' });
  }

  const config = await getConfigForGame(supabase, game.id);

  const { data, error: rpcError } = await supabase.rpc('fn_game_start', { p_slug: slug });

  if (rpcError || !data || data.length === 0) {
    await logGameAudit({
      userId: user.id,
      sessionId: null,
      event: 'reject',
      ip: clientIp,
      details: {
        slug,
        reason: 'fn_game_start_failed',
        error: rpcError?.message ?? null
      }
    });
    console.error('[games] fn_game_start failed', rpcError);
    throw error(500, { code: 'server_error', message: 'Unable to start game session.' });
  }

  const session = data[0];
  const caps = buildCaps(config, game);

  await logGameAudit({
    userId: user.id,
    sessionId: session.session_id,
    event: 'start',
    ip: clientIp,
    details: {
      slug,
      clientVersion
    }
  });

  const deviceHash = getDeviceHash(event);

  await logEvent(event, 'game_start', {
    userId: user.id,
    sessionId: session.session_id,
    gameId: game.id,
    meta: {
      slug,
      clientVersion,
      deviceHash,
      caps
    }
  });

  return json({
    sessionId: session.session_id,
    nonce: session.nonce,
    serverTime: Date.now(),
    caps
  });
};
