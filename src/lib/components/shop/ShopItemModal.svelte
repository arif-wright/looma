<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import Portal from '$lib/ui/Portal.svelte';
  import type { ShopGridItem } from './ShopGrid.svelte';

  export type PricedLine = {
    sku: string;
    qty: number;
    unitPrice: number;
    subtotal: number;
    discount: number;
    total: number;
    promoPercent: number;
    achievementPercent: number;
    effectivePercent: number;
  };

  export type PriceSummary = {
    total: number;
    currency: string;
    achievementPercent: number;
    maxPromoPercent: number;
    combinedDiscountPercent: number;
    lines: PricedLine[];
  };

  export type PurchaseResult = {
    orderId: string;
    total: number;
    currency: string;
    balance: number;
    inventoryDeltas: Array<{ sku: string; delta: number; qty: number }>;
    achievementPercent: number;
    maxPromoPercent: number;
  };

  const dispatch = createEventDispatcher<{
    close: void;
    purchased: { item: ShopGridItem; qty: number; total: number; price: PriceSummary; result: PurchaseResult };
    error: { message: string };
  }>();

  export let open = false;
  export let item: ShopGridItem | null = null;
  export let walletBalance = 0;
  export let inventoryQty = 0;
  export let maxQty = 10;

  let qty = 1;
  let pricing: PriceSummary | null = null;
  let pricingError: string | null = null;
  let loadingPrice = false;
  let purchasing = false;
  let purchaseError: string | null = null;
  let wasOpen = false;

  let modalEl: HTMLElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let priceTimer: ReturnType<typeof setTimeout> | null = null;
  let priceAbort: AbortController | null = null;

  const effectiveMaxQty = () => (item && !item.stackable ? 1 : maxQty);

  function close() {
    if (purchasing) return;
    dispatch('close');
  }

  function clampQty(value: number) {
    const max = effectiveMaxQty();
    return Math.min(Math.max(1, Math.floor(value)), max);
  }

  function formatCurrency(amount: number, currency = 'shards') {
    const safe = Number.isFinite(amount) ? amount : 0;
    return `${safe.toLocaleString()} ${currency.toUpperCase()}`;
  }

  async function focusModal() {
    if (!browser || !open) return;
    await tick();
    if (!modalEl) return;
    focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    );
    (focusable[0] ?? modalEl).focus();
  }

  function handleKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'Tab') {
      if (!focusable.length || !modalEl) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  function resetPricing() {
    pricing = null;
    pricingError = null;
  }

  async function fetchPrice() {
    if (!item || !open) return;
    priceAbort?.abort();
    priceAbort = new AbortController();
    loadingPrice = true;
    pricingError = null;

    try {
      const response = await fetch('/api/shop/price', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ lines: [{ sku: item.sku, qty }] }),
        signal: priceAbort.signal
      });

      const payload = await response.json();
      if (!response.ok) {
        pricing = null;
        pricingError = typeof payload?.message === 'string' ? payload.message : 'Unable to price purchase.';
      } else {
        pricing = payload as PriceSummary;
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      pricing = null;
      pricingError = 'Unable to price purchase.';
    } finally {
      loadingPrice = false;
    }
  }

  function schedulePriceFetch() {
    if (!open || !item) return;
    priceTimer && clearTimeout(priceTimer);
    priceTimer = setTimeout(() => {
      void fetchPrice();
    }, 180);
  }

  function handleQtyInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    if (!target) return;
    const value = Number(target.value);
    qty = clampQty(Number.isFinite(value) ? value : 1);
    schedulePriceFetch();
  }

  async function handlePurchase() {
    if (!item || purchasing) return;
    purchasing = true;
    purchaseError = null;

    try {
      const response = await fetch('/api/shop/purchase', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        body: JSON.stringify({ lines: [{ sku: item.sku, qty }] })
      });

      const payload = await response.json();
      if (!response.ok) {
        purchaseError = typeof payload?.message === 'string' ? payload.message : 'Purchase failed.';
        dispatch('error', { message: purchaseError });
      } else {
        const result = payload as PurchaseResult;
        dispatch('purchased', {
          item,
          qty,
          total: result.total,
          price: pricing ?? {
            total: qty * (item.price ?? 0),
            currency: item.currency,
            achievementPercent: 0,
            maxPromoPercent: item.promoPercent,
            combinedDiscountPercent: item.promoPercent,
            lines: [
              {
                sku: item.sku,
                qty,
                unitPrice: item.price,
                subtotal: item.price * qty,
                discount: 0,
                total: item.price * qty,
                promoPercent: item.promoPercent,
                achievementPercent: 0,
                effectivePercent: item.promoPercent
              }
            ]
          },
          result
        });
        close();
      }
    } catch (error) {
      console.error('[shop] purchase failed', error);
      purchaseError = 'Unable to complete purchase.';
      dispatch('error', { message: purchaseError });
    } finally {
      purchasing = false;
    }
  }

  $: {
    if (open && !wasOpen) {
      qty = clampQty(1);
    }
    wasOpen = open;
  }

  $: if (browser) {
    if (open) {
      previouslyFocused = (document.activeElement as HTMLElement | null) ?? previouslyFocused;
      document.body.classList.add('modal-open');
      qty = clampQty(qty);
      resetPricing();
      pricing = null;
      purchaseError = null;
      loadingPrice = false;
      void focusModal();
      schedulePriceFetch();
    } else {
      document.body.classList.remove('modal-open');
      focusable = [];
      previouslyFocused?.focus?.();
      previouslyFocused = null;
      priceTimer && clearTimeout(priceTimer);
      priceAbort?.abort();
      purchasing = false;
      pricingError = null;
      purchaseError = null;
    }
  }

  onMount(() => {
    if (!browser) return;
    document.addEventListener('keydown', handleKey, true);
  });

  onDestroy(() => {
    if (!browser) return;
    document.removeEventListener('keydown', handleKey, true);
    document.body.classList.remove('modal-open');
    priceTimer && clearTimeout(priceTimer);
    priceAbort?.abort();
  });

  $: currentLine = pricing?.lines?.[0] ?? null;
  $: totalDisplay = pricing ? formatCurrency(pricing.total, pricing.currency) : item ? formatCurrency(item.price * qty, item.currency) : '—';
  $: promoDisplay = currentLine && currentLine.promoPercent > 0 ? `-${currentLine.promoPercent}% promo` : null;
  $: achievementDisplay = pricing && pricing.achievementPercent > 0 ? `-${pricing.achievementPercent}% achievement` : null;
  $: effectiveDisplay = currentLine && currentLine.discount > 0 ? formatCurrency(currentLine.discount, pricing?.currency ?? item?.currency ?? 'shards') : null;
