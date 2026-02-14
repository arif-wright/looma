import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { FRIENDS_CACHE_HEADERS } from '$lib/server/friends';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

type RequestRow = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'canceled';
  message: string | null;
  created_at: string;
  updated_at: string;
};

const attachProfile = (
  row: RequestRow,
  userId: string,
  profiles: Map<string, { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }>
) => {
  const otherUserId = row.requester_id === userId ? row.recipient_id : row.requester_id;
  const profile = profiles.get(otherUserId);

  return {
    id: row.id,
    requesterId: row.requester_id,
    recipientId: row.recipient_id,
    status: row.status,
    note: row.message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    profile: profile ?? {
      id: otherUserId,
      handle: null,
      display_name: null,
      avatar_url: null
    }
  };
};

export const GET: RequestHandler = async (event) => {
  const { supabase, session } = await createSupabaseServerClient(event);
  if (!session) {
    return json({ error: 'unauthorized' }, { status: 401, headers: FRIENDS_CACHE_HEADERS });
  }

  let queryClient: typeof supabase = supabase;
  let [incomingResult, outgoingResult] = await Promise.all([
    queryClient
      .from('friend_requests')
      .select('id, requester_id, recipient_id, status, message, created_at, updated_at')
      .eq('recipient_id', session.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    queryClient
      .from('friend_requests')
      .select('id, requester_id, recipient_id, status, message, created_at, updated_at')
      .eq('requester_id', session.user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
  ]);

  if (incomingResult.error || outgoingResult.error) {
    const admin = tryGetSupabaseAdminClient();
    if (!admin) {
      return json(
        { error: incomingResult.error?.message ?? outgoingResult.error?.message ?? 'bad_request' },
        { status: 400, headers: FRIENDS_CACHE_HEADERS }
      );
    }

    queryClient = admin as typeof supabase;
    [incomingResult, outgoingResult] = await Promise.all([
      queryClient
        .from('friend_requests')
        .select('id, requester_id, recipient_id, status, message, created_at, updated_at')
        .eq('recipient_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      queryClient
        .from('friend_requests')
        .select('id, requester_id, recipient_id, status, message, created_at, updated_at')
        .eq('requester_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
    ]);

    if (incomingResult.error || outgoingResult.error) {
      return json(
        { error: incomingResult.error?.message ?? outgoingResult.error?.message ?? 'bad_request' },
        { status: 400, headers: FRIENDS_CACHE_HEADERS }
      );
    }
  }

  const incomingRows = (incomingResult.data ?? []) as RequestRow[];
  const outgoingRows = (outgoingResult.data ?? []) as RequestRow[];
  const recentResult = await queryClient
    .from('friend_requests')
    .select('id, requester_id, recipient_id, status, message, created_at, updated_at')
    .or(`recipient_id.eq.${session.user.id},requester_id.eq.${session.user.id}`)
    .neq('status', 'pending')
    .order('updated_at', { ascending: false })
    .limit(20);

  const recentRows = recentResult.error ? [] : ((recentResult.data ?? []) as RequestRow[]);

  const profileIds = [
    ...new Set([
      ...incomingRows.map((row) => row.requester_id),
      ...outgoingRows.map((row) => row.recipient_id),
      ...recentRows.map((row) => row.requester_id),
      ...recentRows.map((row) => row.recipient_id)
    ])
  ];

  const profileClient = tryGetSupabaseAdminClient() ?? supabase;
  const { data: profiles } = profileIds.length
    ? await profileClient.from('profiles').select('id, handle, display_name, avatar_url').in('id', profileIds)
    : { data: [] };

  const profileMap = new Map(
    (profiles ?? []).map((row) => [row.id as string, row as { id: string; handle: string | null; display_name: string | null; avatar_url: string | null }])
  );

  return json(
    {
      incoming: incomingRows.map((row) => attachProfile(row, session.user.id, profileMap)),
      outgoing: outgoingRows.map((row) => attachProfile(row, session.user.id, profileMap)),
      recent: recentRows.map((row) => attachProfile(row, session.user.id, profileMap))
    },
    { headers: FRIENDS_CACHE_HEADERS }
  );
};
