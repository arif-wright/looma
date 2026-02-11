<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';

  export let open = false;

  const CATEGORIES: Array<{ value: string; label: string }> = [
    { value: '', label: 'No category' },
    { value: 'bug', label: 'Bug report' },
    { value: 'idea', label: 'Idea or feature request' },
    { value: 'ux', label: 'Experience feedback' },
    { value: 'content', label: 'Content feedback' },
    { value: 'other', label: 'Other' }
  ];

  let category = '';
  let message = '';
  let sending = false;
  let errorMsg = '';
  let successMsg = '';

  $: if (!open) {
    category = '';
    message = '';
    sending = false;
    errorMsg = '';
    successMsg = '';
  }

  const close = () => {
    if (sending) return;
    open = false;
  };

  const submit = async () => {
    if (sending) return;
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      errorMsg = 'Please add your feedback before sending.';
      return;
    }

    sending = true;
    errorMsg = '';
    successMsg = '';

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmedMessage,
          category: category || null
        })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        devLog('[FeedbackModal] submit failed', payload, { status: res.status });
        throw new Error(safeApiPayloadMessage(payload, res.status));
      }

      successMsg = 'Thanks. Your feedback was sent.';
      setTimeout(() => {
        open = false;
      }, 900);
    } catch (err) {
      devLog('[FeedbackModal] submit error', err);
      errorMsg = safeUiMessage(err);
    } finally {
      sending = false;
    }
  };
</script>

<Modal {open} title="Send feedback" onClose={close}>
  <form class="feedback-form" on:submit|preventDefault={submit}>
    <label class="field">
      <span>Category (optional)</span>
      <select bind:value={category}>
        {#each CATEGORIES as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span>What would you like us to know?</span>
      <textarea
        bind:value={message}
        rows="5"
        maxlength="1500"
        placeholder="Share what worked, what felt off, or what you'd like next..."
      ></textarea>
    </label>

    {#if errorMsg}
      <p class="status error" role="alert">{errorMsg}</p>
    {/if}
    {#if successMsg}
      <p class="status success">{successMsg}</p>
    {/if}

    <div class="actions">
      <button class="btn btn-sm" type="button" on:click={close} disabled={sending}>
        Cancel
      </button>
      <button class="btn btn-primary btn-sm" type="submit" disabled={sending || !message.trim()}>
        {sending ? 'Sending…' : 'Send'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .feedback-form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.85);
  }

  select,
  textarea {
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(10, 12, 20, 0.7);
    color: inherit;
    padding: 0.65rem 0.75rem;
    font-size: 0.95rem;
    font-family: inherit;
  }

  textarea {
    resize: vertical;
  }

  .status {
    font-size: 0.85rem;
  }

  .status.error {
    color: #f87171;
  }

  .status.success {
    color: #34d399;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
