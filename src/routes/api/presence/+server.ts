import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type PresenceStatus = 'online' | 'away' | 'offline';

type PresencePayload = {
  status?: PresenceStatus;
};

const isPresenceStatus = (value: unknown): value is PresenceStatus =>
  value === 'online' || value === 'away' || value === 'offline';

const parsePayload = async (request: Request): Promise<PresencePayload> => {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const body = (await request.json().catch(() => ({}))) as PresencePayload;
    return body;
  }

  const raw = await request.text().catch(() => '');
  if (!raw.trim()) return {};

  try {
    return JSON.parse(raw) as PresencePayload;
  } catch {
    return {};
  }
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const payload = await parsePayload(event.request);
  const requestedStatus = isPresenceStatus(payload.status) ? payload.status : 'online';

  const { data: prefRow } = await supabase
    .from('user_preferences')
    .select('presence_visible')
    .eq('user_id', session.user.id)
    .maybeSingle();

  const presenceVisible = prefRow?.presence_visible !== false;
  const effectiveStatus: PresenceStatus = presenceVisible ? requestedStatus : 'offline';
  const now = new Date().toISOString();

  const { error } = await supabase.from('user_presence').upsert(
    {
      user_id: session.user.id,
      status: effectiveStatus,
      last_active_at: now
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json(
    {
      ok: true,
      status: effectiveStatus,
      presenceVisible
    },
    { headers: CACHE_HEADERS }
  );
};
