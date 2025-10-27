<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import CommentList from '$lib/components/comments/CommentList.svelte';
  import type { Comment, Thread } from '$lib/threads/types';
  import { copyToClipboard } from '$lib/utils/copy';
import { threadPermalinkById, threadPermalinkBySlug } from '$lib/threads/permalink';
  import { formatCommentBody } from '$lib/social/commentHelpers';

  export let data: {
    thread: Thread;
    comments: Comment[];
    pagination: { hasMore: boolean; before: string | null };
  };

  const thread = data.thread;
  const comments = data.comments;
  const pagination = data.pagination;

  const threadLink = thread.slug
    ? threadPermalinkBySlug(thread.slug)
    : threadPermalinkById(thread.id);

  let highlightedId: string | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let copyStatus: 'idle' | 'success' | 'error' = 'idle';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  function applyHash(hash: string | null) {
    if (!hash || !hash.startsWith('#c-')) {
      highlightedId = null;
      return;
    }
    const commentId = hash.replace('#c-', '');
    highlightedId = commentId;
    const el = document.getElementById(`c-${commentId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (highlightTimer) clearTimeout(highlightTimer);
    highlightTimer = setTimeout(() => {
      highlightedId = null;
    }, 2200);
  }

  onMount(() => {
    applyHash(window.location.hash);
    const handler = () => applyHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => {
      window.removeEventListener('hashchange', handler);
    };
  });

  onDestroy(() => {
    if (highlightTimer) clearTimeout(highlightTimer);
    if (copyTimer) clearTimeout(copyTimer);
  });

  async function handleCopyThreadLink() {
    const ok = await copyToClipboard(threadLink);
    copyStatus = ok ? 'success' : 'error';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus = 'idle';
    }, 2000);
  }
</script>

<section class="thread-page">
  <div class="thread-shell">
    <header class="thread-header">
      <div class="thread-title">
        <h1>{thread.title ?? 'Thread'}</h1>
        <div class="author">
          <img
            src={thread.author.avatar_url ?? '/avatar.svg'}
            alt=""
            width="36"
            height="36"
            loading="lazy"
          />
          <div>
            <span class="name">{thread.author.display_name ?? thread.author.handle ?? 'Someone'}</span>
            {#if thread.author.handle}
              <span class="handle">@{thread.author.handle}</span>
            {/if}
          </div>
          <span aria-hidden="true">•</span>
          <time datetime={thread.created_at}>{new Date(thread.created_at).toLocaleString()}</time>
          <span aria-hidden="true">•</span>
          <span>{thread.comment_count} {thread.comment_count === 1 ? 'reply' : 'replies'}</span>
        </div>
      </div>
      <div class="header-actions">
        <button type="button" on:click={handleCopyThreadLink}>
          Copy thread link
        </button>
        {#if copyStatus === 'success'}
          <span class="status success">Link copied!</span>
        {:else if copyStatus === 'error'}
          <span class="status error">Copy failed</span>
        {/if}
      </div>
    </header>

    <section class="context">
      <article class="root-card">
        <header>
          <div class="avatar">
            <img src={thread.author.avatar_url ?? '/avatar.svg'} alt="" width="40" height="40" loading="lazy" />
          </div>
          <div>
            <div class="name">{thread.author.display_name ?? thread.author.handle ?? 'Someone'}</div>
            {#if thread.author.handle}
              <div class="handle">@{thread.author.handle}</div>
            {/if}
            <time datetime={thread.created_at}>{new Date(thread.created_at).toLocaleString()}</time>
          </div>
        </header>
        <div class="body">
          {@html formatCommentBody(thread.body ?? '')}
        </div>
      </article>
    </section>

    <form method="post" action="?/reply" class="reply-box">
      <label for="reply-top-level">Add a reply</label>
      <textarea
        id="reply-top-level"
        name="body"
        rows="4"
        required
        aria-label="Add a reply"
      ></textarea>
      <div class="hint">
        <span>Use @ to mention someone</span>
        <button type="submit">Reply</button>
      </div>
    </form>

    {#if pagination.hasMore && pagination.before}
      <div class="load-more">
        <a href={`?before=${pagination.before}`}>Load earlier replies</a>
      </div>
    {/if}

    <CommentList
      postId={thread.id}
      {comments}
      {highlightedId}
      threadSlug={thread.slug}
    />
  </div>
</section>

<style>
  .thread-page {
    display: flex;
    justify-content: center;
    padding: 32px 16px 120px;
  }

  .thread-shell {
    width: min(960px, 100%);
    display: grid;
    gap: 28px;
  }

  .thread-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    padding: 24px;
    border-radius: 24px;
    border: 1px solid rgba(71, 85, 105, 0.4);
    background: rgba(12, 18, 27, 0.8);
    box-shadow: 0 20px 45px rgba(4, 9, 16, 0.4);
  }

  .thread-title {
    display: grid;
    gap: 12px;
  }

  .thread-title h1 {
    font-size: 1.6rem;
    font-weight: 600;
    color: rgb(226, 232, 240);
  }

  .thread-title .author {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .thread-title img {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid rgba(71, 85, 105, 0.45);
    object-fit: cover;
  }

  .thread-title .name {
    color: rgb(226, 232, 240);
    font-weight: 600;
  }

  .thread-title .handle {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .header-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
    font-size: 0.78rem;
  }

  .header-actions button {
    padding: 8px 14px;
    border-radius: 12px;
    border: 1px solid rgba(110, 231, 183, 0.4);
    background: rgba(16, 185, 129, 0.08);
    color: rgb(110, 231, 183);
    font-weight: 600;
    transition: background 0.2s ease;
  }

  .header-actions button:hover,
  .header-actions button:focus-visible {
    background: rgba(16, 185, 129, 0.16);
  }

  .header-actions .status {
    font-size: 0.72rem;
  }

  .header-actions .status.success {
    color: rgb(110, 231, 183);
  }

  .header-actions .status.error {
    color: rgb(248, 113, 113);
  }

  .context {
    display: block;
  }

  .root-card {
    display: grid;
    gap: 16px;
    border-radius: 22px;
    border: 1px solid rgba(71, 85, 105, 0.35);
    background: rgba(11, 16, 25, 0.9);
    padding: 24px;
  }

  .root-card header {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .root-card .avatar img {
    width: 42px;
    height: 42px;
    border-radius: 999px;
    border: 1px solid rgba(71, 85, 105, 0.45);
    object-fit: cover;
  }

  .root-card .name {
    font-weight: 600;
    color: rgb(226, 232, 240);
  }

  .root-card .handle {
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.75);
  }

  .root-card time {
    display: block;
    font-size: 0.74rem;
    color: rgba(148, 163, 184, 0.6);
  }

  .root-card .body {
    font-size: 0.95rem;
    line-height: 1.55;
    color: rgb(226, 232, 240);
  }

  .reply-box {
    display: grid;
    gap: 12px;
    border-radius: 20px;
    border: 1px solid rgba(71, 85, 105, 0.35);
    background: rgba(10, 13, 22, 0.95);
    padding: 20px;
  }

  .reply-box label {
    font-size: 0.9rem;
    font-weight: 600;
    color: rgb(226, 232, 240);
  }

  .reply-box textarea {
    width: 100%;
    border-radius: 14px;
    border: 1px solid rgba(71, 85, 105, 0.6);
    background: rgba(5, 9, 16, 0.9);
    color: rgb(226, 232, 240);
    padding: 12px;
    font-size: 0.92rem;
    resize: vertical;
  }

  .reply-box textarea:focus-visible {
    outline: 2px solid rgba(16, 185, 129, 0.45);
    outline-offset: 2px;
  }

  .reply-box .hint {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.7);
  }

  .reply-box button {
    padding: 8px 16px;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.85), rgba(52, 211, 153, 0.9));
    color: rgb(4, 9, 16);
    font-weight: 600;
  }

  .reply-box button:hover,
  .reply-box button:focus-visible {
    background: linear-gradient(135deg, rgba(16, 185, 129, 1), rgba(52, 211, 153, 1));
  }

  .load-more {
    display: flex;
    justify-content: center;
  }

  .load-more a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-radius: 12px;
    border: 1px solid rgba(71, 85, 105, 0.5);
    padding: 8px 14px;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .load-more a:hover,
  .load-more a:focus-visible {
    color: rgb(110, 231, 183);
    border-color: rgba(110, 231, 183, 0.6);
  }

  @media (max-width: 720px) {
    .thread-header,
    .root-card,
    .reply-box {
      border-radius: 18px;
      padding: 18px;
    }

    .thread-title h1 {
      font-size: 1.3rem;
    }

    .thread-title .author {
      gap: 8px;
      font-size: 0.78rem;
    }
  }
</style>
