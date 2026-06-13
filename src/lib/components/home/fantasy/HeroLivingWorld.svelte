<script lang="ts">
  import { Pencil } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let companionId: string | null = null;
  export let companionHref = '/app/companions';
  export let playerName = 'Alex';
  export let companionName = 'Lumi';
  export let mood = 'Happy';
  export let bond = 87;
  export let relationalState: 'Distant' | 'Near' | 'Resonant' = 'Near';
  export let relationalReason = 'A small moment together will help this bond keep growing.';
  export let modelLoaded = false;
  export let onRename: (id: string, name: string) => Promise<void> = async () => {};

  let renameMode = false;
  let renameValue = '';
  let renameBusy = false;
  let renameError: string | null = null;

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

  const startRename = () => {
    renameValue = companionName;
    renameError = null;
    renameMode = true;
  };

  const cancelRename = () => {
    renameMode = false;
    renameError = null;
    renameValue = '';
  };

  const submitRename = async () => {
    const nextName = renameValue.trim();
    if (!companionId) {
      renameError = 'Choose a companion first.';
      return;
    }
    if (nextName.length < 1 || nextName.length > 32) {
      renameError = 'Use 1-32 characters.';
      return;
    }
    if (nextName === companionName) {
      cancelRename();
      return;
    }

    renameBusy = true;
    renameError = null;
    try {
      await onRename(companionId, nextName);
      renameMode = false;
      renameValue = '';
    } catch (error) {
      console.error('[HeroLivingWorld] rename failed', error);
      renameError = 'Could not save name.';
    } finally {
      renameBusy = false;
    }
  };

  $: moodIconUrl = moodIconFor(mood);
</script>

<section class="living-world" aria-labelledby="living-world-title">
  <div class="hero-copy">
    <p>{playerName}, this is your shared place with</p>
    <h1 id="living-world-title">{companionName}<span aria-hidden="true">+</span></h1>
    <p class="relationship-state">{companionName} feels {relationalState.toLowerCase()}.</p>
    <p class="intro">{relationalReason}</p>
    <slot name="primary-action" />
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
    <div class="companion-model">
      <MuseModel
        bind:loaded={modelLoaded}
        minSize="0px"
        size="100%"
        framed={false}
        cameraControls={false}
        eager={true}
        glowIntensity={85}
        glowEnabled={true}
        auraColor="cyan"
        visualMood="calm"
        cameraOrbit="180deg 76deg 118%"
        cameraTarget="0m 0.7m 0m"
        modelScale="1 1 1"
        animationName="Idle"
        motionEnabled={true}
        respectReducedMotion={false}
      />
    </div>
    <div class="scene-particles scene-particles--front" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>

  <aside class="status-card" aria-label={`${companionName} status`}>
    {#if !renameMode}
      <a class="status-card__link" href={companionHref} aria-label={`Open ${companionName} companion profile`}></a>
    {/if}
    <header>
      {#if renameMode}
        <form class="rename-form" on:submit|preventDefault={submitRename}>
          <label class="sr-only" for="hero-companion-name">Companion name</label>
          <input
            id="hero-companion-name"
            bind:value={renameValue}
            maxlength="32"
            autocomplete="off"
            disabled={renameBusy}
            on:keydown={(event) => {
              if (event.key === 'Escape') cancelRename();
            }}
          />
          <div class="rename-actions">
            <button type="button" on:click={cancelRename} disabled={renameBusy}>Cancel</button>
            <button type="submit" disabled={renameBusy}>{renameBusy ? 'Saving...' : 'Save'}</button>
          </div>
          {#if renameError}
            <small>{renameError}</small>
          {/if}
        </form>
      {:else}
        <div class="status-title">
          <strong>{companionName}</strong>
          <button type="button" class="rename-trigger" aria-label={`Rename ${companionName}`} on:click={startRename}>
            <Pencil size={14} />
          </button>
        </div>
      {/if}
    </header>
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
    <a class="companion-link" href={companionHref}>Open companion</a>
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

  .relationship-state {
    color: rgba(255, 255, 255, 0.96) !important;
    font-weight: 800;
  }

  .companion-link {
    position: relative;
    z-index: 2;
    color: rgba(225, 215, 255, 0.82);
    font-size: 0.76rem;
    font-weight: 750;
    text-decoration: none;
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

  .companion-model {
    position: relative;
    z-index: 2;
    width: var(--hero-stage-width, min(33rem, 124%));
    height: var(--hero-stage-height, min(33rem, 122%));
    object-fit: contain;
    filter: drop-shadow(0 0 42px rgba(77, 244, 255, 0.42));
    transform: scale(var(--hero-companion-scale, 1));
    transform-origin: 50% 100%;
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

  .status-card__link {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }

  .status-card__link:focus-visible {
    outline: 2px solid rgba(185, 158, 255, 0.68);
    outline-offset: 3px;
  }

  .status-card > :not(.status-card__link) {
    position: relative;
    z-index: 2;
    pointer-events: none;
  }

  .status-card button,
  .status-card input {
    pointer-events: auto;
  }

  .status-card header,
  .status-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .status-card header {
    justify-content: flex-start;
  }

  .status-title {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 0.42rem;
  }

  .status-title strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rename-trigger {
    display: grid;
    width: 1.45rem;
    height: 1.45rem;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: rgba(244, 242, 255, 0.9);
    cursor: pointer;
  }

  .rename-trigger:hover,
  .rename-trigger:focus-visible {
    background: rgba(255, 255, 255, 0.08);
    outline: none;
  }

  .rename-form {
    display: grid;
    width: 100%;
    gap: 0.45rem;
  }

  .rename-form input {
    min-width: 0;
    width: 100%;
    border: 1px solid rgba(185, 158, 255, 0.28);
    border-radius: 0.55rem;
    background: rgba(8, 10, 29, 0.68);
    color: white;
    font: inherit;
    font-weight: 800;
    padding: 0.42rem 0.5rem;
    outline: none;
  }

  .rename-form input:focus {
    border-color: rgba(206, 184, 255, 0.68);
    box-shadow: 0 0 0 2px rgba(155, 92, 255, 0.18);
  }

  .rename-actions {
    display: flex;
    gap: 0.4rem;
  }

  .rename-actions button {
    min-height: 1.8rem;
    flex: 1;
    border: 1px solid rgba(185, 158, 255, 0.2);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(244, 242, 255, 0.9);
    cursor: pointer;
    font-size: 0.74rem;
    font-weight: 800;
  }

  .rename-actions button[type='submit'] {
    background: linear-gradient(135deg, rgba(126, 92, 255, 0.82), rgba(180, 92, 255, 0.74));
    color: white;
  }

  .rename-actions button:disabled {
    cursor: wait;
    opacity: 0.68;
  }

  .rename-form small {
    color: #ff9fbe;
    font-size: 0.72rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
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

    .companion-model {
      width: var(--hero-stage-mobile-width, min(25rem, 112vw));
      height: var(--hero-stage-mobile-height, min(28rem, 58svh));
      transform: scale(var(--hero-companion-mobile-scale, var(--hero-companion-scale, 1)));
    }

    .status-card {
      display: none;
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
