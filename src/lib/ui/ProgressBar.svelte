<script lang="ts">
  export let value: number = 0;
  export let max: number = 100;
  export let ariaLabel: string = 'Progress';

  $: safeMax = Number.isFinite(max) && max > 0 ? max : 1;
  $: safeValue = Number.isFinite(value) ? Math.max(0, Math.min(value, safeMax)) : 0;
  $: percentage = Math.round((safeValue / safeMax) * 100);
</script>

<div
  class="progress-track"
  role="progressbar"
  aria-valuenow={safeValue}
  aria-valuemin="0"
  aria-valuemax={safeMax}
  aria-label={ariaLabel}
>
  <div class="progress-fill" style:width={`${percentage}%`}></div>
</div>

<style>
  .progress-track {
    position: relative;
    width: 100%;
    height: 0.6rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(160, 107, 255, 0.9), rgba(90, 224, 199, 0.75));
    transition: width 0.25s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition-duration: 0.01ms !important;
    }
  }
</style>
