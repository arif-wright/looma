<script lang="ts">
  import { browser } from '$app/environment';
  import { createEventDispatcher, onMount } from 'svelte';
  import type { MuseAnimationName } from '$lib/companions/museAnimations';
  import CompanionHero from '$lib/components/home/CompanionHero.svelte';

  type KeepsakeTone = 'care' | 'social' | 'mission' | 'play' | 'bond';
  type KeepsakeTheme = { tone: KeepsakeTone; title: string } | null;
  type PremiumStyle = 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk';
  type TimeSlice = 'dawn' | 'day' | 'dusk' | 'night';

  export let companionName = 'Mirae';
  export let companionAvatarUrl: string | null = null;
  export let keepsakeTheme: KeepsakeTheme = null;
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
  export let subscriptionActive = false;
  export let subscriptionLabel = 'Sanctuary+';
  export let premiumAccentLabel: string | null = null;
  export let premiumStyle: PremiumStyle | null = null;

  const dispatch = createEventDispatcher<{
    primary: Record<string, never>;
    companion: Record<string, never>;
  }>();

  const ONBOARDING_KEY = 'looma:homeSanctuaryHintDismissed:v1';
  let showHint = false;
  let timeSlice: TimeSlice = 'dusk';

  const resolveTimeSlice = (): TimeSlice => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 10) return 'dawn';
    if (hour >= 10 && hour < 17) return 'day';
    if (hour >= 17 && hour < 21) return 'dusk';
    return 'night';
  };

  $: supportiveLine =
    (companionReply && companionReply.trim()) ||
    (closenessState === 'Distant'
      ? "I've been waiting in our sanctuary. Come a little closer."
      : closenessState === 'Resonant'
        ? 'The sanctuary feels bright with you here. Stay for a moment.'
        : "I'm here in our little world. Tell me how you're arriving.");
  $: sanctuaryTone = keepsakeTheme?.tone ?? 'bond';
  $: auraLabel = keepsakeTheme ? `Keepsake aura: ${keepsakeTheme.title}` : null;
  $: premiumLabel = subscriptionActive ? premiumAccentLabel ?? `${subscriptionLabel} resonance` : null;
  $: habitatName =
    sanctuaryTone === 'care'
      ? 'Lantern Meadow'
      : sanctuaryTone === 'social'
        ? 'Gathering Grove'
        : sanctuaryTone === 'mission'
          ? 'Wayfinder Terrace'
          : sanctuaryTone === 'play'
            ? 'Brightbloom Clearing'
            : 'Whisper Garden';
  $: habitatLine =
    sanctuaryTone === 'care'
      ? `${companionName} is resting in a quiet grove built for repeated care.`
      : sanctuaryTone === 'social'
        ? `${companionName} is moving through a warmer, more connected pocket world today.`
        : sanctuaryTone === 'mission'
          ? `${companionName} is in a more directional habitat, ready to turn the day toward action.`
          : sanctuaryTone === 'play'
            ? `${companionName} is in a lighter clearing where motion and play are easy to start.`
            : `${companionName} is holding close in a softer sanctuary shaped by memory and bond.`;
  $: presenceLine =
    modelActivity === 'responding'
      ? `${companionName} is turning toward you now.`
      : closenessState === 'Distant'
        ? `${companionName} is drifting near the edge of the garden.`
        : closenessState === 'Resonant'
          ? `${companionName} is glowing openly in the center of the habitat.`
          : `${companionName} is waiting for you in the sanctuary.`;
  $: timeLabel =
    timeSlice === 'dawn'
      ? 'Early light'
      : timeSlice === 'day'
        ? 'Open sky'
        : timeSlice === 'dusk'
          ? 'Evening glow'
          : 'Night hush';
  $: stagePrompt =
    needsReconnectToday
      ? `${companionName} looks ready for a return.`
      : `${companionName} is already moving through the habitat.`;

  const dismissHint = () => {
    showHint = false;
    if (browser) window.localStorage.setItem(ONBOARDING_KEY, 'true');
  };

  onMount(() => {
    timeSlice = resolveTimeSlice();
    if (!browser) return;
    showHint = window.localStorage.getItem(ONBOARDING_KEY) !== 'true';
  });
