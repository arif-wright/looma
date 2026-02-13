<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';

  export let open = false;
  export let loading = false;
  export let error: string | null = null;

  let inviteCode = '';
  let inputEl: HTMLInputElement | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    submit: { inviteCode: string };
  }>();

  $: if (open) {
    void tick().then(() => inputEl?.focus());
  }

  const submit = () => {
    const code = inviteCode.trim();
    if (!code || loading) return;
    dispatch('submit', { inviteCode: code });
  };
</script>

{#if open}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="circle-join-title" tabindex="-1">
    <button type="button" class="backdrop" aria-label="Close join circle dialog" on:click={() => dispatch('close')}></button>
    <div class="panel">
      <h2 id="circle-join-title">Join Circle</h2>
      <label for="invite-code">Invite code</label>
      <input id="invite-code" bind:this={inputEl} bind:value={inviteCode} type="text" />
      {#if error}
        <p class="error" role="status">{error}</p>
      {/if}
      <div class="actions">
        <button type="button" class="ghost" on:click={() => dispatch('close')} disabled={loading}>Cancel</button>
        <button type="button" on:click={submit} disabled={loading || inviteCode.trim().length < 4}>
          {loading ? 'Joining...' : 'Join'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal { position: fixed; inset: 0; z-index: 120; display: grid; place-items: center; padding: 1rem; }
  .backdrop { position: absolute; inset: 0; border: none; background: rgba(2, 6, 23, 0.72); }
  .panel { position: relative; width: min(28rem, 100%); background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.24); border-radius: 1rem; padding: 1rem; }
  h2 { margin: 0 0 0.8rem; }
  label { font-size: 0.86rem; color: rgba(203, 213, 225, 0.9); }
  input { width: 100%; margin-top: 0.3rem; border-radius: 0.75rem; border: 1px solid rgba(148, 163, 184, 0.25); background: rgba(15, 23, 42, 0.82); color: #e2e8f0; padding: 0.64rem 0.75rem; }
  .actions { margin-top: 1rem; display: flex; justify-content: flex-end; gap: 0.55rem; }
  button { border: none; border-radius: 0.7rem; background: #22d3ee; color: #083344; padding: 0.5rem 1rem; font-weight: 700; cursor: pointer; }
  button.ghost { background: rgba(148, 163, 184, 0.2); color: #e2e8f0; }
  button[disabled] { opacity: 0.55; cursor: default; }
  .error { color: #fda4af; margin: 0.65rem 0 0; font-size: 0.84rem; }
</style>
