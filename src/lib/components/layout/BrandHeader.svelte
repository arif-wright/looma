<script lang="ts">
  import StatusCapsule from '$lib/components/ui/StatusCapsule.svelte';
  import CenterIconNav from '$lib/components/ui/CenterIconNav.svelte';
  import type { IconNavItem, NotificationItem } from '$lib/components/ui/types';
  import { Search } from 'lucide-svelte';
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';

  export let iconNavItems: IconNavItem[] = [];
  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let walletBalance: number | null = null;
  export let walletCurrency = 'SHARDS';
  export let notifications: NotificationItem[] = [];
  export let unreadCount = 0;
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};
  export let activeCompanion: ActiveCompanionSnapshot | null = null;
</script>

<header class="app-header" data-testid="brand-header">
  <div class="app-header__inner">
    <div class="header-left">
      <div class="logo-lockup" role="img" aria-label="Looma sanctuary sigil">
        <span class="logo-dot" aria-hidden="true"></span>
        <span class="logo-text">Looma</span>
      </div>
      <label class="search-omnibox panel-glass" role="search" aria-label="Search Looma">
        <span class="search-icon" aria-hidden="true">
          <Search aria-hidden="true" />
        </span>
        <input type="search" placeholder="Search companions, people, and rituals" aria-label="Search Looma" />
      </label>
    </div>
    <div class="header-nav">
      <CenterIconNav className="hidden md:flex" items={iconNavItems} />
    </div>
    <div class="header-right">
      <StatusCapsule
        className="ml-auto shrink-0"
        energy={energy}
        energyMax={energyMax}
        level={level}
        xp={xp}
        xpNext={xpNext}
        walletBalance={walletBalance}
        walletCurrency={walletCurrency}
        unreadCount={unreadCount}
        notifications={notifications}
        userEmail={userEmail}
        activeCompanion={activeCompanion}
        onLogout={onLogout}
      />
    </div>
  </div>
</header>

<style>
  .app-header {
    position: sticky;
    top: 0;
    z-index: 40;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    backdrop-filter: blur(18px);
    overflow: visible;
  }

  .app-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(16, 13, 18, 0.9), rgba(29, 22, 31, 0.82));
    opacity: 0.94;
    z-index: -1;
  }

  .app-header__inner {
    width: 100%;
    max-width: none;
    margin: 0;
    box-sizing: border-box;
    padding: 0 clamp(1.25rem, 3vw, 3rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    min-height: 56px;
    flex-wrap: nowrap;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
    flex: 1 1 auto;
  }

  .logo-lockup {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.65rem;
    border-radius: 999px;
    border: 1px solid rgba(240, 222, 193, 0.14);
    background: rgba(255, 246, 230, 0.04);
    box-shadow: 0 10px 26px rgba(11, 8, 11, 0.44);
  }

  .logo-dot {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(112, 221, 194, 0.92), rgba(240, 180, 112, 0.72));
    box-shadow: 0 0 24px rgba(240, 180, 112, 0.28);
  }

  .logo-text {
    font-size: 0.8rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(250, 242, 230, 0.82);
  }

  .search-omnibox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 20px;
    padding: 0 0.85rem;
    height: 2.35rem;
    width: clamp(12rem, 30vw, 22rem);
    border: 1px solid rgba(240, 222, 193, 0.12);
    background: rgba(24, 20, 28, 0.62);
    color: rgba(249, 243, 236, 0.88);
  }

  .search-omnibox input {
    flex: 1;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.88rem;
  }

  .search-omnibox input::placeholder {
    color: rgba(249, 243, 236, 0.44);
  }

  .search-omnibox input:focus-visible {
    outline: none;
  }

  .search-omnibox:focus-within {
    border-color: rgba(112, 221, 194, 0.44);
    box-shadow: 0 0 0 1px rgba(112, 221, 194, 0.28), 0 12px 28px rgba(11, 8, 11, 0.36);
  }

  .search-icon {
    display: inline-flex;
    color: rgba(249, 243, 236, 0.5);
  }

  .search-icon :global(svg) {
    width: 1rem;
    height: 1rem;
  }

  .header-nav {
    flex: 0 1 auto;
    justify-content: center;
    min-width: 0;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-width: 0;
    flex-wrap: nowrap;
  }

  @media (max-width: 1360px) {
    .app-header__inner {
      gap: 0.85rem;
    }

    .search-omnibox {
      width: clamp(11rem, 24vw, 16rem);
    }
  }

  @media (max-width: 1180px) {
    .app-header__inner {
      flex-wrap: wrap;
      justify-content: flex-start;
      padding-top: 0.45rem;
      padding-bottom: 0.45rem;
      min-height: auto;
      row-gap: 0.55rem;
    }

    .header-left {
      order: 1;
      flex: 1 1 auto;
    }

    .header-right {
      order: 2;
      flex: 0 1 auto;
      margin-left: auto;
    }

    .header-nav {
      order: 3;
      flex: 1 1 100%;
      justify-content: flex-start;
    }
  }

  @media (max-width: 960px) {
    .app-header__inner {
      padding: 0 1.25rem;
      gap: 0.75rem;
    }

    .search-omnibox {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .logo-dot,
    .search-omnibox,
    .logo-lockup {
      transition: none;
    }
  }
</style>
