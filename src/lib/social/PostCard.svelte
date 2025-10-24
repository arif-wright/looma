<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PostRow } from './types';

  const dispatch = createEventDispatcher<{ refresh: void }>();

  export let post: PostRow;

  let commentOpen = false;
  let commentBody = '';
  let sendingComment = false;
  let reacting = false;
  let errorMsg: string | null = null;

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

  async function react(kind: 'like') {
    if (reacting) return;
    reacting = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/posts/${post.id}/react`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to react.';
        return;
      }
      dispatch('refresh');
    } catch (err) {
      console.error('post react error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      reacting = false;
    }
  }

  async function submitComment() {
    if (sendingComment) return;
    const text = commentBody.trim();
    if (!text) {
      errorMsg = 'Comment cannot be empty.';
      return;
    }
    sendingComment = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to comment.';
        return;
      }
      commentBody = '';
      dispatch('refresh');
    } catch (err) {
      console.error('post comment error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      sendingComment = false;
    }
  }

  function toggleComment() {
    commentOpen = !commentOpen;
    if (!commentOpen) {
      commentBody = '';
      errorMsg = null;
    }
  }
</script>

<article class="post-card">
  <header class="post-header">
    <img
      class="avatar"
      src={authorAvatar}
      alt=""
      width="36"
      height="36"
      loading="lazy"
    />
    <div class="meta">
      <a class="name" href={profileHref}>
        {authorName}
      </a>
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
      class={`chip ${post.current_user_reaction === 'like' ? 'active' : ''}`}
      type="button"
      on:click={() => react('like')}
      disabled={reacting}
      aria-pressed={post.current_user_reaction === 'like'}
    >
      ❤️ <span>{post.reaction_like_count ?? 0}</span>
    </button>
    <button class="chip" type="button" on:click={toggleComment}>
      💬 <span>{post.comment_count ?? 0}</span>
    </button>
  </footer>

  {#if commentOpen}
    <div class="comment-box">
      <input
        type="text"
        placeholder="Add a comment…"
        bind:value={commentBody}
        maxlength="280"
        on:keydown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submitComment();
          }
        }}
      />
      <button
        type="button"
        class="send"
        on:click={submitComment}
        disabled={sendingComment || !commentBody.trim()}
      >
        {sendingComment ? 'Sending…' : 'Send'}
      </button>
    </div>
  {/if}
</article>

<style>
  .post-card {
    display: grid;
    gap: 10px;
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
    line-height: 1.4;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    cursor: pointer;
    font-size: 12px;
    color: inherit;
  }

  .chip.active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
  }

  .chip:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .comment-box {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 8px;
    align-items: center;
  }

  .comment-box input {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    font-size: 0.9rem;
  }

  .comment-box input::placeholder {
    opacity: 0.6;
  }

  .comment-box .send {
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.1);
    cursor: pointer;
    font-size: 0.85rem;
  }

  .comment-box .send:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.8rem;
    color: #fca5a5;
  }
</style>
