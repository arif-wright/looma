<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import PlayerSummary from '$lib/app/dashboard/PlayerSummary.svelte';
  import StatsPanel from '$lib/app/dashboard/StatsPanel.svelte';
  import CreaturesSnapshot from '$lib/app/dashboard/CreaturesSnapshot.svelte';
  import MissionsOverview from '$lib/app/dashboard/MissionsOverview.svelte';
  import AchievementsPanel from '$lib/app/dashboard/AchievementsPanel.svelte';
  import ActivityFeed from '$lib/app/dashboard/ActivityFeed.svelte';

  let sidebarOpen = false;
  let isDesktop = false;
  let reduceMotion = false;

  const navItems = [
    { label: 'Dashboard', href: '/app/dashboard', active: true },
    { label: 'Profile', href: '/app/profile', disabled: true },
    { label: 'Creatures', href: '/app/creatures', disabled: true },
    { label: 'Missions', href: '/app/missions', disabled: true }
  ];

  function disableLink(node: HTMLAnchorElement, disabled?: boolean) {
    const apply = (isDisabled?: boolean) => {
      if (isDisabled) {
        node.setAttribute('aria-disabled', 'true');
        node.setAttribute('tabindex', '-1');
      } else {
        node.removeAttribute('aria-disabled');
        node.removeAttribute('tabindex');
      }
    };

    apply(disabled);

    return {
      update(value?: boolean) {
        apply(value);
      },
      destroy() {
        node.removeAttribute('aria-disabled');
        node.removeAttribute('tabindex');
      }
    };
  }

  function toggleSidebar() {
    if (isDesktop) return;
    sidebarOpen = !sidebarOpen;
  }

  onMount(() => {
    const supabase = supabaseBrowser();

    const handleSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        goto('/login?next=' + encodeURIComponent('/app/dashboard'));
      }
    };

    handleSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        goto('/login?next=' + encodeURIComponent('/app/dashboard'));
      }
    });

    const mq = window.matchMedia('(min-width: 1024px)');
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');

    const updateLayout = () => {
      const wasDesktop = isDesktop;
      isDesktop = mq.matches;
      if (isDesktop) {
        sidebarOpen = true;
      } else if (wasDesktop && !mq.matches) {
        sidebarOpen = false;
      }
    };

    const updateMotion = () => {
      reduceMotion = reduceMq.matches;
    };

    updateLayout();
    updateMotion();

    mq.addEventListener('change', updateLayout);
    reduceMq.addEventListener('change', updateMotion);

    const cleanup = () => {
      listener?.subscription?.unsubscribe();
      mq.removeEventListener('change', updateLayout);
      reduceMq.removeEventListener('change', updateMotion);
    };

    onDestroy(cleanup);
  });

  function handleNavClick(event: MouseEvent, disabled?: boolean) {
    if (!disabled) return;
    event.preventDefault();
  }
</script>

<svelte:head>
  <title>Looma — Dashboard</title>
</svelte:head>

