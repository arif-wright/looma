<script lang="ts">
  import { ArrowRight, Heart, Pencil, Smile } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let playerName = 'Alex';
  export let companionName = 'Lumi';
  export let level = 18;
  export let mood = 'Happy';
  export let bond = 87;
  export let companionAvatarUrl: string | null = null;
</script>

<section class="living-world" aria-labelledby="living-world-title">
  <div class="hero-copy">
    <p>Welcome back,</p>
    <h1 id="living-world-title">{playerName}<span aria-hidden="true">+</span></h1>
    <p class="intro">Your companions missed you. Jump back in and continue your adventure.</p>
    <div class="hero-actions">
      <a class="primary" href="/app/worlds">
        <span>Enter World</span>
        <i class="arrow-chip" aria-hidden="true"><ArrowRight size={16} /></i>
      </a>
      <a class="secondary" href="/app/games">
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
          size="470px"
          framed={false}
          cameraControls={false}
          eager={true}
          glowIntensity={85}
          glowEnabled={true}
          auraColor="cyan"
          visualMood="calm"
          cameraOrbit="180deg 76deg 92%"
          cameraTarget="0m 0.72m 0m"
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
      <i class="stat-icon stat-icon--mood" aria-hidden="true"><Smile size={20} /></i>
      <span>{mood}</span>
    </div>
    <div class="status-row">
      <i class="stat-icon stat-icon--bond" aria-hidden="true"><Heart size={20} /></i>
      <span>Bond</span>
      <strong>{bond}%</strong>
    </div>
  </aside>
</section>

