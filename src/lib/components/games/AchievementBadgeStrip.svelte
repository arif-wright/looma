<script lang="ts">
  import { onMount } from 'svelte';
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';
  import { achievementsUI } from '$lib/achievements/store';

  type StripEntry = {
    key: string;
    name: string;
    icon: string;
    unlockedAt: string | null;
    rarity: string | null;
    points: number;
  };

export let gameSlug: string | null = null;
export let gameId: string | null = null;

  let loading = true;
  let entries: StripEntry[] = [];

  const loadRecent = async () => {
    loading = true;
    try {
      const res = await fetch('/api/achievements/me', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load achievements');
      const payload = (await res.json()) as { unlocks?: StripEntry[] };
      const raw = Array.isArray(payload.unlocks) ? payload.unlocks : [];
      entries = raw
        .slice()
        .sort((a, b) => {
          const aTime = a.unlockedAt ? new Date(a.unlockedAt).valueOf() : 0;
          const bTime = b.unlockedAt ? new Date(b.unlockedAt).valueOf() : 0;
          return bTime - aTime;
        })
        .slice(0, 3)
        .map((item) => ({
          key: item.key,
          name: item.name ?? item.key,
          icon: item.icon ?? 'trophy',
          unlockedAt: item.unlockedAt ?? null,
          rarity: item.rarity ?? 'common',
          points: typeof item.points === 'number' ? item.points : 0
        }));
    } catch (err) {
      console.error('[badge-strip] load failed', err);
      entries = [];
    } finally {
      loading = false;
    }
  };

  onMount(() => {
    void loadRecent();
  });

  const openPanel = (highlight?: string) => {
    if (highlight) {
      achievementsUI.focusAchievement(highlight, {
        slug: gameSlug ?? null,
        gameId: gameId ?? null,
        source: 'profile'
      });
    } else {
      achievementsUI.open({ slug: gameSlug ?? null, gameId: gameId ?? null, source: 'profile' });
    }
  };
</script>

<section class="badge-strip" aria-label="Recent achievements" data-testid="achievement-badge-strip">
  <header>
    <h2>Achievements</h2>
    <button type="button" on:click={() => openPanel()} aria-label="View all achievements">
      View all
    </button>
  </header>

  {#if loading}
    <div class="badge-row loading">
      <div class="badge-placeholder" aria-hidden="true"></div>
      <div class="badge-placeholder" aria-hidden="true"></div>
      <div class="badge-placeholder" aria-hidden="true"></div>
    </div>
  {:else if entries.length === 0}
    <p class="empty">No achievements unlocked yet.</p>
  {:else}
    <ul class="badge-row">
      {#each entries as entry (entry.key)}
        <li>
          <button
            type="button"
            class="badge"
            on:click={() => openPanel(entry.key)}
            data-testid={`achievement-badge-${entry.key}`}
          >
            <AchievementIcon icon={entry.icon} label={entry.name} size={30} />
            <span class="badge-label">{entry.name}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .badge-strip {
    display: grid;
    gap: 0.75rem;
    background: rgba(15, 21, 40, 0.75);
    border: 1px solid rgba(120, 190, 255, 0.22);
    border-radius: 1rem;
    padding: 1rem 1.2rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    color: rgba(228, 234, 255, 0.92);
  }

  header h2 {
    margin: 0;
    font-size: 1rem;
  }

  header button {
    background: none;
    border: none;
    color: rgba(180, 210, 255, 0.9);
    text-decoration: underline;
    cursor: pointer;
    font-size: 0.85rem;
  }

  header button:hover,
  header button:focus-visible {
    color: rgba(230, 240, 255, 0.95);
    outline: none;
  }

  .badge-row {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    gap: 0.85rem;
    align-items: stretch;
  }

  .badge-row.loading {
    width: 100%;
  }

  .badge-placeholder {
    flex: 1;
    height: 70px;
    border-radius: 0.8rem;
    background: linear-gradient(90deg, rgba(196, 210, 255, 0.12), rgba(196, 210, 255, 0.18));
    animation: shimmer 1.2s linear infinite;
  }

  .badge {
    display: grid;
    gap: 0.35rem;
    justify-items: center;
    align-items: center;
    padding: 0.6rem 0.75rem;
    border-radius: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(229, 236, 255, 0.9);
    cursor: pointer;
    min-width: 110px;
    transition: transform 0.15s ease, border 0.15s ease, box-shadow 0.15s ease;
  }

  .badge:hover,
  .badge:focus-visible {
    transform: translateY(-2px);
    border-color: rgba(120, 210, 255, 0.5);
    box-shadow: 0 12px 30px rgba(20, 24, 52, 0.45);
    outline: none;
  }

  .badge-label {
    font-size: 0.78rem;
    text-align: center;
  }

  .empty {
    margin: 0;
    color: rgba(200, 218, 255, 0.75);
    font-size: 0.85rem;
  }

  @keyframes shimmer {
    0% {
      background-position: -120px 0;
    }
    100% {
      background-position: 120px 0;
    }
  }
</style>
