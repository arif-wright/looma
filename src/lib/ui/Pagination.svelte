<script lang="ts">
  export let page = 1;
  export let pages = 1;
  export let onChange: (p: number) => void = () => {};
  export let compact = false;
  export let ariaLabel = 'Pagination';

  const prev = () => page > 1 && onChange(page - 1);
  const next = () => page < pages && onChange(page + 1);

  function onKey(e: KeyboardEvent, dir: 'prev' | 'next') {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dir === 'prev' ? prev() : next();
    }
  }
</script>

<nav
  class={`flex items-center justify-between gap-3 mt-4 px-4 ${compact ? 'text-[13px]' : ''}`}
  aria-label={ariaLabel}
>
  <button
    type="button"
    class="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition disabled:opacity-30 disabled:hover:bg-white/5 text-sm"
    on:click={prev}
    on:keydown={(e) => onKey(e, 'prev')}
    disabled={page <= 1}
    aria-label="Previous page"
  >
    ← Prev
  </button>

  <div class="text-xs opacity-70 select-none">
    Page {page} / {pages}
  </div>

  <button
    type="button"
    class="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition disabled:opacity-30 disabled:hover:bg-white/5 text-sm"
    on:click={next}
    on:keydown={(e) => onKey(e, 'next')}
    disabled={page >= pages}
    aria-label="Next page"
  >
    Next →
  </button>
</nav>

<style>
  :global(.dark) .bg-white\/5 {
    background-color: rgba(255, 255, 255, 0.05);
  }

  :global(.dark) .bg-white\/10 {
    background-color: rgba(255, 255, 255, 0.1);
  }
</style>
