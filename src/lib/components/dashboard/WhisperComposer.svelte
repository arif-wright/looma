<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { Send } from 'lucide-svelte';

  const MAX_LENGTH = 240;
  const dispatch = createEventDispatcher<{ submit: { body: string } }>();

  export let placeholder = 'Whisper something kind…';
  let body = '';
  let error: string | null = null;
  let submitting = false;

  const remaining = () => MAX_LENGTH - body.length;

  const reset = () => {
    body = '';
    error = null;
    submitting = false;
  };

  const submit = async () => {
    if (submitting) return;
    const text = body.trim();
    if (!text) {
      error = 'Send a gentle message first.';
      return;
    }
    if (text.length > MAX_LENGTH) {
      error = `Keep it under ${MAX_LENGTH} characters.`;
      return;
    }

    submitting = true;
    error = null;
    dispatch('submit', { body: text });
    reset();
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      void submit();
    }
  };
</script>

<section class="composer" data-state={submitting ? 'loading' : 'idle'} aria-live="polite">
  <div class="composer__body">
    <textarea
      class="composer__input"
      placeholder={placeholder}
      bind:value={body}
      maxlength={MAX_LENGTH}
      rows="3"
      on:keydown={handleKeyDown}
      aria-label="Whisper input"
    ></textarea>
    <button
      class="composer__send"
      type="button"
      on:click={submit}
      disabled={submitting || body.trim().length === 0 || body.length > MAX_LENGTH}
      aria-label="Send whisper"
    >
      <Send class="composer__icon" stroke-width={1.6} />
    </button>
  </div>
  <div class="composer__meta">
    <span class={`composer__counter ${remaining() < 0 ? 'error' : ''}`}>{body.length}/{MAX_LENGTH}</span>
    {#if error}
      <span class="composer__error" role="alert">{error}</span>
    {/if}
  </div>
</section>

<style>
  .composer {
    display: grid;
    gap: 0.75rem;
    border-radius: 1.5rem;
    padding: 1rem 1.2rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(147, 197, 253, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.15);
    backdrop-filter: blur(14px);
  }

  .composer__body {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 1rem;
    align-items: center;
  }

  .composer__input {
    resize: none;
    border: none;
    background: transparent;
    color: rgba(248, 250, 252, 0.95);
    font-size: 1rem;
    line-height: 1.6;
    min-width: 0;
  }

  .composer__input::placeholder {
    color: rgba(226, 232, 240, 0.55);
  }

  .composer__input:focus-visible {
    outline: none;
  }

  .composer__send {
    width: 3rem;
    height: 3rem;
    border-radius: 999px;
    border: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.95), rgba(147, 197, 253, 0.92));
    color: rgba(15, 23, 42, 0.95);
    box-shadow: 0 16px 32px rgba(56, 189, 248, 0.35);
    cursor: pointer;
    transition: transform 180ms ease, box-shadow 180ms ease;
  }

  .composer__send:hover,
  .composer__send:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 20px 36px rgba(56, 189, 248, 0.38);
  }

  .composer__send:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.55), 0 20px 36px rgba(56, 189, 248, 0.38);
  }

  .composer__send:disabled {
    opacity: 0.6;
    cursor: default;
    transform: none;
    box-shadow: none;
  }

  .composer__icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  .composer__meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.78rem;
    color: rgba(226, 232, 240, 0.6);
  }

  .composer__counter.error {
    color: rgb(248 113 113);
  }

  .composer__error {
    color: rgb(248 113 113);
  }

  @media (prefers-reduced-motion: reduce) {
    .composer,
    .composer__send {
      transition: none;
    }
  }
</style>
