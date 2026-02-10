import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { getUserServer } from '$lib/server/auth';
import { SAFE_LOAD_MESSAGE, SAFE_UNAUTHORIZED_MESSAGE } from '$lib/safeMessages';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.hostname === '127.0.0.1') {
    const url = new URL(event.request.url);
    url.hostname = 'localhost';
    return new Response(null, { status: 301, headers: { Location: url.toString() } });
  }

  const { supabase, user } = await getUserServer(event);

  event.locals.supabase = supabase;
  event.locals.user = user ?? null;

  const response = await resolve(event);

  // Ensure API failures never leak raw internals and always include a user-safe message.
  if (
    event.url.pathname.startsWith('/api/') &&
    response.status >= 400 &&
    !(response.headers.get('set-cookie') ?? '').trim()
  ) {
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        const raw = await response.clone().text();
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const payload = parsed as Record<string, unknown>;
          if ('error' in payload) {
            const next = { ...payload };
            const existingMessage = next.message;
            if (typeof existingMessage !== 'string' || !existingMessage.trim()) {
              next.message = response.status === 401 ? SAFE_UNAUTHORIZED_MESSAGE : SAFE_LOAD_MESSAGE;
            }
            if (dev) {
              console.error('[api:error]', {
                path: event.url.pathname,
                status: response.status,
                payload
              });
            }
            // Keep debugging info out of the UI in prod. In dev, callers can still inspect payloads.
            if (!dev) {
              delete next.details;
              delete next.detail;
              delete next.stack;
              delete next.trace;
            }

            const headers = new Headers(response.headers);
            headers.set('content-type', 'application/json; charset=utf-8');
            return new Response(JSON.stringify(next), {
              status: response.status,
              statusText: response.statusText,
              headers
            });
          }
        }
      } catch {
        // If parsing fails, fall through and return original response.
      }
    }
  }

  return response;
};
