<script lang="ts">
  import { onDestroy } from 'svelte';
  import { walletBalance } from '$lib/stores/economy';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import { currentProfile, type CurrentProfile } from '$lib/stores/profile';

  export let notifications: NotificationItem[] = [];
  export let userEmail: string | null = null;
  export let profile: CurrentProfile = null;

  let search = '';
  let showExpanded = false;
  let lastBalance = 0;
  let pulse = false;
  let pulseTimeout: ReturnType<typeof setTimeout> | null = null;

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(n ?? 0)));

  const profileStore = currentProfile;

  $: mergedProfile = $profileStore ?? profile;
  $: profileAvatar = mergedProfile?.avatar_url ?? null;
  $: initials =
    (mergedProfile?.display_name?.charAt(0) ??
      mergedProfile?.handle?.charAt(0) ??
      userEmail?.charAt(0) ??
      '•'
    ).toUpperCase();

  $: notifCount = Array.isArray(notifications)
    ? notifications.filter((n: any) => !n?.read).length || notifications.length || 0
    : 0;

  $: currentBalance = typeof $walletBalance === 'number' ? $walletBalance : 0;
  $: if (currentBalance > lastBalance) {
    triggerPulse();
  } else if (lastBalance === 0 && currentBalance > 0) {
    lastBalance = currentBalance;
  }

  function triggerPulse() {
    pulse = true;
    lastBalance = currentBalance;
    if (pulseTimeout) clearTimeout(pulseTimeout);
    pulseTimeout = setTimeout(() => (pulse = false), 900);
  }

  onDestroy(() => {
    if (pulseTimeout) clearTimeout(pulseTimeout);
  });
</script>

<nav class="lean-appbar md:hidden">
  <div class="appbar-row">
    <a href="/app/home" aria-label="Home" class="brand-button">
      <div class="brand-glyph"></div>
    </a>

    <div class="search-wrap" data-expanded={showExpanded}>
      <label class="sr-only" for="m-search">Search</label>
      <input
        id="m-search"
        type="search"
        bind:value={search}
        placeholder="Search Looma"
        class="search-input"
        on:focus={() => (showExpanded = true)}
        on:blur={() => (showExpanded = false)}
      />
    </div>

    <a
      href="/app/wallet"
      class={`chip ${pulse ? 'motion-safe:animate-chipPulse' : ''}`}
      aria-label="Wallet"
    >
      <span class="chip-glyph" aria-hidden="true"></span>
      <span class="tabular-nums">{fmt(currentBalance)}</span>
    </a>

    <NotificationBell
      {notifications}
      unreadCount={notifCount}
      compact={true}
      class="icon-btn notification-compact"
    />

    <a href="/app/profile" aria-label="Account" class="icon-btn account-btn">
      {#if profileAvatar}
        <img src={profileAvatar} alt="" class="avatar-img" aria-hidden="true" />
      {:else}
        <span class="avatar-text" aria-hidden="true">{initials}</span>
      {/if}
    </a>
  </div>
</nav>

<style>
  .lean-appbar {
    position: sticky;
    top: 0;
    z-index: 60;
    backdrop-filter: blur(14px);
    background: rgba(6, 8, 18, 0.72);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    padding: env(safe-area-inset-top, 0px) 0 0;
  }

  .appbar-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto auto;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.85rem;
    min-height: 56px;
  }

  .brand-button,
  .icon-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    display: grid;
    place-items: center;
    color: inherit;
    text-decoration: none;
    transition: transform 150ms ease;
  }

  .brand-button:focus-visible,
  .icon-btn:focus-visible,
  .chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  @media (prefers-reduced-motion: no-preference) {
    .icon-btn:active,
    .brand-button:active,
    .chip:active {
      transform: scale(0.96);
    }
  }

  .brand-glyph {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.9));
    box-shadow: 0 8px 18px rgba(94, 242, 255, 0.35);
  }

  .search-wrap {
    position: relative;
    width: 100%;
    min-width: 0;
    transition: transform 200ms ease;
  }

  .search-input {
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
    padding: 0.4rem 0.9rem;
    font-size: 0.9rem;
  }

  .search-input::placeholder {
    color: rgba(255, 255, 255, 0.45);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
    padding: 0.3rem 0.65rem;
    font-size: 0.78rem;
    color: rgba(248, 250, 255, 0.95);
    text-decoration: none;
  }

  .chip-glyph {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(94, 242, 255, 0.9);
    box-shadow: 0 0 12px rgba(94, 242, 255, 0.8);
  }

  .notification-compact :global(.bell) {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .notification-compact :global(.badge) {
    top: -2px;
    right: -2px;
  }

  .account-btn {
    overflow: hidden;
  }

  .avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }

  .avatar-text {
    font-size: 0.85rem;
    font-weight: 700;
    color: rgba(248, 250, 255, 0.9);
  }

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
</style>
