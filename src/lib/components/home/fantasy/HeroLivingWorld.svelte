<script lang="ts">
  import { ArrowRight, Pencil } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let playerName = 'Alex';
  export let companionName = 'Lumi';
  export let level = 18;
  export let mood = 'Happy';
  export let bond = 87;
  export let companionAvatarUrl: string | null = null;

  const moodIconByKey: Record<string, string> = {
    calm: '/assets/steady.png',
    content: '/assets/steady.png',
    curious: '/assets/curious.png',
    distant: '/assets/sleepy.png',
    energized: '/assets/happy.png',
    happy: '/assets/happy.png',
    idle: '/assets/steady.png',
    low_energy: '/assets/sleepy.png',
    neutral: '/assets/steady.png',
    radiant: '/assets/happy.png',
    resting: '/assets/sleepy.png',
    sleep: '/assets/sleepy.png',
    sleepy: '/assets/sleepy.png',
    steady: '/assets/steady.png',
    tired: '/assets/sleepy.png'
  };

  const moodIconFor = (value: string) => {
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return moodIconByKey[key] ?? '/assets/steady.png';
  };

  $: moodIconUrl = moodIconFor(mood);
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
    <div class="scene-particles scene-particles--back" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
    <div class="scene-ground" aria-hidden="true">
      <span class="scene-ground__shadow"></span>
      <span class="scene-ground__ring"></span>
      <span class="scene-ground__glow"></span>
    </div>
    <div class="companion-aura" aria-hidden="true"></div>
    {#if companionAvatarUrl}
      <img class="companion-image" src={companionAvatarUrl} alt={companionName} />
    {:else}
      <div class="companion-model">
        <MuseModel
          minSize="0px"
          size="100%"
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
    <div class="scene-particles scene-particles--front" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>

  <aside class="status-card" aria-label={`${companionName} status`}>
    <header>
      <strong>{companionName}</strong>
      <Pencil size={14} />
    </header>
    <span>Level {level}</span>
    <div class="mini-meter"><span style={`width: ${Math.min(100, level * 4)}%`}></span></div>
    <div class="status-row mood">
      <i class="stat-icon stat-icon--mood" aria-hidden="true">
        <img src={moodIconUrl} alt="" loading="eager" />
      </i>
      <span>{mood}</span>
    </div>
    <div class="status-row">
      <i class="stat-icon stat-icon--bond" aria-hidden="true">
        <img src="/assets/heart.png" alt="" loading="eager" />
      </i>
      <span>Bond</span>
      <strong>{bond}%</strong>
    </div>
  </aside>
</section>

<style>
  .living-world {
    position: relative;
    min-height: clamp(25rem, 34vw, 29rem);
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
    left: var(--hero-stage-left, 40%);
    right: var(--hero-stage-right, 18%);
    bottom: var(--hero-stage-bottom, 0.35rem);
    top: var(--hero-stage-top, -0.8rem);
    display: grid;
    place-items: end center;
    min-width: 20rem;
    transform: translate(var(--hero-stage-translate-x, 0), var(--hero-stage-translate-y, 0));
    isolation: isolate;
    pointer-events: none;
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
    z-index: 0;
    pointer-events: none;
  }

  .scene-ground {
    position: absolute;
    left: 50%;
    bottom: var(--hero-bridge-ground-bottom, 4%);
    z-index: 1;
    width: var(--hero-bridge-ground-width, 54%);
    height: var(--hero-bridge-ground-height, 15%);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .scene-ground span {
    position: absolute;
    inset: 0;
    border-radius: 50%;
  }

  .scene-ground__shadow {
    background: radial-gradient(
      ellipse at center,
      rgba(var(--hero-bridge-shadow-rgb, 9 5 28) / 0.5),
      rgba(var(--hero-bridge-shadow-rgb, 9 5 28) / 0.18) 46%,
      transparent 78%
    );
    filter: blur(16px);
    transform: scaleX(1.26);
  }

  .scene-ground__ring {
    border: 1px solid rgba(var(--hero-bridge-secondary-rgb, 94 242 255) / 0.18);
    box-shadow:
      0 0 28px rgba(var(--hero-bridge-primary-rgb, 155 92 255) / calc(0.16 * var(--hero-bridge-intensity, 0.86))),
      inset 0 0 30px rgba(var(--hero-bridge-secondary-rgb, 94 242 255) / 0.08);
    filter: blur(1.8px);
    opacity: calc(0.38 * var(--hero-bridge-intensity, 0.86));
  }

  .scene-ground__glow {
    background:
      radial-gradient(ellipse at 50% 48%, rgba(var(--hero-bridge-secondary-rgb, 94 242 255) / 0.16), transparent 34%),
      radial-gradient(ellipse at 50% 58%, rgba(var(--hero-bridge-primary-rgb, 155 92 255) / 0.18), transparent 68%);
    filter: blur(13px);
    opacity: calc(0.84 * var(--hero-bridge-intensity, 0.86));
  }

  .scene-particles {
    position: absolute;
    inset: 4% -2% 2%;
    z-index: 1;
    overflow: visible;
    pointer-events: none;
  }

  .scene-particles--front {
    z-index: 3;
  }

  .scene-particles span {
    position: absolute;
    width: var(--mote-size, 0.34rem);
    height: var(--mote-size, 0.34rem);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 28%, rgba(255, 255, 255, 0.95), transparent 26%),
      radial-gradient(circle, rgba(var(--mote-rgb, var(--hero-bridge-secondary-rgb, 94 242 255)) / 0.96), transparent 72%);
    box-shadow:
      0 0 12px rgba(var(--mote-rgb, var(--hero-bridge-secondary-rgb, 94 242 255)) / 0.76),
      0 0 28px rgba(var(--hero-bridge-primary-rgb, 155 92 255) / 0.28);
    opacity: calc(var(--mote-opacity, 0.72) * var(--hero-bridge-intensity, 0.86));
    animation: sceneMoteFloat var(--mote-duration, 8s) ease-in-out infinite;
    animation-delay: var(--mote-delay, 0s);
  }

  .scene-particles--back span:nth-child(1) {
    --mote-size: 0.28rem;
    --mote-duration: 9.5s;
    --mote-delay: -1s;
    left: 16%;
    top: 36%;
  }

  .scene-particles--back span:nth-child(2) {
    --mote-rgb: var(--hero-bridge-primary-rgb, 155 92 255);
    --mote-size: 0.42rem;
    --mote-duration: 11s;
    --mote-delay: -4s;
    left: 76%;
    top: 28%;
  }

  .scene-particles--back span:nth-child(3) {
    --mote-size: 0.22rem;
    --mote-duration: 7.5s;
    --mote-delay: -2.6s;
    left: 31%;
    top: 54%;
  }

  .scene-particles--back span:nth-child(4) {
    --mote-rgb: var(--hero-bridge-accent-rgb, 255 112 223);
    --mote-size: 0.36rem;
    --mote-duration: 10s;
    --mote-delay: -6s;
    left: 67%;
    top: 62%;
  }

  .scene-particles--back span:nth-child(5) {
    --mote-size: 0.24rem;
    --mote-duration: 12s;
    --mote-delay: -8s;
    left: 44%;
    top: 24%;
  }

  .scene-particles--back span:nth-child(6) {
    --mote-rgb: var(--hero-bridge-primary-rgb, 155 92 255);
    --mote-size: 0.3rem;
    --mote-duration: 8.5s;
    --mote-delay: -3.2s;
    left: 86%;
    top: 50%;
  }

  .scene-particles--front span:nth-child(1) {
    --mote-rgb: var(--hero-bridge-accent-rgb, 255 112 223);
    --mote-size: 0.34rem;
    --mote-duration: 7.5s;
    --mote-delay: -2s;
    left: 25%;
    top: 66%;
  }

  .scene-particles--front span:nth-child(2) {
    --mote-size: 0.28rem;
    --mote-duration: 8.5s;
    --mote-delay: -5s;
    left: 58%;
    top: 42%;
  }

  .scene-particles--front span:nth-child(3) {
    --mote-rgb: var(--hero-bridge-primary-rgb, 155 92 255);
    --mote-size: 0.4rem;
    --mote-duration: 10s;
    --mote-delay: -7s;
    left: 72%;
    top: 72%;
  }

  .scene-particles--front span:nth-child(4) {
    --mote-size: 0.22rem;
    --mote-duration: 7s;
    --mote-delay: -1.5s;
    left: 42%;
    top: 76%;
  }

  .companion-model,
  .companion-image {
    position: relative;
    z-index: 2;
    width: var(--hero-stage-width, min(33rem, 124%));
    height: var(--hero-stage-height, min(33rem, 122%));
    object-fit: contain;
    filter: drop-shadow(0 0 42px rgba(77, 244, 255, 0.42));
  }

  @keyframes sceneMoteFloat {
    0%,
    100% {
      transform: translate3d(0, 0, 0) scale(0.92);
    }
    42% {
      transform: translate3d(0.7rem, -1.1rem, 0) scale(1.08);
    }
    68% {
      transform: translate3d(-0.45rem, -0.45rem, 0) scale(0.98);
    }
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
    font-style: normal;
  }

  .stat-icon :global(svg) {
    filter: drop-shadow(0 0 5px currentColor);
  }

  .stat-icon img {
    display: block;
    width: 1.38rem;
    height: 1.38rem;
    object-fit: contain;
  }

  .stat-icon--mood {
    color: inherit;
  }

  .stat-icon--bond {
    color: inherit;
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
      transform: translate(0, var(--hero-stage-mobile-translate-y, 0));
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
      min-height: min(43.5rem, 86svh);
      border-width: 0 0 1px;
      border-radius: 0 0 1.6rem 1.6rem;
      background: transparent;
    }

    .hero-copy {
      width: 100%;
      padding: max(6rem, calc(env(safe-area-inset-top) + 5rem)) 1.35rem 0;
      text-align: left;
    }

    .hero-copy p:first-child {
      font-size: clamp(1.55rem, 7vw, 2.1rem);
      font-weight: 800;
      color: #fff;
      opacity: 0.94;
      font-family: Georgia, 'Times New Roman', serif;
      line-height: 1.08;
    }

    .hero-copy h1 {
      font-size: clamp(1.55rem, 7vw, 2.1rem);
      margin: 0.08rem 0 0.6rem;
      font-family: Georgia, 'Times New Roman', serif;
      font-weight: 700;
      line-height: 1.08;
    }

    .intro {
      max-width: 17rem;
      font-size: clamp(1rem, 4vw, 1.16rem);
      line-height: 1.42;
      color: rgba(245, 239, 255, 0.76);
    }

    .hero-actions {
      display: none;
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
      top: var(--hero-stage-mobile-top, 8.5rem);
      bottom: var(--hero-stage-mobile-bottom, 7.4rem);
      min-width: 0;
      place-items: center;
      overflow: visible;
      transform: translate(0, var(--hero-stage-mobile-translate-y, 0));
    }

    .companion-aura {
      inset: 4% 2% 0;
      filter: blur(34px);
      opacity: 1;
    }

    .companion-model,
    .companion-image {
      width: var(--hero-stage-mobile-width, min(25rem, 112vw));
      height: var(--hero-stage-mobile-height, min(28rem, 58svh));
    }

    .status-card {
      left: 1.05rem;
      right: auto;
      bottom: 12.5rem;
      width: min(13.8rem, calc(100vw - 2.1rem));
      border-radius: 1.15rem;
      padding: 0.95rem;
      background: rgba(14, 10, 34, 0.72);
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
