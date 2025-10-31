<script lang="ts">
  export let as: keyof HTMLElementTagNameMap = 'section';
  export let headline: string | null = null;
  export let subtitle: string | null = null;
  export let className = '';

  let element: HTMLElement;
</script>

<svelte:element
  bind:this={element}
  this={as}
  class={`orb-panel ${className}`.trim()}
  {...$$restProps}
>
  {#if headline || subtitle || $$slots.title || $$slots.subtitle || $$slots.actions}
    <header class="orb-panel__header">
      <div class="orb-panel__titles">
        <div class="orb-panel__title">
          <slot name="title">
            {#if headline}
              <h2>{headline}</h2>
            {/if}
          </slot>
        </div>
        <div class="orb-panel__subtitle">
          <slot name="subtitle">
            {#if subtitle}
              <p>{subtitle}</p>
            {/if}
          </slot>
        </div>
      </div>
      {#if $$slots.actions}
        <div class="orb-panel__actions">
          <slot name="actions" />
        </div>
      {/if}
    </header>
  {/if}
  <div class="orb-panel__body">
    <slot />
  </div>
</svelte:element>

<style>
  .orb-panel {
    position: relative;
    display: grid;
    gap: 20px;
    padding: clamp(1.75rem, 3vw, 2.35rem);
    border-radius: 1.5rem;
    color: rgba(244, 247, 255, 0.96);
    background:
      linear-gradient(140deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.02)),
      rgba(12, 16, 40, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(34px);
    box-shadow: 0 0 40px rgba(150, 80, 255, 0.25);
    isolation: isolate;
  }

  .orb-panel::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    background:
      radial-gradient(120% 140% at 20% -10%, rgba(157, 92, 255, 0.25), transparent 60%),
      radial-gradient(120% 160% at 120% 120%, rgba(77, 244, 255, 0.18), transparent 60%);
    opacity: 0.55;
    z-index: -1;
    transition: opacity 220ms ease;
  }

  .orb-panel::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  .orb-panel:focus-within::before,
  .orb-panel:hover::before {
    opacity: 0.75;
  }

  .orb-panel__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .orb-panel__titles {
    display: grid;
    gap: 10px;
  }

  .orb-panel__title :global(h1),
  .orb-panel__title :global(h2),
  .orb-panel__title :global(h3) {
    margin: 0;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
    font-size: clamp(1.55rem, 3vw, 2.1rem);
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .orb-panel__subtitle :global(p) {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(226, 232, 255, 0.78);
    max-width: 52ch;
  }

  .orb-panel__actions {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .orb-panel__body {
    display: grid;
    gap: clamp(1.4rem, 2.6vw, 2rem);
  }

  .orb-panel:focus-visible {
    outline: none;
    box-shadow: 0 0 0 0.2rem rgba(34, 211, 238, 0.6);
  }
</style>
