import type { RequestEvent } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';
import { formatJoined } from '$lib/format/date';

const PROFILE_COLUMNS =
  'id, handle, display_name, avatar_url, banner_url, bio, links, is_private, joined_at, show_shards, show_level, show_joined';

type StatsRow = {
  level: number | null;
  bonded_count: number | null;
};

export type ProfileOgData = {
  isPrivate: boolean;
  handle?: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  level?: number | null;
  bonded?: number | null;
  joinedLabel?: string | null;
};

export async function getProfileOgData(event: RequestEvent, handle: string): Promise<ProfileOgData | null> {
  const supabase = supabaseServer(event);

  const { data: profileRow, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();

  if (error) {
    console.error('[og] profile lookup failed', error);
    return null;
  }

  if (!profileRow) return null;
  if (profileRow.is_private) {
    return { isPrivate: true };
  }

  const { data: statsRow, error: statsError } = await supabase
    .from('player_stats')
    .select('level, bonded_count')
    .eq('id', profileRow.id)
    .maybeSingle();

  if (statsError) {
    console.error('[og] stats lookup failed', statsError);
  }

  const showLevel = profileRow.show_level ?? true;
  const showJoined = profileRow.show_joined ?? true;

  const stats = (statsRow as StatsRow | null) ?? { level: null, bonded_count: null };

  return {
    isPrivate: false,
    handle: profileRow.handle,
    displayName: profileRow.display_name ?? profileRow.handle,
    avatarUrl: profileRow.avatar_url,
    bannerUrl: profileRow.banner_url,
    bio: profileRow.bio,
    level: showLevel ? stats.level ?? null : null,
    bonded: stats.bonded_count ?? null,
    joinedLabel: showJoined ? formatJoined(profileRow.joined_at ?? null) : null
  };
}
