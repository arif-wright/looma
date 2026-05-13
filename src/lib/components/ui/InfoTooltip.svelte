<script lang="ts">
  export let text: string;
  export let label: string | null = null;
  export let icon: string = 'i';
  export let className = '';
  export let title: string | null = null;
  export let kicker: string | null = null;

  let open = false;
  let tooltipId = `hint-${Math.random().toString(36).slice(2, 9)}`;
  const hasCustomContent = Boolean($$slots.default);

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
    {#if hasCustomContent}
      <slot />
    {:else}
      {#if kicker}
        <span class="info-hint__kicker">{kicker}</span>
      {/if}
      {#if title}
        <strong>{title}</strong>
      {/if}
      <span>{text}</span>
    {/if}
  </span>
</span>

<style>
  .info-hint {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .info-hint__trigger {
    width: 1.45rem;
    height: 1.45rem;
    border-radius: 999px;
    border: 1px solid rgba(183, 92, 255, 0.45);
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.18), transparent 34%),
      rgba(255, 255, 255, 0.07);
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.72rem;
    font-weight: 900;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: help;
    transition: border-color 120ms ease, background 120ms ease;
  }

  .info-hint__trigger:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 2px;
  }

  .info-hint__trigger:hover,
  .info-hint__trigger:focus-visible {
    border-color: rgba(221, 170, 92, 0.62);
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.22), transparent 34%),
      rgba(183, 92, 255, 0.18);
  }

  .info-hint__bubble {
    position: absolute;
    bottom: calc(100% + 0.45rem);
    left: 50%;
    display: grid;
    gap: 0.32rem;
    min-width: 14.5rem;
    max-width: min(19rem, calc(100vw - 2rem));
    padding: 0.82rem 0.9rem;
    border-radius: 0.9rem;
    background:
      radial-gradient(circle at 16% 0%, rgba(183, 92, 255, 0.24), transparent 58%),
      radial-gradient(circle at 88% 12%, rgba(221, 170, 92, 0.14), transparent 48%),
      rgba(10, 11, 31, 0.96);
    border: 1px solid rgba(153, 130, 236, 0.28);
    color: rgba(235, 231, 248, 0.86);
    font-size: 0.78rem;
    line-height: 1.45;
    box-shadow: 0 1.1rem 2.6rem rgba(3, 5, 14, 0.58), 0 0 1.2rem rgba(183, 92, 255, 0.16);
    backdrop-filter: blur(16px);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translate(-50%, 0.35rem) scale(0.98);
    transform-origin: bottom center;
    transition: opacity 150ms ease, transform 150ms ease, visibility 150ms ease;
    z-index: 50;
  }

  .info-hint__bubble strong {
    color: rgba(255, 250, 242, 0.98);
    font-size: 0.88rem;
    line-height: 1.25;
  }

  .info-hint__kicker {
    color: #ddaa5c;
    font-size: 0.64rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
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
    border-top: 6px solid rgba(10, 11, 31, 0.96);
  }

  .info-hint__bubble[data-open='true'] {
    opacity: 1;
    visibility: visible;
    transform: translate(-50%, 0) scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .info-hint__bubble {
      transition: none;
    }
  }
</style>
