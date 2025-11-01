import { env } from '$env/dynamic/private';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ensureAuth,
  getSession,
  getConfigForGame,
  getGameById,
  hasAbuseFlag
} from '$lib/server/games/guard';
import { limit } from '$lib/server/games/rate';
import { buildSignaturePayload, makeSignature } from '$lib/server/games/hmac';

const rateLimitPerMinute = Number.parseInt(env.GAME_RATE_LIMIT_PER_MINUTE ?? '20', 10) || 20;

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

  limit(`games:sign:user:${user.id}`, rateLimitPerMinute);
  if (clientIp) {
    limit(`games:sign:ip:${clientIp}`, rateLimitPerMinute);
  }

  if (await hasAbuseFlag(user.id)) {
    throw error(403, { code: 'restricted', message: 'Account is temporarily restricted.' });
  }

  let body: {
    sessionId?: unknown;
    score?: unknown;
    durationMs?: unknown;
    nonce?: unknown;
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
  const clientVersion = typeof body.clientVersion === 'string' ? body.clientVersion : null;

  if (!sessionId || !Number.isFinite(scoreRaw) || !Number.isFinite(durationMsRaw) || !nonce) {
    throw error(400, { code: 'bad_request', message: 'Missing required fields.' });
  }

  const score = Math.max(0, Math.floor(scoreRaw));
  const durationMs = Math.max(0, Math.floor(durationMsRaw));

  const session = await getSession(supabase, sessionId);
  if (!session || session.user_id !== user.id) {
    throw error(404, { code: 'not_found', message: 'Session not found.' });
  }

  if (session.status !== 'started' || session.completed_at) {
    throw error(409, { code: 'conflict', message: 'Session already completed.' });
  }

  if (session.nonce !== nonce) {
    throw error(403, { code: 'forbidden', message: 'Nonce mismatch.' });
  }

  if (!session.game_id) {
    throw error(400, { code: 'bad_request', message: 'Session game missing.' });
  }

  const game = await getGameById(session.game_id);
  if (!game) {
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

  if (durationMs < caps.minDurationMs || durationMs > caps.maxDurationMs) {
    throw error(400, { code: 'invalid_duration', message: 'Reported duration is outside allowed bounds.' });
  }

  if (score > caps.maxScore) {
    throw error(400, { code: 'invalid_score', message: 'Score exceeds allowed maximum.' });
  }

  if (durationMs === 0) {
    throw error(400, { code: 'invalid_duration', message: 'Duration must be positive.' });
  }

  const minutes = durationMs / 60000;
  const scorePerMinute = minutes > 0 ? score / minutes : Number.POSITIVE_INFINITY;
  if (scorePerMinute > caps.maxScorePerMin) {
    throw error(400, { code: 'invalid_score_rate', message: 'Score rate exceeds allowed maximum.' });
  }

  if (!compareVersions(clientVersion, caps.minClientVer)) {
    throw error(400, {
      code: 'client_outdated',
      message: `Client version ${clientVersion ?? 'unknown'} does not meet minimum requirements.`
    });
  }

  const signature = makeSignature(sessionId, score, durationMs, nonce);
  const payload = buildSignaturePayload(sessionId, score, durationMs, nonce);

  return json({ signature, payload });
};
