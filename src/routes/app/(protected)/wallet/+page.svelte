<script lang="ts">
  export let data: { shards: number; tx: any[]; error?: string | null };

  async function buy(pack: '500' | '1200' | '2600') {
    const res = await fetch('/api/billing/create-checkout-session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pack })
    });
    const out = await res.json().catch(() => null);
    if (!res.ok || !out?.url) {
      alert(out?.error ?? 'Failed to start checkout');
      return;
    }
    window.location.href = out.url;
  }
</script>

<h1 class="mb-4 text-lg font-semibold text-white">Wallet</h1>

{#if data.error}
  <div class="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
    Failed to load wallet: {data.error}
  </div>
{/if}

<div class="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4">
  <div class="text-white/80">Current balance</div>
  <div class="text-2xl font-bold text-white">💎 {data.shards}</div>
</div>

<h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">Buy shards</h2>
<div class="grid gap-4 sm:grid-cols-3">
  <button class="pack" on:click={() => buy('500')}>
    <div class="pack-value">500</div>
    <div class="pack-price">$4.99</div>
  </button>
  <button class="pack" on:click={() => buy('1200')}>
    <div class="pack-value">1,200</div>
    <div class="pack-price">$9.99</div>
  </button>
  <button class="pack" on:click={() => buy('2600')}>
    <div class="pack-value">2,600</div>
    <div class="pack-price">$19.99</div>
  </button>
</div>

<h2 class="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-white/70">History</h2>
{#if !data.tx.length}
  <p class="text-sm text-white/60">No transactions yet.</p>
{:else}
  <ul class="history">
    {#each data.tx as t}
      <li class="history-item">
        <div class="history-source">{t.source}</div>
        <div class={`history-amount ${t.kind === 'credit' ? 'credit' : 'debit'}`}>
          {t.kind === 'credit' ? '+' : ''}{t.amount}
        </div>
        <div class="history-date">{new Date(t.created_at).toLocaleString()}</div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .pack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.05);
    padding: 18px;
    text-align: left;
    color: white;
    transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .pack:hover,
  .pack:focus-visible {
    transform: translateY(-2px);
    border-color: rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.08);
  }

  .pack-value {
    font-size: 1.3rem;
    font-weight: 600;
  }

  .pack-price {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .history {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.05);
    overflow: hidden;
    display: grid;
  }

  .history-item {
    display: grid;
    grid-template-columns: 1.5fr auto auto;
    gap: 16px;
    align-items: center;
    padding: 14px 18px;
  }

  .history-item + .history-item {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .history-source {
    text-transform: capitalize;
    color: rgba(255, 255, 255, 0.78);
    font-weight: 500;
  }

  .history-amount {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .history-amount.credit {
    color: #4ade80;
  }

  .history-amount.debit {
    color: #f87171;
  }

  .history-date {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
    text-align: right;
  }

  @media (max-width: 640px) {
    .history-item {
      grid-template-columns: 1fr;
      gap: 6px;
      text-align: left;
    }

    .history-date {
      text-align: left;
    }
  }
</style>
