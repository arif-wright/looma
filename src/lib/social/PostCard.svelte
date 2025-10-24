<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentComposer from './CommentComposer.svelte';
  import CommentsList from './CommentsList.svelte';
  import type { PostComment, PostRow } from './types';

  export let post: PostRow;

  const supabase = supabaseBrowser();

  let commentOpen = false;
  let reacting = false;
  let errorMsg: string | null = null;
  let liked = post.current_user_reaction === 'like';
  let likeCount = post.reaction_like_count ?? 0;
  let commentCount = post.comment_count ?? 0;
  let viewerId: string | null = null;
  let likeChannel: ReturnType<typeof supabase.channel> | null = null;
  let commentChannel: ReturnType<typeof supabase.channel> | null = null;
  let commentsRef: InstanceType<typeof CommentsList> | null = null;
  let suppressOwnLikeEvent = false;
  let suppressOwnCommentEvent = false;

  $: legacyHandle = post.handle ?? null;
  $: authorHandle = post.author_handle ?? legacyHandle ?? null;
  $: authorAvatar = post.author_avatar ?? post.avatar_url ?? '/avatar.svg';
  $: authorName =
    post.author_name ??
    (post.display_name ?? (authorHandle ? `@${authorHandle}` : 'Someone'));
  $: profileHref = `/u/${authorHandle ?? post.user_id}`;

  function relativeTime(value: string) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return value;
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString();
  }

  async function ensureViewerId() {
    if (viewerId !== null) return viewerId;
    const {
      data: { user }
    } = await supabase.auth.getUser();
    viewerId = user?.id ?? null;
    return viewerId;
  }

  async function refreshLikeCount() {
    const { data, error } = await supabase.rpc('get_post_reaction_counts', {
      p_post_id: post.id
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      likeCount = data[0]?.likes ?? 0;
    }
  }

  async function refreshCommentCount() {
    const { count, error } = await supabase
      .from('comments')
      .select('id', { head: true, count: 'exact' })
      .eq('target_kind', 'post')
      .eq('target_id', post.id);
    if (!error) {
      commentCount = count ?? 0;
    }
  }

  async function toggleLike() {
    if (reacting) return;
    reacting = true;
    errorMsg = null;
    const previousLiked = liked;
    const previousCount = likeCount;
    liked = !liked;
    likeCount = Math.max(0, likeCount + (liked ? 1 : -1));
    try {
      const res = await fetch(`/api/posts/${post.id}/react`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to update like.';
        liked = previousLiked;
        likeCount = previousCount;
        return;
      }
      const payload = await res.json().catch(() => ({}));
      liked = !!payload?.liked;
      likeCount = typeof payload?.likes === 'number' ? payload.likes : previousCount;
      if (liked !== previousLiked) {
        suppressOwnLikeEvent = true;
        setTimeout(() => {
          suppressOwnLikeEvent = false;
        }, 400);
      }
    } catch (err) {
      console.error('post like toggle error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
      liked = previousLiked;
      likeCount = previousCount;
    } finally {
      reacting = false;
    }
  }

  async function toggleComments() {
    commentOpen = !commentOpen;
    if (commentOpen) {
      await tick();
      commentsRef?.refresh?.();
    }
  }

  function handleComposerPosted(event: CustomEvent<{ comment: PostComment; counts: { comments: number; likes: number } }>) {
    const detail = event.detail;
    suppressOwnCommentEvent = true;
    commentCount = detail?.counts?.comments ?? commentCount + 1;
    likeCount = detail?.counts?.likes ?? likeCount;
    commentsRef?.prepend?.(detail.comment);
    setTimeout(() => {
      suppressOwnCommentEvent = false;
    }, 400);
  }

  function handleCommentsCount(event: CustomEvent<number>) {
    if (typeof event.detail === 'number') {
      commentCount = event.detail;
    }
  }

  async function setupChannels() {
    await ensureViewerId();
    likeChannel = supabase
      .channel(`post-${post.id}-likes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
          filter: `target_kind=eq.post,target_id=eq.${post.id},kind=eq.like`
        },
        async (payload) => {
          const subject = (payload.new ?? payload.old) as { user_id?: string | null } | null;
          if (!subject) return;
          const subjectUser = subject.user_id ?? null;
          if (subjectUser === viewerId) {
            liked = payload.eventType !== 'DELETE';
            if (suppressOwnLikeEvent) return;
          }
          await refreshLikeCount();
        }
      )
      .subscribe();

    commentChannel = supabase
      .channel(`post-${post.id}-comments-count`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `target_kind=eq.post,target_id=eq.${post.id}`
        },
        async (payload) => {
          const subject = (payload.new ?? payload.old) as { user_id?: string | null } | null;
          if (!subject) return;
          const subjectUser = subject.user_id ?? null;
          if (subjectUser === viewerId && suppressOwnCommentEvent) {
            return;
          }
          await refreshCommentCount();
        }
      )
      .subscribe();
  }

  onMount(() => {
    setupChannels();
  });

  onDestroy(() => {
    if (likeChannel) supabase.removeChannel(likeChannel);
    if (commentChannel) supabase.removeChannel(commentChannel);
  });
</script>

<article class="post-card">
  <header class="post-header">
    <img class="avatar" src={authorAvatar} alt="" width="36" height="36" loading="lazy" />
    <div class="meta">
      <a class="name" href={profileHref}>{authorName}</a>
      <div class="sub">
        <span class="handle">@{authorHandle ?? 'user'}</span>
        <span aria-hidden="true">•</span>
        <span>{relativeTime(post.created_at)}</span>
      </div>
    </div>
  </header>

  <div class="body">
    <p>{post.body}</p>
  </div>

  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}

  <footer class="actions">
    <button
      class={`chip ${liked ? 'active' : ''}`}
      type="button"
      on:click={toggleLike}
      disabled={reacting}
      aria-pressed={liked}
    >
      <span aria-hidden="true">❤️</span>
      <span class="label">{liked ? 'Liked' : 'Like'}</span>
      <span class="count">{likeCount}</span>
    </button>
    <button
      class="chip"
      type="button"
      on:click={toggleComments}
      aria-expanded={commentOpen}
      aria-controls={`post-${post.id}-comments`}
    >
      <span aria-hidden="true">💬</span>
      <span class="label">Comment</span>
      <span class="count">{commentCount}</span>
    </button>
  </footer>

  {#if commentOpen}
    <div class="thread" id={`post-${post.id}-comments`}>
      <CommentComposer postId={post.id} on:posted={handleComposerPosted} />
      <CommentsList bind:this={commentsRef} postId={post.id} on:count={handleCommentsCount} />
    </div>
  {/if}
</article>

<style>
  .post-card {
    display: grid;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .post-header {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .avatar {
    width: 36px;
    height: 36px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.04);
  }

  .meta {
    display: grid;
    gap: 2px;
  }

  .name {
    font-weight: 600;
    color: inherit;
    text-decoration: none;
  }

  .name:hover,
  .name:focus-visible {
    text-decoration: underline;
  }

  .sub {
    display: flex;
    gap: 6px;
    font-size: 12px;
    opacity: 0.65;
  }

  .body p {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    font-size: 0.8rem;
    color: inherit;
  }

  .chip .label {
    font-weight: 600;
  }

  .chip .count {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .chip.active {
    background: rgba(255, 255, 255, 0.12);
  }

  .chip:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .thread {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
  }

  .error {
    margin: 0;
    font-size: 0.82rem;
    color: #fca5a5;
  }
</style>
