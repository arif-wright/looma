<script lang="ts">
  import StatusCapsule from '$lib/components/ui/StatusCapsule.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import CenterIconNav, { type IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';
  import { Search } from 'lucide-svelte';

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
  export let iconNavItems: IconNavItem[] = [];
</script>

<header class="lean-header app-header" data-testid="lean-header">
  <div class="lean-header__inner">
    <div class="lean-group lean-group--left">
      <a href="/app/home" class="lean-logo" aria-label="Go home">Looma</a>
      <label class="lean-search" role="search" aria-label="Search Looma">
        <Search class="lean-search__icon" aria-hidden="true" />
        <input type="search" placeholder="Search" aria-label="Search" />
      </label>
    </div>

    <CenterIconNav className="lean-center-nav hidden md:flex" items={iconNavItems} />

    <div class="lean-group lean-group--right">
      <StatusCapsule
        className="lean-status"
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
  .lean-header {
    position: sticky;
    top: 0;
    z-index: 30;
    backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(5, 7, 18, 0.65);
  }

  .lean-header__inner {
    max-width: 1180px;
    margin: 0 auto;
    padding: 0 1.25rem;
    height: 3.5rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
  }

  .lean-group {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }

  .lean-logo {
    font-size: 1.05rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.9);
    text-decoration: none;
  }

  .lean-search {
    display: none;
    align-items: center;
    gap: 0.5rem;
    border-radius: 1.25rem;
    padding: 0 0.9rem;
    height: 2.2rem;
    background: rgba(12, 16, 32, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: rgba(248, 250, 255, 0.85);
  }

  .lean-search:focus-within {
    border-color: rgba(94, 242, 255, 0.4);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.24);
  }

  .lean-search input {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.88rem;
    width: 14rem;
  }

  .lean-search input::placeholder {
    color: rgba(248, 250, 255, 0.55);
  }

  .lean-search input:focus-visible {
    outline: none;
  }

  .lean-search__icon {
    width: 1rem;
    height: 1rem;
    color: rgba(248, 250, 255, 0.6);
  }

  .lean-status :global(.status-pill) {
    border-radius: 1rem;
    padding: 0.35rem 0.75rem;
    box-shadow: 0 12px 24px rgba(4, 5, 14, 0.4);
  }

  .lean-group--right {
    justify-content: flex-end;
  }

  .lean-center-nav {
    justify-content: center;
  }

  @media (min-width: 900px) {
    .lean-search {
      display: inline-flex;
    }
  }

  @media (max-width: 768px) {
    .lean-header__inner {
      grid-template-columns: minmax(0, 1fr);
      height: auto;
      padding-top: 0.75rem;
      padding-bottom: 0.75rem;
      gap: 0.75rem;
    }

    .lean-group--right {
      width: 100%;
    }
  }
</style>
