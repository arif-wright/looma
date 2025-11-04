<script lang="ts">
  import { Gem } from 'lucide-svelte';

  export let level: number | null = 1;
  export let xp: number | null = 1200;
  export let xpNext: number | null = 2000;
  export let walletBalance: number | null = 320;
  export let walletCurrency = 'shards';

  const progress = xpNext && xpNext > 0 ? Math.min(1, Math.max(0, (xp ?? 0) / xpNext)) : 0;

  const format = (value: number | null | undefined) => {
    if (!Number.isFinite(value ?? NaN)) return '0';
    return Math.max(0, Math.floor(value ?? 0)).toLocaleString();
  };
</script>

<section class="capsule" aria-live="polite">
  <header>
    <span class="eyebrow">Level {level ?? '—'}</span>
    <span class="xp">{format(xp)} / {format(xpNext)}</span>
  </header>
  <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
    <div class="fill" style={`width:${progress * 100}%`}></div>
  </div>
  <div class="wallet">
    <Gem stroke-width={1.6} />
    <span class="wallet__balance">{format(walletBalance)} {walletCurrency.toUpperCase()}</span>
  </div>
</section>

<style>
  .capsule {
    display: grid;
    gap: 0.75rem;
    padding: 1.2rem;
    border-radius: 1.2rem;
    background: #242526;
    border: 1px solid rgba(59, 64, 75, 0.85);
  }

  header {
    display: flex;
    justify-content: space-between;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .eyebrow {
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .xp {
    font-weight: 600;
    color: rgba(248, 250, 252, 0.9);
  }

  .meter {
    position: relative;
    height: 0.45rem;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.16);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.92), rgba(168, 85, 247, 0.92));
    transition: width 420ms ease;
  }

  .wallet {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: rgba(248, 250, 252, 0.92);
  }

  .wallet svg {
    width: 1rem;
    height: 1rem;
    color: rgba(165, 243, 252, 0.9);
  }

  .wallet__balance {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      transition: none;
    }
  }
</style>
