<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let disabled = false;
  export let sending = false;

  const dispatch = createEventDispatcher<{ send: { body: string } }>();

  let body = '';

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed || disabled || sending) return;
    dispatch('send', { body: trimmed });
    body = '';
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
</script>

<div class="composer">
  <label class="sr-only" for="message-input">Message</label>
  <textarea
    id="message-input"
    rows="2"
    placeholder={disabled ? 'Messaging unavailable.' : 'Write a message...'}
    bind:value={body}
    {disabled}
    on:keydown={onKeydown}
  ></textarea>
  <button type="button" on:click={submit} disabled={disabled || sending || body.trim().length === 0}>
    {sending ? 'Sending...' : 'Send'}
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
