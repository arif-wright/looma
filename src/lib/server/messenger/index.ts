import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MESSENGER_CACHE_HEADERS = { 'cache-control': 'no-store' } as const;

export const isUuid = (value: string | null | undefined): value is string =>
  Boolean(value && UUID_REGEX.test(value));

export const normalizeHandle = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^@+/, '').toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 32) return null;
  return normalized;
};

export const sanitizeBody = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const next = value.trim();
  if (next.length < 1) return null;
  if (next.length > 4000) return null;
  return next;
};

export const buildMessagePreview = (body: string, maxLength = 140): string => {
  const collapsed = body.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) {
    return collapsed;
  }
  return `${collapsed.slice(0, maxLength - 1)}…`;
};

export const isConversationMember = async (
  supabase: SupabaseClient,
  conversationId: string,
  userId: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data?.conversation_id);
};

export const hasUserBlock = async (
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<boolean> => {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`)
    .limit(1);

  if (error) {
    console.error('[messenger] block check failed', error);
    return false;
  }

  return Array.isArray(data) && data.length > 0;
};

export const getConversationType = async (
  supabase: SupabaseClient,
  conversationId: string
): Promise<'dm' | 'group' | null> => {
  const { data, error } = await supabase
    .from('conversations')
    .select('type')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const type = data?.type;
  if (type === 'dm' || type === 'group') {
    return type;
  }
  return null;
};

export const getConversationMembers = async (
  supabase: SupabaseClient,
  conversationId: string
): Promise<string[]> => {
  const { data, error } = await supabase.rpc('rpc_get_conversation_members', {
    p_conversation_id: conversationId
  });

  if (error || !Array.isArray(data)) {
    return [];
  }

  return data
    .map((row) => (typeof row?.user_id === 'string' ? row.user_id : null))
    .filter((id): id is string => Boolean(id));
};
