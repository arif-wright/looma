import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { upsertCompanionMemorySummary } from '$lib/server/memorySummary';

const resolveCompanionId = async (
  userId: string,
  supabase: App.Locals['supabase'],
  requestedId?: string | null
): Promise<string | null> => {
  if (requestedId && requestedId.trim().length > 0) return requestedId.trim();
  const { data, error } = await supabase
    .from('companions')
    .select('id')
    .eq('owner_id', userId)
    .order('is_active', { ascending: false })
    .order('slot_index', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    console.error('[memory-summary] active companion lookup failed', error);
  }
  return typeof data?.id === 'string' ? data.id : null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const body = (await event.request.json().catch(() => ({}))) as { companionId?: string };
  const companionId = await resolveCompanionId(session.user.id, supabase, body?.companionId ?? null);
  if (!companionId) return json({ error: 'companion_not_found' }, { status: 404 });

  const rebuilt = await upsertCompanionMemorySummary(session.user.id, companionId, 14, supabase, {
    minIntervalMs: 0
  });

  return json({
    ok: true,
    companionId,
    rebuilt: rebuilt.rebuilt,
    summary: rebuilt.summary
  });
};

export const DELETE: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const body = (await event.request.json().catch(() => ({}))) as { companionId?: string };
  const companionId = await resolveCompanionId(session.user.id, supabase, body?.companionId ?? null);
  if (!companionId) return json({ error: 'companion_not_found' }, { status: 404 });

  const { error } = await supabase.from('companion_memory_summary').upsert(
    {
      user_id: session.user.id,
      companion_id: companionId,
      summary_text: '',
      highlights_json: [],
      source_window_json: null,
      last_built_at: null
    },
    { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
  );

  if (error) {
    console.error('[memory-summary] clear failed', error);
    return json({ error: 'clear_failed' }, { status: 500 });
  }

  return json({ ok: true, companionId });
};
