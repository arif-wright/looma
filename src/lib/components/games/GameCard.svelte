<script lang="ts">
  import type { GameMeta } from '$lib/data/games';

  export let game: GameMeta;
  export let aspect: '16:9' | '1:1' = '16:9';

  const sources = game.cover.sources;
  const srcset = `${sources['512']} 512w, ${sources['640']} 640w, ${sources['960']} 960w, ${sources['1280']} 1280w`;
  const sizes =
    '(min-width: 1536px) 320px, (min-width: 1280px) 280px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

  $: poster = aspect === '1:1' && game.cover.square ? game.cover.square : sources['960'];
  $: ratioClass = aspect === '1:1' ? 'aspect-[1/1]' : 'aspect-[16/9]';

  const handleImageLoad = (event: Event) => {
    const target = event.currentTarget as HTMLImageElement;
    const shimmer = target.previousElementSibling as HTMLElement | null;
    shimmer?.classList.add('opacity-0');
    if (shimmer) {
      setTimeout(() => shimmer.remove(), 220);
    }
  };
</script>

<a
  href={`/app/games/${game.slug}`}
  class="group block rounded-2xl bg-white/[0.02] ring-1 ring-white/10 transition-shadow hover:ring-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
  aria-label={`Play ${game.name}`}
>
  <div class="relative rounded-2xl bg-[linear-gradient(135deg,rgba(0,255,255,.45),rgba(255,0,255,.45))] p-[1px]">
    <div class="rounded-2xl bg-[#0B0E13]">
      <div class={`relative ${ratioClass} overflow-hidden rounded-2xl`}>
        <div class="absolute inset-0 rounded-2xl bg-white/5 transition-opacity duration-200" aria-hidden="true"></div>
        <img
          src={poster}
          srcset={srcset}
          sizes={sizes}
          alt={game.cover.alt}
          loading="lazy"
          decoding="async"
          class="absolute inset-0 h-full w-full object-cover transition-transform duration-300 will-change-transform group-hover:scale-[1.04]"
          on:load={handleImageLoad}
        />
        {#if game.tagline}
          <div class="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/10 backdrop-blur">
            {game.tagline}
          </div>
        {/if}
      </div>
      <div class="flex items-center justify-between px-3 py-2">
        <h3 class="text-sm font-semibold text-white">{game.name}</h3>
        <span class="text-[11px] text-white/60 transition-colors group-hover:text-white/80">Play →</span>
      </div>
    </div>
  </div>
</a>

<style>
  :global(img) {
    image-rendering: auto;
  }
</style>
