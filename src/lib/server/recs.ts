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
const POPULARITY_FALLBACK_POOL = 150;

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
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    if (authError) console.error('[recs] auth lookup failed', authError);
    return [];
  }

  const me = user.id;

  const { data: myFriendRows, error: myFriendError } = await supabaseAdmin
    .from('friends')
    .select('friend_id')
    .eq('user_id', me);

  if (myFriendError) {
    console.error('[recs] my friends lookup failed', myFriendError);
    return [];
  }

  const friendSet = new Set(
    (myFriendRows ?? [])
      .map((row) => (typeof row.friend_id === 'string' ? row.friend_id : null))
      .filter((id): id is string => Boolean(id))
  );

  const { data: blockRows, error: blockError } = await supabaseAdmin
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${me},blocked_id.eq.${me}`);

  if (blockError) {
    console.error('[recs] user_blocks lookup failed', blockError);
  }

  const blockedSet = new Set<string>();
  for (const row of blockRows ?? []) {
    const blocker = typeof row.blocker_id === 'string' ? row.blocker_id : null;
    const blocked = typeof row.blocked_id === 'string' ? row.blocked_id : null;
    if (blocker === me && blocked) blockedSet.add(blocked);
    if (blocked === me && blocker) blockedSet.add(blocker);
  }

  const mutualMap = new Map<string, number>();
  if (friendSet.size > 0) {
    const friendIds = Array.from(friendSet);
    const { data: fofRows, error: fofError } = await supabaseAdmin
      .from('friends')
      .select('user_id, friend_id')
      .in('user_id', friendIds);
    if (fofError) {
      console.error('[recs] friends-of-friends lookup failed', fofError);
    } else {
      for (const row of fofRows ?? []) {
        const candidate = typeof row.friend_id === 'string' ? row.friend_id : null;
        if (!candidate || candidate === me || friendSet.has(candidate) || blockedSet.has(candidate)) continue;
        mutualMap.set(candidate, (mutualMap.get(candidate) ?? 0) + 1);
      }
    }
  }

  const candidates = new Set<string>(mutualMap.keys());
  if (candidates.size < clampedLimit + offset) {
    const { data: fallbackProfiles, error: fallbackError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .order('joined_at', { ascending: false })
      .limit(POPULARITY_FALLBACK_POOL);

    if (fallbackError) {
      console.error('[recs] fallback profile pool lookup failed', fallbackError);
    } else {
      for (const row of fallbackProfiles ?? []) {
        const candidate = typeof row.id === 'string' ? row.id : null;
        if (!candidate || candidate === me || friendSet.has(candidate) || blockedSet.has(candidate)) continue;
        candidates.add(candidate);
      }
    }
  }

  const ids = Array.from(candidates);

  if (!ids.length) {
    return [];
  }

  const { data: popularityRows, error: popularityError } = await supabaseAdmin
    .from('friends')
    .select('user_id')
    .in('user_id', ids);

  if (popularityError) {
    console.error('[recs] popularity lookup failed', popularityError);
  }

  const popularityMap = new Map<string, number>();
  for (const row of popularityRows ?? []) {
    const uid = typeof row.user_id === 'string' ? row.user_id : null;
    if (!uid) continue;
    popularityMap.set(uid, (popularityMap.get(uid) ?? 0) + 1);
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

  const ranked = ids
    .map((userId) => {
      const profile = profileMap.get(userId);
      if (!profile) return null;
      if (isHiddenRecommendationProfile(profile)) return null;
      const mutuals = mutualMap.get(userId) ?? 0;
      const popularity = popularityMap.get(userId) ?? 0;
      const score = mutuals * 3 + Math.min(popularity, 50) * 0.05;
      return {
        user_id: userId,
        mutuals,
        shared_following: 0,
        popularity,
        score,
        profile
      } satisfies FollowRecommendation;
    })
    .filter((entry): entry is FollowRecommendation => Boolean(entry))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.user_id.localeCompare(b.user_id);
    });

  return ranked.slice(offset, offset + clampedLimit);
}
