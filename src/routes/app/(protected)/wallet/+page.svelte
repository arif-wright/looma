<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';

  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
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
  let latestCreditAmount = 0;

  $: latestCreditAmount =
    (txList.find((t) => t?.kind === 'credit')?.amount as number | undefined) ??
    ((data.tx ?? []).find((t) => t?.kind === 'credit')?.amount as number | undefined) ??
    0;

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

<div class="wallet-root">
  <InlineToast show={toastShow} message={toastMsg} onClose={() => (toastShow = false)} />
  <SanctuaryPageFrame
    eyebrow="Economy"
    title="Wallet"
    subtitle="Hold shards, top up quickly, and keep your transaction trail easy to read."
  >
    <svelte:fragment slot="actions">
      <EmotionalChip tone="cool">{formatShards(data.shards)} available</EmotionalChip>
      <EmotionalChip tone="muted">{txList.length} entries</EmotionalChip>
    </svelte:fragment>

    <main class="wallet-shell">
      <section class="wallet-pulse panel" aria-label="Wallet pulse">
        <div>
          <p class="wallet-pulse__eyebrow">Shard balance</p>
          <h2>{formatShards(data.shards)}</h2>
          <p class="wallet-pulse__lede">
            Keep purchases lightweight and visible. The wallet should feel like part of the sanctuary, not a separate store.
          </p>
        </div>

        <div class="wallet-pulse__stats">
          <article class="pulse-card">
            <span class="pulse-card__label">Latest credit</span>
            <strong>{latestCreditAmount > 0 ? `+${formatShards(latestCreditAmount)}` : 'No recent top-up'}</strong>
            <span>Recent purchases land here first.</span>
          </article>
          <article class="pulse-card">
            <span class="pulse-card__label">History</span>
            <strong>{txList.length} events</strong>
            <span>Credits, rewards, and spends stay visible.</span>
          </article>
        </div>
      </section>

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
  </SanctuaryPageFrame>
</div>

<style>
  .wallet-root {
    min-height: 100vh;
  }

  .wallet-shell {
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1rem;
  }

  .wallet-container {
    width: 100%;
    max-width: 70rem;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .wallet-pulse {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
    padding: 1rem;
    display: grid;
    gap: 0.9rem;
  }

  .wallet-pulse__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .wallet-pulse h2 {
    margin: 0.18rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.8rem, 5vw, 2.8rem);
    line-height: 1.04;
    color: rgba(249, 243, 230, 0.98);
  }

  .wallet-pulse__lede {
    margin: 0.42rem 0 0;
    color: rgba(223, 211, 188, 0.78);
    line-height: 1.5;
    max-width: 42rem;
  }

  .wallet-pulse__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .pulse-card {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(180deg, rgba(31, 25, 17, 0.64), rgba(15, 18, 20, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 56%);
    padding: 0.85rem;
    display: grid;
    gap: 0.16rem;
  }

  .pulse-card__label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.72);
  }

  .pulse-card strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 1rem;
  }

  .pulse-card span:last-child {
    color: rgba(219, 208, 185, 0.74);
    font-size: 0.8rem;
    line-height: 1.4;
  }

  .packs {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  @media (max-width: 640px) {
    .wallet-shell {
      gap: 0.85rem;
    }

    .wallet-container {
      gap: 1.25rem;
    }

    .wallet-pulse__stats {
      grid-template-columns: 1fr;
    }
  }
</style>
