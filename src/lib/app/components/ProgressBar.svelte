<script lang="ts">
  export let value: number;
  export let label: string | undefined;

  const clamped = Math.max(0, Math.min(value ?? 0, 1));
  const percentage = Math.round(clamped * 100);
</script>

<div class="progress-wrapper">
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
  <div
    class="progress-track"
    role="progressbar"
    aria-valuenow={percentage}
    aria-valuemin="0"
    aria-valuemax="100"
    aria-label={label}
  >
    <div class="progress-fill" style:width={percentage + '%'}></div>
  </div>
</div>

<style>
  .progress-wrapper {
    display: grid;
    gap: 0.35rem;
  }

  .progress-label {
    font-size: 0.82rem;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: rgba(233, 195, 255, 0.85);
  }

  .progress-track {
    position: relative;
    width: 100%;
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(160, 107, 255, 0.85), rgba(90, 224, 199, 0.7));
    transition: width 0.3s ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition-duration: 0.01ms !important;
    }
  }
</style>
