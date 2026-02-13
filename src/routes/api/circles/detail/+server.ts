import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS, isUuid } from '$lib/server/circles';

type CircleRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  privacy: 'public' | 'invite';
  invite_code: string;
  created_at: string;
  updated_at: string;
  conversation_id: string | null;
};

type MemberRow = {
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
};

type AnnouncementRow = {
  id: string;
  circle_id: string;
  author_id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  const circleId = event.url.searchParams.get('circleId');
  if (!isUuid(circleId)) {
    return json({ error: 'bad_request' }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const { data: myMembership } = await supabase
    .from('circle_members')
    .select('role')
    .eq('circle_id', circleId)
    .eq('user_id', session.user.id)
    .maybeSingle<{ role: 'owner' | 'admin' | 'member' }>();

  if (!myMembership) {
    return json({ error: 'forbidden' }, { status: 403, headers: CIRCLES_CACHE_HEADERS });
  }

  const [circleResult, membersResult, pinnedResult] = await Promise.all([
    supabase
      .from('circles')
      .select('id, owner_id, name, description, privacy, invite_code, created_at, updated_at, conversation_id')
      .eq('id', circleId)
      .maybeSingle<CircleRow>(),
    supabase
      .from('circle_members')
      .select('user_id, role, joined_at')
      .eq('circle_id', circleId)
      .order('joined_at', { ascending: true }),
    supabase
      .from('circle_announcements')
      .select('id, circle_id, author_id, title, body, pinned, created_at')
      .eq('circle_id', circleId)
      .eq('pinned', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<AnnouncementRow>()
  ]);

  if (circleResult.error || membersResult.error || pinnedResult.error) {
    return json(
      { error: circleResult.error?.message ?? membersResult.error?.message ?? pinnedResult.error?.message ?? 'bad_request' },
      { status: 400, headers: CIRCLES_CACHE_HEADERS }
    );
  }

  const circle = circleResult.data;
  if (!circle) {
    return json({ error: 'not_found' }, { status: 404, headers: CIRCLES_CACHE_HEADERS });
  }

  const memberRows = (membersResult.data ?? []) as MemberRow[];
  const memberIds = memberRows.map((row) => row.user_id);
  const { data: profiles } = memberIds.length
    ? await supabase
        .from('profiles')
        .select('id, handle, display_name, avatar_url')
        .in('id', memberIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((row) => [row.id as string, row as { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }])
  );

  const members = memberRows.map((row) => ({
    userId: row.user_id,
    role: row.role,
    joinedAt: row.joined_at,
    profile: profileMap.get(row.user_id) ?? {
      id: row.user_id,
      handle: null,
      display_name: null,
      avatar_url: null
    }
  }));

  return json(
    {
      circle: {
        circleId: circle.id,
        ownerId: circle.owner_id,
        name: circle.name,
        description: circle.description,
        privacy: circle.privacy,
        createdAt: circle.created_at,
        updatedAt: circle.updated_at,
        conversationId: circle.conversation_id,
        inviteCode: myMembership.role === 'owner' || myMembership.role === 'admin' ? circle.invite_code : null,
        myRole: myMembership.role
      },
      members,
      pinnedAnnouncement: pinnedResult.data
        ? {
            id: pinnedResult.data.id,
            authorId: pinnedResult.data.author_id,
            title: pinnedResult.data.title,
            body: pinnedResult.data.body,
            pinned: pinnedResult.data.pinned,
            createdAt: pinnedResult.data.created_at
          }
        : null
    },
    { headers: CIRCLES_CACHE_HEADERS }
  );
};
