import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

const service = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

export type FollowPrivacyStatus = {
  isFollowing: boolean;
  requested: boolean;
};

export async function getFollowPrivacyStatus(
  viewerId: string | null,
  ownerId: string
): Promise<FollowPrivacyStatus> {
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
