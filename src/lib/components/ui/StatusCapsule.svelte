<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import NotificationBell from '$lib/components/ui/NotificationBell.svelte';
  import AvatarImage from '$lib/components/ui/AvatarImage.svelte';
  import type { NotificationItem } from '$lib/components/ui/types';
  import { currentProfile } from '$lib/stores/profile';
  import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';
  import { getBondBonusForLevel } from '$lib/companions/bond';
  import { computeEffectiveEnergyMax } from '$lib/player/energy';
  import FeedbackModal from '$lib/components/modals/FeedbackModal.svelte';

  export let energy: number | null = null;
  export let energyMax: number | null = null;
  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let unreadCount = 0;
  export let notifications: NotificationItem[] = [];
  export let userEmail: string | null = null;
  export let onLogout: () => void = () => {};
export let className = '';
export let walletBalance: number | null = null;
export let walletCurrency = 'SHARDS';
export let walletDelta: number | null = null;
export let activeCompanion: ActiveCompanionSnapshot | null = null;

let walletPulse = false;
let lastBalance: number | null = null;
let pulseTimer: ReturnType<typeof setTimeout> | null = null;
const openWallet = (event: MouseEvent) => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
    return;
  }
  event.preventDefault();
  window.location.assign('/app/wallet');
};

