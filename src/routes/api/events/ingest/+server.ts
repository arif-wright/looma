import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { agentRegistry, dispatchEvent } from '$lib/server/agents';
import type { AgentEvent } from '$lib/agents/types';
import { getContextBundle } from '$lib/server/context/getContextBundle';
import { addTrace } from '$lib/server/agents/traceStore';
import { dev } from '$app/environment';
import { getConsentFlags } from '$lib/server/consent';

const ALLOWED_TYPES = new Set(['session.start', 'session.return', 'game.complete']);
const WINDOW_MS = 60_000;
const RATE_LIMIT = 20;
const buckets = new Map<string, number[]>();

const prune = (timestamps: number[], now: number) => timestamps.filter((ts) => now - ts < WINDOW_MS);

const throttle = (key: string) => {
  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const recent = prune(existing, now);
  if (recent.length >= RATE_LIMIT) {
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
};

const resolveScope = (type: string) => {
  if (type.startsWith('session.')) return 'app';
  if (type.startsWith('game.')) return 'game';
  return 'app';
};

export const POST: RequestHandler = async (event) => {
  let payload: { type?: unknown; payload?: unknown; meta?: unknown } = {};
  try {
    payload = (await event.request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = typeof payload.type === 'string' ? payload.type : '';
  if (!type || !ALLOWED_TYPES.has(type)) {
    return json({ error: 'Unsupported event type' }, { status: 400 });
  }

  const meta = (payload.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta)
    ? (payload.meta as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const { session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session?.user?.id ?? null;
  const sessionId = typeof meta.sessionId === 'string' ? meta.sessionId : null;

  const throttleKey = userId ?? (typeof event.getClientAddress === 'function' ? event.getClientAddress() : null) ?? 'anonymous';
  if (!throttle(throttleKey)) {
    return json({ error: 'rate_limited' }, { status: 429 });
  }

  const context = await getContextBundle(event, { userId, sessionId });
  const eventPayload =
    payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
      ? (payload.payload as Record<string, unknown>)
      : null;

  const consent = await getConsentFlags(event);
  const reactionsEnabled = (context as any)?.portableState?.reactionsEnabled;
  const suppressReactions = reactionsEnabled === false;

  const agentEvent: AgentEvent = {
    id: crypto.randomUUID(),
    type,
    scope: resolveScope(type),
    timestamp: typeof meta.ts === 'string' ? meta.ts : new Date().toISOString(),
    payload: eventPayload ?? null,
    context: context as unknown as Record<string, unknown>,
    meta: {
      sessionId,
      userId: userId ?? undefined,
      suppressReactions,
      suppressMemory: !consent.memory,
      suppressAdaptation: !consent.adaptation
    }
  };

  const trace = await dispatchEvent(agentEvent, { registry: agentRegistry });
  const output = trace.results.find((result) => result.output)?.output ?? null;
  if (dev) {
    addTrace(trace);
  }

  return json({
    ok: true,
    vetoed: trace.vetoed,
    output,
    actions: [],
    traceId: trace.event.id
  });
};
