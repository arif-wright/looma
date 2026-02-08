import type { RequestEvent } from '@sveltejs/kit';

type ServerEventMeta = {
  sessionId?: string | null;
  ts?: string;
};

type ServerEventPayload = Record<string, unknown> | null | undefined;

export const ingestServerEvent = async (
  event: RequestEvent,
  type: string,
  payload?: ServerEventPayload,
  meta?: ServerEventMeta
) => {
  try {
    const response = await event.fetch('/api/events/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type,
        payload: payload ?? undefined,
        meta: {
          sessionId: meta?.sessionId ?? null,
          ts: meta?.ts ?? new Date().toISOString()
        }
      })
    });
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.warn('[server/events] ingest failed', { type, status: response.status, details });
      return null;
    }
    return response.json().catch(() => null);
  } catch (err) {
    console.warn('[server/events] ingest request failed', { type, err });
    return null;
  }
};
