<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';

  export type NavItem = {
    id: string;
    label: string;
    href?: string;
  };

  const dispatch = createEventDispatcher<{
    navigate: { id: string };
    search: { value: string };
  }>();

  export let navItems: NavItem[] = [];
  export let activeId: string | null = null;
  export let showSearch = true;
  export let searchValue = '';
  export let searchPlaceholder = 'Search marketplace';
  export let walletLabel: string | null = null;
  export let walletPulse = false;

  const handleNavigate = (item: NavItem) => {
    dispatch('navigate', { id: item.id });
  };

  const handleSearch = (event: Event) => {
    const value = (event.currentTarget as HTMLInputElement | null)?.value ?? '';
    dispatch('search', { value });
  };
</script>

<div class="shop-root bg-neuro">
  <BackgroundStack class="shop-bg" />
  <div class="shop-shell">
    <header class="shop-head panel-glass" aria-label="Marketplace navigation">
      <nav class="shop-nav" aria-label="Shop sections">
        {#each navItems as item (item.id)}
          {#if item.href}
            <a
              class={`nav-btn ${activeId === item.id ? 'active' : ''}`}
              href={item.href}
              data-testid={`shop-nav-${item.id}`}
            >
              {item.label}
            </a>
          {:else}
            <button
              type="button"
              class={`nav-btn ${activeId === item.id ? 'active' : ''}`}
              on:click={() => handleNavigate(item)}
              data-testid={`shop-nav-${item.id}`}
            >
              {item.label}
            </button>
          {/if}
        {/each}
      </nav>

      <div class="shop-head__tools">
        {#if walletLabel}
          <div class={`wallet-chip ${walletPulse ? 'pulse' : ''}`} aria-live="polite">
            <span class="wallet-label">Wallet</span>
            <span class="wallet-amount">{walletLabel}</span>
          </div>
        {/if}
        {#if showSearch}
          <label class="search-field">
            <span class="sr-only">Search marketplace</span>
            <input
              type="search"
              value={searchValue}
              placeholder={searchPlaceholder}
              on:input={handleSearch}
              autocomplete="off"
            />
          </label>
        {/if}
      </div>
    </header>

    <slot name="featured" />
    <slot name="filters" />
    <slot />
  </div>
</div>

<style>
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

  .shop-root {
    position: relative;
    min-height: 100vh;
    color: #fff;
    overflow: hidden;
  }

  .shop-bg :global(canvas) {
    opacity: 0.3;
  }

  .shop-shell {
    position: relative;
    z-index: 1;
    max-width: 1680px;
    width: 100%;
    margin: 0 auto;
    padding: clamp(2.5rem, 4vw, 4rem) clamp(1.5rem, 3.5vw, 2.75rem) 5rem;
    display: grid;
    gap: 2rem;
  }

  .shop-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.4rem clamp(1.1rem, 2.5vw, 1.8rem);
  }

  .shop-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
  }

  .nav-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(248, 250, 255, 0.78);
    font-size: 0.85rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    transition: background 160ms ease, border 160ms ease, color 160ms ease, transform 160ms ease;
  }

  .nav-btn.active {
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    border-color: transparent;
    color: rgba(8, 10, 22, 0.9);
    box-shadow: 0 18px 32px rgba(94, 242, 255, 0.35);
  }

  .nav-btn:hover,
  .nav-btn:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.18);
    color: #fff;
    transform: translateY(-2px);
    outline: none;
  }

  .shop-head__tools {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-left: auto;
  }

  .wallet-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.45rem;
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(8, 12, 28, 0.72);
    color: rgba(248, 250, 255, 0.9);
  }

  .wallet-chip.pulse {
    animation: wallet-glow 1.4s ease-out;
  }

  .wallet-label {
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.6);
  }

  .wallet-amount {
    font-weight: 600;
  }

  .search-field {
    position: relative;
  }

  .search-field input {
    width: clamp(220px, 20vw, 280px);
    padding: 0.6rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 28, 0.65);
    color: rgba(248, 250, 255, 0.9);
  }

  .search-field input::placeholder {
    color: rgba(226, 232, 240, 0.6);
  }

  .search-field input:focus-visible {
    outline: none;
    border-color: rgba(94, 242, 255, 0.8);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.35);
  }

  @keyframes wallet-glow {
    0% {
      box-shadow: 0 0 0 0 rgba(94, 242, 255, 0.3);
    }
    70% {
      box-shadow: 0 0 0 18px rgba(94, 242, 255, 0);
    }
    100% {
      box-shadow: none;
    }
  }

  @media (max-width: 960px) {
    .shop-head {
      flex-direction: column;
      align-items: stretch;
    }

    .shop-head__tools {
      justify-content: space-between;
      width: 100%;
      flex-wrap: wrap;
    }

    .search-field input {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-btn,
    .wallet-chip {
      transition: none;
      animation: none;
    }
  }
</style>
