<script lang="ts">
  export let shards: number;
  export let price: string;
  export let badge: string | null = null;
  export let onBuy: () => void;
</script>

<article class="card">
  <div class="card-body">
    {#if badge}
      <span class="badge">{badge}</span>
    {/if}

    <div class="card-summary">
      <div class="card-icon" aria-hidden="true">💎</div>
      <div>
        <div class="card-value">{shards.toLocaleString()}</div>
        <div class="card-price">{price}</div>
      </div>
    </div>

    <button type="button" class="card-button" on:click={onBuy}>
      Purchase
    </button>
  </div>
</article>

<style>
  .card {
    position: relative;
    overflow: hidden;
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .card:hover,
  .card:focus-within {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
  }

  .card-body {
    position: relative;
    padding: 1.5rem;
  }

  .badge {
    position: absolute;
    top: 0.75rem;
    right: 0.75rem;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.65rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.9);
    text-transform: uppercase;
  }

  .card-summary {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .card-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(34, 211, 238, 0.6), rgba(168, 85, 247, 0.6));
    border: 1px solid rgba(255, 255, 255, 0.18);
    font-size: 1.35rem;
  }

  .card-value {
    font-size: 1.4rem;
    font-weight: 600;
    color: white;
  }

  .card-price {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .card-button {
    margin-top: 1.25rem;
    width: 100%;
    height: 2.3rem;
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(34, 211, 238, 0.85), rgba(168, 85, 247, 0.85));
    color: rgba(17, 24, 39, 0.92);
    font-size: 0.9rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: filter 0.2s ease;
  }

  .card-button:hover,
  .card-button:focus-visible {
    filter: brightness(1.08);
    outline: none;
  }

  .card-button:focus-visible {
    box-shadow: 0 0 0 2px rgba(125, 211, 252, 0.6);
  }
</style>
