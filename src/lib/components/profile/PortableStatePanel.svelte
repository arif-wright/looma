<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import type { PortableState } from '$lib/types/portableState';
  import { Eye, RefreshCcw, ShieldCheck, ShieldOff } from 'lucide-svelte';
  import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';

  type ConsentFlags = { memory: boolean; adaptation: boolean; reactions: boolean };

  let portableState: PortableState | null = null;
  let consent: ConsentFlags = { memory: true, adaptation: true, reactions: true };
  let loading = true;
  let saving = false;
  let error: string | null = null;

  const fetchState = async () => {
    if (!browser) return;
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable');
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        devLog('[PortableStatePanel] fetchState failed', payload, { status: res.status });
        throw new Error(safeApiPayloadMessage(payload, res.status));
      }
      consent = payload?.consent ?? consent;
      portableState = payload?.portableState ?? null;
    } catch (err) {
      devLog('[PortableStatePanel] fetchState error', err);
      error = safeUiMessage(err);
    } finally {
      loading = false;
    }
  };

  const updateConsent = async (next: Partial<ConsentFlags>) => {
    if (!browser) return;
    saving = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consentMemory: typeof next.memory === 'boolean' ? next.memory : undefined,
          consentAdaptation: typeof next.adaptation === 'boolean' ? next.adaptation : undefined,
          consentReactions: typeof next.reactions === 'boolean' ? next.reactions : undefined
        })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        devLog('[PortableStatePanel] updateConsent failed', payload, { status: res.status });
        throw new Error(safeApiPayloadMessage(payload, res.status));
      }
      consent = { ...consent, ...next };
      if (typeof next.memory === 'boolean' && !next.memory) {
        portableState = null;
      }
    } catch (err) {
      devLog('[PortableStatePanel] updateConsent error', err);
      error = safeUiMessage(err);
    } finally {
      saving = false;
    }
  };

  const resetMemory = async () => {
    if (!browser) return;
    saving = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        devLog('[PortableStatePanel] resetMemory failed', payload, { status: res.status });
        throw new Error(safeApiPayloadMessage(payload, res.status));
      }
      await fetchState();
    } catch (err) {
      devLog('[PortableStatePanel] resetMemory error', err);
      error = safeUiMessage(err);
    } finally {
      saving = false;
    }
  };

  onMount(() => {
    void fetchState();
  });
</script>

<section class="panel portable-panel" aria-labelledby="portable-heading">
  <div class="portable-panel__header">
    <div>
      <p class="portable-panel__eyebrow">Transparency</p>
      <h3 id="portable-heading" class="panel-title m-0">What Looma remembers</h3>
      <p class="portable-panel__copy">
        This is a small, portable memory bundle. You can opt out or reset at any time.
      </p>
    </div>
    <Eye size={18} />
  </div>

  {#if loading}
    <p class="portable-panel__status">Loading memory settings…</p>
  {:else if error}
    <p class="portable-panel__status portable-panel__status--error">{error}</p>
  {:else}
    <div class="portable-panel__consent">
      <label class="portable-panel__toggle">
        <input
          type="checkbox"
          checked={consent.memory}
          disabled={saving}
          on:change={(event) => updateConsent({ memory: (event.currentTarget as HTMLInputElement).checked })}
        />
        <span>
          <span class="portable-panel__toggle-title">
            {#if consent.memory}
              <ShieldCheck size={14} /> Memory on
            {:else}
              <ShieldOff size={14} /> Memory off
            {/if}
          </span>
          <span class="portable-panel__toggle-copy">
            Allow Looma to store portable memory items (short summaries only).
          </span>
        </span>
      </label>

      <label class="portable-panel__toggle">
        <input
          type="checkbox"
          checked={consent.adaptation}
          disabled={saving}
          on:change={(event) => updateConsent({ adaptation: (event.currentTarget as HTMLInputElement).checked })}
        />
        <span>
          <span class="portable-panel__toggle-title">
            {#if consent.adaptation}
              <ShieldCheck size={14} /> Adaptation on
            {:else}
              <ShieldOff size={14} /> Adaptation off
            {/if}
          </span>
          <span class="portable-panel__toggle-copy">
            Allow Looma to personalize experiences from your recent context.
          </span>
        </span>
      </label>

      <label class="portable-panel__toggle">
        <input
          type="checkbox"
          checked={consent.reactions}
          disabled={saving}
          on:change={(event) => updateConsent({ reactions: (event.currentTarget as HTMLInputElement).checked })}
        />
        <span>
          <span class="portable-panel__toggle-title">
            {#if consent.reactions}
              <ShieldCheck size={14} /> Companion reactions on
            {:else}
              <ShieldOff size={14} /> Companion reactions off
            {/if}
          </span>
          <span class="portable-panel__toggle-copy">
            Allow Muse to show brief reactions after key events.
          </span>
        </span>
      </label>
    </div>

    <div class="portable-panel__memory">
      <h4 class="portable-panel__subhead">Current memory</h4>
      {#if !consent.memory}
        <p class="portable-panel__status">Memory is off. Looma is not storing portable items.</p>
      {:else if !portableState || portableState.items.length === 0}
        <p class="portable-panel__status">Nothing stored yet.</p>
      {:else}
        <ul class="portable-panel__list">
          {#each portableState.items as item}
            <li>
              <strong>{item.key}:</strong> {String(item.value ?? '—')}
            </li>
          {/each}
        </ul>
        <p class="portable-panel__timestamp">Last updated: {portableState.updatedAt}</p>
      {/if}
    </div>

    <div class="portable-panel__actions">
      <button class="btn-ghost" type="button" on:click={resetMemory} disabled={saving || !consent.memory}>
        <RefreshCcw size={14} /> Reset memory
      </button>
    </div>
  {/if}
</section>

<style>
  .portable-panel {
    display: grid;
    gap: 1rem;
  }

  .portable-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
  }

  .portable-panel__eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .portable-panel__copy {
    margin: 0.45rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .portable-panel__status {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .portable-panel__status--error {
    color: rgba(248, 113, 113, 0.9);
  }

  .portable-panel__consent {
    display: grid;
    gap: 0.75rem;
  }

  .portable-panel__toggle {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: flex-start;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 0.75rem;
    background: rgba(9, 12, 25, 0.6);
  }

  .portable-panel__toggle input {
    margin-top: 0.2rem;
  }

  .portable-panel__toggle-title {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.75rem;
  }

  .portable-panel__toggle-copy {
    display: block;
    margin-top: 0.35rem;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.85rem;
  }

  .portable-panel__memory {
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.75rem;
    background: rgba(7, 10, 20, 0.55);
  }

  .portable-panel__subhead {
    margin: 0 0 0.5rem;
    font-size: 0.9rem;
  }

  .portable-panel__list {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    color: rgba(255, 255, 255, 0.8);
  }

  .portable-panel__timestamp {
    margin: 0.6rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .portable-panel__actions {
    display: flex;
    justify-content: flex-start;
  }
</style>
