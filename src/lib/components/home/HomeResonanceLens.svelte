<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';

  export let selectedMood: HomeMood | null = null;
  export let hasCheckedInToday = false;
  export let attunementLine: string | null = null;
  export let companionName: string | null = null;
  export let companionStatusLabel = 'Steady';
  export let companionStatusText = 'Your companion is with you.';
  export let primaryLabel = 'Do this now';
  export let primaryHelper = 'One small action to keep your bond alive.';
  export let signalsCount = 0;

  const dispatch = createEventDispatcher<{
    moodcommit: { mood: HomeMood };
    primary: Record<string, never>;
  }>();

  type NodeDef = {
    mood: HomeMood;
    label: string;
    angleDeg: number;
    glow: string;
    axis: string;
  };

  const MOOD_NODES: NodeDef[] = [
    { mood: 'energized', label: 'Energized', angleDeg: -88, glow: '#34d399', axis: 'Activation' },
    { mood: 'calm', label: 'Calm', angleDeg: -18, glow: '#38bdf8', axis: 'Settling' },
    { mood: 'curious', label: 'Curious', angleDeg: 52, glow: '#f59e0b', axis: 'Exploration' },
    { mood: 'numb', label: 'Numb', angleDeg: 132, glow: '#a78bfa', axis: 'Recovery' },
    { mood: 'heavy', label: 'Heavy', angleDeg: 202, glow: '#f472b6', axis: 'Support' }
  ];

  const BRANCH_COPY: Record<HomeMood, string[]> = {
    energized: ['Channel momentum', 'Take a decisive step', 'Convert energy to care'],
    calm: ['Hold the rhythm', 'Anchor with consistency', 'Strengthen the bond softly'],
    curious: ['Follow one thread', 'Ask one better question', 'Explore without pressure'],
    numb: ['Start tiny', 'Regulate first', 'Reconnect through one signal'],
    heavy: ['Reduce load', 'Choose gentle action', 'Request support from your circle']
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const titleCase = (mood: HomeMood | null) => {
    if (!mood) return 'Unknown';
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  };

  let focusMood: HomeMood | null = null;
  let expandedMood: HomeMood | null = null;

  $: activeMood = selectedMood ?? focusMood ?? 'curious';
  $: effectiveMood = hasCheckedInToday ? selectedMood : activeMood;
  $: alignmentPenalty = companionStatusLabel === 'Distant' ? 24 : 8;
  $: signalsLoad = clamp(signalsCount, 0, 9);
  $: alignment = clamp(92 - alignmentPenalty + (effectiveMood === 'calm' ? 6 : 0) - signalsLoad * 2, 18, 98);
  $: branches = expandedMood ? BRANCH_COPY[expandedMood] : BRANCH_COPY[activeMood];

  $: graphNodes = MOOD_NODES.map((node) => {
    const rad = (node.angleDeg * Math.PI) / 180;
    const radius = 39;
    const x = 50 + Math.cos(rad) * radius;
    const y = 50 + Math.sin(rad) * radius;
    const isActive = effectiveMood === node.mood;
    const isFocused = focusMood === node.mood;
    const relevance = clamp(
      (isActive ? 0.98 : 0.44) +
        (node.mood === 'heavy' && companionStatusLabel === 'Distant' ? 0.22 : 0) +
        (node.mood === 'calm' && companionStatusLabel !== 'Distant' ? 0.1 : 0) +
        (isFocused ? 0.16 : 0),
      0.28,
      1
    );

    return {
      ...node,
      x,
      y,
      isActive,
      isFocused,
      relevance,
      strokeWidth: 0.8 + relevance * 2.5,
      opacity: 0.22 + relevance * 0.78
    };
  });

  $: orbitCount = clamp(signalsCount, 0, 8);
  $: signalOrbits = Array.from({ length: orbitCount }, (_, i) => {
    const angle = ((i + 1) / (orbitCount + 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      left: 50 + Math.cos(angle) * 47,
      top: 50 + Math.sin(angle) * 47,
      delay: i * 110,
      scale: 0.7 + (i % 3) * 0.1
    };
  });

  const handleMood = (mood: HomeMood) => {
    expandedMood = mood;
    if (hasCheckedInToday) return;
    dispatch('moodcommit', { mood });
  };
</script>

<section class="resonance" aria-label="Neural home interface">
  <div class="resonance__stage">
    <div class="graph" role="group" aria-label="Mood network">
      <svg class="graph__edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {#each graphNodes as node}
          <line
            x1="50"
            y1="50"
            x2={node.x}
            y2={node.y}
            stroke={node.glow}
            stroke-width={node.strokeWidth}
            stroke-linecap="round"
            opacity={node.opacity}
            class:edge-active={node.isActive}
          />
        {/each}
      </svg>

      <button type="button" class="nucleus" on:click={() => dispatch('primary', {})}>
        <span class="nucleus__eyebrow">Nucleus</span>
        <strong>{primaryLabel}</strong>
        <small>{primaryHelper}</small>
      </button>

      {#each graphNodes as node}
        <button
          type="button"
          class={`node ${node.isActive ? 'node--active' : ''} ${node.isFocused ? 'node--focus' : ''}`}
          style={`left:${node.x}%; top:${node.y}%; --node-glow:${node.glow};`}
          on:mouseenter={() => (focusMood = node.mood)}
          on:mouseleave={() => (focusMood = null)}
          on:focus={() => (focusMood = node.mood)}
          on:blur={() => (focusMood = null)}
          on:click={() => handleMood(node.mood)}
          aria-pressed={effectiveMood === node.mood}
          aria-label={`Select mood ${node.label}`}
        >
          <span class="node__label">{node.label}</span>
          <small>{node.axis}</small>
        </button>
      {/each}

      {#each signalOrbits as orbit}
        <span
          class="signal"
          style={`left:${orbit.left}%; top:${orbit.top}%; animation-delay:${orbit.delay}ms; transform:scale(${orbit.scale});`}
          aria-hidden="true"
        ></span>
      {/each}
    </div>

    <aside class="telemetry">
      <p class="telemetry__eyebrow">Companion Link</p>
      <h3>{companionName ?? 'Companion'}</h3>
      <p class="telemetry__copy"><strong>{companionStatusLabel}.</strong> {companionStatusText}</p>

      <div class="meter" aria-hidden="true">
        <span class="meter__bar" style={`width:${alignment}%`}></span>
      </div>
      <p class="telemetry__metric">Alignment {alignment}%</p>

      <p class="telemetry__status">
        <strong>{titleCase(effectiveMood)}</strong>
        {#if hasCheckedInToday}
          is synced for today.
        {:else}
          is your current vector.
        {/if}
      </p>

      {#if attunementLine}
        <p class="attunement" role="status">{attunementLine}</p>
      {/if}

      <div class="branches" aria-label="Suggested pathways">
        {#each branches as branch}
          <span>{branch}</span>
        {/each}
      </div>
    </aside>
  </div>
</section>

<style>
  .resonance {
    border: 1px solid rgba(100, 116, 139, 0.26);
    border-radius: 1.4rem;
    background:
      radial-gradient(62rem 32rem at 0% -28%, rgba(56, 189, 248, 0.2), transparent 60%),
      radial-gradient(52rem 30rem at 120% 118%, rgba(167, 139, 250, 0.22), transparent 62%),
      linear-gradient(170deg, rgba(2, 6, 23, 0.98), rgba(4, 12, 32, 0.96));
    box-shadow: 0 24px 56px rgba(2, 6, 23, 0.48);
    overflow: hidden;
  }

  .resonance__stage {
    display: grid;
    gap: 0.9rem;
    padding: 0.95rem;
  }

  .graph {
    position: relative;
    min-height: min(84vw, 23rem);
    border-radius: 1.15rem;
    border: 1px solid rgba(56, 189, 248, 0.2);
    background:
      radial-gradient(circle at 50% 50%, rgba(15, 118, 110, 0.12), transparent 42%),
      rgba(2, 8, 23, 0.66);
    overflow: hidden;
  }

  .graph::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(56, 189, 248, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(56, 189, 248, 0.07) 1px, transparent 1px);
    background-size: 1.05rem 1.05rem;
    mask-image: radial-gradient(circle at center, black 40%, transparent 76%);
  }

  .graph__edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.3));
  }

  .graph :global(.edge-active) {
    animation: pulseEdge 1600ms ease-in-out infinite;
  }

  .nucleus {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 42%;
    min-width: 10.5rem;
    max-width: 14rem;
    aspect-ratio: 1 / 1;
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.44);
    background:
      radial-gradient(circle at 30% 28%, rgba(34, 211, 238, 0.42), rgba(8, 47, 73, 0.84) 60%),
      rgba(2, 6, 23, 0.92);
    color: rgba(240, 249, 255, 0.98);
    display: grid;
    gap: 0.2rem;
    place-content: center;
    text-align: center;
    box-shadow:
      inset 0 0 24px rgba(45, 212, 191, 0.3),
      0 0 0 4px rgba(45, 212, 191, 0.12),
      0 14px 34px rgba(8, 15, 30, 0.56);
    z-index: 2;
  }

  .nucleus__eyebrow {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(186, 230, 253, 0.86);
  }

  .nucleus strong {
    font-size: 0.92rem;
    line-height: 1.2;
    padding: 0 0.7rem;
  }

  .nucleus small {
    font-size: 0.74rem;
    color: rgba(186, 230, 253, 0.82);
    padding: 0 0.68rem;
    line-height: 1.3;
  }

  .node {
    position: absolute;
    width: 4.7rem;
    min-height: 3.6rem;
    margin-left: -2.35rem;
    margin-top: -1.8rem;
    border-radius: 0.9rem;
    border: 1px solid color-mix(in srgb, var(--node-glow) 35%, #0f172a);
    background: linear-gradient(158deg, rgba(15, 23, 42, 0.95), rgba(2, 6, 23, 0.95));
    color: rgba(226, 232, 240, 0.95);
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.1rem;
    z-index: 3;
    box-shadow: 0 8px 22px rgba(2, 6, 23, 0.45);
    transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .node__label {
    font-size: 0.75rem;
    font-weight: 700;
  }

  .node small {
    font-size: 0.64rem;
    color: rgba(148, 163, 184, 0.96);
  }

  .node--focus,
  .node:focus-visible {
    transform: translateY(-3px) scale(1.03);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--node-glow) 26%, transparent), 0 14px 24px rgba(2, 6, 23, 0.55);
    border-color: color-mix(in srgb, var(--node-glow) 62%, #0f172a);
    outline: none;
  }

  .node--active {
    border-color: color-mix(in srgb, var(--node-glow) 78%, #0f172a);
    box-shadow:
      0 0 0 2px color-mix(in srgb, var(--node-glow) 34%, transparent),
      0 0 26px color-mix(in srgb, var(--node-glow) 22%, transparent);
  }

  .signal {
    position: absolute;
    width: 0.46rem;
    height: 0.46rem;
    margin-left: -0.23rem;
    margin-top: -0.23rem;
    border-radius: 999px;
    background: rgba(34, 211, 238, 0.95);
    box-shadow: 0 0 10px rgba(34, 211, 238, 0.52);
    animation: signalBlink 2.8s ease-in-out infinite;
    z-index: 1;
  }

  .telemetry {
    border-radius: 1.05rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: linear-gradient(165deg, rgba(2, 8, 23, 0.82), rgba(8, 28, 48, 0.72));
    padding: 0.9rem;
  }

  .telemetry__eyebrow {
    margin: 0;
    font-size: 0.69rem;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: rgba(125, 211, 252, 0.88);
  }

  h3 {
    margin: 0.32rem 0 0;
    font-size: 1.04rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .telemetry__copy {
    margin: 0.6rem 0 0;
    color: rgba(226, 232, 240, 0.92);
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .meter {
    margin-top: 0.75rem;
    height: 0.58rem;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.26);
    background: rgba(30, 41, 59, 0.92);
    overflow: hidden;
  }

  .meter__bar {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(45, 212, 191, 0.98), rgba(56, 189, 248, 0.94), rgba(167, 139, 250, 0.92));
  }

  .telemetry__metric {
    margin: 0.38rem 0 0;
    color: rgba(148, 163, 184, 0.96);
    font-size: 0.74rem;
  }

  .telemetry__status {
    margin: 0.66rem 0 0;
    font-size: 0.87rem;
    color: rgba(226, 232, 240, 0.96);
  }

  .attunement {
    margin: 0.52rem 0 0;
    color: rgba(186, 230, 253, 0.96);
    font-size: 0.86rem;
    line-height: 1.45;
  }

  .branches {
    margin-top: 0.72rem;
    display: grid;
    gap: 0.38rem;
  }

  .branches span {
    border-radius: 0.66rem;
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.7);
    padding: 0.42rem 0.55rem;
    font-size: 0.76rem;
    color: rgba(203, 213, 225, 0.95);
  }

  @keyframes pulseEdge {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @keyframes signalBlink {
    0%,
    100% {
      opacity: 0.22;
    }
    50% {
      opacity: 1;
    }
  }

  @media (min-width: 860px) {
    .resonance__stage {
      grid-template-columns: 1.25fr 0.75fr;
      padding: 1.05rem;
      gap: 1rem;
    }

    .graph {
      min-height: min(56vw, 33rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .signal,
    .graph :global(.edge-active) {
      animation: none;
    }

    .node {
      transition: none;
    }
  }
</style>
