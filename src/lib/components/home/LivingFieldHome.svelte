<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import CompanionOrb from '$lib/components/home/CompanionOrb.svelte';
  import ActionHalo from '$lib/components/home/ActionHalo.svelte';
  import ConstellationSeed from '$lib/components/home/ConstellationSeed.svelte';
  import MoodSeeds from '$lib/components/home/MoodSeeds.svelte';
  import type { FieldConfig, FieldMode, PrimaryAction } from '$lib/home/fieldEngine';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let fieldConfig: FieldConfig;
  export let companionName: string | null = null;
  export let companionStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let actionLabel = 'Do this now';
  export let actionIntent: PrimaryAction = 'MICRO_RITUAL';
  export let showMoodSeeds = false;
  export let selectedMood: HomeMood | null = null;

  const dispatch = createEventDispatcher<{
    primary: { intent: PrimaryAction };
    mood: { mood: HomeMood };
    orb: Record<string, never>;
    explore: { enabled: boolean };
    seed: { id: string; href: string };
  }>();

  let exploreMode = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;

  const modeClass: Record<FieldMode, string> = {
    neutral: 'mode-neutral',
    support: 'mode-support',
    settle: 'mode-settle',
    explore: 'mode-explore',
    activate: 'mode-activate',
    recover: 'mode-recover'
  };

  const beginLongPress = () => {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      exploreMode = !exploreMode;
      dispatch('explore', { enabled: exploreMode });
      pressTimer = null;
    }, 540);
  };

  const endLongPress = () => {
    if (!pressTimer) return;
    clearTimeout(pressTimer);
    pressTimer = null;
  };

  onDestroy(() => {
    if (pressTimer) clearTimeout(pressTimer);
  });
</script>

<section
  class={`living-field ${modeClass[fieldConfig.fieldMode]}`}
  on:pointerdown={beginLongPress}
  on:pointerup={endLongPress}
  on:pointercancel={endLongPress}
>
  <div class="living-field__mesh" aria-hidden="true"></div>

  {#each fieldConfig.constellations as seed}
    <ConstellationSeed
      id={seed.id}
      label={seed.label}
      href={seed.href}
      relevance={seed.relevance}
      x={seed.x}
      y={seed.y}
      {exploreMode}
      on:follow={(event) => dispatch('seed', event.detail)}
    />
  {/each}

  <CompanionOrb
    name={companionName}
    status={companionStatus}
    x={fieldConfig.layoutPositions.orb.x}
    y={fieldConfig.layoutPositions.orb.y}
    on:open={() => dispatch('orb', {})}
  />

  <MoodSeeds open={showMoodSeeds} {selectedMood} on:select={(event) => dispatch('mood', event.detail)} />

  <ActionHalo
    label={actionLabel}
    intent={actionIntent}
    x={fieldConfig.layoutPositions.halo.x}
    y={fieldConfig.layoutPositions.halo.y}
    on:activate={(event) => dispatch('primary', event.detail)}
  />
</section>

<style>
  .living-field {
    position: relative;
    min-height: min(78vh, 42rem);
    border-radius: 1.5rem;
    border: 1px solid rgba(125, 211, 252, 0.24);
    overflow: hidden;
    background: radial-gradient(90rem 52rem at 10% -20%, rgba(56, 189, 248, 0.16), transparent 62%), #020617;
    box-shadow: 0 30px 60px rgba(2, 6, 23, 0.44);
    user-select: none;
    touch-action: manipulation;
  }

  .living-field__mesh {
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px);
    background-size: 1.1rem 1.1rem;
    mask-image: radial-gradient(circle at center, black 32%, transparent 78%);
    pointer-events: none;
  }

  .mode-neutral { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.16), transparent 62%), #020617; }
  .mode-support { background: radial-gradient(90rem 50rem at 12% -16%, rgba(244, 114, 182, 0.22), transparent 62%), #020617; }
  .mode-settle { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.24), transparent 62%), #020617; }
  .mode-explore { background: radial-gradient(90rem 50rem at 12% -16%, rgba(245, 158, 11, 0.21), transparent 62%), #020617; }
  .mode-activate { background: radial-gradient(90rem 50rem at 12% -16%, rgba(52, 211, 153, 0.22), transparent 62%), #020617; }
  .mode-recover { background: radial-gradient(90rem 50rem at 12% -16%, rgba(167, 139, 250, 0.22), transparent 62%), #020617; }

  @media (max-width: 640px) {
    .living-field {
      min-height: min(76vh, 38rem);
      border-radius: 1.2rem;
    }
  }
</style>
