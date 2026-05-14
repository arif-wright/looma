<script lang="ts">
  import { Heart, Star } from 'lucide-svelte';

  export let id: string | null = null;
  export let name: string;
  export let level = 1;
  export let bond = 50;
  export let mood = 'Calm';
  export let accent = 'violet';
  export let favorite = false;
  export let avatarUrl: string | null = null;
  export let backgroundUrl: string | null = null;
  export let href: string | null = null;
  export let activating = false;
  export let onActivate: (id: string) => void = () => {};

  $: hue =
    accent === 'ember'
      ? 'rgba(255, 125, 45, 0.92)'
      : accent === 'verdant'
        ? 'rgba(166, 233, 77, 0.84)'
        : accent === 'silver'
          ? 'rgba(188, 199, 220, 0.88)'
          : 'rgba(118, 220, 255, 0.94)';
  $: cardStyle = backgroundUrl
    ? `--accent: ${hue}; --card-bg: url('${backgroundUrl}')`
    : `--accent: ${hue}`;
</script>

<article class="companion-card" style={cardStyle}>
  {#if href}
    <a class="card-link" href={href} aria-label={`Open ${name}`}></a>
  {/if}
  <button
    class="favorite"
    type="button"
    aria-label={favorite ? `${name} is your active companion` : `Make ${name} your active companion`}
    aria-pressed={favorite}
    disabled={activating || favorite || !id}
    on:click|preventDefault|stopPropagation={() => {
      if (id) onActivate(id);
    }}
  >
    <Star size={16} fill={favorite ? 'currentColor' : 'none'} />
  </button>
  <div class="portrait">
    {#if avatarUrl}
      <img src={avatarUrl} alt={name} />
    {:else}
      <span class="creature" aria-hidden="true"></span>
    {/if}
  </div>
  <div class="copy">
    <strong>{name}</strong>
    <span>Level {level}</span>
  </div>
  <div class="meta">
    <span>{mood}</span>
    <span><Heart size={13} fill="currentColor" /> {bond}%</span>
  </div>
  <div class="meter" aria-label={`Bond ${bond}%`}><span style={`width: ${bond}%`}></span></div>
</article>

<style>
  .companion-card {
    position: relative;
    min-height: 12.2rem;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent), transparent 55%);
    border-radius: 0.86rem;
    background:
      radial-gradient(circle at 50% 22%, color-mix(in srgb, var(--accent), transparent 34%), transparent 40%),
      radial-gradient(circle at 50% 62%, color-mix(in srgb, var(--accent), transparent 74%), transparent 30%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.035));
    padding: 0.68rem;
    color: white;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .companion-card::before,
  .companion-card::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .companion-card::before {
    z-index: 0;
    background-image: var(--card-bg, none);
    background-size: cover;
    background-position: center;
    opacity: 0.52;
    filter: saturate(1.2) contrast(1.06);
    transform: scale(1.04);
  }

  .companion-card::after {
    z-index: 1;
    background:
      linear-gradient(180deg, rgba(7, 8, 24, 0.14), rgba(7, 8, 24, 0.84) 72%, rgba(5, 6, 18, 0.94));
  }

  .favorite {
    position: absolute;
    right: 0.75rem;
    top: 0.75rem;
    z-index: 4;
    display: grid;
    width: 1.8rem;
    height: 1.8rem;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: rgba(7, 9, 24, 0.42);
    color: #ffd36e;
    cursor: pointer;
  }

  .card-link {
    position: absolute;
    inset: 0;
    z-index: 3;
    border-radius: inherit;
  }

  .card-link:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent), white 18%);
    outline-offset: -3px;
  }

  .favorite:disabled {
    cursor: default;
    opacity: 0.82;
  }

  .portrait {
    position: relative;
    z-index: 2;
    display: grid;
    height: 7.1rem;
    place-items: center;
  }

  .portrait img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .creature {
    position: relative;
    width: 6rem;
    height: 6.35rem;
    border-radius: 48% 48% 42% 42%;
    background:
      radial-gradient(circle at 35% 38%, #05153d 0 10%, #69efff 10% 15%, transparent 16%),
      radial-gradient(circle at 65% 38%, #05153d 0 10%, #69efff 10% 15%, transparent 16%),
      radial-gradient(circle at 50% 16%, rgba(255, 255, 255, 0.48), transparent 14%),
      linear-gradient(130deg, transparent 0 38%, rgba(255, 255, 255, 0.18) 39% 41%, transparent 42% 100%),
      linear-gradient(160deg, color-mix(in srgb, var(--accent), white 18%), color-mix(in srgb, var(--accent), black 30%));
    box-shadow: 0 0 42px color-mix(in srgb, var(--accent), transparent 26%);
  }

  .creature::before,
  .creature::after {
    content: '';
    position: absolute;
    top: 1.45rem;
    width: 2.9rem;
    height: 3.1rem;
    border-radius: 70% 20% 70% 20%;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent), white 24%), transparent);
    opacity: 0.82;
  }

  .creature::before {
    left: -2rem;
    transform: rotate(-24deg);
  }

  .creature::after {
    right: -2rem;
    transform: scaleX(-1) rotate(-24deg);
  }

  .copy {
    position: relative;
    z-index: 2;
    display: grid;
    gap: 0.16rem;
  }

  .copy strong {
    font-size: 0.86rem;
  }

  .copy span,
  .meta {
    color: rgba(226, 222, 246, 0.72);
    font-size: 0.72rem;
  }

  .meta {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }

  .meta span:last-child {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: #ff93bd;
  }

  .meter {
    position: relative;
    z-index: 2;
    height: 0.25rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    margin-top: 0.55rem;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, #62e8ff, var(--accent), #ff6fe1);
  }
</style>
