import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { supabaseServer } from '$lib/supabaseClient';
import { getFollowCounts } from '$lib/server/follows';
import { getFollowPrivacyStatus } from '$lib/server/privacy';
import { ensureBlockedPeers, isBlockedPeer } from '$lib/server/blocks';

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
  const blockPeers = await ensureBlockedPeers(event, supabase);
  const blocked = isBlockedPeer(blockPeers, profileRow.id);
  const blockedView = blocked && !isOwner;

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

  const isFollowing = blockedView ? false : privacyStatus?.isFollowing ?? false;
  const requested = blockedView ? false : privacyStatus?.requested ?? false;
  const gated = blockedView || (accountPrivate && !isOwner && !isFollowing);
  const profile = {
    id: profileRow.id,
    user_id: profileRow.id,
    handle: profileRow.handle,
    display_name: profileRow.display_name,
    avatar_url: profileRow.avatar_url,
    banner_url: profileRow.banner_url,
    bio: blockedView ? null : profileRow.bio,
    pronouns: blockedView ? null : profileRow.pronouns,
    location: blockedView ? null : profileRow.location,
    links: blockedView ? [] : parseLinks(profileRow.links),
    is_private: Boolean(profileRow.is_private),
    account_private: accountPrivate,
    joined_at: blockedView ? null : profileRow.joined_at,
    featured_companion_id: blockedView ? null : profileRow.featured_companion_id,
    show_shards: blockedView ? false : profileRow.show_shards ?? true,
    show_level: blockedView ? false : profileRow.show_level ?? true,
    show_joined: blockedView ? false : profileRow.show_joined ?? true,
    show_location: blockedView ? false : profileRow.show_location ?? true,
    show_achievements: blockedView ? false : profileRow.show_achievements ?? true,
    show_feed: blockedView ? false : profileRow.show_feed ?? true,
    level: blockedView ? null : statsRow?.level ?? null,
    xp: blockedView ? null : statsRow?.xp ?? null,
    xp_next: blockedView ? null : statsRow?.xp_next ?? null,
    bonded_count: blockedView ? null : statsRow?.bonded_count ?? null,
    energy: blockedView ? null : statsRow?.energy ?? null,
    energy_max: blockedView ? null : statsRow?.energy_max ?? null
  };

  return {
    profile,
    viewerId,
    isOwner,
    followCounts,
    isFollowing,
    requested,
    gated,
    isOwnProfile: isOwner,
    blocked: blockedView
  };
};
