<script lang="ts">
  import { onMount } from 'svelte';
  import PortableStatePanel from '$lib/components/profile/PortableStatePanel.svelte';
  import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
  import { hydrateCompanionPrefs, updateCompanionPrefs } from '$lib/stores/companionPrefs';

  let loading = true;
  let saving = false;
  let error: string | null = null;
  let portableState: PortableState | null = null;

  let companionVisible = true;
  let companionMotion = true;
  let companionTransparent = true;

  const fetchPrefs = async () => {
    loading = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable');
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error ?? 'Unable to load preferences.');
      portableState = payload?.portableState ?? null;
      hydrateCompanionPrefs(payload ?? {});
      const items = portableState?.items ?? [];
      companionVisible = resolveItem(items, 'companion_visibility', true);
      companionMotion = resolveItem(items, 'companion_motion', true);
      companionTransparent = resolveItem(items, 'companion_transparency', true);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to load preferences.';
    } finally {
      loading = false;
    }
  };

  const resolveItem = (items: PortableState['items'], key: string, fallback: boolean) => {
    const match = items.find((entry) => entry.key === key);
    if (!match) return fallback;
    if (typeof match.value === 'boolean') return match.value;
    return fallback;
  };

  const upsertItem = (items: PortableState['items'], key: string, value: boolean) => {
    const now = new Date().toISOString();
    const next = items.filter((entry) => entry.key !== key);
    next.push({ key, value, updatedAt: now, source: 'preferences' });
    return next;
  };

  const savePortable = async (patch: { visibility?: boolean; motion?: boolean; transparency?: boolean }) => {
    if (saving) return;
    saving = true;
    error = null;
    try {
      const items = portableState?.items ? [...portableState.items] : [];
      let nextItems = items;
      if (typeof patch.visibility === 'boolean') {
        nextItems = upsertItem(nextItems, 'companion_visibility', patch.visibility);
      }
      if (typeof patch.motion === 'boolean') {
        nextItems = upsertItem(nextItems, 'companion_motion', patch.motion);
      }
      if (typeof patch.transparency === 'boolean') {
        nextItems = upsertItem(nextItems, 'companion_transparency', patch.transparency);
      }

      const nextState: PortableState = {
        version: PORTABLE_STATE_VERSION,
        updatedAt: new Date().toISOString(),
        items: nextItems
      };

      const res = await fetch('/api/context/portable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portableState: nextState })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? 'Unable to save preferences.');
      }

      portableState = nextState;
      updateCompanionPrefs({
        visible: typeof patch.visibility === 'boolean' ? patch.visibility : undefined,
        motion: typeof patch.motion === 'boolean' ? patch.motion : undefined,
        transparent: typeof patch.transparency === 'boolean' ? patch.transparency : undefined
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unable to save preferences.';
    } finally {
      saving = false;
    }
  };

  onMount(() => {
    void fetchPrefs();
  });
</script>

<svelte:head>
  <title>Looma — Preferences</title>
</svelte:head>

<main class="preferences-page">
  <header class="preferences-header">
    <div>
      <p class="eyebrow">Preferences</p>
      <h1>User Preferences</h1>
      <p class="lede">Manage companion display, transparency, and memory controls.</p>
    </div>
  </header>

  <section class="panel preferences-panel" aria-labelledby="companion-heading">
    <div class="panel-title-row">
      <h2 id="companion-heading" class="panel-title">Companion Display</h2>
    </div>

    {#if loading}
      <p class="status-text">Loading preferences…</p>
    {:else if error}
      <p class="status-text status-text--error">{error}</p>
    {:else}
      <div class="toggle-grid">
        <label class="toggle-card">
          <input
            type="checkbox"
            bind:checked={companionVisible}
            disabled={saving}
            on:change={() => savePortable({ visibility: companionVisible })}
          />
          <span>
            <strong>Companion visibility</strong>
            <span>Show Muse in the companion dock and surfaces.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input
            type="checkbox"
            bind:checked={companionMotion}
            disabled={saving}
            on:change={() => savePortable({ motion: companionMotion })}
          />
          <span>
            <strong>Companion motion</strong>
            <span>Enable idle animation in Muse’s visual.</span>
          </span>
        </label>

        <label class="toggle-card">
          <input
            type="checkbox"
            bind:checked={companionTransparent}
            disabled={saving}
            on:change={() => savePortable({ transparency: companionTransparent })}
          />
          <span>
            <strong>Companion transparency</strong>
            <span>Use transparent background behind Muse.</span>
          </span>
        </label>
      </div>
    {/if}
  </section>

  <section class="preferences-group" aria-labelledby="transparency-heading">
    <div class="panel-title-row">
      <h2 id="transparency-heading" class="panel-title">Transparency &amp; Memory</h2>
    </div>
    <PortableStatePanel />
  </section>
</main>

<style>
  .preferences-page {
    padding: clamp(1.5rem, 4vw, 3rem);
    display: grid;
    gap: 1.75rem;
  }

  .preferences-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1.5rem;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.2em;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .lede {
    margin: 0.35rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .panel-title-row {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    margin-bottom: 0.75rem;
  }

  .preferences-panel {
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 1.25rem;
    background: rgba(8, 10, 18, 0.85);
  }

  .toggle-grid {
    display: grid;
    gap: 0.85rem;
  }

  .toggle-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    align-items: flex-start;
    padding: 0.75rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 26, 0.6);
    color: rgba(255, 255, 255, 0.85);
  }

  .toggle-card input {
    margin-top: 0.2rem;
  }

  .toggle-card strong {
    display: block;
    font-size: 0.9rem;
  }

  .toggle-card span span {
    display: block;
    margin-top: 0.2rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .status-text {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .status-text--error {
    color: rgba(248, 113, 113, 0.9);
  }

  .preferences-group {
    display: grid;
    gap: 0.75rem;
  }
</style>
