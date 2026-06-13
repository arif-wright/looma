<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import MemvoyaBrand from '$lib/components/brand/MemvoyaBrand.svelte';
  import { logEvent } from '$lib/analytics';
  import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';
  import type { PageData } from './$types';
  import { resolveArchetypeConfig, type CanonicalArchetypeId, type EmotionalProfile } from '$lib/onboarding/archetypes';
  import { ONBOARDING_QUESTIONS } from '$lib/onboarding/emotionalProfile';

  export let data: PageData;

  type Choice = 'A' | 'B';
  type Question = {
    id: string;
    prompt: string;
  };
  type AnswerRecord = { id: string; choice: Choice };

  const STORAGE_KEY = 'looma_bond_answers_v2';
  const CONSENT_KEY = 'looma_bond_consent_v1';

  const questions: Question[] = ONBOARDING_QUESTIONS.map(({ id, prompt }) => ({ id, prompt }));

  const onboardingSteps = ['Your Essence', 'Your World', 'Your Companion', 'Almost There'];

  const totalQuestions = questions.length;
  const firstQuestion = questions[0];
  if (!firstQuestion) {
    throw new Error('Onboarding questions are not configured.');
  }

  const hasCompanion = data.hasCompanion ?? false;
  const spawnEligible = data.spawnEligible ?? false;
  const spawnEligibilityUnknown = data.spawnEligibilityUnknown ?? false;

  let answers: Record<string, AnswerRecord> = {};
  let consent = data.consentDefault ?? true;
  let currentIndex = 0;
  let errorMsg = '';
  let submitting = false;
  let result: {
    primaryArchetype?: CanonicalArchetypeId | string | null;
    secondaryArchetype?: CanonicalArchetypeId | string | null;
    companionSeed?: string | null;
    emotionalProfile?: EmotionalProfile | null;
    archetype?: string | null;
    summary?: Record<string, unknown> | null;
  } | null = null;
  let toast: { message: string; kind: 'info' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let reduced = false;
  let celebrate = false;
  let lastLoggedProgress = 0;
  let currentChoice: Choice | null = null;
  let currentQuestion: Question = firstQuestion;

  const emotionalSummaryCopy: Record<keyof EmotionalProfile, string> = {
    emotional_openness: 'Emotionally open',
    stability_preference: 'Steadiness seeking',
    novelty_seeking: 'Curiosity led',
    reflection_orientation: 'Reflective',
    reassurance_need: 'Reassurance responsive',
    social_energy: 'Socially energized',
    ritual_affinity: 'Ritual friendly',
    playful_activation: 'Playfully activated',
    memory_affinity: 'Memory attuned',
    gentle_reinforcement_response: 'Gentle encouragement'
  };

  $: currentQuestion = questions[currentIndex] ?? firstQuestion;
  $: answersComplete = questions.every((q) => Boolean(answers[q.id]));
  $: currentChoice = currentQuestion ? answers[currentQuestion.id]?.choice ?? null : null;
  $: stageIndex =
    currentIndex < Math.ceil(totalQuestions / 3) ? 0 : currentIndex < Math.ceil((totalQuestions * 2) / 3) ? 1 : 2;
  $: resultKey =
    typeof result?.primaryArchetype === 'string'
      ? result.primaryArchetype
      : typeof result?.archetype === 'string'
        ? result.archetype
        : 'muse';
  $: archetypeConfig = resolveArchetypeConfig(resultKey);
  $: emotionalHighlights = result?.emotionalProfile
    ? (Object.entries(result.emotionalProfile) as Array<[keyof EmotionalProfile, number]>)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];

  function showToast(message: string, kind: 'info' | 'error' = 'error') {
    if (toastTimer) clearTimeout(toastTimer);
    toast = { message, kind };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 4000);
  }

  function persistAnswers() {
    if (!browser) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.values(answers)));
    } catch {
      // Ignore storage failures.
    }
  }

  function persistConsent() {
    if (!browser) return;
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      // Ignore storage failures.
    }
  }

  function loadFromStorage() {
    if (!browser) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AnswerRecord[];
        if (Array.isArray(parsed)) {
          answers = parsed.reduce<Record<string, AnswerRecord>>((acc, entry) => {
            if (entry?.id && (entry.choice === 'A' || entry.choice === 'B')) {
              acc[entry.id] = entry;
            }
            return acc;
          }, {});
          const firstUnanswered = questions.findIndex((q) => !answers[q.id]);
          currentIndex = firstUnanswered === -1 ? totalQuestions - 1 : Math.max(firstUnanswered, 0);
        }
      }

      const consentStored = localStorage.getItem(CONSENT_KEY);
      if (consentStored !== null) {
        consent = consentStored === 'true';
      }
    } catch {
      // Ignore invalid local storage state.
    }
  }

  function handleAnswer(choice: Choice) {
    if (result) return;
    const question = currentQuestion;
    if (!question) return;

    answers = {
      ...answers,
      [question.id]: {
        id: question.id,
        choice
      }
    };
    persistAnswers();
    errorMsg = '';
  }

  function handleConsentChange(next: boolean) {
    consent = next;
    persistConsent();
    logEvent('persona_consent_changed', { consent: next });
  }

  function logProgress(nextIndex: number) {
    if (nextIndex > lastLoggedProgress) {
      lastLoggedProgress = nextIndex;
      logEvent('persona_quiz_progress', { index: nextIndex });
    }
  }

  function goPrev() {
    if (result || currentIndex === 0) return;
    currentIndex -= 1;
    errorMsg = '';
  }

  function goNext() {
    if (result) return;
    if (!currentChoice) {
      errorMsg = 'Choose the answer that feels closer to you before moving on.';
      return;
    }
    errorMsg = '';

    if (currentIndex < totalQuestions - 1) {
      currentIndex += 1;
      logProgress(currentIndex + 1);
      return;
    }

    void submitQuiz();
  }

  async function submitQuiz() {
    if (result || submitting) return;
    if (!answersComplete) {
      errorMsg = 'Please answer every question.';
      return;
    }

    submitting = true;
    errorMsg = '';
    const payloadAnswers = questions.map((q) => answers[q.id]);
    logProgress(totalQuestions);

    try {
      const res = await fetch('/api/persona/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payloadAnswers, consent })
      });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        devLog('[onboarding/companion] persona.save failed', response, { status: res.status });
        throw new Error(safeApiPayloadMessage(response, res.status));
      }

      result = {
        archetype: response?.archetype ?? null,
        primaryArchetype: response?.primaryArchetype ?? response?.archetype ?? null,
        secondaryArchetype: response?.secondaryArchetype ?? null,
        companionSeed: response?.companionSeed ?? null,
        emotionalProfile:
          response?.emotionalProfile && typeof response.emotionalProfile === 'object'
            ? response.emotionalProfile
            : null,
        summary: response?.summary && typeof response.summary === 'object' ? response.summary : null
      };
      logEvent('persona_quiz_complete', { archetype: response?.archetype ?? null });
    } catch (err) {
      devLog('[onboarding/companion] persona.save error', err);
      showToast(safeUiMessage(err));
    } finally {
      submitting = false;
    }
  }

  async function spawn() {
    if (!result || !spawnEligible) return;

    try {
      const res = await fetch('/api/persona/spawn', { method: 'POST' });
      const response = await res.json().catch(() => ({}));
      if (!res.ok) {
        devLog('[onboarding/companion] persona.spawn failed', response, { status: res.status });
        throw new Error(safeApiPayloadMessage(response, res.status));
      }

      celebrate = true;
      logEvent('companion_spawn', { archetype: response?.archetype ?? null, source: 'bond_genesis' });
      setTimeout(() => {
        window.location.href = '/app/home';
      }, 1200);
    } catch (err) {
      devLog('[onboarding/companion] persona.spawn error', err);
      showToast(safeUiMessage(err));
    }
  }

  function handleKey(event: KeyboardEvent) {
    if (result) return;
    if (event.key === 'ArrowLeft') {
      handleAnswer('A');
      event.preventDefault();
    } else if (event.key === 'ArrowRight') {
      handleAnswer('B');
      event.preventDefault();
    } else if (event.key === 'Enter' && currentChoice) {
      goNext();
      event.preventDefault();
    }
  }

  onMount(() => {
    loadFromStorage();
    if (!browser) return;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduced = query.matches;
    };
    sync();

    const listener = (event: MediaQueryListEvent) => {
      reduced = event.matches;
    };

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', listener);
    } else if (typeof query.addListener === 'function') {
      query.addListener(listener);
    }

    window.addEventListener('keydown', handleKey);

    if (data.retake) {
      logEvent('persona_quiz_retaken', { has_companion: hasCompanion });
    }

    return () => {
      if (typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', listener);
      } else if (typeof query.removeListener === 'function') {
        query.removeListener(listener);
      }
      window.removeEventListener('keydown', handleKey);
      if (toastTimer) clearTimeout(toastTimer);
    };
  });
