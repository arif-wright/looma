type AnalyticsPayload = {
  surface?: string | null;
  variant?: string | null;
  payload?: Record<string, unknown> | null;
};

export function sendAnalytics(eventType: string, data: AnalyticsPayload = {}): void {
  if (typeof window === 'undefined') return;

  const body = {
    eventType,
    surface: data.surface ?? null,
    variant: data.variant ?? null,
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
