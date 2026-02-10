<script lang="ts">
  import { goto } from '$app/navigation';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  type Screen = {
    title: string;
    body: string;
  };

  const screens: Screen[] = [
    {
      title: 'Welcome to Looma.',
      body: 'Looma is a place you return to, not a chatbot you have to manage.'
    },
    {
      title: 'Companions respond.',
      body: 'They react when you act. They won’t interrupt your flow.'
    },
    {
      title: 'You’re always in control.',
      body: 'Hide the dock, mute motion, or reset memory anytime.'
    }
  ];

  let step = 0;
  let dontShowAgain = false;

  const ONBOARDING_COOKIE = 'looma_onboarding_v1';
  const setOnboardingCookie = () => {
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${ONBOARDING_COOKIE}=1; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  };

  const goHome = async (persist: boolean) => {
    if (persist) {
      setOnboardingCookie();
    }
    await goto('/app/home');
  };

  const next = async () => {
    const last = step >= screens.length - 1;
    if (last) {
      // Completing the flow counts as "seen once" even if the user didn't check the box.
      await goHome(true);
      return;
    }
    step += 1;
  };

  const skip = async () => {
    await goHome(dontShowAgain);
  };

  $: active = screens[step] ?? screens[0] ?? { title: '', body: '' };
</script>

{#if data?.showOnboarding}
  <div class="onboard-root bg-neuro">
    <BackgroundStack />

    <main class="onboard-shell" aria-label="Looma onboarding">
      <section class="onboard-card panel-glass" aria-live="polite">
        <header class="onboard-header">
          <div class="dots" aria-hidden="true">
            {#each screens as _, idx (idx)}
              <span class={`dot ${idx === step ? 'is-active' : ''}`}></span>
            {/each}
          </div>
          <p class="kicker">Quick note</p>
        </header>

        <div class="copy">
          <h1>{active.title}</h1>
          <p>{active.body}</p>
        </div>

        <label class="dont-show">
          <input type="checkbox" bind:checked={dontShowAgain} />
          <span>Don’t show again</span>
        </label>

        <footer class="actions">
          <button class="btn-ghost" type="button" on:click={skip}>Skip for now</button>
          <button class="btn-primary" type="button" on:click={next}>
            {step >= screens.length - 1 ? 'Enter Looma' : 'Next'}
          </button>
        </footer>
      </section>
    </main>
  </div>
{/if}

<style>
  .onboard-root {
    min-height: 100vh;
  }

  .onboard-shell {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: clamp(1.5rem, 4vw, 3rem);
  }

  .onboard-card {
    width: min(560px, 100%);
    padding: 1.5rem 1.5rem 1.25rem;
    border-radius: 22px;
    display: grid;
    gap: 1.1rem;
  }

  .onboard-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .kicker {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.72);
  }

  .dots {
    display: inline-flex;
    gap: 0.45rem;
    align-items: center;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.2);
  }

  .dot.is-active {
    background: rgba(94, 242, 255, 0.9);
    box-shadow: 0 0 0 3px rgba(94, 242, 255, 0.18);
  }

  .copy h1 {
    margin: 0;
    font-size: clamp(1.5rem, 2.3vw, 1.9rem);
    line-height: 1.1;
    letter-spacing: -0.01em;
  }

  .copy p {
    margin: 0.5rem 0 0;
    color: rgba(226, 232, 240, 0.78);
    line-height: 1.55;
  }

  .dont-show {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    user-select: none;
    color: rgba(226, 232, 240, 0.8);
    font-size: 0.9rem;
  }

  .dont-show input {
    width: 16px;
    height: 16px;
    accent-color: rgba(94, 242, 255, 0.9);
  }

  .actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  .btn-primary,
  .btn-ghost {
    border-radius: 999px;
    padding: 0.7rem 1.2rem;
    font-weight: 600;
    border: 1px solid rgba(255, 255, 255, 0.14);
  }

  .btn-ghost {
    background: rgba(255, 255, 255, 0.06);
    color: rgba(248, 250, 255, 0.86);
  }

  .btn-ghost:hover,
  .btn-ghost:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    outline: none;
  }

  .btn-primary {
    border-color: transparent;
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.92));
    color: rgba(8, 10, 22, 0.92);
    box-shadow: 0 18px 36px rgba(94, 242, 255, 0.22);
  }

  .btn-primary:hover,
  .btn-primary:focus-visible {
    filter: brightness(1.05);
    outline: none;
  }

  @media (max-width: 420px) {
    .onboard-card {
      padding: 1.25rem 1.1rem 1.1rem;
    }

    .actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }

    .btn-primary,
    .btn-ghost {
      width: 100%;
      justify-content: center;
    }
  }
</style>
