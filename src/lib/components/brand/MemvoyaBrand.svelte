<script lang="ts">
  export let href: string | null = '/';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let showMark = true;
  export let ariaLabel = 'Memvoya home';

  const content = true;
</script>

{#if href}
  <a class={`memvoya-brand memvoya-brand--${size}`} {href} aria-label={ariaLabel}>
    {#if content}
      {#if showMark}
        <span class="memvoya-brand__mark" aria-hidden="true"></span>
      {/if}
      <span class="memvoya-brand__title" aria-hidden="true"></span>
      <span class="sr-only">Memvoya</span>
    {/if}
  </a>
{:else}
  <div class={`memvoya-brand memvoya-brand--${size}`} role="img" aria-label={ariaLabel}>
    {#if showMark}
      <span class="memvoya-brand__mark" aria-hidden="true"></span>
    {/if}
    <span class="memvoya-brand__title" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .memvoya-brand {
    --brand-mark-size: 3.1rem;
    --brand-title-width: 10.4rem;
    --brand-title-height: 2.34rem;
    --brand-title-offset: -4.06rem;
    display: inline-flex;
    align-items: center;
    gap: 0.78rem;
    color: inherit;
    text-decoration: none;
    line-height: 1;
  }

  .memvoya-brand--sm {
    --brand-mark-size: 2.55rem;
    --brand-title-width: 9rem;
    --brand-title-height: 2.04rem;
    --brand-title-offset: -3.51rem;
  }

  .memvoya-brand--lg {
    --brand-mark-size: 3.7rem;
    --brand-title-width: 12.35rem;
    --brand-title-height: 2.78rem;
    --brand-title-offset: -4.82rem;
  }

  .memvoya-brand__mark {
    width: var(--brand-mark-size);
    height: var(--brand-mark-size);
    border-radius: 0.95rem;
    background-image: url('/assets/logo.png');
    background-size: 178%;
    background-position: center;
    box-shadow:
      0 0 0 1px rgba(221, 170, 92, 0.16),
      0 0 20px rgba(169, 123, 225, 0.34);
    flex: 0 0 auto;
  }

  .memvoya-brand__title {
    position: relative;
    width: var(--brand-title-width);
    height: var(--brand-title-height);
    overflow: hidden;
    flex: 0 0 auto;
  }

  .memvoya-brand__title::before {
    content: '';
    position: absolute;
    left: 0;
    top: var(--brand-title-offset);
    width: var(--brand-title-width);
    height: var(--brand-title-width);
    background-image: url('/assets/title.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    filter: drop-shadow(0 0 12px rgba(221, 170, 92, 0.24));
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
