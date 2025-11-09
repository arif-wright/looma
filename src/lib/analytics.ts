export async function logEvent(kind: string, meta: any = {}) {
  try {
    await fetch('/api/analytics/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, meta })
    });
  } catch {}
}
