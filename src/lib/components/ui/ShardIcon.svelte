<script lang="ts">
  export let size = 18;
  export let widthScale = 1.18;
  export let alt = '';
  export let className = '';

  $: width = Math.round(size * widthScale);
</script>

<img
  class={`shard-icon ${className}`.trim()}
  src="/assets/shard-96.png"
  {alt}
  aria-hidden={alt ? undefined : 'true'}
  width={width}
  height={size}
  loading="eager"
  decoding="async"
  style={`--shard-width: ${width}px; --shard-height: ${size}px`}
/>

<style>
  .shard-icon {
    display: inline-block;
    width: var(--shard-width);
    height: var(--shard-height);
    flex: 0 0 auto;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(174, 92, 255, 0.62));
  }
</style>
