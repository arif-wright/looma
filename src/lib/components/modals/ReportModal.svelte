<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Modal from '$lib/components/ui/Modal.svelte';
  import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';

  type ReportKind = 'profile' | 'post' | 'comment';

  export let open = false;
  export let targetKind: ReportKind = 'profile';
  export let targetId: string | null = null;

  const dispatch = createEventDispatcher<{ submitted: void; close: void }>();

  const REASONS: Array<{ value: string; label: string }> = [
    { value: 'harassment', label: 'Harassment or bullying' },
    { value: 'hate', label: 'Hate or discrimination' },
    { value: 'spam', label: 'Spam or scams' },
    { value: 'nudity', label: 'Nudity or sexual content' },
    { value: 'violence', label: 'Violence or gore' },
    { value: 'self-harm', label: 'Self-harm' },
    { value: 'other', label: 'Other' }
  ];

  let reason = 'spam';
  let details = '';
  let submitting = false;
  let errorMsg = '';
  let successMsg = '';

  $: if (!open) {
    reason = 'spam';
    details = '';
    errorMsg = '';
    successMsg = '';
  }

  async function submitReport() {
    if (!targetId || submitting) return;
    submitting = true;
    errorMsg = '';
    successMsg = '';
    try {
      const payload = {
        targetKind,
        targetId,
        reason,
        details: details.trim().length ? details.trim() : undefined
      };
      const res = await fetch('/api/safety/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        devLog('[ReportModal] submit failed', body, { status: res.status });
        throw new Error(safeApiPayloadMessage(body, res.status));
      }
      successMsg = 'Report submitted. Thank you for the heads-up.';
      dispatch('submitted');
      setTimeout(() => {
        open = false;
        successMsg = '';
      }, 1400);
    } catch (err) {
      devLog('[ReportModal] submit error', err);
      errorMsg = safeUiMessage(err);
    } finally {
      submitting = false;
    }
  }

  function handleClose() {
    if (submitting) return;
    open = false;
    dispatch('close');
  }
</script>

<Modal {open} title="Report" onClose={handleClose}>
  <form class="report-form" on:submit|preventDefault={submitReport}>
    <label class="field">
      <span>Reason</span>
      <select bind:value={reason} required>
        {#each REASONS as option}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span>Details (optional)</span>
      <textarea
        bind:value={details}
        rows="4"
        placeholder="Add any helpful context…"
        maxlength="500"
      ></textarea>
    </label>

    {#if errorMsg}
      <p class="status error" role="alert">{errorMsg}</p>
    {/if}
    {#if successMsg}
      <p class="status success">{successMsg}</p>
    {/if}

    <div class="actions">
      <button class="btn btn-sm" type="button" on:click={handleClose} disabled={submitting}>
        Cancel
      </button>
      <button class="btn btn-primary btn-sm" type="submit" disabled={submitting || !targetId}>
        {submitting ? 'Sending…' : 'Submit report'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .report-form {
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
