<script lang="ts">
  import { onMount } from 'svelte';
  import ThreadBackground from '$lib/ui/ThreadBackground.svelte';
  import ParticlesLayer from '$lib/ui/ParticlesLayer.svelte';
  import type { User } from '@supabase/supabase-js';

  export let data: { loggedIn: boolean };

  let heroVideo: HTMLVideoElement | null = null;
  const isAuthed = data.loggedIn;
  const enterHref = isAuthed ? '/app/home' : '/app/auth';
  const enterLabel = 'Enter';
  const primaryHref = enterHref;
  const primaryLabel = isAuthed ? 'Enter Looma' : 'Begin your bond';

  onMount(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    if (!prefersReduced && heroVideo) {
      heroVideo.playbackRate = 0.65;
    }
  });
</script>

<a class="skip-link" href="#main">Skip to content</a>

<div class="bg-stack" aria-hidden="true">
  <video
    bind:this={heroVideo}
    data-testid="hero-video"
    class="bg-video"
    autoplay
    muted
    loop
    playsinline
    preload="auto"
    poster="/og/looma_world_og.png"
  >
    <source src="/videos/looma_hero_bg.webm" type="video/webm" />
    <source src="/videos/looma_hero_bg.mp4" type="video/mp4" />
  </video>
  <div class="bg-color"></div>
  <ParticlesLayer className="particles-on" />
  <div class="bg-scrim"></div>
</div>

<nav class="nav-overlay" aria-label="Global">
  <div class="nav-overlay__inner container">
    <a href="/" class="brand">Looma</a>
    <div class="nav-actions">
      <a class="btn btn--ghost btn--sm" href={enterHref}>{enterLabel}</a>
    </div>
  </div>
</nav>

<main id="main">
  <section class="hero-full" aria-label="Looma hero">
    <div class="hero-full__bg">
      <ThreadBackground />
    </div>
    <div class="hero-full__inner container">
      <div class="hero-full__copy hero-content">
        <h1 class="h1-serif-hero">
          Looma remembers<br class="break-desktop" /> you.
        </h1>
        <p class="lede">
          A living world that learns you back with every choice you make. Bonds deepen as you tend, explore, and share.
        </p>
        <div class="btn-row">
          <a class="btn btn--primary btn-primary" href={primaryHref}>{primaryLabel}</a>
          <a class="btn btn--ghost btn-secondary" href="#story">Watch the story</a>
        </div>
      </div>
    </div>
  </section>

  <section class="subcards container" aria-label="Looma feature cards">
    <article class="card card--glass" id="story">
      <p class="eyebrow">A world alive</p>
      <h2 class="h2-card">A world that learns you back</h2>
      <div class="rule rule--grad"></div>
      <p class="muted">Looma notices the choices you make and reflects them back through each returning encounter.</p>
    </article>
    <article class="card card--glass">
      <p class="eyebrow">Playstyles</p>
      <h2 class="h2-card">Built for dreamers, players, and explorers</h2>
      <div class="rule rule--grad"></div>
      <ul class="bullets">
        <li><strong>Dream:</strong> sketch possibilities and watch them awaken.</li>
        <li><strong>Play:</strong> invite companions into your sessions and improvise together.</li>
        <li><strong>Explore:</strong> follow their stories to new locations and memories.</li>
      </ul>
    </article>
    <article class="card card--glass">
      <p class="eyebrow">Bond loop</p>
      <h2 class="h2-card">The Bond System</h2>
      <div class="rule rule--grad"></div>
      <ol class="steps">
        <li><strong>Tend</strong> offer attention and rituals to strengthen trust.</li>
        <li><strong>Explore</strong> move through the world together and uncover shared lore.</li>
        <li><strong>Share</strong> tell others what you discover so the bond persists.</li>
      </ol>
    </article>
    <article class="card card--glass">
      <p class="eyebrow">Community</p>
      <h2 class="h2-card">Threads that connect us all</h2>
      <div class="rule rule--grad"></div>
      <p class="muted">Your bond joins a wider tapestry of keepers and wanderers, giving new players a familiar welcome.</p>
    </article>
  </section>

  <footer class="mini-footer container">2025 Looma.</footer>
</main>
