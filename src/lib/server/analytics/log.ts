import type { RequestEvent } from '@sveltejs/kit';
import { UAParser } from 'ua-parser-js';
import { supabaseAdmin } from '$lib/server/supabase';
import { getClientIp } from '$lib/server/utils/ip';

type EventLike = (Pick<RequestEvent, 'request' | 'locals' | 'getClientAddress'> & {
  locals?: {
    supabaseAdmin?: typeof supabaseAdmin;
    supabase?: typeof supabaseAdmin;
  };
}) | {
  request: Request;
  locals?: {
    supabaseAdmin?: typeof supabaseAdmin;
    supabase?: typeof supabaseAdmin;
  };
  getClientAddress?: () => string;
} | null | undefined;

type LogPayload = {
  userId?: string;
  sessionId?: string;
  gameId?: string;
  score?: number;
  durationMs?: number;
  amount?: number;
  currency?: string;
  meta?: Record<string, unknown>;
};

const resolveClient = (event: EventLike) => {
  const locals = (event as any)?.locals ?? {};
  return locals.supabaseAdmin ?? supabaseAdmin;
};

const mergeDeviceMeta = (
  meta: Record<string, unknown> | null | undefined,
  parser: any
): Record<string, unknown> => {
  const existing = meta && typeof meta === 'object' ? meta : {};
  const browser = parser.getBrowser();
  const os = parser.getOS();
  const device = parser.getDevice();

  const deviceMeta: Record<string, unknown> = {
    browser: browser.name ?? null,
    browserVersion: browser.version ?? null,
    os: os.name ?? null,
    osVersion: os.version ?? null,
    deviceType: device.type ?? null,
    deviceModel: device.model ?? null
  };

  const currentDevice = existing.device;
  const mergedDevice =
    currentDevice && typeof currentDevice === 'object'
      ? { ...(currentDevice as Record<string, unknown>), ...deviceMeta }
      : deviceMeta;

  return {
    ...existing,
    device: mergedDevice
  };
};

export async function logEvent(event: EventLike, kind: string, data: LogPayload) {
  try {
    const request = event?.request;
    const ua = request?.headers?.get('user-agent') ?? '';
    const parser = new UAParser(ua);
    const ip = getClientIp(event ?? null);

    const mergedMeta = mergeDeviceMeta(data.meta, parser);

    const client = resolveClient(event);
    await client.from('analytics_events').insert({
      user_id: data.userId ?? null,
      kind,
      session_id: data.sessionId ?? null,
      game_id: data.gameId ?? null,
      score: data.score ?? null,
      duration_ms: data.durationMs ?? null,
      amount: data.amount ?? null,
      currency: data.currency ?? null,
      meta: mergedMeta,
      ip,
      ua
    });
  } catch (err) {
    console.error('[analytics] logEvent failed', err, { kind, data });
  }
}
