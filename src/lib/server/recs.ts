import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '$lib/server/supabase';

export type FollowRecommendationProfile = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
};

export type FollowRecommendation = {
  user_id: string;
  mutuals: number;
  shared_following: number;
  popularity: number;
  score: number;
  profile: FollowRecommendationProfile;
};

const clampLimit = (value: number) => Math.max(1, Math.min(50, Math.floor(value)));
const clampOffset = (value: number) => Math.max(0, Math.floor(value));
const TEST_HANDLE_PATTERNS = [/^seed-/i, /^test[-_]/i];

const isHiddenRecommendationProfile = (profile: FollowRecommendationProfile) => {
  const handle = (profile.handle ?? '').trim();
  const displayName = (profile.display_name ?? '').trim();
  if (!handle && !displayName) return false;
  const identity = `${handle} ${displayName}`.toLowerCase();
  return TEST_HANDLE_PATTERNS.some((pattern) => pattern.test(handle)) || identity.includes('seed-author');
};

export async function fetchPeopleRecs(
  supabase: SupabaseClient,
  from = 0,
  limit = 12
): Promise<FollowRecommendation[]> {
  const offset = clampOffset(from);
  const clampedLimit = clampLimit(limit);
  const rangeEnd = offset + clampedLimit - 1;

  const { data, error } = await supabase
    .from('follow_recommendations')
    .select('user_id, mutuals, shared_following, popularity, score')
    .range(offset, rangeEnd);

  if (error) {
    console.error('[recs] follow_recommendations lookup failed', error);
    return [];
  }

  const rows = Array.isArray(data) ? data : [];
  const ids = rows
    .map((row) => row.user_id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (!ids.length) {
    return [];
  }

  const { data: profilesData, error: profilesError } = await supabaseAdmin
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', ids);

  if (profilesError) {
    console.error('[recs] profile hydrate failed', profilesError);
  }

  const profileMap = new Map<string, FollowRecommendationProfile>();
  for (const profile of profilesData ?? []) {
    if (typeof profile.id !== 'string') continue;
    profileMap.set(profile.id, {
      id: profile.id,
      handle: String(profile.handle ?? '') || profile.id.slice(0, 8),
      display_name: String(profile.display_name ?? profile.handle ?? 'Explorer'),
      avatar_url: (profile.avatar_url as string | null) ?? null
    });
  }

  return rows
    .map((row) => {
      const profile = profileMap.get(row.user_id);
      if (!profile) return null;
      if (isHiddenRecommendationProfile(profile)) return null;
      return {
        user_id: row.user_id,
        mutuals: Number(row.mutuals ?? 0),
        shared_following: Number(row.shared_following ?? 0),
        popularity: Number(row.popularity ?? 0),
        score: Number(row.score ?? 0),
        profile
      } satisfies FollowRecommendation;
    })
    .filter((entry): entry is FollowRecommendation => Boolean(entry));
}
