import { createClient } from '@supabase/supabase-js';
import { env as publicEnv } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';

const getServiceClient = () => {
  const url = publicEnv.PUBLIC_SUPABASE_URL;
  const key = privateEnv.SUPABASE_SERVICE_ROLE_KEY ?? privateEnv.SUPABASE_SERVICE_ROLE;
  if (!url || !key) {
    throw new Error('Supabase service client is not configured');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

export type FollowCounts = {
  followers: number;
  following: number;
};

export type FollowListEntry = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

export type FollowListResult = {
  items: FollowListEntry[];
  nextFrom: number | null;
};

type ProfilePreview = {
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const PROFILE_COLUMNS = 'id, handle, display_name, avatar_url';
const clampLimit = (value: number) => Math.max(1, Math.min(50, Math.floor(value)));
const clampOffset = (value: number) => Math.max(0, Math.floor(value));

const hydrateProfiles = async (ids: string[]): Promise<Map<string, ProfilePreview>> => {
  const service = getServiceClient();
  const unique = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.length > 0)));
  const map = new Map<string, ProfilePreview>();
  if (!unique.length) {
    return map;
  }

  const { data, error } = await service.from('profiles').select(PROFILE_COLUMNS).in('id', unique);
  if (error) {
    console.error('[follows] profile hydrate failed', error);
    return map;
  }

  for (const row of (data ?? []) as ProfilePreview[]) {
    map.set(row.id, row);
  }
  return map;
};

export const getFollowCounts = async (userId: string): Promise<FollowCounts> => {
  const service = getServiceClient();
  if (!userId) {
    return { followers: 0, following: 0 };
  }

  const { data, error } = await service
    .from('follow_counts')
    .select('followers, following')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[follows] follow_count lookup failed', error);
    return { followers: 0, following: 0 };
  }

  return {
    followers: Number(data?.followers ?? 0),
    following: Number(data?.following ?? 0)
  };
};

const mapEdgesToEntries = (
  rows: { user_id: string; created_at: string }[],
  profiles: Map<string, ProfilePreview>
): FollowListEntry[] =>
  rows.map((row) => {
    const profile = profiles.get(row.user_id);
    return {
      user_id: row.user_id,
      handle: profile?.handle ?? null,
      display_name: profile?.display_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      created_at: row.created_at
    };
  });

export const listFollowers = async (userId: string, limit = 20, from = 0): Promise<FollowListResult> => {
  const service = getServiceClient();
  if (!userId) {
    return { items: [], nextFrom: null };
  }

  const clampedLimit = clampLimit(limit);
  const offset = clampOffset(from);
  const rangeEnd = offset + clampedLimit - 1;

  const { data, error } = await service
    .from('follows')
    .select('follower_id, created_at')
    .eq('followee_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, rangeEnd);

  if (error) {
    console.error('[follows] followers lookup failed', error);
    return { items: [], nextFrom: null };
  }

  const rows = (data ?? []).map((row) => ({
    user_id: row.follower_id as string,
    created_at: row.created_at as string
  }));

  const profiles = await hydrateProfiles(rows.map((row) => row.user_id));
  const items = mapEdgesToEntries(rows, profiles);
  const nextFrom = rows.length === clampedLimit ? offset + rows.length : null;

  return { items, nextFrom };
};

export const listFollowing = async (userId: string, limit = 20, from = 0): Promise<FollowListResult> => {
  const service = getServiceClient();
  if (!userId) {
    return { items: [], nextFrom: null };
  }

  const clampedLimit = clampLimit(limit);
  const offset = clampOffset(from);
  const rangeEnd = offset + clampedLimit - 1;

  const { data, error } = await service
    .from('follows')
    .select('followee_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, rangeEnd);

  if (error) {
    console.error('[follows] following lookup failed', error);
    return { items: [], nextFrom: null };
  }

  const rows = (data ?? []).map((row) => ({
    user_id: row.followee_id as string,
    created_at: row.created_at as string
  }));

  const profiles = await hydrateProfiles(rows.map((row) => row.user_id));
  const items = mapEdgesToEntries(rows, profiles);
  const nextFrom = rows.length === clampedLimit ? offset + rows.length : null;

  return { items, nextFrom };
};