</script>

{#if browser && open && item}
  <Portal target="#modal-root">
    <button type="button" class="shop-modal__backdrop" aria-label="Close" on:click={close}></button>

    <section
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-modal-title"
      class="shop-modal panel-glass"
      data-testid="shop-modal"
      on:click|stopPropagation
    >
      <header class="shop-modal__header">
        <div class="shop-modal__icon" aria-hidden="true">{item.icon}</div>
        <div class="shop-modal__title">
          <p class="shop-modal__eyebrow">{item?.productName ?? 'Featured item'}</p>
          <h2 id="shop-modal-title">{item.displayName}</h2>
          <p>{item.description}</p>
        </div>
        <button type="button" class="shop-modal__close" on:click={close} aria-label="Close dialog">✕</button>
      </header>

      <div class="shop-modal__body">
        <div class="shop-modal__meta">
          <span class="sku">SKU: {item.sku}</span>
          <span class="rarity">{(item.rarity ?? 'common').toUpperCase()}</span>
          <span class="stackable">{item.stackable ? 'Stackable' : 'One-off'}</span>
          <span class="inventory">Owned: {inventoryQty}</span>
        </div>

        <label class="shop-modal__qty">
          <span>Quantity</span>
          <input
            type="number"
            min="1"
            max={effectiveMaxQty()}
            step="1"
            value={qty}
            on:input={handleQtyInput}
            readonly={!item.stackable}
          />
        </label>

        <div class="shop-modal__pricing" aria-live="polite">
          {#if loadingPrice}
            <p class="loading">Pricing…</p>
          {:else if pricingError}
            <p class="error">{pricingError}</p>
          {:else}
            <div class="total-line" data-testid="shop-modal-total">
              <span>Total</span>
              <strong>{totalDisplay}</strong>
            </div>
            {#if promoDisplay}
              <div class="discount-line promo">{promoDisplay}</div>
            {/if}
            {#if achievementDisplay}
              <div class="discount-line achievement">{achievementDisplay}</div>
            {/if}
            {#if effectiveDisplay}
              <div class="discount-line savings">Savings {effectiveDisplay}</div>
            {/if}
          {/if}
        </div>
      </div>

      <footer class="shop-modal__footer">
        <div class="wallet">Wallet: {formatCurrency(walletBalance, item.currency)}</div>
        <button
          type="button"
          class="shop-modal__primary brand-cta"
          data-testid="shop-modal-buy"
          data-ana="shop:purchase"
          on:click={handlePurchase}
          disabled={purchasing || loadingPrice || !!pricingError}
        >
          {purchasing ? 'Processing…' : `Buy for ${totalDisplay}`}
        </button>
      </footer>

      {#if purchaseError}
        <p class="shop-modal__error" data-testid="shop-modal-error">{purchaseError}</p>
      {/if}
    </section>
  </Portal>
{/if}

<style>
  .shop-modal__backdrop {
    position: fixed;
    inset: 0;
    background: rgba(8, 15, 30, 0.7);
    backdrop-filter: blur(8px);
    border: none;
    padding: 0;
    margin: 0;
    z-index: 90;
  }

  .shop-modal {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(540px, 92vw);
    background: rgba(5, 7, 18, 0.92);
    border-radius: 1.6rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    box-shadow: 0 40px 64px rgba(0, 0, 0, 0.55);
    padding: 1.5rem;
    color: #f5f6ff;
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    z-index: 100;
  }

  .shop-modal__header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 1rem;
    padding: 0.25rem 0.25rem 0.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .shop-modal__icon {
    width: 60px;
    height: 60px;
    border-radius: 1.1rem;
    display: grid;
    place-items: center;
    font-size: 2rem;
    background: radial-gradient(circle at 30% 20%, rgba(94, 242, 255, 0.5), transparent 55%),
      rgba(94, 242, 255, 0.1);
    border: 1px solid rgba(94, 242, 255, 0.25);
  }

  .shop-modal__title h2 {
    margin: 0;
    font-size: 1.35rem;
  }

  .shop-modal__title p {
    margin: 0.2rem 0 0;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.9rem;
  }

  .shop-modal__eyebrow {
    font-size: 0.65rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    margin: 0 0 0.3rem;
  }

  .shop-modal__close {
    border: none;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.85);
    border-radius: 999px;
    width: 2rem;
    height: 2rem;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .shop-modal__close:hover,
  .shop-modal__close:focus-visible {
    background: rgba(94, 234, 212, 0.25);
    outline: none;
  }

  .shop-modal__body {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shop-modal__meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 0.5rem;
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(148, 163, 184, 0.75);
  }

  .shop-modal__qty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.85rem 1rem;
    border-radius: 1rem;
    background: rgba(8, 12, 28, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .shop-modal__qty span {
    font-size: 0.9rem;
    color: rgba(226, 232, 240, 0.85);
    letter-spacing: 0.05em;
  }

  .shop-modal__qty input {
    width: 80px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0.9rem;
    background: rgba(5, 7, 18, 0.8);
    color: #f8fafc;
    font-size: 1rem;
    padding: 0.4rem 0.6rem;
    text-align: center;
  }

  .shop-modal__qty input:focus-visible {
    outline: none;
    border-color: rgba(94, 242, 255, 0.6);
    box-shadow: 0 0 0 2px rgba(94, 242, 255, 0.25);
  }

  .shop-modal__pricing {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    padding: 1rem;
    border-radius: 1rem;
    background: rgba(8, 12, 28, 0.75);
    border: 1px solid rgba(94, 242, 255, 0.15);
  }

  .shop-modal__pricing .loading {
    color: rgba(148, 163, 184, 0.8);
    font-size: 0.88rem;
  }

  .shop-modal__pricing .error {
    color: #f87171;
    font-size: 0.88rem;
  }

  .total-line {
    display: flex;
    justify-content: space-between;
    font-size: 1.05rem;
    font-weight: 600;
    color: rgba(244, 247, 255, 0.95);
  }

  .discount-line {
    font-size: 0.84rem;
    color: rgba(148, 163, 184, 0.88);
  }

  .discount-line.promo {
    color: rgba(110, 231, 183, 0.92);
  }

  .discount-line.achievement {
    color: rgba(129, 140, 248, 0.92);
  }

  .discount-line.savings {
    color: rgba(248, 250, 252, 0.9);
  }

  .shop-modal__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .shop-modal__footer .wallet {
    font-size: 0.86rem;
    color: rgba(148, 163, 184, 0.85);
  }

  .shop-modal__primary {
    min-width: 180px;
    border: none;
  }

  .shop-modal__primary:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .shop-modal__error {
    margin: 0;
    font-size: 0.86rem;
    color: #f87171;
    text-align: center;
  }

  @media (max-width: 600px) {
    .shop-modal {
      width: 94vw;
      padding: 1.25rem;
    }

    .shop-modal__footer {
      flex-direction: column;
      gap: 0.8rem;
      align-items: flex-start;
    }

    .shop-modal__primary {
      width: 100%;
    }
  }
</style>
