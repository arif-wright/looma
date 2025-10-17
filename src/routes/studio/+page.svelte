<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { PUBLIC_SITE_URL } from '$env/static/public';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import AuthProgress from '$lib/ui/AuthProgress.svelte';
  import {
    consumeHashSession,
    type HashResult,
    sanitizeInternalPath
  } from '$lib/auth/consumeHashSession';

  type ProgressState = 'processing' | 'success' | 'error';

  const STATUS_MESSAGES: Record<HashResult['status'], string> = {
    success: 'Signed in successfully.',
    expired: 'This link has expired. Request a new magic link.',
    invalid: 'This link is invalid or already used.',
    network_error: "We couldn't reach the server. Check your connection and try again."
  };

  const PUBLIC_SITE_ORIGIN = (PUBLIC_SITE_URL || '').replace(/\/$/, '');
  const ORIGIN = PUBLIC_SITE_ORIGIN || (typeof window !== 'undefined' ? window.location.origin : '');
  const CANONICAL = '/';
  const abs = (path: string) => (ORIGIN ? `${ORIGIN}${path}` : path);
  const SHARE_URL = ORIGIN || CANONICAL;
  const SITE_TITLE = 'Looma by Kinforge — Game-ready creature collections';
  const SITE_DESCRIPTION =
    'Looma helps Kinforge game masters collect, organise, and deploy creatures with a shared toolkit built for collaborative worldbuilding.';

  const features = [
    {
      title: 'Curate living bestiaries',
      description:
        'Organise every Kinforge creature in one shared source of truth. Tag by biome, temperament, and abilities so the right encounter is always one tap away.'
    },
    {
      title: 'Prep with confidence',
      description:
        'Build encounter groups in advance, attach custom rules, and drop them into any session. Looma keeps your notes, stat blocks, and art synced.'
    },
    {
      title: 'Co-create with your table',
      description:
        'Invite collaborators to suggest new creatures, refine lore, or set difficulty tuning. Role-based access keeps the final word in your hands.'
    }
  ];

  const howItWorks = [
    {
      title: 'Capture inspirations',
      text: 'Import from Kinforge, upload your own art, or start with a blank card. Looma standardises the format so everything stays playable.'
    },
    {
      title: 'Build smart lists',
      text: 'Group creatures by campaign arc, player level, or biome. Weighted search keeps perfect matches at the top.'
    },
    {
      title: 'Deploy instantly',
      text: 'Launch an encounter straight to your Kinforge dashboard or export printable summaries when you need to go offline.'
    }
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Kinforge',
    url: SHARE_URL,
    logo: abs('/og/looma_og.png'),
    sameAs: ['https://kinforge.gg', 'https://twitter.com/kinforge'],
    brand: {
      '@type': 'Brand',
      name: 'Looma'
    }
  };

  let progressState: ProgressState | null = null;
  let message = 'Signing you in...';
  let nextPath: string | null = null;
  let desiredNext = '/app';
  let errorMessage: string | null = null;
  let lastStatus: HashResult['status'] | null = null;

  function debug(...args: unknown[]) {
    if (import.meta.env.DEV) {
      console.debug('[looma:auth-progress]', ...args);
    }
  }

  function hasSupabaseHash(): boolean {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash || '';
    if (!hash.startsWith('#')) return false;

    const params = new URLSearchParams(hash.slice(1));
    return (
      params.has('access_token') ||
      params.has('refresh_token') ||
      params.get('type') === 'recovery' ||
      params.get('type') === 'magiclink' ||
      params.has('error') ||
      params.has('error_code') ||
      params.has('error_description')
    );
  }

  async function syncServerCookies() {
    const supabase = supabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;

    try {
      const response = await fetch('/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token
        })
      });
      if (!response.ok) {
        throw new Error(`Refresh failed with status ${response.status}`);
      }
    } catch (error) {
      debug('syncServerCookies network error', error);
      throw error;
    }
  }

  function resolveNext(): string {
    if (typeof window === 'undefined') return '/app';
    const params = new URLSearchParams(window.location.search);
    const candidate = sanitizeInternalPath(params.get('next') ?? params.get('redirectTo'));
    return candidate ?? '/app';
  }

  async function processMagicLink() {
    progressState = 'processing';
    message = 'Signing you in...';
    errorMessage = null;
    nextPath = null;
    const target = resolveNext();
    desiredNext = target;
    debug('state -> processing');

    const result = await consumeHashSession();
    lastStatus = result.status;
    debug('consumeHashSession result', result);

    if (result.status !== 'success') {
      progressState = 'error';
      errorMessage = result.message ?? STATUS_MESSAGES[result.status];
      debug('state -> error', errorMessage);
      return;
    }

    try {
      await syncServerCookies();
    } catch (error) {
      progressState = 'error';
      lastStatus = 'network_error';
      errorMessage = STATUS_MESSAGES.network_error;
      debug('state -> error (refresh failed)', error);
      return;
    }

    progressState = 'success';
    nextPath = target;
    debug('state -> success', { nextPath });

    await goto(target, { replaceState: true });
  }

  async function handleRetry() {
    debug('retry requested', { lastStatus });
    if (lastStatus === 'network_error') {
      await processMagicLink();
    } else {
      await goto(`/login?next=${encodeURIComponent(desiredNext)}`);
    }
  }

  onMount(async () => {
    if (!hasSupabaseHash()) return;
    await processMagicLink();
  });
