<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';

  type PanelTab = 'all' | 'game' | 'locked';

  type CatalogRow = {
    id: string;
    key: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
    points: number;
    gameId: string | null;
    gameSlug: string | null;
    gameName: string | null;
    ruleKind: string | null;
  };

  type UnlockRow = {
    key: string;
    name: string;
    description: string;
    icon: string;
    rarity: string;
    points: number;
    unlockedAt: string | null;
    meta: Record<string, unknown> | null;
  };

  type PanelItem = CatalogRow & {
    unlocked: boolean;
    unlockedAt: string | null;
  };

export let open = false;
export let gameSlug: string | null = null;
export let gameName = 'Tiles Run';
export let highlightKey: string | null = null;
export let filterSlug: string | null = null;
export let gameId: string | null = null;
export let filterGameId: string | null = null;
export let requestId: number | null = null;

  const dispatch = createEventDispatcher<{ close: void }>();

  let panelEl: HTMLElement | null = null;
  let contentEl: HTMLElement | null = null;
  let loading = false;
  let error: string | null = null;
  let loaded = false;
  let points = 0;
  let catalog: CatalogRow[] = [];
  let unlocks: UnlockRow[] = [];
  let items: PanelItem[] = [];
  let activeTab: PanelTab = 'all';
  let highlightTimer: ReturnType<typeof setTimeout> | null = null;
  let currentItems: PanelItem[] = [];
  let lastRequestId: number | null = null;

  const fetchData = async () => {
    loading = true;
    error = null;
    try {
      const [catalogRes, meRes] = await Promise.all([
        fetch('/api/achievements/catalog', { cache: 'no-store' }),
        fetch('/api/achievements/me', { cache: 'no-store' })
      ]);

      if (!catalogRes.ok) {
        throw new Error('Unable to load achievements');
      }

      if (!meRes.ok) {
        throw new Error('Unable to load your progress');
      }

      const catalogPayload = (await catalogRes.json()) as { achievements: CatalogRow[] };
      const mePayload = (await meRes.json()) as { points: number; unlocks: UnlockRow[] };

      catalog = (catalogPayload.achievements ?? []).map((row) => ({
        id: row.id,
        key: row.key,
        name: row.name,
        description: row.description,
        icon: row.icon,
        rarity: row.rarity,
        points: row.points,
        gameId: row.gameId,
        gameSlug: row.gameSlug,
        gameName: row.gameName,
        ruleKind: row.ruleKind
      }));

      unlocks = (mePayload.unlocks ?? []).map((row) => ({
        key: row.key,
        name: row.name,
        description: row.description,
        icon: row.icon,
        rarity: row.rarity,
        points: row.points,
        unlockedAt: row.unlockedAt ?? null,
        meta: row.meta ?? null
      }));

      points = typeof mePayload.points === 'number' ? mePayload.points : 0;
      hydrateItems();
      loaded = true;
    } catch (err) {
      console.error('[achievements-panel] load failed', err);
      error = (err as Error).message ?? 'Unable to load achievements';
    } finally {
      loading = false;
    }
  };

  const hydrateItems = () => {
    const unlockedMap = new Map(unlocks.map((entry) => [entry.key, entry]));
    items = catalog.map((row) => {
      const unlocked = unlockedMap.get(row.key) ?? null;
      return {
        ...row,
        unlocked: Boolean(unlocked),
        unlockedAt: unlocked?.unlockedAt ?? null
      };
    });
  };

  const filteredItems = (): PanelItem[] => {
    switch (activeTab) {
      case 'game':
        return items.filter((item) => {
          const targetSlug = filterSlug ?? gameSlug;
          const targetGameId = filterGameId ?? gameId;
          const matchesSlug = targetSlug ? item.gameSlug === targetSlug : false;
          const matchesGameId = targetGameId ? item.gameId === targetGameId : false;
          const isGlobal = item.gameSlug === null && item.gameId === null;
          return matchesSlug || matchesGameId || isGlobal;
        });
      case 'locked':
        return items.filter((item) => !item.unlocked);
      case 'all':
      default:
        return items;
    }
  };

  $: currentItems = filteredItems();

  const closePanel = () => {
    dispatch('close');
  };

  const focusHighlight = () => {
    if (!highlightKey || !contentEl) return;
    if (highlightTimer) {
      clearTimeout(highlightTimer);
      highlightTimer = null;
    }

    highlightTimer = setTimeout(() => {
      const target = contentEl.querySelector<HTMLElement>(`[data-achievement-key="${highlightKey}"]`);
      if (target) {
        target.focus({ preventScroll: false });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
  };

  $: if (open && requestId && requestId !== lastRequestId) {
    lastRequestId = requestId;
    loaded = false;
    error = null;
    void fetchData();
  }

  $: if (open && !loaded && !loading) {
    void fetchData();
  }

  $: if (open) {
    if (!activeTab || activeTab === 'all') {
      if (filterSlug || filterGameId || gameSlug || gameId) {
        activeTab = 'game';
      }
    }

    if (panelEl) {
      panelEl.focus({ preventScroll: true });
    }

    focusHighlight();
  }

  $: if (highlightKey && open) {
    focusHighlight();
  }

  $: if (!open && loaded) {
    loaded = false;
    error = null;
  }

  onMount(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) {
        event.preventDefault();
        closePanel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  });

  onDestroy(() => {
    if (highlightTimer) {
      clearTimeout(highlightTimer);
    }
  });
</script>

{#if open}
  <div class="achievements-overlay" role="presentation">
    <div
      class="achievements-panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievements-panel-title"
      tabindex="-1"
      bind:this={panelEl}
    >
      <header class="panel-header">
        <div class="panel-titles">
          <h2 id="achievements-panel-title">Achievements</h2>
          <p class="panel-subtitle">Total points · {points}</p>
        </div>
        <button type="button" class="close-button" on:click={closePanel} data-testid="achievements-close">
          Close
        </button>
      </header>

      <nav class="panel-tabs" aria-label="Achievements scope">
        <button
          type="button"
          class:active={activeTab === 'all'}
          on:click={() => (activeTab = 'all')}
          data-testid="achievements-tab-all"
        >
          All
        </button>
        <button
          type="button"
          class:active={activeTab === 'game'}
          on:click={() => (activeTab = 'game')}
          data-testid="achievements-tab-game"
        >
          {gameName}
        </button>
        <button
          type="button"
          class:active={activeTab === 'locked'}
          on:click={() => (activeTab = 'locked')}
          data-testid="achievements-tab-locked"
        >
          Locked
        </button>
      </nav>

      <section class="panel-body" bind:this={contentEl} data-testid="achievements-panel">
        {#if loading}
          <div class="panel-status">Loading achievements…</div>
        {:else if error}
          <div class="panel-status error">
            <span>{error}</span>
            <button type="button" on:click={() => fetchData()}>Retry</button>
          </div>
        {:else if currentItems.length === 0}
          <div class="panel-status">No achievements here yet.</div>
        {:else}
          <ul class="achievement-grid">
            {#each currentItems as item (item.key)}
              <li>
                <article
                  class={`achievement-card ${item.unlocked ? 'unlocked' : 'locked'} ${
                    highlightKey === item.key ? 'is-highlighted' : ''
                  }`}
                  tabindex="0"
                  data-achievement-key={item.key}
                  data-testid={`achievement-card-${item.key}`}
                >
                  <div class="card-icon">
                    <AchievementIcon icon={item.icon} label={item.name} size={38} />
                  </div>
                  <div class="card-content">
                    <div class="card-title-row">
                      <h3>{item.name}</h3>
                      <span class={`rarity rarity-${item.rarity?.toLowerCase?.() ?? 'common'}`}>
                        {item.rarity ?? 'Common'}
                      </span>
                    </div>
                    <p class="card-description">{item.description}</p>
                    <div class="card-footer">
                      <span class="points">{item.points} pts</span>
                      {#if item.unlocked}
                        <span class="status unlocked">Unlocked</span>
                      {:else}
                        <span class="status locked">Keep going…</span>
                      {/if}
                    </div>
                  </div>
                </article>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
{/if}

<style>
  .achievements-overlay {
    position: fixed;
    inset: 0;
    background: rgba(5, 8, 18, 0.65);
    backdrop-filter: blur(6px);
    z-index: 60;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
  }

  .achievements-panel {
    width: min(100%, 960px);
    max-height: 90vh;
    overflow: hidden;
    background: rgba(13, 19, 38, 0.95);
    border: 1px solid rgba(120, 190, 255, 0.22);
    border-radius: 1.3rem;
    box-shadow: 0 28px 65px rgba(7, 10, 24, 0.55);
    display: flex;
    flex-direction: column;
    outline: none;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.25rem 1.5rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    color: rgba(234, 240, 255, 0.95);
    gap: 1rem;
  }

  .panel-titles h2 {
    margin: 0;
    font-size: 1.4rem;
  }

  .panel-subtitle {
    margin: 0.2rem 0 0 0;
    font-size: 0.85rem;
    color: rgba(180, 210, 255, 0.7);
  }

  .close-button {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(230, 238, 255, 0.9);
    border: none;
    border-radius: 999px;
    padding: 0.45rem 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .close-button:hover,
  .close-button:focus-visible {
    background: rgba(255, 255, 255, 0.24);
    outline: none;
  }

  .panel-tabs {
    display: flex;
    gap: 0.6rem;
    padding: 0 1.5rem 1rem;
  }

  .panel-tabs button {
    background: rgba(255, 255, 255, 0.08);
    border: none;
    border-radius: 999px;
    padding: 0.4rem 1rem;
    color: rgba(210, 226, 255, 0.8);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
  }

  .panel-tabs button.active {
    background: linear-gradient(120deg, rgba(122, 97, 255, 0.75), rgba(65, 215, 255, 0.78));
    color: rgba(12, 15, 32, 0.95);
    transform: translateY(-1px);
  }

  .panel-tabs button:hover,
  .panel-tabs button:focus-visible {
    outline: none;
    background: rgba(255, 255, 255, 0.18);
  }

  .panel-body {
    padding: 0 1.5rem 1.5rem;
    overflow-y: auto;
  }

  .panel-status {
    padding: 2rem 1rem;
    text-align: center;
    color: rgba(200, 218, 255, 0.75);
    display: grid;
    gap: 0.8rem;
  }

  .panel-status.error button {
    background: none;
    border: 1px solid rgba(255, 180, 200, 0.4);
    color: rgba(255, 210, 220, 0.88);
    border-radius: 999px;
    padding: 0.4rem 1rem;
    cursor: pointer;
  }

  .achievement-grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .achievement-card {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.9rem;
    padding: 0.9rem;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(235, 242, 255, 0.9);
    transition: transform 0.15s ease, box-shadow 0.15s ease, border 0.15s ease;
  }

  .achievement-card.unlocked {
    border-color: rgba(110, 210, 255, 0.4);
    box-shadow: 0 14px 38px rgba(22, 26, 55, 0.45);
  }

  .achievement-card.locked {
    opacity: 0.72;
  }

  .achievement-card.is-highlighted {
    border-color: rgba(255, 215, 140, 0.65);
    box-shadow: 0 18px 46px rgba(255, 204, 128, 0.4);
  }

  .achievement-card:focus-visible,
  .achievement-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 18px 42px rgba(25, 30, 60, 0.5);
    outline: none;
  }

  .card-icon {
    grid-row: span 2;
  }

  .card-content {
    display: grid;
    gap: 0.45rem;
  }

  .card-title-row {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: baseline;
  }

  .card-title-row h3 {
    margin: 0;
    font-size: 1rem;
  }

  .rarity {
    border-radius: 999px;
    padding: 0.2rem 0.55rem;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(255, 255, 255, 0.08);
  }

  .rarity-rare {
    background: rgba(120, 214, 255, 0.18);
    color: rgba(186, 244, 255, 0.95);
  }

  .rarity-epic {
    background: rgba(192, 154, 255, 0.18);
    color: rgba(236, 222, 255, 0.95);
  }

  .rarity-legendary {
    background: rgba(255, 210, 130, 0.22);
    color: rgba(255, 240, 210, 0.95);
  }

  .card-description {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(210, 224, 255, 0.75);
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    color: rgba(210, 220, 250, 0.75);
  }

  .points {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.88);
  }

  .status.unlocked {
    color: rgba(120, 235, 195, 0.88);
  }

  .status.locked {
    font-style: italic;
  }

  @media (max-width: 640px) {
    .achievement-grid {
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    }
  }
</style>
