<script lang="ts">
  import { ArrowRight, Gamepad2, Heart, Pencil, Smile } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let playerName = 'Alex';
  export let companionName = 'Lumi';
  export let level = 18;
  export let mood = 'Happy';
  export let bond = 87;
  export let companionAvatarUrl: string | null = null;
</script>

<section class="living-world" aria-labelledby="living-world-title">
  <div class="stars" aria-hidden="true"></div>
  <div class="world-depth" aria-hidden="true">
    <span class="moon"></span>
    <span class="castle castle-one"></span>
    <span class="castle castle-two"></span>
    <span class="path"></span>
  </div>

  <div class="hero-copy">
    <p>Welcome back,</p>
    <h1 id="living-world-title">{playerName}<span aria-hidden="true">+</span></h1>
    <p class="intro">Your companions missed you. Jump back in and continue your adventure.</p>
    <div class="hero-actions">
      <a class="primary" href="/app/worlds">
        <span>Enter World</span>
        <ArrowRight size={18} />
      </a>
      <a class="secondary" href="/app/games">
        <Gamepad2 size={18} />
        <span>Play a Game</span>
      </a>
    </div>
  </div>

  <div class="companion-stage">
    <div class="companion-aura" aria-hidden="true"></div>
    {#if companionAvatarUrl}
      <img class="companion-image" src={companionAvatarUrl} alt={companionName} />
    {:else}
      <div class="companion-model">
        <MuseModel
          minSize="280px"
          size="420px"
          framed={false}
          cameraControls={false}
          eager={true}
          glowIntensity={85}
          glowEnabled={true}
          auraColor="cyan"
          visualMood="calm"
        />
      </div>
    {/if}
  </div>

  <aside class="status-card" aria-label={`${companionName} status`}>
    <header>
      <strong>{companionName}</strong>
      <Pencil size={14} />
    </header>
    <span>Level {level}</span>
    <div class="mini-meter"><span style={`width: ${Math.min(100, level * 4)}%`}></span></div>
    <div class="status-row mood">
      <Smile size={21} />
      <span>{mood}</span>
    </div>
    <div class="status-row">
      <Heart size={21} />
      <span>Bond</span>
      <strong>{bond}%</strong>
    </div>
  </aside>
</section>

<style>
  .living-world {
    position: relative;
    min-height: clamp(27rem, 45vw, 34rem);
    overflow: hidden;
    border: 1px solid rgba(154, 130, 255, 0.18);
    border-radius: 1.35rem;
    background:
      linear-gradient(90deg, rgba(7, 9, 25, 0.94), rgba(9, 11, 34, 0.54) 46%, rgba(7, 8, 22, 0.82)),
      radial-gradient(circle at 58% 48%, rgba(75, 244, 255, 0.18), transparent 24%),
      radial-gradient(circle at 75% 15%, rgba(141, 83, 255, 0.25), transparent 20%),
      linear-gradient(135deg, #0a0d25, #15134a 46%, #070817);
    box-shadow: 0 30px 90px rgba(2, 3, 14, 0.38);
    isolation: isolate;
  }

  .living-world::after {
    content: '';
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, transparent 56%, rgba(3, 5, 15, 0.72)),
      radial-gradient(circle at 52% 62%, rgba(94, 242, 255, 0.18), transparent 19%);
    pointer-events: none;
    z-index: -1;
  }

  .stars,
  .stars::before {
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle, rgba(255, 255, 255, 0.8) 0 1px, transparent 1.6px),
      radial-gradient(circle, rgba(98, 232, 255, 0.8) 0 1px, transparent 1.4px),
      radial-gradient(circle, rgba(255, 92, 220, 0.8) 0 1px, transparent 1.4px);
    background-position:
      8% 12%,
      70% 8%,
      36% 72%;
    background-size:
      8.5rem 7rem,
      11rem 8rem,
      9rem 10rem;
    opacity: 0.5;
  }

  .stars::before {
    content: '';
    filter: blur(1px);
    opacity: 0.5;
    transform: translateY(1.5rem);
  }

  .world-depth {
    position: absolute;
    inset: 0;
    z-index: -1;
  }

  .moon {
    position: absolute;
    right: 14%;
    top: 11%;
    width: 3.3rem;
    height: 3.3rem;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #ffd989, #9b5cff 54%, transparent 58%);
    filter: blur(0.5px);
    opacity: 0.55;
  }

  .castle {
    position: absolute;
    bottom: 24%;
    width: 14rem;
    height: 14rem;
    opacity: 0.48;
    filter: drop-shadow(0 0 22px rgba(109, 78, 255, 0.4));
    clip-path: polygon(8% 100%, 8% 55%, 17% 55%, 17% 38%, 27% 38%, 32% 11%, 39% 38%, 50% 38%, 50% 61%, 62% 61%, 62% 44%, 73% 44%, 79% 22%, 86% 44%, 94% 44%, 94% 100%);
    background: linear-gradient(180deg, rgba(90, 75, 190, 0.86), rgba(8, 12, 34, 0.95));
  }

  .castle-one {
    left: 23%;
  }

  .castle-two {
    right: 5%;
    bottom: 18%;
    transform: scale(0.78);
  }

  .path {
    position: absolute;
    left: 38%;
    right: 25%;
    bottom: 0;
    height: 30%;
    border-radius: 50% 50% 0 0;
    background: radial-gradient(ellipse at 50% 90%, rgba(96, 245, 255, 0.2), rgba(142, 83, 255, 0.08) 48%, transparent 70%);
  }

  .hero-copy {
    position: relative;
    z-index: 2;
    width: min(26rem, 48%);
    padding: clamp(2rem, 4vw, 3.2rem);
  }

  .hero-copy p {
    color: rgba(231, 225, 255, 0.76);
    font-size: 1rem;
    line-height: 1.55;
    margin: 0;
  }

  .hero-copy h1 {
    color: #fff;
    font-size: clamp(3rem, 7vw, 5rem);
    line-height: 0.95;
    margin: 0.4rem 0 1.2rem;
    letter-spacing: 0;
  }

  .hero-copy h1 span {
    color: #e596ff;
    margin-left: 0.35rem;
    text-shadow: 0 0 24px rgba(255, 92, 220, 0.85);
  }

  .intro {
    max-width: 19rem;
  }

  .hero-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    margin-top: 1.8rem;
  }

  .hero-actions a {
    display: inline-flex;
    min-height: 3.25rem;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    border-radius: 0.8rem;
    padding: 0 1.35rem;
    color: white;
    font-weight: 800;
    text-decoration: none;
  }

  .primary {
    border: 1px solid rgba(226, 189, 255, 0.36);
    background: linear-gradient(135deg, #805cff, #b45cff 58%, #ff70df);
    box-shadow: 0 0 34px rgba(155, 92, 255, 0.58);
  }

  .secondary {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(8, 10, 29, 0.64);
    backdrop-filter: blur(18px);
  }

  .companion-stage {
    position: absolute;
    left: 43%;
    right: 16%;
    bottom: 1.25rem;
    top: 1rem;
    display: grid;
    place-items: end center;
    min-width: 20rem;
  }

  .companion-aura {
    position: absolute;
    inset: 15% 10% 0;
    border-radius: 50%;
    background:
      radial-gradient(circle, rgba(94, 242, 255, 0.45), transparent 34%),
      radial-gradient(circle, rgba(155, 92, 255, 0.58), transparent 54%);
    filter: blur(28px);
    opacity: 0.85;
  }

  .companion-model,
  .companion-image {
    position: relative;
    z-index: 2;
    width: min(28rem, 100%);
    height: min(30rem, 100%);
    object-fit: contain;
    filter: drop-shadow(0 0 36px rgba(77, 244, 255, 0.34));
  }

  .status-card {
    position: absolute;
    right: clamp(1rem, 2vw, 2rem);
    bottom: clamp(1rem, 3vw, 2rem);
    z-index: 3;
    width: min(15rem, 31%);
    border: 1px solid rgba(185, 158, 255, 0.24);
    border-radius: 1.2rem;
    background: rgba(16, 18, 42, 0.62);
    padding: 1rem;
    color: rgba(244, 242, 255, 0.94);
    backdrop-filter: blur(22px);
    box-shadow: 0 24px 60px rgba(3, 5, 20, 0.36);
  }

  .status-card header,
  .status-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .status-card header {
    justify-content: space-between;
  }

  .status-card > span {
    color: rgba(221, 218, 244, 0.68);
    font-size: 0.78rem;
  }

  .mini-meter {
    height: 0.28rem;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0.55rem 0 1rem;
  }

  .mini-meter span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #62e8ff, #b45cff);
    border-radius: inherit;
  }

  .status-row {
    margin-top: 0.75rem;
  }

  .status-row :global(svg) {
    color: #ff77bd;
    fill: currentColor;
  }

  .status-row.mood :global(svg) {
    color: #9cffb4;
  }

  .status-row span {
    color: rgba(236, 233, 255, 0.84);
    font-size: 0.9rem;
  }

  .status-row strong {
    color: #ff95d7;
    margin-left: auto;
  }

  @media (max-width: 900px) {
    .living-world {
      min-height: 43rem;
    }

    .hero-copy {
      width: 100%;
      padding-right: 1.25rem;
    }

    .companion-stage {
      left: 6%;
      right: 6%;
      top: 13rem;
      bottom: 4.5rem;
      min-width: 0;
    }

    .status-card {
      left: 1rem;
      right: 1rem;
      bottom: 1rem;
      width: auto;
    }
  }
</style>
