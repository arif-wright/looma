<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onMount } from 'svelte';
  import CompanionHero from '$lib/components/home/CompanionHero.svelte';
  import QuickNav from '$lib/components/home/QuickNav.svelte';
  import type { QuickNavItem } from '$lib/components/home/quickNavTypes';

  export let companionName = 'Mirae';
  export let companionSpecies = 'Muse';
  export let companionAvatarUrl: string | null = null;
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';
  export let statusLine = 'Mirae feels distant.';
  export let statusReason = "She hasn't heard from you today.";
  export let primaryLabel = 'Reconnect (30 sec)';
  export let primaryCopy = 'A quick check-in to bring Mirae closer.';
  export let needsReconnectToday = false;
  export let quickNavItems: QuickNavItem[] = [];

  const dispatch = createEventDispatcher<{
    primary: Record<string, never>;
    companion: Record<string, never>;
    navigate: { id: QuickNavItem['id']; href: string };
  }>();

  const ONBOARDING_KEY = 'looma:homeSanctuaryHintDismissed:v1';
  let showHint = false;

  const dismissHint = () => {
    showHint = false;
    if (browser) window.localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  onMount(() => {
    if (!browser) return;
    showHint = window.localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });
</script>

<section class="sanctuary">
  <div class="sanctuary__bg" aria-hidden="true"></div>
  <div class="sanctuary__noise" aria-hidden="true"></div>

  {#if showHint}
    <aside class="sanctuary__hint" role="status">
      <p>Start with Reconnect. Then explore Circles, Games, and Messages.</p>
      <button type="button" on:click={dismissHint} aria-label="Dismiss hint">Dismiss</button>
    </aside>
  {/if}

  <CompanionHero
    name={companionName}
    species={companionSpecies}
    avatarUrl={companionAvatarUrl}
    {closenessState}
  />

  <section class="status">
    <h1>{statusLine}</h1>
    <p>{statusReason}</p>
    <span class={`status__pill status__pill--${closenessState.toLowerCase()}`}>{closenessState}</span>
  </section>

  <section class="primary">
    <button type="button" class={`primary__button ${needsReconnectToday ? 'primary__button--pulse' : ''}`} on:click={() => dispatch('primary', {})}>
      {primaryLabel}
    </button>
    <p>{primaryCopy}</p>
  </section>

  <QuickNav items={quickNavItems} on:navigate={(event) => {
    if (event.detail.id === 'companion') {
      dispatch('companion', {});
      return;
    }
    dispatch('navigate', event.detail);
  }} />
</section>

<style>
  .sanctuary {
    --home-font-display: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    --home-font-body: 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif;

    --home-bg-base: rgba(6, 11, 27, 0.98);
    --home-bg-deep: rgba(4, 7, 19, 1);
    --home-bg-glass: rgba(10, 17, 37, 0.82);
    --home-surface-soft: rgba(9, 15, 34, 0.56);

    --home-text-primary: rgba(245, 250, 255, 0.98);
    --home-text-secondary: rgba(189, 208, 232, 0.88);
    --home-text-tertiary: rgba(186, 210, 237, 0.84);

    --home-accent-cyan: rgba(96, 222, 255, 0.16);
    --home-accent-warm: rgba(246, 184, 114, 0.12);
    --home-cta-start: rgba(86, 232, 220, 0.96);
    --home-cta-end: rgba(119, 175, 255, 0.95);
    --home-cta-text: rgba(6, 16, 35, 0.96);

    --home-state-distant-fg: rgba(201, 229, 252, 0.98);
    --home-state-distant-border: rgba(131, 201, 245, 0.56);
    --home-state-distant-bg: rgba(12, 37, 57, 0.66);
    --home-state-near-fg: rgba(255, 233, 196, 0.97);
    --home-state-near-border: rgba(255, 199, 125, 0.6);
    --home-state-near-bg: rgba(67, 42, 11, 0.62);
    --home-state-resonant-fg: rgba(206, 255, 228, 0.98);
    --home-state-resonant-border: rgba(109, 233, 179, 0.56);
    --home-state-resonant-bg: rgba(11, 48, 32, 0.62);

    --home-radius-sm: 0.56rem;
    --home-radius-md: 0.78rem;
    --home-radius-lg: 0.95rem;
    --home-radius-xl: 1.2rem;

    --home-shadow-soft: 0 14px 28px rgba(20, 184, 166, 0.3);
    --home-shadow-cta: 0 16px 30px rgba(44, 153, 255, 0.28);
    --home-shadow-cta-hover: 0 20px 34px rgba(44, 153, 255, 0.35);

    --home-space-1: 0.5rem;
    --home-space-2: 0.7rem;
    --home-space-3: 1rem;

    --home-dur-fast: 180ms;
    --home-dur-med: 280ms;
    --home-dur-slow: 420ms;
    --home-ease-out: cubic-bezier(0.16, 0.84, 0.32, 1);

    position: relative;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto auto auto auto;
    gap: var(--home-space-3);
    padding: 0.95rem 0.85rem calc(7.2rem + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow: hidden;
    font-family: var(--home-font-body);
  }

  .sanctuary__bg,
  .sanctuary__noise {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .sanctuary__bg {
    z-index: 0;
    background:
      radial-gradient(120% 88% at 10% 8%, var(--home-accent-cyan), transparent 58%),
      radial-gradient(120% 90% at 86% 92%, var(--home-accent-warm), transparent 62%),
      linear-gradient(170deg, var(--home-bg-base), var(--home-bg-deep) 62%);
    animation: drift 16s ease-in-out infinite alternate;
  }

  .sanctuary__noise {
    z-index: 1;
    opacity: 0.08;
    mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.78' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.65'/%3E%3C/svg%3E");
  }

  .sanctuary > :global(*) {
    position: relative;
    z-index: 2;
  }

  .sanctuary__hint {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: var(--home-space-2);
    border: 1px solid rgba(144, 177, 214, 0.35);
    border-radius: var(--home-radius-md);
    padding: 0.62rem 0.72rem;
    background: var(--home-bg-glass);
    backdrop-filter: blur(4px);
  }

  .sanctuary__hint p {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.25;
    color: var(--home-text-primary);
  }

  .sanctuary__hint button {
    border: 1px solid rgba(149, 189, 233, 0.45);
    border-radius: var(--home-radius-sm);
    background: rgba(15, 24, 49, 0.86);
    color: rgba(227, 239, 255, 0.92);
    min-height: 2rem;
    padding: 0 0.6rem;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .status h1 {
    margin: 0;
    font-family: var(--home-font-display);
    font-size: clamp(1.35rem, 4.4vw, 2.05rem);
    line-height: 1.08;
    letter-spacing: -0.01em;
    color: var(--home-text-primary);
  }

  .status p {
    margin: 0.38rem 0 0;
    color: var(--home-text-secondary);
    font-size: 0.9rem;
    line-height: 1.35;
  }

  .status__pill {
    display: inline-flex;
    margin-top: 0.62rem;
    padding: 0.25rem 0.56rem;
    border-radius: 999px;
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    border: 1px solid transparent;
  }

  .status__pill--distant {
    color: var(--home-state-distant-fg);
    border-color: var(--home-state-distant-border);
    background: var(--home-state-distant-bg);
  }

  .status__pill--near {
    color: var(--home-state-near-fg);
    border-color: var(--home-state-near-border);
    background: var(--home-state-near-bg);
  }

  .status__pill--resonant {
    color: var(--home-state-resonant-fg);
    border-color: var(--home-state-resonant-border);
    background: var(--home-state-resonant-bg);
  }

  .primary {
    display: grid;
    gap: var(--home-space-1);
  }

  .primary__button {
    min-height: 3.2rem;
    border: none;
    border-radius: var(--home-radius-lg);
    background: linear-gradient(135deg, var(--home-cta-start), var(--home-cta-end));
    color: var(--home-cta-text);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    box-shadow: var(--home-shadow-cta);
    transition: transform var(--home-dur-med) var(--home-ease-out), box-shadow var(--home-dur-med) var(--home-ease-out);
  }

  .primary__button:hover,
  .primary__button:focus-visible {
    transform: translateY(-1px);
    box-shadow: var(--home-shadow-cta-hover);
    outline: none;
  }

  .primary__button--pulse {
    animation: ctaPulse 2.8s ease-in-out infinite;
  }

  .primary p {
    margin: 0;
    color: var(--home-text-tertiary);
    font-size: 0.8rem;
  }

  @media (min-width: 900px) {
    .sanctuary {
      max-width: 56rem;
      margin: 0 auto;
      padding: 1.2rem 1.15rem 4.3rem;
      gap: calc(var(--home-space-3) + 0.15rem);
    }
  }

  @keyframes ctaPulse {
    0%, 100% { transform: translateY(0); box-shadow: var(--home-shadow-cta); }
    50% { transform: translateY(-1px); box-shadow: var(--home-shadow-cta-hover); }
  }

  @keyframes drift {
    from { background-position: 0 0, 0 0, 0 0; }
    to { background-position: 24px -20px, -20px 18px, 0 0; }
  }
</style>
