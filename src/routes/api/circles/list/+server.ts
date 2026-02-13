import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CIRCLES_CACHE_HEADERS } from '$lib/server/circles';

type MembershipRow = { circle_id: string; role: 'owner' | 'admin' | 'member'; joined_at: string };
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

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: CIRCLES_CACHE_HEADERS });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('circle_members')
    .select('circle_id, role, joined_at')
    .eq('user_id', session.user.id)
    .order('joined_at', { ascending: false });

  if (membershipError) {
    return json({ error: membershipError.message }, { status: 400, headers: CIRCLES_CACHE_HEADERS });
  }

  const membershipRows = (memberships ?? []) as MembershipRow[];
  if (!membershipRows.length) {
    return json({ items: [] }, { headers: CIRCLES_CACHE_HEADERS });
  }

  const circleIds = membershipRows.map((row) => row.circle_id);
  const membershipMap = new Map(membershipRows.map((row) => [row.circle_id, row]));

  const [circlesResult, countsResult] = await Promise.all([
    supabase
      .from('circles')
      .select('id, owner_id, name, description, privacy, invite_code, created_at, updated_at, conversation_id')
      .in('id', circleIds),
    supabase
      .from('circle_members')
      .select('circle_id')
      .in('circle_id', circleIds)
  ]);

  if (circlesResult.error || countsResult.error) {
    return json(
      { error: circlesResult.error?.message ?? countsResult.error?.message ?? 'bad_request' },
      { status: 400, headers: CIRCLES_CACHE_HEADERS }
    );
  }

  const countMap = new Map<string, number>();
  for (const row of (countsResult.data ?? []) as Array<{ circle_id?: string }>) {
    if (!row.circle_id) continue;
    countMap.set(row.circle_id, (countMap.get(row.circle_id) ?? 0) + 1);
  }

  const items = ((circlesResult.data ?? []) as CircleRow[])
    .map((circle) => {
      const membership = membershipMap.get(circle.id);
      const role = membership?.role ?? 'member';
      return {
        circleId: circle.id,
        ownerId: circle.owner_id,
        name: circle.name,
        description: circle.description,
        privacy: circle.privacy,
        createdAt: circle.created_at,
        updatedAt: circle.updated_at,
        conversationId: circle.conversation_id,
        role,
        memberCount: countMap.get(circle.id) ?? 0,
        inviteCode: role === 'owner' || role === 'admin' ? circle.invite_code : null
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  return json({ items }, { headers: CIRCLES_CACHE_HEADERS });
};
