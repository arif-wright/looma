import type { SupabaseClient } from '@supabase/supabase-js';

export type ReactionKind = 'like' | 'cheer' | 'spark';

const REACTION_KINDS: ReactionKind[] = ['like', 'cheer', 'spark'];

const isUuid = (value: string) =>
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
    value
  );

export function validateReactionKind(kind: unknown): kind is ReactionKind {
  return typeof kind === 'string' && (REACTION_KINDS as string[]).includes(kind);
}

export function sanitizeQuote(input: unknown): { value: string | null; error?: string } {
  if (input == null) return { value: null };
  if (typeof input !== 'string') {
    return { value: null, error: 'Quote must be a string' };
  }
  const withoutTags = input.replace(/<[^>]*>/g, '');
  const normalized = withoutTags.trim();
  if (normalized.length > 280) {
    return { value: null, error: 'Quote must be 280 characters or fewer' };
  }
  return { value: normalized || null };
}

type CountTriple = { like: number; cheer: number; spark: number };

export async function getPostReactionCounts(
  supabase: SupabaseClient,
  postId: string
): Promise<CountTriple> {
  const { data, error } = await supabase
    .from('post_engagement_view')
    .select('reactions_like, reactions_cheer, reactions_spark')
    .eq('post_id', postId)
    .maybeSingle();

  if (error) throw error;

  return {
    like: Number(data?.reactions_like ?? 0),
    cheer: Number(data?.reactions_cheer ?? 0),
    spark: Number(data?.reactions_spark ?? 0)
  };
}

export async function getCommentReactionCounts(
  supabase: SupabaseClient,
  commentId: string
): Promise<CountTriple> {
  const { data, error } = await supabase
    .from('comment_reactions')
    .select('kind')
    .eq('comment_id', commentId);

  if (error) throw error;

  const counts: CountTriple = { like: 0, cheer: 0, spark: 0 };
  for (const row of data ?? []) {
    const kind = row?.kind as ReactionKind | null;
    if (validateReactionKind(kind)) {
      counts[kind] += 1;
    }
  }
  return counts;
}

export async function togglePostReaction(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  kind: ReactionKind
): Promise<{ toggledOn: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from('post_reactions')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: deleteError } = await supabase
      .from('post_reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId)
      .eq('kind', kind);

    if (deleteError) throw deleteError;
    return { toggledOn: false };
  }

  const { error: insertError } = await supabase
    .from('post_reactions')
    .insert({ post_id: postId, user_id: userId, kind });

  if (insertError) throw insertError;

  const xpPostGrant = await supabase.rpc('fn_award_reaction_xp', {
    target_type: 'post',
    target_id: postId,
    actor_id: userId
  });
  if (xpPostGrant.error) {
    console.error('[engagement] post reaction xp grant failed', xpPostGrant.error, { postId, userId });
  }

  return { toggledOn: true };
}

export async function toggleCommentReaction(
  supabase: SupabaseClient,
  userId: string,
  commentId: string,
  kind: ReactionKind
): Promise<{ toggledOn: boolean }> {
  const { data: existing, error: selectError } = await supabase
    .from('comment_reactions')
    .select('comment_id')
    .eq('comment_id', commentId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing) {
    const { error: deleteError } = await supabase
      .from('comment_reactions')
      .delete()
      .eq('comment_id', commentId)
      .eq('user_id', userId)
      .eq('kind', kind);

    if (deleteError) throw deleteError;
    return { toggledOn: false };
  }

  const { error: insertError } = await supabase
    .from('comment_reactions')
    .insert({ comment_id: commentId, user_id: userId, kind });

  if (insertError) throw insertError;

  const xpCommentGrant = await supabase.rpc('fn_award_reaction_xp', {
    target_type: 'comment',
    target_id: commentId,
    actor_id: userId
  });
  if (xpCommentGrant.error) {
    console.error('[engagement] comment reaction xp grant failed', xpCommentGrant.error, {
      commentId,
      userId
    });
  }

  return { toggledOn: true };
}

export async function createShare(
  supabase: SupabaseClient,
  userId: string,
  postId: string,
  quote: string | null
): Promise<{ shareId: string }> {
  const { data, error } = await supabase
    .from('post_shares')
    .insert({ post_id: postId, sharer_id: userId, quote })
    .select('id')
    .single();

  if (error) throw error;
  return { shareId: data.id as string };
}

export function ensureUuid(value: unknown): value is string {
  return typeof value === 'string' && isUuid(value);
}
