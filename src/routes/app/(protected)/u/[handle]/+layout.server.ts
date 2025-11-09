import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { getFollowCounts } from '$lib/server/follows';
import { getFollowPrivacyStatus } from '$lib/server/privacy';

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, banner_url, bio, pronouns, location, links, is_private, account_private, joined_at, featured_companion_id, show_shards, show_level, show_joined, show_location, show_achievements, show_feed';

const parseLinks = (value: unknown) => {
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

export const load: LayoutServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const handleParam = event.params.handle;
  const viewerId = event.locals.user?.id ?? null;

  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('handle', handleParam)
    .maybeSingle();

  if (profileError) {
    console.error('[profile layout] profile lookup failed', profileError);
    throw error(500, 'Unable to load profile');
  }

  if (!profileRow) {
    throw error(404, 'Profile not found');
  }

  const isOwner = viewerId === profileRow.id;
  const accountPrivate = Boolean(profileRow.account_private ?? profileRow.is_private ?? false);

  const [{ data: statsRow, error: statsError }, followCounts, privacyStatus] = await Promise.all([
    supabase
      .from('player_stats')
      .select('level, xp, xp_next, energy, energy_max, bonded_count')
      .eq('id', profileRow.id)
      .maybeSingle(),
    getFollowCounts(profileRow.id),
    getFollowPrivacyStatus(viewerId, profileRow.id)
  ]);

  if (statsError) {
    console.error('[profile layout] stats lookup failed', statsError);
  }

  const isFollowing = privacyStatus?.isFollowing ?? false;
  const requested = privacyStatus?.requested ?? false;
  const gated = accountPrivate && !isOwner && !isFollowing;

  const profile = {
    id: profileRow.id,
    handle: profileRow.handle,
    display_name: profileRow.display_name,
    avatar_url: profileRow.avatar_url,
    banner_url: profileRow.banner_url,
    bio: profileRow.bio,
    pronouns: profileRow.pronouns,
    location: profileRow.location,
    links: parseLinks(profileRow.links),
    is_private: Boolean(profileRow.is_private),
    account_private: accountPrivate,
    joined_at: profileRow.joined_at,
    featured_companion_id: profileRow.featured_companion_id,
    show_shards: profileRow.show_shards ?? true,
    show_level: profileRow.show_level ?? true,
    show_joined: profileRow.show_joined ?? true,
    level: statsRow?.level ?? null,
    xp: statsRow?.xp ?? null,
    xp_next: statsRow?.xp_next ?? null,
    bonded_count: statsRow?.bonded_count ?? null,
    energy: statsRow?.energy ?? null,
    energy_max: statsRow?.energy_max ?? null
  };

  return {
    profile,
    viewerId,
    isOwner,
    followCounts,
    isFollowing,
    requested,
    gated,
    isOwnProfile: isOwner
  };
};
