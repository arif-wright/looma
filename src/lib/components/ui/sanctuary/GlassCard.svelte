<script lang="ts">
  export let className = '';
  export { className as class };
</script>

<section class={`glass-card sanctuary-card ${className}`}>
  <slot />
</section>

<style>
  .glass-card {
    padding: 0.85rem;
  }
</style>

