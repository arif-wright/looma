<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import StatBadge from '$lib/app/components/StatBadge.svelte';

  type Earned = {
    earned_at: string;
    achievement: { title: string; tier: string } | null;
  };

  let loading = true;
  let error: string | null = null;
  let earned: Earned[] = [];
  let lockedCount = 0;
  let channel: any;

  const tierStyle = (tier?: string) => {
    switch ((tier ?? '').toLowerCase()) {
      case 'gold':
        return 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-400/20';
      case 'silver':
        return 'bg-slate-300/15 text-slate-200 ring-1 ring-slate-200/20';
      case 'bronze':
        return 'bg-amber-700/20 text-amber-300 ring-1 ring-amber-300/20';
      case 'mythic':
        return 'bg-fuchsia-500/15 text-fuchsia-300 ring-1 ring-fuchsia-400/20';
      default:
        return 'bg-white/10 text-white/80 ring-1 ring-white/10';
    }
  };

  async function loadData() {
    loading = true;
    error = null;
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('No session');

      const { count: total } = await supabase
        .from('achievements')
        .select('id', { count: 'exact', head: true });

      const { data } = await supabase
        .from('user_achievements')
        .select('earned_at, achievement:achievement_id ( title, tier )')
        .eq('user_id', user.id)
        .order('earned_at', { ascending: false })
        .limit(12);

      earned = (data as Earned[]) ?? [];
      lockedCount = Math.max(0, (total ?? 0) - earned.length);

      channel?.unsubscribe?.();
      channel = supabase
        .channel('achievements-rt')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'user_achievements', filter: `user_id=eq.${user.id}` },
          async () => {
            await loadData();
          }
        )
        .subscribe();
    } catch (e: any) {
      console.error(e);
      error = e?.message ?? 'Failed to load achievements';
    } finally {
      loading = false;
    }
  }

  onMount(loadData);
  onDestroy(() => {
    try {
      channel?.unsubscribe?.();
    } catch {}
  });
</script>

<PanelFrame title="Achievements" loading={loading}>
  <div class="panel-surface">
    <div class="ribbon" aria-hidden="true"></div>

    <div class="panel-header">
      <div class="header-label">Recent unlocks</div>
      <StatBadge label="Locked" value={lockedCount} />
    </div>

    {#if error}
      <div class="error-banner">
        <span>{error}</span>
        <button class="retry-button" on:click={loadData}>Retry</button>
      </div>
    {:else if earned.length === 0}
      <div class="empty-state">No achievements yet.</div>
    {:else}
      <ul class="achievement-grid" aria-live="polite">
        {#each earned as e}
          <li class="achievement-card">
            <div class="card-body">
              <div class="coin" aria-hidden="true">🏅</div>
              <div class="card-text">
                <div class="title-row">
                  <div class="title" title={e.achievement?.title ?? 'Achievement'}>
                    {e.achievement?.title ?? 'Achievement'}
                  </div>
                  <span class={`tier-chip ${tierStyle(e.achievement?.tier)}`}>
                    {e.achievement?.tier ?? 'tier'}
                  </span>
                </div>
                <div class="date">{new Date(e.earned_at).toLocaleDateString()}</div>
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <svelte:fragment slot="skeleton">
    <div class="skeleton-grid">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .panel-surface {
    position: relative;
    border-radius: 1rem;
    padding: 0.85rem;
    background: rgba(12, 16, 32, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }

  .ribbon {
    position: absolute;
    inset: -100% -30% 60%  -30%;
    background: linear-gradient(120deg, rgba(139, 92, 246, 0.35), rgba(236, 72, 153, 0.3), rgba(34, 211, 238, 0.35));
    filter: blur(48px);
    pointer-events: none;
  }

  .panel-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .header-label {
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .error-banner {
    margin-top: 0.75rem;
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
    margin-top: 0.75rem;
    opacity: 0.7;
    font-size: 0.95rem;
  }

  .achievement-grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.85rem;
    margin: 0.75rem 0 0;
    padding: 0;
    list-style: none;
  }

  @media (min-width: 768px) {
    .achievement-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .achievement-card {
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.05);
    background: rgba(255, 255, 255, 0.04);
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .achievement-card:hover {
    background: rgba(255, 255, 255, 0.07);
    transform: translateY(-1px);
  }

  .card-body {
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    padding: 0.75rem;
  }

  .coin {
    height: 2.4rem;
    width: 2.4rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.12);
    display: grid;
    place-items: center;
    font-size: 1.05rem;
    transition: transform 0.2s ease;
  }

  .achievement-card:hover .coin {
    transform: scale(1.06);
  }

  .card-text {
    min-width: 0;
    display: grid;
    gap: 0.25rem;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  .title {
    font-size: 0.98rem;
    font-weight: 600;
    color: rgba(235, 238, 255, 0.92);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tier-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.63rem;
    font-weight: 600;
  }

  .date {
    font-size: 0.72rem;
    opacity: 0.65;
  }

  .skeleton-grid {
    display: grid;
    grid-template-columns: repeat(1, minmax(0, 1fr));
    gap: 0.8rem;
  }

  @media (min-width: 768px) {
    .skeleton-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .skeleton-card {
    height: 4rem;
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
    .achievement-card,
    .coin,
    .skeleton-card {
      transition: none;
      animation: none;
    }
  }
</style>
