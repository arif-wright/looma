<script lang="ts">
  export let tone: 'calm' | 'warm' | 'cool' | 'muted' = 'calm';
  export let className = '';
  export { className as class };
</script>

<span class={`emotional-chip sanctuary-chip emotional-chip--${tone} ${className}`}>
  <slot />
</span>

<style>
  .emotional-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 1.9rem;
    padding: 0 0.7rem;
    font-size: 0.76rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .emotional-chip--warm {
    background: rgba(122, 71, 122, 0.42);
  }

  .emotional-chip--cool {
    background: rgba(53, 97, 137, 0.44);
  }

  .emotional-chip--muted {
    background: rgba(53, 63, 94, 0.5);
  }
</style>

