<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PostComment } from './types';

  type CommentResponse = {
    comment: PostComment;
    counts: { comments: number; likes: number };
  };

  export let postId: string;
  export let parentId: string | null = null;
  export let placeholder: string | undefined = undefined;

  const dispatch = createEventDispatcher<{ posted: CommentResponse }>();

  let body = '';
  let sending = false;
  let errorMsg: string | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;

  $: computedPlaceholder = placeholder ?? (parentId ? 'Write a reply…' : 'Add your thoughts…');

  export function focus() {
    textareaEl?.focus();
  }

  function reset() {
    body = '';
  }

  async function submit() {
    if (sending) return;
    const text = body.trim();
    if (!text) {
      errorMsg = 'Write a comment before posting.';
      return;
    }
    sending = true;
    errorMsg = null;
    try {
      const res = await fetch(`/api/posts/${postId}/comment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text, parent_id: parentId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to publish comment.';
        return;
      }
      const payload = (await res.json()) as CommentResponse;
      reset();
      dispatch('posted', payload);
      textareaEl?.focus();
    } catch (err) {
      console.error('comment composer error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      sending = false;
    }
  }

  function onKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }
</script>

<section class="comment-composer">
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  <textarea
    bind:this={textareaEl}
    bind:value={body}
    rows={2}
    maxlength={280}
    placeholder={computedPlaceholder}
    on:keydown={onKey}
    aria-label="Write a comment"
  ></textarea>
  <div class="actions">
    <button type="button" class="post-btn" on:click={submit} disabled={sending || !body.trim()}>
      {sending ? 'Posting…' : 'Post'}
    </button>
  </div>
</section>

<style>
  .comment-composer {
    display: grid;
    gap: 6px;
  }

  textarea {
    resize: vertical;
    min-height: 52px;
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font: inherit;
  }

  textarea::placeholder {
    opacity: 0.75;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .post-btn {
    padding: 5px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 0.8rem;
  }

  .post-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.78rem;
    color: #fca5a5;
  }
</style>
