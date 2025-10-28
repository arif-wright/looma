import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateUserContext, type UserContext } from '$lib/server/userContext';

const allowedContexts: UserContext[] = ['feed', 'mission', 'creature', 'dashboard'];

export const POST: RequestHandler = async (event) => {
  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const context = (payload as Record<string, unknown>)?.context;
  const extra = (payload as Record<string, unknown>)?.payload;
  const trigger = (payload as Record<string, unknown>)?.trigger;

  if (typeof context !== 'string' || !allowedContexts.includes(context as UserContext)) {
    return json({ error: 'context is required' }, { status: 400 });
  }

  const payloadData =
    extra && typeof extra === 'object' && !Array.isArray(extra) ? (extra as Record<string, unknown>) : null;
  const triggerValue =
    typeof trigger === 'string' && trigger.trim().length > 0 ? (trigger as string) : null;

  await updateUserContext(event, context as UserContext, payloadData, triggerValue);

  return json({ ok: true });
};
