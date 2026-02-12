import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { buildCloudWeaveExport } from '$lib/server/cloudweave/export';
import { signExport } from '$lib/server/cloudweave/sign';
import { getCloudWeaveConfig } from '$lib/server/cloudweave/config';
import { writeCloudWeaveAuditLog } from '$lib/server/cloudweave/audit';
import { enforceCloudWeaveRateLimit } from '$lib/server/cloudweave/rate';

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
    console.error('[cloudweave/export] active companion lookup failed', error);
  }
  return typeof data?.id === 'string' ? data.id : null;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) return json({ error: 'unauthorized' }, { status: 401 });

  const rate = enforceCloudWeaveRateLimit(
    'export',
    session.user.id,
    typeof event.getClientAddress === 'function' ? event.getClientAddress() : null
  );
  if (!rate.ok) {
    return json({ error: rate.code, message: rate.message, retryAfter: rate.retryAfter }, { status: rate.status });
  }

  const companionId = await resolveCompanionId(supabase, session.user.id, event.url.searchParams.get('companionId'));
  if (!companionId) return json({ error: 'companion_not_found' }, { status: 404 });

  const config = getCloudWeaveConfig();
  if (!config.signingSecret) {
    return json({ error: 'cloudweave_not_configured', message: 'CloudWeave export signing is not configured.' }, { status: 500 });
  }

  const payload = await buildCloudWeaveExport(session.user.id, companionId, supabase);
  const signed = signExport(payload);

  await writeCloudWeaveAuditLog({
    supabase,
    userId: session.user.id,
    companionId,
    action: 'export',
    exportVersion: payload.version,
    signature: signed.signature,
    metadata: { signedAt: signed.signedAt }
  });

  return json(signed);
};
