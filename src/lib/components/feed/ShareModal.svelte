<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import Portal from '$lib/ui/Portal.svelte';
  import { createShare, ShareError } from '$lib/lib/shares';

  export let open = false;
  export let postId: string;

  const dispatch = createEventDispatcher<{
    close: void;
    shared: { sharesCount: number };
    error: { status: number; message: string };
  }>();

  const MAX_LENGTH = 280;

  let modalEl: HTMLElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let quote = '';
  let helperText: string | null = null;
  let submitting = false;

  const remaining = () => MAX_LENGTH - quote.length;

  function close() {
    if (submitting) return;
    quote = '';
    helperText = null;
    dispatch('close');
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      if (!focusable.length || !modalEl) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  async function focusModal() {
    if (!browser || !open) return;
    await tick();
    if (!modalEl) return;
    focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    );
    (focusable[0] ?? modalEl).focus();
  }

  $: if (browser) {
    if (open) {
      previouslyFocused = (document.activeElement as HTMLElement | null) ?? previouslyFocused;
      document.body.classList.add('modal-open');
      void focusModal();
    } else {
      document.body.classList.remove('modal-open');
      focusable = [];
      previouslyFocused?.focus?.();
      previouslyFocused = null;
      quote = '';
      helperText = null;
      submitting = false;
    }
  }

  onMount(() => {
    if (!browser) return;
    document.addEventListener('keydown', handleKey, true);
  });

  onDestroy(() => {
    if (!browser) return;
    document.removeEventListener('keydown', handleKey, true);
    document.body.classList.remove('modal-open');
  });

  function handleInput(event: Event) {
    const target = event.currentTarget as HTMLTextAreaElement;
    if (!target) return;
    if (target.value.length > MAX_LENGTH) {
      quote = target.value.slice(0, MAX_LENGTH);
      helperText = `Quotes cannot exceed ${MAX_LENGTH} characters.`;
    } else {
      quote = target.value;
      helperText = null;
    }
  }

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (submitting || !postId) return;
    const trimmed = quote.trim();
    if (trimmed.length > MAX_LENGTH) {
      helperText = `Quotes cannot exceed ${MAX_LENGTH} characters.`;
      return;
    }

    submitting = true;

    try {
      const result = await createShare(postId, trimmed || undefined);
      dispatch('shared', { sharesCount: result.shares_count });
      submitting = false;
      quote = '';
      helperText = null;
      dispatch('close');
    } catch (error) {
      submitting = false;
      const shareError = error instanceof ShareError ? error : null;
      const status = shareError?.status ?? 500;
      let message = shareError?.message ?? 'Unable to share right now.';

      if (status === 401) {
        message = 'Please sign in to share.';
      } else if (status === 429) {
        message = shareError?.message ?? 'You are sharing too quickly.';
      }

      helperText = status === 400 || status === 409 ? message : null;
      dispatch('error', { status, message });
    }
  }
</script>

{#if browser && open}
  <Portal target="#modal-root">
    <button
      type="button"
      class="share-modal__backdrop"
      aria-label="Close share dialog"
      on:click={close}
    ></button>

    <section
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      class="share-modal"
      on:click|stopPropagation
    >
      <header class="share-modal__header">
        <h2 id="share-modal-title">Quote &amp; Repost</h2>
        <p class="share-modal__subtitle">Add a note before reposting to your followers.</p>
      </header>

      <form class="share-modal__form" on:submit={handleSubmit}>
        <label for="quote-input" class="share-modal__label">
          Your message
        </label>
        <textarea
          id="quote-input"
          class="share-modal__textarea"
          name="quote"
          maxlength={MAX_LENGTH}
          bind:value={quote}
          on:input={handleInput}
          rows="4"
          placeholder="Add a comment (optional)…"
          data-testid="quote-input"
        ></textarea>
        <div class="share-modal__meta">
          <span class={`share-modal__helper ${helperText ? 'has-error' : ''}`}>
            {helperText ?? 'Optional · 280 character limit'}
          </span>
          <span class={`share-modal__counter ${remaining() < 0 ? 'over-limit' : ''}`}>
            {remaining()}
          </span>
        </div>

        <footer class="share-modal__footer">
          <button type="button" class="share-modal__btn secondary" on:click={close} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            class="share-modal__btn primary"
            data-testid="quote-submit"
            disabled={submitting || remaining() < 0}
          >
            {submitting ? 'Sharing…' : 'Share'}
          </button>
        </footer>
      </form>
    </section>
  </Portal>
{/if}

<style>
  .share-modal__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(2px);
    z-index: 2147483646;
  }

  .share-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(92vw, 28rem);
    max-height: 85vh;
    overflow-y: auto;
    border-radius: 20px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.92);
    padding: 22px;
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.45);
    display: grid;
    gap: 18px;
    z-index: 2147483647;
    color: rgba(241, 245, 249, 0.96);
  }

  .share-modal__header {
    display: grid;
    gap: 6px;
  }

  .share-modal__header h2 {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .share-modal__subtitle {
    font-size: 0.85rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .share-modal__form {
    display: grid;
    gap: 12px;
  }

  .share-modal__label {
    font-size: 0.85rem;
    font-weight: 600;
    color: rgba(203, 213, 225, 0.95);
  }

  .share-modal__textarea {
    width: 100%;
    min-height: 120px;
    border-radius: 14px;
    border: 1px solid rgba(71, 85, 105, 0.5);
    background: rgba(15, 23, 42, 0.75);
    color: rgba(241, 245, 249, 0.96);
    padding: 12px;
    font-size: 0.95rem;
    line-height: 1.5;
    resize: vertical;
  }

  .share-modal__textarea:focus-visible {
    outline: 2px solid rgba(56, 189, 248, 0.55);
    outline-offset: 2px;
  }

  .share-modal__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.78rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .share-modal__helper.has-error {
    color: rgba(248, 113, 113, 0.9);
  }

  .share-modal__counter {
    font-variant-numeric: tabular-nums;
  }

  .share-modal__counter.over-limit {
    color: rgba(248, 113, 113, 0.9);
  }

  .share-modal__footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .share-modal__btn {
    border-radius: 999px;
    padding: 8px 18px;
    font-size: 0.9rem;
    font-weight: 600;
    border: 1px solid transparent;
    transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }

  .share-modal__btn.secondary {
    background: transparent;
    color: rgba(148, 163, 184, 0.88);
    border-color: rgba(148, 163, 184, 0.35);
  }

  .share-modal__btn.primary {
    background: rgba(56, 189, 248, 0.2);
    color: rgba(240, 249, 255, 0.96);
    border-color: rgba(56, 189, 248, 0.5);
  }

  .share-modal__btn:not(:disabled):hover,
  .share-modal__btn:not(:disabled):focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 10px 20px rgba(56, 189, 248, 0.2);
  }

  .share-modal__btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  @media (prefers-reduced-motion: reduce) {
    .share-modal__btn {
      transition: none;
    }
  }
</style>
