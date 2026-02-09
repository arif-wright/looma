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

export type FollowPrivacyStatus = {
  isFollowing: boolean;
  requested: boolean;
};

export async function getFollowPrivacyStatus(
  viewerId: string | null,
  ownerId: string
): Promise<FollowPrivacyStatus> {
  const service = getServiceClient();
  if (!viewerId || !ownerId) {
    return { isFollowing: false, requested: false };
  }

  const [followEdge, requestEdge] = await Promise.all([
    service
      .from('follows')
      .select('followee_id')
      .eq('follower_id', viewerId)
      .eq('followee_id', ownerId)
      .maybeSingle(),
    service
      .from('follow_requests')
      .select('target_id')
      .eq('requester_id', viewerId)
      .eq('target_id', ownerId)
      .maybeSingle()
  ]);

  return {
    isFollowing: Boolean(followEdge.data),
    requested: Boolean(requestEdge.data)
  };
}
