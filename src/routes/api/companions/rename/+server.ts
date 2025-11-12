import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

type RenamePayload = {
  companionId?: string;
  name?: string;
};

const validateName = (input: string | undefined | null) => {
  const trimmed = typeof input === 'string' ? input.trim() : '';
  if (trimmed.length < 1 || trimmed.length > 32) {
    return null;
  }
  return trimmed;
};

export const POST: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  let payload: RenamePayload;
  try {
    payload = (await event.request.json()) as RenamePayload;
  } catch {
    return json({ error: 'bad_request' }, { status: 400 });
  }

  const companionId = typeof payload.companionId === 'string' ? payload.companionId : null;
  const nextName = validateName(payload.name);

  if (!companionId || !nextName) {
    return json({ error: 'invalid_name' }, { status: 400 });
  }

  const { error } = await supabase.rpc('rename_companion', {
    p_companion: companionId,
    p_name: nextName
  });

  if (error) {
    return json({ error: error.message ?? 'rename_failed' }, { status: 400 });
  }

  return json({ ok: true, name: nextName });
};
