<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import WorldBackground from '$lib/ui/WorldBackground.svelte';
  import { logEvent } from '$lib/analytics';
  import { devLog, safeApiPayloadMessage, safeUiMessage } from '$lib/utils/safeUiError';
  import type { PageData } from './$types';

  export let data: PageData;

  type Axis = 'EI' | 'NS' | 'TF' | 'JP';
  type Facet = 'empathy' | 'curiosity' | 'structure';
  type Choice = 'A' | 'B';
  type Question = {
    id: string;
    prompt: string;
    axis?: Axis;
    facet?: Facet;
  };
  type AnswerRecord = { id: string; axis?: Axis; facet?: Facet; choice: Choice };

  const STORAGE_KEY = 'looma_bond_answers_v2';
  const CONSENT_KEY = 'looma_bond_consent_v1';

  const questions: Question[] = [
    { id: 'q1', prompt: 'A quiet recharge beats a crowded victory lap.', axis: 'EI', facet: 'empathy' },
    { id: 'q2', prompt: 'You would rather explore than follow a checklist.', axis: 'JP', facet: 'curiosity' },
    { id: 'q3', prompt: 'You decide with heart as much as head.', axis: 'TF', facet: 'empathy' },
    { id: 'q4', prompt: 'You prefer clarity and routine to surprises.', axis: 'JP', facet: 'structure' },
    { id: 'q5', prompt: 'You seek patterns, not just facts.', axis: 'NS', facet: 'curiosity' },
    { id: 'q6', prompt: 'You like to keep things organized.', axis: 'JP', facet: 'structure' },
    { id: 'q7', prompt: 'People lean on you for support.', facet: 'empathy' },
    { id: 'q8', prompt: 'You get a spark from learning new tricks.', facet: 'curiosity' },
    { id: 'q9', prompt: 'You calm a room without saying much.', axis: 'EI', facet: 'structure' },
    { id: 'q10', prompt: 'You enjoy finishing things as much as starting them.', axis: 'JP' }
  ];

  const stageNotes = [
    'We are listening for how you restore and connect.',
    'Now we are sensing how you explore and decide.',
    'Last stretch. This shapes the tone of your first companion.'
  ];

  const totalQuestions = questions.length;
  const firstQuestion = questions[0];
  if (!firstQuestion) {
    throw new Error('Onboarding questions are not configured.');
  }

  const hasCompanion = data.hasCompanion ?? false;

  let answers: Record<string, AnswerRecord> = {};
  let consent = data.consentDefault ?? true;
  let currentIndex = 0;
  let errorMsg = '';
  let submitting = false;
  let result: { archetype?: string | null; summary?: Record<string, unknown> | null } | null = null;
  let toast: { message: string; kind: 'info' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let reduced = false;
  let celebrate = false;
  let lastLoggedProgress = 0;
  let currentChoice: Choice | null = null;
  let currentQuestion: Question = firstQuestion;

  const archetypeDescriptions: Record<string, { title: string; body: string; aura: string }> = {
    harmonizer: {
      title: 'A calm, relational companion',
      body: 'This bond tends toward warmth, reassurance, and emotional steadiness.',
      aura: 'Warm and steady'
    },
    sentinel: {
      title: 'A focused, watchful companion',
      body: 'This bond tends toward clarity, structure, and grounded guidance.',
      aura: 'Clear and protective'
    }
  };

  $: currentQuestion = questions[currentIndex] ?? firstQuestion;
  $: progressLabel = `${currentIndex + 1} / ${totalQuestions}`;
  $: progressPercent = ((currentIndex + 1) / totalQuestions) * 100;
  $: answersComplete = questions.every((q) => Boolean(answers[q.id]));
  $: currentChoice = currentQuestion ? answers[currentQuestion.id]?.choice ?? null : null;
  $: stageIndex =
    currentIndex < Math.ceil(totalQuestions / 3) ? 0 : currentIndex < Math.ceil((totalQuestions * 2) / 3) ? 1 : 2;
  $: stageLabel = ['Attunement', 'Signal', 'Bond'][stageIndex] ?? 'Bond';
  $: stageNote = stageNotes[stageIndex] ?? stageNotes[stageNotes.length - 1];
  $: answeredCount = Object.keys(answers).length;
  $: resultKey = typeof result?.archetype === 'string' ? result.archetype.toLowerCase() : 'harmonizer';
  $: archetypeCopy =
    archetypeDescriptions[resultKey] ?? {
      title: 'A companion tuned to your rhythm',
      body: 'This first bond will adapt to your tone, pacing, and emotional texture over time.',
      aura: 'Adaptive and present'
    };
  $: summaryEntries = result?.summary && typeof result.summary === 'object'
    ? Object.entries(result.summary)
        .filter(([, value]) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
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
        choice,
        ...(question.axis ? { axis: question.axis } : {}),
        ...(question.facet ? { facet: question.facet } : {})
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
    if (!result) return;

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
  <title>Looma - First Bond</title>
</svelte:head>

<div class="bond-shell">
  <WorldBackground intensity="medium" {reduced} />

  <div class="bond-wrap">
    {#if data.retake}
      <div class="status-banner" role="status">Retaking this will update your persona without removing your companion.</div>
    {/if}

    <section class="bond-hero panel">
      <div class="bond-hero__copy">
        <p class="eyebrow">First bond</p>
        <h1>{result ? 'Your companion is ready to take shape.' : 'Answer a few questions so Looma can meet you properly.'}</h1>
        <p class="lede">
          {result
            ? 'This is not a personality test for its own sake. It sets the tone of your first relationship inside Looma.'
            : 'This short attunement helps Looma choose the right first companion tone, rhythm, and emotional texture.'}
        </p>
      </div>

      <div class="bond-hero__stats">
        <article class="hero-stat">
          <span class="hero-stat__label">Stage</span>
          <strong>{result ? 'Reveal' : stageLabel}</strong>
          <span>{result ? 'Your archetype match is ready.' : stageNote}</span>
        </article>
        <article class="hero-stat">
          <span class="hero-stat__label">Answered</span>
          <strong>{answeredCount} of {totalQuestions}</strong>
          <span>{answersComplete ? 'You are ready for the reveal.' : 'Short, instinctive answers work best.'}</span>
        </article>
      </div>
    </section>

    <section class="bond-panel panel" aria-label="Bond quiz">
      <div class="panel-top">
        <div>
          <p class="eyebrow">Attunement</p>
          <h2>{result ? `Matched: ${result.archetype ?? 'Companion'}` : `Question ${progressLabel}`}</h2>
        </div>
        {#if !result}
          <div class="progress-meta" data-testid="quiz-progress">{Math.round(progressPercent)}%</div>
        {:else}
          <div class="progress-meta progress-meta--ready">Ready</div>
        {/if}
      </div>

      {#if !result}
        <div class="progress-track" aria-label={`Progress ${progressLabel}`}>
          <span class="progress-fill" style={`width:${progressPercent}%`}></span>
        </div>

        {#key currentQuestion.id}
          <div class="question-stage" in:fly={{ y: 16, duration: 220 }}>
            <article class="question-card">
              <p class="question-card__prompt" id={`q-${currentQuestion.id}`}>{currentQuestion.prompt}</p>
              <fieldset role="radiogroup" aria-labelledby={`q-${currentQuestion.id}`} class="choice-grid">
                <label class={`choice-card ${currentChoice === 'A' ? 'is-active' : ''}`} data-testid="quiz-choice-agree">
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="A"
                    checked={currentChoice === 'A'}
                    on:change={() => handleAnswer('A')}
                  />
                  <span class="choice-card__eyebrow">Closer to me</span>
                  <strong>Agree</strong>
                  <span>This feels true more often than not.</span>
                </label>

                <label class={`choice-card ${currentChoice === 'B' ? 'is-active' : ''}`} data-testid="quiz-choice-disagree">
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="B"
                    checked={currentChoice === 'B'}
                    on:change={() => handleAnswer('B')}
                  />
                  <span class="choice-card__eyebrow">Less like me</span>
                  <strong>Disagree</strong>
                  <span>This feels less natural to how I move through things.</span>
                </label>
              </fieldset>
            </article>

            <article class="consent-card">
              <label class="consent-toggle">
                <input
                  type="checkbox"
                  checked={consent}
                  on:change={(event) =>
                    handleConsentChange((event.currentTarget as HTMLInputElement | null)?.checked ?? true)}
                  data-testid="quiz-consent-toggle"
                />
                <span>Use this summary to personalize my companion and world.</span>
              </label>
              <p>You keep control of what Looma remembers. Raw answers are not shared with AI.</p>
            </article>

            <div class="panel-actions">
              <button
                class="nav-button"
                type="button"
                on:click={goPrev}
                disabled={currentIndex === 0}
                data-testid="quiz-back"
              >
                Back
              </button>

              <div class="panel-actions__right">
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
                  {currentIndex === totalQuestions - 1 ? (submitting ? 'Reading your bond...' : 'Reveal my match') : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        {/key}
      {:else}
        <div class="result-stage" in:fly={{ y: 16, duration: 220 }}>
          <article class="result-card">
            <p class="eyebrow">Archetype</p>
            <h3>{result.archetype ?? 'Companion'}</h3>
            <p class="result-card__lede">{archetypeCopy.title}</p>
            <p>{archetypeCopy.body}</p>

            <div class="result-grid">
              <article class="result-tile">
                <span class="result-tile__label">Aura</span>
                <strong>{archetypeCopy.aura}</strong>
                <span>Your first companion will start from this tone.</span>
              </article>
              <article class="result-tile">
                <span class="result-tile__label">Bond effect</span>
                <strong>{hasCompanion ? 'Personalization only' : 'New companion unlock'}</strong>
                <span>{hasCompanion ? 'You already have a companion, so this updates the way Looma tunes itself to you.' : 'Spawning now will create your first companion bond.'}</span>
              </article>
            </div>

            {#if summaryEntries.length}
              <div class="summary-grid" aria-label="Persona summary">
                {#each summaryEntries as [key, value]}
                  <article class="summary-chip">
                    <span>{String(key).replace(/_/g, ' ')}</span>
                    <strong>{String(value)}</strong>
                  </article>
                {/each}
              </div>
            {/if}

            {#if hasCompanion}
              <p class="result-note">You already have a companion. Retaking updates your personalization only.</p>
            {/if}

            <div class="panel-actions panel-actions--result">
              <button
                class="nav-button nav-button--primary"
                type="button"
                on:click={spawn}
                disabled={hasCompanion}
                data-testid="quiz-spawn"
              >
                Begin your bond
              </button>
              <a class="nav-button" href="/app/home">Return home</a>
            </div>
          </article>
        </div>
      {/if}
    </section>

    {#if toast}
      <div class={`quiz-toast quiz-toast--${toast.kind}`} role="status" aria-live="assertive">{toast.message}</div>
    {/if}
  </div>

  {#if celebrate}
    <div class="celebrate-burst" aria-hidden="true"></div>
  {/if}
</div>

<style>
  .bond-shell {
    position: relative;
    min-height: 100vh;
    overflow: clip;
  }

  .bond-wrap {
    position: relative;
    z-index: 2;
    width: min(42rem, calc(100vw - 1.25rem));
    margin: 0 auto;
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.9rem;
    color: rgba(245, 238, 225, 0.96);
  }

  .panel {
    border-radius: 1.35rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(22, 25, 28, 0.9), rgba(10, 14, 16, 0.94)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.12), transparent 40%);
    box-shadow: 0 18px 40px rgba(6, 10, 13, 0.28);
  }

  .status-banner {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.22);
    background: rgba(39, 31, 18, 0.76);
    color: rgba(246, 236, 215, 0.92);
    padding: 0.8rem 0.9rem;
    font-size: 0.88rem;
  }

  .bond-hero,
  .bond-panel {
    padding: 1rem;
  }

  .bond-hero {
    display: grid;
    gap: 0.9rem;
  }

  .bond-hero__copy,
  .bond-hero__stats {
    display: grid;
    gap: 0.75rem;
  }

  .bond-hero__stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .eyebrow {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  h1,
  h2,
  h3,
  p {
    margin: 0;
  }

  h1 {
    font-family: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    font-size: clamp(1.85rem, 7vw, 2.8rem);
    line-height: 1.02;
    letter-spacing: -0.035em;
    max-width: 12ch;
  }

  .lede,
  .result-card p,
  .hero-stat span:last-child,
  .result-tile span:last-child {
    color: rgba(225, 214, 193, 0.82);
    line-height: 1.5;
  }

  .hero-stat,
  .question-card,
  .consent-card,
  .result-card,
  .result-tile,
  .summary-chip {
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background:
      linear-gradient(180deg, rgba(31, 25, 17, 0.62), rgba(15, 18, 20, 0.88)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 56%);
  }

  .hero-stat {
    padding: 0.85rem;
    display: grid;
    gap: 0.18rem;
  }

  .hero-stat__label,
  .result-tile__label {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.72);
  }

  .hero-stat strong,
  .result-tile strong,
  .summary-chip strong {
    color: rgba(248, 241, 227, 0.98);
    font-size: 1rem;
  }

  .panel-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
  }

  .panel-top h2 {
    margin-top: 0.16rem;
    font-size: 1.35rem;
    color: rgba(250, 244, 232, 0.98);
  }

  .progress-meta {
    min-height: 2.1rem;
    padding: 0 0.8rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(43, 33, 20, 0.22);
    color: rgba(246, 237, 218, 0.94);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .progress-meta--ready {
    background: rgba(128, 175, 148, 0.16);
    border-color: rgba(128, 175, 148, 0.24);
  }

  .progress-track {
    margin-top: 0.85rem;
    height: 0.55rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .progress-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(212, 173, 92, 0.96), rgba(128, 175, 148, 0.9));
  }

  .question-stage,
  .result-stage {
    margin-top: 0.95rem;
    display: grid;
    gap: 0.85rem;
  }

  .question-card,
  .consent-card,
  .result-card {
    padding: 0.95rem;
  }

  .question-card__prompt {
    color: rgba(250, 244, 232, 0.98);
    font-size: 1.08rem;
    line-height: 1.45;
  }

  .choice-grid {
    margin: 0.95rem 0 0;
    border: 0;
    padding: 0;
    display: grid;
    gap: 0.7rem;
  }

  .choice-card {
    position: relative;
    border-radius: 1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background: rgba(18, 20, 21, 0.72);
    padding: 0.9rem;
    display: grid;
    gap: 0.14rem;
    cursor: pointer;
  }

  .choice-card.is-active {
    border-color: rgba(214, 190, 141, 0.4);
    box-shadow: 0 0 0 1px rgba(214, 190, 141, 0.18);
    background: rgba(43, 33, 20, 0.28);
  }

  .choice-card input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .choice-card__eyebrow {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.68);
  }

  .choice-card strong {
    font-size: 1rem;
    color: rgba(249, 242, 228, 0.98);
  }

  .choice-card span:last-child {
    color: rgba(220, 209, 184, 0.8);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .consent-card {
    display: grid;
    gap: 0.55rem;
  }

  .consent-toggle {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    color: rgba(246, 237, 218, 0.95);
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .consent-toggle input {
    margin-top: 0.2rem;
  }

  .consent-card p {
    color: rgba(220, 209, 184, 0.74);
    font-size: 0.82rem;
  }

  .panel-actions {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  .panel-actions__right {
    display: grid;
    gap: 0.5rem;
    justify-items: end;
  }

  .panel-actions--result {
    margin-top: 0.95rem;
    align-items: stretch;
  }

  .nav-button {
    min-height: 2.85rem;
    padding: 0 1rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(43, 33, 20, 0.22);
    color: rgba(245, 238, 225, 0.95);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .nav-button:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .nav-button--primary {
    border-color: rgba(214, 190, 141, 0.3);
    background: linear-gradient(125deg, rgba(212, 173, 92, 0.94), rgba(166, 121, 61, 0.92));
    color: rgba(22, 16, 9, 0.96);
  }

  .inline-error {
    color: #ffb2bc;
    font-size: 0.85rem;
    text-align: right;
  }

  .result-card h3 {
    margin-top: 0.2rem;
    font-size: clamp(1.6rem, 7vw, 2.4rem);
    line-height: 1.02;
    text-transform: capitalize;
    color: rgba(250, 244, 232, 0.98);
  }

  .result-card__lede {
    margin-top: 0.3rem;
    font-size: 1rem;
    color: rgba(246, 237, 218, 0.92);
  }

  .result-grid,
  .summary-grid {
    margin-top: 0.9rem;
    display: grid;
    gap: 0.7rem;
  }

  .result-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .result-tile {
    padding: 0.85rem;
    display: grid;
    gap: 0.16rem;
  }

  .summary-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .summary-chip {
    padding: 0.75rem;
    display: grid;
    gap: 0.16rem;
  }

  .summary-chip span {
    color: rgba(215, 191, 143, 0.72);
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .result-note {
    margin-top: 0.9rem;
    color: rgba(220, 209, 184, 0.78);
    font-size: 0.88rem;
  }

  .quiz-toast {
    position: fixed;
    left: 50%;
    bottom: calc(5.6rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-radius: 999px;
    padding: 0.55rem 0.9rem;
    border: 1px solid rgba(214, 190, 141, 0.22);
    background: rgba(16, 18, 19, 0.96);
    color: rgba(244, 239, 229, 0.95);
    z-index: 40;
  }

  .quiz-toast--error {
    border-color: rgba(255, 178, 188, 0.3);
  }

  .celebrate-burst {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 25% 35%, rgba(214, 190, 141, 0.26), transparent 12%),
      radial-gradient(circle at 70% 28%, rgba(128, 175, 148, 0.22), transparent 12%),
      radial-gradient(circle at 58% 70%, rgba(214, 190, 141, 0.18), transparent 14%);
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

  @media (max-width: 699px) {
    .bond-wrap {
      width: min(42rem, calc(100vw - 1rem));
      padding-top: 0.85rem;
      gap: 0.75rem;
    }

    .bond-hero__stats,
    .result-grid,
    .summary-grid {
      grid-template-columns: 1fr;
    }

    .panel-actions,
    .panel-actions__right,
    .panel-actions--result {
      display: grid;
      gap: 0.6rem;
      justify-items: stretch;
    }

    .panel-actions__right {
      width: 100%;
    }

    .inline-error {
      text-align: left;
    }

    .nav-button {
      width: 100%;
    }
  }

  @media (min-width: 900px) {
    .bond-wrap {
      width: min(56rem, calc(100vw - 2rem));
    }

    .bond-hero {
      grid-template-columns: minmax(0, 1.1fr) minmax(16rem, 0.9fr);
      align-items: stretch;
    }
  }
</style>
