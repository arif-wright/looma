<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, tick } from 'svelte';
  import {
    clampIndex,
    formatBytes,
    itemLabel,
    nextIndex,
    prevIndex,
    type MediaViewerItem
  } from './useMediaViewer';

  export let open = false;
  export let items: MediaViewerItem[] = [];
  export let startIndex = 0;
  export let onClose: () => void = () => {};

  const dispatch = createEventDispatcher<{ close: void }>();

  let activeIndex = 0;
  let previousFocus: HTMLElement | null = null;
  let rootEl: HTMLElement | null = null;
  let reduceMotion = false;
  let gifPlaying = false;
  let copyStatus: 'idle' | 'copied' | 'error' = 'idle';
  let actionError: string | null = null;
  let touchStartX = 0;

  const focusableSelector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  if (browser) {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduceMotion = media.matches;
    media.addEventListener('change', (event) => {
      reduceMotion = event.matches;
      gifPlaying = !event.matches;
    });
  }

  const close = () => {
    open = false;
    onClose();
    dispatch('close');
  };

  const focusFirst = async () => {
    await tick();
    if (!rootEl) return;
    const target = rootEl.querySelector<HTMLElement>(focusableSelector);
    target?.focus();
  };

  const handleBodyScroll = (enabled: boolean) => {
    if (!browser) return;
    document.body.style.overflow = enabled ? 'hidden' : '';
  };

  const stepNext = () => {
    if (!items.length) return;
    activeIndex = nextIndex(activeIndex, items.length);
    actionError = null;
  };

  const stepPrev = () => {
    if (!items.length) return;
    activeIndex = prevIndex(activeIndex, items.length);
    actionError = null;
  };

  const downloadCurrent = async () => {
    const current = items[activeIndex];
    if (!current) return;
    actionError = null;

    try {
      const a = document.createElement('a');
      a.href = current.url;
      a.download = '';
      a.rel = 'noopener noreferrer';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      actionError = 'Download unavailable right now. Try Open instead.';
    }
  };

  const copyLink = async () => {
    const current = items[activeIndex];
    if (!current || !browser) return;

    try {
      await navigator.clipboard.writeText(current.url);
      copyStatus = 'copied';
      setTimeout(() => {
        copyStatus = 'idle';
      }, 1400);
    } catch {
      copyStatus = 'error';
      setTimeout(() => {
        copyStatus = 'idle';
      }, 1400);
    }
  };

  const trapFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || !rootEl) return;
    const nodes = Array.from(rootEl.querySelectorAll<HTMLElement>(focusableSelector)).filter(
      (node) => !node.hasAttribute('disabled')
    );
    if (!nodes.length) return;

    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!first || !last) return;
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleTouchStart = (event: TouchEvent) => {
    touchStartX = event.changedTouches[0]?.clientX ?? 0;
  };

  const handleTouchEnd = (event: TouchEvent) => {
    const endX = event.changedTouches[0]?.clientX ?? 0;
    const delta = endX - touchStartX;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) {
      stepPrev();
    } else {
      stepNext();
    }
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepPrev();
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepNext();
      return;
    }
    trapFocus(event);
  };

  $: if (open) {
    activeIndex = clampIndex(startIndex, items.length);
    gifPlaying = !reduceMotion;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    handleBodyScroll(true);
    void focusFirst();
  } else {
    handleBodyScroll(false);
    previousFocus?.focus();
  }

  $: current = items[activeIndex] ?? null;
  $: canPrev = activeIndex > 0;
  $: canNext = activeIndex < items.length - 1;

  onDestroy(() => {
    handleBodyScroll(false);
  });
</script>

