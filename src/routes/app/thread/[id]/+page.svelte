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

<section class="space-y-8">
  <header class="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-8 shadow-lg shadow-slate-950/40">
    <div class="flex flex-wrap items-start justify-between gap-6">
      <div class="space-y-3">
        <h1 class="text-2xl font-semibold text-slate-50">
          {thread.title ?? 'Thread'}
        </h1>
        <div class="flex flex-wrap items-center gap-3 text-sm text-slate-400">
          <img
            src={thread.author.avatar_url ?? '/avatar.svg'}
            alt=""
            width="36"
            height="36"
            class="h-9 w-9 rounded-full border border-slate-700 object-cover"
          />
          <div>
            <div class="font-medium text-slate-200">
              {thread.author.display_name ?? thread.author.handle ?? 'Someone'}
            </div>
            {#if thread.author.handle}
              <div>@{thread.author.handle}</div>
            {/if}
          </div>
          <span aria-hidden="true" class="text-slate-600">•</span>
          <time datetime={thread.created_at}>{new Date(thread.created_at).toLocaleString()}</time>
          <span aria-hidden="true" class="text-slate-600">•</span>
          <span>{thread.comment_count} {thread.comment_count === 1 ? 'reply' : 'replies'}</span>
        </div>
      </div>
      <div class="flex flex-col items-end gap-2 text-sm">
        <button
          type="button"
          class="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          on:click={handleCopyThreadLink}
        >
          Copy thread link
        </button>
        {#if copyStatus === 'success'}
          <span class="text-xs text-emerald-300">Link copied!</span>
        {:else if copyStatus === 'error'}
          <span class="text-xs text-rose-300">Copy failed. Try again.</span>
        {/if}
      </div>
    </div>
  </header>

  <article class="rounded-3xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-inner shadow-slate-950/30">
    <div class="prose prose-invert max-w-none text-slate-100">
      {@html formatCommentBody(thread.body ?? '')}
    </div>
  </article>

  <form
    method="post"
    action="?/reply"
    class="space-y-3 rounded-3xl border border-slate-800/60 bg-slate-900/40 p-6 shadow-inner shadow-slate-950/30"
  >
    <label class="text-sm font-semibold text-slate-200" for="reply-top-level">Add a reply</label>
    <textarea
      id="reply-top-level"
      name="body"
      rows="4"
      required
      class="w-full resize-y rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
      aria-label="Add a reply"
    ></textarea>
    <div class="flex items-center justify-between text-xs text-slate-400">
      <span>Use @ to mention someone</span>
      <button
        type="submit"
        class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
      >
        Reply
      </button>
    </div>
  </form>

  {#if pagination.hasMore && pagination.before}
    <div class="flex justify-center">
      <a
        class="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 transition hover:border-emerald-400 hover:text-emerald-300"
        href={`?before=${pagination.before}`}
      >
        Load earlier replies
      </a>
    </div>
  {/if}

  <CommentList
    postId={thread.id}
    {comments}
    {highlightedId}
    threadSlug={thread.slug}
  />
</section>
