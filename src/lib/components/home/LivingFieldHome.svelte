<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import CompanionOrb from '$lib/components/home/CompanionOrb.svelte';
  import ActionHalo from '$lib/components/home/ActionHalo.svelte';
  import ConstellationSeed from '$lib/components/home/ConstellationSeed.svelte';
  import MoodSeeds from '$lib/components/home/MoodSeeds.svelte';
  import type { ConstellationConfig, FieldConfig, FieldMode, PrimaryAction } from '$lib/home/fieldEngine';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let fieldConfig: FieldConfig;
  export let companionName: string | null = null;
  export let companionStatus: 'Distant' | 'Synced' | 'Resonant' | 'Steady' = 'Steady';
  export let actionLabel = 'Do this now';
  export let actionIntent: PrimaryAction = 'MICRO_RITUAL';
  export let showMoodSeeds = false;
  export let moodFading = false;
  export let selectedMood: HomeMood | null = null;

  const dispatch = createEventDispatcher<{
    primary: { intent: PrimaryAction };
    mood: { mood: HomeMood };
    orb: Record<string, never>;
    explore: { enabled: boolean };
    seed: { id: string; href: string };
    magnetic: { id: string; href: string };
  }>();

  let exploreMode = false;
  let pressTimer: ReturnType<typeof setTimeout> | null = null;
  let magneticDrag = false;
  let magneticX = fieldConfig.layoutPositions.orb.x;
  let magneticY = fieldConfig.layoutPositions.orb.y;
  let sceneEl: HTMLElement | null = null;
  let showMagHint = true;

  const modeClass: Record<FieldMode, string> = {
    neutral: 'mode-neutral',
    support: 'mode-support',
    settle: 'mode-settle',
    explore: 'mode-explore',
    activate: 'mode-activate',
    recover: 'mode-recover'
  };

  const magneticDistance = (seed: ConstellationConfig) => Math.hypot(seed.x - magneticX, seed.y - magneticY);

  $: nearestSeed = fieldConfig.constellations.reduce<ConstellationConfig | null>((closest, seed) => {
    if (!closest) return seed;
    return magneticDistance(seed) < magneticDistance(closest) ? seed : closest;
  }, null);

  const beginMagnetic = () => {
    magneticDrag = true;
    magneticX = fieldConfig.layoutPositions.orb.x;
    magneticY = fieldConfig.layoutPositions.orb.y;
  };

  const updateMagnetic = (event: PointerEvent) => {
    if (!magneticDrag || !sceneEl) return;
    const rect = sceneEl.getBoundingClientRect();
    const nx = ((event.clientX - rect.left) / rect.width) * 100;
    const ny = ((event.clientY - rect.top) / rect.height) * 100;
    magneticX = Math.max(8, Math.min(92, nx));
    magneticY = Math.max(12, Math.min(88, ny));
  };

  const endMagnetic = () => {
    if (!magneticDrag) return;
    magneticDrag = false;
    if (nearestSeed && magneticDistance(nearestSeed) < 7.5) {
      dispatch('magnetic', { id: nearestSeed.id, href: nearestSeed.href });
    }
    magneticX = fieldConfig.layoutPositions.orb.x;
    magneticY = fieldConfig.layoutPositions.orb.y;
    showMagHint = false;
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
  bind:this={sceneEl}
  class={`living-field ${modeClass[fieldConfig.fieldMode]}`}
  on:pointerdown={beginLongPress}
  on:pointerup={endLongPress}
  on:pointercancel={endLongPress}
>
  <div class="living-field__mesh" aria-hidden="true"></div>
  <div class="living-field__particles" aria-hidden="true"></div>

  {#each fieldConfig.constellations as seed}
    <ConstellationSeed
      id={seed.id}
      label={seed.label}
      description={seed.description}
      icon={seed.icon}
      href={seed.href}
      relevance={seed.relevance}
      x={seed.x}
      y={seed.y}
      {exploreMode}
      {companionName}
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

  <MoodSeeds
    open={showMoodSeeds}
    {selectedMood}
    orbX={fieldConfig.layoutPositions.orb.x}
    orbY={fieldConfig.layoutPositions.orb.y}
    fading={moodFading}
    on:select={(event) => dispatch('mood', event.detail)}
  />

  <ActionHalo
    label={actionLabel}
    intent={actionIntent}
    x={fieldConfig.layoutPositions.halo.x}
    y={fieldConfig.layoutPositions.halo.y}
    orbX={fieldConfig.layoutPositions.orb.x}
    orbY={fieldConfig.layoutPositions.orb.y}
    orbStatus={companionStatus}
    on:activate={(event) => dispatch('primary', event.detail)}
  />

  {#if showMagHint}
    <p class="living-field__hint">Pull toward a glow to act.</p>
  {/if}

  {#if showMoodSeeds}
    <p class="living-field__start">Start here: choose your arrival mood.</p>
  {/if}

  <button
    type="button"
    class={`magnetic-dot ${magneticDrag ? 'magnetic-dot--active' : ''}`}
    style={`left:${magneticX}%; top:${magneticY}%;`}
    on:pointerdown={beginMagnetic}
    on:pointermove={updateMagnetic}
    on:pointerup={endMagnetic}
    on:pointercancel={endMagnetic}
    aria-label="Pull to activate a seed"
  ></button>
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

  .living-field__particles {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      radial-gradient(circle at 24% 18%, rgba(125, 211, 252, 0.2) 0.8px, transparent 1px),
      radial-gradient(circle at 78% 36%, rgba(125, 211, 252, 0.18) 0.8px, transparent 1px),
      radial-gradient(circle at 58% 82%, rgba(45, 212, 191, 0.2) 0.8px, transparent 1px);
    background-size: 220px 220px, 240px 240px, 200px 200px;
    animation: particleDrift 28s linear infinite;
  }

  .living-field__hint {
    position: absolute;
    left: 50%;
    top: 9%;
    transform: translateX(-50%);
    margin: 0;
    color: rgba(186, 230, 253, 0.88);
    font-size: 0.72rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    z-index: 8;
  }

  .living-field__start {
    position: absolute;
    left: 50%;
    top: 16%;
    transform: translateX(-50%);
    margin: 0;
    color: rgba(224, 242, 254, 0.94);
    font-size: 0.82rem;
    font-weight: 600;
    z-index: 8;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  }

  .magnetic-dot {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 1rem;
    height: 1rem;
    border-radius: 999px;
    border: 1px solid rgba(56, 189, 248, 0.65);
    background: rgba(2, 6, 23, 0.86);
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.2), 0 0 14px rgba(56, 189, 248, 0.38);
    z-index: 9;
  }

  .magnetic-dot--active {
    border-color: rgba(45, 212, 191, 0.92);
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.24), 0 0 18px rgba(45, 212, 191, 0.45);
  }

  .mode-neutral { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.16), transparent 62%), #020617; }
  .mode-support { background: radial-gradient(90rem 50rem at 12% -16%, rgba(192, 132, 252, 0.28), transparent 58%), #020617; }
  .mode-support :global(.orb) { animation-duration: 4.2s; }
  .mode-settle { background: radial-gradient(90rem 50rem at 12% -16%, rgba(56, 189, 248, 0.2), transparent 62%), #020617; }
  .mode-settle .living-field__particles { animation-duration: 42s; opacity: 0.65; }
  .mode-explore {
    background:
      linear-gradient(115deg, rgba(14, 116, 144, 0.18), rgba(245, 158, 11, 0.14), rgba(14, 116, 144, 0.18)),
      #020617;
    background-size: 220% 220%;
    animation: sweep 10s ease-in-out infinite;
  }
  .mode-activate { background: radial-gradient(90rem 50rem at 12% -16%, rgba(34, 211, 238, 0.24), transparent 60%), #020617; }
  .mode-activate .living-field__particles { animation-duration: 14s; opacity: 1; }
  .mode-recover { background: radial-gradient(90rem 50rem at 12% -16%, rgba(148, 163, 184, 0.17), transparent 62%), #020617; filter: saturate(0.75); }

  @media (max-width: 640px) {
    .living-field {
      min-height: min(76vh, 38rem);
      border-radius: 1.2rem;
    }
  }

  @keyframes particleDrift {
    from { background-position: 0 0, 0 0, 0 0; }
    to { background-position: 180px 120px, -160px 140px, 120px -170px; }
  }

  @keyframes sweep {
    0%,100% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
  }
</style>
