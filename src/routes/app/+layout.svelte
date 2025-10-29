<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import SideRail from '$lib/components/nav/SideRail.svelte';
  import BottomDock from '$lib/components/nav/BottomDock.svelte';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import { sendAnalytics } from '$lib/utils/analytics';

  export let data;

  const userEmail = data?.user?.email ?? data?.session?.user?.email ?? '';
  const activity = data?.navActivity ?? {};
  let bellNotifications = data?.notifications ?? [];
  let bellUnread = data?.notificationsUnread ?? 0;
  let previousPath: string | null = null;

  $: bellNotifications = data?.notifications ?? bellNotifications;
  $: bellUnread = typeof data?.notificationsUnread === 'number' ? data.notificationsUnread : bellUnread;

  function handleCompose() {
    void goto('/app/u/me?compose=1');
  }

  onMount(() => {
    if (!browser) return;
    const month = new Date().getMonth();
    const accent = month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
    document.documentElement.dataset.themeAccent = accent;
    previousPath = window.location.pathname;
  });

  afterNavigate((nav) => {
    if (!browser) return;
    const nextPath = nav.to?.pathname ?? window.location.pathname;
    if (previousPath && previousPath !== nextPath) {
      sendAnalytics('nav_switch', {
        payload: {
          from: previousPath,
          to: nextPath
        }
      });
    }
    previousPath = nextPath;
  });
</script>

<div class="app-shell">
  <aside class="app-rail">
    <SideRail activity={activity} />
  </aside>

  <div class="app-surface">
    <header class="app-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">L</span>
        <div class="brand-copy">
          <p class="brand-title">Looma</p>
          <p class="brand-sub">Hybrid Home</p>
        </div>
      </div>

      <div class="header-meta">
        <NotificationBell notifications={bellNotifications} unreadCount={bellUnread} />
        {#if userEmail}
          <span class="user-email">{userEmail}</span>
        {/if}
        <form method="POST" action="/app?/logout">
          <button type="submit" class="logout">Logout</button>
        </form>
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>
  </div>
</div>

<BottomDock activity={activity} on:compose={handleCompose} />

<style>
  .app-shell {
    display: grid;
    grid-template-columns: auto 1fr;
    height: 100vh;
    background: radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 55%),
      radial-gradient(circle at bottom right, rgba(45, 212, 191, 0.08), transparent 50%),
      #0f172a;
    color: rgba(226, 232, 240, 0.96);
  }

  .app-rail {
    backdrop-filter: blur(12px);
  }

  .app-surface {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100vh;
  }

  .app-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(15, 23, 42, 0.78);
    backdrop-filter: blur(16px);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .brand-mark {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.32), rgba(45, 212, 191, 0.3));
    font-weight: 700;
    font-size: 1.2rem;
    color: rgba(12, 74, 110, 0.9);
  }

  .brand-copy {
    display: grid;
    gap: 2px;
  }

  .brand-title {
    margin: 0;
    font-weight: 600;
    font-size: 1.1rem;
  }

  .brand-sub {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(148, 163, 184, 0.68);
  }

  .header-meta {
    display: flex;
    gap: 18px;
    align-items: center;
  }

  .user-email {
    font-size: 0.88rem;
    color: rgba(148, 163, 184, 0.78);
  }

  .logout {
    padding: 8px 18px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(30, 41, 59, 0.7);
    color: rgba(226, 232, 240, 0.9);
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .logout:hover,
  .logout:focus-visible {
    background: rgba(56, 189, 248, 0.22);
    color: rgba(15, 23, 42, 0.92);
    transform: translateY(-1px);
  }

  .app-main {
    padding: 32px;
    overflow-y: auto;
  }

  @media (max-width: 960px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .app-rail {
      display: none;
    }

    .app-main {
      padding: 20px;
      padding-bottom: 96px;
    }
  }
</style>
