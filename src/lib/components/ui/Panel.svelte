<script lang="ts">
  export let title: string | null = null;
  export let className = '';
</script>

<section class={`rounded-2xl ring-1 ring-white/10 bg-white/[0.045] ${className}`}>
  {#if title}
    <header class="px-4 py-3 border-b border-white/10">
      <h2 class="text-sm font-semibold text-white/80 tracking-wide uppercase">{title}</h2>
    </header>
  {/if}
  <div class="p-4">
    <slot />
  </div>
</section>
