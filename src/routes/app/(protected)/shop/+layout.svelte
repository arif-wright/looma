<script lang="ts">
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
</script>

<SanctuaryPageFrame
  eyebrow="Marketplace"
  title="Shop"
  subtitle="Spend shards on cosmetics and collectibles without leaving the sanctuary tone of the app."
>
  <div class="shop-shell">
    <header class="shop-head" aria-label="Marketplace navigation">
      <nav class="shop-nav" aria-label="Shop sections">
        <span class="nav-chip active">Shop</span>
        <span class="nav-chip">Creatures</span>
        <span class="nav-chip">Items</span>
        <span class="nav-chip">Bundles</span>
      </nav>
      <label class="search-field">
        <span class="sr-only">Search the market</span>
        <input
          type="search"
          placeholder="Search the market…"
          class="search-input"
        />
      </label>
    </header>

    <main class="shop-main">
      <slot />
    </main>
  </div>
</SanctuaryPageFrame>

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

  .shop-shell {
    max-width: 80rem;
    width: 100%;
    margin: 0 auto;
    display: grid;
    gap: 1rem;
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
  }

  .shop-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1rem;
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
  }

  .shop-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .nav-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.3rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background: rgba(43, 33, 20, 0.22);
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(245, 238, 225, 0.82);
  }

  .nav-chip.active {
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.94), rgba(166, 121, 61, 0.92));
    border-color: transparent;
    color: rgba(22, 16, 9, 0.96);
    box-shadow: 0 18px 32px rgba(166, 121, 61, 0.24);
  }

  .search-field {
    position: relative;
  }

  .search-input {
    width: clamp(220px, 22vw, 320px);
    padding: 0.65rem 1.2rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(18, 20, 21, 0.72);
    color: rgba(245, 238, 225, 0.9);
  }

  .search-input::placeholder {
    color: rgba(205, 194, 172, 0.48);
  }

  .search-input:focus-visible {
    outline: none;
    border-color: rgba(214, 190, 141, 0.72);
    box-shadow: 0 0 0 2px rgba(214, 190, 141, 0.2);
  }

  .shop-main {
    display: grid;
    gap: 1.75rem;
  }

  @media (max-width: 960px) {
    .shop-head {
      flex-direction: column;
      align-items: stretch;
    }

    .shop-nav {
      justify-content: center;
    }

    .search-field {
      width: 100%;
    }

    .search-input {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-chip,
    .search-input {
      transition: none;
      box-shadow: none;
    }
  }
</style>