const profileStore = currentProfile;
const capsuleBaseClass =
    'status-pill pill panel-glass ring-neon flex w-auto max-w-full flex-nowrap items-center gap-3 px-4 py-2 text-[13px] text-white/85 backdrop-blur-xl';

  let energyDisplay = '—';
  let levelDisplay: string | number = '—';
  let xpDisplay = 'Aligning…';
  let xpRatio = 0;

  $: profileAvatar = $profileStore?.avatar_url ?? null;

  $: {
    const numeric = typeof walletBalance === 'number' ? walletBalance : null;
    if (numeric !== null && lastBalance !== null && numeric !== lastBalance) {
      walletPulse = true;
      if (pulseTimer) clearTimeout(pulseTimer);
      pulseTimer = setTimeout(() => {
        walletPulse = false;
      }, 1500);
    }
    if (numeric !== null) {
      lastBalance = numeric;
    }
  }

  $: companionEnergyBonus =
    activeCompanion && typeof activeCompanion.bondLevel === 'number'
      ? getBondBonusForLevel(activeCompanion.bondLevel).missionEnergyBonus
      : 0;
  $: effectiveEnergyMax = computeEffectiveEnergyMax(energyMax, companionEnergyBonus);
  $: energyDisplay =
    typeof energy === 'number' && effectiveEnergyMax > 0
      ? `${energy}/${effectiveEnergyMax}`
      : typeof energy === 'number'
        ? `${energy}`
        : '—';

  $: levelDisplay = typeof level === 'number' ? level : '—';

  $: xpDisplay =
    typeof xp === 'number' && typeof xpNext === 'number' ? `${xp}/${xpNext}` : 'Aligning…';

  $: xpRatio =
    typeof xp === 'number' && typeof xpNext === 'number' && xpNext > 0
      ? Math.min(100, Math.max(0, (xp / xpNext) * 100))
      : 0;

  $: capsuleMood = activeCompanion ? getCompanionMoodMeta(activeCompanion.mood) : null;
  $: capsuleMoodTitle =
    capsuleMood && activeCompanion
      ? `${activeCompanion.name} is ${capsuleMood.indicatorTitle}`
      : '';

  let menuOpen = false;
  let feedbackOpen = false;
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
    if (pulseTimer) clearTimeout(pulseTimer);
    if (!browser) return;
    document.removeEventListener('click', handleOutsideClick);
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class={`${capsuleBaseClass} ${className}`.trim()} data-testid="top-status">
  {#if capsuleMood && activeCompanion}
    <div class={`companion-indicator companion-indicator--${capsuleMood.key}`} title={capsuleMoodTitle}>
      <span aria-hidden="true"></span>
      <span class="sr-only">{capsuleMoodTitle}</span>
    </div>
    <span aria-hidden="true" class="divider">•</span>
  {/if}
  <div class="stat stat--xp" aria-label="Bond level progress">
    <div class="stat-label">
      <span class="text-white/75">Level</span>
      <strong> {levelDisplay}</strong>
    </div>
    <div
      class="xp-meter"
      role="progressbar"
      aria-valuemin="0"
      aria-valuenow={Math.round(xpRatio)}
      aria-valuemax="100"
    >
      <span style={`width:${xpRatio}%`}></span>
    </div>
    <span class="stat-meta">{xpDisplay}</span>
  </div>

  <span aria-hidden="true" class="divider">•</span>

  <span class="stat stat--energy" aria-label="Current energy">
    <span aria-hidden="true">⚡</span>
    {energyDisplay}
  </span>

  <span aria-hidden="true" class="divider">•</span>

  <a
    class={`wallet-pill pill ${walletPulse ? 'pulse-soft' : ''}`.trim()}
    data-testid="header-wallet-pill"
    aria-live="polite"
    data-ana="nav:wallet"
    href="/app/wallet"
    on:click={openWallet}
  >
    <span aria-hidden="true">💎</span>
    <span>
      {#if typeof walletBalance === 'number'}
        {walletBalance.toLocaleString()}
      {:else}
        —
      {/if}
      {` ${walletCurrency.toUpperCase()}`}
    </span>
    {#if typeof walletDelta === 'number' && walletDelta !== 0}
      <span class={`wallet-delta ${walletDelta > 0 ? 'positive' : 'negative'}`}>
        {walletDelta > 0 ? '+' : '−'}{Math.abs(walletDelta).toLocaleString()}
      </span>
    {/if}
  </a>

  <span aria-hidden="true" class="divider">•</span>

  <NotificationBell
    class="shrink-0"
    notifications={notifications}
    unreadCount={unreadCount}
    data-ana="nav:notifications"
  />

  <span aria-hidden="true" class="divider">•</span>

  <div class="account-menu" bind:this={menuRef}>
    <button
      type="button"
      class="account-pill pill"
      on:click={() => (menuOpen = !menuOpen)}
      bind:this={menuButtonRef}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label={userEmail ? `Account menu for ${userEmail}` : 'Open account menu'}
    >
      <AvatarImage
        src={profileAvatar}
        name={$profileStore?.display_name ?? null}
        handle={$profileStore?.handle ?? null}
        email={userEmail}
        alt=""
        className="avatar-thumb"
        ariaHidden={true}
        loading="eager"
      />
      {#if userEmail}
        <span class="max-w-[140px] truncate text-xs text-white/75">{userEmail}</span>
      {/if}
    </button>

    {#if menuOpen}
      <div class="account-menu__dropdown" role="menu">
        <a href="/app/preferences" role="menuitem" on:click={closeMenu}>User Preferences</a>
        <button
          type="button"
          role="menuitem"
          on:click={() => {
            closeMenu();
            feedbackOpen = true;
          }}
        >
          Send feedback
        </button>
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

<FeedbackModal bind:open={feedbackOpen} />

<style>
  :global(:root) {
    --pill-h: 36px;
    --pill-px: 10px;
    --pill-bg: #0f141f;
    --pill-bg-hover: #161c29;
  }

  :global(.pill),
  .status-pill,
  .wallet-pill,
  .account-pill,
  :global(.lean-status__metric) {
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
  .status-pill:hover,
  .status-pill:focus-visible,
  .wallet-pill:hover,
  .wallet-pill:focus-visible,
  .account-pill:hover,
  .account-pill:focus-visible,
  :global(.lean-status__metric:hover),
  :global(.lean-status__metric:focus-visible) {
    background: var(--pill-bg-hover) !important;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .status-pill {
    box-shadow: 0 20px 35px rgba(2, 4, 12, 0.55);
    pointer-events: auto;
    position: relative;
    z-index: 0;
    gap: 0.5rem;
    font-size: 0.8rem;
    white-space: nowrap;
    min-width: 0;
  }

  .status-pill > * {
    max-height: 100%;
  }

  :global(.panel-glass::before),
  :global(.panel-glass::after),
  :global(.ring-neon::before),
  :global(.ring-neon::after) {
    pointer-events: none !important;
  }

  .companion-indicator {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    position: relative;
    box-shadow: 0 0 12px rgba(255, 255, 255, 0.3);
  }

  .companion-indicator span {
    position: absolute;
    inset: 2px;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.9);
  }

  .companion-indicator--radiant {
    background: radial-gradient(circle at 30% 30%, rgba(98, 246, 255, 0.9), rgba(9, 132, 255, 0.75));
    box-shadow: 0 0 16px rgba(98, 246, 255, 0.65);
  }

  .companion-indicator--curious {
    background: radial-gradient(circle at 30% 30%, rgba(236, 146, 255, 0.92), rgba(148, 58, 255, 0.72));
    box-shadow: 0 0 16px rgba(236, 146, 255, 0.5);
  }

  .companion-indicator--steady {
    background: radial-gradient(circle at 30% 30%, rgba(180, 195, 219, 0.9), rgba(119, 132, 150, 0.7));
    box-shadow: 0 0 12px rgba(180, 195, 219, 0.35);
  }

  .companion-indicator--tired {
    background: radial-gradient(circle at 30% 30%, rgba(255, 196, 120, 0.95), rgba(255, 138, 74, 0.78));
    box-shadow: 0 0 12px rgba(255, 196, 120, 0.45);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    border: 0;
  }

  .stat {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: rgba(248, 250, 255, 0.9);
    white-space: nowrap;
    font-size: 0.78rem;
    line-height: 1;
  }

  .stat--xp {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    min-width: 120px;
    gap: 2px;
    transform: scale(0.86);
    transform-origin: left center;
    line-height: 1;
  }

  .stat-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(248, 250, 255, 0.7);
    line-height: 1;
  }

  .stat-label strong {
    font-size: 0.82rem;
    color: #fff;
    margin-left: 0.28rem;
    line-height: 1;
  }

  .xp-meter {
    width: 92px;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
    position: relative;
  }

  .xp-meter span {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.9), rgba(155, 92, 255, 0.9));
    transition: width 0.7s ease-out;
  }

  .stat-meta {
    font-size: 0.66rem;
    line-height: 1;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: rgba(255, 255, 255, 0.5);
  }

  .stat--energy {
    font-weight: 600;
    font-size: 0.75rem;
    gap: 0.35rem;
  }

  .divider {
    color: rgba(255, 255, 255, 0.28);
  }

  .wallet-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 var(--pill-px);
    border-radius: var(--brand-radius);
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0f141f;
    font-size: 0.78rem;
    color: rgba(247, 249, 255, 0.9);
    cursor: pointer;
    pointer-events: auto;
    text-decoration: none;
    transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease;
    border-width: 1px;
    position: relative;
    z-index: 20;
    height: var(--pill-h);
    box-sizing: border-box;
    white-space: nowrap;
  }

  .wallet-pill span:first-child {
    font-size: 0.9rem;
  }

  .wallet-pill:hover {
    background: #161c29;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .wallet-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.45);
  }

  .wallet-delta {
    font-size: 0.68rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .wallet-pill span:nth-child(2) {
    white-space: nowrap;
  }

  .wallet-delta.positive {
    color: var(--brand-cyan, #5ef2ff);
  }

  .wallet-delta.negative {
    color: var(--brand-magenta, #ff4fd8);
  }

  :global(.lean-status__metric) {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: var(--pill-h);
    padding: 0 var(--pill-px);
    box-sizing: border-box;
    background: #0f141f;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 9999px;
    transition: background 150ms ease, border-color 150ms ease;
  }

  :global(.lean-status__metric:hover) {
    background: #161c29;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .account-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: #0f141f;
    padding: 0 var(--pill-px);
    font-size: 0.78rem;
    color: #fff;
    transition: background 150ms ease, border-color 150ms ease;
    height: var(--pill-h);
    box-sizing: border-box;
  }

  .account-pill:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.4);
  }

  .account-pill:hover {
    background: #161c29;
    border-color: rgba(255, 255, 255, 0.2);
  }

  .account-menu {
    position: relative;
  }

  .account-menu__dropdown {
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

  .account-menu__dropdown a,
  .account-menu__dropdown button {
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

  .account-menu__dropdown a:hover,
  .account-menu__dropdown a:focus-visible,
  .account-menu__dropdown button:hover,
  .account-menu__dropdown button:focus-visible {
    border-color: rgba(94, 242, 255, 0.4);
    background: rgba(94, 242, 255, 0.08);
    outline: none;
  }

  .account-pill span:first-child {
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.6), rgba(155, 92, 255, 0.6));
    color: rgba(4, 7, 18, 0.9);
    font-weight: 700;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :global(.avatar-thumb) {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  @media (max-width: 768px) {
    .status-pill {
      overflow-x: auto;
      scrollbar-width: none;
    }

    .status-pill::-webkit-scrollbar {
      display: none;
    }

    .divider {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .xp-meter span {
      transition: none;
    }
  }
</style>
