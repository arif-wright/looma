<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onMount } from 'svelte';
  import type { MuseAnimationName } from '$lib/companions/museAnimations';
  import CompanionHero from '$lib/components/home/CompanionHero.svelte';

  export let companionName = 'Mirae';
  export let companionAvatarUrl: string | null = null;
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';
  export let statusLine = 'Mirae feels distant.';
  export let statusReason = "She hasn't heard from you today.";
  export let primaryLabel = 'Reconnect (30 sec)';
  export let primaryCopy = 'A quick check-in to bring Mirae closer.';
  export let needsReconnectToday = false;
  export let companionReply: string | null = null;
  export let companionReplyDebug: string | null = null;
  export let modelActivity: 'idle' | 'attending' | 'composing' | 'responding' = 'idle';
  export let modelAnimation: MuseAnimationName = 'Idle';

  const dispatch = createEventDispatcher<{
    primary: Record<string, never>;
    companion: Record<string, never>;
  }>();

  const ONBOARDING_KEY = 'looma:homeSanctuaryHintDismissed:v1';
  let showHint = false;

  $: supportiveLine =
    (companionReply && companionReply.trim()) ||
    (closenessState === 'Distant'
      ? "Take one slow breath. I'm here with you."
      : closenessState === 'Resonant'
        ? "You're in sync right now. Stay in this moment."
        : "I'm listening. Share what's on your mind.");

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
  <div class="bg base" aria-hidden="true"></div>
  <div class="bg chroma" aria-hidden="true"></div>
  <div class="bg drift" aria-hidden="true"></div>
  <div class="bg stars" aria-hidden="true"></div>
  <div class="bg noise" aria-hidden="true"></div>

  {#if showHint}
    <aside class="hint" role="status">
      <p>Start with Reconnect. Then explore Circles, Games, and Messages.</p>
      <button type="button" on:click={dismissHint} aria-label="Dismiss hint">Dismiss</button>
    </aside>
  {/if}

  <main class="stage" aria-label="Companion home">
    <div class="hero-wrap">
      <CompanionHero
        name={companionName}
        avatarUrl={companionAvatarUrl}
        {closenessState}
        activityState={modelActivity}
        animationName={modelAnimation}
        on:open={() => dispatch('companion', {})}
      />
    </div>

    <section class="dialogue" aria-live="polite">
      <p class="bubble bubble--user">{statusReason}</p>
      <div class="bubble-group">
        <p class="bubble bubble--companion">{supportiveLine}</p>
        {#if companionReplyDebug}
          <p class="reply-debug">{companionReplyDebug}</p>
        {/if}
      </div>
    </section>

    <section class="focus">
      <h1>{statusLine}</h1>
      <button
        type="button"
        class={`reflect ${needsReconnectToday ? 'reflect--pulse' : ''}`}
        on:click={() => dispatch('primary', {})}
      >{primaryLabel}</button>
      <p>{primaryCopy}</p>
    </section>
  </main>

</section>

<style>
  .sanctuary {
    --home-font-display: 'Fraunces', 'Iowan Old Style', 'Times New Roman', serif;
    --home-font-body: 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif;

    position: relative;
    min-height: 100dvh;
    overflow: hidden;
    padding: max(0.95rem, env(safe-area-inset-top)) 0.9rem calc(1.4rem + env(safe-area-inset-bottom));
    color: rgba(244, 244, 248, 0.96);
    font-family: var(--home-font-body);
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 1rem;
  }

  .bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .base {
    z-index: 0;
    background:
      radial-gradient(80% 65% at 85% 14%, rgba(140, 236, 236, 0.33), transparent 72%),
      radial-gradient(80% 70% at 12% 90%, rgba(255, 189, 142, 0.36), transparent 74%),
      linear-gradient(160deg, rgba(26, 42, 122, 0.98), rgba(47, 70, 153, 0.94) 36%, rgba(102, 79, 152, 0.88) 66%, rgba(218, 161, 127, 0.76));
  }

  .chroma {
    z-index: 1;
    mix-blend-mode: soft-light;
    opacity: 0.46;
    background:
      radial-gradient(65% 50% at 20% 24%, rgba(72, 220, 215, 0.42), transparent 72%),
      radial-gradient(60% 48% at 74% 74%, rgba(255, 177, 136, 0.42), transparent 68%),
      radial-gradient(50% 40% at 52% 44%, rgba(92, 77, 178, 0.36), transparent 64%);
  }

  .drift {
    z-index: 2;
    opacity: 0.38;
    filter: blur(22px);
    background:
      radial-gradient(46% 30% at 30% 28%, rgba(91, 212, 202, 0.5), transparent 78%),
      radial-gradient(42% 30% at 68% 54%, rgba(118, 97, 205, 0.4), transparent 72%),
      radial-gradient(44% 32% at 56% 84%, rgba(253, 176, 121, 0.4), transparent 80%);
    animation: cloudDrift 18s cubic-bezier(0.32, 0.03, 0.16, 0.99) infinite alternate;
  }

  .stars {
    z-index: 3;
    opacity: 0.26;
    background-image:
      radial-gradient(circle at 12% 21%, rgba(255, 244, 215, 0.55) 0.18rem, transparent 0.25rem),
      radial-gradient(circle at 74% 31%, rgba(255, 243, 222, 0.48) 0.14rem, transparent 0.24rem),
      radial-gradient(circle at 58% 83%, rgba(255, 238, 199, 0.44) 0.12rem, transparent 0.22rem),
      radial-gradient(circle at 83% 66%, rgba(255, 241, 214, 0.42) 0.14rem, transparent 0.23rem),
      radial-gradient(circle at 24% 72%, rgba(255, 247, 226, 0.38) 0.12rem, transparent 0.2rem);
    filter: blur(0.7px);
  }

  .noise {
    z-index: 4;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.76' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.72'/%3E%3C/svg%3E");
  }

  .hint,
  .stage {
    position: relative;
    z-index: 5;
  }

  .hint {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.55rem;
    align-items: center;
    border-radius: 0.9rem;
    border: 1px solid rgba(223, 231, 246, 0.25);
    background: rgba(20, 29, 72, 0.46);
    backdrop-filter: blur(12px);
    padding: 0.62rem 0.72rem;
  }

  .hint p {
    margin: 0;
    font-size: 0.72rem;
    line-height: 1.3;
    color: rgba(236, 240, 247, 0.95);
  }

  .hint button {
    min-height: 1.9rem;
    border-radius: 999px;
    border: 1px solid rgba(225, 233, 247, 0.38);
    background: rgba(16, 24, 62, 0.7);
    color: rgba(238, 242, 250, 0.9);
    padding: 0 0.66rem;
    text-transform: uppercase;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
  }

  .stage {
    display: grid;
    grid-template-rows: minmax(14rem, auto) auto auto;
    align-content: stretch;
    justify-items: center;
    gap: clamp(1.1rem, 3vh, 2rem);
    min-height: calc(100dvh - 5.5rem);
    padding-top: clamp(0.5rem, 4vh, 2.4rem);
    padding-bottom: clamp(1rem, 6vh, 3.8rem);
  }

  .hero-wrap {
    width: 100%;
    display: grid;
    justify-items: center;
    align-self: start;
  }

  .dialogue {
    width: min(100%, 36rem);
    display: grid;
    gap: 0.82rem;
    align-self: center;
  }

  .bubble {
    margin: 0;
    max-width: min(82%, 24rem);
    border: 1px solid rgba(224, 233, 247, 0.16);
    border-radius: 1rem;
    padding: 0.72rem 0.84rem;
    font-size: 0.83rem;
    line-height: 1.35;
    backdrop-filter: blur(12px);
  }

  .bubble--user {
    justify-self: start;
    background: rgba(88, 175, 191, 0.3);
    color: rgba(241, 248, 252, 0.92);
  }

  .bubble--companion {
    justify-self: end;
    background: rgba(118, 97, 173, 0.34);
    color: rgba(244, 236, 250, 0.92);
  }

  .bubble-group {
    justify-self: end;
    display: grid;
    gap: 0.25rem;
    justify-items: end;
  }

  .reply-debug {
    margin: 0;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(216, 230, 248, 0.72);
  }

  .focus {
    width: min(100%, 24rem);
    display: grid;
    justify-items: center;
    gap: 0.58rem;
    text-align: center;
    align-self: end;
  }

  .focus h1 {
    margin: 0;
    font-family: var(--home-font-display);
    font-size: clamp(1.95rem, 6vw, 3.1rem);
    line-height: 1.02;
    letter-spacing: -0.02em;
    color: rgba(249, 245, 233, 0.98);
    text-shadow: 0 8px 24px rgba(30, 26, 71, 0.34);
  }

  .reflect {
    width: min(100%, 17.5rem);
    min-height: 2.95rem;
    border: 1px solid rgba(228, 237, 248, 0.34);
    border-radius: 999px;
    background: linear-gradient(145deg, rgba(29, 42, 101, 0.55), rgba(16, 26, 64, 0.76));
    color: rgba(243, 247, 253, 0.95);
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    backdrop-filter: blur(14px);
    transition: transform 220ms cubic-bezier(0.2, 0.82, 0.24, 1), border-color 220ms cubic-bezier(0.2, 0.82, 0.24, 1);
  }

  .reflect:hover,
  .reflect:focus-visible {
    transform: translateY(-1px);
    border-color: rgba(241, 246, 253, 0.62);
    outline: none;
  }

  .reflect--pulse {
    animation: pulse 2.9s ease-in-out infinite;
  }

  .focus p {
    margin: 0;
    color: rgba(233, 238, 247, 0.84);
    font-size: 0.78rem;
  }

  @media (min-width: 900px) {
    .sanctuary {
      gap: 1.1rem;
      padding: max(1.1rem, env(safe-area-inset-top)) 1.35rem calc(1.8rem + env(safe-area-inset-bottom));
    }

    .stage {
      gap: clamp(1.5rem, 3.8vh, 2.9rem);
      min-height: calc(100dvh - 6.2rem);
      padding-top: clamp(1rem, 8vh, 4.5rem);
      padding-bottom: clamp(1.1rem, 8vh, 4.2rem);
    }

    .dialogue {
      width: min(100%, 50rem);
      grid-template-columns: 1fr 1fr;
      gap: 1.2rem;
      align-items: end;
    }

    .bubble {
      max-width: 100%;
      font-size: 0.9rem;
    }

    .bubble--companion {
      margin-top: 2.3rem;
    }

    .focus {
      width: min(100%, 28rem);
      gap: 0.58rem;
    }

    .focus h1 {
      font-size: clamp(2.1rem, 4.2vw, 3.8rem);
    }
  }

  @keyframes cloudDrift {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      transform: translate3d(-2.5%, -2.2%, 0);
    }
  }

  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 rgba(137, 198, 255, 0);
    }
    50% {
      box-shadow: 0 0 0.95rem rgba(137, 198, 255, 0.38);
    }
  }
</style>
