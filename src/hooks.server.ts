import type { Handle } from '@sveltejs/kit';
import { getUserServer } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.hostname === '127.0.0.1') {
    const url = new URL(event.request.url);
    url.hostname = 'localhost';
    return new Response(null, { status: 301, headers: { Location: url.toString() } });
  }

  const { supabase, user } = await getUserServer(event);

  event.locals.supabase = supabase;
  event.locals.user = user ?? null;

  return resolve(event);
};
