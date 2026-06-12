<script lang="ts">
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { Search } from 'lucide-svelte';
  import DesktopTopbarActions from '$lib/components/layout/DesktopTopbarActions.svelte';
  import type { NotificationItem } from '$lib/components/ui/types';

  export let searchValue = '';
  export let searchPlaceholder = 'Search Memvoya...';
  export let searchAriaLabel = 'Search Memvoya';
  export let localSearch = false;
  export let onSearch: ((value: string) => void) | null = null;
  export let shardBalance = 0;
  export let notifications: NotificationItem[] = [];
  export let profileDisplayName = 'Traveler';
  export let profileAvatarUrl: string | null = null;

  const destinations = [
    { label: 'Home', detail: 'Your companion home', href: '/app/home' },
    { label: 'Sanctuary', detail: 'Shape your shared space', href: '/app/sanctuary' },
    { label: 'Companions', detail: 'View your companion roster', href: '/app/companions' },
    { label: 'Games', detail: 'Play together', href: '/app/games' },
    { label: 'Journal', detail: 'Revisit memories', href: '/app/memory' },
    { label: 'Quests', detail: 'Continue your journey', href: '/app/missions' },
    { label: 'Inventory', detail: 'View items and keepsakes', href: '/app/inventory' },
    { label: 'Market', detail: 'Browse the market', href: '/app/shop' },
    { label: 'Messages', detail: 'Open your conversations', href: '/app/messages' },
    { label: 'Friends', detail: 'Find your friends', href: '/app/friends' },
    { label: 'Circles', detail: 'Visit your communities', href: '/app/circles' },
    { label: 'Profile', detail: 'View your profile', href: '/app/profile' }
  ];

  let rootRef: HTMLElement | null = null;
  let searchFocused = false;

  $: normalizedSearch = searchValue.trim().toLowerCase();
  $: matchingDestinations = normalizedSearch
    ? destinations.filter((destination) =>
        `${destination.label} ${destination.detail}`.toLowerCase().includes(normalizedSearch)
      )
    : destinations.slice(0, 6);
  $: showDestinationResults = !localSearch && searchFocused && matchingDestinations.length > 0;

  const handleDocumentClick = (event: MouseEvent) => {
    if (!rootRef || !(event.target instanceof Node) || rootRef.contains(event.target)) return;
    searchFocused = false;
  };

  const handleSearchKeydown = (event: KeyboardEvent) => {
    const firstDestination = matchingDestinations[0];
    if (localSearch || event.key !== 'Enter' || !firstDestination) return;
    event.preventDefault();
    void goto(firstDestination.href);
    searchFocused = false;
  };

  onMount(() => document.addEventListener('click', handleDocumentClick, true));
  onDestroy(() => document.removeEventListener('click', handleDocumentClick, true));
</script>

<header class="protected-topbar" bind:this={rootRef}>
  <div class="search-wrap">
    <label class="search-field" aria-label={searchAriaLabel}>
      <Search size={18} />
      <input
        type="search"
        placeholder={searchPlaceholder}
        value={searchValue}
        on:focus={() => (searchFocused = true)}
        on:input={(event) => {
          searchValue = (event.currentTarget as HTMLInputElement).value;
          onSearch?.(searchValue);
          searchFocused = true;
        }}
        on:keydown={handleSearchKeydown}
      />
    </label>

    {#if showDestinationResults}
      <nav class="search-results" aria-label="Memvoya destinations">
        {#each matchingDestinations as destination}
          <a href={destination.href} on:click={() => (searchFocused = false)}>
            <strong>{destination.label}</strong>
            <span>{destination.detail}</span>
          </a>
        {/each}
      </nav>
    {/if}
  </div>

  <div class="topbar-controls">
    <slot name="controls"></slot>
    <DesktopTopbarActions
      {shardBalance}
      {notifications}
      {profileDisplayName}
      {profileAvatarUrl}
    />
  </div>
</header>

<style>
  .protected-topbar {
    position: relative;
    z-index: 100;
    display: flex;
    width: 100%;
    min-height: 3.75rem;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(169, 123, 225, 0.1);
    margin-bottom: 1rem;
    padding: 0.5rem 0.85rem;
    background: rgba(7, 8, 25, 0.72);
    backdrop-filter: blur(22px);
  }

  .search-wrap {
    position: relative;
    width: min(27rem, 100%);
    flex: 1 1 18rem;
  }

  .search-field {
    display: flex;
    width: 100%;
    min-height: 2.75rem;
    align-items: center;
    gap: 0.75rem;
    border: 1px solid rgba(170, 151, 255, 0.18);
    border-radius: 1rem;
    padding: 0 1rem;
    background: rgba(13, 14, 34, 0.62);
    color: rgba(203, 192, 239, 0.72);
    backdrop-filter: blur(18px);
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
  }

  .search-field:focus-within {
    border-color: rgba(169, 123, 225, 0.52);
    background: rgba(20, 17, 45, 0.78);
    box-shadow: 0 0 24px rgba(169, 123, 225, 0.16);
  }

  .search-field input {
    width: 100%;
    border: 0;
    outline: 0;
    background: transparent;
    color: rgba(249, 247, 255, 0.96);
    font: inherit;
    font-size: 0.82rem;
  }

  .search-field input::placeholder {
    color: rgba(194, 181, 232, 0.62);
  }

  .search-results {
    position: absolute;
    top: calc(100% + 0.55rem);
    left: 0;
    z-index: 5100;
    display: grid;
    width: min(27rem, calc(100vw - 2rem));
    gap: 0.15rem;
    border: 1px solid rgba(169, 123, 225, 0.24);
    border-radius: 0.95rem;
    padding: 0.5rem;
    background: linear-gradient(180deg, rgba(15, 16, 40, 0.98), rgba(8, 10, 27, 0.98));
    box-shadow: 0 24px 70px rgba(2, 3, 14, 0.62);
  }

  .search-results a {
    display: grid;
    gap: 0.18rem;
    border-radius: 0.65rem;
    padding: 0.62rem 0.7rem;
    color: rgba(249, 247, 255, 0.94);
    text-decoration: none;
  }

  .search-results a:hover,
  .search-results a:focus-visible {
    outline: none;
    background: rgba(169, 123, 225, 0.1);
  }

  .search-results strong {
    font-size: 0.78rem;
  }

  .search-results span {
    color: rgba(201, 191, 229, 0.64);
    font-size: 0.68rem;
  }

  .topbar-controls {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: flex-end;
    gap: 0.7rem;
  }

  @media (max-width: 1180px) {
    .protected-topbar {
      padding-inline: 0.65rem;
    }

    .search-wrap {
      width: min(22rem, 100%);
    }
  }

  @media (max-width: 760px) {
    .protected-topbar {
      display: none;
    }
  }
</style>
