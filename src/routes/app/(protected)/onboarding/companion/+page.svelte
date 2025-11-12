<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import WorldBackground from '$lib/ui/WorldBackground.svelte';
  import { logEvent } from '$lib/analytics';
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
    { id: 'q2', prompt: 'You’d rather explore than follow a checklist.', axis: 'JP', facet: 'curiosity' },
    { id: 'q3', prompt: 'You decide with heart as much as head.', axis: 'TF', facet: 'empathy' },
    { id: 'q4', prompt: 'You prefer clarity and routine to surprises.', axis: 'JP', facet: 'structure' },
    { id: 'q5', prompt: 'You seek patterns, not just facts.', axis: 'NS', facet: 'curiosity' },
    { id: 'q6', prompt: 'You like to keep things organized.', axis: 'JP', facet: 'structure' },
    { id: 'q7', prompt: 'People lean on you for support.', facet: 'empathy' },
    { id: 'q8', prompt: 'You get a spark from learning new tricks.', facet: 'curiosity' },
    { id: 'q9', prompt: 'You calm a room without saying much.', axis: 'EI', facet: 'structure' },
    { id: 'q10', prompt: 'You enjoy finishing things as much as starting them.', axis: 'JP' }
  ];

  const totalQuestions = questions.length;
  const hasCompanion = data.hasCompanion ?? false;

  let answers: Record<string, AnswerRecord> = {};
  let consent = data.consentDefault ?? true;
  let currentIndex = 0;
  let errorMsg = '';
  let submitting = false;
  let result: { archetype?: string | null; summary?: any } | null = null;
  let toast: { message: string; kind: 'info' | 'error' } | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let reduced = false;
  let celebrate = false;
  let lastLoggedProgress = 0;
  let currentChoice: Choice | null = null;
  let currentQuestion: Question = questions[0];

  $: currentQuestion = questions[currentIndex] ?? questions[0];
  $: progressLabel = `${currentIndex + 1} / ${totalQuestions}`;
  $: progressPercent = ((currentIndex + 1) / totalQuestions) * 100;
  $: answersComplete = questions.every((q) => Boolean(answers[q.id]));
  $: currentChoice = currentQuestion ? answers[currentQuestion.id]?.choice ?? null : null;

  function showToast(message: string, kind: 'info' | 'error' = 'error') {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toast = { message, kind };
    toastTimer = setTimeout(() => {
      toast = null;
      toastTimer = null;
    }, 4000);
  }

  function persistAnswers() {
    if (!browser) return;
    try {
      const serialized = JSON.stringify(Object.values(answers));
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      /* no-op */
    }
  }

  function persistConsent() {
    if (!browser) return;
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
    } catch {
      /* no-op */
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
      /* ignore */
    }
  }

  function handleAnswer(choice: Choice) {
    if (result) return;
    const question = currentQuestion;
    if (!question) return;
    answers = {
      ...answers,
      [question.id]: { id: question.id, axis: question.axis, facet: question.facet, choice }
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
    if (result) return;
    if (currentIndex === 0) return;
    currentIndex -= 1;
    errorMsg = '';
  }

  function goNext() {
    if (result) return;
    if (!currentChoice) {
      errorMsg = 'Please answer before continuing.';
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
        throw new Error(response?.error ?? 'Unable to score quiz');
      }
      result = { archetype: response?.archetype, summary: response?.summary };
      logEvent('persona_quiz_complete', { archetype: response?.archetype ?? null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save traits';
      showToast(message);
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
        throw new Error(response?.error ?? 'Failed to spawn companion');
      }
      celebrate = true;
      logEvent('companion_spawn', { archetype: response?.archetype ?? null, source: 'bond_genesis' });
      setTimeout(() => {
        window.location.href = '/app/home';
      }, 1200);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to spawn companion';
      showToast(message);
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
    } else if (event.key === 'Enter') {
      if (currentChoice) {
        goNext();
        event.preventDefault();
      }
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
      if (toastTimer) {
        clearTimeout(toastTimer);
      }
    };
  });
</script>

