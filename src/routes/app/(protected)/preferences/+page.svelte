<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import PortableStatePanel from '$lib/components/profile/PortableStatePanel.svelte';
  import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
  import {
    MEMORY_SUMMARY_ITEM_KEY,
    buildDeterministicMemorySummary,
    decodeStoredMemorySummary,
    encodeMemorySummary
  } from '$lib/memory/summary';
  import { hydrateCompanionPrefs, updateCompanionPrefs } from '$lib/stores/companionPrefs';
  import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  const SAFE_LOAD_ERROR = 'Something didn’t load. Try again.';

  let loading = true;
  let saving = false;
  let error: string | null = null;
  let portableState: PortableState | null = null;
  let portabilityEnabled = true;
  let memoryPaused = false;
  let memorySummary: string[] = [];
  let summaryUpdatedAt: string | null = null;
  let summarySaving = false;
  let copyStatus: 'idle' | 'copied' | 'error' = 'idle';
  let emotionalAdaptationPaused = false;
  let museSummaryLoading = false;
  let museSummaryText = '';
  let museHighlights: string[] = [];
  let museSummaryBuiltAt: string | null = null;
  let activeCompanionId = 'muse';

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
      portabilityEnabled = payload?.consent?.memory !== false;
      memoryPaused = !portabilityEnabled;
      portableState = payload?.portableState ?? null;
      hydrateCompanionPrefs(payload ?? {});
      const items = portableState?.items ?? [];
      companionVisible = resolveItem(items, 'companion_visibility', true);
      companionMotion = resolveItem(items, 'companion_motion', true);
      companionTransparent = resolveItem(items, 'companion_transparency', true);
      resolveMemorySummary();
      await ensureMemorySummaryStored();
      await fetchMuseSummary();
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      loading = false;
    }
  };

  const fetchMuseSummary = async () => {
    museSummaryLoading = true;
    try {
      const targetId = activeCompanionId;
      const query = targetId ? `?companionId=${encodeURIComponent(targetId)}` : '';
      const res = await fetch(`/api/companions/ambient${query}`);
      const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !payload) throw new Error('ambient fetch failed');
      const consent = (payload?.consent ?? null) as Record<string, unknown> | null;
      emotionalAdaptationPaused = consent?.emotionalAdaptation === false;
      const summary = (payload?.memorySummary ?? null) as Record<string, unknown> | null;
      museSummaryText = typeof summary?.summary_text === 'string' ? summary.summary_text : '';
      museHighlights = Array.isArray(summary?.highlights_json)
        ? summary.highlights_json.filter((entry): entry is string => typeof entry === 'string').slice(0, 7)
        : [];
      museSummaryBuiltAt = typeof summary?.last_built_at === 'string' ? summary.last_built_at : null;
    } catch {
      // Keep existing values on failure.
    } finally {
      museSummaryLoading = false;
    }
  };

  const rebuildMuseSummary = async () => {
    summarySaving = true;
    error = null;
    try {
      const targetId = activeCompanionId;
      const res = await fetch('/api/companions/memory-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: targetId })
      });
      if (!res.ok) throw new Error('rebuild failed');
      await fetchMuseSummary();
      window.dispatchEvent(new CustomEvent('looma:ambient-refresh', { detail: { reason: 'summary.rebuild' } }));
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
    }
  };

  const clearMuseSummary = async () => {
    summarySaving = true;
    error = null;
    try {
      const targetId = activeCompanionId;
      const res = await fetch('/api/companions/memory-summary', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companionId: targetId })
      });
      if (!res.ok) throw new Error('clear failed');
      await fetchMuseSummary();
      window.dispatchEvent(new CustomEvent('looma:ambient-refresh', { detail: { reason: 'summary.clear' } }));
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
    }
  };

  const setEmotionalAdaptationPaused = async (paused: boolean) => {
    summarySaving = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentEmotionalAdaptation: !paused })
      });
      if (!res.ok) throw new Error('toggle failed');
      emotionalAdaptationPaused = paused;
      if (paused) {
        window.dispatchEvent(new CustomEvent('looma:ambient-refresh', { detail: { reason: 'adaptation.off' } }));
      } else {
        await fetchMuseSummary();
        window.dispatchEvent(new CustomEvent('looma:ambient-refresh', { detail: { reason: 'adaptation.on' } }));
      }
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
    }
  };

  const resetMuseState = async () => {
    if (summarySaving) return;
    if (!window.confirm('Reset Muse emotional state and memory summary for this companion?')) return;
    summarySaving = true;
    error = null;
    try {
      const targetId = activeCompanionId;
      const query = targetId ? `?companionId=${encodeURIComponent(targetId)}` : '';
      const res = await fetch(`/api/cloudweave/clear${query}`, { method: 'POST' });
      if (!res.ok) throw new Error('reset failed');
      await fetchMuseSummary();
      window.dispatchEvent(new CustomEvent('looma:ambient-refresh', { detail: { reason: 'cloudweave.clear' } }));
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
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

  const upsertTextItem = (items: PortableState['items'], key: string, value: string) => {
    const now = new Date().toISOString();
    const next = items.filter((entry) => entry.key !== key);
    next.push({ key, value, updatedAt: now, source: 'memory_summary' });
    return next;
  };

  const removeItem = (items: PortableState['items'], key: string) => items.filter((entry) => entry.key !== key);

  const itemValue = (key: string): string | number | boolean | null => {
    const items = portableState?.items ?? [];
    const entry = items.find((row) => row.key === key);
    return entry?.value ?? null;
  };

  const copyPortabilityExport = async () => {
    if (!portableExportJson || !portabilityEnabled) return;
    try {
      await navigator.clipboard.writeText(portableExportJson);
      copyStatus = 'copied';
    } catch {
      copyStatus = 'error';
    }
    setTimeout(() => {
      copyStatus = 'idle';
    }, 2200);
  };

  const persistPortableState = async (nextState: PortableState) => {
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
  };

  const resolveMemorySummary = () => {
    const stored = decodeStoredMemorySummary(portableState);
    if (stored) {
      memorySummary = stored.bullets;
      summaryUpdatedAt = stored.generatedAt;
      return;
    }
    const deterministic = buildDeterministicMemorySummary(portableState);
    memorySummary = deterministic;
    summaryUpdatedAt = portableState?.updatedAt ?? null;
  };

  const ensureMemorySummaryStored = async () => {
    if (!portableState || !portabilityEnabled) return;
    const stored = decodeStoredMemorySummary(portableState);
    if (stored) return;
    const bullets = buildDeterministicMemorySummary(portableState);
    const encoded = encodeMemorySummary(bullets);
    const nextState: PortableState = {
      version: PORTABLE_STATE_VERSION,
      updatedAt: new Date().toISOString(),
      items: upsertTextItem(portableState.items ?? [], MEMORY_SUMMARY_ITEM_KEY, encoded),
      ...(portableState?.identity ? { identity: portableState.identity } : {}),
      ...(portableState?.companions ? { companions: portableState.companions } : {})
    };
    try {
      await persistPortableState(nextState);
      resolveMemorySummary();
    } catch {
      // Keep deterministic local summary visible even if persistence fails.
    }
  };

  const clearMemorySummary = async () => {
    if (!portableState || saving || summarySaving) return;
    summarySaving = true;
    error = null;
    try {
      const nextState: PortableState = {
        version: PORTABLE_STATE_VERSION,
        updatedAt: new Date().toISOString(),
        items: removeItem(portableState.items ?? [], MEMORY_SUMMARY_ITEM_KEY),
        ...(portableState?.identity ? { identity: portableState.identity } : {}),
        ...(portableState?.companions ? { companions: portableState.companions } : {})
      };
      await persistPortableState(nextState);
      resolveMemorySummary();
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
    }
  };

  const setMemoryPause = async (paused: boolean) => {
    if (saving || summarySaving) return;
    summarySaving = true;
    error = null;
    try {
      const res = await fetch('/api/context/portable', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentMemory: !paused })
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? 'Unable to update memory preference.');
      }
      await fetchPrefs();
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      summarySaving = false;
    }
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
        items: nextItems,
        ...(portableState?.companions ? { companions: portableState.companions } : {})
      };

      await persistPortableState(nextState);
      const companionPatch: { visible?: boolean; motion?: boolean; transparent?: boolean } = {};
      if (typeof patch.visibility === 'boolean') companionPatch.visible = patch.visibility;
      if (typeof patch.motion === 'boolean') companionPatch.motion = patch.motion;
      if (typeof patch.transparency === 'boolean') companionPatch.transparent = patch.transparency;
      updateCompanionPrefs(companionPatch);
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      saving = false;
    }
  };

  onMount(() => {
    void fetchPrefs();
  });

  $: activeCompanionId = $page.data?.activeCompanion?.id ?? $page.data?.portableActiveCompanion?.id ?? 'muse';

  $: portabilityTone = typeof itemValue('tone') === 'string' ? String(itemValue('tone')) : 'default';
  $: portabilityMood = typeof itemValue('world_mood_label') === 'string' ? String(itemValue('world_mood_label')) : 'steady';
  $: portabilityStreakDays =
    typeof itemValue('world_streak_days') === 'number' ? Number(itemValue('world_streak_days')) : 0;
  $: portabilityGamesPlayed =
    typeof itemValue('world_last_games_played') === 'number' ? Number(itemValue('world_last_games_played')) : 0;
  $: portabilityRoster = portableState?.companions?.roster ?? [];
  $: portabilityMilestones = Array.from(
    new Set(portabilityRoster.flatMap((entry) => (Array.isArray(entry.cosmeticsUnlocked) ? entry.cosmeticsUnlocked : [])))
  );
  $: portabilitySummary = {
    version: portableState?.version ?? PORTABLE_STATE_VERSION,
    updatedAt: portableState?.updatedAt ?? null,
    tone: portabilityTone,
    mood: portabilityMood,
    streakDays: portabilityStreakDays,
    gamesPlayedCount: portabilityGamesPlayed,
    companions: {
      activeId: portableState?.companions?.activeId ?? null,
      roster: portabilityRoster.map((entry) => ({
        id: entry.id,
        name: entry.name,
        archetype: entry.archetype,
        unlocked: entry.unlocked,
        cosmetics: normalizeCompanionCosmetics(entry.cosmetics),
        cosmeticsUnlocked: entry.cosmeticsUnlocked ?? [],
        stats: entry.stats
      }))
    },
    milestones: portabilityMilestones
  };
  $: portableExportJson =
    portabilityEnabled && portableState
      ? JSON.stringify(
          {
            portableState: portabilitySummary
          },
          null,
          2
        )
      : '';
