<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';

  const dispatch = createEventDispatcher<{ posted: void }>();

  let body = '';
  let posting = false;
  let errorMsg: string | null = null;

  function reset() {
    body = '';
  }

  async function submit() {
    if (posting) return;
    const text = body.trim();
    if (!text) {
      errorMsg = 'Write something before posting.';
      return;
    }
    posting = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorMsg = data?.error ?? 'Failed to publish post.';
        return;
      }
      const payload = await res.json().catch(() => ({}));
      reset();
      dispatch('posted');
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list as CompanionRitual[]);
      }
    } catch (err) {
      console.error('post composer error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      posting = false;
    }
  }

  function handleKey(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  }
</script>

<section class="composer">
  {#if errorMsg}
    <p class="error" role="alert">{errorMsg}</p>
  {/if}
  <textarea
    bind:value={body}
    rows={3}
    placeholder="Share something encouraging…"
    on:keydown={handleKey}
    aria-label="Write a post"
  ></textarea>
  <div class="actions">
    <button type="button" class="post-btn" on:click={submit} disabled={posting || !body.trim()}>
      {posting ? 'Posting…' : 'Post'}
    </button>
  </div>
</section>

<style>
  .composer {
    display: grid;
    gap: 8px;
    padding: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.03);
  }

  textarea {
    resize: vertical;
    min-height: 72px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: inherit;
    font: inherit;
  }

  textarea::placeholder {
    opacity: 0.7;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }

  .post-btn {
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .post-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.8rem;
    color: #fca5a5;
  }
</style>
