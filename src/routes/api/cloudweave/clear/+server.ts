import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { enforceCloudWeaveRateLimit } from '$lib/server/cloudweave/rate';
import { getCloudWeaveConfig } from '$lib/server/cloudweave/config';
import { writeCloudWeaveAuditLog } from '$lib/server/cloudweave/audit';

const resolveCompanionId = async (supabase: App.Locals['supabase'], userId: string, requested?: string | null) => {
  if (requested && requested.trim().length > 0) return requested.trim();
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
    console.error('[cloudweave/clear] active companion lookup failed', error);
  }
  return typeof data?.id === 'string' ? data.id : null;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const rate = enforceCloudWeaveRateLimit(
    'clear',
    session.user.id,
    typeof event.getClientAddress === 'function' ? event.getClientAddress() : null
  );
  if (!rate.ok) {
    return json({ error: rate.code, message: rate.message, retryAfter: rate.retryAfter }, { status: rate.status });
  }

  const companionId = await resolveCompanionId(supabase, session.user.id, event.url.searchParams.get('companionId'));
  if (!companionId) return json({ error: 'companion_not_found' }, { status: 404 });

  const [emotionalReset, summaryReset] = await Promise.all([
    supabase.from('companion_emotional_state').upsert(
      {
        user_id: session.user.id,
        companion_id: companionId,
        mood: 'steady',
        trust: 0,
        bond: 0,
        streak_momentum: 0,
        volatility: 0,
        recent_tone: null,
        last_milestone_at: null
      },
      { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
    ),
    supabase.from('companion_memory_summary').upsert(
      {
        user_id: session.user.id,
        companion_id: companionId,
        summary_text: '',
        highlights_json: [],
        source_window_json: null,
        last_built_at: null
      },
      { onConflict: 'user_id,companion_id', ignoreDuplicates: false }
    )
  ]);

  if (emotionalReset.error || summaryReset.error) {
    console.error('[cloudweave/clear] reset failed', {
      emotionalError: emotionalReset.error,
      summaryError: summaryReset.error
    });
    return json({ error: 'clear_failed', message: 'Unable to reset Muse state.' }, { status: 500 });
  }

  const config = getCloudWeaveConfig();
  await writeCloudWeaveAuditLog({
    supabase,
    userId: session.user.id,
    companionId,
    action: 'clear_state',
    exportVersion: config.exportVersion,
    metadata: { source: 'api/cloudweave/clear' }
  });

  return json({ ok: true, companionId });
};
