export const isWorldEnabled = (value: string | null | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
};
