<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import type { NotificationItem } from '$lib/components/ui/NotificationBell.svelte';
  import CenterIconNav, { type IconNavItem } from '$lib/components/ui/CenterIconNav.svelte';
  import { currentProfile, type CurrentProfile } from '$lib/stores/profile';
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
  import { activeCompanionStore } from '$lib/stores/companions';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';

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
  export let profile: CurrentProfile = null;
  export let activeCompanion: ActiveCompanionSnapshot | null = null;

  $: levelLabel = typeof level === 'number' ? level : '—';
  $: xpPct = typeof xp === 'number' && typeof xpNext === 'number' && xpNext > 0
    ? Math.min(100, Math.round((xp / xpNext) * 100))
    : 0;
  $: xpLabel = typeof xp === 'number' && typeof xpNext === 'number'
    ? `${xp}/${xpNext}`
    : 'Aligning…';
  $: energyLabel = typeof energy === 'number' && typeof energyMax === 'number'
    ? `${energy}/${energyMax}`
    : '—';
  $: shardLabel = typeof walletBalance === 'number'
    ? `${walletBalance.toLocaleString()} ${walletCurrency.toUpperCase()}`
    : `0 ${walletCurrency.toUpperCase()}`;
  const profileStore = currentProfile;
  $: mergedProfile = $profileStore ?? profile;
  $: profileAvatar = mergedProfile?.avatar_url ?? null;
  $: initials =
    (mergedProfile?.display_name?.charAt(0) ??
      mergedProfile?.handle?.charAt(0) ??
      userEmail?.charAt(0) ??
      '•'
    ).toUpperCase();

  const navWallet = (event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    goto('/app/wallet');
  };

  const activeStore = activeCompanionStore;
  $: storeActive = $activeStore ?? null;
  $: headerCompanion = storeActive ?? activeCompanion ?? null;
  $: headerMood = headerCompanion ? getCompanionMoodMeta(headerCompanion.mood) : null;
  $: moodTitle =
    headerCompanion && headerMood
      ? `${headerCompanion.name} is ${headerMood.indicatorTitle}`
      : '';

  let menuOpen = false;
  let menuRef: HTMLDivElement | null = null;
  let menuButtonRef: HTMLButtonElement | null = null;

  const closeMenu = () => {
    menuOpen = false;
  };

  const handleOutsideClick = (event: MouseEvent) => {
    if (!menuOpen) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (menuRef?.contains(target) || menuButtonRef?.contains(target)) return;
    closeMenu();
  };

  const handleKeydown = (event: KeyboardEvent) => {
    if (!menuOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
    }
  };

  onMount(() => {
    if (!browser) return;
    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    if (!browser) return;
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<header class="lean-header" data-testid="lean-header">
  <div class="lean-header__inner">
    <div class="lean-header__left">
      <a href="/app/home" class="lean-logo" aria-label="Go home">
        <span class="lean-logo__mark" aria-hidden="true"></span>
        <span class="lean-logo__word">Looma</span>
      </a>
      <label class="lean-search" role="search" aria-label="Search Looma">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="lean-search__icon" aria-hidden="true">
          <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-4.35-4.35M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
        </svg>
        <input type="search" placeholder="Search Looma" aria-label="Search Looma" />
      </label>
    </div>

    <div class="lean-header__center">
      <CenterIconNav className="lean-icon-nav" items={iconNavItems} />
    </div>

    <div class="lean-header__right">
      <div class="lean-status" aria-label="Player status">
        {#if headerCompanion && headerMood}
          <div class={`lean-status__companion lean-status__companion--${headerMood.key}`} title={moodTitle}>
            <span aria-hidden="true"></span>
            <span class="lean-status__sr">{moodTitle}</span>
          </div>
        {/if}
        <div class="lean-status__level">
          <span class="lean-status__label">Level</span>
          <strong>{levelLabel}</strong>
        </div>
        <div class="lean-status__progress" aria-hidden={xpLabel === 'Aligning…'}>
          <div class="lean-status__bar"><span style={`width:${xpPct}%`}></span></div>
          <span class="lean-status__meta">{xpLabel}</span>
        </div>
        <div class="lean-status__metric pill is-static" aria-label="Energy">
          <span>⚡</span>
          <span>{energyLabel}</span>
        </div>
        <a
          class="lean-status__metric pill"
          data-testid="header-wallet-pill-lean"
          href="/app/wallet"
          aria-label="Shard balance"
          on:click={navWallet}
        >
          <span aria-hidden="true">💎</span>
          <span>{shardLabel}</span>
        </a>
      </div>

      <NotificationBell notifications={notifications} unreadCount={unreadCount} />

      <div class="lean-account-menu" bind:this={menuRef}>
        <button
          type="button"
          class="lean-account pill"
          on:click={() => (menuOpen = !menuOpen)}
          bind:this={menuButtonRef}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={userEmail ? `Account menu for ${userEmail}` : 'Account menu'}
        >
          {#if profileAvatar}
            <img src={profileAvatar} alt="" class="lean-account__avatar" aria-hidden="true" />
          {:else}
            <span class="lean-account__initial" aria-hidden="true">{initials}</span>
          {/if}
          {#if userEmail}
            <span class="lean-account__email">{userEmail}</span>
          {/if}
        </button>

        {#if menuOpen}
          <div class="lean-account-menu__dropdown" role="menu">
            <a href="/app/preferences" role="menuitem" on:click={closeMenu}>User Preferences</a>
            <button
              type="button"
              role="menuitem"
              on:click={() => {
                closeMenu();
                onLogout();
              }}
            >
              Logout
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</header>

<style>
  .lean-header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: rgba(11, 14, 19, 0.92);
    backdrop-filter: blur(16px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    padding-top: env(safe-area-inset-top, 0px);
    overflow: hidden;
  }

  .lean-header__inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    min-height: 56px;
    padding: 0 2.5rem;
    max-width: 100%;
    width: 100%;
    box-sizing: border-box;
    gap: 1rem;
  }

  .lean-header__left,
  .lean-header__right {
    display: inline-flex;
    align-items: center;
    gap: 0.9rem;
    min-width: 0;
    flex-wrap: nowrap;
  }

  .lean-header__left {
    justify-content: flex-start;
    grid-column: 1;
  }

  .lean-logo {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    text-decoration: none;
    min-width: 0;
  }

  .lean-logo__mark {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.85), rgba(155, 92, 255, 0.85));
    box-shadow: 0 8px 18px rgba(94, 242, 255, 0.35);
  }

  .lean-logo__word {
    display: none;
    font-size: 0.82rem;
    letter-spacing: 0.28em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.78);
    font-weight: 600;
  }

  @media (min-width: 900px) {
    .lean-logo__word {
      display: inline;
    }
  }

  .lean-search {
    display: none;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.85rem;
    height: 2.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(22, 27, 40, 0.85);
    color: rgba(248, 250, 255, 0.75);
  }

  .lean-search input {
    border: none;
    background: transparent;
    color: inherit;
    font-size: 0.85rem;
    width: 11.5rem;
  }

  .lean-search input::placeholder {
    color: rgba(248, 250, 255, 0.55);
  }

  .lean-search input:focus-visible {
    outline: none;
  }

  .lean-search:focus-within {
    border-color: rgba(94, 242, 255, 0.45);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.2);
  }

  .lean-search__icon {
    width: 16px;
    height: 16px;
    opacity: 0.65;
    fill: none;
  }

  .lean-header__center {
    display: flex;
    justify-content: center;
    align-items: center;
    min-width: 0;
    grid-column: 2;
    pointer-events: auto;
  }

  :global(nav.lean-icon-nav > div) {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    height: 2.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.06);
    box-shadow: none;
    backdrop-filter: blur(14px);
  }

  :global(nav.lean-icon-nav .brand-icon-button) {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    color: rgba(248, 250, 255, 0.75);
    border: 1px solid transparent;
    transition: background 150ms ease, color 150ms ease;
  }

  :global(nav.lean-icon-nav .brand-icon-button:hover),
  :global(nav.lean-icon-nav .brand-icon-button:focus-visible) {
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
  }

  :global(nav.lean-icon-nav .brand-icon-button:focus-visible) {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  :global(nav.lean-icon-nav .brand-icon-button.active) {
    color: #fff;
    background: rgba(255, 255, 255, 0.22);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.35);
  }

  :global(:root) {
    --pill-h: 36px;
    --pill-px: 10px;
    --pill-bg: #0f141f;
    --pill-bg-hover: #161c29;
  }

  :global(.pill),
  .lean-status__metric,
  .lean-account,
  :global(.lean-header__right .notification-wrapper .bell) {
    height: var(--pill-h);
    padding: 0 var(--pill-px) !important;
    display: inline-flex;
    align-items: center;
    box-sizing: border-box;
    border-radius: 9999px;
    background: var(--pill-bg) !important;
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: background 150ms ease, border-color 150ms ease;
  }

  :global(.pill:hover),
  :global(.pill:focus-visible),
  .lean-status__metric:hover,
  .lean-status__metric:focus-visible,
  .lean-account:hover,
  .lean-account:focus-visible,
  :global(.lean-header__right .notification-wrapper .bell:hover),
  :global(.lean-header__right .notification-wrapper .bell:focus-visible) {
    background: var(--pill-bg-hover) !important;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .lean-status .pill {
    background: transparent !important;
    border-color: transparent;
    color: rgba(248, 250, 255, 0.75);
    box-shadow: none;
  }

  .lean-status .pill:hover,
  .lean-status .pill:focus-visible {
    background: rgba(255, 255, 255, 0.16) !important;
    border-color: transparent;
    color: #fff;
  }

  .lean-status {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 var(--pill-px);
    height: var(--pill-h);
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(248, 250, 255, 0.85);
    min-width: 0;
    max-width: min(44vw, 620px);
    white-space: nowrap;
    flex-wrap: nowrap;
    overflow: hidden;
    flex: 1 1 auto;
  }

  .lean-status__companion {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    position: relative;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }

  .lean-status__companion span {
    position: absolute;
    inset: 2px;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.9);
  }

  .lean-status__companion--radiant {
    background: radial-gradient(circle at 30% 30%, rgba(98, 246, 255, 0.9), rgba(9, 132, 255, 0.75));
    box-shadow: 0 0 14px rgba(98, 246, 255, 0.6);
  }

  .lean-status__companion--curious {
    background: radial-gradient(circle at 30% 30%, rgba(236, 146, 255, 0.92), rgba(148, 58, 255, 0.72));
    box-shadow: 0 0 14px rgba(236, 146, 255, 0.45);
  }

  .lean-status__companion--steady {
    background: radial-gradient(circle at 30% 30%, rgba(180, 195, 219, 0.9), rgba(119, 132, 150, 0.72));
    box-shadow: 0 0 12px rgba(180, 195, 219, 0.35);
  }

  .lean-status__companion--tired {
    background: radial-gradient(circle at 30% 30%, rgba(255, 196, 120, 0.95), rgba(255, 138, 74, 0.78));
    box-shadow: 0 0 12px rgba(255, 196, 120, 0.45);
  }

  .lean-status__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .lean-status__level {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .lean-status__label {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(248, 250, 255, 0.6);
  }

  .lean-status__progress {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .lean-status__bar {
    width: 100px;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .lean-status__bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.9));
    transition: width 220ms ease;
  }

  .lean-status__meta {
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: rgba(248, 250, 255, 0.6);
    white-space: nowrap;
  }

  .lean-status__metric {
    gap: 0.45rem;
    font-size: 0.82rem;
    color: rgba(247, 249, 255, 0.9);
    cursor: pointer;
    text-decoration: none;
    position: relative;
    z-index: 1;
    white-space: nowrap;
  }

  .lean-status__metric:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  .lean-status__metric span:first-child {
    font-size: 0.9rem;
  }

  .lean-status__metric.is-static {
    cursor: default;
    pointer-events: none;
    box-shadow: none;
  }

  :global(.lean-header__right .notification-wrapper) {
    position: relative;
  }

  :global(.lean-header__right .notification-wrapper .bell svg) {
    width: 18px;
    height: 18px;
  }

  .lean-account {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(248, 250, 255, 0.85);
    cursor: pointer;
  }

  .lean-account:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.4);
  }

  .lean-account__initial {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .lean-account__avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .lean-account__email {
    max-width: 180px;
    font-size: 0.75rem;
    color: rgba(248, 250, 255, 0.7);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lean-account-menu {
    position: relative;
  }

  .lean-account-menu__dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 0.5rem);
    display: grid;
    gap: 0.35rem;
    min-width: 180px;
    padding: 0.5rem;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(8, 12, 20, 0.92);
    box-shadow: 0 16px 40px rgba(5, 7, 18, 0.5);
    z-index: 20;
  }

  .lean-account-menu__dropdown a,
  .lean-account-menu__dropdown button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.7rem;
    border-radius: 10px;
    border: 1px solid transparent;
    background: transparent;
    color: rgba(248, 250, 255, 0.85);
    font-size: 0.85rem;
    text-align: left;
  }

  .lean-account-menu__dropdown a:hover,
  .lean-account-menu__dropdown a:focus-visible,
  .lean-account-menu__dropdown button:hover,
  .lean-account-menu__dropdown button:focus-visible {
    border-color: rgba(94, 242, 255, 0.4);
    background: rgba(94, 242, 255, 0.08);
    outline: none;
  }

  .lean-header__right {
    grid-column: 3;
    justify-content: flex-end;
    flex-wrap: nowrap;
    row-gap: 0;
    min-width: 0;
    overflow: hidden;
  }

  .lean-header__right > * {
    min-width: 0;
  }

  @media (max-width: 1440px) {
    .lean-header__inner {
      padding: 0 1.5rem;
      gap: 0.65rem;
    }

    .lean-status {
      gap: 0.5rem;
    }

    .lean-status__meta {
      display: none;
    }

    .lean-status__progress {
      display: none;
    }

    .lean-status {
      max-width: min(36vw, 460px);
    }
  }

  @media (max-width: 1260px) {
    .lean-search {
      display: none;
    }

    .lean-status {
      max-width: min(32vw, 360px);
      gap: 0.3rem;
    }
  }

  @media (max-width: 1120px) {
    .lean-account__email {
      display: none;
    }

    .lean-status__label {
      display: none;
    }

    .lean-status__metric span:last-child {
      max-width: 88px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  @media (max-width: 1024px) {
    .lean-header__center {
      display: none;
    }

    .lean-header__inner {
      gap: 0.5rem;
    }
  }

  @media (min-width: 1261px) {
    .lean-search {
      display: inline-flex;
    }
  }
</style>
