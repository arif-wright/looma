<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import ProfileHero from '$lib/profile/ProfileHero.svelte';
  import type { ProfileSummary } from '$lib/profile/types';
  import type { Thread, Comment } from '$lib/threads/types';
  import type { PostRow } from '$lib/social/types';
import CommentThread from '$lib/components/comments/CommentThread.svelte';
import PostCard from '$lib/social/PostCard.svelte';
import { canonicalPostPath } from '$lib/threads/permalink';
import { copyToClipboard } from '$lib/utils/copy';
import { formatCommentBody } from '$lib/social/commentHelpers';
import { sendAnalytics } from '$lib/utils/analytics';
import ReplyComposer from '$lib/components/comments/ReplyComposer.svelte';

  export let data: {
    profile: ProfileSummary;
    viewerId: string | null;
    post: Thread;
    comments: Comment[];
    pagination: { hasMore: boolean; before: string | null };
    morePosts: PostRow[];
  };

  const profile = data.profile;

  const post = data.post;
  let comments = data.comments ?? [];
  const pagination = data.pagination;
  const morePosts = data.morePosts ?? [];

  const canonicalLink = canonicalPostPath(profile.handle, post.slug, post.id);

  let highlightedId: string | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let reduceMotion = false;
  let copyStatus: 'idle' | 'success' | 'error' = 'idle';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  function scrollToHash(hash: string | null) {
    if (!hash || !hash.startsWith('#c-')) {
      highlightedId = null;
      return;
    }
    const commentId = hash.slice(3);
    highlightedId = commentId;
    const element = document.getElementById(`c-${commentId}`);
    if (element) {
      element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedId = null;
    }, 2200);
    sendAnalytics('comment_permalink_open', {
      surface: 'profile_focused_post',
      payload: { comment_id: commentId }
    });
  }

  onMount(() => {
    reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    scrollToHash(window.location.hash);
    const handler = () => scrollToHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => {
      window.removeEventListener('hashchange', handler);
    };
  });

  onDestroy(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
    if (copyTimer) clearTimeout(copyTimer);
  });

  async function copyPostLink() {
    const ok = await copyToClipboard(canonicalLink);
    copyStatus = ok ? 'success' : 'error';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus = 'idle';
    }, 2000);
  }

  async function backToPosts(event: MouseEvent) {
    event.preventDefault();
    await goto(`/app/u/${profile.handle}`, {
      replaceState: true,
      noScroll: true
    });
  }

  $: currentSearch = $page.url.search;
</script>

<main class="focused-wrap">
  <ProfileHero {profile} />

  <nav class="subnav">
    <a href={`/app/u/${profile.handle}${currentSearch}`} on:click|preventDefault={backToPosts}>
      ← Back to posts
    </a>
  </nav>

  <div class="focused-grid">
    <section class="main">
      <article class="post-card">
        <header class="post-header">
          <div class="author">
            <img
              src={post.author.avatar_url ?? '/avatar.svg'}
              alt=""
              width="40"
              height="40"
              loading="lazy"
            />
            <div>
              <span class="name">{post.author.display_name ?? post.author.handle ?? 'Someone'}</span>
              {#if post.author.handle}
                <span class="handle">@{post.author.handle}</span>
              {/if}
            </div>
          </div>
          <div class="meta">
            <time datetime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time>
            <button type="button" on:click={copyPostLink}>Copy post link</button>
            {#if copyStatus === 'success'}
              <span class="toast success">Link copied!</span>
            {:else if copyStatus === 'error'}
              <span class="toast error">Copy failed</span>
            {/if}
          </div>
        </header>
        {#if post.title}
          <h1 class="post-title">{post.title}</h1>
        {/if}
        <div class="post-body">
          {@html formatCommentBody(post.body ?? '')}
        </div>
      </article>

      <section class="reply-box" data-testid="top-reply-box">
        <h2 class="reply-heading">Join the discussion</h2>
        <ReplyComposer
          testId="reply-composer-root"
          submitLabel="Reply"
          placeholder="Share your thoughts…"
        />
      </section>

      {#if pagination.hasMore && pagination.before}
        <div class="load-more">
          <a href={`?before=${encodeURIComponent(pagination.before)}`}>Load earlier replies</a>
        </div>
      {/if}

      <CommentThread
        postId={post.id}
        comments={comments}
        highlightedId={highlightedId}
        threadSlug={post.slug}
        threadHandle={profile.handle}
      />
    </section>

    <aside class="aside">
      <h2>More from @{profile.handle}</h2>
      {#if morePosts.length === 0}
        <p class="empty">No other posts yet.</p>
      {:else}
        <ul>
          {#each morePosts as item (item.id)}
            <li>
              {#if browser}
                <PostCard post={item} />
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</main>

<style>
  .focused-wrap {
    max-width: 1080px;
    margin: 0 auto;
    padding: 24px;
    display: grid;
    gap: 24px;
  }

  .subnav {
    font-size: 0.85rem;
  }

  .subnav a {
    color: rgba(148, 163, 184, 0.9);
    text-decoration: none;
  }

  .subnav a:hover {
    color: #a5f3fc;
  }

  .focused-grid {
    display: grid;
    gap: 32px;
    grid-template-columns: minmax(0, 1fr);
  }

  @media (min-width: 960px) {
    .focused-grid {
      grid-template-columns: minmax(0, 620px) minmax(0, 1fr);
    }
  }

  .main {
    display: grid;
    gap: 20px;
  }

  .post-card {
    border: 1px solid rgba(71, 85, 105, 0.45);
    border-radius: 24px;
    padding: 24px;
    background: rgba(12, 18, 27, 0.85);
    box-shadow: 0 18px 36px rgba(4, 9, 16, 0.35);
    display: grid;
    gap: 18px;
  }

  .post-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  .author {
    display: flex;
    gap: 14px;
    align-items: center;
  }

  .author img {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    object-fit: cover;
  }

  .author .name {
    font-weight: 600;
    color: rgb(226, 232, 240);
    display: block;
  }

  .author .handle {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.8);
  }

  .meta {
    display: grid;
    justify-items: end;
    gap: 8px;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .meta button {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(94, 234, 212, 0.3);
    background: transparent;
    color: rgba(94, 234, 212, 0.9);
    cursor: pointer;
    font-size: 0.8rem;
  }

  .toast {
    font-size: 0.75rem;
  }

  .toast.success {
    color: #bbf7d0;
  }

  .toast.error {
    color: #fda4af;
  }

  .post-title {
    margin: 0;
    font-size: 1.4rem;
    font-weight: 600;
    color: rgb(226, 232, 240);
  }

  .post-body :global(p) {
    margin-bottom: 1em;
  }

  .post-body :global(a) {
    color: inherit;
    text-decoration: underline;
  }

  .reply-box {
    margin-top: 28px;
    padding: 22px;
    border-radius: 20px;
    border: 1px solid rgba(71, 85, 105, 0.45);
    background: rgba(15, 23, 42, 0.68);
    box-shadow: 0 16px 36px rgba(15, 23, 42, 0.32);
  }

  .reply-heading {
    margin-bottom: 14px;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(226, 232, 240, 0.95);
  }

  .load-more {
    text-align: center;
  }

  .load-more a {
    font-size: 0.85rem;
    color: rgba(94, 234, 212, 0.9);
    text-decoration: none;
  }

  .aside {
    display: grid;
    gap: 16px;
  }

  .aside h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  .aside ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
  }

  .empty {
    opacity: 0.7;
    font-size: 0.85rem;
  }
</style>
