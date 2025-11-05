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
    }, 200);
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
      purchaseError = 'Purchase failed.';
      dispatch('error', { message: purchaseError });
    } finally {
      purchasing = false;
    }
  }

  function adjustQty(delta: number) {
    qty = clampQty(qty + delta);
    schedulePriceFetch();
  }

  function resetState() {
    qty = 1;
    pricing = null;
    pricingError = null;
    purchaseError = null;
    loadingPrice = false;
    purchasing = false;
  }

  onMount(() => {
    previouslyFocused = (browser ? (document.activeElement as HTMLElement | null) : null) ?? null;
  });

  onDestroy(() => {
    priceTimer && clearTimeout(priceTimer);
    priceAbort?.abort();
  });

  $: {
    if (open && !wasOpen) {
      resetState();
      void focusModal();
      void fetchPrice();
    }
    if (!open && wasOpen && previouslyFocused) {
      previouslyFocused.focus({ preventScroll: true });
    }
    wasOpen = open;
  }
</script>

{#if open && item}
  <Portal target="body">
    <div class="shop-modal__overlay" role="presentation" on:click|stopPropagation={close}>
      <div
        class="shop-modal panel-glass"
        role="dialog"
        aria-modal="true"
        aria-label={`Purchase ${item.displayName}`}
        bind:this={modalEl}
        on:keydown={handleKey}
        on:click|stopPropagation
      >
        <button class="modal-close" type="button" on:click={close} aria-label="Close modal">×</button>

        <div class="modal-body">
          <div class="modal-media" aria-hidden="true">
            {#if item.icon}
              <img src={item.icon} alt="" loading="lazy" decoding="async" />
            {:else}
              <span>{item.displayName.charAt(0)}</span>
            {/if}
          </div>

          <div class="modal-copy">
            <span class="rarity-chip">{(item.rarity ?? 'common').toUpperCase()}</span>
            <h2>{item.displayName}</h2>
            <p>{item.description}</p>

            <div class="qty-picker" aria-label="Quantity selector">
              <button type="button" on:click={() => adjustQty(-1)} disabled={qty <= 1} aria-label="Decrease quantity">
                −
              </button>
              <input
                type="number"
                min="1"
                max={effectiveMaxQty()}
                value={qty}
                on:input={handleQtyInput}
              />
              <button
                type="button"
                on:click={() => adjustQty(1)}
                disabled={qty >= effectiveMaxQty()}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <div class="wallet-line">
              <span>Wallet balance</span>
              <strong>{formatCurrency(walletBalance, item.currency)}</strong>
            </div>

            <div class="price-breakdown">
              {#if pricingError}
                <p class="error">{pricingError}</p>
              {:else if loadingPrice || !pricing}
                <p class="muted">Calculating best price…</p>
              {:else}
                <ul>
                  {#each pricing.lines as line (line.sku)}
                    <li>
                      <span>{line.qty} × {item.displayName}</span>
                      <span>{formatCurrency(line.total, pricing.currency)}</span>
                    </li>
                  {/each}
                </ul>
                <div class="grand-total">
                  <span>Total</span>
                  <strong>{formatCurrency(pricing.total, pricing.currency)}</strong>
                </div>
              {/if}
            </div>

            {#if purchaseError}
              <p class="error">{purchaseError}</p>
            {/if}

            <div class="modal-actions">
              <button type="button" class="secondary" on:click={close} disabled={purchasing}>Cancel</button>
              <button type="button" class="primary" on:click={handlePurchase} disabled={purchasing || !!pricingError}>
                {purchasing ? 'Purchasing…' : `Purchase ${formatCurrency((pricing?.total ?? item.price * qty), item.currency)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Portal>
{/if}

<style>
  .shop-modal__overlay {
    position: fixed;
    inset: 0;
    background: rgba(4, 6, 16, 0.7);
    backdrop-filter: blur(12px);
    display: grid;
    place-items: center;
    padding: 1.5rem;
    z-index: 1000;
  }

  .shop-modal {
    position: relative;
    width: min(720px, 100%);
    padding: clamp(1.5rem, 4vw, 2.4rem);
    display: grid;
    gap: 1.8rem;
  }

  .modal-close {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 28, 0.6);
    color: rgba(248, 250, 255, 0.78);
    font-size: 1.4rem;
  }

  .modal-body {
    display: grid;
    gap: 1.6rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    align-items: start;
  }

  .modal-media {
    border-radius: 1.5rem;
    overflow: hidden;
    background: radial-gradient(circle at 35% 30%, rgba(94, 242, 255, 0.3), transparent 55%),
      rgba(255, 255, 255, 0.08);
    min-height: 220px;
    display: grid;
    place-items: center;
  }

  .modal-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .modal-copy {
    display: grid;
    gap: 0.75rem;
  }

  .rarity-chip {
    align-self: start;
    font-size: 0.65rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    padding: 0.25rem 0.7rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(8, 12, 28, 0.55);
    color: rgba(248, 250, 255, 0.72);
  }

  h2 {
    margin: 0;
    font-size: clamp(1.6rem, 3vw, 2rem);
    font-weight: 600;
    color: rgba(248, 250, 255, 0.98);
  }

  p {
    margin: 0;
    color: rgba(226, 232, 240, 0.82);
    line-height: 1.6;
  }

  .qty-picker {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.6rem;
    border-radius: 999px;
    background: rgba(8, 12, 28, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .qty-picker button {
    width: 2rem;
    height: 2rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(12, 16, 32, 0.78);
    color: rgba(248, 250, 255, 0.85);
    font-size: 1.1rem;
  }

  .qty-picker input {
    width: 3rem;
    text-align: center;
    border: none;
    background: transparent;
    color: rgba(248, 250, 255, 0.95);
    font-weight: 600;
  }

  .wallet-line,
  .grand-total {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.95rem;
  }

  .wallet-line span,
  .grand-total span {
    color: rgba(226, 232, 240, 0.68);
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .wallet-line strong,
  .grand-total strong {
    color: rgba(248, 250, 255, 0.95);
  }

  .price-breakdown ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.4rem;
    color: rgba(226, 232, 240, 0.78);
  }

  .price-breakdown li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9rem;
  }

  .price-breakdown .muted {
    color: rgba(148, 163, 184, 0.7);
  }

  .error {
    color: rgba(255, 149, 5, 0.9);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }

  .modal-actions button {
    padding: 0.65rem 1.6rem;
    border-radius: 999px;
    border: 1px solid transparent;
    font-weight: 600;
  }

  .modal-actions .secondary {
    background: rgba(8, 12, 28, 0.6);
    border-color: rgba(255, 255, 255, 0.16);
    color: rgba(248, 250, 255, 0.85);
  }

  .modal-actions .primary {
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    color: rgba(8, 10, 22, 0.88);
    box-shadow: 0 18px 32px rgba(94, 242, 255, 0.35);
  }

  @media (max-width: 960px) {
    .modal-body {
      grid-template-columns: 1fr;
    }

    .modal-media {
      min-height: 180px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shop-modal,
    .modal-media {
      transition: none;
    }
  }
</style>
