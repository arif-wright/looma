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
import { getPlayerStats } from '$lib/server/queries/getPlayerStats';
import { getAdminFlags } from '$lib/server/admin-guard';
import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
import { normalizePortableCompanions } from '$lib/server/context/portableCompanions';
import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
import { isMuseCompanion, resolveMuseEvolutionStage } from '$lib/companions/evolution';
import { alphaGate } from '$lib/server/alphaGate';

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

const isAuthSurface = (path: string) =>
  path === '/app/auth' ||
  path === '/app/signup' ||
  path.startsWith('/app/auth') ||
  path.startsWith('/app/signup');

export const load: LayoutServerLoad = async (event) => {
  const { locals, url, cookies } = event;
  const user = locals.user;
  const normalizedPath = normalizePath(url.pathname);

  if (!user) {
    if (isAuthSurface(normalizedPath)) {
      return {
        user: null,
        preferences: null,
        landingVariant: null,
        landingSurface: null,
        navActivity: {},
        notifications: [],
        notificationsUnread: 0,
        headerStats: null,
        isAdmin: false
      };
    }

    throw redirect(302, '/');
  }

  const alpha = alphaGate({ id: user.id, email: user.email ?? null });
  const isAlphaPage = normalizedPath === '/app/alpha';
  if (alpha.enabled && !alpha.allowed) {
    if (!isAlphaPage) {
      throw redirect(302, '/app/alpha');
    }
    // Keep the alpha-denied page lightweight: skip heavy queries.
    return {
      user,
      alphaDenied: true,
      alphaContactEmail: alpha.contactEmail,
      alphaContactText: alpha.contactText,
      preferences: null,
      landingVariant: null,
      landingSurface: null,
      navActivity: {},
      notifications: [],
      notificationsUnread: 0,
      headerStats: null,
      isAdmin: false,
      adminFlags: { isAdmin: false, isFinance: false, isSuper: false },
      wallet: { shards: null },
      activeCompanion: null,
      portableActiveCompanion: null
    };
  }

  const forceHome = url.searchParams.get('forceHome') === '1';
  const resolverMode = shouldResolveLanding(normalizedPath, forceHome);

  const supabase = locals.supabase ?? supabaseServer(event);
  const preferences = await getOrCreatePreferences(supabase, user.id);
  const variant = await ensureVariant(supabase, preferences);
  let notifications: Array<Record<string, any>> = [];
  let notificationsUnread = 0;
  const headerStats = await getPlayerStats(event, supabase).catch(() => null);
  const { data: walletRow, error: walletError } = await supabase
    .from('user_wallets')
    .select('shards')
    .eq('user_id', user.id)
    .maybeSingle();

  if (walletError) {
    console.error('[resolver] wallet lookup failed', walletError);
  }

  let activeCompanion: ActiveCompanionSnapshot | null = null;
  let portableActiveCompanion:
    | {
        id: string;
        name: string;
        archetype: string;
        cosmetics: Record<string, string | number | boolean | null>;
        evolutionStage: string | null;
      }
    | null = null;

  try {
    const { data: notificationRows, error: notificationError } = await supabase
      .from('notifications')
      .select('id, user_id, actor_id, kind, target_id, target_kind, created_at, read, metadata')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (notificationError) {
      console.error('[resolver] notifications fetch failed', notificationError);
    } else if (Array.isArray(notificationRows)) {
      notifications = notificationRows.map((row) => ({
        ...row,
        metadata: (row?.metadata ?? {}) as Record<string, unknown>
      }));
      notificationsUnread = notifications.filter((row) => row?.read === false).length;
    }
  } catch (err) {
    console.error('[resolver] notifications fetch unexpected error', err);
  }

  try {
    const { data: activeRows, error: activeError } = await supabase
      .from('companions')
      .select(
        'id, name, species, mood, state, affection, trust, energy, avatar_url, is_active, slot_index, created_at, updated_at, stats:companion_stats(fed_at, played_at, groomed_at, last_passive_tick, last_daily_bonus_at, bond_level, bond_score)'
      )
      .eq('owner_id', user.id)
      .order('is_active', { ascending: false })
      .order('slot_index', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .limit(1);

    if (activeError) {
      console.error('[resolver] active companion lookup failed', activeError);
    } else if (activeRows && activeRows.length) {
      const row = activeRows[0] as Record<string, any>;
      const statsRow = (row.stats as Record<string, any> | null) ?? null;
      activeCompanion = {
        id: row.id as string,
        name: (row.name as string) ?? 'Companion',
        species: (row.species as string | null) ?? null,
        mood: (row.mood as string | null) ?? (row.state as string | null) ?? null,
        affection: (row.affection as number | null) ?? 0,
        trust: (row.trust as number | null) ?? 0,
        energy: (row.energy as number | null) ?? 0,
        avatar_url: (row.avatar_url as string | null) ?? null,
        bondLevel: (statsRow?.bond_level as number | null) ?? 0,
        bondScore: (statsRow?.bond_score as number | null) ?? 0,
        updated_at: (row.updated_at as string | null) ?? null,
        stats: statsRow
          ? {
              fed_at: (statsRow.fed_at as string | null) ?? null,
              played_at: (statsRow.played_at as string | null) ?? null,
              groomed_at: (statsRow.groomed_at as string | null) ?? null,
              last_passive_tick: (statsRow.last_passive_tick as string | null) ?? null,
              last_daily_bonus_at: (statsRow.last_daily_bonus_at as string | null) ?? null,
              bond_level: (statsRow.bond_level as number | null) ?? null,
              bond_score: (statsRow.bond_score as number | null) ?? null
            }
          : null
      };
    }
  } catch (err) {
    console.error('[resolver] active companion lookup threw', err);
  }

  try {
    const { data: prefRow, error: prefError } = await supabase
      .from('user_preferences')
      .select('portable_state')
      .eq('user_id', user.id)
      .maybeSingle();

    if (prefError && prefError.code !== 'PGRST116') {
      console.error('[resolver] portable companions lookup failed', prefError);
    } else {
      const companions = normalizePortableCompanions(
        (prefRow?.portable_state as Record<string, unknown> | null)?.companions
      );
      const active =
        companions.roster.find((entry) => entry.id === companions.activeId) ?? companions.roster[0] ?? null;
      portableActiveCompanion = active
        ? {
            id: active.id,
            name: active.name,
            archetype: active.archetype,
            cosmetics: normalizeCompanionCosmetics(active.cosmetics),
            evolutionStage: isMuseCompanion(active.id)
              ? resolveMuseEvolutionStage({
                  companionId: active.id,
                  unlockedCosmetics: active.cosmeticsUnlocked
                }).label
              : null
          }
        : null;
    }
  } catch (err) {
    console.error('[resolver] portable companions lookup threw', err);
  }

  let decision: LandingDecision | null = null;

  if (resolverMode === 'force-home') {
    throw redirect(302, '/app/home');
  }

  if (resolverMode === 'resolve') {
    const [mission, careDue] = await Promise.all([
      fetchActiveMission(supabase, user.id),
      fetchCareDue(supabase, user.id)
    ]);

    const contextPayload =
      (preferences.last_context_payload as Record<string, unknown> | null) ?? null;

    decision = computeLanding(preferences, variant, mission, careDue, contextPayload);

    const decisionPath = normalizePath(decision.target);

    await recordAnalyticsEvent(supabase, user.id, 'app_landed', {
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

  const adminFlags = user
    ? await getAdminFlags(user.email ?? null, user.id)
    : { isAdmin: false, isFinance: false, isSuper: false };

  return {
    user,
    preferences,
    landingVariant: variant,
    landingSurface: decision?.surface ?? null,
    navActivity: computeNavActivity(preferences),
    notifications,
    notificationsUnread,
    headerStats,
    wallet: {
      shards: walletRow?.shards ?? null
    },
    activeCompanion,
    portableActiveCompanion,
    isAdmin: adminFlags.isAdmin,
    adminFlags
  };
};
