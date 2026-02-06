export type EventMeta = {
  sessionId?: string;
  userId?: string;
  ts?: string;
};

export type EventPayload = Record<string, unknown> | undefined;

export const sendEvent = async (type: string, payload?: EventPayload, meta?: EventMeta) => {
  try {
    const res = await fetch('/api/events/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, payload, meta })
    });
    return await res.json().catch(() => null);
  } catch (err) {
    console.debug('[events] sendEvent failed', err);
    return null;
  }
};
