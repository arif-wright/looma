export function normalizeHandle(str: string | null | undefined): string {
  return (str ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function validateHandle(str: string | null | undefined) {
  const handle = normalizeHandle(str);
  if (handle.length < 3) {
    return { ok: false as const, reason: 'Handle too short' };
  }
  return { ok: true as const, handle };
}
