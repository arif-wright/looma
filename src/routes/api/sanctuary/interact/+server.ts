import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { syncEmotionalStateFromCompanionStats } from '$lib/server/emotionalState';
import { isRestRequest } from '$lib/sanctuary/restRequest';

export const POST: RequestHandler = async ({ locals, request }) => {
  const supabase = locals.supabase as App.Locals['supabase'];
  const userId = locals.session?.user?.id ?? locals.user?.id ?? null;
  if (!supabase || !userId) return json({ error: 'unauthorized' }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (payload?.action !== 'shared_rest') return json({ error: 'unsupported_interaction' }, { status: 400 });
  if (!isRestRequest(payload)) return json({ error: 'invalid_request' }, { status: 400 });

  const { data, error } = await supabase.rpc('perform_sanctuary_shared_rest', {
    p_companion_id: payload.companionId,
    p_request_id: payload.requestId
  });
  if (error) {
    console.error('[sanctuary interaction] atomic rest failed', error);
    return json({ error: 'interaction_failed' }, { status: 500 });
  }
  if (data?.error) {
    const status = data.error === 'rest_cooldown' ? 429 : data.error === 'companion_required' ? 404 : 409;
    return json(data, { status });
  }
  if (!data?.ok || !data?.memory?.id) {
    return json({ error: 'interaction_failed' }, { status: 500 });
  }
  // Best-effort derived projection only, never a second rest or replayed reward.
  // Authoritative stats and all rest evidence already committed in the RPC.
  if (!data.replayed && data.companion) {
    await syncEmotionalStateFromCompanionStats(userId, payload.companionId, data.companion, supabase).catch(
      (error) => console.error('[sanctuary interaction] emotional state sync failed', error)
    );
  }
  return json(data);
};
