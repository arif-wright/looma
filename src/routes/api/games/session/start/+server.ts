import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { ensureAuth, getActiveGameBySlug, getConfigForGame, hasAbuseFlag } from '$lib/server/games/guard';
import { limit } from '$lib/server/games/rate';
import { logGameAudit } from '$lib/server/games/audit';
import { getDeviceHash } from '$lib/server/utils/device';
import { logEvent } from '$lib/server/analytics/log';
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { ingestServerEvent } from '$lib/server/events/ingest';
import { safeGameApiError } from '$lib/server/games/safeApiError';
import { getActiveCompanionBond } from '$lib/server/companions/bonds';
import { computeEffectiveEnergyMax } from '$lib/player/energy';

const rateLimitPerMinute = Number.parseInt(env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;
const maxSessionsPerDay = Number.parseInt(env.GAME_MAX_SESSIONS_PER_DAY ?? '100', 10) || 100;

const buildCaps = (config: any, fallback: { max_score: number | null }) => ({
  maxDurationMs: config?.max_duration_ms ?? 600000,
  minDurationMs: config?.min_duration_ms ?? 10000,
  maxScorePerMin: config?.max_score_per_min ?? 8000,
  minClientVer: config?.min_client_ver ?? '1.0.0',
  maxScore: fallback.max_score ?? 100000
});

export const POST: RequestHandler = async (event) => {
  try {
    let body: {
      slug?: unknown;
      gameId?: unknown;
      mode?: unknown;
      clientMeta?: unknown;
      clientVersion?: unknown;
    };

    try {
      body = await event.request.json();
    } catch {
      throw error(400, { code: 'bad_request', message: 'Invalid JSON body.' });
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

    const sessionsDayWindowStartIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: recentSessionCount, error: sessionCountError } = await supabase
      .from('game_sessions')
      .select('id', { head: true, count: 'exact' })
      .eq('user_id', user.id)
      .gte('started_at', sessionsDayWindowStartIso);

    if (sessionCountError) {
      console.error('[games] failed to enforce daily session cap', sessionCountError);
      throw error(500, { code: 'server_error', message: 'Unable to start game session.' });
    }

    if (typeof recentSessionCount === 'number' && recentSessionCount >= maxSessionsPerDay) {
      throw error(429, {
        code: 'cap_sessions_daily',
        message: 'Daily session limit reached. Please come back tomorrow.'
      });
    }

    const gameIdRaw = typeof body.gameId === 'string' ? body.gameId.trim() : '';
    const slugRaw = typeof body.slug === 'string' ? body.slug.trim() : '';
    const slug = gameIdRaw || slugRaw;
    const mode = typeof body.mode === 'string' ? body.mode.trim() : null;
    const clientMeta =
      body.clientMeta && typeof body.clientMeta === 'object' && !Array.isArray(body.clientMeta)
        ? (body.clientMeta as Record<string, unknown>)
        : null;
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
    const startedAt = typeof session.started_at === 'string' ? session.started_at : new Date().toISOString();
    const serverNonce = typeof session.nonce === 'string' ? session.nonce : null;

    await logGameAudit({
      userId: user.id,
      sessionId: session.session_id,
      event: 'start',
      ip: clientIp,
      details: {
        slug,
        mode,
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
        mode,
        clientVersion,
        clientMeta,
        deviceHash,
        caps
      }
    });

    const [stats, walletRes, companionBond] = await Promise.all([
      getPlayerStats(event, supabase),
      supabase.from('user_wallets').select('shards').eq('user_id', user.id).maybeSingle(),
      getActiveCompanionBond(user.id, supabase)
    ]);

    const missionEnergyBonus = companionBond?.bonus?.missionEnergyBonus ?? 0;
    const baseEnergyMax = stats?.energy_max ?? null;
    const effectiveEnergyMax =
      typeof baseEnergyMax === 'number'
        ? computeEffectiveEnergyMax(baseEnergyMax, missionEnergyBonus)
        : baseEnergyMax;

    const playerStateSnapshot = {
      xp: stats?.xp ?? 0,
      level: stats?.level ?? 1,
      xpNext: stats?.xp_next ?? null,
      energy: stats?.energy ?? null,
      energyMax: effectiveEnergyMax,
      baseEnergyMax,
      missionEnergyBonus,
      currency: Number(walletRes.data?.shards ?? 0)
    };

    await ingestServerEvent(
      event,
      'game.session.start',
      {
        gameId: game.id,
        gameSlug: game.slug,
        sessionId: session.session_id,
        mode,
        clientMeta
      },
      { sessionId: session.session_id }
    );

    return json({
      sessionId: session.session_id,
      nonce: session.nonce,
      serverNonce,
      startedAt,
      serverTime: Date.now(),
      caps,
      playerStateSnapshot
    });
  } catch (err) {
    return safeGameApiError('start', err);
  }
};
