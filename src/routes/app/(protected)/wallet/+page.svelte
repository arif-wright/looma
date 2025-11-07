<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';

  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import WalletHero from '$lib/components/wallet/WalletHero.svelte';
  import PackCard from '$lib/components/wallet/PackCard.svelte';
  import HistoryList from '$lib/components/wallet/HistoryList.svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import { celebrateWalletCredit } from '$lib/ux/confetti';
  import InlineToast from '$lib/components/ui/InlineToast.svelte';
  import { walletBalance, walletTx, formatShards, setWalletBalance } from '$lib/stores/economy';

  export let data: { shards: number; tx: any[] };

  let toastShow = false;
  let toastMsg = '';
  let txList = data.tx ?? [];

  onMount(() => {
    setWalletBalance(data.shards ?? 0);
    walletTx.set(data.tx ?? []);
    const unsubscribe = walletTx.subscribe((value) => {
      txList = value;
    });
    return () => unsubscribe();
  });

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
    <div class="wallet-container">
      <WalletHero shards={data.shards} />

      <Panel title="Buy Shards" className="wallet-panel">
        <div class="packs" role="list">
          <PackCard
            shards={500}
            price="$4.99"
            badge={null}
            onBuy={() => buy('500')}
          />
          <PackCard
            shards={1200}
            price="$9.99"
            badge="Bonus +20%"
            onBuy={() => buy('1200')}
          />
          <PackCard
            shards={2600}
            price="$19.99"
            badge="Best value +30%"
            onBuy={() => buy('2600')}
          />
        </div>
      </Panel>

      <Panel title="History">
        <HistoryList tx={txList.length ? txList : data.tx} formatter={formatShards} />
      </Panel>
    </div>
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
    padding: clamp(2.8rem, 5vw, 4rem) clamp(1.6rem, 4vw, 3rem) clamp(4rem, 6vw, 5rem);
  }

  .wallet-container {
    width: 100%;
    max-width: 72rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .wallet-panel :global(.packs) {
    margin-top: 0.5rem;
  }

  .packs {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  @media (max-width: 640px) {
    .wallet-container {
      gap: 1.25rem;
    }
  }
</style>