{#if open}
  <div class="overlay" role="presentation" on:keydown={handleKeydown}>
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={current ? itemLabel(current) : 'Media viewer'}
      bind:this={rootEl}
      on:touchstart={handleTouchStart}
      on:touchend={handleTouchEnd}
    >
      <header class="header">
        <p class="counter" aria-live="polite">{items.length > 0 ? `${activeIndex + 1} / ${items.length}` : '0 / 0'}</p>
        <div class="header-actions">
          <button type="button" on:click={close} aria-label="Close media viewer">Close</button>
        </div>
      </header>

      <div class="stage">
        {#if current}
          {#if current.kind === 'gif' && reduceMotion && !gifPlaying}
            <div class="gif-paused">
              <p>GIF paused</p>
              <button type="button" on:click={() => (gifPlaying = true)}>Play GIF</button>
            </div>
          {:else}
            <img src={current.url} alt={itemLabel(current)} />
          {/if}
        {:else}
          <p class="unavailable">This media is no longer available.</p>
        {/if}
      </div>

      <footer class="footer">
        <div class="meta">
          {#if current}
            <p>
              <strong>{current.kind === 'gif' ? 'GIF' : 'Image'}</strong>
              {#if current.mimeType}
                · {current.mimeType}
              {/if}
              {#if formatBytes(current.bytes)}
                · {formatBytes(current.bytes)}
              {/if}
            </p>
            <p>
              Posted by {current.senderHandle ?? current.senderId ?? 'Unknown'}
              {#if current.createdAt}
                · {new Date(current.createdAt).toLocaleString()}
              {/if}
            </p>
          {/if}
          {#if actionError}
            <p class="error">{actionError}</p>
          {/if}
          {#if copyStatus === 'copied'}
            <p class="ok">Link copied.</p>
          {:else if copyStatus === 'error'}
            <p class="error">Copy failed.</p>
          {/if}
        </div>

        <div class="controls">
          <button type="button" on:click={stepPrev} disabled={!canPrev} aria-label="Previous media">Prev</button>
          <button type="button" on:click={stepNext} disabled={!canNext} aria-label="Next media">Next</button>
          {#if current}
            {#if current.kind === 'gif' && reduceMotion}
              <button type="button" on:click={() => (gifPlaying = !gifPlaying)}>{gifPlaying ? 'Pause GIF' : 'Play GIF'}</button>
            {/if}
            <a href={current.url} target="_blank" rel="noopener noreferrer">Open</a>
            <button type="button" on:click={copyLink}>Copy link</button>
            <button type="button" on:click={downloadCurrent}>Download</button>
          {/if}
        </div>
      </footer>
    </div>

    <button class="backdrop" type="button" aria-label="Close media viewer" on:click={close}></button>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 1600;
    display: grid;
    place-items: center;
    padding: 0.75rem;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.85);
    border: none;
    z-index: -1;
  }

  .dialog {
    width: min(100%, 68rem);
    max-height: calc(100vh - 1.5rem);
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.9rem;
    display: grid;
    grid-template-rows: auto 1fr auto;
    overflow: hidden;
  }

  .header,
  .footer {
    padding: 0.65rem 0.8rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.55rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  }

  .footer {
    border-bottom: none;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    align-items: flex-end;
  }

  .counter {
    margin: 0;
    color: rgba(226, 232, 240, 0.92);
    font-size: 0.85rem;
  }

  .stage {
    display: grid;
    place-items: center;
    min-height: 16rem;
    padding: 0.5rem;
    overflow: auto;
  }

  .stage img {
    max-width: 100%;
    max-height: min(70vh, 52rem);
    object-fit: contain;
    border-radius: 0.55rem;
  }

  .gif-paused,
  .unavailable {
    display: grid;
    gap: 0.4rem;
    color: rgba(226, 232, 240, 0.95);
    text-align: center;
  }

  .gif-paused button {
    justify-self: center;
  }

  .meta {
    display: grid;
    gap: 0.2rem;
  }

  .meta p {
    margin: 0;
    color: rgba(203, 213, 225, 0.9);
    font-size: 0.78rem;
  }

  .controls {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  button,
  a {
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.62rem;
    background: rgba(15, 23, 42, 0.72);
    color: #e2e8f0;
    padding: 0.34rem 0.6rem;
    text-decoration: none;
    cursor: pointer;
    font-size: 0.8rem;
  }

  button[disabled] {
    opacity: 0.5;
    cursor: default;
  }

  .ok {
    color: #86efac;
  }

  .error {
    color: #fda4af;
  }

  @media (max-width: 720px) {
    .dialog {
      max-height: calc(100vh - 1rem);
    }

    .footer {
      flex-direction: column;
      align-items: stretch;
    }

    .controls {
      justify-content: flex-start;
    }
  }
</style>
