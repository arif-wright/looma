<script lang="ts">
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';
  import type { AchievementShareMeta } from '$lib/social/types';

  export let meta: AchievementShareMeta;
  export let compact = false;

  const rarityLabel = () => {
    const value = meta?.achievement?.rarity ?? meta?.preview?.subtitle ?? 'Common';
    if (typeof value !== 'string') return 'Common';
    const lower = value.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const points = () => Math.max(0, Math.floor(meta?.achievement?.points ?? 0));
  const link = () => meta?.deepLink ?? '/app/achievements';
  const name = () => meta?.achievement?.name ?? meta?.preview?.title ?? 'New achievement';
  const icon = () => meta?.achievement?.icon ?? meta?.preview?.icon ?? 'trophy';
</script>

<article class={`achievement-share-card ${compact ? 'compact' : ''}`} data-testid="achievement-share-card">
  <div class="card-media" aria-hidden="true">
    <AchievementIcon icon={icon()} label={name()} size={48} />
  </div>
  <div class="card-content">
    <header class="card-header">
      <p class="card-label">Achievement unlocked</p>
      <h3 class="card-title">{name()}</h3>
    </header>

    <div class="card-meta">
      <span class={`rarity rarity-${rarityLabel().toLowerCase()}`}>{rarityLabel()}</span>
      <span class="points">+{points()} pts</span>
    </div>

    <a class="card-cta" href={link()} data-testid="achievement-share-cta">
      View achievements
    </a>
  </div>
</article>

<style>
  .achievement-share-card {
    width: 100%;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1rem;
    align-items: center;
    padding: 1rem 1.2rem;
    border-radius: 1rem;
    border: 1px solid rgba(155, 124, 255, 0.18);
    background: linear-gradient(135deg, rgba(170, 130, 255, 0.35), rgba(40, 25, 62, 0.7));
    color: rgba(245, 240, 255, 0.95);
    box-shadow: 0 20px 42px rgba(14, 10, 32, 0.55);
  }

  .achievement-share-card.compact {
    grid-template-columns: 1fr;
    text-align: center;
  }

  .card-media {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 1rem;
    background: rgba(30, 20, 58, 0.65);
    border: 1px solid rgba(200, 170, 255, 0.28);
    box-shadow: inset 0 0 18px rgba(200, 160, 255, 0.25);
  }

  .card-content {
    display: grid;
    gap: 0.75rem;
  }

  .card-header {
    display: grid;
    gap: 0.3rem;
  }

  .card-label {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(240, 228, 255, 0.7);
  }

  .card-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }

  .rarity {
    padding: 0.25rem 0.65rem;
    border-radius: 999px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    background: rgba(255, 255, 255, 0.16);
    color: rgba(20, 12, 32, 0.85);
  }

  .rarity-rare {
    background: rgba(120, 214, 255, 0.22);
    color: rgba(10, 28, 45, 0.92);
  }

  .rarity-epic {
    background: rgba(192, 154, 255, 0.28);
    color: rgba(41, 18, 74, 0.92);
  }

  .rarity-legendary {
    background: rgba(255, 210, 140, 0.28);
    color: rgba(56, 30, 0, 0.9);
  }

  .points {
    font-size: 0.9rem;
    font-weight: 600;
  }

  .card-cta {
    justify-self: flex-start;
    display: inline-flex;
    align-items: center;
    padding: 0.55rem 1.3rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    color: rgba(36, 22, 58, 0.96);
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .card-cta:hover,
  .card-cta:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 12px 30px rgba(180, 150, 255, 0.32);
    outline: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .card-cta {
      transition: none;
    }
  }
</style>