<div class="dashboard-shell" class:sidebar-open={sidebarOpen} data-reduce-motion={reduceMotion}>
  <button
    type="button"
    class="sidebar-toggle"
    on:click={toggleSidebar}
    aria-controls="app-sidebar"
    aria-expanded={sidebarOpen}
  >
    <span class="sr-only">Toggle navigation</span>
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 6h16M4 12h16M4 18h16"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>

  {#if sidebarOpen && !isDesktop}
    <div class="sidebar-overlay" role="presentation" on:click={() => (sidebarOpen = false)}></div>
  {/if}

  <aside
    id="app-sidebar"
    class="sidebar"
    class:open={sidebarOpen}
    role="navigation"
    aria-label="App navigation"
  >
    <div class="sidebar-inner">
      <p class="sidebar-title">App</p>
      <ul class="sidebar-nav">
        {#each navItems as item}
          <li>
            <a
              href={item.href}
              use:disableLink={item.disabled}
              class="nav-link"
              class:active={item.active}
              class:disabled={item.disabled}
              aria-current={item.active ? 'page' : undefined}
              on:click={(event) => handleNavClick(event, item.disabled)}
            >
              {item.label}
            </a>
          </li>
        {/each}
      </ul>
    </div>
  </aside>

  <div class="dashboard-main">
    <header class="dashboard-header" aria-label="Dashboard overview">
      <div class="breadcrumb" aria-label="Breadcrumb">
        <a href="/app">App</a>
        <span aria-hidden="true">/</span>
        <span aria-current="page">Dashboard</span>
      </div>
      <div class="header-actions">
        <button class="btn-secondary ghost-action" type="button">New draft</button>
        <button class="btn-primary" type="button">Record encounter</button>
      </div>
    </header>

    <main class="panels" aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading" class="sr-only">Dashboard</h1>
      <section class="panels-grid">
        <PlayerSummary />
        <StatsPanel />
        <CreaturesSnapshot />
        <MissionsOverview />
        <AchievementsPanel />
        <ActivityFeed />
      </section>
    </main>
  </div>
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .dashboard-shell {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: calc(100vh - 4rem);
  }

  .sidebar-toggle {
    position: fixed;
    left: 1rem;
    top: 1rem;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid rgba(233, 195, 255, 0.28);
    background: rgba(10, 16, 36, 0.65);
    color: rgba(233, 195, 255, 0.92);
    cursor: pointer;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
  }

  .sidebar-toggle svg {
    pointer-events: none;
  }

  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(6, 9, 24, 0.55);
    backdrop-filter: blur(3px);
    z-index: 15;
  }

  .sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(78vw, 280px);
    background: rgba(10, 16, 36, 0.85);
    border-right: 1px solid rgba(233, 195, 255, 0.16);
    padding: 1.5rem 1.25rem;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    z-index: 20;
    display: flex;
  }

  .sidebar.open {
    transform: translateX(0);
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    width: 100%;
  }

  .sidebar-title {
    font-size: 0.85rem;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: rgba(233, 195, 255, 0.65);
    margin: 0;
  }

  .sidebar-nav {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }

  .nav-link {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.65rem 0.75rem;
    border-radius: 12px;
    color: rgba(231, 230, 255, 0.8);
    text-decoration: none;
    transition: background 0.2s ease, color 0.2s ease;
  }

  .nav-link:hover,
  .nav-link:focus-visible {
    background: rgba(233, 195, 255, 0.14);
    color: #ffffff;
  }

  .nav-link.active {
    background: linear-gradient(120deg, rgba(160, 107, 255, 0.38), rgba(90, 224, 199, 0.25));
    color: #ffffff;
    border: 1px solid rgba(233, 195, 255, 0.4);
  }

  .nav-link.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dashboard-main {
    margin-left: 0;
    padding: clamp(88px, 12vw, 120px) clamp(24px, 6vw, 64px) clamp(64px, 5vw, 96px);
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }

  .dashboard-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .breadcrumb {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: rgba(233, 195, 255, 0.8);
  }

  .breadcrumb a {
    color: rgba(233, 195, 255, 0.92);
    text-decoration: none;
  }

  .breadcrumb span[aria-current='page'] {
    color: #ffffff;
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .ghost-action {
    border: 1px solid rgba(233, 195, 255, 0.22);
  }

  .panels {
    display: flex;
    flex-direction: column;
  }

  .panels-grid {
    display: grid;
    gap: 1.5rem;
  }

  @media (min-width: 1024px) {
    .dashboard-shell {
      grid-template-columns: 260px 1fr;
    }

    .sidebar-toggle {
      display: none;
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      transform: none;
      border-right: 1px solid rgba(233, 195, 255, 0.18);
    }

    .dashboard-main {
      margin-left: 0;
      padding-top: clamp(64px, 8vw, 96px);
    }

    .panels-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .dashboard-main {
      padding-inline: clamp(18px, 5vw, 36px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar,
    .sidebar-toggle,
    .nav-link,
    .dashboard-header,
    .panels-grid {
      transition-duration: 0.01ms !important;
    }
  }
</style>
