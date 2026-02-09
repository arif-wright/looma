<script lang="ts">
  export let text: string;
  export let label: string | null = null;
  export let icon: string = 'i';
  export let className = '';

  let open = false;
  let tooltipId = `hint-${Math.random().toString(36).slice(2, 9)}`;

  const show = () => {
    open = true;
  };
  const hide = () => {
    open = false;
  };
</script>

<span class={`info-hint ${className}`.trim()}>
  <button
    type="button"
    class="info-hint__trigger"
    aria-label={label ?? text}
    aria-expanded={open}
    aria-describedby={open ? tooltipId : undefined}
    on:mouseenter={show}
    on:mouseleave={hide}
    on:focusin={show}
    on:focusout={hide}
  >
    <span aria-hidden="true">{icon}</span>
  </button>
  <span
    id={tooltipId}
    role="tooltip"
    class="info-hint__bubble"
    data-open={open}
    aria-hidden={!open}
  >
    {text}
  </span>
</span>

<style>
  .info-hint {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .info-hint__trigger {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.7rem;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .info-hint__trigger:focus-visible {
    outline: 2px solid rgba(94, 242, 255, 0.6);
    outline-offset: 2px;
  }

  .info-hint__trigger:hover,
  .info-hint__trigger:focus-visible {
    border-color: rgba(94, 242, 255, 0.7);
    background: rgba(94, 242, 255, 0.16);
  }

  .info-hint__bubble {
    position: absolute;
    bottom: calc(100% + 0.45rem);
    left: 50%;
    transform: translateX(-50%);
    min-width: 180px;
    max-width: 220px;
    padding: 0.45rem 0.65rem;
    border-radius: 0.65rem;
    background: rgba(5, 6, 18, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.75rem;
    line-height: 1.4;
    box-shadow: 0 12px 28px rgba(3, 5, 12, 0.5);
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms ease;
    z-index: 50;
  }

  .info-hint__bubble::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid rgba(5, 6, 18, 0.95);
  }

  .info-hint__bubble[data-open='true'] {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .info-hint__bubble {
      transition: none;
    }
  }
</style>
