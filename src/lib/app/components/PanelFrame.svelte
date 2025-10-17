<script lang="ts">
  export let title: string;
  export let loading = false;
</script>

<section class="panel-frame" aria-busy={loading ? 'true' : 'false'}>
  <div class="panel-ring" aria-hidden="true"></div>
  <header class="panel-header" role="heading" aria-level="2">
    <p class="panel-title">{title}</p>
    <div class="panel-actions">
      <slot name="actions"></slot>
    </div>
  </header>

  <div class="panel-body">
    {#if loading}
      <slot name="skeleton">
        <div class="default-skeleton" aria-hidden="true"></div>
      </slot>
    {:else}
      <slot></slot>
    {/if}
  </div>
</section>

<style>
  .panel-frame {
    position: relative;
    background: rgba(12, 16, 34, 0.52);
    border: 1px solid rgba(233, 195, 255, 0.12);
    border-radius: 18px;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.35);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .panel-frame:focus-within {
    border-color: rgba(160, 107, 255, 0.4);
    box-shadow: 0 26px 56px rgba(38, 13, 64, 0.55);
  }

  .panel-ring {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    border: 1px solid rgba(90, 224, 199, 0.14);
    opacity: 0;
    transition: opacity 0.2s ease;
  }

  .panel-frame:focus-within .panel-ring {
    opacity: 1;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-title {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.015em;
    margin: 0;
  }

  .panel-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .panel-body {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    color: rgba(235, 238, 255, 0.88);
  }

  .default-skeleton {
    width: 100%;
    height: 4.5rem;
    border-radius: 14px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.08));
    background-size: 200% 100%;
    animation: shimmer 1.2s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }

    100% {
      background-position: -200% 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-frame,
    .panel-ring,
    .default-skeleton {
      transition-duration: 0.01ms !important;
      animation: none !important;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.animate-pulse) {
      animation: none !important;
      opacity: 0.65;
    }
  }
</style>
