<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let open = false;
  export let loading = false;
  export let error: string | null = null;

  let handle = '';
  let inputEl: HTMLInputElement | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    start: { handle: string };
  }>();

  $: if (open) {
    void tick().then(() => inputEl?.focus());
  }

  const close = () => {
    if (loading) return;
    dispatch('close');
  };

  const submit = () => {
    const normalized = handle.trim();
    if (!normalized || loading) return;
    dispatch('start', { handle: normalized });
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
</script>

{#if open}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="start-chat-title" tabindex="-1" on:keydown={onKeydown}>
    <button type="button" class="modal__backdrop" on:click={close} aria-label="Close start chat dialog"></button>
    <div class="modal__panel">
      <h2 id="start-chat-title">Start a chat</h2>
      <label for="chat-handle">Handle</label>
      <input
        id="chat-handle"
        bind:this={inputEl}
        type="text"
        placeholder="@handle"
        bind:value={handle}
        on:keydown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      />
      {#if error}
        <p class="error" role="status">{error}</p>
      {/if}
      <div class="modal__actions">
        <button type="button" class="ghost" on:click={close} disabled={loading}>Cancel</button>
        <button type="button" on:click={submit} disabled={loading || handle.trim().length === 0}>
          {loading ? 'Starting...' : 'Start'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .modal__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(2, 6, 23, 0.72);
    border: none;
    padding: 0;
  }

  .modal__panel {
    position: relative;
    width: min(30rem, 100%);
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: #0f172a;
    padding: 1rem;
    animation: pop-in 140ms ease-out;
  }

  h2 {
    margin: 0 0 0.8rem;
  }

  label {
    font-size: 0.86rem;
    color: rgba(203, 213, 225, 0.88);
  }

  input {
    width: 100%;
    margin-top: 0.35rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.86);
    color: #e2e8f0;
    padding: 0.68rem 0.8rem;
  }

  .error {
    color: #fca5a5;
    margin: 0.65rem 0 0;
    font-size: 0.84rem;
  }

  .modal__actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  button {
    border: none;
    border-radius: 0.7rem;
    background: #22d3ee;
    color: #083344;
    padding: 0.5rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button.ghost {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  button[disabled] {
    opacity: 0.55;
    cursor: default;
  }

  @keyframes pop-in {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal__panel {
      animation: none;
    }
  }
</style>
