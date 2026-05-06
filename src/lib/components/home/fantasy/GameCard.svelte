<script lang="ts">
  import { Heart } from 'lucide-svelte';

  export let title: string;
  export let level: string;
  export let progress = 50;
  export let stat = '87%';
  export let cover = 'arcane';

  $: palette =
    cover === 'ember'
      ? 'linear-gradient(135deg, #321125, #cd5a2d 46%, #ffd36e)'
      : cover === 'sky'
        ? 'linear-gradient(135deg, #1d2b75, #7ab5ff 46%, #ffd6a3)'
        : cover === 'void'
          ? 'linear-gradient(135deg, #140d2c, #7c3dff 48%, #ff5cdc)'
          : 'linear-gradient(135deg, #0d3150, #4a78ff 45%, #63f4ff)';
</script>

<article class="game-card">
  <div class="cover" style={`background: ${palette}`} aria-hidden="true">
    <span></span>
  </div>
  <strong>{title}</strong>
  <div class="meta">
    <span>{level}</span>
    <span><Heart size={12} fill="currentColor" /> {stat}</span>
  </div>
  <div class="meter"><span style={`width: ${progress}%`}></span></div>
</article>

<style>
  .game-card {
    display: grid;
    gap: 0.48rem;
    min-width: 0;
    border: 1px solid rgba(161, 146, 255, 0.16);
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.045);
    padding: 0.55rem;
    color: white;
  }

  .cover {
    position: relative;
    aspect-ratio: 1.28;
    overflow: hidden;
    border-radius: 0.72rem;
  }

  .cover::before {
    content: '';
    position: absolute;
    inset: 14% 18% 0;
    border-radius: 50% 50% 0 0;
    background: linear-gradient(180deg, rgba(8, 12, 31, 0.15), rgba(8, 12, 31, 0.76));
    clip-path: polygon(0 100%, 9% 50%, 20% 50%, 26% 22%, 35% 50%, 49% 50%, 56% 0, 66% 50%, 79% 50%, 91% 34%, 100% 100%);
  }

  .cover span {
    position: absolute;
    inset: auto 12% 10% 12%;
    height: 30%;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.32), transparent 60%);
  }

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.82rem;
  }

  .meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.4rem;
    color: rgba(230, 226, 246, 0.68);
    font-size: 0.72rem;
  }

  .meta span:last-child {
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    color: #ff8db5;
  }

  .meter {
    height: 0.22rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #62e8ff, #a75cff, #ff7adf);
  }
</style>
