<script lang="ts">
  import { goto } from '$app/navigation';
  import NavItem from '$lib/components/dashboard/NavItem.svelte';
  import WhisperComposer from '$lib/components/dashboard/WhisperComposer.svelte';
  import FeedPostCard from '$lib/components/dashboard/FeedPostCard.svelte';
  import QuickMissionButton from '$lib/components/dashboard/QuickMissionButton.svelte';
  import EnergyCard from '$lib/components/dashboard/EnergyCard.svelte';
  import StreakCard from '$lib/components/dashboard/StreakCard.svelte';
  import TelemetryCapsule from '$lib/components/dashboard/TelemetryCapsule.svelte';
  import ContactChip from '$lib/components/dashboard/ContactChip.svelte';
  import {
    Sparkles,
    Compass,
    Users,
    PawPrint,
    Map,
    Gamepad2,
    Trophy,
    ShoppingBag
  } from 'lucide-svelte';

  const navItems = [
    { label: 'Resonance', description: 'Return to greeting', href: '#greeting', icon: Sparkles },
    { label: 'Missions', description: 'Choose your next thread', href: '#missions', icon: Compass },
    { label: 'Circle', description: 'Visit the feed', href: '#feed', icon: Users },
    { label: 'Companions', description: 'Care for allies', href: '#companions', icon: PawPrint },
    { label: 'Path', description: 'Explore upcoming beats', href: '#path', icon: Map }
  ];

  const shortcuts = [
    { label: 'Tiles Run', description: 'Daily score chase', href: '/app/games/tiles-run', icon: Gamepad2 },
    { label: 'Leaderboards', description: 'Global standings', href: '/app/leaderboard', icon: Trophy },
    { label: 'Shop', description: 'Boosts & cosmetics', href: '/app/shop', icon: ShoppingBag }
  ];

  const feedPosts = [
    {
      author: 'Aster Nova',
      subtitle: 'Echoed a mission win',
      body: 'Shared three whispers today and the thread feels brighter already. Proud of us.',
      timestamp: '5 minutes ago'
    },
    {
      author: 'Mira Sora',
      subtitle: 'Companion update',
      body: 'Nova curled up on the console after our session. Bond pulse still humming at 78%.',
      timestamp: '22 minutes ago'
    },
    {
      author: 'Kai Hoshi',
      subtitle: 'Energy tip',
      body: 'Took a short resonance walk. Energy popped from 42 to 54. Try it before missions!',
      timestamp: '1 hour ago'
    }
  ];

  const contacts = [
    { name: 'Nova Harper', status: 'online' },
    { name: 'Rin Astor', status: 'idle' },
    { name: 'Jun Ember', status: 'away' },
    { name: 'Sol Vega', status: 'offline' }
  ] as const;

  const handleNav = (href: string) => {
    if (!href) return;
    if (href.startsWith('#')) {
      if (typeof window === 'undefined') return;
      const target = document.querySelector(href) as HTMLElement | null;
      const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
      target?.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' });
    } else {
      void goto(href);
    }
  };

  const handleShortcut = (href: string) => {
    void goto(href);
  };

  const handleWhisperSubmit = (event: CustomEvent<{ body: string }>) => {
    const text = event.detail?.body ?? '';
    if (!text) return;
    // Optimistic toast; integrate API later.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('looma:toast', { detail: { message: 'Whisper delivered.' } }));
    }
  };
</script>

