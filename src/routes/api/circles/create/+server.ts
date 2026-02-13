import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, cleanText, parseCirclePrivacy } from '$lib/server/circles';
import { enforceCircleCreateRateLimit } from '$lib/server/circles/rate';
import { getClientIp } from '$lib/server/utils/ip';

type CreatePayload = {
  name?: string;
  description?: string;
  privacy?: 'public' | 'invite';
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  const rate = enforceCircleCreateRateLimit(session.user.id, getClientIp(event));
  if (!rate.ok) {
    return json(
      { error: rate.code, message: rate.message, retryAfter: rate.retryAfter },
      { status: rate.status, headers: CIRCLES_CACHE_HEADERS }
    );
  }

  let body: CreatePayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const name = cleanText(body.name, 80);
  if (!name || name.length < 2) {
    return json({ error: 'invalid_name', message: 'Circle name must be at least 2 characters.' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { data: circleId, error } = await supabase.rpc('rpc_create_circle', {
    p_name: name,
    p_description: cleanText(body.description, 280),
    p_privacy: parseCirclePrivacy(body.privacy)
  });

  if (error || typeof circleId !== 'string') {
    return json({ error: 'bad_request', message: 'Could not create circle.' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  return json({ circleId }, { headers: CIRCLES_CACHE_HEADERS });
};
