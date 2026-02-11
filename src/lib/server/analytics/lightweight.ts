import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConsentFlags } from '$lib/server/consent';
import { dev } from '$app/environment';

export type LightweightTrackedType =
  | 'session.start'
  | 'session.end'
  | 'game.session.start'
  | 'game.complete'
  | 'companion.swap'
  | 'preference.toggle';

type TrackInput = {
  supabase: SupabaseClient;
  type: LightweightTrackedType;
  payload: unknown;
  sessionId?: string | null;
  consent: ConsentFlags;
  suppressMemory?: boolean;
  suppressAdaptation?: boolean;
};

const ALLOWED_TYPES = new Set<LightweightTrackedType>([
  'session.start',
  'session.end',
  'game.session.start',
  'game.complete',
  'companion.swap',
  'preference.toggle'
]);

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
};

const clampInt = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(value)));

const stringOrNull = (value: unknown, max = 48) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const boolOrNull = (value: unknown) => (typeof value === 'boolean' ? value : null);

const sanitizePayload = (type: LightweightTrackedType, payload: unknown): Record<string, unknown> => {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};

  switch (type) {
    case 'session.start':
      return {
        source: stringOrNull(source.source, 24) ?? 'app',
        entry: stringOrNull(source.entry, 48) ?? null
      };
    case 'session.end':
      return {
        pagesVisitedCount: (() => {
          const n = toFiniteNumber(source.pagesVisitedCount);
          return n === null ? null : clampInt(n, 0, 500);
        })(),
        gamesPlayedCount: (() => {
          const n = toFiniteNumber(source.gamesPlayedCount);
          return n === null ? null : clampInt(n, 0, 500);
        })(),
        dwellMs: (() => {
          const n = toFiniteNumber(source.dwellMs);
          return n === null ? null : clampInt(n, 0, 8 * 60 * 60 * 1000);
        })()
      };
    case 'game.session.start':
      return {
        gameSlug: stringOrNull(source.gameSlug, 48) ?? stringOrNull(source.gameId, 48) ?? null,
        mode: stringOrNull(source.mode, 24) ?? null
      };
    case 'game.complete':
      return {
        gameSlug: stringOrNull(source.gameSlug, 48) ?? null,
        success: boolOrNull(source.success),
        score: (() => {
          const n = toFiniteNumber(source.score);
          return n === null ? null : clampInt(n, 0, 1_000_000);
        })(),
        durationMs: (() => {
          const n = toFiniteNumber(source.durationMs);
          return n === null ? null : clampInt(n, 0, 8 * 60 * 60 * 1000);
        })()
      };
    case 'companion.swap':
      return {
        fromId: stringOrNull(source.fromId, 64),
        toId: stringOrNull(source.toId, 64),
        rosterSize: (() => {
          const n = toFiniteNumber(source.rosterSize);
          return n === null ? null : clampInt(n, 0, 64);
        })()
      };
    case 'preference.toggle':
      return {
        key: stringOrNull(source.key, 32),
        value: boolOrNull(source.value)
      };
  }
};

export const trackLightweightUsage = async ({
  supabase,
  type,
  payload,
  sessionId = null,
  consent,
  suppressMemory = false,
  suppressAdaptation = false
}: TrackInput): Promise<{ tracked: boolean }> => {
  if (!ALLOWED_TYPES.has(type)) return { tracked: false };
  if (!consent.memory || !consent.adaptation) return { tracked: false };
  if (suppressMemory || suppressAdaptation) return { tracked: false };

  const safePayload = sanitizePayload(type, payload);
  const meta = {
    telemetry: 'lightweight',
    privacy: 'no_pii',
    ...safePayload
  };

  if (dev) {
    console.info('[analytics/lightweight]', { type, sessionId, meta });
  }

  const { error } = await supabase.from('analytics_events').insert({
    user_id: null,
    kind: type,
    session_id: sessionId,
    game_id: null,
    score: null,
    duration_ms: null,
    amount: null,
    currency: null,
    meta,
    ip: null,
    ua: null
  });

  if (error) {
    console.error('[analytics/lightweight] insert failed', error, { type, meta });
    return { tracked: false };
  }

  return { tracked: true };
};
