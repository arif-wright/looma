<script lang="ts">
  export let className = '';
  export { className as class };
  export let padded = true;
</script>

<section class={`san-shell sanctuary-page ${padded ? 'san-shell--padded' : ''} ${className}`}>
  <slot />
</section>

<style>
  .san-shell {
    width: min(100%, 1200px);
    margin: 0 auto;
  }

  .san-shell--padded {
    padding: 1rem;
  }

  @media (max-width: 960px) {
    .san-shell--padded {
      padding: 0.55rem 0.55rem 5.25rem;
    }
  }
</style>

