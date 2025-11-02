<script lang="ts">
  import {
    Award,
    BadgeCheck,
    Crown,
    Flame,
    Flag,
    Medal,
    Sparkles,
    Star,
    Trophy,
    Zap
  } from 'lucide-svelte';

  const iconMap: Record<string, typeof Trophy> = {
    trophy: Trophy,
    sparkles: Sparkles,
    medal: Medal,
    crown: Crown,
    flag: Flag,
    fire: Flame,
    flame: Flame,
    star: Star,
    lightning: Zap,
    badge: BadgeCheck,
    award: Award
  };

  export let icon: string = 'trophy';
  export let label = 'Achievement';
  export let size = 28;

  $: Component = iconMap[icon] ?? Award;
</script>

<span class="achievement-icon" role="img" aria-label={label} data-testid="achievement-icon">
  <svelte:component this={Component} size={size} stroke-width={2} aria-hidden="true" />
</span>

<style>
  .achievement-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--achievement-icon-size, 2.75rem);
    height: var(--achievement-icon-size, 2.75rem);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.92);
  }

  .achievement-icon :global(svg) {
    width: 70%;
    height: 70%;
  }
</style>
