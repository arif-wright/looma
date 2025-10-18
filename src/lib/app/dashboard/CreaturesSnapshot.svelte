<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';

  type Row = {
    id: string;
    name: string | null;
    species: { name: string } | null;
  };

  let loading = true;
  let error: string | null = null;
  let rows: Row[] = [];
  const dispatch = createEventDispatcher<{ 'open-creature': { id: string } }>();

  async function loadData() {
    loading = true;
    error = null;
    rows = [];

    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('No session');

      const { data, error: queryError } = await supabase
        .from('creatures')
        .select('id, name, species:species_id ( name )')
        .eq('owner_id', user.id)
        .eq('bonded', true)
        .order('updated_at', { ascending: false })
        .limit(3);

      if (queryError) throw queryError;

      rows = (data as Row[]) ?? [];
    } catch (err) {
      console.error('CreaturesSnapshot load error:', err);
      error = err instanceof Error ? err.message : 'Failed to load creatures';
    } finally {
      loading = false;
    }
  }

  onMount(loadData);

  function openDetail(id: string) {
    dispatch('open-creature', { id });
  }
</script>

<PanelFrame title="Creatures Snapshot" {loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" class="retry-button" on:click={loadData}>Retry</button>
    </div>
  {:else if rows.length === 0}
    <div class="empty-state">No bonded creatures yet.</div>
  {:else}
    <ul class="creature-list" aria-live="polite">
      {#each rows as row}
        <li>
          <button
            type="button"
            class="creature-card"
            on:click={() => openDetail(row.id)}
          >
            <div class="creature-avatar" aria-hidden="true">
              <span class="spark">✨</span>
            </div>
            <div class="creature-text">
              <div class="creature-name" title={row.name ?? 'Unnamed'}>{row.name ?? 'Unnamed'}</div>
              <div class="creature-species" title={row.species?.name ?? 'Unknown species'}>
                {row.species?.name ?? 'Unknown species'}
              </div>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
  <svelte:fragment slot="skeleton">
    <div class="skeleton">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.9rem;
    color: #fca5a5;
  }

  .retry-button {
    background: none;
    border: 0;
    color: rgba(233, 195, 255, 0.85);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }

  .retry-button:hover,
  .retry-button:focus-visible {
    color: #ffffff;
  }

  .empty-state {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .creature-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.85rem;
  }

  .creature-card {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.03);
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
    text-align: left;
  }

  .creature-card:hover,
  .creature-card:focus-visible {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(233, 195, 255, 0.12);
    transform: translateY(-1px);
  }

  .creature-avatar {
    height: 2.5rem;
    width: 2.5rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(233, 195, 255, 0.18);
    display: grid;
    place-items: center;
    transition: transform 0.2s ease;
  }

  .creature-card:hover .creature-avatar,
  .creature-card:focus-visible .creature-avatar {
    transform: scale(1.05);
  }

  .spark {
    font-size: 1.2rem;
  }

  .creature-text {
    min-width: 0;
    display: grid;
    gap: 0.2rem;
  }

  .creature-name {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .creature-species {
    font-size: 0.8rem;
    opacity: 0.75;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .skeleton {
    display: grid;
    gap: 0.75rem;
  }

  .skeleton-row {
    height: 2.75rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.08);
    animation: pulse 1.3s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .creature-card,
    .skeleton-row {
      transition: none;
      animation: none;
    }
  }
</style>
