<script lang="ts" context="module">
  export const ssr = false;
</script>

<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentList from './CommentList.svelte';
  import ThreadDrawer from './ThreadDrawer.svelte';
  import type { CommentNode, PostRow } from './types';
  import { canonicalPostPath } from '$lib/threads/permalink';

  let supabase: ReturnType<typeof supabaseBrowser> | null = null;

  const getSupabase = () => {
    if (supabase) return supabase;
    if (typeof window === 'undefined') return null;
    supabase = supabaseBrowser();
    return supabase;
  };

  export let post: PostRow;
  export let detail = false;
  export let highlighted = false;

  const dispatch = createEventDispatcher<{ 'focus-comments': void }>();

  let liked = post.current_user_reaction === 'like';
  let likeCount = post.reaction_like_count ?? 0;
  let commentCount = post.comment_count ?? 0;
  let reacting = false;
  let errorMsg: string | null = null;

  let commentOpen = false;
  let threadOpen = false;
  let threadRoot: CommentNode | null = null;
  let threadAncestors: CommentNode[] = [];

  let likeChannel: ReturnType<typeof supabase.channel> | null = null;
  let commentChannel: ReturnType<typeof supabase.channel> | null = null;

  let lastPropLikeCount = likeCount;
  $: {
    const nextLike = post.reaction_like_count ?? likeCount;
    if (!reacting && nextLike !== lastPropLikeCount) {
      likeCount = nextLike;
      lastPropLikeCount = nextLike;
    }
  }

  let lastPropCommentCount = commentCount;
  $: {
    const nextComments = post.comment_count ?? commentCount;
    if (nextComments !== lastPropCommentCount) {
      commentCount = nextComments;
      lastPropCommentCount = nextComments;
    }
  }

  $: legacyHandle = post.handle ?? null;
  $: authorHandle = post.author_handle ?? legacyHandle ?? null;
  $: authorAvatar = post.author_avatar ?? post.avatar_url ?? '/avatar.svg';
  $: authorName =
    post.author_name ??
    (post.display_name ?? (authorHandle ? `@${authorHandle}` : 'Someone'));
  $: profileHref =
    authorHandle && authorHandle.length > 0 ? `/app/u/${authorHandle}` : `/u/${authorHandle ?? post.user_id}`;
  $: threadSlug = (post.slug ?? null) as string | null;
  $: threadLink = canonicalPostPath(authorHandle, threadSlug, post.id);

  function relativeTime(value: string) {
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return value;
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString();
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
    } catch (err) {
      console.error('post like toggle error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
      liked = previousLiked;
      likeCount = previousCount;
    } finally {
      reacting = false;
    }
  }

  async function refreshLikeCount() {
    const client = getSupabase();
    if (!client) return;
    const { data, error } = await client.rpc('get_post_reaction_counts', {
      p_post_id: post.id
    });
    if (!error && Array.isArray(data) && data.length > 0) {
      const next = data[0]?.likes;
      if (typeof next === 'number') {
        likeCount = next;
        lastPropLikeCount = next;
      }
    }
  }

  async function refreshCommentCount() {
    const client = getSupabase();
    if (!client) return;
    const { count, error } = await client
      .from('comments')
      .select('id', { head: true, count: 'exact' })
      .eq('post_id', post.id);
    if (!error && typeof count === 'number') {
      commentCount = count;
      lastPropCommentCount = count;
    }
  }

  async function toggleComments() {
    if (detail) {
      dispatch('focus-comments');
      return;
    }
    commentOpen = !commentOpen;
  }

  function handleCommentCount(event: CustomEvent<number>) {
    commentCount = event.detail;
  }

  function handleOpenThread(event: CustomEvent<{ root: CommentNode; ancestors: CommentNode[] }>) {
    threadRoot = event.detail.root;
    threadAncestors = event.detail.ancestors;
    threadOpen = true;
  }

  function handleCloseThread() {
    threadOpen = false;
    threadRoot = null;
    threadAncestors = [];
  }

  async function handleRealtimeLike(payload: any) {
    const subject = payload.new ?? payload.old;
    if (!subject || subject.target_kind !== 'post' || subject.target_id !== post.id) return;
    await refreshLikeCount();
  }

  async function handleRealtimeComment(payload: any) {
    const subject = payload.new ?? payload.old;
    if (!subject || subject.post_id !== post.id) return;
    await refreshCommentCount();
  }

  onMount(() => {
    const client = getSupabase();
    if (!client) return;

    likeChannel = client
      .channel(`post-${post.id}-likes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reactions',
          filter: `target_kind=eq.post,target_id=eq.${post.id},kind=eq.like`
        },
        (payload) => {
          void handleRealtimeLike(payload);
        }
      )
      .subscribe();

    commentChannel = client
      .channel(`post-${post.id}-comments`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'comments',
          filter: `post_id=eq.${post.id}`
        },
        (payload) => {
          void handleRealtimeComment(payload);
        }
      )
      .subscribe();

    void refreshLikeCount();
    void refreshCommentCount();
  });

  onDestroy(() => {
    if (likeChannel && supabase) supabase.removeChannel(likeChannel);
    if (commentChannel && supabase) supabase.removeChannel(commentChannel);
  });
</script>

<article class={`post-card ${highlighted ? 'highlighted' : ''}`}>
  <header class="post-header">
    <img class="avatar" src={authorAvatar} alt="" width="40" height="40" loading="lazy" />
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
      aria-pressed={liked}
      disabled={reacting}
    >
      Like <span class="count">{likeCount}</span>
    </button>
    <button class="chip" type="button" on:click={toggleComments}>
      Comment <span class="count">{commentCount}</span>
    </button>
    <a class="chip muted" href={threadLink}>Open thread</a>
  </footer>

  {#if !detail && commentOpen}
    <section class="comments">
      <CommentList
        postId={post.id}
        initialCount={commentCount}
        threadHandle={authorHandle}
        threadSlug={threadSlug}
        on:count={handleCommentCount}
        on:openThread={handleOpenThread}
      />
    </section>
  {/if}
  <ThreadDrawer
    postId={post.id}
    threadSlug={threadSlug}
    threadHandle={authorHandle}
    open={threadOpen}
    root={threadRoot}
    ancestors={threadAncestors}
    on:close={handleCloseThread}
  />
</article>

<style>
  .post-card {
    display: grid;
    gap: 16px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(17, 20, 27, 0.85);
  }

  .post-card.highlighted {
    border-color: rgba(16, 185, 129, 0.55);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.22);
    animation: postHighlight 1.2s ease-in-out 2;
  }

  @keyframes postHighlight {
    0% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.15);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.04);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .post-card.highlighted {
      animation: none;
    }
  }

  .post-header {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .avatar {
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
  }

  .meta {
    display: grid;
    gap: 3px;
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
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    opacity: 0.7;
  }

  .body p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font-size: 0.82rem;
    cursor: pointer;
  }

  .chip .count {
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
  }

  .chip.active {
    background: rgba(255, 255, 255, 0.15);
  }

  .chip.muted {
    opacity: 0.7;
    cursor: default;
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.82rem;
    color: #fca5a5;
  }

  .comments {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    padding-top: 12px;
    display: grid;
    gap: 12px;
  }

</style>
