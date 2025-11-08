export function normalizeHandle(str: string | null | undefined): string {
  return (str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
}

export function validateHandle(str: string | null | undefined) {
  const handle = normalizeHandle(str);
  if (handle.length < 3) {
    return { ok: false as const, reason: 'At least 3 characters' };
  }
  if (handle.length > 32) {
    return { ok: false as const, reason: 'Max 32 characters' };
  }
  if (!/^[a-z]/.test(handle)) {
    return { ok: false as const, reason: 'Must start with a letter' };
  }
  return { ok: true as const, handle };
}
