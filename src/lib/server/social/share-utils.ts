import { randomUUID } from 'crypto';

type SanitizeResult = { ok: true; value: string | null } | { ok: false; message: string };

type ShareKind = 'run' | 'achievement';

export function sanitizeShareText(input: unknown): SanitizeResult {
  if (input == null) {
    return { ok: true, value: null };
  }

  if (typeof input !== 'string') {
    return { ok: false, message: 'Text must be a string.' };
  }

  const trimmed = input.trim();
  const withoutTags = trimmed.replace(/<[^>]*>/g, '');
  const withoutControl = withoutTags.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  const normalized = withoutControl.trim();

  if (normalized.length === 0) {
    return { ok: true, value: null };
  }

  const length = Array.from(normalized).length;
  if (length > 280) {
    return { ok: false, message: 'Text must be 280 characters or fewer.' };
  }

  return { ok: true, value: normalized };
}

const slugify = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 40);
};

export function generateShareSlug(kind: ShareKind, parts: Array<string | null | undefined>): string {
  const base = [kind, ...parts.map((part) => slugify(part)).filter(Boolean)].join('-');
  const suffix = randomUUID().slice(0, 8);
  return [base || kind, suffix].join('-');
}

export const formatScore = (score: number) => new Intl.NumberFormat('en-US').format(score);

export const toSeconds = (durationMs: number) => Math.max(0, Math.round(durationMs / 1000));
