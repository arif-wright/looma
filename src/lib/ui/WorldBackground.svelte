<script lang="ts">
  export let intensity: 'subtle' | 'medium' = 'subtle';
  export let reduced = false;

  type DotPosition = { cx: string; cy: string };

  const calcPositions = (count: number): DotPosition[] =>
    Array.from({ length: count }, (_, idx) => {
      const cx = ((idx * 37) % 100).toFixed(2);
      const cy = ((idx * 61) % 100).toFixed(2);
      return { cx: `${cx}%`, cy: `${cy}%` };
    });

  let dotPositions: DotPosition[] = [];

  $: dotPositions = calcPositions(intensity === 'medium' ? 90 : 50);
</script>

<div class="world-bg absolute inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
  <div
    class="absolute inset-0 bg-[radial-gradient(1200px_800px_at_20%_10%,rgba(64,180,255,.15),transparent),radial-gradient(1000px_700px_at_80%_40%,rgba(255,90,210,.12),transparent),radial-gradient(900px_600px_at_50%_90%,rgba(160,120,255,.10),transparent)]"
    aria-hidden="true"
  />
  {#if !reduced}
    <svg class="absolute inset-0 h-full w-full opacity-30" aria-hidden="true" preserveAspectRatio="none">
      {#each dotPositions as dot (dot.cx + dot.cy)}
        <circle r="1.5" cx={dot.cx} cy={dot.cy} class="fill-white/40" />
      {/each}
    </svg>
  {/if}
  <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20" aria-hidden="true" />
</div>
