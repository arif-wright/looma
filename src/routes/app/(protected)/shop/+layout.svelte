<script lang="ts">
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
</script>

<div class="shop-root bg-neuro">
  <BackgroundStack class="shop-bg" />
  <div class="shop-shell">
    <header class="shop-head panel-glass" aria-label="Marketplace navigation">
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

  .shop-shell {
    position: relative;
    z-index: 1;
    max-width: 1680px;
    width: 100%;
    margin: 0 auto;
    display: grid;
    gap: 2rem;
    padding: clamp(2.5rem, 4vw, 4rem) clamp(1.5rem, 3.5vw, 2.75rem) 5rem;
  }

  .shop-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1.5rem;
    padding: 1.4rem clamp(1.2rem, 2.8vw, 1.9rem);
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
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(8, 12, 28, 0.6);
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.78);
  }

  .nav-chip.active {
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    border-color: transparent;
    color: rgba(8, 10, 22, 0.88);
    box-shadow: 0 18px 32px rgba(94, 242, 255, 0.35);
  }

  .search-field {
    position: relative;
  }

  .search-input {
    width: clamp(220px, 22vw, 320px);
    padding: 0.65rem 1.2rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(248, 250, 255, 0.9);
  }

  .search-input::placeholder {
    color: rgba(226, 232, 240, 0.58);
  }

  .search-input:focus-visible {
    outline: none;
    border-color: rgba(94, 242, 255, 0.8);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.3);
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
