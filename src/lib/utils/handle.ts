const HANDLE_ALLOWED = /[^a-z0-9_]+/g;
const HANDLE_COMPACT = /_{2,}/g;
const HANDLE_BOUNDARY = /^_+|_+$/g;

export const normalizeHandle = (value: string | null | undefined): string => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(HANDLE_ALLOWED, '_')
    .replace(HANDLE_COMPACT, '_')
    .replace(HANDLE_BOUNDARY, '')
    .slice(0, 20);
};

export type HandleValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const isValidCharacters = (value: string) => /^[a-z0-9_]+$/.test(value);

export const validateHandle = (value: string | null | undefined): HandleValidationResult => {
  const normalized = normalizeHandle(value);
  if (!normalized) {
    return { ok: false, reason: 'Handle is required' };
  }
  if (normalized.length < 3) {
    return { ok: false, reason: 'Handle must be at least 3 characters' };
  }
  if (normalized.length > 20) {
    return { ok: false, reason: 'Handle must be 20 characters or fewer' };
  }
  if (!isValidCharacters(normalized)) {
    return { ok: false, reason: 'Use only letters, numbers, or underscores' };
  }
  return { ok: true };
};
