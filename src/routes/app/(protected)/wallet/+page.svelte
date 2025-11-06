<script lang="ts">
  export let data: { shards: number; tx: any[] };

  import WalletHero from '$lib/components/wallet/WalletHero.svelte';
  import PackCard from '$lib/components/wallet/PackCard.svelte';
  import HistoryList from '$lib/components/wallet/HistoryList.svelte';

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

<div class="page">
  <div class="inner">
    <WalletHero shards={data.shards} />

    <section class="section">
      <h2 class="section-title">Buy Shards</h2>
      <div class="packs">
        <PackCard shards={500} price="$4.99" badge={null} onBuy={() => buy('500')} />
        <PackCard shards={1200} price="$9.99" badge="Bonus +20%" onBuy={() => buy('1200')} />
        <PackCard shards={2600} price="$19.99" badge="Best value +30%" onBuy={() => buy('2600')} />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">History</h2>
      <HistoryList tx={data.tx} />
    </section>
  </div>
</div>

<style>
  .page {
    padding: 2.5rem 0;
    background: linear-gradient(180deg, rgba(12, 14, 25, 0.5) 0%, rgba(12, 14, 25, 0) 35%, rgba(12, 14, 25, 0.5) 100%);
  }

  .inner {
    width: min(100%, 72rem);
    margin: 0 auto;
    padding: 0 1rem;
    display: grid;
    gap: 2.5rem;
  }

  .section-title {
    margin-bottom: 0.75rem;
    font-size: 0.82rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.75);
  }

  .packs {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .section {
    display: grid;
    gap: 1rem;
  }
</style>
