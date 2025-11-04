<script lang="ts">
  import { onMount } from 'svelte';
  import { Gem } from 'lucide-svelte';

  export let level: number | null = null;
  export let xp: number | null = null;
  export let xpNext: number | null = null;
  export let walletBalance: number | null = null;
  export let walletCurrency = 'shards';
  export let walletDelta: number | null = null;

  let progress = 0;
  let targetProgress = 0;

  const formatCurrency = (value: number | null | undefined) => {
    if (!Number.isFinite(value ?? NaN)) return '0';
    return Math.max(0, Math.floor(value ?? 0)).toLocaleString();
  };

  const computeProgress = () => {
    if (!Number.isFinite(xp ?? NaN) || !Number.isFinite(xpNext ?? NaN) || !xpNext) {
      return 0;
    }
    return Math.max(0, Math.min(1, (xp ?? 0) / xpNext));
  };

  $: targetProgress = computeProgress();

  onMount(() => {
    progress = targetProgress;
  });

  $: if (targetProgress !== progress) {
    if (typeof window === 'undefined') {
      progress = targetProgress;
    } else {
      const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
      if (prefersReduced) {
        progress = targetProgress;
      } else {
        requestAnimationFrame(() => {
          progress = targetProgress;
        });
      }
    }
  }

  $: currencyLabel = walletCurrency?.toUpperCase?.() ?? 'SHARDS';
  $: deltaSign = walletDelta && walletDelta !== 0 ? (walletDelta > 0 ? '+' : '−') : null;
  $: deltaValue = walletDelta ? Math.abs(walletDelta) : 0;
</script>

<section class="telemetry" aria-live="polite">
  <div class="telemetry__level text-sm text-white/70">
    Level {Number.isFinite(level ?? NaN) ? level : '—'}
  </div>
  <div class="telemetry__xp">
    <span class="telemetry__label">Bond XP</span>
    <div class="telemetry__track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(progress * 100)}>
      <div class="telemetry__fill" style={`width:${Math.round(progress * 100)}%`}></div>
    </div>
  </div>
  <div class="telemetry__wallet">
    <Gem class="telemetry__gem" stroke-width={1.6} />
    <span class="telemetry__balance">{formatCurrency(walletBalance)} {currencyLabel}</span>
    {#if deltaSign}
      <span class={`telemetry__delta ${walletDelta && walletDelta > 0 ? 'up' : 'down'}`}>
        {deltaSign}{formatCurrency(deltaValue)}
      </span>
    {/if}
  </div>
</section>

<style>
  .telemetry {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(14px);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 22px 40px rgba(8, 15, 25, 0.35);
    min-width: 0;
  }

  .telemetry__level {
    font-size: 0.82rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .telemetry__xp {
    display: grid;
    gap: 0.4rem;
  }

  .telemetry__label {
    font-size: 0.78rem;
    color: rgba(226, 232, 240, 0.7);
  }

  .telemetry__track {
    position: relative;
    width: 100%;
    height: 0.45rem;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.18);
    overflow: hidden;
  }

  .telemetry__fill {
    height: 100%;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.9), rgba(147, 197, 253, 0.85));
    border-radius: inherit;
    transition: width 700ms ease-out;
  }

  .telemetry__wallet {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.85rem;
    color: rgba(226, 232, 240, 0.75);
  }

  .telemetry__gem {
    width: 1rem;
    height: 1rem;
    color: rgba(103, 232, 249, 0.9);
  }

  .telemetry__balance {
    font-variant-numeric: tabular-nums;
    color: rgba(248, 250, 252, 0.95);
  }

  .telemetry__delta {
    font-variant-numeric: tabular-nums;
    font-size: 0.78rem;
    padding-left: 0.35rem;
  }

  .telemetry__delta.up {
    color: rgb(74 222 128);
  }

  .telemetry__delta.down {
    color: rgb(248 113 113);
  }

  @media (prefers-reduced-motion: reduce) {
    .telemetry__fill {
      transition: none;
    }
    .telemetry::before {
      animation: none;
    }
  }
</style>
