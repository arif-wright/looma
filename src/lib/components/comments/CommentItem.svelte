<script lang="ts">
  import { onDestroy } from 'svelte';
  import { canonicalCommentPath } from '$lib/threads/permalink';
  import type { Comment } from '$lib/threads/types';
  import { copyToClipboard } from '$lib/utils/copy';
  import { formatCommentBody, relativeTime } from '$lib/social/commentHelpers';

  export let comment: Comment;
  export let postId: string;
  export let threadSlug: string | null = null;
  export let threadHandle: string | null = null;
  export let highlightedId: string | null = null;
  export let depth = 0;

  let replyOpen = false;
  let copyStatus: 'idle' | 'success' | 'error' = 'idle';
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  $: permalink = canonicalCommentPath(threadHandle, threadSlug, postId, comment.id);
  $: isHighlighted = highlightedId === comment.id;
  $: children = comment.children ?? [];

  async function handleCopy() {
    const ok = await copyToClipboard(permalink);
    copyStatus = ok ? 'success' : 'error';
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyStatus = 'idle';
    }, 2000);
  }

  function toggleReply() {
    replyOpen = !replyOpen;
  }

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });
</script>

<article
  id={`c-${comment.id}`}
  class={`group relative rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 text-sm shadow-sm transition focus-within:border-emerald-500/70 focus-within:shadow-emerald-500/20 ${
    isHighlighted ? 'highlighted' : ''
  }`}
  style={`margin-left:${depth * 20}px`}
>
  <header class="mb-2 flex items-start gap-3">
    <img
      src={comment.author.avatar_url ?? '/avatar.svg'}
      alt=""
      width="36"
      height="36"
      class="h-9 w-9 rounded-full border border-slate-700 object-cover"
      loading="lazy"
    />
    <div>
      <div class="flex flex-wrap items-center gap-2 text-[0.85rem]">
        <span class="font-semibold text-slate-100">
          {comment.author.display_name ?? comment.author.handle ?? 'Someone'}
        </span>
        {#if comment.author.handle}
          <span class="text-slate-400">@{comment.author.handle}</span>
        {/if}
        <span aria-hidden="true" class="text-slate-600">•</span>
        <time datetime={comment.created_at} class="text-slate-400">
          {relativeTime(comment.created_at)}
        </time>
      </div>
    </div>
  </header>

  <div class="pl-12 text-[0.95rem] leading-relaxed text-slate-100">
    <div class="prose prose-invert max-w-none">
      {@html formatCommentBody(comment.body ?? '')}
    </div>
  </div>

  <footer class="mt-3 flex flex-wrap items-center gap-3 pl-12 text-xs text-slate-400">
    <button type="button" class="transition hover:text-emerald-300" on:click={toggleReply}>
      {replyOpen ? 'Cancel' : 'Reply'}
    </button>
    <button type="button" class="transition hover:text-emerald-300" on:click={handleCopy}>
      Copy link
    </button>
    {#if copyStatus === 'success'}
      <span class="status success">Copied!</span>
    {:else if copyStatus === 'error'}
      <span class="status error">Copy failed</span>
    {/if}
  </footer>

  {#if replyOpen}
    <form
      method="post"
      action="?/reply"
      class="mt-3 space-y-2 rounded-lg border border-slate-700/60 bg-slate-900/70 p-3"
    >
      <input type="hidden" name="parentId" value={comment.id} />
      <label class="block text-xs uppercase tracking-wide text-slate-400" for={`reply-${comment.id}`}>
        Reply to {comment.author.display_name ?? comment.author.handle ?? 'this comment'}
      </label>
      <textarea
        id={`reply-${comment.id}`}
        name="body"
        required
        class="w-full resize-y rounded-md border border-slate-700 bg-slate-950/80 p-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
        rows="3"
        aria-label="Reply"
      ></textarea>
      <div class="flex items-center justify-end gap-2">
        <button type="submit" class="rounded-md bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400">
          Reply
        </button>
      </div>
    </form>
  {/if}

  {#if children.length > 0}
    <div class="mt-4 space-y-3">
      {#each children as child (child.id)}
        <svelte:self
          comment={child}
          {postId}
          {threadSlug}
          {threadHandle}
          {highlightedId}
          depth={depth + 1}
        />
      {/each}
    </div>
  {/if}
</article>

<style>
  .prose :global(a) {
    color: inherit;
  }

  .highlighted {
    border-color: rgba(16, 185, 129, 0.55);
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.28);
    animation: highlightPulse 1.2s ease-in-out 2;
  }

  @keyframes highlightPulse {
    0% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.2);
    }
    50% {
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0.05);
    }
    100% {
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .highlighted {
      animation: none;
    }
  }

  .status {
    font-size: 0.75rem;
  }

  .status.success {
    color: #bbf7d0;
  }

  .status.error {
    color: #fda4af;
  }
</style>
