<script lang="ts">
  export let item: any = null;
  export let open = false;
  export let busy = false;
  export let error: string | null = null;
  export let owned = false;
  export let stackable = true;
  export let onClose: () => void = () => {};
  export let onPurchase: (item: any) => Promise<void> = async () => {};

  const closeIfBackdrop = (event: MouseEvent) => {
    if ((event.target as HTMLElement).dataset.backdrop === '1') {
      onClose?.();
    }
  };
</script>

{#if open && item}
  <div class="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" data-backdrop="1" on:click={closeIfBackdrop} />
  <div class="fixed inset-0 z-[80] flex items-center justify-center px-4">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      class="w-full max-w-xl overflow-hidden rounded-2xl bg-[#0B0E13] shadow-xl ring-1 ring-white/10"
    >
      <header class="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 id="modal-title" class="text-base font-semibold text-white">{item.title}</h2>
        <button
          class="rounded-full px-2 py-1 text-white/70 transition hover:bg-white/10"
          on:click={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </header>

      <div class="relative aspect-[16/9]">
        <img
          src={item.image_url}
          alt={`${item.title} cover`}
          class="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
        <div class="absolute right-2 top-2 flex gap-1">
          <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wide ring-1 ring-white/10">
            {item.rarity}
          </span>
          <span class="rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold ring-1 ring-white/10">
            {owned && !stackable ? 'Owned' : `💎 ${item.price_shards}`}
          </span>
        </div>
      </div>

      <div class="space-y-2 px-4 py-3">
        {#if item.subtitle}
          <p class="text-sm text-white/80">{item.subtitle}</p>
        {/if}
        {#if item.description}
          <p class="text-sm leading-relaxed text-white/60">{item.description}</p>
        {/if}
        {#if item.tags?.length}
          <div class="flex flex-wrap gap-1 pt-1">
            {#each item.tags as tag}
              <span class="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/70 ring-1 ring-white/10">
                {tag}
              </span>
            {/each}
          </div>
        {/if}
        {#if error}
          <div class="mt-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-200">
            {error}
          </div>
        {/if}
      </div>

      <footer class="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
        <button
          on:click={onClose}
          class="h-9 rounded-full border border-white/10 px-3 text-sm text-white/80 transition hover:bg-white/5"
        >
          Cancel
        </button>
        <button
          class="h-9 rounded-full bg-gradient-to-r from-cyan-400/80 to-fuchsia-400/80 px-4 text-sm font-semibold text-black/90 transition hover:brightness-110 disabled:opacity-60"
          on:click={() => onPurchase(item)}
          disabled={busy || (owned && !stackable)}
        >
          {#if owned && !stackable}
            Owned
          {:else if busy}
            Processing…
          {:else}
            Purchase
          {/if}
        </button>
      </footer>
    </section>
  </div>
{/if}
