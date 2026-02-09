import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { agentRegistry, dispatchEvent } from '$lib/server/agents';
import type { AgentEvent } from '$lib/agents/types';
import { getContextBundle } from '$lib/server/context/getContextBundle';
import { addTrace } from '$lib/server/agents/traceStore';
import { dev } from '$app/environment';
import { getConsentFlags } from '$lib/server/consent';
import { applyWorldStateBoundary, markWorldWhisperShown } from '$lib/server/context/worldState';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
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
  'game.complete'
]);
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
  if (!throttle(throttleKey)) {
    return json({ error: 'rate_limited' }, { status: 429 });
  }

  const consent = await getConsentFlags(event, supabase);
  const eventPayload =
    payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
      ? (payload.payload as Record<string, unknown>)
      : null;

  const suppressAdaptationFromMeta = meta.suppressAdaptation === true;
  if (userId && consent.adaptation && !suppressAdaptationFromMeta && (type === 'session.start' || type === 'session.end')) {
    try {
      const endIsoFromPayload =
        type === 'session.end' && typeof eventPayload?.lastSeenISO === 'string' ? eventPayload.lastSeenISO : null;
      await applyWorldStateBoundary({
        supabase,
        userId,
        type: type as 'session.start' | 'session.end',
        endIso: endIsoFromPayload,
        engagement:
          type === 'session.end'
            ? {
                pagesVisitedCount:
                  typeof eventPayload?.pagesVisitedCount === 'number' ? eventPayload.pagesVisitedCount : null,
                gamesPlayedCount:
                  typeof eventPayload?.gamesPlayedCount === 'number' ? eventPayload.gamesPlayedCount : null
              }
            : undefined
      });
    } catch (err) {
      console.error('[events] world state boundary update failed', err);
    }
  }

  const context = await getContextBundle(event, { userId, sessionId });
  const reactionsEnabled = (context as any)?.portableState?.reactionsEnabled;
  const suppressReactions = reactionsEnabled === false || meta.suppressReactions === true;
  const nowIso = typeof meta.ts === 'string' ? meta.ts : new Date().toISOString();

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
            nextRoster[activeCompanionIndex] = {
              ...activeCompanion,
              cosmeticsUnlocked: [...nextUnlocked]
            };

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
