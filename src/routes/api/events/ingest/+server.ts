import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { trackLightweightUsage, type LightweightTrackedType } from '$lib/server/analytics/lightweight';
import { agentRegistry, dispatchEvent } from '$lib/server/agents';
import type { AgentEvent } from '$lib/agents/types';
import { getContextBundle } from '$lib/server/context/getContextBundle';
import { addTrace } from '$lib/server/agents/traceStore';
import { dev } from '$app/environment';
import { getConsentFlags } from '$lib/server/consent';
import { applyWorldStateBoundary, markWorldWhisperShown } from '$lib/server/context/worldState';
import { syncPortableState } from '$lib/server/context/portableSync';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
import { coercePortableIdentity } from '$lib/server/context/portableIdentity';
import {
  COMPANION_MILESTONE_RULES,
  FIRST_ACTIVE_AT_ITEM_KEY,
  evaluateCompanionMilestones
} from '$lib/companions/progression';

const ALLOWED_TYPES = new Set([
  'session.start',
  'session.end',
  'session.return',
  'game.session.start',
  'game.complete',
  'mission.start',
  'mission.complete',
  'identity.complete',
  'companion.swap',
  'companion.ritual.listen',
  'companion.ritual.focus',
  'companion.ritual.celebrate',
  'preference.toggle'
]);
const EVENTS_RATE_LIMIT_WINDOW_MS =
  Number.parseInt(env.EVENTS_INGEST_RATE_LIMIT_WINDOW_MS ?? '60000', 10) || 60_000;
const EVENTS_RATE_LIMIT_PER_WINDOW =
  Number.parseInt(env.EVENTS_INGEST_RATE_LIMIT_PER_WINDOW ?? '20', 10) || 20;
const buckets = new Map<string, number[]>();

const prune = (timestamps: number[], now: number) =>
  timestamps.filter((ts) => now - ts < EVENTS_RATE_LIMIT_WINDOW_MS);

const throttle = (key: string): { ok: true } | { ok: false; retryAfter: number } => {
  const now = Date.now();
  const existing = buckets.get(key) ?? [];
  const recent = prune(existing, now);
  if (recent.length >= EVENTS_RATE_LIMIT_PER_WINDOW) {
    const oldest = recent[0];
    const retryAfter = oldest
      ? Math.max(1, Math.ceil((EVENTS_RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000))
      : 1;
    return { ok: false, retryAfter };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true };
};

const resolveScope = (type: string) => {
  if (type.startsWith('session.')) return 'app';
  if (type.startsWith('game.')) return 'game';
  if (type.startsWith('companion.')) return 'companion';
  return 'app';
};

const coercePortableState = (input: unknown): PortableState => {
  const now = new Date().toISOString();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      version: PORTABLE_STATE_VERSION,
      updatedAt: now,
      items: [],
      companions: normalizePortableCompanions(null)
    };
  }

  const payload = input as Record<string, unknown>;
  return {
    version: PORTABLE_STATE_VERSION,
    updatedAt: typeof payload.updatedAt === 'string' ? payload.updatedAt : now,
    items: Array.isArray(payload.items) ? (payload.items as PortableState['items']) : [],
    identity: coercePortableIdentity(payload.identity),
    companions: normalizePortableCompanions(payload.companions)
  };
};

