<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import StatBadge from '$lib/app/components/StatBadge.svelte';
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
  import ProgressBar from '$lib/ui/ProgressBar.svelte';
  import type { RealtimeChannel } from '@supabase/supabase-js';

  type Profile = {
    id: string;
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    level: number;
    xp: number;
    xp_next: number;
    energy: number;
    energy_max: number;
  };

  let loading = true;
  let error: string | null = null;
  let profile: Profile | null = null;
  let bondedCount = 0;

  let supabase: ReturnType<typeof supabaseBrowser> | null = null;
  let channel: RealtimeChannel | null = null;
  let currentUserId: string | null = null;
  let subscribedUserId: string | null = null;
  $: level = profile?.level ?? 1;
  $: xp = profile?.xp ?? 0;
  $: xpNext = Math.max(1, profile?.xp_next ?? 50);

  async function giveXp(amount = 25) {
    try {
      await fetch('/api/xp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount })
      });
    } catch (err) {
      console.error('Failed to grant XP', err);
    }
  }

  async function ensureRealtimeSubscription(userId: string) {
    if (!supabase) return;

    if (channel) {
      if (subscribedUserId === userId) {
        return;
      }
      await supabase.removeChannel(channel);
      channel = null;
    }

    channel = supabase
      .channel('profile-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          if (!profile) return;
          const updated = payload.new as Partial<Profile>;
          profile = { ...profile, ...updated };
        }
      )
      .subscribe();
    subscribedUserId = userId;
  }

  async function loadData() {
    if (!supabase) {
      supabase = supabaseBrowser();
    }

    loading = true;
    error = null;

    try {
      const {
        data: { user },
        error: userError
      } = await supabase!.auth.getUser();

      if (userError) {
        throw userError;
      }

      if (!user) {
        profile = null;
        bondedCount = 0;
        error = 'No session';
        return;
      }

      currentUserId = user.id;

      const [profileResult, bondedResult] = await Promise.all([
        supabase!
          .from('profiles')
          .select('id, display_name, handle, avatar_url, level, xp, xp_next, energy, energy_max')
          .eq('id', user.id)
          .single<Profile>(),
        supabase!
          .from('creatures')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', user.id)
          .eq('bonded', true)
      ]);

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (!profileResult.data) {
        throw new Error('Profile not found');
      }

      profile = profileResult.data;

      if (bondedResult.error) {
        throw bondedResult.error;
      }

      bondedCount = bondedResult.count ?? 0;

      if (currentUserId) {
        await ensureRealtimeSubscription(currentUserId);
      }
    } catch (err) {
      console.error('PlayerSummary load error:', err);
      error = err instanceof Error ? err.message : 'Failed to load profile';
      profile = null;
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    supabase = supabaseBrowser();
    loadData();
  });

  onDestroy(() => {
    if (supabase && channel) {
      supabase.removeChannel(channel);
      channel = null;
      subscribedUserId = null;
    }
  });
</script>

<PanelFrame title="Player Summary" {loading}>
  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" class="retry-button" on:click={loadData}>Retry</button>
    </div>
  {:else if profile}
    <div class="summary-header">
      <div class="identity">
        <img
          src={profile.avatar_url ?? '/avatar-fallback.png'}
          alt="Player avatar"
          class="avatar"
          loading="lazy"
        />
        <div>
          <div class="display-name">{profile.display_name ?? 'Player'}</div>
          {#if profile.handle}
            <div class="handle">@{profile.handle}</div>
          {/if}
        </div>
      </div>
      <div class="level-badge">
        <StatBadge label="Level" value={profile.level} />
        {#if typeof xp === 'number' && typeof xpNext === 'number'}
          <div class="xp-summary">
            <div class="xp-heading">XP to next level</div>
            <ProgressBar value={xp} max={xpNext} ariaLabel="XP progress" />
            <div class="xp-stats">
              {xp} / {xpNext} XP <span aria-hidden="true">•</span> {Math.max(0, xpNext - xp)} to level {level + 1}
            </div>
            <button
              type="button"
              class="xp-dev-action"
              on:click={() => giveXp(25)}
            >
              +25 XP (test)
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div class="summary-body" aria-live="polite">
      <div>
        <div class="metric-label">Energy {profile.energy}/{profile.energy_max}</div>
        <ProgressBar
          value={profile.energy ?? 0}
          max={Math.max(1, profile.energy_max ?? 1)}
          ariaLabel="Energy"
        />
      </div>
      <div class="bonded-badge">
        <StatBadge label="Bonded" value={bondedCount} />
      </div>
    </div>
  {/if}

  <svelte:fragment slot="skeleton">
    <div class="skeleton">
      <div class="skeleton-row"></div>
      <div class="skeleton-bar"></div>
      <div class="skeleton-bar short"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .summary-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1.5rem;
  }

  .identity {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .avatar {
    height: 4rem;
    width: 4rem;
    border-radius: 999px;
    object-fit: cover;
    border: 2px solid rgba(233, 195, 255, 0.28);
    background: rgba(12, 16, 34, 0.65);
  }

  .display-name {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .handle {
    color: rgba(233, 195, 255, 0.72);
    font-size: 0.9rem;
  }

  .level-badge {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .xp-summary {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.4rem;
    width: clamp(200px, 32vw, 260px);
  }

  .xp-heading {
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
    color: rgba(233, 195, 255, 0.78);
  }

  .xp-stats {
    text-align: right;
    letter-spacing: 0.02em;
    font-size: 0.75rem;
    color: rgba(233, 195, 255, 0.78);
  }

  .xp-dev-action {
    background: none;
    border: 0;
    font-size: 0.75rem;
    color: rgba(233, 195, 255, 0.75);
    text-decoration: underline;
    cursor: pointer;
    padding: 0;
  }

  .xp-dev-action:hover,
  .xp-dev-action:focus-visible {
    color: #ffffff;
  }

  .summary-body {
    margin-top: 1.25rem;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.35rem;
    color: rgba(233, 195, 255, 0.78);
  }

  .bonded-badge {
    padding-top: 0.25rem;
  }

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

  .skeleton {
    display: grid;
    gap: 0.75rem;
    animation: pulse 1.3s ease-in-out infinite;
  }

  .skeleton-row {
    height: 4rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.08);
  }

  .skeleton-bar {
    height: 0.75rem;
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.08);
  }

  .skeleton-bar.short {
    width: 70%;
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
    .skeleton {
      animation: none;
    }

    .retry-button {
      text-decoration-thickness: 1px;
    }
  }
</style>
