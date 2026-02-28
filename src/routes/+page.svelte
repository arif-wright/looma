<script lang="ts">
  export let data: { loggedIn: boolean };

  const isAuthed = data.loggedIn;
  const primaryHref = isAuthed ? '/app/home' : '/app/auth';
  const primaryLabel = isAuthed ? 'Enter sanctuary' : 'Begin your bond';
  const secondaryHref = isAuthed ? '/app/memory' : '/app/signup';
  const secondaryLabel = isAuthed ? 'Open journal' : 'Create account';

  const pillars = [
    {
      eyebrow: 'Sanctuary',
      title: 'A companion-first home',
      body: 'Check in, care, and reconnect from one calm place built for short daily visits on your phone.'
    },
    {
      eyebrow: 'Journal',
      title: 'Memory that feels alive',
      body: 'Looma keeps a visible memory trail so your bond feels cumulative, not disposable.'
    },
    {
      eyebrow: 'Weave',
      title: 'Social that supports the bond',
      body: 'Messages, circles, and missions feed the relationship instead of competing with it.'
    }
  ];

  const rhythm = [
    'Check in with your companion and share how you feel.',
    'See what Looma remembers in your journal and rituals.',
    'Carry the bond into messages, circles, missions, and play.'
  ];

  const moments = [
    'Built for one-thumb use and quick return visits.',
    'Warm, private-feeling spaces instead of feed pressure.',
    'A companion relationship that gains texture over time.'
  ];
</script>