const upsertPortableItem = (state: PortableState, key: string, value: string) => {
  const nextItems = state.items.filter((entry) => entry.key !== key);
  nextItems.push({
    key,
    value,
    updatedAt: new Date().toISOString(),
    source: 'companion_progression'
  });
  return nextItems.slice(-20);
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

  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401 });
  }

  const userId = session?.user?.id ?? null;
  const sessionId = typeof meta.sessionId === 'string' ? meta.sessionId : null;

  const throttleKey = userId ?? (typeof event.getClientAddress === 'function' ? event.getClientAddress() : null) ?? 'anonymous';
  const throttleResult = throttle(throttleKey);
  if (!throttleResult.ok) {
    return json(
      {
        error: 'rate_limited',
        message: 'You are sending events too quickly. Please wait a moment and try again.',
        retryAfter: throttleResult.retryAfter
      },
      { status: 429 }
    );
  }

  const consent = await getConsentFlags(event, supabase);
  const eventPayload =
    payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
      ? (payload.payload as Record<string, unknown>)
      : null;

  const suppressAdaptationFromMeta = meta.suppressAdaptation === true;
  const suppressMemoryFromMeta = meta.suppressMemory === true;
  const trackableType = ALLOWED_TYPES.has(type as LightweightTrackedType)
    ? (type as LightweightTrackedType)
    : null;
  if (
    userId &&
    trackableType &&
    (trackableType === 'session.start' ||
      trackableType === 'session.end' ||
      trackableType === 'game.session.start' ||
      trackableType === 'game.complete' ||
      trackableType === 'companion.swap' ||
      trackableType === 'preference.toggle')
  ) {
    await trackLightweightUsage({
      supabase,
      type: trackableType,
      payload: eventPayload,
      sessionId,
      consent,
      suppressMemory: suppressMemoryFromMeta,
      suppressAdaptation: suppressAdaptationFromMeta
    });
  }

  if (userId && consent.adaptation && !suppressAdaptationFromMeta && (type === 'session.start' || type === 'session.end')) {
    try {
      const endIsoFromPayload =
        type === 'session.end' && typeof eventPayload?.lastSeenISO === 'string' ? eventPayload.lastSeenISO : null;
      const engagement =
        type === 'session.end'
          ? {
              pagesVisitedCount:
                typeof eventPayload?.pagesVisitedCount === 'number' ? eventPayload.pagesVisitedCount : null,
              gamesPlayedCount:
                typeof eventPayload?.gamesPlayedCount === 'number' ? eventPayload.gamesPlayedCount : null
            }
          : null;
      await applyWorldStateBoundary({
        supabase,
        userId,
        type: type as 'session.start' | 'session.end',
        ...(endIsoFromPayload ? { endIso: endIsoFromPayload } : {}),
        ...(engagement ? { engagement } : {})
      });
    } catch (err) {
      console.error('[events] world state boundary update failed', err);
    }
  }

  const context = await getContextBundle(event, { userId, sessionId });
  const reactionsEnabled = (context as any)?.portableState?.reactionsEnabled;
  const suppressReactions = reactionsEnabled === false || meta.suppressReactions === true;
  const nowIso = typeof meta.ts === 'string' ? meta.ts : new Date().toISOString();

  if (userId && consent.memory && (type === 'session.start' || type === 'session.end')) {
    try {
      await syncPortableState({
        userId,
        sessionId,
        eventType: type,
        portableState: context?.portableState ?? null
      });
    } catch (err) {
      console.error('[events] portable sync stub failed', err);
    }
  }

  let progressionUnlocks: Array<{ id: string; cosmeticId: string; label: string }> = [];
  if (userId && consent.memory && (type === 'session.start' || type === 'session.end')) {
    try {
      const worldState = (context as any)?.worldState ?? {};
      const streakDays =
        typeof worldState.streakDays === 'number' && Number.isFinite(worldState.streakDays)
          ? Math.max(0, Math.floor(worldState.streakDays))
          : 0;
      const gamesPlayedCount =
        typeof worldState.lastGamesPlayed === 'number' && Number.isFinite(worldState.lastGamesPlayed)
          ? Math.max(0, Math.floor(worldState.lastGamesPlayed))
          : 0;

      const { data: prefData, error: prefError } = await supabase
        .from('user_preferences')
        .select('portable_state')
        .eq('user_id', userId)
        .maybeSingle();

      if (prefError && prefError.code !== 'PGRST116') {
        console.error('[events] progression portable_state fetch failed', prefError);
      } else {
        const portableState = coercePortableState(prefData?.portable_state);
        const companions = normalizePortableCompanions(portableState.companions);
        const activeCompanionIndex = companions.roster.findIndex((entry) => entry.id === companions.activeId);
        if (activeCompanionIndex >= 0) {
          const activeCompanion = companions.roster[activeCompanionIndex];
          if (!activeCompanion) {
            throw new Error('Active companion missing from roster');
          }
          const firstActiveAtItem = portableState.items.find((entry) => entry.key === FIRST_ACTIVE_AT_ITEM_KEY);
          const firstActiveAtIso =
            typeof firstActiveAtItem?.value === 'string' && firstActiveAtItem.value ? firstActiveAtItem.value : nowIso;
          const earned = evaluateCompanionMilestones({
            nowIso,
            firstActiveAtIso,
            streakDays,
            gamesPlayedCount,
            unlockedCosmetics: activeCompanion.cosmeticsUnlocked ?? []
          });

          const hasFirstActiveAtStored = Boolean(
            firstActiveAtItem && typeof firstActiveAtItem.value === 'string' && firstActiveAtItem.value
          );

          if (earned.length > 0 || !hasFirstActiveAtStored) {
            const nextUnlocked = new Set(activeCompanion.cosmeticsUnlocked ?? []);
            for (const unlock of earned) {
              nextUnlocked.add(unlock.cosmeticId);
            }

            const nextRoster = companions.roster.slice();
            const nextActiveCompanion = {
              ...activeCompanion,
              cosmeticsUnlocked: [...nextUnlocked]
            };
            nextRoster[activeCompanionIndex] = nextActiveCompanion;

            const nextPortable: PortableState = {
              ...portableState,
              updatedAt: new Date().toISOString(),
              items: hasFirstActiveAtStored
                ? portableState.items
                : upsertPortableItem(portableState, FIRST_ACTIVE_AT_ITEM_KEY, firstActiveAtIso),
              companions: {
                ...companions,
                roster: nextRoster
              }
            };

            const { error: updateError } = await supabase
              .from('user_preferences')
              .upsert(
                {
                  user_id: userId,
                  portable_state: nextPortable
                },
                { onConflict: 'user_id', ignoreDuplicates: false }
              );

            if (updateError) {
              console.error('[events] progression portable_state update failed', updateError);
            } else {
              progressionUnlocks = earned.map((rule) => ({
                id: rule.id,
                cosmeticId: rule.cosmeticId,
                label: rule.label
              }));
            }
          }
        }
      }
    } catch (err) {
      console.error('[events] progression unlock evaluation failed', err);
    }
  }

  const agentEvent: AgentEvent = {
    id: crypto.randomUUID(),
    type,
    scope: resolveScope(type),
    timestamp: nowIso,
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
  let output: Record<string, unknown> | null = null;
  for (const result of trace.results) {
    const candidate = result.output as Record<string, unknown> | null;
    if (!candidate) continue;
    output = { ...(output ?? {}), ...candidate };
    if (!output.reaction && candidate.reaction) {
      output.reaction = candidate.reaction;
    }
    if (!output.whisper && candidate.whisper) {
      output.whisper = candidate.whisper;
    }
  }

  const whisper = (output?.whisper ?? null) as Record<string, unknown> | null;
  if (userId && whisper && typeof whisper.text === 'string') {
    if (!output?.reaction) {
      output = {
        ...(output ?? {}),
        reaction: {
          text: whisper.text,
          kind: 'whisper',
          ttlMs: typeof whisper.ttlMs === 'number' ? whisper.ttlMs : 4800
        }
      };
    }
    try {
      const whisperMeta = (output?.whisperMeta ?? null) as Record<string, unknown> | null;
      const whisperAt = typeof whisperMeta?.at === 'string' ? whisperMeta.at : new Date().toISOString();
      const whisperStreak =
        typeof whisperMeta?.streakDays === 'number' && Number.isFinite(whisperMeta.streakDays)
          ? Math.max(0, Math.floor(whisperMeta.streakDays))
          : 0;
      await markWorldWhisperShown({ supabase, userId, whisperAt, whisperStreak });
    } catch (err) {
      console.error('[events] failed to persist whisper metadata', err);
    }
  }

  if (dev) {
    addTrace(trace);
  }

  if (progressionUnlocks.length > 0) {
    output = {
      ...(output ?? {}),
      progressionUnlocks,
      progressionRules: COMPANION_MILESTONE_RULES.map((rule) => ({
        id: rule.id,
        threshold: rule.threshold,
        kind: rule.kind,
        cosmeticId: rule.cosmeticId
      }))
    };
    if (!suppressReactions) {
      const unlockLabel = progressionUnlocks[0]?.label ?? 'Companion unlock';
      const suffix = progressionUnlocks.length > 1 ? ` (+${progressionUnlocks.length - 1} more)` : '';
      output.reaction = {
        text: `Unlock earned: ${unlockLabel}${suffix}`,
        kind: 'companion.unlock',
        ttlMs: 3600
      };
    }
  }

  return json({
    ok: true,
    vetoed: trace.vetoed,
    output,
    actions: [],
    traceId: trace.event.id
  });
};