</script>

<svelte:head>
  <title>Looma — Preferences</title>
</svelte:head>

<main class="preferences-page">
  <header class="preferences-header">
    <div>
      <h1>Preferences</h1>
      <p class="lede">Companion display, transparency, and memory.</p>
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

  <section class="preferences-panel memory-summary-panel" aria-labelledby="memory-summary-heading">
    <div class="panel-title-row">
      <h2 id="memory-summary-heading" class="panel-title">Memory Summary</h2>
    </div>
    <p class="memory-summary-copy">
      High-level summary only. This section never displays raw event logs or sensitive entries.
    </p>
    {#if memoryPaused}
      <p class="status-text">Summary updates are paused while Memory is off.</p>
    {:else}
      <ul class="memory-summary-list">
        {#each memorySummary as bullet, index (`${index}-${bullet}`)}
          <li>{bullet}</li>
        {/each}
      </ul>
      {#if summaryUpdatedAt}
        <p class="memory-summary-timestamp">Last summary update: {summaryUpdatedAt}</p>
      {/if}
    {/if}

    <div class="memory-summary-actions">
      <button
        type="button"
        class="pill pill-action"
        on:click={clearMemorySummary}
        disabled={summarySaving || !portableState || memoryPaused}
      >
        Clear summary
      </button>
      <button
        type="button"
        class="pill pill-action"
        on:click={() => setMemoryPause(!memoryPaused)}
        disabled={summarySaving}
      >
        {memoryPaused ? 'Resume updates' : 'Pause updates'}
      </button>
    </div>
  </section>

  <section class="preferences-panel memory-summary-panel" aria-labelledby="muse-understands-heading">
    <div class="panel-title-row">
      <h2 id="muse-understands-heading" class="panel-title">What Muse Understands</h2>
    </div>
    {#if museSummaryLoading}
      <p class="status-text">Loading summary…</p>
    {:else}
      <p class="memory-summary-copy">
        {museSummaryText || 'No summary yet for this companion. Rebuild to generate one.'}
      </p>
      {#if museHighlights.length > 0}
        <ul class="memory-summary-list">
          {#each museHighlights as bullet, idx (`muse-${idx}-${bullet}`)}
            <li>{bullet}</li>
          {/each}
        </ul>
      {/if}
      {#if museSummaryBuiltAt}
        <p class="memory-summary-timestamp">Last built: {museSummaryBuiltAt}</p>
      {/if}
    {/if}
    <div class="memory-summary-actions">
      <button
        type="button"
        class="pill pill-action"
        on:click={rebuildMuseSummary}
        disabled={summarySaving || museSummaryLoading}
      >
        Rebuild summary
      </button>
      <button type="button" class="pill pill-action" on:click={clearMuseSummary} disabled={summarySaving}>
        Clear summary
      </button>
      <button
        type="button"
        class="pill pill-action"
        on:click={() => setEmotionalAdaptationPaused(!emotionalAdaptationPaused)}
        disabled={summarySaving}
      >
        {emotionalAdaptationPaused ? 'Resume emotional adaptation' : 'Pause emotional adaptation'}
      </button>
      <button type="button" class="pill pill-action" on:click={resetMuseState} disabled={summarySaving}>
        Reset Muse state
      </button>
    </div>
  </section>

  <section class="preferences-panel portability-panel" aria-labelledby="portability-heading">
    <div class="panel-title-row">
      <h2 id="portability-heading" class="panel-title">Portability Export</h2>
    </div>
    {#if !portabilityEnabled}
      <div class="portability-disabled" role="status">
        <p><strong>Portability is off.</strong></p>
        <p>Turn on Memory to generate an export.</p>
      </div>
    {:else if !portableState}
      <p class="status-text">Portable state is not available yet.</p>
    {:else}
      <div class="portability-grid">
        <article class="portability-card">
          <h3>Context</h3>
          <ul>
            <li>Tone: {String(portabilitySummary.tone)}</li>
            <li>Mood: {String(portabilitySummary.mood)}</li>
            <li>Streak days: {String(portabilitySummary.streakDays)}</li>
            <li>Games played: {String(portabilitySummary.gamesPlayedCount)}</li>
          </ul>
        </article>

        <article class="portability-card">
          <h3>Companions</h3>
          <ul>
            <li>Active companion: {portabilitySummary.companions.activeId ?? 'none'}</li>
            <li>Roster size: {portabilitySummary.companions.roster.length}</li>
            <li>
              {#if portabilitySummary.milestones.length === 0}
                No cosmetics unlocked yet.
              {:else}
                Milestones: {portabilitySummary.milestones.length}
              {/if}
            </li>
          </ul>
        </article>
      </div>

      <article class="portability-card portability-card--wide">
        <h3>Roster details</h3>
        <div class="portability-roster-list">
          {#each portabilitySummary.companions.roster as entry (entry.id)}
            <div class="portability-roster-item">
              <strong>{entry.name}</strong>
              <span>{entry.archetype}</span>
              <span>Cosmetics: aura={String(entry.cosmetics.auraColor)}, glow={String(entry.cosmetics.glowIntensity)}</span>
              <span>Milestones: {(entry.cosmeticsUnlocked ?? []).join(', ') || 'none'}</span>
            </div>
          {/each}
        </div>
      </article>

      <div class="portability-actions">
        <button type="button" class="pill pill-action" on:click={copyPortabilityExport}>Copy export</button>
        {#if copyStatus === 'copied'}
          <span class="status-text">Copied.</span>
        {:else if copyStatus === 'error'}
          <span class="status-text status-text--error">Copy failed.</span>
        {/if}
      </div>

      <pre class="portability-json">{portableExportJson}</pre>
    {/if}
  </section>
</main>

<style>
  .preferences-page {
    padding: clamp(1.25rem, 3vw, 2.25rem);
    display: grid;
    gap: 1.75rem;
    width: min(100%, 1560px);
    box-sizing: border-box;
    margin: 0 auto;
    /* Bias the layout left a bit to make room for the companion dock on the right. */
    padding-right: calc(clamp(1.25rem, 3vw, 2.25rem) + 3.25rem);
  }

  @media (max-width: 980px) {
    .preferences-page {
      padding-right: clamp(1.25rem, 3vw, 2.25rem);
    }
  }

  .preferences-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 1.5rem;
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

  .memory-summary-panel {
    display: grid;
    gap: 0.7rem;
  }

  .memory-summary-copy {
    margin: 0;
    color: rgba(255, 255, 255, 0.72);
    font-size: 0.88rem;
  }

  .memory-summary-list {
    margin: 0;
    padding-left: 1.1rem;
    display: grid;
    gap: 0.35rem;
    color: rgba(255, 255, 255, 0.82);
  }

  .memory-summary-timestamp {
    margin: 0;
    font-size: 0.76rem;
    color: rgba(255, 255, 255, 0.58);
  }

  .memory-summary-actions {
    display: inline-flex;
    gap: 0.65rem;
    flex-wrap: wrap;
  }

  .portability-panel {
    display: grid;
    gap: 0.95rem;
  }

  .portability-disabled {
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(20, 16, 12, 0.6);
    padding: 0.9rem;
    color: rgba(255, 255, 255, 0.82);
  }

  .portability-disabled p {
    margin: 0.15rem 0;
  }

  .portability-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.85rem;
  }

  .portability-card {
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 14, 26, 0.6);
    padding: 0.85rem;
  }

  .portability-card h3 {
    margin: 0 0 0.5rem;
    font-size: 0.95rem;
  }

  .portability-card ul {
    margin: 0;
    padding-left: 1rem;
    color: rgba(255, 255, 255, 0.74);
    font-size: 0.86rem;
    display: grid;
    gap: 0.22rem;
  }

  .portability-card--wide {
    display: grid;
    gap: 0.55rem;
  }

  .portability-roster-list {
    display: grid;
    gap: 0.65rem;
  }

  .portability-roster-item {
    display: grid;
    gap: 0.15rem;
    font-size: 0.84rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .portability-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
  }

  .portability-json {
    margin: 0;
    max-height: 280px;
    overflow: auto;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(7, 10, 18, 0.88);
    padding: 0.85rem;
    font-size: 0.78rem;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.82);
  }
</style>
