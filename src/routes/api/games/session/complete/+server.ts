import { env } from '$env/dynamic/private';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ensureAuth,
  getSession,
  getGameById,
  getConfigForGame,
  hasAbuseFlag,
  getAdminClient
} from '$lib/server/games/guard';
import { calculateRewards, persistRewards } from '$lib/server/games/rewards';
import { buildSignaturePayload, verifySignature } from '$lib/server/games/hmac';
import { limit } from '$lib/server/games/rate';
import { logGameAudit } from '$lib/server/games/audit';
import { createAchievementEvaluator } from '$lib/server/achievements/evaluator';
import type { UnlockSummary } from '$lib/server/achievements/evaluator';
import { getCurrentStreakDays } from '$lib/server/games/streak';
import { createAchievementNotification } from '$lib/server/notifications';
import { applyStreakMultiplier, getStreakMultiplier, walletGrant } from '$lib/server/econ/index';

const rateLimitPerMinute = Number.parseInt(env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

type SessionRewardResponse = {
  xpDelta: number;
  currencyDelta: number;
  baseCurrencyDelta: number;
  currencyMultiplier: number;
};

const compareVersions = (current: string | null, minimum: string) => {
  if (!minimum) return true;
  if (!current) return false;
  const normalize = (input: string) => input.split('.').map((part) => Number(part) || 0);
  const currentParts = normalize(current);
  const minParts = normalize(minimum);
  const len = Math.max(currentParts.length, minParts.length);
  for (let i = 0; i < len; i += 1) {
    const a = currentParts[i] ?? 0;
    const b = minParts[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
};

export const POST: RequestHandler = async (event) => {
  const { user, supabase } = await ensureAuth(event);
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;
  const admin = getAdminClient();

  let rewards: SessionRewardResponse = {
    xpDelta: 0,
    currencyDelta: 0,
    baseCurrencyDelta: 0,
    currencyMultiplier: 1
  };
  let currentStreakDays = 0;

  limit(`games:complete:user:${user.id}`, rateLimitPerMinute);
  if (clientIp) {
    limit(`games:complete:ip:${clientIp}`, rateLimitPerMinute);
  }

  if (await hasAbuseFlag(user.id)) {
    throw error(403, { code: 'restricted', message: 'Account is temporarily restricted.' });
  }

  let body: {
    sessionId?: unknown;
    score?: unknown;
    durationMs?: unknown;
    nonce?: unknown;
    signature?: unknown;
    clientVersion?: unknown;
  };

  try {
    body = await event.request.json();
  } catch {
    throw error(400, { code: 'bad_request', message: 'Invalid JSON body.' });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const scoreRaw = Number(body.score);
  const durationMsRaw = Number(body.durationMs);
  const nonce = typeof body.nonce === 'string' ? body.nonce : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';
  const clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion : null;

  if (!sessionId || !Number.isFinite(scoreRaw) || !Number.isFinite(durationMsRaw) || !nonce) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'missing_fields' }
    });
    throw error(400, { code: 'bad_request', message: 'Missing required fields.' });
  }

  const score = Math.max(0, Math.floor(scoreRaw));
  const durationMs = Math.max(0, Math.floor(durationMsRaw));

  const session = await getSession(supabase, sessionId);
  if (!session) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'session_not_found' }
    });
    throw error(404, { code: 'not_found', message: 'Session not found.' });
  }

  if (session.user_id !== user.id) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'ownership_mismatch' }
    });
    throw error(403, { code: 'forbidden', message: 'Session ownership mismatch.' });
  }

  if (session.status !== 'started' || session.completed_at) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'session_completed' }
    });
    throw error(409, { code: 'conflict', message: 'Session already completed.' });
  }

  if (session.nonce !== nonce) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'nonce_mismatch' }
    });
    throw error(403, { code: 'forbidden', message: 'Nonce mismatch.' });
  }

  const payload = buildSignaturePayload(sessionId, score, durationMs, nonce);
  if (!verifySignature(payload, signature)) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'signature_invalid' }
    });
    throw error(403, { code: 'forbidden', message: 'Invalid signature.' });
  }

  if (!session.game_id) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'game_missing' }
    });
    throw error(400, { code: 'bad_request', message: 'Session game missing.' });
  }

  const game = await getGameById(session.game_id);
  if (!game) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: { reason: 'game_not_found', gameId: session.game_id }
    });
    throw error(404, { code: 'not_found', message: 'Game not found.' });
  }

  const config = await getConfigForGame(supabase, session.game_id);
  const caps = {
    maxDurationMs: config?.max_duration_ms ?? 600000,
    minDurationMs: config?.min_duration_ms ?? 10000,
    maxScorePerMin: config?.max_score_per_min ?? 8000,
    minClientVer: config?.min_client_ver ?? '1.0.0',
    maxScore: game.max_score ?? 100000
  };

  const durationValid = durationMs >= caps.minDurationMs && durationMs <= caps.maxDurationMs;
  if (!durationValid) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: {
        reason: 'duration_violation',
        durationMs,
        caps
      }
    });
    throw error(400, {
      code: 'invalid_duration',
      message: 'Reported duration is outside allowed bounds.'
    });
  }

  if (score > caps.maxScore) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: {
        reason: 'score_above_cap',
        score,
        maxScore: caps.maxScore
      }
    });
    throw error(400, { code: 'invalid_score', message: 'Score exceeds allowed maximum.' });
  }

  if (durationMs === 0) {
    throw error(400, { code: 'invalid_duration', message: 'Duration must be positive.' });
  }

  const minutes = durationMs / 60000;
  const scorePerMinute = minutes > 0 ? score / minutes : Number.POSITIVE_INFINITY;
  if (scorePerMinute > caps.maxScorePerMin) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: {
        reason: 'score_rate_violation',
        scorePerMinute,
        maxScorePerMinute: caps.maxScorePerMin
      }
    });
    throw error(400, { code: 'invalid_score_rate', message: 'Score rate exceeds allowed maximum.' });
  }

  if (!compareVersions(clientVersion, caps.minClientVer)) {
    await logGameAudit({
      userId: user.id,
      sessionId,
      event: 'reject',
      ip: clientIp,
      details: {
        reason: 'client_version_too_low',
        clientVersion,
        required: caps.minClientVer
      }
    });
    throw error(400, {
      code: 'client_outdated',
      message: `Client version ${clientVersion ?? 'unknown'} does not meet minimum requirements.`
    });
  }

  const { error: completeError } = await supabase.rpc('fn_game_complete', {
    p_session: sessionId,
    p_score: score,
    p_duration_ms: durationMs
  });

  if (completeError) {
    console.error('[games] fn_game_complete failed', completeError);
    throw error(500, { code: 'server_error', message: 'Unable to complete session.' });
  }

  let achievementsUnlocked: UnlockSummary[] = [];

  try {
    const scoreInsert = await admin.from('game_scores').insert({
      user_id: user.id,
      game_id: session.game_id,
      session_id: session.id,
      score,
      duration_ms: durationMs
    });

    if (scoreInsert.error && scoreInsert.error.code !== '23505') {
      console.error('[games] game_scores insert failed', scoreInsert.error);
    }

    const refreshAlltime = await admin.rpc('fn_leader_refresh', { p_scope: 'alltime' });
    if (refreshAlltime.error) {
      console.warn('[games] fn_leader_refresh alltime failed', refreshAlltime.error);
    }

    const refreshDaily = await admin.rpc('fn_leader_refresh', { p_scope: 'daily' });
    if (refreshDaily.error) {
      console.warn('[games] fn_leader_refresh daily failed', refreshDaily.error);
    }

    const refreshWeekly = await admin.rpc('fn_leader_refresh', { p_scope: 'weekly' });
    if (refreshWeekly.error) {
      console.warn('[games] fn_leader_refresh weekly failed', refreshWeekly.error);
    }
  } catch (err) {
    console.error('[games] leaderboard refresh failed', err);
  }

  try {
    const evaluator = createAchievementEvaluator({ supabase: admin });
    const [{ count: sessionCount, error: sessionCountError }, streakDays] = await Promise.all([
      admin
        .from('game_sessions')
        .select('id', { head: true, count: 'exact' })
        .eq('user_id', user.id)
        .eq('game_id', session.game_id)
        .eq('status', 'completed'),
      getCurrentStreakDays(user.id, { supabase: admin })
    ]);

    currentStreakDays = Number.isFinite(streakDays) ? Number(streakDays) : 0;

    if (sessionCountError) {
      console.error('[games] failed to count completed sessions', sessionCountError);
    }

    const completedSessionsForGame = typeof sessionCount === 'number' ? sessionCount : 0;
    const nowUtc = new Date().toISOString();

    const evaluation = await evaluator.evaluate({
      userId: user.id,
      slug: game.slug,
      gameId: game.id,
      score,
      durationMs,
      sessionId: session.id,
      completedSessionsForGame,
      currentStreakDays,
      nowUtc
    });

    achievementsUnlocked = evaluation.unlocked;

    if (achievementsUnlocked.length > 0) {
      await Promise.all(
        achievementsUnlocked.map((entry) =>
          createAchievementNotification(admin, {
            userId: user.id,
            achievementId: entry.achievementId,
            metadata: {
              key: entry.key,
              name: entry.name,
              points: entry.points,
              icon: entry.icon,
              rarity: entry.rarity,
              slug: game.slug
            }
          })
        )
      );
    }
  } catch (err) {
    console.error('[games] achievement evaluation failed', err);
  }

  const baseRewards = calculateRewards(score);
  const xpDelta = clamp(baseRewards.xpDelta, 0, 100);
  const baseCurrencyDelta = clamp(baseRewards.currencyDelta, 0, 200);
  const streakMultiplier = getStreakMultiplier(currentStreakDays);
  const currencyDelta = applyStreakMultiplier(baseCurrencyDelta, currentStreakDays);

  rewards = {
    xpDelta,
    currencyDelta,
    baseCurrencyDelta,
    currencyMultiplier: streakMultiplier
  };

  try {
    await persistRewards({
      sessionId,
      userId: user.id,
      xpDelta: rewards.xpDelta,
      currencyDelta: rewards.currencyDelta,
      meta: {
        multiplier: rewards.currencyMultiplier,
        base_currency: rewards.baseCurrencyDelta
      }
    });
  } catch (err) {
    console.error('[games] persist rewards failed', err);
    throw error(500, { code: 'server_error', message: 'Unable to record rewards.' });
  }

  if (rewards.currencyDelta > 0) {
    try {
      await walletGrant({
        userId: user.id,
        amount: rewards.currencyDelta,
        source: 'game_session',
        refId: session.id,
        meta: {
          slug: game.slug,
          score,
          durationMs,
          multiplier: rewards.currencyMultiplier,
          base_currency: rewards.baseCurrencyDelta
        },
        client: admin
      });
    } catch (err) {
      console.error('[games] wallet grant failed', err);
      throw error(500, { code: 'server_error', message: 'Unable to credit wallet.' });
    }
  }

  await logGameAudit({
    userId: user.id,
    sessionId,
    event: 'complete',
    ip: clientIp,
    details: {
      score,
      durationMs,
      scorePerMinute,
      clientVersion,
      rewards,
      achievements: achievementsUnlocked.map((item) => ({
        key: item.key,
        points: item.points,
        shards: item.shards
      }))
    }
  });

  return json({
    ...rewards,
    achievements: achievementsUnlocked.map((entry) => ({
      key: entry.key,
      name: entry.name,
      points: entry.points,
      icon: entry.icon,
      rarity: entry.rarity,
      shards: entry.shards
    }))
  });
};
