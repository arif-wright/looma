<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
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

  const MOOD_POINTS: Record<HomeMood, { x: number; y: number }> = {
    calm: { x: 0.6, y: 0.2 },
    heavy: { x: -0.62, y: -0.12 },
    curious: { x: 0.05, y: 0.02 },
    energized: { x: 0.12, y: 0.68 },
    numb: { x: 0.04, y: -0.7 }
  };

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const moodFromPoint = (x: number, y: number): HomeMood => {
    if (y > 0.44) return 'energized';
    if (y < -0.44) return 'numb';
    if (x < -0.24) return 'heavy';
    if (x > 0.28) return 'calm';
    return 'curious';
  };

  const pointFromMood = (mood: HomeMood | null) => {
    if (!mood) return { x: 0, y: 0 };
    return MOOD_POINTS[mood];
  };

  const formatMood = (mood: HomeMood | null) => {
    if (!mood) return 'Unknown';
    return mood.charAt(0).toUpperCase() + mood.slice(1);
  };

  let lensEl: HTMLButtonElement | null = null;
  let dragging = false;
  let pointX = 0;
  let pointY = 0;
  let hoverMood: HomeMood | null = null;

  const syncToSelectedMood = () => {
    if (dragging) return;
    const target = pointFromMood(selectedMood);
    pointX = target.x;
    pointY = target.y;
  };

  $: syncToSelectedMood();
  $: hoverMood = moodFromPoint(pointX, pointY);

  $: orbitCount = clamp(signalsCount, 0, 6);
  $: orbitDots = Array.from({ length: orbitCount }, (_, i) => {
    const angle = ((i + 1) / (orbitCount + 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      left: 50 + Math.cos(angle) * 46,
      top: 50 + Math.sin(angle) * 46,
      delay: i * 70
    };
  });

  $: alignment = clamp(
    100 - Math.round((Math.abs(pointX - 0.1) + Math.abs(pointY - 0.2)) * 50) - (companionStatusLabel === 'Distant' ? 24 : 0),
    18,
    96
  );

  const updateFromPointer = (event: PointerEvent) => {
    if (!lensEl) return;
    const rect = lensEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;

    const dx = event.clientX - cx;
    const dy = event.clientY - cy;

    let nx = dx / radius;
    let ny = -dy / radius;

    const mag = Math.sqrt(nx * nx + ny * ny);
    if (mag > 1) {
      nx /= mag;
      ny /= mag;
    }

    pointX = clamp(nx, -1, 1);
    pointY = clamp(ny, -1, 1);
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', handleUp);
    if (hasCheckedInToday) return;
    dispatch('moodcommit', { mood: moodFromPoint(pointX, pointY) });
  };

  const handleMove = (event: PointerEvent) => {
    if (!dragging) return;
    updateFromPointer(event);
  };

  const handleUp = () => {
    stopDrag();
  };

  const handleDown = (event: PointerEvent) => {
    if (hasCheckedInToday) return;
    dragging = true;
    updateFromPointer(event);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
  };

  onDestroy(() => {
    stopDrag();
  });
</script>

<section class="resonance" aria-label="Resonance Lens">
  <div class="stage">
    <article class="pane pane--you">
      <p class="eyebrow">Arrival Lens</p>
      <h2>How are you arriving?</h2>

      <button
        class={`lens ${dragging ? 'lens--dragging' : ''} ${hasCheckedInToday ? 'lens--locked' : ''}`}
        bind:this={lensEl}
        type="button"
        on:pointerdown={handleDown}
        aria-label={hasCheckedInToday ? 'Mood already checked in for today' : 'Drag to choose your mood'}
      >
        <span class="lens__halo"></span>
        <span class="lens__grid"></span>

        {#each orbitDots as dot}
          <span
            class="orbit-dot"
            style={`left:${dot.left}%; top:${dot.top}%; animation-delay:${dot.delay}ms;`}
            aria-hidden="true"
          ></span>
        {/each}

        <span class="lens__labels">
          <span>Heavy</span>
          <span>Calm</span>
          <span>Energized</span>
          <span>Numb</span>
        </span>

        <span class="lens__marker" style={`left:${50 + pointX * 42}%; top:${50 - pointY * 42}%`} aria-hidden="true"></span>
      </button>

      <p class="arrival-readout">
        <strong>{formatMood(hasCheckedInToday ? selectedMood : hoverMood)}</strong>
        {#if hasCheckedInToday}
          is logged for today.
        {:else}
          release to check in.
        {/if}
      </p>

      {#if attunementLine}
        <p class="attunement" role="status">{attunementLine}</p>
      {/if}
    </article>

    <article class="pane pane--companion">
      <p class="eyebrow">Companion Field</p>
      <h3>{companionName ?? 'Your companion'}</h3>
      <p class="companion-state"><strong>{companionStatusLabel}.</strong> {companionStatusText}</p>

      <div class="bridge-wrap" aria-hidden="true">
        <div class="bridge-track">
          <span class="bridge-current" style={`width:${alignment}%`}></span>
        </div>
        <small>Alignment {alignment}%</small>
      </div>

      <button type="button" class="primary" on:click={() => dispatch('primary', {})}>
        {primaryLabel}
      </button>
      <p class="primary-help">{primaryHelper}</p>
    </article>
  </div>
</section>

<style>
  .resonance {
    border-radius: 1.4rem;
    border: 1px solid rgba(125, 211, 252, 0.2);
    background:
      radial-gradient(70rem 34rem at 18% -30%, rgba(56, 189, 248, 0.2), transparent 62%),
      radial-gradient(52rem 28rem at 120% 100%, rgba(45, 212, 191, 0.18), transparent 60%),
      linear-gradient(168deg, rgba(2, 8, 23, 0.92), rgba(7, 20, 44, 0.9));
    box-shadow: 0 22px 54px rgba(2, 6, 23, 0.4);
    overflow: hidden;
  }

  .stage {
    display: grid;
    gap: 0.9rem;
    padding: 0.95rem;
  }

  .pane {
    border-radius: 1.05rem;
    border: 1px solid rgba(148, 163, 184, 0.18);
    background: rgba(2, 8, 23, 0.46);
    padding: 0.9rem;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(125, 211, 252, 0.88);
  }

  h2 {
    margin: 0.34rem 0 0;
    font-size: 1.1rem;
    color: rgba(248, 250, 252, 0.98);
  }

  h3 {
    margin: 0.34rem 0 0;
    font-size: 1.04rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .lens {
    margin-top: 0.8rem;
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background:
      radial-gradient(circle at 52% 45%, rgba(14, 165, 233, 0.18), rgba(2, 6, 23, 0.72) 55%),
      rgba(2, 8, 23, 0.8);
    overflow: hidden;
    cursor: grab;
  }

  .lens--dragging {
    cursor: grabbing;
  }

  .lens--locked {
    cursor: default;
  }

  .lens__halo {
    position: absolute;
    inset: 8%;
    border-radius: 999px;
    border: 1px solid rgba(56, 189, 248, 0.22);
    box-shadow: inset 0 0 30px rgba(56, 189, 248, 0.12);
  }

  .lens__grid {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.12)) 50% 0 / 1px 100% no-repeat,
      linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.12)) 0 50% / 100% 1px no-repeat;
  }

  .lens__labels {
    position: absolute;
    inset: 0;
    font-size: 0.72rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .lens__labels span:nth-child(1) {
    position: absolute;
    left: 8%;
    top: 48%;
  }

  .lens__labels span:nth-child(2) {
    position: absolute;
    right: 8%;
    top: 48%;
  }

  .lens__labels span:nth-child(3) {
    position: absolute;
    left: 50%;
    top: 8%;
    transform: translateX(-50%);
  }

  .lens__labels span:nth-child(4) {
    position: absolute;
    left: 50%;
    bottom: 8%;
    transform: translateX(-50%);
  }

  .lens__marker {
    position: absolute;
    width: 1.18rem;
    height: 1.18rem;
    margin-left: -0.59rem;
    margin-top: -0.59rem;
    border-radius: 999px;
    border: 1px solid rgba(7, 17, 36, 0.7);
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.98), rgba(56, 189, 248, 0.97));
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.2), 0 0 24px rgba(56, 189, 248, 0.34);
    transition: left 100ms linear, top 100ms linear;
  }

  .orbit-dot {
    position: absolute;
    width: 0.52rem;
    height: 0.52rem;
    margin-left: -0.26rem;
    margin-top: -0.26rem;
    border-radius: 999px;
    background: rgba(125, 211, 252, 0.92);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.5);
    animation: blink 2.4s ease-in-out infinite;
  }

  .arrival-readout {
    margin: 0.65rem 0 0;
    color: rgba(226, 232, 240, 0.9);
    font-size: 0.9rem;
  }

  .attunement {
    margin: 0.45rem 0 0;
    color: rgba(186, 230, 253, 0.96);
    font-size: 0.88rem;
  }

  .companion-state {
    margin: 0.55rem 0 0;
    color: rgba(226, 232, 240, 0.92);
    font-size: 0.88rem;
    line-height: 1.4;
  }

  .bridge-wrap {
    margin-top: 0.82rem;
    display: grid;
    gap: 0.35rem;
  }

  .bridge-track {
    width: 100%;
    height: 0.56rem;
    border-radius: 999px;
    background: rgba(30, 41, 59, 0.95);
    border: 1px solid rgba(148, 163, 184, 0.22);
    overflow: hidden;
  }

  .bridge-current {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(45, 212, 191, 0.96), rgba(56, 189, 248, 0.95));
  }

  small {
    color: rgba(148, 163, 184, 0.96);
    font-size: 0.74rem;
  }

  .primary {
    margin-top: 0.9rem;
    width: 100%;
    min-height: 3rem;
    border: none;
    border-radius: 0.92rem;
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.98), rgba(56, 189, 248, 0.95));
    color: rgba(7, 17, 36, 0.95);
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    box-shadow: 0 12px 24px rgba(45, 212, 191, 0.25);
  }

  .primary-help {
    margin: 0.55rem 0 0;
    color: rgba(203, 213, 225, 0.84);
    font-size: 0.82rem;
  }

  @keyframes blink {
    0%,
    100% {
      opacity: 0.34;
      transform: scale(0.86);
    }
    50% {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (min-width: 1100px) {
    .stage {
      grid-template-columns: 1.15fr 0.85fr;
      align-items: stretch;
      gap: 1rem;
      padding: 1.15rem;
    }

    .pane--companion {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
  }
</style>
