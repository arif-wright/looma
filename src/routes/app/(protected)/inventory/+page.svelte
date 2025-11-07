<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  export let data: { items: any[]; error?: string | null };

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Unknown' : date.toLocaleString();
  };
</script>

<div class="inventory-root bg-neuro">
  <main class="inventory-shell">
    <div class="inventory-container">
      <header class="inventory-header">
        <div>
          <p class="eyebrow">Economy</p>
          <h1>Inventory</h1>
          <p class="lede">All the cosmetics and boosts you currently own.</p>
        </div>
      </header>

      <Panel title="Inventory">
        {#if data.error}
          <div class="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
            Failed to load inventory: {data.error}
          </div>
        {:else if !data.items.length}
          <p class="text-sm text-white/65">You don’t own any items yet.</p>
        {:else}
          <div class="inventory-grid">
            {#each data.items as row}
              <article
                class="inventory-card"
                data-test="inventory-card"
                aria-label={`${row.item.title} owned item`}
              >
                <div class="inventory-media">
                  <img
                    src={row.item.image_url}
                    alt={`${row.item.title} cover`}
                    loading="lazy"
                  />
                  <span class="inventory-rarity">{row.item.rarity}</span>
                </div>
                <div class="inventory-body">
                  <h3>{row.item.title}</h3>
                  {#if row.item.subtitle}
                    <p class="subtitle">{row.item.subtitle}</p>
                  {/if}
                  <p class="meta">Acquired {formatDate(row.acquired_at)}</p>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </Panel>
    </div>
  </main>
</div>

<style>
  .inventory-root {
    min-height: 100vh;
    color: #fff;
  }

  .inventory-shell {
    padding: clamp(2.5rem, 4vw, 3.5rem) 1.5rem 3rem;
  }

  .inventory-container {
    width: 100%;
    max-width: 72rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .inventory-header h1 {
    margin: 0;
    font-size: clamp(1.7rem, 4vw, 2.2rem);
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.28em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 0.4rem;
  }

  .lede {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .inventory-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .inventory-card {
    overflow: hidden;
    border-radius: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
  }

  .inventory-media {
    position: relative;
    aspect-ratio: 16 / 9;
  }

  .inventory-media img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .inventory-rarity {
    position: absolute;
    top: 0.6rem;
    right: 0.6rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(0, 0, 0, 0.55);
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .inventory-body {
    padding: 0.85rem 1rem 1.1rem;
  }

  .inventory-body h3 {
    margin: 0;
    font-size: 1rem;
  }

  .subtitle {
    margin: 0.35rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .meta {
    margin: 0.55rem 0 0;
    font-size: 0.72rem;
    color: rgba(255, 255, 255, 0.5);
  }

  @media (max-width: 640px) {
    .inventory-shell {
      padding: 2rem 1rem;
    }
  }
</style>
