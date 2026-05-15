<script lang="ts">
  import { ArrowRight, Camera, ChevronRight, Heart, Leaf, Pencil } from 'lucide-svelte';
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let companionId: string | null = null;
  export let companionHref = '/app/companions';
  export let playerName = 'Alex';
  export let companionName = 'Lumi';
  export let level = 18;
  export let mood = 'Happy';
  export let bond = 87;
  export let shardBalance = 0;
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
  $: bondProgress = Math.min(100, Math.max(0, Math.round((bond / 32) * 100)));
  $: bondXp = Math.max(0, Math.round((bond / 100) * 1600));
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

  <div class="mobile-floating-card mobile-bond-card" aria-label={`${companionName} bond level`}>
    <span class="mobile-card-icon mobile-card-icon--heart" aria-hidden="true"><Heart size={30} fill="currentColor" /></span>
    <span>
      <small>Bond Level</small>
      <strong>{Math.max(1, level)}</strong>
      <em>{bond >= 70 ? 'Close Friends' : bond > 0 ? 'Growing Bond' : 'New Bond'}</em>
    </span>
    <i class="mobile-card-meter"><b style={`width:${bondProgress}%`}></b></i>
    <p>{bondXp.toLocaleString()} / 1,600 XP</p>
  </div>

  <div class="mobile-stat-stack" aria-label="Companion quick stats">
    <a class="mobile-floating-card mobile-mini-card" href="/app/wallet" aria-label={`${shardBalance.toLocaleString()} shards`}>
      <span class="mobile-card-icon mobile-card-icon--shard" aria-hidden="true">
        <img src="/assets/shard-96.png" alt="" loading="eager" />
      </span>
      <span>
        <strong>{shardBalance.toLocaleString()}</strong>
        <small>Shards</small>
      </span>
      <ChevronRight size={20} />
    </a>
    <a class="mobile-floating-card mobile-mini-card" href="/app/worlds" aria-label={`World mood ${mood}`}>
      <span class="mobile-card-icon mobile-card-icon--leaf" aria-hidden="true"><Leaf size={28} /></span>
      <span>
        <small>World Mood</small>
        <strong class="mood-word">{mood}</strong>
      </span>
      <ChevronRight size={20} />
    </a>
  </div>

  <div class="mobile-companion-nameplate">
    <button type="button" aria-label={`${companionName} favorite`}><Heart size={18} fill="currentColor" /></button>
    <a href={companionHref}>
      <strong>{companionName}</strong>
      <Pencil size={14} />
      <span>Your Companion</span>
    </a>
    <button type="button" aria-label={`Take a photo of ${companionName}`}><Camera size={20} /></button>
  </div>
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
    gap: 0.7rem;
    margin-top: 1.3rem;
  }

  .hero-actions a {
    display: inline-flex;
    min-height: 3.15rem;
    align-items: center;
    justify-content: center;
    gap: 0.72rem;
    border-radius: 0.9rem;
    padding: 0 0.86rem 0 1.25rem;
    color: white;
    font-size: clamp(0.9rem, 1.1vw, 1rem);
    font-weight: 850;
    text-decoration: none;
    white-space: nowrap;
    backdrop-filter: blur(18px);
    transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .hero-actions a:hover,
  .hero-actions a:focus-visible {
    transform: translateY(-1px);
  }

  .primary {
    min-width: 9.8rem;
    border: 1px solid rgba(223, 201, 255, 0.48);
    background:
      radial-gradient(circle at 28% 20%, rgba(255, 255, 255, 0.22), transparent 28%),
      linear-gradient(135deg, rgba(119, 98, 255, 0.96), rgba(157, 72, 239, 0.97) 62%, rgba(185, 60, 222, 0.95));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.28),
      inset 0 -1px 0 rgba(55, 22, 110, 0.24),
      0 0 0 1px rgba(132, 101, 255, 0.2),
      0 12px 30px rgba(119, 72, 255, 0.32),
      0 0 24px rgba(171, 92, 255, 0.34);
  }

  .arrow-chip {
    display: grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.65rem;
    background:
      radial-gradient(circle at 35% 25%, rgba(255, 255, 255, 0.55), transparent 28%),
      rgba(255, 255, 255, 0.13);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 0 18px rgba(255, 255, 255, 0.16);
    font-style: normal;
  }

  .secondary {
    min-width: 7.7rem;
    border: 1px solid rgba(229, 224, 255, 0.24);
    background:
      radial-gradient(circle at 20% 8%, rgba(255, 255, 255, 0.08), transparent 32%),
      rgba(15, 16, 35, 0.74);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      0 12px 34px rgba(2, 4, 18, 0.28);
    padding: 0 1.25rem;
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

  .status-card > span {
    color: rgba(221, 218, 244, 0.68);
    font-size: 0.78rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
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

  .mobile-floating-card,
  .mobile-stat-stack,
  .mobile-companion-nameplate {
    display: none;
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

    .companion-model {
      width: var(--hero-stage-mobile-width, min(25rem, 112vw));
      height: var(--hero-stage-mobile-height, min(28rem, 58svh));
      transform: scale(var(--hero-companion-mobile-scale, var(--hero-companion-scale, 1)));
    }

    .status-card {
      display: none;
    }

    .mobile-floating-card {
      position: absolute;
      z-index: 5;
      border: 1px solid rgba(201, 157, 255, 0.22);
      background:
        radial-gradient(circle at 18% 18%, rgba(184, 115, 255, 0.22), transparent 42%),
        rgba(23, 12, 42, 0.76);
      color: rgba(255, 250, 255, 0.96);
      text-decoration: none;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 18px 42px rgba(3, 3, 18, 0.42);
      backdrop-filter: blur(22px);
    }

    .mobile-bond-card {
      left: clamp(1rem, 4vw, 1.45rem);
      top: min(22.2rem, 47svh);
      display: grid;
      width: min(14.5rem, 47vw);
      min-height: 9.35rem;
      grid-template-columns: 3.4rem minmax(0, 1fr);
      gap: 0.58rem 0.8rem;
      border-radius: 1.45rem;
      padding: 1rem;
    }

    .mobile-card-icon {
      display: grid;
      place-items: center;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.07);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }

    .mobile-card-icon--heart {
      width: 3.4rem;
      height: 3.4rem;
      color: #c376ff;
      background:
        radial-gradient(circle at 45% 35%, rgba(255, 137, 230, 0.34), transparent 42%),
        rgba(117, 77, 190, 0.24);
    }

    .mobile-card-icon--shard,
    .mobile-card-icon--leaf {
      width: 3.45rem;
      height: 3.45rem;
      flex: 0 0 auto;
    }

    .mobile-card-icon--shard img {
      width: 2.15rem;
      height: 2.15rem;
      object-fit: contain;
      filter: drop-shadow(0 0 14px rgba(192, 101, 255, 0.85));
    }

    .mobile-card-icon--leaf {
      color: #8dd65e;
      background: rgba(102, 188, 70, 0.14);
    }

    .mobile-bond-card small,
    .mobile-mini-card small {
      display: block;
      color: rgba(244, 235, 255, 0.86);
      font-size: clamp(0.74rem, 3vw, 0.92rem);
      line-height: 1.15;
    }

    .mobile-bond-card strong {
      display: block;
      color: white;
      font-size: clamp(1.75rem, 7vw, 2.25rem);
      line-height: 1;
    }

    .mobile-bond-card em {
      display: block;
      color: rgba(238, 229, 255, 0.72);
      font-size: clamp(0.74rem, 3vw, 0.92rem);
      font-style: normal;
      line-height: 1.1;
    }

    .mobile-card-meter {
      grid-column: 1 / -1;
      display: block;
      height: 0.42rem;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.1);
    }

    .mobile-card-meter b {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #9a5cff, #c35dff);
      box-shadow: 0 0 16px rgba(171, 92, 255, 0.7);
    }

    .mobile-bond-card p {
      grid-column: 1 / -1;
      margin: 0;
      color: rgba(235, 226, 255, 0.62);
      font-size: clamp(0.75rem, 3.3vw, 0.95rem);
      line-height: 1;
      text-align: center;
    }

    .mobile-stat-stack {
      position: absolute;
      top: min(13rem, 27svh);
      right: clamp(1rem, 4vw, 1.35rem);
      z-index: 6;
      display: grid;
      width: min(13.9rem, 44vw);
      gap: 0.85rem;
    }

    .mobile-mini-card {
      position: relative;
      display: flex;
      min-height: 4.95rem;
      align-items: center;
      gap: 0.82rem;
      border-radius: 1.55rem;
      padding: 0.72rem 0.78rem;
    }

    .mobile-mini-card strong {
      display: block;
      color: white;
      font-size: clamp(1rem, 4.7vw, 1.45rem);
      line-height: 1.05;
    }

    .mobile-mini-card .mood-word {
      color: #9ee36f;
      font-size: clamp(1rem, 4.2vw, 1.2rem);
    }

    .mobile-mini-card :global(svg:last-child) {
      margin-left: auto;
      color: rgba(244, 235, 255, 0.66);
    }

    .mobile-companion-nameplate {
      position: absolute;
      left: clamp(1rem, 4vw, 1.35rem);
      right: clamp(1rem, 4vw, 1.35rem);
      bottom: 2.15rem;
      z-index: 7;
      display: grid;
      grid-template-columns: 3.25rem minmax(0, 1fr) 3.25rem;
      align-items: end;
      gap: 0.75rem;
      pointer-events: auto;
    }

    .mobile-companion-nameplate a {
      display: grid;
      justify-items: center;
      color: white;
      text-decoration: none;
      text-shadow: 0 2px 18px rgba(0, 0, 0, 0.72);
    }

    .mobile-companion-nameplate strong {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: clamp(1.35rem, 5.6vw, 1.72rem);
      font-weight: 700;
      line-height: 1.1;
    }

    .mobile-companion-nameplate span {
      color: rgba(240, 232, 255, 0.7);
      font-size: clamp(0.78rem, 3.5vw, 1rem);
    }

    .mobile-companion-nameplate button {
      display: grid;
      width: 3.25rem;
      height: 3.25rem;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      background: rgba(11, 8, 27, 0.45);
      color: rgba(255, 231, 244, 0.92);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        0 12px 30px rgba(0, 0, 0, 0.26);
      backdrop-filter: blur(18px);
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

    .mobile-bond-card {
      top: 18.8rem;
      width: min(13rem, 47vw);
      min-height: 8.6rem;
      padding: 0.78rem;
    }

    .mobile-stat-stack {
      top: 11.4rem;
      width: min(12.4rem, 44vw);
      gap: 0.6rem;
    }

    .mobile-mini-card {
      min-height: 4.3rem;
      padding: 0.6rem;
    }
  }
</style>
