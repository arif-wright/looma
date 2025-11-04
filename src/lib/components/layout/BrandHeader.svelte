<script lang="ts">
  import StatusCapsule from '$lib/components/ui/StatusCapsule.svelte';
  import CenterIconNav, { type IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import { Search } from 'lucide-svelte';

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
</script>

<header class="app-header" data-testid="brand-header">
  <div class="app-header__inner">
    <div class="header-left">
      <div class="logo-lockup" role="img" aria-label="Looma sigil">
        <span class="logo-dot" aria-hidden="true"></span>
        <span class="logo-text">Looma</span>
      </div>
      <label class="search-omnibox panel-glass" role="search" aria-label="Search Kinforge">
        <Search class="search-icon" aria-hidden="true" />
        <input type="search" placeholder="Search Kinforge…" aria-label="Search Kinforge" />
      </label>
    </div>
    <CenterIconNav className="header-nav hidden md:flex" items={iconNavItems} />
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
  }

  .app-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.85), rgba(24, 7, 33, 0.78));
    opacity: 0.94;
    z-index: -1;
  }

  .app-header__inner {
    width: 100%;
    max-width: 1440px;
    margin: 0 auto;
    padding: 0 clamp(1.25rem, 3vw, 3rem);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    min-height: 3.5rem;
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
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: 0 10px 26px rgba(5, 7, 18, 0.6);
  }

  .logo-dot {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.5));
    box-shadow: 0 0 24px rgba(94, 242, 255, 0.6);
  }

  .logo-text {
    font-size: 0.8rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.8);
  }

  .search-omnibox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: 20px;
    padding: 0 0.85rem;
    height: 2.35rem;
    width: clamp(12rem, 30vw, 22rem);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 12, 28, 0.55);
    color: rgba(244, 247, 255, 0.85);
  }

  .search-omnibox input {
    flex: 1;
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.88rem;
  }

  .search-omnibox input::placeholder {
    color: rgba(244, 247, 255, 0.45);
  }

  .search-omnibox input:focus-visible {
    outline: none;
  }

  .search-omnibox:focus-within {
    border-color: rgba(94, 242, 255, 0.5);
    box-shadow: 0 0 0 1px rgba(94, 242, 255, 0.35), 0 12px 28px rgba(5, 7, 18, 0.45);
  }

  .search-icon {
    width: 1rem;
    height: 1rem;
    color: rgba(244, 247, 255, 0.5);
  }

  .header-nav {
    flex: 0 0 auto;
    justify-content: center;
  }

  .header-right {
    display: flex;
    justify-content: flex-end;
    flex: 1 1 auto;
    min-width: 0;
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