</script>

<svelte:head>
  <title>Memvoya - First Bond</title>
</svelte:head>

<div class="bond-shell">
  <div class="scene-backdrop" class:is-reduced={reduced} aria-hidden="true"></div>
  <div class="scene-shade" aria-hidden="true"></div>

  <header class="onboarding-top">
    <MemvoyaBrand href="/app/home" size="md" ariaLabel="Memvoya home" />
    <div class="step-rail" aria-label="Onboarding progress">
      {#each onboardingSteps as step, index}
        <div class={`step ${index <= stageIndex ? 'is-active' : ''}`}>
          <span></span>
          <p>{step}</p>
        </div>
      {/each}
    </div>
    <a class="exit-link" href="/app/home">Exit Onboarding <span aria-hidden="true">X</span></a>
  </header>

  <button
    class="side-back"
    type="button"
    on:click={goPrev}
    disabled={Boolean(result) || currentIndex === 0}
    aria-label="Previous question"
  >
    ‹
  </button>

  <div class="bond-wrap">
    {#if data.retake}
      <div class="status-banner" role="status">Retaking this will update your persona without removing your companion.</div>
    {/if}

    <section class="bond-panel" aria-label="Bond quiz">
      {#if !result}
        {#key currentQuestion.id}
          <div class="question-stage" in:fly={{ y: 16, duration: 220 }}>
            <article class="question-card">
              <div class="card-orb" aria-hidden="true">✦</div>
              <p class="eyebrow">Question {currentIndex + 1} of {totalQuestions}</p>
              <h1 id={`q-${currentQuestion.id}`}>{currentQuestion.prompt}</h1>
              <p class="choice-heading">Agree or Disagree?</p>
              <fieldset role="radiogroup" aria-labelledby={`q-${currentQuestion.id}`} class="choice-grid">
                <label class={`choice-card choice-card--agree ${currentChoice === 'A' ? 'is-active' : ''}`} data-testid="quiz-choice-agree">
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="A"
                    checked={currentChoice === 'A'}
                    on:change={() => handleAnswer('A')}
                  />
                  <strong>Agree</strong>
                </label>

                <label class={`choice-card choice-card--disagree ${currentChoice === 'B' ? 'is-active' : ''}`} data-testid="quiz-choice-disagree">
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="B"
                    checked={currentChoice === 'B'}
                    on:change={() => handleAnswer('B')}
                  />
                  <strong>Disagree</strong>
                </label>
              </fieldset>
              <button class="unsure-button" type="button" on:click={() => showToast('Choose the answer that feels closest. There are no wrong answers.', 'info')}>
                Not sure
              </button>
            </article>
          </div>
        {/key}
      {:else}
        <div class="result-stage" in:fly={{ y: 16, duration: 220 }}>
          <article class="question-card result-card">
            <div class="card-orb" aria-hidden="true">✦</div>
            <p class="eyebrow">Your companion energy</p>
            <h1>{archetypeConfig.displayName}</h1>
            <p class="result-card__lede">{archetypeConfig.resultHeadline}</p>
            <p>{archetypeConfig.resultCopy}</p>

            <div class="result-grid">
              <article class="result-tile">
                <span class="result-tile__label">Emotional function</span>
                <strong>{archetypeConfig.emotionalFunction}</strong>
              </article>
              <article class="result-tile">
                <span class="result-tile__label">Companion resonance</span>
                <strong>{archetypeConfig.companionSeed}</strong>
              </article>
            </div>

            {#if emotionalHighlights.length}
              <div class="summary-grid" aria-label="Persona summary">
                {#each emotionalHighlights as [key, value]}
                  <article class="summary-chip">
                    <span>{emotionalSummaryCopy[key]}</span>
                    <strong>{Math.round(value * 100)}%</strong>
                  </article>
                {/each}
              </div>
            {/if}

            {#if hasCompanion}
              <p class="result-note">You already have a companion. Retaking updates your personalization only.</p>
            {:else if spawnEligibilityUnknown}
              <p class="result-note">We could not safely confirm your companion status. Please try again before beginning your bond.</p>
            {/if}
          </article>
        </div>
      {/if}
    </section>

    {#if toast}
      <div class={`quiz-toast quiz-toast--${toast.kind}`} role="status" aria-live="assertive">{toast.message}</div>
    {/if}
  </div>

  <footer class="bottom-bar">
    <div class="insight-note">
      <span aria-hidden="true"></span>
      <p>
        <strong>Your answers help unlock insights</strong>
        There are no right or wrong answers. Just be honest with yourself.
      </p>
    </div>

    {#if !result}
      <div class="bottom-actions">
        {#if errorMsg}
          <p class="inline-error" aria-live="assertive">{errorMsg}</p>
        {/if}
        <button
          class="nav-button nav-button--primary"
          type="button"
          on:click={goNext}
          disabled={submitting}
          aria-busy={submitting}
          data-testid="quiz-next"
        >
          {currentIndex === totalQuestions - 1 ? (submitting ? 'Reading your bond...' : 'Reveal my match') : 'Next Question'}
          <span aria-hidden="true">→</span>
        </button>
      </div>
    {:else}
      <div class="bottom-actions">
        <button
          class="nav-button nav-button--primary"
          type="button"
          on:click={spawn}
          disabled={!spawnEligible}
          data-testid="quiz-spawn"
        >
          Begin your bond
          <span aria-hidden="true">→</span>
        </button>
        <a class="nav-button" href="/app/home">Return home</a>
      </div>
    {/if}
  </footer>

  {#if celebrate}
    <div class="celebrate-burst" aria-hidden="true"></div>
  {/if}
</div>

<style>
  :global(body) {
    background: #05040d;
  }

  .bond-shell {
    position: relative;
    min-height: 100vh;
    overflow: hidden;
    color: rgba(250, 244, 232, 0.96);
  }

  .scene-backdrop,
  .scene-shade {
    position: fixed;
    inset: 0;
  }

  .scene-backdrop {
    z-index: 0;
    background-image: url('/assets/default_background.png');
    background-size: cover;
    background-position: center;
    transform: scale(1.02);
  }

  .scene-backdrop.is-reduced {
    transform: none;
  }

  .scene-shade {
    z-index: 1;
    background:
      linear-gradient(180deg, rgba(5, 4, 13, 0.22) 0%, rgba(5, 4, 13, 0.18) 48%, rgba(5, 4, 13, 0.88) 100%),
      radial-gradient(circle at 50% 45%, rgba(92, 43, 168, 0.08), rgba(5, 4, 13, 0.54) 72%);
  }

  .onboarding-top {
    position: relative;
    z-index: 3;
    width: min(92rem, calc(100vw - 2rem));
    margin: 0 auto;
    min-height: 6.4rem;
    display: grid;
    grid-template-columns: auto minmax(20rem, 42rem) auto;
    align-items: start;
    gap: 2rem;
    padding-top: 1.6rem;
  }

  .exit-link {
    color: inherit;
    text-decoration: none;
  }

  .step-rail {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0;
    padding-top: 0.5rem;
  }

  .step {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.72rem;
    color: rgba(218, 209, 229, 0.48);
    font-size: 0.88rem;
  }

  .step::before {
    content: '';
    position: absolute;
    top: 0.47rem;
    left: calc(-50% + 0.7rem);
    width: calc(100% - 1.4rem);
    height: 1px;
    background: rgba(222, 206, 244, 0.22);
  }

  .step:first-child::before {
    display: none;
  }

  .step span {
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 999px;
    background: rgba(178, 170, 198, 0.36);
    border: 1px solid rgba(230, 219, 255, 0.18);
  }

  .step.is-active {
    color: rgba(250, 244, 232, 0.96);
  }

  .step.is-active span {
    background: #914cff;
    box-shadow: 0 0 0 3px rgba(145, 76, 255, 0.24), 0 0 18px rgba(178, 97, 255, 0.72);
    border-color: rgba(241, 223, 255, 0.76);
  }

  .step p,
  p,
  h1 {
    margin: 0;
  }

  .exit-link {
    justify-self: end;
    min-height: 2.65rem;
    padding: 0 1.05rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 236, 196, 0.22);
    display: inline-flex;
    align-items: center;
    gap: 0.7rem;
    background: rgba(5, 4, 13, 0.44);
    color: rgba(250, 244, 232, 0.82);
    font-size: 0.92rem;
  }

  .side-back {
    position: fixed;
    z-index: 4;
    left: 3rem;
    top: 51%;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 236, 196, 0.32);
    background: rgba(5, 4, 13, 0.42);
    color: rgba(250, 244, 232, 0.96);
    font-size: 2.65rem;
    line-height: 1;
    cursor: pointer;
  }

  .side-back:disabled {
    opacity: 0.42;
    cursor: not-allowed;
  }

  .bond-wrap {
    position: relative;
    z-index: 2;
    width: min(42rem, calc(100vw - 2rem));
    margin: 0 auto;
    min-height: calc(100vh - 13.8rem);
    display: grid;
    align-items: center;
  }

  .status-banner {
    align-self: start;
    border-radius: 999px;
    border: 1px solid rgba(255, 211, 122, 0.24);
    background: rgba(18, 10, 38, 0.72);
    color: rgba(246, 236, 215, 0.92);
    padding: 0.75rem 1rem;
    font-size: 0.88rem;
  }

  .bond-panel,
  .question-stage,
  .result-stage {
    display: grid;
  }

  .question-card {
    position: relative;
    border-radius: 1.55rem;
    border: 1px solid rgba(198, 132, 255, 0.36);
    background:
      radial-gradient(circle at 50% 100%, rgba(126, 55, 199, 0.22), transparent 54%),
      linear-gradient(180deg, rgba(20, 10, 45, 0.92), rgba(13, 8, 31, 0.94));
    box-shadow: 0 24px 70px rgba(5, 4, 13, 0.46);
    padding: 4.7rem 3.2rem 2.55rem;
    text-align: center;
  }

  .card-orb {
    position: absolute;
    top: -2.05rem;
    left: 50%;
    transform: translateX(-50%);
    width: 4.2rem;
    height: 4.2rem;
    border-radius: 999px;
    border: 1px solid rgba(190, 135, 255, 0.86);
    background: radial-gradient(circle, rgba(119, 58, 206, 0.9), rgba(33, 17, 72, 0.96));
    display: grid;
    place-items: center;
    color: rgba(246, 226, 255, 0.98);
    font-size: 1.45rem;
    box-shadow: 0 0 32px rgba(145, 76, 255, 0.36);
  }

  .eyebrow {
    color: rgba(190, 135, 255, 0.95);
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  h1 {
    margin-top: 1.15rem;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 3.4rem;
    line-height: 1.05;
    letter-spacing: 0;
    color: rgba(250, 244, 232, 0.98);
  }

  .question-card h1::first-letter {
    color: #ffd37a;
  }

  .choice-heading {
    margin-top: 1.5rem;
    color: rgba(230, 221, 208, 0.86);
    font-size: 1.55rem;
    font-weight: 800;
  }

  .choice-grid {
    margin: 1.8rem 0 0;
    border: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.15rem;
  }

  .choice-card {
    position: relative;
    min-height: 5.2rem;
    border-radius: 0.9rem;
    border: 1px solid rgba(198, 132, 255, 0.34);
    background: rgba(35, 17, 70, 0.52);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(209, 139, 255, 0.98);
    cursor: pointer;
  }

  .choice-card--disagree {
    border-color: rgba(255, 151, 132, 0.36);
    background: rgba(80, 28, 45, 0.38);
    color: rgba(255, 164, 146, 0.98);
  }

  .choice-card.is-active {
    border-color: rgba(255, 211, 122, 0.8);
    box-shadow: 0 0 0 1px rgba(255, 211, 122, 0.38), 0 0 34px rgba(145, 76, 255, 0.2);
    background: rgba(75, 38, 123, 0.62);
  }

  .choice-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .choice-card strong {
    font-size: 1.35rem;
  }

  .unsure-button {
    margin: 1.8rem auto 0;
    min-width: 10.8rem;
    min-height: 2.65rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 236, 196, 0.32);
    background: rgba(5, 4, 13, 0.26);
    color: rgba(250, 244, 232, 0.82);
    font: inherit;
    cursor: pointer;
  }

  .bottom-bar {
    position: relative;
    z-index: 3;
    width: min(54rem, calc(100vw - 2rem));
    margin: 0 auto;
    min-height: 6.4rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 3rem;
    padding-bottom: 1.7rem;
  }

  .insight-note {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 1rem;
  }

  .insight-note > span {
    width: 2.6rem;
    height: 3.6rem;
    background-image: url('/assets/shard.png');
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    filter: drop-shadow(0 0 18px rgba(145, 76, 255, 0.66));
  }

  .insight-note p {
    display: grid;
    gap: 0.2rem;
    color: rgba(230, 221, 208, 0.82);
    line-height: 1.42;
  }

  .insight-note strong {
    color: #ffd37a;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 1.22rem;
    font-weight: 700;
  }

  .bottom-actions {
    display: grid;
    justify-items: end;
    gap: 0.55rem;
  }

  .nav-button {
    min-height: 4.1rem;
    min-width: 18.6rem;
    padding: 0 1.45rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 220, 151, 0.24);
    background: rgba(8, 6, 19, 0.42);
    color: rgba(250, 244, 232, 0.95);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 1.4rem;
    font-size: 1.04rem;
    font-weight: 800;
    cursor: pointer;
  }

  .nav-button:disabled {
    opacity: 0.58;
    cursor: not-allowed;
  }

  .nav-button--primary {
    background: linear-gradient(135deg, #ffd37a, #d99a39);
    color: #170e05;
    box-shadow: 0 12px 32px rgba(217, 154, 57, 0.24);
  }

  .inline-error {
    color: #ffb2bc;
    font-size: 0.86rem;
    text-align: right;
  }

  .result-card {
    text-align: left;
  }

  .result-card h1 {
    text-transform: capitalize;
  }

  .result-card__lede,
  .result-card p,
  .result-tile,
  .summary-chip,
  .result-note {
    color: rgba(230, 221, 208, 0.82);
    line-height: 1.5;
  }

  .result-grid,
  .summary-grid {
    margin-top: 1.1rem;
    display: grid;
    gap: 0.7rem;
  }

  .result-grid,
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .result-tile,
  .summary-chip {
    border-radius: 0.85rem;
    border: 1px solid rgba(198, 132, 255, 0.24);
    background: rgba(18, 10, 38, 0.58);
    padding: 0.9rem;
    display: grid;
    gap: 0.22rem;
  }

  .result-tile__label,
  .summary-chip span {
    color: rgba(190, 135, 255, 0.9);
    font-size: 0.7rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .result-tile strong,
  .summary-chip strong {
    color: rgba(250, 244, 232, 0.96);
  }

  .result-note {
    margin-top: 1rem;
  }

  .quiz-toast {
    position: fixed;
    left: 50%;
    bottom: calc(6.5rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-radius: 999px;
    padding: 0.65rem 1rem;
    border: 1px solid rgba(255, 211, 122, 0.24);
    background: rgba(16, 8, 34, 0.96);
    color: rgba(244, 239, 229, 0.95);
    z-index: 6;
  }

  .quiz-toast--error {
    border-color: rgba(255, 178, 188, 0.36);
  }

  .celebrate-burst {
    position: fixed;
    inset: 0;
    z-index: 5;
    pointer-events: none;
    background:
      radial-gradient(circle at 25% 35%, rgba(255, 211, 122, 0.26), transparent 12%),
      radial-gradient(circle at 70% 28%, rgba(190, 135, 255, 0.22), transparent 12%),
      radial-gradient(circle at 58% 70%, rgba(255, 211, 122, 0.18), transparent 14%);
    animation: fadeBurst 1.1s ease forwards;
  }

  @keyframes fadeBurst {
    0% {
      opacity: 0;
      transform: scale(0.98);
    }
    25% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: scale(1.04);
    }
  }

  @media (max-width: 900px) {
    .onboarding-top {
      grid-template-columns: 1fr auto;
      min-height: auto;
      gap: 1rem;
    }

    .step-rail {
      grid-column: 1 / -1;
      order: 3;
    }

    .exit-link {
      min-height: 2.35rem;
      font-size: 0.82rem;
    }

    .side-back {
      display: none;
    }

    .bond-wrap {
      min-height: auto;
      padding: 4.4rem 0 1.2rem;
    }

    .question-card {
      padding: 3.6rem 1.1rem 1.35rem;
    }

    h1 {
      font-size: 2.45rem;
    }

    .choice-grid,
    .result-grid,
    .summary-grid,
    .bottom-bar {
      grid-template-columns: 1fr;
    }

    .bottom-bar {
      gap: 1rem;
      padding-bottom: 1.1rem;
    }

    .bottom-actions,
    .nav-button {
      width: 100%;
      justify-items: stretch;
    }

    .nav-button {
      min-width: 0;
    }

    .inline-error {
      text-align: left;
    }
  }
</style>
