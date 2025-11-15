<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PostRow } from '$lib/social/types';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';

  export let maxLength = 420;

  const dispatch = createEventDispatcher<{ posted: PostRow }>();

  let body = '';
  let submitting = false;
  let errorMsg: string | null = null;

  const remaining = () => Math.max(0, maxLength - body.length);

  async function submit() {
    if (submitting || body.trim().length === 0) return;
    submitting = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        errorMsg = payload?.error ?? 'Unable to post right now.';
        return;
      }
      const payload = await res.json();
      const item = payload?.item as PostRow | undefined;
      if (item) {
        dispatch('posted', item);
        body = '';
      }
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list as CompanionRitual[]);
      }
    } catch (err) {
      console.error('profile composer error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      submitting = false;
    }
  }
</script>

<section class="profile-composer panel-glass">
  <textarea
    bind:value={body}
    maxlength={maxLength}
    placeholder="Share a new update…"
    rows="3"
  ></textarea>
  <div class="composer-footer">
    <span class={`counter ${remaining() < 30 ? 'warn' : ''}`}>{remaining()}</span>
    <button type="button" on:click={submit} disabled={submitting || body.trim().length === 0}>
      {submitting ? 'Posting…' : 'Post'}
    </button>
  </div>
  {#if errorMsg}
    <p class="error">{errorMsg}</p>
  {/if}
</section>

<style>
  .profile-composer {
    border-radius: var(--brand-radius, 22px);
    padding: 1rem;
    display: grid;
    gap: 0.6rem;
  }

  textarea {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    color: inherit;
    padding: 0.85rem;
    font-size: 1rem;
    resize: vertical;
  }

  textarea:focus-visible {
    outline: none;
    border-color: rgba(94, 242, 255, 0.6);
    box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.2);
  }

  .composer-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .counter {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .counter.warn {
    color: #fcd34d;
  }

  button {
    padding: 0.45rem 1.4rem;
    border-radius: 999px;
    border: none;
    background: linear-gradient(120deg, #5ef2ff, #9b5cff);
    color: #03040c;
    font-weight: 600;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .error {
    margin: 0;
    font-size: 0.85rem;
    color: #fca5a5;
  }
</style>