</script>

<section
  class="sanctuary"
  data-keepsake-tone={sanctuaryTone}
  data-premium={subscriptionActive ? 'true' : 'false'}
  data-premium-style={premiumStyle ?? 'default'}
  data-time-slice={timeSlice}
>
  <div class="bg sky" aria-hidden="true"></div>
  <div class="bg glow" aria-hidden="true"></div>
  <div class="bg canopy" aria-hidden="true"></div>
  <div class="bg peaks" aria-hidden="true"></div>
  <div class="bg drift" aria-hidden="true"></div>
  <div class="bg fireflies" aria-hidden="true"></div>
  <div class="bg premium" aria-hidden="true"></div>
  <div class="bg grain" aria-hidden="true"></div>

  {#if showHint}
    <aside class="hint" role="status">
      <p>Start by checking on your companion. The sanctuary is the place to return to first.</p>
      <button type="button" on:click={dismissHint} aria-label="Dismiss hint">Dismiss</button>
    </aside>
  {/if}

  <main class="stage" aria-label="Companion sanctuary">
    <header class="sanctuary-head">
      <div class="sanctuary-head__copy">
        <span class="eyebrow">Sanctuary</span>
        <h1>{habitatName}</h1>
        <p>{habitatLine}</p>
      </div>

      <div class="sanctuary-chips">
        <span class="chip">{timeLabel}</span>
        <span class="chip chip--presence">{presenceLine}</span>
        {#if premiumLabel}
          <span class="chip chip--premium">{subscriptionLabel}</span>
        {/if}
      </div>
    </header>

    <div class="scene" aria-label={`${companionName}'s habitat`}>
      <div class="scene__orb scene__orb--left" aria-hidden="true"></div>
      <div class="scene__orb scene__orb--right" aria-hidden="true"></div>
      <div class="scene__flora scene__flora--left" aria-hidden="true"></div>
      <div class="scene__flora scene__flora--right" aria-hidden="true"></div>
      <div class="scene__ground scene__ground--back" aria-hidden="true"></div>
      <div class="scene__anchor" aria-hidden="true">
        <div class="scene__anchor-ring"></div>
        <div class="scene__anchor-stone"></div>
        <div class="scene__anchor-grass"></div>
      </div>

      <div class="hero-wrap">
        {#if auraLabel}
          <div class="keepsake-aura" role="status">
            <span class="keepsake-aura__label">Keepsake aura</span>
            <strong>{keepsakeTheme?.title}</strong>
          </div>
        {/if}

        <CompanionHero
          name={companionName}
          avatarUrl={companionAvatarUrl}
          {closenessState}
          activityState={modelActivity}
          animationName={modelAnimation}
          on:open={() => dispatch('companion', {})}
        />

        <div class="scene__caption">
          <strong>{stagePrompt}</strong>
          <span>{statusLine}</span>
        </div>
      </div>

      <div class="scene__ground scene__ground--front" aria-hidden="true"></div>
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
      <div class="focus__copy">
        <span class="eyebrow">Return</span>
        <h2>{primaryLabel}</h2>
        <p>{primaryCopy}</p>
      </div>
      <button
        type="button"
        class={`reflect ${needsReconnectToday ? 'reflect--pulse' : ''}`}
        on:click={() => dispatch('primary', {})}
      >
        {needsReconnectToday ? 'Check in now' : 'Stay with your companion'}
      </button>
    </section>
  </main>
</section>

<style>
  .sanctuary {
    --home-font-display: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    --home-font-body: 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif;

    position: relative;
    min-height: 100dvh;
    overflow: hidden;
    padding: max(0.95rem, env(safe-area-inset-top)) 0.9rem calc(1.5rem + env(safe-area-inset-bottom));
    color: rgba(248, 244, 235, 0.98);
    font-family: var(--home-font-body);
  }

  .bg,
  .scene__orb,
  .scene__flora,
  .scene__ground,
  .scene__anchor {
    pointer-events: none;
  }

  .bg {
    position: absolute;
    inset: 0;
  }

  .sky {
    z-index: 0;
    background:
      radial-gradient(80% 65% at 78% 16%, rgba(255, 219, 167, 0.34), transparent 72%),
      radial-gradient(88% 70% at 10% 88%, rgba(117, 164, 206, 0.24), transparent 74%),
      linear-gradient(180deg, rgba(12, 20, 39, 0.98) 0%, rgba(20, 35, 60, 0.96) 34%, rgba(44, 66, 84, 0.94) 60%, rgba(41, 55, 46, 0.96) 100%);
  }

  .sanctuary[data-time-slice='dawn'] .sky {
    background:
      radial-gradient(80% 65% at 78% 16%, rgba(255, 222, 174, 0.4), transparent 72%),
      radial-gradient(88% 70% at 10% 88%, rgba(161, 202, 225, 0.28), transparent 74%),
      linear-gradient(180deg, rgba(45, 48, 83, 0.98) 0%, rgba(93, 88, 136, 0.94) 28%, rgba(202, 153, 126, 0.86) 64%, rgba(92, 102, 74, 0.94) 100%);
  }

  .sanctuary[data-time-slice='day'] .sky {
    background:
      radial-gradient(72% 58% at 78% 16%, rgba(255, 246, 204, 0.3), transparent 72%),
      radial-gradient(88% 70% at 10% 88%, rgba(164, 224, 231, 0.22), transparent 74%),
      linear-gradient(180deg, rgba(76, 137, 174, 0.96) 0%, rgba(113, 164, 172, 0.92) 42%, rgba(126, 167, 129, 0.92) 100%);
  }

  .sanctuary[data-time-slice='night'] .sky {
    background:
      radial-gradient(70% 54% at 78% 16%, rgba(183, 198, 241, 0.2), transparent 72%),
      radial-gradient(88% 70% at 10% 88%, rgba(76, 116, 174, 0.2), transparent 74%),
      linear-gradient(180deg, rgba(8, 13, 26, 0.98) 0%, rgba(12, 20, 38, 0.96) 38%, rgba(20, 31, 40, 0.96) 100%);
  }

  .glow {
    z-index: 1;
    opacity: 0.5;
    mix-blend-mode: screen;
    background:
      radial-gradient(55% 38% at 20% 22%, rgba(112, 212, 202, 0.28), transparent 72%),
      radial-gradient(44% 36% at 82% 28%, rgba(255, 193, 144, 0.24), transparent 74%),
      radial-gradient(38% 30% at 50% 78%, rgba(140, 121, 206, 0.18), transparent 72%);
  }

  .canopy {
    z-index: 2;
    opacity: 0.82;
    background:
      radial-gradient(55% 26% at 22% -6%, rgba(17, 44, 34, 0.84), transparent 64%),
      radial-gradient(56% 28% at 82% -4%, rgba(13, 35, 30, 0.82), transparent 66%),
      radial-gradient(40% 18% at 50% 2%, rgba(32, 59, 46, 0.52), transparent 68%);
  }

  .peaks {
    z-index: 2;
    opacity: 0.78;
    background:
      radial-gradient(70% 18% at 50% 76%, rgba(65, 84, 83, 0.66), transparent 72%),
      radial-gradient(58% 14% at 18% 80%, rgba(45, 68, 60, 0.58), transparent 72%),
      radial-gradient(50% 13% at 82% 80%, rgba(44, 61, 55, 0.54), transparent 72%);
  }

  .drift {
    z-index: 3;
    opacity: 0.26;
    filter: blur(18px);
    background:
      radial-gradient(34% 22% at 30% 40%, rgba(123, 223, 218, 0.44), transparent 76%),
      radial-gradient(32% 20% at 68% 56%, rgba(255, 194, 146, 0.3), transparent 72%),
      radial-gradient(40% 24% at 52% 68%, rgba(130, 110, 196, 0.24), transparent 74%);
    animation: cloudDrift 16s ease-in-out infinite alternate;
  }

  .fireflies {
    z-index: 4;
    opacity: 0.45;
    background-image:
      radial-gradient(circle at 18% 38%, rgba(255, 241, 208, 0.8) 0.15rem, transparent 0.22rem),
      radial-gradient(circle at 28% 62%, rgba(241, 250, 228, 0.74) 0.13rem, transparent 0.2rem),
      radial-gradient(circle at 58% 34%, rgba(255, 236, 188, 0.72) 0.14rem, transparent 0.21rem),
      radial-gradient(circle at 74% 56%, rgba(229, 255, 227, 0.68) 0.14rem, transparent 0.22rem),
      radial-gradient(circle at 82% 40%, rgba(255, 232, 199, 0.74) 0.16rem, transparent 0.22rem);
    animation: sparkle 9s ease-in-out infinite alternate;
  }

  .premium {
    z-index: 4;
    opacity: 0;
    transition: opacity 220ms ease;
    background:
      radial-gradient(44% 30% at 18% 16%, rgba(255, 243, 200, 0.18), transparent 76%),
      radial-gradient(40% 28% at 82% 22%, rgba(255, 225, 184, 0.14), transparent 76%),
      radial-gradient(30% 24% at 50% 78%, rgba(250, 240, 211, 0.12), transparent 74%);
  }

  .sanctuary[data-premium='true'] .premium {
    opacity: 1;
  }

  .sanctuary[data-premium-style='gilded_dawn'] .premium {
    background:
      radial-gradient(44% 30% at 18% 16%, rgba(255, 232, 174, 0.26), transparent 76%),
      radial-gradient(40% 28% at 82% 22%, rgba(255, 199, 126, 0.18), transparent 76%),
      radial-gradient(30% 24% at 50% 78%, rgba(255, 242, 201, 0.14), transparent 74%);
  }

  .sanctuary[data-premium-style='moon_glass'] .premium {
    background:
      radial-gradient(44% 30% at 18% 16%, rgba(219, 232, 255, 0.22), transparent 76%),
      radial-gradient(40% 28% at 82% 22%, rgba(201, 221, 255, 0.16), transparent 76%),
      radial-gradient(30% 24% at 50% 78%, rgba(235, 244, 255, 0.12), transparent 74%);
  }

  .sanctuary[data-premium-style='ember_bloom'] .premium {
    background:
      radial-gradient(44% 30% at 18% 16%, rgba(255, 211, 180, 0.24), transparent 76%),
      radial-gradient(40% 28% at 82% 22%, rgba(252, 170, 134, 0.18), transparent 76%),
      radial-gradient(30% 24% at 50% 78%, rgba(255, 230, 204, 0.12), transparent 74%);
  }

  .sanctuary[data-premium-style='tide_silk'] .premium {
    background:
      radial-gradient(44% 30% at 18% 16%, rgba(196, 239, 233, 0.24), transparent 76%),
      radial-gradient(40% 28% at 82% 22%, rgba(164, 225, 223, 0.16), transparent 76%),
      radial-gradient(30% 24% at 50% 78%, rgba(215, 246, 242, 0.12), transparent 74%);
  }

  .grain {
    z-index: 5;
    opacity: 0.08;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.76' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.72'/%3E%3C/svg%3E");
  }

  .hint,
  .stage {
    position: relative;
    z-index: 6;
  }

  .hint {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 0.55rem;
    align-items: center;
    border-radius: 0.95rem;
    border: 1px solid rgba(244, 232, 205, 0.16);
    background: rgba(15, 25, 31, 0.42);
    padding: 0.75rem 0.85rem;
    backdrop-filter: blur(14px);
  }

  .hint p,
  .hint button {
    margin: 0;
    font-size: 0.8rem;
  }

  .hint button {
    border: none;
    border-radius: 999px;
    min-height: 2rem;
    padding: 0 0.85rem;
    font-weight: 700;
    background: rgba(245, 228, 185, 0.16);
    color: inherit;
  }

  .stage {
    min-height: calc(100dvh - 2rem);
    display: grid;
    grid-template-rows: auto auto auto auto;
    gap: 0.9rem;
  }

  .sanctuary-head {
    display: grid;
    gap: 0.75rem;
  }

  .sanctuary-head__copy {
    display: grid;
    gap: 0.24rem;
  }

  .eyebrow {
    display: inline-flex;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(230, 206, 154, 0.78);
  }

  .sanctuary-head h1,
  .focus h2 {
    margin: 0;
    font-family: var(--home-font-display);
    line-height: 1.04;
  }

  .sanctuary-head h1 {
    font-size: clamp(2rem, 9vw, 3.35rem);
  }

  .sanctuary-head p,
  .focus p {
    margin: 0;
    color: rgba(233, 224, 206, 0.84);
    line-height: 1.45;
    font-size: 0.94rem;
  }

  .sanctuary-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
  }

  .chip {
    min-height: 1.9rem;
    padding: 0 0.72rem;
    border-radius: 999px;
    border: 1px solid rgba(245, 230, 193, 0.14);
    background: rgba(18, 24, 28, 0.38);
    display: inline-flex;
    align-items: center;
    font-size: 0.74rem;
    color: rgba(244, 235, 214, 0.88);
    backdrop-filter: blur(12px);
  }

  .chip--presence {
    color: rgba(212, 242, 225, 0.9);
  }

  .chip--premium {
    color: rgba(255, 229, 174, 0.92);
    border-color: rgba(255, 222, 151, 0.18);
  }

  .scene {
    position: relative;
    min-height: 24rem;
    border-radius: 2rem;
    overflow: hidden;
    border: 1px solid rgba(241, 228, 198, 0.12);
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(11, 16, 18, 0.08)),
      radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 52%);
    box-shadow:
      inset 0 1px 0 rgba(255, 244, 220, 0.08),
      0 26px 60px rgba(8, 12, 14, 0.34);
    backdrop-filter: blur(8px);
  }

  .scene__orb {
    position: absolute;
    width: 8rem;
    height: 8rem;
    border-radius: 999px;
    filter: blur(36px);
    opacity: 0.34;
  }

  .scene__orb--left {
    left: -1rem;
    top: 18%;
    background: rgba(118, 227, 208, 0.56);
  }

  .scene__orb--right {
    right: -1rem;
    top: 14%;
    background: rgba(255, 188, 144, 0.42);
  }

  .scene__flora {
    position: absolute;
    bottom: 18%;
    width: 28%;
    height: 28%;
    opacity: 0.65;
    filter: blur(0.5px);
  }

  .scene__flora--left {
    left: -2%;
    background:
      radial-gradient(54% 100% at 40% 100%, rgba(42, 70, 42, 0.9), transparent 72%),
      radial-gradient(30% 84% at 60% 100%, rgba(84, 132, 88, 0.7), transparent 70%),
      radial-gradient(22% 80% at 82% 100%, rgba(145, 190, 132, 0.46), transparent 68%);
  }

  .scene__flora--right {
    right: -2%;
    background:
      radial-gradient(54% 100% at 62% 100%, rgba(50, 74, 46, 0.88), transparent 72%),
      radial-gradient(28% 82% at 40% 100%, rgba(96, 148, 92, 0.66), transparent 70%),
      radial-gradient(18% 76% at 12% 100%, rgba(225, 190, 118, 0.3), transparent 68%);
  }

  .scene__ground {
    position: absolute;
    left: -8%;
    right: -8%;
    border-radius: 50%;
  }

  .scene__ground--back {
    bottom: 12%;
    height: 10rem;
    background:
      radial-gradient(50% 100% at 50% 40%, rgba(72, 110, 74, 0.58), transparent 72%),
      radial-gradient(70% 100% at 50% 100%, rgba(20, 35, 28, 0.72), transparent 72%);
    opacity: 0.82;
  }

  .scene__ground--front {
    bottom: -14%;
    height: 12rem;
    background:
      radial-gradient(60% 100% at 50% 10%, rgba(117, 155, 96, 0.46), transparent 70%),
      radial-gradient(75% 100% at 50% 100%, rgba(22, 36, 28, 0.94), transparent 78%);
  }

  .scene__anchor {
    position: absolute;
    left: 50%;
    bottom: 18%;
    width: min(72vw, 22rem);
    transform: translateX(-50%);
  }

  .scene__anchor-ring {
    width: 78%;
    height: 1.2rem;
    margin: 0 auto;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 231, 177, 0.34), rgba(255, 231, 177, 0.04) 72%, transparent 74%);
    filter: blur(4px);
  }

  .scene__anchor-stone {
    width: 100%;
    height: 4.5rem;
    margin-top: -0.4rem;
    border-radius: 999px;
    background:
      radial-gradient(50% 90% at 50% 26%, rgba(106, 124, 138, 0.86), rgba(57, 68, 77, 0.82) 64%, rgba(17, 21, 24, 0.92));
    box-shadow:
      inset 0 1px 0 rgba(255, 251, 240, 0.16),
      0 18px 34px rgba(7, 10, 12, 0.32);
  }

  .scene__anchor-grass {
    width: 86%;
    height: 2.8rem;
    margin: -1.2rem auto 0;
    border-radius: 999px;
    background:
      radial-gradient(50% 100% at 50% 0%, rgba(170, 209, 134, 0.44), transparent 70%),
      radial-gradient(70% 100% at 50% 100%, rgba(34, 67, 40, 0.74), transparent 72%);
    filter: blur(2px);
  }

  .hero-wrap {
    position: absolute;
    inset: auto 0 14% 0;
    z-index: 2;
    display: grid;
    justify-items: center;
    gap: 0.6rem;
  }

  .keepsake-aura {
    display: inline-grid;
    gap: 0.1rem;
    justify-items: center;
    padding: 0.52rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(241, 227, 195, 0.16);
    background: rgba(20, 24, 28, 0.38);
    backdrop-filter: blur(10px);
  }

  .keepsake-aura__label {
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(230, 206, 154, 0.72);
  }

  .keepsake-aura strong {
    font-size: 0.8rem;
    color: rgba(248, 243, 229, 0.96);
  }

  .scene__caption {
    display: grid;
    gap: 0.1rem;
    justify-items: center;
    text-align: center;
    padding: 0.7rem 0.95rem;
    border-radius: 1rem;
    background: rgba(12, 17, 19, 0.42);
    border: 1px solid rgba(243, 231, 205, 0.1);
    backdrop-filter: blur(10px);
  }

  .scene__caption strong {
    font-size: 0.88rem;
    color: rgba(248, 242, 226, 0.98);
  }

  .scene__caption span {
    font-size: 0.8rem;
    color: rgba(223, 215, 196, 0.8);
  }

  .dialogue {
    display: grid;
    gap: 0.5rem;
  }

  .bubble-group {
    display: grid;
    gap: 0.3rem;
  }

  .bubble {
    margin: 0;
    width: fit-content;
    max-width: min(100%, 28rem);
    border-radius: 1.15rem;
    padding: 0.8rem 0.95rem;
    line-height: 1.45;
    font-size: 0.9rem;
    backdrop-filter: blur(14px);
  }

  .bubble--user {
    justify-self: flex-end;
    background: rgba(246, 229, 186, 0.16);
    border: 1px solid rgba(246, 229, 186, 0.18);
    color: rgba(250, 242, 224, 0.92);
  }

  .bubble--companion {
    background: rgba(15, 25, 31, 0.44);
    border: 1px solid rgba(244, 230, 194, 0.12);
    color: rgba(242, 236, 220, 0.94);
  }

  .reply-debug {
    margin: 0 0.12rem;
    font-size: 0.72rem;
    color: rgba(222, 212, 188, 0.58);
  }

  .focus {
    display: grid;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 1.3rem;
    border: 1px solid rgba(244, 230, 195, 0.12);
    background: rgba(14, 19, 22, 0.4);
    backdrop-filter: blur(14px);
  }

  .focus__copy {
    display: grid;
    gap: 0.2rem;
  }

  .focus h2 {
    font-size: 1.18rem;
  }

  .reflect {
    min-height: 3.2rem;
    border: none;
    border-radius: 1rem;
    padding: 0 1rem;
    background: linear-gradient(135deg, rgba(238, 205, 139, 0.92), rgba(245, 176, 132, 0.9));
    color: rgba(22, 19, 17, 0.94);
    font-weight: 800;
    font-size: 0.95rem;
    box-shadow: 0 16px 34px rgba(12, 10, 8, 0.28);
  }

  .reflect--pulse {
    animation: pulseButton 2.6s ease-in-out infinite;
  }

  .sanctuary[data-keepsake-tone='care'] .scene__orb--left,
  .sanctuary[data-keepsake-tone='care'] .chip--presence {
    color: rgba(199, 244, 220, 0.9);
    background-color: rgba(91, 148, 127, 0.16);
  }

  .sanctuary[data-keepsake-tone='social'] .scene__orb--right {
    background: rgba(255, 171, 141, 0.48);
  }

  .sanctuary[data-keepsake-tone='mission'] .scene__anchor-ring {
    background: radial-gradient(circle, rgba(247, 219, 145, 0.36), rgba(247, 219, 145, 0.06) 72%, transparent 74%);
  }

  .sanctuary[data-keepsake-tone='play'] .scene__orb--left {
    background: rgba(116, 228, 224, 0.62);
  }

  .sanctuary[data-keepsake-tone='bond'] .scene__caption {
    background: rgba(24, 19, 23, 0.44);
  }

  @keyframes cloudDrift {
    0% {
      transform: translate3d(-1.5%, 0, 0) scale(1);
    }
    100% {
      transform: translate3d(1.5%, -2%, 0) scale(1.05);
    }
  }

  @keyframes sparkle {
    0%, 100% {
      opacity: 0.34;
      transform: translateY(0);
    }
    50% {
      opacity: 0.58;
      transform: translateY(-1.5%);
    }
  }

  @keyframes pulseButton {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 16px 34px rgba(12, 10, 8, 0.28);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 18px 40px rgba(255, 196, 140, 0.28);
    }
  }

  @media (min-width: 720px) {
    .sanctuary {
      padding-inline: 1.15rem;
    }

    .stage {
      max-width: 56rem;
      margin: 0 auto;
      width: 100%;
      gap: 1rem;
    }

    .sanctuary-head {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
    }

    .dialogue {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }

    .bubble--user {
      justify-self: start;
    }

    .bubble-group {
      justify-items: end;
    }

    .bubble--companion {
      justify-self: end;
    }

    .focus {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
    }
  }

  @media (max-width: 359px) {
    .scene {
      min-height: 22rem;
    }

    .hint {
      grid-template-columns: 1fr;
    }

    .chip--presence {
      width: 100%;
    }
  }
</style>