<div class="dashboard">
  <div class="dashboard__backdrop" aria-hidden="true"></div>
  <main class="dashboard__shell" aria-labelledby="dashboard-heading">
    <h1 id="dashboard-heading" class="sr-only">Looma dashboard</h1>
    <div class="dashboard__grid">
      <aside class="sidebar sidebar--left" aria-label="Primary navigation">
        <div class="sidebar__section">
          <p class="sidebar__label">Navigate</p>
          <div class="sidebar__items">
            {#each navItems as item}
              <NavItem
                {...item}
                on:navigate={(event) => handleNav(event.detail.href)}
              />
            {/each}
          </div>
        </div>

        <div class="sidebar__section">
          <p class="sidebar__label">Shortcuts</p>
          <div class="sidebar__items">
            {#each shortcuts as item}
              <NavItem
                {...item}
                on:navigate={() => handleShortcut(item.href)}
              />
            {/each}
          </div>
        </div>
      </aside>

      <section class="content" aria-label="Activity feed">
        <article id="greeting" class="panel animate-in" data-delay="0">
          <header class="panel__header">
            <h2 class="panel__title">Your bond pulses brighter today.</h2>
            <p class="panel__subtitle">Take a breath, share a whisper, and glide into the circle.</p>
          </header>
        </article>

        <article id="whisper" class="panel animate-in" data-delay="1" aria-label="Whisper composer">
          <WhisperComposer on:submit={handleWhisperSubmit} />
        </article>

        <article id="feed" class="panel animate-in" data-delay="2" aria-label="Feed">
          <header class="panel__header">
            <h2 class="panel__title">Signals from your circle</h2>
            <p class="panel__subtitle">Whispers, pulses, and mission echoes.</p>
          </header>
          <div class="feed">
            {#each feedPosts as post}
              <FeedPostCard {...post} />
            {/each}
          </div>
        </article>

        <article id="missions" class="panel animate-in" data-delay="3" aria-label="Quick mission">
          <QuickMissionButton on:launch={() => handleShortcut('/app/missions')} />
          <div class="mini-grid">
            <EnergyCard current={54} max={72} />
            <StreakCard streak={9} />
            <div class="mini-card">
              <h3>Field diagnostics</h3>
              <p>Bond stability at 82%. Open a mission within the next hour to maintain the curve.</p>
            </div>
          </div>
        </article>

        <article id="companions" class="panel animate-in" data-delay="4" aria-label="Companion pulse">
          <header class="panel__header">
            <h2 class="panel__title">Companion pulse</h2>
            <p class="panel__subtitle">Attune to a companion or adopt a new ally.</p>
          </header>
          <div class="companion">
            <div class="companion__card">
              <h3>Nova</h3>
              <p>Energy synced. Mood: serene. Ready for a shared mission.</p>
            </div>
            <button type="button" class="companion__cta" on:click={() => handleShortcut('/app/creatures')}>
              Adopt a companion
            </button>
          </div>
        </article>

        <article id="path" class="panel animate-in" data-delay="5" aria-label="Where next">
          <header class="panel__header">
            <h2 class="panel__title">Where the thread invites you next</h2>
          </header>
          <p class="panel__body">Review your circle notes, then pick a mission that matches today&rsquo;s energy. The field will adapt to your pace.</p>
        </article>
      </section>

      <aside class="sidebar sidebar--right" aria-label="Telemetry and contacts">
        <div class="sidebar__section animate-in" data-delay="1">
          <TelemetryCapsule level={7} xp={1820} xpNext={2400} walletBalance={640} walletCurrency="shards" />
        </div>
        <div class="sidebar__section animate-in" data-delay="2">
          <p class="sidebar__label">Contacts</p>
          <div class="sidebar__items sidebar__items--vertical">
            {#each contacts as contact}
              <ContactChip name={contact.name} status={contact.status} />
            {/each}
          </div>
        </div>
      </aside>
    </div>
  </main>
</div>

<style>
  :global(body) {
    background: transparent;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .dashboard {
    position: relative;
    min-height: 100vh;
    color: rgba(248, 250, 252, 0.85);
  }

  .dashboard__backdrop {
    position: fixed;
    inset: 0;
    background: linear-gradient(135deg, #2c1f4f 0%, #2a205a 45%, #1b173a 100%);
    z-index: -2;
  }

  .dashboard__shell {
    max-width: 1400px;
    margin: 0 auto;
    padding: clamp(2.5rem, 5vw, 4rem) clamp(1.5rem, 6vw, 4rem) 5rem;
  }

  .dashboard__grid {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 320px;
    column-gap: 6rem;
    row-gap: 3rem;
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: 5rem;
    display: grid;
    gap: 2.5rem;
    align-self: start;
  }

  .sidebar__section {
    display: grid;
    gap: 1rem;
    padding: 1.4rem;
    border-radius: 1.75rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(147, 197, 253, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.15);
    backdrop-filter: blur(16px);
  }

  .sidebar__label {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.6);
  }

  .sidebar__items {
    display: grid;
    gap: 0.75rem;
  }

  .sidebar__items--vertical {
    gap: 0.9rem;
  }

  .content {
    display: grid;
    gap: 3rem;
  }

  .panel {
    display: grid;
    gap: 1.5rem;
    padding: 2.1rem clamp(1.6rem, 4vw, 2.4rem);
    border-radius: 1.85rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(147, 197, 253, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.15);
    backdrop-filter: blur(18px);
  }

  .panel__header {
    display: grid;
    gap: 0.4rem;
  }

  .panel__title {
    margin: 0;
    font-size: clamp(1.5rem, 2.4vw, 2rem);
    font-weight: 600;
    color: rgba(248, 250, 252, 0.98);
  }

  .panel__subtitle {
    margin: 0;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.62);
  }

  .panel__body {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(226, 232, 240, 0.78);
    line-height: 1.7;
  }

  .feed {
    display: grid;
    gap: 1.4rem;
  }

  .mini-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.2rem;
    margin-top: 1.6rem;
  }

  .mini-card {
    padding: 1.2rem;
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.12);
    display: grid;
    gap: 0.4rem;
  }

  .mini-card h3 {
    margin: 0;
    font-size: 1rem;
    color: rgba(248, 250, 252, 0.95);
  }

  .mini-card p {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .companion {
    display: grid;
    gap: 1rem;
  }

  .companion__card {
    padding: 1.1rem 1.3rem;
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.12);
    display: grid;
    gap: 0.35rem;
  }

  .companion__card h3 {
    margin: 0;
    font-size: 1.1rem;
    color: rgba(248, 250, 252, 0.95);
  }

  .companion__card p {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .companion__cta {
    justify-self: start;
    padding: 0.75rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(147, 197, 253, 0.3);
    background: transparent;
    color: rgba(248, 250, 252, 0.92);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.78rem;
    cursor: pointer;
    transition: all 160ms ease;
  }

  .companion__cta:hover,
  .companion__cta:focus-visible {
    background: rgba(147, 197, 253, 0.1);
    color: rgba(192, 246, 255, 0.95);
  }

  .companion__cta:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.55);
  }

  .animate-in {
    opacity: 0;
    transform: translateY(18px);
    animation: fadeInUp 0.6s ease forwards;
  }

  .animate-in[data-delay="1"] {
    animation-delay: 0.08s;
  }

  .animate-in[data-delay="2"] {
    animation-delay: 0.16s;
  }

  .animate-in[data-delay="3"] {
    animation-delay: 0.24s;
  }

  .animate-in[data-delay="4"] {
    animation-delay: 0.32s;
  }

  .animate-in[data-delay="5"] {
    animation-delay: 0.4s;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .animate-in {
      opacity: 1;
      transform: none;
      animation: none;
    }
  }

  @media (max-width: 1200px) {
    .dashboard__grid {
      column-gap: 4rem;
      grid-template-columns: 240px minmax(0, 1fr);
    }

    .sidebar--right {
      position: static;
      top: auto;
    }
  }

  @media (max-width: 992px) {
    .dashboard__grid {
      grid-template-columns: minmax(0, 1fr);
      column-gap: 0;
      row-gap: 2rem;
    }

    .sidebar {
      position: static;
      top: auto;
    }
  }

  @media (max-width: 640px) {
    .dashboard__shell {
      padding: 2.5rem 1.5rem 4rem;
    }

    .panel {
      padding: 1.8rem;
      border-radius: 1.6rem;
    }
  }
</style>