<style>
  .living-world {
    position: relative;
    min-height: clamp(22.7rem, 31vw, 26rem);
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    isolation: isolate;
  }

  .hero-copy {
    position: relative;
    z-index: 2;
    width: min(23rem, 40%);
    padding: clamp(1.9rem, 3vw, 2.55rem) clamp(1.65rem, 3vw, 2.35rem);
  }

  .hero-copy p {
    color: rgba(231, 225, 255, 0.78);
    font-size: 1rem;
    line-height: 1.5;
    margin: 0;
  }

  .hero-copy h1 {
    color: #fff;
    font-size: clamp(3.1rem, 4.85vw, 4.05rem);
    line-height: 0.95;
    margin: 0.38rem 0 1rem;
    letter-spacing: 0;
  }

  .hero-copy h1 span {
    color: #e596ff;
    margin-left: 0.35rem;
    text-shadow: 0 0 24px rgba(255, 92, 220, 0.85);
  }

  .intro {
    max-width: 17rem;
  }

  .hero-actions {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.75rem;
    margin-top: 1.45rem;
  }

  .hero-actions a {
    display: inline-flex;
    min-height: 2.95rem;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    border-radius: 0.74rem;
    padding: 0 1.05rem 0 1.45rem;
    color: white;
    font-weight: 800;
    text-decoration: none;
    white-space: nowrap;
  }

  .primary {
    border: 1px solid rgba(226, 189, 255, 0.36);
    background: linear-gradient(135deg, #805cff, #b45cff 58%, #ff70df);
    box-shadow: 0 0 34px rgba(155, 92, 255, 0.58);
  }

  .arrow-chip {
    display: grid;
    width: 1.85rem;
    height: 1.85rem;
    place-items: center;
    border-radius: 0.55rem;
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.55), transparent 28%),
      rgba(255, 255, 255, 0.14);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 0 18px rgba(255, 255, 255, 0.16);
    font-style: normal;
  }

  .secondary {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(8, 10, 29, 0.64);
    backdrop-filter: blur(18px);
    padding: 0 1.45rem;
  }

  .companion-stage {
    position: absolute;
    left: 40%;
    right: 18%;
    bottom: 0.35rem;
    top: -0.8rem;
    display: grid;
    place-items: end center;
    min-width: 20rem;
  }

  .companion-aura {
    position: absolute;
    inset: 15% -4% -2%;
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
    width: min(33rem, 124%);
    height: min(33rem, 122%);
    object-fit: contain;
    filter: drop-shadow(0 0 42px rgba(77, 244, 255, 0.42));
  }

  .status-card {
    position: absolute;
    right: clamp(1rem, 2vw, 1.45rem);
    bottom: clamp(1.35rem, 3vw, 2rem);
    z-index: 3;
    width: min(9.75rem, 24%);
    border: 1px solid rgba(185, 158, 255, 0.24);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 0% 0%, rgba(94, 242, 255, 0.12), transparent 34%),
      rgba(16, 18, 42, 0.54);
    padding: 0.86rem 0.9rem;
    color: rgba(244, 242, 255, 0.94);
    backdrop-filter: blur(22px);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 24px 60px rgba(3, 5, 20, 0.36);
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
    min-height: 2.35rem;
    margin-top: 0.58rem;
    border-radius: 0.78rem;
    border: 1px solid rgba(255, 255, 255, 0.07);
    background:
      linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.025)),
      radial-gradient(circle at 0% 50%, rgba(94, 242, 255, 0.12), transparent 42%);
    padding: 0 0.58rem;
  }

  .stat-icon {
    display: grid;
    width: 1.55rem;
    height: 1.55rem;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 999px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.38),
      0 0 18px rgba(255, 255, 255, 0.14);
    font-style: normal;
  }

  .stat-icon :global(svg) {
    filter: drop-shadow(0 0 5px currentColor);
  }

  .stat-icon--mood {
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.76), transparent 24%),
      linear-gradient(135deg, #c8ffd5, #69f08f 58%, #31c96b);
    color: #0d5b34;
  }

  .stat-icon--bond {
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.72), transparent 24%),
      linear-gradient(135deg, #ff9ac2, #ff5d96 58%, #ff3c7d);
    color: #ffe4ef;
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

  @media (max-width: 760px) {
    .living-world {
      min-height: min(43.5rem, 88svh);
      border-width: 0 0 1px;
      border-radius: 0 0 1.6rem 1.6rem;
      background: transparent;
    }

    .hero-copy {
      width: 100%;
      padding: max(4.2rem, calc(env(safe-area-inset-top) + 3.6rem)) 1.05rem 0;
      text-align: left;
    }

    .hero-copy p:first-child {
      font-size: 0.82rem;
      font-weight: 800;
      opacity: 0.72;
    }

    .hero-copy h1 {
      font-size: clamp(2rem, 12vw, 3.2rem);
      margin: 0.22rem 0 0.35rem;
    }

    .intro {
      max-width: 13rem;
      font-size: 0.86rem;
      line-height: 1.42;
    }

    .hero-actions {
      position: absolute;
      left: 1rem;
      right: 1rem;
      bottom: 1.05rem;
      z-index: 5;
      display: grid;
      grid-template-columns: 1.08fr 0.92fr;
      gap: 0.65rem;
      margin: 0;
    }

    .hero-actions a {
      min-height: 3.65rem;
      border-radius: 1rem;
      padding: 0 0.8rem;
      font-size: 0.92rem;
    }

    .companion-stage {
      left: 0;
      right: 0;
      top: 8.5rem;
      bottom: 7.4rem;
      min-width: 0;
      place-items: center;
      overflow: visible;
    }

    .companion-aura {
      inset: 4% 2% 0;
      filter: blur(34px);
      opacity: 1;
    }

    .companion-model,
    .companion-image {
      width: min(25rem, 112vw);
      height: min(28rem, 58svh);
    }

    .status-card {
      left: 1rem;
      right: auto;
      bottom: 5.25rem;
      width: min(13.5rem, calc(100vw - 2rem));
      border-radius: 1rem;
      padding: 0.8rem;
      background: rgba(12, 13, 34, 0.58);
    }

    .status-card header strong {
      font-size: 0.9rem;
    }

    .status-card > span,
    .status-row span,
    .status-row strong {
      font-size: 0.76rem;
    }

    .mini-meter {
      margin: 0.45rem 0 0.65rem;
    }

    .status-row {
      margin-top: 0.48rem;
    }

  }

  @media (max-width: 390px) {
    .living-world {
      min-height: 40.5rem;
    }

    .intro {
      display: none;
    }

    .companion-stage {
      top: 7.6rem;
    }

    .status-card {
      bottom: 5rem;
    }
  }
</style>
