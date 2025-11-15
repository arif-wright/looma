<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { tick } from 'svelte';
  import type { PostRow } from '$lib/social/types';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';

  export let avatarUrl: string | null = null;
  export let maxLength = 420;

  const dispatch = createEventDispatcher<{ posted: PostRow }>();

  let expanded = false;
  let text = '';
  let submitting = false;
  let errorMsg: string | null = null;
  let textareaEl: HTMLTextAreaElement | null = null;

  async function expand() {
    if (expanded) return;
    expanded = true;
    await tick();
    textareaEl?.focus();
  }

  function cancel() {
    if (submitting) return;
    text = '';
    expanded = false;
    errorMsg = null;
  }

  async function submit() {
    if (!text.trim() || submitting) return;
    submitting = true;
    errorMsg = null;
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        errorMsg = payload?.error ?? 'Unable to post right now.';
        return;
      }
      const payload = await res.json().catch(() => ({}));
      const item = payload?.item as PostRow | undefined;
      if (item) {
        dispatch('posted', item);
      }
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list as CompanionRitual[]);
      }
      text = '';
      expanded = false;
    } catch (err) {
      console.error('smart composer error', err);
      errorMsg = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      submitting = false;
    }
  }

  const remaining = () => Math.max(0, maxLength - text.length);
</script>

<section class={`composer ${expanded ? 'composer-expanded' : 'composer-collapsed'}`} aria-label="Create a new post">
  <div class="flex items-start gap-3">
    <img
      src={avatarUrl ?? '/avatars/default.png'}
      alt=""
      class="h-10 w-10 rounded-full ring-1 ring-white/20 object-cover"
      loading="lazy"
    />
    <div class="flex-1">
      {#if !expanded}
        <button class="w-full text-left text-white/60" type="button" on:click={expand}>
          Share a new update…
        </button>
      {:else}
        <div class="space-y-3">
          <textarea
            bind:this={textareaEl}
            class="textarea textarea-md w-full"
            bind:value={text}
            maxlength={maxLength}
            rows="3"
            placeholder="What’s happening?"
          ></textarea>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class={`text-sm ${remaining() < 30 ? 'text-amber-200' : 'text-white/60'}`}>{remaining()}</span>
            <div class="flex items-center gap-2">
              <button class="btn-ghost" type="button" on:click={cancel} disabled={submitting}>
                Cancel
              </button>
              <button class="btn-ghost" type="button" on:click={submit} disabled={submitting || !text.trim()}>
                {submitting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </div>
          {#if errorMsg}
            <p class="text-sm text-rose-300">{errorMsg}</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</section>
