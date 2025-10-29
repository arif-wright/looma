import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { recordAnalyticsEvent } from '$lib/server/analytics';
import {
  computeLanding,
  shouldResolveLanding,
  type LandingDecision,
  type PreferenceRow,
  type MissionCandidate
} from '$lib/server/landing';
const HOURS_12 = 12 * 60 * 60 * 1000;

const variantRoll = (): 'A' | 'B' | 'C' => {
  const roll = Math.random();
  if (roll < 0.25) return 'A';
  if (roll < 0.5) return 'B';
  return 'C';
};

const normalizePath = (path: string) => {
  if (path === '/') return path;
  return path.endsWith('/') && path.length > 1 ? path.slice(0, -1) : path;
};

const withinWindow = (iso: string | null | undefined, windowMs: number) => {
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= windowMs;
};

const getOrCreatePreferences = async (
  supabase: ReturnType<typeof supabaseServer>,
  userId: string
): Promise<PreferenceRow> => {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('user_id, start_on, last_context, last_context_payload, ab_variant, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[resolver] user_preferences lookup failed', error);
  }

  if (data) {
    return data as PreferenceRow;
  }

  const { data: inserted, error: insertError } = await supabase
    .from('user_preferences')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select('user_id, start_on, last_context, last_context_payload, ab_variant, updated_at')
    .single();

  if (insertError) {
    console.error('[resolver] user_preferences upsert failed', insertError);
  }

  return (
    (inserted as PreferenceRow | null) ?? {
      user_id: userId,
      start_on: 'home',
      last_context: null,
      last_context_payload: null,
      ab_variant: null,
      updated_at: null
    }
  );
};

const extractContext = (entry: PreferenceRow['last_context']): string | null => {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  const context = (entry as Record<string, unknown>).context;
  return typeof context === 'string' ? context : null;
};

const computeNavActivity = (prefs: PreferenceRow): Record<string, number> => {
  const context = extractContext(prefs.last_context);
  const activity: Record<string, number> = {};
  switch (context) {
    case 'mission':
      activity['/app/missions'] = 1;
      break;
    case 'creature':
      activity['/app/creatures'] = 1;
      break;
    case 'feed':
    case 'social':
      activity['/app/home'] = 1;
      break;
    case 'dashboard':
      activity['/app/dashboard'] = 1;
      break;
    default:
      break;
  }
  return activity;
};

const ensureVariant = async (
  supabase: ReturnType<typeof supabaseServer>,
  prefs: PreferenceRow
): Promise<'A' | 'B' | 'C'> => {
  if (prefs.ab_variant) return prefs.ab_variant;

  const assigned = variantRoll();
  const { error } = await supabase
    .from('user_preferences')
    .update({ ab_variant: assigned })
    .eq('user_id', prefs.user_id);

  if (error) {
    console.error('[resolver] failed to persist variant assignment', error);
  } else {
    prefs.ab_variant = assigned;
  }

  return assigned;
};

const fetchActiveMission = async (
  supabase: ReturnType<typeof supabaseServer>,
  userId: string
): Promise<MissionCandidate | null> => {
  try {
    const { data, error } = await supabase
      .from('missions')
      .select('id, status, updated_at, assignee_id, user_id')
      .or(`assignee_id.eq.${userId},user_id.eq.${userId}`)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      console.info('[resolver] missions lookup unavailable', error.message);
      return null;
    }

    const mission = data?.[0] as MissionCandidate | undefined;
    if (!mission) return null;
    if (!withinWindow(mission.updated_at, HOURS_12)) return null;
    return mission;
  } catch (err) {
    console.info('[resolver] missions query skipped', err);
    return null;
  }
};

const fetchCareDue = async (
  supabase: ReturnType<typeof supabaseServer>,
  userId: string
): Promise<{ creatureId: string | null } | null> => {
  try {
    const { data, error } = await supabase
      .from('creatures')
      .select('id, owner_id, care_due_at, next_care_at, needs_care, mood_expires_at')
      .eq('owner_id', userId)
      .limit(5);

    if (error) {
      console.info('[resolver] creatures lookup unavailable', error.message);
      return null;
    }

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const now = Date.now();
    for (const raw of data as Array<Record<string, any>>) {
      const dueAt = raw.care_due_at ?? raw.next_care_at ?? raw.mood_expires_at ?? null;
      const needsCare = raw.needs_care ?? false;
      if (needsCare) {
        return { creatureId: raw.id as string };
      }
      if (dueAt && !Number.isNaN(Date.parse(dueAt))) {
        if (now >= Date.parse(dueAt)) {
          return { creatureId: raw.id as string };
        }
      }
    }

    return null;
  } catch (err) {
    console.info('[resolver] creatures query skipped', err);
    return null;
  }
};

export const load: LayoutServerLoad = async (event) => {
  const { locals, url, cookies } = event;
  const session = locals.session;

  if (!session) {
    const redirectTarget = url.pathname + url.search;
    const loginLocation = redirectTarget
      ? '/login?next=' + encodeURIComponent(redirectTarget)
      : '/login';

    throw redirect(303, loginLocation);
  }

  const normalizedPath = normalizePath(url.pathname);
  const forceHome = url.searchParams.get('forceHome') === '1';
  const resolverMode = shouldResolveLanding(normalizedPath, forceHome);

  const supabase = supabaseServer(event);
  const preferences = await getOrCreatePreferences(supabase, session.user.id);
  const variant = await ensureVariant(supabase, preferences);
  let notifications: Array<Record<string, any>> = [];
  let notificationsUnread = 0;

  try {
    const { data: notificationRows, error: notificationError } = await supabase.rpc(
      'get_notifications_for_user',
      {
        p_user: session.user.id,
        p_limit: 20
      }
    );

    if (notificationError) {
      console.error('[resolver] notifications fetch failed', notificationError);
    } else if (Array.isArray(notificationRows)) {
      notifications = notificationRows;
      notificationsUnread = notificationRows.filter((row) => row?.read === false).length;
    }
  } catch (err) {
    console.error('[resolver] notifications fetch unexpected error', err);
  }

  let decision: LandingDecision | null = null;

  if (resolverMode === 'force-home') {
    throw redirect(302, '/app/home');
  }

  if (resolverMode === 'resolve') {
    const [mission, careDue] = await Promise.all([
      fetchActiveMission(supabase, session.user.id),
      fetchCareDue(supabase, session.user.id)
    ]);

    const contextPayload =
      (preferences.last_context_payload as Record<string, unknown> | null) ?? null;

    decision = computeLanding(preferences, variant, mission, careDue, contextPayload);

    const decisionPath = normalizePath(decision.target);

    await recordAnalyticsEvent(supabase, session.user.id, 'app_landed', {
      surface: decision.surface,
      variant,
      payload: {
        reason: decision.reason,
        missionId: mission?.id ?? contextPayload?.missionId ?? null,
        creatureId: careDue?.creatureId ?? contextPayload?.creatureId ?? null
      }
    });

    cookies.set('looma_landing_at', Date.now().toString(), {
      path: '/app',
      httpOnly: true,
      sameSite: 'lax',
      secure: url.protocol === 'https:'
    });

    if (decisionPath !== normalizedPath) {
      throw redirect(302, decision.target);
    }
  }

  return {
    session,
    user: session.user,
    preferences,
    landingVariant: variant,
    landingSurface: decision?.surface ?? null,
    navActivity: computeNavActivity(preferences),
    notifications,
    notificationsUnread
  };
};
