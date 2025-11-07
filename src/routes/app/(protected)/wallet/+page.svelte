<script lang="ts">
  import { onMount } from 'svelte';
  import type { ComponentType } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';

  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import WalletHero from '$lib/components/wallet/WalletHero.svelte';
  import PackCard from '$lib/components/wallet/PackCard.svelte';
  import HistoryList from '$lib/components/wallet/HistoryList.svelte';
  import { celebrateWalletCredit } from '$lib/ux/confetti';
  import InlineToastComponent from '$lib/components/ui/InlineToast.svelte';

  const InlineToast = InlineToastComponent as ComponentType<any>;

  export let data: { shards: number; tx: any[] };

  let toastShow = false;
  let toastMsg = '';

  function showToast(msg: string) {
    toastMsg = msg;
    toastShow = true;
  }

  onMount(() => {
    const url = get(page).url;
    const status = url.searchParams.get('status');
    if (status === 'success') {
      const latestCredit = (data.tx || []).find((t) => t?.kind === 'credit');
      const amount = latestCredit?.amount ?? null;

      celebrateWalletCredit();
      showToast(amount ? `+${amount} shards added to your wallet` : 'Purchase successful');

      const clean = new URL(url);
      clean.searchParams.delete('status');
      history.replaceState({}, '', clean.toString());
    }
  });

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

<div class="wallet-root bg-neuro">
  <InlineToast show={toastShow} message={toastMsg} onClose={() => (toastShow = false)} />
  <BackgroundStack class="wallet-bg" />
  <main class="wallet-shell">
    <WalletHero shards={data.shards} />

    <section class="wallet-section" aria-labelledby="wallet-packs-heading">
      <h2 id="wallet-packs-heading" class="section-title">Buy Shards</h2>
      <div class="packs">
        <PackCard shards={500} price="$4.99" badge={null} onBuy={() => buy('500')} />
        <PackCard shards={1200} price="$9.99" badge="Bonus +20%" onBuy={() => buy('1200')} />
        <PackCard shards={2600} price="$19.99" badge="Best value +30%" onBuy={() => buy('2600')} />
      </div>
    </section>

    <section class="wallet-section" aria-labelledby="wallet-history-heading">
      <h2 id="wallet-history-heading" class="section-title">History</h2>
      <HistoryList tx={data.tx} />
    </section>
  </main>
</div>

<style>
  .wallet-root {
    position: relative;
    min-height: 100vh;
    color: #fff;
    overflow: hidden;
  }

  .wallet-bg :global(canvas) {
    opacity: 0.26;
  }

  .wallet-shell {
    position: relative;
    z-index: 1;
    width: min(100%, 72rem);
    margin: 0 auto;
    display: grid;
    gap: 2.75rem;
    padding: clamp(2.8rem, 5vw, 4rem) clamp(1.6rem, 4vw, 3rem) clamp(4rem, 6vw, 5rem);
  }

  .wallet-section {
    display: grid;
    gap: 1.25rem;
  }

  .section-title {
    margin: 0;
    font-size: 0.8rem;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.76);
  }

  .packs {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
</style>
