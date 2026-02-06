<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dev } from '$app/environment';

  type ModelViewerElement = HTMLElement & {
    animationName?: string | null;
    availableAnimations?: string[];
    play?: () => void;
    pause?: () => void;
  };

  export let className = '';
  export { className as class };
  export let autoplay = true;
  export let cameraControls = false;
  export let poster: string | undefined;
  export let transparent = true;

  // Deprecated: use `class` and `transparent` instead.
  export let background = 'transparent';
  // Deprecated: use container styles instead of `size`.
  export let size: string | number = '280px';
  // Deprecated: keep for backwards compatibility.
  export let exposure = 1;
  // Deprecated: will be controlled by app-level animation logic.
  export let animationName: string | undefined = 'Idle';
  // Deprecated: use global motion settings.
  export let respectReducedMotion = true;
  // Deprecated: keep for compatibility with existing layout.
  export let orientation = '0deg 0deg 0deg';
  // Deprecated: keep for compatibility with existing layout.
  export let cameraOrbit: string | undefined = '205deg 80deg 105%';
  // Deprecated: keep for compatibility with existing layout.
  export let cameraTarget: string | undefined;

  let container: HTMLDivElement | null = null;
  let viewer: ModelViewerElement | null = null;
  let supportsWebGL = true;
  let shouldLoad = false;
  let loadError: string | null = null;
  let isLoaded = false;
  let isVisible = true;
  let reducedMotion = false;
  let mediaQuery: MediaQueryList | null = null;
  let observer: IntersectionObserver | null = null;

  const normalizeSize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

  const checkWebGL = () => {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
    } catch {
      return false;
    }
  };

  const loadModelViewer = async () => {
    if (shouldLoad && !customElements.get('model-viewer')) {
      try {
        await import('@google/model-viewer');
      } catch (err) {
        loadError = err instanceof Error ? err.message : 'Failed to load 3D renderer.';
      }
    }
  };

  const updatePlayback = () => {
    if (!viewer) return;
    const shouldPlay = autoplay && isVisible && !reducedMotion;
    if (shouldPlay) {
      viewer.play?.();
    } else {
      viewer.pause?.();
    }
  };

  export function playClip(name?: string) {
    animationName = name;
    if (viewer) {
      viewer.animationName = name ?? null;
      updatePlayback();
    }
  }

  onMount(() => {
    supportsWebGL = checkWebGL();
    if (!supportsWebGL) return;

    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion = respectReducedMotion && mediaQuery.matches;

    const handleMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = respectReducedMotion && event.matches;
      updatePlayback();
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleMotionChange);
    } else {
      mediaQuery.addListener(handleMotionChange);
    }

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = Boolean(entry?.isIntersecting);
        if (isVisible && !shouldLoad) {
          shouldLoad = true;
          void loadModelViewer();
        }
        updatePlayback();
      },
      { rootMargin: '160px' }
    );

    if (container) {
      observer.observe(container);
    }

    return () => {
      if (observer && container) observer.unobserve(container);
      observer?.disconnect();
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleMotionChange);
        } else {
          mediaQuery.removeListener(handleMotionChange);
        }
      }
    };
  });

  onDestroy(() => {
    observer?.disconnect();
  });

  $: if (viewer && animationName !== undefined) {
    viewer.animationName = animationName || null;
    updatePlayback();
  }

  $: {
    // Ensure playback reacts to autoplay/visibility/reduced-motion changes.
    const _playbackDeps = [autoplay, isVisible, reducedMotion];
    if (_playbackDeps && viewer) {
      updatePlayback();
    }
  }

  $: if (!respectReducedMotion) {
    reducedMotion = false;
    updatePlayback();
  }
</script>

<div
  class={`muse-shell ${className}`}
  style={`--muse-size: ${normalizeSize(size)}; --muse-background: ${transparent ? 'transparent' : background};`}
  bind:this={container}
>
  {#if !supportsWebGL}
    <div class="muse-fallback" role="status">
      <p class="muse-fallback__title">Muse preview unavailable</p>
      <p class="muse-fallback__copy">Your browser doesn’t support WebGL.</p>
    </div>
  {:else if loadError}
    <div class="muse-fallback" role="status">
      <p class="muse-fallback__title">Muse failed to load</p>
      <p class="muse-fallback__copy">{loadError}</p>
    </div>
  {:else if !shouldLoad}
    <div class="muse-placeholder" aria-hidden="true">
      <div class="muse-placeholder__orb"></div>
      <p>Loading Muse…</p>
    </div>
  {:else}
    <model-viewer
      class="muse-viewer"
      class:muse-viewer--interactive={cameraControls}
      src="/models/muse.glb"
      alt="Muse companion"
      loading="lazy"
      reveal="auto"
      poster={poster}
      autoplay={autoplay && !reducedMotion ? true : undefined}
      camera-controls={cameraControls ? true : undefined}
      orientation={orientation}
      camera-orbit={cameraOrbit}
      camera-target={cameraTarget}
      exposure={exposure}
      interaction-prompt="none"
      animation-name={animationName}
      on:load={() => {
        isLoaded = true;
        const available = viewer?.availableAnimations ?? [];
        const desired =
          animationName && available.includes(animationName)
            ? animationName
            : available[0] ?? animationName ?? null;
        if (viewer) {
          viewer.animationName = desired;
          const shouldPlay = autoplay && !reducedMotion;
          if (shouldPlay) {
            viewer.play?.();
          }
          if (dev) {
            console.debug('[MuseModel] motion', {
              reducedMotion,
              autoplay,
              availableAnimationCount: available.length,
              availableAnimations: available
            });
          }
        }
        updatePlayback();
      }}
      on:error={() => {
        loadError = 'Unable to load the Muse model.';
      }}
      bind:this={viewer}
    ></model-viewer>
    {#if !isLoaded}
      <div class="muse-overlay" aria-hidden="true">
        <div class="muse-placeholder__orb"></div>
        <p>Loading Muse…</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .muse-shell {
    width: var(--muse-size);
    height: var(--muse-size);
    min-width: 180px;
    min-height: 180px;
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(160deg, rgba(12, 16, 32, 0.9), rgba(6, 10, 20, 0.7));
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  .muse-viewer {
    width: 100%;
    height: 100%;
    background: var(--muse-background);
  }

  .muse-viewer--interactive {
    cursor: grab;
  }

  .muse-viewer--interactive:active {
    cursor: grabbing;
  }

  .muse-placeholder,
  .muse-fallback,
  .muse-overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    text-align: center;
    padding: 1.25rem;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
  }

  .muse-fallback__title {
    margin: 0;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.9);
  }

  .muse-fallback__copy {
    margin: 0.35rem 0 0;
    color: rgba(255, 255, 255, 0.65);
  }

  .muse-overlay {
    background: linear-gradient(120deg, rgba(6, 10, 20, 0.8), rgba(12, 16, 32, 0.6));
    backdrop-filter: blur(8px);
  }

  .muse-placeholder__orb {
    width: 80px;
    height: 80px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(94, 234, 212, 0.9), rgba(59, 130, 246, 0.15));
    box-shadow: 0 0 25px rgba(94, 234, 212, 0.35);
    margin-bottom: 0.75rem;
  }
</style>