</script>

<svelte:head>
  <title>{SITE_TITLE}</title>
  <meta name="description" content={SITE_DESCRIPTION} />
  <link rel="canonical" href="/" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content={SITE_TITLE} />
  <meta property="og:description" content={SITE_DESCRIPTION} />
  <meta property="og:url" content={SHARE_URL} />
  <meta property="og:image" content={abs('/og/looma_og.png')} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={SITE_TITLE} />
  <meta name="twitter:description" content={SITE_DESCRIPTION} />
  <meta name="twitter:image" content={abs('/og/looma_og.png')} />

  <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
</svelte:head>

{#if progressState}
  <AuthProgress
    state={progressState}
    message={message}
    next={nextPath}
    errorMessage={errorMessage}
    onRetry={progressState === 'error' ? handleRetry : undefined}
  />
{:else}
  <a class="skip-link" href="#main">Skip to content</a>

  <div class="page">
    <header class="hero" aria-labelledby="hero-heading">
      <div class="hero__content">
        <p class="hero__eyebrow">Kinforge presents</p>
        <h1 id="hero-heading">Looma keeps every creature at your command</h1>
        <p class="hero__lead">
          Prep faster, improvise with confidence, and give your players unforgettable encounters.
          Looma is the command centre for Kinforge storytellers who need living creature collections in seconds.
        </p>
        <div class="hero__actions">
          <a class="button" href="/login">Start with your Kinforge account</a>
          <a class="button button--ghost" href="/login">Explore the demo library</a>
        </div>
      </div>
      <figure class="hero__media">
        <img
          src="/og/looma_og.png"
          alt="Stylised Looma dashboard showing curated creature cards"
          width="1200"
          height="630"
          loading="lazy"
        />
      </figure>
    </header>

    <main id="main" tabindex="-1">
      <section class="features" aria-labelledby="features-heading">
        <div class="section-intro">
          <h2 id="features-heading">Built to tame every bestiary</h2>
          <p>Everything game runners need to capture, classify, and deploy Kinforge creatures without losing momentum.</p>
        </div>
        <div class="feature-grid">
          {#each features as feature}
            <article class="feature-card">
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </article>
          {/each}
        </div>
      </section>

      <section class="how" aria-labelledby="how-heading">
        <div class="section-intro">
          <h2 id="how-heading">How Looma supports your session flow</h2>
          <p>From early brainstorms to the moment initiative starts, Looma keeps the details consistent.</p>
        </div>
        <ol class="how-steps">
          {#each howItWorks as step, index}
            <li class="how-step">
              <span class="how-step__number" aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          {/each}
        </ol>
      </section>

      <section class="cta" aria-labelledby="cta-heading">
        <div class="cta__content">
          <h2 id="cta-heading">Ready to bring your creatures to life?</h2>
          <p>Log in with your Kinforge credentials and start building encounters that surprise every table.</p>
        </div>
        <a class="button button--light" href="/login">Sign in to Looma</a>
      </section>
    </main>

    <footer class="footer" aria-label="Looma footer">
      <div>
        <strong>Looma</strong>
        <p>Creature collections, encounter prep, and collaborative lore for Kinforge worlds.</p>
      </div>
      <nav aria-label="Secondary">
        <ul>
          <li><a href="/login">Log in</a></li>
          <li><a href="/login">Request access</a></li>
          <li><a href="mailto:team@kinforge.gg">Contact</a></li>
        </ul>
      </nav>
    </footer>
  </div>
{/if}

<style>
  :global(body) {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #0f172a;
    background: #f8fafc;
  }

  :global(body:focus-visible) {
    outline: none;
  }

  :global(a) {
    color: inherit;
  }

  .skip-link {
    position: absolute;
    left: -9999px;
    top: 1rem;
    background: #0f172a;
    color: #fff;
    padding: 0.5rem 1rem;
    border-radius: 9999px;
    z-index: 10;
  }

  .skip-link:focus {
    left: 1rem;
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: 6rem;
  }

  .hero {
    display: grid;
    gap: 2rem;
    padding: clamp(3rem, 5vw, 5rem) clamp(1.5rem, 4vw, 5rem) 0;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 64, 175, 0.85));
    color: #f8fafc;
  }

  .hero__content {
    display: grid;
    gap: 1.25rem;
    max-width: 40rem;
  }

  .hero__eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-weight: 600;
    font-size: 0.85rem;
    color: rgba(248, 250, 252, 0.72);
  }

  .hero h1 {
    font-size: clamp(2.5rem, 6vw, 3.5rem);
    line-height: 1.1;
    margin: 0;
  }

  .hero__lead {
    font-size: 1.1rem;
    line-height: 1.6;
    color: rgba(248, 250, 252, 0.85);
  }

  .hero__actions {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .hero__media {
    margin: 0;
    justify-self: center;
  }

  .hero__media img {
    border-radius: 1.5rem;
    width: min(100%, 820px);
    height: auto;
    box-shadow: 0 20px 60px rgba(15, 23, 42, 0.45);
  }

  main {
    display: grid;
    gap: 6rem;
    padding: 0 clamp(1.5rem, 4vw, 6rem) clamp(4rem, 8vw, 6rem);
  }

  .section-intro {
    max-width: 48rem;
    margin: 0 auto 2.5rem auto;
    text-align: center;
  }

  .section-intro h2 {
    margin: 0 0 1rem 0;
    font-size: clamp(2rem, 4vw, 2.75rem);
    color: #0f172a;
  }

  .section-intro p {
    margin: 0;
    color: #475569;
    line-height: 1.7;
  }

  .feature-grid {
    display: grid;
    gap: 1.75rem;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .feature-card {
    background: #fff;
    border-radius: 1.25rem;
    padding: 2rem;
    box-shadow: 0 20px 50px rgba(15, 23, 42, 0.08);
    display: grid;
    gap: 0.75rem;
  }

  .feature-card h3 {
    margin: 0;
    font-size: 1.3rem;
    color: #0f172a;
  }

  .feature-card p {
    margin: 0;
    color: #475569;
    line-height: 1.6;
  }

  .how-steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 1.5rem;
  }

  .how-step {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto 1fr;
    align-items: start;
  }

  .how-step__number {
    background: #0f172a;
    color: #f8fafc;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    margin-top: 0.25rem;
  }

  .how-step h3 {
    margin: 0 0 0.5rem 0;
    color: #0f172a;
    font-size: 1.25rem;
  }

  .how-step p {
    margin: 0;
    color: #475569;
    line-height: 1.6;
  }

  .cta {
    background: linear-gradient(120deg, rgba(15, 23, 42, 0.97), rgba(30, 64, 175, 0.82));
    color: #f8fafc;
    border-radius: 1.75rem;
    padding: clamp(2.5rem, 5vw, 3.5rem);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: flex-start;
  }

  .cta__content h2 {
    margin: 0 0 0.75rem 0;
    font-size: clamp(2rem, 4vw, 2.5rem);
    line-height: 1.2;
  }

  .cta__content p {
    margin: 0;
    line-height: 1.6;
    color: rgba(248, 250, 252, 0.8);
  }

  .footer {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    padding: clamp(2.5rem, 5vw, 3.5rem);
    background: #0f172a;
    color: #f8fafc;
  }

  .footer strong {
    font-size: 1.25rem;
  }

  .footer nav ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 1.5rem;
  }

  .footer nav a {
    color: rgba(248, 250, 252, 0.85);
    text-decoration: none;
  }

  .footer nav a:hover,
  .footer nav a:focus-visible {
    text-decoration: underline;
  }

  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    background: #fbbf24;
    color: #0f172a;
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 0 10px 25px rgba(15, 23, 42, 0.25);
  }

  .button:focus-visible {
    outline: 3px solid #facc15;
    outline-offset: 2px;
  }

  .button:hover {
    transform: translateY(-2px);
  }

  .button--ghost {
    background: transparent;
    color: #f8fafc;
    border: 1px solid rgba(248, 250, 252, 0.6);
    box-shadow: none;
  }

  .button--ghost:hover {
    background: rgba(15, 23, 42, 0.3);
  }

  .button--light {
    background: #f8fafc;
    color: #0f172a;
    box-shadow: none;
  }

  .button--light:hover {
    background: #e2e8f0;
  }

  @media (max-width: 900px) {
    .hero {
      padding-bottom: clamp(3rem, 8vw, 4rem);
    }

    .hero__media img {
      width: min(100%, 620px);
    }
  }

  @media (min-width: 900px) {
    .hero {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: center;
    }

    .hero__content {
      order: 1;
    }

    .hero__media {
      order: 2;
    }

    .cta {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .button,
    .button:hover {
      transition: none;
      transform: none;
    }
  }
</style>
