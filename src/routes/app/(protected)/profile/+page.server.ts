import { error } from '@sveltejs/kit';
import type { User } from '@supabase/supabase-js';
import type { PageServerLoad } from './$types';
import { requireUserServer } from '$lib/server/auth';
import { normalizeHandle } from '$lib/utils/handle';

type ProfileRow = {
  id: string;
  handle: string;
  display_name: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  links: Record<string, unknown>[] | null;
  is_private: boolean | null;
  joined_at: string | null;
};

type StatsRow = {
  level: number | null;
  xp: number | null;
  xp_next: number | null;
  energy: number | null;
  energy_max: number | null;
};

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, banner_url, bio, links, is_private, joined_at';

const randomSuffix = () => Math.random().toString(36).slice(2, 8);

const buildHandleCandidate = (base: string, suffix: string) => {
  const sanitized = normalizeHandle(base) || 'player';
  const allowance = Math.max(3, 20 - (suffix.length + 1));
  const clipped = sanitized.slice(0, allowance);
  return `${clipped}_${suffix}`;
};

const resolveDisplayName = (user: User) => {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const candidate =
    (metadata.display_name as string) ??
    (metadata.full_name as string) ??
    (metadata.name as string) ??
    user.email?.split('@')[0] ??
    'Explorer';
  return candidate;
};

const ensureProfile = async (supabase: App.Locals['supabase'], user: User): Promise<ProfileRow> => {
  const { data, error: fetchError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) {
    console.error('[profile] profile lookup failed', fetchError);
    throw error(500, 'Unable to load profile');
  }

  if (data) {
    return data as ProfileRow;
  }

  const displayName = resolveDisplayName(user);
  const baseHandle =
    (user.user_metadata?.handle as string | undefined) ??
    (user.user_metadata?.preferred_username as string | undefined) ??
    user.email?.split('@')[0] ??
    'player';

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const suffix = randomSuffix();
    const handle = buildHandleCandidate(baseHandle, suffix);
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert(
        {
          id: user.id,
          handle,
          display_name: displayName,
          bio: '',
          links: [],
          is_private: false
        },
        { onConflict: 'id', ignoreDuplicates: false }
      )
      .select(PROFILE_COLUMNS)
      .single();

    if (!insertError && inserted) {
      return inserted as ProfileRow;
    }

    if (insertError?.code === '23505' || insertError?.message?.includes('handle')) {
      continue;
    }

    console.error('[profile] profile upsert failed', insertError);
    break;
  }

  throw error(500, 'Unable to create profile');
};

const parseLinks = (value: ProfileRow['links']) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const label = String((entry as Record<string, unknown>).label ?? '').trim();
      const url = String((entry as Record<string, unknown>).url ?? '').trim();
      if (!label || !url) return null;
      return { label, url };
    })
    .filter((entry): entry is { label: string; url: string } => Boolean(entry));
};

export const load: PageServerLoad = async (event) => {
  const { supabase, user } = await requireUserServer(event);

  const profileRow = await ensureProfile(supabase, user);
  const parsedLinks = parseLinks(profileRow.links);

  const [statsResult, walletResult] = await Promise.all([
    supabase
      .from('player_stats')
      .select('level, xp, xp_next, energy, energy_max')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('user_wallets').select('shards').eq('user_id', user.id).maybeSingle()
  ]);

  if (statsResult.error) {
    console.error('[profile] stats lookup failed', statsResult.error);
  }
  if (walletResult.error) {
    console.error('[profile] wallet lookup failed', walletResult.error);
  }

  const stats = (statsResult.data as StatsRow | null) ?? {
    level: null,
    xp: null,
    xp_next: null,
    energy: null,
    energy_max: null
  };

  return {
    profile: {
      ...profileRow,
      links: parsedLinks,
      is_private: Boolean(profileRow.is_private)
    },
    stats,
    walletShards: walletResult.data?.shards ?? null,
    isOwner: true
  };
};
