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
    position: relative;
    min-height: 100dvh;
    display: grid;
    grid-template-rows: auto auto auto auto;
    gap: 1rem;
    padding: 0.95rem 0.85rem calc(7.2rem + env(safe-area-inset-bottom));
    box-sizing: border-box;
    overflow: hidden;
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
      radial-gradient(120% 88% at 10% 8%, rgba(96, 222, 255, 0.16), transparent 58%),
      radial-gradient(120% 90% at 86% 92%, rgba(246, 184, 114, 0.12), transparent 62%),
      linear-gradient(170deg, rgba(6, 11, 27, 0.98), rgba(4, 7, 19, 1) 62%);
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
    gap: 0.7rem;
    border: 1px solid rgba(144, 177, 214, 0.35);
    border-radius: 0.78rem;
    padding: 0.62rem 0.72rem;
    background: rgba(10, 17, 37, 0.82);
    backdrop-filter: blur(4px);
  }

  .sanctuary__hint p {
    margin: 0;
    font-size: 0.74rem;
    line-height: 1.25;
    color: rgba(223, 239, 255, 0.92);
  }

  .sanctuary__hint button {
    border: 1px solid rgba(149, 189, 233, 0.45);
    border-radius: 0.56rem;
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
    font-size: clamp(1.35rem, 4.4vw, 2.05rem);
    line-height: 1.08;
    letter-spacing: -0.01em;
    color: rgba(245, 250, 255, 0.98);
  }

  .status p {
    margin: 0.38rem 0 0;
    color: rgba(189, 208, 232, 0.88);
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
    color: rgba(201, 229, 252, 0.98);
    border-color: rgba(131, 201, 245, 0.56);
    background: rgba(12, 37, 57, 0.66);
  }

  .status__pill--near {
    color: rgba(255, 233, 196, 0.97);
    border-color: rgba(255, 199, 125, 0.6);
    background: rgba(67, 42, 11, 0.62);
  }

  .status__pill--resonant {
    color: rgba(206, 255, 228, 0.98);
    border-color: rgba(109, 233, 179, 0.56);
    background: rgba(11, 48, 32, 0.62);
  }

  .primary {
    display: grid;
    gap: 0.5rem;
  }

  .primary__button {
    min-height: 3.2rem;
    border: none;
    border-radius: 0.95rem;
    background: linear-gradient(135deg, rgba(86, 232, 220, 0.96), rgba(119, 175, 255, 0.95));
    color: rgba(6, 16, 35, 0.96);
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    box-shadow: 0 16px 30px rgba(44, 153, 255, 0.28);
  }

  .primary__button--pulse {
    animation: ctaPulse 2.8s ease-in-out infinite;
  }

  .primary p {
    margin: 0;
    color: rgba(186, 210, 237, 0.84);
    font-size: 0.8rem;
  }

  @media (min-width: 900px) {
    .sanctuary {
      max-width: 56rem;
      margin: 0 auto;
      padding: 1.2rem 1.15rem 4.3rem;
      gap: 1.15rem;
    }
  }

  @keyframes ctaPulse {
    0%, 100% { transform: translateY(0); box-shadow: 0 16px 30px rgba(44, 153, 255, 0.28); }
    50% { transform: translateY(-1px); box-shadow: 0 20px 34px rgba(44, 153, 255, 0.35); }
  }

  @keyframes drift {
    from { background-position: 0 0, 0 0, 0 0; }
    to { background-position: 24px -20px, -20px 18px, 0 0; }
  }
</style>
