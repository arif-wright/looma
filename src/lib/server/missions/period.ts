import type { MissionCadence } from './types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const toUtcDate = (input?: string | number | Date) => {
  if (input instanceof Date) return new Date(input.getTime());
  if (typeof input === 'string' || typeof input === 'number') {
    const parsed = new Date(input);
    if (Number.isFinite(parsed.getTime())) return parsed;
  }
  return new Date();
};

export const resolveMissionCadence = (tags: string[] | null | undefined): MissionCadence | null => {
  if (!Array.isArray(tags) || tags.length === 0) return null;
  const normalized = tags
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.toLowerCase().trim())
    .filter((entry) => entry.length > 0);

  if (normalized.includes('daily')) return 'daily';
  if (normalized.includes('weekly')) return 'weekly';
  return null;
};

export const getCadencePeriodStartIso = (cadence: MissionCadence, nowInput?: string | number | Date): string => {
  const now = toUtcDate(nowInput);
  const start = new Date(now.getTime());

  if (cadence === 'daily') {
    start.setUTCHours(0, 0, 0, 0);
    return start.toISOString();
  }

  start.setUTCHours(0, 0, 0, 0);
  const utcDay = start.getUTCDay();
  const isoOffset = utcDay === 0 ? 6 : utcDay - 1;
  start.setTime(start.getTime() - isoOffset * ONE_DAY_MS);
  return start.toISOString();
};
