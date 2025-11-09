<script lang="ts">
  export let as: keyof HTMLElementTagNameMap = 'section';
  export let padding: 'sm' | 'md' | 'lg' = 'md';
  export let interactive = false;
  export let className = '';
</script>

<svelte:element
  this={as}
  class={`admin-card admin-card--${padding} ${interactive ? 'admin-card--interactive' : ''} ${className}`.trim()}
>
  <slot />
</svelte:element>

<style>
  .admin-card {
    position: relative;
    border-radius: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(10, 15, 28, 0.78);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.04),
      0 30px 45px rgba(2, 6, 23, 0.55);
    backdrop-filter: blur(22px);
    color: inherit;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .admin-card--sm {
    padding: 1rem 1.25rem;
  }

  .admin-card--md {
    padding: 1.25rem 1.5rem;
  }

  .admin-card--lg {
    padding: 1.5rem 1.75rem;
  }

  .admin-card--interactive:focus-within,
  .admin-card--interactive:hover {
    border-color: rgba(56, 189, 248, 0.35);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.06),
      0 35px 60px rgba(8, 47, 73, 0.55);
  }

  .admin-card--interactive:focus-within {
    outline: 2px solid rgba(56, 189, 248, 0.35);
    outline-offset: 2px;
  }
</style>
