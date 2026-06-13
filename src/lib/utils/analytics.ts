type AnalyticsPayload = {
  surface?: string | null;
  variant?: string | null;
  sessionId?: string | null;
  payload?: Record<string, unknown> | null;
};

export function sendAnalytics(eventType: string, data: AnalyticsPayload = {}): void {
  if (typeof window === 'undefined') return;
  let storedSessionId = window.localStorage.getItem('looma_session_id');
  if (!storedSessionId && typeof crypto.randomUUID === 'function') {
    storedSessionId = crypto.randomUUID();
    window.localStorage.setItem('looma_session_id', storedSessionId);
  }

  const body = {
    eventType,
    surface: data.surface ?? null,
    variant: data.variant ?? null,
    sessionId: data.sessionId ?? storedSessionId ?? null,
    payload: data.payload ?? null
  };
  const json = JSON.stringify(body);

  if (typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([json], { type: 'application/json' });
    navigator.sendBeacon('/api/analytics', blob);
    return;
  }

  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: json,
    keepalive: true
  }).catch((err) => {
    console.debug('[analytics] send failed', err);
  });
}
