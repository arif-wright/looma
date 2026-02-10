<script lang="ts">
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';
  import type { BondAchievementStatus } from '$lib/companions/bond';

  export let milestones: BondAchievementStatus[] = [];
  export let variant: 'full' | 'compact' = 'full';
  export let maxUnlocked = Infinity;

  const unlocked = () => milestones.filter((item) => item.unlocked);
  $: renderList = variant === 'compact' ? unlocked().slice(0, maxUnlocked) : milestones;
</script>

{#if renderList.length === 0}
  <p class="bond-milestones__empty text-sm text-white/60">No cosmetics unlocked yet. Bond milestones will appear here.</p>
{:else}
  <ul class={`bond-milestones bond-milestones--${variant}`}>
    {#each renderList as item (item.key)}
      <li class={`bond-milestone ${item.unlocked ? 'bond-milestone--unlocked' : ''}`}>
        <AchievementIcon
          icon={item.icon}
          label={item.name}
          size={variant === 'compact' ? 18 : 22}
          class="bond-milestone__icon"
        />
        <div class="bond-milestone__body">
          <div class="bond-milestone__title">{item.name}</div>
          <p class="bond-milestone__desc">{item.description}</p>
          {#if item.unlocked && item.unlocked_at}
            <p class="bond-milestone__meta">Unlocked {new Date(item.unlocked_at).toLocaleDateString()}</p>
          {:else if !item.unlocked && variant === 'full'}
            <p class="bond-milestone__meta">Locked</p>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .bond-milestones {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .bond-milestone {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    padding: 0.65rem;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.015);
  }

  .bond-milestone--unlocked {
    border-color: rgba(99, 179, 237, 0.45);
    background: rgba(99, 179, 237, 0.08);
  }

  .bond-milestone__icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bond-milestone__title {
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
  }

  .bond-milestone__desc {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .bond-milestone__meta {
    margin: 0.15rem 0 0;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .bond-milestones--compact .bond-milestone {
    padding: 0.45rem;
    border-radius: 0.85rem;
  }

  .bond-milestones__empty {
    margin: 0;
  }
</style>
