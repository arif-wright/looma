import { supabaseAdmin } from '$lib/server/supabase';

type InspectArgs = {
  userId: string;
  sessionId: string;
  gameId: string;
  score: number;
  durationMs: number;
  ip: string | null;
  deviceHash: string | null;
  caps: {
    maxScorePerMin?: number | null;
    minDurationMs?: number | null;
  };
};

type AnomalyEntry = {
  session_id: string;
  user_id: string | null;
  type: string;
  severity: number;
  details: Record<string, unknown>;
};

const MINUTES_IN_MS = 60000;
const DEVICE_THRESHOLD = 3;
const DEVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

const fetchStartEvent = async (sessionId: string) => {
  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('ip, inserted_at, meta')
    .eq('kind', 'game_start')
    .eq('session_id', sessionId)
    .order('inserted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ?? null;
};

const hasPriorCompletion = async (sessionId: string) => {
  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('id')
    .eq('kind', 'game_complete')
    .eq('session_id', sessionId)
    .limit(1);

  return Array.isArray(data) && data.length > 0;
};

const detectDeviceAbuse = async (deviceHash: string | null, userId: string | null) => {
  if (!deviceHash) return false;
  const since = new Date(Date.now() - DEVICE_WINDOW_MS).toISOString();
  const { data } = await supabaseAdmin
    .from('analytics_events')
    .select('user_id')
    .eq('meta->>deviceHash', deviceHash)
    .gte('inserted_at', since);

  if (!Array.isArray(data)) return false;
  const uniqueUsers = new Set(
    data
      .map((row) => row.user_id as string | null)
      .filter((id): id is string => Boolean(id) && id !== userId)
  );
  return uniqueUsers.size >= DEVICE_THRESHOLD;
};

const upsertAnomalies = async (entries: AnomalyEntry[]) => {
  if (entries.length === 0) return;
  await supabaseAdmin.from('anomalies').upsert(entries, { onConflict: 'session_id,type' });
};

export const inspectSessionComplete = async ({
  userId,
  sessionId,
  gameId,
  score,
  durationMs,
  ip,
  deviceHash,
  caps
}: InspectArgs) => {
  try {
    const anomalies: AnomalyEntry[] = [];
    const durationMinutes = Math.max(1, durationMs / MINUTES_IN_MS);
    const maxScorePerMin =
      typeof caps.maxScorePerMin === 'number' && caps.maxScorePerMin > 0
        ? caps.maxScorePerMin
        : null;

    if (maxScorePerMin !== null) {
      const rate = score / durationMinutes;
      if (rate > maxScorePerMin * 1.25) {
        anomalies.push({
          session_id: sessionId,
          user_id: userId,
          type: 'impossible_score_rate',
          severity: 4,
          details: {
            score,
            durationMs,
            scorePerMinute: rate,
            cap: maxScorePerMin
          }
        });
      }
    }

    const minDurationMs =
      typeof caps.minDurationMs === 'number' && caps.minDurationMs > 0
        ? caps.minDurationMs
        : null;
    if (minDurationMs !== null && durationMs > 0 && durationMs < minDurationMs * 0.9) {
      anomalies.push({
        session_id: sessionId,
        user_id: userId,
        type: 'duration_mismatch',
        severity: 3,
        details: {
          durationMs,
          minimum: minDurationMs
        }
      });
    }

    if (await hasPriorCompletion(sessionId)) {
      anomalies.push({
        session_id: sessionId,
        user_id: userId,
        type: 'nonce_reuse',
        severity: 5,
        details: {
          reason: 'duplicate_completion'
        }
      });
    }

    const startEvent = await fetchStartEvent(sessionId);
    if (startEvent) {
      const startIp = (startEvent.ip as string | null) ?? null;
      const startAt = startEvent.inserted_at ? new Date(startEvent.inserted_at as string) : null;
      if (startIp && ip && startIp !== ip && startAt) {
        const diff = Math.abs(Date.now() - startAt.getTime());
        if (diff <= 30_000) {
          anomalies.push({
            session_id: sessionId,
            user_id: userId,
            type: 'ip_mismatch',
            severity: 2,
            details: {
              startIp,
              completeIp: ip,
              deltaMs: diff
            }
          });
        }
      }

      const startMeta = (startEvent.meta as Record<string, unknown> | null | undefined) ?? null;
      const startDeviceHash =
        startMeta && typeof startMeta['deviceHash'] === 'string'
          ? (startMeta['deviceHash'] as string)
          : deviceHash;

      if (await detectDeviceAbuse(startDeviceHash ?? deviceHash, userId)) {
        anomalies.push({
          session_id: sessionId,
          user_id: userId,
          type: 'repeated_device',
          severity: 3,
          details: {
            deviceHash: startDeviceHash ?? deviceHash,
            windowHours: 24,
            threshold: DEVICE_THRESHOLD
          }
        });
      }
    }

    if (anomalies.length > 0) {
      await upsertAnomalies(
        anomalies.map((entry) => ({
          ...entry,
          details: {
            ...entry.details,
            gameId
          }
        }))
      );
    }
  } catch (err) {
    console.error('[anti-cheat] inspectSessionComplete failed', err, {
      sessionId,
      userId
    });
  }
};
