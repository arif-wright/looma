import { env } from '$env/dynamic/private';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  ensureAuth,
  getSession,
  getConfigForGame,
  getGameById,
  hasAbuseFlag,
  getAdminClient
} from '$lib/server/games/guard';
import { assertSameSubmission, parseGameSubmission, readGameSettlement } from '$lib/server/games/settlement';
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
  const verified = await supabase.auth.getUser();
  if (verified.error || verified.data.user?.id !== user.id) throw error(401, { code: 'unauthorized', message: 'Authentication required.' });
  const clientIp = typeof event.getClientAddress === 'function' ? event.getClientAddress() : null;


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

  const { sessionId, submission } = parseGameSubmission(body);
  const { score, durationMs, nonce, clientVersion } = submission;

  const session = await getSession(supabase, sessionId);
  if (!session || session.user_id !== user.id) {
    throw error(404, { code: 'not_found', message: 'Session not found.' });
  }

  if (session.nonce !== nonce) {
    throw error(403, { code: 'forbidden', message: 'Nonce mismatch.' });
  }
  const saved = await readGameSettlement(getAdminClient(), user.id, sessionId);
  if (saved) {
    assertSameSubmission(saved.request, submission, true);
    return json({ signature: makeSignature(sessionId, score, durationMs, nonce),
      payload: buildSignaturePayload(sessionId, score, durationMs, nonce) });
  }
  if (session.status !== 'started' || session.completed_at) {
    throw error(409, { code: 'legacy_unreconciled', message: 'This earlier session has no recoverable receipt.' });
  }
  await limit(supabase, `games:sign:user:${user.id}`, rateLimitPerMinute);
  if (clientIp) {
    await limit(supabase, `games:sign:ip:${clientIp}`, rateLimitPerMinute);
  }

  if (await hasAbuseFlag(user.id)) {
    throw error(403, { code: 'restricted', message: 'Account is temporarily restricted.' });
  }

  if (!session.game_id) {
    throw error(400, { code: 'bad_request', message: 'Session game missing.' });
  }

  const game = await getGameById(session.game_id);
  if (!game || !game.is_active) {
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

  if (durationMs < caps.minDurationMs || durationMs > caps.maxDurationMs ||
      durationMs > Date.now() - Date.parse(session.started_at) + 2000) {
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
