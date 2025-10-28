import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { recordAnalyticsEvent } from '$lib/server/analytics';

export const POST: RequestHandler = async (event) => {
  const supabase = supabaseServer(event);
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (userError) {
    return json({ error: userError.message }, { status: 400 });
  }

  if (!user) {
    return json({ error: 'Not authenticated' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const eventType = body.eventType;
  if (typeof eventType !== 'string' || eventType.trim().length === 0) {
    return json({ error: 'eventType is required' }, { status: 400 });
  }

  const surface =
    typeof body.surface === 'string' && body.surface.trim().length > 0 ? body.surface : null;
  const variant =
    typeof body.variant === 'string' && body.variant.trim().length > 0 ? body.variant : null;
  const dataPayload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : null;

  await recordAnalyticsEvent(supabase, user.id, eventType, {
    surface,
    variant,
    payload: dataPayload
  });

  return json({ ok: true });
};
