<script lang="ts">
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';

  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let unreadCount = 0;
  export let notifications: NotificationItem[] = [];
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};

  const energyDisplay =
    typeof energy === 'number' && typeof energyMax === 'number'
      ? `${energy}/${energyMax}`
      : '—';

  const levelDisplay = level ?? '—';

  const xpDisplay =
    typeof xp === 'number' && typeof xpNext === 'number' ? `${xp}/${xpNext}` : 'Alignment...';

  const initials =
    userEmail && userEmail.length > 0 ? userEmail.charAt(0).toUpperCase() : '•';
</script>

<div class="nav-status hover-glow" data-testid="top-status">
  <div class="nav-status__metric" aria-label="Current energy">
    <span class="nav-status__icon" aria-hidden="true">⚡</span>
    <div class="nav-status__copy">
      <span class="nav-status__label">Energy</span>
      <span class="nav-status__value">{energyDisplay}</span>
    </div>
  </div>

  <div class="nav-status__metric" aria-label="Bond level">
    <span class="nav-status__icon" aria-hidden="true">★</span>
    <div class="nav-status__copy">
      <span class="nav-status__label">Level {levelDisplay}</span>
      <span class="nav-status__value">{xpDisplay}</span>
    </div>
  </div>

  <NotificationBell notifications={notifications} unreadCount={unreadCount} />

  <button
    type="button"
    class="nav-status__avatar btn-ripple"
    on:click={onLogout}
    aria-label="Open account menu"
  >
    <span class="avatar__dot" aria-hidden="true">{initials}</span>
    {#if userEmail}
      <span class="avatar__email">{userEmail}</span>
    {/if}
  </button>
</div>

<style>
  .nav-status {
    display: inline-flex;
    align-items: center;
    gap: 0.9rem;
    padding: 0.65rem 0.9rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(18px);
  }

  .nav-status__metric {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.3rem 0.55rem;
    border-radius: 999px;
    background: rgba(8, 12, 28, 0.55);
  }

  .nav-status__icon {
    font-size: 0.85rem;
  }

  .nav-status__copy {
    display: grid;
    gap: 0.1rem;
  }

  .nav-status__label {
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 255, 0.58);
  }

  .nav-status__value {
    font-size: 0.85rem;
    color: rgba(244, 247, 255, 0.92);
  }

  .nav-status :global(.notification-bell) {
    margin: 0 0.3rem;
  }

  .nav-status__avatar {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(244, 247, 255, 0.88);
    padding: 0.35rem 0.75rem 0.35rem 0.4rem;
    cursor: pointer;
    font-size: 0.82rem;
  }

  .nav-status__avatar:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring-focus, rgba(77, 244, 255, 0.6));
  }

  .avatar__dot {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(77, 244, 255, 0.26), rgba(155, 92, 255, 0.34));
    font-weight: 600;
    color: rgba(9, 12, 26, 0.86);
  }

  .avatar__email {
    max-width: 10ch;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 720px) {
    .nav-status {
      gap: 0.6rem;
      padding: 0.55rem 0.75rem;
    }

    .nav-status__value {
      font-size: 0.78rem;
    }

    .avatar__email {
      display: none;
    }
  }
</style>
