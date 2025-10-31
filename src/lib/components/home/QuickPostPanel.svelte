<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { SendHorizontal } from 'lucide-svelte';

  const MAX_LENGTH = 280;
  const dispatch = createEventDispatcher<{ posted: void }>();

  export let placeholder = 'Share a quick win…';

  let body = '';
  let error: string | null = null;
  let posting = false;

  const remaining = () => MAX_LENGTH - body.length;

  const reset = () => {
    body = '';
    error = null;
  };

  const submit = async () => {
    if (posting) return;
    const text = body.trim();
    if (!text) {
      error = 'Write something first.';
      return;
    }

    if (text.length > MAX_LENGTH) {
      error = `Keep it under ${MAX_LENGTH} characters.`;
      return;
    }

    posting = true;
    error = null;
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        error = data?.error ?? 'Unable to share right now.';
        return;
      }
      reset();
      dispatch('posted');
    } catch (err) {
      console.error('quick post error', err);
      error = err instanceof Error ? err.message : 'Unexpected error';
    } finally {
      posting = false;
    }
  };

  const handleKey = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };
</script>

<div class="quick-post orb-panel space-y-3 p-3 md:p-4">
  <div class="flex items-start gap-3">
    <input
      type="text"
      class="input-glass flex-1 min-w-0"
      placeholder={placeholder}
      bind:value={body}
      maxlength={MAX_LENGTH}
      aria-label="Share a quick win"
      on:keydown={handleKey}
    />
    <button
      class="btn-glass btn-ripple hover-glow send-btn"
      type="button"
      on:click={submit}
      disabled={posting || body.trim().length === 0 || body.length > MAX_LENGTH}
      aria-label="Post quick win"
    >
      <SendHorizontal size={16} stroke-width={1.8} />
    </button>
  </div>

  {#if error}
    <p class="text-xs text-rose-300" role="alert">{error}</p>
  {/if}

  <div class="flex justify-end text-xs text-white/50">
    <span class={`counter ${remaining() < 0 ? 'error' : ''}`}>{body.length}/{MAX_LENGTH}</span>
  </div>
</div>

<style>
  .send-btn {
    width: 2.5rem;
    height: 2.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: default;
    box-shadow: none;
  }

  .counter {
    font-variant-numeric: tabular-nums;
  }

  .counter.error {
    color: rgb(248 113 113);
  }
</style>
