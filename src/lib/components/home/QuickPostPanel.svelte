<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { SendHorizontal } from 'lucide-svelte';
  import { applyRitualUpdate } from '$lib/stores/companionRituals';
  import type { CompanionRitual } from '$lib/companions/rituals';

  const MAX_LENGTH = 280;
  const dispatch = createEventDispatcher<{
    posted: { item: Record<string, unknown> | null };
    rituals: { completed: CompanionRitual[] };
  }>();

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
      const payload = await res.json().catch(() => ({ item: null }));
      reset();
      dispatch('posted', { item: payload?.item ?? null });
      if (payload?.rituals?.list) {
        applyRitualUpdate(payload.rituals.list as CompanionRitual[]);
        dispatch('rituals', { completed: (payload.rituals.completed as CompanionRitual[]) ?? [] });
      }
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

<section class="quick-post" aria-live="polite">
  <div class="composer" data-state={posting ? 'loading' : 'idle'}>
    <input
      type="text"
      class="composer__input"
      placeholder={placeholder}
      bind:value={body}
      maxlength={MAX_LENGTH}
      aria-label="Whisper something kind"
      on:keydown={handleKey}
    />
    <button
      class="composer__send"
      type="button"
      on:click={submit}
      disabled={posting || body.trim().length === 0 || body.length > MAX_LENGTH}
      aria-label="Send whisper"
    >
      <SendHorizontal class="composer__icon" stroke-width={1.6} />
    </button>
  </div>

  <div class="composer__meta">
    {#if error}
      <p class="composer__error" role="alert">{error}</p>
    {/if}
    <span class={`composer__counter ${remaining() < 0 ? 'error' : ''}`}>{body.length}/{MAX_LENGTH}</span>
  </div>
</section>

<style>
.quick-post {
  display: grid;
  gap: 0.75rem;
}

.composer {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 0.75rem 0.85rem 0.75rem 1rem;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(147, 197, 253, 0.25);
  box-shadow: 0 0 18px rgba(147, 197, 253, 0.2);
  transition: box-shadow 200ms ease, border 200ms ease;
}

.composer::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.35), transparent 65%);
  opacity: 0.6;
  z-index: -1;
  animation: breathe 4.6s ease-in-out infinite;
}

.composer[data-state='loading'] {
  opacity: 0.8;
}

.composer__input {
  background: transparent;
  border: none;
  color: rgba(248, 250, 252, 0.95);
  font-size: 1rem;
  min-width: 0;
}

.composer__input::placeholder {
  color: rgba(226, 232, 240, 0.5);
}

.composer__input:focus-visible {
  outline: none;
}

.composer__send {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 999px;
  border: none;
  background: linear-gradient(130deg, rgba(56, 189, 248, 0.95), rgba(147, 197, 253, 0.92));
  color: rgba(15, 23, 42, 0.95);
  box-shadow: 0 0 16px rgba(147, 197, 253, 0.22);
  transition: transform 200ms ease, box-shadow 200ms ease;
}

.composer__send:hover,
.composer__send:focus-visible {
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(56, 189, 248, 0.35);
}

.composer__send:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.55), 0 10px 22px rgba(56, 189, 248, 0.35);
}

.composer__send:disabled {
  cursor: default;
  opacity: 0.6;
  transform: none;
  box-shadow: none;
}

.composer__icon {
  width: 1.2rem;
  height: 1.2rem;
}

.composer__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.75rem;
}

.composer__error {
  margin: 0;
  color: rgb(248 113 113);
}

.composer__counter {
  font-variant-numeric: tabular-nums;
  color: rgba(226, 232, 240, 0.55);
}

.composer__counter.error {
  color: rgb(248 113 113);
}

@media (prefers-reduced-motion: reduce) {
  .composer::before {
    animation: none;
  }
  .composer,
  .composer__send {
    transition: none;
  }
}

@keyframes breathe {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.8;
  }
}
</style>
