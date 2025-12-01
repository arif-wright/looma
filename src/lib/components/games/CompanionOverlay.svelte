<script lang="ts">
  export let mood: { state: string; intensity: number } | null = null;
  export let visible = true;

  let reaction: string | null = null;
  let reactionTimer: ReturnType<typeof setTimeout> | null = null;

  const clampIntensity = (value: number | undefined | null) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0.3;
    return Math.min(1, Math.max(0, value));
  };

  const stateTone: Record<string, string> = {
    calm: '#38bdf8',
    excited: '#ec4899',
    focused: '#fbbf24',
    anxious: '#14b8a6',
    tired: '#64748b'
  };

  $: currentState = mood?.state ?? 'neutral';
  $: intensity = clampIntensity(mood?.intensity);
  $: tone = stateTone[currentState] ?? '#94a3b8';
  $: overlayClass = `state-${currentState}${reaction ? ` react-${reaction}` : ''}`;

  export function triggerCompanionReact(type: string) {
    if (!type) return;
    reaction = type;
    if (reactionTimer) clearTimeout(reactionTimer);
    reactionTimer = setTimeout(() => {
      reaction = null;
      reactionTimer = null;
    }, 600);
  }
</script>

{#if visible}
  <div class={`companion-overlay ${overlayClass}`} aria-hidden="true">
    <div class="pulse" style={`--tone:${tone}; --intensity:${intensity}`}></div>
    <div class="core" style={`--tone:${tone}; --intensity:${intensity}`}></div>
  </div>
{/if}

<style>
  .companion-overlay {
    position: absolute;
    inset: auto 1.5rem 1.5rem auto;
    width: 72px;
    height: 72px;
    pointer-events: none;
    z-index: 5;
    display: grid;
    place-items: center;
  }

  .companion-overlay .pulse,
  .companion-overlay .core {
    border-radius: 50%;
    transition: transform 200ms ease, opacity 200ms ease, box-shadow 200ms ease;
  }

  .companion-overlay .pulse {
    width: 100%;
    height: 100%;
    background: radial-gradient(circle, color-mix(in srgb, var(--tone) 65%, transparent), transparent);
    opacity: calc(0.35 + var(--intensity) * 0.4);
    animation: overlay-breathe 2400ms ease-in-out infinite;
  }

  .companion-overlay .core {
    width: 44px;
    height: 44px;
    background: color-mix(in srgb, var(--tone) 80%, #0f172a);
    box-shadow: 0 0 16px color-mix(in srgb, var(--tone) 55%, transparent);
    opacity: calc(0.75 + var(--intensity) * 0.2);
    transform: scale(calc(0.9 + var(--intensity) * 0.1));
  }

  .companion-overlay.state-anxious .pulse {
    animation: overlay-jitter 1800ms ease-in-out infinite;
  }

  .companion-overlay.state-excited .core {
    box-shadow: 0 0 20px rgba(236, 72, 153, 0.5);
  }

  .companion-overlay.state-tired .core {
    opacity: calc(0.5 + var(--intensity) * 0.1);
  }

  .companion-overlay.react-warning .core,
  .companion-overlay.react-warning .pulse {
    animation: overlay-react-pulse 500ms ease-out;
  }

  .companion-overlay.react-collect .core {
    transform: scale(1.1);
    box-shadow: 0 0 24px rgba(251, 191, 36, 0.6);
  }

  .companion-overlay.react-milestone .pulse {
    animation: overlay-react-burst 600ms ease-out;
  }

  @keyframes overlay-breathe {
    0% {
      transform: scale(0.95);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(0.95);
    }
  }

  @keyframes overlay-jitter {
    0%,
    100% {
      transform: translate(0, 0) scale(0.95);
    }
    25% {
      transform: translate(-1px, 2px) scale(1.02);
    }
    50% {
      transform: translate(2px, -1px) scale(0.98);
    }
    75% {
      transform: translate(-2px, -2px) scale(1.03);
    }
  }

  @keyframes overlay-react-pulse {
    0% {
      transform: scale(0.95);
      opacity: 1;
    }
    60% {
      transform: scale(1.15);
      opacity: 0.65;
    }
    100% {
      transform: scale(0.95);
      opacity: 1;
    }
  }

  @keyframes overlay-react-burst {
    0% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.3);
      opacity: 0.4;
    }
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
  }
</style>
