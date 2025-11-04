<script lang="ts">
  import StatusCapsule from '$lib/components/ui/StatusCapsule.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';

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

<header class="lean-header" data-testid="lean-header">
  <div class="lean-header__inner">
    <a href="/app/home" class="lean-logo" aria-label="Go home">Looma</a>
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
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.25rem;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .lean-logo {
    font-size: 0.9rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.85);
    text-decoration: none;
  }

  .lean-status :global(.status-pill) {
    border-radius: 1rem;
    padding: 0.35rem 0.75rem;
    box-shadow: 0 12px 24px rgba(4, 5, 14, 0.4);
  }

  @media (max-width: 768px) {
    .lean-header__inner {
      flex-direction: column;
      height: auto;
      padding-top: 0.75rem;
      padding-bottom: 0.75rem;
      align-items: flex-start;
    }
  }
</style>