<svelte:head>
  <title>Looma</title>
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="landing-shell">
  <header class="topbar">
    <a class="brand" href="/">Looma</a>
    <a class="topbar__link" href={primaryHref}>{isAuthed ? 'Open app' : 'Sign in'}</a>
  </header>

  <main id="main" class="landing-main">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero__copy">
        <p class="eyebrow">Companion sanctuary</p>
        <h1 id="hero-title">A relationship platform for the companion you return to every day.</h1>
        <p class="lede">
          Looma is a mobile-first sanctuary where memory, care, messages, and rituals all strengthen one bond over
          time.
        </p>

        <div class="hero__actions">
          <a class="cta cta--primary" href={primaryHref}>{primaryLabel}</a>
          <a class="cta cta--secondary" href={secondaryHref}>{secondaryLabel}</a>
        </div>

        <div class="hero__chips" aria-label="Platform traits">
          <span>Mobile first</span>
          <span>Companion memory</span>
          <span>Gentle social layer</span>
        </div>
      </div>

      <div class="hero__panel" aria-label="Looma preview">
        <div class="preview-card preview-card--primary">
          <span class="preview-card__eyebrow">Today with Looma</span>
          <strong>Your companion is near.</strong>
          <p>Check in, reopen your journal, and keep the thread of the bond warm.</p>
        </div>
        <div class="preview-grid">
          <article class="preview-card">
            <span class="preview-card__eyebrow">Journal</span>
            <strong>What Looma remembers</strong>
            <p>Visible memory gives the relationship continuity.</p>
          </article>
          <article class="preview-card">
            <span class="preview-card__eyebrow">Circles</span>
            <strong>Connection without noise</strong>
            <p>Messages and circles reinforce the companion loop.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="pillars" aria-label="Core pillars">
      {#each pillars as pillar}
        <article class="panel panel--soft">
          <p class="eyebrow">{pillar.eyebrow}</p>
          <h2>{pillar.title}</h2>
          <p>{pillar.body}</p>
        </article>
      {/each}
    </section>

    <section class="story-grid" aria-label="How Looma works">
      <article class="panel panel--deep">
        <p class="eyebrow">The daily rhythm</p>
        <h2>Three small returns make the platform work.</h2>
        <ol class="steps">
          {#each rhythm as step}
            <li>{step}</li>
          {/each}
        </ol>
      </article>

      <article class="panel panel--deep">
        <p class="eyebrow">Why it feels different</p>
        <h2>Designed for the way people actually come back on their phones.</h2>
        <ul class="moments">
          {#each moments as moment}
            <li>{moment}</li>
          {/each}
        </ul>
      </article>
    </section>

    <section class="closing panel panel--soft" aria-labelledby="closing-title">
      <p class="eyebrow">Begin</p>
      <h2 id="closing-title">Start with one companion. Let the rest of Looma grow around that relationship.</h2>
      <p>
        The product works best when it feels intimate first. That is the promise the platform now needs to make from
        the first screen.
      </p>
      <div class="closing__actions">
        <a class="cta cta--primary" href={primaryHref}>{primaryLabel}</a>
        <a class="cta cta--secondary" href={secondaryHref}>{secondaryLabel}</a>
      </div>
    </section>
  </main>
</div>

<style>
  :global(body) {
    background:
      radial-gradient(circle at top, rgba(205, 170, 88, 0.14), transparent 30%),
      linear-gradient(180deg, #0d1112 0%, #11171b 44%, #0b0e10 100%);
  }

  .skip-link {
    position: absolute;
    left: 0.75rem;
    top: -3rem;
    z-index: 40;
    border-radius: 999px;
    background: rgba(247, 240, 225, 0.96);
    color: #16110b;
    padding: 0.5rem 0.8rem;
    text-decoration: none;
  }

  .skip-link:focus {
    top: 0.75rem;
  }

  .landing-shell {
    min-height: 100vh;
    color: rgba(245, 238, 225, 0.96);
  }

  .topbar,
  .landing-main {
    width: min(72rem, calc(100vw - 1.5rem));
    margin: 0 auto;
  }

  .topbar {
    padding: 0.9rem 0 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .brand,
  .topbar__link {
    text-decoration: none;
    color: inherit;
  }

  .brand {
    font-family: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .topbar__link {
    min-height: 2.4rem;
    padding: 0 0.9rem;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.18);
    background: rgba(43, 33, 20, 0.24);
    font-size: 0.88rem;
    font-weight: 600;
  }

  .landing-main {
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1rem;
  }

  .hero,
  .panel {
    border-radius: 1.35rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    box-shadow: 0 18px 40px rgba(6, 10, 13, 0.28);
  }

  .hero {
    padding: 1rem;
    background:
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 38%),
      linear-gradient(160deg, rgba(21, 25, 27, 0.96), rgba(11, 14, 16, 0.98));
    display: grid;
    gap: 1rem;
  }

  .hero__copy {
    display: grid;
    gap: 0.75rem;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    font-family: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    font-size: clamp(2rem, 8vw, 3.6rem);
    line-height: 0.98;
    letter-spacing: -0.04em;
    max-width: 12ch;
  }

  .lede,
  .panel p,
  .preview-card p {
    color: rgba(223, 213, 194, 0.82);
    line-height: 1.5;
  }

  .hero__actions,
  .closing__actions {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.65rem;
  }

  .cta {
    min-height: 2.95rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    font-weight: 700;
    text-align: center;
    padding: 0 1rem;
  }

  .cta--primary {
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.94), rgba(166, 121, 61, 0.92));
    color: rgba(22, 16, 9, 0.96);
  }

  .cta--secondary {
    border: 1px solid rgba(214, 190, 141, 0.18);
    background: rgba(43, 33, 20, 0.22);
    color: rgba(245, 238, 225, 0.95);
  }

  .hero__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .hero__chips span {
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background: rgba(43, 33, 20, 0.2);
    padding: 0.35rem 0.7rem;
    color: rgba(230, 219, 196, 0.82);
    font-size: 0.78rem;
    white-space: nowrap;
  }

  .hero__panel,
  .preview-grid,
  .pillars,
  .story-grid {
    display: grid;
    gap: 0.75rem;
  }

  .preview-card,
  .panel--soft,
  .panel--deep {
    background:
      linear-gradient(180deg, rgba(29, 24, 17, 0.62), rgba(13, 16, 19, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 54%);
  }

  .preview-card {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    padding: 0.95rem;
    display: grid;
    gap: 0.25rem;
  }

  .preview-card--primary {
    min-height: 9.5rem;
    align-content: end;
  }

  .preview-card__eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.74);
  }

  .preview-card strong,
  .panel h2 {
    color: rgba(248, 241, 227, 0.98);
  }

  .panel {
    padding: 1rem;
  }

  .panel h2 {
    margin-top: 0.2rem;
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .steps,
  .moments {
    margin: 0.8rem 0 0;
    padding-left: 1.1rem;
    color: rgba(230, 219, 196, 0.84);
    line-height: 1.55;
  }

  .closing {
    display: grid;
    gap: 0.8rem;
  }

  @media (min-width: 720px) {
    .landing-main {
      gap: 1.1rem;
    }

    .hero {
      padding: 1.25rem;
    }

    .hero__actions,
    .closing__actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pillars {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .story-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 980px) {
    .topbar,
    .landing-main {
      width: min(78rem, calc(100vw - 3rem));
    }

    .hero {
      grid-template-columns: minmax(0, 1.1fr) minmax(22rem, 0.9fr);
      align-items: stretch;
      padding: 1.35rem;
    }

    .preview-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
