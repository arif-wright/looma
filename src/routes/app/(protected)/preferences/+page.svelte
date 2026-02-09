<script lang="ts">
  import { onMount } from 'svelte';
  import PortableStatePanel from '$lib/components/profile/PortableStatePanel.svelte';
  import { PORTABLE_STATE_VERSION, type PortableState } from '$lib/types/portableState';
  import { hydrateCompanionPrefs, updateCompanionPrefs } from '$lib/stores/companionPrefs';
  import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';
  const SAFE_LOAD_ERROR = 'Something didn’t load. Try again.';

  let loading = true;
  let saving = false;
  let error: string | null = null;
  let portableState: PortableState | null = null;
  let portabilityEnabled = true;
  let copyStatus: 'idle' | 'copied' | 'error' = 'idle';

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
      portableState = payload?.portableState ?? null;
      hydrateCompanionPrefs(payload ?? {});
      const items = portableState?.items ?? [];
      companionVisible = resolveItem(items, 'companion_visibility', true);
      companionMotion = resolveItem(items, 'companion_motion', true);
      companionTransparent = resolveItem(items, 'companion_transparency', true);
    } catch {
      error = SAFE_LOAD_ERROR;
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
        companions: portableState?.companions
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
    } catch {
      error = SAFE_LOAD_ERROR;
    } finally {
      saving = false;
    }
  };

  onMount(() => {
    void fetchPrefs();
  });

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

  <section class="preferences-panel portability-panel" aria-labelledby="portability-heading">
    <div class="panel-title-row">
      <h2 id="portability-heading" class="panel-title">Portability Export</h2>
    </div>
    {#if !portabilityEnabled}
      <div class="portability-disabled" role="status">
        <p><strong>Portability is disabled.</strong></p>
        <p>Enable Memory in Transparency settings to generate and copy portable companion export state.</p>
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
    width: min(100%, 1760px);
    box-sizing: border-box;
    margin: 0 auto;
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
