<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import StatBadge from '$lib/app/components/StatBadge.svelte';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  type Earned = {
    achievement: { title: string | null; tier: string | null } | null;
    earned_at: string;
  };

  let loading = true;
  let error: string | null = null;
  let earned: Earned[] = [];
  let lockedCount = 0;

  let supabase = supabaseBrowser();
  let channel: RealtimeChannel | null = null;
  let userId: string | null = null;

  async function subscribeToRealtime(user: string) {
    if (channel) {
      await channel.unsubscribe();
      channel = null;
    }

    channel = supabase
      .channel('achievements-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_achievements', filter: `user_id=eq.${user}` },
        async () => {
          await loadData({ resetChannel: false, showLoader: false });
        }
      )
      .subscribe();
  }

  type LoadOptions = {
    resetChannel?: boolean;
    showLoader?: boolean;
  };

  async function loadData(options: LoadOptions = {}) {
    const { resetChannel = true, showLoader = true } = options;

    if (showLoader) {
      loading = true;
    }
    error = null;

    try {
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) throw new Error('No session');

      userId = user.id;

      const { count: total, error: countError } = await supabase
        .from('achievements')
        .select('id', { count: 'exact', head: true });

      if (countError) throw countError;

      const { data: rows, error: earnedError } = await supabase
        .from('user_achievements')
        .select('earned_at, achievement:achievement_id ( title, tier )')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false })
        .limit(10);

      if (earnedError) throw earnedError;

      earned = (rows as Earned[]) ?? [];
      lockedCount = Math.max(0, (total ?? 0) - earned.length);

      if (resetChannel && userId) {
        await subscribeToRealtime(userId);
      }
    } catch (err) {
      console.error('AchievementsPanel load error:', err);
      error = err instanceof Error ? err.message : 'Failed to load achievements';
    } finally {
      if (showLoader) {
        loading = false;
      }
    }
  }

  onMount(() => {
    loadData({ resetChannel: true, showLoader: true });
  });

  onDestroy(() => {
    if (channel) {
      channel.unsubscribe();
      channel = null;
    }
  });
</script>

<PanelFrame title="Achievements" {loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" class="retry-button" on:click={() => loadData({ resetChannel: true, showLoader: true })}>
        Retry
      </button>
    </div>
  {:else}
    <div class="header">
      <span class="header-label">Recent unlocks</span>
      <StatBadge label="Locked" value={lockedCount} />
    </div>

    {#if earned.length === 0}
      <div class="empty-state">No achievements yet.</div>
    {:else}
      <ul class="achievement-list" aria-live="polite">
        {#each earned as e}
          <li class="achievement-item">
            <div class="achievement-text">
              <div class="title" title={e.achievement?.title ?? 'Achievement'}>
                {e.achievement?.title ?? 'Achievement'}
              </div>
              <div class="tier" title={e.achievement?.tier ?? 'tier'}>
                {e.achievement?.tier ?? 'tier'}
              </div>
            </div>
            <div class="date">{new Date(e.earned_at).toLocaleDateString()}</div>
          </li>
        {/each}
      </ul>
    {/if}
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

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .header-label {
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .empty-state {
    opacity: 0.7;
    font-size: 0.9rem;
  }

  .achievement-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.65rem;
  }

  .achievement-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .achievement-text {
    min-width: 0;
    display: grid;
    gap: 0.15rem;
  }

  .title {
    font-size: 0.95rem;
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tier {
    font-size: 0.8rem;
    opacity: 0.7;
    text-transform: capitalize;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .date {
    font-size: 0.75rem;
    opacity: 0.6;
    flex-shrink: 0;
  }

  .skeleton {
    display: grid;
    gap: 0.6rem;
  }

  .skeleton-row {
    height: 2.5rem;
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
    .skeleton-row {
      animation: none;
    }
  }
</style>
