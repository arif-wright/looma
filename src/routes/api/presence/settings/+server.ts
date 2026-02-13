import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

const CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

type PresenceSettingsPayload = {
  presenceVisible?: boolean;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  const { data, error } = await supabase
    .from('user_preferences')
    .select('presence_visible')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  return json(
    {
      presenceVisible: data?.presence_visible !== false
    },
    { headers: CACHE_HEADERS }
  );
};

export const PUT: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);

  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CACHE_HEADERS });
  }

  let body: PresenceSettingsPayload;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  if (typeof body.presenceVisible !== 'boolean') {
    return json({ error: 'bad_request' }, { status: 400, headers: CACHE_HEADERS });
  }

  const { error } = await supabase.from('user_preferences').upsert(
    {
      user_id: session.user.id,
      presence_visible: body.presenceVisible
    },
    { onConflict: 'user_id', ignoreDuplicates: false }
  );

  if (error) {
    return json({ error: error.message }, { status: 400, headers: CACHE_HEADERS });
  }

  if (!body.presenceVisible) {
    await supabase
      .from('user_presence')
      .upsert(
        {
          user_id: session.user.id,
          status: 'offline',
          last_active_at: new Date().toISOString()
        },
        { onConflict: 'user_id', ignoreDuplicates: false }
      );
  }

  return json({ ok: true, presenceVisible: body.presenceVisible }, { headers: CACHE_HEADERS });
};
