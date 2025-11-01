import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/games/guard';
import { buildSignaturePayload, verifyGameSignature } from '$lib/server/games/hmac';
import { calculateRewards, persistRewards } from '$lib/server/games/rewards';
import { supabaseAdmin } from '$lib/server/supabase';
import { memoryStore } from '$lib/server/games/store';

export const POST: RequestHandler = async (event) => {
  const { user, supabase } = await requireUser(event);

  let body: {
    sessionId?: unknown;
    score?: unknown;
    durationMs?: unknown;
    nonce?: unknown;
    signature?: unknown;
  };

  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request', details: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const scoreRaw = Number(body.score);
  const durationMsRaw = Number(body.durationMs);
  const nonce = typeof body.nonce === 'string' ? body.nonce : '';
  const signature = typeof body.signature === 'string' ? body.signature : '';

  if (!sessionId || !Number.isFinite(scoreRaw) || !Number.isFinite(durationMsRaw) || !nonce) {
    return json({ error: 'bad_request', details: 'Missing required fields' }, { status: 400 });
  }

  const score = Math.max(0, Math.floor(scoreRaw));
  const durationMs = Math.max(0, Math.floor(durationMsRaw));

  const payload = buildSignaturePayload(sessionId, score, durationMs, nonce);
  if (!verifyGameSignature(signature, payload)) {
    return json({ error: 'forbidden', details: 'Signature verification failed' }, { status: 403 });
  }

  let useFallback = false;
  let session: {
    id: string;
    user_id: string;
    nonce: string;
    status: string;
    completed_at: string | null;
    game_id: string | null;
  } | null = null;

  const { data: dbSession, error: sessionError } = await supabase
    .from('game_sessions')
    .select('id, user_id, nonce, status, completed_at, game_id')
    .eq('id', sessionId)
    .maybeSingle();

  if (!sessionError && dbSession) {
    session = dbSession as typeof session;
  } else if (sessionError) {
    const fallbackCodes = ['PGRST205', 'PGRST202'];
    if (sessionError.code && fallbackCodes.includes(sessionError.code)) {
      useFallback = true;
    } else {
      console.error('[games] session lookup failed', sessionError);
      return json({ error: 'server_error' }, { status: 500 });
    }
  }

  if (!session && !useFallback) {
    const fallbackSession = memoryStore.getSession(sessionId);
    if (fallbackSession) {
      useFallback = true;
    } else {
      return json({ error: 'not_found' }, { status: 404 });
    }
  }

  let maxScore = 100000;

  if (useFallback) {
    const fallback = memoryStore.getSession(sessionId);
    if (!fallback) {
      return json({ error: 'not_found' }, { status: 404 });
    }
    if (fallback.userId !== user.id) {
      return json({ error: 'forbidden', details: 'Session ownership mismatch' }, { status: 403 });
    }
    if (fallback.status === 'completed') {
      return json({ error: 'conflict', details: 'Session already completed' }, { status: 409 });
    }
    if (fallback.nonce !== nonce) {
      return json({ error: 'bad_request', details: 'Nonce mismatch' }, { status: 400 });
    }
  } else if (session) {
    if (session.user_id !== user.id) {
      return json({ error: 'forbidden', details: 'Session ownership mismatch' }, { status: 403 });
    }

    if (session.status === 'completed' || session.completed_at) {
      return json({ error: 'conflict', details: 'Session already completed' }, { status: 409 });
    }

    if (session.nonce !== nonce) {
      return json({ error: 'bad_request', details: 'Nonce mismatch' }, { status: 400 });
    }

    const { data: game, error: gameError } = await supabaseAdmin
      .from('game_titles')
      .select('id, max_score')
      .eq('id', session.game_id)
      .maybeSingle();

    if (gameError) {
      console.error('[games] failed to load game title', gameError);
      return json({ error: 'server_error' }, { status: 500 });
    }

    maxScore = game?.max_score ?? 100000;
  }

  if (score > maxScore) {
    return json({ error: 'invalid_score', maxScore }, { status: 400 });
  }

  const rewards = calculateRewards(score);

  if (useFallback) {
    memoryStore.completeSession(sessionId, user.id, score, durationMs);
    memoryStore.pushReward(sessionId, user.id, rewards.xpDelta, rewards.currencyDelta);
  } else {
    const { error: completeError } = await supabase.rpc('fn_game_complete', {
      p_session: sessionId,
      p_score: score,
      p_duration_ms: durationMs
    });

    if (completeError) {
      console.error('[games] fn_game_complete failed', completeError);
      return json({ error: 'server_error' }, { status: 500 });
    }

    try {
      await persistRewards({ sessionId, userId: user.id, ...rewards });
    } catch (err) {
      console.error('[games] persist rewards failed', err);
      return json({ error: 'server_error' }, { status: 500 });
    }
  }

  return json(rewards);
};
