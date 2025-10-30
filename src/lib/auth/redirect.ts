export const sanitizeInternalPath = (input: string | null | undefined): string | null => {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
};

export const resolveNextParam = (value: string | null | undefined, fallback = '/app/home') => {
  return sanitizeInternalPath(value) ?? fallback;
};
