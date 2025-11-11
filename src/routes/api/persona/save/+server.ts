import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const answers = (payload as { answers?: unknown; consent?: unknown })?.answers;
  const consentRaw = (payload as { consent?: unknown })?.consent;
  const consent =
    typeof consentRaw === 'boolean'
      ? consentRaw
      : typeof consentRaw === 'string'
        ? consentRaw === 'true'
        : undefined;
  if (!Array.isArray(answers)) {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('save_traits_and_match', {
    p_raw: answers,
    p_consent: typeof consent === 'boolean' ? consent : undefined
  });
  if (error) {
    return json({ error: error.message }, { status: 400 });
  }

  const row = Array.isArray(data) ? data[0] : null;
  return json({ ok: true, archetype: row?.archetype ?? null, summary: row?.summary ?? null });
};
