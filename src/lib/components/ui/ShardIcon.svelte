<script lang="ts">
  export let size = 18;
  export let alt = '';
  export let className = '';
</script>

<img
  class={`shard-icon ${className}`.trim()}
  src="/assets/shard-96.png"
  {alt}
  aria-hidden={alt ? undefined : 'true'}
  width={size}
  height={size}
  loading="eager"
  decoding="async"
  style={`--shard-size: ${size}px`}
/>

<style>
  .shard-icon {
    display: inline-block;
    width: var(--shard-size);
    height: var(--shard-size);
    flex: 0 0 auto;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(174, 92, 255, 0.62));
  }
</style>
