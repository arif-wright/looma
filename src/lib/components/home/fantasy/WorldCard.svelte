<script lang="ts">
  import { Users } from 'lucide-svelte';
  import ShardIcon from '$lib/components/ui/ShardIcon.svelte';

  export let name: string;
  export let level = 1;
  export let players = '1.2K';
  export let reward = 24;
  export let tone = 'violet';

  $: palette =
    tone === 'shore'
      ? 'linear-gradient(135deg, #1e3b82, #76d9ff 46%, #f2f6ff)'
      : tone === 'void'
        ? 'linear-gradient(135deg, #160927, #5d32b6 46%, #ff5cdc)'
        : 'linear-gradient(135deg, #321066, #9c5cff 46%, #5ef2ff)';
</script>

<article class="world-card">
  <div class="thumb" style={`background: ${palette}`} aria-hidden="true">
    <span></span>
  </div>
  <strong>{name}</strong>
  <div class="meta">
    <span><ShardIcon size={13} /> {level}</span>
    <span><Users size={12} /> {players}</span>
    <span><ShardIcon size={13} /> {reward}</span>
  </div>
</article>

<style>
  .world-card {
    display: grid;
    gap: 0.44rem;
    min-width: 0;
    border: 1px solid rgba(161, 146, 255, 0.16);
    border-radius: 0.78rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.065), rgba(255, 255, 255, 0.035)),
      rgba(7, 9, 24, 0.5);
    padding: 0.48rem;
    color: white;
  }

  .thumb {
    position: relative;
    aspect-ratio: 1.25;
    overflow: hidden;
    border-radius: 0.62rem;
  }

  .thumb::before {
    content: '';
    position: absolute;
    inset: 17% 16% 0;
    background: rgba(7, 8, 25, 0.62);
    clip-path: polygon(0 100%, 10% 48%, 24% 48%, 31% 18%, 39% 48%, 50% 48%, 56% 0, 63% 48%, 79% 48%, 91% 27%, 100% 100%);
  }

  .thumb::after {
    content: '';
    position: absolute;
    inset: auto 0 0;
    height: 52%;
    background:
      radial-gradient(ellipse at 50% 100%, rgba(99, 244, 255, 0.26), transparent 62%),
      linear-gradient(180deg, transparent, rgba(5, 8, 25, 0.48));
  }

  .thumb span {
    position: absolute;
    right: 14%;
    top: 14%;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 50%;
    background: rgba(255, 218, 137, 0.72);
    filter: blur(1px);
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.78rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.46rem;
    color: rgba(230, 226, 246, 0.72);
    font-size: 0.66rem;
  }

  .meta span {
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
  }

  .meta span:first-child,
  .meta span:last-child {
    color: #c99cff;
  }
</style>
