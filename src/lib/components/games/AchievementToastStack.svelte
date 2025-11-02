<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';
  import ConfettiBurst from '$lib/components/games/ConfettiBurst.svelte';

export type AchievementToastItem = {
  key: string;
  name: string;
  icon: string;
  points: number;
  rarity?: string | null;
};

export let achievements: AchievementToastItem[] = [];
export let slug: string | null = null;
export let gameId: string | null = null;

const dispatch = createEventDispatcher<{ view: { key: string; slug: string | null; gameId: string | null } }>();

  const formatRarity = (value?: string | null) => {
    if (!value) return 'Common';
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const openAchievement = (key: string) => {
    dispatch('view', { key, slug, gameId });
  };

  let triggerId = 0;

  $: if (achievements.length > 0) {
    triggerId = Date.now();
  }
</script>

{#if achievements.length > 0}
  <div class="achievement-toast-stack" aria-live="polite" data-testid="achievement-toast-stack">
    <ConfettiBurst {triggerId} />
    {#each achievements as achievement (achievement.key)}
      <div class="achievement-toast" data-testid={`achievement-toast-${achievement.key}`}>
        <AchievementIcon
          icon={achievement.icon}
          label={achievement.name}
          size={36}
          style="--achievement-icon-size:2.9rem"
        />
        <div class="achievement-copy">
          <p class="achievement-title">{achievement.name}</p>
          <p class="achievement-meta">
            <span class={`rarity rarity-${(achievement.rarity ?? 'common').toLowerCase()}`}>
              {formatRarity(achievement.rarity)}
            </span>
            <span aria-hidden="true">·</span>
            <span class="achievement-points">+{achievement.points} pts</span>
          </p>
        </div>
        <button
          class="achievement-cta"
          type="button"
          data-testid="achievement-toast-view"
          on:click={() => openAchievement(achievement.key)}
        >
          View
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .achievement-toast-stack {
    position: relative;
    display: grid;
    gap: 0.65rem;
    padding-top: 0.4rem;
  }

  .achievement-toast {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.8rem;
    padding: 0.65rem 0.75rem;
    border-radius: 0.95rem;
    background: linear-gradient(135deg, rgba(164, 120, 255, 0.18), rgba(75, 232, 255, 0.12));
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 12px 35px rgba(29, 30, 64, 0.45);
  }

  .achievement-copy {
    flex: 1;
    display: grid;
    gap: 0.15rem;
    color: rgba(241, 242, 255, 0.96);
  }

  .achievement-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }

  .achievement-meta {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.7);
    margin: 0;
  }

  .rarity {
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    background: rgba(255, 255, 255, 0.1);
  }

  .rarity-rare {
    background: rgba(120, 214, 255, 0.18);
    color: rgba(196, 243, 255, 0.95);
  }

  .rarity-epic {
    background: rgba(183, 148, 255, 0.2);
    color: rgba(233, 220, 255, 0.95);
  }

  .rarity-legendary {
    background: rgba(255, 210, 120, 0.22);
    color: rgba(255, 239, 200, 0.95);
  }

  .achievement-points {
    font-weight: 600;
  }

  .achievement-cta {
    background: rgba(255, 255, 255, 0.2);
    border: none;
    color: rgba(15, 22, 45, 0.92);
    font-weight: 600;
    padding: 0.45rem 0.9rem;
    border-radius: 999px;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .achievement-cta:hover,
  .achievement-cta:focus-visible {
    background: rgba(255, 255, 255, 0.35);
    transform: translateY(-1px);
    outline: none;
  }
</style>
