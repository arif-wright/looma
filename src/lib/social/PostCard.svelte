<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import CommentList from './CommentList.svelte';
  import ThreadDrawer from './ThreadDrawer.svelte';
  import type { CommentNode, PostRow } from './types';
import { canonicalPostPath } from '$lib/threads/permalink';
import { browser } from '$app/environment';
import RunShareCard from '$lib/components/social/RunShareCard.svelte';
import AchievementShareCard from '$lib/components/social/AchievementShareCard.svelte';
import type { RunShareMeta, AchievementShareMeta } from '$lib/social/types';
import ReportModal from '$lib/components/modals/ReportModal.svelte';

  let supabase: ReturnType<typeof supabaseBrowser> | null = null;

  const getSupabase = () => {
    if (!browser) return null;
    if (supabase) return supabase;
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
  let imageUrl: string | null = null;
  let imageAlt = 'Post media';
  let audioCtx: AudioContext | null = null;
  let showCreatureReact = false;
  let hideReactionTimer: ReturnType<typeof setTimeout> | null = null;

  let likeChannel: any = null;
  let commentChannel: any = null;
  let menuOpen = false;
  let reportOpen = false;

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
  $: shareKind = typeof post?.kind === 'string' ? post.kind.toLowerCase() : '';
  $: isRunShare = shareKind === 'run';
  $: isAchievementShare = shareKind === 'achievement';
  $: postText =
    typeof post?.text === 'string' && post.text.trim().length > 0
      ? post.text
      : typeof post?.body === 'string'
      ? post.body
      : '';
  $: hasCaption = postText.trim().length > 0;
  $: runShareMeta = (post.meta ?? null) as RunShareMeta;
  $: achievementShareMeta = (post.meta ?? null) as AchievementShareMeta;

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

  const getMetaString = (key: string) => {
    const data = post?.meta;
    if (!data || typeof data !== 'object') return null;
    const value = (data as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  };

  $: imageUrl =
    typeof post?.image_url === 'string' && post.image_url.trim().length > 0
      ? post.image_url
      : getMetaString('image_url');
  $: imageAlt = getMetaString('image_alt') ?? 'Post media';

  const triggerFeedback = (nextLiked: boolean) => {
    if (!browser) return;
    if ('vibrate' in navigator) {
      navigator.vibrate(nextLiked ? 28 : 12);
    }
    try {
      if (!audioCtx) {
        audioCtx = new AudioContext();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = nextLiked ? 540 : 320;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.22);
    } catch (err) {
      console.debug('reaction feedback error', err);
    }
    if (nextLiked) {
      if (hideReactionTimer) clearTimeout(hideReactionTimer);
      showCreatureReact = false;
      showCreatureReact = true;
      hideReactionTimer = setTimeout(() => {
        showCreatureReact = false;
      }, 820);
    }
  };

  async function toggleLike() {
    if (reacting) return;
    reacting = true;
    errorMsg = null;
    const previousLiked = liked;
    const previousCount = likeCount;
    liked = !liked;
    triggerFeedback(liked);
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
    const { data, error } = (await (client as any).rpc('get_post_reaction_counts', {
      p_post_id: post.id
    })) as { data: Array<{ likes?: number }> | null; error: any };
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

  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  function handleReport() {
    reportOpen = true;
    menuOpen = false;
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
    if (hideReactionTimer) clearTimeout(hideReactionTimer);
  });
</script>

<article class={`post-card ${highlighted ? 'highlighted' : ''}`}>
  <header class="post-header">
    <div class="identity">
      <img class="avatar" src={authorAvatar} alt="" width="40" height="40" loading="lazy" />
      <div class="meta">
        <a class="name" href={profileHref}>{authorName}</a>
        <div class="sub">
          <span class="handle">@{authorHandle ?? 'user'}</span>
          <span aria-hidden="true">•</span>
          <span>{relativeTime(post.created_at)}</span>
        </div>
      </div>
    </div>
    <div class="post-menu">
      <button class="menu-btn" type="button" aria-haspopup="true" aria-expanded={menuOpen} on:click={toggleMenu}>
        ⋯
      </button>
      {#if menuOpen}
        <div class="menu-panel" role="menu">
          <button type="button" class="menu-item" on:click={handleReport}>Report post…</button>
        </div>
      {/if}
    </div>
  </header>

  <div class="body">
    {#if hasCaption}
      <p>{postText}</p>
    {/if}

    {#if isRunShare}
      <div class="share-card">
        <RunShareCard meta={runShareMeta} />
      </div>
    {:else if isAchievementShare}
      <div class="share-card">
        <AchievementShareCard meta={achievementShareMeta} />
      </div>
    {/if}
  </div>

  {#if imageUrl}
    <figure class="media">
      <img src={imageUrl} alt={imageAlt} loading="lazy" />
    </figure>
  {/if}

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
      ❤️ React <span class="count">{likeCount}</span>
    </button>
    <button class="chip" type="button" on:click={toggleComments}>
      💬 Comment <span class="count">{commentCount}</span>
    </button>
    <a class="chip muted" href={threadLink}>🔗 Thread</a>
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
  {#if showCreatureReact}
    <div class="creature-pop" aria-hidden="true">🐾</div>
  {/if}
  <ReportModal bind:open={reportOpen} targetKind="post" targetId={post.id} />
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
    justify-content: space-between;
  }

  .identity {
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

  .post-menu {
    position: relative;
  }

  .menu-btn {
    width: 2.1rem;
    height: 2.1rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.35rem;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: transparent;
    color: rgba(255, 255, 255, 0.85);
  }

  .menu-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 0.35rem);
    background: rgba(10, 12, 20, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 0.3rem;
    min-width: 9rem;
    z-index: 30;
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 0.55rem 0.75rem;
    text-align: left;
    border-radius: 0.55rem;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.9);
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
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

  .body {
    display: grid;
    gap: 0.9rem;
  }

  .body p {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .share-card {
    display: block;
  }

  .media {
    margin: 0;
    border-radius: 16px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .media img {
    width: 100%;
    height: auto;
    display: block;
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
    background: var(--theme-accent-soft, rgba(255, 255, 255, 0.15));
    color: rgba(226, 232, 240, 0.95);
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

  .creature-pop {
    position: absolute;
    bottom: 18px;
    right: 18px;
    font-size: 1.6rem;
    opacity: 0;
    transform: scale(0.6) translateY(12px);
    animation: creaturePop 0.7s ease-out forwards;
    pointer-events: none;
  }

  @keyframes creaturePop {
    0% {
      opacity: 0;
      transform: scale(0.6) translateY(12px);
    }
    45% {
      opacity: 1;
      transform: scale(1.08) translateY(-6px);
    }
    100% {
      opacity: 0;
      transform: scale(0.9) translateY(-12px);
    }
  }

</style>
