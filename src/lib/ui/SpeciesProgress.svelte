<script lang="ts">
  import { speciesAccent } from '$lib/ui/speciesAccent';

  export let value: number = 0;
  export let label: string | null = null;
  export let speciesKey: string | null = null;
  export let speciesName: string | null = null;
  export let height: string = '6px';
  export let showPercent: boolean = false;

  const accent = speciesAccent(speciesKey, speciesName);
  $: pct = Math.max(0, Math.min(100, value));
</script>

<div class="flex flex-col gap-1 w-full">
  {#if label}
    <div class="flex justify-between items-center text-xs opacity-80">
      <span>{label}</span>
      {#if showPercent}
        <span>{pct.toFixed(0)}%</span>
      {/if}
    </div>
  {/if}

  <div class="relative w-full rounded-full bg-white/5 overflow-hidden" style={`height:${height}`}>
    <div
      class={"absolute inset-y-0 left-0 rounded-full bg-gradient-to-r " + accent.glow}
      style={`width:${pct}%; box-shadow:0 0 12px rgba(255,255,255,0.2); transition:width 0.3s ease-out;`}
    ></div>
  </div>
</div>
