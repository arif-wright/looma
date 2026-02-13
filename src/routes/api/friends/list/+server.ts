import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { FRIENDS_CACHE_HEADERS } from '$lib/server/friends';
import { requireModerator } from '$lib/server/moderation';

type FriendRow = {
  friend_id: string;
  created_at: string;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: FRIENDS_CACHE_HEADERS });
  }

  const { data: friendRows, error: friendError } = await supabase
    .from('friends')
    .select('friend_id, created_at')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (friendError) {
    return json({ error: friendError.message }, { status: 400, headers: FRIENDS_CACHE_HEADERS });
  }

  const rows = (friendRows ?? []) as FriendRow[];
  if (!rows.length) {
    return json({ items: [], viewerCanModerate: false }, { headers: FRIENDS_CACHE_HEADERS });
  }

  const friendIds = rows.map((row) => row.friend_id);
  const moderatorView = await requireModerator(supabase, session.user.id, session.user.email ?? null);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, handle, display_name, avatar_url')
    .in('id', friendIds);
  const { data: moderationRows } =
    moderatorView.ok
      ? await supabase
          .from('user_preferences')
          .select('user_id, moderation_status')
          .in('user_id', friendIds)
      : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((row) => [row.id as string, row as { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }])
  );
  const moderationMap = new Map(
    (moderationRows ?? []).map((row) => [
      row.user_id as string,
      row.moderation_status === 'muted' ||
      row.moderation_status === 'suspended' ||
      row.moderation_status === 'banned'
        ? row.moderation_status
        : 'active'
    ])
  );

  const items = rows.map((row) => {
    const profile = profileMap.get(row.friend_id);
    return {
      friendId: row.friend_id,
      createdAt: row.created_at,
      profile: profile
        ? {
            id: profile.id,
            handle: profile.handle,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url
          }
        : {
            id: row.friend_id,
            handle: null,
            display_name: null,
            avatar_url: null
          },
      moderationStatus: moderatorView.ok ? (moderationMap.get(row.friend_id) ?? 'active') : undefined
    };
  });

  return json({ items, viewerCanModerate: moderatorView.ok }, { headers: FRIENDS_CACHE_HEADERS });
};
