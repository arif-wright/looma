<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let disabled = false;
  export let sending = false;
  export let editing = false;
  export let editSeed = '';

  const dispatch = createEventDispatcher<{
    send: { body: string };
    typing: { typing: boolean };
    cancelEdit: void;
  }>();

  let body = '';
  let lastSeed = '';

  $: if (editing && editSeed !== lastSeed) {
    body = editSeed;
    lastSeed = editSeed;
  }

  $: if (!editing && lastSeed !== '') {
    lastSeed = '';
  }

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || disabled || sending) return;
    dispatch('send', { body: trimmed });
    body = '';
    dispatch('typing', { typing: false });
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const onInput = () => {
    dispatch('typing', { typing: body.trim().length > 0 });
  };

  const onBlur = () => {
    dispatch('typing', { typing: false });
  };
</script>

<div class="composer">
  <label class="sr-only" for="message-input">Message</label>
  <div class="input-wrap">
    {#if editing}
      <div class="edit-row" role="status">
        <span>Editing message</span>
        <button type="button" class="cancel" on:click={() => dispatch('cancelEdit')}>Cancel</button>
      </div>
    {/if}
    <textarea
      id="message-input"
      rows="2"
      placeholder={disabled ? 'Messaging unavailable.' : editing ? 'Edit message...' : 'Write a message...'}
      bind:value={body}
      {disabled}
      on:keydown={onKeydown}
      on:input={onInput}
      on:blur={onBlur}
    ></textarea>
  </div>
  <button type="button" on:click={submit} disabled={disabled || sending || body.trim().length === 0}>
    {sending ? (editing ? 'Saving...' : 'Sending...') : editing ? 'Save' : 'Send'}
  </button>
</div>

<style>
  .composer {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.6rem;
    padding: 0.85rem;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.46);
  }

  .input-wrap {
    display: grid;
    gap: 0.4rem;
  }

  .edit-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.75rem;
    color: rgba(186, 230, 253, 0.94);
  }

  .cancel {
    border: none;
    background: transparent;
    color: rgba(125, 211, 252, 0.92);
    cursor: pointer;
    padding: 0;
    font-size: 0.75rem;
  }

  textarea {
    width: 100%;
    resize: none;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.72);
    color: #e2e8f0;
    padding: 0.7rem 0.8rem;
  }

  button {
    border: none;
    border-radius: 0.75rem;
    background: #22d3ee;
    color: #083344;
    padding: 0 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button[disabled] {
    opacity: 0.55;
    cursor: default;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