<div class="relative">
  <WorldBackground intensity="medium" {reduced} />
  <div class="relative mx-auto max-w-3xl px-4 py-12 text-white">
    {#if data.retake}
      <div class="retake-banner" role="status">
        Retaking updates your persona without removing your companion.
      </div>
    {/if}

    <section class="quiz-panel rounded-[32px] border border-white/10 bg-white/5/90 p-6 backdrop-blur">
      <div class="quiz-header">
        <div>
          <p class="text-xs uppercase tracking-[0.2em] text-white/60">Phase 13.1</p>
          <h1 class="text-3xl font-semibold text-white">Find your first bond</h1>
        </div>
        <div class="text-right text-sm text-white/70" data-testid="quiz-progress">
          Question {progressLabel}
        </div>
      </div>

      <div class="quiz-progress" aria-label={`Progress ${progressLabel}`}>
        <div class="quiz-progress__track">
          <span class="quiz-progress__bar" style={`width:${progressPercent}%`}></span>
        </div>
      </div>

      <div class="mt-6 space-y-6" aria-live="polite">
        {#if !result}
          {#if currentQuestion}
          {#key currentQuestion.id}
          <div class="space-y-6">
            <div class="question-card rounded-2xl bg-white/5 p-5 ring-1 ring-white/10" aria-live="polite">
              <p id={`q-${currentQuestion.id}`} class="text-lg text-white">
                {currentQuestion.prompt}
              </p>
              <fieldset
                role="radiogroup"
                aria-labelledby={`q-${currentQuestion.id}`}
                class="choice-group mt-4 flex flex-wrap gap-3"
              >
                <label
                  class="choice-button"
                  data-choice="agree"
                  data-active={currentChoice === 'A'}
                  data-testid="quiz-choice-agree"
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="A"
                    checked={currentChoice === 'A'}
                    on:change={() => handleAnswer('A')}
                  />
                  <span>Agree</span>
                </label>
                <label
                  class="choice-button"
                  data-choice="disagree"
                  data-active={currentChoice === 'B'}
                  data-testid="quiz-choice-disagree"
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion.id}`}
                    value="B"
                    checked={currentChoice === 'B'}
                    on:change={() => handleAnswer('B')}
                  />
                  <span>Disagree</span>
                </label>
              </fieldset>
            </div>

            <div class="consent-row">
              <label class="flex items-center gap-3 text-sm text-white/80">
                <input
                  type="checkbox"
                  checked={consent}
                  on:change={(event) =>
                    handleConsentChange(
                      (event.currentTarget as HTMLInputElement | null)?.checked ?? true
                    )
                  }
                  data-testid="quiz-consent-toggle"
                />
                <span>Use my traits to personalize my companion and world.</span>
              </label>
              <p class="text-xs text-white/60">
                We store a safe summary—no raw answers are shared with AI.
              </p>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3">
              <button
                class="nav-button"
                type="button"
                on:click={goPrev}
                disabled={currentIndex === 0}
                data-testid="quiz-back"
              >
                ← Back
              </button>
              <div class="flex flex-col items-end gap-2">
                {#if errorMsg}
                  <p class="text-sm text-rose-300" aria-live="assertive">{errorMsg}</p>
                {/if}
                <button
                  class="nav-button primary"
                  type="button"
                  on:click={goNext}
                  data-testid="quiz-next"
                  disabled={submitting}
                  aria-busy={submitting}
                >
                  {currentIndex === totalQuestions - 1 ? (submitting ? 'Scoring…' : 'See your match') : 'Next →'}
                </button>
              </div>
            </div>
          </div>
          {/key}
          {/if}
        {:else}
          <div class="rounded-3xl bg-white/5 p-6 ring-1 ring-white/10" in:fly={{ y: 16 }}>
            <p class="text-sm text-white/70">Your Archetype</p>
            <h2 class="mt-1 text-3xl font-bold capitalize">{result.archetype}</h2>
            <p class="mt-2 text-white/80">
              This companion will tune to your vibe. Ready to begin your bond?
            </p>
            {#if hasCompanion}
              <p class="mt-4 text-sm text-white/70">
                You already have a companion—retaking updates personalization only.
              </p>
            {/if}
            <div class="mt-5 flex flex-wrap gap-3">
              <button
                class="nav-button primary"
                type="button"
                on:click={spawn}
                disabled={hasCompanion}
                data-testid="quiz-spawn"
              >
                Begin your bond
              </button>
              <a class="nav-button" href="/app/home">Skip for now</a>
            </div>
          </div>
        {/if}
      </div>
    </section>

    {#if toast}
      <div class="quiz-toast" role="status" aria-live="assertive">
        {toast.message}
      </div>
    {/if}
  </div>

  {#if celebrate}
    <div class="celebrate-burst motion-safe:animate-none" aria-hidden="true"></div>
  {/if}
</div>
