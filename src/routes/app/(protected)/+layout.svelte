<script lang="ts">
  import { browser } from '$app/environment';
  import { afterNavigate, goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import SideRail from '$lib/components/nav/SideRail.svelte';
  import BottomDock from '$lib/components/nav/BottomDock.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import { sendAnalytics } from '$lib/utils/analytics';
  import { logout } from '$lib/auth/logout';
  import StatusCapsuleNav from '$lib/components/ui/StatusCapsule.svelte';
  import { page } from '$app/stores';

  export let data;

  const userEmail = data?.user?.email ?? '';
  const activity = data?.navActivity ?? {};
  let bellNotifications: NotificationItem[] = (data?.notifications ?? []) as NotificationItem[];
  let bellUnread = data?.notificationsUnread ?? 0;
  let previousPath: string | null = null;

  $: bellNotifications = (data?.notifications ?? bellNotifications) as NotificationItem[];
  $: bellUnread = typeof data?.notificationsUnread === 'number' ? data.notificationsUnread : bellUnread;

  function handleCompose() {
    void goto('/app/u/me?compose=1');
  }

  function handleLogout() {
    void logout();
  }

  const pageStore = page;
  let isHome = false;

  $: isHome = $pageStore.url.pathname === '/app/home';

  if (browser) {
    onMount(() => {
      const month = new Date().getMonth();
      const accent =
        month >= 5 && month <= 8 ? 'amber' : month >= 9 || month <= 1 ? 'neonMagenta' : 'neonCyan';
      document.documentElement.dataset.themeAccent = accent;
      previousPath = window.location.pathname;
    });

    afterNavigate((nav) => {
      const nextUrl = nav.to?.url ?? new URL(window.location.href);
      const nextPath = nextUrl.pathname;
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
  }
</script>

<div class={`app-shell ${isHome ? 'app-shell--home' : ''}`}>
  {#if !isHome}
    <aside class="app-rail">
      <SideRail activity={activity} />
    </aside>
  {/if}
  <div class="app-surface">
    <header class="app-header">
      <span aria-hidden="true"></span>
      <StatusCapsuleNav
        energy={data?.headerStats?.energy ?? null}
        energyMax={data?.headerStats?.energy_max ?? null}
        level={data?.headerStats?.level ?? null}
        xp={data?.headerStats?.xp ?? null}
        xpNext={data?.headerStats?.xp_next ?? null}
        unreadCount={bellUnread}
        notifications={bellNotifications}
        userEmail={userEmail}
        onLogout={handleLogout}
      />
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
    min-height: 100vh;
    background: transparent;
  }

  .app-shell--home {
    grid-template-columns: 1fr;
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
    align-items: flex-start;
    justify-content: flex-end;
    padding: 18px 28px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: transparent;
    backdrop-filter: blur(14px);
    position: relative;
    z-index: 10;
  }

  .app-main {
    padding: 0;
    overflow-y: auto;
  }

  @media (max-width: 960px) {
    .app-shell {
      grid-template-columns: 1fr;
    }

    .app-header {
      padding: 18px 20px;
    }

    .app-main {
      padding: 24px;
    }
  }
</style>
