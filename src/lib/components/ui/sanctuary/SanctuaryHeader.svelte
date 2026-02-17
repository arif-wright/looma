<script lang="ts">
  export let title = '';
  export let subtitle = '';
  export let eyebrow = '';
</script>

<header class="san-header">
  <div class="san-header__copy">
    {#if eyebrow}
      <p class="san-header__eyebrow">{eyebrow}</p>
    {/if}
    {#if title}
      <h1 class="sanctuary-title san-header__title">{title}</h1>
    {/if}
    {#if subtitle}
      <p class="sanctuary-subtitle san-header__subtitle">{subtitle}</p>
    {/if}
  </div>
  <div class="san-header__actions">
    <slot name="actions" />
  </div>
</header>

<style>
  .san-header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 0.95rem;
    margin-bottom: 0.9rem;
  }

  .san-header__copy {
    display: grid;
    gap: 0.3rem;
  }

  .san-header__eyebrow {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--san-text-muted);
  }

  .san-header__title {
    font-size: clamp(1.45rem, 2.7vw, 2.15rem);
  }

  .san-header__subtitle {
    font-size: 0.92rem;
  }

  .san-header__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  @media (max-width: 720px) {
    .san-header {
      flex-direction: column;
      align-items: start;
      gap: 0.65rem;
      margin-bottom: 0.7rem;
    }
  }
</style>

