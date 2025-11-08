export const clampText = (value: string | null | undefined, max = 300) => {
  if (!value) return '';
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
};
