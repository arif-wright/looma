<script lang="ts">
  import { canonicalArchetypeList } from '$lib/onboarding/archetypes';

  export let data: { loggedIn: boolean };

  const isAuthed = data.loggedIn;
  const primaryHref = isAuthed ? '/app/home' : '/app/auth';
  const primaryLabel = isAuthed ? 'Enter sanctuary' : 'Begin the bond';
  const secondaryHref = isAuthed ? '/app/memory' : '/app/auth';
  const secondaryLabel = isAuthed ? 'Open journal' : 'Sign in';

  const featurePoints = ['Emotional memory', 'Adaptive companions', 'Ambient worlds', 'Gentle rituals'];
</script>

<svelte:head>
  <title>Looma</title>
  <meta
    name="description"
    content="Looma is an emotionally adaptive companion world where your first bond shapes rituals, memory, and ambient worlds."
  />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="landing-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="Looma home">Looma</a>
    <nav class="topbar__nav" aria-label="Landing navigation">
      <a href="#worlds">The Archetypes</a>
      <a href="#how">How It Works</a>
      <a href="#worlds">Worlds</a>
      <a href="#companions">Companions</a>
      <a href="#about">About</a>
    </nav>
    <div class="topbar__actions">
      <a class="topbar__link" href={secondaryHref}>{isAuthed ? 'Journal' : 'Sign in'}</a>
      <a class="topbar__cta" href={primaryHref}>{primaryLabel}</a>
    </div>
  </header>

  <main id="main">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__art" data-testid="hero-backdrop" aria-hidden="true"></div>
      <div class="hero__particles" aria-hidden="true">
        {#each Array(12) as _, index}
          <span style={`--i:${index}`}></span>
        {/each}
      </div>
      <div class="hero__shade" aria-hidden="true"></div>

      <div class="hero__inner">
        <div class="hero__copy">
          <p class="eyebrow">Emotionally adaptive companion world</p>
          <h1 id="hero-title">Begin the <span>bond</span>.</h1>
          <p class="lede">
            Meet a companion shaped by your emotional patterns, then let memory, rituals, and ambient worlds grow
            around the relationship.
          </p>
          <div class="hero__actions">
            <a class="cta cta--primary" href={primaryHref}>{primaryLabel}</a>
            <a class="cta cta--ghost" href="#worlds">Explore the energies</a>
          </div>

          <div class="feature-row" aria-label="Looma signals">
            {#each featurePoints as point}
              <span>{point}</span>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section id="worlds" class="worlds" aria-labelledby="worlds-title">
      <div class="section-heading">
        <p class="eyebrow">Five paths. One first encounter.</p>
        <h2 id="worlds-title">Which companion energy calls to you?</h2>
        <p>Each path reflects a different way a companion can steady, remember, reflect, or awaken the bond.</p>
      </div>

      <div class="archetype-grid">
        {#each canonicalArchetypeList as archetype}
          <article class="archetype-card">
            <img src={archetype.imagePath} alt="" loading="lazy" />
            <div class="archetype-card__body">
              <h3>The {archetype.displayName}</h3>
              <p>{archetype.shortDescription}</p>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section id="how" class="support-band" aria-labelledby="how-title">
      <div>
        <p class="eyebrow">How it works</p>
        <h2 id="how-title">A quiz becomes the first emotional handshake.</h2>
      </div>
      <p>
        Looma listens for steadiness, memory, curiosity, reassurance, and reflection, then introduces the companion
        lineage that feels most resonant.
      </p>
    </section>

    <section id="companions" class="support-band" aria-labelledby="companions-title">
      <div>
        <p class="eyebrow">Companions</p>
        <h2 id="companions-title">Not a category. A relationship that can return.</h2>
      </div>
      <p>
        The result should feel like a first encounter: a companion finding resonance with the way you move through
        emotion, memory, and daily rituals.
      </p>
    </section>
  </main>
</div>

<style>
  :global(body) {
    background: #05040d;
  }

  .skip-link {
    position: absolute;
    left: 0.75rem;
    top: -3rem;
    z-index: 60;
    border-radius: 999px;
    background: rgba(255, 243, 210, 0.96);
    color: #160f08;
    padding: 0.5rem 0.8rem;
    text-decoration: none;
  }

  .skip-link:focus {
    top: 0.75rem;
  }

  .landing-shell {
    min-height: 100vh;
    color: rgba(250, 244, 232, 0.96);
    background:
      radial-gradient(circle at 50% 0%, rgba(103, 47, 194, 0.2), transparent 30rem),
      linear-gradient(180deg, #05040d 0%, #090513 62%, #05040d 100%);
  }

  .topbar,
  .hero__inner,
  .worlds,
  .support-band {
    width: min(92rem, calc(100vw - 1.5rem));
    margin: 0 auto;
  }

  .topbar {
    min-height: 4.25rem;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid rgba(255, 236, 196, 0.12);
    color: rgba(250, 244, 232, 0.94);
  }

  .brand,
  .topbar a {
    color: inherit;
    text-decoration: none;
  }

  .brand {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.65rem;
    font-weight: 700;
  }

  .topbar__nav {
    display: none;
    justify-content: center;
    gap: 2.35rem;
    color: rgba(229, 220, 205, 0.72);
    font-size: 0.9rem;
    font-weight: 700;
  }

  .topbar__nav a:hover,
  .topbar__nav a:focus-visible {
    color: rgba(255, 220, 151, 0.98);
    text-shadow: 0 0 18px rgba(255, 211, 122, 0.28);
  }

  .topbar__actions {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .topbar__link,
  .topbar__cta {
    min-height: 2.45rem;
    padding: 0 1rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease,
      background 180ms ease;
  }

  .topbar__link {
    border: 1px solid rgba(255, 220, 151, 0.24);
    background: rgba(8, 6, 19, 0.42);
  }

  .topbar__link:hover,
  .topbar__link:focus-visible {
    border-color: rgba(255, 220, 151, 0.5);
    background: rgba(18, 10, 38, 0.62);
    box-shadow: 0 0 22px rgba(190, 135, 255, 0.14);
    transform: translateY(-1px);
  }

  .topbar__cta {
    display: none;
    background: linear-gradient(135deg, #ffd37a, #d99a39);
    color: #170e05;
    box-shadow: 0 10px 28px rgba(217, 154, 57, 0.16);
  }

  .topbar__cta:hover,
  .topbar__cta:focus-visible {
    box-shadow: 0 16px 38px rgba(217, 154, 57, 0.3);
    transform: translateY(-1px);
  }

  .hero {
    position: relative;
    min-height: 31rem;
    overflow: hidden;
    isolation: isolate;
  }

  .hero__art,
  .hero__particles,
  .hero__shade {
    position: absolute;
    inset: 0;
  }

  .hero__art {
    z-index: -3;
    background-image: url('/assets/default_background.png');
    background-size: cover;
    background-position: center 35%;
    transform: scale(1.015);
  }

  .hero__particles {
    z-index: -2;
    overflow: hidden;
    pointer-events: none;
  }

  .hero__particles span {
    position: absolute;
    width: var(--size, 0.28rem);
    height: var(--size, 0.28rem);
    left: var(--x);
    top: var(--y);
    border-radius: 999px;
    background: rgba(255, 211, 122, 0.86);
    box-shadow:
      0 0 14px rgba(255, 211, 122, 0.62),
      0 0 28px rgba(190, 135, 255, 0.28);
    opacity: 0.72;
    animation: particleDrift var(--duration, 9s) ease-in-out infinite;
    animation-delay: var(--delay, 0s);
  }

  .hero__particles span:nth-child(1) { --x: 63%; --y: 18%; --size: 0.22rem; --duration: 8s; --delay: -1s; }
  .hero__particles span:nth-child(2) { --x: 72%; --y: 38%; --size: 0.34rem; --duration: 11s; --delay: -5s; }
  .hero__particles span:nth-child(3) { --x: 88%; --y: 24%; --size: 0.2rem; --duration: 9s; --delay: -3s; }
  .hero__particles span:nth-child(4) { --x: 54%; --y: 62%; --size: 0.28rem; --duration: 10s; --delay: -6s; }
  .hero__particles span:nth-child(5) { --x: 81%; --y: 68%; --size: 0.18rem; --duration: 7s; --delay: -2s; }
  .hero__particles span:nth-child(6) { --x: 42%; --y: 32%; --size: 0.22rem; --duration: 12s; --delay: -8s; }
  .hero__particles span:nth-child(7) { --x: 68%; --y: 76%; --size: 0.26rem; --duration: 8.5s; --delay: -4s; }
  .hero__particles span:nth-child(8) { --x: 93%; --y: 52%; --size: 0.3rem; --duration: 10.5s; --delay: -7s; }
  .hero__particles span:nth-child(9) { --x: 58%; --y: 46%; --size: 0.16rem; --duration: 9.5s; --delay: -2.5s; }
  .hero__particles span:nth-child(10) { --x: 76%; --y: 14%; --size: 0.18rem; --duration: 7.5s; --delay: -4.5s; }
  .hero__particles span:nth-child(11) { --x: 49%; --y: 78%; --size: 0.2rem; --duration: 12.5s; --delay: -9s; }
  .hero__particles span:nth-child(12) { --x: 84%; --y: 83%; --size: 0.24rem; --duration: 8.8s; --delay: -1.8s; }

  .hero__shade {
    z-index: -1;
    background:
      radial-gradient(circle at 68% 42%, rgba(190, 135, 255, 0.15), transparent 20rem),
      linear-gradient(90deg, rgba(5, 4, 13, 0.97) 0%, rgba(5, 4, 13, 0.86) 31%, rgba(5, 4, 13, 0.34) 68%),
      linear-gradient(180deg, rgba(5, 4, 13, 0.08) 0%, rgba(5, 4, 13, 0.14) 52%, #05040d 100%);
  }

  .hero__inner {
    min-height: 31rem;
    padding: 3.5rem 0 3rem;
    display: grid;
    align-items: center;
  }

  .hero__copy {
    max-width: 31rem;
    display: grid;
    gap: 0.9rem;
  }

  .eyebrow {
    margin: 0;
    color: rgba(190, 135, 255, 0.92);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1,
  h2 {
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 700;
    letter-spacing: 0;
  }

  h1 {
    font-size: 4.2rem;
    line-height: 0.92;
  }

  h1 span {
    color: #ffd37a;
  }

  h2 {
    font-size: 2.25rem;
    line-height: 1.02;
  }

  h3 {
    color: rgba(255, 248, 234, 0.98);
    font-size: 1.1rem;
    line-height: 1.16;
  }

  .lede,
  .section-heading p,
  .archetype-card p,
  .support-band p {
    color: rgba(230, 221, 208, 0.8);
    line-height: 1.55;
  }

  .lede {
    max-width: 27rem;
    font-size: 1rem;
  }

  .hero__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
    margin-top: 0.35rem;
  }

  .cta {
    min-height: 2.9rem;
    padding: 0 1.15rem;
    border-radius: 0.45rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    font-weight: 800;
    position: relative;
    overflow: hidden;
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease,
      background 180ms ease,
      color 180ms ease;
  }

  .cta::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.28) 46%, transparent 62%);
    transform: translateX(-120%);
    transition: transform 420ms ease;
    pointer-events: none;
  }

  .cta:hover,
  .cta:focus-visible {
    transform: translateY(-2px);
  }

  .cta:hover::after,
  .cta:focus-visible::after {
    transform: translateX(120%);
  }

  .cta--primary {
    background: linear-gradient(135deg, #ffd37a, #d99a39);
    color: #170e05;
    box-shadow: 0 12px 32px rgba(217, 154, 57, 0.24);
  }

  .cta--primary:hover,
  .cta--primary:focus-visible {
    box-shadow: 0 18px 44px rgba(217, 154, 57, 0.38);
  }

  .cta--ghost {
    border: 1px solid rgba(255, 220, 151, 0.24);
    color: rgba(250, 244, 232, 0.95);
    background: rgba(8, 6, 19, 0.34);
  }

  .cta--ghost:hover,
  .cta--ghost:focus-visible {
    border-color: rgba(190, 135, 255, 0.56);
    background: rgba(18, 10, 38, 0.58);
    box-shadow: 0 16px 40px rgba(95, 54, 255, 0.22);
  }

  .feature-row {
    margin-top: 1rem;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.85rem 1.1rem;
    color: rgba(229, 220, 205, 0.78);
    font-size: 0.9rem;
  }

  .feature-row span {
    min-height: 1.5rem;
    display: flex;
    align-items: center;
  }

  .feature-row span::before {
    content: '';
    width: 0.45rem;
    height: 0.45rem;
    border-radius: 999px;
    margin-right: 0.55rem;
    background: #be87ff;
    box-shadow: 0 0 18px rgba(190, 135, 255, 0.72);
    animation: signalPulse 3.6s ease-in-out infinite;
  }

  .worlds {
    padding: 2.4rem 0 0;
  }

  .section-heading {
    max-width: 44rem;
    margin: 0 auto;
    display: grid;
    gap: 0.45rem;
    text-align: center;
  }

  .archetype-grid {
    margin-top: 1.15rem;
    display: grid;
    gap: 0.75rem;
  }

  .archetype-card {
    position: relative;
    min-height: 16.6rem;
    border: 1px solid rgba(255, 220, 151, 0.18);
    border-radius: 0.5rem;
    overflow: hidden;
    background: rgba(8, 7, 18, 0.88);
    display: grid;
    grid-template-rows: minmax(10.3rem, 1fr) auto;
    box-shadow: 0 18px 38px rgba(4, 3, 12, 0.26);
    transition:
      border-color 180ms ease,
      box-shadow 180ms ease,
      transform 180ms ease;
  }

  .archetype-card::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(255, 211, 122, 0.12), transparent 38%);
    opacity: 0;
    transition: opacity 180ms ease;
    pointer-events: none;
  }

  .archetype-card:hover {
    transform: translateY(-0.28rem);
    border-color: rgba(255, 220, 151, 0.38);
    box-shadow: 0 28px 56px rgba(4, 3, 12, 0.38), 0 0 34px rgba(145, 76, 255, 0.14);
  }

  .archetype-card:hover::after {
    opacity: 1;
  }

  .archetype-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
    transition: transform 420ms ease, filter 420ms ease;
  }

  .archetype-card:hover img {
    transform: scale(1.04);
    filter: saturate(1.08) contrast(1.04);
  }

  .archetype-card__body {
    padding: 0.85rem 0.95rem 0.95rem;
    display: grid;
    gap: 0.26rem;
    background: linear-gradient(180deg, rgba(8, 7, 18, 0.68), rgba(8, 7, 18, 0.98));
  }

  .archetype-card__body p {
    font-size: 0.88rem;
    line-height: 1.32;
  }

  .support-band {
    margin-top: 2.2rem;
    padding: 1.3rem 0;
    border-top: 1px solid rgba(255, 236, 196, 0.1);
    display: grid;
    gap: 0.8rem;
    transition: border-color 180ms ease;
  }

  .support-band:hover {
    border-color: rgba(255, 236, 196, 0.18);
  }

  .support-band:last-child {
    padding-bottom: 4rem;
  }

  .support-band h2 {
    font-size: 1.85rem;
  }

  @media (min-width: 760px) {
    .topbar__nav,
    .topbar__cta {
      display: flex;
    }

    .archetype-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .support-band {
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      align-items: end;
    }
  }

  @media (min-width: 1180px) {
    .hero {
      min-height: 33rem;
    }

    .hero__inner {
      min-height: 33rem;
    }

    h1 {
      font-size: 4.7rem;
    }
  }

  @media (max-width: 759px) {
    .topbar {
      grid-template-columns: auto auto;
      min-height: 4rem;
    }

    .topbar__actions {
      justify-self: end;
    }

    .topbar__link {
      min-height: 2.25rem;
    }

    .hero,
    .hero__inner {
      min-height: 30rem;
    }

    .hero__shade {
      background:
        linear-gradient(180deg, rgba(5, 4, 13, 0.7) 0%, rgba(5, 4, 13, 0.74) 44%, #05040d 100%),
        linear-gradient(90deg, rgba(5, 4, 13, 0.88), rgba(5, 4, 13, 0.32));
    }

    .hero__inner {
      padding: 2.4rem 0 2.2rem;
    }

    h1 {
      font-size: 3.1rem;
    }

    h2 {
      font-size: 1.9rem;
    }

    .hero__actions {
      display: grid;
    }

    .feature-row {
      grid-template-columns: 1fr;
      gap: 0.55rem;
    }

    .archetype-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero__particles span,
    .feature-row span::before {
      animation: none;
    }

    .cta,
    .topbar__link,
    .topbar__cta,
    .archetype-card,
    .archetype-card img {
      transition: none;
    }
  }

  @keyframes particleDrift {
    0%,
    100% {
      transform: translate3d(0, 0, 0) scale(0.9);
      opacity: 0.34;
    }
    35% {
      transform: translate3d(0.8rem, -1.1rem, 0) scale(1.08);
      opacity: 0.86;
    }
    68% {
      transform: translate3d(-0.45rem, -0.35rem, 0) scale(0.96);
      opacity: 0.58;
    }
  }

  @keyframes signalPulse {
    0%,
    100% {
      transform: scale(0.94);
      opacity: 0.7;
    }
    50% {
      transform: scale(1.12);
      opacity: 1;
    }
  }
</style>
