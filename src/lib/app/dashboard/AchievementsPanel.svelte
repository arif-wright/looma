<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';

  type Tier = 'bronze' | 'silver' | 'gold' | 'mythic' | null;
  type AchievementRow = {
    id: string;
    created_at: string;
    achievement_id: string;
    key: string;
    name: string;
    tier: Tier;
  };

  let loading = true;
  let error: string | null = null;
  let items: AchievementRow[] = [];
  let supabase: ReturnType<typeof supabaseBrowser> | null = null;
  let channel: ReturnType<ReturnType<typeof supabaseBrowser>['channel']> | null = null;
  let userId: string | null = null;

  async function fetchAchievements() {
    if (!supabase) supabase = supabaseBrowser();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      items = [];
      return;
    }

    userId = user.id;

    const { data, error: err } = await supabase.rpc('get_my_achievements', { p_limit: 12 });

    if (err) throw err;

    items = (data as AchievementRow[]) ?? [];
  }

  async function loadInitial() {
    loading = true;
    error = null;
    try {
      await fetchAchievements();
      setupRealtime();
    } catch (err: any) {
      console.error('loadAchievements error', err);
      error = err?.message ?? 'Failed to load achievements';
    } finally {
      loading = false;
    }
  }

  function setupRealtime() {
    if (!supabase || !userId) return;

    channel?.unsubscribe?.();
    channel = supabase
      .channel(`ua-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_achievements', filter: `user_id=eq.${userId}` },
        async () => {
          try {
            await fetchAchievements();
          } catch (err) {
            console.error('realtime achievements load failure', err);
          }
        }
      )
      .subscribe();
  }

  onMount(() => {
    loadInitial();
  });

  onDestroy(() => {
    if (supabase && channel) {
      supabase.removeChannel(channel);
    } else {
      channel?.unsubscribe?.();
    }
  });

  const tierClass = (tier: Tier) => {
    switch ((tier ?? 'bronze').toLowerCase()) {
      case 'gold':
        return 'tier gold';
      case 'silver':
        return 'tier silver';
      case 'mythic':
        return 'tier mythic';
      case 'bronze':
      default:
        return 'tier bronze';
    }
  };
</script>

<PanelFrame title="Achievements" loading={loading}>
  {#if error}
    <div class="panel-message error">
      <span>{error}</span>
      <button type="button" on:click={loadInitial}>Retry</button>
    </div>
  {:else if items.length === 0}
    <div class="panel-message">No achievements yet.</div>
  {:else}
    <ul class="achievements" aria-live="polite">
      {#each items as item (item.id)}
        <li class="achievement-card" data-tier={item.tier ?? 'bronze'}>
          <div class="head">
            <span class="name">{item.name ?? 'Achievement unlocked'}</span>
            <span class="date">{new Date(item.created_at).toLocaleDateString()}</span>
          </div>
          <div class={tierClass(item.tier ?? 'bronze')}>
            {(item.tier ?? 'bronze').toUpperCase()}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</PanelFrame>

<style>
  .panel-message {
    padding: 1rem 1.5rem;
    font-size: 0.9rem;
    opacity: 0.75;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .panel-message.error {
    color: #fca5a5;
  }

  .panel-message.error button {
    background: none;
    border: 0;
    color: rgba(233, 195, 255, 0.9);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0;
  }

  .panel-message.error button:hover,
  .panel-message.error button:focus-visible {
    color: #ffffff;
  }

  .achievements {
    display: grid;
    gap: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    padding: 1rem 1.5rem 1.25rem;
    margin: 0;
    list-style: none;
  }

  .achievement-card {
    border-radius: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.04);
    padding: 0.85rem;
    display: grid;
    gap: 0.6rem;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .achievement-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
  }

  .head {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    align-items: baseline;
  }

  .name {
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    font-size: 0.72rem;
    opacity: 0.65;
    flex-shrink: 0;
  }

  .tier {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    font-weight: 600;
    text-transform: uppercase;
    width: fit-content;
  }

  .tier.bronze {
    background: rgba(205, 127, 50, 0.16);
    color: rgba(255, 236, 209, 0.9);
    border: 1px solid rgba(205, 127, 50, 0.28);
  }

  .tier.silver {
    background: rgba(180, 188, 198, 0.18);
    color: rgba(236, 244, 255, 0.92);
    border: 1px solid rgba(200, 210, 222, 0.3);
  }

  .tier.gold {
    background: rgba(255, 215, 0, 0.18);
    color: rgba(255, 244, 196, 0.95);
    border: 1px solid rgba(255, 215, 0, 0.34);
  }

  .tier.mythic {
    background: rgba(232, 121, 249, 0.2);
    color: rgba(255, 229, 255, 0.92);
    border: 1px solid rgba(232, 121, 249, 0.35);
  }

  @media (prefers-reduced-motion: reduce) {
    .achievement-card {
      transition: none;
    }
  }
</style>
