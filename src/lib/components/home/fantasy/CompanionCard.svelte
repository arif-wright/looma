<script lang="ts">
  import { Heart, Star } from 'lucide-svelte';

  export let name: string;
  export let level = 1;
  export let bond = 50;
  export let mood = 'Calm';
  export let accent = 'violet';
  export let favorite = false;
  export let avatarUrl: string | null = null;

  $: hue =
    accent === 'ember'
      ? 'rgba(255, 125, 45, 0.92)'
      : accent === 'verdant'
        ? 'rgba(166, 233, 77, 0.84)'
        : accent === 'silver'
          ? 'rgba(188, 199, 220, 0.88)'
          : 'rgba(118, 220, 255, 0.94)';
</script>

<article class="companion-card" style={`--accent: ${hue}`}>
  <button class="favorite" type="button" aria-label={favorite ? `${name} is a favorite` : `Favorite ${name}`}>
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
    min-height: 13.4rem;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--accent), transparent 55%);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 50% 20%, color-mix(in srgb, var(--accent), transparent 48%), transparent 38%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.035));
    padding: 0.75rem;
    color: white;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .favorite {
    position: absolute;
    right: 0.75rem;
    top: 0.75rem;
    z-index: 2;
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

  .portrait {
    display: grid;
    height: 7.5rem;
    place-items: center;
  }

  .portrait img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .creature {
    position: relative;
    width: 5.5rem;
    height: 5.8rem;
    border-radius: 48% 48% 42% 42%;
    background:
      radial-gradient(circle at 35% 38%, #031434 0 9%, transparent 10%),
      radial-gradient(circle at 65% 38%, #031434 0 9%, transparent 10%),
      radial-gradient(circle at 50% 15%, rgba(255, 255, 255, 0.42), transparent 15%),
      linear-gradient(160deg, color-mix(in srgb, var(--accent), white 18%), color-mix(in srgb, var(--accent), black 30%));
    box-shadow: 0 0 42px color-mix(in srgb, var(--accent), transparent 26%);
  }

  .creature::before,
  .creature::after {
    content: '';
    position: absolute;
    top: 1.35rem;
    width: 2.4rem;
    height: 2.6rem;
    border-radius: 70% 20% 70% 20%;
    background: linear-gradient(135deg, color-mix(in srgb, var(--accent), white 24%), transparent);
    opacity: 0.82;
  }

  .creature::before {
    left: -1.6rem;
    transform: rotate(-24deg);
  }

  .creature::after {
    right: -1.6rem;
    transform: scaleX(-1) rotate(-24deg);
  }

  .copy {
    display: grid;
    gap: 0.16rem;
  }

  .copy strong {
    font-size: 0.94rem;
  }

  .copy span,
  .meta {
    color: rgba(226, 222, 246, 0.72);
    font-size: 0.78rem;
  }

  .meta {
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
