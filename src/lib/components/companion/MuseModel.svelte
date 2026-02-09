<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { normalizeCompanionCosmetics } from '$lib/companions/cosmetics';

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
  export let poster: string | undefined = undefined;
  export let transparent = true;
  export let auraColor: string = 'cyan';
  export let glowIntensity = 55;
  export let preserveDrawingBuffer = false;
  export let eager = false;
  // `minSize` exists because some surfaces (like modal portraits) need a tiny model view.
  // Default preserves existing layouts that assumed a minimum 180px panel.
  export let minSize: string | number = 180;

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
  export let cameraTarget: string | undefined = undefined;

  let container: HTMLDivElement | null = null;
  let viewer: any = null;
  let supportsWebGL = true;
  let shouldLoad = false;
  let loadError: string | null = null;
  let isLoaded = false;
  let isVisible = true;
  let reducedMotion = false;
  let mediaQuery: MediaQueryList | null = null;
  let observer: IntersectionObserver | null = null;

  const normalizeSize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);
  const auraColorMap: Record<string, string> = {
    cyan: '88 243 255',
    amber: '255 182 92',
    mint: '126 255 201',
    rose: '255 129 180'
  };

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

  export async function capturePortrait(): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    if (!supportsWebGL) return null;
    if (!shouldLoad) {
      shouldLoad = true;
      await loadModelViewer();
    }
    if (!viewer) return null;

    try {
      // If the model isn't loaded yet, wait briefly for a paintable frame.
      if (!isLoaded) {
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          const timeout = window.setTimeout(done, 1800);
          try {
            viewer.addEventListener?.(
              'load',
              () => {
                window.clearTimeout(timeout);
                done();
              },
              { once: true }
            );
          } catch {
            // If the event listener fails, just rely on the timeout.
          }
        });
      }

      // model-viewer provides a `toDataURL()` helper in modern versions.
      const asAny = viewer as any;
      if (typeof asAny.toDataURL === 'function') {
        const dataUrl = await asAny.toDataURL('image/png');
        return typeof dataUrl === 'string' ? dataUrl : null;
      }

      const canvas = (viewer as any)?.shadowRoot?.querySelector?.('canvas') as HTMLCanvasElement | null;
      if (canvas && typeof canvas.toDataURL === 'function') {
        return canvas.toDataURL('image/png');
      }
    } catch (err) {
      if (dev) console.debug('[MuseModel] capture failed', err);
    }
    return null;
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

    if (eager) {
      // Modals/portaits can be rendered in scroll containers where IntersectionObserver
      // doesn't always fire promptly. Eager mode guarantees the element loads.
      shouldLoad = true;
      void loadModelViewer();
    } else {
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

  $: normalizedCosmetics = normalizeCompanionCosmetics({ auraColor, glowIntensity });
  $: auraRgb = auraColorMap[normalizedCosmetics.auraColor] ?? auraColorMap.cyan;
  $: auraOpacity = 0.18 + normalizedCosmetics.glowIntensity / 340;
  $: auraBlurPx = 24 + normalizedCosmetics.glowIntensity * 0.42;
</script>

<div
  class={`muse-shell ${className}`}
  style={`--muse-size: ${normalizeSize(size)}; --muse-min-size: ${normalizeSize(minSize)}; --muse-background: ${transparent ? 'transparent' : background}; --muse-aura-rgb:${auraRgb}; --muse-aura-opacity:${auraOpacity}; --muse-aura-blur:${auraBlurPx}px;`}
  bind:this={container}
>
  <div class="muse-aura" aria-hidden="true"></div>
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
      loading={eager ? 'eager' : 'lazy'}
      reveal="auto"
      poster={poster}
      autoplay={autoplay && !reducedMotion ? true : undefined}
      camera-controls={cameraControls ? true : undefined}
      preserve-drawing-buffer={preserveDrawingBuffer ? true : undefined}
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
    min-width: var(--muse-min-size, 180px);
    min-height: var(--muse-min-size, 180px);
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: linear-gradient(160deg, rgba(12, 16, 32, 0.9), rgba(6, 10, 20, 0.7));
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  .muse-aura {
    position: absolute;
    inset: 16%;
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 50%, rgba(var(--muse-aura-rgb) / 0.56), transparent 66%),
      radial-gradient(circle at 50% 55%, rgba(var(--muse-aura-rgb) / 0.34), transparent 76%);
    opacity: var(--muse-aura-opacity);
    filter: blur(var(--muse-aura-blur));
    z-index: 0;
    pointer-events: none;
  }

  .muse-viewer {
    width: 100%;
    height: 100%;
    background: var(--muse-background);
    position: relative;
    z-index: 1;
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
    /* Must sit above the WebGL surface (which has z-index: 1). */
    z-index: 2;
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
