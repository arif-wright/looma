import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { supabaseServer } from '$lib/supabaseClient';

const DEFAULT_LIMIT = 20;

export const load: PageServerLoad = async (event) => {
  const supabase = supabaseServer(event);
  const postId = event.params.id;
  const before = event.url.searchParams.get('before') ?? new Date().toISOString();
  const limitParam = event.url.searchParams.get('limit');
  const limit = limitParam ? Math.max(1, Math.min(50, Number(limitParam) || DEFAULT_LIMIT)) : DEFAULT_LIMIT;

  event.setHeaders({
    'cache-control': 'no-store'
  });

  const { data: postRows, error: postError } = await supabase.rpc('get_post_by_id', {
    p_post_id: postId
  });

  if (postError) {
    console.error('get_post_by_id error', postError);
    throw error(500, 'Failed to load post');
  }

  const rawPost = Array.isArray(postRows) ? postRows[0] : null;
  if (!rawPost) {
    throw error(404, 'Post not found');
  }

  const viewerId = event.locals.user?.id ?? null;
  let liked = false;

  if (viewerId) {
    const { data: likedResult, error: likedError } = await supabase.rpc('has_user_liked_post', {
      p_post_id: postId,
      p_user: viewerId
    });

    if (likedError) {
      console.error('has_user_liked_post error', likedError);
    } else if (typeof likedResult === 'boolean') {
      liked = likedResult;
    }
  }

  const post = {
    id: rawPost.id,
    user_id: rawPost.user_id,
    body: rawPost.body,
    meta: rawPost.meta ?? {},
    is_public: rawPost.is_public,
    created_at: rawPost.created_at,
    author_name: rawPost.author_name,
    author_handle: rawPost.author_handle,
    author_avatar: rawPost.author_avatar,
    comment_count: Number(rawPost.comment_count ?? 0),
    reaction_like_count: Number(rawPost.like_count ?? 0),
    reaction_spark_count: 0,
    reaction_support_count: 0,
    current_user_reaction: liked ? ('like' as const) : null
  };

  const { data: commentRows, error: commentError } = await supabase.rpc('get_comments_tree', {
    p_post: postId,
    p_limit: limit,
    p_before: before
  });

  if (commentError) {
    console.error('get_post_comments_tree error', commentError);
    throw error(500, 'Failed to load comments');
  }

  const comments = Array.isArray(commentRows) ? commentRows : [];
  const nextCursor =
    comments.length === limit
      ? (comments[comments.length - 1]?.created_at as string | null) ?? null
      : null;

  const authorLabel = post.author_name ?? (post.author_handle ? `@${post.author_handle}` : 'Someone');
  const description = (post.body ?? '').slice(0, 140);

  return {
    post,
    comments,
    nextCursor,
    meta: {
      title: `${authorLabel} — Post`,
      description
    }
  };
};
