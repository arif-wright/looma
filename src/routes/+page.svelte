<script lang="ts">
  import { canonicalArchetypeList } from '$lib/onboarding/archetypes';

  export let data: { loggedIn: boolean };

  const isAuthed = data.loggedIn;
  const primaryHref = isAuthed ? '/app/home' : '/app/auth';
  const primaryLabel = isAuthed ? 'Enter sanctuary' : 'Begin the bond';
  const secondaryHref = isAuthed ? '/app/memory' : '/app/signup';
  const secondaryLabel = isAuthed ? 'Open journal' : 'Create account';

  const resonanceSignals = [
    'Steadiness when the day gets loud',
    'Memory that carries emotional context forward',
    'Small rituals that make returning feel gentle',
    'Playful sparks when momentum needs a door'
  ];

  const encounterSteps = [
    {
      label: 'Listen',
      title: 'The first questions are emotional signals.',
      body: 'Looma begins with patterns of steadiness, memory, curiosity, reassurance, and reflection.'
    },
    {
      label: 'Resonate',
      title: 'A companion lineage comes into focus.',
      body: 'Muse, Guardian, Spark, Root, and Echo are emotional energies, not boxes to fit inside.'
    },
    {
      label: 'Return',
      title: 'The world remembers how the bond started.',
      body: 'That first profile can tune rituals, check-ins, world state, and future companion moments.'
    }
  ];
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
      <a href="#resonance">Resonance</a>
      <a href="#worlds">Worlds</a>
      <a href="#encounter">Bond</a>
    </nav>
    <a class="topbar__link" href={primaryHref}>{isAuthed ? 'Open app' : 'Sign in'}</a>
  </header>

  <main id="main">
    <section class="hero" aria-labelledby="hero-title">
      <video
        class="hero__video"
        data-testid="hero-video"
        autoplay
        muted
        loop
        playsinline
        poster="/og/looma_world_og.png"
        aria-hidden="true"
      >
        <source src="/videos/looma_hero_bg.webm" type="video/webm" />
        <source src="/videos/looma_hero_bg.mp4" type="video/mp4" />
      </video>
      <div class="hero__shade" aria-hidden="true"></div>

      <div class="hero__inner">
        <div class="hero__copy">
          <p class="eyebrow">Emotionally adaptive companion world</p>
          <h1 id="hero-title">Something in this world has been waiting for you.</h1>
          <p class="lede">
            Looma begins with an emotional handshake, then lets a companion, a sanctuary, and a trail of memory grow
            around the bond.
          </p>
          <div class="hero__actions">
            <a class="cta cta--primary" href={primaryHref}>{primaryLabel}</a>
            <a class="cta cta--ghost" href={secondaryHref}>{secondaryLabel}</a>
          </div>
        </div>

        <div class="companion-presence" aria-hidden="true">
          <span class="presence-ring"></span>
          <img src="/assets/curious.png" alt="" />
        </div>
      </div>
    </section>

    <section id="resonance" class="resonance" aria-labelledby="resonance-title">
      <div class="section-copy">
        <p class="eyebrow">First resonance</p>
        <h2 id="resonance-title">Every companion responds to different emotional patterns.</h2>
        <p>
          Looma is not trying to sort you into a personality type. It is learning the shape of return: what steadies
          you, what wakes you up, what you want remembered softly.
        </p>
      </div>

      <div class="signal-grid" aria-label="Emotional signals">
        {#each resonanceSignals as signal}
          <article class="signal-card">
            <span></span>
            <p>{signal}</p>
          </article>
        {/each}
      </div>
    </section>

    <section id="worlds" class="worlds" aria-labelledby="worlds-title">
      <div class="section-copy section-copy--center">
        <p class="eyebrow">Five companion energies</p>
        <h2 id="worlds-title">Not every companion is meant for every soul.</h2>
        <p>
          These worlds are emotional atmospheres: reflection, reassurance, momentum, steadiness, and memory.
        </p>
      </div>

      <div class="archetype-grid">
        {#each canonicalArchetypeList as archetype}
          <article class="archetype-card">
            <img src={archetype.imagePath} alt="" loading="lazy" />
            <div class="archetype-card__body">
              <p class="archetype-card__label">{archetype.emotionalFunction}</p>
              <h3>{archetype.displayName}</h3>
              <p>{archetype.shortDescription}</p>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section id="encounter" class="encounter" aria-labelledby="encounter-title">
      <div class="encounter__visual" aria-hidden="true">
        <img src="/assets/muse_background.png" alt="" loading="lazy" />
        <div class="encounter__companion">
          <img src="/assets/steady.png" alt="" loading="lazy" />
        </div>
      </div>

      <div class="encounter__copy">
        <p class="eyebrow">The reveal</p>
        <h2 id="encounter-title">Not a result. A first encounter.</h2>
        <p>
          Looma should feel less like “You are The Muse” and more like “Mirae found resonance with you.” The quiz is
          only the first signal; the relationship is what matters.
        </p>

        <div class="encounter-steps">
          {#each encounterSteps as step}
            <article>
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          {/each}
        </div>
      </div>
    </section>

    <section class="closing" aria-labelledby="closing-title">
      <p class="eyebrow">Begin</p>
      <h2 id="closing-title">Begin the bond. Let the world answer differently.</h2>
      <p>
        Start with one companion, one emotional profile, and one small ritual that makes returning feel alive.
      </p>
      <div class="closing__actions">
        <a class="cta cta--primary" href={primaryHref}>{primaryLabel}</a>
        <a class="cta cta--ghost" href={secondaryHref}>{secondaryLabel}</a>
      </div>
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
      radial-gradient(circle at 50% 0%, rgba(145, 81, 255, 0.2), transparent 32rem),
      linear-gradient(180deg, #05040d 0%, #080613 56%, #05040d 100%);
  }

  .topbar {
    position: fixed;
    z-index: 50;
    top: 0;
    left: 50%;
    width: min(92rem, calc(100vw - 1.5rem));
    transform: translateX(-50%);
    min-height: 4.5rem;
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
    font-size: 1.6rem;
    font-weight: 700;
  }

  .topbar__nav {
    display: none;
    justify-content: center;
    gap: 2.4rem;
    color: rgba(229, 220, 205, 0.72);
    font-size: 0.9rem;
  }

  .topbar__nav a:hover,
  .topbar__nav a:focus-visible {
    color: rgba(255, 220, 151, 0.98);
  }

  .topbar__link {
    min-height: 2.45rem;
    padding: 0 1rem;
    border: 1px solid rgba(255, 220, 151, 0.24);
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(8, 6, 19, 0.42);
    font-weight: 700;
  }

  .hero {
    position: relative;
    min-height: 86svh;
    max-height: 54rem;
    overflow: hidden;
    display: grid;
    align-items: end;
    isolation: isolate;
  }

  .hero__video,
  .hero__shade {
    position: absolute;
    inset: 0;
  }

  .hero__video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
    z-index: -3;
  }

  .hero__shade {
    z-index: -2;
    background:
      linear-gradient(90deg, rgba(5, 4, 13, 0.94) 0%, rgba(5, 4, 13, 0.74) 34%, rgba(5, 4, 13, 0.2) 72%),
      linear-gradient(180deg, rgba(5, 4, 13, 0.24) 0%, rgba(5, 4, 13, 0.15) 48%, #05040d 100%);
  }

  .hero__inner {
    width: min(92rem, calc(100vw - 1.5rem));
    margin: 0 auto;
    padding: 7rem 0 4.5rem;
    display: grid;
    gap: 2rem;
    align-items: end;
  }

  .hero__copy {
    max-width: 38rem;
    display: grid;
    gap: 1.05rem;
  }

  .eyebrow {
    margin: 0;
    color: rgba(190, 135, 255, 0.9);
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
    font-size: 3rem;
    line-height: 0.9;
    max-width: 10.5ch;
  }

  h2 {
    font-size: 2.15rem;
    line-height: 0.98;
  }

  h3 {
    color: rgba(255, 248, 234, 0.98);
    font-size: 1.12rem;
    line-height: 1.16;
  }

  .lede,
  .section-copy p,
  .signal-card p,
  .archetype-card p,
  .encounter__copy > p,
  .encounter-steps p,
  .closing p {
    color: rgba(230, 221, 208, 0.8);
    line-height: 1.58;
  }

  .lede {
    max-width: 34rem;
    font-size: 1rem;
  }

  .hero__actions,
  .closing__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.8rem;
  }

  .cta {
    min-height: 3rem;
    padding: 0 1.15rem;
    border-radius: 0.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    font-weight: 800;
  }

  .cta--primary {
    background: linear-gradient(135deg, #ffd37a, #d99a39);
    color: #170e05;
    box-shadow: 0 12px 32px rgba(217, 154, 57, 0.24);
  }

  .cta--ghost {
    border: 1px solid rgba(255, 220, 151, 0.22);
    color: rgba(250, 244, 232, 0.95);
    background: rgba(8, 6, 19, 0.34);
  }

  .companion-presence {
    width: min(20rem, 56vw);
    justify-self: center;
    position: relative;
    filter: drop-shadow(0 2rem 3.5rem rgba(95, 54, 255, 0.45));
  }

  .companion-presence img {
    width: 100%;
    display: block;
    position: relative;
    z-index: 2;
  }

  .presence-ring {
    position: absolute;
    inset: 16% 8% 2%;
    border-radius: 999px;
    background:
      radial-gradient(circle, rgba(190, 135, 255, 0.42), transparent 58%),
      radial-gradient(circle, rgba(255, 211, 122, 0.22), transparent 70%);
    filter: blur(2rem);
  }

  .resonance,
  .worlds,
  .encounter,
  .closing {
    width: min(92rem, calc(100vw - 1.5rem));
    margin: 0 auto;
  }

  .resonance,
  .worlds,
  .encounter {
    padding: 4rem 0 0;
  }

  .section-copy {
    max-width: 48rem;
    display: grid;
    gap: 0.75rem;
  }

  .section-copy--center {
    margin: 0 auto;
    text-align: center;
  }

  .signal-grid {
    margin-top: 1.4rem;
    display: grid;
    gap: 0.8rem;
  }

  .signal-card {
    min-height: 6.25rem;
    padding: 1rem;
    border: 1px solid rgba(255, 220, 151, 0.13);
    border-radius: 0.75rem;
    background:
      linear-gradient(180deg, rgba(18, 13, 37, 0.84), rgba(8, 7, 18, 0.88)),
      radial-gradient(circle at top left, rgba(126, 255, 201, 0.12), transparent 62%);
    display: grid;
    align-content: space-between;
    gap: 0.85rem;
  }

  .signal-card span {
    width: 2rem;
    height: 0.18rem;
    border-radius: 999px;
    background: linear-gradient(90deg, #ffd37a, #be87ff);
  }

  .archetype-grid {
    margin-top: 1.6rem;
    display: grid;
    gap: 0.8rem;
  }

  .archetype-card {
    min-height: 22rem;
    border: 1px solid rgba(255, 220, 151, 0.16);
    border-radius: 0.8rem;
    overflow: hidden;
    background: rgba(8, 7, 18, 0.88);
    display: grid;
    grid-template-rows: minmax(13rem, 1fr) auto;
  }

  .archetype-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
  }

  .archetype-card__body {
    padding: 1rem;
    display: grid;
    gap: 0.4rem;
    background: linear-gradient(180deg, rgba(8, 7, 18, 0.62), rgba(8, 7, 18, 0.96));
  }

  .archetype-card__label {
    font-size: 0.76rem;
  }

  .encounter {
    display: grid;
    gap: 1.3rem;
    align-items: center;
  }

  .encounter__visual {
    min-height: 27rem;
    border-radius: 1rem;
    overflow: hidden;
    position: relative;
    border: 1px solid rgba(255, 220, 151, 0.15);
    background: rgba(8, 7, 18, 0.85);
  }

  .encounter__visual > img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center top;
  }

  .encounter__companion {
    position: absolute;
    right: 5rem;
    bottom: 0.5rem;
    width: min(18rem, 48vw);
    filter: drop-shadow(0 1.4rem 2.4rem rgba(6, 4, 20, 0.7));
  }

  .encounter__companion img {
    width: 100%;
    display: block;
  }

  .encounter__copy {
    display: grid;
    gap: 0.8rem;
  }

  .encounter-steps {
    margin-top: 0.6rem;
    display: grid;
    gap: 0.75rem;
  }

  .encounter-steps article {
    padding: 0.95rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 220, 151, 0.12);
    background: rgba(16, 12, 32, 0.68);
    display: grid;
    gap: 0.32rem;
  }

  .encounter-steps span {
    color: rgba(255, 211, 122, 0.88);
    font-size: 0.72rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .closing {
    margin-top: 4rem;
    margin-bottom: 4rem;
    padding: 1.4rem;
    border-radius: 1rem;
    border: 1px solid rgba(255, 220, 151, 0.15);
    background:
      radial-gradient(circle at top right, rgba(190, 135, 255, 0.2), transparent 52%),
      linear-gradient(180deg, rgba(18, 13, 37, 0.92), rgba(8, 7, 18, 0.96));
    display: grid;
    gap: 0.8rem;
  }

  @media (min-width: 720px) {
    .topbar__nav {
      display: flex;
    }

    .hero__inner {
      grid-template-columns: minmax(0, 1fr) minmax(17rem, 0.48fr);
    }

    h1 {
      font-size: 5rem;
    }

    h2 {
      font-size: 3.35rem;
    }

    .lede {
      font-size: 1.18rem;
    }

    .resonance,
    .worlds,
    .encounter {
      padding-top: 6rem;
    }

    .signal-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .archetype-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }

    .encounter {
      grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    }

    .closing {
      margin-top: 6rem;
      padding: 2.2rem;
    }
  }

  @media (min-width: 1180px) {
    h1 {
      font-size: 6.1rem;
    }

    h2 {
      font-size: 3.85rem;
    }
  }

  @media (max-width: 719px) {
    .topbar {
      width: calc(100vw - 1rem);
      grid-template-columns: auto auto;
      min-height: 4rem;
    }

    .brand {
      font-size: 1.35rem;
    }

    .hero {
      min-height: 88svh;
      max-height: none;
    }

    .hero__shade {
      background:
        linear-gradient(180deg, rgba(5, 4, 13, 0.56) 0%, rgba(5, 4, 13, 0.72) 42%, #05040d 100%),
        linear-gradient(90deg, rgba(5, 4, 13, 0.78), rgba(5, 4, 13, 0.26));
    }

    .hero__inner {
      padding-top: 5.6rem;
      padding-bottom: 2.2rem;
    }

    h1 {
      font-size: 2.65rem;
    }

    h2 {
      font-size: 2rem;
    }

    .companion-presence {
      order: -1;
      width: min(13rem, 52vw);
    }

    .hero__actions,
    .closing__actions {
      display: grid;
    }

    .archetype-card {
      min-height: 19rem;
    }

    .encounter__visual {
      min-height: 21rem;
    }

    .encounter__companion {
      right: 1rem;
    }

    .signal-grid,
    .archetype-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hero__video {
      display: none;
    }

    .hero {
      background-image: url('/og/looma_world_og.png');
      background-size: cover;
      background-position: center top;
    }
  }
</style>
